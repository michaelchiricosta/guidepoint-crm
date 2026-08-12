// api/wave-review.js  (v2 — GuidePoint signal extraction)
//
// Two actions, both POST:
//
//   action: 'analyze'  — fetch a Wave session's AI summary, run Claude to
//                        identify the best account match + extract signals
//                        through a GuidePoint ECM lens.
//
//   action: 'apply'    — write intel + signals to the selected account in the
//                        Supabase accounts blob and record in wave_applied_sessions.
//
// Required Vercel env vars:
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

// ── analyze action ─────────────────────────────────────────────────────────────

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
        signals: [],
        action_items: [],
        note: 'No usable AI summary available for this session yet.'
      }
    }
  }

  // 2. Run Claude with GuidePoint ECM lens
  const claudeRes = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are an AI assistant for Mike Chiricosta, an Enterprise Client Manager at GuidePoint Security covering New England.

GuidePoint is a cybersecurity VAR and professional services firm. Mike's job is to be a trusted advisor — he thinks in platforms not point solutions, leads with business outcomes, and is always listening for adjacent opportunities that a client hasn't yet framed as a need. He sells and implements solutions across the full security stack: identity (IGA/PAM), cloud security (CSPM/CNAPP), endpoint/EDR, data security, MDR, AppSec, and GRC/compliance.

GuidePoint capabilities to keep in mind when identifying opportunities:
- Professional services: AppSec health checks, secure development advisory, identity assessments, cloud security reviews, DFIR, red team/pen testing, IR tabletop
- Managed services: MDR, managed identity, managed cloud security
- GRC/compliance: CMMC, PCI, NIST 800-53, SOC 2, security awareness training
- Vendor ecosystem: CrowdStrike, SentinelOne, Palo Alto, Zscaler, SailPoint, Saviynt, Varonis, Wiz, Horizon3, Aikido, and hundreds more

Parse this Wave call summary and extract intelligence through the lens of an experienced GuidePoint ECM.

Key mindset: Listen for what isn't said. A customer evaluating tools is really asking "should we have this capability?" A budget conversation is really "how do we prioritize spend?" A vendor complaint is really "what's actually solving our problem?" Surface the real opportunity behind the surface-level comment.

Return ONLY valid JSON — no markdown fences:
{
  "account_name": "exact name from account list, or null if no match",
  "confidence": "high|medium|low|unmatched",
  "intel_summary": "2-3 factual sentences on what actually happened in the call — decisions made, current status, concrete next steps",
  "signals": [
    {
      "type": "vendor|budget|pain|org|expansion|competitive",
      "what": "one sentence: what was actually said or revealed on the call",
      "gp_angle": "one sentence: the specific GuidePoint play this creates — name the service, motion, or conversation to have, and with whom"
    }
  ],
  "action_items": [
    {
      "task": "verb-first action item for Mike",
      "due_date": "YYYY-MM-DD or null",
      "contact": "person name or null",
      "priority": "high|medium|low"
    }
  ],
  "reasoning": "one sentence on why you matched this account (or why no match)"
}

Signal type guide — extract only what is genuinely present in the summary:
- vendor: A tool or product was mentioned (being evaluated, replaced, dissatisfied with, newly deployed, or compared to another). What does this tell us about where they're headed and what GuidePoint can do?
- budget: Budget was discussed — amounts, timelines, constraints, planning cycles, or approval processes. When is money available, for what, and how can GuidePoint shape how it gets spent?
- pain: The customer described a challenge, frustration, or operational problem they haven't yet framed as a formal need or RFP. What's the real problem, and what GuidePoint service addresses it before they go to market?
- org: A personnel change, new hire, departure, restructure, or capacity constraint was mentioned. What relationship or services opportunity does this create?
- expansion: There is an adjacent scope opportunity from the current engagement — something the customer needs that is close to what's already being worked. What is the logical next step?
- competitive: Another vendor, partner, system integrator, or competitor was mentioned. What's the displacement angle, co-sell angle, or risk of losing the relationship?

Quality over quantity. Two or three sharp signals beat six weak ones. Do not hallucinate — only extract what is actually in the summary.

Account list: ${(account_names || []).join(', ')}

Call title: ${session_title || 'Untitled'}
Call date: ${session_date || 'unknown'}

Summary:
${summary.slice(0, 6000)}`
      }]
    })
  })

  if (!claudeRes.ok) {
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
      signals: parsed.signals || [],
      action_items: parsed.action_items || [],
      reasoning: parsed.reasoning || ''
    }
  }
}

// ── apply action ───────────────────────────────────────────────────────────────

async function handleApply(body) {
  let { session_id, account_id, session_title, session_date, intel_summary, signals, action_items } = body
  if (!session_id || !account_id) {
    return { status: 400, body: { error: 'session_id and account_id are required' } }
  }

  // Auto-analyze if intel not provided
  if (!intel_summary) {
    const analyzed = await handleAnalyze({ session_id, session_title, session_date, account_names: [] })
    if (analyzed.body?.intel_summary) intel_summary = analyzed.body.intel_summary
    if (analyzed.body?.action_items?.length) action_items = analyzed.body.action_items
    if (analyzed.body?.signals?.length) signals = analyzed.body.signals
  }

  const sb = getSupabase()

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
    signals:      signals || [],
    insights:     [],
    risks:        [],
    opportunities: [],
    participants:  '',
    source:       'Wave AI (manual review)',
    sessionId:    String(session_id),
    sessionTitle: session_title || 'Call Recording'
  }

  const newFollowUps = (action_items || [])
    .filter(ai => ai?.task?.trim())
    .map(ai => ({
      id:       uid(),
      task:     ai.task,
      dueDate:  ai.due_date || '',
      contact:  ai.contact || '',
      priority: ai.priority || 'Medium',
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

  await sb
    .from('wave_applied_sessions')
    .upsert(
      { session_id: String(session_id), account_name: acct.name, account_id, source: 'manual' },
      { onConflict: 'session_id', ignoreDuplicates: false }
    )

  return {
    status: 200,
    body: {
      ok: true,
      account_name: acct.name,
      intel_summary,
      signals: signals || [],
      intel_entries: 1,
      follow_ups: newFollowUps.length,
      updatedAccount: updatedAcct
    }
  }
}

// ── handler ────────────────────────────────────────────────────────────────────

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
