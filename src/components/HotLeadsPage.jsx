import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Flame, Plus, X, User, Copy, Check, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { uid, fmtDate, extractJSON } from '../utils.js'
import { trackAI, FEATURES } from '../utils/aiTracker.js'

const LEAD_STAGES = ['Intel Received', 'Researching', 'Outreach Sent', 'Responded', 'Meeting Set', 'Active']

const STAGE_META = {
  'Intel Received': { color: '#F59E0B', bg: '#FEF3C7' },
  'Researching':     { color: '#8B5CF6', bg: '#EDE9FE' },
  'Outreach Sent':   { color: '#007AFF', bg: '#EBF4FF' },
  'Responded':       { color: '#10B981', bg: '#D1FAE5' },
  'Meeting Set':     { color: '#059669', bg: '#D1FAE5' },
  'Active':          { color: '#15803d', bg: '#DCFCE7' },
}

// ── AI helper — same resilient retry pattern used across the app ──────────────
const callAI = async (body, onStatus, maxRetries = 3) => {
  const lastCall = window._lastAnthropicCall || 0
  const wait = 2000 - (Date.now() - lastCall)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    window._lastAnthropicCall = Date.now()
    const res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    const overloaded = data.error?.type === 'overloaded_error' || res.status === 529 || res.status === 429
    if (overloaded && attempt < maxRetries - 1) {
      const delay = Math.pow(2, attempt) * 2000
      if (onStatus) onStatus(`API busy — retrying in ${Math.round(delay / 1000)}s…`)
      await new Promise(r => setTimeout(r, delay))
      continue
    }
    if (overloaded) throw new Error('API overloaded — please try again')
    if (data.error) throw new Error(data.error.message || 'API error')
    if (onStatus) onStatus(null)
    return data
  }
  throw new Error('API overloaded — please try again')
}

function buildOutreachPrompt(lead) {
  const contactLine = lead.contact ? lead.contact : 'the security leader'
  return `You are writing a cold outreach email for Mike Chiricosta, Enterprise Client Manager at GuidePoint Security covering New England.

GuidePoint is a cybersecurity VAR — we sell and implement solutions across the security stack and layer in professional and managed services. We are vendor-agnostic trusted advisors.

Write a short, direct cold outreach email to ${contactLine} at ${lead.accountName}.

Context: Mike has intel suggesting ${lead.accountName} may be evaluating or exploring security solutions right now. Here is the raw intel, for your context only — do not quote or reveal specifics from it: "${lead.intel || ''}"

From that intel, infer the general security domain being discussed (e.g. endpoint, identity, cloud security, data protection) and reference it only in general terms. Do NOT mention ${lead.sourceCompany || 'the vendor'}, the vendor rep, the specific deal, or where Mike got this information.

The email should:
- Be 3 short paragraphs max
- Sound like Mike — direct, no fluff, no em dashes, no corporate speak
- Position GuidePoint as a vendor-agnostic advisor who works across the security stack
- Reference that Mike has been seeing a lot of activity around that security area across his client base lately
- Make a soft ask — a 20 minute conversation, not a hard pitch
- Sound like a warm cold email, not a template

Mike's signature: Mike Chiricosta | Enterprise Client Manager | GuidePoint Security | New England Territory

Also write a shorter LinkedIn message version (3-4 sentences max, no subject line, more casual but still direct, same soft ask, same vendor-blind rules).

Return ONLY valid JSON, no markdown, in this exact shape:
{"subject": "email subject line", "email_body": "full email body, paragraphs separated by \\n\\n", "linkedin_message": "shorter linkedin version"}`
}

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #EEEFF2', fontSize: 13, color: '#111827', outline: 'none', background: '#fff' }
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5, display: 'block' }

function AddLeadModal({ onClose, onSave }) {
  const [accountName, setAccountName] = useState('')
  const [sourceRep, setSourceRep] = useState('')
  const [sourceCompany, setSourceCompany] = useState('')
  const [contact, setContact] = useState('')
  const [intel, setIntel] = useState('')

  const canSave = accountName.trim() && sourceRep.trim() && sourceCompany.trim() && intel.trim()

  const handleSave = () => {
    if (!canSave) return
    onSave({
      id: uid(),
      accountName: accountName.trim(),
      sourceRep: sourceRep.trim(),
      sourceCompany: sourceCompany.trim(),
      contact: contact.trim(),
      intel: intel.trim(),
      stage: 'Intel Received',
      createdAt: new Date().toISOString().split('T')[0],
      dismissed: false,
      waveSessionId: null,
      generatedEmail: null,
    })
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid #EEEFF2', borderRadius: 16, width: 440, maxWidth: '100%', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.20)', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Add Hot Lead</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, display: 'flex' }}
            onMouseEnter={e => e.currentTarget.style.color = '#111827'} onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Account Name</label>
          <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="e.g. Samsonite" style={inputStyle} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Source Rep</label>
            <input value={sourceRep} onChange={e => setSourceRep(e.target.value)} placeholder="e.g. Jesse" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Source Company/Vendor</label>
            <input value={sourceCompany} onChange={e => setSourceCompany(e.target.value)} placeholder="e.g. Cyera" style={inputStyle} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Contact at Account <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(optional)</span></label>
          <input value={contact} onChange={e => setContact(e.target.value)} placeholder="e.g. Tom Smith, CISO" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Intel</label>
          <textarea value={intel} onChange={e => setIntel(e.target.value)} rows={2} placeholder="What did they tell you?"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #EEEFF2', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={!canSave}
            style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: canSave ? '#007AFF' : '#BFDBFE', color: '#fff', fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed' }}>Save Lead</button>
        </div>
      </div>
    </div>
  )
}

function DraftOutreachModal({ lead, onClose, onCache }) {
  const [emailData, setEmailData] = useState(lead.generatedEmail || null)
  const [loading, setLoading] = useState(!lead.generatedEmail)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)
  const [statusMsg, setStatusMsg] = useState(null)

  const generate = async () => {
    setLoading(true); setError(null); setStatusMsg(null)
    const start = Date.now()
    const prompt = buildOutreachPrompt(lead)
    try {
      const body = { model: 'claude-sonnet-4-6', max_tokens: 900, messages: [{ role: 'user', content: prompt }] }
      const result = await callAI(body, setStatusMsg)
      const text = (result.content || []).find(b => b.type === 'text')?.text?.trim() || ''
      const parsed = extractJSON(text)
      if (!parsed || !parsed.email_body) throw new Error('Could not parse the generated email')
      const draft = { subject: parsed.subject || 'Quick conversation?', body: parsed.email_body, linkedin: parsed.linkedin_message || '' }
      setEmailData(draft)
      onCache(draft)
      trackAI({ feature: FEATURES.HOT_LEADS, operation: 'draft-outreach', model: 'claude-sonnet-4-6', inputChars: prompt.length, maxTokensOut: 900, durationMs: Date.now() - start, success: true, notes: lead.accountName })
    } catch (err) {
      setError(err.message || 'Failed to generate email')
      trackAI({ feature: FEATURES.HOT_LEADS, operation: 'draft-outreach', model: 'claude-sonnet-4-6', inputChars: prompt.length, maxTokensOut: 900, durationMs: Date.now() - start, success: false, errorMessage: err.message, notes: lead.accountName })
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!emailData) generate() }, [])

  const copy = async (type) => {
    if (!emailData) return
    const text = type === 'email' ? `Subject: ${emailData.subject}\n\n${emailData.body}` : emailData.linkedin
    try { await navigator.clipboard.writeText(text) } catch {}
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 330, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid #EEEFF2', borderRadius: 16, width: 520, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.20)', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Draft Outreach — {lead.accountName}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, display: 'flex' }}
            onMouseEnter={e => e.currentTarget.style.color = '#111827'} onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>
            <X size={18} />
          </button>
        </div>

        {loading && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>{statusMsg || 'Drafting email…'}</div>
        )}
        {error && !loading && (
          <div style={{ padding: '12px 0 20px', textAlign: 'center', color: '#DC2626', fontSize: 13 }}>
            {error}
            <div style={{ marginTop: 12 }}>
              <button onClick={generate} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #007AFF', background: '#fff', color: '#007AFF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Try Again</button>
            </div>
          </div>
        )}
        {emailData && !loading && !error && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 10 }}>{emailData.subject}</div>
            <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 20 }}>{emailData.body}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => copy('email')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#007AFF', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {copied === 'email' ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Email</>}
              </button>
              <button onClick={() => copy('linkedin')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: '1px solid #007AFF', background: '#fff', color: '#007AFF', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {copied === 'linkedin' ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy for LinkedIn</>}
              </button>
              <button onClick={generate} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 10px', borderRadius: 8, border: 'none', background: 'none', color: '#9CA3AF', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <RefreshCw size={13} /> Regenerate
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function LeadCard({ lead, dismissed, hideAccountName, onCycleStage, onDismiss, onRestore, onDraftOutreach }) {
  const meta = STAGE_META[lead.stage] || STAGE_META['Intel Received']
  return (
    <div style={{ background: '#fff', border: '1px solid #EEEFF2', borderLeft: `3px solid ${meta.color}`, borderRadius: 12, padding: 20, marginBottom: 12, opacity: dismissed ? 0.5 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: hideAccountName ? 'flex-end' : 'space-between', marginBottom: 6, gap: 12 }}>
        {!hideAccountName && <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{lead.accountName}</div>}
        {!dismissed ? (
          <button onClick={() => onCycleStage(lead)} title="Click to advance stage"
            style={{ background: meta.bg, color: meta.color, border: 'none', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {lead.stage}
          </button>
        ) : (
          <span style={{ background: meta.bg, color: meta.color, borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{lead.stage}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
        <div style={{ fontSize: 13, color: '#6B7280' }}>via {lead.sourceRep} at {lead.sourceCompany}</div>
        <div style={{ fontSize: 12, color: '#9CA3AF', whiteSpace: 'nowrap' }}>{fmtDate(lead.createdAt)}</div>
      </div>
      {lead.intel && <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 10 }}>{lead.intel}</div>}
      {lead.contact && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6B7280', marginBottom: 14 }}>
          <User size={13} /> Contact: {lead.contact}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => onDraftOutreach(lead)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #007AFF', background: '#fff', color: '#007AFF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Draft Outreach</button>
        {!dismissed ? (
          <button onClick={() => onDismiss(lead.id)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'none', color: '#9CA3AF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Dismiss</button>
        ) : (
          <button onClick={() => onRestore(lead.id)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'none', color: '#007AFF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Restore</button>
        )}
      </div>
    </div>
  )
}

export default function HotLeadsPage({ data, setData, onBack }) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [draftLead, setDraftLead] = useState(null)
  const [showDismissed, setShowDismissed] = useState(false)
  const [collapsedAccounts, setCollapsedAccounts] = useState(new Set())

  const leads = data.hotLeads || []
  const activeLeads = leads.filter(l => !l.dismissed)
  const dismissedLeads = leads.filter(l => l.dismissed)

  // Group active leads by account, newest lead first within each group, and
  // account groups ordered by their most recent lead (hottest activity first).
  const groupedLeads = useMemo(() => {
    const groups = {}
    activeLeads.forEach(lead => {
      const key = lead.accountName || 'Unknown Account'
      if (!groups[key]) groups[key] = []
      groups[key].push(lead)
    })
    Object.values(groups).forEach(g => g.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')))
    return Object.entries(groups).sort((a, b) => (b[1][0]?.createdAt || '').localeCompare(a[1][0]?.createdAt || ''))
  }, [activeLeads])

  const toggleAccountCollapse = (accountName) => {
    setCollapsedAccounts(prev => {
      const next = new Set(prev)
      if (next.has(accountName)) next.delete(accountName)
      else next.add(accountName)
      return next
    })
  }

  const cycleStage = (lead) => {
    const idx = LEAD_STAGES.indexOf(lead.stage)
    const nextStage = LEAD_STAGES[Math.min(idx >= 0 ? idx + 1 : 0, LEAD_STAGES.length - 1)]
    setData(prev => ({ ...prev, hotLeads: (prev.hotLeads || []).map(l => l.id === lead.id ? { ...l, stage: nextStage } : l) }))
  }
  const dismissLead = (id) => setData(prev => ({ ...prev, hotLeads: (prev.hotLeads || []).map(l => l.id === id ? { ...l, dismissed: true } : l) }))
  const restoreLead = (id) => setData(prev => ({ ...prev, hotLeads: (prev.hotLeads || []).map(l => l.id === id ? { ...l, dismissed: false } : l) }))
  const addLead = (lead) => { setData(prev => ({ ...prev, hotLeads: [lead, ...(prev.hotLeads || [])] })); setShowAddModal(false) }
  const cacheEmail = (leadId, draft) => setData(prev => ({ ...prev, hotLeads: (prev.hotLeads || []).map(l => l.id === leadId ? { ...l, generatedEmail: draft } : l) }))

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#F4F6F9' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 80px' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#007AFF', fontSize: 14, fontWeight: 500, padding: 0, marginBottom: 20 }}>
          <ArrowLeft size={16} /> Back
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 700, color: '#111827' }}><Flame size={22} color="#F59E0B" /> Hot Leads</div>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4 }}>Vendor-sourced pipeline intel — move on these now</div>
          </div>
          <button onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#007AFF', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Plus size={14} /> Add Lead
          </button>
        </div>

        {activeLeads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 20px', background: '#fff', border: '1px solid #EEEFF2', borderRadius: 12 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔥</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 6 }}>No hot leads yet</div>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 20 }}>Leads from vendor calls will appear here automatically</div>
            <button onClick={() => setShowAddModal(true)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#007AFF', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Add Lead manually</button>
          </div>
        ) : (
          groupedLeads.map(([accountName, accountLeads]) => {
            const isCollapsed = collapsedAccounts.has(accountName)
            return (
              <div key={accountName}>
                <div onClick={() => toggleAccountCollapse(accountName)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderBottom: '1px solid #EEEFF2', paddingBottom: 12, marginTop: 20 }}>
                  {isCollapsed ? <ChevronRight size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />}
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{accountName}</div>
                  <span style={{ background: '#F3F4F6', color: '#6B7280', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{accountLeads.length}</span>
                </div>
                {!isCollapsed && (
                  <div style={{ marginTop: 12 }}>
                    {accountLeads.map(lead => (
                      <LeadCard key={lead.id} lead={lead} hideAccountName onCycleStage={cycleStage} onDismiss={dismissLead} onDraftOutreach={setDraftLead} />
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}

        {dismissedLeads.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <button onClick={() => setShowDismissed(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 12, fontWeight: 600, padding: 0 }}>
              {showDismissed ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {dismissedLeads.length} dismissed lead{dismissedLeads.length !== 1 ? 's' : ''}
            </button>
            {showDismissed && (
              <div style={{ marginTop: 12 }}>
                {dismissedLeads.map(lead => (
                  <LeadCard key={lead.id} lead={lead} dismissed onRestore={restoreLead} onDraftOutreach={setDraftLead} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {showAddModal && <AddLeadModal onClose={() => setShowAddModal(false)} onSave={addLead} />}
      {draftLead && <DraftOutreachModal lead={draftLead} onClose={() => setDraftLead(null)} onCache={(draft) => cacheEmail(draftLead.id, draft)} />}
    </div>
  )
}
