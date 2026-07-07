// Vercel serverless Wave API proxy — all Wave API calls go through here.
// Required Vercel env var: WAVE_API_KEY
//   Set in: Vercel Dashboard → Project → Settings → Environment Variables → Production
// The browser never sends the API key; all auth happens server-side.
//
// Wave API base: https://api.wave.co/v1
// Endpoints used:
//   GET  /recordings?status=completed&after=<ISO>&limit=50  → list sessions
//   GET  /recordings/{id}/transcript                         → session transcript
//   GET  /sessions/{id}/transcript                           → fallback endpoint
//
// If Wave changes its API structure, update WAVE_BASE and the route constants below.
// The browser only sends { action, after?, session_id? } — never credentials.

const WAVE_BASE = 'https://api.wave.co/v1'
const TIMEOUT_MS = 25000

const ALLOWED_ORIGINS = new Set([
  'https://myledgr.io',
  'https://www.myledgr.io',
  'http://localhost:5173',
  'http://localhost:4173',
])

async function fetchWave(path, apiKey, opts = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${WAVE_BASE}${path}`, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    })
    clearTimeout(timer)
    return res
  } catch (err) {
    clearTimeout(timer)
    throw err.name === 'AbortError' ? new Error('Wave API request timed out') : err
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.has(origin) ? origin : 'https://myledgr.io')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.WAVE_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Wave API key not configured. Set WAVE_API_KEY in Vercel environment variables.' })
  }

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    if (!body || typeof body !== 'object') throw new Error('invalid')
  } catch {
    return res.status(400).json({ error: 'Invalid request body' })
  }

  const { action } = body

  // ── List completed sessions after a given timestamp ──────────────────────────
  if (action === 'list') {
    const after = body.after || null
    try {
      const params = new URLSearchParams({ status: 'completed', limit: '50' })
      if (after) params.set('after', after)
      const waveRes = await fetchWave(`/recordings?${params}`, apiKey)
      if (!waveRes.ok) {
        const errText = await waveRes.text().catch(() => '')
        return res.status(waveRes.status).json({
          error: `Wave API returned ${waveRes.status}`,
          detail: errText.slice(0, 300),
        })
      }
      const data = await waveRes.json()
      // Normalize: Wave may return recordings/sessions/data array at different paths
      const sessions = Array.isArray(data) ? data
        : Array.isArray(data.recordings) ? data.recordings
        : Array.isArray(data.sessions) ? data.sessions
        : Array.isArray(data.data) ? data.data
        : []
      return res.status(200).json({ ok: true, sessions })
    } catch (err) {
      return res.status(502).json({ error: err.message || 'Could not reach Wave API' })
    }
  }

  // ── Fetch transcript for a specific session ──────────────────────────────────
  if (action === 'transcript') {
    const { session_id } = body
    if (!session_id || typeof session_id !== 'string' || session_id.length > 256) {
      return res.status(400).json({ error: 'session_id is required' })
    }
    try {
      const sid = encodeURIComponent(session_id)
      // Try /recordings/{id}/transcript first, then /sessions/{id}/transcript as fallback
      let waveRes = await fetchWave(`/recordings/${sid}/transcript`, apiKey)
      if (waveRes.status === 404) {
        waveRes = await fetchWave(`/sessions/${sid}/transcript`, apiKey)
      }
      if (!waveRes.ok) {
        const errText = await waveRes.text().catch(() => '')
        return res.status(waveRes.status).json({
          error: `Wave API returned ${waveRes.status}`,
          detail: errText.slice(0, 300),
        })
      }
      const data = await waveRes.json()
      // Normalize transcript field (Wave may use different names)
      const transcript_text =
        typeof data.transcript === 'string' ? data.transcript :
        typeof data.text === 'string' ? data.text :
        typeof data.content === 'string' ? data.content :
        typeof data.transcript_text === 'string' ? data.transcript_text :
        ''
      return res.status(200).json({ ok: true, transcript_text })
    } catch (err) {
      return res.status(502).json({ error: err.message || 'Could not reach Wave API' })
    }
  }

  return res.status(400).json({ error: `Unknown action: "${action}". Expected: list | transcript` })
}
