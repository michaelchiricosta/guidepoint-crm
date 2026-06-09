import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { S } from '../theme.js'
import { fmtDate } from '../utils.js'
import { saveData } from '../supabase.js'
import AIChatModal from './AIChatModal.jsx'

export default function AIHistory({acct, setAcct, data, setData, apiKey}) {
  const effectiveKey = apiKey || import.meta.env.VITE_ANTHROPIC_KEY || ''
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [showChat, setShowChat] = useState(false)
  const [chatSession, setChatSession] = useState(null)

  const sessions = (acct.aiHistory||[]).slice().sort((a,b)=>{if(a.pinned&&!b.pinned)return -1;if(!a.pinned&&b.pinned)return 1;return b.date.localeCompare(a.date)})

  const fmtTime = d => { try { const dt=d instanceof Date?d:new Date(d); return dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) } catch { return '' } }

  const allPinned = sessions.flatMap(s=>(s.pinnedMessages||[]).map(msgId=>{
    const msg = s.messages.find(m=>m.id===msgId)
    return msg ? {msg, session:s} : null
  })).filter(Boolean)

  const q = search.toLowerCase().trim()
  const filteredSessions = q ? sessions.filter(s=>s.title.toLowerCase().includes(q)||s.messages.some(m=>m.content.toLowerCase().includes(q))) : sessions

  const unpinMsg = (sessionId, msgId) => {
    setAcct(prev=>({...prev, aiHistory:(prev.aiHistory||[]).map(s=>s.id===sessionId?{...s,pinnedMessages:(s.pinnedMessages||[]).filter(id=>id!==msgId)}:s)}))
  }

  const toggleSessionPin = (sessionId) => {
    setAcct(prev=>({...prev, aiHistory:(prev.aiHistory||[]).map(s=>s.id===sessionId?{...s,pinned:!s.pinned}:s)}))
  }

  const deleteSession = async (sessionId) => {
    if(!window.confirm('Delete this chat session?')) return
    setAcct(prev => ({...prev, aiHistory: (prev.aiHistory||[]).filter(s => s.id !== sessionId)}))
    if(expanded === sessionId) setExpanded(null)
    if (data && setData) {
      const updatedData = {
        ...data,
        accounts: (data.accounts||[]).map(a =>
          a.id === acct.id
            ? {...a, aiHistory: (a.aiHistory||[]).filter(s => s.id !== sessionId)}
            : a
        )
      }
      setData(() => updatedData)
      window._lastDirectSave = Date.now()
      await saveData(updatedData)
    }
  }

  const pinMsgInHistory = (sessionId, msgId) => {
    setAcct(prev=>({...prev, aiHistory:(prev.aiHistory||[]).map(s=>{
      if(s.id!==sessionId) return s
      const pins = s.pinnedMessages||[]
      return {...s, pinnedMessages:pins.includes(msgId)?pins.filter(id=>id!==msgId):[...pins,msgId]}
    })}))
  }

  const openContinue = (session) => {
    setChatSession(session)
    setShowChat(true)
  }

  return (
    <div>
      {showChat&&<AIChatModal
        acct={acct} setAcct={setAcct} effectiveKey={effectiveKey}
        onClose={()=>{setShowChat(false);setChatSession(null)}}
        initialMessages={chatSession?chatSession.messages.map(m=>({...m,timestamp:new Date(m.timestamp)})):[]}
        initialPinned={chatSession?.pinnedMessages||[]}
        initialSessionId={chatSession?.id||null}
      />}

      {/* Search */}
      <div style={{marginBottom:16}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search chat history...' style={{width:'100%',fontSize:13,padding:'8px 12px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,boxSizing:'border-box'}}/>
      </div>

      {/* Pinned Answers */}
      <div style={{marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <span style={{fontSize:14,color:'#eab308'}}>★</span>
          <div style={{fontSize:11,fontWeight:700,color:'#eab308',textTransform:'uppercase',letterSpacing:'0.1em'}}>Pinned Answers</div>
        </div>
        {allPinned.length===0
          ?<div style={{fontSize:13,color:S.muted,padding:'16px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,lineHeight:1.6}}>No pinned answers yet. Star important AI responses to pin them here.</div>
          :<div style={{display:'flex',flexDirection:'column',gap:8}}>
            {allPinned.map(({msg,session},i)=>(
              <div key={i} style={{background:S.isLight?'#fffbeb':S.surf,border:`1px solid ${S.isLight?'#fef3c7':'rgba(234,179,8,0.3)'}`,borderLeft:'3px solid #eab308',borderRadius:8,padding:'12px 14px'}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:8}}>
                  <div style={{fontSize:10,color:'#eab308',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',flexShrink:0}}>★ Pinned</div>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                    <span style={{fontSize:10,color:S.muted}}>{fmtDate(session.date.split('T')[0])} — {session.title.slice(0,40)}{session.title.length>40?'…':''}</span>
                    <button onClick={()=>unpinMsg(session.id,msg.id)} style={{fontSize:11,color:S.muted,background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:4,padding:'2px 8px',cursor:'pointer'}}>Unpin</button>
                  </div>
                </div>
                <div style={{fontSize:13,color:S.txt,lineHeight:1.65,whiteSpace:'pre-wrap'}}>{msg.content}</div>
              </div>
            ))}
          </div>
        }
      </div>

      {/* Chat History */}
      <div>
        <div style={{fontSize:11,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Chat History{filteredSessions.length>0&&` — ${filteredSessions.length} session${filteredSessions.length!==1?'s':''}`}</div>
        {filteredSessions.length===0&&<div style={{fontSize:13,color:S.muted,textAlign:'center',padding:'30px'}}>{sessions.length===0?'No chat history yet. Start a conversation in AI Intelligence.':'No sessions match your search.'}</div>}
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {filteredSessions.map(s=>{
            const isExp = expanded===s.id
            return (
              <div key={s.id} style={{background:S.surf,border:`1px solid ${s.pinned?'rgba(234,179,8,0.35)':S.bdr}`,borderLeft:s.pinned?'3px solid #eab308':'3px solid transparent',borderRadius:8,overflow:'hidden'}}>
                {/* Session header */}
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'11px 14px',cursor:'pointer'}} onClick={()=>setExpanded(isExp?null:s.id)}>
                  <button onClick={e=>{e.stopPropagation();toggleSessionPin(s.id)}} style={{background:'none',border:'none',cursor:'pointer',fontSize:15,padding:0,flexShrink:0,color:s.pinned?'#eab308':S.dim}}>{s.pinned?'★':'☆'}</button>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:S.txt,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.title}</div>
                    <div style={{fontSize:10,color:S.muted,marginTop:2}}>{fmtDate(s.date.split('T')[0])} · {s.messages.length} message{s.messages.length!==1?'s':''}{s.pinnedMessages?.length?` · ${s.pinnedMessages.length} pinned`:''}</div>
                  </div>
                  <div style={{display:'flex',gap:6,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>openContinue(s)} style={{fontSize:11,color:S.blue,background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.25)',borderRadius:5,padding:'4px 10px',cursor:'pointer',fontWeight:600}}>Continue Chat</button>
                    <button onClick={()=>deleteSession(s.id)} title='Delete session'
                      style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',padding:'4px',display:'flex',alignItems:'center'}}
                      onMouseEnter={e=>e.currentTarget.style.color='#dc2626'}
                      onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}>
                      <Trash2 size={16}/>
                    </button>
                  </div>
                  <span style={{color:S.dim,fontSize:12,flexShrink:0}}>{isExp?'▲':'▼'}</span>
                </div>
                {/* Expanded conversation */}
                {isExp&&(
                  <div style={{borderTop:`1px solid ${S.bdr}`,padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>
                    {s.messages.map((msg,i)=>{
                      const isUser=msg.role==='user'
                      const isPinned=(s.pinnedMessages||[]).includes(msg.id)
                      return (
                        <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,flexDirection:isUser?'row-reverse':'row'}}>
                          <div style={{width:24,height:24,borderRadius:'50%',background:isUser?S.blue:'rgba(168,85,247,0.18)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:isUser?'#fff':S.purple,flexShrink:0}}>{isUser?'MC':'AI'}</div>
                          <div style={{maxWidth:'80%',background:isUser?S.blue:S.surf2,border:isUser?'none':`1px solid ${isPinned?'#eab308':S.bdr}`,borderLeft:!isUser&&isPinned?'2px solid #eab308':undefined,borderRadius:isUser?'10px 10px 2px 10px':'10px 10px 10px 2px',padding:'7px 11px'}}>
                            <div style={{fontSize:12,color:isUser?'#fff':S.txt,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{msg.content}</div>
                            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:3,gap:8}}>
                              <div style={{fontSize:9,color:isUser?'rgba(255,255,255,0.5)':S.muted}}>{fmtTime(msg.timestamp)}</div>
                              {!isUser&&<button onClick={()=>pinMsgInHistory(s.id,msg.id)} style={{fontSize:10,color:isPinned?'#eab308':S.dim,background:'none',border:'none',cursor:'pointer',padding:0,flexShrink:0}}>{isPinned?'★':' ☆'}</button>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
