// api/wave-cron.js
// Vercel Cron: runs every 30 minutes (*/30 * * * *).
// Fetches Wave sessions from the last 2 hours, parses summaries with Claude,
// and writes intel entries + follow-ups directly into the `accounts` blob —
// the same data path as the manual IntelInbox "Apply" flow.
//
// Required env vars (Vercel → Project → Settings → Environment Variables):
//   WAVE_API_KEY              — Wave API key
//   ANTHROPIC_API_KEY         — Anthropic API key
//   SUPABASE_URL              — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)
//   CRON_SECRET               — shared secret with vercel.json cron auth header

import { createClient } from '@supabase/supabase-js'

const WAVE_BASE     = 'https://api.wave.co/v1'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL  = 'claude-sonnet-4-6'
const WINDOW_MS     = 2 * 60 * 60 * 1000  // 2 hours

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Manual UUID — avoids crypto.randomUUID() Node version issues
const uid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
})

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waveFetch(path, waveKey) {
  const res = await fetch(`${WAVE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${waveKey}` }
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Wave ${path} → ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

// Cursor-based pagination — Wave ignores `since`; filter by date client-side
async function fetchRecentSessions(waveKey, cutoff) {
  let all = []
  let cursor = null
  let page = 0

  while (page < 5) {
    const params = new URLSearchParams({ limit: '50' })
    if (cursor) params.set('cursor', cursor)

    const data = await waveFetch(`/sessions?${params}`, waveKey)
    const sessions = Array.isArray(data.sessions) ? data.sessions
      : Array.isArray(data.recordings) ? data.recordings
      : Array.isArray(data.data) ? data.data : []

    const recent = sessions.filter(s => {
      const ts = s.timestamp || s.created_at || s.started_at
      return ts && new Date(ts) >= cutoff
    })
    all = all.concat(recent)

    // Stop paging once oldest session on this page is older than the cutoff
    if (sessions.length > 0) {
      const oldest = new Date(sessions[sessions.length - 1].timestamp || 0)
      if (oldest < cutoff) break
    }
    if (!data.has_more || !data.next_cursor) break
    cursor = data.next_cursor
    page++
    await sleep(200)
  }

  return all
}

// Read the accounts blob fresh from Supabase
async function loadAccounts() {
  const { data: row, error } = await supabase
    .from('accounts')
    .select('data, version')
    .eq('id', 'user-data')
    .single()
  if (error) throw new Error(`load accounts: ${error.message}`)
  return row  // { data: { accounts: [...], ... }, version: N }
}

// Write the updated accounts blob back, incrementing version
async function saveAccounts(row, updatedAccounts) {
  const newData = { ...row.data, accounts: updatedAccounts }
  const currentVersion = row.version ?? null

  if (currentVersion !== null) {
    const { data: updated, error } = await supabase
      .from('accounts')
      .update({ data: newData, version: currentVersion + 1, updated_at: new Date().toISOString() })
      .eq('id', 'user-data')
      .eq('version', currentVersion)
      .select('version')
    if (error) throw new Error(`save accounts: ${error.message}`)
    if (!updated?.length) throw new Error('save accounts: version conflict')
  } else {
    const { error } = await supabase
      .from('accounts')
      .update({ data: newData, updated_at: new Date().toISOString() })
      .eq('id', 'user-data')
    if (error) throw new Error(`save accounts: ${error.message}`)
  }
}

// Match an account name from Claude's response to actual accounts.
// Also accepts partial matches against session title/summary for fuzzy coverage.
function findAccount(accounts, matchName, sessionTitle, summary) {
  if (!matchName || matchName === 'UNKNOWN') return null

  // Exact case-insensitive match first
  const lower = matchName.toLowerCase()
  let acct = accounts.find(a => a.name?.toLowerCase() === lower)
  if (acct) return acct

  // Account name appears anywhere in the session title or summary
  acct = accounts.find(a => {
    const n = (a.name || '').toLowerCase()
    return n.length > 3 && (
      (sessionTitle || '').toLowerCase().includes(n) ||
      (summary || '').toLowerCase().includes(n)
    )
  })
  return acct || null
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const waveKey      = process.env.WAVE_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!waveKey || !anthropicKey) {
    return res.status(500).json({ error: 'Missing WAVE_API_KEY or ANTHROPIC_API_KEY' })
  }

  // ── 1. Fetch recent Wave sessions (cursor pagination, client-side date filter) ─
  const cutoff = new Date(Date.now() - WINDOW_MS)
  let recentSessions
  try {
    recentSessions = await fetchRecentSessions(waveKey, cutoff)
  } catch (err) {
    console.error('[wave-cron] sessions fetch error:', err.message)
    return res.status(502).json({ error: err.message })
  }

  if (recentSessions.length === 0) {
    return res.status(200).json({ ok: true, processed: 0, message: 'No sessions in last 2 hours' })
  }

  // ── 2. Exclude already-processed sessions ─────────────────────────────────────
  const sessionIds = recentSessions.map(s => s.id)
  const { data: applied } = await supabase
    .from('wave_applied_sessions')
    .select('session_id')
    .in('session_id', sessionIds)

  const appliedIds = new Set((applied || []).map(r => r.session_id))
  const newSessions = recentSessions.filter(s => !appliedIds.has(s.id))

  if (newSessions.length === 0) {
    return res.status(200).json({ ok: true, processed: 0, message: 'All sessions already processed' })
  }

  // ── 3. Load accounts once; build account-name index for Claude prompt ──────────
  let row
  try {
    row = await loadAccounts()
  } catch (err) {
    console.error('[wave-cron] load error:', err.message)
    return res.status(500).json({ error: err.message })
  }

  const accountNames = (row.data.accounts || []).map(a => a.name).filter(Boolean).join(', ')
  let processedCount = 0

  // ── 4. Process each new session individually; write + re-read between them ─────
  for (const session of newSessions) {
    const sessionId   = session.id
    const sessionTitle = session.title || 'Untitled'
    const sessionDate  = (session.timestamp || session.created_at || '').split('T')[0]
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
        sessionData.summary       ||
        sessionData.ai_summary    ||
        sessionData.summary_text  ||
        sessionData.summary_preview ||
        session.summary_preview   ||
        ''
      ).trim()

      if (summary.length < 30) {
        console.log(`[wave-cron] ${sessionId} — no usable summary, skipping`)
        await supabase.from('wave_applied_sessions').upsert(
          { session_id: sessionId, account_names: [], source: 'cron-no-summary' },
          { onConflict: 'session_id', ignoreDuplicates: true }
        )
        continue
      }

      // Claude: identify accounts and extract intel
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

Parse this Wave AI call summary. Identify which Ledgr accounts were discussed.

MATCHING RULES:
- Match account names even if embedded in a longer phrase ("Rossi - GE Vernova - internal" → GE Vernova)
- Internal GuidePoint calls may reference client accounts — extract those too
- Return empty array [] if no client accounts were discussed

Return ONLY a valid JSON array, no markdown:
[
  {
    "account_name": "must exactly match one name from the account list, or UNKNOWN",
    "confidence": "high|medium|low",
    "intel_summary": "3-5 specific sentences covering what was discussed, decisions made, and next steps",
    "action_items": [
      { "task": "verb-first action item", "due_date": "YYYY-MM-DD or null", "contact": "person name or null" }
    ],
    "urgency_signals": ["any urgent items or deadlines mentioned"]
  }
]

Account list: ${accountNames}

Call title: ${sessionTitle}
Call date: ${sessionDate}
Speakers: ${(sessionData.speakers || session.speakers || []).join(', ')}

Summary:
${summary.slice(0, 8000)}`
          }]
        })
      })

      if (claudeRes.status === 429 || claudeRes.status === 529) {
        console.warn(`[wave-cron] Claude rate-limited for ${sessionId}, skipping this run`)
        await sleep(5000)
        continue
      }

      if (!claudeRes.ok) {
        console.error(`[wave-cron] Claude error for ${sessionId}: ${claudeRes.status}`)
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

      // Re-read fresh data before writing for this session (safe version increment)
      let freshRow
      try {
        freshRow = await loadAccounts()
      } catch (err) {
        console.error('[wave-cron] re-read failed:', err.message)
        continue
      }

      let updatedAccounts = freshRow.data.accounts.slice()
      let sessionWroteAnything = false

      for (const match of (matches || [])) {
        if (match.confidence === 'low') continue

        const acct = findAccount(
          updatedAccounts,
          match.account_name,
          sessionTitle,
          summary
        )
        if (!acct) {
          console.log(`[wave-cron] No account matched "${match.account_name}"`)
          continue
        }

        const speakers = (sessionData.speakers || session.speakers || [])
          .filter(s => {
            const n = s.toLowerCase()
            return !n.includes('mike') && !n.includes('chiricosta')
          })
          .join(', ')

        const newIntelEntry = {
          id:           uid(),
          type:         'Call',
          date:         sessionDate,
          summary:      match.intel_summary || '',
          insights:     [],
          risks:        match.urgency_signals || [],
          opportunities: [],
          participants:  speakers,
          source:       'Wave AI (auto)',
          sessionId:    sessionId,
          sessionTitle:  sessionTitle
        }

        const newFollowUps = (match.action_items || [])
          .filter(ai => ai.task?.trim())
          .map(ai => ({
            id:       uid(),
            task:     ai.task,
            dueDate:  ai.due_date || '',
            contact:  ai.contact || '',
            priority: (match.urgency_signals || []).length > 0 ? 'High' : 'Medium',
            status:   'Open',
            source:   'Wave AI (auto)'
          }))

        updatedAccounts = updatedAccounts.map(a =>
          a.id !== acct.id ? a : {
            ...a,
            intelLog:    [newIntelEntry, ...(a.intelLog   || [])],
            followUps:   [...(a.followUps || []), ...newFollowUps],
            lastContact: sessionDate
          }
        )

        matchedNames.push(acct.name)
        processedCount++
        sessionWroteAnything = true
        console.log(`[wave-cron] ${sessionTitle} → matched ${acct.name} (${newFollowUps.length} follow-up(s))`)
      }

      // Persist if anything changed
      if (sessionWroteAnything) {
        try {
          await saveAccounts(freshRow, updatedAccounts)
        } catch (err) {
          console.error(`[wave-cron] save failed for session ${sessionId}:`, err.message)
          // Don't record as applied so it retries next run
          continue
        }
      }
    } catch (err) {
      console.error(`[wave-cron] Error processing session ${sessionId}:`, err.message)
    }

    // Record session as processed (even if no match) so it isn't retried
    await supabase.from('wave_applied_sessions').upsert(
      { session_id: sessionId, account_names: matchedNames, source: 'cron' },
      { onConflict: 'session_id', ignoreDuplicates: true }
    )

    // Pace Claude calls to avoid rate limiting
    await sleep(2000)
  }

  console.log(`[wave-cron] done — ${newSessions.length} session(s) checked, intel written to ${processedCount} account match(es)`)
  return res.status(200).json({
    ok: true,
    processed:        processedCount,
    sessions_checked: newSessions.length
  })
}
