import { useState, useEffect, useCallback } from 'react'
import { getRecords, clearRecords, clearSampleRecords, addSampleRecords, getStats, AI_PRICING } from '../utils/aiTracker.js'
import { callAI, AI_MODELS, checkBudget, DEFAULT_AI_SETTINGS } from '../utils/aiHelper.js'

const TIME_WINDOWS = [
  { label: 'Last 7 days',   ms: 7 * 86400000,  key: '7d' },
  { label: 'Last 30 days',  ms: 30 * 86400000, key: '30d' },
  { label: 'This month',    ms: null,           key: 'month' },
  { label: 'All time',      ms: null,           key: 'all' },
]

function getWindowMs(key) {
  if (key === 'month') {
    const now = new Date()
    return Date.now() - new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  }
  if (key === 'all') return null
  const w = TIME_WINDOWS.find(x => x.key === key)
  return w?.ms ?? null
}

const tabBtn = (active) => ({
  padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  background: active ? '#2563eb' : 'transparent', color: active ? '#fff' : '#64748b', transition: 'all 0.15s',
})
const card = { background: '#fff', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 0 }
const pill = (color) => ({ display: 'inline-block', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: color + '22', color, letterSpacing: 0.2 })

function fmtCost(n) { return `$${(n || 0).toFixed(4)}` }
function fmtK(n) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n) }
function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const MODEL_LABELS = {
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
  'claude-opus-4-8': 'Opus 4.8',
}

export default function AIUsageDashboard({ onBack, apiKey, data, setData }) {
  const [tab, setTab] = useState('overview')
  const [windowKey, setWindowKey] = useState('30d')
  const [records, setRecords] = useState([])
  const [featureFilter, setFeatureFilter] = useState('all')
  const [modelFilter, setModelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [testStatus, setTestStatus] = useState(null)
  const [testMsg, setTestMsg] = useState('')
  const [sampleMsg, setSampleMsg] = useState('')

  const reload = useCallback(() => setRecords(getRecords()), [])
  useEffect(() => { reload() }, [reload])

  const windowMs = getWindowMs(windowKey)
  const windowRecs = windowMs ? records.filter(r => (Date.now() - new Date(r.ts || r.timestamp).getTime()) <= windowMs) : records

  const filtered = windowRecs.filter(r => {
    if (featureFilter !== 'all' && r.feature !== featureFilter) return false
    if (modelFilter !== 'all' && r.model !== modelFilter) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    return true
  })

  const stats = getStats(filtered)
  const allStats = getStats(records)
  const budget = checkBudget(data)

  const allFeatures = [...new Set(records.map(r => r.feature))].sort()
  const allModels = [...new Set(records.map(r => r.model).filter(Boolean))].sort()

  async function runTest() {
    if (!apiKey) { setTestStatus('error'); setTestMsg('No API key set. Add it in Settings.'); return }
    setTestStatus('running'); setTestMsg('Calling Anthropic API…')
    try {
      const result = await callAI({
        feature: 'Test', operation: 'dashboard-test', model: AI_MODELS.cheap,
        system: 'You are a test assistant.',
        messages: [{ role: 'user', content: 'Reply with valid JSON: {"ok":true,"test":"ai-usage"}' }],
        maxTokens: 64, apiKey, data, setData,
      })
      setTestStatus('ok')
      setTestMsg(`Success! Response: ${result.text.slice(0, 120)}`)
      reload()
    } catch (e) {
      setTestStatus('error')
      setTestMsg(`Error: ${e.message}`)
      reload()
    }
  }

  function addSample() {
    const n = addSampleRecords()
    reload()
    setSampleMsg(`Added ${n} sample records.`)
    setTimeout(() => setSampleMsg(''), 3000)
  }

  function clearSample() {
    clearSampleRecords()
    reload()
    setSampleMsg('Sample records cleared.')
    setTimeout(() => setSampleMsg(''), 3000)
  }

  function clearAll() {
    if (!window.confirm('Clear ALL usage logs? This cannot be undone.')) return
    clearRecords()
    reload()
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'features', label: 'By Feature' },
    { key: 'activity', label: 'Activity' },
    { key: 'failed', label: `Failed (${allStats.failures})` },
    { key: 'devtest', label: 'Dev / Test' },
  ]

  const budgetPct = budget.pct
  const budgetColor = budgetPct >= 95 ? '#dc2626' : budgetPct >= 70 ? '#d97706' : '#16a34a'

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 48px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>←</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>AI Usage</h2>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
            Costs estimated from tracked app calls — may not match Claude Console exactly.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {TIME_WINDOWS.map(w => (
          <button key={w.key} onClick={() => setWindowKey(w.key)} style={tabBtn(windowKey === w.key)}>{w.label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Est. Cost', value: fmtCost(stats.totalCostEst), sub: `of $${budget.budget} budget` },
          { label: 'Total Calls', value: stats.totalCalls.toLocaleString() },
          { label: 'Cache Hits', value: `${stats.cacheHits} (${stats.cacheHitRate}%)` },
          { label: 'Failures', value: stats.failures, hi: stats.failures > 0 },
          { label: 'Records Stored', value: `${allStats.recordCount} / 500` },
        ].map(c => (
          <div key={c.label} style={{ ...card, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.hi ? '#dc2626' : '#1e293b' }}>{c.value}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{c.label}</div>
            {c.sub && <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Monthly Budget</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: budgetColor }}>${budget.spend.toFixed(4)} / ${budget.budget}</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: '#e2e8f0', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(budgetPct, 100)}%`, background: budgetColor, borderRadius: 4, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
          {budgetPct.toFixed(1)}% used this month (sample records excluded)
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Filter:</span>
        <select value={featureFilter} onChange={e => setFeatureFilter(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
          <option value="all">All Features</option>
          {allFeatures.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={modelFilter} onChange={e => setModelFilter(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
          <option value="all">All Models</option>
          {allModels.map(m => <option key={m} value={m}>{MODEL_LABELS[m] || m}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
          <option value="all">All Statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="cache_hit">Cache Hit</option>
        </select>
        {(featureFilter !== 'all' || modelFilter !== 'all' || statusFilter !== 'all') && (
          <button onClick={() => { setFeatureFilter('all'); setModelFilter('all'); setStatusFilter('all') }} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear filters</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 8, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabBtn(tab === t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          {stats.totalCalls === 0 ? <EmptyState /> : (
            <div>
              <BarChart byFeature={stats.byFeature} />
              <TopOps topOps={stats.topOps} />
            </div>
          )}
        </div>
      )}

      {tab === 'features' && (
        <div>
          {Object.keys(stats.byFeature).length === 0 ? <EmptyState /> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  {['Feature', 'Calls', 'Cache Hits', 'Failures', 'Input Tokens', 'Est. Cost'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Feature' ? 'left' : 'right', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.byFeature).sort((a, b) => b[1].costEst - a[1].costEst).map(([feat, s]) => (
                  <tr key={feat} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 600, color: '#1e293b' }}>{feat}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{s.calls}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{s.cacheHits}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: s.failures > 0 ? '#dc2626' : '#374151' }}>{s.failures}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{fmtK(s.inputTokensEst)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{fmtCost(s.costEst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div>
          {filtered.length === 0 ? <EmptyState /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.slice(0, 100).map(r => <ActivityRow key={r.id} r={r} />)}
              {filtered.length > 100 && <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 8 }}>Showing 100 of {filtered.length} records</div>}
            </div>
          )}
        </div>
      )}

      {tab === 'failed' && (() => {
        const failed = filtered.filter(r => !r.success && r.status !== 'cache_hit')
        if (failed.length === 0) return <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>No failed calls in this time window.</div>
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {failed.map(r => <ActivityRow key={r.id} r={r} />)}
          </div>
        )
      })()}

      {tab === 'devtest' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ ...card, borderLeft: '3px solid #2563eb' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 6 }}>Run AI Usage Test</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>Makes a real minimal Anthropic API call and logs it to usage records.</div>
            <button onClick={runTest} disabled={testStatus === 'running'} style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: testStatus === 'running' ? 'not-allowed' : 'pointer', opacity: testStatus === 'running' ? 0.7 : 1 }}>
              {testStatus === 'running' ? 'Running…' : 'Run AI Usage Test'}
            </button>
            {testMsg && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: testStatus === 'ok' ? '#dcfce7' : testStatus === 'error' ? '#fee2e2' : '#f1f5f9', color: testStatus === 'ok' ? '#166534' : testStatus === 'error' ? '#991b1b' : '#374151', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-word' }}>
                {testMsg}
              </div>
            )}
          </div>

          <div style={{ ...card, borderLeft: '3px solid #7c3aed' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 6 }}>Sample Data</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>Add fake records to verify dashboard charts and filters render correctly. Sample records are excluded from budget calculations.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={addSample} style={{ padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Add Sample Records</button>
              <button onClick={clearSample} style={{ padding: '8px 16px', background: 'transparent', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Clear Sample Records</button>
            </div>
            {sampleMsg && <div style={{ marginTop: 8, fontSize: 12, color: '#6d28d9' }}>{sampleMsg}</div>}
          </div>

          <div style={{ ...card, borderLeft: '3px solid #dc2626' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 6 }}>Clear All Logs</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>Permanently deletes all usage records including real API call history.</div>
            <button onClick={clearAll} style={{ padding: '8px 16px', background: 'transparent', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Clear All Usage Logs</button>
          </div>

          <div style={{ ...card, background: '#f8fafc' }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#475569', marginBottom: 6 }}>Tracking Info</div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
              Tracking begins once this feature is enabled. Historical Claude Console usage is not imported.<br/>
              Costs are estimated from token counts. Actual Claude Console billing may differ slightly.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 24px', color: '#94a3b8' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>No AI usage has been tracked yet</div>
      <div style={{ fontSize: 13, maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
        Usage tracking starts from the date this feature was added.<br/>
        Historical Claude Console usage is not imported.
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>Use the Dev / Test tab to add sample records or run a live test.</div>
    </div>
  )
}

function BarChart({ byFeature }) {
  const entries = Object.entries(byFeature).sort((a, b) => b[1].costEst - a[1].costEst)
  const maxCost = Math.max(...entries.map(e => e[1].costEst), 0.0001)
  const colors = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#db2777']
  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 12 }}>Cost by Feature</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(([feat, s], i) => (
          <div key={feat}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: '#374151', fontWeight: 600 }}>{feat}</span>
              <span style={{ color: '#64748b' }}>{fmtCost(s.costEst)} · {s.calls} calls</span>
            </div>
            <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(s.costEst / maxCost) * 100}%`, background: colors[i % colors.length], borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopOps({ topOps }) {
  if (!topOps?.length) return null
  return (
    <div style={card}>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 10 }}>Top Operations by Cost</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            {['Feature', 'Operation', 'Calls', 'Est. Cost'].map(h => (
              <th key={h} style={{ textAlign: h === 'Feature' || h === 'Operation' ? 'left' : 'right', padding: '4px 8px', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topOps.map((op, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
              <td style={{ padding: '5px 8px', color: '#475569' }}>{op.feature}</td>
              <td style={{ padding: '5px 8px', color: '#1e293b', fontFamily: 'monospace', fontSize: 11 }}>{op.operation}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: '#64748b' }}>{op.calls}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>{fmtCost(op.costEst)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ActivityRow({ r }) {
  const isSample = r.source === 'sample'
  const isFailed = !r.success && r.status !== 'cache_hit'
  const isCache = r.cacheHit || r.status === 'cache_hit'
  const cost = r.estimatedCost ?? r.costEst ?? 0
  const inTok = r.estimatedInputTokens ?? r.inputTokensEst ?? 0
  const outTok = r.estimatedOutputTokens ?? r.maxTokensOut ?? 0

  return (
    <div style={{ ...card, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, background: isFailed ? '#fff5f5' : '#fff' }}>
      <div style={{ fontSize: 16, lineHeight: 1, marginTop: 2 }}>{isFailed ? '✗' : isCache ? '⚡' : '✓'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{r.feature}</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>›</span>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{r.operation}</span>
          {isSample && <span style={{ ...pill('#7c3aed'), fontSize: 10 }}>SAMPLE</span>}
          {isFailed && <span style={{ ...pill('#dc2626'), fontSize: 10 }}>FAILED</span>}
          {isCache && <span style={{ ...pill('#0891b2'), fontSize: 10 }}>CACHE</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#64748b' }}>
          <span>{MODEL_LABELS[r.model] || r.model || '—'}</span>
          <span>{fmtK(inTok)} in · {fmtK(outTok)} out</span>
          {!isCache && <span style={{ fontWeight: 600, color: '#374151' }}>{fmtCost(cost)}</span>}
          {r.durationMs > 0 && <span>{r.durationMs}ms</span>}
          <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>{fmtDate(r.ts || r.timestamp)}</span>
        </div>
        {r.errorMessage && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>{r.errorMessage}</div>}
      </div>
    </div>
  )
}
