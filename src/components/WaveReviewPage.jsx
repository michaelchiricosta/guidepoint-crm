// src/components/WaveReviewPage.jsx

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, CheckCircle2, Clock, SkipForward, RefreshCw, Radio, ChevronDown, Sparkles } from 'lucide-react'
import { supabase } from '../supabase.js'

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

export default function WaveReviewPage({ data, setData, onBack }) {
  const [sessions,   setSessions]   = useState([])
  const [appliedMap, setAppliedMap] = useState({})
  const [selections, setSelections] = useState({})
  const [applying,   setApplying]   = useState({})
  const [results,    setResults]    = useState({})
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [filter,     setFilter]     = useState('all')
  const [toast,      setToast]      = useState(null)

  const accounts = data?.accounts || []

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const since = new Date()
      since.setDate(since.getDate() - 30)

      const waveRes = await fetch('/api/wave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', since: since.toISOString() })
      })
      const waveData = await waveRes.json()
      if (!waveData.ok) throw new Error(waveData.error || 'Failed to load Wave sessions')

      const sorted = [...(waveData.sessions || [])].sort(
        (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
      )
      setSessions(sorted)

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

  async function applySession(session) {
    const accountId = selections[session.id]
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
          intel_summary: '',
          action_items:  []
        })
      })
      const result = await res.json()
      if (!result.ok) throw new Error(result.error || 'Apply failed')

      setAppliedMap(p => ({
        ...p,
        [session.id]: { account_name: result.account_name, applied_at: new Date().toISOString(), source: 'manual' }
      }))
      setResults(p => ({
        ...p,
        [session.id]: { account_name: result.account_name, intel_summary: result.intel_summary || '', follow_ups: result.follow_ups || 0 }
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

  async function skipSession(session) {
    try {
      await supabase
        .from('wave_applied_sessions')
        .upsert(
          { session_id: session.id, account_name: null, source: 'skipped' },
          { onConflict: 'session_id', ignoreDuplicates: false }
        )
      setAppliedMap(p => ({ ...p, [session.id]: { source: 'skipped', applied_at: new Date().toISOString() } }))
    } catch {
      showToast('Skip failed', 'error')
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const pendingCount = sessions.filter(s => !appliedMap[s.id]).length
  const appliedCount = sessions.filter(s => appliedMap[s.id] && appliedMap[s.id].source !== 'skipped').length
  const skippedCount = sessions.filter(s => appliedMap[s.id]?.source === 'skipped').length

  const filtered = sessions.filter(s => {
    const row = appliedMap[s.id]
    if (filter === 'pending') return !row
    if (filter === 'applied') return row && row.source !== 'skipped'
    if (filter === 'skipped') return row?.source === 'skipped'
    return true
  })

  const C = { bg: '#F9FAFB', surf: '#FFFFFF', bdr: '#EEEFF2', txt: '#111827', muted: '#6B7280', blue: '#007AFF' }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: C.surf, borderBottom: `1px solid ${C.bdr}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0 }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ width: 1, height: 18, background: C.bdr }} />
        <Radio size={18} color={C.blue} />
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.txt, lineHeight: 1.2 }}>Wave Review</div>
          <div style={{ fontSize: 12, color: C.muted }}>Last 30 days · {sessions.length} recording{sessions.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={loadAll} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: `1px solid ${C.bdr}`, borderRadius: 7, color: C.muted, fontSize: 12, fontWeight: 500, padding: '6px 12px', cursor: 'pointer' }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ background: C.surf, borderBottom: `1px solid ${C.bdr}`, padding: '0 24px', display: 'flex', flexShrink: 0 }}>
        {[
          { id: 'all',     label: `All (${sessions.length})` },
          { id: 'pending', label: `Pending (${pendingCount})`, dot: pendingCount > 0 },
          { id: 'applied', label: `Applied (${appliedCount})` },
          { id: 'skipped', label: `Skipped (${skippedCount})` },
        ].map(tab => (
          <button key={tab.id} onClick={() => setFilter(tab.id)}
            style={{ padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: filter === tab.id ? C.blue : C.muted, borderBottom: filter === tab.id ? `2px solid ${C.blue}` : '2px solid transparent', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            {tab.label}
            {tab.dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />}
          </button>
        ))}
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>

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
            const applied    = appliedMap[session.id]
            const isApplied  = !!applied && applied.source !== 'skipped'
            const isSkipped  = applied?.source === 'skipped'
            const isPending  = !applied
            const isApplying = !!applying[session.id]
            const result     = results[session.id]
            const selectedId = selections[session.id] || ''

            return (
              <div key={session.id} style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '16px 20px', marginBottom: 12, opacity: isSkipped ? 0.5 : 1 }}>

                {/* Title + status */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: isPending ? 12 : 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.txt, lineHeight: 1.3, marginBottom: 2 }}>{session.title}</div>
                    <div style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 10 }}>
                      <span>{fmtDate(session.date)}</span>
                      {session.duration && <span>· {fmtDur(session.duration)}</span>}
                    </div>
                  </div>

                  {isApplied && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#15803d', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      <CheckCircle2 size={11} /> {applied.account_name}
                    </span>
                  )}
                  {isSkipped && (
                    <span style={{ fontSize: 11, fontWeight: 700, background: '#f3f4f6', color: C.muted, borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>Skipped</span>
                  )}
                  {isPending && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#b45309', borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
                      <Clock size={11} /> Pending
                    </span>
                  )}
                </div>

                {/* Pending: dropdown + Apply + Skip */}
                {isPending && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
                      <select
                        value={selectedId}
                        onChange={e => setSelections(p => ({ ...p, [session.id]: e.target.value }))}
                        style={{ width: '100%', fontSize: 13, fontWeight: 600, color: selectedId ? C.txt : C.muted, background: C.surf, border: `1.5px solid ${selectedId ? C.blue : C.bdr}`, borderRadius: 8, padding: '8px 32px 8px 12px', cursor: 'pointer', appearance: 'none', outline: 'none' }}>
                        <option value="">Select account…</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.muted }} />
                    </div>

                    <button
                      onClick={() => applySession(session)}
                      disabled={isApplying || !selectedId}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, background: selectedId ? C.blue : '#e5e7eb', color: selectedId ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: selectedId ? 'pointer' : 'not-allowed', flexShrink: 0, opacity: isApplying ? 0.7 : 1, whiteSpace: 'nowrap' }}>
                      {isApplying
                        ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Applying…</>
                        : <><Sparkles size={13} /> Apply</>}
                    </button>

                    <button onClick={() => skipSession(session)}
                      style={{ fontSize: 12, fontWeight: 500, background: 'transparent', border: `1px solid ${C.bdr}`, borderRadius: 8, color: C.muted, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <SkipForward size={12} /> Skip
                    </button>
                  </div>
                )}

                {/* Post-apply intel summary */}
                {isApplied && result?.intel_summary && (
                  <div style={{ marginTop: 8, fontSize: 13, color: '#374151', lineHeight: 1.55, padding: '10px 14px', background: '#f9fafb', borderRadius: 8, border: `1px solid ${C.bdr}` }}>
                    {result.intel_summary}
                    {result.follow_ups > 0 && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{result.follow_ups} follow-up{result.follow_ups !== 1 ? 's' : ''} added</div>}
                  </div>
                )}

                {/* Applied meta + override */}
                {isApplied && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: C.muted }}>
                      {applied.source === 'cron' ? 'Auto-matched' : 'Applied'} · {fmtDate(applied.applied_at)}
                    </span>
                    <button onClick={() => {
                      setAppliedMap(p => { const n = { ...p }; delete n[session.id]; return n })
                      setResults(p => { const n = { ...p }; delete n[session.id]; return n })
                    }} style={{ fontSize: 11, color: C.blue, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                      Override
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? '#dc2626' : '#111827', color: '#fff', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
