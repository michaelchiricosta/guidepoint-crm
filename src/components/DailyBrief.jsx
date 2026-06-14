import { useState } from 'react'
import { RefreshCw, ArrowLeft, CheckCircle2, Circle, Sparkles, ChevronDown, ChevronRight as ChevronRt } from 'lucide-react'
import { fmtDate } from '../utils.js'

const fmt = d => {
  if (!d) return ''
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch { return d }
}

const fmtFull = d => {
  if (!d) return ''
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  } catch { return d }
}

const groupBriefsByWeek = (briefs) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const oneWeekAgo = new Date(today); oneWeekAgo.setDate(today.getDate() - 7)
  const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(today.getDate() - 14)
  const thisWeek = [], lastWeek = [], earlier = []
  briefs.forEach(b => {
    const d = new Date(b.date + 'T00:00:00')
    if (d >= oneWeekAgo) thisWeek.push(b)
    else if (d >= twoWeeksAgo) lastWeek.push(b)
    else earlier.push(b)
  })
  return { thisWeek, lastWeek, earlier }
}

export default function DailyBrief({ data, setData, apiKey, briefGenerating, briefError, onGenerateNow, onBack }) {
  const today = new Date().toISOString().split('T')[0]
  const briefs = data.dailyBriefs || []
  const todayBrief = briefs.find(b => b.date === today) || null
  const pastBriefs = briefs.filter(b => b.date !== today).slice(0, 29)

  const [selectedDate, setSelectedDate] = useState(today)
  const [historyExpanded, setHistoryExpanded] = useState({})

  const selectedBrief = briefs.find(b => b.date === selectedDate) || null
  const isToday = selectedDate === today

  const toggleActToday = (briefDate, idx) => {
    setData(prev => {
      const updated = (prev.dailyBriefs || []).map(b => {
        if (b.date !== briefDate) return b
        const items = (b.sections?.actToday || []).map((item, i) =>
          i === idx ? { ...item, completedToday: !item.completedToday } : item
        )
        return { ...b, sections: { ...b.sections, actToday: items } }
      })
      return { ...prev, dailyBriefs: updated }
    })
  }

  const { thisWeek, lastWeek, earlier } = groupBriefsByWeek(pastBriefs)

  const incompleteCount = todayBrief
    ? (todayBrief.sections?.actToday || []).filter(a => !a.completedToday).length
    : 0

  const SL = { fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '10px 16px 4px' }
  const briefRow = (b) => {
    const isSelected = selectedDate === b.date
    return (
      <div key={b.date} onClick={() => setSelectedDate(b.date)}
        style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: 6, margin: '1px 8px',
          background: isSelected ? '#1e3a5f' : 'transparent', transition: 'background 0.1s' }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#fff' : '#cbd5e1' }}>{fmt(b.date)}</div>
        {b.briefSummary && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{b.briefSummary.slice(0, 80)}</div>}
      </div>
    )
  }

  const DaysUntilPill = ({ days }) => {
    const bg = days < 30 ? '#fee2e2' : days < 60 ? '#ffedd5' : '#fef9c3'
    const color = days < 30 ? '#dc2626' : days < 60 ? '#ea580c' : '#a16207'
    return <span style={{ fontSize: 11, fontWeight: 700, background: bg, color, borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>{days}d</span>
  }

  const renderBrief = (brief) => {
    if (!brief) return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
        {briefGenerating
          ? <><div style={{ fontSize: 14, color: '#64748b' }}>Generating your morning brief...</div><div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/></>
          : <div style={{ fontSize: 14, color: '#94a3b8', fontStyle: 'italic' }}>No brief yet. Click "+ Generate Now" to create one.</div>
        }
      </div>
    )

    const { actToday = [], moveForward = [], longGame = [], renewalRadar = [], marketPulse = [] } = brief.sections || {}
    const isPast = brief.date !== today

    return (
      <div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        {/* Header */}
        {isPast && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={14} color='#2563eb'/>
            <span style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 500 }}>Archived brief from {fmtFull(brief.date)}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
              {isToday ? `Today — ${fmtFull(today)}` : fmtFull(brief.date)}
            </div>
            {isPast && <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', borderRadius: 999, padding: '2px 10px', fontWeight: 600, display: 'inline-block', marginTop: 4 }}>Archived brief</span>}
          </div>
          {isToday && !isPast && (
            <button onClick={onGenerateNow} disabled={briefGenerating}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', cursor: briefGenerating ? 'not-allowed' : 'pointer', color: '#64748b', fontSize: 12, fontWeight: 600, flexShrink: 0, opacity: briefGenerating ? 0.5 : 1 }}>
              <RefreshCw size={13} style={{ animation: briefGenerating ? 'spin 0.8s linear infinite' : 'none' }}/> Regenerate
            </button>
          )}
        </div>
        {brief.briefSummary && (
          <div style={{ fontSize: 14, color: '#64748b', fontStyle: 'italic', lineHeight: 1.6, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
            {brief.briefSummary}
          </div>
        )}

        {/* Section A — Act Today */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>🎯</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#dc2626' }}>Act Today</span>
            <span style={{ fontSize: 12, fontWeight: 700, background: '#fee2e2', color: '#dc2626', borderRadius: 999, padding: '1px 8px' }}>{actToday.length}</span>
          </div>
          {actToday.length === 0 && <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginBottom: 16 }}>No urgent actions for today.</div>}
          {actToday.map((item, idx) => (
            <div key={idx} style={{
              background: '#fff', borderLeft: '3px solid #dc2626', borderRadius: 10, padding: 16, marginBottom: 10,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)', opacity: item.completedToday ? 0.55 : 1, transition: 'opacity 0.2s'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1 }}>
                  {!isPast && (
                    <button onClick={() => toggleActToday(brief.date, idx)}
                      style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, marginTop: 1, color: item.completedToday ? '#22c55e' : '#cbd5e1' }}>
                      {item.completedToday ? <CheckCircle2 size={18}/> : <Circle size={18}/>}
                    </button>
                  )}
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', textDecoration: item.completedToday ? 'line-through' : 'none' }}>{item.account}</span>
                    {item.contact && <span style={{ fontSize: 13, color: '#64748b', marginLeft: 8 }}>{item.contact}</span>}
                  </div>
                </div>
                {item.estimatedMinutes && (
                  <span style={{ fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#475569', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>{item.estimatedMinutes}m</span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 6, lineHeight: 1.5, textDecoration: item.completedToday ? 'line-through' : 'none' }}>{item.action}</div>
              {item.clientFirstAngle && (
                <div style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic', marginTop: 6, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600, fontStyle: 'normal', color: '#94a3b8' }}>Why this matters to them: </span>{item.clientFirstAngle}
                </div>
              )}
              {item.suggestedOpener && (
                <div style={{ borderLeft: '2px solid #2563eb', padding: '8px 12px', background: '#f0f9ff', borderRadius: 6, marginTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 3 }}>SUGGESTED OPENER</div>
                  <div style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.5 }}>"{item.suggestedOpener}"</div>
                </div>
              )}
              {item.whileYouHaveThem?.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Also advance:</span>
                  {item.whileYouHaveThem.map((wt, wi) => (
                    <span key={wi} style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', borderRadius: 999, padding: '2px 8px', border: '1px solid #e2e8f0' }}>{wt}</span>
                  ))}
                </div>
              )}
              {item.upsairsKit && item.upsairsKit.trim() && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, padding: '8px 10px', marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>💼</span>
                  <div style={{ fontSize: 13, color: '#92400e', lineHeight: 1.5 }}><span style={{ fontWeight: 700 }}>Upstairs Kit: </span>{item.upsairsKit}</div>
                </div>
              )}
              {item.urgencyReason && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                  <span style={{ fontWeight: 600 }}>Why today: </span>{item.urgencyReason}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Section B — Move Forward */}
        <div style={{ marginTop: 20, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>📅</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#f59e0b' }}>Move Forward This Week</span>
            <span style={{ fontSize: 12, fontWeight: 700, background: '#fef3c7', color: '#d97706', borderRadius: 999, padding: '1px 8px' }}>{moveForward.length}</span>
          </div>
          {moveForward.length === 0 && <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>Nothing queued for this week.</div>}
          {moveForward.map((item, idx) => (
            <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 6, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{item.account}</span>
                  {item.contact && <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>{item.contact}</span>}
                </div>
                {item.timeframe && <span style={{ fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>{item.timeframe}</span>}
              </div>
              <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.5, fontWeight: 500 }}>{item.action}</div>
              {item.clientFirstAngle && <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5 }}>{item.clientFirstAngle}</div>}
              {item.urgencyReason && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Why this week: {item.urgencyReason}</div>}
            </div>
          ))}
        </div>

        {/* Section C — Long Game */}
        <div style={{ marginTop: 20, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>🌱</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#0ebc5f' }}>Long Game</span>
            <span style={{ fontSize: 12, fontWeight: 700, background: '#dcfce7', color: '#15803d', borderRadius: 999, padding: '1px 8px' }}>{longGame.length}</span>
          </div>
          {longGame.length === 0 && <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>No long-game seeds to plant right now.</div>}
          {longGame.map((item, idx) => (
            <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 6, background: '#fff' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{item.account}</span>
              <div style={{ fontSize: 13, color: '#1e293b', marginTop: 4, lineHeight: 1.5 }}>{item.action}</div>
              {item.why && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{item.why}</div>}
              {item.plantThisSeed && (
                <div style={{ fontSize: 12, color: '#2563eb', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5 }}>
                  Plant this seed: {item.plantThisSeed}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Section D — Renewal Radar */}
        {renewalRadar.length > 0 && (
          <div style={{ marginTop: 20, marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>🔄</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#7c3aed' }}>Renewal Radar</span>
              <span style={{ fontSize: 12, fontWeight: 700, background: '#ede9fe', color: '#6d28d9', borderRadius: 999, padding: '1px 8px' }}>{renewalRadar.length}</span>
            </div>
            {renewalRadar.map((item, idx) => (
              <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 6, background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{item.vendor}</span>
                    <span style={{ fontSize: 12, color: '#64748b' }}>— {item.account}</span>
                    {item.daysUntil != null && <DaysUntilPill days={item.daysUntil}/>}
                    {item.annualCost && <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{item.annualCost}</span>}
                    {item.inConversation != null && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: item.inConversation ? '#15803d' : '#dc2626' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: item.inConversation ? '#22c55e' : '#ef4444', display: 'inline-block' }}/>
                        {item.inConversation ? 'In conversation' : 'At risk'}
                      </span>
                    )}
                  </div>
                  {item.alert && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{item.alert}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Section E — Market Pulse */}
        {marketPulse.length > 0 && (
          <div style={{ marginTop: 20, marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>📡</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#0891b2' }}>Market Pulse</span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>What's happening in cybersecurity right now</div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
              {marketPulse.map((item, idx) => (
                <div key={idx} style={{ padding: '14px 16px', borderBottom: idx < marketPulse.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{item.headline}</div>
                  {item.relevance && (
                    <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: '#94a3b8' }}>Why this matters: </span>{item.relevance}
                    </div>
                  )}
                  {item.talkingPoint && (
                    <div style={{ fontSize: 13, color: '#2563eb', fontStyle: 'italic', lineHeight: 1.5 }}>
                      Bring this up: {item.talkingPoint}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 60 }}/>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f8fafc' }}>
      {/* LEFT COLUMN */}
      <div style={{ width: 220, flexShrink: 0, background: '#0f172a', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} color='#60a5fa'/>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Daily Brief</span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {/* TODAY */}
          <div style={SL}>Today</div>
          <div onClick={() => setSelectedDate(today)}
            style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: 6, margin: '1px 8px',
              background: selectedDate === today ? '#1e3a5f' : 'transparent', transition: 'background 0.1s' }}
            onMouseEnter={e => { if (selectedDate !== today) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
            onMouseLeave={e => { if (selectedDate !== today) e.currentTarget.style.background = 'transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: selectedDate === today ? '#fff' : '#cbd5e1' }}>{fmt(today)}</span>
              {briefGenerating && <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>}
              {!briefGenerating && !todayBrief && <span style={{ fontSize: 10, color: '#64748b' }}>—</span>}
              {!briefGenerating && todayBrief && incompleteCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: '#dc2626', color: '#fff', borderRadius: 999, padding: '1px 6px', minWidth: 16, textAlign: 'center' }}>{incompleteCount}</span>
              )}
            </div>
            {briefGenerating && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Generating...</div>}
          </div>

          {/* ARCHIVE */}
          {pastBriefs.length > 0 && (
            <>
              <div style={SL}>Archive</div>
              {thisWeek.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: '#475569', padding: '2px 20px 1px', fontWeight: 600 }}>This Week</div>
                  {thisWeek.map(briefRow)}
                </>
              )}
              {lastWeek.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: '#475569', padding: '6px 20px 1px', fontWeight: 600 }}>Last Week</div>
                  {lastWeek.map(briefRow)}
                </>
              )}
              {earlier.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: '#475569', padding: '6px 20px 1px', fontWeight: 600 }}>Earlier</div>
                  {earlier.map(briefRow)}
                </>
              )}
            </>
          )}
        </div>

        {/* Generate Now */}
        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <button onClick={onGenerateNow} disabled={briefGenerating}
            style={{ width: '100%', padding: '8px 12px', background: briefGenerating ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: briefGenerating ? '#64748b' : '#fff', fontSize: 13, fontWeight: 600, cursor: briefGenerating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            {briefGenerating ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.15)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/> Generating...</> : '+ Generate Now'}
          </button>
          <button onClick={onBack} style={{ width: '100%', padding: '7px 12px', background: 'transparent', border: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <ArrowLeft size={12}/> Back to Dashboard
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px', WebkitOverflowScrolling: 'touch' }}>
        {briefError && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
            {briefError} <button onClick={onGenerateNow} style={{ marginLeft: 8, background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>Retry</button>
          </div>
        )}
        {renderBrief(selectedBrief)}
      </div>
    </div>
  )
}
