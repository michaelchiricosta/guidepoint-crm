import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Trash2, RefreshCw } from 'lucide-react'
import { getRecords, getStats, clearRecords, AI_PRICING } from '../utils/aiTracker.js'

const TIME_WINDOWS = [
  { label: 'Last 24h',  ms: 86400000 },
  { label: 'Last 7d',   ms: 604800000 },
  { label: 'Last 30d',  ms: 2592000000 },
  { label: 'All time',  ms: null },
]

const FEATURE_COLORS = {
  'Daily Brief':       '#2563eb',
  'Meeting Prep':      '#7c3aed',
  'Journal':           '#0891b2',
  'Market Intel':      '#059669',
  'Whitespace Upload': '#dc2626',
  'AI Chat':           '#ea580c',
  'Tech Stack':        '#ca8a04',
  'Intel Log':         '#9333ea',
  'Account Health':    '#0f172a',
  'Whitespace Tools':  '#475569',
}

const OPTIMIZATIONS = [
  { label: 'Reduce max_tokens on extraction', detail: 'All whitespace upload calls use max_tokens=8000. Responses are typically 200–1000 tokens. Reducing to 2000 cuts billed ceiling by 75%.', severity: 'high', feature: 'Whitespace Upload' },
  { label: 'Cache Daily Brief by date', detail: 'If a brief was already generated today, skip regeneration. Check if data.dailyBriefs has today\'s date before calling Claude.', severity: 'high', feature: 'Daily Brief' },
  { label: 'Cache AI opportunity scores', detail: 'scoreOneAccount is called per-account on every scoreAll run. Cache by account ID + data hash so accounts not changed since last score are skipped.', severity: 'medium', feature: 'Whitespace Tools' },
  { label: 'Cache Meeting Prep by account + date', detail: 'Same account + same day should not regenerate. Add a generatedAt field and skip if already done today.', severity: 'medium', feature: 'Meeting Prep' },
  { label: 'Cache whitespace recommendations', detail: 'fetchRecommendations re-runs on every click. Cache results in data.whitespaceRecommendations with a generatedAt timestamp and skip if <24h old.', severity: 'medium', feature: 'Whitespace Tools' },
  { label: 'Chunk reduction for text uploads', detail: 'processIntel uses CHUNK=6000 chars. Reducing to 3000 halves chunk count and cost on large transcripts.', severity: 'medium', feature: 'Whitespace Upload' },
  { label: 'Prevent double-submit on uploads', detail: 'No guard against rapid re-click on processIntel/processFileIntel. A loading guard at the top of each function prevents duplicate API calls.', severity: 'medium', feature: 'Whitespace Upload' },
  { label: 'Reduce max_tokens on chat completions', detail: 'AI Chat and Daily Brief chat use max_tokens=500–2000. Chat responses are typically under 300 tokens. Setting 500–700 is more appropriate.', severity: 'low', feature: 'AI Chat' },
  { label: 'Intel Log caching by transcript hash', detail: 'IntelLog AI summarization could cache by content hash so re-opening the same transcript doesn\'t re-summarize.', severity: 'low', feature: 'Intel Log' },
]

const SEVERITY_COLORS = { high: '#dc2626', medium: '#ea580c', low: '#2563eb' }
const SEVERITY_BG     = { high: '#fef2f2', medium: '#fff7ed', low: '#eff6ff' }

export default function AIUsageDashboard({ onBack }) {
  const [windowIdx, setWindowIdx] = useState(1)
  const [stats, setStats] = useState(null)
  const [records, setRecords] = useState([])
  const [confirmClear, setConfirmClear] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  const refresh = useCallback(() => {
    const windowMs = TIME_WINDOWS[windowIdx].ms
    const recs = getRecords()
    setRecords(recs)
    setStats(getStats(null, windowMs))
  }, [windowIdx])

  useEffect(() => { refresh() }, [refresh])

  const handleClear = () => {
    clearRecords()
    setConfirmClear(false)
    setRecords([])
    setStats(getStats(null, TIME_WINDOWS[windowIdx].ms))
  }

  const fmt$ = v => v >= 0.01 ? `$${v.toFixed(2)}` : v > 0 ? `$${v.toFixed(4)}` : '$0.00'
  const fmtK = v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
  const fmtMs = ms => ms >= 60000 ? `${(ms / 60000).toFixed(1)}m` : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`

  const featureRows = stats ? Object.entries(stats.byFeature).sort((a, b) => b[1].costEst - a[1].costEst) : []
  const totalCalls = stats?.totalCalls || 0
  const totalCost = stats?.totalCostEst || 0
  const duplicates = stats?.duplicates || 0
  const recentRecords = records.slice(0, 30)

  const tab = (id, label) => (
    <button onClick={() => setActiveTab(id)} style={{
      padding: '8px 16px', border: 'none', background: activeTab === id ? '#0f172a' : 'transparent',
      color: activeTab === id ? '#fff' : '#64748b', borderRadius: 6, cursor: 'pointer',
      fontSize: 13, fontWeight: activeTab === id ? 600 : 500, transition: 'all 0.15s',
    }}>{label}</button>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F8FAFC', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '6px 10px', borderRadius: 6 }}
          onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>AI Usage Dashboard</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Estimated costs · {records.length} calls recorded · all costs use max_tokens ceiling (actual output ~20–40% of ceiling)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Time window selector */}
          <div style={{ display: 'flex', gap: 2, background: '#F1F5F9', borderRadius: 8, padding: 3 }}>
            {TIME_WINDOWS.map((w, i) => (
              <button key={i} onClick={() => setWindowIdx(i)} style={{
                padding: '5px 12px', border: 'none', background: windowIdx === i ? '#fff' : 'transparent',
                borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: windowIdx === i ? 600 : 400,
                color: windowIdx === i ? '#0f172a' : '#64748b', boxShadow: windowIdx === i ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}>{w.label}</button>
            ))}
          </div>
          <button onClick={refresh} title="Refresh" style={{ background: '#F1F5F9', border: 'none', borderRadius: 6, padding: '7px 10px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={14} />
          </button>
          {!confirmClear ? (
            <button onClick={() => setConfirmClear(true)} style={{ background: '#FEF2F2', border: 'none', borderRadius: 6, padding: '7px 12px', cursor: 'pointer', color: '#dc2626', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Trash2 size={13} /> Clear
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 500 }}>Confirm?</span>
              <button onClick={handleClear} style={{ background: '#dc2626', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 600 }}>Yes</button>
              <button onClick={() => setConfirmClear(false)} style={{ background: '#E5E7EB', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: '#374151', fontSize: 12 }}>No</button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '8px 28px', display: 'flex', gap: 4, flexShrink: 0 }}>
        {tab('overview', 'Overview')}
        {tab('byfeature', 'By Feature')}
        {tab('topops', 'Top Operations')}
        {tab('activity', 'Recent Activity')}
        {tab('optimize', 'Optimization Tips')}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
              {[
                { label: 'Total API Calls', value: totalCalls.toLocaleString(), color: '#2563eb', sub: TIME_WINDOWS[windowIdx].label },
                { label: 'Est. Total Cost', value: fmt$(totalCost), color: totalCost > 1 ? '#dc2626' : '#059669', sub: 'max_tokens ceiling' },
                { label: 'Duplicate Warnings', value: duplicates.toLocaleString(), color: duplicates > 0 ? '#ea580c' : '#64748b', sub: duplicates > 0 ? 'same op within 5s' : 'none detected' },
                { label: 'Records Stored', value: records.length.toLocaleString(), color: '#7c3aed', sub: `max 500 rolling` },
              ].map(card => (
                <div key={card.label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 20px' }}>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 8 }}>{card.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: card.color, lineHeight: 1 }}>{card.value}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Feature cost bars */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Cost by Feature ({TIME_WINDOWS[windowIdx].label})</div>
              {featureRows.length === 0 ? (
                <div style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No data for this time window. Use AI features to start tracking.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {featureRows.map(([feat, row]) => {
                    const pct = totalCost > 0 ? (row.costEst / totalCost) * 100 : 0
                    const color = FEATURE_COLORS[feat] || '#64748b'
                    return (
                      <div key={feat}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{feat}</span>
                          <span style={{ fontSize: 12, color: '#64748b' }}>{fmt$(row.costEst)} · {row.calls} call{row.calls !== 1 ? 's' : ''} · ~{fmtK(row.inputTokensEst)} in</span>
                        </div>
                        <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.max(pct, 1)}%`, background: color, borderRadius: 4, transition: 'width 0.3s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Pricing reference */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Anthropic Pricing Reference</div>
              <div style={{ display: 'flex', gap: 20 }}>
                {Object.entries(AI_PRICING).map(([model, p]) => (
                  <div key={model} style={{ background: '#F8FAFC', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>${p.inputPer1M}/M input · ${p.outputPer1M}/M output</div>
                    <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4, fontStyle: 'italic' }}>{model}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: '#94A3B8' }}>
                All output costs are estimated at max_tokens ceiling. Actual output tokens are typically 20–40% of ceiling, so real costs are lower. Input costs are accurate (4 chars ≈ 1 token).
              </div>
            </div>
          </div>
        )}

        {/* ── BY FEATURE ── */}
        {activeTab === 'byfeature' && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  {['Feature', 'Calls', 'Est. Input Tokens', 'Max Output Tokens', 'Est. Cost', '% of Total'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Feature' ? 'left' : 'right', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {featureRows.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No data for this time window.</td></tr>
                ) : featureRows.map(([feat, row], i) => (
                  <tr key={feat} style={{ borderBottom: i < featureRows.length - 1 ? '1px solid #F1F5F9' : 'none', background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                    <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: FEATURE_COLORS[feat] || '#64748b', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{feat}</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#374151' }}>{row.calls.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#374151' }}>{row.inputTokensEst.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#374151' }}>{row.maxOutputTokens.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: row.costEst > 0.5 ? '#dc2626' : '#374151' }}>{fmt$(row.costEst)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: '#64748b' }}>{totalCost > 0 ? `${((row.costEst / totalCost) * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
                {featureRows.length > 0 && (
                  <tr style={{ borderTop: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>TOTAL</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{totalCalls.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{(stats?.totalInputTokens || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{(stats?.totalMaxOutputTokens || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 14, fontWeight: 800, color: totalCost > 1 ? '#dc2626' : '#059669' }}>{fmt$(totalCost)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: '#64748b' }}>100%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── TOP OPERATIONS ── */}
        {activeTab === 'topops' && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Top 10 Most Expensive Operations</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Aggregated by feature + operation across all calls in window</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  {['#', 'Feature', 'Operation', 'Calls', 'Est. Input Tok', 'Est. Cost'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === '#' || h === 'Calls' || h.startsWith('Est') ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!stats?.topOps?.length ? (
                  <tr><td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No data for this time window.</td></tr>
                ) : stats.topOps.map((op, i) => (
                  <tr key={i} style={{ borderBottom: i < stats.topOps.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: '#94A3B8', fontWeight: 700 }}>#{i + 1}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: FEATURE_COLORS[op.feature] || '#64748b', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{op.feature}</span>
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: '#374151', fontFamily: 'monospace' }}>{op.operation}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: '#374151' }}>{op.calls}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: '#374151' }}>{op.inputTokensEst.toLocaleString()}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: op.costEst > 0.5 ? '#dc2626' : '#374151' }}>{fmt$(op.costEst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── RECENT ACTIVITY ── */}
        {activeTab === 'activity' && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Recent Activity <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 400 }}>(last 30 calls)</span></div>
            </div>
            {recentRecords.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No calls recorded yet. Start using AI features to see activity here.</div>
            ) : (
              <div>
                {recentRecords.map((r, i) => {
                  const isDup = (r.notes || '').includes('DUPLICATE_WARNING')
                  const model = AI_PRICING[r.model]?.label || r.model
                  const ts = new Date(r.ts)
                  const timeStr = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                  const dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  return (
                    <div key={r.id} style={{ padding: '12px 20px', borderBottom: i < recentRecords.length - 1 ? '1px solid #F1F5F9' : 'none', display: 'flex', alignItems: 'center', gap: 14, background: isDup ? '#FFF7ED' : 'transparent' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: FEATURE_COLORS[r.feature] || '#64748b', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{r.feature}</span>
                          <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{r.operation}</span>
                          {isDup && <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>DUP</span>}
                          {!r.success && <span style={{ fontSize: 10, background: '#FEF2F2', color: '#dc2626', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>FAILED</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                          {model} · ~{r.inputTokensEst?.toLocaleString()} in · max_out={r.maxTokensOut} · {fmtMs(r.durationMs || 0)}
                          {r.notes && !isDup ? ` · ${r.notes}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: (r.costEst || 0) > 0.1 ? '#dc2626' : '#374151' }}>{fmt$(r.costEst || 0)}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>{dateStr} {timeStr}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── OPTIMIZATION TIPS ── */}
        {activeTab === 'optimize' && (
          <div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: '#1D4ED8' }}>
              These are identified optimization opportunities. Each one reduces API cost or prevents unnecessary calls. Implement in priority order (High → Medium → Low) after collecting baseline data.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {OPTIMIZATIONS.map((opt, i) => (
                <div key={i} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, marginTop: 2, padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: SEVERITY_BG[opt.severity], color: SEVERITY_COLORS[opt.severity], textTransform: 'uppercase' }}>{opt.severity}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{opt.detail}</div>
                    <div style={{ marginTop: 6, fontSize: 11, color: '#94A3B8' }}>Affects: <strong style={{ color: FEATURE_COLORS[opt.feature] || '#64748b' }}>{opt.feature}</strong></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
