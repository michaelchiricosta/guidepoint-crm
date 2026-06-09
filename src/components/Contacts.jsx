import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabase.js'
import * as XLSX from 'xlsx'
import { ArrowLeft, List } from 'lucide-react'
import { S, IC } from '../theme.js'
import { uid, fmtDate, daysSince, initials } from '../utils.js'
import { INFLUENCES, INTERACTION_COLORS } from '../constants.js'
import { Badge, Btn, Field, Modal, SH, Card } from './UI.jsx'

export default function Contacts({acct,setAcct,data,setData}) {
  const [exp,setExp] = useState(null)
  const [showAdd,setShowAdd] = useState(false)
  const [form,setForm] = useState({})
  const [noteTarget,setNoteTarget] = useState(null)
  const [noteText,setNoteText] = useState('')
  const [contactSearch,setContactSearch] = useState('')
  const [clientFilter,setClientFilter] = useState('All')
  const [clientSort,setClientSort] = useState('Name')
  const [sectionExp,setSectionExp] = useState({client:true,vendor:true,internal:true})
  const [meetingFormFor,setMeetingFormFor] = useState(null)
  const [meetingForm,setMeetingForm] = useState({date:'',clientContactIds:[],topics:'',notes:''})
  // View toggle
  const [contactView,setContactView] = useState('list')
  // Org chart
  const [dragState,setDragState] = useState(null)
  const [dragOverNode,setDragOverNode] = useState(null)
  const [contextMenu,setContextMenu] = useState(null)
  const [canvasSize,setCanvasSize] = useState({w:800,h:480})
  const canvasRef = useRef(null)
  const chartContentRef = useRef(null)
  // Zoom / pan
  const [zoom,setZoom] = useState(1)
  const [pan,setPan] = useState({x:0,y:0})
  const [isPanning,setIsPanning] = useState(false)
  const [panStart,setPanStart] = useState(null)
  const [pinchStartDist,setPinchStartDist] = useState(null)
  const [pinchStartZoom,setPinchStartZoom] = useState(1)
  // Node detail popover & export
  const [openDetailNode,setOpenDetailNode] = useState(null)
  const [exportDropdown,setExportDropdown] = useState(false)
  const [exportToast,setExportToast] = useState(null)
  // Import contacts
  const [showImport,setShowImport] = useState(false)
  const [importRows,setImportRows] = useState([])
  const [importSelections,setImportSelections] = useState(new Set())
  const [importSuccess,setImportSuccess] = useState(null)
  const [importDragOver,setImportDragOver] = useState(false)
  // Ref bundle so touch/wheel handlers always see latest state
  const orgStateRef = useRef({})
  useEffect(()=>{ orgStateRef.current = {zoom,pan,panStart,pinchStartDist,pinchStartZoom,openDetailNode} })
  // Mouse-based node drag
  const nodeDragRef = useRef(null)
  const [liveDragPos,setLiveDragPos] = useState(null)
  const justDraggedRef = useRef(false)
  const [photoPopover,setPhotoPopover] = useState(null)
  const [hoveredPhoto,setHoveredPhoto] = useState(null)
  const [photoTarget,setPhotoTarget] = useState(null)
  const photoInputRef = useRef(null)
  const [editingNotes,setEditingNotes] = useState(null)
  const [notesText,setNotesText] = useState('')

  useEffect(()=>{
    if(!photoPopover)return
    const h=()=>setPhotoPopover(null)
    document.addEventListener('click',h)
    return()=>document.removeEventListener('click',h)
  },[photoPopover])

  useEffect(()=>{
    if(!canvasRef.current||contactView!=='orgchart')return
    const obs=new ResizeObserver(entries=>{const{width,height}=entries[0].contentRect;setCanvasSize({w:Math.max(width,200),h:Math.max(height,100)})})
    obs.observe(canvasRef.current)
    return()=>obs.disconnect()
  },[contactView])

  useEffect(()=>{
    if(!contextMenu)return
    const h=()=>setContextMenu(null)
    document.addEventListener('click',h)
    return()=>document.removeEventListener('click',h)
  },[contextMenu])

  // Mouse-wheel zoom (needs passive:false)
  useEffect(()=>{
    if(contactView!=='orgchart'||!canvasRef.current)return
    const canvas=canvasRef.current
    const onWheel=e=>{
      e.preventDefault()
      const delta=e.ctrlKey?-e.deltaY*0.01:-e.deltaY*0.001
      const rect=canvas.getBoundingClientRect()
      const mx=e.clientX-rect.left, my=e.clientY-rect.top
      setZoom(z=>{
        const nz=Math.max(0.25,Math.min(3,z+delta))
        setPan(p=>({x:mx-(mx-p.x)/z*nz, y:my-(my-p.y)/z*nz}))
        return nz
      })
    }
    canvas.addEventListener('wheel',onWheel,{passive:false})
    return()=>canvas.removeEventListener('wheel',onWheel)
  },[contactView])

  // Keyboard shortcuts
  useEffect(()=>{
    if(contactView!=='orgchart')return
    const h=e=>{
      if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return
      if(e.key==='+'||e.key==='=')setZoom(z=>Math.min(3,z+0.1))
      if(e.key==='-')setZoom(z=>Math.max(0.25,z-0.1))
      if(e.key==='0'){setZoom(1);setPan({x:0,y:0})}
      if(e.key==='ArrowLeft')setPan(p=>({...p,x:p.x+30}))
      if(e.key==='ArrowRight')setPan(p=>({...p,x:p.x-30}))
      if(e.key==='ArrowUp')setPan(p=>({...p,y:p.y+30}))
      if(e.key==='ArrowDown')setPan(p=>({...p,y:p.y-30}))
      if(e.key==='Escape'){setOpenDetailNode(null);setExportDropdown(false)}
    }
    window.addEventListener('keydown',h)
    return()=>window.removeEventListener('keydown',h)
  },[contactView])
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const blank={id:'',name:'',title:'',email:'',cell:'',linkedin:'',location:'',dept:'',influence:'Stakeholder',sentiment:'neutral',relStatus:'Building',toolsOwn:'',goals:'',pains:'',notes:'',personalNotes:'',lastInteracted:'',contactType:'Client',vendorCompany:'',contactPhoto:'',internalMeetings:[]}
  const save=()=>{if(!form.name)return;const saved={...blank,...form};if(form.id)setAcct(p=>({...p,contacts:p.contacts.map(c=>c.id===form.id?saved:c)}));else setAcct(p=>({...p,contacts:[...p.contacts,{...saved,id:uid()}]}));setShowAdd(false);setForm(blank)}
  const del=id=>{if(window.confirm('Delete contact?'))setAcct(p=>({...p,contacts:p.contacts.filter(c=>c.id!==id)}))}
  const sentC={positive:S.green,neutral:S.muted,negative:S.red}
  const relC={'Never Met':S.muted,Strong:S.green,Building:S.blue,'Needs Attention':S.orange,Unknown:S.muted}
  const saveNote=c=>{if(!noteText.trim()){setNoteTarget(null);return};const stamp=`[${new Date().toISOString().split('T')[0]}] ${noteText.trim()}`;setAcct(p=>({...p,contacts:p.contacts.map(ct=>ct.id===c.id?{...ct,notes:(ct.notes?ct.notes+' | ':'')+stamp}:ct)}));setNoteTarget(null);setNoteText('')}
  const compressImage = (file) => new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    const img = new Image()
    img.onload = () => {
      const maxSize = 200
      let w = img.width, h = img.height
      if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize } }
      else { if (h > maxSize) { w = w * maxSize / h; h = maxSize } }
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = URL.createObjectURL(file)
  })
  const handleContactPhotoSave = async (file, contactId) => {
    const compressed = await compressImage(file)
    const updatedContacts = (acct.contacts || []).map(c =>
      c.id === contactId ? {...c, contactPhoto: compressed} : c
    )
    const updatedAcct = {...acct, contacts: updatedContacts}
    const updatedAccounts = (data.accounts || []).map(a =>
      a.id === acct.id ? updatedAcct : a
    )
    const updatedData = {...data, accounts: updatedAccounts}
    setAcct(p=>({...p, contacts: updatedContacts}))
    setData(updatedData)
    setPhotoPopover(null)
    try {
      const { error } = await supabase
        .from('accounts')
        .upsert({
          id: 'user-data',
          data: updatedData,
          updated_at: new Date().toISOString()
        })
      if (error) throw error
      console.log('Contact photo saved for:', contactId)
    } catch (err) {
      console.error('Contact photo save failed:', err)
    }
  }
  const removePhoto = (contactId) => {
    setAcct(p=>({...p,contacts:p.contacts.map(c=>c.id===contactId?{...c,contactPhoto:''}:c)}))
    setPhotoPopover(null)
  }
  const dismissMention=id=>setAcct(p=>({...p,unknownMentions:(p.unknownMentions||[]).filter(m=>m.id!==id)}))
  const dismissSuggestion=id=>setAcct(p=>({...p,contactSuggestions:(p.contactSuggestions||[]).filter(s=>s.id!==id)}))
  const applySuggestion=s=>{
    setAcct(p=>({
      ...p,
      contacts:p.contacts.map(c=>{
        const fn=s.contactName.split(' ')[0].toLowerCase()
        if(!c.name.toLowerCase().includes(fn))return c
        let u={...c}
        if(s.suggestedRole&&s.suggestedRole!==c.title)u.title=s.suggestedRole
        if(s.suggestedInfluence)u.influence=s.suggestedInfluence
        return u
      }),
      contactSuggestions:(p.contactSuggestions||[]).filter(sg=>sg.id!==s.id)
    }))
  }
  const acceptAllSuggestions=()=>{
    const sugs=acct.contactSuggestions||[]
    setAcct(p=>({
      ...p,
      contacts:p.contacts.map(c=>{
        const matchSug=sugs.find(s=>{const fn=s.contactName.split(' ')[0].toLowerCase();return c.name.toLowerCase().includes(fn)})
        if(!matchSug)return c
        let u={...c}
        if(matchSug.suggestedRole&&matchSug.suggestedRole!==c.title)u.title=matchSug.suggestedRole
        if(matchSug.suggestedInfluence)u.influence=matchSug.suggestedInfluence
        return u
      }),
      contactSuggestions:[]
    }))
  }
  const logMeeting=internalId=>{
    if(!meetingForm.date)return
    setAcct(p=>({...p,contacts:p.contacts.map(c=>c.id===internalId?{...c,internalMeetings:[...(c.internalMeetings||[]),{id:uid(),...meetingForm}]}:c)}))
    setMeetingFormFor(null);setMeetingForm({date:'',clientContactIds:[],topics:'',notes:''})
  }

  const allContacts=acct.contacts||[]
  const sq=contactSearch.toLowerCase().trim()
  const matchSearch=c=>!sq||c.name.toLowerCase().includes(sq)||c.title.toLowerCase().includes(sq)||(c.dept||'').toLowerCase().includes(sq)
  const clientContacts=allContacts.filter(c=>(c.contactType||'Client')==='Client')
  const vendorContacts=allContacts.filter(c=>c.contactType==='Vendor')
  const internalContacts=allContacts.filter(c=>c.contactType==='Internal')
  const clientsList=clientContacts

  const applyFilter=c=>{
    if(!matchSearch(c))return false
    if(clientFilter==='Active')return c.relStatus==='Strong'||c.relStatus==='Building'
    if(clientFilter==='Prospect')return c.relStatus==='Unknown'||c.relStatus==='Needs Attention'
    if(clientFilter==='Executive Sponsor')return c.influence==='Executive Sponsor'
    if(clientFilter==='Needs Attention')return c.relStatus==='Needs Attention'
    return true
  }
  const applySort=(a,b)=>{
    if(clientSort==='Name')return a.name.localeCompare(b.name)
    if(clientSort==='Last Interacted'){const da=daysSince(a.lastInteracted)??999,db=daysSince(b.lastInteracted)??999;return da-db}
    if(clientSort==='Relationship Status'){const o=['Strong','Building','Needs Attention','Unknown','Never Met'];return(o.indexOf(a.relStatus)||0)-(o.indexOf(b.relStatus)||0)}
    if(clientSort==='Influence Level')return(INFLUENCES.indexOf(a.influence)||0)-(INFLUENCES.indexOf(b.influence)||0)
    if(clientSort==='Days Since Contact'){const da=daysSince(a.lastInteracted)??-1,db=daysSince(b.lastInteracted)??-1;return db-da}
    return 0
  }
  const filteredClients=clientContacts.filter(applyFilter).sort(applySort)
  const filteredVendors=vendorContacts.filter(matchSearch)
  const filteredInternal=internalContacts.filter(matchSearch)

  const renderCard=c=>{
    const ctype=c.contactType||'Client'
    const isInternal=ctype==='Internal',isVendor=ctype==='Vendor'
    const inf=IC[c.influence]||IC.Stakeholder
    const isOpen=exp===c.id
    const ds=daysSince(c.lastInteracted)
    const healthDot=ds===null?S.muted:ds<30?S.green:ds<60?S.orange:S.red
    const healthLabel=ds===null?'Never':ds+'d ago'
    const fn=c.name.split(' ')[0].toLowerCase(),ln=c.name.split(' ').slice(-1)[0].toLowerCase()
    const matchEntry=e=>{const h=`${e.participants||''} ${e.topics||''} ${e.summary||''}`.toLowerCase();return h.includes(fn)||(ln!==fn&&h.includes(ln))}
    const relHistory=[...(acct.interactions||[]).filter(matchEntry).map(e=>({...e,_s:'i'})),...(acct.intelLog||[]).filter(matchEntry).map(e=>({...e,_s:'l'}))].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
    const avatarBg=isInternal?'rgba(59,130,246,0.15)':isVendor?'rgba(168,85,247,0.15)':inf.b
    const avatarColor=isInternal?S.blue:isVendor?S.purple:inf.c
    return (
      <Card key={c.id}>
        <div onClick={()=>setExp(isOpen?null:c.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',cursor:'pointer'}}>
          <div style={{width:36,height:36,borderRadius:'50%',background:avatarBg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:avatarColor,flexShrink:0,position:'relative'}}>
            {c.contactPhoto?<img src={c.contactPhoto} style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:initials(c.name)}
            {isInternal&&<span style={{position:'absolute',bottom:-2,right:-2,width:12,height:12,borderRadius:'50%',background:S.blue,display:'flex',alignItems:'center',justifyContent:'center',fontSize:7,color:'#fff',border:`1px solid ${S.surf}`}}>G</span>}
          </div>
          {c.linkedin && c.linkedin.trim() !== '' && (
            <a
              href={c.linkedin.startsWith('http') ? c.linkedin : 'https://' + c.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:24,height:24,borderRadius:6,background:'#0A66C2',color:'white',fontSize:12,fontWeight:700,textDecoration:'none',flexShrink:0,marginRight:6}}
              title="Open LinkedIn profile"
            >in</a>
          )}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              <span style={{fontSize:13,fontWeight:600,color:S.txt}}>{c.name}</span>
              {!isInternal&&<span style={{width:7,height:7,borderRadius:'50%',background:sentC[c.sentiment]||S.muted,flexShrink:0}} title={c.sentiment}/>}
              {isInternal&&<Badge label='GP Internal' color={S.blue} bg='rgba(59,130,246,0.12)' size={10}/>}
              {isVendor&&c.vendorCompany&&<Badge label={c.vendorCompany} color={S.purple} bg='rgba(168,85,247,0.12)' size={10}/>}
            </div>
            <div style={{fontSize:11,color:S.muted}}>{c.title}{c.dept?` · ${c.dept}`:''}</div>
          </div>
          <div style={{display:'flex',gap:5,flexShrink:0,flexWrap:'wrap',justifyContent:'flex-end',alignItems:'center'}}>
            {!isInternal&&<Badge label={c.influence} color={inf.c} bg={inf.b}/>}
            {!isInternal&&c.relStatus&&<Badge label={c.relStatus} color={relC[c.relStatus]||S.muted} bg={(relC[c.relStatus]||S.muted)+'22'}/>}
            {!isInternal&&<span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:999,padding:'2px 8px',whiteSpace:'nowrap'}}><span style={{width:6,height:6,borderRadius:'50%',background:healthDot,flexShrink:0,display:'inline-block'}}/>{healthLabel}</span>}
            <button onClick={e=>{e.stopPropagation();if(noteTarget===c.id){setNoteTarget(null);setNoteText('')}else{setNoteTarget(c.id);setNoteText('')}}} style={{background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,cursor:'pointer',fontSize:11,padding:'3px 8px',whiteSpace:'nowrap',lineHeight:'18px'}}>Note</button>
          </div>
        </div>
        {noteTarget===c.id&&<div style={{padding:'8px 14px 10px',borderTop:`1px solid ${S.bdr}`,background:S.surf2}} onClick={e=>e.stopPropagation()}>
          <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} rows={2} placeholder='Quick note...' style={{marginBottom:6,fontSize:12}}/>
          <div style={{display:'flex',gap:6}}><Btn variant='primary' onClick={()=>saveNote(c)} style={{fontSize:11,padding:'4px 10px'}}>Save</Btn><Btn onClick={()=>{setNoteTarget(null);setNoteText('')}} style={{fontSize:11,padding:'4px 8px'}}>Cancel</Btn></div>
        </div>}
        {isOpen&&<div style={{padding:'12px 14px 16px',borderTop:`1px solid ${S.bdr}`}}>
          {/* Photo upload section */}
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}} onClick={e=>e.stopPropagation()}>
            <div style={{position:'relative'}}
              onMouseEnter={()=>setHoveredPhoto(c.id)}
              onMouseLeave={()=>setHoveredPhoto(null)}>
              <div
                onClick={e=>{e.stopPropagation();setPhotoPopover(photoPopover===c.id?null:c.id)}}
                style={{width:52,height:52,borderRadius:'50%',background:avatarBg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,fontWeight:700,color:avatarColor,cursor:'pointer',position:'relative',overflow:'hidden'}}>
                {c.contactPhoto?<img src={c.contactPhoto} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<span>{initials(c.name)}</span>}
                {hoveredPhoto===c.id&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.42)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,pointerEvents:'none'}}>📷</div>}
              </div>
              {photoPopover===c.id&&(
                <div onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
                  style={{position:'absolute',left:58,top:0,zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.18)',minWidth:148,overflow:'hidden',whiteSpace:'nowrap'}}>
                  <button
                    onClick={()=>{setPhotoTarget(c.id);photoInputRef.current?.click();setPhotoPopover(null)}}
                    style={{display:'block',width:'100%',padding:'9px 14px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,color:S.txt,fontSize:12,cursor:'pointer',textAlign:'left'}}>
                    📷 Upload Photo
                  </button>
                  {c.contactPhoto&&<button
                    onClick={()=>removePhoto(c.id)}
                    style={{display:'block',width:'100%',padding:'9px 14px',background:'transparent',border:'none',color:S.red,fontSize:12,cursor:'pointer',textAlign:'left'}}>
                    Remove Photo
                  </button>}
                </div>
              )}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:S.txt,marginBottom:1}}>{c.name}</div>
              <div style={{fontSize:12,color:S.muted}}>{c.title}{c.dept?` · ${c.dept}`:''}</div>
            </div>
          </div>
          {/* Notes — prominent, always visible, editable */}
          <div style={{marginBottom:12}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
              <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>Notes</div>
              {editingNotes!==c.id&&<button onClick={e=>{e.stopPropagation();setEditingNotes(c.id);setNotesText(c.notes||'')}} style={{background:'transparent',border:'none',cursor:'pointer',color:S.dim,padding:'2px 4px',fontSize:13,lineHeight:1}} title='Edit notes'>✏️</button>}
            </div>
            {editingNotes===c.id?(
              <div>
                <textarea value={notesText} onChange={e=>setNotesText(e.target.value)} rows={3} autoFocus
                  style={{width:'100%',fontSize:12,padding:'6px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,resize:'vertical',fontFamily:'inherit',lineHeight:1.5,boxSizing:'border-box'}}/>
                <div style={{display:'flex',gap:5,marginTop:5}}>
                  <Btn variant='primary' onClick={()=>{setAcct(p=>({...p,contacts:p.contacts.map(ct=>ct.id===c.id?{...ct,notes:notesText}:ct)}));setEditingNotes(null)}} style={{fontSize:11,padding:'3px 10px'}}>Save</Btn>
                  <Btn onClick={()=>setEditingNotes(null)} style={{fontSize:11,padding:'3px 8px'}}>Cancel</Btn>
                </div>
              </div>
            ):(
              <div style={{fontSize:12,color:c.notes?S.secondary:S.dim,lineHeight:1.6,whiteSpace:'pre-wrap',fontStyle:c.notes?'normal':'italic'}}>
                {c.notes||'No notes yet'}
              </div>
            )}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 16px',marginBottom:10,fontSize:12}}>
            {[['Email',c.email],['Cell',c.cell],['Location',c.location]].map(([l,v])=><div key={l}><span style={{color:S.muted}}>{l}: </span><span style={{color:S.txt}}>{v||'—'}</span></div>)}
            <div><span style={{color:S.muted}}>LinkedIn: </span>{c.linkedin?<a href={c.linkedin} target='_blank' rel='noopener noreferrer' onClick={e=>e.stopPropagation()} style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:3}}><span style={{fontSize:10,fontWeight:700,color:'#fff',background:'#0a66c2',padding:'1px 6px',borderRadius:3,lineHeight:'16px'}}>in</span></a>:<span style={{color:S.txt}}>—</span>}</div>
          </div>
          {isVendor&&c.vendorCompany&&<div style={{fontSize:12,color:S.secondary,marginBottom:8}}><span style={{color:S.muted}}>Company: </span>{c.vendorCompany}</div>}
          {c.lastInteracted&&<div style={{fontSize:11,color:S.muted,marginBottom:8}}>Last interacted: {fmtDate(c.lastInteracted)}</div>}
          {[['Tools / Tech Owned',c.toolsOwn],['Key Goals',c.goals],['Key Pains',c.pains],['Personal Notes',c.personalNotes]].map(([l,v])=>v?<div key={l} style={{marginBottom:8}}><div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>{l}</div><div style={{fontSize:12,color:S.secondary,lineHeight:1.6}}>{v}</div></div>:null)}
          {isInternal&&(
            <div style={{marginTop:12,borderTop:`1px solid ${S.bdr}`,paddingTop:10}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <SH>Meeting History with Clients</SH>
                <button onClick={e=>{e.stopPropagation();if(meetingFormFor===c.id){setMeetingFormFor(null)}else{setMeetingFormFor(c.id);setMeetingForm({date:new Date().toISOString().split('T')[0],clientContactIds:[],topics:'',notes:''})}}} style={{fontSize:11,color:S.blue,background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.25)',borderRadius:5,padding:'3px 10px',cursor:'pointer',fontWeight:600}}>+ Log Meeting</button>
              </div>
              {meetingFormFor===c.id&&(
                <div style={{background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:8,padding:'12px 14px',marginBottom:10}} onClick={e=>e.stopPropagation()}>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Date</div>
                    <input type='date' value={meetingForm.date} onChange={e=>setMeetingForm(p=>({...p,date:e.target.value}))} style={{fontSize:12,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,width:'100%',boxSizing:'border-box'}}/>
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Client Contacts Present</div>
                    {clientsList.length===0&&<div style={{fontSize:12,color:S.dim}}>No client contacts added yet.</div>}
                    <div style={{display:'flex',flexDirection:'column',gap:4}}>
                      {clientsList.map(cc=>(
                        <label key={cc.id} style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:S.txt,cursor:'pointer'}}>
                          <input type='checkbox' checked={(meetingForm.clientContactIds||[]).includes(cc.id)} onChange={ev=>{const ids=meetingForm.clientContactIds||[];setMeetingForm(p=>({...p,clientContactIds:ev.target.checked?[...ids,cc.id]:ids.filter(id=>id!==cc.id)}))}} style={{cursor:'pointer'}}/>
                          {cc.name}<span style={{color:S.muted,fontSize:10,marginLeft:4}}>— {cc.title}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Topics</div>
                    <input value={meetingForm.topics} onChange={e=>setMeetingForm(p=>({...p,topics:e.target.value}))} placeholder='Topics discussed...' style={{width:'100%',fontSize:12,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,boxSizing:'border-box'}}/>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Notes</div>
                    <textarea value={meetingForm.notes} onChange={e=>setMeetingForm(p=>({...p,notes:e.target.value}))} rows={2} placeholder='Meeting notes...' style={{width:'100%',fontSize:12,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit'}}/>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>logMeeting(c.id)} style={{padding:'5px 12px',background:S.blue,border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save Meeting</button>
                    <button onClick={()=>{setMeetingFormFor(null);setMeetingForm({date:'',clientContactIds:[],topics:'',notes:''})}} style={{padding:'5px 10px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,fontSize:12,cursor:'pointer'}}>Cancel</button>
                  </div>
                </div>
              )}
              {(c.internalMeetings||[]).length===0&&meetingFormFor!==c.id&&<div style={{fontSize:12,color:S.dim}}>No meetings logged yet.</div>}
              <div style={{display:'flex',flexDirection:'column',gap:5}}>
                {(c.internalMeetings||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(m=>(
                  <div key={m.id} style={{padding:'8px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                      <span style={{fontSize:11,color:S.muted,fontWeight:600,flexShrink:0}}>{fmtDate(m.date)}</span>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{(m.clientContactIds||[]).map(id=>{const cc=allContacts.find(ct=>ct.id===id);return cc?<Badge key={id} label={cc.name.split(' ')[0]} color={S.blue} bg='rgba(59,130,246,0.12)' size={10}/>:null})}</div>
                    </div>
                    {m.topics&&<div style={{fontSize:12,color:S.txt,fontWeight:500,marginBottom:2}}>{m.topics}</div>}
                    {m.notes&&<div style={{fontSize:11,color:S.secondary,lineHeight:1.5}}>{m.notes}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!isInternal&&(
            <div style={{marginTop:12,borderTop:`1px solid ${S.bdr}`,paddingTop:10}}>
              <SH>Interaction History</SH>
              {relHistory.length===0?<div style={{fontSize:12,color:S.dim}}>No interactions logged yet.</div>:<div style={{display:'flex',flexDirection:'column',gap:5}}>{relHistory.map((e,i)=>(
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:7}}>
                  <span style={{fontSize:10,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:4,padding:'1px 6px',whiteSpace:'nowrap',flexShrink:0}}>{fmtDate(e.date)}</span>
                  <Badge label={e.type||'Note'} color={INTERACTION_COLORS[e.type]||S.muted} bg={(INTERACTION_COLORS[e.type]||S.muted)+'1a'} size={10}/>
                  <span style={{fontSize:12,color:S.secondary,lineHeight:1.5}}>{(e.summary||'').split('\n')[0].slice(0,120)}{(e.summary||'').length>120?'…':''}</span>
                </div>
              ))}</div>}
            </div>
          )}
          <div style={{display:'flex',gap:8,marginTop:10}}><Btn onClick={()=>{setForm({...blank,...c});setShowAdd(true)}}>Edit</Btn><Btn variant='danger' onClick={()=>del(c.id)}>Delete</Btn></div>
        </div>}
      </Card>
    )
  }

  const Section=({type,label,color,contacts})=>{
    const isExp=sectionExp[type]
    const ctype=type==='client'?'Client':type==='vendor'?'Vendor':'Internal'
    return (
      <div style={{marginBottom:14}}>
        <div onClick={()=>setSectionExp(p=>({...p,[type]:!p[type]}))} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',cursor:'pointer',userSelect:'none',borderBottom:`1px solid ${S.bdr}`,marginBottom:8}}
          onMouseEnter={e=>e.currentTarget.style.opacity='0.7'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
          <span style={{fontSize:11,color:S.muted}}>{isExp?'▼':'▶'}</span>
          <span style={{fontSize:13,fontWeight:700,color:S.txt}}>{label}</span>
          <span style={{fontSize:11,fontWeight:700,color,background:color+'1a',borderRadius:999,padding:'1px 8px',marginLeft:2}}>{contacts.length}</span>
        </div>
        {isExp&&contacts.length===0&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8}}>
            <span style={{fontSize:12,color:S.dim}}>None added yet</span>
            <button onClick={()=>{setForm({...blank,contactType:ctype});setShowAdd(true)}} style={{fontSize:11,color:S.blue,background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.25)',borderRadius:5,padding:'3px 10px',cursor:'pointer',fontWeight:600}}>+ Add {ctype} Contact</button>
          </div>
        )}
        {isExp&&contacts.length>0&&<div style={{display:'flex',flexDirection:'column',gap:5}}>{contacts.map(c=>renderCard(c))}</div>}
      </div>
    )
  }

  const ftype=form.contactType||'Client'

  // ── Org chart helpers ──
  const orgNodes = acct.orgChart?.nodes||[]
  const saveOrgNodes = nodes => setAcct(p=>({...p,orgChart:{...(p.orgChart||{}),nodes}}))
  const chartedIds = new Set(orgNodes.map(n=>n.contactId))
  const unassigned = clientContacts.filter(c=>!chartedIds.has(c.id))
  const NODE_W=120, NODE_H=80
  const CANVAS_W=4000, CANVAS_H=3000

  const autoLayout = () => {
    if(orgNodes.length===0)return
    const roots=orgNodes.filter(n=>!n.parentId||!orgNodes.find(p=>p.contactId===n.parentId))
    const root=roots[0]||orgNodes[0]
    const levels={},queue=[{id:root.contactId,level:0}],visited=new Set()
    while(queue.length){const{id,level}=queue.shift();if(visited.has(id))continue;visited.add(id);levels[id]=level;orgNodes.filter(n=>n.parentId===id).forEach(n=>{if(!visited.has(n.contactId))queue.push({id:n.contactId,level:level+1})})}
    orgNodes.forEach(n=>{if(levels[n.contactId]===undefined)levels[n.contactId]=0})
    const byLevel={}
    Object.entries(levels).forEach(([id,l])=>{if(!byLevel[l])byLevel[l]=[];byLevel[l].push(id)})
    const maxLevel=Math.max(...Object.values(levels),0)
    const rowH=maxLevel>0?Math.min(200,(CANVAS_H-200)/maxLevel):200
    const newNodes=orgNodes.map(n=>{
      const level=levels[n.contactId]??0
      const siblings=byLevel[level]||[n.contactId]
      const idx=siblings.indexOf(n.contactId)
      const x=((idx+1)/(siblings.length+1))*100-(NODE_W/CANVAS_W*50)
      const y=(level*rowH+100)/CANVAS_H*100
      return{...n,x,y}
    })
    saveOrgNodes(newNodes)
  }

  // Tray-chip HTML5 drop only (chart nodes use mouse events instead)
  const handleCanvasDrop = e => {
    e.preventDefault()
    if(!dragState||dragState.type!=='tray-chip'||!canvasRef.current)return
    const rect=canvasRef.current.getBoundingClientRect()
    const dropX=e.clientX-rect.left, dropY=e.clientY-rect.top
    const contentX=(dropX-dragState.offX-pan.x)/zoom
    const contentY=(dropY-dragState.offY-pan.y)/zoom
    const pctX=(contentX<80?400:contentX)/CANVAS_W*100
    const pctY=(contentY<60?300:contentY)/CANVAS_H*100
    saveOrgNodes([...orgNodes,{contactId:dragState.contactId,x:pctX,y:pctY,parentId:null,gradientId:'blue'}])
    setDragState(null);setDragOverNode(null)
  }

  // Mouse-based drag for chart nodes — no boundaries, tracks outside canvas
  const handleNodeMouseDown = (e,n) => {
    if(e.button!==0)return
    e.stopPropagation()
    e.preventDefault()
    if(!canvasRef.current)return
    const rect=canvasRef.current.getBoundingClientRect()
    const {pan:p,zoom:z}=orgStateRef.current
    const startX=n.x/100*CANVAS_W, startY=n.y/100*CANVAS_H
    const offX=(e.clientX-rect.left-p.x)/z-startX
    const offY=(e.clientY-rect.top-p.y)/z-startY
    nodeDragRef.current={contactId:n.contactId,offX,offY,startX,startY,moved:false}
    setLiveDragPos({contactId:n.contactId,x:startX,y:startY})

    const onMove=e2=>{
      const dr=nodeDragRef.current; if(!dr)return
      const r=canvasRef.current?.getBoundingClientRect(); if(!r)return
      const {pan:p2,zoom:z2}=orgStateRef.current
      const nx=(e2.clientX-r.left-p2.x)/z2-dr.offX
      const ny=(e2.clientY-r.top-p2.y)/z2-dr.offY
      if(!dr.moved&&(Math.abs(nx-dr.startX)>3||Math.abs(ny-dr.startY)>3))dr.moved=true
      if(!dr.moved)return
      setLiveDragPos({contactId:dr.contactId,x:nx,y:ny})
      // Highlight nearest node for reparenting
      const over=orgNodes.find(o=>{
        if(o.contactId===dr.contactId)return false
        const ox=o.x/100*CANVAS_W,oy=o.y/100*CANVAS_H
        return Math.abs(nx+NODE_W/2-(ox+NODE_W/2))<NODE_W&&Math.abs(ny+NODE_H/2-(oy+NODE_H/2))<NODE_H
      })
      setDragOverNode(over?.contactId||null)
    }

    const onUp=e2=>{
      const dr=nodeDragRef.current
      nodeDragRef.current=null
      document.removeEventListener('mousemove',onMove)
      document.removeEventListener('mouseup',onUp)
      if(!dr){setLiveDragPos(null);setDragOverNode(null);return}
      if(!dr.moved){
        setLiveDragPos(null);setDragOverNode(null)
        const {openDetailNode:od}=orgStateRef.current
        setOpenDetailNode(od===dr.contactId?null:dr.contactId)
        setExportDropdown(false)
        return
      }
      const r=canvasRef.current?.getBoundingClientRect()
      const {pan:p2,zoom:z2}=orgStateRef.current
      const nx=r?(e2.clientX-r.left-p2.x)/z2-dr.offX:dr.startX
      const ny=r?(e2.clientY-r.top-p2.y)/z2-dr.offY:dr.startY
      const pctX=nx/CANVAS_W*100, pctY=ny/CANVAS_H*100
      const over=orgNodes.find(o=>{
        if(o.contactId===dr.contactId)return false
        const ox=o.x/100*CANVAS_W,oy=o.y/100*CANVAS_H
        return Math.abs(nx+NODE_W/2-(ox+NODE_W/2))<NODE_W&&Math.abs(ny+NODE_H/2-(oy+NODE_H/2))<NODE_H
      })
      if(over){
        saveOrgNodes(orgNodes.map(o=>o.contactId===dr.contactId?{...o,parentId:over.contactId}:o))
      } else {
        saveOrgNodes(orgNodes.map(o=>o.contactId===dr.contactId?{...o,x:pctX,y:pctY}:o))
      }
      justDraggedRef.current=true
      requestAnimationFrame(()=>{justDraggedRef.current=false})
      setLiveDragPos(null);setDragOverNode(null)
    }

    document.addEventListener('mousemove',onMove)
    document.addEventListener('mouseup',onUp)
  }

  const getNodePx = n => {
    if(liveDragPos?.contactId===n.contactId)return{x:liveDragPos.x,y:liveDragPos.y}
    return{x:n.x/100*CANVAS_W,y:n.y/100*CANVAS_H}
  }
  const svgLine = (n) => {
    const parent=orgNodes.find(p=>p.contactId===n.parentId)
    if(!parent)return null
    const np=getNodePx(n),pp=getNodePx(parent)
    const cx=np.x+(NODE_W/2), cy=np.y
    const px=pp.x+(NODE_W/2), py=pp.y+NODE_H
    const midY=(cy+py)/2
    return <path key={`${n.contactId}-l`} d={`M ${cx} ${cy} C ${cx} ${midY} ${px} ${midY} ${px} ${py}`} fill="none" stroke="#bbc2ff" strokeWidth="2"/>
  }

  const ORG_GRADIENTS = [
    {id:'blue',  label:'Blue / Purple', gradient:'linear-gradient(135deg,#a9a8ff 0%,#3c90ff 100%)', shadow:'rgba(60,144,255,0.35)'},
    {id:'pink',  label:'Pink / Red',    gradient:'linear-gradient(135deg,#ff63a0 0%,#fc413d 100%)', shadow:'rgba(252,65,61,0.35)'},
    {id:'orange',label:'Orange / Yellow',gradient:'linear-gradient(135deg,#fc5c30 0%,#ffdb0f 100%)',shadow:'rgba(252,92,48,0.35)'},
    {id:'green', label:'Green',          gradient:'linear-gradient(135deg,#60d673 0%,#0ebc5f 100%)', shadow:'rgba(14,188,95,0.35)'},
  ]
  const getGrad = n => ORG_GRADIENTS.find(g=>g.id===(n.gradientId||'blue'))||ORG_GRADIENTS[0]

  const fitToScreen = () => {
    if(orgNodes.length===0){setZoom(1);setPan({x:0,y:0});return}
    const nW=NODE_W,nH=NODE_H,pad=40
    const xs=orgNodes.map(n=>n.x/100*CANVAS_W),ys=orgNodes.map(n=>n.y/100*CANVAS_H)
    const minX=Math.min(...xs),maxX=Math.max(...xs)+nW,minY=Math.min(...ys),maxY=Math.max(...ys)+nH
    const cw=maxX-minX,ch=maxY-minY
    if(cw===0||ch===0)return
    const nz=Math.min((canvasSize.w-pad*2)/cw,(canvasSize.h-pad*2)/ch,2)
    setZoom(nz)
    setPan({x:(canvasSize.w-cw*nz)/2-minX*nz, y:(canvasSize.h-ch*nz)/2-minY*nz})
  }

  const centerOnRoot = () => {
    if(!canvasRef.current)return
    const rootNode=orgNodes.find(n=>!n.parentId)
    if(!rootNode)return
    const canvasWidth=canvasRef.current.offsetWidth
    const defaultZoom=0.8
    const targetX=rootNode.x!=null?rootNode.x/100*CANVAS_W:2000
    const targetY=rootNode.y!=null?rootNode.y/100*CANVAS_H:100
    setZoom(defaultZoom)
    setPan({x:canvasWidth/2-(targetX+NODE_W/2)*defaultZoom, y:60-targetY*defaultZoom})
  }

  useEffect(()=>{
    if(contactView!=='orgchart')return
    const t=setTimeout(centerOnRoot,50)
    return()=>clearTimeout(t)
  },[contactView])

  const doExport = async type => {
    setExportDropdown(false)
    setExportToast('Generating export…')
    const prevZoom=zoom,prevPan={...pan}
    try {
      setZoom(1);setPan({x:0,y:0})
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
      const h2c=(await import('html2canvas')).default
      const canvas=await h2c(chartContentRef.current,{backgroundColor:'#f8fafc',scale:2,useCORS:true,logging:false})
      if(type==='jpeg'){
        canvas.toBlob(blob=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${acct.name}-org-chart.jpg`;a.click();URL.revokeObjectURL(url)},'image/jpeg',0.95)
      } else {
        const jsPDF=(await import('jspdf')).default
        const imgData=canvas.toDataURL('image/jpeg',0.95)
        const pdf=new jsPDF({orientation:'landscape',unit:'px',format:[canvas.width,canvas.height]})
        pdf.addImage(imgData,'JPEG',0,0,canvas.width,canvas.height)
        pdf.save(`${acct.name}-org-chart.pdf`)
      }
      setZoom(prevZoom);setPan(prevPan)
      setExportToast(null)
    } catch(err){
      console.error(err)
      setZoom(prevZoom);setPan(prevPan)
      setExportToast('Export failed — try again')
      setTimeout(()=>setExportToast(null),3000)
    }
  }

  // Touch handlers using ref bundle to avoid stale closures
  const handleTouchStart = e => {
    if(e.touches.length===1){const t=e.touches[0];setPanStart({x:t.clientX-orgStateRef.current.pan.x,y:t.clientY-orgStateRef.current.pan.y})}
    else if(e.touches.length===2){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;setPinchStartDist(Math.hypot(dx,dy));setPinchStartZoom(orgStateRef.current.zoom);setPanStart(null)}
  }
  const handleTouchMove = e => {
    const {panStart:ps,pinchStartDist:psd,pinchStartZoom:psz}=orgStateRef.current
    if(e.touches.length===1&&ps){const t=e.touches[0];setPan({x:t.clientX-ps.x,y:t.clientY-ps.y})}
    else if(e.touches.length===2&&psd){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;setZoom(Math.max(0.25,Math.min(3,psz*(Math.hypot(dx,dy)/psd))))}
  }
  const handleTouchEnd = () => {setPanStart(null);setPinchStartDist(null)}

  return (
    <div>
      {/* Notifications */}
      {(acct.unknownMentions||[]).length>0&&<div style={{marginBottom:12,padding:'12px 14px',background:'rgba(234,179,8,0.08)',border:'1px solid rgba(234,179,8,0.3)',borderRadius:8}}>
        <div style={{fontSize:13,fontWeight:700,color:S.yellow,marginBottom:2}}>People to Meet</div>
        <div style={{fontSize:11,color:S.muted,marginBottom:8}}>Mentioned in transcripts but not in your contacts yet</div>
        <div style={{display:'flex',flexDirection:'column',gap:5}}>
          {(acct.unknownMentions||[]).map(m=>(
            <div key={m.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
              <span style={{fontSize:12,color:S.txt,fontWeight:600}}>{m.name}</span>
              <div style={{display:'flex',gap:5}}>
                <Btn variant='primary' onClick={()=>{setForm({...blank,name:m.name});setShowAdd(true)}} style={{fontSize:11,padding:'4px 10px'}}>Add Contact</Btn>
                <Btn onClick={()=>dismissMention(m.id)} style={{fontSize:11,padding:'4px 8px'}}>✕</Btn>
              </div>
            </div>
          ))}
        </div>
      </div>}
      {(acct.contactSuggestions||[]).length>0&&(
        <div style={{marginBottom:12,background:S.isLight?'rgba(59,130,246,0.04)':'rgba(59,130,246,0.08)',border:`1px solid ${S.isLight?'rgba(59,130,246,0.2)':'rgba(59,130,246,0.3)'}`,borderRadius:8,overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',borderBottom:`1px solid ${S.bdr}`,background:S.isLight?'rgba(59,130,246,0.06)':'rgba(59,130,246,0.1)'}}>
            <span style={{fontSize:12,fontWeight:700,color:S.blue}}>AI Contact Suggestions <span style={{fontWeight:400,opacity:0.7}}>({(acct.contactSuggestions||[]).length})</span></span>
            <div style={{display:'flex',gap:6}}>
              <button onClick={acceptAllSuggestions} style={{fontSize:11,color:'#fff',background:S.blue,border:'none',borderRadius:5,padding:'3px 10px',cursor:'pointer',fontWeight:600}}>Accept All</button>
              <button onClick={()=>setAcct(p=>({...p,contactSuggestions:[]}))} style={{fontSize:11,color:S.muted,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'3px 10px',cursor:'pointer'}}>Dismiss All</button>
            </div>
          </div>
          {(acct.contactSuggestions||[]).map(s=>(
            <div key={s.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderBottom:`1px solid ${S.bdr}`,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                  <span style={{fontSize:12,fontWeight:700,color:S.txt}}>{s.contactName}</span>
                  {s.suggestedRole&&<span style={{fontSize:12,color:S.muted}}>→ Title: <strong style={{color:S.txt}}>{s.suggestedRole}</strong></span>}
                  {s.suggestedInfluence&&<span style={{fontSize:12,color:S.muted}}>· Influence: <strong style={{color:S.txt}}>{s.suggestedInfluence}</strong></span>}
                </div>
                {s.context&&<div style={{fontSize:11,color:S.muted,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.context.slice(0,60)}{s.context.length>60?'…':''}</div>}
              </div>
              <div style={{display:'flex',gap:5,flexShrink:0}}>
                <Btn variant='primary' onClick={()=>applySuggestion(s)} style={{fontSize:11,padding:'4px 10px'}}>Accept</Btn>
                <Btn onClick={()=>dismissSuggestion(s.id)} style={{fontSize:11,padding:'4px 8px'}}>Dismiss</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top bar: view toggle + add button */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:8,padding:2,border:`1px solid ${S.bdr}`}}>
          {[{v:'list',l:'List'},{v:'cards',l:'Cards'},{v:'orgchart',l:'Org Chart'}].map(({v,l})=>(
            <button key={v} onClick={()=>setContactView(v)} style={{padding:'5px 14px',borderRadius:6,border:'none',background:contactView===v?S.blue:'transparent',color:contactView===v?'#fff':S.muted,fontSize:12,fontWeight:600,cursor:'pointer',transition:'all 0.15s'}}>{l}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn onClick={()=>{setShowImport(true);setImportRows([]);setImportSelections(new Set());setImportSuccess(null)}}>⬆ Import</Btn>
          <Btn variant='primary' onClick={()=>{setForm(blank);setShowAdd(true)}}>+ Add Contact</Btn>
        </div>
      </div>

      {/* ── LIST VIEW ── */}
      {contactView==='list'&&<>
        <div style={{fontSize:13,color:S.muted,marginBottom:8}}>{allContacts.length} contacts</div>
        <input value={contactSearch} onChange={e=>setContactSearch(e.target.value)} placeholder='Search by name, title, or department...' style={{width:'100%',fontSize:12,padding:'7px 11px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,marginBottom:10,boxSizing:'border-box'}}/>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:7,padding:2}}>
            {['All','Active','Prospect','Executive Sponsor','Needs Attention'].map(pill=>(
              <button key={pill} onClick={()=>setClientFilter(pill)} style={{padding:'4px 10px',borderRadius:5,border:'none',background:clientFilter===pill?S.blue:'transparent',color:clientFilter===pill?'#fff':S.muted,fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>{pill}</button>
            ))}
          </div>
          <select value={clientSort} onChange={e=>setClientSort(e.target.value)} style={{fontSize:11,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,marginLeft:'auto'}}>
            {['Name','Last Interacted','Relationship Status','Influence Level','Days Since Contact'].map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <Section type='client' label='Client Contacts' color={S.blue} contacts={filteredClients}/>
        <Section type='vendor' label='Vendor Contacts' color={S.purple} contacts={filteredVendors}/>
        <Section type='internal' label='Internal Contacts' color={S.green} contacts={filteredInternal}/>
      </>}

      {/* ── CARDS VIEW ── */}
      {contactView==='cards'&&(
        clientContacts.length===0
          ?<div style={{textAlign:'center',padding:'40px 20px',color:S.muted,fontSize:13}}>No client contacts yet. Click + Add Contact to get started.</div>
          :<div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
            {clientContacts.map(c=>{
              const inf=IC[c.influence]||{c:S.muted,b:S.surf2}
              const relColor=(relC[c.relStatus]||S.muted)
              return (
                <div key={c.id}
                  onClick={()=>{setContactView('list');setExp(c.id)}}
                  style={{background:S.surf,borderRadius:12,border:`1px solid ${S.bdr}`,padding:'16px',cursor:'pointer',boxShadow:S.isLight?'0 1px 3px rgba(0,0,0,0.06)':'none',transition:'all 0.15s',position:'relative'}}
                  onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)';e.currentTarget.style.transform='translateY(-1px)'}}
                  onMouseLeave={e=>{e.currentTarget.style.boxShadow=S.isLight?'0 1px 3px rgba(0,0,0,0.06)':'none';e.currentTarget.style.transform='translateY(0)'}}>
                  <div style={{position:'relative',display:'inline-block',marginBottom:10}}
                    onMouseEnter={()=>setHoveredPhoto(c.id)}
                    onMouseLeave={()=>setHoveredPhoto(null)}>
                    <div
                      onClick={e=>{e.stopPropagation();setPhotoPopover(photoPopover===c.id?null:c.id)}}
                      style={{width:48,height:48,borderRadius:'50%',background:inf.b,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:inf.c,cursor:'pointer',position:'relative',overflow:'hidden'}}>
                      {c.contactPhoto?<img src={c.contactPhoto} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:initials(c.name)}
                      {hoveredPhoto===c.id&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.42)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,pointerEvents:'none'}}>📷</div>}
                    </div>
                    {photoPopover===c.id&&(
                      <div onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
                        style={{position:'absolute',left:54,top:0,zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.18)',minWidth:148,overflow:'hidden',whiteSpace:'nowrap'}}>
                        <button
                          onClick={()=>{setPhotoTarget(c.id);photoInputRef.current?.click();setPhotoPopover(null)}}
                          style={{display:'block',width:'100%',padding:'9px 14px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,color:S.txt,fontSize:12,cursor:'pointer',textAlign:'left'}}>
                          📷 Upload Photo
                        </button>
                        {c.contactPhoto&&<button
                          onClick={()=>removePhoto(c.id)}
                          style={{display:'block',width:'100%',padding:'9px 14px',background:'transparent',border:'none',color:S.red,fontSize:12,cursor:'pointer',textAlign:'left'}}>
                          Remove Photo
                        </button>}
                      </div>
                    )}
                  </div>
                  <div style={{fontSize:13,fontWeight:700,color:S.txt,marginBottom:2}}>{c.name}</div>
                  <div style={{fontSize:11,color:S.muted,marginBottom:8}}>{c.title}</div>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
                    {c.influence&&<Badge label={c.influence} color={inf.c} bg={inf.b} size={9}/>}
                    {c.relStatus&&<span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:10,color:relColor}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:relColor,flexShrink:0,display:'inline-block'}}/>
                      {c.relStatus}
                    </span>}
                  </div>
                  {c.notes&&<div style={{fontSize:11,color:S.muted,marginTop:7,lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{c.notes.slice(0,80)}{c.notes.length>80?'…':''}</div>}
                </div>
              )
            })}
          </div>
      )}

      {/* ── ORG CHART VIEW ── */}
      {contactView==='orgchart'&&(
        <div>
          {/* Export toast */}
          {exportToast&&<div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'rgba(15,23,42,0.9)',color:'#fff',padding:'9px 20px',borderRadius:8,fontSize:13,fontWeight:600,zIndex:9999,pointerEvents:'none'}}>{exportToast}</div>}

          {/* Controls bar */}
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:10}}>
            <button onClick={autoLayout} style={{padding:'6px 14px',background:S.isLight?'#eff6ff':'rgba(59,130,246,0.15)',border:`1px solid ${S.isLight?'#bfdbfe':'rgba(59,130,246,0.3)'}`,borderRadius:7,color:S.blue,fontSize:12,fontWeight:600,cursor:'pointer'}}>⚡ Auto Layout</button>
            <button onClick={()=>{if(window.confirm('Move all nodes back to unassigned?'))saveOrgNodes([])}} style={{padding:'6px 14px',background:S.isLight?'#fef2f2':'rgba(239,68,68,0.08)',border:`1px solid ${S.isLight?'#fecaca':'rgba(239,68,68,0.2)'}`,borderRadius:7,color:S.red,fontSize:12,fontWeight:600,cursor:'pointer'}}>✕ Clear</button>
            <span style={{fontSize:11,color:S.muted,marginLeft:'auto'}}>{orgNodes.length} placed · {unassigned.length} unassigned</span>
          </div>

          {/* Canvas outer — handles pan and drop */}
          <div ref={canvasRef}
            style={{position:'relative',width:'100%',height:typeof window!=='undefined'&&window.innerWidth<768?'70vh':600,borderRadius:12,border:`1px solid ${S.bdr}`,overflow:'hidden',marginBottom:12,
              backgroundImage:'radial-gradient(circle, #e2e8f0 1px, transparent 1px)',
              backgroundSize:'24px 24px',
              backgroundColor:S.isLight?'#f8fafc':S.surf2,
              cursor:isPanning?'grabbing':'grab',
              touchAction:'none',userSelect:'none'}}
            onDragOver={e=>e.preventDefault()}
            onDrop={handleCanvasDrop}
            onMouseDown={e=>{
              if(e.target===canvasRef.current||e.target===chartContentRef.current){
                e.preventDefault()
                setIsPanning(true)
                setPanStart({x:e.clientX-pan.x,y:e.clientY-pan.y})
                setOpenDetailNode(null)
                setExportDropdown(false)
              }
            }}
            onMouseMove={e=>{if(!isPanning||!panStart)return;setPan({x:e.clientX-panStart.x,y:e.clientY-panStart.y})}}
            onMouseUp={()=>{setIsPanning(false)}}
            onMouseLeave={()=>setIsPanning(false)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}>

            {/* Zoom controls — fixed to canvas, outside transform */}
            <div style={{position:'absolute',top:10,right:10,zIndex:20,display:'flex',alignItems:'center',gap:1,background:S.surf,borderRadius:10,boxShadow:'0 2px 8px rgba(0,0,0,0.12)',border:`1px solid ${S.bdr}`,overflow:'hidden'}}>
              {[
                {label:'−',onClick:()=>setZoom(z=>Math.max(0.25,z-0.1))},
                {label:`${Math.round(zoom*100)}%`,onClick:null,style:{minWidth:44,textAlign:'center',fontSize:11,fontWeight:700,color:S.txt,padding:'6px 4px',cursor:'default',background:'transparent',border:'none'}},
                {label:'+',onClick:()=>setZoom(z=>Math.min(3,z+0.1))},
              ].map((b,i)=>(
                <button key={i} onClick={b.onClick||undefined} style={{...(b.style||{}),padding:b.style?undefined:'6px 10px',background:'transparent',border:'none',borderRight:i<2?`1px solid ${S.bdr}`:'none',color:S.secondary,fontSize:13,fontWeight:600,cursor:b.onClick?'pointer':'default',minHeight:32,lineHeight:1}}>{b.label}</button>
              ))}
              <button onClick={centerOnRoot} title='Reset view to root node' style={{padding:'6px 10px',background:'transparent',border:'none',borderLeft:`1px solid ${S.bdr}`,color:S.secondary,fontSize:11,fontWeight:600,cursor:'pointer',minHeight:32,whiteSpace:'nowrap'}}>⊡ Reset View</button>
              <div style={{position:'relative',borderLeft:`1px solid ${S.bdr}`}}>
                <button onClick={()=>setExportDropdown(v=>!v)} style={{padding:'6px 10px',background:'transparent',border:'none',color:S.blue,fontSize:11,fontWeight:600,cursor:'pointer',minHeight:32,display:'flex',alignItems:'center',gap:4}}>⬇ Export</button>
                {exportDropdown&&(
                  <div style={{position:'absolute',right:0,top:'calc(100% + 4px)',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.15)',overflow:'hidden',minWidth:160,zIndex:100}}>
                    {[{label:'Download as JPEG',type:'jpeg'},{label:'Download as PDF',type:'pdf'}].map(({label,type})=>(
                      <button key={type} onClick={()=>doExport(type)} style={{display:'block',width:'100%',padding:'9px 14px',background:'transparent',border:'none',borderBottom:type==='jpeg'?`1px solid ${S.bdr}`:'none',color:S.txt,fontSize:12,cursor:'pointer',textAlign:'left'}}
                        onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>{label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Transformed content div — all chart content lives here */}
            <div ref={chartContentRef}
              style={{position:'relative',width:CANVAS_W,height:CANVAS_H,
                transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`,transformOrigin:'0 0'}}>

              {/* SVG connection lines */}
              <svg style={{position:'absolute',top:0,left:0,width:CANVAS_W,height:CANVAS_H,overflow:'visible',pointerEvents:'none'}}
                width={CANVAS_W} height={CANVAS_H}>
                {orgNodes.filter(n=>n.parentId).map(n=>svgLine(n))}
              </svg>

              {/* Chart nodes — mouse-event drag, no HTML5 drag boundaries */}
              {orgNodes.map(n=>{
                const c=clientContacts.find(x=>x.id===n.contactId)
                if(!c)return null
                const isRoot=orgNodes[0]?.contactId===n.contactId&&!n.parentId
                const isOver=dragOverNode===n.contactId
                const isLive=liveDragPos?.contactId===n.contactId
                const grad=getGrad(n)
                const nodeX=isLive?liveDragPos.x:n.x/100*CANVAS_W
                const nodeY=isLive?liveDragPos.y:n.y/100*CANVAS_H
                return (
                  <div key={n.contactId}
                    onMouseDown={e=>handleNodeMouseDown(e,n)}
                    onContextMenu={e=>{e.preventDefault();e.stopPropagation();setContextMenu({contactId:n.contactId,x:e.clientX,y:e.clientY})}}
                    style={{position:'absolute',left:`${nodeX}px`,top:`${nodeY}px`,width:NODE_W,
                      background:grad.gradient,borderRadius:14,padding:'8px 10px 10px',
                      cursor:isLive?'grabbing':'grab',border:isRoot?'2px solid #fbbf24':'none',
                      boxShadow:isOver?`0 0 0 3px #2563eb, 0 8px 24px ${grad.shadow}`:`0 4px 16px ${grad.shadow}`,
                      transition:isLive?'none':'box-shadow 0.15s, transform 0.15s',
                      transform:isOver?'scale(1.05)':'scale(1)',
                      userSelect:'none',zIndex:isLive?20:openDetailNode===n.contactId?15:isOver?10:1}}>
                    <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(255,255,255,0.9)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#3c90ff',margin:'0 auto 6px',overflow:'hidden'}}>{c.contactPhoto?<img src={c.contactPhoto} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:initials(c.name)}</div>
                    <div style={{fontSize:11,fontWeight:700,color:'#fff',textAlign:'center',lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</div>
                    <div style={{fontSize:9,color:'rgba(255,255,255,0.8)',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:2}}>{c.title}</div>
                    {isRoot&&<div style={{fontSize:8,color:'#fde68a',textAlign:'center',marginTop:3,fontWeight:600}}>★ Primary</div>}
                  </div>
                )
              })}

              {/* Empty state */}
              {orgNodes.length===0&&(
                <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,pointerEvents:'none'}}>
                  <div style={{fontSize:32,opacity:0.2}}>🗂️</div>
                  <div style={{fontSize:14,fontWeight:600,color:S.muted}}>Drag contacts from below to build the chart</div>
                  <div style={{fontSize:12,color:S.dim}}>or click Auto Layout to arrange automatically</div>
                </div>
              )}
            </div>

            {/* Node detail popover — lives outside transform, positioned in screen space */}
            {openDetailNode&&(()=>{
              const n=orgNodes.find(x=>x.contactId===openDetailNode)
              const c=clientContacts.find(x=>x.id===openDetailNode)
              if(!n||!c)return null
              const grad=getGrad(n)
              const nx=n.x/100*CANVAS_W*zoom+pan.x
              const ny=n.y/100*CANVAS_H*zoom+pan.y
              const popW=228
              const flipsLeft=nx+NODE_W*zoom+popW+16>canvasSize.w
              const popLeft=flipsLeft?nx-popW-8:nx+NODE_W*zoom+8
              const popTop=Math.max(8,Math.min(ny,canvasSize.h-320))
              const inf=IC[c.influence]||{c:S.muted,b:S.surf2}
              const relColor=(relC[c.relStatus]||S.muted)
              return (
                <div onClick={e=>e.stopPropagation()}
                  style={{position:'absolute',left:popLeft,top:popTop,width:popW,zIndex:30,
                    background:S.surf,borderRadius:12,boxShadow:'0 8px 24px rgba(0,0,0,0.15)',
                    border:`1px solid ${S.bdr}`,padding:14}}>
                  {/* Close */}
                  <button onClick={()=>setOpenDetailNode(null)} style={{position:'absolute',top:8,right:8,background:'none',border:'none',color:S.dim,cursor:'pointer',fontSize:16,lineHeight:1}}>×</button>
                  {/* Name / title */}
                  <div style={{fontSize:13,fontWeight:700,color:S.txt,marginBottom:2,paddingRight:20}}>{c.name}</div>
                  <div style={{fontSize:11,color:S.muted,marginBottom:6}}>{c.title}</div>
                  {/* LinkedIn */}
                  {c.linkedin&&<a href={c.linkedin} target='_blank' rel='noopener noreferrer' style={{fontSize:11,color:S.blue,display:'block',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>🔗 LinkedIn</a>}
                  {/* Badges */}
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:4}}>
                    {c.influence&&<Badge label={c.influence} color={inf.c} bg={inf.b} size={9}/>}
                    {c.relStatus&&<Badge label={c.relStatus} color={relColor} bg={relColor+'22'} size={9}/>}
                  </div>
                  {c.lastInteracted&&<div style={{fontSize:10,color:S.muted,marginBottom:8}}>Last: {fmtDate(c.lastInteracted)}</div>}
                  {/* Divider */}
                  <div style={{height:1,background:S.isLight?'#f1f5f9':S.bdr,marginBottom:10}}/>
                  {/* Color picker */}
                  <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>Node Color</div>
                  <div style={{display:'flex',gap:6}}>
                    {ORG_GRADIENTS.map(g=>{
                      const sel=g.id===(n.gradientId||'blue')
                      return (
                        <button key={g.id} title={g.label}
                          onClick={()=>saveOrgNodes(orgNodes.map(x=>x.contactId===n.contactId?{...x,gradientId:g.id}:x))}
                          style={{width:36,height:22,borderRadius:5,background:g.gradient,border:sel?'2px solid #ffffff':'2px solid transparent',boxShadow:sel?`0 0 0 2px #1e293b,0 0 0 4px ${g.shadow.replace('0.35','0.8')}`:undefined,cursor:'pointer',padding:0,transition:'all 0.15s'}}/>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Unassigned tray */}
          <div style={{background:S.surf,border:`1px dashed ${S.bdr}`,borderRadius:12,padding:'12px 16px'}}>
            <div style={{fontSize:11,fontWeight:700,color:S.secondary,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>
              Unassigned Contacts{unassigned.length>0&&<span style={{marginLeft:6,fontSize:10,color:S.blue,background:S.isLight?'#dbeafe':'rgba(59,130,246,0.15)',borderRadius:999,padding:'1px 7px',fontWeight:700}}>{unassigned.length}</span>}
            </div>
            {unassigned.length===0
              ?<div style={{fontSize:12,color:S.dim,padding:'8px 0'}}>All contacts are on the chart</div>
              :<div className='scroll-no-bar' style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4}}>
                {unassigned.map((c)=>{
                  const grad=ORG_GRADIENTS[0]
                  return (
                    <div key={c.id} draggable
                      onDragStart={e=>{setDragState({type:'tray-chip',contactId:c.id,offX:40,offY:25});e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',c.id)}}
                      onDragEnd={()=>setDragState(null)}
                      style={{flexShrink:0,width:80,borderRadius:10,background:grad.gradient,padding:'8px 6px',cursor:'grab',boxShadow:`0 2px 8px ${grad.shadow}`,userSelect:'none',transition:'transform 0.15s'}}
                      onMouseEnter={e=>e.currentTarget.style.transform='scale(1.06)'}
                      onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
                      <div style={{width:26,height:26,borderRadius:'50%',background:'rgba(255,255,255,0.9)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:'#3c90ff',margin:'0 auto 4px',overflow:'hidden'}}>{c.contactPhoto?<img src={c.contactPhoto} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:initials(c.name)}</div>
                      <div style={{fontSize:9,fontWeight:700,color:'#fff',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name.split(' ')[0]}</div>
                    </div>
                  )
                })}
              </div>
            }
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu&&(
        <div onClick={e=>e.stopPropagation()}
          style={{position:'fixed',left:contextMenu.x,top:contextMenu.y,zIndex:2000,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,boxShadow:'0 4px 20px rgba(0,0,0,0.15)',overflow:'hidden',minWidth:200}}>
          <button onClick={()=>{saveOrgNodes(orgNodes.map(n=>n.contactId===contextMenu.contactId?{...n,parentId:null}:n));setContextMenu(null)}}
            style={{display:'block',width:'100%',padding:'9px 14px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,color:S.txt,fontSize:12,cursor:'pointer',textAlign:'left'}}
            onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Remove parent connection</button>
          <button onClick={()=>{saveOrgNodes(orgNodes.filter(n=>n.contactId!==contextMenu.contactId));setContextMenu(null)}}
            style={{display:'block',width:'100%',padding:'9px 14px',background:'transparent',border:'none',color:S.red,fontSize:12,cursor:'pointer',textAlign:'left'}}
            onMouseEnter={e=>e.currentTarget.style.background=S.isLight?'#fef2f2':S.surf2}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Remove from chart</button>
        </div>
      )}

      {/* Add/Edit contact modal */}
      {showAdd&&<Modal title={form.id?'Edit Contact':'Add Contact'} onClose={()=>{setShowAdd(false);setForm(blank)}}>
        <Field label='Contact Type' value={ftype} onChange={f('contactType')} options={['Client','Vendor','Internal']}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
          <Field label='Name' value={form.name} onChange={f('name')} style={{gridColumn:'span 2'}}/>
          {ftype==='Vendor'&&<Field label='Company / Vendor Name' value={form.vendorCompany||''} onChange={f('vendorCompany')} style={{gridColumn:'span 2'}}/>}
          <Field label='Title' value={form.title} onChange={f('title')}/>
          <Field label='Department' value={form.dept} onChange={f('dept')}/>
          <Field label='Email' value={form.email} onChange={f('email')} type='email'/>
          <Field label='Cell' value={form.cell} onChange={f('cell')}/>
          <Field label='LinkedIn URL' value={form.linkedin} onChange={f('linkedin')} style={{gridColumn:'span 2'}}/>
          <Field label='Location' value={form.location} onChange={f('location')}/>
          <Field label='Last Interacted' value={form.lastInteracted} onChange={f('lastInteracted')} type='date'/>
          {ftype!=='Internal'&&<><Field label='Influence Level' value={form.influence} onChange={f('influence')} options={INFLUENCES}/><Field label='Relationship Status' value={form.relStatus} onChange={f('relStatus')} options={['Never Met','Strong','Building','Needs Attention','Unknown']}/><Field label='Sentiment' value={form.sentiment} onChange={f('sentiment')} options={['positive','neutral','negative']}/></>}
        </div>
        {ftype!=='Internal'&&<><Field label='Tools / Tech They Own or Work In' value={form.toolsOwn} onChange={f('toolsOwn')} multiline/><Field label='Key Goals' value={form.goals} onChange={f('goals')} multiline/><Field label='Key Pains' value={form.pains} onChange={f('pains')} multiline/></>}
        <Field label='Professional Notes' value={form.notes} onChange={f('notes')} multiline/>
        {ftype!=='Internal'&&<Field label='Personal Notes — spouse, kids, hobbies, weekend plans' value={form.personalNotes} onChange={f('personalNotes')} multiline/>}
        <div style={{display:'flex',gap:8,marginTop:4}}><Btn variant='primary' onClick={save}>Save Contact</Btn><Btn onClick={()=>{setShowAdd(false);setForm(blank)}}>Cancel</Btn></div>
      </Modal>}

      {showImport&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{width:'70vw',maxWidth:760,maxHeight:'85vh',background:S.surf,borderRadius:16,boxShadow:'0 25px 50px rgba(0,0,0,0.3)',display:'flex',flexDirection:'column',overflow:'hidden',border:`1px solid ${S.bdr}`}}>
            {/* Header */}
            <div style={{padding:'16px 20px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:S.txt,marginBottom:2}}>Import Contacts from Excel</div>
                <div style={{fontSize:12,color:S.muted}}>Upload .xlsx or .csv — columns: Name, Title, Email, LinkedIn URL, Notes</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <button onClick={()=>{const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([['Name','Title','Email','LinkedIn URL','Notes']]);XLSX.utils.book_append_sheet(wb,ws,'Contacts');XLSX.writeFile(wb,'contacts-template.xlsx')}} style={{fontSize:12,color:S.blue,background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,padding:'5px 12px',cursor:'pointer',fontWeight:600}}>⬇ Template</button>
                <button onClick={()=>setShowImport(false)} style={{background:'none',border:'none',color:S.muted,fontSize:20,cursor:'pointer',lineHeight:1,padding:'0 2px'}}>×</button>
              </div>
            </div>
            {/* Upload zone */}
            {importRows.length===0&&!importSuccess&&(
              <div style={{padding:'20px'}}>
                <div
                  onDragOver={e=>{e.preventDefault();setImportDragOver(true)}}
                  onDragLeave={()=>setImportDragOver(false)}
                  onDrop={e=>{
                    e.preventDefault();setImportDragOver(false)
                    const file=e.dataTransfer.files[0]
                    if(!file)return
                    const reader=new FileReader()
                    reader.onload=ev=>{
                      const data=new Uint8Array(ev.target.result)
                      const wb=XLSX.read(data,{type:'array'})
                      const sheet=wb.Sheets[wb.SheetNames[0]]
                      const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''})
                      const parsed=rows.slice(1).filter(r=>String(r[0]||'').trim()).map(r=>({name:String(r[0]||'').trim(),title:String(r[1]||'').trim(),email:String(r[2]||'').trim(),linkedin:String(r[3]||'').trim(),notes:String(r[4]||'').trim()}))
                      const existingNames=new Set((acct.contacts||[]).map(c=>c.name.toLowerCase()))
                      const withStatus=parsed.map(r=>({...r,isDuplicate:existingNames.has(r.name.toLowerCase())}))
                      setImportRows(withStatus)
                      setImportSelections(new Set(withStatus.filter(r=>!r.isDuplicate).map((_,i)=>i)))
                    }
                    reader.readAsArrayBuffer(file)
                  }}
                  onClick={()=>document.getElementById('contact-import-file').click()}
                  style={{border:`2px dashed ${importDragOver?S.blue:S.bdr}`,borderRadius:12,padding:'40px 20px',textAlign:'center',cursor:'pointer',background:importDragOver?'rgba(37,99,235,0.04)':S.surf2,transition:'all 0.15s'}}>
                  <div style={{fontSize:28,marginBottom:8,opacity:0.4}}>📂</div>
                  <div style={{fontSize:14,fontWeight:600,color:S.txt,marginBottom:4}}>Drop your file here or click to browse</div>
                  <div style={{fontSize:12,color:S.muted}}>Accepts .xlsx and .csv files</div>
                  <input id='contact-import-file' type='file' accept='.xlsx,.csv' style={{display:'none'}} onChange={e=>{
                    const file=e.target.files[0]
                    if(!file)return
                    const reader=new FileReader()
                    reader.onload=ev=>{
                      const data=new Uint8Array(ev.target.result)
                      const wb=XLSX.read(data,{type:'array'})
                      const sheet=wb.Sheets[wb.SheetNames[0]]
                      const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''})
                      const parsed=rows.slice(1).filter(r=>String(r[0]||'').trim()).map(r=>({name:String(r[0]||'').trim(),title:String(r[1]||'').trim(),email:String(r[2]||'').trim(),linkedin:String(r[3]||'').trim(),notes:String(r[4]||'').trim()}))
                      const existingNames=new Set((acct.contacts||[]).map(c=>c.name.toLowerCase()))
                      const withStatus=parsed.map(r=>({...r,isDuplicate:existingNames.has(r.name.toLowerCase())}))
                      setImportRows(withStatus)
                      setImportSelections(new Set(withStatus.filter(r=>!r.isDuplicate).map((_,i)=>i)))
                    }
                    reader.readAsArrayBuffer(file)
                    e.target.value=''
                  }}/>
                </div>
              </div>
            )}
            {/* Preview table */}
            {importRows.length>0&&!importSuccess&&(
              <>
                <div style={{padding:'10px 20px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0,display:'flex',alignItems:'center',gap:12}}>
                  <button onClick={()=>setImportSelections(new Set(importRows.map((_,i)=>i)))} style={{fontSize:12,color:S.blue,background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:0}}>Select All</button>
                  <button onClick={()=>setImportSelections(new Set())} style={{fontSize:12,color:S.blue,background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:0}}>Deselect All</button>
                  <span style={{fontSize:12,color:S.muted,marginLeft:'auto'}}>{importRows.length} found · {importRows.filter(r=>!r.isDuplicate).length} new · {importRows.filter(r=>r.isDuplicate).length} duplicates</span>
                </div>
                <div style={{overflowY:'auto',flex:1}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead>
                      <tr style={{background:S.surf2,borderBottom:`1px solid ${S.bdr}`}}>
                        <th style={{padding:'8px 12px',textAlign:'left',fontWeight:600,color:S.muted,width:32}}></th>
                        {['Name','Title','Email','LinkedIn','Notes','Status'].map(h=>(
                          <th key={h} style={{padding:'8px 12px',textAlign:'left',fontWeight:600,color:S.muted}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((row,i)=>{
                        const sel=importSelections.has(i)
                        return (
                          <tr key={i} onClick={()=>setImportSelections(prev=>{const ns=new Set(prev);if(ns.has(i))ns.delete(i);else ns.add(i);return ns})} style={{cursor:'pointer',background:sel?'rgba(37,99,235,0.03)':'transparent',opacity:sel?1:0.55,borderBottom:`1px solid ${S.bdr}`}}>
                            <td style={{padding:'8px 12px'}}><input type='checkbox' checked={sel} onChange={()=>{}} onClick={e=>e.stopPropagation()} style={{accentColor:S.blue}}/></td>
                            <td style={{padding:'8px 12px',fontWeight:600,color:S.txt}}>{row.name}</td>
                            <td style={{padding:'8px 12px',color:S.secondary}}>{row.title||'—'}</td>
                            <td style={{padding:'8px 12px',color:S.secondary}}>{row.email||'—'}</td>
                            <td style={{padding:'8px 12px',color:S.secondary,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.linkedin||'—'}</td>
                            <td style={{padding:'8px 12px',color:S.secondary,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.notes||'—'}</td>
                            <td style={{padding:'8px 12px'}}>
                              {row.isDuplicate
                                ?<span style={{fontSize:10,fontWeight:700,color:'#b45309',background:'rgba(245,158,11,0.12)',borderRadius:999,padding:'2px 7px'}}>Duplicate</span>
                                :<span style={{fontSize:10,fontWeight:700,color:'#15803d',background:'rgba(34,197,94,0.1)',borderRadius:999,padding:'2px 7px'}}>New</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{padding:'12px 20px',borderTop:`1px solid ${S.bdr}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,background:S.surf}}>
                  <span style={{fontSize:12,color:S.muted}}>{importSelections.size} contact{importSelections.size!==1?'s':''} will be imported</span>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>{setImportRows([]);setImportSelections(new Set())}} style={{padding:'7px 14px',background:'transparent',color:S.muted,border:`1px solid ${S.bdr}`,borderRadius:7,fontSize:12,cursor:'pointer'}}>Back</button>
                    <button onClick={()=>setShowImport(false)} style={{padding:'7px 14px',background:'transparent',color:S.muted,border:`1px solid ${S.bdr}`,borderRadius:7,fontSize:12,cursor:'pointer'}}>Cancel</button>
                    <button
                      disabled={importSelections.size===0}
                      onClick={()=>{
                        const toAdd=[...importSelections].map(i=>importRows[i]).map(r=>({id:uid(),contactType:'Client',name:r.name,title:r.title,email:r.email,linkedin:r.linkedin,notes:r.notes,influence:'Stakeholder',sentiment:'neutral',relStatus:'Unknown',cell:'',location:'',dept:'',toolsOwn:'',goals:'',pains:'',personalNotes:'',lastInteracted:'',vendorCompany:'',contactPhoto:'',internalMeetings:[]}))
                        setAcct(p=>({...p,contacts:[...p.contacts,...toAdd]}))
                        setImportSuccess(`${toAdd.length} contact${toAdd.length!==1?'s':''} imported successfully`)
                        setImportRows([]);setImportSelections(new Set())
                      }}
                      style={{padding:'7px 16px',background:importSelections.size===0?S.dim:S.blue,color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:700,cursor:importSelections.size===0?'not-allowed':'pointer'}}>
                      Import Selected
                    </button>
                  </div>
                </div>
              </>
            )}
            {importSuccess&&(
              <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 20px',gap:12}}>
                <div style={{fontSize:32,color:S.green}}>✓</div>
                <div style={{fontSize:15,fontWeight:700,color:S.txt}}>{importSuccess}</div>
                <button onClick={()=>setShowImport(false)} style={{marginTop:8,padding:'8px 20px',background:S.blue,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Done</button>
              </div>
            )}
          </div>
        </div>
      )}
      <input ref={photoInputRef} type='file' accept='image/*' style={{display:'none'}}
        onChange={e=>{const file=e.target.files?.[0];if(file&&photoTarget)handleContactPhotoSave(file,photoTarget);e.target.value=''}}/>
    </div>
  )
}
