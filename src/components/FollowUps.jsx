import { useState, useEffect } from 'react'
import { Clock, Share2 } from 'lucide-react'
import { S, PC } from '../theme.js'
import { uid, fmtDate, daysUntil, sendToAppleReminders } from '../utils.js'
import { Btn, Field, Modal } from './UI.jsx'

export default function FollowUps({acct,setAcct}) {
  const [showAdd,setShowAdd] = useState(false)
  const [showCompleted,setShowCompleted] = useState(false)
  const [showOpenTasks,setShowOpenTasks] = useState(true)
  const [openSort,setOpenSort] = useState('priority')
  const [selMode,setSelMode] = useState(false)
  const [selFUs,setSelFUs] = useState(new Set())
  const [batchDateOpen,setBatchDateOpen] = useState(false)
  const [batchDate,setBatchDate] = useState('')
  const [batchPriOpen,setBatchPriOpen] = useState(false)
  const [snoozeDropOpen,setSnoozeDropOpen] = useState(false)
  const [snoozeShowCustom,setSnoozeShowCustom] = useState(false)
  const [snoozeCustomDate,setSnoozeCustomDate] = useState('')
  const [fuSnoozeToast,setFuSnoozeToast] = useState(false)
  const [remindersToast,setRemindersToast] = useState(false)
  const [hoveredFuId,setHoveredFuId] = useState(null)
  const blank={id:'',contact:'',task:'',priority:'High',dueDate:'',status:'Open',context:''}
  const [form,setForm] = useState(blank)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const toggle=id=>setAcct(p=>({...p,followUps:p.followUps.map(fu=>fu.id===id?{...fu,status:fu.status==='Open'?'Done':'Open'}:fu)}))
  const save=()=>{if(!form.task)return;if(form.id)setAcct(p=>({...p,followUps:p.followUps.map(fu=>fu.id===form.id?form:fu)}));else setAcct(p=>({...p,followUps:[...p.followUps,{...form,id:uid()}]}));setShowAdd(false);setForm(blank)}

  const snoozeFollowUp = (option) => {
    const now=new Date(); const until=new Date()
    if (option==='later') { until.setHours(17,0,0,0); if(until<=now){until.setDate(until.getDate()+1);until.setHours(17,0,0,0)} }
    else if (option==='tomorrow') { until.setDate(until.getDate()+1); until.setHours(8,0,0,0) }
    else if (option==='3days') { until.setDate(until.getDate()+3); until.setHours(8,0,0,0) }
    else if (option==='nextweek') { const day=now.getDay(); const d=day===1?7:((1+7-day)%7)||7; until.setDate(until.getDate()+d); until.setHours(7,0,0,0) }
    const dateStr=until.toISOString().split('T')[0]
    const updated={...form,dueDate:dateStr,status:'Open'}
    setForm(updated)
    if(form.id) setAcct(p=>({...p,followUps:p.followUps.map(fu=>fu.id===form.id?updated:fu)}))
    setSnoozeDropOpen(false); setSnoozeShowCustom(false); setSnoozeCustomDate('')
    setFuSnoozeToast(true); setTimeout(()=>setFuSnoozeToast(false),2000)
  }

  const applyCustomSnooze = () => {
    if (!snoozeCustomDate) return
    const updated={...form,dueDate:snoozeCustomDate,status:'Open'}
    setForm(updated)
    if(form.id) setAcct(p=>({...p,followUps:p.followUps.map(fu=>fu.id===form.id?updated:fu)}))
    setSnoozeDropOpen(false); setSnoozeShowCustom(false); setSnoozeCustomDate('')
    setFuSnoozeToast(true); setTimeout(()=>setFuSnoozeToast(false),2000)
  }

  useEffect(()=>{
    if(!snoozeDropOpen)return
    const h=()=>{setSnoozeDropOpen(false);setSnoozeShowCustom(false)}
    document.addEventListener('click',h)
    return()=>document.removeEventListener('click',h)
  },[snoozeDropOpen])

  const todayStr = new Date().toISOString().split('T')[0]
  const todayFull = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})
  const allOpen = acct.followUps.filter(f=>f.status==='Open')
  const done = acct.followUps.filter(f=>f.status==='Done')
  // Today section: overdue (past) + due today
  const overdueFUs = allOpen.filter(f=>f.dueDate&&f.dueDate<todayStr)
    .sort((a,b)=>a.dueDate.localeCompare(b.dueDate))  // most overdue first
  const dueTodayFUs = allOpen.filter(f=>f.dueDate===todayStr)
    .sort((a,b)=>['Critical','High','Medium','Low'].indexOf(a.priority)-['Critical','High','Medium','Low'].indexOf(b.priority))
  // Open Tasks section: future or no date
  const futureFUs = allOpen.filter(f=>!f.dueDate||f.dueDate>todayStr)
  const sortedFuture = [...futureFUs].sort((a,b)=>{
    if(openSort==='duedate'){
      if(!a.dueDate&&!b.dueDate)return 0
      if(!a.dueDate)return 1
      if(!b.dueDate)return -1
      return a.dueDate.localeCompare(b.dueDate)
    }
    if(openSort==='contact') return(a.contact||'').localeCompare(b.contact||'')
    return['Critical','High','Medium','Low'].indexOf(a.priority)-['Critical','High','Medium','Low'].indexOf(b.priority)
  })
  const exitSel = () => { setSelMode(false); setSelFUs(new Set()); setBatchDateOpen(false); setBatchPriOpen(false) }
  const toggleSel = id => setSelFUs(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})
  const applyBatchDate = () => { if(!batchDate||!selFUs.size)return; setAcct(p=>({...p,followUps:p.followUps.map(fu=>selFUs.has(fu.id)?{...fu,dueDate:batchDate}:fu)})); setBatchDate(''); setBatchDateOpen(false) }
  const applyBatchPri = pri => { setAcct(p=>({...p,followUps:p.followUps.map(fu=>selFUs.has(fu.id)?{...fu,priority:pri}:fu)})); setBatchPriOpen(false) }
  const applyBatchComplete = () => { setAcct(p=>({...p,followUps:p.followUps.map(fu=>selFUs.has(fu.id)?{...fu,status:'Done'}:fu)})); exitSel() }

  const renderFU = (fu, extraBadge=null) => {
    const p=PC[fu.priority]||PC.Low
    const dDue=fu.dueDate?daysUntil(fu.dueDate):null
    const dueDateColor=dDue===null?S.muted:dDue<0?PC.Critical.c:p.c
    const isSelected=selMode&&selFUs.has(fu.id)
    return (
      <div key={fu.id}
        style={{display:'flex',gap:12,padding:'13px 16px',background:isSelected?'#EBF4FF':S.surf,borderBottom:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`,alignItems:'flex-start',transition:'background 0.12s'}}
        onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background=S.surf2;setHoveredFuId(fu.id)}}
        onMouseLeave={e=>{e.currentTarget.style.background=isSelected?'#EBF4FF':S.surf;setHoveredFuId(null)}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:10,flex:1,minWidth:0}}>
          {selMode
            ?<input type='checkbox' checked={selFUs.has(fu.id)} onChange={()=>toggleSel(fu.id)} style={{width:16,height:16,marginTop:3,cursor:'pointer',flexShrink:0,accentColor:'#007AFF'}}/>
            :<button onClick={()=>toggle(fu.id)}
                style={{width:20,height:20,borderRadius:'50%',border:`2px solid ${p.d||p.c}`,background:'transparent',flexShrink:0,marginTop:2,cursor:'pointer',transition:'all 0.15s'}}
                onMouseEnter={e=>{e.currentTarget.style.background=(p.d||p.c)+'22';e.currentTarget.style.borderColor=p.d||p.c}}
                onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor=p.d||p.c}}
                aria-label='Complete'/>
          }
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',marginBottom:5}}>
              <span style={{fontSize:13,fontWeight:600,color:S.txt,lineHeight:1.4}}>{fu.task}</span>
              {extraBadge}
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
              <span style={{fontSize:10,fontWeight:700,color:p.c,background:p.b,borderRadius:999,padding:'2px 8px'}}>{fu.priority}</span>
              {fu.contact&&<span style={{fontSize:11,color:S.isLight?'#64748b':S.muted,display:'inline-flex',alignItems:'center',gap:3}}>· {fu.contact}</span>}
              {fu.dueDate&&<span style={{fontSize:11,color:dueDateColor,fontWeight:dDue!==null&&dDue<0?700:400,display:'inline-flex',alignItems:'center',gap:3}}>· {fmtDate(fu.dueDate)}</span>}
              {fu.context&&<span style={{fontSize:11,color:S.isLight?'#9CA3AF':S.dim,marginTop:1}}>{fu.context}</span>}
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          <button onClick={()=>{setForm(fu);setShowAdd(true);setSnoozeDropOpen(false);setSnoozeShowCustom(false)}}
            style={{background:'transparent',border:`1px solid ${'#EEEFF2'}`,color:S.isLight?'#9CA3AF':S.muted,cursor:'pointer',fontSize:11,flexShrink:0,padding:'3px 9px',borderRadius:6,transition:'all 0.12s'}}
            onMouseEnter={e=>{e.currentTarget.style.color=S.isLight?'#6B7280':S.secondary;e.currentTarget.style.borderColor=S.isLight?'#9CA3AF':S.secondary}}
            onMouseLeave={e=>{e.currentTarget.style.color=S.isLight?'#9CA3AF':S.muted;e.currentTarget.style.borderColor='#EEEFF2'}}>Edit</button>
          <button onClick={()=>{sendToAppleReminders(fu,acct.name);setRemindersToast(true);setTimeout(()=>setRemindersToast(false),2000)}}
            title='Send to Apple Reminders'
            style={{background:'transparent',border:'none',color:'#9CA3AF',cursor:'pointer',padding:'3px',display:'flex',alignItems:'center',flexShrink:0,opacity:hoveredFuId===fu.id?1:0,transition:'opacity 0.15s'}}
            onMouseEnter={e=>e.currentTarget.style.color='#6B7280'}
            onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}><Share2 size={14}/></button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {fuSnoozeToast&&<div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'rgba(34,197,94,0.92)',color:'#fff',padding:'9px 22px',borderRadius:8,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:'0 4px 16px rgba(0,0,0,0.35)',pointerEvents:'none',display:'flex',alignItems:'center',gap:7}}><Clock size={14}/> Snoozed!</div>}
      {remindersToast&&<div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'rgba(34,197,94,0.92)',color:'#fff',padding:'9px 22px',borderRadius:8,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:'0 4px 16px rgba(0,0,0,0.35)',pointerEvents:'none',display:'flex',alignItems:'center',gap:7}}><Share2 size={14}/> Sending to Apple Reminders...</div>}

      {/* ─── TODAY SECTION ─── */}
      <div style={{background:S.surf,borderRadius:12,border:`1px solid ${'#EEEFF2'}`,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',marginBottom:16,overflow:'hidden'}}>
        <div style={{padding:'12px 16px',borderBottom:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:11,fontWeight:800,color:S.txt,letterSpacing:'0.08em',textTransform:'uppercase'}}>Today</span>
            <span style={{fontSize:11,color:S.muted,fontWeight:400}}>{todayFull}</span>
          </div>
          {(overdueFUs.length+dueTodayFUs.length)>0&&<span style={{fontSize:11,fontWeight:700,color:S.isLight?'#dc2626':S.red,background:S.isLight?'#fef2f2':'rgba(220,38,38,0.1)',borderRadius:999,padding:'2px 9px'}}>{overdueFUs.length+dueTodayFUs.length} due</span>}
        </div>
        {(overdueFUs.length===0&&dueTodayFUs.length===0)
          ?<div style={{display:'flex',alignItems:'center',gap:10,padding:'16px',color:S.isLight?'#16a34a':S.green}}>
            <span style={{fontSize:16}}>✓</span>
            <div>
              <div style={{fontWeight:600,fontSize:13}}>All clear today</div>
              <div style={{fontSize:11,color:S.muted,marginTop:1}}>No tasks due or overdue</div>
            </div>
          </div>
          :<div>
            {overdueFUs.map(fu=>{
              const d=Math.round((new Date()-new Date(fu.dueDate+'T12:00:00'))/86400000)
              return renderFU(fu,<span style={{fontSize:10,fontWeight:600,color:PC.Critical.c,background:PC.Critical.b,borderRadius:999,padding:'1px 7px',whiteSpace:'nowrap'}}>{d}d overdue</span>)
            })}
            {dueTodayFUs.map(fu=>renderFU(fu,<span style={{fontSize:10,fontWeight:600,color:PC.High.c,background:PC.High.b,borderRadius:999,padding:'1px 7px',whiteSpace:'nowrap'}}>Due Today</span>))}
          </div>
        }
      </div>

      {/* ─── OPEN TASKS SECTION ─── */}
      <div style={{background:S.surf,borderRadius:12,border:`1px solid ${'#EEEFF2'}`,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',marginBottom:16,overflow:'hidden'}}>
        <div style={{padding:'12px 16px',borderBottom:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
          <div onClick={()=>setShowOpenTasks(v=>!v)} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',userSelect:'none'}}>
            <span style={{fontSize:10,color:S.muted}}>{showOpenTasks?'▼':'▶'}</span>
            <span style={{fontSize:11,fontWeight:800,color:S.txt,letterSpacing:'0.08em',textTransform:'uppercase'}}>Upcoming</span>
            <span style={{fontSize:11,fontWeight:600,color:S.muted,background:S.surf2,borderRadius:999,padding:'1px 8px'}}>{futureFUs.length}</span>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            {showOpenTasks&&!selMode&&(
              <select value={openSort} onChange={e=>setOpenSort(e.target.value)} style={{fontSize:12,padding:'4px 8px',background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:6,color:'#374151',cursor:'pointer'}}>
                <option value='priority'>Priority</option>
                <option value='duedate'>Due Date</option>
                <option value='contact'>Contact</option>
              </select>
            )}
            {showOpenTasks&&!selMode&&<button onClick={()=>setSelMode(true)} style={{fontSize:12,color:'#6B7280',background:'transparent',border:'1px solid #e2e8f0',borderRadius:5,padding:'4px 9px',cursor:'pointer'}}>Select</button>}
            {!selMode&&<button onClick={()=>{setForm(blank);setShowAdd(true)}} style={{fontSize:12,color:'#007AFF',background:'#EBF4FF',border:'1px solid #bfdbfe',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>+ Add Follow-Up</button>}
          </div>
        </div>

        {/* Batch toolbar */}
        {selMode&&(
          <div style={{display:'flex',gap:8,alignItems:'center',padding:'8px 14px',background:'#ffffff',borderBottom:'1px solid #f1f5f9',flexWrap:'wrap',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
            <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#64748b',cursor:'pointer'}}>
              <input type='checkbox' checked={selFUs.size===futureFUs.length&&futureFUs.length>0} onChange={e=>{if(e.target.checked)setSelFUs(new Set(futureFUs.map(f=>f.id)));else setSelFUs(new Set())}} style={{accentColor:'#007AFF',cursor:'pointer'}}/>
              Select All
            </label>
            {selFUs.size>0&&<span style={{fontSize:12,fontWeight:600,color:'#111827',background:'#F9FAFB',borderRadius:999,padding:'2px 9px'}}>{selFUs.size} selected</span>}
            {selFUs.size>0&&<>
              <div style={{position:'relative'}}>
                <button onClick={()=>{setBatchDateOpen(v=>!v);setBatchPriOpen(false)}} style={{fontSize:11,color:'#6B7280',background:'#F9FAFB',border:'1px solid #e2e8f0',borderRadius:5,padding:'4px 9px',cursor:'pointer'}}>Set Due Date</button>
                {batchDateOpen&&<div onClick={e=>e.stopPropagation()} style={{position:'absolute',top:'calc(100% + 4px)',left:0,zIndex:100,background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:7,padding:'8px',boxShadow:'0 4px 16px rgba(0,0,0,0.12)',display:'flex',gap:6,alignItems:'center'}}>
                  <input type='date' value={batchDate} onChange={e=>setBatchDate(e.target.value)} style={{fontSize:12,padding:'4px 7px',background:'#F9FAFB',border:'1px solid #e2e8f0',borderRadius:5,color:'#374151'}}/>
                  <button onClick={applyBatchDate} style={{padding:'4px 10px',background:'#007AFF',border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Apply</button>
                </div>}
              </div>
              <div style={{position:'relative'}}>
                <button onClick={()=>{setBatchPriOpen(v=>!v);setBatchDateOpen(false)}} style={{fontSize:11,color:'#6B7280',background:'#F9FAFB',border:'1px solid #e2e8f0',borderRadius:5,padding:'4px 9px',cursor:'pointer'}}>Set Priority</button>
                {batchPriOpen&&<div style={{position:'absolute',top:'calc(100% + 4px)',left:0,zIndex:100,background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:7,overflow:'hidden',boxShadow:'0 4px 16px rgba(0,0,0,0.12)'}}>
                  {['Critical','High','Medium','Low'].map(p=>(
                    <button key={p} onClick={()=>applyBatchPri(p)} style={{display:'block',width:'100%',padding:'7px 14px',background:'transparent',border:'none',fontSize:12,color:(PC[p]||PC.Low).c,cursor:'pointer',textAlign:'left',fontWeight:600,borderBottom:'1px solid #f1f5f9'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>{p}</button>
                  ))}
                </div>}
              </div>
              <button onClick={applyBatchComplete} style={{fontSize:11,color:'#15803d',background:'#dcfce7',border:'1px solid #bbf7d0',borderRadius:5,padding:'4px 9px',cursor:'pointer',fontWeight:600}}>Mark Complete</button>
            </>}
            <button onClick={exitSel} style={{fontSize:11,color:'#64748b',background:'transparent',border:'1px solid #e2e8f0',borderRadius:5,padding:'4px 9px',cursor:'pointer',marginLeft:'auto'}}>Cancel</button>
          </div>
        )}

        {showOpenTasks&&(
          futureFUs.length===0
          ?<div style={{fontSize:12,color:S.muted,padding:'20px 16px',textAlign:'center'}}>No upcoming follow-ups. Click + Add Follow-Up to create one.</div>
          :<div>{sortedFuture.map(fu=>renderFU(fu))}</div>
        )}
      </div>

      {/* ─── COMPLETED SECTION ─── */}
      <div style={{background:S.surf,borderRadius:12,border:`1px solid ${'#EEEFF2'}`,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',overflow:'hidden'}}>
        <div style={{padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div onClick={()=>setShowCompleted(v=>!v)} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',userSelect:'none'}}>
            <span style={{fontSize:10,color:S.muted}}>{showCompleted?'▼':'▶'}</span>
            <span style={{fontSize:11,fontWeight:800,color:S.muted,letterSpacing:'0.08em',textTransform:'uppercase'}}>Completed</span>
            <span style={{fontSize:11,fontWeight:600,color:S.muted,background:S.surf2,borderRadius:999,padding:'1px 8px'}}>{done.length}</span>
          </div>
          {done.length>0&&<button onClick={()=>{if(window.confirm(`Delete all ${done.length} completed tasks?`))setAcct(p=>({...p,followUps:p.followUps.filter(fu=>fu.status!=='Done')}))}} style={{fontSize:11,color:S.isLight?'#dc2626':S.red,background:S.isLight?'#fef2f2':'rgba(220,38,38,0.1)',border:`1px solid ${S.isLight?'#fecaca':'rgba(220,38,38,0.2)'}`,borderRadius:6,padding:'4px 10px',cursor:'pointer'}}>Clear All</button>}
        </div>
        {showCompleted&&(
          done.length===0
          ?<div style={{fontSize:12,color:S.muted,padding:'12px 16px',borderTop:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`,textAlign:'center'}}>No completed tasks yet.</div>
          :<div style={{borderTop:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`}}>
            {done.map(fu=>(
              <div key={fu.id} style={{display:'flex',gap:12,padding:'10px 16px',alignItems:'center',background:S.surf2,borderBottom:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`,cursor:'pointer',transition:'background 0.12s'}}
                onMouseEnter={e=>e.currentTarget.style.background=S.isLight?'#F9FAFB':S.surf}
                onMouseLeave={e=>e.currentTarget.style.background=S.surf2}>
                <div onClick={()=>toggle(fu.id)} style={{width:20,height:20,borderRadius:'50%',border:'2px solid #16a34a',background:'#dcfce7',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,cursor:'pointer'}}>
                  <span style={{color:'#16a34a',fontSize:10,fontWeight:700}}>✓</span>
                </div>
                <span style={{fontSize:13,color:S.muted,textDecoration:'line-through',flex:1,lineHeight:1.4}}>{fu.task}</span>
                {fu.contact&&<span style={{fontSize:11,color:S.dim}}>{fu.contact}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {showAdd&&<Modal title={form.id?'Edit Follow-Up':'Add Follow-Up'} onClose={()=>{setShowAdd(false);setForm(blank);setSnoozeDropOpen(false);setSnoozeShowCustom(false)}}>
        <Field label='Task' value={form.task} onChange={f('task')}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
          <Field label='Priority' value={form.priority} onChange={f('priority')} options={['Critical','High','Medium','Low']}/>
          <Field label='Due Date' value={form.dueDate} onChange={f('dueDate')} type='date'/>
          <Field label='Contact Name' value={form.contact} onChange={f('contact')} style={{gridColumn:'span 2'}}/>
        </div>
        <Field label='Context / Notes' value={form.context} onChange={f('context')} multiline/>
        <div style={{display:'flex',gap:8,marginTop:4,alignItems:'center',flexWrap:'wrap'}}>
          <Btn variant='primary' onClick={save}>Save</Btn>
          {form.id&&(
            <div style={{position:'relative'}} onClick={e=>e.stopPropagation()}>
              <button onClick={()=>{setSnoozeDropOpen(v=>!v);setSnoozeShowCustom(false)}}
                style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 12px',minHeight:44,borderRadius:6,fontSize:13,fontWeight:500,cursor:'pointer',background:'transparent',color:S.muted,border:`1px solid ${S.bdr}`}}>
                <Clock size={14}/> Snooze
              </button>
              {snoozeDropOpen&&(
                <div style={{position:'absolute',bottom:'calc(100% + 4px)',left:0,zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,boxShadow:'0 4px 20px rgba(0,0,0,0.5)',minWidth:220,overflow:'hidden'}}>
                  {[{label:'Later Today',sub:'5:00 PM today',opt:'later'},{label:'Tomorrow',sub:'8:00 AM tomorrow',opt:'tomorrow'},{label:'In 3 Days',sub:'8:00 AM',opt:'3days'},{label:'Next Week',sub:'Monday 7:00 AM',opt:'nextweek'}].map(o=>(
                    <button key={o.opt} onClick={()=>snoozeFollowUp(o.opt)}
                      style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 14px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,cursor:'pointer',textAlign:'left'}}
                      onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <Clock size={13} color={S.muted}/>
                      <div><div style={{fontSize:13,color:S.txt,fontWeight:500}}>{o.label}</div><div style={{fontSize:10,color:S.muted}}>{o.sub}</div></div>
                    </button>
                  ))}
                  {!snoozeShowCustom
                    ?<button onClick={e=>{e.stopPropagation();setSnoozeShowCustom(true)}}
                        style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 14px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}
                        onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <Clock size={13} color={S.muted}/>
                        <div style={{fontSize:13,color:S.txt,fontWeight:500}}>Custom Date</div>
                      </button>
                    :<div style={{padding:'8px 14px',display:'flex',gap:6,alignItems:'center'}} onClick={e=>e.stopPropagation()}>
                        <input type='date' value={snoozeCustomDate} onChange={e=>setSnoozeCustomDate(e.target.value)}
                          style={{flex:1,fontSize:12,padding:'4px 7px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt}}/>
                        <button onClick={applyCustomSnooze} style={{padding:'4px 10px',background:S.blue,border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Set</button>
                      </div>
                  }
                </div>
              )}
            </div>
          )}
          <Btn onClick={()=>{setShowAdd(false);setForm(blank);setSnoozeDropOpen(false);setSnoozeShowCustom(false)}}>Cancel</Btn>
        </div>
      </Modal>}
    </div>
  )
}
