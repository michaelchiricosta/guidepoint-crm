import { useState, useEffect } from 'react'
import { Clock, Share2, Zap } from 'lucide-react'
import { S, PC } from '../theme.js'
import { uid, fmtDate, daysUntil, sendToAppleReminders } from '../utils.js'
import { saveActionBrief } from '../supabase.js'
import { Btn, Field, Modal } from './UI.jsx'

// ── Claude API helper (same pattern as TechStack.jsx / IntelLog.jsx) ───────────
const callClaudeWithRetry = async (body, apiKey, maxRetries=3) => {
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
    if (overloaded && attempt<maxRetries-1) {
      await new Promise(r=>setTimeout(r,Math.pow(2,attempt)*2000))
      continue
    }
    if (overloaded) throw new Error('OVERLOADED')
    return {res,data}
  }
  throw new Error('OVERLOADED')
}


// ── Build account context string for AI prompt ─────────────────────────────────
const buildActionContext = (fu, acct, whitespaceAccounts) => {
  const todayStr = new Date().toISOString().split('T')[0]
  const dDue = fu.dueDate ? Math.ceil((new Date(fu.dueDate+'T12:00:00') - new Date(todayStr+'T12:00:00')) / 86400000) : null
  const daysOverdue = dDue !== null && dDue < 0 ? Math.abs(dDue) : 0

  // Intel log sorted ascending, split at action createdAt
  const allIntel = [...(acct.intelLog||[])].sort((a,b)=>(a.date||'').localeCompare(b.date||''))
  const createdAt = fu.createdAt || null
  const intelBefore = createdAt ? allIntel.filter(e=>e.date<=createdAt) : allIntel
  const intelAfter  = createdAt ? allIntel.filter(e=>e.date>createdAt)  : []

  const fmtEntry = e => {
    const parts = [`[${e.date||'?'}]`]
    if (e.type && e.type!=='Note') parts.push(`(${e.type})`)
    if (e.participants) parts.push(`w/ ${e.participants}`)
    const body = [e.summary, ...(e.insights||[]).map(i=>`insight: ${i}`), ...(e.risks||[]).map(r=>`risk: ${r}`), ...(e.opportunities||[]).map(o=>`opp: ${o}`)].filter(Boolean).join(' | ')
    return `${parts.join(' ')} ${body}`.trim()
  }

  const contacts = (acct.contacts||[]).map(c=>
    `  • ${c.name} (${c.title||'?'}) — ${c.relStatus||'?'} / ${c.sentiment||'neutral'}${c.notes?` — ${c.notes.slice(0,120)}`:''}`.trim()
  ).join('\n')

  const projects = (acct.projects||[])
    .filter(p=>p.status!=='Lost')
    .map(p=>{
      const stage = p.timeline?.find(s=>s.status==='current')?.stage || p.timeline?.filter(s=>s.status==='completed').slice(-1)[0]?.stage || '?'
      return `  • ${p.name} [${p.status}${stage&&stage!=='?'?` / ${stage}`:''}]${p.notes?` — ${p.notes.slice(0,100)}`:''}`.trim()
    }).join('\n')

  const wsLine = (whitespaceAccounts||[])
    .filter(w=>w.name)
    .slice(0,5)
    .map(w=>`  • ${w.name}${w.priority?` (${w.priority})`:''}`).join('\n')

  const intelSection = (entries, label) => entries.length
    ? `\n${label}:\n${entries.slice(-10).map(fmtEntry).join('\n')}`
    : ''

  const notesText = typeof acct.notes === 'string'
    ? acct.notes.slice(0,600)
    : Array.isArray(acct.notes)
      ? acct.notes.slice(0,5).map(n=>n.text||'').join(' | ').slice(0,600)
      : ''

  return `ACTION:
  Task: ${fu.task}
  Priority: ${fu.priority}
  Due Date: ${fu.dueDate||'none'} ${daysOverdue>0?`(${daysOverdue} days overdue)`:''}
  Contact: ${fu.contact||'not specified'}
  Notes: ${fu.context||'none'}
  Created: ${fu.createdAt||'unknown'}

ACCOUNT: ${acct.name}
  Industry: ${acct.industry||'?'}  HQ: ${acct.hq||'?'}
  Relationship: ${acct.relationship||'?'}  Last Contact: ${acct.lastContact||'?'}
  Notes: ${notesText||'none'}

CONTACTS:
${contacts||'  none'}

ACTIVE PROJECTS:
${projects||'  none'}
${intelSection(intelBefore, 'INTEL LOG (at time action was created)')}
${intelSection(intelAfter, 'INTEL LOG (since action was created)')}
${wsLine?`\nWHITESPACE ACCOUNTS:\n${wsLine}`:''}`
}

// ── AI prompt ─────────────────────────────────────────────────────────────────
const buildPrompt = (fu, acct, whitespaceAccounts) => {
  const ctx = buildActionContext(fu, acct, whitespaceAccounts)
  return `You are an AI assistant for a cybersecurity sales rep named Mike at GuidePoint Security. Generate a complete Action Brief for this action item.

${ctx}

Return ONLY valid JSON with no markdown code fences or extra text:
{
  "quickContext": "One sentence. Why this action matters right now — the specific trigger, deal context, or relationship moment that created it.",
  "progressSinceCreation": {
    "completed": ["Specific things that have happened since this action was created, based on intel entries. Use real names and details. Empty array if nothing."],
    "outstanding": ["Specific things still unresolved or pending. Be concrete. Empty array if nothing."]
  },
  "recommendedNextAction": "Start with a strong verb. Be specific — name the person, channel, or deadline. No vague suggestions.",
  "confidenceScore": 85,
  "suggestedRecipients": {
    "to": ["Name (Title) — why they are primary"],
    "cc": ["Name (Title) — why they should be aware"],
    "internalResources": ["Name (Role) — internal GuidePoint resource to loop in"]
  },
  "suggestedSubjectLine": "Concise, professional subject. Reference the deal or account. No filler.",
  "draftEmail": "Subject: [subject line]\\n\\nHi [first name],\\n\\n[3-5 lines max. Conversational, direct, human. No filler opener. No marketing language. One clear CTA. Sign off: Best, Mike]",
  "recommendedAssets": ["Asset name — one sentence on why it's relevant to this action"],
  "meetingRecommendation": {
    "recommended": true,
    "title": "specific meeting title",
    "duration": "30 minutes",
    "attendees": ["Name (Title) — why they should attend"],
    "agenda": ["Opening / set context (5 min)", "specific topic 2", "specific topic 3", "Next steps / owners (5 min)"]
  },
  "actionHealth": {
    "status": "Healthy",
    "reason": "Short explanation — reference specific data points"
  }
}

Rules:
- actionHealth.status must be exactly one of: "Healthy", "Needs Attention", "At Risk", "Critical"
- Base health on: days overdue (0=Healthy, 1-3=Needs Attention, 4-7=At Risk, 8+=Critical), priority, last contact date, project status
- confidenceScore: integer 0-100 reflecting certainty of the recommended next action
- draftEmail: Write in Mike's style — short sentences, conversational, direct. No "Hope this finds you well", no "I wanted to reach out", no buzzwords ("leverage", "synergize", "solutions"). One clear CTA. Use \\n for line breaks.
- progressSinceCreation.completed: only list things visible in INTEL LOG since action was created — not assumptions
- recommendedAssets: array of strings, max 4 items specific to account's tech interests and active projects — can be empty array
- meetingRecommendation.recommended: set to false and use empty arrays/strings if a meeting is not clearly warranted
- suggestedRecipients.internalResources: can be empty array if no GuidePoint resources are needed
- Keep every string under 150 characters except draftEmail
- All arrays can be empty if nothing specific is known`
}

export default function Actions({acct, setAcct, apiKey, whitespaceAccounts}) {
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
  const [expandedId,setExpandedId] = useState(null)
  const [generatingId,setGeneratingId] = useState(null)
  const [genError,setGenError] = useState(null)
  const blank={id:'',contact:'',task:'',priority:'High',dueDate:'',status:'Open',context:''}
  const [form,setForm] = useState(blank)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))

  const toggle=id=>setAcct(p=>({...p,followUps:p.followUps.map(fu=>fu.id===id?{...fu,status:fu.status==='Open'?'Done':'Open'}:fu)}))
  const save=()=>{
    if(!form.task)return
    const now = new Date().toISOString().split('T')[0]
    if(form.id) setAcct(p=>({...p,followUps:p.followUps.map(fu=>fu.id===form.id?form:fu)}))
    else setAcct(p=>({...p,followUps:[...p.followUps,{...form,id:uid(),createdAt:now}]}))
    setShowAdd(false);setForm(blank)
  }

  // ── AI generation ────────────────────────────────────────────────────────────
  const generateIntel = async (fu) => {
    if (!apiKey) { setGenError('Add your Anthropic API key in Settings first.'); return }
    setGenError(null)
    setGeneratingId(fu.id)
    try {
      const prompt = buildPrompt(fu, acct, whitespaceAccounts)
      const {data:result} = await callClaudeWithRetry(
        {model:'claude-sonnet-4-6', max_tokens:1700, messages:[{role:'user',content:prompt}]},
        apiKey
      )
      const raw = result?.content?.[0]?.text || ''
      let intel = null
      try { intel = JSON.parse(raw) } catch {
        const m = raw.match(/\{[\s\S]*\}/)
        if (m) { try { intel = JSON.parse(m[0]) } catch { /* ignore */ } }
      }
      if (intel) {
        intel.generatedAt = new Date().toISOString()
        setAcct(p=>({...p,followUps:p.followUps.map(x=>x.id===fu.id?{...x,aiIntel:intel}:x)}))
        saveActionBrief(acct.id, fu.id, intel)
      } else {
        setGenError('AI returned an unexpected response. Please try again.')
      }
    } catch(err) {
      setGenError(err.message==='OVERLOADED'?'API is busy — please try again in a moment.':'Generation failed. Please try again.')
    } finally {
      setGeneratingId(null)
    }
  }

  const snoozeAction = (option) => {
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
  const overdueFUs = allOpen.filter(f=>f.dueDate&&f.dueDate<todayStr).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))
  const dueTodayFUs = allOpen.filter(f=>f.dueDate===todayStr).sort((a,b)=>['Critical','High','Medium','Low'].indexOf(a.priority)-['Critical','High','Medium','Low'].indexOf(b.priority))
  const futureFUs = allOpen.filter(f=>!f.dueDate||f.dueDate>todayStr)
  const sortedFuture = [...futureFUs].sort((a,b)=>{
    if(openSort==='duedate'){if(!a.dueDate&&!b.dueDate)return 0;if(!a.dueDate)return 1;if(!b.dueDate)return -1;return a.dueDate.localeCompare(b.dueDate)}
    if(openSort==='contact') return(a.contact||'').localeCompare(b.contact||'')
    return['Critical','High','Medium','Low'].indexOf(a.priority)-['Critical','High','Medium','Low'].indexOf(b.priority)
  })
  const exitSel = () => { setSelMode(false); setSelFUs(new Set()); setBatchDateOpen(false); setBatchPriOpen(false) }
  const toggleSel = id => setSelFUs(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})
  const applyBatchDate = () => { if(!batchDate||!selFUs.size)return; setAcct(p=>({...p,followUps:p.followUps.map(fu=>selFUs.has(fu.id)?{...fu,dueDate:batchDate}:fu)})); setBatchDate(''); setBatchDateOpen(false) }
  const applyBatchPri = pri => { setAcct(p=>({...p,followUps:p.followUps.map(fu=>selFUs.has(fu.id)?{...fu,priority:pri}:fu)})); setBatchPriOpen(false) }
  const applyBatchComplete = () => { setAcct(p=>({...p,followUps:p.followUps.map(fu=>selFUs.has(fu.id)?{...fu,status:'Done'}:fu)})); exitSel() }

  // ── AI panel renderer ────────────────────────────────────────────────────────
  const renderAIPanel = (fu) => {
    const intel = fu.aiIntel
    const isGenerating = generatingId === fu.id

    // Handle both old ({text,confidence}) and new (string) recommendedNextAction
    const nextActionText = intel?.recommendedNextAction
      ? (typeof intel.recommendedNextAction === 'string' ? intel.recommendedNextAction : intel.recommendedNextAction.text)
      : null
    const confidence = intel?.confidenceScore != null
      ? intel.confidenceScore
      : (intel?.recommendedNextAction?.confidence != null ? Math.round(intel.recommendedNextAction.confidence * 100) : null)

    // Handle both old ({subject,to,cc,body}) and new (string) draftEmail
    const draftEmailText = intel?.draftEmail
      ? (typeof intel.draftEmail === 'string'
          ? intel.draftEmail
          : `Subject: ${intel.draftEmail.subject}\nTo: ${(intel.draftEmail.to||[]).join(', ')}\n\n${intel.draftEmail.body}`)
      : null

    return (
      <div style={{background:S.isLight?'#F8FAFE':'#1a1f2e',borderTop:`1px solid ${S.isLight?'#E8F0FE':'#2d3748'}`,borderBottom:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`,padding:'14px 16px 16px'}}>

        {/* Header row */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:10,fontWeight:700,color:'#007AFF',letterSpacing:'0.08em',textTransform:'uppercase'}}>✦ AI Intelligence</span>
            {intel?.generatedAt&&(
              <span style={{fontSize:9,color:'#9CA3AF'}}>{new Date(intel.generatedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
            )}
          </div>
          <button
            onClick={()=>generateIntel(fu)}
            disabled={isGenerating||!apiKey}
            style={{display:'inline-flex',alignItems:'center',gap:5,padding:'5px 12px',background:isGenerating?'#F3F4F6':apiKey?'#007AFF':'#F3F4F6',border:'none',borderRadius:6,color:isGenerating||!apiKey?'#9CA3AF':'#fff',fontSize:11,fontWeight:600,cursor:isGenerating||!apiKey?'default':'pointer',transition:'background 0.15s'}}
          >
            <Zap size={11}/>
            {isGenerating?'Generating…':intel?'Refresh Brief':'Generate Brief'}
          </button>
        </div>

        {!apiKey&&<div style={{fontSize:11,color:'#d97706',background:'#fef3c7',border:'1px solid #fde68a',borderRadius:6,padding:'7px 10px',marginBottom:10}}>Add your Anthropic API key in Settings to enable AI analysis.</div>}
        {genError&&expandedId===fu.id&&<div style={{fontSize:11,color:'#dc2626',background:'#fee2e2',border:'1px solid #fecaca',borderRadius:6,padding:'7px 10px',marginBottom:10}}>{genError}</div>}

        {isGenerating&&(
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {[1,2,3,4,5,6].map(i=>(
              <div key={i} style={{height:52,background:S.isLight?'#FFFFFF':'#222736',border:`1px solid ${S.isLight?'#EEEFF2':S.bdr}`,borderRadius:8,overflow:'hidden',position:'relative'}}>
                <div style={{position:'absolute',inset:0,background:`linear-gradient(90deg,transparent 0%,${S.isLight?'#F0F7FF':'#2a3247'} 50%,transparent 100%)`,animation:'shimmer 1.2s infinite'}}/>
              </div>
            ))}
            <style>{`@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`}</style>
          </div>
        )}

        {!isGenerating&&intel&&(
          <div style={{display:'flex',flexDirection:'column',gap:8}}>

            {/* Quick Context */}
            {intel.quickContext&&(
              <div style={{background:S.isLight?'#FFFFFF':S.surf,border:`1px solid ${S.isLight?'#EEEFF2':S.bdr}`,borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>📋 Quick Context</div>
                <div style={{fontSize:12,color:S.isLight?'#374151':S.txt,lineHeight:1.55}}>{intel.quickContext}</div>
              </div>
            )}

            {/* Row 2: Progress Since Creation */}
            {(intel.progressSinceCreation?.completed?.length>0||intel.progressSinceCreation?.outstanding?.length>0)&&(
              <div style={{background:S.isLight?'#FFFFFF':S.surf,border:`1px solid ${S.isLight?'#EEEFF2':S.bdr}`,borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>📈 Progress Since Creation</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div>
                    <div style={{fontSize:10,fontWeight:600,color:'#16a34a',marginBottom:4}}>COMPLETED</div>
                    {intel.progressSinceCreation.completed?.length>0
                      ? intel.progressSinceCreation.completed.map((item,i)=>(
                          <div key={i} style={{display:'flex',gap:5,fontSize:11,color:S.isLight?'#374151':S.txt,lineHeight:1.5,marginBottom:3}}>
                            <span style={{color:'#16a34a',flexShrink:0}}>✓</span><span>{item}</span>
                          </div>
                        ))
                      : <div style={{fontSize:11,color:'#9CA3AF',fontStyle:'italic'}}>Nothing logged yet</div>
                    }
                  </div>
                  <div>
                    <div style={{fontSize:10,fontWeight:600,color:'#d97706',marginBottom:4}}>OUTSTANDING</div>
                    {intel.progressSinceCreation.outstanding?.length>0
                      ? intel.progressSinceCreation.outstanding.map((item,i)=>(
                          <div key={i} style={{display:'flex',gap:5,fontSize:11,color:S.isLight?'#374151':S.txt,lineHeight:1.5,marginBottom:3}}>
                            <span style={{color:'#d97706',flexShrink:0}}>●</span><span>{item}</span>
                          </div>
                        ))
                      : <div style={{fontSize:11,color:'#9CA3AF',fontStyle:'italic'}}>None identified</div>
                    }
                  </div>
                </div>
              </div>
            )}

            {/* Row 3: Recommended Next Action */}
            {nextActionText&&(
              <div style={{background:S.isLight?'#FFFFFF':S.surf,border:`2px solid ${'#007AFF'}22`,borderLeft:`3px solid #007AFF`,borderRadius:'0 8px 8px 0',padding:'10px 12px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#007AFF',textTransform:'uppercase',letterSpacing:'0.06em'}}>⚡ Recommended Next Action</div>
                  {confidence!=null&&(
                    <span style={{fontSize:10,fontWeight:600,color:'#9CA3AF',background:S.isLight?'#F3F4F6':'#2d3748',borderRadius:999,padding:'1px 7px'}}>
                      {confidence}% confidence
                    </span>
                  )}
                </div>
                <div style={{fontSize:13,fontWeight:600,color:S.isLight?'#111827':S.txt,lineHeight:1.5}}>{nextActionText}</div>
              </div>
            )}

            {/* Suggested Recipients */}
            {(intel.suggestedRecipients?.to?.length>0||intel.suggestedRecipients?.cc?.length>0||(intel.suggestedRecipients?.internalResources||intel.suggestedRecipients?.internal||[]).length>0)&&(
              <div style={{background:S.isLight?'#FFFFFF':S.surf,border:`1px solid ${S.isLight?'#EEEFF2':S.bdr}`,borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>👥 Suggested Recipients</div>
                <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
                  {[
                    {key:'to',label:'TO',color:'#007AFF'},
                    {key:'cc',label:'CC',color:'#6B7280'},
                    {key:'internalResources',label:'INTERNAL',color:'#8B5CF6'},
                  ].map(({key,label,color})=>{
                    const list = key==='internalResources'
                      ? (intel.suggestedRecipients.internalResources||intel.suggestedRecipients.internal||[])
                      : (intel.suggestedRecipients[key]||[])
                    return list.length>0&&(
                      <div key={key}>
                        <span style={{fontSize:9,fontWeight:700,color,letterSpacing:'0.08em'}}>{label} </span>
                        {list.map((r,i)=>(
                          <div key={i} style={{fontSize:11,color:S.isLight?'#374151':S.txt,lineHeight:1.5,paddingLeft:8}}>{r}</div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Row 5: Draft Email */}
            {draftEmailText&&(
              <div style={{background:S.isLight?'#FFFFFF':S.surf,border:`1px solid ${S.isLight?'#EEEFF2':S.bdr}`,borderRadius:8,padding:'10px 12px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.06em'}}>✉️ Draft Email</div>
                  <button
                    onClick={()=>navigator.clipboard?.writeText(draftEmailText)}
                    style={{fontSize:10,color:'#16a34a',background:'#dcfce7',border:'1px solid #bbf7d0',borderRadius:5,padding:'3px 8px',cursor:'pointer',fontWeight:600}}>Copy Email</button>
                </div>
                <div style={{fontSize:12,color:S.isLight?'#374151':S.txt,lineHeight:1.75,whiteSpace:'pre-line',background:S.isLight?'#F8FAFC':'#222736',borderRadius:6,padding:'10px 12px'}}>{draftEmailText}</div>
              </div>
            )}

            {/* Recommended Assets */}
            {intel.recommendedAssets?.length>0&&(
              <div style={{background:S.isLight?'#FFFFFF':S.surf,border:`1px solid ${S.isLight?'#EEEFF2':S.bdr}`,borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>📎 Recommended Assets</div>
                <div style={{display:'flex',flexDirection:'column',gap:5}}>
                  {intel.recommendedAssets.map((asset,i)=>{
                    if (typeof asset === 'string') {
                      return <div key={i} style={{display:'flex',gap:6,fontSize:11,color:S.isLight?'#374151':S.txt,lineHeight:1.5}}><span style={{color:'#007AFF',flexShrink:0}}>·</span><span>{asset}</span></div>
                    }
                    const typeColors={'Case Study':{c:'#15803d',bg:'#dcfce7'},'Battle Card':{c:'#dc2626',bg:'#fee2e2'},'Solution Brief':{c:'#007AFF',bg:'#EBF4FF'},'ROI Calculator':{c:'#7c3aed',bg:'#ede9fe'},'Demo Script':{c:'#d97706',bg:'#fef3c7'},'Reference Call':{c:'#0891b2',bg:'#e0f2fe'}}
                    const tc=typeColors[asset.type]||{c:'#6B7280',bg:'#F9FAFB'}
                    return(
                      <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8}}>
                        {asset.type&&<span style={{fontSize:9,fontWeight:700,color:tc.c,background:tc.bg,borderRadius:999,padding:'2px 7px',whiteSpace:'nowrap',flexShrink:0,marginTop:1}}>{asset.type}</span>}
                        <div style={{flex:1,minWidth:0}}>
                          {asset.title&&<div style={{fontSize:12,fontWeight:600,color:S.isLight?'#111827':S.txt,lineHeight:1.4}}>{asset.title}</div>}
                          {asset.rationale&&<div style={{fontSize:11,color:S.isLight?'#6B7280':S.muted,lineHeight:1.4,marginTop:1}}>{asset.rationale}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        )}

        {!isGenerating&&!intel&&apiKey&&(
          <div style={{textAlign:'center',padding:'20px 0',color:'#9CA3AF',fontSize:12}}>
            Click <strong style={{color:'#007AFF'}}>Generate Brief</strong> to generate an AI Action Brief for this action.
          </div>
        )}
      </div>
    )
  }

  // ── Action card renderer ─────────────────────────────────────────────────────
  const renderAction = (fu, extraBadge=null) => {
    const p=PC[fu.priority]||PC.Low
    const dDue=fu.dueDate?daysUntil(fu.dueDate):null
    const dueDateColor=dDue===null?S.muted:dDue<0?PC.Critical.c:p.c
    const isSelected=selMode&&selFUs.has(fu.id)
    const isExpanded=expandedId===fu.id
    return (
      <div key={fu.id}>
        <div
          style={{display:'flex',gap:12,padding:'13px 16px',background:isSelected?'#EBF4FF':S.surf,borderBottom:`1px solid ${isExpanded?'transparent':(S.isLight?'#F9FAFB':S.bdr)}`,alignItems:'flex-start',transition:'background 0.12s'}}
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
            <button
              onClick={()=>setExpandedId(isExpanded?null:fu.id)}
              title={isExpanded?'Hide AI details':'Show AI details'}
              style={{display:'inline-flex',alignItems:'center',gap:3,background:'transparent',border:`1px solid ${isExpanded?'#007AFF':'#EEEFF2'}`,color:isExpanded?'#007AFF':'#9CA3AF',cursor:'pointer',fontSize:11,padding:'3px 7px',borderRadius:6,transition:'all 0.12s',flexShrink:0,lineHeight:1,fontWeight:600}}
              onMouseEnter={e=>{e.currentTarget.style.color='#007AFF';e.currentTarget.style.borderColor='#007AFF'}}
              onMouseLeave={e=>{e.currentTarget.style.color=isExpanded?'#007AFF':'#9CA3AF';e.currentTarget.style.borderColor=isExpanded?'#007AFF':'#EEEFF2'}}>
              <Zap size={10}/>{isExpanded?'▾':'▸'}
            </button>
          </div>
        </div>
        {isExpanded&&renderAIPanel(fu)}
      </div>
    )
  }

  return (
    <div>
      {fuSnoozeToast&&<div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'rgba(34,197,94,0.92)',color:'#fff',padding:'9px 22px',borderRadius:8,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:'0 4px 16px rgba(0,0,0,0.35)',pointerEvents:'none',display:'flex',alignItems:'center',gap:7}}><Clock size={14}/> Snoozed!</div>}
      {remindersToast&&<div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'rgba(34,197,94,0.92)',color:'#fff',padding:'9px 22px',borderRadius:8,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:'0 4px 16px rgba(0,0,0,0.35)',pointerEvents:'none',display:'flex',alignItems:'center',gap:7}}><Share2 size={14}/> Sending to Apple Reminders...</div>}

      {/* TODAY */}
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
            <div><div style={{fontWeight:600,fontSize:13}}>All clear today</div><div style={{fontSize:11,color:S.muted,marginTop:1}}>No actions due or overdue</div></div>
          </div>
          :<div>
            {overdueFUs.map(fu=>{
              const d=Math.round((new Date()-new Date(fu.dueDate+'T12:00:00'))/86400000)
              return renderAction(fu,<span style={{fontSize:10,fontWeight:600,color:PC.Critical.c,background:PC.Critical.b,borderRadius:999,padding:'1px 7px',whiteSpace:'nowrap'}}>{d}d overdue</span>)
            })}
            {dueTodayFUs.map(fu=>renderAction(fu,<span style={{fontSize:10,fontWeight:600,color:PC.High.c,background:PC.High.b,borderRadius:999,padding:'1px 7px',whiteSpace:'nowrap'}}>Due Today</span>))}
          </div>
        }
      </div>

      {/* UPCOMING */}
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
            {!selMode&&<button onClick={()=>{setForm(blank);setShowAdd(true)}} style={{fontSize:12,color:'#007AFF',background:'#EBF4FF',border:'1px solid #bfdbfe',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>+ Add Action</button>}
          </div>
        </div>

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
          ?<div style={{fontSize:12,color:S.muted,padding:'20px 16px',textAlign:'center'}}>No upcoming actions. Click + Add Action to create one.</div>
          :<div>{sortedFuture.map(fu=>renderAction(fu))}</div>
        )}
      </div>

      {/* COMPLETED */}
      <div style={{background:S.surf,borderRadius:12,border:`1px solid ${'#EEEFF2'}`,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',overflow:'hidden'}}>
        <div style={{padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div onClick={()=>setShowCompleted(v=>!v)} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',userSelect:'none'}}>
            <span style={{fontSize:10,color:S.muted}}>{showCompleted?'▼':'▶'}</span>
            <span style={{fontSize:11,fontWeight:800,color:S.muted,letterSpacing:'0.08em',textTransform:'uppercase'}}>Completed</span>
            <span style={{fontSize:11,fontWeight:600,color:S.muted,background:S.surf2,borderRadius:999,padding:'1px 8px'}}>{done.length}</span>
          </div>
          {done.length>0&&<button onClick={()=>{if(window.confirm(`Delete all ${done.length} completed actions?`))setAcct(p=>({...p,followUps:p.followUps.filter(fu=>fu.status!=='Done')}))}} style={{fontSize:11,color:S.isLight?'#dc2626':S.red,background:S.isLight?'#fef2f2':'rgba(220,38,38,0.1)',border:`1px solid ${S.isLight?'#fecaca':'rgba(220,38,38,0.2)'}`,borderRadius:6,padding:'4px 10px',cursor:'pointer'}}>Clear All</button>}
        </div>
        {showCompleted&&(
          done.length===0
          ?<div style={{fontSize:12,color:S.muted,padding:'12px 16px',borderTop:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`,textAlign:'center'}}>No completed actions yet.</div>
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

      {showAdd&&(
        <Modal title={form.id?'Edit Action':'Add Action'} onClose={()=>{setShowAdd(false);setForm(blank);setSnoozeDropOpen(false);setSnoozeShowCustom(false)}}>
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
                      <button key={o.opt} onClick={()=>snoozeAction(o.opt)}
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
        </Modal>
      )}
    </div>
  )
}
