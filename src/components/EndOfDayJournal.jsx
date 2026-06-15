import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, BookOpen, CheckCircle2, Circle, ArrowRight, Loader, Trash2, X, Sparkles } from 'lucide-react'
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

const NL = {fontSize:10,fontWeight:700,color:'#64748b',letterSpacing:'0.1em',textTransform:'uppercase',padding:'10px 16px 4px'}

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

const CONFIDENCE_COLORS = {high:'#15803d',medium:'#92400e',low:'#6b7280'}
const CONFIDENCE_BG    = {high:'#f0fdf4',medium:'#fffbeb',low:'#f8fafc'}
const CONFIDENCE_BORDER= {high:'#86efac',medium:'#fde68a',low:'#e5e7eb'}

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
              Journal · {fmtFull(journal.date)}
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
          {journal.aiAnalysis&&(
            <div style={{background:'#f8fafc',borderRadius:8,padding:'12px 14px',borderLeft:'2px solid #2563eb'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>AI Analysis</div>
              <div style={{fontSize:13,color:'#374151',lineHeight:1.65,marginBottom:journal.aiAnalysis.keyWins?.length?8:0}}>{journal.aiAnalysis.summary}</div>
              {journal.aiAnalysis.keyWins?.length>0&&<div style={{fontSize:12,color:'#15803d',marginTop:4}}>✓ {journal.aiAnalysis.keyWins.join(' · ')}</div>}
              {journal.aiAnalysis.keyBlocks?.length>0&&<div style={{fontSize:12,color:'#dc2626',marginTop:4}}>⚠ {journal.aiAnalysis.keyBlocks.join(' · ')}</div>}
            </div>
          )}
          {journal.aiSummary&&!journal.aiAnalysis&&(
            <div style={{background:'#f8fafc',borderRadius:8,padding:'12px 14px',borderLeft:'2px solid #2563eb'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>AI Summary</div>
              <div style={{fontSize:13,color:'#374151',lineHeight:1.65}}>{journal.aiSummary}</div>
            </div>
          )}
          {journal.suggestedUpdates?.length>0&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>Suggested CRM Updates</div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {journal.suggestedUpdates.map(u=>(
                  <div key={u.id} style={{background:'#f8fafc',border:'1px solid #e5e7eb',borderRadius:7,padding:'8px 12px',opacity:u.approved===false?0.45:1}}>
                    <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                          <span style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',color:CONFIDENCE_COLORS[u.confidence]||'#6b7280',background:CONFIDENCE_BG[u.confidence]||'#f8fafc',border:'1px solid',borderColor:CONFIDENCE_BORDER[u.confidence]||'#e5e7eb',borderRadius:4,padding:'1px 5px'}}>{u.confidence}</span>
                          <span style={{fontSize:10,fontWeight:700,color:'#374151',textTransform:'uppercase',letterSpacing:'0.06em'}}>{u.type==='follow-up'?'Follow-up':'Intel Log'}</span>
                          <span style={{fontSize:11,color:'#94a3b8'}}>· {u.account}</span>
                        </div>
                        <div style={{fontSize:12,color:'#0f172a',lineHeight:1.5}}>{u.proposedChange}</div>
                      </div>
                      {u.approved===true&&<span style={{fontSize:11,color:'#15803d',fontWeight:700,flexShrink:0}}>✓ Applied</span>}
                      {u.approved===false&&<span style={{fontSize:11,color:'#94a3b8',flexShrink:0}}>Rejected</span>}
                    </div>
                  </div>
                ))}
              </div>
              {journal.appliedAt&&<div style={{fontSize:11,color:'#15803d',marginTop:6}}>Applied to CRM {fmtTime(journal.appliedAt)}</div>}
            </div>
          )}
          {/* fallback: old-style suggestedAccountUpdates */}
          {!journal.suggestedUpdates?.length&&journal.suggestedAccountUpdates?.length>0&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>Suggested Account Updates</div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {journal.suggestedAccountUpdates.map((u,i)=>(
                  <div key={i} style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:7,padding:'8px 12px'}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#92400e',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:2}}>{u.account}</div>
                    <div style={{fontSize:12,color:'#92400e',lineHeight:1.5}}>{u.update}</div>
                  </div>
                ))}
              </div>
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
  const [analyzing,setAnalyzing]=useState(false)
  const [analyzeError,setAnalyzeError]=useState(null)
  const [applying,setApplying]=useState(false)
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
        aiSummary:'',aiAnalysis:null,suggestedUpdates:[],tomorrowPreview:null,
        suggestedAccountUpdates:[],appliedAt:null,status:'draft',...patch
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

  const analyzeJournal=async()=>{
    const apiKey=data.apiKey||''
    if(!apiKey){setAnalyzeError('No API key configured. Add it in Settings.');return}
    if(!debriefText.trim()&&!todayBrief){setAnalyzeError('Write something in your journal first.');return}
    setAnalyzing(true);setAnalyzeError(null)

    const actToday=todayBrief?.sections?.actToday||[]
    const accounts=data.accounts||[]
    const accountNames=accounts.map(a=>a.name)
    const openFollowUps=accounts.flatMap(a=>(a.followUps||[]).filter(f=>f.status==='Open').map(f=>({account:a.name,task:f.task})))

    const sys=`You are Ledgr, an AI chief of staff for Mike Chiricosta at GuidePoint Security. Analyze Mike's journal entry and extract CRM intelligence.

Return ONLY valid JSON:
{
  "aiAnalysis": {
    "summary": "2-3 sentence day analysis — momentum, client relationships, pipeline movement",
    "keyWins": ["brief win 1", "brief win 2"],
    "keyBlocks": ["brief blocker if any"],
    "momentumScore": 8
  },
  "suggestedUpdates": [
    {
      "type": "follow-up",
      "account": "exact account name from Mike's accounts or closest match",
      "confidence": "high|medium|low",
      "proposedChange": "Specific actionable follow-up task text",
      "sourceExcerpt": "brief quote or paraphrase from journal that triggered this"
    },
    {
      "type": "intel-log",
      "account": "exact account name",
      "confidence": "high|medium|low",
      "proposedChange": "CRM note text to log — specific, fact-based",
      "sourceExcerpt": "brief quote or paraphrase from journal"
    }
  ]
}

Rules:
- suggestedUpdates: 2-6 items max, only when clearly supported by journal text
- Only reference accounts from Mike's account list
- follow-up: actionable task with clear next step
- intel-log: factual note about client situation, decision, or intel heard
- confidence high = explicit mention, medium = implied, low = inferred
- Return empty array if no clear CRM updates are warranted`

    const usr=`Today: ${fmtFull(today)}

Mike's Journal:
${debriefText||'(no text written)'}

Act Today review:
${actToday.map((a,i)=>({account:a.account,action:a.action,status:actionsStatus[i]||'untouched'})).map(r=>`- [${r.status}] ${r.account}: ${r.action}`).join('\n')||'(no brief today)'}

Mike's accounts: ${accountNames.join(', ')||'(none)'}
Open follow-ups: ${openFollowUps.slice(0,10).map(f=>`${f.account}: ${f.task}`).join(', ')||'(none)'}`

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
      const updates=(parsed.suggestedUpdates||[]).map(u=>({...u,id:uid(),approved:null}))
      upsert({aiAnalysis:parsed.aiAnalysis||null,suggestedUpdates:updates,appliedAt:null})
    }catch(err){
      setAnalyzeError(`Analysis failed: ${err.message}`)
    }finally{
      setAnalyzing(false)
    }
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
  }
}

Rules: tomorrowPreview.actToday MAX 3 items. Prioritize deferred > unfinished commitments > renewals > momentum. Every action must have a client-first angle.`

    const usr=`Today: ${fmtFull(today)}.

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
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1500,system:sys,messages:[{role:'user',content:usr}]})
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
      upsert({aiSummary:parsed.aiSummary||'',tomorrowPreview:parsed.tomorrowPreview||null,status:'draft'})
    }catch(err){
      setGenError(`Generation failed: ${err.message}`)
    }finally{
      setGenerating(false)
    }
  }

  const approveUpdate=(updateId,val)=>{
    const j=journals.find(j=>j.date===today)
    if(!j)return
    const updated=(j.suggestedUpdates||[]).map(u=>u.id===updateId?{...u,approved:val}:u)
    upsert({suggestedUpdates:updated})
  }

  const applyApprovedUpdates=()=>{
    const j=journals.find(jj=>jj.date===today)
    if(!j)return
    const approved=(j.suggestedUpdates||[]).filter(u=>u.approved===true)
    if(!approved.length)return
    setApplying(true)
    const now=new Date().toISOString()
    setData(prev=>{
      let accounts=[...(prev.accounts||[])]
      for(const update of approved){
        const idx=accounts.findIndex(a=>a.name===update.account)
        if(idx===-1)continue
        const acct={...accounts[idx]}
        if(update.type==='follow-up'){
          acct.followUps=[...(acct.followUps||[]),{id:uid(),task:update.proposedChange,status:'Open',createdAt:now,source:'journal'}]
        }else if(update.type==='intel-log'){
          acct.intelLog=[...(acct.intelLog||[]),{id:uid(),text:update.proposedChange,date:today,source:'journal'}]
        }
        accounts[idx]=acct
      }
      const updatedJournals=(prev.dailyJournals||[]).map(jj=>
        jj.date===today?{...jj,appliedAt:now,updatedAt:now}:jj
      )
      return{...prev,accounts,dailyJournals:updatedJournals}
    })
    setApplying(false)
  }

  const deleteJournal=(id)=>setData(prev=>({...prev,dailyJournals:(prev.dailyJournals||[]).filter(j=>j.id!==id)}))

  const journal=todayJournal
  const isComplete=journal?.status==='complete'
  const hasPreview=journal?.tomorrowPreview?.actToday?.length>0
  const todayActions=todayBrief?.sections?.actToday||[]
  const suggestedUpdates=journal?.suggestedUpdates||[]
  const pendingUpdates=suggestedUpdates.filter(u=>u.approved===null)
  const approvedCount=suggestedUpdates.filter(u=>u.approved===true).length
  const alreadyApplied=!!journal?.appliedAt

  const navRow=(j)=>{
    const isSel=selectedDate===j.date&&j.date===today
    return(
      <div key={j.date}
        onClick={()=>j.date===today?setSelectedDate(today):setOpenModal({journal:j,brief:briefs.find(b=>b.date===j.date)||null})}
        style={{padding:'8px 12px',cursor:'pointer',borderRadius:6,margin:'1px 8px',background:isSel?'#eff6ff':'transparent',transition:'background 0.1s'}}
        onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='#f1f5f9'}}
        onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background='transparent'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6}}>
          <span style={{fontSize:13,fontWeight:600,color:isSel?'#1d4ed8':'#374151',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fmt(j.date)}</span>
          <span style={{fontSize:10,fontWeight:700,color:j.status==='complete'?'#22c55e':'transparent',flexShrink:0}}>{j.status==='complete'?'✓':''}</span>
        </div>
        {j.aiAnalysis?.summary&&<div style={{fontSize:10,color:'#94a3b8',marginTop:2,lineHeight:1.4,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{j.aiAnalysis.summary.slice(0,80)}</div>}
        {!j.aiAnalysis&&j.aiSummary&&<div style={{fontSize:10,color:'#94a3b8',marginTop:2,lineHeight:1.4,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{j.aiSummary.slice(0,80)}</div>}
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
        <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>Journal</span>
        {isComplete&&<span style={{marginLeft:'auto',fontSize:11,fontWeight:700,color:'#22c55e'}}>✓ Complete</span>}
      </div>

      {/* BODY */}
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* LEFT NAV — secondary date/history panel */}
        <div style={{width:216,flexShrink:0,background:'#fff',display:'flex',flexDirection:'column',borderRight:'1px solid #e5e7eb',boxShadow:'2px 0 6px rgba(0,0,0,0.04)',overflow:'hidden'}}>
          <div style={{flex:1,overflowY:'auto',padding:'4px 0'}}>
            <div style={NL}>Today</div>
            <div onClick={()=>setSelectedDate(today)}
              style={{padding:'8px 12px',cursor:'pointer',borderRadius:6,margin:'1px 8px',background:selectedDate===today?'#eff6ff':'transparent',transition:'background 0.1s'}}
              onMouseEnter={e=>{if(selectedDate!==today)e.currentTarget.style.background='#f1f5f9'}}
              onMouseLeave={e=>{if(selectedDate!==today)e.currentTarget.style.background='transparent'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6}}>
                <span style={{fontSize:13,fontWeight:600,color:selectedDate===today?'#1d4ed8':'#1e293b',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fmt(today)}</span>
                {isComplete&&<span style={{fontSize:10,fontWeight:700,color:'#22c55e',flexShrink:0}}>✓</span>}
                {!isComplete&&journal&&<span style={{fontSize:10,color:'#f59e0b',fontWeight:600,flexShrink:0}}>draft</span>}
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
            <div style={{fontSize:13,color:'#64748b',marginBottom:20}}>Journal</div>
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
              style={{width:'100%',boxSizing:'border-box',minHeight:130,padding:'12px 14px',border:'1px solid #d1d5db',borderRadius:9,fontSize:14,color:'#0f172a',lineHeight:1.65,resize:'vertical',fontFamily:'inherit',outline:'none',background:isComplete?'#f8fafc':'#fff',boxShadow:'0 1px 2px rgba(0,0,0,0.04)',opacity:isComplete?0.7:1}}
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

            {/* ANALYZE BUTTON */}
            {!isComplete&&(
              <div style={{display:'flex',gap:10,alignItems:'center',marginTop:16}}>
                <button onClick={analyzeJournal} disabled={analyzing||!debriefText.trim()}
                  style={{display:'flex',alignItems:'center',gap:7,background:analyzing||!debriefText.trim()?'#f1f5f9':'#7c3aed',color:analyzing||!debriefText.trim()?'#94a3b8':'#fff',border:'none',borderRadius:8,padding:'9px 18px',fontSize:13,fontWeight:700,cursor:analyzing||!debriefText.trim()?'not-allowed':'pointer'}}>
                  {analyzing?<><Loader size={14} style={{animation:'spin 0.8s linear infinite'}}/> Analyzing...</>:<><Sparkles size={14}/> Analyze Journal & Extract CRM Updates</>}
                </button>
              </div>
            )}
            {analyzeError&&(
              <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 14px',marginTop:10,color:'#dc2626',fontSize:13}}>
                {analyzeError}
              </div>
            )}

            {/* AI ANALYSIS */}
            {journal?.aiAnalysis&&(
              <div style={{marginTop:20,marginBottom:4}}>
                <SL icon='🧠' label="AI Analysis"/>
                <div style={{background:'#f8fafc',borderRadius:10,padding:'14px 16px',borderLeft:'3px solid #7c3aed',marginBottom:14}}>
                  <div style={{fontSize:13,color:'#374151',lineHeight:1.7,marginBottom:journal.aiAnalysis.keyWins?.length?10:0}}>{journal.aiAnalysis.summary}</div>
                  {journal.aiAnalysis.keyWins?.length>0&&(
                    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:6}}>
                      {journal.aiAnalysis.keyWins.map((w,i)=>(
                        <span key={i} style={{fontSize:11,fontWeight:600,color:'#15803d',background:'#f0fdf4',border:'1px solid #86efac',borderRadius:999,padding:'2px 10px'}}>✓ {w}</span>
                      ))}
                    </div>
                  )}
                  {journal.aiAnalysis.keyBlocks?.length>0&&(
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {journal.aiAnalysis.keyBlocks.map((b,i)=>(
                        <span key={i} style={{fontSize:11,fontWeight:600,color:'#dc2626',background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:999,padding:'2px 10px'}}>⚠ {b}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUGGESTED CRM UPDATES */}
            {suggestedUpdates.length>0&&(
              <div style={{marginBottom:24}}>
                <SL icon='📋' label="Suggested CRM Updates"/>
                <div style={{fontSize:12,color:'#94a3b8',marginTop:-12,marginBottom:12}}>Review and approve updates to apply to your accounts.</div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {suggestedUpdates.map(u=>{
                    const confColor=CONFIDENCE_COLORS[u.confidence]||'#6b7280'
                    const confBg=CONFIDENCE_BG[u.confidence]||'#f8fafc'
                    const confBorder=CONFIDENCE_BORDER[u.confidence]||'#e5e7eb'
                    const approved=u.approved===true
                    const rejected=u.approved===false
                    return(
                      <div key={u.id} style={{background:approved?'#f0fdf4':rejected?'#f8fafc':'#fff',border:`1px solid ${approved?'#86efac':rejected?'#e5e7eb':'#d1d5db'}`,borderRadius:10,padding:'12px 14px',opacity:rejected?0.5:1,transition:'all 0.15s'}}>
                        <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6,flexWrap:'wrap'}}>
                              <span style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',color:confColor,background:confBg,border:'1px solid',borderColor:confBorder,borderRadius:4,padding:'1px 6px'}}>{u.confidence}</span>
                              <span style={{fontSize:10,fontWeight:700,color:'#0f172a',textTransform:'uppercase',letterSpacing:'0.06em',background:u.type==='follow-up'?'#eff6ff':'#faf5ff',border:'1px solid',borderColor:u.type==='follow-up'?'#bfdbfe':'#ddd6fe',borderRadius:4,padding:'1px 6px',color:u.type==='follow-up'?'#1d4ed8':'#7c3aed'}}>{u.type==='follow-up'?'Follow-up':'Intel Log'}</span>
                              <span style={{fontSize:12,color:'#374151',fontWeight:600}}>{u.account}</span>
                            </div>
                            <div style={{fontSize:13,color:'#0f172a',lineHeight:1.5,marginBottom:u.sourceExcerpt?6:0}}>{u.proposedChange}</div>
                            {u.sourceExcerpt&&<div style={{fontSize:11,color:'#94a3b8',fontStyle:'italic',borderLeft:'2px solid #e5e7eb',paddingLeft:8}}>"{u.sourceExcerpt}"</div>}
                          </div>
                          {!isComplete&&!alreadyApplied&&(
                            <div style={{display:'flex',gap:6,flexShrink:0}}>
                              <button onClick={()=>approveUpdate(u.id,approved?null:true)}
                                style={{padding:'5px 12px',background:approved?'#15803d':'#f1f5f9',color:approved?'#fff':'#374151',border:'1px solid',borderColor:approved?'#15803d':'#e5e7eb',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                                {approved?'✓ Approved':'Approve'}
                              </button>
                              {!approved&&(
                                <button onClick={()=>approveUpdate(u.id,rejected?null:false)}
                                  style={{padding:'5px 10px',background:rejected?'#fee2e2':'#f8fafc',color:rejected?'#dc2626':'#94a3b8',border:'1px solid',borderColor:rejected?'#fca5a5':'#e5e7eb',borderRadius:7,fontSize:12,cursor:'pointer'}}>
                                  ✕
                                </button>
                              )}
                            </div>
                          )}
                          {alreadyApplied&&approved&&<span style={{fontSize:11,color:'#15803d',fontWeight:700,flexShrink:0}}>✓ Applied</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {approvedCount>0&&!alreadyApplied&&!isComplete&&(
                  <div style={{marginTop:14,display:'flex',alignItems:'center',gap:10}}>
                    <button onClick={applyApprovedUpdates} disabled={applying}
                      style={{display:'flex',alignItems:'center',gap:7,background:applying?'#f1f5f9':'#0f172a',color:applying?'#94a3b8':'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontSize:13,fontWeight:700,cursor:applying?'not-allowed':'pointer'}}>
                      {applying?<><Loader size={14} style={{animation:'spin 0.8s linear infinite'}}/> Applying...</>:`Apply ${approvedCount} Approved Update${approvedCount!==1?'s':''} to CRM`}
                    </button>
                    <span style={{fontSize:11,color:'#94a3b8'}}>Writes follow-ups and intel log entries to accounts</span>
                  </div>
                )}
                {alreadyApplied&&(
                  <div style={{marginTop:10,fontSize:12,color:'#15803d',display:'flex',alignItems:'center',gap:5}}>
                    <CheckCircle2 size={13}/> Applied to CRM at {fmtTime(journal.appliedAt)}
                  </div>
                )}
                {pendingUpdates.length>0&&!alreadyApplied&&<div style={{marginTop:8,fontSize:11,color:'#94a3b8'}}>{pendingUpdates.length} update{pendingUpdates.length!==1?'s':''} pending review</div>}
              </div>
            )}

            {genError&&(
              <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 14px',marginTop:14,color:'#dc2626',fontSize:13}}>
                {genError}
              </div>
            )}

            {/* GENERATE TOMORROW PREVIEW */}
            {!isComplete&&(
              <div style={{display:'flex',gap:10,alignItems:'center',marginTop:20,marginBottom:24,paddingTop:suggestedUpdates.length?16:0,borderTop:suggestedUpdates.length?'1px solid #f1f5f9':'none'}}>
                <button onClick={generatePreview} disabled={generating}
                  style={{display:'flex',alignItems:'center',gap:7,background:generating?'#e2e8f0':'#1e293b',color:generating?'#94a3b8':'#fff',border:'none',borderRadius:8,padding:'10px 20px',fontSize:14,fontWeight:700,cursor:generating?'not-allowed':'pointer'}}>
                  {generating?<><Loader size={15} style={{animation:'spin 0.8s linear infinite'}}/> Generating...</>:'🌅 Generate Tomorrow Preview'}
                </button>
                <span style={{fontSize:11,color:'#94a3b8'}}>Prioritizes tomorrow from today's data</span>
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
