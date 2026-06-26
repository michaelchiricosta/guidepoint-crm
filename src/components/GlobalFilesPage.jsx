import { useState } from 'react'
import { ArrowLeft, Search, Upload, X } from 'lucide-react'
import { S } from '../theme.js'
import { uploadGlobalFile, getGlobalFileUrl, deleteGlobalFile } from '../supabase.js'

const FILE_CATS = ['NDA', 'MSA', 'Contract', 'SOW', 'Proposal', 'Quote', 'Invoice', 'Report', 'Presentation', 'Reference', 'Template', 'Other']

const fmtSize = b => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(0)} KB` : `${b} B`

const fileIcon = type => {
  if (!type) return { icon: '📄', c: '#9CA3AF' }
  if (type.includes('pdf')) return { icon: '📕', c: '#dc2626' }
  if (type.includes('word') || type.includes('document')) return { icon: '📘', c: '#007AFF' }
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return { icon: '📗', c: '#16a34a' }
  if (type.includes('presentation') || type.includes('powerpoint')) return { icon: '📙', c: '#ea580c' }
  if (type.startsWith('image/')) return { icon: '🖼️', c: '#7c3aed' }
  if (type.includes('text')) return { icon: '📄', c: '#6b7280' }
  return { icon: '📄', c: '#64748b' }
}

export default function GlobalFilesPage({ data, setData, onBack }) {
  const [search, setSearch] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [fileInput, setFileInput] = useState(null)
  const [category, setCategory] = useState('Other')
  const [notes, setNotes] = useState('')
  const [viewingId, setViewingId] = useState(null)
  const [actionErr, setActionErr] = useState('')
  const [editingNotes, setEditingNotes] = useState(null)
  const [editNotesValue, setEditNotesValue] = useState('')

  const files = data.globalFiles || []
  const q = search.trim().toLowerCase()
  const filtered = q
    ? files.filter(f =>
        (f.name || '').toLowerCase().includes(q) ||
        (f.notes || '').toLowerCase().includes(q) ||
        (f.category || '').toLowerCase().includes(q)
      )
    : files
  const grouped = filtered.reduce((acc, f) => {
    const cat = f.category || 'Other'
    ;(acc[cat] || (acc[cat] = [])).push(f)
    return acc
  }, {})

  const persistFiles = updated => setData(prev => ({ ...prev, globalFiles: updated }))

  const doUpload = async () => {
    if (!fileInput) return
    setUploading(true); setUploadErr('')
    try {
      const meta = await uploadGlobalFile(fileInput, category, notes)
      persistFiles([...files, meta])
      setShowUpload(false); setFileInput(null); setCategory('Other'); setNotes('')
    } catch (e) { setUploadErr(e.message || 'Upload failed') }
    finally { setUploading(false) }
  }

  const doView = async f => {
    setViewingId(f.id); setActionErr('')
    try { const url = await getGlobalFileUrl(f.storagePath); if (url) window.open(url, '_blank') }
    catch { setActionErr('Could not load file. Please try again.') }
    finally { setViewingId(null) }
  }

  const doDownload = async f => {
    setViewingId(f.id); setActionErr('')
    try {
      const url = await getGlobalFileUrl(f.storagePath)
      if (url) { const a = document.createElement('a'); a.href = url; a.download = f.name; a.click() }
    } catch { setActionErr('Could not download file.') }
    finally { setViewingId(null) }
  }

  const doDelete = async f => {
    if (!window.confirm(`Delete "${f.name}"?`)) return
    setActionErr('')
    try {
      await deleteGlobalFile(f.storagePath)
      persistFiles(files.filter(x => x.id !== f.id))
    } catch { setActionErr('Delete failed. Please try again.') }
  }

  const saveNotes = f => {
    persistFiles(files.map(x => x.id === f.id ? { ...x, notes: editNotesValue } : x))
    setEditingNotes(null); setEditNotesValue('')
  }

  const inp = { width: '100%', padding: '7px 10px', border: `1px solid ${S.bdr}`, borderRadius: 6, fontSize: 13, color: S.txt, background: S.surf2, boxSizing: 'border-box', outline: 'none' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: S.bg }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Top bar ── */}
      <div style={{ background: '#0f172a', padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}
          onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
          onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
          <ArrowLeft size={15} /> Back to Dashboard
        </button>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Files</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#64748b', marginRight: 4 }}>{files.length} file{files.length !== 1 ? 's' : ''}</span>
        <button onClick={() => setShowUpload(true)}
          style={{ padding: '6px 14px', background: '#007AFF', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <Upload size={13} /> Upload
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ maxWidth: 800 }}>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder='Search files by name, category, or notes…'
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 36px', border: `1px solid ${S.bdr}`, borderRadius: 8, fontSize: 13, color: S.txt, background: S.surf, outline: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
              onFocus={e => { e.target.style.borderColor = '#007AFF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,122,255,0.1)' }}
              onBlur={e => { e.target.style.borderColor = S.bdr; e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)' }}
            />
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2 }}><X size={14} /></button>}
          </div>

          {/* Error */}
          {actionErr && (
            <div style={{ background: '#FEE2E2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#dc2626', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{actionErr}</span>
              <button onClick={() => setActionErr('')} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          )}

          {/* Empty states */}
          {files.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 14, opacity: 0.3 }}>📁</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: S.txt, marginBottom: 6 }}>No files uploaded yet.</div>
              <div style={{ fontSize: 13, color: S.muted, maxWidth: 340, lineHeight: 1.6, marginBottom: 18 }}>
                Upload NDAs, contracts, proposals, reports, and other documents to keep everything in one place.
              </div>
              <button onClick={() => setShowUpload(true)}
                style={{ padding: '8px 18px', background: '#007AFF', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Upload a File
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.3 }}>🔍</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: S.txt, marginBottom: 4 }}>No files match "{search}"</div>
              <div style={{ fontSize: 12, color: S.muted }}>Try a different search term.</div>
            </div>
          ) : (
            Object.entries(grouped).map(([cat, catFiles]) => (
              <div key={cat} style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: S.secondary, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{cat}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#007AFF', background: '#EBF4FF', borderRadius: 999, padding: '1px 7px' }}>{catFiles.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {catFiles.map(f => {
                    const { icon } = fileIcon(f.type)
                    const isLoading = viewingId === f.id
                    const isEditing = editingNotes === f.id
                    return (
                      <div key={f.id} style={{ background: S.surf, border: `1px solid ${S.bdr}`, borderRadius: 10, padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{icon}</span>
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: S.txt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10, color: S.muted }}>{fmtSize(f.size)}</span>
                              <span style={{ fontSize: 10, color: S.dim }}>·</span>
                              <span style={{ fontSize: 10, color: S.muted }}>{new Date(f.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              {f.notes && !isEditing && (
                                <>
                                  <span style={{ fontSize: 10, color: S.dim }}>·</span>
                                  <span
                                    onClick={() => { setEditingNotes(f.id); setEditNotesValue(f.notes || '') }}
                                    style={{ fontSize: 10, color: S.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200, cursor: 'pointer' }}
                                    title='Click to edit notes'>
                                    {f.notes}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                            {!isEditing && (
                              <button onClick={() => { setEditingNotes(f.id); setEditNotesValue(f.notes || '') }} title='Edit notes'
                                style={{ padding: '5px 8px', background: S.surf2, border: `1px solid ${S.bdr}`, borderRadius: 6, color: S.muted, cursor: 'pointer', fontSize: 12 }}>✏</button>
                            )}
                            <button onClick={() => doView(f)} disabled={isLoading} title='View'
                              style={{ padding: '5px 10px', background: S.surf2, border: `1px solid ${S.bdr}`, borderRadius: 6, color: S.secondary, cursor: 'pointer', fontSize: 12 }}>
                              {isLoading ? '…' : '👁'}
                            </button>
                            <button onClick={() => doDownload(f)} disabled={isLoading} title='Download'
                              style={{ padding: '5px 10px', background: S.surf2, border: `1px solid ${S.bdr}`, borderRadius: 6, color: S.secondary, cursor: 'pointer', fontSize: 12 }}>⬇</button>
                            <button onClick={() => doDelete(f)} title='Delete'
                              style={{ padding: '5px 10px', background: S.isLight ? '#fef2f2' : 'rgba(239,68,68,0.08)', border: '1px solid #FECACA', borderRadius: 6, color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>×</button>
                          </div>
                        </div>
                        {isEditing && (
                          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              autoFocus
                              value={editNotesValue}
                              onChange={e => setEditNotesValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveNotes(f); if (e.key === 'Escape') { setEditingNotes(null); setEditNotesValue('') } }}
                              placeholder='Add notes…'
                              style={{ flex: 1, minWidth: 120, padding: '6px 10px', border: `1px solid ${S.bdr}`, borderRadius: 6, fontSize: 13, color: S.txt, background: S.surf, outline: 'none' }}
                            />
                            <button onClick={() => saveNotes(f)} style={{ padding: '6px 12px', background: '#007AFF', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Save</button>
                            <button onClick={() => { setEditingNotes(null); setEditNotesValue('') }} style={{ padding: '6px 10px', background: 'transparent', border: `1px solid ${S.bdr}`, borderRadius: 6, color: S.muted, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>Cancel</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Upload modal ── */}
      {showUpload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: S.surf, border: `1px solid ${S.bdr}`, borderRadius: 14, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${S.bdr}` }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: S.txt }}>Upload File</div>
              <button onClick={() => { setShowUpload(false); setFileInput(null); setUploadErr('') }} style={{ background: 'none', border: 'none', color: S.muted, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', background: S.surf2, border: `2px dashed ${S.bdr}`, borderRadius: 8, padding: '24px 16px', textAlign: 'center', cursor: 'pointer' }}>
                  <input type='file' style={{ display: 'none' }} onChange={e => setFileInput(e.target.files[0] || null)} />
                  {fileInput ? (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: S.txt }}>{fileInput.name}</div>
                      <div style={{ fontSize: 11, color: S.muted, marginTop: 3 }}>{fmtSize(fileInput.size)}</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 24, marginBottom: 6 }}>📁</div>
                      <div style={{ fontSize: 13, color: S.muted }}>Click to choose a file</div>
                      <div style={{ fontSize: 11, color: S.muted, marginTop: 4 }}>PDF, Word, Excel, PowerPoint, CSV, TXT, images · max 25 MB</div>
                    </div>
                  )}
                </label>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: S.muted, marginBottom: 4 }}>Category</div>
                <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
                  {FILE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: S.muted, marginBottom: 4 }}>Notes (optional)</div>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder='Brief description…' style={inp} />
              </div>
              {uploadErr && <div style={{ fontSize: 12, color: '#dc2626', background: '#FEE2E2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>{uploadErr}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={doUpload} disabled={!fileInput || uploading}
                  style={{ flex: 1, padding: '9px', background: !fileInput || uploading ? '#94a3b8' : '#007AFF', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: !fileInput || uploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {uploading ? <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Uploading…</> : 'Upload'}
                </button>
                <button onClick={() => { setShowUpload(false); setFileInput(null); setUploadErr('') }}
                  style={{ padding: '9px 16px', background: 'transparent', border: `1px solid ${S.bdr}`, borderRadius: 6, color: S.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
