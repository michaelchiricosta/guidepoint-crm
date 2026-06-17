// ─── Ledgr Central AI Helper ─────────────────────────────────────────────────
// Model routing, cache management, request locks, budget controls, error handling
// ─────────────────────────────────────────────────────────────────────────────

import { trackAI, getRecords } from './aiTracker.js'

// ── Model routing ──────────────────────────────────────────────────────────────
// Cheap: extraction, classification, dedup, short summaries
// Strong: final strategic writing, complex reasoning, client-facing content
export const AI_MODELS = {
  cheap:    'claude-haiku-4-5-20251001',  // ~4× cheaper than Sonnet — use for all extraction
  standard: 'claude-sonnet-4-6',           // general analysis
  strong:   'claude-sonnet-4-6',           // daily brief, meeting prep, journal, email drafts
}

// ── Default AI settings ────────────────────────────────────────────────────────
export const DEFAULT_AI_SETTINGS = {
  monthlyBudgetDollars:  50,
  warnAtPercent:         70,
  blockAtPercent:        95,
  allowAutoDailyBrief:   false,   // must be explicitly enabled; false = manual only
  allowAutoMarketSync:   false,   // auto-sync once/day when enabled
  defaultCheapModel:     'claude-haiku-4-5-20251001',
  defaultStrongModel:    'claude-sonnet-4-6',
}

// ── In-memory request locks ─────────────────────────────────────────────────────
const _inFlight = new Map()

// ── Fast string hash (FNV-1a variant, base36 output) ───────────────────────────
export function hashStr(str) {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

// ── Cache helpers (operate on data.aiCache, persisted to Supabase) ─────────────
export function getAICache(data, key) {
  const entry = data?.aiCache?.[key]
  if (!entry) return null
  if (entry.ttlMs && Date.now() - new Date(entry.cachedAt).getTime() > entry.ttlMs) return null
  return entry.value
}

export function setAICache(setData, key, value, ttlMs = 24 * 3600 * 1000) {
  setData(prev => ({
    ...prev,
    aiCache: {
      ...(prev.aiCache || {}),
      [key]: { value, cachedAt: new Date().toISOString(), ttlMs },
    },
  }))
}

// Prune cache entries older than their TTL (call occasionally to keep data lean)
export function pruneAICache(setData) {
  const now = Date.now()
  setData(prev => {
    const cache = prev.aiCache || {}
    const pruned = Object.fromEntries(
      Object.entries(cache).filter(([, entry]) => {
        if (!entry.ttlMs) return true
        return now - new Date(entry.cachedAt).getTime() <= entry.ttlMs
      })
    )
    return { ...prev, aiCache: pruned }
  })
}

// ── Budget tracking ─────────────────────────────────────────────────────────────
export function checkBudget(data) {
  const s = data?.aiSettings || {}
  const budget = s.monthlyBudgetDollars ?? DEFAULT_AI_SETTINGS.monthlyBudgetDollars
  const warnPct = s.warnAtPercent ?? DEFAULT_AI_SETTINGS.warnAtPercent
  const blockPct = s.blockAtPercent ?? DEFAULT_AI_SETTINGS.blockAtPercent
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const allLogs = getRecords()
  const monthLogs = allLogs.filter(l => (l.ts || l.timestamp || '') >= monthStart && l.source !== 'sample')
  const spend = monthLogs.reduce((sum, l) => sum + (l.estimatedCost ?? l.costEst ?? 0), 0)
  const pct = budget > 0 ? (spend / budget) * 100 : 0
  return {
    spend: parseFloat(spend.toFixed(4)),
    budget,
    pct: parseFloat(pct.toFixed(1)),
    warn: pct >= warnPct,
    blocked: pct >= blockPct,
  }
}

// ── Friendly error messages for the UI ─────────────────────────────────────────
export function friendlyApiError(err) {
  const msg = String(err?.message || err || '')
  if (/usage.?limit|billing_error|spend.?limit/i.test(msg)) {
    return 'Anthropic monthly spend limit reached. Increase your limit at console.anthropic.com → Plans & Billing → Usage Limits.'
  }
  if (/rate.?limit|rate_limit/i.test(msg) || msg.includes('429')) {
    return 'Rate limit reached. Please wait 30–60 seconds and try again.'
  }
  if (msg === 'OVERLOADED' || /overload|529/.test(msg)) {
    return 'Anthropic API is temporarily overloaded. Please wait 30 seconds and try again.'
  }
  if (/CORS|cors|blocked by|socket hang up|network|fetch/i.test(msg)) {
    return 'Client-side sync is blocked by the source site\'s CORS policy. A server-side sync function is required.'
  }
  if (msg.includes('API key')) return 'Invalid API key. Update the ANTHROPIC_API_KEY in the Vercel project settings.'
  return `AI error: ${msg}`
}

// ── Request lock: prevents duplicate concurrent calls for the same key ──────────
export async function withLock(key, fn) {
  if (_inFlight.has(key)) {
    console.log(`[AI] Duplicate request blocked for: ${key} — returning existing promise`)
    return _inFlight.get(key)
  }
  const promise = Promise.resolve().then(fn).finally(() => _inFlight.delete(key))
  _inFlight.set(key, promise)
  return promise
}

export function isLocked(key) {
  return _inFlight.has(key)
}

// ── Core AI caller: throttled, retried, cached, locked, tracked ──────────────────
export async function callAI({
  feature,          // string — feature name (FEATURES.DAILY_BRIEF, etc.)
  operation,        // string — operation name ('generate-brief', 'draft-email', etc.)
  model,            // model ID — use AI_MODELS.cheap or AI_MODELS.strong
  system,           // string — system prompt (optional)
  messages,         // array — messages
  maxTokens,        // number — max_tokens
  apiKey,           // kept for call-site compat — not used; /api/ai handles auth
  cacheKey,         // string|null — if set, results are cached in data.aiCache
  data,             // object — data (for cache reads)
  setData,          // function — setData (for cache writes)
  onStatus,         // function|null — status callback
  maxRetries = 3,
  ttlMs = 24 * 3600 * 1000,   // cache TTL in ms (default 24h)
}) {

  // 1. Cache check
  if (cacheKey && data) {
    const cached = getAICache(data, cacheKey)
    if (cached !== null) {
      console.log(`[AI] Cache hit: ${feature} › ${operation} (key=${cacheKey})`)
      trackAI({ feature, operation, model: model || AI_MODELS.standard, inputChars: 0, maxTokensOut: 0, durationMs: 0, success: true, notes: 'CACHE_HIT' })
      return { cached: true, text: cached }
    }
  }

  // 2. Throttle: maintain ≥ 2s between Anthropic calls
  const lastCall = window._lastAnthropicCall || 0
  const wait = 2000 - (Date.now() - lastCall)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))

  const body = { model: model || AI_MODELS.standard, max_tokens: maxTokens || 1000, messages }
  if (system) body.system = system

  const _start = Date.now()

  // 3. Retry loop
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    window._lastAnthropicCall = Date.now()
    let res, respData
    try {
      res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      respData = await res.json()
    } catch (netErr) {
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 2000
        if (onStatus) onStatus(`Network error — retrying in ${Math.round(delay / 1000)}s…`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      throw netErr
    }

    const overloaded = respData.error?.type === 'overloaded_error' || res.status === 529 || res.status === 429
    if (overloaded && attempt < maxRetries - 1) {
      const delay = Math.pow(2, attempt) * 2000
      if (onStatus) onStatus(`API busy — retrying in ${Math.round(delay / 1000)}s… (${attempt + 2}/${maxRetries})`)
      await new Promise(r => setTimeout(r, delay))
      continue
    }
    if (overloaded) throw new Error('OVERLOADED')

    if (respData.error) {
      const errMsg = respData.error.message || respData.error.type || 'API error'
      if (/usage.?limit|billing_error|spend.?limit/i.test(errMsg)) {
        console.error('[AI] SPEND LIMIT — increase at console.anthropic.com → Plans & Billing → Usage Limits')
      }
      throw new Error(errMsg)
    }

    const text = respData.content?.[0]?.text || ''
    const durationMs = Date.now() - _start

    // 4. Track — use actual token counts from API response when available
    const inputChars = (system?.length || 0) + messages.reduce((s, m) => s + String(m.content || '').length, 0)
    const actualInputTokens = respData.usage?.input_tokens ?? null
    const actualOutputTokens = respData.usage?.output_tokens ?? null
    trackAI({ feature, operation, model: body.model, inputChars, maxTokensOut: maxTokens, actualInputTokens, actualOutputTokens, durationMs, success: true, source: 'anthropic' })

    // 5. Write cache
    if (cacheKey && setData) {
      setAICache(setData, cacheKey, text, ttlMs)
    }

    return { cached: false, text, raw: respData, durationMs }
  }

  throw new Error('OVERLOADED')
}

// ── Low-level retry wrapper ─────────────────────────────────────────────────
// Routes through /api/ai serverless proxy — no API key needed in the browser.
// apiKey param is kept for call-site backward compat but is not sent.
// Returns { data } where data is the raw Anthropic JSON response.
// Throws on exhausted retries or unrecoverable errors.
//   - 429 / rate_limit_error: slow backoff (15 s / 30 s / 60 s)
//   - 529 / overloaded_error: exponential backoff (2 s / 4 s / 8 s)
// web_search beta header is added server-side when body contains web_search tools.
export const callClaudeWithRetry = async (body, apiKey, onStatus, maxRetries = 3) => {
  const lastCall = window._lastAnthropicCall || 0
  const gap = 2000 - (Date.now() - lastCall)
  if (gap > 0) await new Promise(r => setTimeout(r, gap))

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    window._lastAnthropicCall = Date.now()
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    const isRateLimit = data.error?.type === 'rate_limit_error' || resp.status === 429
    const isOverloaded = data.error?.type === 'overloaded_error' || resp.status === 529

    if ((isRateLimit || isOverloaded) && attempt < maxRetries - 1) {
      const delay = isRateLimit
        ? [15000, 30000, 60000][Math.min(attempt, 2)]
        : Math.pow(2, attempt) * 2000
      if (onStatus) onStatus(`${isRateLimit ? 'Rate limited' : 'API busy'} — retrying in ${Math.round(delay / 1000)}s… (${attempt + 2}/${maxRetries})`)
      await new Promise(r => setTimeout(r, delay))
      continue
    }

    if (onStatus) onStatus('')
    return { data }
  }
  throw new Error('OVERLOADED')
}
