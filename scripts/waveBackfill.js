import { createClient } from '@supabase/supabase-js'

const WAVE_BASE = 'https://api.wave.co/v1'
const WAVE_KEY = process.env.WAVE_API_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!WAVE_KEY || !ANTHROPIC_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars. Need: WAVE_API_KEY, ANTHROPIC_API_KEY, VITE_SUPABASE_URL or SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Manual UUID generator -- avoids crypto.randomUUID() compatibility issues
const uid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
})

const sleep = ms => new Promise(r => setTimeout(r, ms))

const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
console.log(`[backfill] Fetching Wave sessions since ${cutoff.toISOString()}`)

async function fetchAllSessions() {
  let allSessions = []
  let cursor = null
  let page = 0

  while (page < 10) {
    const params = new URLSearchParams({ limit: '50' })
    if (cursor) params.set('cursor', cursor)

    const res = await fetch(`${WAVE_BASE}/sessions?${params}`, {
      headers: { Authorization: `Bearer ${WAVE_KEY}` }
    })

    if (!res.ok) {
      console.error(`[backfill] Wave API error: ${res.status}`)
      break
    }

    const data = await res.json()
    const sessions = Array.isArray(data.sessions) ? data.sessions : []

    // Filter to last 3 days client-side -- Wave may ignore since param
    const recent = sessions.filter(s => {
      const ts = s.timestamp || s.created_at || s.date
      return ts && new Date(ts) >= cutoff
    })

    allSessions = allSessions.concat(recent)
    console.log(`[backfill] Page ${page + 1}: ${sessions.length} total, ${recent.length} within 3 days`)

    // Stop if oldest session on this page is before cutoff
    if (sessions.length > 0) {
      const oldest = new Date(sessions[sessions.length - 1].timestamp || 0)
      if (oldest < cutoff) {
        console.log(`[backfill] Reached sessions older than 3 days, stopping pagination`)
        break
      }
    }

    if (!data.has_more || !data.next_cursor) break
    cursor = data.next_cursor
    page++
    await sleep(300)
  }

  return allSessions
}

async function parseWithClaude(session, summary, accountNames, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `You are an intelligent CRM assistant for Mike Chiricosta at GuidePoint Security.

Parse this Wave AI call summary and identify which Ledgr CRM accounts were discussed.

IMPORTANT MATCHING RULES:
- Match account names even if they appear as part of a longer phrase in the title or summary
- "GE Vernova" matches a session titled "Rossi - GE Vernova - internal"
- "BHSI" or "Berkshire Hathaway" matches sessions about BHSI
- "TripleSeat" matches sessions mentioning TripleSeat
- Internal calls (vendor syncs, GuidePoint internal) may reference client accounts -- extract those too
- If a session is purely internal with no client account discussed, return empty array

Return ONLY a valid JSON array, no markdown, no preamble:
[
  {
    "account_name": "must exactly match one name from the account list below, or UNKNOWN",
    "confidence": "high|medium|low",
    "intel_summary": "3-5 sentences of what happened on this call specific to this account. Be specific -- mention names, numbers, decisions, blockers.",
    "action_items": [
      { "task": "specific verb-first action", "due_date": "YYYY-MM-DD or null", "contact": "person name or null" }
    ],
    "urgency_signals": ["any urgent items, deadlines, or blockers mentioned"],
    "sentiment": "positive|neutral|needs_attention"
  }
]

Account list (match exactly): ${accountNames}

Call title: ${session.title}
Call date: ${session.timestamp?.split('T')[0]}
Speakers: ${(session.speakers || []).join(', ')}

Summary:
${summary.slice(0, 10000)}`
          }]
        })
      })

      if (res.status === 429 || res.status === 529) {
        const delay = [15000, 30000, 60000][attempt] || 60000
        console.log(`[backfill] Rate limited, waiting ${delay/1000}s...`)
        await sleep(delay)
        continue
      }

      const data = await res.json()
      const text = data.content?.[0]?.text || ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return []
      return JSON.parse(jsonMatch[0])
    } catch (e) {
      console.error(`[backfill] Claude parse attempt ${attempt + 1} failed:`, e.message)
      await sleep(3000)
    }
  }
  return []
}

async function run() {
  // Fetch all sessions
  const allSessions = await fetchAllSessions()
  console.log(`\n[backfill] Total sessions in last 3 days: ${allSessions.length}`)

  if (allSessions.length === 0) {
    console.log('[backfill] No sessions found. Check WAVE_API_KEY and Wave API connectivity.')
    return
  }

  // Check already-applied sessions
  const { data: applied } = await supabase
    .from('wave_applied_sessions')
    .select('session_id, account_name')
    .in('session_id', allSessions.map(s => s.id))

  const appliedKeys = new Set((applied || []).map(a => `${a.session_id}-${a.account_name}`))
  console.log(`[backfill] Already processed: ${applied?.length || 0} session-account pairs`)

  // Get profile from Supabase
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, data')
    .limit(1)

  if (profileErr || !profiles?.length) {
    console.error('[backfill] Could not load profiles:', profileErr?.message)
    return
  }

  const profile = profiles[0]
  const accounts = profile?.data?.accounts || []
  const accountNames = accounts.map(a => a.name).join(', ')
  console.log(`[backfill] Loaded ${accounts.length} accounts from Ledgr`)

  let totalWritten = 0

  for (const session of allSessions) {
    console.log(`\n[backfill] ── ${session.title} (${session.timestamp?.split('T')[0]})`)

    // Fetch full session details and summary
    let summary = session.summary_preview || ''
    let speakers = session.speakers || []

    try {
      const sessionRes = await fetch(`${WAVE_BASE}/sessions/${session.id}`, {
        headers: { Authorization: `Bearer ${WAVE_KEY}` }
      })
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json()
        summary = sessionData.summary || summary
        speakers = sessionData.speakers || speakers
      }
    } catch (e) {
      console.log(`[backfill] Could not fetch full session, using preview`)
    }

    if (!summary || summary.length < 30) {
      console.log(`[backfill] Skipping -- summary too short or missing`)
      continue
    }

    // Parse with Claude
    session.speakers = speakers
    const matches = await parseWithClaude(session, summary, accountNames)
    console.log(`[backfill] Claude identified: ${matches.map(m => `${m.account_name} (${m.confidence})`).join(', ') || 'no matches'}`)

    for (const match of matches) {
      if (match.account_name === 'UNKNOWN') {
        console.log(`[backfill] Skipping UNKNOWN match`)
        continue
      }

      const appliedKey = `${session.id}-${match.account_name}`
      if (appliedKeys.has(appliedKey)) {
        console.log(`[backfill] Already applied to ${match.account_name}, skipping`)
        continue
      }

      // Find account -- try exact match first, then case-insensitive
      const account = accounts.find(a => a.name === match.account_name) ||
        accounts.find(a => a.name?.toLowerCase() === match.account_name?.toLowerCase())

      if (!account) {
        console.log(`[backfill] No account found for "${match.account_name}"`)
        continue
      }

      const sessionDate = session.timestamp?.split('T')[0] || new Date().toISOString().split('T')[0]

      const newIntelEntry = {
        id: uid(),
        type: 'Call',
        date: sessionDate,
        summary: match.intel_summary || '',
        insights: [],
        risks: match.urgency_signals || [],
        opportunities: [],
        participants: speakers.filter(s => s !== 'Mike Chiricosta').join(', '),
        source: 'Wave AI (backfill)',
        sessionId: session.id,
        sessionTitle: session.title
      }

      const newFollowUps = (match.action_items || [])
        .filter(ai => ai.task?.trim())
        .map(ai => ({
          id: uid(),
          task: ai.task,
          dueDate: ai.due_date || '',
          contact: ai.contact || '',
          priority: match.urgency_signals?.length > 0 ? 'High' : 'Medium',
          status: 'Open',
          source: 'Wave AI (backfill)'
        }))

      // Update profile data in memory
      profile.data.accounts = profile.data.accounts.map(a => {
        if (a.id !== account.id) return a
        return {
          ...a,
          intelLog: [newIntelEntry, ...(a.intelLog || [])],
          followUps: [...(a.followUps || []), ...newFollowUps],
          lastContact: sessionDate
        }
      })

      // Save to Supabase immediately after each account update
      const { error: saveErr } = await supabase
        .from('profiles')
        .update({ data: profile.data })
        .eq('id', profile.id)

      if (saveErr) {
        console.error(`[backfill] Save error for ${account.name}:`, saveErr.message)
        continue
      }

      // Mark as applied
      await supabase
        .from('wave_applied_sessions')
        .upsert({
          session_id: session.id,
          account_id: account.id,
          account_name: account.name,
          applied_at: new Date().toISOString(),
          source: 'backfill'
        }, { onConflict: 'session_id,account_name' })

      appliedKeys.add(appliedKey)
      totalWritten++
      console.log(`[backfill] ✓ Written to ${account.name} (${newFollowUps.length} follow-ups created)`)
    }

    // Delay between sessions to avoid rate limiting
    await sleep(2000)
  }

  console.log(`\n[backfill] ══ Complete. ${totalWritten} account intel entries written across ${allSessions.length} sessions.`)
}

run().catch(err => {
  console.error('[backfill] Fatal error:', err)
  process.exit(1)
})
