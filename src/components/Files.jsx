import { useState } from 'react'
import { S } from '../theme.js'
import { uid } from '../utils.js'
import { Field, Btn } from './UI.jsx'
import { uploadFile, getFileUrl, deleteFile } from '../supabase.js'

export default function Files({acct,setAcct}) {
  const [showUpload,setShowUpload] = useState(false)
  const [uploading,setUploading] = useState(false)
  const [uploadErr,setUploadErr] = useState('')
  const [fileInput,setFileInput] = useState(null)
  const [category,setCategory] = useState('Other')
  const [notes,setNotes] = useState('')
  const [viewingId,setViewingId] = useState(null)
  const [actionErr,setActionErr] = useState('')
  const [showAddLink,setShowAddLink] = useState(false)
  const [linkForm,setLinkForm] = useState({url:'',title:'',category:'Reference',notes:''})
  const [linkError,setLinkError] = useState('')
  const [editLinkId,setEditLinkId] = useState(null)
  const [copiedId,setCopiedId] = useState(null)
  const FILE_CATS = ['NDA','MSA','Contract','SOW','Proposal','Quote','Reference','Other']
  const fmtSize = b => b>=1048576?`${(b/1048576).toFixed(1)} MB`:b>=1024?`${(b/1024).toFixed(0)} KB`:`${b} B`
  const fileIcon = type => {
    if(!type) return {icon:'📄',c:'#9CA3AF'}
    if(type.includes('pdf')) return {icon:'📕',c:'#dc2626'}
    if(type.includes('html')) return {icon:'📋',c:'#007AFF'}
    if(type.includes('word')||type.includes('document')) return {icon:'📘',c:'#007AFF'}
    if(type.includes('sheet')||type.includes('excel')||type.includes('csv')) return {icon:'📗',c:'#16a34a'}
    if(type.includes('presentation')||type.includes('powerpoint')) return {icon:'📙',c:'#ea580c'}
    if(type.startsWith('image/')) return {icon:'🖼️',c:'#7c3aed'}
    return {icon:'📄',c:'#64748b'}
  }
  const grouped = (acct.files||[]).reduce((acc,f)=>{(acc[f.category]||(acc[f.category]=[])).push(f);return acc},{})

  const doUpload = async () => {
    if(!fileInput) return
    setUploading(true); setUploadErr('')
    try {
      const meta = await uploadFile(acct.id, fileInput, category, notes)
      setAcct(p=>({...p, files:[...(p.files||[]), meta]}))
      setShowUpload(false); setFileInput(null); setCategory('Other'); setNotes('')
    } catch(e) { setUploadErr(e.message||'Upload failed') }
    finally { setUploading(false) }
  }

  const doView = async f => {
    if (f.isInline && f.content) {
      const w = window.open('','_blank')
      if (w) { w.document.write(f.content); w.document.close() }
      return
    }
    setViewingId(f.id); setActionErr('')
    try { const url=await getFileUrl(f.path); if(url)window.open(url,'_blank') }
    catch(e){setActionErr('Could not load file. Please try again.')}
    finally{setViewingId(null)}
  }

  const doDownload = async f => {
    if (f.isInline && f.content) {
      const blob = new Blob([f.content],{type:f.type||'text/html'})
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href=url; a.download=f.name; a.click()
      URL.revokeObjectURL(url)
      return
    }
    setViewingId(f.id); setActionErr('')
    try {
      const url=await getFileUrl(f.path)
      if(url){const a=document.createElement('a');a.href=url;a.download=f.name;a.click()}
    } catch(e){setActionErr('Could not download file. Please try again.')}
    finally{setViewingId(null)}
  }

  const doDelete = async f => {
    if(!window.confirm(`Delete "${f.name}"?`)) return
    setActionErr('')
    if (f.isInline) {
      setAcct(p=>({...p, files:(p.files||[]).filter(x=>x.id!==f.id)}))
      return
    }
    try {
      await deleteFile(f.path)
      setAcct(p=>({...p, files:(p.files||[]).filter(x=>x.id!==f.id)}))
    } catch(e){setActionErr('Delete failed. Please try again.')}
  }

  const LINK_CATS = ['Contract','Proposal','Resource','Portal','Reference','Other']
  const linkIcon = cat => ({Contract:'📄',Proposal:'📋',Resource:'📚',Portal:'🌐',Reference:'🔍',Other:'🔗'}[cat]||'🔗')
  const savedLinks = acct.savedLinks||[]
  const openAddLink = () => {setLinkForm({url:'',title:'',category:'Reference',notes:''});setEditLinkId(null);setLinkError('');setShowAddLink(true)}
  const cancelLink = () => {setShowAddLink(false);setEditLinkId(null);setLinkForm({url:'',title:'',category:'Reference',notes:''});setLinkError('')}
  const saveLink = () => {
    if(!linkForm.url.match(/^https?:\/\//)){setLinkError('URL must start with http:// or https://');return}
    if(!linkForm.title.trim()){setLinkError('Title is required');return}
    if(editLinkId){setAcct(p=>({...p,savedLinks:(p.savedLinks||[]).map(l=>l.id===editLinkId?{...l,...linkForm}:l)}));setEditLinkId(null)}
    else{setAcct(p=>({...p,savedLinks:[...(p.savedLinks||[]),{...linkForm,id:uid(),addedAt:new Date().toISOString()}]}))}
    setShowAddLink(false);setLinkForm({url:'',title:'',category:'Reference',notes:''});setLinkError('')
  }
  const startEditLink = l => {setLinkForm({url:l.url,title:l.title,category:l.category,notes:l.notes||''});setEditLinkId(l.id);setLinkError('');setShowAddLink(true)}
  const deleteLink = id => {if(!window.confirm('Remove this saved link?'))return;setAcct(p=>({...p,savedLinks:(p.savedLinks||[]).filter(l=>l.id!==id)}))}
  const copyUrl = (id,url) => {navigator.clipboard.writeText(url).then(()=>{setCopiedId(id);setTimeout(()=>setCopiedId(null),2000)}).catch(()=>{})}
  const renderLinkRow = l => {
    const isCopied=copiedId===l.id
    const truncUrl=l.url.length>50?l.url.slice(0,50)+'…':l.url
    return(
      <div key={l.id}
        style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',gap:12,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',transition:'background 0.1s'}}
        onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
        onMouseLeave={e=>e.currentTarget.style.background=S.surf}>
        <span style={{fontSize:20,flexShrink:0,lineHeight:1}}>{linkIcon(l.category)}</span>
        <div style={{flex:1,minWidth:0}}>
          <a href={l.url} target='_blank' rel='noreferrer'
            style={{fontSize:13,fontWeight:600,color:'#111827',textDecoration:'none',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
            onMouseEnter={e=>e.currentTarget.style.textDecoration='underline'}
            onMouseLeave={e=>e.currentTarget.style.textDecoration='none'}>
            {l.title||l.url}
          </a>
          <a href={l.url} target='_blank' rel='noreferrer' title={l.url}
            style={{fontSize:11,color:'#007AFF',textDecoration:'none',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:1}}>
            {truncUrl}
          </a>
          {l.notes&&<div style={{fontSize:11,color:'#9CA3AF',marginTop:2}}>{l.notes}</div>}
        </div>
        <div style={{display:'flex',gap:4,flexShrink:0,alignItems:'center'}}>
          <span style={{fontSize:10,fontWeight:700,color:S.blue,background:'#EBF4FF',borderRadius:999,padding:'2px 7px',whiteSpace:'nowrap'}}>{l.category}</span>
          <button onClick={()=>copyUrl(l.id,l.url)} title='Copy URL'
            style={{padding:'4px 8px',background:isCopied?('#D1FAE5'):S.surf2,border:`1px solid ${isCopied?('#6EE7B7'):S.bdr}`,borderRadius:6,color:isCopied?S.green:S.muted,cursor:'pointer',fontSize:11,fontWeight:isCopied?600:400,transition:'all 0.2s',whiteSpace:'nowrap'}}>
            {isCopied?'Copied!':'⎘'}
          </button>
          <button onClick={()=>startEditLink(l)} title='Edit link'
            style={{padding:'4px 8px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.muted,cursor:'pointer',fontSize:12}}>✏</button>
          <button onClick={()=>deleteLink(l.id)} title='Remove link'
            style={{padding:'4px 8px',background:S.isLight?'#fef2f2':'rgba(239,68,68,0.08)',border:`1px solid ${'#FECACA'}`,borderRadius:6,color:S.red,cursor:'pointer',fontSize:12}}>×</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:S.txt}}>Account Files</div>
          <div style={{fontSize:12,color:S.muted,marginTop:2}}>{(acct.files||[]).length} file{(acct.files||[]).length!==1?'s':''} stored</div>
        </div>
        <Btn variant='primary' onClick={()=>setShowUpload(true)}>+ Upload File</Btn>
      </div>

      {actionErr&&<div style={{background:'#FEE2E2',border:`1px solid ${S.isLight?'#fecaca':'rgba(239,68,68,0.3)'}`,borderRadius:6,padding:'8px 12px',fontSize:13,color:S.red,marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span>{actionErr}</span><button onClick={()=>setActionErr('')} style={{background:'none',border:'none',color:S.red,cursor:'pointer',fontSize:16,lineHeight:1}}>×</button></div>}

      {showUpload&&(
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:14,width:'100%',maxWidth:480,boxShadow:'0 20px 60px rgba(0,0,0,0.15)',overflow:'hidden'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:`1px solid ${S.bdr}`}}>
              <div style={{fontSize:16,fontWeight:700,color:S.txt}}>Upload File</div>
              <button onClick={()=>{setShowUpload(false);setFileInput(null);setUploadErr('')}} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1}}>×</button>
            </div>
            <div style={{padding:20}}>
              <div style={{marginBottom:14}}>
                <label style={{display:'block',background:S.surf2,border:`2px dashed ${S.bdr2}`,borderRadius:8,padding:'24px 16px',textAlign:'center',cursor:'pointer'}}>
                  <input type='file' style={{display:'none'}} onChange={e=>setFileInput(e.target.files[0]||null)}/>
                  {fileInput ? (
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:S.txt}}>{fileInput.name}</div>
                      <div style={{fontSize:11,color:S.muted,marginTop:3}}>{fmtSize(fileInput.size)}</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{fontSize:24,marginBottom:6}}>📁</div>
                      <div style={{fontSize:13,color:S.muted}}>Click to choose a file</div>
                    </div>
                  )}
                </label>
              </div>
              <Field label='Category' value={category} onChange={setCategory} options={FILE_CATS}/>
              <Field label='Notes (optional)' value={notes} onChange={setNotes} placeholder='Brief description...'/>
              {uploadErr&&<div style={{fontSize:12,color:S.red,background:'#FEE2E2',border:`1px solid ${S.isLight?'#fecaca':'rgba(239,68,68,0.3)'}`,borderRadius:6,padding:'8px 12px',marginBottom:12}}>{uploadErr}</div>}
              <div style={{display:'flex',gap:8}}>
                <Btn variant='primary' onClick={doUpload} disabled={!fileInput||uploading} style={{flex:1,justifyContent:'center'}}>{uploading?'Uploading…':'Upload'}</Btn>
                <Btn onClick={()=>{setShowUpload(false);setFileInput(null);setUploadErr('')}}>Cancel</Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {(acct.files||[]).length===0 ? (
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'56px 20px',textAlign:'center'}}>
          <div style={{fontSize:40,marginBottom:12,opacity:0.4}}>📁</div>
          <div style={{fontSize:15,fontWeight:600,color:S.txt,marginBottom:6}}>No files uploaded yet</div>
          <div style={{fontSize:13,color:S.muted,maxWidth:340,lineHeight:1.6}}>Upload NDAs, MSAs, contracts, and other account documents to keep everything in one place.</div>
        </div>
      ) : (
        Object.entries(grouped).map(([cat,files])=>(
          <div key={cat} style={{marginBottom:20}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
              <span style={{fontSize:11,fontWeight:700,color:S.secondary,letterSpacing:'0.08em',textTransform:'uppercase'}}>{cat}</span>
              <span style={{fontSize:11,fontWeight:700,color:S.blue,background:'#EBF4FF',borderRadius:999,padding:'1px 7px'}}>{files.length}</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {files.map(f=>{
                const {icon,c}=fileIcon(f.type)
                const isLoading=viewingId===f.id
                return (
                  <div key={f.id} style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',gap:12,boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
                    <span style={{fontSize:22,flexShrink:0,lineHeight:1}}>{icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:S.txt,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</div>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginTop:2,flexWrap:'wrap'}}>
                        <span style={{fontSize:10,color:S.muted}}>{fmtSize(f.size)}</span>
                        <span style={{fontSize:10,color:S.dim}}>·</span>
                        <span style={{fontSize:10,color:S.muted}}>{new Date(f.uploadedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
                        {f.notes&&<><span style={{fontSize:10,color:S.dim}}>·</span><span style={{fontSize:10,color:S.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:160}}>{f.notes}</span></>}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:4,flexShrink:0}}>
                      <button onClick={()=>doView(f)} disabled={isLoading} title='View' style={{padding:'5px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.secondary,cursor:'pointer',fontSize:12}}>{isLoading?'…':'👁'}</button>
                      <button onClick={()=>doDownload(f)} disabled={isLoading} title='Download' style={{padding:'5px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.secondary,cursor:'pointer',fontSize:12}}>⬇</button>
                      <button onClick={()=>doDelete(f)} title='Delete' style={{padding:'5px 10px',background:S.isLight?'#fef2f2':'rgba(239,68,68,0.08)',border:`1px solid ${'#FECACA'}`,borderRadius:6,color:S.red,cursor:'pointer',fontSize:12}}>×</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      {/* ─── Saved Links ─── */}
      <div style={{marginTop:32,borderTop:`1px solid ${S.bdr}`,paddingTop:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:showAddLink?12:16}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:S.txt}}>Saved Links</div>
            <div style={{fontSize:12,color:S.muted,marginTop:2}}>{savedLinks.length} link{savedLinks.length!==1?'s':''} saved</div>
          </div>
          {!showAddLink&&<button onClick={openAddLink} style={{padding:'6px 12px',background:'#007AFF',border:'none',borderRadius:6,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>+ Add Link</button>}
        </div>

        {showAddLink&&(
          <div style={{background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:10,padding:16,marginBottom:16}}>
            <Field label='URL' value={linkForm.url} onChange={v=>setLinkForm(p=>({...p,url:v}))} placeholder='https://'/>
            <Field label='Title' value={linkForm.title} onChange={v=>setLinkForm(p=>({...p,title:v}))} placeholder='Give this link a name (e.g. Customer Portal, SharePoint, Contract Doc)'/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
              <Field label='Category' value={linkForm.category} onChange={v=>setLinkForm(p=>({...p,category:v}))} options={LINK_CATS}/>
              <Field label='Notes (optional)' value={linkForm.notes} onChange={v=>setLinkForm(p=>({...p,notes:v}))} placeholder='Brief context...'/>
            </div>
            {linkError&&<div style={{fontSize:12,color:S.red,background:'#FEE2E2',border:`1px solid ${S.isLight?'#fecaca':'rgba(239,68,68,0.3)'}`,borderRadius:6,padding:'7px 12px',marginBottom:10}}>{linkError}</div>}
            <div style={{display:'flex',gap:8}}>
              <Btn variant='primary' onClick={saveLink}>{editLinkId?'Update Link':'Save Link'}</Btn>
              <Btn onClick={cancelLink}>Cancel</Btn>
            </div>
          </div>
        )}

        {savedLinks.length===0 ? (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'40px 20px',textAlign:'center'}}>
            <div style={{fontSize:32,marginBottom:10,opacity:0.4}}>🔗</div>
            <div style={{fontSize:14,fontWeight:600,color:S.txt,marginBottom:4}}>No saved links yet</div>
            <div style={{fontSize:12,color:S.muted}}>Click + Add Link to save URLs for quick access.</div>
          </div>
        ) : savedLinks.length > 3 ? (
          Object.entries(savedLinks.reduce((acc,l)=>{(acc[l.category]||(acc[l.category]=[])).push(l);return acc},{})).map(([cat,links])=>(
            <div key={cat} style={{marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <span style={{fontSize:11,fontWeight:700,color:S.secondary,letterSpacing:'0.08em',textTransform:'uppercase'}}>{cat}</span>
                <span style={{fontSize:11,fontWeight:700,color:S.blue,background:'#EBF4FF',borderRadius:999,padding:'1px 7px'}}>{links.length}</span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>{links.map(renderLinkRow)}</div>
            </div>
          ))
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:4}}>{savedLinks.map(renderLinkRow)}</div>
        )}
      </div>
    </div>
  )
}
