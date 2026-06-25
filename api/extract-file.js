// Vercel serverless route — server-side file text extraction.
// Accepts POST JSON: { base64: string, ext: string, filename?: string }
// Returns JSON:      { text: string, charCount: number }
// No files are stored. File contents are never logged.

import { createRequire } from 'module'

// pdf-parse is CommonJS; createRequire lets us load it cleanly in an ESM context.
const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse/lib/pdf-parse.js')

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
}

const ALLOWED_ORIGINS = new Set([
  'https://myledgr.io',
  'https://www.myledgr.io',
  'http://localhost:5173',
  'http://localhost:4173',
])

const SUPPORTED_EXTS = new Set(['pdf', 'txt', 'csv'])
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.has(origin) ? origin : 'https://myledgr.io')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    if (!body || typeof body !== 'object') throw new Error('invalid body')
  } catch {
    return res.status(400).json({ error: 'Invalid request body' })
  }

  const { base64, ext, filename = 'file' } = body

  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'Missing required field: base64' })
  }

  const extLower = String(ext || '').toLowerCase().replace(/^\./, '')
  if (!SUPPORTED_EXTS.has(extLower)) {
    return res.status(400).json({
      error: `Unsupported file type: .${extLower}. Supported types: PDF, TXT, CSV`,
    })
  }

  let buffer
  try {
    buffer = Buffer.from(base64, 'base64')
  } catch {
    return res.status(400).json({ error: 'Invalid base64 encoding' })
  }

  if (buffer.length > MAX_FILE_BYTES) {
    return res.status(400).json({
      error: `File too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`,
    })
  }

  try {
    let text = ''

    if (extLower === 'pdf') {
      const parsed = await pdfParse(buffer)
      text = parsed.text || ''
      if (!text.trim()) {
        return res.status(422).json({
          error: 'Could not extract text from this PDF. It may be image-based or scanned. Try copying/pasting the text directly.',
        })
      }
    } else {
      // txt, csv — read as UTF-8 text
      text = buffer.toString('utf8')
      if (!text.trim()) {
        return res.status(422).json({ error: 'The file appears to be empty.' })
      }
    }

    return res.status(200).json({
      text,
      charCount: text.length,
      ext: extLower,
      filename: String(filename),
    })
  } catch (err) {
    // Log only the error message, never file contents
    console.error('[extract-file] Extraction failed:', err.message)
    return res.status(500).json({
      error: 'File extraction failed. Try copying/pasting the text directly.',
    })
  }
}
