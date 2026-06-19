import { createHash } from 'crypto'

const TIMEOUT_MS = 9000
const MAX_SOURCES = 20
const MAX_ITEMS_PER_SOURCE = 30
const MAX_TOTAL_ITEMS = 50

const ALLOWED_ORIGINS = new Set([
  'https://myledgr.io', 'https://www.myledgr.io',
  'http://localhost:5173', 'http://localhost:4173',
])

// SSRF protection — reject private/loopback addresses
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

function stableId(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 16)
}

function extractTag(xml, tag) {
  const re1 = new RegExp(`<${tag}[\\s>][^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const re2 = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = re1.exec(xml) || re2.exec(xml)
  if (!m) return ''
  const raw = m[1].trim()
  const cd = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(raw)
  return (cd ? cd[1] : raw).trim()
}

function extractLink(chunk) {
  // RSS <link>
  const m1 = /<link>([^<]+)<\/link>/i.exec(chunk)
  if (m1) return m1[1].trim()
  // Atom <link href="...">
  const m2 = /<link[^>]+href="([^"]+)"/i.exec(chunk)
  if (m2) return m2[1].trim()
  // Guid that looks like a URL
  const m3 = /<guid[^>]*>([^<]+)<\/guid>/i.exec(chunk)
  if (m3 && m3[1].trim().startsWith('http')) return m3[1].trim()
  return ''
}

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function parseRss(xml, sourceId, sourceName, limit) {
  const items = []
  // RSS 2.0 <item>
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let m
  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const chunk = m[1]
    const title = stripHtml(extractTag(chunk, 'title'))
    const link = extractLink(chunk)
    const pubDate = extractTag(chunk, 'pubDate')
    const description = extractTag(chunk, 'description') || extractTag(chunk, 'content:encoded')
    const author = extractTag(chunk, 'author') || extractTag(chunk, 'dc:creator') || ''
    if (!title || !link) continue
    let publishedAt = ''
    try { if (pubDate) publishedAt = new Date(pubDate).toISOString() } catch {}
    items.push({
      id: stableId(link), sourceId, sourceName,
      title, link,
      description: stripHtml(description).slice(0, 500),
      publishedAt, author: stripHtml(author),
    })
  }
  // Atom <entry> fallback
  if (items.length === 0) {
    const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/gi
    while ((m = entryRe.exec(xml)) !== null && items.length < limit) {
      const chunk = m[1]
      const title = stripHtml(extractTag(chunk, 'title'))
      const link = extractLink(chunk)
      const updated = extractTag(chunk, 'updated') || extractTag(chunk, 'published') || ''
      const summary = extractTag(chunk, 'summary') || extractTag(chunk, 'content') || ''
      const author = extractTag(chunk, 'name') || ''
      if (!title || !link) continue
      let publishedAt = ''
      try { if (updated) publishedAt = new Date(updated).toISOString() } catch {}
      items.push({
        id: stableId(link), sourceId, sourceName,
        title, link,
        description: stripHtml(summary).slice(0, 500),
        publishedAt, author: stripHtml(author),
      })
    }
  }
  return items
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LedgrRSSBot/1.0; +https://myledgr.io)',
        ...(opts.headers || {}),
      },
    })
    clearTimeout(timer)
    return res
  } catch (err) {
    clearTimeout(timer)
    throw err.name === 'AbortError' ? new Error('Timeout after 9s') : err
  }
}

// Try to discover an RSS feed URL from a website URL
async function discoverFeedUrl(siteUrl) {
  // 1. Fetch the page and look for <link rel="alternate" type="application/rss+xml">
  try {
    const res = await fetchWithTimeout(siteUrl)
    if (res.ok) {
      const html = await res.text()
      const re = /<link[^>]+(?:application\/rss\+xml|application\/atom\+xml)[^>]*>/gi
      let m
      while ((m = re.exec(html)) !== null) {
        const hm = /href="([^"]+)"/i.exec(m[0])
        if (hm) {
          try { return new URL(hm[1], siteUrl).toString() } catch {}
        }
      }
    }
  } catch {}
  // 2. Try common feed paths
  try {
    const u = new URL(siteUrl)
    const base = `${u.protocol}//${u.host}`
    for (const path of ['/feed/', '/feed', '/rss.xml', '/rss', '/atom.xml', '/blog/feed/', '/news/feed/']) {
      try {
        const r = await fetchWithTimeout(base + path)
        if (!r.ok) continue
        const ct = r.headers.get('content-type') || ''
        const isXml = ct.includes('xml') || ct.includes('rss') || ct.includes('atom')
        if (isXml) return base + path
        const text = await r.text()
        if (text.includes('<rss') || text.includes('<feed') || text.includes('<channel')) return base + path
      } catch {}
    }
  } catch {}
  return null
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

  let body
  try { body = typeof req.body === 'object' ? req.body : JSON.parse(req.body) } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  // ── Discover mode: find feed URL for a website ──────────────────────────────
  if (body?.discover === true) {
    const url = body.url || ''
    if (!url || !isAllowedUrl(url)) return res.status(400).json({ error: 'Invalid or disallowed URL' })
    const feedUrl = await discoverFeedUrl(url)
    return res.status(200).json({ feedUrl: feedUrl || null })
  }

  // ── Fetch mode: fetch and parse all enabled sources ─────────────────────────
  const sources = body?.sources
  if (!Array.isArray(sources)) return res.status(400).json({ error: 'sources must be an array' })
  if (sources.length > MAX_SOURCES) return res.status(400).json({ error: `Max ${MAX_SOURCES} sources` })

  const sourceResults = []
  const allItems = []

  for (const src of sources) {
    if (!src.enabled) { sourceResults.push({ id: src.id, name: src.name, status: 'disabled', count: 0 }); continue }
    const feedUrl = src.feedUrl
    if (!feedUrl || !isAllowedUrl(feedUrl)) {
      sourceResults.push({ id: src.id, name: src.name, status: 'error', error: 'No valid feed URL configured', count: 0 })
      continue
    }
    try {
      const r = await fetchWithTimeout(feedUrl)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const xml = await r.text()
      if (!xml.trim()) throw new Error('Empty response')
      const items = parseRss(xml, src.id, src.name, MAX_ITEMS_PER_SOURCE)
      allItems.push(...items)
      sourceResults.push({ id: src.id, name: src.name, status: 'ok', count: items.length })
    } catch (err) {
      sourceResults.push({ id: src.id, name: src.name, status: 'error', error: (err.message || 'Unknown error').slice(0, 200), count: 0 })
    }
  }

  allItems.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
  const items = allItems.slice(0, MAX_TOTAL_ITEMS)

  return res.status(200).json({ ok: true, items, sourceResults })
}
