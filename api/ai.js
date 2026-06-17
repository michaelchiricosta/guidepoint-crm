// Vercel serverless AI proxy — all Anthropic calls go through here.
// Required Vercel env var: ANTHROPIC_API_KEY
//   Set in: Vercel Dashboard → Project → Settings → Environment Variables → Production
// The browser never sends an API key; all auth happens server-side.
// No client prompts, account data, contacts, or API keys are logged.

const ALLOWED_ORIGINS = new Set([
  'https://myledgr.io',
  'https://www.myledgr.io',
  'http://localhost:5173',
  'http://localhost:4173',
])

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.has(origin) ? origin : 'https://myledgr.io')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { type: 'invalid_request_error', message: 'Method not allowed' } })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: { type: 'server_error', message: 'AI service is not configured' } })
  }

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    if (!body || typeof body !== 'object') throw new Error('invalid')
  } catch {
    return res.status(400).json({ error: { type: 'invalid_request_error', message: 'Invalid request body' } })
  }

  const needsWebSearch = Array.isArray(body.tools) &&
    body.tools.some(t => String(t.type || '').includes('web_search'))

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    ...(needsWebSearch ? { 'anthropic-beta': 'web-search-2025-03-05' } : {}),
  }

  const OVERLOAD_DELAYS = [2000, 5000, 10000]
  let anthropicRes, data

  for (let attempt = 0; attempt <= OVERLOAD_DELAYS.length; attempt++) {
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    } catch {
      return res.status(502).json({ error: { type: 'server_error', message: 'Could not reach Anthropic API' } })
    }

    data = await anthropicRes.json()

    const isOverloaded = data.error?.type === 'overloaded_error' || anthropicRes.status === 529
    if (isOverloaded && attempt < OVERLOAD_DELAYS.length) {
      await new Promise(r => setTimeout(r, OVERLOAD_DELAYS[attempt]))
      continue
    }
    break
  }

  return res.status(anthropicRes.status).json(data)
}
