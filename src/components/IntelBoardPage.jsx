import { useState, useMemo } from 'react'
import {
  ArrowLeft, Zap, DollarSign, AlertCircle, Users,
  TrendingUp, Target, CheckSquare, Square, Radio
} from 'lucide-react'

const SIGNAL_CONFIG = {
  vendor:      { label: 'Vendor Signal',  color: '#3B82F6', bg: '#EFF6FF',  icon: Target      },
  budget:      { label: 'Budget',         color: '#10B981', bg: '#ECFDF5',  icon: DollarSign  },
  pain:        { label: 'Hidden Pain',    color: '#F59E0B', bg: '#FFFBEB',  icon: AlertCircle },
  org:         { label: 'Org Change',     color: '#8B5CF6', bg: '#F5F3FF',  icon: Users       },
  expansion:   { label: 'Expansion',      color: '#06B6D4', bg: '#ECFEFF',  icon: TrendingUp  },
  competitive: { label: 'Competitive',    color: '#EF4444', bg: '#FEF2F2',  icon: Zap         },
}

// Priority order for signal cards: most actionable first
const SIGNAL_ORDER = { pain: 0, budget: 1, expansion: 2, org: 3, vendor: 4, competitive: 5 }

function daysBefore(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

export default function IntelBoardPage({ data, onBack }) {
  const [filter, setFilter]             = useState('week')
  const [completedActions, setCompleted] = useState({})
  const [expandedSignal, setExpanded]   = useState(null)

  const { signals, actions, callCount } = useMemo(() => {
    const accounts = data?.accounts || []

    const cutoff =
      filter === 'today' ? daysBefore(1) :
      filter === 'week'  ? daysBefore(7) :
      new Date(0)

    const allSignals  = []
    const allActions  = []
    const sessionIds  = new Set()

    for (const acct of accounts) {
      const entries = (acct.intelLog || []).filter(e => {
        if (!e.source?.includes('Wave')) return false
        return new Date(e.date) >= cutoff
      })

      for (const entry of entries) {
        sessionIds.add(entry.sessionId)
        for (const sig of (entry.signals || [])) {
          allSignals.push({
            id:          `${entry.id}-${sig.type}-${allSignals.length}`,
            accountName: acct.name,
            callTitle:   entry.sessionTitle || 'Call',
            callDate:    entry.date,
            intelId:     entry.id,
            summary:     entry.summary,
            ...sig,
          })
        }
      }

      const waveFollowUps = (acct.followUps || []).filter(fu =>
        fu.source?.includes('Wave') && fu.status !== 'Closed'
      )
      for (const fu of waveFollowUps) {
        allActions.push({ ...fu, accountName: acct.name })
      }
    }

    allSignals.sort((a, b) => {
      const order = (SIGNAL_ORDER[a.type] ?? 6) - (SIGNAL_ORDER[b.type] ?? 6)
      if (order !== 0) return order
      return (b.callDate || '').localeCompare(a.callDate || '')
    })

    const PRI = { high: 0, High: 0, medium: 1, Medium: 1, low: 2, Low: 2 }
    allActions.sort((a, b) => {
      const p = (PRI[a.priority] ?? 1) - (PRI[b.priority] ?? 1)
      if (p !== 0) return p
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
      return a.dueDate ? -1 : b.dueDate ? 1 : 0
    })

    return { signals: allSignals, actions: allActions, callCount: sessionIds.size }
  }, [data, filter])

  const toggleDone = id => setCompleted(p => ({ ...p, [id]: !p[id] }))

  const openCount   = actions.filter(a => !completedActions[a.id]).length
  const overdueCount = actions.filter(a =>
    !completedActions[a.id] && a.dueDate && new Date(a.dueDate) < new Date()
  ).length

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#F8FAFC', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ padding: '14px 24px', background: '#fff', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}
        >
          <ArrowLeft size={15} /> Back
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <Radio size={20} color="#6366F1" />
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F172A' }}>Intelligence Board</h1>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>
              {callCount} call{callCount !== 1 ? 's' : ''} &middot; {signals.length} signal{signals.length !== 1 ? 's' : ''} &middot;{' '}
              <span style={{ color: overdueCount > 0 ? '#EF4444' : '#94A3B8' }}>
                {openCount} action{openCount !== 1 ? 's' : ''} open
                {overdueCount > 0 ? ` (${overdueCount} overdue)` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 8, padding: 3 }}>
          {[['today', 'Today'], ['week', 'This Week'], ['all', 'All Time']].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{
              padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
              background: filter === val ? '#fff' : 'transparent',
              color: filter === val ? '#0F172A' : '#64748B',
              boxShadow: filter === val ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.1s',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* Signal feed */}
        <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Signals
          </div>

          {signals.length === 0 ? (
            <EmptyState
              icon={<Radio size={28} color="#CBD5E1" />}
              title="No signals yet"
              body="Apply Wave sessions to start building your intelligence feed."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {signals.map(sig => (
                <SignalCard
                  key={sig.id}
                  signal={sig}
                  expanded={expandedSignal === sig.id}
                  onToggle={() => setExpanded(p => p === sig.id ? null : sig.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Action queue */}
        <div style={{ width: 310, flexShrink: 0, borderLeft: '1px solid #E2E8F0', overflowY: 'auto', padding: '20px 20px', background: '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Action Queue
          </div>

          {actions.length === 0 ? (
            <EmptyState
              icon={<CheckSquare size={24} color="#CBD5E1" />}
              title="All clear"
              body="No open actions from Wave sessions."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {actions.map(action => (
                <ActionItem
                  key={action.id}
                  action={action}
                  done={!!completedActions[action.id]}
                  onToggle={() => toggleDone(action.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Signal card ────────────────────────────────────────────────────────────────

function SignalCard({ signal, expanded, onToggle }) {
  const cfg  = SIGNAL_CONFIG[signal.type] || SIGNAL_CONFIG.vendor
  const Icon = cfg.icon

  return (
    <div
      onClick={onToggle}
      style={{
        background: '#fff',
        borderRadius: 10,
        border: `1px solid ${cfg.color}28`,
        borderLeft: `4px solid ${cfg.color}`,
        padding: '12px 14px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg,
          padding: '2px 8px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 3,
          whiteSpace: 'nowrap',
        }}>
          <Icon size={10} /> {cfg.label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{signal.accountName}</span>
        <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{signal.callDate}</span>
      </div>

      {/* What was said */}
      <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 8, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 600, color: '#374151' }}>Heard: </span>{signal.what}
      </div>

      {/* GP Angle — the money line */}
      <div style={{
        fontSize: 13, background: '#F0F9FF', border: '1px solid #BAE6FD',
        borderRadius: 8, padding: '8px 12px', color: '#0369A1', lineHeight: 1.5,
      }}>
        <span style={{ fontWeight: 700 }}>GP Angle: </span>{signal.gp_angle}
      </div>

      {/* Expanded: call context */}
      {expanded && signal.summary && (
        <div style={{
          marginTop: 10, padding: '10px 12px', background: '#F8FAFC',
          borderRadius: 8, fontSize: 12, color: '#64748B', lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>Call: {signal.callTitle}</div>
          {signal.summary}
        </div>
      )}
    </div>
  )
}

// ── Action item ────────────────────────────────────────────────────────────────

function ActionItem({ action, done, onToggle }) {
  const isOverdue = !done && action.dueDate && new Date(action.dueDate) < new Date()
  const priColor  = action.priority === 'high' || action.priority === 'High' ? '#EF4444' : '#94A3B8'

  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
        background: done ? '#F8FAFC' : '#fff',
        border: `1px solid ${isOverdue ? '#FECACA' : '#E2E8F0'}`,
        opacity: done ? 0.5 : 1,
        transition: 'all 0.12s',
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 1, color: done ? '#10B981' : '#CBD5E1' }}>
        {done ? <CheckSquare size={15} /> : <Square size={15} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, color: '#1E293B', fontWeight: 500, lineHeight: 1.4,
          textDecoration: done ? 'line-through' : 'none',
        }}>{action.task}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748B', background: '#F1F5F9', padding: '1px 6px', borderRadius: 4, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {action.accountName}
          </span>
          {action.contact && (
            <span style={{ fontSize: 11, color: '#94A3B8' }}>{action.contact}</span>
          )}
          {action.dueDate && (
            <span style={{ fontSize: 11, color: isOverdue ? '#EF4444' : '#94A3B8', fontWeight: isOverdue ? 600 : 400 }}>
              {isOverdue ? '⚠ ' : ''}{action.dueDate}
            </span>
          )}
          {(action.priority === 'high' || action.priority === 'High') && !done && (
            <span style={{ fontSize: 10, color: priColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>HIGH</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ icon, title, body }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
      <div style={{ marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#CBD5E1', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{body}</div>
    </div>
  )
}
