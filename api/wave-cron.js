// api/wave-cron.js
// Vercel Cron: runs every 30 minutes (*/30 * * * *).
// Fetches Wave sessions from the last 2 hours, parses summaries with Claude,
// and writes intel entries + follow-ups directly to the profiles blob — the same
// data path as the manual IntelInbox "Apply" flow. Results appear in account
// pages immediately without any manual action.
//
// Distinct from the wave-detect + queue-drain pipeline, which writes to
// call_analysis / open_items normalized tables (shown in MaggiePage).
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables):
//   WAVE_API_KEY            — Wave API key (same one used by api/wave.js)
//   ANTHROPIC_API_KEY       — Anthropic API key
//   SUPABASE_URL            — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (not the anon key)
//   CRON_SECRET             — random string shared with vercel.json cron auth header

import { createClient } from '@supabase/supabase-js'

const WAVE_BASE     = 'https://api.wave.co/v1'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL  = 'claude-sonnet-4-6'
const WINDOW_MS     = 2 * 60 * 60 * 1000  // 2 hours

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function waveFetch(path, waveKey) {
  const res = await fetch(`${WAVE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${waveKey}` }
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Wave API ${path} → ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const waveKey     = process.env.WAVE_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!waveKey || !anthropicKey) {
    return res.status(500).json({ error: 'Missing WAVE_API_KEY or ANTHROPIC_API_KEY' })
  }

  // ── 1. Fetch sessions from last 2 hours ──────────────────────────────────────
  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  let sessions = []
  try {
    const data = await waveFetch(`/sessions?since=${encodeURIComponent(since)}&limit=20`, waveKey)
    sessions = data.sessions || data.recordings || data.data || []
  } catch (err) {
    console.error('[wave-cron] sessions list error:', err.message)
    return res.status(502).json({ error: err.message })
  }

  // Client-side filter in case `since` is ignored by Wave
  const cutoff = new Date(since)
  const recent = sessions.filter(s => {
    const ts = s.timestamp || s.created_at || s.started_at
    return ts && new Date(ts) >= cutoff
  })

  if (recent.length === 0) {
    return res.status(200).json({ ok: true, processed: 0, message: 'No sessions in last 2 hours' })
  }

  // ── 2. Exclude already-processed sessions ────────────────────────────────────
  const sessionIds = recent.map(s => s.id)
  const { data: applied } = await supabase
    .from('wave_applied_sessions')
    .select('session_id')
    .in('session_id', sessionIds)

  const appliedIds = new Set((applied || []).map(r => r.session_id))
  const newSessions = recent.filter(s => !appliedIds.has(s.id))

  if (newSessions.length === 0) {
    return res.status(200).json({ ok: true, processed: 0, message: 'All sessions already processed' })
  }

  // ── 3. Load profile once ─────────────────────────────────────────────────────
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, data')
    .limit(1)
    .single()

  if (profileErr || !profile?.data?.accounts) {
    console.error('[wave-cron] profiles load failed:', profileErr?.message)
    return res.status(500).json({ error: 'Could not load profiles' })
  }

  const accountNames = profile.data.accounts.map(a => a.name).filter(Boolean).join(', ')

  // Mutable working copy — all sessions write into this array, then we save once
  let accounts = profile.data.accounts.slice()

  let processedCount = 0
  const sessionRecords = []

  // ── 4. Process each new session ──────────────────────────────────────────────
  for (const session of newSessions) {
    const sessionId = session.id
    const sessionDate = (session.timestamp || session.created_at || '').split('T')[0]
      || new Date().toISOString().split('T')[0]

    let matchedNames = []

    try {
      // Fetch full session to get AI summary
      let sessionData = {}
      try {
        sessionData = await waveFetch(`/sessions/${encodeURIComponent(sessionId)}`, waveKey)
      } catch (err) {
        console.warn(`[wave-cron] Could not fetch session ${sessionId}:`, err.message)
      }

      const summary = (
        sessionData.summary ||
        sessionData.ai_summary ||
        sessionData.summary_text ||
        sessionData.summary_preview ||
        session.summary_preview ||
        ''
      ).trim()

      if (summary.length < 30) {
        console.log(`[wave-cron] Session ${sessionId} has no usable summary, skipping`)
        sessionRecords.push({ session_id: sessionId, account_names: [], source: 'cron-no-summary' })
        continue
      }

      // ── Claude: match accounts and extract intel ───────────────────────────
      const claudeRes = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `You are a CRM assistant for Mike Chiricosta at GuidePoint Security.

Parse this Wave AI call summary. Return ONLY a valid JSON array, no markdown fences:
[
  {
    "account_name": "exact match from the account list, or UNKNOWN if none match",
    "confidence": "high|medium|low",
    "intel_summary": "2-3 sentence summary of what was discussed for this account",
    "action_items": [
      { "task": "specific action item", "due_date": "YYYY-MM-DD or null", "contact": "person name or null" }
    ],
    "urgency_signals": ["any urgent or time-sensitive items mentioned"]
  }
]

If multiple accounts were discussed, return one object per account.
Skip any account with confidence=low.

Account list: ${accountNames}

Call title: ${session.title || 'Untitled'}
Call date: ${sessionDate}
Summary: ${summary.slice(0, 4000)}`
          }]
        })
      })

      if (!claudeRes.ok) {
        console.error(`[wave-cron] Claude error for ${sessionId}: ${claudeRes.status}`)
        sessionRecords.push({ session_id: sessionId, account_names: [], source: 'cron-claude-error' })
        continue
      }

      const claudeData = await claudeRes.json()
      const text = claudeData.content?.[0]?.text || ''

      let matches = []
      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (jsonMatch) matches = JSON.parse(jsonMatch[0])
      } catch (e) {
        console.warn(`[wave-cron] JSON parse failed for ${sessionId}:`, e.message)
      }

      // ── Apply each match to the accounts working copy ─────────────────────
      for (const match of (matches || [])) {
        if (!match.account_name || match.account_name === 'UNKNOWN') continue
        if (match.confidence === 'low') continue

        const acctIdx = accounts.findIndex(
          a => a.name?.toLowerCase() === match.account_name.toLowerCase()
        )
        if (acctIdx === -1) continue

        const speakers = (sessionData.speakers || [])
          .filter(s => {
            const n = s.toLowerCase()
            return !n.includes('mike') && !n.includes('chiricosta')
          })
          .join(', ')

        const newIntelEntry = {
          id:           crypto.randomUUID(),
          type:         'Call',
          date:         sessionDate,
          summary:      match.intel_summary || '',
          insights:     [],
          risks:        match.urgency_signals || [],
          opportunities: [],
          participants:  speakers,
          source:       'Wave AI (auto)',
          sessionId:    sessionId,
          sessionTitle:  session.title || ''
        }

        const newFollowUps = (match.action_items || []).map(ai => ({
          id:       crypto.randomUUID(),
          task:     ai.task || '',
          dueDate:  ai.due_date || '',
          contact:  ai.contact || '',
          priority: (match.urgency_signals || []).length > 0 ? 'High' : 'Medium',
          status:   'Open',
          source:   'Wave AI (auto)'
        }))

        accounts = accounts.map((a, i) =>
          i !== acctIdx ? a : {
            ...a,
            intelLog:    [newIntelEntry, ...(a.intelLog   || [])],
            followUps:   [...(a.followUps || []), ...newFollowUps],
            lastContact: sessionDate
          }
        )

        matchedNames.push(match.account_name)
        processedCount++
      }
    } catch (err) {
      console.error(`[wave-cron] Error processing session ${sessionId}:`, err.message)
    }

    sessionRecords.push({
      session_id:    sessionId,
      account_names: matchedNames,
      source:        'cron'
    })
  }

  // ── 5. Save profiles (one write for all sessions) ────────────────────────────
  if (processedCount > 0) {
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ data: { ...profile.data, accounts } })
      .eq('id', profile.id)

    if (updateErr) {
      console.error('[wave-cron] profiles update failed:', updateErr.message)
      return res.status(500).json({ ok: false, error: updateErr.message })
    }
  }

  // ── 6. Record processed sessions ─────────────────────────────────────────────
  if (sessionRecords.length > 0) {
    await supabase
      .from('wave_applied_sessions')
      .upsert(sessionRecords, { onConflict: 'session_id', ignoreDuplicates: true })
  }

  console.log(`[wave-cron] done — checked ${newSessions.length} sessions, wrote intel to ${processedCount} account(s)`)
  return res.status(200).json({
    ok: true,
    processed:        processedCount,
    sessions_checked:  newSessions.length
  })
}
