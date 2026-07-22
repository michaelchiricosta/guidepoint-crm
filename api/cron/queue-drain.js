export const maxDuration = 120;

// api/cron/queue-drain.js
// Vercel Cron: runs every 2-3 minutes.
// Job: pull ONE pending row off call_queue, fetch its real transcript from Wave,
// match it to an account/contact, run the two-pass Claude analysis, write call_analysis.
// One row per invocation on purpose, keeps each function call short and every
// failure isolated to a single call instead of a whole batch.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WAVE_API_BASE = 'https://api.wave.co/v1'; // confirmed against Wave's real OpenAPI spec
const WAVE_API_KEY = process.env.WAVE_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANALYSIS_MODEL = 'claude-sonnet-4-6';

// Your own name as it appears in Wave speaker labels, so it gets excluded
// from account/contact matching. Set MAGGIE_USER_NAME in Vercel env vars.
const USER_NAME = process.env.MAGGIE_USER_NAME || 'Mike Chiricosta';

const MAX_ATTEMPTS = 3;

export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 1. Claim one pending row. The status='pending' condition in the update
  // is the lock, if two invocations race, only one will actually flip the row.
  const { data: claimed, error: claimErr } = await supabase
    .from('call_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (claimErr) {
    return res.status(500).json({ ok: false, stage: 'claim_select', error: claimErr.message });
  }

  if (!claimed) {
    return res.status(200).json({ ok: true, drained: false, reason: 'queue_empty' });
  }

  const { data: lockResult, error: lockErr } = await supabase
    .from('call_queue')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', claimed.id)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (lockErr) {
    return res.status(500).json({ ok: false, stage: 'claim_lock', error: lockErr.message });
  }

  if (!lockResult) {
    // Another invocation grabbed it first between our select and update. Not an error.
    return res.status(200).json({ ok: true, drained: false, reason: 'lost_race' });
  }

  const row = lockResult;

  try {
    // 2. Fetch transcript + session detail from Wave
    const [transcriptRes, sessionRes] = await Promise.all([
      waveFetch(`/sessions/${row.wave_session_id}/transcript`),
      waveFetch(`/sessions/${row.wave_session_id}`)
    ]);

    const transcriptText = transcriptRes.transcript;
    const segments = transcriptRes.segments || [];
    const waveSummary = sessionRes.summary || null;

    if (!transcriptText) {
      throw new Error('Wave returned no transcript text for this session');
    }

    // 3. Match to account/contact via fuzzy first-name matching against segment speakers
    const speakerNames = [...new Set(segments.map(s => s.speaker))].filter(
      name => normalizeFirstName(name) !== normalizeFirstName(USER_NAME)
    );

    const match = await matchContacts(speakerNames);

    // 4. Pull rolling contact_context for the matched contact(s), if any, so the
    // model has prior history instead of treating this call as a blank slate.
    const contactContext = match.contactIds.length
      ? await getContactContext(match.contactIds)
      : [];

    // 5. Pull active ea_preferences so distillation respects things like
    // "don't draft emails to VP-level contacts, just flag them for me to write."
    const { data: preferences } = await supabase
      .from('ea_preferences')
      .select('*')
      .eq('active', true);

    // 6. Pass one: exhaustive extraction
    const rawExtraction = await runExtraction({
      transcriptText,
      sessionTitle: row.session_title,
      sessionDate: row.session_date,
      waveSummary
    });

    // 7. Pass two: distillation (action items, draft emails, flags, priority)
    const distilled = await runDistillation({
      rawExtraction,
      contactContext,
      preferences: preferences || [],
      matchedAccountName: match.accountName
    });

    // 8. Write call_analysis
    const { error: insertErr } = await supabase.from('call_analysis').insert({
      wave_session_id: row.wave_session_id,
      account_id: match.accountId,
      contact_ids: match.contactIds,
      matched_confidence: match.confidence,
      raw_extraction: rawExtraction,
      distilled: distilled
    });

    if (insertErr) throw insertErr;

    // 9. Update open_items: increment times_flagged for anything distillation
    // recognizes as a repeat of an existing open item (normalized exact-text
    // match for now, upgrade to embedding similarity later if repeats are
    // getting missed due to rephrasing across calls).
    await reconcileOpenItems({
      accountId: match.accountId,
      contactIds: match.contactIds,
      newItems: distilled.open_items || []
    });

    // 10. Mark the queue row analyzed
    await supabase
      .from('call_queue')
      .update({ status: 'analyzed', updated_at: new Date().toISOString() })
      .eq('id', row.id);

    return res.status(200).json({
      ok: true,
      drained: true,
      call_queue_id: row.id,
      wave_session_id: row.wave_session_id,
      matched_account: match.accountName,
      matched_confidence: match.confidence
    });
  } catch (err) {
    const attempts = (row.attempts || 0) + 1;
    const nextStatus = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';

    await supabase
      .from('call_queue')
      .update({
        status: nextStatus,
        attempts,
        last_error: String(err.message || err),
        updated_at: new Date().toISOString()
      })
      .eq('id', row.id);

    return res.status(500).json({
      ok: false,
      call_queue_id: row.id,
      attempts,
      next_status: nextStatus,
      error: String(err.message || err)
    });
  }
}

// ---------------------------------------------------------
// Wave API helper
// ---------------------------------------------------------
async function waveFetch(path) {
  const resp = await fetch(`${WAVE_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${WAVE_API_KEY}` }
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Wave API ${path} failed: ${resp.status} ${body}`);
  }
  return resp.json();
}

// ---------------------------------------------------------
// Fuzzy first-name contact matching
// contacts.account_id references accounts_normalized(id), so the PostgREST
// join uses accounts_normalized as the relation name.
// ---------------------------------------------------------
function normalizeFirstName(fullName) {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0].toLowerCase();
}

async function matchContacts(speakerNames) {
  if (!speakerNames.length) {
    return { accountId: null, accountName: null, contactIds: [], confidence: 'none' };
  }

  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, name, account_id, accounts_normalized(name)');

  if (error) throw error;

  const wanted = speakerNames.map(normalizeFirstName);
  const hits = (contacts || []).filter(c => wanted.includes(normalizeFirstName(c.name)));

  if (!hits.length) {
    return { accountId: null, accountName: null, contactIds: [], confidence: 'none' };
  }

  // Confidence: high if every matched contact belongs to the same account,
  // low if the first-name matches span more than one account (ambiguous,
  // e.g. two different "Mike"s in two different books).
  const accountIds = [...new Set(hits.map(h => h.account_id))];
  const confidence = accountIds.length === 1 ? 'high' : 'low';

  return {
    accountId: accountIds.length === 1 ? accountIds[0] : null,
    accountName: accountIds.length === 1 ? hits[0].accounts_normalized?.name : null,
    contactIds: hits.map(h => h.id),
    confidence
  };
}

async function getContactContext(contactIds) {
  const { data, error } = await supabase
    .from('contact_context')
    .select('contact_id, rolling_summary, updated_at')
    .in('contact_id', contactIds);

  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------
// Two-pass Claude analysis
// ---------------------------------------------------------
async function callClaude(system, userContent) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: userContent }]
    })
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Claude API call failed: ${resp.status} ${body}`);
  }

  const data = await resp.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');

  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

async function runExtraction({ transcriptText, sessionTitle, sessionDate, waveSummary }) {
  const system = `You are the exhaustive extraction pass of a call analysis pipeline for an enterprise
security sales rep. Read the full transcript and pull out EVERYTHING said, don't summarize
or editorialize, just extract. Respond with ONLY valid JSON, no preamble, no markdown fences,
matching this shape exactly:

{
  "topics_discussed": [string],
  "decisions_made": [string],
  "commitments": [{"who": string, "what": string, "when": string|null}],
  "figures_mentioned": [{"context": string, "value": string}],
  "risks": [string],
  "opportunities": [string],
  "deadlines": [{"what": string, "date": string}],
  "tone_notes": [{"speaker": string, "note": string}],
  "open_questions": [string]
}

Be exhaustive. If something is ambiguous, include it rather than dropping it, pass two
handles prioritization, not this pass.`;

  const userContent = `Session title: ${sessionTitle || 'Untitled'}
Session date: ${sessionDate || 'Unknown'}
Wave AI summary (for context only, verify against the transcript below): ${waveSummary || 'None'}

Full transcript:
${transcriptText}`;

  return callClaude(system, userContent);
}

async function runDistillation({ rawExtraction, contactContext, preferences, matchedAccountName }) {
  const system = `You are the distillation pass of a call analysis pipeline. You take exhaustive
extraction output plus rolling contact history plus the rep's standing preferences, and produce
what actually matters right now. Respond with ONLY valid JSON, no preamble, no markdown fences,
matching this shape exactly:

{
  "one_line_summary": string,
  "priority_score": number,
  "action_items": [{"text": string, "due_hint": string|null, "urgency": "high"|"medium"|"low"}],
  "draft_emails": [{"to_hint": string, "subject": string, "body": string, "gaps": [string]}],
  "flags": [string],
  "open_items": [string]
}

priority_score is 1-10, how urgently this call needs the rep's attention today versus can wait.
draft_emails.gaps lists anything the draft is missing that only the rep can fill in
(an exact number, a decision not yet made, etc), never invent those details.
Respect standing preferences below, e.g. if a preference says never draft emails to
a certain contact, put that in flags instead of draft_emails.`;

  const userContent = `Matched account: ${matchedAccountName || 'Unmatched, flag for manual review'}

Rolling contact context (prior calls, may be empty for a first contact):
${JSON.stringify(contactContext, null, 2)}

Standing preferences:
${JSON.stringify(preferences, null, 2)}

Raw extraction from this call:
${JSON.stringify(rawExtraction, null, 2)}`;

  return callClaude(system, userContent);
}

// ---------------------------------------------------------
// open_items reconciliation
// Simple normalized-text match for now, upgrade to embedding similarity later.
// ---------------------------------------------------------
async function reconcileOpenItems({ accountId, contactIds, newItems }) {
  if (!accountId || !newItems.length) return;

  const { data: existing, error } = await supabase
    .from('open_items')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'open');

  if (error) throw error;

  for (const itemText of newItems) {
    const normalized = itemText.trim().toLowerCase();
    const match = (existing || []).find(e => e.item_text.trim().toLowerCase() === normalized);

    if (match) {
      await supabase
        .from('open_items')
        .update({
          times_flagged: (match.times_flagged || 1) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', match.id);
    } else {
      await supabase.from('open_items').insert({
        account_id: accountId,
        contact_ids: contactIds,
        item_text: itemText,
        times_flagged: 1,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }
}
