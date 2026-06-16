// ─── Ledgr AI Usage Tracker ──────────────────────────────────────────────────
// Persists every Anthropic API call to localStorage for cost analysis.
// All cost estimates use max_tokens ceiling — actual output is ~20-40% of ceiling.
//
// TODO (future optimizations to implement after baseline data is collected):
//   1. Cache Daily Brief — if brief already generated today, don't regenerate
//   2. Cache Account Health analysis — hash account state, skip if unchanged
//   3. Cache whitespace recommendations — only regenerate if whitespace accounts changed
//   4. Cache AI opportunity scores — only rescore if account data changed since last score
//   5. Deduplicate chat messages — skip send if same content submitted within 2s (double-click)
//   6. Reduce max_tokens on extraction calls: 8000 → 2000 (responses never approach 8k)
//   7. Intel Log summarization — cache by transcript content hash
//   8. Meeting Prep — cache by account+date key, invalidate on new intel only
//   9. PDF fallback dedup — only invoke PDF.js if direct PDF truly fails (not parse error)
//  10. Chunk optimization — reduce CHUNK from 6000 → 3000 chars for cheaper extraction
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ledgr_ai_usage_v1'
const MAX_RECORDS = 500
const DUPLICATE_WINDOW_MS = 5000

// Anthropic pricing per million tokens (update when Anthropic changes rates)
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
  JOURNAL:           'Journal',
  MARKET_INTEL:      'Market Intel',
  WHITESPACE_UPLOAD: 'Whitespace Upload',
  AI_CHAT:           'AI Chat',
  TECH_STACK:        'Tech Stack',
  INTEL_LOG:         'Intel Log',
  ACCOUNT_HEALTH:    'Account Health',
  WHITESPACE_TOOLS:  'Whitespace Tools',  // scoring, recommendations, notes clean
}

export function estimateCost(inputTokens, maxOutputTokens, model = DEFAULT_MODEL) {
  const p = AI_PRICING[model] || AI_PRICING[DEFAULT_MODEL]
  return (inputTokens / 1e6 * p.inputPer1M) + (maxOutputTokens / 1e6 * p.outputPer1M)
}

/**
 * Record one Anthropic API call.
 * @param {object} opts
 * @param {string}  opts.feature      - Feature name (use FEATURES constant)
 * @param {string}  opts.operation    - Short operation name e.g. 'generate-brief'
 * @param {string}  [opts.model]      - Model ID (defaults to claude-sonnet-4-6)
 * @param {number}  opts.inputChars   - Total char count of all input strings (sys + user)
 * @param {number}  opts.maxTokensOut - max_tokens value sent to API
 * @param {number}  [opts.durationMs] - Wall-clock time for the call
 * @param {boolean} [opts.success]    - Whether the call succeeded
 * @param {string}  [opts.notes]      - Any notes (e.g. 'chunk 3/7', 'fix-json')
 */
export function trackAI({ feature, operation, model, inputChars, maxTokensOut, durationMs = 0, success = true, notes = '' }) {
  const m = model || DEFAULT_MODEL
  const inputTokensEst = Math.ceil((inputChars || 0) / 4)
  const costEst = parseFloat(estimateCost(inputTokensEst, maxTokensOut || 0, m).toFixed(6))

  const record = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    feature: feature || 'Unknown',
    operation: operation || 'unknown',
    model: m,
    inputTokensEst,
    maxTokensOut: maxTokensOut || 0,
    costEst,
    durationMs,
    success,
    notes,
  }

  const existing = getRecords()

  // Duplicate detection: same feature+operation within DUPLICATE_WINDOW_MS
  const isDup = existing.slice(0, 15).some(r =>
    r.feature === record.feature &&
    r.operation === record.operation &&
    (Date.now() - new Date(r.ts).getTime()) < DUPLICATE_WINDOW_MS
  )
  if (isDup) {
    record.notes = [record.notes, 'DUPLICATE_WARNING'].filter(Boolean).join(' | ')
    console.warn(`[AI Tracker] ⚠ Possible duplicate: ${feature} › ${operation} called again within ${DUPLICATE_WINDOW_MS / 1000}s`)
  }

  const updated = [record, ...existing].slice(0, MAX_RECORDS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...existing].slice(0, 100))) } catch {}
  }

  const p = AI_PRICING[m] || AI_PRICING[DEFAULT_MODEL]
  console.log(
    `[AI Tracker] ${feature} › ${operation} | ${p.label} | ~${inputTokensEst.toLocaleString()} in | max_out=${maxTokensOut} | $${costEst.toFixed(4)} | ${durationMs}ms${isDup ? ' ⚠DUP' : ''}${notes ? ' | ' + notes : ''}`
  )
  return record
}

export function getRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

export function clearRecords() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

/**
 * Compute aggregate stats from a list of records.
 * @param {Array|null} records - if null, reads from localStorage
 * @param {number|null} windowMs - only include records newer than this many ms ago (null = all)
 */
export function getStats(records = null, windowMs = null) {
  let data = records || getRecords()
  if (windowMs) {
    const cutoff = Date.now() - windowMs
    data = data.filter(r => new Date(r.ts).getTime() >= cutoff)
  }
  if (!data.length) return {
    totalCalls: 0, totalInputTokens: 0, totalMaxOutputTokens: 0, totalCostEst: 0,
    byFeature: {}, topOps: [], duplicates: 0, oldestRecord: null, newestRecord: null,
  }

  const byFeature = {}
  const byOp = {}
  let duplicates = 0

  for (const r of data) {
    if (!byFeature[r.feature]) byFeature[r.feature] = { calls: 0, inputTokensEst: 0, maxOutputTokens: 0, costEst: 0 }
    byFeature[r.feature].calls++
    byFeature[r.feature].inputTokensEst += r.inputTokensEst || 0
    byFeature[r.feature].maxOutputTokens += r.maxTokensOut || 0
    byFeature[r.feature].costEst += r.costEst || 0

    const opKey = `${r.feature}||${r.operation}`
    if (!byOp[opKey]) byOp[opKey] = { feature: r.feature, operation: r.operation, calls: 0, costEst: 0, inputTokensEst: 0, maxOutputTokens: 0 }
    byOp[opKey].calls++
    byOp[opKey].costEst += r.costEst || 0
    byOp[opKey].inputTokensEst += r.inputTokensEst || 0
    byOp[opKey].maxOutputTokens += r.maxTokensOut || 0

    if ((r.notes || '').includes('DUPLICATE_WARNING')) duplicates++
  }

  const topOps = Object.values(byOp).sort((a, b) => b.costEst - a.costEst).slice(0, 10)

  return {
    totalCalls: data.length,
    totalInputTokens: data.reduce((s, r) => s + (r.inputTokensEst || 0), 0),
    totalMaxOutputTokens: data.reduce((s, r) => s + (r.maxTokensOut || 0), 0),
    totalCostEst: parseFloat(data.reduce((s, r) => s + (r.costEst || 0), 0).toFixed(4)),
    byFeature,
    topOps,
    duplicates,
    oldestRecord: data[data.length - 1]?.ts || null,
    newestRecord: data[0]?.ts || null,
    recordCount: data.length,
  }
}
