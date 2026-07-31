// api/wave-review.js
//
// Two actions, both POST:
//
//   action: 'analyze'  — fetch a Wave session's AI summary, run Claude to
//                        identify the best account match + extract intel.
//
//   action: 'apply'    — write the intel to the selected account in the
//                        Supabase accounts blob and record in wave_applied_sessions.
//
// Required Vercel env vars (same as wave-cron.js):
//   WAVE_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'

const WAVE_BASE     = 'https://api.wave.co/v1'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL  = 'claude-sonnet-4-6'

const ALLOWED_ORIGINS = new Set([
  'https://myledgr.io',
  'https://www.myledgr.io',
  'http://localhost:5173',
  'http://localhost:4173',
])

const uid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
})

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function loadAccounts(sb) {
  const { data: row, error } = await sb
    .from('accounts')
    .select('data, version')
    .eq('id', 'user-data')
    .single()
  if (error) throw new Error(`load accounts: ${error.message}`)
  return row
}

async function saveAccounts(sb, row, updatedAccounts) {
  const newData = { ...row.data, accounts: updatedAccounts }
  const { data: updated, error } = await sb
    .from('accounts')
    .update({ data: newData, version: (row.version ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq('id', 'user-data')
    .eq('version', row.version ?? 0)
    .select('version')
  if (error) throw new Error(`save accounts: ${error.message}`)
  if (!updated?.length) throw new Error('save accounts: version conflict — reload and try again')
}

// ── analyze action ────────────────────────────────────────────────────────────

async function handleAnalyze(body) {
  const { session_id, session_title, session_date, account_names } = body
  if (!session_id) return { status: 400, body: { error: 'session_id required' } }

  const waveKey      = process.env.WAVE_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  // 1. Fetch session from Wave to get AI summary
  let summary = body.summary || ''
  if (!summary) {
    try {
      const waveRes = await fetch(`${WAVE_BASE}/sessions/${encodeURIComponent(session_id)}`, {
        headers: { Authorization: `Bearer ${waveKey}` }
      })
      if (waveRes.ok) {
        const sd = await waveRes.json()
        summary = (
          sd.summary || sd.ai_summary || sd.summary_text || sd.summary_preview || ''
        ).trim()
      }
    } catch {}
  }

  if (!summary || summary.length < 30) {
    return {
      status: 200,
      body: {
        ok: true,
        recommendation: null,
        confidence: 'unmatched',
        intel_summary: '',
        action_items: [],
        note: 'No usable AI summary available for this session yet.'
      }
    }
  }

  // 2. Run Claude to identify account + extract intel
  const claudeRes = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are a CRM assistant for Mike Chiricosta at GuidePoint Security.

Parse this Wave AI call summary and identify which Ledgr account it belongs to.

Return ONLY valid JSON — no markdown:
{
  "account_name": "exact name from account list, or null if no match",
  "confidence": "high|medium|low|unmatched",
  "intel_summary": "3-5 specific sentences: what was discussed, decisions, next steps",
  "action_items": [
    { "task": "verb-first action item", "due_date": "YYYY-MM-DD or null", "contact": "person name or null" }
  ],
  "reasoning": "one sentence on why you matched this account (or why no match)"
}

Account list: ${(account_names || []).join(', ')}

Call title: ${session_title || 'Untitled'}
Call date: ${session_date || 'unknown'}

Summary:
${summary.slice(0, 6000)}`
      }]
    })
  })

  if (!claudeRes.ok) {
    const err = await claudeRes.text()
    return { status: 502, body: { error: `Claude error: ${claudeRes.status}` } }
  }

  const claudeData = await claudeRes.json()
  const text = claudeData.content?.[0]?.text || ''

  let parsed = {}
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) parsed = JSON.parse(match[0])
  } catch {
    return { status: 500, body: { error: 'Claude response could not be parsed' } }
  }

  return {
    status: 200,
    body: {
      ok: true,
      recommendation: parsed.account_name || null,
      confidence: parsed.confidence || 'unmatched',
      intel_summary: parsed.intel_summary || '',
      action_items: parsed.action_items || [],
      reasoning: parsed.reasoning || ''
    }
  }
}

// ── apply action ──────────────────────────────────────────────────────────────

async function handleApply(body) {
  const { session_id, account_id, session_title, session_date, intel_summary, action_items } = body
  if (!session_id || !account_id) {
    return { status: 400, body: { error: 'session_id and account_id are required' } }
  }

  const sb = getSupabase()

  // Load accounts blob
  let row
  try {
    row = await loadAccounts(sb)
  } catch (err) {
    return { status: 500, body: { error: err.message } }
  }

  const accounts = row.data.accounts || []
  const acct = accounts.find(a => a.id === account_id)
  if (!acct) {
    return { status: 404, body: { error: `Account ${account_id} not found` } }
  }

  const date = session_date || new Date().toISOString().split('T')[0]

  const newIntelEntry = {
    id:           uid(),
    type:         'Call',
    date,
    summary:      intel_summary || '',
    insights:     [],
    risks:        [],
    opportunities: [],
    participants:  '',
    source:       'Wave AI (manual review)',
    sessionId:    session_id,
    sessionTitle:  session_title || 'Call Recording'
  }

  const newFollowUps = (action_items || [])
    .filter(ai => ai?.task?.trim())
    .map(ai => ({
      id:       uid(),
      task:     ai.task,
      dueDate:  ai.due_date || '',
      contact:  ai.contact || '',
      priority: 'Medium',
      status:   'Open',
      source:   'Wave AI (manual review)'
    }))

  const updatedAcct = {
    ...acct,
    intelLog:    [newIntelEntry, ...(acct.intelLog || [])],
    followUps:   [...(acct.followUps || []), ...newFollowUps],
    lastContact: date
  }

  const updatedAccounts = accounts.map(a => a.id === account_id ? updatedAcct : a)

  try {
    await saveAccounts(sb, row, updatedAccounts)
  } catch (err) {
    return { status: 409, body: { error: err.message } }
  }

  // Record as applied
  await sb
    .from('wave_applied_sessions')
    .upsert(
      { session_id, account_name: acct.name, account_id, source: 'manual' },
      { onConflict: 'session_id', ignoreDuplicates: false }
    )

  return {
    status: 200,
    body: {
      ok: true,
      account_name: acct.name,
      intel_entries: 1,
      follow_ups: newFollowUps.length,
      updatedAccount: updatedAcct
    }
  }
}

// ── handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.has(origin) ? origin : 'https://myledgr.io')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const { action } = body || {}

  if (action === 'analyze') {
    const result = await handleAnalyze(body)
    return res.status(result.status).json(result.body)
  }

  if (action === 'apply') {
    const result = await handleApply(body)
    return res.status(result.status).json(result.body)
  }

  return res.status(400).json({ error: `Unknown action: "${action}". Expected: analyze | apply` })
}
