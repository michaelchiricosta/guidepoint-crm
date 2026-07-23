import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Check, Copy, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../supabase.js'

const URGENCY_COLOR = { high: '#EF4444', medium: '#F59E0B', low: '#94A3B8' }

function wasHandled(reviewedItems, type, idx) {
  return ((reviewedItems || {})[type] || []).includes(idx)
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      color: '#94A3B8',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: 20
    }}>
      {children}
    </div>
  )
}

export default function MaggiePage({ onBack }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showHandled, setShowHandled] = useState(false)
  const [copiedKey, setCopiedKey] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('call_analysis')
      .select('id, session_date, distilled, reviewed_items, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
    if (!error) setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const markHandled = async (row, type, idx) => {
    const current = row.reviewed_items || {}
    const list = current[type] || []
    if (list.includes(idx)) return
    const updated = { ...current, [type]: [...list, idx] }
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, reviewed_items: updated } : r))
    await supabase.from('call_analysis').update({ reviewed_items: updated }).eq('id', row.id)
  }

  const copyEmail = async (email, key) => {
    try {
      await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch (_) {}
  }

  // Flatten items of a given type across all rows, sorted by priority desc then date asc
  const flatten = (type) =>
    rows.flatMap(row =>
      ((row.distilled || {})[type] || []).map((item, idx) => ({
        ...(typeof item === 'string' ? { text: item } : item),
        idx,
        row,
        isHandled: wasHandled(row.reviewed_items, type, idx),
        priority: (row.distilled || {}).priority_score || 0,
        createdAt: row.created_at
      }))
    ).sort((a, b) => b.priority - a.priority || new Date(a.createdAt) - new Date(b.createdAt))

  const actionItems = flatten('action_items')
  const emails     = flatten('draft_emails')
  const flags      = flatten('flags')

  const show = (list) => showHandled ? list : list.filter(i => !i.isHandled)

  // Rows that still have at least one unhandled item in any section
  const pendingRows = rows
    .filter(row => {
      const ri = row.reviewed_items || {}
      return ['action_items', 'draft_emails', 'flags'].some(type =>
        ((row.distilled || {})[type] || []).some((_, i) => !((ri[type] || []).includes(i)))
      )
    })
    .sort((a, b) => ((b.distilled || {}).priority_score || 0) - ((a.distilled || {}).priority_score || 0))

  const totalPending = actionItems.filter(i => !i.isHandled).length
    + emails.filter(i => !i.isHandled).length
    + flags.filter(i => !i.isHandled).length

  const isEmpty = !loading && totalPending === 0

  const hour = new Date().getHours()
  const salutation = hour < 12 ? 'Morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const briefing = pendingRows
    .slice(0, 2)
    .map(r => (r.distilled || {}).one_line_summary)
    .filter(Boolean)
    .join(' ')

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F6F9', fontFamily: 'Inter, sans-serif', color: '#94A3B8', fontSize: 14 }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#F4F6F9', fontFamily: 'Inter, sans-serif' }}>

      {/* Top bar */}
      <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 10, background: 'white', borderBottom: '1px solid #EEEFF2', flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#94A3B8', padding: 4, borderRadius: 6 }}
        >
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontWeight: 600, fontSize: 15, color: '#1E293B' }}>Maggie</span>
        <button
          onClick={() => setShowHandled(s => !s)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94A3B8', padding: '4px 8px', borderRadius: 6 }}
        >
          {showHandled ? <EyeOff size={13} /> : <Eye size={13} />}
          {showHandled ? 'Hide handled' : 'Show handled'}
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '44px 24px 80px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>

          {/* Greeting */}
          <div style={{ marginBottom: 52 }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#1E293B', marginBottom: 12 }}>
              {salutation}, Mike.
            </div>
            <div style={{ fontSize: 15, color: '#475569', lineHeight: 1.75, maxWidth: 560 }}>
              {isEmpty
                ? "You're all caught up. Nothing from Maggie right now."
                : briefing}
            </div>
          </div>

          {isEmpty && (
            <div style={{ textAlign: 'center', paddingTop: 48, color: '#CBD5E1', fontSize: 14 }}>
              Check back after your next call.
            </div>
          )}

          {/* What you need to do */}
          {show(actionItems).length > 0 && (
            <div style={{ marginBottom: 52 }}>
              <SectionLabel>What you need to do</SectionLabel>
              {show(actionItems).map(item => (
                <div
                  key={`${item.row.id}-a-${item.idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 16,
                    paddingLeft: 16,
                    borderLeft: `3px solid ${item.isHandled ? '#E2E8F0' : (URGENCY_COLOR[item.urgency] || '#94A3B8')}`,
                    marginBottom: 26,
                    opacity: item.isHandled ? 0.4 : 1,
                    transition: 'opacity 0.2s'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, color: '#1E293B', lineHeight: 1.65 }}>{item.text}</div>
                    {item.due_hint && (
                      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 5 }}>{item.due_hint}</div>
                    )}
                  </div>
                  {!item.isHandled && (
                    <button
                      onClick={() => markHandled(item.row, 'action_items', item.idx)}
                      title="Mark done"
                      style={{ flexShrink: 0, marginTop: 2, background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, cursor: 'pointer', padding: '3px 7px', color: '#CBD5E1', display: 'flex', alignItems: 'center', transition: 'border-color 0.15s, color 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#22C55E'; e.currentTarget.style.color = '#22C55E' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#CBD5E1' }}
                    >
                      <Check size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Emails to send */}
          {show(emails).length > 0 && (
            <div style={{ marginBottom: 52 }}>
              <SectionLabel>Emails to send</SectionLabel>
              {show(emails).map(email => {
                const key = `${email.row.id}-e-${email.idx}`
                return (
                  <div
                    key={key}
                    style={{
                      background: 'white',
                      border: '1px solid #EEEFF2',
                      borderRadius: 12,
                      padding: '22px 24px',
                      marginBottom: 16,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                      opacity: email.isHandled ? 0.4 : 1,
                      transition: 'opacity 0.2s'
                    }}
                  >
                    <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 3 }}>{email.to_hint}</div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: '#1E293B', marginBottom: 14 }}>{email.subject}</div>
                    <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.75, whiteSpace: 'pre-wrap', marginBottom: 16 }}>{email.body}</div>
                    {(email.gaps || []).length > 0 && (
                      <div style={{ fontSize: 13, color: '#64748B', paddingTop: 14, borderTop: '1px solid #F1F5F9', marginBottom: 16 }}>
                        Still needs: {email.gaps.join(', ')}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => copyEmail(email, key)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: copiedKey === key ? '#F0FDF4' : '#F8FAFC', border: `1px solid ${copiedKey === key ? '#BBF7D0' : '#E2E8F0'}`, borderRadius: 8, cursor: 'pointer', padding: '6px 12px', fontSize: 12, color: copiedKey === key ? '#16A34A' : '#475569', transition: 'all 0.15s' }}
                      >
                        <Copy size={12} />
                        {copiedKey === key ? 'Copied' : 'Copy'}
                      </button>
                      {!email.isHandled && (
                        <button
                          onClick={() => markHandled(email.row, 'draft_emails', email.idx)}
                          style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: 8, cursor: 'pointer', padding: '6px 12px', fontSize: 12, color: '#94A3B8' }}
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Worth knowing */}
          {show(flags).length > 0 && (
            <div style={{ marginBottom: 52 }}>
              <SectionLabel>Worth knowing</SectionLabel>
              {show(flags).map(flag => (
                <div
                  key={`${flag.row.id}-f-${flag.idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    marginBottom: 20,
                    opacity: flag.isHandled ? 0.4 : 1,
                    transition: 'opacity 0.2s'
                  }}
                >
                  <p style={{ flex: 1, margin: 0, fontSize: 15, color: '#475569', lineHeight: 1.75 }}>{flag.text}</p>
                  {!flag.isHandled && (
                    <button
                      onClick={() => markHandled(flag.row, 'flags', flag.idx)}
                      style={{ flexShrink: 0, marginTop: 3, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#CBD5E1', padding: 0, transition: 'color 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#94A3B8'}
                      onMouseLeave={e => e.currentTarget.style.color = '#CBD5E1'}
                    >
                      dismiss
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
