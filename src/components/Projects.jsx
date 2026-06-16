import { useState, useEffect } from 'react'
import { Target } from 'lucide-react'
import { S } from '../theme.js'
import { uid, fmtDate, daysSince } from '../utils.js'
import { STAGES, PROJ_STATS, PSC } from '../constants.js'
import { Badge, Btn, Field, Modal, SH, Card } from './UI.jsx'

const InlineEdit = ({value, onChange, placeholder, multiline=false}) => {
  const [local, setLocal] = useState(value||'')
  useEffect(()=>{setLocal(value||'')},[value])
  const base={fontSize:12,color:S.secondary,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:4,padding:'4px 8px',width:'100%',lineHeight:1.5,resize:'vertical',boxSizing:'border-box'}
  if(multiline)return <textarea value={local} onChange={e=>setLocal(e.target.value)} onBlur={()=>onChange(local)} rows={2} placeholder={placeholder||''} style={base}/>
  return <input value={local} onChange={e=>setLocal(e.target.value)} onBlur={()=>onChange(local)} placeholder={placeholder||''} style={base}/>
}

const TIMELINE_STATUSES = ['In Flight','In Discussion','Not Started','Stalled']

export default function Projects({acct,setAcct}) {
  const [view,setView] = useState('pipeline')
  const [exp,setExp] = useState(null)
  const [showAdd,setShowAdd] = useState(false)
  const [moveMenu,setMoveMenu] = useState(null)
  const [statusMenu,setStatusMenu] = useState(null)
  const [tlFilters,setTlFilters] = useState(new Set(TIMELINE_STATUSES))
  const toggleTlFilter = s => setTlFilters(prev=>{const n=new Set(prev);n.has(s)?n.delete(s):n.add(s);return n})
  const blank={id:'',name:'',category:'',vendor:'',status:'Not Started',description:'',goals:'',pains:'',primaryContact:'',budget:false,closeDate:'',notes:'',waitingOn:'',nextAction:'',nextSteps:'',estimatedRevenue:'',estimatedGrossProfit:'',clientTargetDate:'',projectNotes:[],timeline:STAGES.map(s=>({stage:s,status:'pending',date:''}))}
  const [form,setForm] = useState(blank)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const [addingNoteFor, setAddingNoteFor] = useState(null)
  const [newNoteText, setNewNoteText] = useState('')
  const save=()=>{if(!form.name)return;if(form.id)setAcct(p=>({...p,projects:p.projects.map(j=>j.id===form.id?form:j)}));else setAcct(p=>({...p,projects:[...p.projects,{...form,id:uid()}]}));setShowAdd(false);setForm(blank)}
  const toggleStage=(projId,idx)=>{setAcct(p=>({...p,projects:p.projects.map(j=>{if(j.id!==projId)return j;const tl=j.timeline.map((s,i)=>{if(i!==idx)return s;const next=s.status==='pending'?'current':s.status==='current'?'completed':'pending';return{...s,status:next,date:next==='pending'?'':new Date().toISOString().split('T')[0]};});return{...j,timeline:tl}})}))}
  const updateField=(projId,field,val)=>{setAcct(p=>({...p,projects:p.projects.map(j=>j.id===projId?{...j,[field]:val}:j)}))}
  const moveStatus=(projId,newStatus)=>{updateField(projId,'status',newStatus);setMoveMenu(null);setStatusMenu(null)}
  const openEdit=(p,e)=>{if(e)e.stopPropagation();setForm({...blank,...p});setShowAdd(true)}
  const grouped=PROJ_STATS.reduce((acc,s)=>{acc[s]=acct.projects.filter(p=>p.status===s);return acc},{})

  useEffect(()=>{
    const h=()=>{setMoveMenu(null);setStatusMenu(null)}
    document.addEventListener('click',h)
    return()=>document.removeEventListener('click',h)
  },[])

  const penBtn={background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:13,padding:'2px 5px',borderRadius:4,lineHeight:1,flexShrink:0}

  const getStageDuration = p => {
    const curr=p.timeline.find(s=>s.status==='current'&&s.date)
    if(curr)return daysSince(curr.date)
    const done=p.timeline.filter(s=>s.status==='completed'&&s.date)
    if(!done.length)return null
    return daysSince(done[done.length-1].date)
  }

  const calcHistoricalAverages = () => {
    const pairs=STAGES.slice(0,-1).map((s,i)=>({from:s,to:STAGES[i+1],diffs:[]}))
    acct.projects.forEach(p=>{
      if(p.timeline.filter(s=>s.status==='completed'&&s.date).length<3)return
      p.timeline.forEach((s,i)=>{
        if(i===p.timeline.length-1)return
        const s2=p.timeline[i+1]
        if(s.status==='completed'&&s2.status==='completed'&&s.date&&s2.date){
          const d=Math.floor((new Date(s2.date+'T12:00:00')-new Date(s.date+'T12:00:00'))/86400000)
          if(d>=0)pairs[i].diffs.push(d)
        }
      })
    })
    return pairs.filter(p=>p.diffs.length>0).map(p=>({...p,avg:Math.round(p.diffs.reduce((a,b)=>a+b,0)/p.diffs.length)}))
  }

  const avgData=calcHistoricalAverages()

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:7,padding:2}}>
          {['pipeline','timeline'].map(v=><button key={v} onClick={()=>setView(v)} style={{padding:'5px 14px',borderRadius:5,border:'none',background:view===v?S.blue:'transparent',color:view===v?'#fff':S.muted,fontSize:12,fontWeight:600,cursor:'pointer'}}>{v==='pipeline'?'Pipeline':'Timeline'}</button>)}
        </div>
        <Btn variant='primary' onClick={()=>{setForm(blank);setShowAdd(true)}}>+ Add Project</Btn>
      </div>
      {view==='pipeline'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
          {['In Flight','In Discussion','Not Started','Stalled','Won','Lost'].map(status=>{
            const projs=grouped[status]||[];const sc=PSC[status]||S.muted
            return (
              <div key={status} style={{background:S.isLight?S.surf2:S.surf2,border:S.isLight?`1px solid ${S.bdr}`:'none',borderRadius:10,padding:10}}>
                <div style={{fontSize:11,fontWeight:700,color:sc,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  {status}<span style={{background:sc+'22',borderRadius:999,padding:'1px 7px'}}>{projs.length}</span>
                </div>
                {projs.length===0&&<div style={{fontSize:11,color:S.dim,textAlign:'center',padding:'14px 6px',border:`1px dashed ${S.bdr}`,borderRadius:6}}>No projects</div>}
                {projs.map(p=>{
                  const comp=p.timeline.filter(s=>s.status==='completed').length
                  return (
                    <div key={p.id} style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,padding:'9px 11px',marginBottom:6,position:'relative',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                      {/* Name + notes bubble + edit + delete buttons */}
                      <div style={{display:'flex',alignItems:'flex-start',gap:4,marginBottom:4}}>
                        <div style={{fontSize:12,fontWeight:600,color:S.txt,flex:1,lineHeight:1.3}}>{p.name}</div>
                        {p.projectNotes?.length>0&&<span title={`${p.projectNotes.length} note${p.projectNotes.length!==1?'s':''}`} style={{fontSize:9,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:4,padding:'1px 5px',lineHeight:1.6,flexShrink:0}}>💬{p.projectNotes.length}</span>}
                        <button onClick={e=>openEdit(p,e)} style={penBtn} title='Edit'>✏</button>
                        <button onClick={e=>{e.stopPropagation();if(window.confirm('Delete this project? This cannot be undone.'))setAcct(prev=>({...prev,projects:prev.projects.filter(j=>j.id!==p.id)}))}} style={{...penBtn,color:'#dc2626'}} title='Delete'>×</button>
                      </div>
                      {/* Clickable inline status badge */}
                      <div style={{position:'relative',display:'inline-block',marginBottom:5}} onClick={e=>e.stopPropagation()}>
                        <button onClick={e=>{e.stopPropagation();setStatusMenu(sm=>sm===p.id?null:p.id);setMoveMenu(null)}}
                          style={{background:sc+'1a',border:`1px solid ${sc}44`,borderRadius:999,padding:'2px 8px',fontSize:10,fontWeight:700,color:sc,cursor:'pointer',display:'flex',alignItems:'center',gap:3}}>
                          {p.status}<span style={{fontSize:8,opacity:0.7}}>▾</span>
                        </button>
                        {statusMenu===p.id&&(
                          <div style={{position:'absolute',top:'calc(100% + 3px)',left:0,zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,boxShadow:'0 4px 20px rgba(0,0,0,0.35)',minWidth:160,overflow:'hidden'}}
                            onClick={e=>e.stopPropagation()}>
                            {PROJ_STATS.filter(s=>s!==p.status).map(s=>(
                              <button key={s} onClick={()=>moveStatus(p.id,s)}
                                style={{display:'block',width:'100%',textAlign:'left',padding:'8px 12px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,fontSize:12,color:PSC[s]||S.txt,cursor:'pointer',fontWeight:600}}>
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{fontSize:11,color:S.muted,marginBottom:4}}>{p.vendor&&<span>{p.vendor} · </span>}{p.primaryContact||'—'}</div>
                      {p.nextAction&&<div style={{fontSize:11,color:S.blue,marginBottom:4}}>→ {p.nextAction}</div>}
                      {p.nextSteps&&<div style={{fontSize:11,color:'#2563eb',marginBottom:4,lineHeight:1.4}}>▶ {p.nextSteps}</div>}
                      {(p.estimatedRevenue||p.estimatedGrossProfit)&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:5}}>
                        {p.estimatedRevenue&&<span style={{fontSize:10,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:4,padding:'1px 6px'}}>Rev: {p.estimatedRevenue}</span>}
                        {p.estimatedGrossProfit&&<span style={{fontSize:10,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:4,padding:'1px 6px'}}>GP: {p.estimatedGrossProfit}</span>}
                      </div>}
                      <div style={{height:3,background:S.bdr,borderRadius:2,overflow:'hidden',marginBottom:3}}>
                        <div style={{height:'100%',width:`${(comp/STAGES.length)*100}%`,background:sc}}/>
                      </div>
                      <div style={{fontSize:10,color:S.muted,marginBottom:7}}>{comp}/{STAGES.length} stages</div>
                      {/* Move to... dropdown */}
                      <div style={{position:'relative'}} onClick={e=>e.stopPropagation()}>
                        <button onClick={e=>{e.stopPropagation();setMoveMenu(mm=>mm===p.id?null:p.id);setStatusMenu(null)}}
                          style={{fontSize:10,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'3px 0',cursor:'pointer',width:'100%',textAlign:'center',fontWeight:600}}>
                          Move to… ↕
                        </button>
                        {moveMenu===p.id&&(
                          <div style={{position:'absolute',bottom:'calc(100% + 3px)',left:0,zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,boxShadow:'0 -4px 20px rgba(0,0,0,0.35)',minWidth:'100%',overflow:'hidden'}}
                            onClick={e=>e.stopPropagation()}>
                            {PROJ_STATS.filter(s=>s!==p.status).map(s=>(
                              <button key={s} onClick={()=>moveStatus(p.id,s)}
                                style={{display:'block',width:'100%',textAlign:'left',padding:'8px 12px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,fontSize:12,color:PSC[s]||S.txt,cursor:'pointer',fontWeight:600}}>
                                → {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
      {view==='timeline'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
        {/* Status filter toggles */}
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',marginBottom:4}}>
          {TIMELINE_STATUSES.map(s=>{
            const active=tlFilters.has(s);const sc=PSC[s]||S.muted
            return (
              <button key={s} onClick={()=>toggleTlFilter(s)}
                style={{padding:'4px 12px',borderRadius:999,fontSize:11,fontWeight:600,cursor:'pointer',border:`1px solid ${active?sc:S.bdr}`,background:active?sc+'18':'transparent',color:active?sc:S.muted,transition:'all 0.12s'}}>
                {s}
              </button>
            )
          })}
        </div>
        {acct.projects.filter(p=>TIMELINE_STATUSES.includes(p.status)&&tlFilters.has(p.status)).map(p=>{
          const sc=PSC[p.status]||S.muted;const open=exp===p.id
          const stageDays=getStageDuration(p)
          return (<Card key={p.id}>
            <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'11px 14px'}}>
              <div style={{flex:1,cursor:'pointer'}} onClick={()=>setExp(open?null:p.id)}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                  <span style={{fontSize:13,fontWeight:700,color:S.txt}}>{p.name}</span>
                  {/* Clickable inline status dropdown */}
                  <div style={{position:'relative',display:'inline-block'}} onClick={e=>e.stopPropagation()}>
                    <button onClick={e=>{e.stopPropagation();setStatusMenu(sm=>sm===p.id?null:p.id);setMoveMenu(null)}}
                      style={{background:sc+'1a',border:`1px solid ${sc}44`,borderRadius:999,padding:'2px 8px',fontSize:10,fontWeight:700,color:sc,cursor:'pointer',display:'flex',alignItems:'center',gap:3}}>
                      {p.status}<span style={{fontSize:8,opacity:0.7}}>▾</span>
                    </button>
                    {statusMenu===p.id&&(
                      <div style={{position:'absolute',top:'calc(100% + 3px)',left:0,zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,boxShadow:'0 4px 20px rgba(0,0,0,0.35)',minWidth:160,overflow:'hidden'}}
                        onClick={e=>e.stopPropagation()}>
                        {PROJ_STATS.filter(s=>s!==p.status).map(s=>(
                          <button key={s} onClick={()=>moveStatus(p.id,s)}
                            style={{display:'block',width:'100%',textAlign:'left',padding:'8px 12px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,fontSize:12,color:PSC[s]||S.txt,cursor:'pointer',fontWeight:600}}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {p.vendor&&<Badge label={p.vendor} color={S.muted} bg='rgba(100,116,139,0.1)'/>}
                  {stageDays!==null&&<Badge label={`In stage: ${stageDays}d`} color={S.muted} bg='rgba(100,116,139,0.08)'/>}
                  {p.waitingOn&&<Badge label={`Waiting: ${p.waitingOn}`} color={S.orange} bg='rgba(249,115,22,0.12)'/>}
                  {p.projectNotes?.length>0&&<Badge label={`💬 ${p.projectNotes.length}`} color={S.muted} bg='rgba(100,116,139,0.08)'/>}
                </div>
                <div style={{fontSize:11,color:S.muted}}>{p.primaryContact||'—'} · Close: {fmtDate(p.closeDate)||'TBD'}</div>
                {p.nextAction&&<div style={{fontSize:11,color:S.blue,marginTop:3}}>→ Next: {p.nextAction}</div>}
                {p.nextSteps&&<div style={{fontSize:11,color:'#2563eb',marginTop:3}}>▶ {p.nextSteps}</div>}
                {(p.estimatedRevenue||p.estimatedGrossProfit)&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:3}}>
                  {p.estimatedRevenue&&<span style={{fontSize:10,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:4,padding:'1px 6px'}}>Rev: {p.estimatedRevenue}</span>}
                  {p.estimatedGrossProfit&&<span style={{fontSize:10,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:4,padding:'1px 6px'}}>GP: {p.estimatedGrossProfit}</span>}
                </div>}
              </div>
              <button onClick={e=>openEdit(p,e)} style={penBtn} title='Edit project'>✏</button>
            </div>
            <div style={{padding:'0 14px 14px'}}>
              <div style={{display:'flex',gap:2,marginBottom:8}}>
                {p.timeline.map((stage,i)=>{const c=stage.status==='completed'?'#0ebc5f':stage.status==='current'?'#007AFF':'#EEEFF2';return(<div key={i} onClick={e=>{e.stopPropagation();toggleStage(p.id,i)}} style={{flex:1,height:7,background:c,borderRadius:2,cursor:'pointer',transition:'background 0.2s'}} title={stage.stage+(stage.date?' - '+fmtDate(stage.date):'')+' (click to toggle)'}/>)})}
              </div>
              <div style={{display:'grid',gridTemplateColumns:`repeat(${p.timeline.length},1fr)`,gap:2}}>
                {p.timeline.map((stage,i)=>{
                  const c=stage.status==='completed'?'#0ebc5f':stage.status==='current'?'#007AFF':'#9CA3AF'
                  return (<div key={i} style={{textAlign:'center'}}>
                    <div style={{fontSize:9,color:c,fontWeight:stage.status!=='pending'?600:400,lineHeight:1.3,wordBreak:'break-word'}}>{stage.stage}{stage.status==='completed'?' ✓':stage.status==='current'?' ●':''}</div>
                    {stage.status==='completed'&&stage.date&&<div style={{fontSize:8,color:S.muted,marginTop:1,lineHeight:1.2}}>{fmtDate(stage.date)}</div>}
                  </div>)
                })}
              </div>
              <div style={{display:'flex',gap:12,marginTop:6,fontSize:10,color:S.muted}}>
                <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:'50%',background:'#0ebc5f',display:'inline-block',flexShrink:0}}/>Completed</span>
                <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:'50%',background:'#007AFF',display:'inline-block',flexShrink:0}}/>Scheduled / In Progress</span>
                <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:'50%',background:'#EEEFF2',display:'inline-block',flexShrink:0}}/>Not Started</span>
              </div>
              {open&&<div style={{marginTop:12,borderTop:`1px solid ${S.bdr}`,paddingTop:12}}>
                {/* Quick status action buttons */}
                {['In Discussion','In Flight','Stalled','Won'].filter(s=>s!==p.status).length>0&&(
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                    {['In Discussion','In Flight','Stalled','Won'].filter(s=>s!==p.status).map(s=>{
                      const c=PSC[s]||S.muted
                      return <button key={s} onClick={()=>moveStatus(p.id,s)} style={{fontSize:11,fontWeight:600,color:c,background:c+'15',border:`1px solid ${c}44`,borderRadius:5,padding:'4px 10px',cursor:'pointer'}}>→ {s}</button>
                    })}
                  </div>
                )}
                {p.description&&<p style={{fontSize:13,color:S.secondary,marginBottom:10,lineHeight:1.6}}>{p.description}</p>}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  <div>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Goals</div>
                    <InlineEdit value={p.goals} onChange={val=>updateField(p.id,'goals',val)} placeholder='Goals...' multiline/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Pains</div>
                    <InlineEdit value={p.pains} onChange={val=>updateField(p.id,'pains',val)} placeholder='Current pains...' multiline/>
                  </div>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Notes</div>
                  <InlineEdit value={p.notes} onChange={val=>updateField(p.id,'notes',val)} placeholder='Project notes...' multiline/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  <div>
                    <div style={{fontSize:10,color:S.blue,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Next Action</div>
                    <InlineEdit value={p.nextAction} onChange={val=>updateField(p.id,'nextAction',val)} placeholder='Next step...'/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:S.orange,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Waiting On</div>
                    <InlineEdit value={p.waitingOn} onChange={val=>updateField(p.id,'waitingOn',val)} placeholder='Who/what is blocking...'/>
                  </div>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,color:'#2563eb',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Next Steps</div>
                  <InlineEdit value={p.nextSteps||''} onChange={val=>updateField(p.id,'nextSteps',val)} placeholder='Specific actions to advance this project...'/>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Project Notes</div>
                  {(p.projectNotes||[]).length===0&&<div style={{fontSize:11,color:S.muted,fontStyle:'italic',marginBottom:6}}>No notes yet.</div>}
                  {[...(p.projectNotes||[])].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).map((n,ni)=>(
                    <div key={n.id||ni} style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,padding:'8px 10px',marginBottom:5}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                        <span style={{fontSize:11,color:'#2563eb',fontWeight:600}}>{fmtDate(n.date)||n.date}</span>
                        {n.sourceIntelId&&<span style={{fontSize:10,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:3,padding:'1px 5px'}}>via Intel Log</span>}
                        <button onClick={()=>updateField(p.id,'projectNotes',(p.projectNotes||[]).filter(x=>x.id!==n.id))} style={{marginLeft:'auto',background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:14,padding:'0 2px',lineHeight:1}} title='Remove'>×</button>
                      </div>
                      <div style={{fontSize:12,color:S.secondary,lineHeight:1.5}}>{n.text}</div>
                    </div>
                  ))}
                  {addingNoteFor===p.id?(
                    <div style={{display:'flex',gap:6,alignItems:'flex-start',marginTop:4}}>
                      <textarea rows={2} value={newNoteText} onChange={e=>setNewNoteText(e.target.value)} autoFocus
                        placeholder='Add a note...'
                        style={{flex:1,fontSize:12,padding:'6px 8px',border:`1px solid ${S.bdr}`,borderRadius:6,background:S.surf,color:S.txt,resize:'vertical',fontFamily:'inherit',lineHeight:1.5}}/>
                      <div style={{display:'flex',flexDirection:'column',gap:4}}>
                        <button onClick={()=>{if(newNoteText.trim())updateField(p.id,'projectNotes',[{id:uid(),text:newNoteText.trim(),date:new Date().toISOString().split('T')[0],sourceIntelId:'',createdAt:new Date().toISOString()},...(p.projectNotes||[])]);setAddingNoteFor(null);setNewNoteText('')}}
                          style={{fontSize:11,padding:'4px 8px',background:'#007AFF',color:'#fff',border:'none',borderRadius:5,cursor:'pointer',whiteSpace:'nowrap',fontWeight:600}}>Save</button>
                        <button onClick={()=>{setAddingNoteFor(null);setNewNoteText('')}}
                          style={{fontSize:11,padding:'4px 8px',background:'transparent',border:`1px solid ${S.bdr}`,color:S.muted,borderRadius:5,cursor:'pointer'}}>Cancel</button>
                      </div>
                    </div>
                  ):(
                    <button onClick={()=>{setAddingNoteFor(p.id);setNewNoteText('')}} style={{fontSize:11,color:'#007AFF',background:'transparent',border:'none',cursor:'pointer',padding:'3px 0',fontWeight:600}}>+ Add note</button>
                  )}
                </div>
                <div style={{display:'flex',gap:8}}><Btn onClick={()=>openEdit(p,null)}>Edit</Btn><Btn variant='danger' onClick={()=>{if(window.confirm('Delete?'))setAcct(prev=>({...prev,projects:prev.projects.filter(j=>j.id!==p.id)}))}}>Delete</Btn></div>
              </div>}
            </div>
          </Card>)
        })}
        <div style={{padding:'14px 16px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,marginTop:6}}>
          <SH>Historical Stage Averages</SH>
          {avgData.length===0
            ?<div style={{fontSize:12,color:S.muted}}>Not enough completed projects to calculate averages yet.</div>
            :<table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr>
                  <th style={{textAlign:'left',color:S.muted,fontWeight:600,padding:'3px 8px 6px 0',borderBottom:`1px solid ${S.bdr}`}}>Stage</th>
                  <th style={{textAlign:'left',color:S.muted,fontWeight:600,padding:'3px 8px 6px',borderBottom:`1px solid ${S.bdr}`}}>Next Stage</th>
                  <th style={{textAlign:'right',color:S.muted,fontWeight:600,padding:'3px 0 6px 8px',borderBottom:`1px solid ${S.bdr}`}}>Avg Days</th>
                </tr>
              </thead>
              <tbody>
                {avgData.map((row,i)=>(
                  <tr key={i}>
                    <td style={{color:S.txt,padding:'4px 8px 4px 0'}}>{row.from}</td>
                    <td style={{color:S.txt,padding:'4px 8px'}}>{row.to}</td>
                    <td style={{color:S.blue,fontWeight:700,textAlign:'right',padding:'4px 0 4px 8px'}}>{row.avg}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>
      </div>}
      {showAdd&&<Modal title={form.id?'Edit Project':'Add Project'} onClose={()=>{setShowAdd(false);setForm(blank)}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
          <Field label='Project Name' value={form.name} onChange={f('name')} style={{gridColumn:'span 2'}}/>
          <Field label='Category' value={form.category} onChange={f('category')}/>
          <Field label='Vendor' value={form.vendor} onChange={f('vendor')}/>
          <Field label='Status' value={form.status} onChange={f('status')} options={PROJ_STATS}/>
          <Field label='Est. Close Date' value={form.closeDate} onChange={f('closeDate')} type='date'/>
          <Field label='Est. Revenue' value={form.estimatedRevenue||''} onChange={f('estimatedRevenue')} placeholder='e.g. $50,000'/>
          <Field label='Est. Gross Profit' value={form.estimatedGrossProfit||''} onChange={f('estimatedGrossProfit')} placeholder='e.g. $15,000'/>
          <Field label='Client Target Date' value={form.clientTargetDate||''} onChange={f('clientTargetDate')} type='date' style={{gridColumn:'span 2'}}/>
          <Field label='Primary Contact Name' value={form.primaryContact} onChange={f('primaryContact')} style={{gridColumn:'span 2'}}/>
        </div>
        <Field label='Description' value={form.description} onChange={f('description')} multiline/>
        <Field label='Goals' value={form.goals} onChange={f('goals')} multiline/>
        <Field label='Pains Today' value={form.pains} onChange={f('pains')} multiline/>
        <Field label='Notes' value={form.notes} onChange={f('notes')} multiline/>
        <Field label='Next Action' value={form.nextAction} onChange={f('nextAction')}/>
        <Field label='Waiting On' value={form.waitingOn} onChange={f('waitingOn')}/>
        <Field label='Next Steps' value={form.nextSteps||''} onChange={f('nextSteps')} placeholder='Specific actions to advance this project...'/>
        <div style={{display:'flex',gap:8,marginTop:4,justifyContent:'space-between',alignItems:'center',flexWrap:'wrap'}}>
          {form.id&&<Btn variant='danger' onClick={()=>{if(window.confirm('Delete this project? This cannot be undone.')){setAcct(p=>({...p,projects:p.projects.filter(j=>j.id!==form.id)}));setShowAdd(false);setForm(blank)}}}>Delete Project</Btn>}
          <div style={{display:'flex',gap:8,marginLeft:'auto'}}><Btn variant='primary' onClick={save}>Save</Btn><Btn onClick={()=>{setShowAdd(false);setForm(blank)}}>Cancel</Btn></div>
        </div>
      </Modal>}
    </div>
  )
}
