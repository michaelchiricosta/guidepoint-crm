import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, BookOpen, CheckCircle2, Circle, ArrowRight, Loader, Trash2, X } from 'lucide-react'
import { uid } from '../utils.js'

const fmt = d => {
  if (!d) return ''
  try { return new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) }
  catch { return d }
}
const fmtFull = d => {
  if (!d) return ''
  try { return new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) }
  catch { return d }
}
const fmtTime = iso => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) } catch { return '' }
}

const NL = {fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.1em',textTransform:'uppercase',padding:'10px 16px 4px'}

const CHIPS = [
  {label:'Wins',              template:'Wins: '},
  {label:'Blockers',          template:'Blockers: '},
  {label:'Client updates',    template:'Client updates: '},
  {label:'Follow-ups created',template:'Follow-ups created: '},
  {label:'Remember tomorrow', template:'Remember tomorrow: '},
]

const SL=({icon,label})=>(
  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,marginTop:24}}>
    <span style={{fontSize:15}}>{icon}</span>
    <span style={{fontSize:11,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase'}}>{label}</span>
  </div>
)

// Past journal read-only modal
const JournalModal=({journal,brief,onClose,onDelete})=>{
  if(!journal)return null
  const actions=brief?.sections?.actToday||[]
  const statuses=journal.actionsStatus||{}
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:580,maxHeight:'88vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.25)'}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',padding:'20px 20px 0',gap:12}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>
              End of Day · {fmtFull(journal.date)}
              {journal.status==='complete'&&<span style={{marginLeft:8,fontSize:10,background:'#f0fdf4',color:'#15803d',border:'1px solid #bbf7d0',borderRadius:999,padding:'1px 7px',fontWeight:600,textTransform:'none',letterSpacing:0}}>Complete</span>}
            </div>
            {journal.completedAt&&<div style={{fontSize:11,color:'#94a3b8'}}>Completed {fmtTime(journal.completedAt)}</div>}
          </div>
          <div style={{display:'flex',gap:8,flexShrink:0}}>
            <button onClick={()=>{onDelete(journal.id);onClose()}} style={{background:'#fee2e2',border:'none',borderRadius:8,padding:7,cursor:'pointer',display:'flex',alignItems:'center',color:'#dc2626'}}>
              <Trash2 size={15}/>
            </button>
            <button onClick={onClose} style={{background:'#f1f5f9',border:'none',borderRadius:8,padding:7,cursor:'pointer',display:'flex',alignItems:'center',color:'#64748b'}}>
              <X size={16}/>
            </button>
          </div>
        </div>
        <div style={{padding:'16px 20px 28px',display:'flex',flexDirection:'column',gap:14}}>
          {actions.length>0&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>Act Today — Review</div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {actions.map((a,i)=>{
                  const s=statuses[i]
                  return(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'#f9fafb',borderRadius:7}}>
                      {s==='done'?<CheckCircle2 size={14} color='#22c55e'/>:s==='tomorrow'?<ArrowRight size={14} color='#f59e0b'/>:<Circle size={14} color='#d1d5db'/>}
                      <span style={{fontSize:13,color:'#0f172a',flex:1,minWidth:0,fontWeight:s==='done'?600:400,textDecoration:s==='done'?'line-through':'none',opacity:s==='done'?0.55:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.action}</span>
                      <span style={{fontSize:11,color:'#64748b',flexShrink:0}}>{a.account}</span>
                      {s&&<span style={{fontSize:10,fontWeight:700,color:s==='done'?'#15803d':'#92400e',background:s==='done'?'#f0fdf4':'#fef3c7',borderRadius:999,padding:'1px 7px',flexShrink:0}}>{s==='done'?'Done':'Tomorrow'}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {journal.debriefText&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>What Happened Today</div>
              <div style={{fontSize:13,color:'#374151',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{journal.debriefText}</div>
            </div>
          )}
          {journal.aiSummary&&(
            <div style={{background:'#f8fafc',borderRadius:8,padding:'12px 14px',borderLeft:'2px solid #2563eb'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>AI Summary</div>
              <div style={{fontSize:13,color:'#374151',lineHeight:1.65}}>{journal.aiSummary}</div>
            </div>
          )}
          {journal.tomorrowPreview?.actToday?.length>0&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>Tomorrow's Preview</div>
              {journal.tomorrowPreview.highlights&&<div style={{fontSize:13,color:'#374151',lineHeight:1.6,marginBottom:10,fontStyle:'italic'}}>{journal.tomorrowPreview.highlights}</div>}
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {journal.tomorrowPreview.actToday.map((a,i)=>(
                  <div key={i} style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'10px 14px'}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#1d4ed8',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:3}}>{a.account}</div>
                    <div style={{fontSize:13,fontWeight:600,color:'#0f172a'}}>{a.action}</div>
                    {a.clientFirstAngle&&<div style={{fontSize:12,color:'#3b82f6',fontStyle:'italic',marginTop:3}}>{a.clientFirstAngle}</div>}
                    {a.suggestedFirstMove&&<div style={{fontSize:11,color:'#64748b',marginTop:4}}>→ {a.suggestedFirstMove}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {journal.suggestedAccountUpdates?.length>0&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>Suggested Account Updates</div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {journal.suggestedAccountUpdates.map((u,i)=>(
                  <div key={i} style={{background:'#f8fafc',border:'1px solid #e5e7eb',borderRadius:7,padding:'8px 12px'}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#0f172a',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:2}}>{u.account}</div>
                    <div style={{fontSize:12,color:'#475569',lineHeight:1.5}}>{u.update}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EndOfDayJournal({data,setData,onBack}){
  const today=new Date().toISOString().split('T')[0]
  const journals=data.dailyJournals||[]
  const briefs=data.dailyBriefs||[]
  const todayBrief=briefs.find(b=>b.date===today)||null
  const todayJournal=journals.find(j=>j.date===today)||null
  const pastJournals=journals.filter(j=>j.date!==today).slice(0,30)

  const [selectedDate,setSelectedDate]=useState(today)
  const [actionsStatus,setActionsStatus]=useState(()=>todayJournal?.actionsStatus||{})
  const [debriefText,setDebriefText]=useState(()=>todayJournal?.debriefText||'')
  const [generating,setGenerating]=useState(false)
  const [genError,setGenError]=useState(null)
  const [openModal,setOpenModal]=useState(null)
  const debriefRef=useRef(null)
  const saveTimer=useRef(null)

  useEffect(()=>{
    if(todayJournal){
      setActionsStatus(todayJournal.actionsStatus||{})
      setDebriefText(todayJournal.debriefText||'')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[todayJournal?.id])

  const upsert=(patch)=>{
    setData(prev=>{
      const list=prev.dailyJournals||[]
      const exists=list.find(j=>j.date===today)
      if(exists){
        return{...prev,dailyJournals:list.map(j=>j.date===today?{...j,...patch,updatedAt:new Date().toISOString()}:j)}
      }
      const fresh={
        id:uid(),date:today,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
        completedAt:null,linkedBriefDate:today,actionsStatus:{},debriefText:'',
        aiSummary:'',tomorrowPreview:null,suggestedAccountUpdates:[],status:'draft',...patch
      }
      return{...prev,dailyJournals:[fresh,...list]}
    })
  }

  const toggleAction=(idx)=>{
    const cur=actionsStatus[idx]||null
    const next=cur===null?'done':cur==='done'?'tomorrow':null
    const updated={...actionsStatus,[idx]:next}
    setActionsStatus(updated)
    upsert({actionsStatus:updated,status:'draft'})
  }

  const handleDebrief=(val)=>{
    setDebriefText(val)
    clearTimeout(saveTimer.current)
    saveTimer.current=setTimeout(()=>upsert({debriefText:val,status:'draft'}),600)
  }

  const insertChip=(template)=>{
    const ta=debriefRef.current
    if(!ta)return
    const pos=ta.selectionStart
    const before=debriefText.slice(0,pos)
    const after=debriefText.slice(pos)
    const insert=(before.length>0&&!before.endsWith('\n')?'\n':'')+template
    const next=before+insert+after
    setDebriefText(next)
    setTimeout(()=>{ta.focus();ta.selectionStart=ta.selectionEnd=pos+insert.length},0)
  }

  const generatePreview=async()=>{
    const apiKey=data.apiKey||''
    if(!apiKey){setGenError('No API key configured. Add it in Settings.');return}
    setGenerating(true);setGenError(null)

    const actToday=todayBrief?.sections?.actToday||[]
    const doneItems=actToday.filter((_,i)=>actionsStatus[i]==='done').map(a=>a.action)
    const deferItems=actToday.filter((_,i)=>actionsStatus[i]==='tomorrow').map(a=>({action:a.action,account:a.account}))
    const untouched=actToday.filter((_,i)=>!actionsStatus[i])

    const accounts=data.accounts||[]
    const acctCtx=actToday.map(a=>{
      const full=accounts.find(acc=>acc.name===a.account)
      return full?{name:full.name,status:full.status,health:full.health,openFollowUps:(full.followUps||[]).filter(f=>f.status==='Open').length}:{name:a.account}
    })

    const sys=`You are Ledgr, the AI chief of staff for Mike Chiricosta at GuidePoint Security. Mike is closing out his day.

Return ONLY valid JSON:
{
  "aiSummary": "2-3 sentence summary of today — what got done, what was left, overall momentum",
  "tomorrowPreview": {
    "highlights": "1 sentence framing tomorrow",
    "actToday": [{"account":"","action":"","clientFirstAngle":"","suggestedFirstMove":""}]
  },
  "suggestedAccountUpdates": [{"account":"","update":"one-sentence CRM note"}]
}

Rules: tomorrowPreview.actToday MAX 3 items. Prioritize deferred > unfinished commitments > renewals > momentum. Every action must have a client-first angle.`

    const usr=`Today: ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}.

Act Today review:
${JSON.stringify(actToday.map((a,i)=>({...a,status:actionsStatus[i]||'untouched'})),null,2)}

Done: ${doneItems.join(', ')||'none'}
Deferred to tomorrow: ${deferItems.map(t=>t.action).join(', ')||'none'}
Left untouched: ${untouched.map(a=>a.action).join(', ')||'none'}

Debrief: ${debriefText||'(none)'}

Account context:
${JSON.stringify(acctCtx,null,2)}`

    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:2000,system:sys,messages:[{role:'user',content:usr}]})
      })
      const rd=await res.json()
      if(!res.ok)throw new Error(`API error ${res.status}: ${rd.error?.message||JSON.stringify(rd)}`)
      const raw=rd.content?.[0]?.text||''
      let parsed=null
      try{let c=raw.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();parsed=JSON.parse(c)}catch{
        let d=0,s=-1,e=-1
        for(let i=0;i<raw.length;i++){if(raw[i]==='{'){if(d===0)s=i;d++}else if(raw[i]==='}'){d--;if(d===0){e=i;break}}}
        if(s!==-1&&e!==-1){try{parsed=JSON.parse(raw.slice(s,e+1))}catch{}}
      }
      if(!parsed)throw new Error('Could not parse AI response')
      upsert({aiSummary:parsed.aiSummary||'',tomorrowPreview:parsed.tomorrowPreview||null,suggestedAccountUpdates:parsed.suggestedAccountUpdates||[],status:'draft'})
    }catch(err){
      setGenError(`Generation failed: ${err.message}`)
    }finally{
      setGenerating(false)
    }
  }

  const deleteJournal=(id)=>setData(prev=>({...prev,dailyJournals:(prev.dailyJournals||[]).filter(j=>j.id!==id)}))

  const journal=todayJournal
  const isComplete=journal?.status==='complete'
  const hasPreview=journal?.tomorrowPreview?.actToday?.length>0
  const todayActions=todayBrief?.sections?.actToday||[]

  const navRow=(j)=>{
    const isSel=selectedDate===j.date&&j.date===today
    return(
      <div key={j.date}
        onClick={()=>j.date===today?setSelectedDate(today):setOpenModal({journal:j,brief:briefs.find(b=>b.date===j.date)||null})}
        style={{padding:'8px 12px',cursor:'pointer',borderRadius:6,margin:'1px 8px',background:isSel?'#1e3a5f':'transparent',transition:'background 0.1s'}}
        onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='rgba(255,255,255,0.08)'}}
        onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background='transparent'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:13,fontWeight:600,color:isSel?'#fff':'#cbd5e1'}}>{fmt(j.date)}</span>
          <span style={{fontSize:10,fontWeight:700,color:j.status==='complete'?'#22c55e':'#64748b'}}>{j.status==='complete'?'✓':''}</span>
        </div>
        {j.aiSummary&&<div style={{fontSize:10,color:'#94a3b8',marginTop:2,lineHeight:1.4,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{j.aiSummary.slice(0,80)}</div>}
      </div>
    )
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden',background:'#f8fafc'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* TOP BAR */}
      <div style={{background:'#0f172a',padding:'11px 20px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
        <button onClick={onBack}
          style={{background:'transparent',border:'none',color:'#94a3b8',cursor:'pointer',display:'flex',alignItems:'center',gap:6,padding:0,fontSize:13,fontWeight:500,whiteSpace:'nowrap'}}
          onMouseEnter={e=>e.currentTarget.style.color='#e2e8f0'}
          onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}>
          <ArrowLeft size={15}/> Back to Dashboard
        </button>
        <div style={{width:1,height:16,background:'rgba(255,255,255,0.15)',flexShrink:0}}/>
        <BookOpen size={15} color='#60a5fa'/>
        <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>End of Day Journal</span>
        {isComplete&&<span style={{marginLeft:'auto',fontSize:11,fontWeight:700,color:'#22c55e'}}>✓ Complete</span>}
      </div>

      {/* BODY */}
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* LEFT NAV */}
        <div style={{width:220,flexShrink:0,background:'#0f172a',display:'flex',flexDirection:'column',borderRight:'1px solid rgba(255,255,255,0.06)',overflow:'hidden'}}>
          <div style={{flex:1,overflowY:'auto',padding:'4px 0'}}>
            <div style={NL}>Today</div>
            <div onClick={()=>setSelectedDate(today)}
              style={{padding:'8px 12px',cursor:'pointer',borderRadius:6,margin:'1px 8px',background:selectedDate===today?'#1e3a5f':'transparent',transition:'background 0.1s'}}
              onMouseEnter={e=>{if(selectedDate!==today)e.currentTarget.style.background='rgba(255,255,255,0.08)'}}
              onMouseLeave={e=>{if(selectedDate!==today)e.currentTarget.style.background='transparent'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:13,fontWeight:600,color:selectedDate===today?'#fff':'#cbd5e1'}}>{fmt(today)}</span>
                {isComplete&&<span style={{fontSize:10,fontWeight:700,color:'#22c55e'}}>✓</span>}
                {!isComplete&&journal&&<span style={{fontSize:10,color:'#f59e0b',fontWeight:600}}>draft</span>}
              </div>
            </div>
            {pastJournals.length>0&&(
              <>
                <div style={NL}>History</div>
                {pastJournals.map(navRow)}
              </>
            )}
          </div>
        </div>

        {/* MAIN */}
        <div style={{flex:1,overflowY:'auto',padding:'28px 36px',WebkitOverflowScrolling:'touch'}}>
          <div style={{maxWidth:660}}>

            {/* Header */}
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:4,gap:12}}>
              <div style={{fontSize:22,fontWeight:800,color:'#0f172a',letterSpacing:'-0.02em',lineHeight:1.15}}>{fmtFull(today)}</div>
            </div>
            <div style={{fontSize:13,color:'#64748b',marginBottom:20}}>End of Day Journal</div>
            <div style={{height:1,background:'#f1f5f9',marginBottom:4}}/>

            {/* ACT TODAY REVIEW */}
            <SL icon='🎯' label="Today's Actions — How Did It Go?"/>
            {!todayBrief&&(
              <div style={{fontSize:13,color:'#94a3b8',marginBottom:20,padding:'12px 14px',background:'#f8fafc',borderRadius:8,border:'1px solid #e5e7eb'}}>
                No Daily Brief was generated today. Use the text field below to capture your day.
              </div>
            )}
            {todayActions.length>0&&(
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:24}}>
                {todayActions.map((item,idx)=>{
                  const s=actionsStatus[idx]||null
                  const done=s==='done', defer=s==='tomorrow'
                  return(
                    <div key={idx} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,padding:'12px 16px',
                      opacity:done?0.58:1,transition:'opacity 0.15s',
                      borderLeft:done?'3px solid #22c55e':defer?'3px solid #f59e0b':'1px solid #e5e7eb'}}>
                      <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:700,color:'#9ca3af',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {item.account}
                            {item.contact&&<span style={{fontWeight:400,textTransform:'none',marginLeft:6,color:'#94a3b8'}}>· {item.contact}</span>}
                          </div>
                          <div style={{fontSize:14,fontWeight:600,color:'#0f172a',lineHeight:1.4,textDecoration:done?'line-through':'none'}}>{item.action}</div>
                        </div>
                        {!isComplete&&(
                          <button onClick={()=>toggleAction(idx)}
                            style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:7,border:'1px solid',fontSize:12,fontWeight:600,cursor:'pointer',transition:'all 0.1s',flexShrink:0,
                              background:done?'#f0fdf4':defer?'#fffbeb':'#f8fafc',
                              borderColor:done?'#86efac':defer?'#fde68a':'#e5e7eb',
                              color:done?'#15803d':defer?'#92400e':'#64748b'}}>
                            {done?<><CheckCircle2 size={13}/> Done</>:defer?<><ArrowRight size={13}/> Tomorrow</>:<><Circle size={13}/> Mark</>}
                          </button>
                        )}
                        {isComplete&&s&&(
                          <span style={{fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:999,flexShrink:0,
                            background:done?'#f0fdf4':'#fef3c7',color:done?'#15803d':'#92400e'}}>
                            {done?'Done':'Tomorrow'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* DEBRIEF */}
            <SL icon='✍️' label="What Happened Today?"/>
            <textarea
              ref={debriefRef}
              value={debriefText}
              onChange={e=>handleDebrief(e.target.value)}
              disabled={isComplete}
              placeholder="Capture your day — wins, blockers, client updates, things to remember tomorrow..."
              style={{width:'100%',boxSizing:'border-box',minHeight:110,padding:'12px 14px',border:'1px solid #d1d5db',borderRadius:9,fontSize:14,color:'#0f172a',lineHeight:1.65,resize:'vertical',fontFamily:'inherit',outline:'none',background:isComplete?'#f8fafc':'#fff',boxShadow:'0 1px 2px rgba(0,0,0,0.04)',opacity:isComplete?0.7:1}}
            />
            {!isComplete&&(
              <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
                {CHIPS.map(c=>(
                  <button key={c.label} onClick={()=>insertChip(c.template)}
                    style={{fontSize:11,fontWeight:500,color:'#64748b',background:'#f1f5f9',border:'1px solid #e5e7eb',borderRadius:6,padding:'3px 10px',cursor:'pointer'}}
                    onMouseEnter={e=>{e.currentTarget.style.background='#e2e8f0';e.currentTarget.style.color='#1e293b'}}
                    onMouseLeave={e=>{e.currentTarget.style.background='#f1f5f9';e.currentTarget.style.color='#64748b'}}>
                    + {c.label}
                  </button>
                ))}
              </div>
            )}

            {genError&&(
              <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 14px',marginTop:14,color:'#dc2626',fontSize:13}}>
                {genError}
              </div>
            )}

            {/* GENERATE BUTTON */}
            {!isComplete&&(
              <div style={{display:'flex',gap:10,alignItems:'center',marginTop:16,marginBottom:24}}>
                <button onClick={generatePreview} disabled={generating}
                  style={{display:'flex',alignItems:'center',gap:7,background:generating?'#e2e8f0':'#1e293b',color:generating?'#94a3b8':'#fff',border:'none',borderRadius:8,padding:'10px 20px',fontSize:14,fontWeight:700,cursor:generating?'not-allowed':'pointer'}}>
                  {generating?<><Loader size={15} style={{animation:'spin 0.8s linear infinite'}}/> Generating...</>:'✨ Generate Tomorrow Preview'}
                </button>
                <span style={{fontSize:11,color:'#94a3b8'}}>Uses today's data to prioritize tomorrow</span>
              </div>
            )}

            {/* TOMORROW PREVIEW */}
            {hasPreview&&(
              <div style={{marginBottom:24}}>
                <SL icon='🌅' label="Tomorrow's Preview"/>
                {journal.aiSummary&&(
                  <div style={{background:'#f8fafc',borderRadius:8,padding:'12px 14px',marginBottom:12,borderLeft:'2px solid #2563eb'}}>
                    <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>AI Day Summary</div>
                    <div style={{fontSize:13,color:'#374151',lineHeight:1.65}}>{journal.aiSummary}</div>
                  </div>
                )}
                {journal.tomorrowPreview?.highlights&&(
                  <div style={{fontSize:14,color:'#0f172a',lineHeight:1.6,marginBottom:14,fontStyle:'italic'}}>{journal.tomorrowPreview.highlights}</div>
                )}
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {(journal.tomorrowPreview?.actToday||[]).map((a,i)=>(
                    <div key={i} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,padding:'14px 16px'}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#1d4ed8',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:4}}>{a.account}</div>
                      <div style={{fontSize:14,fontWeight:700,color:'#0f172a',lineHeight:1.4}}>{a.action}</div>
                      {a.clientFirstAngle&&<div style={{fontSize:12,color:'#3b82f6',fontStyle:'italic',marginTop:5,lineHeight:1.5}}>{a.clientFirstAngle}</div>}
                      {a.suggestedFirstMove&&<div style={{fontSize:12,color:'#64748b',marginTop:6}}>→ {a.suggestedFirstMove}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUGGESTED UPDATES */}
            {journal?.suggestedAccountUpdates?.length>0&&(
              <div style={{marginBottom:24}}>
                <SL icon='📝' label="Suggested Account Updates"/>
                <div style={{fontSize:11,color:'#94a3b8',marginTop:-12,marginBottom:10}}>Reviewable only — not auto-saved to accounts</div>
                <div style={{display:'flex',flexDirection:'column',gap:7}}>
                  {journal.suggestedAccountUpdates.map((u,i)=>(
                    <div key={i} style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'10px 14px'}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#92400e',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:3}}>{u.account}</div>
                      <div style={{fontSize:13,color:'#92400e',lineHeight:1.5}}>{u.update}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* COMPLETE / REOPEN */}
            <div style={{height:1,background:'#f1f5f9',marginBottom:20}}/>
            {!isComplete?(
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <button onClick={()=>upsert({status:'complete',completedAt:new Date().toISOString()})}
                  style={{display:'flex',alignItems:'center',gap:7,background:'#2563eb',color:'#fff',border:'none',borderRadius:8,padding:'10px 22px',fontSize:14,fontWeight:700,cursor:'pointer'}}>
                  <CheckCircle2 size={16}/> Complete Journal
                </button>
                <span style={{fontSize:12,color:'#94a3b8'}}>Mark today as wrapped up.</span>
              </div>
            ):(
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{fontSize:13,color:'#15803d',fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                  <CheckCircle2 size={16}/> Completed {fmtTime(journal.completedAt)}
                </div>
                <button onClick={()=>upsert({status:'draft',completedAt:null})}
                  style={{fontSize:12,color:'#64748b',background:'transparent',border:'1px solid #e5e7eb',borderRadius:7,padding:'5px 12px',cursor:'pointer'}}>
                  Reopen
                </button>
              </div>
            )}
            <div style={{height:60}}/>
          </div>
        </div>
      </div>

      {/* PAST JOURNAL MODAL */}
      {openModal&&(
        <JournalModal
          journal={openModal.journal}
          brief={openModal.brief}
          onClose={()=>setOpenModal(null)}
          onDelete={id=>{deleteJournal(id);setOpenModal(null)}}
        />
      )}
    </div>
  )
}
