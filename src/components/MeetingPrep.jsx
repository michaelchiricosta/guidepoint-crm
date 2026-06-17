import { useState } from 'react'
import { ArrowLeft, Trash2, RefreshCw, Copy, ChevronDown, ChevronUp, FileText, Loader } from 'lucide-react'
import { uid } from '../utils.js'
import { trackAI, FEATURES } from '../utils/aiTracker.js'
import { hashStr, getAICache, setAICache } from '../utils/aiHelper.js'

const fmtDate = iso => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return iso }
}

const Divider = () => <div style={{ height: 1, background: '#f1f5f9', margin: '16px 0' }} />

const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 10 }}>
    {children}
  </div>
)

const BulletItem = ({ children }) => (
  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
    <span style={{ color: '#d1d5db', fontSize: 13, flexShrink: 0, marginTop: 1 }}>•</span>
    <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.55 }}>{children}</span>
  </div>
)

function PrepView({ prep, generating, onBack, onDelete, onRegenerate }) {
  const [expanded, setExpanded] = useState(false)
  const b = prep.brief || {}

  const copyText = () => {
    const lines = [
      `MEETING PREP — ${prep.input}`,
      b.matchedAccount ? `Account: ${b.matchedAccount}` : '',
      fmtDate(prep.createdAt),
      '',
      'WHY THIS MEETING MATTERS',
      b.whyThisMeeting || '',
      '',
      'WHAT HAPPENED RECENTLY',
      ...(b.recentActivity || []).map(r => `• ${r}`),
      '',
      'WHAT YOU MUST COVER',
      ...(b.mustCover || []).map(m => `✓ ${m.topic}\n  ${m.why}`),
      '',
      'QUESTIONS YOU NEED ANSWERED',
      ...(b.questionsNeeded || []).map(q => `• ${q}`),
      '',
      'OPPORTUNITIES WHILE YOU HAVE THEM',
      ...(b.opportunities || []).map(o => `• ${o.opportunity} — ${o.whyNow}`),
      '',
      'SUGGESTED CLOSE',
      b.suggestedClose || '',
    ]
    navigator.clipboard?.writeText(lines.join('\n'))
  }

  const hasExpanded = b.stakeholders?.length > 0 || b.accountHistory || b.supportingNotes?.length > 0

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 60px', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <button onClick={onBack}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12, padding: '0 0 8px', display: 'flex', alignItems: 'center', gap: 4 }}
              onMouseEnter={e => e.currentTarget.style.color = '#64748b'}
              onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
              <ArrowLeft size={11} /> All preps
            </button>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', lineHeight: 1.35 }}>{prep.input}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              {b.matchedAccount && <span style={{ color: '#2563eb', fontWeight: 600, marginRight: 8 }}>{b.matchedAccount}</span>}
              {fmtDate(prep.createdAt)}
              {prep.fromCache && <span style={{ color: '#059669', marginLeft: 8 }}>· cached</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            <button onClick={copyText}
              style={{ background: '#f1f5f9', border: 'none', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Copy size={12} /> Copy
            </button>
            <button onClick={onRegenerate} disabled={generating}
              style={{ background: '#f1f5f9', border: 'none', borderRadius: 7, padding: '6px 10px', cursor: generating ? 'not-allowed' : 'pointer', fontSize: 12, color: generating ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
              {generating
                ? <><Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Generating...</>
                : <><RefreshCw size={12} /> Regenerate</>}
            </button>
            <button onClick={() => { onDelete(prep.id); onBack() }}
              style={{ background: '#fee2e2', border: 'none', borderRadius: 7, padding: '6px 8px', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Document */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '24px 28px' }}>

          {/* 1. Why This Meeting Matters */}
          {b.whyThisMeeting && (
            <>
              <SectionLabel>Why This Meeting Matters</SectionLabel>
              <div style={{ fontSize: 14, color: '#111827', lineHeight: 1.7, fontWeight: 500 }}>{b.whyThisMeeting}</div>
              <Divider />
            </>
          )}

          {/* 2 + 3: Recent Activity + Must Cover */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0 28px' }}>
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>What Happened Recently</SectionLabel>
              {(b.recentActivity || []).map((r, i) => <BulletItem key={i}>{r}</BulletItem>)}
            </div>
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>What You Must Cover</SectionLabel>
              {(b.mustCover || []).map((m, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <span style={{ color: '#2563eb', flexShrink: 0, lineHeight: 1.55 }}>✓</span>
                    <span>{m.topic}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, paddingLeft: 20, marginTop: 2 }}>{m.why}</div>
                </div>
              ))}
            </div>
          </div>

          <Divider />

          {/* 4 + 5: Questions + Opportunities */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0 28px' }}>
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>Questions You Need Answered</SectionLabel>
              {(b.questionsNeeded || []).map((q, i) => <BulletItem key={i}>{q}</BulletItem>)}
            </div>
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>Opportunities While You Have Them</SectionLabel>
              {(b.opportunities || []).map((o, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>• {o.opportunity}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, paddingLeft: 12, marginTop: 2 }}>{o.whyNow}</div>
                </div>
              ))}
            </div>
          </div>

          <Divider />

          {/* 6. Suggested Close */}
          {b.suggestedClose && (
            <>
              <SectionLabel>Suggested Close</SectionLabel>
              <div style={{ borderLeft: '2px solid #e2e8f0', paddingLeft: 14 }}>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, fontStyle: 'italic' }}>"{b.suggestedClose}"</div>
              </div>
            </>
          )}

          {/* Expanded context */}
          {hasExpanded && (
            <>
              <Divider />
              <button onClick={() => setExpanded(e => !e)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, padding: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = '#64748b'}
                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {expanded ? 'Collapse expanded context' : 'Show expanded context'}
              </button>

              {expanded && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {b.accountHistory && (
                    <div>
                      <SectionLabel>Account History</SectionLabel>
                      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{b.accountHistory}</div>
                    </div>
                  )}
                  {b.stakeholders?.length > 0 && (
                    <div>
                      <SectionLabel>Stakeholders</SectionLabel>
                      {b.stakeholders.map((s, i) => (
                        <div key={i} style={{ marginBottom: 10 }}>
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{s.name}</span>
                            {s.title && <span style={{ fontSize: 12, color: '#64748b' }}> · {s.title}</span>}
                            {s.relationship && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6, fontStyle: 'italic' }}>{s.relationship}</span>}
                          </div>
                          {s.note && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>{s.note}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                  {b.supportingNotes?.length > 0 && (
                    <div>
                      <SectionLabel>Supporting Notes</SectionLabel>
                      {b.supportingNotes.map((n, i) => <BulletItem key={i}>{n}</BulletItem>)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MeetingPrep({ data, setData, onBack }) {
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [openPrep, setOpenPrep] = useState(null)

  const preps = data.meetingPreps || []

  const matchAccount = (text, accounts) => {
    if (!accounts?.length) return null
    const lower = text.toLowerCase()
    let best = null, bestScore = 0
    accounts.forEach(a => {
      const words = (a.name || '').toLowerCase().split(/\s+/)
      let score = 0
      words.forEach(w => { if (w.length > 2 && lower.includes(w)) score += w.length })
      if (score > bestScore) { bestScore = score; best = a }
    })
    return bestScore >= 3 ? best : null
  }

  const generatePrep = async (inputOverride, forceRegen = false) => {
    const effectiveInput = (typeof inputOverride === 'string' ? inputOverride : input).trim()
    if (!effectiveInput || generating) return
    const apiKey = data.apiKey || ''
    if (!apiKey) { setError('No API key configured. Add it in Settings.'); return }

    const matched = matchAccount(effectiveInput, data.accounts || [])
    const today = new Date().toISOString().split('T')[0]
    const _cacheKey = `meetingPrep_${hashStr(effectiveInput + (matched?.id || '') + today)}`

    if (!forceRegen) {
      const cached = getAICache(data, _cacheKey)
      if (cached) {
        const entry = { id: uid(), input: effectiveInput, createdAt: new Date().toISOString(), brief: cached, fromCache: true }
        setData(prev => ({ ...prev, meetingPreps: [entry, ...(prev.meetingPreps || [])].slice(0, 50) }))
        setOpenPrep(entry)
        if (typeof inputOverride !== 'string') setInput('')
        return
      }
    }

    setGenerating(true)
    setError(null)

    // Build rich account context
    let acctCtx = ''
    if (matched) {
      const recentIntel = (matched.intelLog || [])
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 5)
        .map(e => `[${e.date}] ${e.summary || e.text || ''}${(e.insights || []).length ? '\n  Key: ' + e.insights.slice(0, 3).join('; ') : ''}`)
        .join('\n')

      const openActions = (matched.followUps || [])
        .filter(f => f.status === 'Open')
        .map(f => `[${f.priority}] ${f.task}${f.dueDate ? ' (due ' + f.dueDate + ')' : ''}${f.context ? ': ' + f.context.slice(0, 150) : ''}`)
        .join('\n')

      const activeProjects = (matched.projects || [])
        .filter(p => ['In Flight', 'In Discussion', 'Not Started', 'Stalled'].includes(p.status))
        .map(p => `${p.name} (${p.vendor || ''}, ${p.status}): ${(p.description || '').slice(0, 180)}`)
        .join('\n')

      const techStack = (matched.techStack || [])
        .map(t => `${t.vendor} (${t.category}, ${t.status}${t.renewalDate ? ', renews ' + t.renewalDate : ''}): ${(t.notes || '').slice(0, 120)}`)
        .join('\n')

      acctCtx = `ACCOUNT: ${matched.name}
Industry: ${matched.industry || 'N/A'} | Status: ${matched.status || 'N/A'} | HQ: ${matched.hq || 'N/A'}
Account notes: ${matched.notes || 'None'}
Contacts: ${(matched.contacts || []).map(c => `${c.name || ''} (${c.title || ''}${c.relationship ? ', ' + c.relationship : ''})`).join(', ') || 'None'}

INTEL LOG (newest first):
${recentIntel || 'None on record'}

OPEN ACTIONS:
${openActions || 'None'}

ACTIVE PROJECTS:
${activeProjects || 'None'}

TECH STACK:
${techStack || 'None recorded'}`
    } else {
      acctCtx = 'No exact account match found. Build the best prep possible from the meeting description.'
    }

    // Journal context (last 2 days)
    const journalCtx = (() => {
      const recent = (data.dailyJournals || [])
        .filter(j => j.date)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 2)
      return recent.length > 0
        ? `\nRECENT JOURNAL:\n${recent.map(j => `[${j.date}] ${(j.aiSummary || (j.debriefText || '').slice(0, 300))}`).join('\n')}`
        : ''
    })()

    // Market intel — find relevant items by keyword match
    const intelCtx = (() => {
      const all = [...(data.marketPulses || []), ...(data.knowledgeBase || [])]
      if (!all.length) return ''
      const kw = new Set()
      effectiveInput.toLowerCase().split(/\s+/).filter(w => w.length > 3).forEach(w => kw.add(w))
      if (matched) {
        ;(matched.name || '').toLowerCase().split(/\s+/).filter(w => w.length > 3).forEach(w => kw.add(w))
        ;(matched.industry || '').toLowerCase().split(/\s+/).filter(w => w.length > 3).forEach(w => kw.add(w))
        ;(matched.techStack || []).forEach(t => (t.vendor || '').toLowerCase().split(/\s+/).filter(w => w.length > 3).forEach(w => kw.add(w)))
      }
      const kwArr = [...kw]
      const relevant = all
        .map(item => ({
          ...item,
          _score: kwArr.filter(k => (item.title + ' ' + (item.excerpt || '') + ' ' + (item.aiSummary || '') + ' ' + (item.category || '')).toLowerCase().includes(k)).length,
        }))
        .filter(item => item._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 3)
      return relevant.length > 0
        ? `\nRELEVANT MARKET INTEL:\n${relevant.map(p => `- ${p.title}${p.aiSummary ? ': ' + p.aiSummary.slice(0, 200) : p.excerpt ? ': ' + p.excerpt.slice(0, 200) : ''}`).join('\n')}`
        : ''
    })()

    const systemPrompt = `You are a senior cybersecurity advisory coach preparing Mike Chiricosta, Enterprise Client Manager at GuidePoint Security (a cybersecurity VAR and services firm covering New England enterprise accounts), for an upcoming client call.

Think like a cybersecurity advisor, reseller, and account executive — not a note taker or report writer.

Generate a focused 60-second pre-call briefing. Total output must stay under 500 words across all text fields. Be specific, direct, and actionable.

Return ONLY valid JSON (no markdown, no preamble):
{
  "matchedAccount": "account name or null",
  "whyThisMeeting": "2-3 sentences: why the meeting exists, what changed recently, and what success looks like for this specific call",
  "recentActivity": ["max 5 bullets — specific recent events: intel log entries, open actions, project changes, tech stack events"],
  "mustCover": [{"topic": "short topic name", "why": "one sentence on why this must be discussed on this call"}],
  "questionsNeeded": ["max 5 — discovery/qualification questions: decision process, budget, timeline, competitive landscape, stakeholders"],
  "opportunities": [{"opportunity": "specific GuidePoint service or solution", "whyNow": "one sentence on why this is timely or relevant to this call"}],
  "suggestedClose": "one concise paragraph — specific recommended next step with exact language Mike can use at end of call",
  "stakeholders": [{"name": "contact", "title": "title", "relationship": "champion/influencer/blocker/economic buyer/technical buyer", "note": "brief prep note for this person"}],
  "accountHistory": "2-3 sentences on GuidePoint relationship history and depth with this account",
  "supportingNotes": ["additional background context or reference notes"]
}

CONSTRAINTS:
- mustCover: max 5 — absolute highest priority topics only, not a laundry list
- opportunities: max 4 — only include if genuinely relevant and timely, do not pad
- questionsNeeded: max 5 — focused on discovery and qualification, not recap
- suggestedClose: must be specific with actual language to use
- Keep all text fields concise: 1-2 sentences max unless otherwise specified`

    const userPrompt = `Meeting: "${effectiveInput}"

${acctCtx}${journalCtx}${intelCtx}

Generate the 60-second pre-call briefing.`

    const _start = Date.now()
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2500, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
      })
      trackAI({ feature: FEATURES.MEETING_PREP, operation: 'generate-prep', model: 'claude-sonnet-4-6', inputChars: systemPrompt.length + userPrompt.length, maxTokensOut: 2500, durationMs: Date.now() - _start, success: res.ok })

      const resData = await res.json()
      if (!res.ok) throw new Error(`API error ${res.status}: ${resData.error?.message || JSON.stringify(resData)}`)

      const rawText = resData.content?.[0]?.text || ''
      let briefData = null
      try {
        briefData = JSON.parse(rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim())
      } catch {
        let depth = 0, start = -1, end = -1
        for (let i = 0; i < rawText.length; i++) {
          if (rawText[i] === '{') { if (depth === 0) start = i; depth++ }
          else if (rawText[i] === '}') { depth--; if (depth === 0) { end = i; break } }
        }
        if (start !== -1 && end !== -1) {
          try { briefData = JSON.parse(rawText.slice(start, end + 1)) } catch {}
        }
      }
      if (!briefData) throw new Error('Could not parse response')

      const newPrep = { id: uid(), input: effectiveInput, createdAt: new Date().toISOString(), brief: briefData }
      setAICache(setData, _cacheKey, briefData, 24 * 3600 * 1000)
      setData(prev => ({ ...prev, meetingPreps: [newPrep, ...(prev.meetingPreps || [])].slice(0, 50) }))
      setOpenPrep(newPrep)
      if (typeof inputOverride !== 'string') setInput('')
    } catch (err) {
      setError(`Generation failed: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  const deletePrep = id => {
    setData(prev => ({ ...prev, meetingPreps: (prev.meetingPreps || []).filter(p => p.id !== id) }))
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Top bar */}
      <div style={{ background: '#0f172a', padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, padding: 0, fontSize: 13, fontWeight: 500 }}
          onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
          onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
          <ArrowLeft size={15} /> Back to Dashboard
        </button>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
        <FileText size={15} color='#60a5fa' />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Meeting Prep</span>
      </div>

      {openPrep ? (
        <PrepView
          prep={openPrep}
          generating={generating}
          onBack={() => setOpenPrep(null)}
          onDelete={deletePrep}
          onRegenerate={() => generatePrep(openPrep.input, true)}
        />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 20px 60px', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>

            {/* Input */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 6, letterSpacing: '-0.02em' }}>What's the meeting?</div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14, lineHeight: 1.5 }}>
                Describe it in plain English — who, company, and what it's about. Ledgr matches your account data and builds a 60-second pre-call briefing.
              </div>

              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generatePrep() }}
                placeholder='e.g. "Call with Rudy at BHSI about NetSpy PTaaS demo and MDR options"'
                style={{ width: '100%', boxSizing: 'border-box', minHeight: 88, padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 14, color: '#0f172a', lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit', outline: 'none', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
              />

              {error && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '9px 13px', marginTop: 8, color: '#dc2626', fontSize: 13 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>⌘ + Enter to generate</div>
                <button
                  onClick={() => generatePrep()}
                  disabled={!input.trim() || generating}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: !input.trim() || generating ? '#e2e8f0' : '#2563eb', color: !input.trim() || generating ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: !input.trim() || generating ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}>
                  {generating
                    ? <><Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Generating...</>
                    : <><FileText size={13} /> Generate Prep</>}
                </button>
              </div>
            </div>

            {/* Recent preps list */}
            {preps.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Recent Preps</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {preps.map(prep => (
                    <div key={prep.id}
                      onClick={() => setOpenPrep(prep)}
                      style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 9, padding: '12px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.06)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prep.input}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          {prep.brief?.matchedAccount && <span style={{ color: '#2563eb', fontWeight: 500, marginRight: 8 }}>{prep.brief.matchedAccount}</span>}
                          {fmtDate(prep.createdAt)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button onClick={e => { e.stopPropagation(); deletePrep(prep.id) }}
                          style={{ background: 'transparent', border: 'none', color: '#d1d5db', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4 }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fee2e2' }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#d1d5db'; e.currentTarget.style.background = 'transparent' }}>
                          <Trash2 size={13} />
                        </button>
                        <FileText size={13} color='#d1d5db' />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}
