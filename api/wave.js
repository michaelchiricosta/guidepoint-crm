// Vercel serverless Wave API proxy — all Wave API calls go through here.
// Required Vercel env var: WAVE_API_KEY
//   Set in: Vercel Dashboard → Project → Settings → Environment Variables → Production
// The browser never sends the API key; all auth happens server-side.
//
// Wave API base: https://api.wave.co/v1
// Endpoints used:
//   GET  /sessions?after=<ISO>&limit=50  → list sessions
//   GET  /sessions/{id}/transcript       → session transcript
//
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

  // ── Test mode: confirm auth + endpoint are reachable ────────────────────────
  if (action === 'test') {
    try {
      const waveRes = await fetchWave('/sessions?limit=1', apiKey)
      const rawText = await waveRes.text()
      let rawJson = null
      try { rawJson = JSON.parse(rawText) } catch {}
      console.log(`[wave/test] status=${waveRes.status} body=${rawText.slice(0, 500)}`)
      return res.status(200).json({
        ok: waveRes.ok,
        status: waveRes.status,
        raw: rawJson ?? rawText.slice(0, 500),
      })
    } catch (err) {
      console.error('[wave/test] fetch error:', err.message)
      return res.status(502).json({ error: err.message || 'Could not reach Wave API' })
    }
  }

  // ── List sessions from last 48 hours — cursor pagination, timestamp field ──────
  if (action === 'list') {
    try {
      // Wave uses cursor-based pagination, not date filtering via query params.
      // Fetch up to 3 pages (150 sessions max), stop early when oldest session
      // exceeds the 48-hour cutoff, then filter client-side.
      const cutoff = new Date()
      cutoff.setHours(0, 0, 0, 0)
      cutoff.setDate(cutoff.getDate() - 1) // yesterday midnight ≈ 48 hours

      let allSessions = []
      let cursor = null
      let pages = 0

      while (pages < 3) {
        const params = new URLSearchParams({ limit: '50' })
        if (cursor) params.set('cursor', cursor)

        const waveRes = await fetchWave(`/sessions?${params}`, apiKey)
        if (!waveRes.ok) {
          const errText = await waveRes.text().catch(() => '')
          console.error(`[wave/list] status=${waveRes.status} body=${errText}`)
          return res.status(waveRes.status).json({
            error: `Wave API returned ${waveRes.status}`,
            detail: errText.slice(0, 500),
          })
        }

        const data = await waveRes.json()
        const sessions = Array.isArray(data.sessions) ? data.sessions
          : Array.isArray(data.recordings) ? data.recordings
          : Array.isArray(data.data) ? data.data
          : Array.isArray(data) ? data : []

        console.log(`[wave/list] page ${pages + 1}: got ${sessions.length} sessions`)

        allSessions = allSessions.concat(sessions)
        pages++

        // Stop if Wave says no more pages, or oldest session is already before cutoff
        if (!data.has_more || !data.next_cursor) break
        if (sessions.length > 0) {
          const oldest = new Date(sessions[sessions.length - 1].timestamp || sessions[sessions.length - 1].created_at || 0)
          if (oldest < cutoff) break
        }
        cursor = data.next_cursor
      }

      // Filter to 48-hour window using confirmed `timestamp` field
      const filtered = allSessions.filter(s => {
        const ts = s.timestamp || s.created_at || s.started_at || s.date
        if (!ts) return false
        return new Date(ts) >= cutoff
      })

      console.log(`[wave/list] total fetched: ${allSessions.length}, after 48hr filter: ${filtered.length}`)

      // Normalize session shape for the frontend
      const normalized = filtered.map(s => ({
        id:       s.id,
        title:    s.title || s.name || 'Call Recording',
        date:     s.timestamp || s.created_at || s.started_at || s.date || '',
        duration: s.duration_seconds ?? s.duration ?? null,
        platform: s.platform || null,
        type:     s.type || 'recording',
      }))

      return res.status(200).json({ ok: true, sessions: normalized })
    } catch (err) {
      console.error('[wave/list] error:', err.message)
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
      const waveRes = await fetchWave(`/sessions/${sid}/transcript`, apiKey)
      if (!waveRes.ok) {
        const errText = await waveRes.text().catch(() => '')
        console.error(`[wave/transcript] status=${waveRes.status} body=${errText}`)
        return res.status(waveRes.status).json({
          error: `Wave API returned ${waveRes.status}`,
          detail: errText.slice(0, 500),
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
      console.error('[wave/transcript] fetch error:', err.message)
      return res.status(502).json({ error: err.message || 'Could not reach Wave API' })
    }
  }

  return res.status(400).json({ error: `Unknown action: "${action}". Expected: list | transcript | test` })
}
