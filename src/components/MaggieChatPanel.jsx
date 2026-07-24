import { useState, useEffect, useRef, useCallback } from 'react'
import { X, RefreshCw, Send } from 'lucide-react'
import { callClaudeWithRetry } from '../utils/aiHelper.js'

const MAGGIE_SYSTEM_BASE = `You are Maggie, Mike Chiricosta's sharp, trusted EA at GuidePoint Security covering New England. You know his entire book of business. You've been in every call. You're direct, smart, and always have his back. You know what's urgent and what can wait. You speak like a real person who knows him well — not like an AI assistant. Never say "As an AI" or "I don't have access to". If you don't know something specific, say "I don't have that detail handy" like a human would.

Always use first names. Be concise. Get to the point.`

const BRIEFING_REQUEST = `Mike just popped into your office. Give him a quick, sharp briefing — the kind you'd give someone who has 2 minutes before their next call. Talk to him directly, like you know him well. No preamble, no "here's a summary of", just start talking.

Cover:
1. The 2-3 most urgent things he needs to deal with TODAY — be specific, name the account and the exact action
2. One thing that's quietly slipping that he might not be thinking about
3. One whitespace account he should make a move on this week and why right now
4. Any recent call intel worth flagging — something from a transcript he should act on

Keep it under 200 words. Be direct. Use first names. Sound like someone who was in the room for every call.

Do NOT use bullet points for everything — mix in natural sentences. Do NOT start with "Hi Mike" or any greeting. Just start with what matters.`

function buildDataContext(data) {
  if (!data) return 'No data available.'

  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const lines = [`Today: ${today}`, '']

  lines.push('=== ACCOUNTS ===')
  for (const acct of data.accounts || []) {
    lines.push(`\n[${acct.name}${acct.industry ? ' — ' + acct.industry : ''}]`)

    const clients = (acct.contacts || []).filter(c => (c.contactType || 'Client') === 'Client')
    if (clients.length) {
      lines.push(`  Contacts: ${clients.slice(0, 6).map(c =>
        `${c.name}${c.title ? ` (${c.title})` : ''}${c.relStatus ? ' [' + c.relStatus + ']' : ''}${c.sentiment === 'negative' ? ' ⚠' : ''}`
      ).join(', ')}`)
    }

    const activeProjects = (acct.projects || []).filter(p =>
      ['In Flight', 'In Discussion', 'Not Started', 'Stalled'].includes(p.status)
    )
    if (activeProjects.length) {
      lines.push(`  Projects: ${activeProjects.map(p =>
        `${p.name} [${p.status}${p.vendor ? '/' + p.vendor : ''}]`
      ).join('; ')}`)
    }

    const openFUs = (acct.followUps || []).filter(f => f.status === 'Open')
    const critHigh = openFUs.filter(f => f.priority === 'Critical' || f.priority === 'High')
    if (critHigh.length) {
      lines.push(`  Critical/High Actions: ${critHigh.map(f =>
        `${f.task}${f.dueDate ? ' [due ' + f.dueDate + ']' : ''} (${f.priority})`
      ).join(' | ')}`)
    }
    const medLow = openFUs.filter(f => f.priority !== 'Critical' && f.priority !== 'High').slice(0, 2)
    if (medLow.length) {
      lines.push(`  Other Open Actions: ${medLow.map(f => f.task).join(' | ')}`)
    }

    const renewals = (acct.techStack || []).filter(t =>
      t.renewalDate && t.renewalDate >= today && t.renewalDate <= ninetyDaysOut
    )
    if (renewals.length) {
      lines.push(`  Renewals <90d: ${renewals.map(t => `${t.vendor} (${t.renewalDate})`).join(', ')}`)
    }

    const evalVendors = (acct.techStack || []).filter(t => t.status === 'Evaluating').map(t => t.vendor)
    if (evalVendors.length) lines.push(`  Evaluating: ${evalVendors.join(', ')}`)

    const recentIntel = (acct.intelLog || [])
      .filter(e => e.date >= thirtyDaysAgo)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3)
    for (const e of recentIntel) {
      lines.push(`  [${e.date}] Intel: ${(e.summary || '').slice(0, 300)}`)
      if (e.insights?.length) lines.push(`    Insights: ${e.insights.slice(0, 3).join(' | ')}`)
      if (e.opportunities?.length) lines.push(`    Opportunities: ${e.opportunities.slice(0, 2).join(' | ')}`)
      if (e.risks?.length) lines.push(`    Risks: ${e.risks.slice(0, 2).join(' | ')}`)
    }

    if (acct.lastContact) lines.push(`  Last contact: ${acct.lastContact}`)
    if (acct.notes) lines.push(`  Notes: ${acct.notes.slice(0, 200)}`)
  }

  const wt = (data.whitespaceAccounts || [])
    .filter(a => a.aiScore > 0)
    .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))
    .slice(0, 6)
  if (wt.length) {
    lines.push('\n=== TOP WHITESPACE TARGETS ===')
    for (const a of wt) {
      lines.push(`${a.name} (score: ${a.aiScore || 0}, status: ${a.status || 'Prospect'}${a.industry ? ', ' + a.industry : ''})`)
    }
  }

  const stalledProjects = (data.accounts || []).flatMap(acct =>
    (acct.projects || [])
      .filter(p => p.status === 'Stalled')
      .map(p => `${acct.name}: ${p.name}${p.vendor ? ' (' + p.vendor + ')' : ''}`)
  )
  if (stalledProjects.length) {
    lines.push('\n=== STALLED PROJECTS ===')
    lines.push(stalledProjects.join('\n'))
  }

  return lines.join('\n').slice(0, 12000)
}

export default function MaggieChatPanel({ data, open, onToggle, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const briefedRef = useRef(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const contextRef = useRef('')
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  useEffect(() => {
    contextRef.current = buildDataContext(data)
  }, [data])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  const callMaggie = useCallback(async (userMessage, history) => {
    setThinking(true)
    try {
      const systemPrompt = `${MAGGIE_SYSTEM_BASE}

You have access to Mike's full CRM data:

${contextRef.current || buildDataContext(data)}`

      const apiMessages = [
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ]

      const { data: responseData } = await callClaudeWithRetry({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: apiMessages,
      }, null, null)

      const text = responseData?.content?.[0]?.text || 'Something went sideways — try again.'
      setMessages(prev => [
        ...prev,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: text },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: 'Something went wrong on my end — try again.' },
      ])
    } finally {
      setThinking(false)
    }
  }, [data])

  // Auto-briefing on first open
  useEffect(() => {
    if (open && !briefedRef.current && data) {
      briefedRef.current = true
      contextRef.current = buildDataContext(data)
      callMaggie(BRIEFING_REQUEST, [])
    }
  }, [open, data, callMaggie])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300)
  }, [open])

  const handleSend = () => {
    const msg = input.trim()
    if (!msg || thinking) return
    setInput('')
    callMaggie(msg, messages)
  }

  const handleFreshBriefing = () => {
    if (thinking) return
    setMessages([])
    contextRef.current = buildDataContext(data)
    callMaggie(BRIEFING_REQUEST, [])
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={onToggle}
        title={open ? 'Close Maggie' : 'Pop in with Maggie'}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1001,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: '#007AFF',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,122,255,0.4)',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          color: 'white',
          fontSize: 20,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.05)'
          e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,122,255,0.55)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,122,255,0.4)'
        }}
      >
        {open ? <X size={20} /> : 'M'}
      </button>

      {/* Slide-in panel */}
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          height: '100vh',
          width: isMobile ? '100vw' : 400,
          zIndex: 1000,
          background: 'white',
          borderLeft: '1px solid #EEEFF2',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s ease',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{
          height: 64,
          borderBottom: '1px solid #EEEFF2',
          padding: '0 16px 0 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: '#007AFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 16, fontWeight: 700, flexShrink: 0,
          }}>M</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>Maggie</div>
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>Your EA</div>
          </div>
          <button
            onClick={handleFreshBriefing}
            disabled={thinking}
            title="Fresh Briefing"
            style={{
              background: 'transparent',
              border: '1px solid #EEEFF2',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: 11,
              color: thinking ? '#D1D5DB' : '#6B7280',
              cursor: thinking ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <RefreshCw size={11} />
            Fresh Briefing
          </button>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: '#F3F4F6', border: 'none',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#6B7280', flexShrink: 0,
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          {messages.length === 0 && !thinking && (
            <div style={{
              textAlign: 'center', color: '#D1D5DB',
              fontSize: 13, paddingTop: 60, lineHeight: 1.6,
            }}>
              Opening briefing...
            </div>
          )}

          {messages.map((m, i) => (
            m.role === 'assistant' ? (
              <div key={i} style={{
                alignSelf: 'flex-start',
                background: '#F9FAFB',
                border: '1px solid #EEEFF2',
                borderRadius: '4px 12px 12px 12px',
                padding: '12px 14px',
                fontSize: 13,
                color: '#111827',
                lineHeight: 1.65,
                maxWidth: '92%',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>{m.content}</div>
            ) : (
              <div key={i} style={{
                alignSelf: 'flex-end',
                background: '#007AFF',
                borderRadius: '12px 4px 12px 12px',
                padding: '10px 14px',
                fontSize: 13,
                color: 'white',
                lineHeight: 1.65,
                maxWidth: '85%',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>{m.content}</div>
            )
          ))}

          {thinking && (
            <div style={{
              alignSelf: 'flex-start',
              background: '#F9FAFB',
              border: '1px solid #EEEFF2',
              borderRadius: '4px 12px 12px 12px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <style>{`@keyframes mgDot{0%,80%,100%{opacity:0.2;transform:scale(0.8)}40%{opacity:1;transform:scale(1)}}`}</style>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#9CA3AF',
                  animation: 'mgDot 1.2s infinite',
                  animationDelay: `${i * 0.18}s`,
                }} />
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div style={{
          padding: '12px 14px',
          borderTop: '1px solid #EEEFF2',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          flexShrink: 0,
          background: 'white',
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Ask Maggie anything..."
            disabled={thinking}
            style={{
              flex: 1,
              fontSize: 13,
              padding: '10px 14px',
              background: '#F9FAFB',
              border: '1px solid #EEEFF2',
              borderRadius: 10,
              color: '#111827',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || thinking}
            style={{
              width: 40, height: 40,
              borderRadius: 10,
              background: input.trim() && !thinking ? '#007AFF' : '#F3F4F6',
              border: 'none',
              cursor: input.trim() && !thinking ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.15s',
              color: input.trim() && !thinking ? 'white' : '#D1D5DB',
            }}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </>
  )
}
MaggieChatPanel.displayName = 'MaggieChatPanel'
