// ─── Ledgr AI Usage Tracker ───────────────────────────────────────────────────
// Persists every Anthropic API call to localStorage for cost analysis.
// source: 'anthropic' = real API call | 'sample' = test/demo data
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ledgr_ai_usage_v1'
const MAX_RECORDS = 500
const DUPLICATE_WINDOW_MS = 5000

// Anthropic pricing per million tokens
export const AI_PRICING = {
  'claude-sonnet-4-6':         { inputPer1M: 3.00,  outputPer1M: 15.00, label: 'Sonnet 4.6' },
  'claude-haiku-4-5-20251001': { inputPer1M: 0.80,  outputPer1M: 4.00,  label: 'Haiku 4.5' },
  'claude-opus-4-8':           { inputPer1M: 15.00, outputPer1M: 75.00, label: 'Opus 4.8' },
}
const DEFAULT_MODEL = 'claude-sonnet-4-6'

// Canonical feature names — used as keys in the dashboard
export const FEATURES = {
  DAILY_BRIEF:       'Daily Brief',
  MEETING_PREP:      'Meeting Prep',
  MARKET_INTEL:      'Market Intel',
  WHITESPACE_UPLOAD: 'Whitespace Upload',
  AI_CHAT:           'AI Chat',
  TECH_STACK:        'Tech Stack',
  INTEL_LOG:         'Intel Log',
  ACCOUNT_HEALTH:    'Account Health',
  WHITESPACE_TOOLS:  'Whitespace Tools',
  AI_CISO:           'AI CISO',
  HOT_LEADS:         'Hot Leads',
  TEST:              'Test',
}

export function estimateCost(inputTokens, maxOutputTokens, model = DEFAULT_MODEL) {
  const p = AI_PRICING[model] || AI_PRICING[DEFAULT_MODEL]
  return (inputTokens / 1e6 * p.inputPer1M) + (maxOutputTokens / 1e6 * p.outputPer1M)
}

/**
 * Record one Anthropic API call.
 * New records use canonical field names; old records are read gracefully.
 */
export function trackAI({
  feature, operation, model, inputChars, maxTokensOut,
  durationMs = 0, success = true, notes = '',
  // If actual token counts from API response are available, use them
  actualInputTokens = null, actualOutputTokens = null,
  cacheHit = false, errorType = null, errorMessage = null,
  source = 'anthropic',
}) {
  const m = model || DEFAULT_MODEL
  const inputTokensEst = actualInputTokens !== null ? actualInputTokens : Math.ceil((inputChars || 0) / 4)
  const outputTokensEst = actualOutputTokens !== null ? actualOutputTokens : (maxTokensOut || 0)
  const costEst = parseFloat(estimateCost(inputTokensEst, outputTokensEst, m).toFixed(6))

  const record = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    // legacy alias kept for backward compat
    ts: new Date().toISOString(),
    feature: feature || 'Unknown',
    operation: operation || 'unknown',
    model: m,
    estimatedInputTokens: inputTokensEst,
    estimatedOutputTokens: outputTokensEst,
    estimatedCost: costEst,
    // legacy aliases
    inputTokensEst,
    maxTokensOut: maxTokensOut || 0,
    costEst,
    durationMs,
    success: cacheHit ? true : success,
    cacheHit,
    status: cacheHit ? 'cache_hit' : success ? 'success' : 'error',
    errorType: errorType || null,
    errorMessage: errorMessage || null,
    source,
    notes: notes || '',
  }

  const existing = getRecords()

  // Duplicate detection: same feature+operation within DUPLICATE_WINDOW_MS (skip for cache hits)
  if (!cacheHit && source === 'anthropic') {
    const isDup = existing.slice(0, 15).some(r =>
      r.feature === record.feature &&
      r.operation === record.operation &&
      (Date.now() - new Date(r.ts || r.timestamp).getTime()) < DUPLICATE_WINDOW_MS
    )
    if (isDup) {
      record.notes = [record.notes, 'DUPLICATE_WARNING'].filter(Boolean).join(' | ')
      console.warn(`[AI Tracker] ⚠ Possible duplicate: ${feature} › ${operation} within ${DUPLICATE_WINDOW_MS / 1000}s`)
    }
  }

  const updated = [record, ...existing].slice(0, MAX_RECORDS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...existing].slice(0, 100))) } catch {}
  }

  const p = AI_PRICING[m] || AI_PRICING[DEFAULT_MODEL]
  if (cacheHit) {
    console.log(`[AI Tracker] ${feature} › ${operation} | CACHE HIT | $0.00`)
  } else {
    console.log(
      `[AI Tracker] ${feature} › ${operation} | ${p.label} | ~${inputTokensEst.toLocaleString()} in | ~${outputTokensEst} out | $${costEst.toFixed(4)} | ${durationMs}ms | src=${source}${notes ? ' | ' + notes : ''}`
    )
  }
  return record
}

export function getRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

export function clearRecords() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

export function clearSampleRecords() {
  try {
    const existing = getRecords()
    const real = existing.filter(r => r.source !== 'sample')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(real))
    return real.length
  } catch { return 0 }
}

/** Insert fake/demo records to verify dashboard rendering */
export function addSampleRecords() {
  const now = Date.now()
  const samples = [
    { feature: FEATURES.DAILY_BRIEF, operation: 'generate-brief', model: 'claude-sonnet-4-6', inputChars: 8000, maxTokensOut: 2000, durationMs: 3200, success: true, source: 'sample', ts: new Date(now - 86400000 * 0.5).toISOString() },
    { feature: FEATURES.INTEL_LOG, operation: 'process-text', model: 'claude-haiku-4-5-20251001', inputChars: 12000, maxTokensOut: 3000, durationMs: 2100, success: true, source: 'sample', ts: new Date(now - 86400000 * 1).toISOString() },
    { feature: FEATURES.MEETING_PREP, operation: 'generate-prep', model: 'claude-sonnet-4-6', inputChars: 5000, maxTokensOut: 1500, durationMs: 4100, success: true, source: 'sample', ts: new Date(now - 86400000 * 2).toISOString() },
    { feature: FEATURES.WHITESPACE_UPLOAD, operation: 'extract-accounts', model: 'claude-haiku-4-5-20251001', inputChars: 20000, maxTokensOut: 3000, durationMs: 5500, success: true, source: 'sample', ts: new Date(now - 86400000 * 3).toISOString() },
    { feature: FEATURES.AI_CHAT, operation: 'chat-message', model: 'claude-sonnet-4-6', inputChars: 2000, maxTokensOut: 500, durationMs: 1200, success: true, source: 'sample', ts: new Date(now - 86400000 * 5).toISOString() },
    { feature: FEATURES.MARKET_INTEL, operation: 'summarize-articles', model: 'claude-haiku-4-5-20251001', inputChars: 6000, maxTokensOut: 800, durationMs: 1600, success: true, source: 'sample', ts: new Date(now - 86400000 * 10).toISOString() },
    { feature: FEATURES.TECH_STACK, operation: 'ai-ciso-recs', model: 'claude-sonnet-4-6', inputChars: 7000, maxTokensOut: 3000, durationMs: 6200, success: true, source: 'sample', ts: new Date(now - 86400000 * 14).toISOString() },
    { feature: FEATURES.WHITESPACE_TOOLS, operation: 'score-accounts', model: 'claude-sonnet-4-6', inputChars: 4000, maxTokensOut: 300, durationMs: 900, success: true, source: 'sample', ts: new Date(now - 86400000 * 20).toISOString() },
    { feature: FEATURES.INTEL_LOG, operation: 'process-pdf', model: 'claude-haiku-4-5-20251001', inputChars: 15000, maxTokensOut: 3000, durationMs: 4800, success: false, source: 'sample', ts: new Date(now - 86400000 * 25).toISOString() },
  ]

  const existing = getRecords()
  const newRecords = samples.map(s => {
    const m = s.model || DEFAULT_MODEL
    const inputTokensEst = Math.ceil((s.inputChars || 0) / 4)
    const outputTokensEst = s.maxTokensOut || 0
    const costEst = parseFloat(estimateCost(inputTokensEst, outputTokensEst, m).toFixed(6))
    return {
      id: `sample_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: s.ts,
      ts: s.ts,
      feature: s.feature,
      operation: s.operation,
      model: m,
      estimatedInputTokens: inputTokensEst,
      estimatedOutputTokens: outputTokensEst,
      estimatedCost: costEst,
      inputTokensEst,
      maxTokensOut: s.maxTokensOut || 0,
      costEst,
      durationMs: s.durationMs,
      success: s.success,
      cacheHit: false,
      status: s.success ? 'success' : 'error',
      source: 'sample',
      notes: 'SAMPLE_DATA',
    }
  })

  const updated = [...newRecords, ...existing].slice(0, MAX_RECORDS)
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) } catch {}
  return newRecords.length
}

/**
 * Compute aggregate stats from records.
 * @param {Array|null} records - if null, reads from localStorage
 * @param {number|null} windowMs - only include records newer than this (null = all)
 */
export function getStats(records = null, windowMs = null) {
  let data = records || getRecords()
  if (windowMs) {
    const cutoff = Date.now() - windowMs
    data = data.filter(r => new Date(r.ts || r.timestamp).getTime() >= cutoff)
  }
  if (!data.length) return {
    totalCalls: 0, totalInputTokens: 0, totalMaxOutputTokens: 0, totalCostEst: 0,
    byFeature: {}, topOps: [], duplicates: 0, cacheHits: 0, failures: 0,
    oldestRecord: null, newestRecord: null, recordCount: 0,
  }

  const byFeature = {}
  const byOp = {}
  let duplicates = 0, cacheHits = 0, failures = 0

  for (const r of data) {
    const cost = r.estimatedCost ?? r.costEst ?? 0
    const inTok = r.estimatedInputTokens ?? r.inputTokensEst ?? 0
    const outTok = r.estimatedOutputTokens ?? r.maxTokensOut ?? 0

    if (!byFeature[r.feature]) byFeature[r.feature] = { calls: 0, inputTokensEst: 0, maxOutputTokens: 0, costEst: 0, cacheHits: 0, failures: 0 }
    byFeature[r.feature].calls++
    byFeature[r.feature].inputTokensEst += inTok
    byFeature[r.feature].maxOutputTokens += outTok
    byFeature[r.feature].costEst += cost
    if (r.cacheHit) byFeature[r.feature].cacheHits++
    if (!r.success) byFeature[r.feature].failures++

    const opKey = `${r.feature}||${r.operation}`
    if (!byOp[opKey]) byOp[opKey] = { feature: r.feature, operation: r.operation, calls: 0, costEst: 0, inputTokensEst: 0, maxOutputTokens: 0 }
    byOp[opKey].calls++
    byOp[opKey].costEst += cost
    byOp[opKey].inputTokensEst += inTok
    byOp[opKey].maxOutputTokens += outTok

    if ((r.notes || '').includes('DUPLICATE_WARNING')) duplicates++
    if (r.cacheHit || r.status === 'cache_hit') cacheHits++
    if (!r.success && r.status !== 'cache_hit') failures++
  }

  const topOps = Object.values(byOp).sort((a, b) => b.costEst - a.costEst).slice(0, 10)
  const totalCost = parseFloat(data.reduce((s, r) => s + (r.estimatedCost ?? r.costEst ?? 0), 0).toFixed(6))

  return {
    totalCalls: data.length,
    totalInputTokens: data.reduce((s, r) => s + (r.estimatedInputTokens ?? r.inputTokensEst ?? 0), 0),
    totalMaxOutputTokens: data.reduce((s, r) => s + (r.estimatedOutputTokens ?? r.maxTokensOut ?? 0), 0),
    totalCostEst: totalCost,
    byFeature,
    topOps,
    duplicates,
    cacheHits,
    failures,
    cacheHitRate: data.length > 0 ? Math.round((cacheHits / data.length) * 100) : 0,
    oldestRecord: data[data.length - 1]?.ts || data[data.length - 1]?.timestamp || null,
    newestRecord: data[0]?.ts || data[0]?.timestamp || null,
    recordCount: data.length,
  }
}

/**
 * Merge AI usage records from two sources (localStorage + Supabase blob).
 * Deduplicates by id, sorts newest-first, caps to 90 days / 1000 entries.
 * Used in App.jsx applyLoad to keep the blob and localStorage in sync.
 */
export function mergeAIRecords(localRecords, blobRecords) {
  const seen = new Set()
  const combined = [...(localRecords || []), ...(blobRecords || [])]
  const deduped = []
  for (const r of combined) {
    const key = r.id || `${r.ts || r.timestamp || ''}|${r.feature || ''}|${r.operation || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(r)
  }
  deduped.sort((a, b) =>
    new Date(b.ts || b.timestamp || 0).getTime() - new Date(a.ts || a.timestamp || 0).getTime()
  )
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString()
  return deduped.filter(r => (r.ts || r.timestamp || '') >= cutoff).slice(0, 1000)
}
