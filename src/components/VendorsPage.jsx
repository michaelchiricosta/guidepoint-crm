import { useState, useRef } from 'react'
import { ArrowLeft, Plus, Search, Trash2, Pencil, Upload, X } from 'lucide-react'
import { S } from '../theme.js'
import { uid, extractJSON } from '../utils.js'
import { SECURITY_FRAMEWORK } from '../securityFramework.js'

const callClaudeWithRetry = async (body, apiKey, onStatus, maxRetries=3) => {
  const lastCall = window._lastAnthropicCall||0
  const wait = 2000-(Date.now()-lastCall)
  if (wait>0) await new Promise(r=>setTimeout(r,wait))
  for (let attempt=0; attempt<maxRetries; attempt++) {
    window._lastAnthropicCall = Date.now()
    const res = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify(body)
    })
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
const BLANK_CO = {id:'',companyName:'',website:'',category:'',notes:'',contacts:[]}
const BLANK_CT = {id:'',name:'',title:'',email:'',phone:'',region:'',territory:'',notes:'',sourceDocument:''}

export default function VendorsPage({data, setData, onBack, apiKey}) {
  const directory = data.vendorDirectory || []
  const [selId, setSelId] = useState(directory[0]?.id||null)
  const [search, setSearch] = useState('')
  const [showCoForm, setShowCoForm] = useState(false)
  const [coForm, setCoForm] = useState(BLANK_CO)
  const [showCtForm, setShowCtForm] = useState(false)
  const [ctForm, setCtForm] = useState(BLANK_CT)
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [review, setReview] = useState(null)
  const [reviewSel, setReviewSel] = useState(new Set())
  const fileRef = useRef(null)

  const sel = directory.find(c=>c.id===selId)
  const filtered = directory.filter(c=>!search.trim()||c.companyName.toLowerCase().includes(search.toLowerCase())||(c.category||'').toLowerCase().includes(search.toLowerCase()))

  const persist = newDir => setData(prev=>({...prev, vendorDirectory:newDir}))

  const saveCo = () => {
    if (!coForm.companyName.trim()) return
    if (coForm.id) {
      persist(directory.map(c=>c.id===coForm.id?{...c,...coForm,contacts:c.contacts||[]}:c))
    } else {
      const nc={...coForm, id:uid(), contacts:[]}
      persist([...directory, nc])
      setSelId(nc.id)
    }
    setShowCoForm(false); setCoForm(BLANK_CO)
  }

  const delCo = id => {
    if (!window.confirm('Delete this vendor company and all its contacts?')) return
    persist(directory.filter(c=>c.id!==id))
    if (selId===id) setSelId(directory.find(c=>c.id!==id)?.id||null)
  }

  const saveCt = () => {
    if (!ctForm.name.trim()||!sel) return
    const updated = ctForm.id
      ? (sel.contacts||[]).map(c=>c.id===ctForm.id?{...c,...ctForm}:c)
      : [...(sel.contacts||[]), {...ctForm, id:uid()}]
    persist(directory.map(c=>c.id===selId?{...c,contacts:updated}:c))
    setShowCtForm(false); setCtForm(BLANK_CT)
  }

  const delCt = cid => {
    if (!window.confirm('Delete this contact?')||!sel) return
    persist(directory.map(c=>c.id===selId?{...c,contacts:(c.contacts||[]).filter(ct=>ct.id!==cid)}:c))
  }

  const handleFile = async file => {
    if (!apiKey) { alert('Add your Anthropic API key in Settings first.'); return }
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf','doc','docx','txt'].includes(ext)) { setUploadError('Unsupported type. Use PDF, DOC, DOCX, or TXT.'); return }
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
      console.error('[VendorsPage] extraction error:', err)
      setUploadError(`Extraction failed: ${err.message}`)
      setUploadStatus('')
    }
  }

  const confirmReview = () => {
    if (!review) return
    const toImport = review.companies.filter((_,i)=>reviewSel.has(i))
    let newDir = [...directory]
    toImport.forEach(ec=>{
      const existing = newDir.find(c=>fuzzyMatchVendor(c.companyName,ec.companyName))
      if (existing) {
        const knownEmails = new Set((existing.contacts||[]).map(c=>(c.email||'').toLowerCase()))
        const merged = {
          ...existing,
          contacts:[...(existing.contacts||[]),
            ...(ec.contacts||[]).filter(c=>!(c.email&&knownEmails.has(c.email.toLowerCase()))).map(c=>({...BLANK_CT,...c,id:uid()}))
          ]
        }
        newDir = newDir.map(c=>c.id===existing.id?merged:c)
      } else {
        newDir.push({id:uid(),companyName:ec.companyName,website:ec.website||'',category:ec.category||'',notes:ec.notes||'',contacts:(ec.contacts||[]).map(c=>({...BLANK_CT,...c,id:uid()}))})
      }
    })
    persist(newDir)
    setReview(null); setReviewSel(new Set())
  }

  const cfk = k => v => setCtForm(p=>({...p,[k]:v}))
  const cok = k => v => setCoForm(p=>({...p,[k]:v}))
  const inputStyle = {width:'100%',padding:'8px 10px',border:`1px solid ${S.bdr}`,borderRadius:6,fontSize:13,color:S.txt,background:S.surf2,boxSizing:'border-box'}

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:S.bg}}>

      {/* Sidebar */}
      <div style={{width:260,flexShrink:0,background:'linear-gradient(180deg,#0f1729 0%,#1a2744 60%,#0f1729 100%)',display:'flex',flexDirection:'column',borderRight:'1px solid rgba(255,255,255,0.06)',overflow:'hidden'}}>
        <div style={{padding:'12px 14px 10px',background:'#ffffff',boxShadow:'0 2px 8px rgba(0,0,0,0.1)',flexShrink:0}}>
          <button onClick={onBack} style={{display:'flex',alignItems:'center',gap:5,background:'transparent',border:'none',cursor:'pointer',color:'#64748b',fontSize:12,fontWeight:600,padding:'2px 0',marginBottom:8}}
            onMouseEnter={e=>e.currentTarget.style.color='#1e293b'} onMouseLeave={e=>e.currentTarget.style.color='#64748b'}>
            <ArrowLeft size={13}/> Back
          </button>
          <div style={{fontSize:16,fontWeight:700,color:'#0f172a'}}>Vendor Directory</div>
          <div style={{fontSize:11,color:'#64748b',marginTop:2}}>{directory.length} vendor compan{directory.length===1?'y':'ies'}</div>
        </div>
        <div style={{padding:'10px 10px 4px',flexShrink:0}}>
          <div style={{position:'relative'}}>
            <Search size={12} style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'#64748b',pointerEvents:'none'}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search vendors…'
              style={{width:'100%',padding:'7px 8px 7px 26px',fontSize:12,background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:6,color:'#e2e8f0',boxSizing:'border-box'}}/>
          </div>
        </div>
        <div style={{padding:'4px 10px 8px',flexShrink:0}}>
          <button onClick={()=>{setCoForm(BLANK_CO);setShowCoForm(true)}}
            style={{width:'100%',padding:'7px',background:'rgba(37,99,235,0.2)',border:'1px solid rgba(59,130,246,0.3)',borderRadius:6,color:'#93c5fd',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
            <Plus size={12}/> Add Vendor Company
          </button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'4px 0'}}>
          {filtered.length===0&&(
            <div style={{padding:'20px 14px',fontSize:12,color:'#64748b',textAlign:'center'}}>
              {directory.length===0?'No vendors yet. Add your first vendor company.':'No vendors match your search.'}
            </div>
          )}
          {filtered.map(c=>{
            const isAct = selId===c.id
            return (
              <div key={c.id} onClick={()=>setSelId(c.id)}
                style={{padding:'9px 12px',cursor:'pointer',borderLeft:isAct?'3px solid #2563eb':'3px solid transparent',background:isAct?'rgba(37,99,235,0.15)':'transparent',color:isAct?'#93c5fd':'#94a3b8',transition:'all 0.1s',borderBottom:'1px solid rgba(255,255,255,0.04)'}}
                onMouseEnter={e=>{if(!isAct){e.currentTarget.style.background='rgba(255,255,255,0.05)';e.currentTarget.style.color='#e2e8f0'}}}
                onMouseLeave={e=>{if(!isAct){e.currentTarget.style.background='transparent';e.currentTarget.style.color='#94a3b8'}}}>
                <div style={{fontSize:13,fontWeight:600,marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.companyName}</div>
                <div style={{fontSize:10,opacity:0.65}}>{c.category||'Uncategorized'} · {(c.contacts||[]).length} contact{(c.contacts||[]).length!==1?'s':''}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main */}
      <div style={{flex:1,overflow:'auto',padding:'20px 24px'}}>

        {/* Review overlay */}
        {review&&(
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:10,padding:'20px 24px',marginBottom:20}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:8}}>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:S.txt}}>Review Extracted Vendors</div>
                <div style={{fontSize:12,color:S.muted,marginTop:2}}>From: {review.fileName} · {review.companies.length} compan{review.companies.length===1?'y':'ies'} found · Click to select/deselect</div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>{setReview(null);setReviewSel(new Set())}}
                  style={{padding:'7px 14px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,color:S.muted,fontSize:13,cursor:'pointer'}}>Discard</button>
                <button onClick={confirmReview} disabled={reviewSel.size===0}
                  style={{padding:'7px 16px',background:reviewSel.size>0?'#2563eb':'#94a3b8',border:'none',borderRadius:6,color:'#fff',fontSize:13,fontWeight:600,cursor:reviewSel.size>0?'pointer':'not-allowed'}}>
                  Import {reviewSel.size} Selected
                </button>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:380,overflowY:'auto'}}>
              {review.companies.map((ec,i)=>{
                const willMerge = !!directory.find(d=>fuzzyMatchVendor(d.companyName,ec.companyName))
                const isChecked = reviewSel.has(i)
                return (
                  <div key={i} onClick={()=>setReviewSel(prev=>{const ns=new Set(prev);ns.has(i)?ns.delete(i):ns.add(i);return ns})}
                    style={{padding:'12px 14px',background:isChecked?(S.isLight?'#eff6ff':'rgba(37,99,235,0.1)'):(S.isLight?'#f8fafc':S.surf2),border:`1px solid ${isChecked?'rgba(37,99,235,0.5)':S.bdr}`,borderRadius:8,cursor:'pointer',userSelect:'none'}}>
                    <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                      <input type='checkbox' checked={isChecked} onChange={()=>{}} style={{marginTop:2,cursor:'pointer',accentColor:'#2563eb',flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <span style={{fontSize:13,fontWeight:700,color:S.txt}}>{ec.companyName}</span>
                          {ec.category&&<span style={{fontSize:10,background:S.isLight?'#e0f2fe':'rgba(59,130,246,0.2)',color:S.isLight?'#0369a1':'#93c5fd',padding:'1px 7px',borderRadius:4}}>{ec.category}</span>}
                          {willMerge&&<span style={{fontSize:10,background:'#fef3c7',color:'#d97706',padding:'1px 7px',borderRadius:4}}>Will merge</span>}
                        </div>
                        {ec.contacts&&ec.contacts.length>0&&(
                          <div style={{marginTop:5,display:'flex',flexWrap:'wrap',gap:4}}>
                            {ec.contacts.map((ct,j)=>(
                              <span key={j} style={{fontSize:11,color:S.muted,background:S.isLight?'#f1f5f9':S.surf,border:`1px solid ${S.bdr}`,padding:'1px 7px',borderRadius:4}}>
                                {ct.name}{ct.title?` · ${ct.title}`:''}
                              </span>
                            ))}
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

        {!sel&&!review&&(
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'50vh',gap:10,color:S.muted}}>
            <div style={{fontSize:36,opacity:0.3}}>🏢</div>
            <div style={{fontSize:15,fontWeight:600,color:S.txt}}>No vendor selected</div>
            <div style={{fontSize:13}}>Select a vendor company from the sidebar, or add one to get started.</div>
          </div>
        )}

        {sel&&!review&&(
          <>
            {/* Company header */}
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20,gap:12,flexWrap:'wrap'}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:22,fontWeight:800,color:S.txt,lineHeight:1.2}}>{sel.companyName}</div>
                <div style={{display:'flex',gap:8,marginTop:5,flexWrap:'wrap',alignItems:'center'}}>
                  {sel.category&&<span style={{fontSize:11,background:S.isLight?'#eff6ff':'rgba(37,99,235,0.15)',color:S.blue,padding:'2px 9px',borderRadius:4}}>{sel.category}</span>}
                  {sel.website&&<a href={sel.website.startsWith('http')?sel.website:`https://${sel.website}`} target='_blank' rel='noreferrer'
                    style={{fontSize:12,color:S.blue,textDecoration:'none',fontWeight:500}}
                    onClick={e=>e.stopPropagation()}>{sel.website}</a>}
                </div>
                {sel.notes&&<div style={{fontSize:13,color:S.muted,marginTop:6,maxWidth:560,lineHeight:1.5}}>{sel.notes}</div>}
              </div>
              <div style={{display:'flex',gap:8,flexShrink:0}}>
                <button onClick={()=>{setCoForm({...sel});setShowCoForm(true)}}
                  style={{padding:'7px 13px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                  <Pencil size={12}/> Edit
                </button>
                <button onClick={()=>delCo(sel.id)}
                  style={{padding:'7px 13px',background:'transparent',border:'1px solid #fca5a5',borderRadius:6,color:'#dc2626',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                  <Trash2 size={12}/> Delete
                </button>
              </div>
            </div>

            {/* Upload */}
            <div style={{background:S.surf,border:`1px dashed ${S.bdr}`,borderRadius:8,padding:'12px 16px',marginBottom:20,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <button onClick={()=>fileRef.current?.click()}
                style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',background:'#2563eb',border:'none',borderRadius:6,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                <Upload size={13}/> Extract from Document
              </button>
              <span style={{fontSize:12,color:S.muted}}>PDF, DOC, DOCX, TXT — AI extracts all vendor contacts</span>
              {uploadStatus&&<span style={{fontSize:12,color:S.blue,fontStyle:'italic'}}>{uploadStatus}</span>}
              {uploadError&&<span style={{fontSize:12,color:'#dc2626'}}>{uploadError}</span>}
              <input ref={fileRef} type='file' accept='.pdf,.doc,.docx,.txt' style={{display:'none'}}
                onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);e.target.value=''}}/>
            </div>

            {/* Contacts header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:700,color:S.txt}}>Contacts ({(sel.contacts||[]).length})</div>
              <button onClick={()=>{setCtForm(BLANK_CT);setShowCtForm(true)}}
                style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:'#2563eb',border:'none',borderRadius:6,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                <Plus size={12}/> Add Contact
              </button>
            </div>

            {(sel.contacts||[]).length===0&&(
              <div style={{textAlign:'center',padding:'32px 20px',color:S.muted,fontSize:13,background:S.surf,borderRadius:8,border:`1px dashed ${S.bdr}`}}>
                No contacts yet. Add manually or upload a document to extract contacts with AI.
              </div>
            )}

            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))',gap:12}}>
              {(sel.contacts||[]).map(ct=>(
                <div key={ct.id} style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,padding:'14px 16px'}}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:8}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:S.txt,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ct.name}</div>
                      {ct.title&&<div style={{fontSize:12,color:S.muted,marginTop:1}}>{ct.title}</div>}
                    </div>
                    <div style={{display:'flex',gap:2,flexShrink:0}}>
                      <button onClick={()=>{setCtForm({...ct});setShowCtForm(true)}}
                        style={{padding:4,background:'transparent',border:'none',cursor:'pointer',color:S.muted,borderRadius:4,display:'flex'}}
                        onMouseEnter={e=>e.currentTarget.style.color=S.blue} onMouseLeave={e=>e.currentTarget.style.color=S.muted}><Pencil size={13}/></button>
                      <button onClick={()=>delCt(ct.id)}
                        style={{padding:4,background:'transparent',border:'none',cursor:'pointer',color:S.muted,borderRadius:4,display:'flex'}}
                        onMouseEnter={e=>e.currentTarget.style.color='#dc2626'} onMouseLeave={e=>e.currentTarget.style.color=S.muted}><Trash2 size={13}/></button>
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:3}}>
                    {ct.email&&<div style={{fontSize:12,color:S.txt}}><span style={{color:S.muted,fontSize:11}}>Email </span>{ct.email}</div>}
                    {ct.phone&&<div style={{fontSize:12,color:S.txt}}><span style={{color:S.muted,fontSize:11}}>Phone </span>{ct.phone}</div>}
                    {(ct.region||ct.territory)&&<div style={{fontSize:12,color:S.txt}}><span style={{color:S.muted,fontSize:11}}>Territory </span>{[ct.region,ct.territory].filter(Boolean).join(' / ')}</div>}
                    {ct.notes&&<div style={{fontSize:12,color:S.muted,marginTop:3,fontStyle:'italic',lineHeight:1.4}}>{ct.notes}</div>}
                    {ct.sourceDocument&&<div style={{fontSize:10,color:S.muted,marginTop:3,opacity:0.7}}>Source: {ct.sourceDocument}</div>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Company form modal */}
      {showCoForm&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:S.surf,borderRadius:10,padding:'24px 28px',width:'100%',maxWidth:460,boxShadow:'0 8px 32px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
              <div style={{fontSize:16,fontWeight:700,color:S.txt}}>{coForm.id?'Edit Vendor':'Add Vendor Company'}</div>
              <button onClick={()=>{setShowCoForm(false);setCoForm(BLANK_CO)}} style={{background:'none',border:'none',cursor:'pointer',color:S.muted,padding:2}}><X size={16}/></button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div><div style={{fontSize:12,fontWeight:600,color:S.muted,marginBottom:4}}>Company Name *</div>
                <input value={coForm.companyName} onChange={e=>cok('companyName')(e.target.value)} style={inputStyle}/>
              </div>
              <div><div style={{fontSize:12,fontWeight:600,color:S.muted,marginBottom:4}}>Category</div>
                <select value={coForm.category} onChange={e=>cok('category')(e.target.value)} style={inputStyle}>
                  <option value=''>Select category…</option>
                  {VENDOR_CATS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><div style={{fontSize:12,fontWeight:600,color:S.muted,marginBottom:4}}>Website</div>
                <input value={coForm.website} onChange={e=>cok('website')(e.target.value)} placeholder='acme.com' style={inputStyle}/>
              </div>
              <div><div style={{fontSize:12,fontWeight:600,color:S.muted,marginBottom:4}}>Notes</div>
                <textarea value={coForm.notes} onChange={e=>cok('notes')(e.target.value)} rows={3}
                  style={{...inputStyle,resize:'vertical'}}/>
              </div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
              <button onClick={()=>{setShowCoForm(false);setCoForm(BLANK_CO)}}
                style={{padding:'8px 16px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={saveCo}
                style={{padding:'8px 16px',background:'#2563eb',border:'none',borderRadius:6,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Contact form modal */}
      {showCtForm&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:S.surf,borderRadius:10,padding:'24px 28px',width:'100%',maxWidth:520,boxShadow:'0 8px 32px rgba(0,0,0,0.3)',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
              <div style={{fontSize:16,fontWeight:700,color:S.txt}}>{ctForm.id?'Edit Contact':'Add Contact'}</div>
              <button onClick={()=>{setShowCtForm(false);setCtForm(BLANK_CT)}} style={{background:'none',border:'none',cursor:'pointer',color:S.muted,padding:2}}><X size={16}/></button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {[
                {k:'name',l:'Full Name *',span:2},
                {k:'title',l:'Job Title'},
                {k:'email',l:'Email'},
                {k:'phone',l:'Phone'},
                {k:'region',l:'Region'},
                {k:'territory',l:'Territory'},
                {k:'notes',l:'Notes',span:2,multi:true},
                {k:'sourceDocument',l:'Source Document',span:2}
              ].map(({k,l,span,multi})=>(
                <div key={k} style={{gridColumn:span?`span ${span}`:undefined}}>
                  <div style={{fontSize:12,fontWeight:600,color:S.muted,marginBottom:4}}>{l}</div>
                  {multi
                    ?<textarea value={ctForm[k]||''} onChange={e=>cfk(k)(e.target.value)} rows={2} style={{...inputStyle,resize:'vertical'}}/>
                    :<input value={ctForm[k]||''} onChange={e=>cfk(k)(e.target.value)} style={inputStyle}/>
                  }
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
              <button onClick={()=>{setShowCtForm(false);setCtForm(BLANK_CT)}}
                style={{padding:'8px 16px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={saveCt}
                style={{padding:'8px 16px',background:'#2563eb',border:'none',borderRadius:6,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
