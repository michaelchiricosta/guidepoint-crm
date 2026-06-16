const FEEDS = [
  {
    sourceName: 'GuidePoint Security Blog',
    feedUrl: 'https://www.guidepointsecurity.com/blog/feed/',
    fallbackUrl: 'https://www.guidepointsecurity.com/feed/',
  },
  {
    sourceName: 'CIO Security',
    feedUrl: 'https://www.cio.com/category/security/index.rss',
  },
  {
    sourceName: 'DarkReading',
    feedUrl: 'https://www.darkreading.com/rss/all.xml',
  },
]

async function testFeed(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LedgrRSSBot/1.0)' },
    })
    clearTimeout(timeout)
    const text = await res.text()
    return {
      success: res.ok,
      status: res.status,
      contentType: res.headers.get('content-type') || '',
      responseLength: text.length,
      preview: text.slice(0, 300),
      error: res.ok ? null : `HTTP ${res.status}`,
    }
  } catch (err) {
    clearTimeout(timeout)
    return {
      success: false,
      status: null,
      contentType: '',
      responseLength: 0,
      preview: '',
      error: err.name === 'AbortError' ? 'Timeout after 8s' : err.message,
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  const results = []

  for (const feed of FEEDS) {
    const result = await testFeed(feed.feedUrl)

    // GuidePoint: if primary fails, try fallback
    if (!result.success && feed.fallbackUrl) {
      const fallback = await testFeed(feed.fallbackUrl)
      results.push({
        sourceName: feed.sourceName,
        feedUrl: feed.feedUrl,
        ...result,
        fallback: {
          feedUrl: feed.fallbackUrl,
          ...fallback,
        },
      })
    } else {
      results.push({
        sourceName: feed.sourceName,
        feedUrl: feed.feedUrl,
        ...result,
        fallback: null,
      })
    }
  }

  return res.status(200).json({
    testedAt: new Date().toISOString(),
    feeds: results,
  })
}
