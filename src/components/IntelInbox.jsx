import { useState } from 'react'
import { uid, extractJSON } from '../utils.js'
import { saveData } from '../supabase.js'

// ── CDN loaders (lazy, cached on window) ──────────────────────────────────────

const loadPdfJs = () => new Promise((resolve, reject) => {
  if (window.pdfjsLib) { resolve(window.pdfjsLib); return }
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
  s.onload = () => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    resolve(window.pdfjsLib)
  }
  s.onerror = () => reject(new Error('Failed to load PDF.js'))
  document.head.appendChild(s)
})

const loadMammoth = () => new Promise((resolve, reject) => {
  if (window.mammoth) { resolve(window.mammoth); return }
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
  s.onload = () => resolve(window.mammoth)
  s.onerror = () => reject(new Error('Failed to load mammoth.js'))
  document.head.appendChild(s)
})

// ── File text extraction ───────────────────────────────────────────────────────

const FILE_CHAR_LIMIT = 50000
const ACCEPTED_EXTS = ['pdf', 'docx', 'doc', 'txt', 'csv']

const extractFileText = async (file) => {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'txt' || ext === 'csv') {
    const text = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = e => resolve(e.target.result || '')
      r.onerror = () => reject(new Error('Could not read file'))
      r.readAsText(file)
    })
    return text.slice(0, FILE_CHAR_LIMIT)
  }
  if (ext === 'docx' || ext === 'doc') {
    const mammoth = await loadMammoth()
    const ab = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer: ab })
    if (!result.value.trim()) throw new Error('No text found in document')
    return result.value.slice(0, FILE_CHAR_LIMIT)
  }
  if (ext === 'pdf') {
    const pdfjsLib = await loadPdfJs()
    const ab = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise
    let text = ''
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      text += content.items.map(it => it.str).join(' ') + '\n'
    }
    if (!text.trim()) throw new Error('Could not extract text from this PDF. Try a text-based PDF or copy-paste the content.')
    return text.slice(0, FILE_CHAR_LIMIT)
  }
  throw new Error('Unsupported file type')
}

// ── AI client ─────────────────────────────────────────────────────────────────

const callClaudeWithRetry = async (body, apiKey, onStatus, maxRetries = 3) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await resp.json()
    const isRateLimit = data.error?.type === 'rate_limit_error' || resp.status === 429
    const isOverloaded = data.error?.type === 'overloaded_error' || resp.status === 529
    if ((isRateLimit || isOverloaded) && attempt < maxRetries - 1) {
      const delay = isRateLimit
        ? [15000, 30000, 60000][Math.min(attempt, 2)]
        : [2000, 5000, 10000][Math.min(attempt, 2)]
      if (onStatus) onStatus(`${isRateLimit ? 'Rate limited' : 'API busy'} — retrying in ${Math.round(delay / 1000)}s…`)
      await new Promise(r => setTimeout(r, delay))
      continue
    }
    if (onStatus) onStatus('')
    return { data }
  }
  throw new Error('OVERLOADED')
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRI_COLOR = { Critical: '#dc2626', High: '#ea580c', Medium: '#2563eb', Low: '#64748b' }
const PRI_BG    = { Critical: '#fef2f2', High: '#fff7ed', Medium: '#eff6ff', Low: '#f8fafc' }

const fmtFileSize = b =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(0)} KB` : `${b} B`

// ── Wave helpers ─────────────────────────────────────────────────────────────
let waveSyncInProgress = false

const fmtSyncTime = iso => {
  if (!iso) return ''
  try {
    const diffMs = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return '' }
}

function WaveTranscriptCard({ transcript, accounts, expandedSet, onToggleExpand, appliedSet, manualSels, onManualSel, onApply, onSkip }) {
  const fmtDur = s => {
    if (s == null) return ''
    if (typeof s === 'string') return s
    const m = Math.floor(s / 60), sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
  }
  const sessionDate = (transcript.date || '').includes('T') ? transcript.date.split('T')[0] : (transcript.date || '')
  const fmtD = d => {
    if (!d) return ''
    try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return d }
  }
  const confDotColor = c => c === 'high' ? '#16a34a' : c === 'medium' ? '#d97706' : '#9ca3af'
  const sentColor = s => s === 'positive' ? '#15803d' : s === 'needs_attention' ? '#dc2626' : '#64748b'
  const sentBg    = s => s === 'positive' ? '#f0fdf4' : s === 'needs_attention' ? '#fef2f2' : '#f8fafc'
  const sentLabel = s => s === 'positive' ? 'Positive' : s === 'needs_attention' ? 'Needs Attention' : 'Neutral'

  const unapplied = (transcript.matches || []).filter(m => !appliedSet.has(`${transcript.session_id}-${m.account_name}`))
  if (!unapplied.length) return null

  const highCount = unapplied.filter(m => m.confidence === 'high').length

  return (
    <div style={{ background: '#fff', border: '1px solid #EEEFF2', borderRadius: 12, padding: 20, marginBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#111827', marginBottom: 2 }}>{transcript.title || 'Call Recording'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>{fmtD(sessionDate)}</span>
            {transcript.duration != null && transcript.duration !== '' && (
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>· {fmtDur(transcript.duration)}</span>
            )}
          </div>
        </div>
        {highCount > 0 && (
          <button
            onClick={() => unapplied.filter(m => m.confidence === 'high').forEach(m => onApply(transcript, m, manualSels[`${transcript.session_id}-${m.account_name}`]))}
            style={{ flexShrink: 0, padding: '6px 14px', background: 'linear-gradient(135deg,#0055CC 0%,#2563eb 100%)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Apply All ({highCount})
          </button>
        )}
      </div>

      {/* Account pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {unapplied.map((m, mi) => {
          const isExp = expandedSet.has(m.account_name)
          const needsManual = m.confidence === 'low' || m.account_name === 'UNKNOWN'
          return (
            <button key={mi} onClick={() => onToggleExpand(m.account_name)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: isExp ? '#f0f9ff' : '#f8fafc', border: `1px solid ${isExp ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: '#374151', cursor: 'pointer', transition: 'all 0.12s' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: confDotColor(m.confidence), flexShrink: 0 }} />
              {m.account_name === 'UNKNOWN' ? '? Unknown' : m.account_name}
              {needsManual && <span style={{ fontSize: 10, color: '#d97706', marginLeft: 1 }}>▾</span>}
            </button>
          )
        })}
      </div>

      {/* Expanded per-account sections */}
      {unapplied.map((m, mi) => {
        if (!expandedSet.has(m.account_name)) return null
        const needsManual = m.confidence === 'low' || m.account_name === 'UNKNOWN'
        const key = `${transcript.session_id}-${m.account_name}`
        const selectedId = manualSels[key] || ''
        const resolvedName = selectedId ? (accounts.find(a => a.id === selectedId)?.name || 'Account') : m.account_name
        const canApply = !needsManual || !!selectedId
        return (
          <div key={mi} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{m.account_name === 'UNKNOWN' ? 'Unknown Account' : m.account_name}</span>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
                color: m.confidence === 'high' ? '#15803d' : m.confidence === 'medium' ? '#92400e' : '#64748b',
                background: m.confidence === 'high' ? '#f0fdf4' : m.confidence === 'medium' ? '#fffbeb' : '#f1f5f9' }}>
                {m.confidence} confidence
              </span>
              {m.sentiment && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: sentColor(m.sentiment), background: sentBg(m.sentiment) }}>
                  {sentLabel(m.sentiment)}
                </span>
              )}
            </div>

            {needsManual && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Select Account</div>
                <select value={selectedId} onChange={e => onManualSel(key, e.target.value)}
                  style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #fde68a', borderRadius: 6, color: '#374151', background: '#fff' }}>
                  <option value=''>— Select account —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}

            {m.intel_summary && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Intel Summary</div>
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6 }}>{m.intel_summary}</div>
              </div>
            )}
            {m.action_items?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#0066CC', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Action Items</div>
                {m.action_items.map((ai, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 5, marginBottom: 2, alignItems: 'flex-start' }}>
                    <span style={{ color: '#007AFF', flexShrink: 0 }}>→</span>
                    <span>{ai.task}{ai.suggested_due_date ? ` (by ${ai.suggested_due_date})` : ''}{ai.contact ? ` · ${ai.contact}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
            {m.contacts_mentioned?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Contacts Mentioned</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {m.contacts_mentioned.map((c, i) => (
                    <span key={i} style={{ fontSize: 11, fontWeight: 500, color: '#374151', background: '#f1f5f9', borderRadius: 5, padding: '2px 7px' }}>
                      {c.name}{c.title ? ` · ${c.title}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {m.vendors_mentioned?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Vendors Mentioned</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {m.vendors_mentioned.map((v, i) => (
                    <span key={i} style={{ fontSize: 11, fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', borderRadius: 4, padding: '2px 7px' }}>{v}</span>
                  ))}
                </div>
              </div>
            )}
            {m.urgency_signals?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Urgency Signals</div>
                {m.urgency_signals.map((s, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 5, marginBottom: 2, alignItems: 'flex-start' }}>
                    <span style={{ color: '#dc2626', fontWeight: 700, flexShrink: 0 }}>!</span>{s}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button onClick={() => onApply(transcript, m, selectedId || undefined)}
                disabled={!canApply}
                style={{ flex: 1, padding: '7px 14px', background: canApply ? '#007AFF' : '#94a3b8', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, cursor: canApply ? 'pointer' : 'not-allowed' }}>
                Apply to {needsManual && selectedId ? resolvedName : (m.account_name === 'UNKNOWN' ? 'Account' : m.account_name)}
              </button>
              <button onClick={() => onSkip(transcript.session_id, m.account_name)}
                style={{ padding: '7px 14px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 7, color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
                Skip
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Stable section components (module-level prevents scroll jumps on re-render) ─

function IntelSection({ entry, approved, onToggle, onField }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 8, border: '1px solid #e2e8f0' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: approved ? 12 : 0, cursor: 'pointer' }}>
        <input type='checkbox' checked={approved} onChange={() => onToggle(!approved)}
          style={{ width: 16, height: 16, accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Intel Log Entry</span>
      </label>
      {approved && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>Date</div>
              <input type='date' value={entry.date} onChange={e => onField('date', e.target.value)}
                style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#111827', background: '#fff', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>Type</div>
              <select value={entry.type} onChange={e => onField('type', e.target.value)}
                style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#111827', background: '#fff' }}>
                {['Call', 'Meeting', 'Email', 'Note'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>Participants</div>
            <input value={entry.participants} onChange={e => onField('participants', e.target.value)} placeholder='Names…'
              style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#111827', background: '#fff', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>Summary</div>
            <textarea value={entry.summary} onChange={e => onField('summary', e.target.value)} rows={3}
              style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#111827', background: '#fff', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }} />
          </div>
          {[['insights', '#0066CC'], ['risks', '#dc2626'], ['opportunities', '#15803d']].map(([field, color]) => (
            <div key={field} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', marginBottom: 3 }}>{field}</div>
              <textarea value={entry[field]} onChange={e => onField(field, e.target.value)} rows={2}
                placeholder={`One ${field.slice(0, -1)} per line…`}
                style={{ width: '100%', fontSize: 11, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#374151', background: '#fff', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.4 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActionsSection({ actions, onUpdate }) {
  if (!actions?.length) return null
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Proposed Actions</div>
      {actions.map(action => (
        <label key={action._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: action.approved ? '#f0f9ff' : '#f8fafc', borderRadius: 7, marginBottom: 4, border: `1px solid ${action.approved ? '#bfdbfe' : '#e2e8f0'}`, cursor: 'pointer', transition: 'all 0.12s' }}>
          <input type='checkbox' checked={action.approved} onChange={() => onUpdate(action._id, { approved: !action.approved })}
            style={{ width: 15, height: 15, marginTop: 2, accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, opacity: action.approved ? 1 : 0.5 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', lineHeight: 1.4, marginBottom: 3 }}>{action.task}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: PRI_COLOR[action.priority] || '#64748b', background: PRI_BG[action.priority] || '#f8fafc', borderRadius: 4, padding: '1px 6px' }}>{action.priority}</span>
              {action.contact && <span style={{ fontSize: 11, color: '#64748b' }}>{action.contact}</span>}
              {action.dueDate && <span style={{ fontSize: 11, color: '#64748b' }}>Due {action.dueDate}</span>}
            </div>
            {action.context && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>{action.context}</div>}
          </div>
        </label>
      ))}
    </div>
  )
}

function ProjectUpdatesSection({ projectUpdates, accounts, accountId, onUpdate }) {
  if (!projectUpdates?.length) return null
  const acct = accounts.find(a => a.id === accountId)
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Project Stage Updates</div>
      {projectUpdates.map((pu, i) => {
        const proj = (acct?.projects || []).find(p => p.name?.toLowerCase() === pu.project_name?.toLowerCase())
        const currentStage = proj?.stage || '—'
        return (
          <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: pu.approved ? '#f0f9ff' : '#f8fafc', borderRadius: 7, marginBottom: 4, border: `1px solid ${pu.approved ? '#bfdbfe' : '#e2e8f0'}`, cursor: 'pointer', transition: 'all 0.12s' }}>
            <input type='checkbox' checked={!!pu.approved} onChange={() => onUpdate(i, { approved: !pu.approved })}
              style={{ width: 15, height: 15, marginTop: 2, accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, opacity: pu.approved ? 1 : 0.5 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', lineHeight: 1.4, marginBottom: 2 }}>
                {pu.project_name}:{' '}
                <span style={{ color: '#64748b' }}>{currentStage}</span>
                {' → '}
                <span style={{ color: '#2563eb', fontWeight: 700 }}>{pu.suggested_stage}</span>
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.4 }}>{pu.reason}</div>
            </div>
          </label>
        )
      })}
    </div>
  )
}

function WhitespaceCard({ item, onUpdate }) {
  return (
    <div style={{ background: item.approved ? '#f0fdf9' : '#f8fafc', border: `1px solid ${item.approved ? '#6ee7b7' : '#e2e8f0'}`, borderRadius: 12, padding: 14, marginBottom: 10, transition: 'background 0.12s, border-color 0.12s' }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', marginBottom: item.approved ? 12 : 0 }}>
        <input type='checkbox' checked={item.approved} onChange={() => onUpdate({ approved: !item.approved })}
          style={{ width: 16, height: 16, marginTop: 2, accentColor: '#059669', cursor: 'pointer', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{item.companyName}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color: '#065f46', background: '#d1fae5' }}>{item.confidence}% match</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{item.reason}</div>
        </div>
      </label>
      {item.approved && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>Company Name</div>
            <input value={item.companyName} onChange={e => onUpdate({ companyName: e.target.value })}
              style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#111827', background: '#fff', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>Notes</div>
            <textarea value={item.notes} onChange={e => onUpdate({ notes: e.target.value })} rows={2}
              style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#111827', background: '#fff', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }} />
          </div>
          <div style={{ marginBottom: item.suggestedTechnologies?.length || item.suggestedContacts?.length ? 8 : 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>Next Step</div>
            <input value={item.nextStep} onChange={e => onUpdate({ nextStep: e.target.value })} placeholder='Verb-first next step…'
              style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#111827', background: '#fff', boxSizing: 'border-box' }} />
          </div>
          {(item.suggestedTechnologies?.length > 0 || item.suggestedContacts?.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(item.suggestedTechnologies || []).map((t, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', borderRadius: 4, padding: '2px 7px' }}>{t}</span>
              ))}
              {(item.suggestedContacts || []).map((c, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 600, color: '#374151', background: '#f3f4f6', borderRadius: 4, padding: '2px 7px' }}>{c}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function IntelInbox({ data, setData, apiKey, onClose }) {
  const mob = typeof window !== 'undefined' && window.innerWidth < 768
  const effectiveKey = apiKey || ''
  const today = new Date().toISOString().split('T')[0]

  const [step, setStep]             = useState('input')
  const [inputText, setInputText]   = useState('')
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [dragOver, setDragOver]     = useState(false)
  const [loadStatus, setLoadStatus] = useState('')
  const [error, setError]           = useState('')
  const [reviewItems, setReviewItems]         = useState([])
  const [lowConfGroups, setLowConfGroups]     = useState([])
  const [lowConfSels, setLowConfSels]         = useState({})
  const [lowConfReview, setLowConfReview]     = useState({})
  const [whitespaceItems, setWhitespaceItems] = useState([])

  // ── Wave AI state ─────────────────────────────────────────────────────────────
  const [waveTranscripts, setWaveTranscripts] = useState([])
  const [waveSessions, setWaveSessions]       = useState([])   // today's sessions from list call
  const [waveSelected, setWaveSelected]       = useState({})   // session_id → boolean
  const [waveSyncing, setWaveSyncing]         = useState(false)
  const [waveAnalyzing, setWaveAnalyzing]     = useState(false)
  const [waveSyncMsg, setWaveSyncMsg]         = useState('')
  const [waveExpanded, setWaveExpanded]       = useState({})   // session_id → Set<account_name>
  const [waveManualSels, setWaveManualSels]   = useState({})   // 'session_id-account_name' → accountId
  const [waveApplied, setWaveApplied]         = useState({})   // 'session_id-account_name' → true
  const [waveToast, setWaveToast]             = useState('')
  const [waveError, setWaveError]             = useState('')

  const findAcct = (id, name) =>
    data.accounts.find(a => a.id === id) ||
    data.accounts.find(a => a.short?.toLowerCase() === (id || '').toLowerCase()) ||
    data.accounts.find(a => a.name?.toLowerCase() === (id || '').toLowerCase()) ||
    data.accounts.find(a => a.name?.toLowerCase() === (name || '').toLowerCase()) ||
    data.accounts.find(a => a.short?.toLowerCase() === (name || '').toLowerCase())

  const buildCtx = () => data.accounts.map(a => {
    const contacts = (a.contacts || []).map(c => `${c.name}${c.title ? ` (${c.title})` : ''}`).join(', ')
    const tech     = (a.techStack || []).map(t => `${t.vendor}${t.status ? ` [${t.status}]` : ''}`).filter(Boolean).join(', ')
    const intel    = (a.intelLog || []).slice(0, 2).map(e => e.summary || '').filter(Boolean).join(' | ')
    return `ID:${a.id} | NAME:${a.name}${a.short ? ` | SHORT:${a.short}` : ''}
CONTACTS: ${contacts || 'none'}
TECH: ${tech || 'none'}
NOTES: ${(a.notes || '').slice(0, 200)}
RECENT INTEL: ${intel || 'none'}`
  }).join('\n\n')

  const initReviewEntry = (m, acct) => ({
    accountId:    acct?.id || m.accountId,
    accountName:  m.accountName || acct?.name || m.accountId,
    confidence:   m.confidence || 0,
    matchReason:  m.matchReason || '',
    intelApproved: true,
    intelEntry: {
      date:          m.suggestedIntelEntry?.date || today,
      type:          m.suggestedIntelEntry?.type || 'Note',
      participants:  m.suggestedIntelEntry?.participants || '',
      summary:       m.suggestedIntelEntry?.summary || '',
      insights:      (m.suggestedIntelEntry?.insights || []).join('\n'),
      risks:         (m.suggestedIntelEntry?.risks || []).join('\n'),
      opportunities: (m.suggestedIntelEntry?.opportunities || []).join('\n'),
    },
    actions: (m.suggestedActions || []).map((a, i) => ({
      _id: i, approved: true,
      task: a.task || '', priority: a.priority || 'Medium',
      dueDate: a.dueDate || '', contact: a.contact || '', context: a.context || ''
    }))
  })

  // ── Wave AI functions ─────────────────────────────────────────────────────────

  const parseWaveTranscript = async (transcriptText) => {
    const accountNames = (data.accounts || []).map(a => a.name).join(', ')
    const truncated = transcriptText.slice(0, 40000)
    const prompt = `You are an intelligent CRM assistant for a cybersecurity sales professional at GuidePoint Security.

You will be given a call transcript and a list of account names. Your job is to:

1. Identify ALL accounts discussed in this transcript. A single call may reference multiple accounts — identify every one mentioned.
2. For each account identified, extract:
   - A 3-5 sentence intel summary specific to that account
   - Any action items or follow-ups mentioned, each with a suggested due date
   - Any contacts mentioned by name and/or title
   - Any vendors, products, or technologies discussed in context of that account
   - Any urgency signals (renewals, deadlines, competitive situations, budget conversations, escalations)
   - The sentiment: positive, neutral, or needs attention

Return ONLY a JSON array with no preamble or markdown:

[
  {
    "account_name": "string (must match one of the provided account names exactly, or UNKNOWN if no match)",
    "confidence": "high|medium|low",
    "intel_summary": "string (3-5 sentences, specific and factual, no fluff)",
    "action_items": [
      {
        "task": "string",
        "suggested_due_date": "YYYY-MM-DD or null",
        "contact": "string or null"
      }
    ],
    "contacts_mentioned": [
      {
        "name": "string",
        "title": "string or null"
      }
    ],
    "vendors_mentioned": ["string"],
    "urgency_signals": ["string"],
    "sentiment": "positive|neutral|needs_attention",
    "project_updates": [
      {
        "project_name": "string (match to an existing project name if possible)",
        "suggested_stage": "string (one of: Awareness|NDA|Intro Call|Demo|POC|Scoping|Pricing|Legal|Procurement|PO Received|Deployed)",
        "reason": "string (why this stage update is suggested based on the transcript)"
      }
    ]
  }
]

Account list: ${accountNames}

Transcript:
${truncated}`

    const { data: resp } = await callClaudeWithRetry({
      model: 'claude-sonnet-4-6', max_tokens: 4000,
      system: 'You are an intelligent CRM assistant for a cybersecurity sales professional. Return ONLY a valid JSON array.',
      messages: [{ role: 'user', content: prompt }]
    }, effectiveKey, msg => { if (msg) setWaveSyncMsg(msg) })

    if (resp.error) throw new Error(resp.error.message || 'AI parsing failed')
    const parsed = extractJSON(resp.content?.[0]?.text || '')
    return Array.isArray(parsed) ? parsed : []
  }

  const fetchWaveSessions = async () => {
    if (waveSyncing || waveSyncInProgress) return
    waveSyncInProgress = true
    setWaveSyncing(true)
    setWaveError('')
    setWaveSyncMsg("Loading today's sessions...")
    setWaveSessions([])
    setWaveSelected({})

    // DEBUG: call test action first to inspect raw Wave API response
    try {
      const testResp = await fetch('/api/wave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test' }) })
      const testResult = await testResp.json()
      console.log('[wave/debug] test action status:', testResp.status, testResult)
    } catch (e) { console.error('[wave/debug] test action failed:', e) }

    try {
      const listResp = await fetch('/api/wave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      })
      const listResult = await listResp.json()
      if (!listResp.ok || listResult.error) {
        throw new Error(listResult.error || `Wave API error ${listResp.status}`)
      }

      const sessions = listResult.sessions || []
      const appliedSessions = data.waveSettings?.appliedSessions || []
      const appliedIds = new Set(appliedSessions.map(a => a.session_id))

      setWaveSessions(sessions)

      // Default selection: unapplied sessions checked, applied sessions unchecked
      const selected = {}
      sessions.forEach(s => { selected[s.id] = !appliedIds.has(s.id) })
      setWaveSelected(selected)

      const now = new Date().toISOString()
      setData(prev => ({ ...prev, waveSettings: { ...(prev.waveSettings || {}), lastSyncedAt: now } }))
    } catch (e) {
      setWaveError(e.message || 'Wave sync failed')
    } finally {
      waveSyncInProgress = false
      setWaveSyncing(false)
      setWaveSyncMsg('')
    }
  }

  const analyzeSelected = async () => {
    if (waveAnalyzing) return
    const toAnalyze = waveSessions.filter(s => waveSelected[s.id])
    if (toAnalyze.length === 0) return

    setWaveAnalyzing(true)
    setWaveError('')

    try {
      const appliedSessions = data.waveSettings?.appliedSessions || []
      const allReviewItems = []

      for (let i = 0; i < toAnalyze.length; i++) {
        const session = toAnalyze[i]
        const sid = session.id
        setWaveSyncMsg(`Analyzing ${i + 1} of ${toAnalyze.length}: ${session.title || sid}...`)

        const tResp = await fetch('/api/wave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'transcript', session_id: sid }),
        })
        const tResult = await tResp.json()
        if (!tResult.transcript_text) continue

        let matches
        try {
          matches = await parseWaveTranscript(tResult.transcript_text)
        } catch { continue }

        const appliedForSession = new Set(
          appliedSessions.filter(a => a.session_id === sid).map(a => a.account_name)
        )
        const sessionDate = session.date ? session.date.split('T')[0] : today

        for (const m of matches) {
          if (appliedForSession.has(m.account_name)) continue
          const acct = data.accounts.find(a =>
            a.name?.toLowerCase() === (m.account_name || '').toLowerCase()
          )
          // skip UNKNOWN with no account match
          if (!acct && m.account_name === 'UNKNOWN') continue

          // Map Wave format → initReviewEntry format
          const reviewInput = {
            accountId:   acct?.id || '',
            accountName: (m.account_name === 'UNKNOWN' ? acct?.name : m.account_name) || m.account_name,
            confidence:  m.confidence === 'high' ? 90 : m.confidence === 'medium' ? 65 : 40,
            matchReason: `Wave call: ${session.title || sid}`,
            suggestedIntelEntry: {
              date:         sessionDate,
              type:         'Call',
              participants: (m.contacts_mentioned || []).map(c => c.name).join(', '),
              summary:      m.intel_summary || '',
              insights:     m.vendors_mentioned || [],
              risks:        m.urgency_signals || [],
              opportunities: [],
            },
            suggestedActions: (m.action_items || []).map(ai => ({
              task:     ai.task || '',
              priority: 'High',
              dueDate:  ai.suggested_due_date || '',
              contact:  ai.contact || '',
              context:  '',
            })),
          }

          allReviewItems.push({
            ...initReviewEntry(reviewInput, acct),
            waveSessionId:  sid,
            projectUpdates: (m.project_updates || []).map(pu => ({ ...pu, approved: true })),
          })
        }
      }

      setWaveSessions([])
      setWaveSelected({})

      if (allReviewItems.length > 0) {
        setReviewItems(allReviewItems)
        setLowConfGroups([])
        setLowConfSels({})
        setLowConfReview({})
        setWhitespaceItems([])
        setStep('review')
      } else {
        setWaveError('No new intelligence found in selected sessions.')
      }
    } catch (e) {
      setWaveError(e.message || 'Analysis failed')
    } finally {
      setWaveAnalyzing(false)
      setWaveSyncMsg('')
    }
  }

  const applyWaveToAccount = (transcript, match, overrideAccountId) => {
    const targetAcct = overrideAccountId
      ? data.accounts.find(a => a.id === overrideAccountId)
      : data.accounts.find(a => a.name === match.account_name)
    if (!targetAcct) return

    const sessionDateStr = (transcript.date || '').includes('T') ? transcript.date.split('T')[0] : (transcript.date || today)
    const intelId = uid()

    const newEntry = {
      id: intelId,
      type: 'Call',
      date: sessionDateStr,
      summary: match.intel_summary || '',
      insights: [],
      risks: match.urgency_signals || [],
      opportunities: [],
      participants: (match.contacts_mentioned || []).map(c => c.name).join(', '),
      source: 'Wave AI',
      sessionId: transcript.session_id,
    }

    const newFollowUps = (match.action_items || []).map(ai => ({
      id: uid(),
      task: ai.task || '',
      dueDate: ai.suggested_due_date || '',
      contact: ai.contact || '',
      priority: 'High',
      status: 'Open',
      context: '',
    }))

    // Suggest new contacts without auto-adding
    const existingNames = new Set((targetAcct.contacts || []).map(c => (c.name || '').toLowerCase()))
    const newContactSuggestions = (match.contacts_mentioned || [])
      .filter(c => c.name && !existingNames.has(c.name.toLowerCase()))
      .map(c => ({ id: uid(), name: c.name, title: c.title || '', source: 'Wave AI', sessionId: transcript.session_id }))

    // Build updated state synchronously so we can persist immediately
    const appliedEntry = { session_id: transcript.session_id, account_name: targetAcct.name, applied_at: new Date().toISOString() }
    const prevApplied = (data.waveSettings?.appliedSessions || []).slice(-499)
    const next = {
      ...data,
      accounts: data.accounts.map(a => {
        if (a.id !== targetAcct.id) return a
        return {
          ...a,
          intelLog: [newEntry, ...(a.intelLog || [])],
          followUps: [...(a.followUps || []), ...newFollowUps],
          lastContact: sessionDateStr,
          contactSuggestions: [...(a.contactSuggestions || []), ...newContactSuggestions],
        }
      }),
      waveSettings: { ...(data.waveSettings || {}), appliedSessions: [...prevApplied, appliedEntry] },
    }
    setData(next)
    saveData(next, null).catch(e => console.error('[wave/apply] save failed:', e.message))

    // Mark applied in local state
    const appliedKey = `${transcript.session_id}-${match.account_name}`
    setWaveApplied(prev => ({ ...prev, [appliedKey]: true }))

    // Remove this match from the transcript card; hide card if empty
    setWaveTranscripts(prev =>
      prev.map(t => t.session_id !== transcript.session_id ? t
        : { ...t, matches: t.matches.filter(m => m.account_name !== match.account_name) }
      ).filter(t => t.matches.length > 0)
    )

    setWaveToast(`Intel added to ${targetAcct.name}`)
    setTimeout(() => setWaveToast(''), 3000)
  }

  const skipWaveMatch = (sessionId, accountName) => {
    const appliedKey = `${sessionId}-${accountName}`
    setWaveApplied(prev => ({ ...prev, [appliedKey]: true }))
    setWaveTranscripts(prev =>
      prev.map(t => t.session_id !== sessionId ? t
        : { ...t, matches: t.matches.filter(m => m.account_name !== accountName) }
      ).filter(t => t.matches.length > 0)
    )
  }

  const waveToggleExpand = (sessionId, accountName) => {
    setWaveExpanded(prev => {
      const set = new Set(prev[sessionId] || [])
      set.has(accountName) ? set.delete(accountName) : set.add(accountName)
      return { ...prev, [sessionId]: set }
    })
  }

  const waveSetManualSel = (key, accountId) => {
    setWaveManualSels(prev => ({ ...prev, [key]: accountId }))
  }

  // ── File handling ─────────────────────────────────────────────────────────────

  const handleFile = async (file) => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (!ACCEPTED_EXTS.includes(ext)) {
      setError(`Unsupported file type: .${ext} — use PDF, DOCX, TXT, or CSV.`)
      return
    }
    if (file.size > 32 * 1024 * 1024) {
      setError(`${file.name} is too large (${fmtFileSize(file.size)}). Maximum 32MB.`)
      return
    }
    const fileId = uid()
    setUploadedFiles(prev => [...prev, { id: fileId, name: file.name, size: file.size, status: 'extracting', text: '', error: '' }])
    setError('')
    try {
      const text = await extractFileText(file)
      setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'ready', text } : f))
    } catch (e) {
      setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error', error: e.message || 'Extraction failed' } : f))
    }
  }

  const removeFile = id => setUploadedFiles(prev => prev.filter(f => f.id !== id))

  // ── AI analysis ───────────────────────────────────────────────────────────────

  const analyze = async () => {
    if (!effectiveKey) { setError('Add your Anthropic API key in Settings first.'); return }
    const readyFiles = uploadedFiles.filter(f => f.status === 'ready')
    if (!inputText.trim() && readyFiles.length === 0) {
      setError('Paste text or upload a document to analyze.')
      return
    }

    setStep('loading'); setError(''); setLoadStatus('Building account context…')

    const ctx = buildCtx()
    const existingWsNames = (data.whitespaceAccounts || []).map(a => a.name).filter(Boolean).join(', ')

    const contentParts = []
    if (inputText.trim()) contentParts.push(inputText.trim())
    readyFiles.forEach(f => contentParts.push(`[Document: ${f.name}]\n${f.text}`))
    const combinedContent = contentParts.join('\n\n---\n\n').slice(0, 40000)

    const prompt = `You are an intelligence routing AI for a cybersecurity sales CRM at GuidePoint Security.

The user pasted notes, transcripts, emails, vendor updates, or uploaded documents. Your job:
1. Identify which CRM accounts are discussed — using contact names, vendor names, technologies, and context clues
2. Propose an Intel Log entry and optional Actions for each matched account
3. Identify NEW companies NOT in the CRM that may be prospects (whitespace opportunities)
4. Assign confidence scores based on evidence strength

ACCOUNT MATCHING RULES:
- Do NOT rely solely on explicit account name mentions
- Contact first names, vendor names, and technology names are strong signals
- Confidence ≥60 → include in "matches" (shown directly)
- Confidence <60 → include in "lowConfidenceGroups" (user selects manually)

ACCOUNTS IN CRM (only match to these):
${ctx}

${existingWsNames ? `EXISTING WHITESPACE (do NOT re-suggest these):\n${existingWsNames}\n` : ''}TODAY: ${today}

INPUT:
${combinedContent}

Return ONLY valid compact JSON (no markdown):
{
  "matches": [
    {
      "accountId": "exact ID from ID: field above",
      "accountName": "exact account name",
      "confidence": 85,
      "matchReason": "one sentence: which signals matched this account",
      "suggestedIntelEntry": {
        "date": "${today}",
        "type": "Call|Meeting|Email|Note",
        "participants": "names mentioned",
        "summary": "2-3 sentence account-specific summary",
        "insights": ["insight"],
        "risks": ["risk"],
        "opportunities": ["opportunity"]
      },
      "suggestedActions": [
        {
          "task": "3-8 word verb-first action",
          "priority": "Critical|High|Medium|Low",
          "dueDate": "YYYY-MM-DD or empty string",
          "contact": "first and last name",
          "context": "1-2 sentence background"
        }
      ]
    }
  ],
  "lowConfidenceGroups": [
    {
      "candidates": [
        {"accountId": "exact ID", "accountName": "name", "confidence": 35, "matchReason": "..."},
        {"accountId": "exact ID", "accountName": "name", "confidence": 20, "matchReason": "..."}
      ],
      "suggestedIntelEntry": {
        "date": "${today}", "type": "Note", "participants": "",
        "summary": "summary of this uncertain intelligence",
        "insights": [], "risks": [], "opportunities": []
      },
      "suggestedActions": []
    }
  ],
  "whitespaceOpportunities": [
    {
      "companyName": "Company Name",
      "confidence": 70,
      "reason": "one sentence: why this company was identified as a prospect",
      "notes": "2-3 sentence summary of what was said or implied about this company",
      "suggestedTechnologies": ["technology or vendor name"],
      "suggestedContacts": ["Name, Title if mentioned"],
      "nextStep": "verb-first next step for this prospect"
    }
  ]
}
Rules: matches[] only for confidence ≥60 · max 3 actions per account · intel entries must be account-specific · whitespaceOpportunities only for companies NOT in the CRM · exclude GuidePoint Security and the user themselves · if nothing found return empty arrays`

    try {
      setLoadStatus('Analyzing with AI…')
      const { data: resp } = await callClaudeWithRetry({
        model: 'claude-sonnet-4-6', max_tokens: 4000,
        system: 'You are an intelligence routing AI for a cybersecurity sales CRM. Return ONLY valid compact JSON.',
        messages: [{ role: 'user', content: prompt }]
      }, effectiveKey, msg => { if (msg) setLoadStatus(msg) })

      if (resp.error) throw new Error(resp.error.message === 'OVERLOADED' ? 'OVERLOADED' : resp.error.message)
      const parsed = extractJSON(resp.content?.[0]?.text || '')
      if (!parsed) throw new Error('Could not parse AI response. Please try again.')

      const matches = parsed.matches || []
      const lowConf = parsed.lowConfidenceGroups || []
      const wsOps   = parsed.whitespaceOpportunities || []

      setReviewItems(matches.map(m => initReviewEntry(m, findAcct(m.accountId, m.accountName))))

      const lcr = {}
      lowConf.forEach((group, idx) => {
        lcr[idx] = {
          intelApproved: true,
          intelEntry: {
            date:          group.suggestedIntelEntry?.date || today,
            type:          group.suggestedIntelEntry?.type || 'Note',
            participants:  group.suggestedIntelEntry?.participants || '',
            summary:       group.suggestedIntelEntry?.summary || '',
            insights:      (group.suggestedIntelEntry?.insights || []).join('\n'),
            risks:         (group.suggestedIntelEntry?.risks || []).join('\n'),
            opportunities: (group.suggestedIntelEntry?.opportunities || []).join('\n'),
          },
          actions: (group.suggestedActions || []).map((a, i) => ({
            _id: i, approved: true,
            task: a.task || '', priority: a.priority || 'Medium',
            dueDate: a.dueDate || '', contact: a.contact || '', context: a.context || ''
          }))
        }
      })
      setLowConfGroups(lowConf)
      setLowConfSels({})
      setLowConfReview(lcr)
      setWhitespaceItems(wsOps.map(w => ({
        companyName:          w.companyName || '',
        confidence:           w.confidence || 0,
        reason:               w.reason || '',
        notes:                w.notes || '',
        suggestedTechnologies: w.suggestedTechnologies || [],
        suggestedContacts:    w.suggestedContacts || [],
        nextStep:             w.nextStep || '',
        approved:             true,
      })))
      setStep('review')
    } catch (e) {
      const msg = e.message || ''
      setError(msg === 'OVERLOADED' ? 'Anthropic API is busy. Please wait 30 seconds and try again.' : `Analysis failed: ${msg}`)
      setStep('input')
    }
  }

  // ── State updaters ────────────────────────────────────────────────────────────

  const updateItem  = (idx, u) => setReviewItems(p => p.map((it, i) => i === idx ? { ...it, ...u } : it))
  const updateIntel = (idx, f, v) => setReviewItems(p => p.map((it, i) => i === idx ? { ...it, intelEntry: { ...it.intelEntry, [f]: v } } : it))
  const updateAct   = (idx, aid, u) => setReviewItems(p => p.map((it, i) => i === idx ? { ...it, actions: it.actions.map(a => a._id === aid ? { ...a, ...u } : a) } : it))

  const updateLCIntel    = (gi, f, v) => setLowConfReview(p => ({ ...p, [gi]: { ...p[gi], intelEntry: { ...p[gi].intelEntry, [f]: v } } }))
  const updateLCAct      = (gi, aid, u) => setLowConfReview(p => ({ ...p, [gi]: { ...p[gi], actions: p[gi].actions.map(a => a._id === aid ? { ...a, ...u } : a) } }))
  const updateWS         = (idx, u) => setWhitespaceItems(p => p.map((it, i) => i === idx ? { ...it, ...u } : it))
  const updateProjUpdate = (idx, puIdx, u) => setReviewItems(p => p.map((it, i) => i !== idx ? it : {
    ...it,
    projectUpdates: (it.projectUpdates || []).map((pu, j) => j === puIdx ? { ...pu, ...u } : pu),
  }))

  const lines = s => (s || '').split('\n').map(x => x.trim()).filter(Boolean)

  // ── Save ──────────────────────────────────────────────────────────────────────

  const saveApproved = () => {
    const toSave = reviewItems.map(item => ({
      ...item,
      intelEntry: {
        ...item.intelEntry,
        insights:      lines(item.intelEntry.insights),
        risks:         lines(item.intelEntry.risks),
        opportunities: lines(item.intelEntry.opportunities),
      }
    }))
    Object.entries(lowConfSels).forEach(([gi, sel]) => {
      if (!sel || sel === 'skip') return
      const rev = lowConfReview[parseInt(gi)]
      if (!rev) return
      const acct = data.accounts.find(a => a.id === sel)
      toSave.push({
        accountId: sel, accountName: acct?.name || sel,
        intelApproved: rev.intelApproved,
        intelEntry: {
          ...rev.intelEntry,
          insights:      lines(rev.intelEntry.insights),
          risks:         lines(rev.intelEntry.risks),
          opportunities: lines(rev.intelEntry.opportunities),
        },
        actions: rev.actions
      })
    })

    const wsToSave = whitespaceItems.filter(w => w.approved && w.companyName.trim())
    const now = new Date().toISOString()

    setData(prev => {
      const next = { ...prev }

      // Intel Logs + Actions → existing accounts
      next.accounts = prev.accounts.map(acct => {
        const items = toSave.filter(it => it.accountId === acct.id)
        if (!items.length) return acct
        let updated = { ...acct }
        for (const item of items) {
          if (item.intelApproved && item.intelEntry?.summary?.trim()) {
            updated.intelLog = [{ ...item.intelEntry, id: uid() }, ...(updated.intelLog || [])]
            if (item.intelEntry.date) updated.lastContact = item.intelEntry.date
          }
          const approved = (item.actions || []).filter(a => a.approved && a.task?.trim())
          if (approved.length) {
            const fus = approved.map(({ _id, approved: _a, ...rest }) => ({ ...rest, id: uid(), status: 'Open' }))
            updated.followUps = [...(updated.followUps || []), ...fus]
          }
          // Apply approved project stage updates
          const approvedProjUpdates = (item.projectUpdates || []).filter(p => p.approved)
          if (approvedProjUpdates.length) {
            updated.projects = (updated.projects || []).map(proj => {
              const pu = approvedProjUpdates.find(u => proj.name?.toLowerCase() === u.project_name?.toLowerCase())
              return pu ? { ...proj, stage: pu.suggested_stage } : proj
            })
          }
        }
        return updated
      })

      // Record Wave sessions as applied for items that went through Wave flow
      const waveItems = toSave.filter(it => it.waveSessionId && it.intelApproved && it.intelEntry?.summary?.trim())
      if (waveItems.length > 0) {
        const newApplied = waveItems.map(it => ({
          session_id:   it.waveSessionId,
          account_name: it.accountName,
          applied_at:   now,
        }))
        const prevApplied = (prev.waveSettings?.appliedSessions || []).slice(-(500 - newApplied.length))
        next.waveSettings = { ...(prev.waveSettings || {}), appliedSessions: [...prevApplied, ...newApplied] }
      }

      // Whitespace Opportunities → whitespaceAccounts
      if (wsToSave.length > 0) {
        next.whitespaceAccounts = [
          ...(prev.whitespaceAccounts || []),
          ...wsToSave.map(w => {
            const noteText = [
              w.notes.trim(),
              w.nextStep.trim() ? `Next step: ${w.nextStep.trim()}` : ''
            ].filter(Boolean).join('\n\n')
            return {
              id: uid(),
              name: w.companyName.trim(),
              hq: '', industry: '', employees: '', revenue: '',
              status: 'Prospect',
              contacts: [],
              technologies: w.suggestedTechnologies || [],
              notes: [],
              intelLog: noteText ? [{ id: uid(), text: noteText, date: today, addedBy: 'intel-inbox' }] : [],
              addedAt: now,
              updatedAt: now,
            }
          })
        ]
      }

      return next
    })
    setStep('done')
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  const readyFileCount = uploadedFiles.filter(f => f.status === 'ready').length

  const totals = (() => {
    let intel = 0, actions = 0, whitespace = 0
    reviewItems.forEach(it => {
      if (it.intelApproved && it.intelEntry?.summary?.trim()) intel++
      actions += it.actions.filter(a => a.approved).length
    })
    Object.entries(lowConfSels).forEach(([gi, sel]) => {
      if (!sel || sel === 'skip') return
      const rev = lowConfReview[parseInt(gi)]; if (!rev) return
      if (rev.intelApproved && rev.intelEntry?.summary?.trim()) intel++
      actions += rev.actions.filter(a => a.approved).length
    })
    whitespace = whitespaceItems.filter(w => w.approved && w.companyName.trim()).length
    return { intel, actions, whitespace }
  })()

  const hasAnyReviewContent = reviewItems.length > 0 || lowConfGroups.length > 0 || whitespaceItems.length > 0
  const hasFooter = step === 'review' && (
    reviewItems.length > 0 ||
    Object.values(lowConfSels).some(s => s && s !== 'skip') ||
    whitespaceItems.length > 0
  )
  const saveDisabled = totals.intel === 0 && totals.actions === 0 && totals.whitespace === 0

  // ── RENDER ────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: mob ? 0 : 20 }}
      onClick={step === 'loading' ? undefined : onClose}>
      <style>{`@keyframes iiSpin{to{transform:rotate(360deg)}}`}</style>
      <div
        style={{ position: 'relative', background: '#FFFFFF', borderRadius: mob ? 0 : 16, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', width: mob ? '100%' : 'min(720px,95vw)', maxHeight: mob ? '100%' : '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: mob ? '100%' : 'auto' }}
        onClick={e => e.stopPropagation()}>

        {/* ── Modal header ── */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="14" viewBox="0 0 22 17" fill="none"><rect x="1" y="1" width="20" height="15" rx="2" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6" /><path d="M1 5l10 6 10-6" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>Intel Inbox</div>
                {step === 'review' && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                    {reviewItems.length} account{reviewItems.length !== 1 ? 's' : ''} matched
                    {lowConfGroups.length > 0 ? ` · ${lowConfGroups.length} uncertain` : ''}
                    {whitespaceItems.length > 0 ? ` · ${whitespaceItems.length} whitespace` : ''}
                  </div>
                )}
              </div>
            </div>
            {step !== 'loading' && (
              <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

          {/* ── Wave AI Transcripts — always visible, always first ── */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1 }}>W</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Wave AI Transcripts</div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                  {data.waveSettings?.lastSyncedAt ? `Last synced ${fmtSyncTime(data.waveSettings.lastSyncedAt)}` : 'Never synced'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button onClick={fetchWaveSessions} disabled={waveSyncing || waveAnalyzing}
                  style={{ padding: '5px 12px', background: '#fff', border: '1px solid #007AFF', borderRadius: 8, color: '#007AFF', fontSize: 12, fontWeight: 600, cursor: (waveSyncing || waveAnalyzing) ? 'default' : 'pointer', opacity: (waveSyncing || waveAnalyzing) ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                  {waveSyncing ? 'Loading…' : 'Sync Now'}
                </button>
              </div>
            </div>

            {/* Loading spinner */}
            {waveSyncing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #c4b5fd', borderTop: '2px solid #7c3aed', borderRadius: '50%', animation: 'iiSpin 0.75s linear infinite', flexShrink: 0 }} />
                {waveSyncMsg || "Loading today's sessions..."}
              </div>
            )}

            {/* Analyzing spinner */}
            {waveAnalyzing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #c4b5fd', borderTop: '2px solid #7c3aed', borderRadius: '50%', animation: 'iiSpin 0.75s linear infinite', flexShrink: 0 }} />
                {waveSyncMsg || 'Analyzing sessions...'}
              </div>
            )}

            {/* Error */}
            {waveError && !waveSyncing && !waveAnalyzing && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 8 }}>
                {waveError}
              </div>
            )}

            {/* Session list for manual selection */}
            {waveSessions.length > 0 && !waveSyncing && !waveAnalyzing && (() => {
              const appliedIds = new Set((data.waveSettings?.appliedSessions || []).map(a => a.session_id))
              const unappliedCount = waveSessions.filter(s => !appliedIds.has(s.id)).length
              const checkedCount = waveSessions.filter(s => waveSelected[s.id]).length

              const fmtD = d => {
                if (!d) return ''
                try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } catch { return d }
              }
              const fmtDur = sec => {
                if (sec == null || sec === '') return ''
                if (typeof sec === 'string') return sec
                const m = Math.floor(sec / 60), s = sec % 60
                return `${m}:${String(s).padStart(2, '0')}`
              }

              return (
                <div style={{ marginTop: 4 }}>
                  {/* Select All / Deselect All */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <button
                      onClick={() => {
                        const sel = {}
                        waveSessions.forEach(s => { sel[s.id] = !appliedIds.has(s.id) })
                        setWaveSelected(sel)
                      }}
                      style={{ fontSize: 12, color: '#007AFF', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontWeight: 500 }}>
                      Select All
                    </button>
                    <span style={{ fontSize: 12, color: '#d1d5db' }}>·</span>
                    <button
                      onClick={() => setWaveSelected({})}
                      style={{ fontSize: 12, color: '#007AFF', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontWeight: 500 }}>
                      Deselect All
                    </button>
                  </div>
                  {waveSessions.map(s => {
                    const isApplied = appliedIds.has(s.id)
                    const isChecked = !!waveSelected[s.id]
                    const durStr = fmtDur(s.duration)
                    return (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9', cursor: isApplied ? 'default' : 'pointer', opacity: isApplied ? 0.55 : 1 }}>
                        <input
                          type='checkbox'
                          checked={isChecked}
                          disabled={isApplied}
                          onChange={() => !isApplied && setWaveSelected(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                          style={{ width: 15, height: 15, accentColor: '#007AFF', cursor: isApplied ? 'default' : 'pointer', flexShrink: 0 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: isApplied ? '#9CA3AF' : '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.title || 'Call Recording'}
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            {fmtD(s.date)}{durStr ? ` · ${durStr}` : ''}
                          </div>
                        </div>
                        {isApplied && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#D1FAE5', color: '#059669', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            Already logged
                          </span>
                        )}
                      </label>
                    )
                  })}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                    <span style={{ fontSize: 12, color: '#6B7280' }}>
                      {checkedCount} of {unappliedCount} selected
                    </span>
                    <button
                      onClick={analyzeSelected}
                      disabled={checkedCount === 0}
                      style={{ padding: '6px 16px', background: checkedCount === 0 ? '#94a3b8' : '#007AFF', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: checkedCount === 0 ? 'not-allowed' : 'pointer' }}>
                      Analyze Selected
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* Transcript cards */}
            {waveTranscripts.length > 0 && !waveAnalyzing && (
              <div style={{ marginTop: waveSessions.length > 0 ? 16 : 4 }}>
                {waveTranscripts.map(t => (
                  <WaveTranscriptCard
                    key={t.session_id}
                    transcript={t}
                    accounts={data.accounts || []}
                    expandedSet={waveExpanded[t.session_id] || new Set()}
                    onToggleExpand={name => waveToggleExpand(t.session_id, name)}
                    appliedSet={new Set(Object.keys(waveApplied).filter(k => k.startsWith(t.session_id + '-')))}
                    manualSels={waveManualSels}
                    onManualSel={waveSetManualSel}
                    onApply={applyWaveToAccount}
                    onSkip={skipWaveMatch}
                  />
                ))}
              </div>
            )}

            {/* Empty state — shown after a sync that returned no sessions */}
            {waveSessions.length === 0 && !waveSyncing && !waveAnalyzing && !waveError && waveTranscripts.length === 0 && data.waveSettings?.lastSyncedAt && (
              <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '8px 0 2px' }}>No Wave sessions found for today.</div>
            )}
          </div>

          {/* INPUT */}
          {step === 'input' && (
            <div style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: '0 0 14px' }}>
                Paste notes, transcripts, vendor updates, or emails — or upload a document. AI maps intelligence to accounts, suggests Actions, and identifies whitespace.
              </p>

              {!effectiveKey && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8, marginBottom: 12 }}>
                  <span style={{ color: '#d97706', fontSize: 14, flexShrink: 0 }}>⚠</span>
                  <span style={{ fontSize: 12, color: '#92400e' }}>No API key — go to Settings and add your Anthropic API key.</span>
                </div>
              )}
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{error}</div>
              )}

              {/* Text input */}
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                rows={7}
                placeholder={'Paste notes here… or upload a document below.\n\nExamples:\n• "Had a call with Rudy about the QRadar migration…"\n• "Email from Jamie about the Saviynt renewal…"\n• "Meeting with the CISO — she wants to accelerate Wiz CSPM…"'}
                style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, color: '#111827', padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, resize: 'vertical', minHeight: 140, fontFamily: 'inherit', lineHeight: 1.6, outline: 'none', display: 'block' }}
                onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
              />
              {inputText.length > 0 && (
                <div style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{inputText.length.toLocaleString()} characters</div>
              )}

              {/* File upload zone */}
              <div style={{ marginTop: 10 }}>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragEnter={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
                  onDrop={e => { e.preventDefault(); setDragOver(false); Array.from(e.dataTransfer.files).forEach(handleFile) }}
                  style={{ border: `2px dashed ${dragOver ? '#2563eb' : '#d1d5db'}`, borderRadius: 8, background: dragOver ? 'rgba(37,99,235,0.04)' : '#fafafa', transition: 'all 0.15s', padding: '9px 14px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                    <input
                      type='file' multiple accept='.pdf,.docx,.doc,.txt,.csv'
                      style={{ display: 'none' }}
                      onChange={e => { Array.from(e.target.files).forEach(handleFile); e.target.value = '' }}
                    />
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"><path d="M7 10V3M4 6l3-3 3 3"/><path d="M2 11h10"/></svg>
                    <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Upload documents</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>PDF, DOCX, TXT, CSV · drag or click</span>
                  </label>
                </div>

                {uploadedFiles.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {uploadedFiles.map(f => (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: f.status === 'error' ? '#fef2f2' : f.status === 'ready' ? '#f0fdf4' : '#f8fafc', border: `1px solid ${f.status === 'error' ? '#fecaca' : f.status === 'ready' ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 7, padding: '6px 10px' }}>
                        <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>
                          {f.status === 'extracting' ? '⏳' : f.status === 'error' ? '❌' : '✅'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                          <div style={{ fontSize: 11, color: f.status === 'error' ? '#dc2626' : '#64748b' }}>
                            {f.status === 'extracting' ? 'Extracting…' :
                             f.status === 'error'     ? f.error :
                             `Ready · ${fmtFileSize(f.size)} · ${f.text.length.toLocaleString()} chars`}
                          </div>
                        </div>
                        <button onClick={() => removeFile(f.id)} title='Remove' style={{ width: 22, height: 22, borderRadius: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 17, lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  onClick={analyze}
                  disabled={(!inputText.trim() && readyFileCount === 0) || !effectiveKey}
                  style={{ flex: 1, padding: '11px 16px', background: (!inputText.trim() && readyFileCount === 0) || !effectiveKey ? '#94a3b8' : 'linear-gradient(135deg,#0055CC 0%,#2563eb 100%)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: (!inputText.trim() && readyFileCount === 0) || !effectiveKey ? 'not-allowed' : 'pointer' }}>
                  Analyze ✨
                </button>
                <button onClick={onClose} style={{ padding: '11px 16px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, color: '#64748b', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              </div>

            </div>
          )}

          {/* LOADING */}
          {step === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '70px 24px', gap: 16 }}>
              <div style={{ width: 44, height: 44, border: '3px solid #e2e8f0', borderTop: '3px solid #2563eb', borderRadius: '50%', animation: 'iiSpin 0.8s linear infinite' }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Analyzing…</div>
              <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', maxWidth: 340, lineHeight: 1.6 }}>{loadStatus || 'Checking accounts, identifying whitespace…'}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                {data.accounts.length} account{data.accounts.length !== 1 ? 's' : ''}
                {readyFileCount > 0 ? ` · ${readyFileCount} document${readyFileCount !== 1 ? 's' : ''}` : ''}
                {' · Usually 15–30 seconds'}
              </div>
            </div>
          )}

          {/* REVIEW */}
          {step === 'review' && (
            <div style={{ padding: '16px 24px 20px' }}>

              {!hasAnyReviewContent && (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>No matches found</div>
                  <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>The AI couldn't identify accounts or whitespace in this content. Try adding contact names, company references, or technology names.</div>
                  <button onClick={() => setStep('input')} style={{ marginTop: 20, padding: '10px 22px', background: '#2563eb', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Try Again</button>
                </div>
              )}

              {/* High-confidence account matches */}
              {reviewItems.map((item, idx) => (
                <div key={item.accountId + idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{item.accountName}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: item.confidence >= 80 ? '#15803d' : item.confidence >= 60 ? '#d97706' : '#dc2626', background: item.confidence >= 80 ? '#f0fdf4' : item.confidence >= 60 ? '#fffbeb' : '#fef2f2' }}>
                          {item.confidence}% match
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{item.matchReason}</div>
                    </div>
                  </div>
                  <IntelSection
                    entry={item.intelEntry} approved={item.intelApproved}
                    onToggle={v => updateItem(idx, { intelApproved: v })}
                    onField={(f, v) => updateIntel(idx, f, v)}
                  />
                  <ActionsSection
                    actions={item.actions}
                    onUpdate={(aid, u) => updateAct(idx, aid, u)}
                  />
                  <ProjectUpdatesSection
                    projectUpdates={item.projectUpdates}
                    accounts={data.accounts || []}
                    accountId={item.accountId}
                    onUpdate={(puIdx, u) => updateProjUpdate(idx, puIdx, u)}
                  />
                </div>
              ))}

              {/* Low-confidence groups */}
              {lowConfGroups.map((group, gi) => {
                const sel = lowConfSels[gi]
                const rev = lowConfReview[gi]
                return (
                  <div key={gi} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 15 }}>⚠</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Low Confidence — Select Account</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#78350f', marginBottom: 12, lineHeight: 1.5 }}>AI found relevant intelligence but couldn't confidently match it. Select the correct account or skip.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: sel && sel !== 'skip' ? 14 : 0 }}>
                      {group.candidates.map(c => (
                        <label key={c.accountId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: sel === c.accountId ? 'rgba(37,99,235,0.07)' : 'rgba(255,255,255,0.75)', borderRadius: 7, border: `1px solid ${sel === c.accountId ? '#93c5fd' : 'rgba(0,0,0,0.07)'}`, cursor: 'pointer' }}>
                          <input type='radio' name={`lc-${gi}`} value={c.accountId} checked={sel === c.accountId} onChange={() => setLowConfSels(p => ({ ...p, [gi]: c.accountId }))} style={{ accentColor: '#2563eb', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{c.accountName}</span>
                              <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', borderRadius: 4, padding: '1px 5px' }}>{c.confidence}%</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{c.matchReason}</div>
                          </div>
                        </label>
                      ))}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', cursor: 'pointer' }}>
                        <input type='radio' name={`lc-${gi}`} value='skip' checked={sel === 'skip'} onChange={() => setLowConfSels(p => ({ ...p, [gi]: 'skip' }))} style={{ accentColor: '#94a3b8', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>Skip — don't assign to any account</span>
                      </label>
                    </div>
                    {sel && sel !== 'skip' && rev && (
                      <div style={{ paddingTop: 14, borderTop: '1px solid #fde68a' }}>
                        <IntelSection
                          entry={rev.intelEntry} approved={rev.intelApproved}
                          onToggle={v => setLowConfReview(p => ({ ...p, [gi]: { ...p[gi], intelApproved: v } }))}
                          onField={(f, v) => updateLCIntel(gi, f, v)}
                        />
                        <ActionsSection
                          actions={rev.actions}
                          onUpdate={(aid, u) => updateLCAct(gi, aid, u)}
                        />
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Whitespace Opportunities */}
              {whitespaceItems.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px', padding: '10px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#059669" strokeWidth="1.5"/><path d="M4.5 7h5M7 4.5v5" stroke="#059669" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#065f46' }}>Whitespace Opportunities</span>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>{whitespaceItems.length} new prospect{whitespaceItems.length !== 1 ? 's' : ''} identified</span>
                  </div>
                  {whitespaceItems.map((item, idx) => (
                    <WhitespaceCard key={idx} item={item} onUpdate={u => updateWS(idx, u)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DONE */}
          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '70px 24px', gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Updates saved</div>
              <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 1.6, maxWidth: 340 }}>
                Intelligence distributed across accounts. Your data will auto-save in a moment.
              </div>
              <button onClick={onClose} style={{ marginTop: 8, padding: '10px 26px', background: '#2563eb', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Done</button>
            </div>
          )}
        </div>

        {/* ── Wave toast ── */}
        {waveToast && (
          <div style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: '#f1f5f9', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500, zIndex: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {waveToast}
          </div>
        )}

        {/* ── Footer ── */}
        {hasFooter && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', flexShrink: 0, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {totals.intel > 0 && <span>{totals.intel} intel {totals.intel === 1 ? 'entry' : 'entries'}</span>}
                {totals.intel > 0 && (totals.actions > 0 || totals.whitespace > 0) && <span style={{ color: '#cbd5e1' }}>·</span>}
                {totals.actions > 0 && <span>{totals.actions} action{totals.actions !== 1 ? 's' : ''}</span>}
                {totals.actions > 0 && totals.whitespace > 0 && <span style={{ color: '#cbd5e1' }}>·</span>}
                {totals.whitespace > 0 && <span style={{ color: '#059669', fontWeight: 600 }}>{totals.whitespace} whitespace</span>}
                {saveDisabled && <span style={{ color: '#94a3b8' }}>No items approved</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setStep('input')} style={{ padding: '9px 14px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 7, color: '#64748b', fontSize: 13, cursor: 'pointer' }}>← Re-analyze</button>
                <button onClick={saveApproved} disabled={saveDisabled}
                  style={{ padding: '9px 20px', background: saveDisabled ? '#94a3b8' : 'linear-gradient(135deg,#0055CC 0%,#2563eb 100%)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saveDisabled ? 'not-allowed' : 'pointer' }}>
                  Save Approved Updates
                </button>
              </div>
            </div>
          </div>
        )}
        {step === 'review' && !hasFooter && hasAnyReviewContent && (
          <div style={{ padding: '12px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setStep('input')} style={{ padding: '9px 14px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 7, color: '#64748b', fontSize: 13, cursor: 'pointer' }}>← Re-analyze</button>
          </div>
        )}
      </div>
    </div>
  )
}
