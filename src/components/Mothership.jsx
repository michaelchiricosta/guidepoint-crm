import React, { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Brain, Send, Trash2, Upload, Search, FileText, AlertCircle } from 'lucide-react'
import { S } from '../theme.js'
import { supabase } from '../supabase.js'
import { callClaudeWithRetry } from '../utils/aiHelper.js'

// ── CDN loaders ───────────────────────────────────────────────────────────────

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

const FILE_CHAR_LIMIT = 50000

const extractFileText = async (file) => {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'txt') {
    return await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = e => resolve((e.target.result || '').slice(0, FILE_CHAR_LIMIT))
      r.onerror = () => reject(new Error('Could not read file'))
      r.readAsText(file)
    })
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
    if (!text.trim()) throw new Error('Could not extract text from this PDF. Try a text-based PDF or paste the content manually.')
    return text.slice(0, FILE_CHAR_LIMIT)
  }
  if (ext === 'pptx') {
    return '(PPTX text extraction not supported — file stored for reference. Copy key content into a text intel entry for AI search.)'
  }
  throw new Error('Unsupported file type')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtSize = bytes => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const isOld = iso => {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() > 6 * 30 * 24 * 60 * 60 * 1000
}

const ACCEPTED = ['pdf', 'docx', 'doc', 'pptx', 'txt']
const MAX_FILE_BYTES = 25 * 1024 * 1024

// ── Component ─────────────────────────────────────────────────────────────────

export default function Mothership({ onBack }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  // chat
  const [chat, setChat] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const chatEndRef = useRef(null)

  // add text
  const [addTitle, setAddTitle] = useState('')
  const [addText, setAddText] = useState('')
  const [addSaving, setAddSaving] = useState(false)

  // file upload
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState(null)
  const fileInputRef = useRef(null)

  // list
  const [search, setSearch] = useState('')

  // toast
  const [toast, setToast] = useState(null)

  useEffect(() => { loadEntries() }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat, thinking])

  const showToast = (msg, isErr = false) => {
    setToast({ msg, isErr })
    setTimeout(() => setToast(null), 3000)
  }

  const loadEntries = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('mothership_intel')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setEntries(data || [])
    setLoading(false)
  }

  const addTextIntel = async () => {
    if (!addText.trim() || addSaving) return
    setAddSaving(true)
    const { error } = await supabase.from('mothership_intel').insert({
      type: 'text',
      content: addText.trim(),
      file_name: addTitle.trim() || null,
    })
    if (error) {
      showToast('Failed to save intel', true)
    } else {
      setAddText('')
      setAddTitle('')
      showToast('Intel saved')
      loadEntries()
    }
    setAddSaving(false)
  }

  const handleFileUpload = async (file) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (!ACCEPTED.includes(ext)) {
      setUploadErr(`Unsupported file type. Accepted: ${ACCEPTED.join(', ').toUpperCase()}`)
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadErr('File too large (max 25 MB)')
      return
    }
    setUploading(true)
    setUploadErr(null)
    try {
      const text = await extractFileText(file)
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage.from('mothership-files').upload(path, file)
      if (upErr) throw new Error(upErr.message)
      const { error: dbErr } = await supabase.from('mothership_intel').insert({
        type: 'file',
        content: text,
        file_name: file.name,
        file_path: path,
        file_type: file.type,
        file_size: file.size,
      })
      if (dbErr) throw new Error(dbErr.message)
      showToast(`${file.name} uploaded`)
      loadEntries()
    } catch (err) {
      setUploadErr(err.message || 'Upload failed')
    }
    setUploading(false)
  }

  const deleteEntry = async (entry) => {
    if (entry.type === 'file' && entry.file_path) {
      await supabase.storage.from('mothership-files').remove([entry.file_path])
    }
    const { error } = await supabase.from('mothership_intel').delete().eq('id', entry.id)
    if (!error) setEntries(prev => prev.filter(e => e.id !== entry.id))
  }

  const sendMessage = async () => {
    if (!input.trim() || thinking) return
    const question = input.trim()
    setInput('')
    setChat(prev => [...prev, { role: 'user', text: question }])
    setThinking(true)

    // Build context — prefer newer entries, cap at 40000 chars
    let context = ''
    const sorted = [...entries].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    for (const e of sorted) {
      const label = e.file_name || (e.type === 'file' ? 'Uploaded file' : 'Text entry')
      const dateStr = fmtDate(e.created_at)
      const ageFlag = isOld(e.created_at) ? ' ⚠️ Added more than 6 months ago — may be outdated' : ''
      const block = `\n--- ${label} (added ${dateStr})${ageFlag} ---\n${(e.content || '').slice(0, 6000)}\n`
      if (context.length + block.length > 40000) break
      context += block
    }

    const systemPrompt = `You are an internal knowledge assistant for Mike Chiricosta, an Enterprise Client Manager at GuidePoint Security.

Answer the question using ONLY the internal knowledge base entries below. For each piece of information you cite, note when it was added. If information is older than 6 months, flag it as potentially outdated. If you cannot find the answer in the knowledge base, say so clearly — do not make things up.

Knowledge base entries:
${context || '(No knowledge base entries yet — answer that you have no information.)'}

At the end of your response, on a new line, write exactly:
---
Based on: [list the source names and dates you used]`

    try {
      const { data } = await callClaudeWithRetry({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: `${systemPrompt}\n\nQuestion: ${question}` }],
      }, null, null)
      const raw = data?.content?.[0]?.text || ''
      const sepIdx = raw.lastIndexOf('\n---\n')
      const mainText = sepIdx !== -1 ? raw.slice(0, sepIdx).trim() : raw.trim()
      const citation = sepIdx !== -1 ? raw.slice(sepIdx + 5).trim() : null
      setChat(prev => [...prev, { role: 'ai', text: mainText, citation }])
    } catch (err) {
      setChat(prev => [...prev, { role: 'ai', text: `Error: ${err.message || 'Failed to get a response'}`, citation: null }])
    }
    setThinking(false)
  }

  const files = entries.filter(e => e.type === 'file')
  const filtered = entries.filter(e => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (e.file_name || '').toLowerCase().includes(q) || (e.content || '').toLowerCase().includes(q)
  })

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#F4F6F9', fontFamily: 'Inter,-apple-system,sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EEEFF2', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, padding: '4px 0' }}>
          <ArrowLeft size={15} /> Back
        </button>
        <div style={{ width: 1, height: 20, background: '#EEEFF2' }} />
        <Brain size={20} color='#007AFF' />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>Mothership</div>
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>GuidePoint internal knowledge base</div>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

        {/* ── AI Chat ─────────────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #EEEFF2', marginBottom: 20, overflow: 'hidden' }}>

          {/* Messages */}
          <div style={{ minHeight: 260, maxHeight: 420, overflowY: 'auto', padding: '20px 20px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chat.length === 0 && !thinking && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, color: '#9CA3AF', fontSize: 13, textAlign: 'center', flexDirection: 'column', gap: 8 }}>
                <Brain size={28} color='#D1D5DB' />
                Ask anything about your GuidePoint knowledge base
              </div>
            )}
            {chat.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '76%',
                  background: msg.role === 'user' ? '#007AFF' : '#fff',
                  color: msg.role === 'user' ? '#fff' : '#111827',
                  border: msg.role === 'ai' ? '1px solid #EEEFF2' : 'none',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                  padding: '10px 14px',
                  fontSize: 14,
                  lineHeight: 1.55,
                }}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                  {msg.role === 'ai' && msg.citation && (
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8, borderTop: '1px solid #F3F4F6', paddingTop: 6 }}>
                      {msg.citation}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {thinking && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: '#fff', border: '1px solid #EEEFF2', borderRadius: '2px 12px 12px 12px', padding: '12px 16px', display: 'flex', gap: 5, alignItems: 'center' }}>
                  {[0, 0.3, 0.6].map((delay, i) => (
                    <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#9CA3AF', display: 'inline-block', animation: `msPulse 1.2s ease-in-out ${delay}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input bar */}
          <div style={{ borderTop: '1px solid #EEEFF2', padding: '12px 16px', display: 'flex', gap: 8, background: '#FAFAFA' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder='Ask a question about your knowledge base...'
              style={{ flex: 1, fontSize: 14, padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', background: '#fff', color: '#111827', fontFamily: 'inherit' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || thinking}
              style={{ background: input.trim() && !thinking ? '#007AFF' : '#D1D5DB', border: 'none', borderRadius: 8, padding: '9px 16px', color: '#fff', cursor: input.trim() && !thinking ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, flexShrink: 0, transition: 'background 0.15s' }}
            >
              <Send size={14} /> Send
            </button>
          </div>
        </div>

        {/* ── Add Knowledge ────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

          {/* Left: Add text intel */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #EEEFF2', padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 14 }}>Add Intel</div>
            <input
              value={addTitle}
              onChange={e => setAddTitle(e.target.value)}
              placeholder='Title or topic (optional)'
              style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', background: '#F9FAFB', color: '#111827', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit' }}
            />
            <textarea
              value={addText}
              onChange={e => setAddText(e.target.value)}
              placeholder='e.g. Zach Sura handles all Okta implementations. Contact him for identity practice questions.'
              rows={4}
              style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', background: '#F9FAFB', color: '#111827', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box', marginBottom: 12 }}
            />
            <button
              onClick={addTextIntel}
              disabled={!addText.trim() || addSaving}
              style={{ background: addText.trim() && !addSaving ? '#007AFF' : '#D1D5DB', border: 'none', borderRadius: 7, padding: '8px 18px', color: '#fff', cursor: addText.trim() && !addSaving ? 'pointer' : 'default', fontSize: 13, fontWeight: 600 }}
            >
              {addSaving ? 'Saving…' : 'Add'}
            </button>
          </div>

          {/* Right: Upload file */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #EEEFF2', padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 14 }}>Upload File</div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f) }}
              onClick={() => !uploading && fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? '#007AFF' : '#D1D5DB'}`,
                borderRadius: 8,
                padding: '20px 16px',
                textAlign: 'center',
                cursor: uploading ? 'default' : 'pointer',
                background: dragOver ? '#EBF4FF' : '#F9FAFB',
                marginBottom: 12,
                transition: 'all 0.15s',
              }}
            >
              <Upload size={20} color={dragOver ? '#007AFF' : '#9CA3AF'} style={{ marginBottom: 6 }} />
              <div style={{ fontSize: 13, color: dragOver ? '#007AFF' : '#6B7280', fontWeight: 500 }}>
                {uploading ? 'Extracting text and uploading…' : 'Drop a file or click to browse'}
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>PDF, DOCX, DOC, PPTX, TXT · Max 25 MB</div>
            </div>
            <input
              ref={fileInputRef}
              type='file'
              accept='.pdf,.docx,.doc,.pptx,.txt'
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = '' }}
            />
            {uploadErr && (
              <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertCircle size={13} /> {uploadErr}
              </div>
            )}
            {files.length > 0 && (
              <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Uploaded Files</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {files.map(f => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                      <FileText size={13} color='#9CA3AF' style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtDate(f.created_at)}{f.file_size ? ` · ${fmtSize(f.file_size)}` : ''}</div>
                      </div>
                      <button
                        onClick={() => deleteEntry(f)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2, flexShrink: 0 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                        onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Knowledge Base List ──────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #EEEFF2', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
              Knowledge Base
              {entries.length > 0 && <span style={{ fontSize: 12, fontWeight: 400, color: '#9CA3AF', marginLeft: 6 }}>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>}
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder='Search...'
                style={{ fontSize: 12, padding: '6px 8px 6px 26px', border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', background: '#F9FAFB', color: '#111827', width: 180, fontFamily: 'inherit' }}
              />
            </div>
          </div>
          {loading ? (
            <div style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
              {search ? 'No entries match your search' : 'No knowledge base entries yet. Add some intel above.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, background: '#F9FAFB' }}>
                  <span style={{
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 700,
                    background: e.type === 'file' ? '#EBF4FF' : '#F0FDF4',
                    color: e.type === 'file' ? '#007AFF' : '#059669',
                    borderRadius: 4,
                    padding: '2px 6px',
                    marginTop: 2,
                  }}>
                    {e.type === 'file' ? 'FILE' : 'TEXT'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                        {e.file_name || 'Untitled entry'}
                      </span>
                      {isOld(e.created_at) && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#D97706', background: '#FEF3C7', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                          May be outdated
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3 }}>{fmtDate(e.created_at)}</div>
                    <div style={{ fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(e.content || '').slice(0, 120)}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteEntry(e)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2, flexShrink: 0 }}
                    onMouseEnter={ev => ev.currentTarget.style.color = '#EF4444'}
                    onMouseLeave={ev => ev.currentTarget.style.color = '#9CA3AF'}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.isErr ? '#EF4444' : '#111827', color: '#fff', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes msPulse {
          0%, 100% { opacity: 0.25; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </div>
  )
}
