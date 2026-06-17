import { createHash } from 'crypto'

const GP_FEEDS = [
  'https://www.guidepointsecurity.com/blog/feed/',
  'https://www.guidepointsecurity.com/feed/',
]

function simpleId(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 16)
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[\\s>][^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = re.exec(xml)
  if (!m) {
    const re2 = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i')
    const m2 = re2.exec(xml)
    if (!m2) return ''
    const raw2 = m2[1].trim()
    const cd2 = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(raw2)
    return (cd2 ? cd2[1] : raw2).trim()
  }
  const raw = m[1].trim()
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(raw)
  return (cdata ? cdata[1] : raw).trim()
}

function extractLink(xml) {
  const m1 = /<link>([^<]+)<\/link>/i.exec(xml)
  if (m1) return m1[1].trim()
  const m2 = /<link[^>]+href="([^"]+)"/i.exec(xml)
  if (m2) return m2[1].trim()
  const m3 = /<guid[^>]*isPermaLink="true"[^>]*>([^<]+)<\/guid>/i.exec(xml)
  if (m3) return m3[1].trim()
  const m4 = /<guid[^>]*>([^<]+)<\/guid>/i.exec(xml)
  if (m4 && m4[1].startsWith('http')) return m4[1].trim()
  return ''
}

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectCategory(text) {
  const t = (text || '').toLowerCase()
  if (/identity|iam|mfa|pam|privileged|entra|okta|sailpoint|saviynt|access management/.test(t)) return 'Identity & IAM'
  if (/ransomware|malware|phishing|threat|attack|breach|exploit|apt|adversary/.test(t)) return 'Threat Intelligence'
  if (/cloud|aws|azure|gcp|cspm|sase|zero.trust|cloudflare|zscaler|cnapp/.test(t)) return 'Cloud Security'
  if (/compliance|regulatory|hipaa|sox|pci|nist|gdpr|cmmc|audit|governance/.test(t)) return 'Compliance & Risk'
  if (/siem|soc|incident|detection|response|xdr|chronicle|splunk|mdr/.test(t)) return 'SOC & Detection'
  if (/\bai\b|machine.learning|llm|genai|artificial.intel/.test(t)) return 'AI Security'
  if (/endpoint|edr|crowdstrike|sentinelone|defender|epp|carbon.black/.test(t)) return 'Endpoint Security'
  if (/pen.test|penetration|red.team|vulnerability|patch|asm|scanning/.test(t)) return 'Vulnerability Mgmt'
  return 'Security News'
}

function parseRss(xml, limit) {
  const articles = []
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let m
  while ((m = itemRe.exec(xml)) !== null && articles.length < limit) {
    const item = m[1]
    const title = stripHtml(extractTag(item, 'title'))
    const link = extractLink(item)
    const pubDate = extractTag(item, 'pubDate')
    const description = extractTag(item, 'description')

    if (!title || !link) continue

    let publishedDate = ''
    try { if (pubDate) publishedDate = new Date(pubDate).toISOString().split('T')[0] } catch {}

    const excerpt = stripHtml(description).slice(0, 500)

    articles.push({
      id: simpleId(link),
      title,
      sourceUrl: link,
      sourceName: 'GuidePoint Security Blog',
      sourcePriority: 1,
      publishedDate,
      excerpt,
      category: detectCategory(title + ' ' + excerpt),
      tags: [],
    })
  }
  return articles
}

async function fetchFeed(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LedgrRSSBot/1.0; +https://myledgr.io)' },
    })
    clearTimeout(timer)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, text: null }
    const text = await res.text()
    return { ok: true, text }
  } catch (err) {
    clearTimeout(timer)
    return { ok: false, error: err.name === 'AbortError' ? 'Timeout after 10s' : err.message, text: null }
  }
}

const ALLOWED_ORIGINS = new Set([
  'https://myledgr.io',
  'https://www.myledgr.io',
  'http://localhost:5173',
  'http://localhost:4173',
])

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.has(origin) ? origin : 'https://myledgr.io')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const limit = Math.min(parseInt(req.query?.limit || '25', 10), 50)

  const sources = []
  let fetchedText = null

  for (const feedUrl of GP_FEEDS) {
    const result = await fetchFeed(feedUrl)
    if (result.ok && result.text) {
      fetchedText = result.text
      sources.push({ sourceName: 'GuidePoint Security Blog', feedUrl, status: 'ok', count: 0, error: null })
      break
    } else {
      sources.push({ sourceName: 'GuidePoint Security Blog', feedUrl, status: 'error', count: 0, error: result.error })
    }
  }

  if (!fetchedText) {
    return res.status(200).json({
      ok: false,
      sources,
      articles: [],
      error: 'Could not fetch any GuidePoint RSS feed',
    })
  }

  const articles = parseRss(fetchedText, limit)
  const okSource = sources.find(s => s.status === 'ok')
  if (okSource) okSource.count = articles.length

  return res.status(200).json({ ok: true, sources, articles })
}
