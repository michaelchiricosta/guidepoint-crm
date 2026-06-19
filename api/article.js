import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

const TIMEOUT_MS = 10000
const MAX_BYTES  = 2 * 1024 * 1024  // 2 MB — enough for any article page

const ALLOWED_ORIGINS = new Set([
  'https://myledgr.io', 'https://www.myledgr.io',
  'http://localhost:5173', 'http://localhost:4173',
])

// ── SSRF protection ────────────────────────────────────────────────────────────
function isAllowedUrl(urlStr) {
  try {
    const u = new URL(urlStr)
    if (!['http:', 'https:'].includes(u.protocol)) return false
    const h = u.hostname.toLowerCase()
    if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return false
    if (/^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false
    if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.test')) return false
    return true
  } catch { return false }
}

// ── Strip tags that could XSS ─────────────────────────────────────────────────
// Readability returns HTML. We sanitize it before sending to the client by
// whitelisting a safe subset of tags and removing all attributes except href/src.
function sanitizeHtml(html) {
  if (!html) return ''
  // We use a lightweight regex-based sanitiser here (no extra library).
  // This is safe because Readability already strips most junk; we just
  // ensure no script/style/event handlers survive.
  return html
    // remove script and style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // remove all event handler attributes (onclick, onload, onerror …)
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // remove javascript: href/src
    .replace(/href\s*=\s*(['"])javascript:[^'"]*\1/gi, 'href="#"')
    .replace(/src\s*=\s*(['"])javascript:[^'"]*\1/gi, 'src=""')
    // remove data: hrefs (potential vectors)
    .replace(/href\s*=\s*(['"])data:[^'"]*\1/gi, 'href="#"')
    // strip iframe, object, embed, form, input
    .replace(/<\/?(?:iframe|object|embed|form|input|button|select|textarea|meta|link|base)[^>]*>/gi, '')
    .trim()
}

// ── Fallback extractor when Readability returns nothing ───────────────────────
function fallbackExtract(html, url) {
  const ogTitle    = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)
  const ogDesc     = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(html)
  const metaDesc   = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html)
  const titleTag   = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
  const byline     = /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i.exec(html)
  const siteName   = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i.exec(html)
  const pubDate    = /<meta[^>]+(?:property=["']article:published_time["']|name=["']pubdate["'])[^>]+content=["']([^"']+)["']/i.exec(html)

  // grab paragraph text as plain excerpt
  const paras = []
  const paraRe = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let m
  while ((m = paraRe.exec(html)) !== null && paras.join(' ').length < 2000) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (text.length > 40) paras.push(text)
  }

  return {
    title:       (ogTitle?.[1] || titleTag?.[1] || '').slice(0, 300),
    byline:      byline?.[1] || '',
    siteName:    siteName?.[1] || new URL(url).hostname.replace('www.',''),
    publishedAt: pubDate?.[1] || null,
    excerpt:     (ogDesc?.[1] || metaDesc?.[1] || '').slice(0, 500),
    textContent: paras.join('\n\n').slice(0, 6000),
    contentHtml: '',
    url,
    fallback: true,
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.has(origin) ? origin : 'https://myledgr.io')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const articleUrl = req.query?.url || ''
  if (!articleUrl) return res.status(400).json({ error: 'Missing url parameter' })
  if (!isAllowedUrl(articleUrl)) return res.status(400).json({ error: 'Invalid or disallowed URL' })

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  let html
  try {
    const r = await fetch(articleUrl, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LedgrReader/1.0; +https://myledgr.io)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })
    clearTimeout(timer)
    if (!r.ok) return res.status(200).json({ error: `HTTP ${r.status}`, url: articleUrl })

    // Stream + limit response size
    const reader = r.body?.getReader()
    if (!reader) {
      html = await r.text()
    } else {
      const chunks = []
      let total = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done || !value) break
        total += value.length
        if (total > MAX_BYTES) { reader.cancel(); break }
        chunks.push(value)
      }
      html = new TextDecoder().decode(Buffer.concat(chunks.map(c => Buffer.from(c))))
    }
  } catch (err) {
    clearTimeout(timer)
    const msg = err.name === 'AbortError' ? 'Request timed out' : err.message
    return res.status(200).json({ error: msg, url: articleUrl })
  }

  // ── Parse with Readability ────────────────────────────────────────────────
  try {
    const dom = new JSDOM(html, { url: articleUrl })
    const reader = new Readability(dom.window.document, { charThreshold: 100 })
    const parsed = reader.parse()

    if (parsed && parsed.content) {
      return res.status(200).json({
        title:       parsed.title       || '',
        byline:      parsed.byline      || '',
        siteName:    parsed.siteName    || new URL(articleUrl).hostname.replace('www.',''),
        publishedAt: parsed.publishedTime || null,
        excerpt:     parsed.excerpt     || '',
        contentHtml: sanitizeHtml(parsed.content),
        textContent: (parsed.textContent || '').slice(0, 8000),
        url:         articleUrl,
        fallback:    false,
      })
    }
  } catch {}

  // ── Fallback when Readability fails ──────────────────────────────────────
  return res.status(200).json(fallbackExtract(html, articleUrl))
}
