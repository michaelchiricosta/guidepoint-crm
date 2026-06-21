import { useState, useRef } from 'react'
import { ArrowLeft, Plus, Search, Trash2, Pencil, Upload, X, ChevronRight, ChevronDown } from 'lucide-react'
import { S } from '../theme.js'
import { uid, extractJSON } from '../utils.js'
import { SECURITY_FRAMEWORK } from '../securityFramework.js'

const callClaudeWithRetry = async (body, apiKey, onStatus, maxRetries=3) => {
  const lastCall = window._lastAnthropicCall||0
  const wait = 2000-(Date.now()-lastCall)
  if (wait>0) await new Promise(r=>setTimeout(r,wait))
  for (let attempt=0; attempt<maxRetries; attempt++) {
    window._lastAnthropicCall = Date.now()
    const res = await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    const data = await res.json()
    const overloaded = data.error?.type==='overloaded_error'||res.status===529||res.status===429
    if (overloaded) {
      if (attempt<maxRetries-1) {
        const delay = Math.pow(2,attempt)*2000
        if (onStatus) onStatus(`API busy — retrying in ${Math.round(delay/1000)}s…`)
        await new Promise(r=>setTimeout(r,delay))
        continue
      }
      throw new Error('API overloaded — please try again')
    }
    if (data.error) throw new Error(data.error.message||'API error')
    if (onStatus) onStatus(null)
    return {res,data}
  }
  throw new Error('API overloaded — please try again')
}

const loadPdfJs = () => new Promise((resolve, reject) => {
  if (window.pdfjsLib) { resolve(window.pdfjsLib); return }
  const script = document.createElement('script')
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
  script.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; resolve(window.pdfjsLib) }
  script.onerror = () => reject(new Error('Failed to load PDF parser'))
  document.head.appendChild(script)
})

const loadMammoth = () => new Promise((resolve, reject) => {
  if (window.mammoth) { resolve(window.mammoth); return }
  const script = document.createElement('script')
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
  script.onload = () => resolve(window.mammoth)
  script.onerror = () => reject(new Error('Failed to load Word parser'))
  document.head.appendChild(script)
})

const fuzzyMatchVendor = (a, b) => {
  if (!a||!b) return false
  const clean = s => s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(inc|llc|ltd|corp|co|the|and|or|of)\b/g,'').replace(/\s+/g,' ').trim()
  const ca=clean(a), cb=clean(b)
  if (ca===cb||ca.includes(cb)||cb.includes(ca)) return true
  const bigrams = s => { const bg=new Set(); for(let i=0;i<s.length-1;i++) bg.add(s.slice(i,i+2)); return bg }
  const bg1=bigrams(ca), bg2=bigrams(cb)
  let m=0; bg2.forEach(bg=>{if(bg1.has(bg))m++})
  return (2*m)/(bg1.size+bg2.size) > 0.7
}

const VENDOR_CATS = [...SECURITY_FRAMEWORK.domains.map(d=>d.name), 'Technology', 'Professional Services', 'Hardware', 'Other']
const STATUS_OPTS = ['Customer', 'Engaged', 'Target']
const STATUS_STYLE = {
  Customer: {bg:'#dcfce7', color:'#15803d', border:'#86efac'},
  Engaged:  {bg:'#dbeafe', color:'#1d4ed8', border:'#93c5fd'},
  Target:   {bg:'#f1f5f9', color:'#475569', border:'#cbd5e1'}
}
const BLANK_VENDOR = {id:'', name:'', companyName:'', website:'', category:'', notes:'', reps:[]}
const BLANK_REP    = {id:'', name:'', email:'', phone:'', title:'', notes:'', accounts:[]}
const BLANK_ACCT   = {id:'', accountName:'', status:'Target', notes:''}

// Migrate legacy vendors that have contacts[] but no reps[]
const normalizeVendor = v => {
  if (v.reps !== undefined) return {...v, name: v.name || v.companyName || ''}
  return {
    ...v,
    name: v.name || v.companyName || '',
    reps: (v.contacts || []).map(ct => ({
      id: ct.id || uid(),
      name: ct.name || '',
      email: ct.email || '',
      phone: ct.phone || '',
      title: ct.title || '',
      notes: [ct.notes, ct.region && `Region: ${ct.region}`, ct.territory && `Territory: ${ct.territory}`, ct.sourceDocument && `Source: ${ct.sourceDocument}`].filter(Boolean).join('\n'),
      accounts: []
    }))
  }
}

export default function VendorsPage({data, setData, onBack, apiKey}) {
  const directory = (data.vendorDirectory || []).map(normalizeVendor)

  const [selId, setSelId] = useState(directory[0]?.id || null)
  const [search, setSearch] = useState('')
  const [expandedReps, setExpandedReps] = useState(new Set())
  const [showVendorForm, setShowVendorForm] = useState(false)
  const [vendorForm, setVendorForm] = useState(BLANK_VENDOR)
  const [repModal, setRepModal] = useState(null)
  const [repForm, setRepForm] = useState(BLANK_REP)
  const [addingAccountForRep, setAddingAccountForRep] = useState(null)
  const [newAcctForm, setNewAcctForm] = useState(BLANK_ACCT)
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [review, setReview] = useState(null)
  const [reviewSel, setReviewSel] = useState(new Set())
  const [importToast, setImportToast] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)

  const sel = directory.find(v => v.id === selId) || null
  const filtered = directory.filter(v =>
    !search.trim() ||
    (v.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.category || '').toLowerCase().includes(search.toLowerCase())
  )

  const persist = dirs => setData(prev => ({...prev, vendorDirectory: dirs}))
  const updateVendor = (id, changes) => persist(directory.map(v => v.id === id ? {...v, ...changes} : v))

  // Vendor CRUD
  const saveVendor = () => {
    if (!vendorForm.name.trim()) return
    const name = vendorForm.name.trim()
    if (vendorForm.id) {
      persist(directory.map(v => v.id === vendorForm.id ? {...v, ...vendorForm, name, companyName: name} : v))
    } else {
      const nv = {id: uid(), ...BLANK_VENDOR, ...vendorForm, name, companyName: name, reps: []}
      persist([...directory, nv])
      setSelId(nv.id)
    }
    setShowVendorForm(false)
    setVendorForm(BLANK_VENDOR)
  }

  const deleteVendor = id => {
    if (!window.confirm('Delete this vendor and all reps?')) return
    persist(directory.filter(v => v.id !== id))
    if (selId === id) setSelId(directory.find(v => v.id !== id)?.id || null)
  }

  // Rep CRUD
  const saveRep = () => {
    if (!repForm.name.trim() || !repModal) return
    const vendor = directory.find(v => v.id === repModal.vendorId)
    if (!vendor) return
    const reps = repForm.id
      ? (vendor.reps || []).map(r => r.id === repForm.id ? {...r, ...repForm} : r)
      : [...(vendor.reps || []), {id: uid(), ...repForm, accounts: repForm.accounts || []}]
    updateVendor(repModal.vendorId, {reps})
    setRepModal(null)
    setRepForm(BLANK_REP)
  }

  const deleteRep = (vendorId, repId) => {
    if (!window.confirm('Delete this rep and their accounts?')) return
    const vendor = directory.find(v => v.id === vendorId)
    if (!vendor) return
    updateVendor(vendorId, {reps: (vendor.reps || []).filter(r => r.id !== repId)})
    setExpandedReps(prev => { const s = new Set(prev); s.delete(repId); return s })
  }

  // Account CRUD
  const addAccount = (vendorId, repId) => {
    if (!newAcctForm.accountName.trim()) return
    const vendor = directory.find(v => v.id === vendorId)
    if (!vendor) return
    const reps = (vendor.reps || []).map(r =>
      r.id === repId ? {...r, accounts: [...(r.accounts || []), {id: uid(), ...newAcctForm}]} : r
    )
    updateVendor(vendorId, {reps})
    setNewAcctForm(BLANK_ACCT)
    setAddingAccountForRep(null)
  }

  const updateAccount = (vendorId, repId, acctId, changes) => {
    const vendor = directory.find(v => v.id === vendorId)
    if (!vendor) return
    const reps = (vendor.reps || []).map(r =>
      r.id === repId
        ? {...r, accounts: (r.accounts || []).map(a => a.id === acctId ? {...a, ...changes} : a)}
        : r
    )
    updateVendor(vendorId, {reps})
  }

  const deleteAccount = (vendorId, repId, acctId) => {
    const vendor = directory.find(v => v.id === vendorId)
    if (!vendor) return
    const reps = (vendor.reps || []).map(r =>
      r.id === repId ? {...r, accounts: (r.accounts || []).filter(a => a.id !== acctId)} : r
    )
    updateVendor(vendorId, {reps})
  }

  const toggleRep = repId => setExpandedReps(prev => {
    const s = new Set(prev); s.has(repId) ? s.delete(repId) : s.add(repId); return s
  })

  // File upload
  const VENDOR_DOC_MAX = 30 * 1024 * 1024
  const handleFile = async file => {
    if (!apiKey) { setUploadError('Add your Anthropic API key in Settings first.'); return }
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf','doc','docx','txt'].includes(ext)) { setUploadError('Unsupported type. Use PDF, DOC, DOCX, or TXT.'); return }
    if (file.size > VENDOR_DOC_MAX) { setUploadError(`File too large (${(file.size/1024/1024).toFixed(1)} MB). Max 30 MB.`); return }
    setUploadError(''); setUploadStatus('Reading document…')
    try {
      const ab = await file.arrayBuffer()
      let text = ''
      if (ext==='pdf') {
        setUploadStatus('Loading PDF parser…')
        const pdfjs = await loadPdfJs()
        const pdf = await pdfjs.getDocument({data:ab}).promise
        for (let i=1;i<=Math.min(pdf.numPages,40);i++) {
          const page = await pdf.getPage(i)
          const tc = await page.getTextContent()
          text += tc.items.map(it=>it.str).join(' ')+'\n'
        }
      } else if (ext==='doc'||ext==='docx') {
        setUploadStatus('Loading Word parser…')
        const mm = await loadMammoth()
        text = (await mm.extractRawText({arrayBuffer:ab})).value
      } else {
        text = new TextDecoder().decode(ab)
      }
      text = text.slice(0,80000)
      setUploadStatus('Extracting vendors with AI…')
      const prompt = `Extract all vendor company information and contacts from this document. Group contacts under their companies.

Return ONLY valid JSON:
{
  "companies": [
    {
      "companyName": "string",
      "website": "string or empty",
      "category": "one of: ${VENDOR_CATS.slice(0,8).join(', ')}, or Other",
      "notes": "string or empty",
      "contacts": [
        {"name":"string","title":"string","email":"string","phone":"string","region":"string","territory":"string","notes":"string","sourceDocument":"${file.name}"}
      ]
    }
  ]
}

Extract every person and company mentioned. Use empty string for missing fields. Do not fabricate data not in the document.

Document:
${text}`
      const {data:resp} = await callClaudeWithRetry({model:'claude-sonnet-4-6',max_tokens:4000,messages:[{role:'user',content:prompt}]}, apiKey, setUploadStatus)
      const parsed = extractJSON(resp.content?.[0]?.text||'')
      if (!parsed?.companies?.length) throw new Error('No vendor data found in document')
      setReview({companies:parsed.companies, fileName:file.name})
      setReviewSel(new Set(parsed.companies.map((_,i)=>i)))
      setUploadStatus('')
    } catch(err) {
      setUploadError(`Extraction failed: ${err.message}`)
      setUploadStatus('')
    }
  }

  const confirmReview = () => {
    if (!review) return
    const toImport = review.companies.filter((_,i) => reviewSel.has(i))
    let newDir = [...directory]
    let addedVendors = 0, addedReps = 0
    const toRep = c => ({
      id: uid(), name: c.name||'', email: c.email||'', phone: c.phone||'', title: c.title||'',
      notes: [c.notes, c.region&&`Region: ${c.region}`, c.territory&&`Territory: ${c.territory}`, c.sourceDocument&&`Source: ${c.sourceDocument}`].filter(Boolean).join('\n'),
      accounts: []
    })
    toImport.forEach(ec => {
      const existing = newDir.find(v => fuzzyMatchVendor(v.name || v.companyName, ec.companyName))
      if (existing) {
        const knownEmails = new Set((existing.reps||[]).map(r=>(r.email||'').toLowerCase()).filter(Boolean))
        const knownNames  = new Set((existing.reps||[]).map(r=>(r.name||'').toLowerCase()).filter(Boolean))
        const fresh = (ec.contacts||[]).filter(c => {
          if (c.email && knownEmails.has(c.email.toLowerCase())) return false
          if (!c.email && c.name && knownNames.has(c.name.toLowerCase())) return false
          return true
        }).map(toRep)
        addedReps += fresh.length
        newDir = newDir.map(v => v.id===existing.id ? {...existing, reps:[...(existing.reps||[]),...fresh]} : v)
      } else {
        const reps = (ec.contacts||[]).map(toRep)
        addedReps += reps.length
        addedVendors++
        const nv = {id:uid(), name:ec.companyName, companyName:ec.companyName, website:ec.website||'', category:ec.category||'', notes:ec.notes||'', reps}
        newDir.push(nv)
        if (!selId) setSelId(nv.id)
      }
    })
    persist(newDir)
    setReview(null); setReviewSel(new Set())
    const msg = [addedVendors?`${addedVendors} vendor${addedVendors!==1?'s':''}`:null, addedReps?`${addedReps} rep${addedReps!==1?'s':''}`:null].filter(Boolean).join(' and ')
    setImportToast(msg ? `Added ${msg}.` : 'Nothing new to import — all reps already existed.')
    setTimeout(() => setImportToast(null), 5000)
  }

  const inp = {width:'100%',padding:'7px 10px',border:`1px solid ${S.bdr}`,borderRadius:6,fontSize:13,color:S.txt,background:S.surf2,boxSizing:'border-box',outline:'none'}

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:S.bg}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Sidebar ── */}
      <div style={{width:221,flexShrink:0,background:'#FFFFFF',display:'flex',flexDirection:'column',borderRight:'1px solid #EEEFF2',overflow:'hidden'}}>
        <div style={{padding:'12px 14px 10px',borderBottom:'1px solid #EEEFF2',flexShrink:0}}>
          <button onClick={onBack} style={{display:'flex',alignItems:'center',gap:5,background:'transparent',border:'none',cursor:'pointer',color:'#6B7280',fontSize:12,fontWeight:600,padding:'2px 0',marginBottom:8}}
            onMouseEnter={e=>e.currentTarget.style.color='#111827'} onMouseLeave={e=>e.currentTarget.style.color='#6B7280'}>
            <ArrowLeft size={13}/> Back
          </button>
          <div style={{fontSize:16,fontWeight:700,color:'#111827'}}>Vendor Directory</div>
          <div style={{fontSize:11,color:'#6B7280',marginTop:2}}>{directory.length} vendor{directory.length!==1?'s':''}</div>
        </div>
        <div style={{padding:'10px 10px 4px',flexShrink:0}}>
          <div style={{position:'relative'}}>
            <Search size={12} style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'#9CA3AF',pointerEvents:'none'}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search vendors…'
              style={{width:'100%',padding:'7px 8px 7px 26px',fontSize:12,background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:6,color:'#111827',boxSizing:'border-box',outline:'none'}}/>
          </div>
        </div>
        <div style={{padding:'4px 10px 8px',flexShrink:0}}>
          <button onClick={()=>{setVendorForm(BLANK_VENDOR);setShowVendorForm(true)}}
            style={{width:'100%',padding:'7px',background:'#EBF4FF',border:'1px solid #BFDBFE',borderRadius:6,color:'#007AFF',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
            <Plus size={12}/> Add Vendor
          </button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'4px 0'}}>
          {filtered.length===0&&(
            <div style={{padding:'20px 14px',fontSize:12,color:'#6B7280',textAlign:'center'}}>
              {directory.length===0 ? 'No vendors yet.' : 'No vendors match.'}
            </div>
          )}
          {filtered.map(v => {
            const isAct = selId===v.id
            const repCount = (v.reps||[]).length
            return (
              <div key={v.id} onClick={()=>setSelId(v.id)}
                style={{padding:'9px 12px',cursor:'pointer',borderLeft:isAct?'3px solid #007AFF':'3px solid transparent',background:isAct?'#EBF4FF':'transparent',color:isAct?'#007AFF':'#374151',transition:'all 0.1s',borderBottom:'1px solid #EEEFF2'}}
                onMouseEnter={e=>{if(!isAct){e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.color='#111827'}}}
                onMouseLeave={e=>{if(!isAct){e.currentTarget.style.background='transparent';e.currentTarget.style.color='#374151'}}}>
                <div style={{fontSize:13,fontWeight:600,marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v.name||v.companyName}</div>
                <div style={{fontSize:10,color:'#9CA3AF'}}>{v.category||'Uncategorized'} · {repCount} rep{repCount!==1?'s':''}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{flex:1,overflow:'auto',padding:'20px 24px'}}>
        <input ref={fileRef} type='file' accept='.pdf,.doc,.docx,.txt' style={{display:'none'}}
          onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);e.target.value=''}}/>

        {/* Upload card */}
        {!review&&(
          <div
            onDragOver={e=>{e.preventDefault();setDragOver(true)}}
            onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragOver(false)}}
            onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files?.[0];if(f)handleFile(f)}}
            onClick={()=>!uploadStatus&&fileRef.current?.click()}
            style={{background:dragOver?(S.isLight?'#EBF4FF':'rgba(0,122,255,0.08)'):S.surf,border:`2px dashed ${dragOver?'#007AFF':uploadStatus?'#d97706':S.bdr}`,borderRadius:10,padding:'16px 20px',marginBottom:20,cursor:uploadStatus?'default':'pointer',transition:'border-color 0.15s,background 0.15s',userSelect:'none'}}>
            {uploadStatus?(
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:16,height:16,border:'2px solid #2563eb',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite',flexShrink:0}}/>
                <div style={{fontSize:13,fontWeight:600,color:S.txt}}>{uploadStatus}</div>
              </div>
            ):(
              <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
                <Upload size={18} style={{color:'#007AFF',flexShrink:0}}/>
                <div style={{flex:1,minWidth:160}}>
                  <div style={{fontSize:13,fontWeight:700,color:S.txt}}>Upload Vendor Contact PDF</div>
                  <div style={{fontSize:11,color:S.muted,marginTop:1}}>PDF, DOCX, or TXT — AI extracts vendors and reps · Drag &amp; drop or click · Max 30 MB</div>
                </div>
                <button onClick={e=>{e.stopPropagation();fileRef.current?.click()}}
                  style={{padding:'6px 14px',background:'#007AFF',border:'none',borderRadius:6,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                  Browse
                </button>
              </div>
            )}
            {uploadError&&(
              <div style={{marginTop:10,background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:6,padding:'7px 10px',fontSize:12,color:'#dc2626',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>{uploadError}</span>
                <button onClick={e=>{e.stopPropagation();setUploadError('')}} style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:15,lineHeight:1,padding:'0 2px'}}>×</button>
              </div>
            )}
          </div>
        )}

        {/* Review screen */}
        {review&&(
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:10,padding:'20px 24px',marginBottom:20}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:S.txt}}>Review Extracted Vendors</div>
                <div style={{fontSize:12,color:S.muted,marginTop:2}}>
                  {review.fileName} &nbsp;·&nbsp; {review.companies.length} compan{review.companies.length===1?'y':'ies'} found
                  &nbsp;·&nbsp;
                  <button onClick={()=>setReviewSel(reviewSel.size===review.companies.length?new Set():new Set(review.companies.map((_,i)=>i)))}
                    style={{background:'none',border:'none',padding:0,cursor:'pointer',color:S.blue,fontSize:12,fontWeight:600}}>
                    {reviewSel.size===review.companies.length?'Deselect All':'Select All'}
                  </button>
                </div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>{setReview(null);setReviewSel(new Set())}}
                  style={{padding:'7px 14px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
                <button onClick={confirmReview} disabled={reviewSel.size===0}
                  style={{padding:'7px 16px',background:reviewSel.size>0?'#007AFF':'#9CA3AF',border:'none',borderRadius:6,color:'#fff',fontSize:13,fontWeight:600,cursor:reviewSel.size>0?'pointer':'not-allowed'}}>
                  {reviewSel.size===review.companies.length?'Save All':`Save ${reviewSel.size} of ${review.companies.length}`}
                </button>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:420,overflowY:'auto'}}>
              {review.companies.map((ec,i)=>{
                const willMerge = !!directory.find(d=>fuzzyMatchVendor(d.name||d.companyName,ec.companyName))
                const isChecked = reviewSel.has(i)
                const totalReps = (ec.contacts||[]).length
                return (
                  <div key={i} onClick={()=>setReviewSel(prev=>{const ns=new Set(prev);ns.has(i)?ns.delete(i):ns.add(i);return ns})}
                    style={{padding:'12px 14px',background:isChecked?(S.isLight?'#EBF4FF':'rgba(37,99,235,0.1)'):(S.isLight?'#f8fafc':S.surf2),border:`1px solid ${isChecked?'rgba(0,122,255,0.5)':S.bdr}`,borderRadius:8,cursor:'pointer',userSelect:'none'}}>
                    <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                      <input type='checkbox' checked={isChecked} readOnly style={{marginTop:3,cursor:'pointer',accentColor:'#007AFF',flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
                          <span style={{fontSize:13,fontWeight:700,color:S.txt}}>{ec.companyName}</span>
                          {ec.category&&<span style={{fontSize:10,background:'#e0f2fe',color:'#0369a1',padding:'1px 7px',borderRadius:4}}>{ec.category}</span>}
                          {willMerge&&<span style={{fontSize:10,background:'#fef3c7',color:'#d97706',padding:'1px 7px',borderRadius:4,fontWeight:600}}>Will merge</span>}
                          {totalReps>0&&<span style={{fontSize:10,color:S.muted}}>{totalReps} rep{totalReps!==1?'s':''}</span>}
                        </div>
                        {(ec.contacts||[]).length>0&&(
                          <div style={{marginTop:6,display:'flex',flexWrap:'wrap',gap:4}}>
                            {(ec.contacts||[]).slice(0,8).map((ct,j)=>(
                              <span key={j} style={{fontSize:11,color:S.muted,background:S.isLight?'#f1f5f9':S.surf,border:`1px solid ${S.bdr}`,padding:'2px 8px',borderRadius:4}}>
                                {ct.name}{ct.title?` · ${ct.title}`:''}
                              </span>
                            ))}
                            {(ec.contacts||[]).length>8&&<span style={{fontSize:11,color:S.muted,padding:'2px 8px'}}>+{(ec.contacts||[]).length-8} more</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!sel&&!review&&(
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'35vh',gap:10,color:S.muted}}>
            <div style={{fontSize:36,opacity:0.3}}>🏢</div>
            <div style={{fontSize:15,fontWeight:600,color:S.txt}}>No vendor selected</div>
            <div style={{fontSize:13}}>Select a vendor from the sidebar, upload a PDF, or add one manually.</div>
          </div>
        )}

        {/* Vendor detail */}
        {sel&&!review&&(
          <>
            {/* Header */}
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20,gap:12,flexWrap:'wrap'}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:22,fontWeight:800,color:S.txt,lineHeight:1.2}}>{sel.name||sel.companyName}</div>
                <div style={{display:'flex',gap:8,marginTop:5,flexWrap:'wrap',alignItems:'center'}}>
                  {sel.category&&<span style={{fontSize:11,background:S.isLight?'#EBF4FF':'rgba(0,122,255,0.15)',color:'#007AFF',padding:'2px 9px',borderRadius:4}}>{sel.category}</span>}
                  {sel.website&&<a href={sel.website.startsWith('http')?sel.website:`https://${sel.website}`} target='_blank' rel='noreferrer'
                    style={{fontSize:12,color:S.blue,textDecoration:'none',fontWeight:500}}>{sel.website}</a>}
                </div>
                {sel.notes&&<div style={{fontSize:13,color:S.muted,marginTop:6,maxWidth:560,lineHeight:1.5}}>{sel.notes}</div>}
              </div>
              <div style={{display:'flex',gap:8,flexShrink:0}}>
                <button onClick={()=>{setVendorForm({...sel,name:sel.name||sel.companyName||''});setShowVendorForm(true)}}
                  style={{padding:'7px 13px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                  <Pencil size={12}/> Edit
                </button>
                <button onClick={()=>deleteVendor(sel.id)}
                  style={{padding:'7px 13px',background:'transparent',border:'1px solid #fca5a5',borderRadius:6,color:'#dc2626',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                  <Trash2 size={12}/> Delete
                </button>
              </div>
            </div>

            {/* Reps header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:700,color:S.txt}}>Sales Reps ({(sel.reps||[]).length})</div>
              <button onClick={()=>{setRepModal({vendorId:sel.id});setRepForm(BLANK_REP)}}
                style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:'#007AFF',border:'none',borderRadius:6,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                <Plus size={12}/> Add Rep
              </button>
            </div>

            {(sel.reps||[]).length===0&&(
              <div style={{textAlign:'center',padding:'28px 20px',color:S.muted,fontSize:13,background:S.surf,borderRadius:8,border:`1px dashed ${S.bdr}`}}>
                No reps yet. Add a sales rep or upload a PDF to extract contacts automatically.
              </div>
            )}

            {/* Rep list */}
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {(sel.reps||[]).map(rep => {
                const isExpanded = expandedReps.has(rep.id)
                const acctCount = (rep.accounts||[]).length
                return (
                  <div key={rep.id} style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,overflow:'hidden'}}>
                    {/* Rep header row */}
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',cursor:'pointer',userSelect:'none'}}
                      onClick={()=>toggleRep(rep.id)}>
                      <span style={{color:S.muted,display:'flex',flexShrink:0}}>
                        {isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                      </span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <span style={{fontSize:14,fontWeight:700,color:S.txt}}>{rep.name}</span>
                          {rep.title&&<span style={{fontSize:12,color:S.muted}}>{rep.title}</span>}
                          {acctCount>0&&(
                            <span style={{fontSize:10,fontWeight:600,color:'#007AFF',background:'#EBF4FF',borderRadius:999,padding:'1px 7px'}}>
                              {acctCount} account{acctCount!==1?'s':''}
                            </span>
                          )}
                        </div>
                        <div style={{display:'flex',gap:14,marginTop:2,flexWrap:'wrap'}}>
                          {rep.email&&<span style={{fontSize:12,color:S.muted}}>{rep.email}</span>}
                          {rep.phone&&<span style={{fontSize:12,color:S.muted}}>{rep.phone}</span>}
                        </div>
                      </div>
                      <div style={{display:'flex',gap:3,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>{setRepModal({vendorId:sel.id,repId:rep.id});setRepForm({...rep})}}
                          style={{padding:5,background:'transparent',border:'none',cursor:'pointer',color:S.muted,borderRadius:4,display:'flex'}}
                          onMouseEnter={e=>e.currentTarget.style.color='#007AFF'} onMouseLeave={e=>e.currentTarget.style.color=S.muted}>
                          <Pencil size={13}/>
                        </button>
                        <button onClick={()=>deleteRep(sel.id,rep.id)}
                          style={{padding:5,background:'transparent',border:'none',cursor:'pointer',color:S.muted,borderRadius:4,display:'flex'}}
                          onMouseEnter={e=>e.currentTarget.style.color='#dc2626'} onMouseLeave={e=>e.currentTarget.style.color=S.muted}>
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </div>

                    {/* Expanded body */}
                    {isExpanded&&(
                      <div style={{borderTop:`1px solid ${S.bdr}`,padding:'14px 16px',background:S.isLight?'#fafafa':'rgba(255,255,255,0.02)'}}>
                        {rep.notes&&(
                          <div style={{fontSize:12,color:S.muted,fontStyle:'italic',marginBottom:12,lineHeight:1.55,paddingLeft:2}}>{rep.notes}</div>
                        )}

                        {/* Accounts sub-header */}
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                          <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.06em'}}>
                            Accounts {acctCount>0&&`(${acctCount})`}
                          </div>
                          {addingAccountForRep!==rep.id&&(
                            <button onClick={()=>{setAddingAccountForRep(rep.id);setNewAcctForm(BLANK_ACCT)}}
                              style={{fontSize:12,fontWeight:600,color:'#007AFF',background:'transparent',border:'none',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:3}}>
                              <Plus size={11}/> Add Account
                            </button>
                          )}
                        </div>

                        {/* Existing accounts */}
                        {acctCount>0&&(
                          <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:8}}>
                            {(rep.accounts||[]).map(acct => {
                              const ss = STATUS_STYLE[acct.status] || STATUS_STYLE.Target
                              return (
                                <div key={acct.id} style={{display:'flex',alignItems:'center',gap:7,padding:'6px 8px',background:'#fff',borderRadius:6,border:`1px solid ${S.bdr}`}}>
                                  <input
                                    value={acct.accountName}
                                    onChange={e=>updateAccount(sel.id,rep.id,acct.id,{accountName:e.target.value})}
                                    placeholder='Account name'
                                    style={{flex:'0 0 170px',padding:'4px 7px',border:`1px solid ${S.bdr}`,borderRadius:5,fontSize:13,fontWeight:600,color:S.txt,background:'transparent',outline:'none',minWidth:0}}
                                  />
                                  <select
                                    value={acct.status}
                                    onChange={e=>updateAccount(sel.id,rep.id,acct.id,{status:e.target.value})}
                                    style={{flex:'0 0 96px',padding:'4px 5px',border:`1px solid ${ss.border}`,borderRadius:5,fontSize:11,fontWeight:700,color:ss.color,background:ss.bg,outline:'none',cursor:'pointer'}}>
                                    {STATUS_OPTS.map(s=><option key={s} value={s}>{s}</option>)}
                                  </select>
                                  <input
                                    value={acct.notes}
                                    onChange={e=>updateAccount(sel.id,rep.id,acct.id,{notes:e.target.value})}
                                    placeholder='Quick notes…'
                                    style={{flex:1,padding:'4px 7px',border:`1px solid ${S.bdr}`,borderRadius:5,fontSize:12,color:S.txt,background:'transparent',outline:'none',minWidth:0}}
                                  />
                                  <button onClick={()=>deleteAccount(sel.id,rep.id,acct.id)}
                                    style={{padding:'3px 4px',background:'transparent',border:'none',cursor:'pointer',color:S.muted,flexShrink:0,display:'flex',alignItems:'center'}}
                                    onMouseEnter={e=>e.currentTarget.style.color='#dc2626'} onMouseLeave={e=>e.currentTarget.style.color=S.muted}>
                                    <Trash2 size={13}/>
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Add account inline form */}
                        {addingAccountForRep===rep.id&&(
                          <div style={{display:'flex',alignItems:'center',gap:7,padding:'7px 8px',background:'#EBF4FF',borderRadius:6,border:'1px solid #BFDBFE',marginBottom:8}}>
                            <input
                              autoFocus
                              value={newAcctForm.accountName}
                              onChange={e=>setNewAcctForm(p=>({...p,accountName:e.target.value}))}
                              onKeyDown={e=>{if(e.key==='Enter')addAccount(sel.id,rep.id);if(e.key==='Escape'){setAddingAccountForRep(null);setNewAcctForm(BLANK_ACCT)}}}
                              placeholder='Account name…'
                              style={{flex:'0 0 170px',padding:'4px 7px',border:'1px solid #BFDBFE',borderRadius:5,fontSize:13,fontWeight:600,color:S.txt,background:'#fff',outline:'none'}}
                            />
                            <select
                              value={newAcctForm.status}
                              onChange={e=>setNewAcctForm(p=>({...p,status:e.target.value}))}
                              style={{flex:'0 0 96px',padding:'4px 5px',border:'1px solid #BFDBFE',borderRadius:5,fontSize:11,fontWeight:700,color:'#475569',background:'#fff',outline:'none',cursor:'pointer'}}>
                              {STATUS_OPTS.map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                            <button onClick={()=>addAccount(sel.id,rep.id)}
                              style={{padding:'4px 12px',background:'#007AFF',border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                              Add
                            </button>
                            <button onClick={()=>{setAddingAccountForRep(null);setNewAcctForm(BLANK_ACCT)}}
                              style={{padding:'4px 8px',background:'transparent',border:'1px solid #BFDBFE',borderRadius:5,color:S.muted,fontSize:12,cursor:'pointer',flexShrink:0}}>
                              Cancel
                            </button>
                          </div>
                        )}

                        {acctCount===0&&addingAccountForRep!==rep.id&&(
                          <div style={{fontSize:12,color:S.muted,fontStyle:'italic',paddingLeft:2}}>No accounts tracked yet.</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {importToast&&(
        <div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'rgba(22,163,74,0.93)',color:'#fff',padding:'10px 24px',borderRadius:8,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,0.3)',pointerEvents:'none',whiteSpace:'nowrap'}}>
          {importToast}
        </div>
      )}

      {/* Vendor form modal */}
      {showVendorForm&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={()=>{setShowVendorForm(false);setVendorForm(BLANK_VENDOR)}}>
          <div style={{background:S.surf,borderRadius:10,padding:'24px 28px',width:'100%',maxWidth:460,boxShadow:'0 8px 32px rgba(0,0,0,0.3)'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
              <div style={{fontSize:16,fontWeight:700,color:S.txt}}>{vendorForm.id?'Edit Vendor':'Add Vendor'}</div>
              <button onClick={()=>{setShowVendorForm(false);setVendorForm(BLANK_VENDOR)}} style={{background:'none',border:'none',cursor:'pointer',color:S.muted,padding:2}}><X size={16}/></button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:S.muted,marginBottom:4}}>Company Name *</div>
                <input value={vendorForm.name||''} onChange={e=>setVendorForm(p=>({...p,name:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&saveVendor()} autoFocus style={inp}/>
              </div>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:S.muted,marginBottom:4}}>Category</div>
                <select value={vendorForm.category||''} onChange={e=>setVendorForm(p=>({...p,category:e.target.value}))} style={inp}>
                  <option value=''>Select category…</option>
                  {VENDOR_CATS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:S.muted,marginBottom:4}}>Website</div>
                <input value={vendorForm.website||''} onChange={e=>setVendorForm(p=>({...p,website:e.target.value}))} placeholder='acme.com' style={inp}/>
              </div>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:S.muted,marginBottom:4}}>Notes</div>
                <textarea value={vendorForm.notes||''} onChange={e=>setVendorForm(p=>({...p,notes:e.target.value}))} rows={3} style={{...inp,resize:'vertical'}}/>
              </div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
              <button onClick={()=>{setShowVendorForm(false);setVendorForm(BLANK_VENDOR)}}
                style={{padding:'8px 16px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={saveVendor}
                style={{padding:'8px 16px',background:'#007AFF',border:'none',borderRadius:6,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Rep form modal */}
      {repModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={()=>{setRepModal(null);setRepForm(BLANK_REP)}}>
          <div style={{background:S.surf,borderRadius:10,padding:'24px 28px',width:'100%',maxWidth:480,boxShadow:'0 8px 32px rgba(0,0,0,0.3)'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
              <div style={{fontSize:16,fontWeight:700,color:S.txt}}>{repForm.id?'Edit Rep':'Add Sales Rep'}</div>
              <button onClick={()=>{setRepModal(null);setRepForm(BLANK_REP)}} style={{background:'none',border:'none',cursor:'pointer',color:S.muted,padding:2}}><X size={16}/></button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {[
                {k:'name',  l:'Full Name *', span:2},
                {k:'title', l:'Title'},
                {k:'email', l:'Email'},
                {k:'phone', l:'Phone', span:1},
              ].map(({k,l,span})=>(
                <div key={k} style={{gridColumn:span===2?'span 2':undefined}}>
                  <div style={{fontSize:12,fontWeight:600,color:S.muted,marginBottom:4}}>{l}</div>
                  <input value={repForm[k]||''} onChange={e=>setRepForm(p=>({...p,[k]:e.target.value}))}
                    autoFocus={k==='name'} style={inp}/>
                </div>
              ))}
              <div style={{gridColumn:'span 2'}}>
                <div style={{fontSize:12,fontWeight:600,color:S.muted,marginBottom:4}}>Notes</div>
                <textarea value={repForm.notes||''} onChange={e=>setRepForm(p=>({...p,notes:e.target.value}))} rows={2} style={{...inp,resize:'vertical'}}/>
              </div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
              <button onClick={()=>{setRepModal(null);setRepForm(BLANK_REP)}}
                style={{padding:'8px 16px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={saveRep}
                style={{padding:'8px 16px',background:'#007AFF',border:'none',borderRadius:6,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
