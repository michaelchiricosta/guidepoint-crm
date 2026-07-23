import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WAVE_API_BASE = 'https://api.wave.co/v1';
const WAVE_API_KEY = process.env.WAVE_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANALYSIS_MODEL = 'claude-sonnet-4-6';
const USER_NAME = process.env.MAGGIE_USER_NAME || 'Mike Chiricosta';

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

function normalizeFirstName(fullName) {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0].toLowerCase();
}

async function matchContacts(speakerNames) {
  if (!speakerNames.length) {
    return { accountId: null, accountName: null, contactIds: [], confidence: 'unmatched' };
  }

  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, name, account_id, accounts_normalized(name)');

  if (error) throw error;

  const wanted = speakerNames.map(normalizeFirstName);
  const hits = (contacts || []).filter(c => wanted.includes(normalizeFirstName(c.name)));

  if (!hits.length) {
    return { accountId: null, accountName: null, contactIds: [], confidence: 'unmatched' };
  }

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
  const system = `You are Maggie, Mike's executive assistant. You just listened to this call and you're telling him what he needs to know, like a real person would, not a bot summarizing data. Write action_items, flags, and one_line_summary as if you're speaking directly to him: warm but efficient, no corporate fluff, no fragment-style imperatives. Say "You should ping the SOW team today, Bert needs a number before Thursday" not "Ping SOW team immediately." Use "you" and occasionally his name. Keep it tight, he's busy, but it should read like a person wrote it, not a system.

Draft emails are the exception: those go to clients so keep them professional.

Respond with ONLY valid JSON, no preamble, no markdown fences, matching this shape exactly:

{
  "one_line_summary": string,
  "priority_score": number,
  "action_items": [{"text": string, "due_hint": string|null, "urgency": "high"|"medium"|"low"}],
  "draft_emails": [{"to_hint": string, "subject": string, "body": string, "gaps": [string]}],
  "flags": [string],
  "open_items": [string]
}

priority_score is 1-10, how urgently this call needs Mike's attention today versus can wait.
draft_emails.gaps lists anything the draft is missing that only Mike can fill in
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

export async function analyzeCall(waveSessionId) {
  const [transcriptRes, sessionRes] = await Promise.all([
    waveFetch(`/sessions/${waveSessionId}/transcript`),
    waveFetch(`/sessions/${waveSessionId}`)
  ]);

  const transcriptText = transcriptRes.transcript;
  const segments = transcriptRes.segments || [];
  const waveSummary = sessionRes.summary || null;
  const sessionDate = sessionRes.timestamp || null;
  const sessionTitle = sessionRes.title || null;

  if (!transcriptText) {
    throw new Error('Wave returned no transcript text for this session');
  }

  const speakerNames = [...new Set(segments.map(s => s.speaker))].filter(
    name => normalizeFirstName(name) !== normalizeFirstName(USER_NAME)
  );

  const match = await matchContacts(speakerNames);

  const contactContext = match.contactIds.length
    ? await getContactContext(match.contactIds)
    : [];

  const { data: preferences } = await supabase
    .from('ea_preferences')
    .select('*')
    .eq('active', true);

  const rawExtraction = await runExtraction({ transcriptText, sessionTitle, sessionDate, waveSummary });

  const distilled = await runDistillation({
    rawExtraction,
    contactContext,
    preferences: preferences || [],
    matchedAccountName: match.accountName
  });

  const { error: insertErr } = await supabase.from('call_analysis').insert({
    wave_session_id: waveSessionId,
    session_date: sessionDate,
    account_id: match.accountId,
    contact_ids: match.contactIds,
    matched_confidence: match.confidence,
    raw_extraction: rawExtraction,
    distilled: distilled
  });

  if (insertErr) throw insertErr;

  await reconcileOpenItems({
    accountId: match.accountId,
    contactIds: match.contactIds,
    newItems: distilled.open_items || []
  });

  return {
    wave_session_id: waveSessionId,
    session_date: sessionDate,
    matched_account: match.accountName,
    matched_confidence: match.confidence,
    account_id: match.accountId,
    contact_ids: match.contactIds,
    raw_extraction: rawExtraction,
    distilled: distilled
  };
}
