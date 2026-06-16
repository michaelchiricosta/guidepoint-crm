import { useState, useRef } from 'react'
import { RefreshCw, ArrowLeft, CheckCircle2, Circle, Sparkles, X, ChevronRight } from 'lucide-react'
import { trackAI, FEATURES } from '../utils/aiTracker.js'

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
const groupBriefsByWeek = briefs => {
  const today=new Date(); today.setHours(0,0,0,0)
  const oneWeekAgo=new Date(today); oneWeekAgo.setDate(today.getDate()-7)
  const twoWeeksAgo=new Date(today); twoWeeksAgo.setDate(today.getDate()-14)
  const thisWeek=[],lastWeek=[],earlier=[]
  briefs.forEach(b=>{
    const d=new Date(b.date+'T00:00:00')
    if(d>=oneWeekAgo)thisWeek.push(b)
    else if(d>=twoWeeksAgo)lastWeek.push(b)
    else earlier.push(b)
  })
  return {thisWeek,lastWeek,earlier}
}

const NL={fontSize:10,fontWeight:700,color:'#64748b',letterSpacing:'0.1em',textTransform:'uppercase',padding:'10px 16px 4px'}

const SectionLabel=({icon,label,count})=>(
  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,marginTop:30}}>
    <span style={{fontSize:15}}>{icon}</span>
    <span style={{fontSize:11,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase'}}>{label}</span>
    {count!=null&&<span style={{fontSize:11,fontWeight:700,background:'#1e293b',color:'#fff',borderRadius:999,padding:'1px 7px'}}>{count}</span>}
  </div>
)

// Compact pill for header rows — truncates if too long
const MetaPill=({children,color='#64748b',bg='#f1f5f9',border='#e5e7eb'})=>(
  <span style={{
    display:'inline-block',fontSize:11,color,background:bg,border:`1px solid ${border}`,
    borderRadius:6,padding:'2px 8px',whiteSpace:'nowrap',flexShrink:0,fontWeight:500,
    maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',
  }}>
    {children}
  </span>
)

const DetailModal=({item,type,onClose,isPast,onToggle,data})=>{
  const apiKey=data?.apiKey||''
  const [draftEmail,setDraftEmail]=useState(null)
  const [emailLoading,setEmailLoading]=useState(false)
  const [chatMessages,setChatMessages]=useState([])
  const [chatInput,setChatInput]=useState('')
  const [chatLoading,setChatLoading]=useState(false)
  const [copied,setCopied]=useState(false)
  const chatEndRef=useRef(null)

  if(!item)return null

  const account=(data?.accounts||[]).find(a=>a.name===item.account)||null
  const recentIntel=account?(account.intelLog||[]).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5):[]
  const openFollowUps=account?(account.followUps||[]).filter(f=>f.status==='Open').slice(0,5):[]
  const activeProjects=account?(account.projects||[]).filter(p=>['In Flight','In Discussion','Not Started','Stalled'].includes(p.status)).slice(0,5):[]
  const techStack=account?(account.techStack||[]).slice(0,10):[]

  const acctCtxShort=account?{
    name:account.name,industry:account.industry||'',
    contacts:(account.contacts||[]).slice(0,4).map(c=>({name:c.name,title:c.title})),
    recentIntel:recentIntel.slice(0,3).map(e=>(e.text||'').slice(0,200)),
    activeProjects:activeProjects.slice(0,3).map(p=>({name:p.name,vendor:p.vendor,status:p.status})),
    techStack:techStack.slice(0,5).map(t=>t.vendor).filter(Boolean),
  }:null

  const generateEmail=async()=>{
    if(!apiKey||emailLoading)return
    setEmailLoading(true)
    try{
      const sys=`You are a senior enterprise sales rep at GuidePoint Security. Write a short, human, client-first email draft for Mike Chiricosta's voice. Mike is an Enterprise Client Manager who genuinely cares about his clients' security programs.
Rules: brief (4-6 sentence body max), human not salesy, lead with client value not "just checking in", include specific ask or next step, reference real account context when available.
Return ONLY valid JSON: {"recipient":"Name and Title or unknown","subject":"subject line","body":"email body text"}`
      const usr=`Draft email for this action:
Type: ${type==='actToday'?'Act Today (urgent)':'Move Forward This Week'}
Action: ${item.action}
Account: ${item.account}
Contact: ${item.contact||'unknown'}
Why it matters: ${item.clientFirstAngle||''}
Urgency: ${item.urgencyReason||''}
${acctCtxShort?`Account context: ${JSON.stringify(acctCtxShort)}`:''}
${(data?.marketPulses||[]).length?`Relevant market intel: ${(data.marketPulses||[]).slice(0,2).map(p=>p.title).join(' | ')}`:''}
${item.suggestedOpener?`Suggested opener: ${item.suggestedOpener}`:''}`

      const _emailStart=Date.now()
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:800,system:sys,messages:[{role:'user',content:usr}]})
      })
      trackAI({feature:FEATURES.DAILY_BRIEF,operation:'draft-email',model:'claude-sonnet-4-6',inputChars:sys.length+usr.length,maxTokensOut:800,durationMs:Date.now()-_emailStart,success:res.ok})
      const rd=await res.json()
      if(!res.ok)throw new Error(`API ${res.status}`)
      const raw=rd.content?.[0]?.text||''
      let parsed=null
      try{const s=raw.indexOf('{'),e=raw.lastIndexOf('}');if(s!==-1&&e!==-1)parsed=JSON.parse(raw.slice(s,e+1))}catch{}
      setDraftEmail(parsed||{recipient:item.contact||'unknown',subject:`Re: ${item.account}`,body:raw.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim()})
    }catch(err){setDraftEmail({error:err.message})}
    finally{setEmailLoading(false)}
  }

  const buildChatSys=()=>`You are Ledgr — an AI account strategist for Mike Chiricosta at GuidePoint Security. Help Mike think through this specific action. Be concise, direct, client-first. Keep answers under 150 words unless depth is needed.

Daily Brief Item:
Action: ${item.action}
Account: ${item.account}
Contact: ${item.contact||'unknown'}
Why it matters: ${item.clientFirstAngle||item.relevance||''}
${acctCtxShort?`\nAccount context:\n${JSON.stringify(acctCtxShort,null,2)}`:''}
${openFollowUps.length?`\nOpen follow-ups: ${openFollowUps.map(f=>f.task).join(' | ')}`:''}
${(data?.knowledgeBase||[]).length?`\nKB items: ${(data.knowledgeBase||[]).slice(0,3).map(k=>k.title).join(' | ')}`:''}`.trim()

  const sendChat=async()=>{
    if(!apiKey||!chatInput.trim()||chatLoading)return
    const userMsg=chatInput.trim()
    setChatInput('')
    const newMsgs=[...chatMessages,{role:'user',content:userMsg}]
    setChatMessages(newMsgs)
    setChatLoading(true)
    const _chatSys=buildChatSys()
    const _chatStart=Date.now()
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:500,system:_chatSys,messages:newMsgs})
      })
      trackAI({feature:FEATURES.DAILY_BRIEF,operation:'brief-chat',model:'claude-sonnet-4-6',inputChars:_chatSys.length+newMsgs.reduce((s,m)=>s+(m.content||'').length,0),maxTokensOut:500,durationMs:Date.now()-_chatStart,success:res.ok})
      const rd=await res.json()
      if(!res.ok)throw new Error(`API ${res.status}`)
      const reply=rd.content?.[0]?.text||''
      const withReply=[...newMsgs,{role:'assistant',content:reply}]
      setChatMessages(withReply)
      setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:'smooth'}),50)
    }catch(err){setChatMessages([...newMsgs,{role:'assistant',content:`Error: ${err.message}`}])}
    finally{setChatLoading(false)}
  }

  const copyEmail=()=>{
    if(!draftEmail?.body)return
    navigator.clipboard.writeText(`To: ${draftEmail.recipient}\nSubject: ${draftEmail.subject}\n\n${draftEmail.body}`)
      .then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)})
  }

  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:580,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.25)',display:'flex',flexDirection:'column'}}>

        {/* 1. Title */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',padding:'20px 20px 0',gap:12,flexShrink:0}}>
          <div style={{minWidth:0}}>
            {item.account&&(
              <div style={{fontSize:11,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>
                {item.account}
                {item.contact&&<span style={{fontWeight:400,textTransform:'none',marginLeft:7,color:'#94a3b8',fontSize:11}}>· {item.contact}</span>}
                {(item.timeframe||item.urgencyReason===undefined&&item.why)&&<span style={{fontWeight:400,textTransform:'none',marginLeft:7,color:'#f59e0b',fontSize:11}}>{item.timeframe}</span>}
              </div>
            )}
            <div style={{fontSize:16,fontWeight:700,color:'#0f172a',lineHeight:1.45}}>{item.action||item.headline}</div>
          </div>
          <button onClick={onClose} style={{background:'#f1f5f9',border:'none',borderRadius:8,padding:7,cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',color:'#64748b'}}>
            <X size={16}/>
          </button>
        </div>

        <div style={{padding:'14px 20px 24px',display:'flex',flexDirection:'column',gap:14}}>

          {/* 2. Why this matters */}
          {(item.clientFirstAngle||item.relevance||item.why)&&(
            <div style={{background:'#eff6ff',borderRadius:8,padding:'10px 14px',borderLeft:'3px solid #2563eb'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#1d4ed8',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Why This Matters</div>
              <div style={{fontSize:13,color:'#1e3a5f',lineHeight:1.65}}>{item.clientFirstAngle||item.relevance||item.why}</div>
              {item.plantThisSeed&&<div style={{fontSize:12,color:'#2563eb',marginTop:6,fontStyle:'italic'}}>🌱 {item.plantThisSeed}</div>}
            </div>
          )}

          {/* 3. Drafted email (actToday + moveForward) */}
          {(type==='actToday'||type==='moveForward')&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>Drafted Email</div>
              {!draftEmail&&!emailLoading&&(
                <button onClick={generateEmail} disabled={!apiKey}
                  style={{display:'flex',alignItems:'center',gap:6,background:'#f8fafc',border:'1px solid #e5e7eb',borderRadius:8,padding:'8px 14px',cursor:apiKey?'pointer':'not-allowed',fontSize:13,color:apiKey?'#374151':'#94a3b8',fontWeight:500,width:'100%',justifyContent:'center'}}>
                  <span style={{fontSize:15}}>✉️</span> {apiKey?'Draft Email':'Add API key to enable email drafting'}
                </button>
              )}
              {emailLoading&&(
                <div style={{display:'flex',alignItems:'center',gap:8,color:'#64748b',fontSize:13,padding:'8px 0'}}>
                  <div style={{width:13,height:13,border:'2px solid #e2e8f0',borderTopColor:'#2563eb',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                  Drafting email...
                </div>
              )}
              {draftEmail&&!draftEmail.error&&(
                <div style={{background:'#f8fafc',border:'1px solid #e5e7eb',borderRadius:9,overflow:'hidden'}}>
                  <div style={{padding:'10px 14px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>To: <span style={{color:'#374151',fontWeight:500}}>{draftEmail.recipient}</span></div>
                      <div style={{fontSize:12,fontWeight:600,color:'#0f172a'}}>Subject: {draftEmail.subject}</div>
                    </div>
                    <div style={{display:'flex',gap:6,flexShrink:0}}>
                      <button onClick={copyEmail}
                        style={{fontSize:11,fontWeight:600,color:copied?'#15803d':'#2563eb',background:copied?'#f0fdf4':'#eff6ff',border:'1px solid',borderColor:copied?'#86efac':'#bfdbfe',borderRadius:6,padding:'4px 10px',cursor:'pointer',whiteSpace:'nowrap'}}>
                        {copied?'✓ Copied':'Copy'}
                      </button>
                      <button onClick={generateEmail} title="Regenerate"
                        style={{fontSize:11,color:'#94a3b8',background:'#f1f5f9',border:'1px solid #e5e7eb',borderRadius:6,padding:'4px 8px',cursor:'pointer'}}>↺</button>
                    </div>
                  </div>
                  <div style={{padding:'12px 14px',fontSize:13,color:'#374151',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{draftEmail.body}</div>
                </div>
              )}
              {draftEmail?.error&&(
                <div style={{fontSize:12,color:'#dc2626',background:'#fee2e2',borderRadius:7,padding:'8px 12px'}}>{draftEmail.error}</div>
              )}
            </div>
          )}

          {/* 4. Quick notes */}
          {(item.whileYouHaveThem?.length>0||item.upsairsKit||item.alert)&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>Quick Notes</div>
              {item.whileYouHaveThem?.length>0&&(
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:item.upsairsKit?8:0}}>
                  {item.whileYouHaveThem.map((wt,wi)=>(
                    <span key={wi} style={{fontSize:12,background:'#f1f5f9',color:'#475569',borderRadius:999,padding:'3px 10px',border:'1px solid #e5e7eb'}}>{wt}</span>
                  ))}
                </div>
              )}
              {item.upsairsKit&&item.upsairsKit.trim()&&(
                <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:7,padding:'8px 12px',display:'flex',gap:7,alignItems:'flex-start',marginBottom:item.alert?8:0}}>
                  <span style={{fontSize:12,flexShrink:0}}>💼</span>
                  <div style={{fontSize:12,color:'#92400e',lineHeight:1.55}}>{item.upsairsKit}</div>
                </div>
              )}
              {item.alert&&<div style={{fontSize:12,color:'#374151',lineHeight:1.5}}>⚠️ {item.alert}</div>}
            </div>
          )}

          {/* urgency / timeframe compact */}
          {item.urgencyReason&&(
            <div style={{fontSize:12,color:'#64748b',fontStyle:'italic',borderTop:'1px solid #f8fafc',paddingTop:10}}>
              <span style={{fontWeight:700,color:'#9ca3af',fontSize:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Why today: </span>{item.urgencyReason}
            </div>
          )}

          {/* mark complete (actToday only) */}
          {type==='actToday'&&!isPast&&(
            <div style={{paddingTop:6,borderTop:'1px solid #f1f5f9'}}>
              <button onClick={()=>{onToggle&&onToggle();onClose()}}
                style={{display:'flex',alignItems:'center',gap:8,background:item.completedToday?'#f0fdf4':'#fff',border:`1px solid ${item.completedToday?'#86efac':'#e5e7eb'}`,borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:13,color:item.completedToday?'#15803d':'#374151',fontWeight:600}}>
                {item.completedToday?<CheckCircle2 size={16} color='#22c55e'/>:<Circle size={16} color='#9ca3af'/>}
                {item.completedToday?'Marked complete — click to undo':'Mark as complete'}
              </button>
            </div>
          )}

          {/* 5. AI Chat */}
          <div style={{borderTop:'2px solid #f1f5f9',paddingTop:14}}>
            <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:10}}>AI Assistant — Ask Anything</div>
            {!apiKey?(
              <div style={{fontSize:12,color:'#94a3b8',fontStyle:'italic',background:'#f8fafc',borderRadius:7,padding:'10px 12px'}}>Add your Anthropic API key in Settings to enable AI chat and email drafting.</div>
            ):(
              <>
                {chatMessages.length===0&&(
                  <div style={{fontSize:12,color:'#94a3b8',marginBottom:10,lineHeight:1.5}}>What to say? Who to involve? Best angle? Ask anything about this account or action.</div>
                )}
                {chatMessages.length>0&&(
                  <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12,maxHeight:260,overflowY:'auto',padding:'2px 0'}}>
                    {chatMessages.map((m,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                        <div style={{maxWidth:'88%',background:m.role==='user'?'#1e3a5f':'#f1f5f9',color:m.role==='user'?'#fff':'#374151',borderRadius:m.role==='user'?'12px 12px 2px 12px':'12px 12px 12px 2px',padding:'8px 12px',fontSize:13,lineHeight:1.55,whiteSpace:'pre-wrap'}}>
                          {m.content}
                        </div>
                      </div>
                    ))}
                    {chatLoading&&(
                      <div style={{display:'flex',alignItems:'center',gap:6,color:'#94a3b8',fontSize:12}}>
                        <div style={{width:11,height:11,border:'2px solid #e2e8f0',borderTopColor:'#2563eb',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                        Thinking...
                      </div>
                    )}
                    <div ref={chatEndRef}/>
                  </div>
                )}
                <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
                  <textarea value={chatInput} onChange={e=>setChatInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}}}
                    placeholder="Ask about this item... (Enter to send)"
                    rows={2}
                    style={{flex:1,padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,fontFamily:'inherit',resize:'none',outline:'none',lineHeight:1.5}}
                  />
                  <button onClick={sendChat} disabled={!chatInput.trim()||chatLoading}
                    style={{padding:'8px 14px',background:chatInput.trim()&&!chatLoading?'#1e3a5f':'#f1f5f9',color:chatInput.trim()&&!chatLoading?'#fff':'#94a3b8',border:'none',borderRadius:8,cursor:chatInput.trim()&&!chatLoading?'pointer':'not-allowed',fontSize:13,fontWeight:600,flexShrink:0,alignSelf:'stretch',minHeight:44}}>
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Small helpers for modal
const Label=({children,color='#9ca3af'})=>(
  <div style={{fontSize:10,fontWeight:700,color,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>{children}</div>
)
const F=({label,children,color='#374151',italic=false})=>(
  <div>
    <Label>{label}</Label>
    <div style={{fontSize:13,color,lineHeight:1.65,fontStyle:italic?'italic':'normal'}}>{children}</div>
  </div>
)

export default function DailyBrief({data,setData,apiKey,briefGenerating,briefError,onGenerateNow,onBack}){
  const today=new Date().toISOString().split('T')[0]
  const briefs=data.dailyBriefs||[]
  const todayBrief=briefs.find(b=>b.date===today)||null
  const pastBriefs=briefs.filter(b=>b.date!==today).slice(0,29)

  const [selectedDate,setSelectedDate]=useState(today)
  const [summaryExpanded,setSummaryExpanded]=useState(false)
  const [detailModal,setDetailModal]=useState(null)

  const selectedBrief=briefs.find(b=>b.date===selectedDate)||null
  const isToday=selectedDate===today

  const toggleActToday=(briefDate,idx)=>{
    setData(prev=>{
      const updated=(prev.dailyBriefs||[]).map(b=>{
        if(b.date!==briefDate)return b
        const items=(b.sections?.actToday||[]).map((item,i)=>i===idx?{...item,completedToday:!item.completedToday}:item)
        return{...b,sections:{...b.sections,actToday:items}}
      })
      return{...prev,dailyBriefs:updated}
    })
  }

  const {thisWeek,lastWeek,earlier}=groupBriefsByWeek(pastBriefs)
  const incompleteCount=todayBrief?(todayBrief.sections?.actToday||[]).filter(a=>!a.completedToday).length:0

  const briefNavRow=b=>{
    const isSel=selectedDate===b.date
    return(
      <div key={b.date} onClick={()=>setSelectedDate(b.date)}
        style={{padding:'8px 12px',cursor:'pointer',borderRadius:6,margin:'1px 8px',background:isSel?'#eff6ff':'transparent',transition:'background 0.1s'}}
        onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='#f1f5f9'}}
        onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background='transparent'}}>
        <div style={{fontSize:13,fontWeight:600,color:isSel?'#1d4ed8':'#374151',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{fmt(b.date)}</div>
        {b.briefSummary&&<div style={{fontSize:10,color:'#94a3b8',marginTop:2,lineHeight:1.4,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{b.briefSummary.slice(0,80)}</div>}
      </div>
    )
  }

  const Card=({onClick,leftAccent,dimmed,children})=>(
    <div onClick={onClick}
      style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:11,padding:'15px 18px',cursor:'pointer',
        transition:'box-shadow 0.15s,border-color 0.15s',
        borderLeft:leftAccent?`3px solid ${leftAccent}`:'1px solid #e5e7eb',
        opacity:dimmed?0.45:1}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 2px 10px rgba(0,0,0,0.08)';e.currentTarget.style.borderColor='#d1d5db'}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.borderColor=leftAccent?leftAccent:'#e5e7eb'}}>
      {children}
    </div>
  )

  const renderBrief=brief=>{
    if(!brief)return(
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'55vh',flexDirection:'column',gap:14}}>
        {briefGenerating
          ?<><div style={{width:32,height:32,border:'3px solid #e2e8f0',borderTopColor:'#2563eb',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/><div style={{fontSize:14,color:'#64748b',marginTop:4}}>Generating your morning brief...</div></>
          :<div style={{fontSize:14,color:'#94a3b8'}}>No brief yet. Click "+ Generate Now" to create one.</div>
        }
      </div>
    )

    const {actToday=[],moveForward=[],longGame=[],renewalRadar=[],marketPulse=[]}=brief.sections||{}
    const isPast=brief.date!==today
    const fullSummary=brief.briefSummary||''
    const firstEnd=fullSummary.search(/[.!?](\s|$)/)
    const firstSentence=firstEnd>0?fullSummary.slice(0,firstEnd+1):fullSummary
    const restSummary=firstEnd>0?fullSummary.slice(firstEnd+1).trim():''

    return(
      <div style={{maxWidth:680}}>
        {isPast&&(
          <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'8px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
            <Sparkles size={13} color='#2563eb'/>
            <span style={{fontSize:12,color:'#1d4ed8',fontWeight:500}}>Archived — {fmtFull(brief.date)}</span>
          </div>
        )}

        <div style={{fontSize:22,fontWeight:800,color:'#0f172a',lineHeight:1.15,letterSpacing:'-0.02em',marginBottom:16}}>
          {isToday?`Today — ${fmtFull(today)}`:fmtFull(brief.date)}
        </div>

        {firstSentence&&(
          <div style={{marginBottom:22}}>
            <div style={{borderLeft:'2px solid #2563eb',paddingLeft:14,paddingTop:3,paddingBottom:3}}>
              <div style={{fontSize:14,color:'#0f172a',lineHeight:1.65}}>{firstSentence}</div>
            </div>
            {restSummary&&(
              <div style={{marginTop:5,paddingLeft:16}}>
                <button onClick={()=>setSummaryExpanded(p=>!p)} style={{background:'transparent',border:'none',color:'#9ca3af',fontSize:11,cursor:'pointer',padding:0,fontWeight:500}}>
                  {summaryExpanded?'▲ Hide context':'▼ Full context'}
                </button>
                {summaryExpanded&&<div style={{fontSize:12,color:'#64748b',lineHeight:1.6,marginTop:4}}>{restSummary}</div>}
              </div>
            )}
          </div>
        )}

        <div style={{height:1,background:'#f1f5f9',marginBottom:4}}/>

        {/* ACT TODAY */}
        <SectionLabel icon='🎯' label='Act Today' count={actToday.length}/>
        {actToday.length===0&&<div style={{fontSize:13,color:'#94a3b8',marginBottom:24}}>No urgent actions for today.</div>}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {actToday.map((item,idx)=>(
            <Card key={idx}
              onClick={()=>setDetailModal({item,type:'actToday',idx,briefDate:brief.date})}
              leftAccent={item.completedToday?'#22c55e':null}
              dimmed={item.completedToday}>
              {/* Row 1: checkbox · ACCOUNT · contact · time · › */}
              <div style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}>
                <button
                  onClick={e=>{e.stopPropagation();if(!isPast)toggleActToday(brief.date,idx)}}
                  style={{background:'transparent',border:'none',padding:0,cursor:'pointer',flexShrink:0,color:item.completedToday?'#22c55e':'#d1d5db',display:'flex',alignItems:'center'}}>
                  {item.completedToday?<CheckCircle2 size={16}/>:<Circle size={16}/>}
                </button>
                <span style={{
                  fontSize:11,fontWeight:700,color:'#374151',letterSpacing:'0.07em',textTransform:'uppercase',
                  flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                  textDecoration:item.completedToday?'line-through':'none'}}>
                  {item.account}
                </span>
                {item.contact&&(
                  <span style={{
                    fontSize:11,color:'#94a3b8',flexShrink:0,
                    maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {item.contact}
                  </span>
                )}
                {item.estimatedMinutes&&(
                  <MetaPill>{item.estimatedMinutes}m</MetaPill>
                )}
                <ChevronRight size={13} color='#d1d5db' style={{flexShrink:0}}/>
              </div>
              {/* Row 2: action title — dominant */}
              <div style={{
                fontSize:15,fontWeight:700,color:'#0f172a',lineHeight:1.45,marginTop:8,
                display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',
                textDecoration:item.completedToday?'line-through':'none'}}>
                {item.action}
              </div>
              {/* Row 3: urgency pill — single line, truncated, visually secondary */}
              {item.urgencyReason&&(
                <div style={{marginTop:6,overflow:'hidden'}}>
                  <span style={{
                    display:'inline-block',boxSizing:'border-box',
                    maxWidth:'100%',overflow:'hidden',
                    textOverflow:'ellipsis',whiteSpace:'nowrap',
                    fontSize:11,color:'#64748b',fontStyle:'italic',
                    background:'#f8fafc',border:'1px solid #e5e7eb',
                    borderRadius:5,padding:'2px 8px',
                  }}>
                    {item.urgencyReason}
                  </span>
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* MOVE FORWARD */}
        <SectionLabel icon='📅' label='Move Forward This Week' count={moveForward.length}/>
        {moveForward.length===0&&<div style={{fontSize:13,color:'#94a3b8',marginBottom:24}}>Nothing queued this week.</div>}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {moveForward.map((item,idx)=>(
            <Card key={idx} onClick={()=>setDetailModal({item,type:'moveForward',idx})}>
              <div style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}>
                <span style={{
                  fontSize:11,fontWeight:700,color:'#374151',letterSpacing:'0.07em',textTransform:'uppercase',
                  flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {item.account}
                </span>
                {item.contact&&(
                  <span style={{
                    fontSize:11,color:'#94a3b8',flexShrink:0,
                    maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {item.contact}
                  </span>
                )}
                {item.timeframe&&(
                  <MetaPill color='#92400e' bg='#fef3c7' border='#fde68a'>{item.timeframe}</MetaPill>
                )}
                <ChevronRight size={13} color='#d1d5db' style={{flexShrink:0}}/>
              </div>
              <div style={{
                fontSize:14,fontWeight:600,color:'#1e293b',lineHeight:1.5,marginTop:8,
                display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
                {item.action}
              </div>
            </Card>
          ))}
        </div>

        {/* LONG GAME */}
        <SectionLabel icon='🌱' label='Long Game' count={longGame.length}/>
        {longGame.length===0&&<div style={{fontSize:13,color:'#94a3b8',marginBottom:24}}>No long-game seeds right now.</div>}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {longGame.map((item,idx)=>(
            <Card key={idx} onClick={()=>setDetailModal({item,type:'longGame',idx})}>
              <div style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}>
                <span style={{
                  fontSize:11,fontWeight:700,color:'#374151',letterSpacing:'0.07em',textTransform:'uppercase',
                  flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {item.account}
                </span>
                <ChevronRight size={13} color='#d1d5db' style={{flexShrink:0}}/>
              </div>
              <div style={{
                fontSize:13,fontWeight:500,color:'#1e293b',lineHeight:1.55,marginTop:8,
                display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
                {item.action}
              </div>
            </Card>
          ))}
        </div>

        {/* RENEWAL RADAR */}
        {renewalRadar.length>0&&(
          <>
            <SectionLabel icon='🔄' label='Renewal Radar' count={renewalRadar.length}/>
            <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:11,overflow:'hidden'}}>
              {renewalRadar.map((item,idx)=>{
                const dot=item.daysUntil<30?'#ef4444':item.daysUntil<60?'#f59e0b':'#22c55e'
                return(
                  <div key={idx}
                    onClick={()=>setDetailModal({item,type:'renewalRadar',idx})}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderBottom:idx<renewalRadar.length-1?'1px solid #f8fafc':'none',cursor:'pointer',transition:'background 0.1s',minWidth:0}}
                    onMouseEnter={e=>e.currentTarget.style.background='#f9fafb'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:dot,flexShrink:0}}/>
                    <span style={{fontSize:13,fontWeight:600,color:'#0f172a',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.vendor}</span>
                    <span style={{fontSize:12,color:'#64748b',flexShrink:0,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.account}</span>
                    {item.daysUntil!=null&&<span style={{fontSize:11,fontWeight:700,color:dot,flexShrink:0,minWidth:24,textAlign:'right'}}>{item.daysUntil}d</span>}
                    {item.annualCost&&<span style={{fontSize:12,color:'#475569',fontWeight:500,flexShrink:0}}>{item.annualCost}</span>}
                    {item.inConversation!=null&&<span style={{fontSize:11,color:item.inConversation?'#15803d':'#dc2626',fontWeight:600,flexShrink:0}}>{item.inConversation?'✓ Active':'⚠ Risk'}</span>}
                    <ChevronRight size={13} color='#d1d5db' style={{flexShrink:0}}/>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* MARKET PULSE */}
        {marketPulse.length>0&&(
          <>
            <SectionLabel icon='📡' label='Market Pulse'/>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {marketPulse.map((item,idx)=>(
                <Card key={idx} onClick={()=>setDetailModal({item,type:'marketPulse',idx})}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:8,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#0f172a',flex:1,lineHeight:1.45,minWidth:0}}>{item.headline}</div>
                    <ChevronRight size={13} color='#d1d5db' style={{flexShrink:0,marginTop:1}}/>
                  </div>
                  {item.relevance&&(
                    <div style={{fontSize:12,color:'#64748b',marginTop:5,lineHeight:1.5,
                      display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
                      {item.relevance}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}

        <div style={{height:64}}/>
      </div>
    )
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden',background:'#f8fafc'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* TOP BAR — consistent across all detail pages */}
      <div style={{background:'#0f172a',padding:'11px 20px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
        <button onClick={onBack}
          style={{background:'transparent',border:'none',color:'#94a3b8',cursor:'pointer',display:'flex',alignItems:'center',gap:6,padding:0,fontSize:13,fontWeight:500,whiteSpace:'nowrap'}}
          onMouseEnter={e=>e.currentTarget.style.color='#e2e8f0'}
          onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}>
          <ArrowLeft size={15}/> Back to Dashboard
        </button>
        <div style={{width:1,height:16,background:'rgba(255,255,255,0.15)',flexShrink:0}}/>
        <Sparkles size={15} color='#60a5fa'/>
        <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>Daily Brief</span>
        {isToday&&(
          <button onClick={onGenerateNow} disabled={briefGenerating}
            style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:5,
              background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.15)',
              borderRadius:7,padding:'5px 12px',cursor:briefGenerating?'not-allowed':'pointer',
              color:'#cbd5e1',fontSize:12,fontWeight:500,opacity:briefGenerating?0.5:1,whiteSpace:'nowrap'}}>
            <RefreshCw size={12} style={{animation:briefGenerating?'spin 0.8s linear infinite':'none'}}/> Regenerate
          </button>
        )}
      </div>

      {/* BODY: sidebar + main content */}
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
                {briefGenerating&&<div style={{width:11,height:11,border:'2px solid #e2e8f0',borderTopColor:'#2563eb',borderRadius:'50%',animation:'spin 0.8s linear infinite',flexShrink:0}}/>}
                {!briefGenerating&&!todayBrief&&<span style={{fontSize:10,color:'#cbd5e1',flexShrink:0}}>—</span>}
                {!briefGenerating&&todayBrief&&incompleteCount>0&&<span style={{fontSize:10,fontWeight:700,background:'#fee2e2',color:'#dc2626',borderRadius:999,padding:'1px 6px',minWidth:16,textAlign:'center',flexShrink:0}}>{incompleteCount}</span>}
              </div>
              {briefGenerating&&<div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>Generating...</div>}
            </div>
            {pastBriefs.length>0&&(
              <>
                <div style={NL}>Archive</div>
                {thisWeek.length>0&&<><div style={{fontSize:10,color:'#94a3b8',padding:'2px 20px 1px',fontWeight:600,letterSpacing:'0.04em'}}>This Week</div>{thisWeek.map(briefNavRow)}</>}
                {lastWeek.length>0&&<><div style={{fontSize:10,color:'#94a3b8',padding:'6px 20px 1px',fontWeight:600,letterSpacing:'0.04em'}}>Last Week</div>{lastWeek.map(briefNavRow)}</>}
                {earlier.length>0&&<><div style={{fontSize:10,color:'#94a3b8',padding:'6px 20px 1px',fontWeight:600,letterSpacing:'0.04em'}}>Earlier</div>{earlier.map(briefNavRow)}</>}
              </>
            )}
          </div>
          <div style={{padding:12,borderTop:'1px solid #f1f5f9',flexShrink:0}}>
            <button onClick={onGenerateNow} disabled={briefGenerating}
              style={{width:'100%',padding:'8px 12px',background:briefGenerating?'#f8fafc':'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:7,color:briefGenerating?'#94a3b8':'#374151',fontSize:12,fontWeight:600,cursor:briefGenerating?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:6,justifyContent:'center'}}>
              {briefGenerating?<><div style={{width:11,height:11,border:'2px solid #e2e8f0',borderTopColor:'#2563eb',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/> Generating...</>:'+ Generate Now'}
            </button>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{flex:1,overflowY:'auto',padding:'28px 36px',WebkitOverflowScrolling:'touch'}}>
          {briefError&&(
            <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 14px',marginBottom:20,color:'#dc2626',fontSize:13,display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:680}}>
              <span>{briefError}</span>
              <button onClick={onGenerateNow} style={{marginLeft:12,background:'transparent',border:'none',color:'#dc2626',cursor:'pointer',textDecoration:'underline',fontSize:12,fontWeight:600,flexShrink:0}}>Retry</button>
            </div>
          )}
          {renderBrief(selectedBrief)}
        </div>
      </div>

      {/* DETAIL MODAL */}
      {detailModal&&(
        <DetailModal
          item={detailModal.item}
          type={detailModal.type}
          idx={detailModal.idx}
          isPast={selectedDate!==today}
          data={data}
          onClose={()=>setDetailModal(null)}
          onToggle={()=>{
            if(detailModal.type==='actToday'&&detailModal.briefDate){
              toggleActToday(detailModal.briefDate,detailModal.idx)
              setDetailModal(prev=>({...prev,item:{...prev.item,completedToday:!prev.item.completedToday}}))
            }
          }}
        />
      )}
    </div>
  )
}
