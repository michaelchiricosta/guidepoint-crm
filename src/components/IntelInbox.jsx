import { useState } from 'react'
import { uid, extractJSON } from '../utils.js'

const callClaudeWithRetry = async (body, apiKey, onStatus, maxRetries=3) => {
  let attempt = 0
  while (attempt <= maxRetries) {
    if (attempt > 0) {
      const wait = attempt===1?15000:attempt===2?30000:60000
      if (onStatus) onStatus(`Rate limited — retrying in ${Math.round(wait/1000)}s…`)
      await new Promise(r=>setTimeout(r,wait))
    }
    const resp = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify(body)
    })
    const data = await resp.json()
    if (data.error?.type==='rate_limit_error'||data.error?.type==='overloaded_error') {
      attempt++
      if (attempt>maxRetries) throw new Error('OVERLOADED')
      continue
    }
    if (onStatus) onStatus('')
    return {data}
  }
  throw new Error('OVERLOADED')
}

const PRI_COLOR = {Critical:'#dc2626',High:'#ea580c',Medium:'#2563eb',Low:'#64748b'}
const PRI_BG    = {Critical:'#fef2f2',High:'#fff7ed',Medium:'#eff6ff',Low:'#f8fafc'}

export default function IntelInbox({data, setData, apiKey, onClose}) {
  const mob = typeof window!=='undefined'&&window.innerWidth<768
  const effectiveKey = apiKey||''
  const today = new Date().toISOString().split('T')[0]

  const [step, setStep]             = useState('input')
  const [inputText, setInputText]   = useState('')
  const [loadStatus, setLoadStatus] = useState('')
  const [error, setError]           = useState('')
  const [reviewItems, setReviewItems]               = useState([])
  const [lowConfGroups, setLowConfGroups]           = useState([])
  const [lowConfSels, setLowConfSels]               = useState({})
  const [lowConfReview, setLowConfReview]           = useState({})

  const findAcct = (id, name) =>
    data.accounts.find(a=>a.id===id)||
    data.accounts.find(a=>a.short?.toLowerCase()===(id||'').toLowerCase())||
    data.accounts.find(a=>a.name?.toLowerCase()===(id||'').toLowerCase())||
    data.accounts.find(a=>a.name?.toLowerCase()===(name||'').toLowerCase())||
    data.accounts.find(a=>a.short?.toLowerCase()===(name||'').toLowerCase())

  const buildCtx = () => data.accounts.map(a=>{
    const contacts = (a.contacts||[]).map(c=>`${c.name}${c.title?` (${c.title})`:''}`).join(', ')
    const tech     = (a.techStack||[]).map(t=>`${t.vendor}${t.status?` [${t.status}]`:''}`).filter(Boolean).join(', ')
    const intel    = (a.intelLog||[]).slice(0,2).map(e=>e.summary||'').filter(Boolean).join(' | ')
    return `ID:${a.id} | NAME:${a.name}${a.short?` | SHORT:${a.short}`:''}
CONTACTS: ${contacts||'none'}
TECH: ${tech||'none'}
NOTES: ${(a.notes||'').slice(0,200)}
RECENT INTEL: ${intel||'none'}`
  }).join('\n\n')

  const initReviewEntry = (m, acct) => ({
    accountId:   acct?.id||m.accountId,
    accountName: m.accountName||acct?.name||m.accountId,
    confidence:  m.confidence||0,
    matchReason: m.matchReason||'',
    intelApproved: true,
    intelEntry: {
      date:          m.suggestedIntelEntry?.date||today,
      type:          m.suggestedIntelEntry?.type||'Note',
      participants:  m.suggestedIntelEntry?.participants||'',
      summary:       m.suggestedIntelEntry?.summary||'',
      insights:      (m.suggestedIntelEntry?.insights||[]).join('\n'),
      risks:         (m.suggestedIntelEntry?.risks||[]).join('\n'),
      opportunities: (m.suggestedIntelEntry?.opportunities||[]).join('\n'),
    },
    actions: (m.suggestedActions||[]).map((a,i)=>({
      _id:i, approved:true,
      task:a.task||'', priority:a.priority||'Medium',
      dueDate:a.dueDate||'', contact:a.contact||'', context:a.context||''
    }))
  })

  const analyze = async () => {
    if (!effectiveKey) { setError('Add your Anthropic API key in Settings first.'); return }
    if (!inputText.trim()) { setError('Paste some text to analyze.'); return }
    setStep('loading'); setError(''); setLoadStatus('Building account context…')
    const ctx = buildCtx()
    const prompt = `You are an intelligence routing AI for a cybersecurity sales CRM at GuidePoint Security.

A sales rep pasted notes, a transcript, a vendor update, an email, or meeting notes. Your job:
1. Identify which CRM accounts are discussed — using contact names, vendor names, technologies, and context clues
2. Propose an Intel Log entry and optional Actions for each identified account
3. Assign confidence scores based on evidence strength

CRITICAL MATCHING RULES:
- Do NOT rely solely on explicit account name mentions
- First names of contacts, vendor names, and technologies are strong signals
- Example: "Rudy", "QRadar", "Cloudflare" strongly imply BHSI if those appear in BHSI's data
- Confidence ≥60 → include in "matches" (will be shown directly to user)
- Confidence <60 → include in "lowConfidenceGroups" (user must select account manually)

ACCOUNTS IN CRM:
${ctx}

TODAY: ${today}

PASTED TEXT:
${inputText.slice(0,30000)}

Return ONLY valid compact JSON (no markdown):
{
  "matches": [
    {
      "accountId": "exact ID from the ID: field above",
      "accountName": "exact account name",
      "confidence": 85,
      "matchReason": "one sentence: which specific signals matched this account",
      "suggestedIntelEntry": {
        "date": "${today}",
        "type": "Call|Meeting|Email|Note",
        "participants": "names mentioned",
        "summary": "2-3 sentence account-specific summary",
        "insights": ["insight"],
        "risks": ["risk"],
        "opportunities": ["opportunity"]
      },
      "suggestedActions": [
        {
          "task": "3-8 word verb-first action",
          "priority": "Critical|High|Medium|Low",
          "dueDate": "YYYY-MM-DD or empty string",
          "contact": "first and last name",
          "context": "1-2 sentence background"
        }
      ]
    }
  ],
  "lowConfidenceGroups": [
    {
      "candidates": [
        {"accountId": "exact ID", "accountName": "name", "confidence": 35, "matchReason": "..."},
        {"accountId": "exact ID", "accountName": "name", "confidence": 20, "matchReason": "..."},
        {"accountId": "exact ID", "accountName": "name", "confidence": 10, "matchReason": "..."}
      ],
      "suggestedIntelEntry": {
        "date": "${today}", "type": "Note", "participants": "",
        "summary": "summary of this uncertain intelligence",
        "insights": [], "risks": [], "opportunities": []
      },
      "suggestedActions": []
    }
  ]
}
Rules: matches[] only for confidence ≥60 · max 3 actions per account · intel entries must be account-specific · if nothing matches return {"matches":[],"lowConfidenceGroups":[]}`

    try {
      setLoadStatus('Analyzing with AI…')
      const {data:resp} = await callClaudeWithRetry({
        model:'claude-sonnet-4-6', max_tokens:8000,
        system:'You are an intelligence routing AI for a cybersecurity sales CRM. Return ONLY valid compact JSON.',
        messages:[{role:'user',content:prompt}]
      }, effectiveKey, msg=>{ if(msg) setLoadStatus(msg) })

      if (resp.error) throw new Error(resp.error.message==='OVERLOADED'?'OVERLOADED':resp.error.message)
      const parsed = extractJSON(resp.content?.[0]?.text||'')
      if (!parsed) throw new Error('Could not parse AI response. Please try again.')

      const matches  = parsed.matches||[]
      const lowConf  = parsed.lowConfidenceGroups||[]

      setReviewItems(matches.map(m=>initReviewEntry(m,findAcct(m.accountId,m.accountName))))

      // Init low-conf review state
      const lcr = {}
      lowConf.forEach((group,idx)=>{
        lcr[idx] = {
          intelApproved: true,
          intelEntry: {
            date:          group.suggestedIntelEntry?.date||today,
            type:          group.suggestedIntelEntry?.type||'Note',
            participants:  group.suggestedIntelEntry?.participants||'',
            summary:       group.suggestedIntelEntry?.summary||'',
            insights:      (group.suggestedIntelEntry?.insights||[]).join('\n'),
            risks:         (group.suggestedIntelEntry?.risks||[]).join('\n'),
            opportunities: (group.suggestedIntelEntry?.opportunities||[]).join('\n'),
          },
          actions: (group.suggestedActions||[]).map((a,i)=>({
            _id:i, approved:true,
            task:a.task||'', priority:a.priority||'Medium',
            dueDate:a.dueDate||'', contact:a.contact||'', context:a.context||''
          }))
        }
      })
      setLowConfGroups(lowConf)
      setLowConfSels({})
      setLowConfReview(lcr)
      setStep('review')
    } catch(e) {
      const msg = e.message||''
      setError(msg==='OVERLOADED'?'Anthropic API is busy. Please wait 30 seconds and try again.':`Analysis failed: ${msg}`)
      setStep('input')
    }
  }

  const updateItem  = (idx, u) => setReviewItems(p=>p.map((it,i)=>i===idx?{...it,...u}:it))
  const updateIntel = (idx, f, v) => setReviewItems(p=>p.map((it,i)=>i===idx?{...it,intelEntry:{...it.intelEntry,[f]:v}}:it))
  const updateAct   = (idx, aid, u) => setReviewItems(p=>p.map((it,i)=>i===idx?{...it,actions:it.actions.map(a=>a._id===aid?{...a,...u}:a)}:it))

  const updateLCIntel = (gi,f,v) => setLowConfReview(p=>({...p,[gi]:{...p[gi],intelEntry:{...p[gi].intelEntry,[f]:v}}}))
  const updateLCAct   = (gi,aid,u) => setLowConfReview(p=>({...p,[gi]:{...p[gi],actions:p[gi].actions.map(a=>a._id===aid?{...a,...u}:a)}}))

  const lines = s => (s||'').split('\n').map(x=>x.trim()).filter(Boolean)

  const saveApproved = () => {
    const toSave = reviewItems.map(item=>({
      ...item,
      intelEntry:{...item.intelEntry,insights:lines(item.intelEntry.insights),risks:lines(item.intelEntry.risks),opportunities:lines(item.intelEntry.opportunities)}
    }))
    Object.entries(lowConfSels).forEach(([gi,sel])=>{
      if (!sel||sel==='skip') return
      const rev = lowConfReview[parseInt(gi)]
      if (!rev) return
      const acct = data.accounts.find(a=>a.id===sel)
      toSave.push({
        accountId:sel, accountName:acct?.name||sel,
        intelApproved:rev.intelApproved,
        intelEntry:{...rev.intelEntry,insights:lines(rev.intelEntry.insights),risks:lines(rev.intelEntry.risks),opportunities:lines(rev.intelEntry.opportunities)},
        actions:rev.actions
      })
    })
    setData(prev=>{
      const next={...prev}
      next.accounts=prev.accounts.map(acct=>{
        const items=toSave.filter(it=>it.accountId===acct.id)
        if(!items.length) return acct
        let updated={...acct}
        for (const item of items) {
          if (item.intelApproved&&item.intelEntry?.summary?.trim()) {
            updated.intelLog=[{...item.intelEntry,id:uid()},...(updated.intelLog||[])]
            if (item.intelEntry.date) updated.lastContact=item.intelEntry.date
          }
          const approved=(item.actions||[]).filter(a=>a.approved&&a.task?.trim())
          if (approved.length) {
            const fus=approved.map(({_id,approved:_a,...rest})=>({...rest,id:uid(),status:'Open'}))
            updated.followUps=[...(updated.followUps||[]),...fus]
          }
        }
        return updated
      })
      return next
    })
    setStep('done')
  }

  const totals = (()=>{
    let intel=0, actions=0
    reviewItems.forEach(it=>{if(it.intelApproved&&it.intelEntry?.summary?.trim())intel++;actions+=it.actions.filter(a=>a.approved).length})
    Object.entries(lowConfSels).forEach(([gi,sel])=>{
      if(!sel||sel==='skip') return
      const rev=lowConfReview[parseInt(gi)]; if(!rev) return
      if(rev.intelApproved&&rev.intelEntry?.summary?.trim()) intel++
      actions+=rev.actions.filter(a=>a.approved).length
    })
    return {intel, actions}
  })()

  const hasFooter = step==='review'&&(reviewItems.length>0||Object.values(lowConfSels).some(s=>s&&s!=='skip'))

  // ── Shared section renderers ──────────────────────────────────────────────────

  const IntelSection = ({entry, approved, onToggle, onField}) => (
    <div style={{background:'#f8fafc',borderRadius:8,padding:12,marginBottom:8,border:'1px solid #e2e8f0'}}>
      <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:approved?12:0,cursor:'pointer'}}>
        <input type='checkbox' checked={approved} onChange={()=>onToggle(!approved)}
          style={{width:16,height:16,accentColor:'#2563eb',cursor:'pointer',flexShrink:0}}/>
        <span style={{fontSize:12,fontWeight:700,color:'#111827',textTransform:'uppercase',letterSpacing:'0.06em'}}>Intel Log Entry</span>
      </label>
      {approved&&(
        <div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',marginBottom:3}}>Date</div>
              <input type='date' value={entry.date} onChange={e=>onField('date',e.target.value)}
                style={{width:'100%',fontSize:12,padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:5,color:'#111827',background:'#fff',boxSizing:'border-box'}}/>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',marginBottom:3}}>Type</div>
              <select value={entry.type} onChange={e=>onField('type',e.target.value)}
                style={{width:'100%',fontSize:12,padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:5,color:'#111827',background:'#fff'}}>
                {['Call','Meeting','Email','Note'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',marginBottom:3}}>Participants</div>
            <input value={entry.participants} onChange={e=>onField('participants',e.target.value)} placeholder='Names…'
              style={{width:'100%',fontSize:12,padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:5,color:'#111827',background:'#fff',boxSizing:'border-box'}}/>
          </div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',marginBottom:3}}>Summary</div>
            <textarea value={entry.summary} onChange={e=>onField('summary',e.target.value)} rows={3}
              style={{width:'100%',fontSize:12,padding:'6px 8px',border:'1px solid #e2e8f0',borderRadius:5,color:'#111827',background:'#fff',resize:'vertical',boxSizing:'border-box',fontFamily:'inherit',lineHeight:1.5}}/>
          </div>
          {[['insights','#0066CC'],['risks','#dc2626'],['opportunities','#15803d']].map(([field,color])=>(
            <div key={field} style={{marginBottom:6}}>
              <div style={{fontSize:10,fontWeight:700,color,textTransform:'uppercase',marginBottom:3}}>{field}</div>
              <textarea value={entry[field]} onChange={e=>onField(field,e.target.value)} rows={2}
                placeholder={`One ${field.slice(0,-1)} per line…`}
                style={{width:'100%',fontSize:11,padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:5,color:'#374151',background:'#fff',resize:'vertical',boxSizing:'border-box',fontFamily:'inherit',lineHeight:1.4}}/>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const ActionsSection = ({actions, onUpdate}) => {
    if (!actions?.length) return null
    return (
      <div>
        <div style={{fontSize:11,fontWeight:700,color:'#111827',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Proposed Actions</div>
        {actions.map(action=>(
          <label key={action._id} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'8px 10px',background:action.approved?'#f0f9ff':'#f8fafc',borderRadius:7,marginBottom:4,border:`1px solid ${action.approved?'#bfdbfe':'#e2e8f0'}`,cursor:'pointer',transition:'all 0.12s'}}>
            <input type='checkbox' checked={action.approved} onChange={()=>onUpdate(action._id,{approved:!action.approved})}
              style={{width:15,height:15,marginTop:2,accentColor:'#2563eb',cursor:'pointer',flexShrink:0}}/>
            <div style={{flex:1,minWidth:0,opacity:action.approved?1:0.5}}>
              <div style={{fontSize:13,fontWeight:500,color:'#111827',lineHeight:1.4,marginBottom:3}}>{action.task}</div>
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <span style={{fontSize:10,fontWeight:700,color:PRI_COLOR[action.priority]||'#64748b',background:PRI_BG[action.priority]||'#f8fafc',borderRadius:4,padding:'1px 6px'}}>{action.priority}</span>
                {action.contact&&<span style={{fontSize:11,color:'#64748b'}}>{action.contact}</span>}
                {action.dueDate&&<span style={{fontSize:11,color:'#64748b'}}>Due {action.dueDate}</span>}
              </div>
              {action.context&&<div style={{fontSize:11,color:'#64748b',marginTop:3,lineHeight:1.4}}>{action.context}</div>}
            </div>
          </label>
        ))}
      </div>
    )
  }

  // ── RENDER ────────────────────────────────────────────────────────────────────

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:mob?0:20}}
      onClick={step==='loading'?undefined:onClose}>
      <style>{`@keyframes iiSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{background:'#FFFFFF',borderRadius:mob?0:16,boxShadow:'0 8px 40px rgba(0,0,0,0.18)',width:mob?'100%':'min(720px,95vw)',maxHeight:mob?'100%':'92vh',display:'flex',flexDirection:'column',overflow:'hidden',height:mob?'100%':'auto'}}
        onClick={e=>e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{padding:'18px 24px 14px',borderBottom:'1px solid #f1f5f9',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:36,height:36,borderRadius:9,background:'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <svg width="18" height="14" viewBox="0 0 22 17" fill="none"><rect x="1" y="1" width="20" height="15" rx="2" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6"/><path d="M1 5l10 6 10-6" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </div>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:'#0f172a',lineHeight:1.2}}>Intel Inbox</div>
                {step==='review'&&<div style={{fontSize:11,color:'#64748b',marginTop:1}}>{reviewItems.length} account{reviewItems.length!==1?'s':''} matched{lowConfGroups.length>0?` · ${lowConfGroups.length} uncertain`:''}</div>}
              </div>
            </div>
            {step!=='loading'&&(
              <button onClick={onClose} style={{width:30,height:30,borderRadius:7,background:'#f1f5f9',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b'}}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch'}}>

          {/* INPUT */}
          {step==='input'&&(
            <div style={{padding:'20px 24px'}}>
              <p style={{fontSize:13,color:'#64748b',lineHeight:1.6,margin:'0 0 16px'}}>
                Paste call notes, transcripts, vendor updates, emails, or meeting summaries. Ledgr will identify the relevant accounts and propose Intel Log entries and Actions.
              </p>
              {!effectiveKey&&(
                <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'8px 12px',display:'flex',gap:8,marginBottom:12}}>
                  <span style={{color:'#d97706',fontSize:14,flexShrink:0}}>⚠</span>
                  <span style={{fontSize:12,color:'#92400e'}}>No API key — go to Settings and add your Anthropic API key to enable AI analysis.</span>
                </div>
              )}
              {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 12px',fontSize:12,color:'#dc2626',marginBottom:12}}>{error}</div>}
              <textarea
                value={inputText} onChange={e=>setInputText(e.target.value)} rows={11}
                placeholder={'Paste your notes here…\n\nExamples:\n• "Had a call with Rudy today about the QRadar migration and Google SecOps…"\n• "Email from Jamie about the Saviynt contract renewal coming up in Q3…"\n• "Meeting with the CISO – she wants to accelerate the Wiz CSPM evaluation…"'}
                style={{width:'100%',boxSizing:'border-box',fontSize:13,color:'#111827',padding:12,border:'1px solid #e2e8f0',borderRadius:8,resize:'vertical',minHeight:220,fontFamily:'inherit',lineHeight:1.6,outline:'none',display:'block'}}
                onFocus={e=>{e.target.style.borderColor='#2563eb';e.target.style.boxShadow='0 0 0 3px rgba(37,99,235,0.1)'}}
                onBlur={e=>{e.target.style.borderColor='#e2e8f0';e.target.style.boxShadow='none'}}
              />
              <div style={{textAlign:'right',fontSize:11,color:'#94a3b8',marginTop:4,marginBottom:16}}>{inputText.length.toLocaleString()} characters</div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={analyze} disabled={!inputText.trim()||!effectiveKey}
                  style={{flex:1,padding:'11px 16px',background:!inputText.trim()||!effectiveKey?'#94a3b8':'linear-gradient(135deg,#0055CC 0%,#2563eb 100%)',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:!inputText.trim()||!effectiveKey?'not-allowed':'pointer'}}>
                  Analyze ✨
                </button>
                <button onClick={onClose} style={{padding:'11px 16px',background:'transparent',border:'1px solid #e2e8f0',borderRadius:8,color:'#64748b',fontSize:13,cursor:'pointer'}}>Cancel</button>
              </div>
            </div>
          )}

          {/* LOADING */}
          {step==='loading'&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'70px 24px',gap:16}}>
              <div style={{width:44,height:44,border:'3px solid #e2e8f0',borderTop:'3px solid #2563eb',borderRadius:'50%',animation:'iiSpin 0.8s linear infinite'}}/>
              <div style={{fontSize:14,fontWeight:600,color:'#0f172a'}}>Analyzing your notes…</div>
              <div style={{fontSize:12,color:'#64748b',textAlign:'center',maxWidth:340,lineHeight:1.6}}>{loadStatus||'Checking all accounts for contacts, vendors, and technologies…'}</div>
              <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>Checking {data.accounts.length} account{data.accounts.length!==1?'s':''} · Usually takes 15–30 seconds</div>
            </div>
          )}

          {/* REVIEW */}
          {step==='review'&&(
            <div style={{padding:'16px 24px 20px'}}>

              {/* Empty state */}
              {reviewItems.length===0&&lowConfGroups.length===0&&(
                <div style={{textAlign:'center',padding:'40px 20px'}}>
                  <div style={{fontSize:40,marginBottom:12}}>🔍</div>
                  <div style={{fontSize:15,fontWeight:600,color:'#0f172a',marginBottom:8}}>No accounts identified</div>
                  <div style={{fontSize:13,color:'#64748b',lineHeight:1.6,maxWidth:420,margin:'0 auto'}}>The AI couldn't confidently match this text to any accounts. Try pasting content with contact names, company references, or technologies.</div>
                  <button onClick={()=>setStep('input')} style={{marginTop:20,padding:'10px 22px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>← Try Again</button>
                </div>
              )}

              {/* High-confidence matches */}
              {reviewItems.map((item,idx)=>(
                <div key={item.accountId+idx} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:16,marginBottom:12,boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:12}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:4}}>
                        <span style={{fontSize:15,fontWeight:700,color:'#0f172a'}}>{item.accountName}</span>
                        <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:999,
                          color:item.confidence>=80?'#15803d':item.confidence>=60?'#d97706':'#dc2626',
                          background:item.confidence>=80?'#f0fdf4':item.confidence>=60?'#fffbeb':'#fef2f2'}}>
                          {item.confidence}% match
                        </span>
                      </div>
                      <div style={{fontSize:12,color:'#64748b',lineHeight:1.4}}>{item.matchReason}</div>
                    </div>
                  </div>
                  <IntelSection
                    entry={item.intelEntry} approved={item.intelApproved}
                    onToggle={v=>updateItem(idx,{intelApproved:v})}
                    onField={(f,v)=>updateIntel(idx,f,v)}
                  />
                  <ActionsSection
                    actions={item.actions}
                    onUpdate={(aid,u)=>updateAct(idx,aid,u)}
                  />
                </div>
              ))}

              {/* Low-confidence groups */}
              {lowConfGroups.map((group,gi)=>{
                const sel = lowConfSels[gi]
                const rev = lowConfReview[gi]
                return (
                  <div key={gi} style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:12,padding:16,marginBottom:12}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                      <span style={{fontSize:15}}>⚠</span>
                      <span style={{fontSize:13,fontWeight:700,color:'#92400e'}}>Low Confidence — Select Account</span>
                    </div>
                    <div style={{fontSize:12,color:'#78350f',marginBottom:12,lineHeight:1.5}}>AI found relevant intelligence but couldn't confidently match it to an account. Select the correct account or skip.</div>
                    <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:sel&&sel!=='skip'?14:0}}>
                      {group.candidates.map(c=>(
                        <label key={c.accountId} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:sel===c.accountId?'rgba(37,99,235,0.07)':'rgba(255,255,255,0.75)',borderRadius:7,border:`1px solid ${sel===c.accountId?'#93c5fd':'rgba(0,0,0,0.07)'}`,cursor:'pointer'}}>
                          <input type='radio' name={`lc-${gi}`} value={c.accountId} checked={sel===c.accountId} onChange={()=>setLowConfSels(p=>({...p,[gi]:c.accountId}))} style={{accentColor:'#2563eb',flexShrink:0}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <span style={{fontSize:13,fontWeight:600,color:'#0f172a'}}>{c.accountName}</span>
                              <span style={{fontSize:10,color:'#64748b',background:'#f1f5f9',borderRadius:4,padding:'1px 5px'}}>{c.confidence}%</span>
                            </div>
                            <div style={{fontSize:11,color:'#64748b'}}>{c.matchReason}</div>
                          </div>
                        </label>
                      ))}
                      <label style={{display:'flex',alignItems:'center',gap:10,padding:'5px 10px',cursor:'pointer'}}>
                        <input type='radio' name={`lc-${gi}`} value='skip' checked={sel==='skip'} onChange={()=>setLowConfSels(p=>({...p,[gi]:'skip'}))} style={{accentColor:'#94a3b8',flexShrink:0}}/>
                        <span style={{fontSize:12,color:'#64748b',fontStyle:'italic'}}>Skip — don't assign to any account</span>
                      </label>
                    </div>
                    {sel&&sel!=='skip'&&rev&&(
                      <div style={{paddingTop:14,borderTop:'1px solid #fde68a'}}>
                        <IntelSection
                          entry={rev.intelEntry} approved={rev.intelApproved}
                          onToggle={v=>setLowConfReview(p=>({...p,[gi]:{...p[gi],intelApproved:v}}))}
                          onField={(f,v)=>updateLCIntel(gi,f,v)}
                        />
                        <ActionsSection
                          actions={rev.actions}
                          onUpdate={(aid,u)=>updateLCAct(gi,aid,u)}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* DONE */}
          {step==='done'&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'70px 24px',gap:14}}>
              <div style={{width:56,height:56,borderRadius:'50%',background:'#f0fdf4',border:'2px solid #bbf7d0',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div style={{fontSize:16,fontWeight:700,color:'#0f172a'}}>Updates saved</div>
              <div style={{fontSize:13,color:'#64748b',textAlign:'center',lineHeight:1.6,maxWidth:340}}>
                Intelligence distributed to the correct accounts. Your data will auto-save in a moment.
              </div>
              <button onClick={onClose} style={{marginTop:8,padding:'10px 26px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Done</button>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {hasFooter&&(
          <div style={{padding:'14px 24px',borderTop:'1px solid #f1f5f9',flexShrink:0,background:'#fff'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
              <div style={{fontSize:12,color:'#64748b'}}>
                {totals.intel>0&&<span>{totals.intel} intel {totals.intel===1?'entry':'entries'}</span>}
                {totals.intel>0&&totals.actions>0&&<span style={{margin:'0 5px'}}>·</span>}
                {totals.actions>0&&<span>{totals.actions} action{totals.actions!==1?'s':''}</span>}
                {totals.intel===0&&totals.actions===0&&<span style={{color:'#94a3b8'}}>No items approved</span>}
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setStep('input')} style={{padding:'9px 14px',background:'transparent',border:'1px solid #e2e8f0',borderRadius:7,color:'#64748b',fontSize:13,cursor:'pointer'}}>← Re-analyze</button>
                <button onClick={saveApproved} disabled={totals.intel===0&&totals.actions===0}
                  style={{padding:'9px 20px',background:totals.intel===0&&totals.actions===0?'#94a3b8':'linear-gradient(135deg,#0055CC 0%,#2563eb 100%)',border:'none',borderRadius:7,color:'#fff',fontSize:13,fontWeight:700,cursor:totals.intel===0&&totals.actions===0?'not-allowed':'pointer'}}>
                  Save Approved Updates
                </button>
              </div>
            </div>
          </div>
        )}
        {step==='review'&&!hasFooter&&(reviewItems.length>0||lowConfGroups.length>0)&&(
          <div style={{padding:'12px 24px',borderTop:'1px solid #f1f5f9',display:'flex',justifyContent:'flex-end',gap:8}}>
            <button onClick={()=>setStep('input')} style={{padding:'9px 14px',background:'transparent',border:'1px solid #e2e8f0',borderRadius:7,color:'#64748b',fontSize:13,cursor:'pointer'}}>← Re-analyze</button>
          </div>
        )}
      </div>
    </div>
  )
}
