import { useState, useRef, useEffect } from 'react'
import { S } from '../theme.js'
import { uid, fmtDate } from '../utils.js'
import { STAGES, PROJ_STATS } from '../constants.js'

// callClaudeWithRetry is defined in App.jsx — we duplicate or extract it here
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
        console.log(`[Claude] Overloaded — retrying in ${delay}ms (attempt ${attempt+1}/${maxRetries})`)
        if (onStatus) onStatus(`API busy — retrying in ${Math.round(delay/1000)}s… (${attempt+2}/${maxRetries})`)
        await new Promise(r=>setTimeout(r,delay))
        continue
      }
      throw new Error('OVERLOADED')
    }
    if (onStatus) onStatus(null)
    return {res,data}
  }
  throw new Error('OVERLOADED')
}

const CHAT_INPUT_MAX = 4000

export default function AIChatModal({acct, setAcct, effectiveKey, onClose, initialMessages=[], initialPinned=[], initialSessionId=null}) {
  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fuFormFor, setFuFormFor] = useState(null)
  const [projFormFor, setProjFormFor] = useState(null)
  const [fuForm, setFuForm] = useState({task:'',priority:'High',dueDate:'',contact:''})
  const [projForm, setProjForm] = useState({name:'',category:'',status:'Not Started',notes:''})
  const [fuSaved, setFuSaved] = useState(new Set())
  const [projSaved, setProjSaved] = useState(new Set())
  const [showHistory, setShowHistory] = useState(false)
  const [pinnedMsgs, setPinnedMsgs] = useState(new Set(initialPinned))
  const [viewingSession, setViewingSession] = useState(null)
  const [currentSessionId] = useState(()=>initialSessionId||uid())
  const messagesEndRef = useRef(null)

  useEffect(()=>{messagesEndRef.current?.scrollIntoView({behavior:'smooth'})},[messages,loading])

  const SYSTEM_PROMPT = `You are an account intelligence assistant for a cybersecurity sales rep at GuidePoint Security. You have been given detailed information about a specific account. Answer questions ONLY based on the information provided about this account. Do not use outside knowledge about vendors, companies, or cybersecurity beyond what is in the account data. Be concise, direct, and actionable. If the answer is not in the account data, say so clearly. Never make up information not present in the account context.

Format every response as follows — NO EXCEPTIONS:

First: A concise written explanation, maximum 6 sentences, written in natural prose (no bullet points in this section). This should directly answer the question with context, nuance, and narrative flow. Write it as a trusted advisor would explain something to a colleague.

Then: A blank line separator.

Then: Key information as bullet points. Each bullet should be a single crisp fact, data point, name, date, or action item. Maximum 8 bullets. Start each bullet with a relevant emoji that matches the content type:
📅 for dates and deadlines
👤 for people and contacts
💰 for revenue, pricing, deals
⚠️ for risks and concerns
✅ for completed items or wins
🎯 for opportunities and next steps
🔄 for renewals and recurring items
📋 for projects and initiatives

Do not use headers. Do not use bold text. Do not start the prose section with 'I' or 'Based on'. Write the prose section first, bullets second, nothing else.`

  const SUGGESTED = [
    "What are the biggest risks in this account right now?",
    "What follow-ups are most overdue and why do they matter?",
    "Summarize all interactions with the CISO",
    "What projects are stalled and what is blocking them?"
  ]

  const buildContext = () => {
    const a = acct
    let ctx = `ACCOUNT: ${a.name}${a.short ? ` (${a.short})` : ''}\n`
    ctx += `Industry: ${a.industry||'N/A'} | HQ: ${a.hq||'N/A'} | Status: ${a.status||'N/A'}\n`
    if(a.notes) ctx += `Account Notes: ${a.notes}\n`
    ctx += '\n'
    if((a.contacts||[]).length) {
      ctx += 'CONTACTS:\n'
      a.contacts.forEach(c => {
        ctx += `- ${c.name} (${c.title}): Influence=${c.influence}, Relationship=${c.relStatus}, Sentiment=${c.sentiment}`
        if(c.lastInteracted) ctx += `, Last contacted=${c.lastInteracted}`
        if(c.goals) ctx += `\n  Goals: ${c.goals}`
        if(c.pains) ctx += `\n  Pains: ${c.pains}`
        if(c.notes) ctx += `\n  Notes: ${c.notes}`
        if(c.personalNotes) ctx += `\n  Personal: ${c.personalNotes}`
        ctx += '\n'
      })
      ctx += '\n'
    }
    if((a.techStack||[]).length) {
      ctx += 'TECH STACK:\n'
      a.techStack.forEach(t => {
        const vd = t.products ? `${t.vendor} (${t.products})` : t.vendor
        ctx += `- ${vd}: Category=${t.category}, Status=${t.status}`
        if(t.renewalDate) ctx += `, Renewal=${t.renewalDate}`
        if(t.cost) ctx += `, Cost=${t.cost}`
        if(t.clientOwner) ctx += `, Owner=${t.clientOwner}`
        if(t.notes) ctx += `\n  Notes: ${t.notes}`
        ctx += '\n'
      })
      ctx += '\n'
    }
    if((a.projects||[]).length) {
      ctx += 'PROJECTS:\n'
      a.projects.forEach(p => {
        const currSt = p.timeline?.find(s=>s.status==='current')?.stage || p.timeline?.filter(s=>s.status==='completed').slice(-1)[0]?.stage || 'N/A'
        ctx += `- ${p.name}: Status=${p.status}, Stage=${currSt}, Vendor=${p.vendor||'N/A'}, Contact=${p.primaryContact||'N/A'}`
        if(p.goals) ctx += `\n  Goals: ${p.goals}`
        if(p.pains) ctx += `\n  Pains: ${p.pains}`
        if(p.nextAction) ctx += `\n  Next Action: ${p.nextAction}`
        if(p.waitingOn) ctx += `\n  Waiting On: ${p.waitingOn}`
        if(p.notes) ctx += `\n  Notes: ${p.notes}`
        ctx += '\n'
      })
      ctx += '\n'
    }
    const openFUs = (a.followUps||[]).filter(f=>f.status==='Open')
    if(openFUs.length) {
      ctx += 'OPEN FOLLOW-UPS:\n'
      openFUs.forEach(f => {
        ctx += `- ${f.task}: Priority=${f.priority}, Due=${f.dueDate||'N/A'}, Contact=${f.contact||'N/A'}`
        if(f.context) ctx += `, Context: ${f.context}`
        ctx += '\n'
      })
      ctx += '\n'
    }
    if((a.intelLog||[]).length) {
      ctx += 'INTEL LOG:\n'
      a.intelLog.forEach(e => {
        ctx += `- [${e.date||''}] ${e.type||'Note'} — ${e.participants||''}: ${e.summary||''}\n`
        if((e.insights||[]).length) ctx += `  Insights: ${e.insights.join('; ')}\n`
        if((e.risks||[]).length) ctx += `  Risks: ${e.risks.join('; ')}\n`
        if((e.opportunities||[]).length) ctx += `  Opportunities: ${e.opportunities.join('; ')}\n`
      })
      ctx += '\n'
    }
    if((a.interactions||[]).length) {
      ctx += 'INTERACTIONS:\n'
      a.interactions.forEach(i => {
        ctx += `- [${i.date||''}] ${i.type||'Note'} — ${i.contact||''}: ${i.summary||''}`
        if(i.topics) ctx += ` | Topics: ${i.topics}`
        ctx += '\n'
      })
    }
    return ctx
  }

  const saveSession = (msgs, pinned) => {
    if (!msgs.some(m=>m.role==='user')) return
    const session = {
      id: currentSessionId,
      date: new Date().toISOString(),
      title: (msgs.find(m=>m.role==='user')?.content||'Chat Session').slice(0,60),
      messages: msgs.map(m=>({...m, timestamp:m.timestamp instanceof Date?m.timestamp.toISOString():m.timestamp})),
      pinned: false,
      pinnedMessages: [...pinned]
    }
    setAcct(prev=>{
      const existing=(prev.aiHistory||[]).filter(s=>s.id!==currentSessionId)
      return {...prev, aiHistory:[session,...existing]}
    })
  }

  const handleClose = () => { saveSession(messages, pinnedMsgs); onClose() }

  const handleNewChat = () => {
    saveSession(messages, pinnedMsgs)
    setMessages([]); setPinnedMsgs(new Set()); setViewingSession(null)
    setFuFormFor(null); setProjFormFor(null); setError(null)
  }

  const togglePin = (msgId) => {
    setPinnedMsgs(prev=>{ const n=new Set(prev); n.has(msgId)?n.delete(msgId):n.add(msgId); return n })
  }

  const togglePinInSession = (session, msgId) => {
    const cur = session.pinnedMessages||[]
    const next = cur.includes(msgId)?cur.filter(id=>id!==msgId):[...cur,msgId]
    setAcct(prev=>({...prev,aiHistory:(prev.aiHistory||[]).map(s=>s.id===session.id?{...s,pinnedMessages:next}:s)}))
    setViewingSession(s=>({...s,pinnedMessages:next}))
  }

  const toggleSessionPin = (sessionId) => {
    setAcct(prev=>({...prev,aiHistory:(prev.aiHistory||[]).map(s=>s.id===sessionId?{...s,pinned:!s.pinned}:s)}))
  }

  const callAPI = async (msgs) => {
    setLoading(true)
    setError(null)
    try {
      const firstUserIdx = msgs.findIndex(m=>m.role==='user')
      const apiMessages = msgs.map((m,i) => ({
        role: m.role,
        content: i===firstUserIdx ? `Here is the account data:\n\n${buildContext()}\n\nQuestion: ${m.content}` : m.content
      }))
      const {data} = await callClaudeWithRetry(
        {model:'claude-sonnet-4-6', max_tokens:2000, system:SYSTEM_PROMPT, messages:apiMessages},
        effectiveKey, null
      )
      if(data.error) throw new Error(data.error.type==='overloaded_error'?'Anthropic API is busy. Please wait 30 seconds and try again.':data.error.message)
      const aiText = data.content?.[0]?.text || 'No response received.'
      setMessages(prev=>[...prev, {id:uid(), role:'assistant', content:aiText, timestamp:new Date()}])
    } catch(e) {
      setError(e.message==='OVERLOADED'?'Anthropic API is busy. Please wait 30 seconds and try again.':(e.message || 'API error. Check your API key in Settings.'))
    }
    setLoading(false)
  }

  const sendMessage = async (msgText) => {
    if(!msgText.trim() || loading) return
    if(msgText.length > CHAT_INPUT_MAX) { setError(`Message is too long (${msgText.length} chars). Maximum is ${CHAT_INPUT_MAX} characters.`); return }
    const userMsg = {id:uid(), role:'user', content:msgText.trim(), timestamp:new Date()}
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')
    await callAPI(newMsgs)
  }

  const fmtTime = d => { try { const dt=d instanceof Date?d:new Date(d); return dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) } catch { return '' } }

  const saveFU = (msgId) => {
    if(!fuForm.task.trim()) return
    setAcct(prev=>({...prev, followUps:[...(prev.followUps||[]), {...fuForm, id:uid(), status:'Open'}]}))
    setFuSaved(prev=>new Set([...prev, msgId]))
    setFuFormFor(null)
  }

  const saveProj = (msgId) => {
    if(!projForm.name.trim()) return
    setAcct(prev=>({...prev, projects:[...(prev.projects||[]), {
      id:uid(), name:projForm.name, category:projForm.category||'', vendor:'',
      status:projForm.status, description:'', goals:'', pains:'', primaryContact:'',
      budget:false, closeDate:'', notes:projForm.notes||'', waitingOn:'', nextAction:'',
      timeline:STAGES.map(s=>({stage:s,status:'pending',date:''}))
    }]}))
    setProjSaved(prev=>new Set([...prev, msgId]))
    setProjFormFor(null)
  }

  const iBtn = (color) => ({fontSize:11,color,background:color+'1a',border:`1px solid ${color}44`,borderRadius:5,padding:'4px 10px',cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'})

  const sessions = (acct.aiHistory||[]).slice().sort((a,b)=>{if(a.pinned&&!b.pinned)return -1;if(!a.pinned&&b.pinned)return 1;return b.date.localeCompare(a.date)})
  const displayMessages = viewingSession ? viewingSession.messages : messages
  const displayPinned = viewingSession ? new Set(viewingSession.pinnedMessages||[]) : pinnedMsgs

  const renderMsgBubbles = (msgs, pinned, isViewing) => msgs.map(msg=>{
    const isUser = msg.role==='user'
    const isPinned = pinned.has(msg.id)
    return (
      <div key={msg.id}>
        <div style={{display:'flex',alignItems:'flex-start',gap:10,flexDirection:isUser?'row-reverse':'row'}}>
          <div style={{width:30,height:30,borderRadius:'50%',background:isUser?S.blue:'rgba(168,85,247,0.18)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:isUser?'#fff':S.purple,flexShrink:0}}>{isUser?'MC':'AI'}</div>
          <div style={{maxWidth:'72%',background:isUser?S.blue:S.surf2,border:isUser?'none':`1px solid ${isPinned?'#eab308':S.bdr}`,borderLeft:!isUser&&isPinned?'3px solid #eab308':undefined,borderRadius:isUser?'12px 12px 2px 12px':'12px 12px 12px 2px',padding:'10px 14px'}}>
            <div style={{fontSize:13,color:isUser?'#fff':S.txt,lineHeight:1.65,whiteSpace:'pre-wrap'}}>{msg.content}</div>
            <div style={{fontSize:10,color:isUser?'rgba(255,255,255,0.55)':S.muted,marginTop:4,textAlign:isUser?'right':'left'}}>{fmtTime(msg.timestamp)}</div>
          </div>
        </div>
        {!isUser&&(
          <div style={{paddingLeft:40,marginTop:8,display:'flex',flexDirection:'column',gap:8}}>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {isViewing
                ?<button onClick={()=>togglePinInSession(viewingSession,msg.id)} style={iBtn(isPinned?'#eab308':S.muted)}>{isPinned?'★ Pinned':'☆ Pin'}</button>
                :<>
                  <button onClick={()=>togglePin(msg.id)} style={iBtn(isPinned?'#eab308':S.muted)}>{isPinned?'★ Pinned':'☆ Pin'}</button>
                  <button onClick={()=>{const open=fuFormFor===msg.id;setFuFormFor(open?null:msg.id);setProjFormFor(null);if(!open)setFuForm({task:msg.content.slice(0,80),priority:'High',dueDate:'',contact:''})}} style={iBtn(S.blue)}>{fuSaved.has(msg.id)?'✓ Follow-Up Saved':'＋ Add as Follow-Up'}</button>
                  <button onClick={()=>{const open=projFormFor===msg.id;setProjFormFor(open?null:msg.id);setFuFormFor(null);if(!open)setProjForm({name:msg.content.slice(0,60),category:'',status:'Not Started',notes:msg.content.slice(0,200)})}} style={iBtn(S.purple)}>{projSaved.has(msg.id)?'✓ Project Saved':'＋ Add as Project'}</button>
                </>
              }
            </div>
            {!isViewing&&fuFormFor===msg.id&&(
              <div style={{background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:8,padding:'12px 14px',maxWidth:460}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:S.txt,textTransform:'uppercase',letterSpacing:'0.06em'}}>New Follow-Up</div>
                  <button onClick={()=>setFuFormFor(null)} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:18,lineHeight:1}}>×</button>
                </div>
                <div style={{marginBottom:7}}>
                  <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Task</div>
                  <textarea value={fuForm.task} onChange={e=>setFuForm(p=>({...p,task:e.target.value}))} rows={2} style={{width:'100%',fontSize:12,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'5px 8px',color:S.txt,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit'}}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7,marginBottom:7}}>
                  <div>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Priority</div>
                    <select value={fuForm.priority} onChange={e=>setFuForm(p=>({...p,priority:e.target.value}))} style={{width:'100%',fontSize:12,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'5px 7px',color:S.txt}}>
                      {['Critical','High','Medium','Low'].map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Due Date</div>
                    <input type='date' value={fuForm.dueDate} onChange={e=>setFuForm(p=>({...p,dueDate:e.target.value}))} style={{width:'100%',fontSize:12,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'5px 7px',color:S.txt,boxSizing:'border-box'}}/>
                  </div>
                </div>
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Contact</div>
                  <input value={fuForm.contact} onChange={e=>setFuForm(p=>({...p,contact:e.target.value}))} placeholder='Contact name...' style={{width:'100%',fontSize:12,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'5px 7px',color:S.txt,boxSizing:'border-box'}}/>
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>saveFU(msg.id)} style={{padding:'6px 14px',background:S.blue,border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save Follow-Up</button>
                  <button onClick={()=>setFuFormFor(null)} style={{padding:'6px 10px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,fontSize:12,cursor:'pointer'}}>Cancel</button>
                </div>
              </div>
            )}
            {!isViewing&&projFormFor===msg.id&&(
              <div style={{background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:8,padding:'12px 14px',maxWidth:460}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:S.txt,textTransform:'uppercase',letterSpacing:'0.06em'}}>New Project</div>
                  <button onClick={()=>setProjFormFor(null)} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:18,lineHeight:1}}>×</button>
                </div>
                <div style={{marginBottom:7}}>
                  <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Project Name</div>
                  <input value={projForm.name} onChange={e=>setProjForm(p=>({...p,name:e.target.value}))} style={{width:'100%',fontSize:12,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'5px 7px',color:S.txt,boxSizing:'border-box'}}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7,marginBottom:7}}>
                  <div>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Category</div>
                    <input value={projForm.category} onChange={e=>setProjForm(p=>({...p,category:e.target.value}))} placeholder='e.g. MDR, CSPM...' style={{width:'100%',fontSize:12,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'5px 7px',color:S.txt,boxSizing:'border-box'}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Status</div>
                    <select value={projForm.status} onChange={e=>setProjForm(p=>({...p,status:e.target.value}))} style={{width:'100%',fontSize:12,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'5px 7px',color:S.txt}}>
                      {PROJ_STATS.map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Notes</div>
                  <textarea value={projForm.notes} onChange={e=>setProjForm(p=>({...p,notes:e.target.value}))} rows={3} style={{width:'100%',fontSize:12,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'5px 8px',color:S.txt,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit'}}/>
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>saveProj(msg.id)} style={{padding:'6px 14px',background:S.blue,border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save Project</button>
                  <button onClick={()=>setProjFormFor(null)} style={{padding:'6px 10px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,fontSize:12,cursor:'pointer'}}>Cancel</button>
                </div>
              </div>
            )}
            {!isViewing&&fuSaved.has(msg.id)&&fuFormFor!==msg.id&&<div style={{fontSize:11,color:S.green}}>✓ Follow-up saved to Follow-Ups tab</div>}
            {!isViewing&&projSaved.has(msg.id)&&projFormFor!==msg.id&&<div style={{fontSize:11,color:S.green}}>✓ Project saved to Projects tab</div>}
          </div>
        )}
      </div>
    )
  })

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}} onClick={e=>{if(e.target===e.currentTarget)handleClose()}}>
      <style>{`@keyframes dot-pulse{0%,80%,100%{transform:translateY(0);opacity:0.5}40%{transform:translateY(-5px);opacity:1}}`}</style>
      <div style={{width:'70vw',height:'70vh',background:S.surf,borderRadius:12,display:'flex',flexDirection:'row',overflow:'hidden',border:`1px solid ${S.bdr}`,boxShadow:'0 24px 80px rgba(0,0,0,0.7)'}}>

        {/* History side panel */}
        {showHistory&&(
          <div style={{width:280,flexShrink:0,borderRight:`1px solid ${S.bdr}`,display:'flex',flexDirection:'column',background:S.surf2}}>
            <div style={{padding:'13px 14px',borderBottom:`1px solid ${S.bdr}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <span style={{fontSize:12,fontWeight:700,color:S.txt}}>Chat History</span>
              <button onClick={()=>{setShowHistory(false);setViewingSession(null)}} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:18,lineHeight:1}}>×</button>
            </div>
            <div style={{flex:1,overflowY:'auto'}}>
              {sessions.length===0&&<div style={{padding:'24px 14px',fontSize:12,color:S.muted,textAlign:'center'}}>No chat history yet.<br/>Start a conversation to build history.</div>}
              {sessions.map(s=>{
                const isVw=viewingSession?.id===s.id
                return (
                  <div key={s.id} onClick={()=>setViewingSession(s)}
                    style={{padding:'10px 14px',borderBottom:`1px solid ${S.bdr}`,borderLeft:s.pinned?'3px solid #eab308':'3px solid transparent',background:isVw?S.surf:'transparent',cursor:'pointer',transition:'background 0.1s'}}
                    onMouseEnter={e=>{if(!isVw)e.currentTarget.style.background=S.surf+'aa'}}
                    onMouseLeave={e=>{if(!isVw)e.currentTarget.style.background='transparent'}}>
                    <div style={{display:'flex',alignItems:'flex-start',gap:6,marginBottom:3}}>
                      <button onClick={e=>{e.stopPropagation();toggleSessionPin(s.id)}} style={{background:'none',border:'none',cursor:'pointer',fontSize:13,padding:0,flexShrink:0,marginTop:1,color:s.pinned?'#eab308':S.dim}}>{s.pinned?'★':'☆'}</button>
                      <span style={{fontSize:12,fontWeight:600,color:S.txt,lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{s.title}</span>
                    </div>
                    <div style={{fontSize:10,color:S.muted,paddingLeft:19}}>{fmtDate(s.date.split('T')[0])} · {s.messages.length} msg{s.messages.length!==1?'s':''}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Main chat area */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
          {/* Header */}
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'13px 18px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0}}>
            <span style={{fontSize:16,color:S.blue,animation:'aiPulse 3s infinite'}}>✦</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:S.txt,lineHeight:1.2}}>AI Intelligence</div>
              <div style={{fontSize:11,color:S.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{viewingSession?'Viewing: '+viewingSession.title:acct.name}</div>
            </div>
            <button onClick={handleNewChat} style={{background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,color:S.muted,cursor:'pointer',fontSize:11,fontWeight:600,padding:'5px 10px',whiteSpace:'nowrap',flexShrink:0}}>＋ New Chat</button>
            <button onClick={()=>{setShowHistory(v=>!v);if(showHistory)setViewingSession(null)}} style={{background:showHistory?S.blue+'22':'transparent',border:`1px solid ${showHistory?S.blue:S.bdr}`,borderRadius:6,color:showHistory?S.blue:S.muted,cursor:'pointer',fontSize:11,fontWeight:600,padding:'5px 10px',whiteSpace:'nowrap',flexShrink:0}}>☰ History{sessions.length>0?` (${sessions.length})`:''}</button>
            <button onClick={handleClose} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,flexShrink:0,padding:'0 4px',display:'flex',alignItems:'center'}}>×</button>
          </div>

          {/* Messages area */}
          <div style={{flex:1,overflowY:'auto',padding:'16px 18px',display:'flex',flexDirection:'column',gap:14}}>
            {viewingSession&&(
              <div style={{background:'rgba(234,179,8,0.08)',border:'1px solid rgba(234,179,8,0.25)',borderRadius:8,padding:'8px 14px',fontSize:12,color:S.yellow,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
                <span>Viewing past session — {fmtDate(viewingSession.date.split('T')[0])}</span>
                <button onClick={()=>setViewingSession(null)} style={{background:'none',border:'none',color:S.yellow,cursor:'pointer',fontSize:11,fontWeight:600}}>← Back</button>
              </div>
            )}
            {displayMessages.length===0&&!viewingSession&&(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:20,textAlign:'center'}}>
                <div>
                  <div style={{fontSize:26,color:S.blue,marginBottom:8}}>✦</div>
                  <div style={{fontSize:14,fontWeight:600,color:S.txt,marginBottom:4}}>Ask me anything about {acct.short||acct.name}</div>
                  <div style={{fontSize:12,color:S.muted}}>Full context: contacts, projects, tech stack, intel, and follow-ups.</div>
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8,justifyContent:'center',maxWidth:520}}>
                  {SUGGESTED.map((q,i)=>(
                    <button key={i} onClick={()=>sendMessage(q)}
                      style={{background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:20,padding:'8px 14px',fontSize:12,color:S.secondary,cursor:'pointer',textAlign:'left',lineHeight:1.4,transition:'border-color 0.15s'}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=S.blue}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=S.bdr}
                    >{q}</button>
                  ))}
                </div>
              </div>
            )}
            {renderMsgBubbles(displayMessages, displayPinned, !!viewingSession)}
            {loading&&(
              <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                <div style={{width:30,height:30,borderRadius:'50%',background:'rgba(168,85,247,0.18)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:S.purple,flexShrink:0}}>AI</div>
                <div style={{background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:'12px 12px 12px 2px',padding:'13px 16px',display:'flex',gap:5,alignItems:'center'}}>
                  {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:S.muted,animation:`dot-pulse 1.2s ease-in-out ${i*0.2}s infinite`}}/>)}
                </div>
              </div>
            )}
            {error&&(
              <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                <div style={{width:30,height:30,borderRadius:'50%',background:'rgba(239,68,68,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:S.red,flexShrink:0}}>!</div>
                <div style={{background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'12px 12px 12px 2px',padding:'10px 14px',maxWidth:'70%'}}>
                  <div style={{fontSize:12,color:S.red,marginBottom:8,lineHeight:1.5}}>{error}</div>
                  <button onClick={()=>{setError(null);callAPI(messages)}} style={{fontSize:11,color:S.red,background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:4,padding:'4px 10px',cursor:'pointer',fontWeight:600}}>Retry</button>
                </div>
              </div>
            )}
            <div ref={messagesEndRef}/>
          </div>

          {/* Input or Continue Chat */}
          {viewingSession?(
            <div style={{borderTop:`1px solid ${S.bdr}`,padding:'12px 18px',flexShrink:0,display:'flex',justifyContent:'center',gap:10}}>
              <button onClick={()=>{setMessages(viewingSession.messages.map(m=>({...m,timestamp:new Date(m.timestamp)})));setPinnedMsgs(new Set(viewingSession.pinnedMessages||[]));setViewingSession(null);setShowHistory(false)}} style={{padding:'10px 20px',background:S.blue,border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Continue this chat →</button>
              <button onClick={()=>setViewingSession(null)} style={{padding:'10px 16px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
            </div>
          ):(
            <div style={{borderTop:`1px solid ${S.bdr}`,padding:'12px 18px',flexShrink:0}}>
              <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
                <textarea
                  value={input}
                  onChange={e=>setInput(e.target.value.slice(0,CHAT_INPUT_MAX))}
                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(input)}}}
                  placeholder='Ask anything about this account... (Enter to send, Shift+Enter for new line)'
                  rows={1}
                  style={{flex:1,fontSize:13,background:S.surf2,border:`1px solid ${input.length>CHAT_INPUT_MAX*0.9?'#d97706':S.bdr}`,borderRadius:8,padding:'10px 12px',color:S.txt,resize:'none',lineHeight:1.5,fontFamily:'inherit',maxHeight:120,overflowY:'auto'}}
                />
                <button onClick={()=>sendMessage(input)} disabled={!input.trim()||loading}
                  style={{padding:'10px 18px',background:!input.trim()||loading?S.dim:S.blue,border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:!input.trim()||loading?'default':'pointer',flexShrink:0,opacity:!input.trim()||loading?0.5:1,minHeight:42}}>
                  Send
                </button>
              </div>
              {input.length>CHAT_INPUT_MAX*0.8&&<div style={{fontSize:11,color:input.length>=CHAT_INPUT_MAX?'#dc2626':'#d97706',marginTop:4,textAlign:'right'}}>{input.length}/{CHAT_INPUT_MAX} chars</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
