import { useState } from 'react'
import { ArrowLeft, Trash2, X, ChevronRight, FileText, Loader } from 'lucide-react'
import { uid } from '../utils.js'
import { trackAI, FEATURES } from '../utils/aiTracker.js'
import { hashStr, getAICache, setAICache, isLocked } from '../utils/aiHelper.js'

// TODO: No external web search yet — prep is based on internal Ledgr account data only

const fmt = d => {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }
  catch { return d }
}

const Section = ({ icon, title, children }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</span>
    </div>
    {children}
  </div>
)

const PrepModal = ({ prep, onClose, onDelete }) => {
  if (!prep) return null
  const b = prep.brief || {}
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 620, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 20px 0', gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
              Meeting Prep {prep.createdAt && <span style={{ fontWeight: 400, textTransform: 'none', color: '#94a3b8' }}>· {fmt(prep.createdAt)}</span>}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>{prep.input}</div>
            {b.matchedAccount && <div style={{ fontSize: 13, color: '#2563eb', marginTop: 4, fontWeight: 500 }}>Matched: {b.matchedAccount}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => { onDelete(prep.id); onClose() }} style={{ background: '#fee2e2', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#dc2626' }} title="Delete prep">
              <Trash2 size={15} />
            </button>
            <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#64748b' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ padding: '18px 20px 28px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Meeting Snapshot */}
          {b.meetingSnapshot && (
            <Section icon="📌" title="Meeting Snapshot">
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px' }}>
                {[
                  { label: 'Who', value: b.meetingSnapshot.who },
                  { label: 'What', value: b.meetingSnapshot.what },
                  { label: 'Where', value: b.meetingSnapshot.where },
                  { label: 'Why It Matters', value: b.meetingSnapshot.whyItMatters },
                ].filter(r => r.value).map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i < 3 ? 6 : 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', minWidth: 90, paddingTop: 1 }}>{r.label}</span>
                    <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />

          {/* Their World */}
          {b.theirWorld && (
            <Section icon="🌐" title="Their World">
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{b.theirWorld}</div>
            </Section>
          )}

          {/* Account Context */}
          {b.accountContext && (
            <Section icon="📂" title="Account Context">
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{b.accountContext}</div>
            </Section>
          )}

          {/* Likely Priorities */}
          {b.likelyPriorities?.length > 0 && (
            <Section icon="🎯" title="Likely Priorities">
              <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {b.likelyPriorities.map((p, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{p}</li>
                ))}
              </ul>
            </Section>
          )}

          <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />

          {/* Suggested Opener */}
          {b.suggestedOpener && (
            <Section icon="👋" title="Suggested Opener">
              <div style={{ borderLeft: '2px solid #2563eb', paddingLeft: 12 }}>
                <span style={{ fontSize: 14, color: '#1e40af', fontStyle: 'italic', lineHeight: 1.6 }}>"{b.suggestedOpener}"</span>
              </div>
            </Section>
          )}

          {/* While You Have Them */}
          {b.whileYouHaveThem?.length > 0 && (
            <Section icon="💡" title="While You Have Them">
              <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {b.whileYouHaveThem.map((p, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{p}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Risks / Landmines */}
          {b.risksAndLandmines?.length > 0 && (
            <Section icon="⚠️" title="Risks & Landmines">
              <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {b.risksAndLandmines.map((r, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#b45309', lineHeight: 1.5 }}>{r}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Upstairs Kit */}
          {b.upsairsKit && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>💼</span>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Upstairs Kit</div>
                <div style={{ fontSize: 13, color: '#92400e', lineHeight: 1.6 }}>{b.upsairsKit}</div>
              </div>
            </div>
          )}

          <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />

          {/* Suggested Close */}
          {b.suggestedClose && (
            <Section icon="🤝" title="Suggested Close">
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65, fontStyle: 'italic' }}>{b.suggestedClose}</div>
            </Section>
          )}

          {/* Follow-up Actions */}
          {b.followUpActions?.length > 0 && (
            <Section icon="✅" title="Follow-up Actions">
              <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {b.followUpActions.map((a, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{a}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Relevant Intel */}
          {b.relevantIntel?.length > 0 && (
            <>
              <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
              <Section icon="📡" title="Relevant Market Intel">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {b.relevantIntel.map((item, i) => (
                    <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', borderLeft: '2px solid #2563eb' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{item.title}</div>
                      {item.insight && <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.55, marginBottom: item.useThis ? 4 : 0 }}>{item.insight}</div>}
                      {item.useThis && <div style={{ fontSize: 11, color: '#2563eb', fontStyle: 'italic' }}>Use: {item.useThis}</div>}
                    </div>
                  ))}
                </div>
              </Section>
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

  const matchAccount = (inputText, accounts) => {
    if (!accounts?.length) return null
    const lower = inputText.toLowerCase()
    let best = null, bestScore = 0
    accounts.forEach(a => {
      const name = (a.name || '').toLowerCase()
      const words = name.split(/\s+/)
      let score = 0
      words.forEach(w => { if (w.length > 2 && lower.includes(w)) score += w.length })
      if (score > bestScore) { bestScore = score; best = a }
    })
    return bestScore >= 3 ? best : null
  }

  const generatePrep = async () => {
    if (!input.trim() || generating) return
    const apiKey = data.apiKey || ''
    if (!apiKey) { setError('No API key configured. Add it in Settings.'); return }

    const accounts = data.accounts || []
    const matched = matchAccount(input, accounts)
    const today = new Date().toISOString().split('T')[0]

    // Cache check: same input + same matched account + same day = reuse result
    const _prepCacheKey = `meetingPrep_${hashStr(input.trim() + (matched?.id||'') + today)}`
    const _cachedPrep = getAICache(data, _prepCacheKey)
    if (_cachedPrep) {
      console.log('[Meeting Prep] Cache hit — reusing saved prep for this input')
      const cachedEntry = { id: uid(), input: input.trim(), createdAt: new Date().toISOString(), brief: _cachedPrep, fromCache: true }
      setData(prev => ({ ...prev, meetingPreps: [cachedEntry, ...(prev.meetingPreps || [])].slice(0, 50) }))
      setOpenPrep(cachedEntry)
      setInput('')
      return
    }

    setGenerating(true)
    setError(null)

    const accountContext = matched ? `
MATCHED ACCOUNT: ${matched.name}
Industry: ${matched.industry || 'N/A'}
Status: ${matched.status || 'N/A'}
Tier: ${matched.tier || 'N/A'}
Products/Services in use: ${(matched.products || []).join(', ') || 'None recorded'}
Key contacts: ${(matched.contacts || []).map(c => `${c.name || ''} (${c.title || ''})`).join(', ') || 'None recorded'}
Notes: ${matched.notes || 'None'}
Last activity: ${matched.lastActivity || 'Unknown'}
Whitespace opportunities: ${JSON.stringify(matched.whitespace || {})}
` : `No exact account match found for this input. Generate the best prep possible from the meeting description alone.`

    // Find relevant intel from knowledge base and market pulses
    const allIntelItems = [...(data.marketPulses||[]), ...(data.knowledgeBase||[])]
    const relevantIntel = (() => {
      if (!allIntelItems.length) return []
      const keywords = []
      input.toLowerCase().split(/\s+/).filter(w=>w.length>3).forEach(w=>keywords.push(w))
      if (matched) {
        ;(matched.name||'').toLowerCase().split(/\s+/).filter(w=>w.length>3).forEach(w=>keywords.push(w))
        ;(matched.industry||'').toLowerCase().split(/\s+/).filter(w=>w.length>3).forEach(w=>keywords.push(w))
        ;(matched.techStack||[]).forEach(t=>(t.vendor||'').toLowerCase().split(/\s+/).filter(w=>w.length>3).forEach(w=>keywords.push(w)))
      }
      const uniq = [...new Set(keywords)]
      return allIntelItems
        .map(item=>{
          const text=(item.title+' '+(item.excerpt||'')+' '+(item.aiSummary||'')+' '+(item.category||'')).toLowerCase()
          return {...item, _score: uniq.filter(k=>text.includes(k)).length}
        })
        .filter(item=>item._score>0)
        .sort((a,b)=>b._score-a._score)
        .slice(0,3)
    })()

    const intelContext = relevantIntel.length>0
      ? `\n\nRelevant market intelligence from GuidePoint KB (use in relevantIntel field):\n${relevantIntel.map(p=>`- ${p.title}${p.aiSummary?' — '+p.aiSummary.slice(0,200):p.excerpt?' — '+p.excerpt.slice(0,200):''}`).join('\n')}`
      : ''

    const systemPrompt = `You are a senior enterprise sales coach preparing a rep for an upcoming meeting. Use the Ledgr CRM data provided to build a specific, actionable prep brief. Be direct, specific, and skip generic advice.

Return ONLY valid JSON in this exact structure:
{
  "matchedAccount": "account name or null",
  "meetingSnapshot": {
    "who": "name, title, company",
    "what": "meeting type and topic",
    "where": "call/in-person/video",
    "whyItMatters": "one sentence on the business opportunity"
  },
  "theirWorld": "2-3 sentences about this account's situation, pressures, and context based on what we know",
  "accountContext": "2-3 sentences about our history with this account — what we've sold, how the relationship stands, any open threads",
  "likelyPriorities": ["priority 1", "priority 2", "priority 3"],
  "suggestedOpener": "A specific, natural opening line to start the meeting well",
  "whileYouHaveThem": ["other topic or opportunity to raise while in the meeting"],
  "risksAndLandmines": ["risk or awkward topic to be prepared for"],
  "upsairsKit": "One specific exec escalation opportunity or exec-level value prop if relevant, else null",
  "suggestedClose": "Specific ask or next step to propose at the end of the meeting",
  "followUpActions": ["specific follow-up action after the meeting"],
  "relevantIntel": [{"title":"blog post or article title","insight":"1-2 sentences on why this is relevant to this meeting","useThis":"specific way Mike could reference it in the conversation"}]
}`

    const userPrompt = `Meeting description: "${input}"

${accountContext}${intelContext}

Generate a polished meeting prep brief.`

    const _prepStart = Date.now()
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })
      trackAI({ feature: FEATURES.MEETING_PREP, operation: 'generate-prep', model: 'claude-sonnet-4-6', inputChars: systemPrompt.length + userPrompt.length, maxTokensOut: 2000, durationMs: Date.now() - _prepStart, success: response.ok })

      const resData = await response.json()
      if (!response.ok) throw new Error(`API error ${response.status}: ${resData.error?.message || JSON.stringify(resData)}`)

      const rawText = resData.content?.[0]?.text || ''
      let briefData = null
      try {
        let cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        briefData = JSON.parse(cleaned)
      } catch {
        let depth = 0, start = -1, end = -1
        for (let i = 0; i < rawText.length; i++) {
          if (rawText[i] === '{') { if (depth === 0) start = i; depth++ }
          else if (rawText[i] === '}') { depth--; if (depth === 0) { end = i; break } }
        }
        if (start !== -1 && end !== -1) {
          try { briefData = JSON.parse(rawText.slice(start, end + 1)) } catch { }
        }
      }
      if (!briefData) throw new Error('Could not parse prep response')

      const newPrep = {
        id: uid(),
        input: input.trim(),
        createdAt: new Date().toISOString(),
        brief: briefData,
      }
      setAICache(setData, _prepCacheKey, briefData, 24 * 3600 * 1000)
      setData(prev => ({ ...prev, meetingPreps: [newPrep, ...(prev.meetingPreps || [])].slice(0, 50) }))
      setInput('')
      setOpenPrep(newPrep)
    } catch (err) {
      setError(`Generation failed: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  const deletePrep = (id) => {
    setData(prev => ({ ...prev, meetingPreps: (prev.meetingPreps || []).filter(p => p.id !== id) }))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: '#0f172a', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, padding: 0, fontSize: 13 }}>
          <ArrowLeft size={15} /> Back to Dashboard
        </button>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)' }} />
        <FileText size={16} color='#60a5fa' />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Meeting Prep</span>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px 60px' }}>
        <div style={{ width: '100%', maxWidth: 640 }}>

          {/* Input area */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 8, letterSpacing: '-0.02em' }}>What's the meeting?</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 18, lineHeight: 1.5 }}>Describe it in plain English — who, company, when, and what it's about. Ledgr will match your account data and build a prep brief.</div>

            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generatePrep() }}
              placeholder='e.g. "Call with Hunter at FW Webb tomorrow at 2pm about IR tabletop exercises and their MSSP renewal"'
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 100, padding: '14px 16px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 15, color: '#0f172a', lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit', outline: 'none', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
            />

            {error && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginTop: 10, color: '#dc2626', fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                onClick={generatePrep}
                disabled={!input.trim() || generating}
                style={{ display: 'flex', alignItems: 'center', gap: 7, background: !input.trim() || generating ? '#e2e8f0' : '#2563eb', color: !input.trim() || generating ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: !input.trim() || generating ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}>
                {generating ? <><Loader size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Generating...</> : <><FileText size={15} /> Generate Prep</>}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right', marginTop: 4 }}>⌘ + Enter to generate</div>
          </div>

          {/* History */}
          {preps.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Recent Preps</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {preps.map(prep => (
                  <div key={prep.id}
                    onClick={() => setOpenPrep(prep)}
                    style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '13px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'box-shadow 0.12s,border-color 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)'; e.currentTarget.style.borderColor = '#d1d5db' }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e5e7eb' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prep.input}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                        {prep.brief?.matchedAccount && <span style={{ color: '#2563eb', fontWeight: 500, marginRight: 8 }}>{prep.brief.matchedAccount}</span>}
                        {fmt(prep.createdAt)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); deletePrep(prep.id) }}
                        style={{ background: 'transparent', border: 'none', color: '#d1d5db', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fee2e2' }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#d1d5db'; e.currentTarget.style.background = 'transparent' }}>
                        <Trash2 size={14} />
                      </button>
                      <ChevronRight size={14} color='#d1d5db' />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Prep detail modal */}
      {openPrep && (
        <PrepModal
          prep={openPrep}
          onClose={() => setOpenPrep(null)}
          onDelete={id => { deletePrep(id); setOpenPrep(null) }}
        />
      )}
    </div>
  )
}
