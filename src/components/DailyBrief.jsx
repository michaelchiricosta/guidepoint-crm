import { useState, useRef } from 'react'
import { RefreshCw, ArrowLeft, CheckCircle2, Circle, Sparkles, X, ChevronRight, Copy } from 'lucide-react'
import { trackAI, FEATURES } from '../utils/aiTracker.js'
import { hashStr, getAICache, setAICache } from '../utils/aiHelper.js'

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

// ── Document-style headings ───────────────────────────────────────────────────
const SectionHead = ({children, accent}) => (
  <div style={{fontSize:11,fontWeight:700,color:'#1e293b',letterSpacing:'0.07em',textTransform:'uppercase',
    paddingBottom:8,marginBottom:10,borderBottom:'1px solid #f1f5f9',
    display:'flex',alignItems:'center',gap:8}}>
    {accent&&<span style={{width:3,height:14,background:accent,borderRadius:2,flexShrink:0,display:'inline-block'}}/>}
    {children}
  </div>
)
const SubHead = ({children}) => (
  <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',letterSpacing:'0.06em',textTransform:'uppercase',
    marginTop:14,marginBottom:6}}>
    {children}
  </div>
)

// ── Generic clickable bullet row ──────────────────────────────────────────────
const BulletRow = ({dot='#cbd5e1', children, onClick, noChevron}) => (
  <div onClick={onClick}
    style={{display:'flex',alignItems:'flex-start',gap:9,padding:'6px 6px',borderRadius:5,
      cursor:onClick?'pointer':'default',transition:'background 0.1s'}}
    onMouseEnter={e=>{if(onClick)e.currentTarget.style.background='#f9fafb'}}
    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
    <span style={{width:5,height:5,borderRadius:'50%',background:dot,flexShrink:0,marginTop:6}}/>
    <div style={{flex:1,minWidth:0,fontSize:13,color:'#1e293b',lineHeight:1.55}}>{children}</div>
    {onClick&&!noChevron&&<ChevronRight size={12} color='#d1d5db' style={{flexShrink:0,marginTop:3}}/>}
  </div>
)

// ── Action bullet row (for actToday / moveForward / longGame) ─────────────────
const ActionRow = ({item, type, isPast, onToggle, onClick}) => {
  const done = item.completedToday
  const dotColor = type==='actToday' ? '#ef4444' : type==='moveForward' ? '#f59e0b' : '#94a3b8'
  const context = item.urgencyReason || item.clientFirstAngle || item.relevance || ''
  return (
    <div onClick={onClick}
      style={{display:'flex',alignItems:'flex-start',gap:9,padding:'7px 6px',borderRadius:5,
        cursor:'pointer',opacity:done?0.42:1,transition:'background 0.1s'}}
      onMouseEnter={e=>e.currentTarget.style.background='#f9fafb'}
      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      {type==='actToday' ? (
        <button onClick={e=>{e.stopPropagation();if(!isPast&&onToggle)onToggle()}}
          style={{background:'transparent',border:'none',padding:'2px 0 0',cursor:'pointer',flexShrink:0,
            color:done?'#22c55e':'#d1d5db',lineHeight:1,display:'flex'}}>
          {done?<CheckCircle2 size={15}/>:<Circle size={15}/>}
        </button>
      ) : (
        <span style={{width:5,height:5,borderRadius:'50%',background:dotColor,flexShrink:0,marginTop:7}}/>
      )}
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13.5,color:'#111827',lineHeight:1.5,fontWeight:500,
          display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',
          textDecoration:done?'line-through':'none'}}>
          {item.account&&<><strong style={{fontWeight:700}}>{item.account}</strong> — </>}{item.action}
        </div>
        {context&&<div style={{fontSize:11,color:'#64748b',marginTop:2,lineHeight:1.35,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{context}</div>}
      </div>
      {item.estimatedMinutes&&<span style={{fontSize:11,color:'#9ca3af',flexShrink:0,paddingTop:2}}>{item.estimatedMinutes}m</span>}
      <ChevronRight size={12} color='#d1d5db' style={{flexShrink:0,marginTop:2}}/>
    </div>
  )
}

// ── Detail / Info modal ───────────────────────────────────────────────────────
const DetailModal = ({item, type, onClose, isPast, onToggle, data, setData}) => {
  const apiKey = data?.apiKey||''

  // Normalize item fields across types
  const actionText = item.action || item.decision || item.item || item.headline || (item.label?`${item.label}: ${item.detail}`:'') || item.suggestion || ''
  const accountName = item.account || ''
  const whyText = item.clientFirstAngle || item.relevance || item.why || item.detail || item.context || item.risk || ''
  const showEmail = ['actToday','moveForward','followUp'].includes(type)
  const showToggle = type==='actToday' && !isPast

  const _emailCacheKey = (showEmail && item) ? `emailDraft_${hashStr((accountName)+'_'+(actionText).slice(0,50)+'_'+type)}` : null
  const _cachedEmail = _emailCacheKey ? getAICache(data, _emailCacheKey) : null
  const [draftEmail,setDraftEmail] = useState(_cachedEmail||null)
  const [emailLoading,setEmailLoading] = useState(false)
  const [chatMessages,setChatMessages] = useState([])
  const [chatInput,setChatInput] = useState('')
  const [chatLoading,setChatLoading] = useState(false)
  const [copied,setCopied] = useState(false)
  const chatEndRef = useRef(null)

  if(!item) return null

  const account = (data?.accounts||[]).find(a=>a.name===accountName)||null
  const recentIntel = account?(account.intelLog||[]).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,3):[]
  const openFollowUps = account?(account.followUps||[]).filter(f=>f.status==='Open').slice(0,4):[]
  const activeProjects = account?(account.projects||[]).filter(p=>['In Flight','In Discussion','Not Started','Stalled'].includes(p.status)).slice(0,3):[]
  const acctCtxShort = account ? {
    name:account.name, industry:account.industry||'',
    contacts:(account.contacts||[]).slice(0,3).map(c=>({name:c.name,title:c.title})),
    recentIntel:recentIntel.map(e=>(e.text||'').slice(0,200)),
    activeProjects:activeProjects.map(p=>({name:p.name,vendor:p.vendor,status:p.status})),
    techStack:(account.techStack||[]).slice(0,5).map(t=>t.vendor).filter(Boolean),
  } : null

  const generateEmail = async () => {
    if(!apiKey||emailLoading) return
    setEmailLoading(true)
    try{
      const sys=`You are a senior enterprise sales rep at GuidePoint Security. Write a short, human, client-first email draft for Mike Chiricosta's voice.
Rules: brief (4-6 sentence body max), human not salesy, lead with client value, include specific ask or next step, reference real account context when available.
Return ONLY valid JSON: {"recipient":"Name and Title or unknown","subject":"subject line","body":"email body text"}`
      const usr=`Draft email for this action:
Type: ${type==='actToday'?'Urgent Action Today':type==='moveForward'?'Move Forward This Week':'Follow-Up'}
Action: ${actionText}
Account: ${accountName}
Contact: ${item.contact||'unknown'}
Why it matters: ${whyText}
${acctCtxShort?`Account context: ${JSON.stringify(acctCtxShort)}`:''}
${item.suggestedOpener?`Suggested opener: ${item.suggestedOpener}`:''}`
      const _emailStart=Date.now()
      const res=await fetch('/api/ai',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:800,system:sys,messages:[{role:'user',content:usr}]})
      })
      trackAI({feature:FEATURES.DAILY_BRIEF,operation:'draft-email',model:'claude-sonnet-4-6',inputChars:sys.length+usr.length,maxTokensOut:800,durationMs:Date.now()-_emailStart,success:res.ok})
      const rd=await res.json()
      if(!res.ok) throw new Error(`API ${res.status}`)
      const raw=rd.content?.[0]?.text||''
      let parsed=null
      try{const s=raw.indexOf('{'),e=raw.lastIndexOf('}');if(s!==-1&&e!==-1)parsed=JSON.parse(raw.slice(s,e+1))}catch{}
      const draft=parsed||{recipient:item.contact||'unknown',subject:`Re: ${accountName}`,body:raw.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim()}
      setDraftEmail(draft)
      if(_emailCacheKey&&setData) setAICache(setData,_emailCacheKey,draft,7*24*3600*1000)
    }catch(err){setDraftEmail({error:err.message})}
    finally{setEmailLoading(false)}
  }

  const buildChatSys = () => `You are Ledgr — an AI account strategist for Mike Chiricosta at GuidePoint Security. Help Mike think through this specific brief item. Be concise, direct, client-first. Keep answers under 150 words unless depth is needed.

Brief Item (${type}):
${actionText}
${accountName?`Account: ${accountName}`:''}
${whyText?`Context: ${whyText}`:''}
${acctCtxShort?`\nAccount data:\n${JSON.stringify(acctCtxShort,null,2)}`:''}
${openFollowUps.length?`\nOpen follow-ups: ${openFollowUps.map(f=>f.task).join(' | ')}`:''}`.trim()

  const sendChat = async () => {
    if(!apiKey||!chatInput.trim()||chatLoading) return
    const userMsg=chatInput.trim()
    setChatInput('')
    const newMsgs=[...chatMessages,{role:'user',content:userMsg}]
    setChatMessages(newMsgs)
    setChatLoading(true)
    const _chatSys=buildChatSys()
    const _chatStart=Date.now()
    try{
      const res=await fetch('/api/ai',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:500,system:_chatSys,messages:newMsgs})
      })
      trackAI({feature:FEATURES.DAILY_BRIEF,operation:'brief-chat',model:'claude-sonnet-4-6',inputChars:_chatSys.length+newMsgs.reduce((s,m)=>s+(m.content||'').length,0),maxTokensOut:500,durationMs:Date.now()-_chatStart,success:res.ok})
      const rd=await res.json()
      if(!res.ok) throw new Error(`API ${res.status}`)
      const reply=rd.content?.[0]?.text||''
      const withReply=[...newMsgs,{role:'assistant',content:reply}]
      setChatMessages(withReply)
      setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:'smooth'}),50)
    }catch(err){setChatMessages([...newMsgs,{role:'assistant',content:`Error: ${err.message}`}])}
    finally{setChatLoading(false)}
  }

  const copyEmail = () => {
    if(!draftEmail?.body) return
    navigator.clipboard.writeText(`To: ${draftEmail.recipient}\nSubject: ${draftEmail.subject}\n\n${draftEmail.body}`)
      .then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)})
  }

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:580,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.25)',display:'flex',flexDirection:'column'}}>

        {/* 1. Title */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',padding:'20px 20px 0',gap:12,flexShrink:0}}>
          <div style={{minWidth:0}}>
            {accountName&&(
              <div style={{fontSize:11,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>
                {accountName}
                {item.contact&&<span style={{fontWeight:400,textTransform:'none',marginLeft:7,color:'#94a3b8',fontSize:11}}>· {item.contact}</span>}
              </div>
            )}
            <div style={{fontSize:16,fontWeight:700,color:'#0f172a',lineHeight:1.45}}>{actionText}</div>
          </div>
          <button onClick={onClose} style={{background:'#f1f5f9',border:'none',borderRadius:8,padding:7,cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',color:'#64748b'}}>
            <X size={16}/>
          </button>
        </div>

        <div style={{padding:'14px 20px 24px',display:'flex',flexDirection:'column',gap:14}}>

          {/* 2. Why this matters */}
          {whyText&&(
            <div style={{background:'#eff6ff',borderRadius:8,padding:'10px 14px',borderLeft:'3px solid #2563eb'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#1d4ed8',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>
                {type==='risk'?'Risk Detail':type==='decision'?'Context':type==='followUp'?'What Drops If Ignored':'Why This Matters'}
              </div>
              <div style={{fontSize:13,color:'#1e3a5f',lineHeight:1.65}}>{whyText}</div>
              {item.plantThisSeed&&<div style={{fontSize:12,color:'#2563eb',marginTop:6,fontStyle:'italic'}}>🌱 {item.plantThisSeed}</div>}
            </div>
          )}

          {/* 3. Drafted email (only for action types) */}
          {showEmail&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>Drafted Email</div>
              {!draftEmail&&!emailLoading&&(
                <button onClick={generateEmail} disabled={!apiKey}
                  style={{display:'flex',alignItems:'center',gap:6,background:'#f8fafc',border:'1px solid #e5e7eb',borderRadius:8,padding:'8px 14px',cursor:apiKey?'pointer':'not-allowed',fontSize:13,color:apiKey?'#374151':'#94a3b8',fontWeight:500,width:'100%',justifyContent:'center'}}>
                  <span style={{fontSize:15}}>✉️</span> {apiKey?'Generate Email Draft':'Add API key to enable'}
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
              {draftEmail?.error&&<div style={{fontSize:12,color:'#dc2626',background:'#fee2e2',borderRadius:7,padding:'8px 12px'}}>{draftEmail.error}</div>}
            </div>
          )}

          {/* 4. Quick notes (actToday only) */}
          {type==='actToday'&&(item.whileYouHaveThem?.length>0||item.upsairsKit||item.alert)&&(
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
                <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:7,padding:'8px 12px',display:'flex',gap:7,alignItems:'flex-start'}}>
                  <span style={{fontSize:12,flexShrink:0}}>💼</span>
                  <div style={{fontSize:12,color:'#92400e',lineHeight:1.55}}>{item.upsairsKit}</div>
                </div>
              )}
              {item.alert&&<div style={{fontSize:12,color:'#374151',lineHeight:1.5,marginTop:6}}>⚠️ {item.alert}</div>}
            </div>
          )}

          {item.urgencyReason&&type==='actToday'&&(
            <div style={{fontSize:12,color:'#64748b',fontStyle:'italic',borderTop:'1px solid #f8fafc',paddingTop:10}}>
              <span style={{fontWeight:700,color:'#9ca3af',fontSize:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Why today: </span>{item.urgencyReason}
            </div>
          )}

          {showToggle&&(
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
            <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:10}}>AI Assistant</div>
            {!apiKey?(
              <div style={{fontSize:12,color:'#94a3b8',fontStyle:'italic',background:'#f8fafc',borderRadius:7,padding:'10px 12px'}}>Add your Anthropic API key in Settings to enable AI chat.</div>
            ):(
              <>
                {chatMessages.length===0&&<div style={{fontSize:12,color:'#94a3b8',marginBottom:10,lineHeight:1.5}}>Ask anything about this item — strategy, angles, objections, timing...</div>}
                {chatMessages.length>0&&(
                  <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12,maxHeight:240,overflowY:'auto',padding:'2px 0'}}>
                    {chatMessages.map((m,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                        <div style={{maxWidth:'88%',background:m.role==='user'?'#1e3a5f':'#f1f5f9',color:m.role==='user'?'#fff':'#374151',borderRadius:m.role==='user'?'12px 12px 2px 12px':'12px 12px 12px 2px',padding:'8px 12px',fontSize:13,lineHeight:1.55,whiteSpace:'pre-wrap'}}>
                          {m.content}
                        </div>
                      </div>
                    ))}
                    {chatLoading&&<div style={{display:'flex',alignItems:'center',gap:6,color:'#94a3b8',fontSize:12}}><div style={{width:11,height:11,border:'2px solid #e2e8f0',borderTopColor:'#2563eb',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/> Thinking...</div>}
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

export default function DailyBrief({data, setData, apiKey, briefGenerating, briefError, onGenerateNow, onBack}) {
  const today = new Date().toISOString().split('T')[0]
  const briefs = data.dailyBriefs||[]
  const todayBrief = briefs.find(b=>b.date===today)||null
  const pastBriefs = briefs.filter(b=>b.date!==today).slice(0,29)

  const [selectedDate, setSelectedDate] = useState(today)
  const [detailModal, setDetailModal] = useState(null)
  const [briefCopied, setBriefCopied] = useState(false)

  const selectedBrief = briefs.find(b=>b.date===selectedDate)||null
  const isToday = selectedDate===today
  const mob = typeof window!=='undefined'&&window.innerWidth<768

  const toggleActToday = (briefDate, idx) => {
    setData(prev=>{
      const updated=(prev.dailyBriefs||[]).map(b=>{
        if(b.date!==briefDate) return b
        const items=(b.sections?.actToday||[]).map((item,i)=>i===idx?{...item,completedToday:!item.completedToday}:item)
        return{...b,sections:{...b.sections,actToday:items}}
      })
      return{...prev,dailyBriefs:updated}
    })
  }

  const {thisWeek, lastWeek, earlier} = groupBriefsByWeek(pastBriefs)
  const incompleteCount = (todayBrief&&!todayBrief.markdownContent)?(todayBrief.sections?.actToday||[]).filter(a=>!a.completedToday).length:0

  const briefNavRow = b => {
    const isSel = selectedDate===b.date
    return (
      <div key={b.date} onClick={()=>setSelectedDate(b.date)}
        style={{padding:'8px 12px',cursor:'pointer',borderRadius:6,margin:'1px 8px',background:isSel?'#eff6ff':'transparent',transition:'background 0.1s'}}
        onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='#f1f5f9'}}
        onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background='transparent'}}>
        <div style={{fontSize:13,fontWeight:600,color:isSel?'#1d4ed8':'#374151',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{fmt(b.date)}</div>
        {b.briefSummary&&<div style={{fontSize:10,color:'#94a3b8',marginTop:2,lineHeight:1.4,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{b.briefSummary.slice(0,80)}</div>}
      </div>
    )
  }

  const renderBrief = brief => {
    if (!brief) return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'55vh',flexDirection:'column',gap:14}}>
        {briefGenerating
          ? <><div style={{width:32,height:32,border:'3px solid #e2e8f0',borderTopColor:'#2563eb',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/><div style={{fontSize:14,color:'#64748b',marginTop:4}}>Generating your morning brief...</div></>
          : <div style={{textAlign:'center'}}>
              <div style={{fontSize:14,color:'#94a3b8',marginBottom:16}}>No brief yet for this date.</div>
              {isToday&&<button onClick={onGenerateNow} style={{padding:'9px 20px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>+ Generate Now</button>}
            </div>
        }
      </div>
    )

    // ── Plain-text brief (markdownContent format) ──────────────────────────────
    if (brief.markdownContent !== undefined) {
      const isPast = brief.date !== today
      const copyText = () => navigator.clipboard.writeText(brief.markdownContent)
        .then(()=>{setBriefCopied(true);setTimeout(()=>setBriefCopied(false),2000)}).catch(()=>{})
      const inlineBold = t => {
        if (!t.includes('**')) return t
        return t.split('**').map((p,i)=>i%2===1?<strong key={i} style={{fontWeight:700}}>{p}</strong>:p)
      }
      let k = 0
      const rendered = brief.markdownContent.split('\n').map(line => {
        const t = line.trim()
        if (!t) return <div key={k++} style={{height:5}}/>
        if (/^-{3,}$/.test(t)) return <div key={k++} style={{borderTop:'1px solid #f1f5f9',margin:'14px 0 10px'}}/>
        if (t.startsWith('# '))
          return <div key={k++} style={{fontSize:15,fontWeight:700,color:'#0f172a',letterSpacing:'-0.01em',
            paddingBottom:8,marginBottom:4,marginTop:22,borderBottom:'2px solid #e2e8f0'}}>{t.slice(2)}</div>
        if (t.startsWith('## '))
          return <div key={k++} style={{fontSize:11,fontWeight:700,color:'#64748b',letterSpacing:'0.07em',
            textTransform:'uppercase',marginTop:12,marginBottom:4}}>{t.slice(3)}</div>
        if (/^[-•*] /.test(t))
          return <div key={k++} style={{display:'flex',alignItems:'flex-start',gap:9,padding:'4px 6px'}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:'#cbd5e1',flexShrink:0,marginTop:6}}/>
            <div style={{fontSize:13,color:'#1e293b',lineHeight:1.55}}>{inlineBold(t.replace(/^[-•*] /,''))}</div>
          </div>
        if (/^\d+\. /.test(t))
          return <div key={k++} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'5px 6px'}}>
            <span style={{minWidth:20,height:20,borderRadius:'50%',background:'#1e3a5f',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,flexShrink:0,marginTop:1}}>{t.match(/^(\d+)/)[1]}</span>
            <div style={{fontSize:13,color:'#1e293b',lineHeight:1.55,fontWeight:500}}>{inlineBold(t.replace(/^\d+\. /,''))}</div>
          </div>
        return <div key={k++} style={{fontSize:13,color:'#374151',lineHeight:1.7,padding:'3px 6px'}}>{inlineBold(t)}</div>
      })
      return (
        <div style={{maxWidth:720}}>
          {isPast&&<div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'8px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
            <Sparkles size={13} color='#2563eb'/><span style={{fontSize:12,color:'#1d4ed8',fontWeight:500}}>Archived — {fmtFull(brief.date)}</span>
          </div>}
          <div style={{background:'#fff',borderRadius:12,border:'1px solid #e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,0.06)',overflow:'hidden'}}>
            <div style={{padding:mob?'16px 16px 12px':'24px 32px 18px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:5}}>Daily Executive Briefing</div>
                <div style={{fontSize:22,fontWeight:800,color:'#0f172a',letterSpacing:'-0.02em',lineHeight:1.2}}>
                  {isPast?fmtFull(brief.date):`Today — ${fmtFull(today)}`}
                </div>
                {brief.generatedAt&&<div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>Generated {fmtTime(brief.generatedAt)}</div>}
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0,alignItems:'center'}}>
                <button onClick={copyText} style={{display:'flex',alignItems:'center',gap:5,fontSize:12,fontWeight:600,
                  color:briefCopied?'#15803d':'#64748b',background:briefCopied?'#f0fdf4':'#f8fafc',
                  border:'1px solid',borderColor:briefCopied?'#86efac':'#e5e7eb',
                  borderRadius:7,padding:'5px 10px',cursor:'pointer',whiteSpace:'nowrap'}}>
                  <Copy size={12}/>{briefCopied?'Copied':'Copy'}
                </button>
                {!isPast&&<button onClick={onGenerateNow} disabled={briefGenerating}
                  style={{display:'flex',alignItems:'center',gap:5,fontSize:12,fontWeight:500,
                    color:briefGenerating?'#94a3b8':'#64748b',background:'#f8fafc',
                    border:'1px solid #e5e7eb',borderRadius:7,padding:'5px 10px',
                    cursor:briefGenerating?'not-allowed':'pointer',opacity:briefGenerating?0.5:1}}>
                  <RefreshCw size={12} style={{animation:briefGenerating?'spin 0.8s linear infinite':'none'}}/>
                  {briefGenerating?'Generating…':'Regenerate'}
                </button>}
              </div>
            </div>
            <div style={{padding:mob?'16px 16px 24px':'24px 32px 32px'}}>{rendered}</div>
          </div>
          <div style={{height:64}}/>
        </div>
      )
    }
    // ── End plain-text brief ────────────────────────────────────────────────────

    const {
      observedReality=[], keyDevelopments=[],
      actToday=[], moveForward=[], longGame=[],
      decisionsToMake=[], followUpsLooseThreads=[], risksWatchouts=[],
      efficiencyLeverage=[], renewalRadar=[], marketPulse=[], tomorrowLater=[]
    } = brief.sections||{}
    const isPast = brief.date!==today

    // Executive summary: first 4 sentences
    const rawSummary = brief.briefSummary||''
    const sentenceMatches = rawSummary.match(/[^.!?]*[.!?]+(?:\s|$)/g)||[]
    const shortSummary = (sentenceMatches.slice(0,4).join('').trim()||rawSummary.slice(0,500)).trim()

    const copyBrief = () => {
      const lines = [`Daily Executive Briefing — ${fmtFull(brief.date)}`,'']
      if(brief.observationWindow){lines.push(brief.observationWindow);lines.push('')}
      if(shortSummary){lines.push('EXECUTIVE SUMMARY');lines.push(shortSummary);lines.push('')}
      if(observedReality.length){lines.push('WHAT I WORKED ON');observedReality.forEach(g=>{if(g.category)lines.push(`  ${g.category.toUpperCase()}`);(g.bullets||[]).forEach(b=>lines.push(`  • ${b}`))});lines.push('')}
      if(keyDevelopments.length){lines.push('KEY DEVELOPMENTS & SIGNALS');keyDevelopments.forEach(k=>lines.push(`• ${k.label}: ${k.detail}`));lines.push('')}
      if(actToday.length){lines.push('MUST DO TODAY');actToday.forEach(i=>lines.push(`• ${i.account?i.account+' — ':''}${i.action}`));lines.push('')}
      if(moveForward.length){lines.push('SHOULD DO TODAY');moveForward.forEach(i=>lines.push(`• ${i.account?i.account+' — ':''}${i.action}`));lines.push('')}
      if(longGame.length){lines.push('NICE TO DO / PREP');longGame.forEach(i=>lines.push(`• ${i.account?i.account+' — ':''}${i.action}`));lines.push('')}
      if(decisionsToMake.length){lines.push('DECISIONS TO MAKE');decisionsToMake.forEach(d=>lines.push(`• ${d.decision}`));lines.push('')}
      if(followUpsLooseThreads.length){lines.push('FOLLOW-UPS & LOOSE THREADS');followUpsLooseThreads.forEach(f=>lines.push(`• ${f.account?f.account+': ':''}${f.item}`));lines.push('')}
      if(risksWatchouts.length){lines.push('RISKS & WATCHOUTS');risksWatchouts.forEach(r=>lines.push(`• ${r.label}: ${r.detail}`));lines.push('')}
      if(efficiencyLeverage.length){lines.push('EFFICIENCY & LEVERAGE');efficiencyLeverage.forEach(e=>lines.push(`• ${e.suggestion}`));lines.push('')}
      if(marketPulse.length){lines.push('MARKET PULSE');marketPulse.slice(0,3).forEach(m=>lines.push(`• ${m.headline}`));lines.push('')}
      if(renewalRadar.length){lines.push('RENEWALS');renewalRadar.forEach(r=>lines.push(`• ${r.vendor} — ${r.account}${r.daysUntil!=null?' ('+r.daysUntil+'d)':''}`));lines.push('')}
      if(tomorrowLater.length){lines.push('TOMORROW / LATER');tomorrowLater.forEach(t=>lines.push(`• ${t.account?t.account+': ':''}${t.item}`));lines.push('')}
      navigator.clipboard.writeText(lines.join('\n')).then(()=>{setBriefCopied(true);setTimeout(()=>setBriefCopied(false),2000)}).catch(()=>{})
    }

    const hasContent = actToday.length||moveForward.length||longGame.length||renewalRadar.length||marketPulse.length||
      observedReality.length||keyDevelopments.length||decisionsToMake.length||followUpsLooseThreads.length||
      risksWatchouts.length||efficiencyLeverage.length||tomorrowLater.length

    const openModal = (item, type, idx, briefDate) => setDetailModal({item,type,idx,briefDate})

    return (
      <div style={{maxWidth:720}}>
        {isPast&&(
          <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'8px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
            <Sparkles size={13} color='#2563eb'/>
            <span style={{fontSize:12,color:'#1d4ed8',fontWeight:500}}>Archived — {fmtFull(brief.date)}</span>
          </div>
        )}

        {/* Document card */}
        <div style={{background:'#fff',borderRadius:12,border:'1px solid #e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,0.06)',overflow:'hidden'}}>

          {/* ── Card header ── */}
          <div style={{padding:mob?'16px 16px 12px':'24px 32px 18px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:5}}>
                Daily Executive Briefing
              </div>
              <div style={{fontSize:22,fontWeight:800,color:'#0f172a',letterSpacing:'-0.02em',lineHeight:1.2}}>
                {isToday?`Today — ${fmtFull(today)}`:fmtFull(brief.date)}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4,flexWrap:'wrap'}}>
                {brief.generatedAt&&<div style={{fontSize:11,color:'#94a3b8'}}>Generated {fmtTime(brief.generatedAt)}</div>}
                {brief.observationWindow&&<><span style={{fontSize:11,color:'#cbd5e1'}}>·</span><div style={{fontSize:11,color:'#94a3b8'}}>{brief.observationWindow}</div></>}
              </div>
            </div>
            <div style={{display:'flex',gap:6,flexShrink:0,alignItems:'center'}}>
              {hasContent&&(
                <button onClick={copyBrief}
                  style={{display:'flex',alignItems:'center',gap:5,fontSize:12,fontWeight:600,
                    color:briefCopied?'#15803d':'#64748b',background:briefCopied?'#f0fdf4':'#f8fafc',
                    border:'1px solid',borderColor:briefCopied?'#86efac':'#e5e7eb',
                    borderRadius:7,padding:'5px 10px',cursor:'pointer',whiteSpace:'nowrap'}}>
                  <Copy size={12}/>{briefCopied?'Copied':'Copy'}
                </button>
              )}
              {isToday&&(
                <button onClick={onGenerateNow} disabled={briefGenerating}
                  style={{display:'flex',alignItems:'center',gap:5,fontSize:12,fontWeight:500,
                    color:briefGenerating?'#94a3b8':'#64748b',background:'#f8fafc',
                    border:'1px solid #e5e7eb',borderRadius:7,padding:'5px 10px',
                    cursor:briefGenerating?'not-allowed':'pointer',opacity:briefGenerating?0.5:1}}>
                  <RefreshCw size={12} style={{animation:briefGenerating?'spin 0.8s linear infinite':'none'}}/>
                  {briefGenerating?'Generating…':'Regenerate'}
                </button>
              )}
            </div>
          </div>

          {/* ── Document body ── */}
          <div style={{padding:mob?'16px 16px 24px':'24px 32px 32px'}}>

            {/* 2. Executive Summary */}
            {shortSummary&&(
              <div style={{marginBottom:28}}>
                <SectionHead>Executive Summary</SectionHead>
                <div style={{fontSize:14,color:'#374151',lineHeight:1.8}}>{shortSummary}</div>
              </div>
            )}

            {/* 3. What I Worked On / Observed Reality */}
            {observedReality.length>0&&(
              <div style={{marginBottom:28}}>
                <SectionHead>What I Worked On</SectionHead>
                {observedReality.map((group,gi)=>(
                  <div key={gi} style={{marginBottom:gi<observedReality.length-1?10:0}}>
                    {group.category&&(group.bullets||[]).length>0&&<SubHead>{group.category}</SubHead>}
                    {(group.bullets||[]).map((bullet,bi)=>(
                      <BulletRow key={bi} dot='#94a3b8' noChevron>{bullet}</BulletRow>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* 4. Key Developments & Signals */}
            {keyDevelopments.length>0&&(
              <div style={{marginBottom:28}}>
                <SectionHead accent='#f59e0b'>Key Developments & Signals</SectionHead>
                {keyDevelopments.slice(0,6).map((kd,idx)=>(
                  <div key={idx} onClick={()=>openModal(kd,'keyDev',idx)}
                    style={{display:'flex',alignItems:'flex-start',gap:9,padding:'7px 6px',borderRadius:5,cursor:'pointer',transition:'background 0.1s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#f9fafb'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{width:5,height:5,borderRadius:'50%',background:'#f59e0b',flexShrink:0,marginTop:7}}/>
                    <div style={{flex:1,minWidth:0,fontSize:13,color:'#1e293b',lineHeight:1.55}}>
                      <strong style={{fontWeight:700}}>{kd.label}:</strong> {kd.detail}
                    </div>
                    <ChevronRight size={12} color='#d1d5db' style={{flexShrink:0,marginTop:3}}/>
                  </div>
                ))}
              </div>
            )}

            {/* 5. Today's Action Items */}
            {(actToday.length>0||moveForward.length>0||longGame.length>0)&&(
              <div style={{marginBottom:28}}>
                <SectionHead accent='#ef4444'>Today's Action Items</SectionHead>

                {actToday.length>0&&(
                  <>
                    <SubHead>Must Do Today</SubHead>
                    {actToday.slice(0,3).map((item,idx)=>(
                      <ActionRow key={idx} item={item} type='actToday' isPast={isPast}
                        onToggle={()=>toggleActToday(brief.date,idx)}
                        onClick={()=>openModal(item,'actToday',idx,brief.date)}/>
                    ))}
                  </>
                )}

                {moveForward.length>0&&(
                  <>
                    <SubHead>Should Do Today</SubHead>
                    {moveForward.slice(0,5).map((item,idx)=>(
                      <ActionRow key={idx} item={item} type='moveForward' isPast={isPast}
                        onClick={()=>openModal(item,'moveForward',idx)}/>
                    ))}
                  </>
                )}

                {longGame.length>0&&(
                  <>
                    <SubHead>Nice to Do / Prep</SubHead>
                    {longGame.slice(0,3).map((item,idx)=>(
                      <ActionRow key={idx} item={item} type='longGame' isPast={isPast}
                        onClick={()=>openModal(item,'longGame',idx)}/>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* 6. Decisions I Need to Make */}
            {decisionsToMake.length>0&&(
              <div style={{marginBottom:28}}>
                <SectionHead>Decisions I Need to Make</SectionHead>
                {decisionsToMake.slice(0,5).map((d,idx)=>(
                  <div key={idx} onClick={()=>openModal(d,'decision',idx)}
                    style={{display:'flex',alignItems:'flex-start',gap:9,padding:'7px 6px',borderRadius:5,cursor:'pointer',transition:'background 0.1s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#f9fafb'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{width:5,height:5,borderRadius:'50%',background:'#8b5cf6',flexShrink:0,marginTop:7}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,color:'#1e293b',lineHeight:1.55,fontWeight:500}}>{d.decision}</div>
                      {d.context&&<div style={{fontSize:11,color:'#64748b',marginTop:2,lineHeight:1.35,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.context}</div>}
                    </div>
                    <ChevronRight size={12} color='#d1d5db' style={{flexShrink:0,marginTop:3}}/>
                  </div>
                ))}
              </div>
            )}

            {/* 7. Follow-Ups & Loose Threads */}
            {followUpsLooseThreads.length>0&&(
              <div style={{marginBottom:28}}>
                <SectionHead accent='#f59e0b'>Follow-Ups &amp; Loose Threads</SectionHead>
                {followUpsLooseThreads.slice(0,6).map((f,idx)=>{
                  const modalItem = {
                    ...f,
                    action: f.item,
                    account: f.account||'',
                    clientFirstAngle: f.risk||'',
                    contact: '',
                  }
                  return(
                    <div key={idx} onClick={()=>openModal(modalItem,'followUp',idx)}
                      style={{display:'flex',alignItems:'flex-start',gap:9,padding:'7px 6px',borderRadius:5,cursor:'pointer',transition:'background 0.1s'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#f9fafb'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:'#f59e0b',flexShrink:0,marginTop:7}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,color:'#1e293b',lineHeight:1.55}}>
                          {f.account&&<strong style={{fontWeight:700}}>{f.account}: </strong>}
                          {f.item}
                        </div>
                        {f.risk&&<div style={{fontSize:11,color:'#dc2626',marginTop:2,lineHeight:1.35,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.risk}</div>}
                      </div>
                      <ChevronRight size={12} color='#d1d5db' style={{flexShrink:0,marginTop:3}}/>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 8. Risks, Blind Spots & Watchouts */}
            {risksWatchouts.length>0&&(
              <div style={{marginBottom:28}}>
                <SectionHead accent='#ef4444'>Risks, Blind Spots &amp; Watchouts</SectionHead>
                {risksWatchouts.slice(0,5).map((r,idx)=>(
                  <div key={idx} onClick={()=>openModal(r,'risk',idx)}
                    style={{display:'flex',alignItems:'flex-start',gap:9,padding:'7px 6px',borderRadius:5,cursor:'pointer',transition:'background 0.1s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#f9fafb'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{width:5,height:5,borderRadius:'50%',background:'#ef4444',flexShrink:0,marginTop:7}}/>
                    <div style={{flex:1,minWidth:0,fontSize:13,color:'#1e293b',lineHeight:1.55}}>
                      <strong style={{fontWeight:700}}>{r.label}: </strong>{r.detail}
                      {r.account&&<span style={{fontSize:11,color:'#94a3b8',marginLeft:6}}>· {r.account}</span>}
                    </div>
                    <ChevronRight size={12} color='#d1d5db' style={{flexShrink:0,marginTop:3}}/>
                  </div>
                ))}
              </div>
            )}

            {/* 9. Efficiency & Leverage */}
            {efficiencyLeverage.length>0&&(
              <div style={{marginBottom:28}}>
                <SectionHead accent='#22c55e'>Efficiency &amp; Leverage</SectionHead>
                {efficiencyLeverage.slice(0,4).map((e,idx)=>(
                  <div key={idx} style={{display:'flex',alignItems:'flex-start',gap:9,padding:'6px 6px'}}>
                    <span style={{color:'#22c55e',fontSize:12,flexShrink:0,marginTop:2}}>↗</span>
                    <div style={{fontSize:13,color:'#374151',lineHeight:1.55}}>{e.suggestion}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 10. Market Pulse */}
            {marketPulse.length>0&&(
              <div style={{marginBottom:28}}>
                <SectionHead>Market Pulse</SectionHead>
                {marketPulse.slice(0,3).map((item,idx)=>(
                  <div key={idx} onClick={()=>openModal(item,'marketPulse',idx)}
                    style={{display:'flex',alignItems:'flex-start',gap:9,padding:'7px 6px',borderRadius:5,cursor:'pointer',transition:'background 0.1s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#f9fafb'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{width:5,height:5,borderRadius:'50%',background:'#2563eb',flexShrink:0,marginTop:6}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,color:'#0f172a',fontWeight:600,lineHeight:1.45,
                        display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{item.headline}</div>
                      {item.relevance&&<div style={{fontSize:11,color:'#6b7280',marginTop:2,lineHeight:1.35,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.relevance}</div>}
                    </div>
                    <ChevronRight size={12} color='#d1d5db' style={{flexShrink:0,marginTop:2}}/>
                  </div>
                ))}
              </div>
            )}

            {/* Renewal Radar */}
            {renewalRadar.length>0&&(
              <div style={{marginBottom:28}}>
                <SectionHead>Renewal Radar</SectionHead>
                {renewalRadar.slice(0,8).map((item,idx)=>{
                  const dot=item.daysUntil!=null&&item.daysUntil<30?'#ef4444':item.daysUntil!=null&&item.daysUntil<60?'#f59e0b':'#22c55e'
                  return(
                    <div key={idx} onClick={()=>openModal(item,'renewalRadar',idx)}
                      style={{display:'flex',alignItems:'center',gap:9,padding:'7px 6px',borderRadius:5,cursor:'pointer',transition:'background 0.1s'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#f9fafb'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:dot,flexShrink:0}}/>
                      <span style={{fontSize:13,color:'#111827',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        <strong>{item.vendor}</strong> — {item.account}
                        {item.inConversation!=null&&<span style={{fontSize:11,color:item.inConversation?'#15803d':'#dc2626',marginLeft:8,fontWeight:600}}>{item.inConversation?'Active':'At Risk'}</span>}
                      </span>
                      {item.daysUntil!=null&&<span style={{fontSize:11,fontWeight:700,color:dot,flexShrink:0}}>{item.daysUntil}d</span>}
                      {item.annualCost&&<span style={{fontSize:11,color:'#94a3b8',flexShrink:0}}>{item.annualCost}</span>}
                      <ChevronRight size={12} color='#d1d5db' style={{flexShrink:0}}/>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 11. Tomorrow / Later */}
            {tomorrowLater.length>0&&(
              <div style={{marginBottom:4}}>
                <SectionHead>Tomorrow / Later</SectionHead>
                {tomorrowLater.slice(0,3).map((t,idx)=>(
                  <div key={idx} style={{display:'flex',alignItems:'flex-start',gap:9,padding:'6px 6px'}}>
                    <span style={{width:5,height:5,borderRadius:'50%',background:'#94a3b8',flexShrink:0,marginTop:7}}/>
                    <div style={{fontSize:13,color:'#64748b',lineHeight:1.55}}>
                      {t.account&&<strong style={{fontWeight:700,color:'#374151'}}>{t.account}: </strong>}
                      {t.item}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!hasContent&&(
              <div style={{textAlign:'center',padding:'20px 0',color:'#94a3b8',fontSize:13}}>
                Brief was generated but contains no content sections.
              </div>
            )}

          </div>
        </div>
        <div style={{height:64}}/>
      </div>
    )
  }

  return (
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
        <Sparkles size={15} color='#60a5fa'/>
        <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>Daily Brief</span>
      </div>

      {/* BODY */}
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* LEFT NAV — hidden on mobile */}
        {!mob&&(
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
        )}

        {/* MAIN CONTENT */}
        <div style={{flex:1,overflowY:'auto',padding:mob?'16px 16px 60px':'28px 36px',WebkitOverflowScrolling:'touch'}}>
          {briefError&&(
            <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 14px',marginBottom:20,color:'#dc2626',fontSize:13,display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:720}}>
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
          setData={setData}
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
