// src/components/WaveReviewPage.jsx
//
// Review page for Wave call recordings.
// Shows recent sessions, the cron's auto-match, and lets Mike override
// the account assignment before clicking Proceed.
//
// Wire into App.jsx:
//   import WaveReviewPage from './components/WaveReviewPage.jsx'
//   const [showWaveReview, setShowWaveReview] = useState(false)
//   if (showWaveReview) return (
//     <><WaveReviewPage data={data} setData={setData}
//         onBack={() => { setShowWaveReview(false); setIsLandingPage(true) }} />
//       <MaggieChatPanel ... /></>
//   )
//
// Add to LandingPage nav (LandingPageSidebar items array):
//   { id:'wavereview', label:'Wave Review', icon:<Radio size={18}/>, action:()=>onGoWaveReview&&onGoWaveReview() }
// And pass onGoWaveReview prop through LandingPage to LandingPageSidebar.

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, CheckCircle2, Clock, AlertCircle, Sparkles, SkipForward, RefreshCw, Radio, ChevronDown } from 'lucide-react'
import { supabase } from '../supabase.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDur(secs) {
  if (!secs) return ''
  const m = Math.round(secs / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function ConfidenceBadge({ confidence }) {
  const map = {
    high:      { bg: '#dcfce7', color: '#15803d', label: 'High match' },
    medium:    { bg: '#fef9c3', color: '#a16207', label: 'Medium match' },
    low:       { bg: '#fee2e2', color: '#b91c1c', label: 'Low match' },
    unmatched: { bg: '#f3f4f6', color: '#6b7280', label: 'No match' },
  }
  const s = map[confidence] || map.unmatched
  return (
    <span style={{ fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WaveReviewPage({ data, setData, onBack }) {
  const [sessions,    setSessions]    = useState([])
  const [appliedMap,  setAppliedMap]  = useState({})   // session_id → row
  const [analyses,    setAnalyses]    = useState({})   // session_id → { recommendation, confidence, ... }
  const [overrides,   setOverrides]   = useState({})   // session_id → account_id
  const [analyzing,   setAnalyzing]   = useState({})
  const [applying,    setApplying]    = useState({})
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [filter,      setFilter]      = useState('all') // all | pending | applied | skipped
  const [toast,       setToast]       = useState(null)

  const accounts = data?.accounts || []

  // ── Load sessions + applied state ─────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Last 30 days from Wave
      const since = new Date()
      since.setDate(since.getDate() - 30)

      const waveRes = await fetch('/api/wave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', since: since.toISOString() })
      })
      const waveData = await waveRes.json()
      if (!waveData.ok) throw new Error(waveData.error || 'Failed to fetch sessions from Wave')

      const sorted = [...(waveData.sessions || [])].sort(
        (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
      )
      setSessions(sorted)

      // Fetch applied status for all sessions
      if (sorted.length > 0) {
        const { data: applied } = await supabase
          .from('wave_applied_sessions')
          .select('session_id, account_name, account_id, applied_at, source')
          .in('session_id', sorted.map(s => s.id))

        const map = {}
        for (const row of applied || []) map[row.session_id] = row
        setAppliedMap(map)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Analyze a single session ───────────────────────────────────────────────

  async function analyzeSession(session) {
    setAnalyzing(p => ({ ...p, [session.id]: true }))
    try {
      const res = await fetch('/api/wave-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:        'analyze',
          session_id:    session.id,
          session_title: session.title,
          session_date:  session.date?.split('T')[0],
          account_names: accounts.map(a => a.name)
        })
      })
      const result = await res.json()
      if (!result.ok) throw new Error(result.error || 'Analysis failed')
      setAnalyses(p => ({ ...p, [session.id]: result }))

      // Pre-select the recommended account
      if (result.recommendation) {
        const match = accounts.find(a => a.name === result.recommendation)
        if (match) setOverrides(p => ({ ...p, [session.id]: match.id }))
      }
    } catch (err) {
      setAnalyses(p => ({ ...p, [session.id]: { error: err.message } }))
    } finally {
      setAnalyzing(p => ({ ...p, [session.id]: false }))
    }
  }

  // ── Apply session to account ───────────────────────────────────────────────

  async function applySession(session) {
    const analysis   = analyses[session.id]
    const accountId  = overrides[session.id] ||
      accounts.find(a => a.name === analysis?.recommendation)?.id

    if (!accountId) { showToast('Select an account first', 'error'); return }

    setApplying(p => ({ ...p, [session.id]: true }))
    try {
      const res = await fetch('/api/wave-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:        'apply',
          session_id:    session.id,
          account_id:    accountId,
          session_title: session.title,
          session_date:  session.date?.split('T')[0],
          intel_summary: analysis?.intel_summary || '',
          action_items:  analysis?.action_items  || []
        })
      })
      const result = await res.json()
      if (!result.ok) throw new Error(result.error || 'Apply failed')

      // Update local state
      setAppliedMap(p => ({
        ...p,
        [session.id]: { account_name: result.account_name, applied_at: new Date().toISOString(), source: 'manual' }
      }))
      if (result.updatedAccount) {
        setData(prev => ({
          ...prev,
          accounts: prev.accounts.map(a => a.id === accountId ? result.updatedAccount : a)
        }))
      }
      showToast(`Applied to ${result.account_name} — ${result.follow_ups} follow-up(s) added`)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setApplying(p => ({ ...p, [session.id]: false }))
    }
  }

  // ── Skip session ───────────────────────────────────────────────────────────

  async function skipSession(session) {
    try {
      await supabase
        .from('wave_applied_sessions')
        .upsert(
          { session_id: session.id, account_name: null, source: 'skipped' },
          { onConflict: 'session_id', ignoreDuplicates: false }
        )
      setAppliedMap(p => ({ ...p, [session.id]: { source: 'skipped', applied_at: new Date().toISOString() } }))
    } catch (err) {
      showToast('Skip failed', 'error')
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const pendingCount  = sessions.filter(s => !appliedMap[s.id]).length
  const appliedCount  = sessions.filter(s => appliedMap[s.id]?.source !== 'skipped' && !!appliedMap[s.id]).length
  const skippedCount  = sessions.filter(s => appliedMap[s.id]?.source === 'skipped').length

  const filtered = sessions.filter(s => {
    const row = appliedMap[s.id]
    if (filter === 'pending')  return !row
    if (filter === 'applied')  return row && row.source !== 'skipped'
    if (filter === 'skipped')  return row?.source === 'skipped'
    return true
  })

  // ── Styles ─────────────────────────────────────────────────────────────────

  const C = {
    bg:     '#F9FAFB',
    surf:   '#FFFFFF',
    bdr:    '#EEEFF2',
    txt:    '#111827',
    muted:  '#6B7280',
    blue:   '#007AFF',
    green:  '#15803d',
    pill:   { fontSize: 12, fontWeight: 600, borderRadius: 6, padding: '4px 12px', cursor: 'pointer', border: '1px solid' },
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: C.surf, borderBottom: `1px solid ${C.bdr}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <button onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0 }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ width: 1, height: 18, background: C.bdr }} />
        <Radio size={18} color={C.blue} />
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.txt, lineHeight: 1.2 }}>Wave Review</div>
          <div style={{ fontSize: 12, color: C.muted }}>Last 30 days · {sessions.length} recording{sessions.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={loadAll} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: `1px solid ${C.bdr}`, borderRadius: 7, color: C.muted, fontSize: 12, fontWeight: 500, padding: '6px 12px', cursor: 'pointer' }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ background: C.surf, borderBottom: `1px solid ${C.bdr}`, padding: '0 24px', display: 'flex', gap: 0, flexShrink: 0 }}>
        {[
          { id: 'all',     label: `All (${sessions.length})` },
          { id: 'pending', label: `Pending (${pendingCount})`, dot: pendingCount > 0 },
          { id: 'applied', label: `Applied (${appliedCount})` },
          { id: 'skipped', label: `Skipped (${skippedCount})` },
        ].map(tab => (
          <button key={tab.id} onClick={() => setFilter(tab.id)}
            style={{ padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: filter === tab.id ? C.blue : C.muted, borderBottom: filter === tab.id ? `2px solid ${C.blue}` : '2px solid transparent', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', transition: 'color 0.15s' }}>
            {tab.label}
            {tab.dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '20px 24px', maxWidth: 860, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted, fontSize: 14 }}>
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
            <div>Loading recordings…</div>
          </div>
        )}

        {error && !loading && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 16, color: '#dc2626', fontSize: 13 }}>
            <strong>Error:</strong> {error}
            <button onClick={loadAll} style={{ marginLeft: 12, fontSize: 12, color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted }}>
            <CheckCircle2 size={32} color="#d1d5db" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {filter === 'pending' ? 'All recordings are accounted for.' : 'No recordings here.'}
            </div>
          </div>
        )}

        {!loading && filtered.map(session => {
          const applied  = appliedMap[session.id]
          const analysis = analyses[session.id]
          const isApplied  = !!applied && applied.source !== 'skipped'
          const isSkipped  = applied?.source === 'skipped'
          const isPending  = !applied
          const isAnalyzing = !!analyzing[session.id]
          const isApplying  = !!applying[session.id]

          const selectedId = overrides[session.id] ||
            (analysis?.recommendation ? accounts.find(a => a.name === analysis.recommendation)?.id : '')

          return (
            <div key={session.id} style={{
              background: C.surf,
              border: `1px solid ${C.bdr}`,
              borderRadius: 12,
              padding: '16px 20px',
              marginBottom: 12,
              opacity: isSkipped ? 0.55 : 1,
              transition: 'opacity 0.2s'
            }}>
              {/* Row 1: title + date + duration + status */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.txt, lineHeight: 1.3, marginBottom: 2 }}>
                    {session.title}
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 12, color: C.muted }}>
                    <span>{fmtDate(session.date)}</span>
                    {session.duration && <span>· {fmtDur(session.duration)}</span>}
                  </div>
                </div>

                {/* Status chip */}
                {isApplied && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#15803d', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <CheckCircle2 size={11} /> Applied → {applied.account_name || 'Unknown'}
                  </span>
                )}
                {isSkipped && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: '#f3f4f6', color: C.muted, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    Skipped
                  </span>
                )}
                {isPending && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#b45309', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <Clock size={11} /> Pending
                  </span>
                )}
              </div>

              {/* Analysis section (pending only) */}
              {isPending && !analysis && !isAnalyzing && (
                <button onClick={() => analyzeSession(session)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: C.blue, background: '#eff6ff', border: `1px solid #bfdbfe`, borderRadius: 7, padding: '6px 14px', cursor: 'pointer', marginTop: 4 }}>
                  <Sparkles size={13} /> Analyze with AI
                </button>
              )}

              {isPending && isAnalyzing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted, marginTop: 4 }}>
                  <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing…
                </div>
              )}

              {isPending && analysis?.error && (
                <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
                  <AlertCircle size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {analysis.error}
                </div>
              )}

              {isPending && analysis && !analysis.error && (
                <div style={{ marginTop: 10 }}>
                  {/* AI summary */}
                  {analysis.intel_summary && (
                    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.55, marginBottom: 12, padding: '10px 14px', background: '#f9fafb', borderRadius: 8, border: `1px solid ${C.bdr}` }}>
                      {analysis.intel_summary}
                    </div>
                  )}

                  {analysis.note && !analysis.intel_summary && (
                    <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', marginBottom: 12 }}>
                      {analysis.note}
                    </div>
                  )}

                  {/* Action items preview */}
                  {analysis.action_items?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                        Follow-ups ({analysis.action_items.length})
                      </div>
                      {analysis.action_items.slice(0, 3).map((ai, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#374151', padding: '3px 0 3px 10px', borderLeft: '2px solid #dbeafe' }}>
                          {ai.task}{ai.due_date ? <span style={{ color: C.muted }}> · {ai.due_date}</span> : ''}
                        </div>
                      ))}
                      {analysis.action_items.length > 3 && (
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>+{analysis.action_items.length - 3} more</div>
                      )}
                    </div>
                  )}

                  {/* Account selector + proceed */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {analysis.recommendation && (
                        <ConfidenceBadge confidence={analysis.confidence} />
                      )}
                      <div style={{ position: 'relative' }}>
                        <select
                          value={selectedId}
                          onChange={e => setOverrides(p => ({ ...p, [session.id]: e.target.value }))}
                          style={{ fontSize: 13, fontWeight: 600, color: C.txt, background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 7, padding: '7px 28px 7px 10px', cursor: 'pointer', appearance: 'none', minWidth: 180 }}>
                          <option value="">Select account…</option>
                          {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.muted }} />
                      </div>
                    </div>

                    <button
                      onClick={() => applySession(session)}
                      disabled={isApplying || !selectedId}
                      style={{ fontSize: 13, fontWeight: 700, background: selectedId ? C.blue : '#d1d5db', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 18px', cursor: selectedId ? 'pointer' : 'not-allowed', flexShrink: 0, opacity: isApplying ? 0.7 : 1 }}>
                      {isApplying ? 'Applying…' : 'Apply'}
                    </button>

                    <button onClick={() => skipSession(session)}
                      style={{ fontSize: 12, fontWeight: 500, background: 'transparent', border: `1px solid ${C.bdr}`, borderRadius: 7, color: C.muted, padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <SkipForward size={12} /> Skip
                    </button>
                  </div>
                </div>
              )}

              {/* Applied session: show match + override option */}
              {isApplied && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>
                    {applied.source === 'cron' ? 'Auto-matched by Wave cron' : 'Manually applied'} · {fmtDate(applied.applied_at)}
                  </span>
                  <button onClick={() => {
                    // Reopen for editing: clear applied state locally and analyze
                    setAppliedMap(p => { const n = { ...p }; delete n[session.id]; return n })
                    analyzeSession(session)
                  }}
                    style={{ fontSize: 11, color: C.blue, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                    Override
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'error' ? '#dc2626' : '#111827',
          color: '#fff', borderRadius: 8, padding: '10px 20px',
          fontSize: 13, fontWeight: 600, zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          whiteSpace: 'nowrap', pointerEvents: 'none'
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
