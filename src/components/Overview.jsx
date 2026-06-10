import { useState, useEffect } from 'react'
import { Clock, Share2, Target, Map, User, X, List } from 'lucide-react'
import { BarChart, Bar, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { S, PC } from '../theme.js'
import { uid, fmtDate, daysUntil, daysSince, parseCost, fmtSpend, formatCompactCurrency, initials, calcDetailedHealthScore, calcHealthScore, getHealthColor, getQuickWin, sendToAppleReminders } from '../utils.js'
import { SC, PSC } from '../constants.js'
import { Badge, Btn, Field, Modal, SH, Card } from './UI.jsx'
import AIChatModal from './AIChatModal.jsx'

// Prevent auto-regenerating summary multiple times per session
const _autoSummaryGenerated = new Set()

// Shared retry wrapper (duplicated from App.jsx)
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

const HS_TOOLTIPS = {
  relationship: "Based on the number of contacts with Strong or Building relationship status. Strong contacts add points, contacts Needing Attention deduct points.",
  engagement: "Based on days since your last logged interaction. Recent contact within 7 days scores highest. No contact in 60+ days scores zero.",
  pipeline: "Based on projects currently In Flight or In Discussion. Stalled projects deduct points.",
  risk: "Deductions for open Critical follow-ups, tech stack renewals within 60 days, negative sentiment contacts, and Lost projects.",
  opportunity: "Points for vendors being actively evaluated and recently Won projects.",
}

function HealthScoreModal({acct, setAcct, onClose}) {
  const [editingComp, setEditingComp] = useState(null)
  const [compInput, setCompInput] = useState('')
  const [compReason, setCompReason] = useState('')
  const [totalActive, setTotalActive] = useState(()=>acct.healthScoreOverrides?.totalOverride!==undefined)
  const [totalInput, setTotalInput] = useState(()=>String(acct.healthScoreOverrides?.totalOverride??''))
  const [totalReason, setTotalReason] = useState(()=>acct.healthScoreOverrides?.totalOverrideReason||'')
  const [hoveredTooltip, setHoveredTooltip] = useState(null)

  const ds = calcDetailedHealthScore(acct)
  const {total:score, isManualOverride, components, helping, hurting, intelCount} = ds
  const hc = getHealthColor(score)
  const tier = score>=70?'Healthy':score>=40?'At Risk':'Critical'
  const history = (acct.healthScoreHistory||[]).slice(-7)
  const r=26, circ=2*Math.PI*r, prog=(score/100)*circ

  const saveComp = (key, max) => {
    const v=Math.max(0,Math.min(max,Number(compInput)||0))
    setAcct(p=>({...p,healthScoreOverrides:{...(p.healthScoreOverrides||{}),[key]:{value:v,reason:compReason,overriddenAt:new Date().toISOString().split('T')[0]}}}))
    setEditingComp(null)
  }
  const resetComp = key => setAcct(p=>{const ov={...(p.healthScoreOverrides||{})};delete ov[key];return{...p,healthScoreOverrides:ov}})
  const applyTotal = () => {
    const v=Math.max(0,Math.min(100,Number(totalInput)||0))
    setAcct(p=>({...p,healthScoreOverrides:{...(p.healthScoreOverrides||{}),totalOverride:v,totalOverrideReason:totalReason}}))
  }
  const clearTotal = () => {
    setTotalActive(false);setTotalInput('');setTotalReason('')
    setAcct(p=>{const ov={...(p.healthScoreOverrides||{})};delete ov.totalOverride;delete ov.totalOverrideReason;return{...p,healthScoreOverrides:ov}})
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{width:'65vw',height:'70vh',background:S.surf,borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden',border:`1px solid ${S.bdr}`,boxShadow:'0 24px 80px rgba(0,0,0,0.7)'}}>
        {isManualOverride&&<div style={{background:'rgba(249,115,22,0.15)',borderBottom:'1px solid rgba(249,115,22,0.3)',padding:'5px 20px',fontSize:11,fontWeight:700,color:S.orange,textAlign:'center',flexShrink:0}}>⚠ Manual total override active — component calculations are ignored</div>}
        <div style={{display:'flex',alignItems:'center',gap:14,padding:'14px 20px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:700,color:S.txt}}>Account Health Score</div>
            <div style={{fontSize:11,color:S.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{acct.name}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <svg width={r*2+10} height={r*2+10} viewBox={`0 0 ${r*2+10} ${r*2+10}`}>
              <circle cx={r+5} cy={r+5} r={r} fill='none' stroke={S.bdr} strokeWidth='5'/>
              <circle cx={r+5} cy={r+5} r={r} fill='none' stroke={hc} strokeWidth='5' strokeDasharray={`${prog} ${circ}`} strokeLinecap='round' transform={`rotate(-90 ${r+5} ${r+5})`}/>
              <text x={r+5} y={r+10} textAnchor='middle' fontSize='14' fontWeight='800' fill={hc}>{score}</text>
            </svg>
            <Badge label={tier} color={hc} bg={hc+'22'}/>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,padding:'0 4px',flexShrink:0}}>×</button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
          {intelCount<5&&<div style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.25)',borderRadius:6,padding:'7px 12px',marginBottom:12,fontSize:12,color:'#92400e',lineHeight:1.5}}>
            ⚡ Health score adjusted — fewer than 5 intel entries logged. Risk factors are weighted proportionally ({intelCount}/5 weight applied).
          </div>}
          <div style={{fontSize:10,fontWeight:700,color:S.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:10}}>Score Breakdown</div>
          {components.map(comp=>{
            const isEdit=editingComp===comp.key
            return (
              <div key={comp.key} style={{marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap'}}>
                      <span style={{fontSize:12,fontWeight:600,color:S.txt}}>{comp.label}</span>
                      <span style={{position:'relative',display:'inline-flex',alignItems:'center'}}>
                        <span onMouseEnter={()=>setHoveredTooltip(comp.key)} onMouseLeave={()=>setHoveredTooltip(null)} style={{fontSize:13,color:'#9CA3AF',cursor:'help',display:'inline-flex',alignItems:'center',justifyContent:'center',userSelect:'none'}}>ⓘ</span>
                        {hoveredTooltip===comp.key&&<div style={{position:'absolute',bottom:'100%',left:0,zIndex:1000,background:'#fff',borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',padding:'10px 12px',width:260,fontSize:12,color:'#374151',lineHeight:1.5,whiteSpace:'normal',pointerEvents:'none',marginBottom:4}}>{HS_TOOLTIPS[comp.key]}</div>}
                      </span>
                      {comp.overridden&&<Badge label='Overridden' color={S.orange} bg='rgba(249,115,22,0.12)' size={10}/>}
                    </div>
                    <div style={{height:5,background:S.bdr,borderRadius:3,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${Math.min(100,(comp.value/comp.max)*100)}%`,background:comp.value===0?S.dim:hc,borderRadius:3,transition:'width 0.3s'}}/>
                    </div>
                  </div>
                  <div style={{fontSize:12,fontWeight:700,color:S.txt,flexShrink:0,minWidth:50,textAlign:'right'}}>{comp.value} / {comp.max}</div>
                  <button onClick={()=>{setEditingComp(isEdit?null:comp.key);setCompInput(String(comp.value));setCompReason(comp.override?.reason||'')}} style={{background:'none',border:`1px solid ${S.bdr}`,color:S.muted,cursor:'pointer',fontSize:11,padding:'2px 7px',borderRadius:5,flexShrink:0}}>{isEdit?'✕':'✏'}</button>
                  {comp.overridden&&<button onClick={()=>resetComp(comp.key)} style={{fontSize:10,color:S.orange,background:'transparent',border:'1px solid rgba(249,115,22,0.3)',borderRadius:4,padding:'2px 7px',cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>Reset</button>}
                </div>
                {comp.overridden&&comp.override?.reason&&<div style={{fontSize:10,color:S.muted,marginTop:2,paddingLeft:2}}>↳ {comp.override.reason}</div>}
                {isEdit&&(
                  <div style={{background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:7,padding:'10px 12px',marginTop:6}}>
                    <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:8,flexWrap:'wrap'}}>
                      <span style={{fontSize:11,color:S.muted}}>Value (0–{comp.max}):</span>
                      <input type='number' min={0} max={comp.max} value={compInput} onChange={e=>setCompInput(e.target.value)} style={{width:64,fontSize:13,padding:'4px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,textAlign:'center'}}/>
                      <span style={{fontSize:11,color:S.muted}}>Auto-calculated: {comp.calc}</span>
                    </div>
                    <textarea value={compReason} onChange={e=>setCompReason(e.target.value)} placeholder='Reason for override (optional)...' rows={2} style={{width:'100%',fontSize:11,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit',marginBottom:8}}/>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>saveComp(comp.key,comp.max)} style={{padding:'4px 12px',background:S.blue,border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save</button>
                      <button onClick={()=>setEditingComp(null)} style={{padding:'4px 10px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,fontSize:12,cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:18,marginBottom:16}}>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:S.green,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8}}>✓ What's Helping</div>
              {helping.length===0&&<div style={{fontSize:12,color:S.dim}}>No significant positive factors yet.</div>}
              {helping.map((hf,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:`1px solid ${S.bdr}`}}>
                  <span style={{fontSize:11,color:S.green,fontWeight:700,flexShrink:0,minWidth:44}}>+{hf.pts}pts</span>
                  <span style={{fontSize:12,color:S.secondary}}>{hf.label}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:S.red,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8}}>✗ What's Hurting</div>
              {hurting.length===0&&<div style={{fontSize:12,color:S.dim}}>No significant negative factors — great shape!</div>}
              {hurting.map((hf,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:`1px solid ${S.bdr}`}}>
                  <span style={{fontSize:11,color:S.red,fontWeight:700,flexShrink:0,minWidth:44}}>-{hf.pts}pts</span>
                  <span style={{fontSize:12,color:S.secondary}}>{hf.label}</span>
                </div>
              ))}
            </div>
          </div>
          {history.length>1&&(
            <>
              <div style={{fontSize:10,fontWeight:700,color:S.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:6}}>Score History — Last {history.length} Days</div>
              <Card style={{padding:'10px 8px 2px',marginBottom:16}}>
                <ResponsiveContainer width='100%' height={72}>
                  <BarChart data={history} margin={{top:0,right:8,bottom:0,left:0}}>
                    <XAxis dataKey='date' tickFormatter={d=>d.slice(5).replace('-','/')} tick={{fontSize:9,fill:S.muted}} axisLine={false} tickLine={false}/>
                    <Bar dataKey='score' fill={hc} radius={[3,3,0,0]}/>
                    <RechartsTooltip formatter={v=>[v,'Score']} contentStyle={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,fontSize:11,color:S.txt}}/>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </>
          )}
          <div style={{borderTop:`1px solid ${S.bdr}`,paddingTop:14}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.08em'}}>Manual Score Override</div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:12,color:S.muted}}>Use manual total</span>
                <div onClick={()=>{if(totalActive)clearTotal();else setTotalActive(true)}} style={{width:36,height:20,borderRadius:10,background:totalActive?S.blue:S.bdr,cursor:'pointer',position:'relative',transition:'background 0.2s',flexShrink:0}}>
                  <div style={{position:'absolute',top:2,left:totalActive?18:2,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left 0.2s'}}/>
                </div>
              </div>
            </div>
            {totalActive&&(
              <div style={{background:S.surf2,border:'1px solid rgba(249,115,22,0.25)',borderRadius:8,padding:'12px'}}>
                <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:8,flexWrap:'wrap'}}>
                  <span style={{fontSize:12,color:S.txt}}>Score (0–100):</span>
                  <input type='number' min={0} max={100} value={totalInput} onChange={e=>setTotalInput(e.target.value)} style={{width:72,fontSize:16,fontWeight:700,padding:'4px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,textAlign:'center'}}/>
                </div>
                <textarea value={totalReason} onChange={e=>setTotalReason(e.target.value)} placeholder='Reason for manual override...' rows={2} style={{width:'100%',fontSize:11,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit',marginBottom:8}}/>
                <button onClick={applyTotal} style={{padding:'5px 16px',background:S.orange,border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Apply Override</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Overview({acct,setAcct,setTab,apiKey}) {
  const [showDismissed,setShowDismissed] = useState(false)
  const [alertModal,setAlertModal] = useState(null)
  const [hoveredAlert,setHoveredAlert] = useState(null)
  const [showAddFU,setShowAddFU] = useState(false)
  const [showAIChat,setShowAIChat] = useState(false)
  const [showHealthModal,setShowHealthModal] = useState(false)
  const [completingFU,setCompletingFU] = useState(null)
  const [hoveredCard,setHoveredCard] = useState(null)
  const [showAddDate,setShowAddDate] = useState(false)
  const [dateForm,setDateForm] = useState({title:'',date:'',type:'Meeting',notes:''})
  const [showMoreDates,setShowMoreDates] = useState(false)
  const [hoveredDateId,setHoveredDateId] = useState(null)
  const [expandedDateId,setExpandedDateId] = useState(null)
  const [editDateForm,setEditDateForm] = useState(null)
  const [snoozeOpenFor,setSnoozeOpenFor] = useState(null)
  const [showSnoozed,setShowSnoozed] = useState(false)
  const [snoozeToast,setSnoozeToast] = useState(false)
  const [snoozeMsg,setSnoozeMsg] = useState('Snoozed!')
  const [remindersToast,setRemindersToast] = useState(false)
  const [fuSnoozeId,setFuSnoozeId] = useState(null)
  const [fuSnoozeCustomDate,setFuSnoozeCustomDate] = useState('')
  const [fuSnoozePos,setFuSnoozePos] = useState(null)
  const [hoveredFuId,setHoveredFuId] = useState(null)
  const [fuForm,setFuForm] = useState({task:'',contact:'',priority:'High',dueDate:'',context:''})
  const [summaryLoading,setSummaryLoading] = useState(false)
  const [summaryError,setSummaryError] = useState(null)
  const [showSpendModal,setShowSpendModal] = useState(false)
  const [showPipelineModal,setShowPipelineModal] = useState(false)

  useEffect(()=>{
    const now=new Date()
    setAcct(prev=>{
      const cleaned=(prev.snoozedAlerts||[]).filter(s=>new Date(s.snoozedUntil)>now)
      if(cleaned.length===(prev.snoozedAlerts||[]).length)return prev
      return{...prev,snoozedAlerts:cleaned}
    })
  },[])

  useEffect(()=>{
    if(!snoozeOpenFor)return
    const h=()=>setSnoozeOpenFor(null)
    document.addEventListener('click',h)
    return()=>document.removeEventListener('click',h)
  },[snoozeOpenFor])

  useEffect(()=>{
    if(!fuSnoozeId)return
    const h=()=>{setFuSnoozeId(null);setFuSnoozePos(null)}
    document.addEventListener('click',h)
    return()=>document.removeEventListener('click',h)
  },[fuSnoozeId])
  const effectiveKey = apiKey || ''
  const mob = typeof window!=='undefined'&&window.innerWidth<768
  const openFU = acct.followUps.filter(f=>f.status==='Open')
  const alerts = []
  acct.techStack.forEach(t=>{
    const d = daysUntil(t.renewalDate)
    if (d!==null&&d>0&&d<=150) alerts.push({id:`renew:${t.vendor}:${t.renewalDate}`,text:`${t.vendor} renewal in ${d} days — ${fmtDate(t.renewalDate)}`,level:d<=60?'critical':'high'})
    if (t.status==='Replacing') alerts.push({id:`replacing:${t.vendor}`,text:`${t.vendor} marked Replacing — ensure migration project is tracked`,level:'high'})
  })
  openFU.forEach(f=>{ if (f.dueDate&&daysUntil(f.dueDate)<0) alerts.push({id:`overdue:${f.task.slice(0,40).replace(/\s+/g,'_')}`,text:`Overdue: ${f.task}`,level:'critical'}) })
  const attnContacts = acct.contacts.filter(c=>c.relStatus==='Needs Attention')
  if (attnContacts.length>0) alerts.push({id:`attn:${attnContacts.map(c=>c.id).join(',')}`,text:`${attnContacts.length} contact${attnContacts.length>1?'s':''} need relationship attention`,level:'medium'})
  acct.projects.filter(p=>p.status==='Stalled').forEach(p=>{
    alerts.push({id:`stalled:${p.id}`,text:`${p.name} is stalled`,level:'high'})
  })

  const dismissed = acct.dismissedAlerts || []
  const dismiss = id => setAcct(p=>({...p,dismissedAlerts:[...(p.dismissedAlerts||[]),id]}))
  const nowTs = new Date()
  const activeSnoozedSet = new Set((acct.snoozedAlerts||[]).filter(s=>new Date(s.snoozedUntil)>nowTs).map(s=>s.id))
  const visibleAlerts = alerts.filter(a=>!dismissed.includes(a.id)&&!activeSnoozedSet.has(a.id))
  const hiddenAlerts = alerts.filter(a=>dismissed.includes(a.id))
  const snoozedAlertsList = alerts.filter(a=>activeSnoozedSet.has(a.id))
  const clearAll = () => {
    if (!window.confirm(`Dismiss all ${visibleAlerts.length} current alert${visibleAlerts.length!==1?'s':''}?`)) return
    setAcct(p=>({...p,dismissedAlerts:[...(p.dismissedAlerts||[]),...visibleAlerts.map(a=>a.id)]}))
  }
  const snooze = (alertId, option) => {
    const until = new Date()
    if (option==='later') {
      until.setHours(17,0,0,0)
      if (until<=nowTs) { until.setDate(until.getDate()+1); until.setHours(17,0,0,0) }
    } else if (option==='tomorrow') {
      until.setDate(until.getDate()+1); until.setHours(8,0,0,0)
    } else if (option==='3days') {
      until.setDate(until.getDate()+3); until.setHours(8,0,0,0)
    } else {
      const day=until.getDay(); const daysUntilMonday=day===1?7:((1+7-day)%7)||7
      until.setDate(until.getDate()+daysUntilMonday); until.setHours(7,0,0,0)
    }
    setAcct(prev=>{
      const existing=(prev.snoozedAlerts||[]).filter(s=>s.id!==alertId)
      return{...prev,snoozedAlerts:[...existing,{id:alertId,snoozedUntil:until.toISOString()}]}
    })
    setSnoozeOpenFor(null)
    setSnoozeToast(true)
    setTimeout(()=>setSnoozeToast(false),2000)
  }

  const snoozeFU = (fuId, option, customDate) => {
    const until = new Date()
    let ds
    if (option==='tomorrow') { until.setDate(until.getDate()+1); ds=until.toISOString().split('T')[0] }
    else if (option==='3days') { until.setDate(until.getDate()+3); ds=until.toISOString().split('T')[0] }
    else if (option==='1week') { until.setDate(until.getDate()+7); ds=until.toISOString().split('T')[0] }
    else if (option==='custom') { ds=customDate }
    if (!ds) return
    setAcct(prev=>({...prev,followUps:prev.followUps.map(f=>f.id===fuId?{...f,dueDate:ds}:f)}))
    setFuSnoozeId(null)
    setFuSnoozeCustomDate('')
    setFuSnoozePos(null)
    const dateStr=new Date(ds+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})
    setSnoozeMsg(`Snoozed until ${dateStr}`)
    setSnoozeToast(true)
    setTimeout(()=>setSnoozeToast(false),2500)
  }

  const saveCustomDate = () => {
    if (!dateForm.title.trim()||!dateForm.date) return
    setAcct(prev=>({...prev,upcomingDates:[...(prev.upcomingDates||[]),{...dateForm,id:uid()}]}))
    setShowAddDate(false); setDateForm({title:'',date:'',type:'Meeting',notes:''})
  }
  const deleteCustomDate = id => { setAcct(prev=>({...prev,upcomingDates:(prev.upcomingDates||[]).filter(d=>d.id!==id)})); setExpandedDateId(null); setEditDateForm(null) }
  const saveEditDate = () => { if(!editDateForm)return; setAcct(prev=>({...prev,upcomingDates:(prev.upcomingDates||[]).map(d=>d.id===editDateForm.id?editDateForm:d)})); setExpandedDateId(null); setEditDateForm(null) }
  const toggleDateExpand = item => {
    if(expandedDateId===item.id){setExpandedDateId(null);setEditDateForm(null);return}
    setExpandedDateId(item.id)
    if(item.isCustom){const cd=(acct.upcomingDates||[]).find(d=>d.id===item.customId);setEditDateForm(cd?{...cd}:null)}
    else setEditDateForm(null)
  }
  const openAddFU = (task='',contact='') => { setFuForm({task,contact,priority:'High',dueDate:'',context:''}); setShowAddFU(true) }
  const saveQuickFU = () => {
    if (!fuForm.task.trim()) return
    setAcct(prev=>({...prev,followUps:[...prev.followUps,{...fuForm,id:uid(),status:'Open'}]}))
    setShowAddFU(false); setFuForm({task:'',contact:'',priority:'High',dueDate:'',context:''}); setAlertModal(null)
  }

  const openAlertDetail = a => {
    if (a.id.startsWith('renew:')) {
      const t = acct.techStack.find(t=>a.id===`renew:${t.vendor}:${t.renewalDate}`)
      if (t) setAlertModal({type:'renewal',t,level:a.level}); return
    }
    if (a.id.startsWith('replacing:')) {
      const vendorName = a.id.slice('replacing:'.length)
      const t = acct.techStack.find(t=>t.vendor===vendorName)
      if (!t) return
      const relProjs = acct.projects.filter(p=>(p.vendor||'').toLowerCase().includes(vendorName.toLowerCase())||(p.name||'').toLowerCase().includes(vendorName.toLowerCase()))
      setAlertModal({type:'replacing',t,relProjs,level:a.level}); return
    }
    if (a.id.startsWith('overdue:')) {
      const taskKey = a.id.slice('overdue:'.length)
      const fu = openFU.find(f=>f.dueDate&&daysUntil(f.dueDate)<0&&f.task.slice(0,40).replace(/\s+/g,'_')===taskKey)
      if (fu) setAlertModal({type:'overdue',fu,level:a.level}); return
    }
    if (a.id.startsWith('attn:')) { setAlertModal({type:'attention',contacts:attnContacts,level:a.level}); return }
    if (a.id.startsWith('stalled:')) {
      const projId = a.id.slice('stalled:'.length)
      const p = acct.projects.find(proj=>proj.id===projId)
      if (p) setAlertModal({type:'stalled',p,level:a.level}); return
    }
    setAlertModal({type:'generic',text:a.text,level:a.level})
  }

  const inFlight = acct.projects.filter(p=>p.status==='In Flight').length
  const lastC = acct.lastContact ? Math.abs(daysUntil(acct.lastContact)||0) : '?'
  const totalAnnualSpend = (acct.techStack||[]).reduce((s,t)=>s+parseCost(t.cost),0)
  const stageWeights = {'Awareness':0.10,'NDA':0.10,'Intro Call':0.15,'Demo':0.20,'POC':0.30,'Scoping':0.40,'Pricing':0.60,'Legal':0.90,'Procurement':0.90,'PO Received':1.00,'Deployed':1.00}
  const totalWeightedPipeline = (acct.projects||[]).filter(p=>p.status!=='Lost'&&p.estimatedRevenue).reduce((s,p)=>{const rev=parseCost(p.estimatedRevenue);const cs=p.timeline?.find(t=>t.status==='current')?.stage||p.timeline?.filter(t=>t.status==='completed').slice(-1)[0]?.stage;return s+rev*(stageWeights[cs]??0.10)},0)

  const InfoRow = ({label,val}) => (
    <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:`1px solid ${S.bdr}`,fontSize:13,gap:12}}>
      <span style={{color:S.muted,flexShrink:0}}>{label}</span><span style={{color:S.txt,textAlign:'right'}}>{val||'—'}</span>
    </div>
  )

  const TYPE_ICONS = {'Renewal':'🔄','Project':'🎯','Meeting':'📅','Out of Office':'✈️','Personal Note':'👤','Contract Deadline':'📋','Milestone':'🏁','Other':'•'}
  const typeIcon = src => TYPE_ICONS[src] || '•'
  const DATE_PLACEHOLDERS = {'Meeting':'e.g. QBR with Jamie Jervey, NetSpy demo with Rudy','Out of Office':'e.g. Rudy out of office — traveling to Italy','Personal Note':"e.g. Jamie's work anniversary, Rudy's daughter's graduation",'Contract Deadline':'e.g. Saviynt contract decision deadline','Renewal':'e.g. Cloudflare SASE renewal','Milestone':'e.g. Google SecOps go-live target'}
  const upcomingItems = []
  ;(acct.techStack||[]).forEach(t=>{
    if (!t.renewalDate) return
    const d=daysUntil(t.renewalDate)
    if (d===null||d>120) return
    const dot=d<=30?S.red:d<=60?S.orange:S.yellow
    upcomingItems.push({id:`renewal:${t.id}`,date:t.renewalDate,days:d,label:`${t.vendor} contract renewal`,source:'Renewal',dot,tab:'stack'})
  })
;(acct.upcomingDates||[]).forEach(cd=>{
    const d=daysUntil(cd.date)
    if (d===null||d>180||d<-30) return
    const dot=d<0?S.red:d<=30?S.orange:d<=90?S.yellow:S.muted
    upcomingItems.push({id:`custom:${cd.id}`,date:cd.date,days:d,label:cd.title.length>45?cd.title.slice(0,44)+'…':cd.title,fullLabel:cd.title,source:cd.type,dot,tab:null,isCustom:true,customId:cd.id,notes:cd.notes})
  })
  upcomingItems.sort((a,b)=>a.date.localeCompare(b.date))

  const formatSummaryAge = iso => {
    const hrs = Math.floor((Date.now()-new Date(iso))/ 3600000)
    if (hrs<1) return 'just now'
    if (hrs===1) return '1 hour ago'
    if (hrs<24) return `${hrs} hours ago`
    const d=Math.floor(hrs/24); return `${d} day${d!==1?'s':''} ago`
  }

  const parseSummary = text => {
    const norm = s=>s.toUpperCase().replace(/['\u2018\u2019\u201a\u2032]/g,'').replace(/\s+/g,' ').trim()
    const defs = [
      {key:'summary',title:'SUMMARY',isSummary:true},
      {key:'now',title:"WHAT'S HAPPENING NOW",color:'#007AFF',lightBg:'#f0f9ff',darkBg:'rgba(0,122,255,0.08)'},
      {key:'coming',title:"WHAT'S COMING UP",color:'#7c3aed',lightBg:'#faf5ff',darkBg:'rgba(124,58,237,0.08)'},
      {key:'watch',title:'WATCH LIST',color:'#fc413d',lightBg:'#fef2f2',darkBg:'rgba(252,65,61,0.08)'},
      {key:'momentum',title:'MOMENTUM ITEMS',color:'#0ebc5f',lightBg:'#f0fdf4',darkBg:'rgba(14,188,95,0.08)'},
      {key:'next',title:'RECOMMENDED NEXT MOVE',color:'#92400e',lightBg:'#fffbeb',darkBg:'rgba(146,64,14,0.1)',isNext:true},
    ]
    const parts = text.split(/\*\*([^*]+)\*\*/)
    const result = []
    for (let i=1;i<parts.length-1;i+=2) {
      const header = norm(parts[i])
      const content = parts[i+1]||''
      const def = defs.find(d=>header.includes(norm(d.title)))
      if (!def) continue
      if (def.isSummary) {
        result.push({...def, text: content.trim()})
      } else {
        const bullets = content.split('\n').map(l=>l.replace(/^[-\u2022\u2192*]\s*/,'').trim()).filter(Boolean).slice(0,2)
        result.push({...def,bullets})
      }
    }
    return result
  }

  const generateSummary = async () => {
    if (!effectiveKey) { setSummaryError('no_key'); return }
    setSummaryLoading(true); setSummaryError(null)
    try {
      const recentIntel = (acct.intelLog||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,3)
      const pOrder = {Critical:0,High:1,Medium:2,Low:3}
      const openFUs = (acct.followUps||[]).filter(f=>f.status==='Open').sort((a,b)=>(pOrder[a.priority]??4)-(pOrder[b.priority]??4))
      const upcoming90 = (acct.upcomingDates||[]).filter(d=>{const dy=daysUntil(d.date);return dy!==null&&dy>=0&&dy<=90}).sort((a,b)=>a.date.localeCompare(b.date))
      const techUp90 = (acct.techStack||[]).filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>=0&&d<=90})
      const activeProjs = (acct.projects||[]).filter(p=>p.status==='In Flight'||p.status==='In Discussion')
      const renewals120 = (acct.techStack||[]).filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>=0&&d<=120})
      const attnC = (acct.contacts||[]).filter(c=>c.relStatus==='Needs Attention')
      const critAlerts = visibleAlerts.filter(a=>a.level==='critical')
      let ctx = ''
      if (recentIntel.length>0) { ctx+=`\nRECENT INTEL (last 3):\n`; recentIntel.forEach(e=>{ctx+=`- ${fmtDate(e.date)}: Participants: ${e.participants||'N/A'}. Summary: ${e.summary||'N/A'}. Insights: ${e.insights||'N/A'}. Risks: ${e.risks||'N/A'}. Opportunities: ${e.opportunities||'N/A'}.\n`}) }
      if (openFUs.length>0) { ctx+=`\nOPEN FOLLOW-UPS:\n`; openFUs.forEach(f=>{ctx+=`- [${f.priority}] ${f.task} — due: ${fmtDate(f.dueDate)||'no date'}, contact: ${f.contact||'N/A'}\n`}) }
      if (upcoming90.length>0||techUp90.length>0) { ctx+=`\nUPCOMING (90 days):\n`; upcoming90.forEach(d=>{ctx+=`- ${fmtDate(d.date)}: ${d.title} (${d.type})\n`}); techUp90.forEach(t=>{ctx+=`- ${fmtDate(t.renewalDate)}: ${t.vendor} renewal\n`}) }
      if (activeProjs.length>0) { ctx+=`\nACTIVE PROJECTS:\n`; activeProjs.forEach(p=>{ctx+=`- ${p.name} [${p.status}] Stage: ${p.currentStage||'N/A'}, Waiting on: ${p.waitingOn||'N/A'}, Next: ${p.nextAction||'N/A'}\n`}) }
      if (renewals120.length>0) { ctx+=`\nRENEWALS (120 days):\n`; renewals120.forEach(t=>{ctx+=`- ${t.vendor}: ${fmtDate(t.renewalDate)}\n`}) }
      if (attnC.length>0) { ctx+=`\nCONTACTS NEEDING ATTENTION:\n`; attnC.forEach(c=>{ctx+=`- ${c.name} (${c.title||'N/A'})\n`}) }
      if (acct.lastContact) ctx+=`\nLAST CONTACT: ${fmtDate(acct.lastContact)}\n`
      if (critAlerts.length>0) { ctx+=`\nCRITICAL ALERTS:\n`; critAlerts.forEach(a=>{ctx+=`- ${a.text}\n`}) }
      const sys = `You are an account intelligence assistant for a cybersecurity sales rep at GuidePoint Security. Generate a concise, actionable account briefing. CRITICAL RULES: Only report on the relationship between GuidePoint and THIS specific account. If intel mentions frustrations with OTHER vendors, competitors, or internal politics at the client — interpret those as OPPORTUNITIES or CONTEXT, never as problems with the GuidePoint relationship. For example: if a client is frustrated with CrowdStrike, that is an opportunity for GuidePoint, not a relationship problem. If contacts are complaining about internal budget issues, that is context, not a relationship risk. Never use words like 'fractured', 'damaged', or 'strained' to describe the GuidePoint relationship unless there is explicit direct evidence of dissatisfaction with GuidePoint specifically. Write in second person (you/your). Be direct and specific. No filler language.`
      const usr = `Generate a structured account briefing for ${acct.name} based on this data:\n${ctx}\nFormat your response EXACTLY like this:\n\n**SUMMARY**\n[3 sentences max. Sentence 1: current relationship state and most recent activity. Sentence 2: biggest active opportunity or risk. Sentence 3: most important upcoming item or deadline. Be specific, use names and dates.]\n\n**WHAT'S HAPPENING NOW**\n[2 bullet points max, one sentence each. Focus only on recent activity between GuidePoint and this account. Competitor mentions or third-party context should only appear if relevant to an active GuidePoint opportunity.]\n\n**WHAT'S COMING UP**\n[2 bullet points max, one sentence each]\n\n**WATCH LIST**\n[2 bullet points max, one sentence each. Only include items that are direct risks to the GuidePoint relationship or deal — things like an unanswered follow-up, a stalled project, a contact who went cold ON US, or a hard deadline we might miss. Do NOT include competitor problems, vendor frustrations, or client internal politics as watch list items unless they directly threaten a GuidePoint deal.]\n\n**MOMENTUM ITEMS**\n[2 bullet points max, one sentence each]\n\n**RECOMMENDED NEXT MOVE**\n[1 sentence. The single most important action. Start with a verb.]\n\nNo preamble, no filler.`
      const {data:json} = await callClaudeWithRetry({model:'claude-sonnet-4-6',max_tokens:1200,system:sys,messages:[{role:'user',content:usr}]}, effectiveKey, null)
      if (json.error) throw new Error('api')
      const content = json.content?.[0]?.text||''
      setAcct(prev=>({...prev,aiSummary:{content,generatedAt:new Date().toISOString()}}))
    } catch { setSummaryError('api_error') } finally { setSummaryLoading(false) }
  }

  useEffect(()=>{
    if (!effectiveKey) return
    if (_autoSummaryGenerated.has(acct.id)) return
    const s = acct.aiSummary
    const stale = !s?.generatedAt||(Date.now()-new Date(s.generatedAt))>86400000
    if (stale) { _autoSummaryGenerated.add(acct.id); generateSummary() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[acct.id])

  return (
    <div>
      <style>{`@keyframes aiPulse{0%,100%{opacity:0.85}50%{opacity:1;text-shadow:0 0 12px rgba(14,165,233,0.8)}} @keyframes alertPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.85)}} @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}} @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      {snoozeToast&&<div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'rgba(34,197,94,0.92)',color:'#fff',padding:'9px 22px',borderRadius:8,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:'0 4px 16px rgba(0,0,0,0.35)',pointerEvents:'none',display:'flex',alignItems:'center',gap:7}}><Clock size={14}/> {snoozeMsg}</div>}
      {remindersToast&&<div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'rgba(34,197,94,0.92)',color:'#fff',padding:'9px 22px',borderRadius:8,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:'0 4px 16px rgba(0,0,0,0.35)',pointerEvents:'none',display:'flex',alignItems:'center',gap:7}}><Share2 size={14}/> Sending to Apple Reminders...</div>}
      <div style={{display:'grid',gridTemplateColumns:mob?'repeat(2,1fr)':typeof window!=='undefined'&&window.innerWidth<1200?'repeat(4,1fr)':'repeat(8,1fr)',gap:8,marginBottom:16}}>
        {/* AI Intelligence — first / leftmost */}
        <div onClick={()=>setShowAIChat(true)}
          style={{background:'linear-gradient(135deg,#0a1628 0%,#0066cc 50%,#0ea5e9 100%)',border:'1px solid rgba(14,165,233,0.3)',borderRadius:8,padding:'14px 16px',cursor:'pointer',transition:'box-shadow 0.2s',boxShadow:'0 2px 8px rgba(0,0,0,0.3)',minHeight:80,display:'flex',flexDirection:'column',justifyContent:'space-between'}}
          onMouseEnter={e=>e.currentTarget.style.boxShadow='0 0 20px rgba(14,165,233,0.4)'}
          onMouseLeave={e=>e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.3)'}>
          <div style={{fontSize:22,animation:'aiPulse 3s infinite',lineHeight:1}}>✦</div>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:'#fff',marginBottom:3}}>AI Intelligence</div>
            <div style={{fontSize:12,color:'rgba(255,255,255,0.6)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Account Intel</div>
          </div>
        </div>
        {/* Health Score card — second */}
        {(()=>{
          const hs=calcHealthScore(acct)
          const hc=getHealthColor(hs)
          const hg=`linear-gradient(135deg,#0a1628 0%,${hc} 100%)`
          return (
            <div onClick={()=>setShowHealthModal(true)}
              style={{background:'#FFFFFF',border:'1px solid #EEEFF2',borderTop:`3px solid ${hc}`,borderRadius:12,padding:'14px 16px',cursor:'pointer',transition:'all 0.2s',boxShadow:'0 1px 4px rgba(0,0,0,0.06)',minHeight:80,display:'flex',flexDirection:'column',justifyContent:'space-between'}}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.10)';e.currentTarget.style.transform='translateY(-1px)'}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.06)';e.currentTarget.style.transform='translateY(0)'}}>
              <div style={{fontSize:10,color:'#9CA3AF',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>Health Score</div>
              <div style={{fontSize:36,fontWeight:900,color:'#111827',lineHeight:1}}>{hs}</div>
            </div>
          )
        })()}
        {/* Metric cards */}
        {[
          {label:'Open Follow-Ups',val:openFU.length,c:'#007AFF',tab:'followups',type:'followups'},
          {label:'Active Projects',val:inFlight,c:'#16a34a',tab:'projects',type:'projects'},
          {label:'Contacts Mapped',val:acct.contacts.length,c:'#7c3aed',tab:'contacts',type:'contacts'},
          {label:'Days Since Contact',val:lastC,c:typeof lastC==='number'&&lastC>14?'#ea580c':'#16a34a',tab:'intel',type:'contact-days'}
        ].map(m=>{
          const isHov = hoveredCard===m.label
          return (
            <div key={m.label}
              onClick={()=>setTab(m.tab)}
              onMouseEnter={()=>setHoveredCard(m.label)}
              onMouseLeave={()=>setHoveredCard(null)}
              style={{background:'#FFFFFF',border:'1px solid #EEEFF2',borderTop:`3px solid ${m.c}`,borderRadius:12,padding:'14px 16px',boxShadow:isHov?'0 4px 12px rgba(0,0,0,0.10)':'0 1px 4px rgba(0,0,0,0.06)',minHeight:80,display:'flex',flexDirection:'column',justifyContent:'space-between',cursor:'pointer',transition:'all 0.2s',transform:isHov?'translateY(-1px)':'translateY(0)'}}>
              <div style={{fontSize:10,color:'#9CA3AF',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.08em'}}>{m.label}</div>
              <div style={{fontSize:36,fontWeight:900,color:'#111827',lineHeight:1}}>{m.val}</div>
            </div>
          )
        })}
        {/* Annual Spend card */}
        {(()=>{
          const isHov=hoveredCard==='ANNUAL SPEND'
          return (
            <div
              onClick={()=>setShowSpendModal(true)}
              onMouseEnter={()=>setHoveredCard('ANNUAL SPEND')}
              onMouseLeave={()=>setHoveredCard(null)}
              style={{background:'#FFFFFF',border:'1px solid #EEEFF2',borderTop:'3px solid #8B5CF6',borderRadius:12,padding:'14px 16px',boxShadow:isHov?'0 4px 12px rgba(0,0,0,0.10)':'0 1px 4px rgba(0,0,0,0.06)',minHeight:80,display:'flex',flexDirection:'column',justifyContent:'space-between',cursor:'pointer',transition:'all 0.2s',transform:isHov?'translateY(-1px)':'translateY(0)'}}>
              <div style={{fontSize:10,color:'#9CA3AF',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.08em'}}>Annual Spend</div>
              <div style={{fontSize:22,fontWeight:900,color:'#111827',lineHeight:1}}>{totalAnnualSpend>0?formatCompactCurrency(totalAnnualSpend):'—'}</div>
            </div>
          )
        })()}
        {/* Pipeline card */}
        {(()=>{
          const isHov=hoveredCard==='PIPELINE'
          return (
            <div
              onClick={()=>setShowPipelineModal(true)}
              onMouseEnter={()=>setHoveredCard('PIPELINE')}
              onMouseLeave={()=>setHoveredCard(null)}
              style={{background:'#FFFFFF',border:'1px solid #EEEFF2',borderTop:'3px solid #0891b2',borderRadius:12,padding:'14px 16px',boxShadow:isHov?'0 4px 12px rgba(0,0,0,0.10)':'0 1px 4px rgba(0,0,0,0.06)',minHeight:80,display:'flex',flexDirection:'column',justifyContent:'space-between',cursor:'pointer',transition:'all 0.2s',transform:isHov?'translateY(-1px)':'translateY(0)'}}>
              <div style={{fontSize:10,color:'#9CA3AF',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.08em'}}>Pipeline</div>
              <div style={{fontSize:22,fontWeight:900,color:'#111827',lineHeight:1}}>{totalWeightedPipeline>0?formatCompactCurrency(totalWeightedPipeline):'—'}</div>
              {totalWeightedPipeline>0&&<div style={{fontSize:9,color:'#9CA3AF',marginTop:1}}>weighted by stage</div>}
            </div>
          )
        })()}
      </div>
      {showAIChat&&<AIChatModal acct={acct} setAcct={setAcct} effectiveKey={effectiveKey} onClose={()=>setShowAIChat(false)}/>}
      {showHealthModal&&<HealthScoreModal acct={acct} setAcct={setAcct} onClose={()=>setShowHealthModal(false)}/>}
      {showPipelineModal&&(()=>{
        const sw={'Awareness':0.10,'NDA':0.10,'Intro Call':0.15,'Demo':0.20,'POC':0.30,'Scoping':0.40,'Pricing':0.60,'Legal':0.90,'Procurement':0.90,'PO Received':1.00,'Deployed':1.00}
        const wBadge=w=>{if(w>=1.0)return{c:'#7c3aed',bg:'rgba(124,58,237,0.12)'};if(w>=0.9)return{c:'#16a34a',bg:'rgba(22,163,74,0.12)'};if(w>=0.6)return{c:'#ea580c',bg:'rgba(234,88,12,0.12)'};if(w>=0.3)return{c:'#ca8a04',bg:'rgba(202,138,4,0.12)'};if(w>=0.15)return{c:'#007AFF',bg:'rgba(0,122,255,0.12)'};return{c:'#64748b',bg:'rgba(100,116,139,0.12)'}}
        const rows=(acct.projects||[]).filter(p=>p.status!=='Lost').map(p=>{const rev=parseCost(p.estimatedRevenue);const cs=p.timeline?.find(t=>t.status==='current')?.stage||p.timeline?.filter(t=>t.status==='completed').slice(-1)[0]?.stage||null;const w=sw[cs]??0.10;return{...p,_rev:rev,_cs:cs,_w:w,_wv:rev*w}}).sort((a,b)=>b._wv-a._wv)
        const active=rows.filter(r=>r._rev>0)
        const totW=active.reduce((s,r)=>s+r._wv,0)
        const totU=active.reduce((s,r)=>s+r._rev,0)
        return(
          <Modal title={`Weighted Pipeline — ${acct.name}`} onClose={()=>setShowPipelineModal(false)} width='min(900px,65vw)'>
            {active.length===0
              ?<div style={{textAlign:'center',padding:'32px 0',color:S.muted,fontSize:13}}>No pipeline revenue entered. Add estimated revenue to your projects to track weighted pipeline.</div>
              :<>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:20}}>
                  {[{label:'Total Weighted Pipeline',val:formatCompactCurrency(totW),c:'#0891b2'},{label:'Total Unweighted',val:formatCompactCurrency(totU),c:'#007AFF'},{label:'Active Projects w/ Revenue',val:String(active.length),c:'#16a34a'}].map(card=>(
                    <div key={card.label} style={{background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:8,padding:'12px 14px'}}>
                      <div style={{fontSize:9,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>{card.label}</div>
                      <div style={{fontSize:20,fontWeight:800,color:card.c}}>{card.val}</div>
                    </div>
                  ))}
                </div>
                <div style={{border:`1px solid ${S.bdr}`,borderRadius:8,overflow:'hidden'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 90px 100px 70px 110px 90px',gap:'4px 12px',padding:'7px 14px',fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',background:S.surf2,borderBottom:`1px solid ${S.bdr}`}}>
                    <div>Project</div><div>Stage</div><div style={{textAlign:'right'}}>Est. Revenue</div><div style={{textAlign:'right'}}>Weight</div><div style={{textAlign:'right'}}>Weighted Value</div><div>Status</div>
                  </div>
                  {rows.map((p,i)=>{
                    const wb=wBadge(p._w);const hasRev=p._rev>0
                    return(
                      <div key={p.id||i} style={{display:'grid',gridTemplateColumns:'1fr 90px 100px 70px 110px 90px',gap:'4px 12px',padding:'8px 14px',borderBottom:i<rows.length-1?`1px solid ${S.bdr}`:'none',fontSize:12,color:hasRev?S.txt:S.muted,alignItems:'center',opacity:hasRev?1:0.6}}>
                        <div style={{fontWeight:hasRev?600:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</div>
                        <div style={{fontSize:11,color:S.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p._cs||'—'}</div>
                        <div style={{textAlign:'right'}}>{hasRev?formatCompactCurrency(p._rev):'—'}</div>
                        <div style={{textAlign:'right'}}><span style={{fontSize:10,fontWeight:700,color:wb.c,background:wb.bg,borderRadius:999,padding:'2px 6px'}}>{Math.round(p._w*100)}%</span></div>
                        <div style={{textAlign:'right',fontWeight:600,color:hasRev?'#0891b2':S.muted}}>{hasRev?formatCompactCurrency(p._wv):'—'}</div>
                        <div><span style={{fontSize:10,fontWeight:600,color:PSC[p.status]||S.muted}}>{p.status}</span></div>
                      </div>
                    )
                  })}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 90px 100px 70px 110px 90px',gap:'4px 12px',padding:'8px 14px',fontSize:12,fontWeight:700,color:S.txt,background:S.surf2,borderTop:`1px solid ${S.bdr}`}}>
                    <div>Total</div><div/><div style={{textAlign:'right'}}>{formatCompactCurrency(totU)}</div><div/><div style={{textAlign:'right',color:'#0891b2'}}>{formatCompactCurrency(totW)}</div><div/>
                  </div>
                </div>
              </>
            }
          </Modal>
        )
      })()}
      {showSpendModal&&(()=>{
        const rows=(acct.techStack||[]).map(t=>({...t,_cost:parseCost(t.cost),_rev:parseCost(t.totalRevenue),_gp:parseCost(t.grossProfit)})).filter(t=>t._cost||t._rev||t._gp).sort((a,b)=>b._cost-a._cost)
        const totCost=rows.reduce((s,t)=>s+t._cost,0)
        const totRev=rows.reduce((s,t)=>s+t._rev,0)
        const totGP=rows.reduce((s,t)=>s+t._gp,0)
        const gpPct=totRev>0?(totGP/totRev*100).toFixed(1)+'%':'—'
        return(
          <Modal title={`Technology Spend — ${acct.name}`} onClose={()=>setShowSpendModal(false)} width='min(900px,65vw)'>
            {rows.length===0
              ?<div style={{textAlign:'center',padding:'32px 0',color:S.muted,fontSize:13}}>No costs entered yet. Add annual costs in the Tech Stack tab.</div>
              :<>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
                  {[{label:'Total Annual Spend',val:fmtSpend(totCost),c:'#7c3aed'},{label:'Total Revenue',val:totRev>0?fmtSpend(totRev):'—',c:'#007AFF'},{label:'Total Gross Profit',val:totGP>0?fmtSpend(totGP):'—',c:'#16a34a'},{label:'GP%',val:gpPct,c:totRev>0&&totGP/totRev>=0.3?'#16a34a':'#ea580c'}].map(card=>(
                    <div key={card.label} style={{background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:8,padding:'12px 14px'}}>
                      <div style={{fontSize:9,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>{card.label}</div>
                      <div style={{fontSize:20,fontWeight:800,color:card.c}}>{card.val}</div>
                    </div>
                  ))}
                </div>
                <div style={{border:`1px solid ${S.bdr}`,borderRadius:8,overflow:'hidden'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 100px 110px 110px 110px 70px',gap:'4px 12px',padding:'7px 14px',fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',background:S.surf2,borderBottom:`1px solid ${S.bdr}`}}>
                    <div>Vendor</div><div>Category</div><div style={{textAlign:'right'}}>Annual Cost</div><div style={{textAlign:'right'}}>Revenue</div><div style={{textAlign:'right'}}>Gross Profit</div><div style={{textAlign:'right'}}>GP%</div>
                  </div>
                  {rows.map((t,i)=>{
                    const gp=t._rev>0?(t._gp/t._rev*100).toFixed(1)+'%':'—'
                    return(
                      <div key={t.id||i} style={{display:'grid',gridTemplateColumns:'1fr 100px 110px 110px 110px 70px',gap:'4px 12px',padding:'8px 14px',borderBottom:i<rows.length-1?`1px solid ${S.bdr}`:'none',fontSize:12,color:S.txt,alignItems:'center'}}>
                        <div style={{fontWeight:600}}>{t.vendor}</div>
                        <div style={{color:S.muted,fontSize:11}}>{t.category}</div>
                        <div style={{textAlign:'right'}}>{t._cost>0?fmtSpend(t._cost):'—'}</div>
                        <div style={{textAlign:'right',color:S.muted}}>{t._rev>0?fmtSpend(t._rev):'—'}</div>
                        <div style={{textAlign:'right',color:S.muted}}>{t._gp>0?fmtSpend(t._gp):'—'}</div>
                        <div style={{textAlign:'right',color:S.muted}}>{gp}</div>
                      </div>
                    )
                  })}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 100px 110px 110px 110px 70px',gap:'4px 12px',padding:'8px 14px',fontSize:12,fontWeight:700,color:S.txt,background:S.surf2,borderTop:`1px solid ${S.bdr}`}}>
                    <div>Total</div><div/><div style={{textAlign:'right'}}>{fmtSpend(totCost)}</div><div style={{textAlign:'right'}}>{totRev>0?fmtSpend(totRev):'—'}</div><div style={{textAlign:'right'}}>{totGP>0?fmtSpend(totGP):'—'}</div><div style={{textAlign:'right'}}>{gpPct}</div>
                  </div>
                </div>
              </>
            }
          </Modal>
        )
      })()}
      {alerts.length>0&&(
        <div style={{marginBottom:20}}>
          <div style={{background:'#FFFFFF',borderRadius:12,border:`1px solid ${visibleAlerts.length===0?'#A7F3D0':'#FECACA'}`,boxShadow:visibleAlerts.length===0?'0 2px 8px rgba(16,185,129,0.08)':'0 2px 8px rgba(239,68,68,0.08)',overflow:'hidden'}}>
            {/* Header inside container */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:`1px solid ${visibleAlerts.length===0?(S.isLight?'#dcfce7':S.bdr):(S.isLight?'#fef2f2':S.bdr)}`}}>
              <div style={{display:'inline-flex',alignItems:'center',gap:8}}>
                <span style={{width:7,height:7,borderRadius:'50%',background:visibleAlerts.length===0?'#16a34a':'#dc2626',display:'inline-block',animation:'alertPulse 2s infinite',flexShrink:0}}/>
                <span style={{fontSize:11,fontWeight:800,color:visibleAlerts.length===0?(S.isLight?'#16a34a':S.green):(S.isLight?'#dc2626':S.red),letterSpacing:'0.1em',textTransform:'uppercase'}}>Alerts</span>
                {visibleAlerts.length>0&&<span style={{background:S.isLight?'#fee2e2':'rgba(239,68,68,0.2)',color:S.isLight?'#dc2626':'#ef4444',fontSize:11,fontWeight:700,padding:'1px 8px',borderRadius:999}}>{visibleAlerts.length}</span>}
              </div>
              {visibleAlerts.length>0&&<button onClick={clearAll} style={{fontSize:11,color:S.isLight?'#64748b':S.muted,background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,padding:'3px 10px',cursor:'pointer'}}>Clear All</button>}
            </div>
            {/* Alert rows / empty state */}
            {visibleAlerts.length===0
              ?<div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px'}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:'#D1FAE5',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:S.isLight?'#16a34a':'#22c55e',flexShrink:0}}>✓</div>
                <div><div style={{fontSize:13,fontWeight:600,color:S.isLight?'#16a34a':S.green}}>No active alerts</div><div style={{fontSize:11,color:S.muted,marginTop:1}}>All clear — no critical items need attention</div></div>
              </div>
              :<div>
                {visibleAlerts.map((a,i)=>{
                  const c={critical:S.isLight?'#dc2626':S.red,high:S.isLight?'#ea580c':S.orange,medium:S.isLight?'#ca8a04':S.yellow}[a.level]||S.muted
                  const isHov=hoveredAlert===a.id
                  const isSnoozeOpen=snoozeOpenFor===a.id
                  const isLast=i===visibleAlerts.length-1
                  return (
                    <div key={a.id} style={{position:'relative'}}>
                      <div
                        onClick={()=>openAlertDetail(a)}
                        onMouseEnter={()=>setHoveredAlert(a.id)}
                        onMouseLeave={()=>setHoveredAlert(null)}
                        style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderBottom:isLast?'none':`1px solid ${S.isLight?'#fef2f2':S.bdr}`,background:isHov?(S.isLight?'#fef9f9':'rgba(255,255,255,0.03)'):'transparent',cursor:'pointer',transition:'background 0.1s'}}>
                        {/* Colored severity bar */}
                        <div style={{width:4,borderRadius:2,background:c,alignSelf:'stretch',flexShrink:0,minHeight:24}}/>
                        <span style={{fontSize:13,color:S.isLight?'#374151':S.secondary,flex:1,lineHeight:1.5}}>{a.text}</span>
                        <span style={{fontSize:11,color:S.muted,opacity:isHov?1:0,transition:'opacity 0.15s',flexShrink:0,whiteSpace:'nowrap',marginRight:2}}>→ details</span>
                        <button onClick={e=>{e.stopPropagation();setSnoozeOpenFor(isSnoozeOpen?null:a.id)}} title='Snooze alert'
                          style={{background:'transparent',border:'none',color:isSnoozeOpen?c:S.dim,cursor:'pointer',padding:'2px 4px',lineHeight:1,flexShrink:0,display:'flex',alignItems:'center',borderRadius:4,transition:'color 0.15s'}}
                          onMouseEnter={e=>e.currentTarget.style.color=c}
                          onMouseLeave={e=>e.currentTarget.style.color=isSnoozeOpen?c:S.dim}>
                          <Clock size={13}/>
                        </button>
                        <button onClick={e=>{e.stopPropagation();dismiss(a.id)}} title='Dismiss alert'
                          style={{background:'transparent',border:'none',color:S.dim,cursor:'pointer',fontSize:16,padding:'2px 4px',lineHeight:1,flexShrink:0,borderRadius:4,transition:'color 0.15s'}}
                          onMouseEnter={e=>e.currentTarget.style.color=c}
                          onMouseLeave={e=>e.currentTarget.style.color=S.dim}>×</button>
                      </div>
                      {isSnoozeOpen&&(
                        <div onClick={e=>e.stopPropagation()} style={{position:'absolute',right:0,top:'calc(100% + 4px)',zIndex:100,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,boxShadow:'0 4px 20px rgba(0,0,0,0.15)',minWidth:220,overflow:'hidden'}}>
                          {[{label:'Later Today',sub:'5:00 PM today',opt:'later'},{label:'Tomorrow',sub:'8:00 AM tomorrow',opt:'tomorrow'},{label:'3 Days from Now',sub:'8:00 AM',opt:'3days'},{label:'Next Week',sub:'Monday 7:00 AM',opt:'nextweek'}].map(o=>(
                            <button key={o.opt} onClick={()=>snooze(a.id,o.opt)}
                              style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 14px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,cursor:'pointer',textAlign:'left'}}
                              onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <Clock size={13} color={S.muted}/>
                              <div><div style={{fontSize:13,color:S.txt,fontWeight:500}}>{o.label}</div><div style={{fontSize:10,color:S.muted}}>{o.sub}</div></div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            }
            {/* Dismissed / snoozed rows */}
            {showDismissed&&hiddenAlerts.length>0&&<div style={{borderTop:`1px solid ${S.bdr}`,padding:'8px 14px'}}>
              {hiddenAlerts.map(a=>{
                const c={critical:S.red,high:S.orange,medium:S.yellow}[a.level]||S.muted
                return <div key={a.id} style={{display:'flex',gap:8,padding:'6px 0',alignItems:'center',opacity:0.5}}>
                  <div style={{width:3,borderRadius:2,background:c,alignSelf:'stretch',flexShrink:0,minHeight:16}}/>
                  <span style={{fontSize:12,color:S.muted,flex:1,textDecoration:'line-through'}}>{a.text}</span>
                </div>
              })}
            </div>}
            {showSnoozed&&snoozedAlertsList.length>0&&<div style={{borderTop:`1px solid ${S.bdr}`,padding:'8px 14px'}}>
              {snoozedAlertsList.map(a=>{
                const entry=(acct.snoozedAlerts||[]).find(s=>s.id===a.id)
                const untilStr=entry?new Date(entry.snoozedUntil).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''
                return <div key={a.id} style={{display:'flex',gap:8,padding:'6px 0',alignItems:'center',opacity:0.65}}>
                  <Clock size={12} color={S.muted}/>
                  <span style={{fontSize:12,color:S.muted,flex:1}}>{a.text}</span>
                  <span style={{fontSize:10,color:S.muted,flexShrink:0}}>Until {untilStr}</span>
                </div>
              })}
            </div>}
            {/* Footer toggles */}
            {(hiddenAlerts.length>0||snoozedAlertsList.length>0)&&<div style={{padding:'8px 16px',borderTop:`1px solid ${S.isLight?'#fef2f2':S.bdr}`,display:'flex',gap:12}}>
              {hiddenAlerts.length>0&&<button onClick={()=>setShowDismissed(v=>!v)} style={{fontSize:11,color:S.muted,background:'transparent',border:'none',cursor:'pointer',textDecoration:'underline'}}>{showDismissed?'Hide dismissed':`${hiddenAlerts.length} dismissed`}</button>}
              {snoozedAlertsList.length>0&&<button onClick={()=>setShowSnoozed(v=>!v)} style={{fontSize:11,color:S.muted,background:'transparent',border:'none',cursor:'pointer',textDecoration:'underline'}}>{showSnoozed?'Hide snoozed':`${snoozedAlertsList.length} snoozed`}</button>}
            </div>}
          </div>
        </div>
      )}
      {/* AI Account Intelligence Summary */}
      <div style={{marginBottom:20}}>
        <div style={{background:S.surf,borderRadius:12,border:`1px solid ${'#EEEFF2'}`,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
          {/* Header */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{color:'#007AFF',fontSize:16,lineHeight:1}}>✦</span>
              <span style={{fontSize:14,fontWeight:700,color:S.txt}}>Account Intelligence Summary</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              {acct.aiSummary?.generatedAt&&!summaryLoading&&(
                <span style={{fontSize:11,color:S.muted}}>Generated {formatSummaryAge(acct.aiSummary.generatedAt)}</span>
              )}
              <button onClick={generateSummary} disabled={summaryLoading} title='Refresh summary'
                style={{display:'flex',alignItems:'center',gap:5,background:'transparent',border:`1px solid ${'#EEEFF2'}`,borderRadius:6,padding:'4px 10px',cursor:summaryLoading?'default':'pointer',color:S.muted,fontSize:12,fontWeight:500,transition:'all 0.15s'}}
                onMouseEnter={e=>{if(!summaryLoading)e.currentTarget.style.borderColor=S.blue;if(!summaryLoading)e.currentTarget.style.color=S.blue}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='#EEEFF2';e.currentTarget.style.color=S.muted}}>
                <span style={{display:'inline-block',animation:summaryLoading?'spin 1s linear infinite':'none',fontSize:13}}>↺</span>
                Refresh
              </button>
            </div>
          </div>
          {/* Body */}
          <div>
            {summaryLoading?(
              <div style={{padding:'12px 16px'}}>
                {[75,55,85,45,65,50,80].map((w,i)=>(
                  <div key={i} style={{height:13,borderRadius:4,marginBottom:9,width:`${w}%`,background:S.isLight?'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)':'linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 75%)',backgroundSize:'200% 100%',animation:'shimmer 1.5s ease infinite'}}/>
                ))}
              </div>
            ):summaryError==='no_key'?(
              <div style={{textAlign:'center',padding:'20px 0',display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                <span style={{fontSize:22,opacity:0.35}}>🔑</span>
                <div style={{fontSize:13,color:S.muted}}>Add your Anthropic API key in Settings to generate AI summaries</div>
                <button onClick={()=>setTab('settings')} style={{marginTop:4,padding:'5px 14px',background:'transparent',border:`1px solid ${'#EEEFF2'}`,borderRadius:6,cursor:'pointer',fontSize:12,color:S.muted}}>Go to Settings</button>
              </div>
            ):summaryError?(
              <div style={{textAlign:'center',padding:'20px 0',display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                <span style={{fontSize:22,opacity:0.35}}>⚠️</span>
                <div style={{fontSize:13,color:S.isLight?'#dc2626':S.red}}>Summary unavailable — check your API key in Settings</div>
                <button onClick={generateSummary} style={{marginTop:4,padding:'5px 14px',background:'transparent',border:`1px solid ${'#EEEFF2'}`,borderRadius:6,cursor:'pointer',fontSize:12,color:S.muted}}>Retry</button>
              </div>
            ):!acct.aiSummary?.content?(
              <div style={{textAlign:'center',padding:'24px 16px',display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                <span style={{fontSize:28,color:'#007AFF',opacity:0.4,lineHeight:1}}>✦</span>
                <div style={{fontSize:13,fontWeight:600,color:S.txt}}>No summary yet</div>
                <div style={{fontSize:12,color:S.muted}}>Click Refresh to generate an AI briefing of this account</div>
                <button onClick={generateSummary}
                  style={{marginTop:8,padding:'7px 20px',background:'#007AFF',border:'none',borderRadius:7,cursor:'pointer',fontSize:13,fontWeight:700,color:'#fff',boxShadow:'0 2px 8px rgba(37,99,235,0.25)'}}>Generate Summary</button>
              </div>
            ):(()=>{
              const parsed = parseSummary(acct.aiSummary.content)
              const summaryBlock = parsed.find(s=>s.isSummary)
              const secMap = Object.fromEntries(parsed.filter(s=>!s.isSummary).map(s=>[s.key,s]))
              const renderSec = sec => !sec ? null : sec.isNext ? (
                <div key={sec.key} style={{background:S.isLight?'#fffbeb':'rgba(146,64,14,0.12)',border:`1px solid ${S.isLight?'#fde68a':'rgba(253,230,138,0.25)'}`,borderRadius:8,padding:'10px 14px',height:'100%',boxSizing:'border-box'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#92400e',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>⚡ {sec.title}</div>
                  {sec.bullets.map((b,i)=><div key={i} style={{fontSize:13,fontWeight:700,color:S.isLight?'#92400e':'#fbbf24',lineHeight:1.55}}>→ {b}</div>)}
                </div>
              ) : (
                <div key={sec.key} style={{background:S.isLight?sec.lightBg:sec.darkBg,borderLeft:`3px solid ${sec.color}`,borderRadius:8,padding:'10px 14px',height:'100%',boxSizing:'border-box'}}>
                  <div style={{fontSize:10,fontWeight:700,color:sec.color,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>{sec.title}</div>
                  {sec.bullets.map((b,i)=><div key={i} style={{fontSize:12,color:S.isLight?'#374151':S.secondary,lineHeight:1.6,marginBottom:i<sec.bullets.length-1?3:0}}>• {b}</div>)}
                </div>
              )
              return (
                <div>
                  {summaryBlock?.text&&(
                    <div style={{fontSize:14,color:S.txt,lineHeight:1.7,padding:'14px 16px',borderBottom:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`}}>
                      {summaryBlock.text}
                    </div>
                  )}
                  <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:10}}>
                    <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'1fr 1fr',gap:10,alignItems:'stretch'}}>
                      {renderSec(secMap.now)}
                      {renderSec(secMap.coming)}
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'1fr 1fr',gap:10,alignItems:'stretch'}}>
                      {renderSec(secMap.watch)}
                      {renderSec(secMap.momentum)}
                    </div>
                    {renderSec(secMap.next)}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:mob?'column':'row',gap:16,marginBottom:20,alignItems:'stretch'}}>
        {/* Left: Account Profile */}
        <div style={{flex:1,display:'flex',flexDirection:'column'}}>
          <div style={{background:S.surf,borderRadius:12,border:`1px solid ${S.bdr}`,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',flex:1,overflow:'hidden'}}>
            {/* Card header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`}}>
              <span style={{fontSize:11,fontWeight:700,color:S.secondary,letterSpacing:'0.08em',textTransform:'uppercase'}}>Account Profile</span>
              <button title='Edit in Settings' onClick={()=>setTab&&setTab('settings')} style={{background:'none',border:'none',color:S.dim,cursor:'pointer',fontSize:13,padding:'2px 4px',borderRadius:4,lineHeight:1}}
                onMouseEnter={e=>e.currentTarget.style.color=S.muted}
                onMouseLeave={e=>e.currentTarget.style.color=S.dim}>✏</button>
            </div>
            <div style={{padding:'4px 16px 8px'}}>
              {[['Industry',acct.industry],['HQ',acct.hq],['Cloud',acct.cloud],['Users',acct.users],['Relationship',acct.relationship],['Last Contact',fmtDate(acct.lastContact)]].map(([k,v],i,arr)=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:i<arr.length-1?`1px solid ${S.isLight?'#F9FAFB':S.bdr}`:'none',cursor:'default',transition:'background 0.1s',borderRadius:4,margin:'0 -4px',paddingLeft:4,paddingRight:4}}
                  onMouseEnter={e=>{if(S.isLight)e.currentTarget.style.background='#F9FAFB'}}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{fontSize:12,fontWeight:500,color:'#9CA3AF',flexShrink:0}}>{k}</span>
                  <span style={{fontSize:13,fontWeight:600,color:'#111827',textAlign:'right',marginLeft:12,wordBreak:'break-word',maxWidth:'60%'}}>{v||'—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Right: Upcoming Dates */}
        <div style={{flex:1,display:'flex',flexDirection:'column'}}>
          <div style={{background:S.surf,borderRadius:12,border:`1px solid ${S.bdr}`,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
            {/* Card header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`,flexShrink:0}}>
              <span style={{fontSize:11,fontWeight:700,color:S.secondary,letterSpacing:'0.08em',textTransform:'uppercase'}}>Upcoming Dates</span>
              <button onClick={()=>setShowAddDate(v=>!v)} style={{background:'none',border:'none',color:S.blue,cursor:'pointer',fontSize:12,fontWeight:600,padding:0,display:'flex',alignItems:'center',gap:2}}>+ Add Date</button>
            </div>
          <div style={{padding:'4px 16px 8px',flex:1}}>
            {showAddDate&&(
              <div style={{background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:7,padding:'10px 12px',marginBottom:10}}>
                <div style={{marginBottom:6}}>
                  <input value={dateForm.title} onChange={e=>setDateForm(p=>({...p,title:e.target.value}))} placeholder={DATE_PLACEHOLDERS[dateForm.type]||'Title / Description'} style={{width:'100%',fontSize:12,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,boxSizing:'border-box'}}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:6}}>
                  <input type='date' value={dateForm.date} onChange={e=>setDateForm(p=>({...p,date:e.target.value}))} style={{fontSize:12,padding:'5px 7px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,width:'100%',boxSizing:'border-box'}}/>
                  <select value={dateForm.type} onChange={e=>setDateForm(p=>({...p,type:e.target.value}))} style={{fontSize:12,padding:'5px 7px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt}}>
                    {['Meeting','Out of Office','Personal Note','Contract Deadline','Renewal','Milestone','Other'].map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{marginBottom:8}}>
                  <input value={dateForm.notes} onChange={e=>setDateForm(p=>({...p,notes:e.target.value}))} placeholder='Notes (optional)' style={{width:'100%',fontSize:12,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,boxSizing:'border-box'}}/>
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={saveCustomDate} style={{padding:'4px 12px',background:S.blue,border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save</button>
                  <button onClick={()=>{setShowAddDate(false);setDateForm({title:'',date:'',type:'Meeting',notes:''})}} style={{padding:'4px 10px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,fontSize:12,cursor:'pointer'}}>Cancel</button>
                </div>
              </div>
            )}
            {upcomingItems.length===0
              ?<div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'24px 16px',gap:8}}>
                <div style={{fontSize:24,opacity:0.3}}>📅</div>
                <div style={{fontSize:12,color:S.muted,textAlign:'center',lineHeight:1.6}}>No upcoming dates within 120 days.<br/>Click + Add Date to add one.</div>
              </div>
              :<>
                {(showMoreDates?upcomingItems:upcomingItems.slice(0,8)).map((item,idx,arr)=>{
                  const relLabel=item.days===0?'Today':item.days===1?'Tomorrow':item.days<0?`${Math.abs(item.days)}d ago`:item.days<=30?`in ${item.days}d`:fmtDate(item.date)
                  const relColor=item.days<0?(S.isLight?'#dc2626':S.red):item.days<=1?(S.isLight?'#ea580c':S.orange):S.muted
                  const urgColor=item.days<0?(S.isLight?'#dc2626':S.red):item.days<=30?(S.isLight?'#ea580c':S.orange):item.days<=90?(S.isLight?'#ca8a04':S.yellow):(S.isLight?'#16a34a':S.green)
                  const isExp=expandedDateId===item.id
                  const isLast=idx===arr.length-1
                  const fld={width:'100%',fontSize:12,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,boxSizing:'border-box',fontFamily:'inherit'}
                  return (
                    <div key={item.id}>
                      <div style={{position:'relative',display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:isExp?'none':(isLast?'none':`1px solid ${S.isLight?'#F9FAFB':S.bdr}`),cursor:'pointer',transition:'background 0.1s',borderRadius:6,margin:'0 -4px',paddingLeft:4,paddingRight:4}}
                        onClick={()=>toggleDateExpand(item)}
                        onMouseEnter={e=>{setHoveredDateId(item.id);if(S.isLight)e.currentTarget.style.background='#F9FAFB'}}
                        onMouseLeave={e=>{setHoveredDateId(null);e.currentTarget.style.background='transparent'}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:urgColor,flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:S.txt,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:2}}>{item.label}</div>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <Badge label={item.source} color={S.muted} bg={S.surf2} size={9}/>
                            {item.notes&&<span style={{fontSize:10,color:S.dim,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:120}}>{item.notes}</span>}
                          </div>
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontSize:12,fontWeight:500,color:S.isLight?'#64748b':S.muted}}>{new Date(item.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
                          <div style={{fontSize:10,fontWeight:600,color:relColor,marginTop:1}}>{relLabel}</div>
                        </div>
                        <span style={{fontSize:11,color:hoveredDateId===item.id?S.muted:S.isLight?'#F9FAFB':S.bdr,transition:'color 0.15s',flexShrink:0}}>›</span>
                      </div>
                      {isExp&&(
                        <div style={{background:S.surf2,border:`1px solid ${S.bdr}`,borderBottom:`1px solid ${S.bdr}`,borderTop:`1px solid ${S.bdr}`,padding:'10px 10px 8px',marginBottom:2}} onClick={e=>e.stopPropagation()}>
                          {item.isCustom&&editDateForm?(
                            <>
                              <div style={{marginBottom:6}}>
                                <div style={{fontSize:9,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Title</div>
                                <input value={editDateForm.title||''} onChange={e=>setEditDateForm(p=>({...p,title:e.target.value}))} style={fld}/>
                              </div>
                              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:6}}>
                                <div>
                                  <div style={{fontSize:9,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Date</div>
                                  <input type='date' value={editDateForm.date||''} onChange={e=>setEditDateForm(p=>({...p,date:e.target.value}))} style={fld}/>
                                </div>
                                <div>
                                  <div style={{fontSize:9,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Type</div>
                                  <select value={editDateForm.type||'Other'} onChange={e=>setEditDateForm(p=>({...p,type:e.target.value}))} style={{...fld,padding:'5px 7px'}}>
                                    {['Meeting','Out of Office','Personal Note','Contract Deadline','Renewal','Milestone','Other'].map(t=><option key={t}>{t}</option>)}
                                  </select>
                                </div>
                              </div>
                              <div style={{marginBottom:8}}>
                                <div style={{fontSize:9,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Notes</div>
                                <textarea value={editDateForm.notes||''} onChange={e=>setEditDateForm(p=>({...p,notes:e.target.value}))} rows={2} placeholder='Notes...' style={{...fld,resize:'vertical',lineHeight:1.4}}/>
                              </div>
                              <div style={{display:'flex',gap:5}}>
                                <button onClick={saveEditDate} style={{padding:'4px 10px',background:S.blue,border:'none',borderRadius:5,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
                                <button onClick={()=>{if(window.confirm('Delete this date?'))deleteCustomDate(item.customId)}} style={{padding:'4px 8px',background:'transparent',border:'1px solid rgba(239,68,68,0.3)',borderRadius:5,color:S.red,fontSize:11,cursor:'pointer'}}>Delete</button>
                                <button onClick={()=>{setExpandedDateId(null);setEditDateForm(null)}} style={{padding:'4px 8px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,fontSize:11,cursor:'pointer'}}>Cancel</button>
                              </div>
                            </>
                          ):(
                            /* Read-only for auto-generated items */
                            <div>
                              <div style={{fontSize:12,fontWeight:600,color:S.txt,marginBottom:3}}>{item.fullLabel||item.label}</div>
                              <div style={{fontSize:11,color:S.muted,marginBottom:8}}>{fmtDate(item.date)}</div>
                              {item.tab&&<button onClick={()=>setTab(item.tab)} style={{fontSize:11,color:S.blue,background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.25)',borderRadius:5,padding:'4px 10px',cursor:'pointer',fontWeight:600}}>Go to {item.source==='Renewal'?'Tech Stack':'Projects'} →</button>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                {upcomingItems.length>8&&(
                  <button onClick={()=>setShowMoreDates(v=>!v)} style={{fontSize:11,color:S.blue,background:'transparent',border:'none',cursor:'pointer',padding:'8px 0 2px',fontWeight:600,display:'block'}}>
                    {showMoreDates?'Show less':`Show ${upcomingItems.length-8} more`}
                  </button>
                )}
              </>
            }
          </div>
          </div>
        </div>
      </div>

      {/* ── PRIORITY FOLLOW-UPS ── */}
      <div style={{marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <span style={{fontSize:11,fontWeight:700,color:S.secondary,letterSpacing:'0.08em',textTransform:'uppercase'}}>Priority Follow-Ups</span>
          {setTab&&<button onClick={()=>setTab('followups')} style={{background:'none',border:'none',color:S.blue,cursor:'pointer',fontSize:12,fontWeight:600,padding:0}}>View All →</button>}
        </div>
        {openFU.length===0&&<div style={{display:'flex',alignItems:'center',gap:10,padding:'16px',background:S.isLight?'#f0fdf4':S.surf,borderRadius:10,border:`1px solid ${S.isLight?'#bbf7d0':S.bdr}`}}><span style={{color:S.isLight?'#16a34a':S.green,fontSize:16}}>✓</span><span style={{fontSize:13,color:S.isLight?'#16a34a':S.green,fontWeight:600}}>All follow-ups complete — great work!</span></div>}
        {[...openFU].sort((a,b)=>['Critical','High','Medium','Low'].indexOf(a.priority)-['Critical','High','Medium','Low'].indexOf(b.priority)).slice(0,5).map(f=>{
          const p=PC[f.priority]||PC.Low
          const d=f.dueDate?daysUntil(f.dueDate):null
          const isOverdue=d!==null&&d<0
          const dateColor=d===null?S.muted:d<0?PC.Critical.c:p.c
          const dateLabel=d===null?'No date set':d<0?`${Math.abs(d)}d overdue`:d===0?'Due today':`Due ${fmtDate(f.dueDate)}`
          const isCompleting=completingFU===f.id
          return (
            <div key={f.id}
              style={{background:isCompleting?(S.isLight?'#f0fdf4':S.surf2):(isOverdue&&S.isLight?'#fff5f5':S.surf),borderRadius:10,border:`1px solid ${isOverdue&&S.isLight?'#fecaca':S.bdr}`,padding:'12px 14px',marginBottom:6,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',display:'flex',alignItems:'center',gap:10,transition:'all 0.25s',opacity:isCompleting?0.4:1,transform:isCompleting?'translateX(16px)':'translateX(0)'}}
              onMouseEnter={e=>{if(!isCompleting){e.currentTarget.style.boxShadow=S.isLight?'0 4px 12px rgba(0,0,0,0.08)':'0 2px 8px rgba(0,0,0,0.2)';e.currentTarget.style.transform='translateY(-1px)'}setHoveredFuId(f.id)}}
              onMouseLeave={e=>{if(!isCompleting){e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)';e.currentTarget.style.transform='translateY(0)'}setHoveredFuId(null)}}>
              {/* Checkbox — border color reflects priority */}
              <button
                onClick={()=>{setCompletingFU(f.id);setTimeout(()=>{setAcct(prev=>({...prev,followUps:prev.followUps.map(fu=>fu.id===f.id?{...fu,status:'Done'}:fu)}));setCompletingFU(null)},280)}}
                style={{width:18,height:18,borderRadius:4,border:`2px solid ${p.d||p.c}`,background:'transparent',flexShrink:0,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.15s'}}
                onMouseEnter={e=>{e.currentTarget.style.background=(p.d||p.c)+'22'}}
                onMouseLeave={e=>{e.currentTarget.style.background='transparent'}}
                title='Mark complete'/>
              {/* Content */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:S.txt,marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.task}</div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  {f.contact&&<span style={{fontSize:11,color:S.muted}}>{f.contact}</span>}
                  {f.contact&&<span style={{fontSize:11,color:S.isLight?'#cbd5e1':'#334155'}}>·</span>}
                  <span style={{fontSize:11,color:dateColor,fontWeight:isOverdue?700:400}}>{dateLabel}</span>
                </div>
              </div>
              <Badge label={f.priority} color={p.c} bg={p.b}/>
              <div style={{flexShrink:0}}>
                <button
                  onClick={e=>{e.stopPropagation();if(fuSnoozeId===f.id){setFuSnoozeId(null);setFuSnoozePos(null);setFuSnoozeCustomDate('')}else{const r=e.currentTarget.getBoundingClientRect();setFuSnoozePos({top:r.bottom+4,right:window.innerWidth-r.right});setFuSnoozeId(f.id);setFuSnoozeCustomDate('')}}}
                  title='Snooze follow-up'
                  style={{background:'transparent',border:'none',color:fuSnoozeId===f.id?p.c:'#9CA3AF',cursor:'pointer',padding:'3px',display:'flex',alignItems:'center',flexShrink:0,opacity:hoveredFuId===f.id||fuSnoozeId===f.id?1:0,transition:'opacity 0.15s'}}
                  onMouseEnter={e=>e.currentTarget.style.color=p.c}
                  onMouseLeave={e=>e.currentTarget.style.color=fuSnoozeId===f.id?p.c:'#9CA3AF'}>
                  <Clock size={14}/>
                </button>
                {fuSnoozeId===f.id&&fuSnoozePos&&(
                  <div onClick={e=>e.stopPropagation()} style={{position:'fixed',top:fuSnoozePos.top,right:fuSnoozePos.right,zIndex:9999,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,boxShadow:'0 4px 20px rgba(0,0,0,0.15)',minWidth:200,overflow:'hidden'}}>
                    {[{label:'Tomorrow',opt:'tomorrow'},{label:'In 3 days',opt:'3days'},{label:'In 1 week',opt:'1week'}].map(o=>(
                      <button key={o.opt} onClick={()=>snoozeFU(f.id,o.opt)}
                        style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 14px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,cursor:'pointer',textAlign:'left',fontSize:13,color:S.isLight?'#374151':S.txt,fontWeight:500}}
                        onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <Clock size={12} color={S.muted}/>
                        {o.label}
                      </button>
                    ))}
                    <div style={{padding:'8px 14px'}}>
                      <div style={{fontSize:11,color:S.muted,marginBottom:4}}>Pick a date</div>
                      <div style={{display:'flex',gap:6,alignItems:'center'}}>
                        <input type='date' value={fuSnoozeCustomDate} onChange={e=>setFuSnoozeCustomDate(e.target.value)}
                          style={{fontSize:12,padding:'4px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.isLight?'#374151':S.txt,flex:1}}/>
                        <button onClick={()=>{if(fuSnoozeCustomDate)snoozeFU(f.id,'custom',fuSnoozeCustomDate)}}
                          disabled={!fuSnoozeCustomDate}
                          style={{padding:'4px 10px',background:fuSnoozeCustomDate?'#007AFF':'#9CA3AF',border:'none',borderRadius:5,color:'#fff',fontSize:12,cursor:fuSnoozeCustomDate?'pointer':'not-allowed',whiteSpace:'nowrap'}}>Set</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={()=>{sendToAppleReminders(f,acct.name);setRemindersToast(true);setTimeout(()=>setRemindersToast(false),2000)}}
                title='Send to Apple Reminders'
                style={{background:'transparent',border:'none',color:'#9CA3AF',cursor:'pointer',padding:'3px',display:'flex',alignItems:'center',flexShrink:0,opacity:hoveredFuId===f.id?1:0,transition:'opacity 0.15s'}}
                onMouseEnter={e=>e.currentTarget.style.color='#6B7280'}
                onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}><Share2 size={14}/></button>
            </div>
          )
        })}
      </div>

      {/* ── QUICK WIN ── */}
      {(()=>{
        const qw=getQuickWin(acct)
        return qw?(
          <div style={{marginBottom:20,background:S.isLight?'linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)':'linear-gradient(135deg,rgba(59,130,246,0.08) 0%,rgba(59,130,246,0.03) 100%)',border:`1px solid ${S.isLight?'#BFDBFE':S.bdr}`,borderRadius:12,padding:'16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
              <span style={{fontSize:14,color:S.isLight?'#007AFF':S.blue}}>⚡</span>
              <span style={{fontSize:11,fontWeight:800,color:S.isLight?'#0066CC':S.blue,letterSpacing:'0.1em',textTransform:'uppercase'}}>Quick Win</span>
            </div>
            <div style={{fontSize:14,fontWeight:600,color:S.isLight?'#1e3a5f':S.txt,marginBottom:4,lineHeight:1.4}}>{qw.title}</div>
            <div style={{fontSize:12,color:S.isLight?'#3b82f6':S.muted,marginBottom:12,lineHeight:1.5}}>{qw.meta}</div>
            {setTab&&<button onClick={()=>setTab(qw.tab)} style={{padding:'6px 14px',background:S.isLight?'#007AFF':S.blue,border:'none',borderRadius:6,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',transition:'background 0.15s'}}
              onMouseEnter={e=>e.currentTarget.style.background='#0066CC'}
              onMouseLeave={e=>e.currentTarget.style.background=S.isLight?'#007AFF':S.blue}>Take Action →</button>}
          </div>
        ):null
      })()}

      {/* Alert detail modal */}
      {alertModal&&(()=>{
        const hc = {critical:S.red,high:S.orange,medium:S.yellow}[alertModal.level]||S.muted
        const levelLabel = alertModal.level==='critical'?'● Critical':alertModal.level==='high'?'▲ High Priority':'◆ Medium Priority'
        const title = alertModal.type==='renewal'?`${alertModal.t.vendor} — Renewal Upcoming`
          :alertModal.type==='replacing'?`${alertModal.t.vendor} — Marked for Replacement`
          :alertModal.type==='overdue'?'Overdue Follow-Up'
          :alertModal.type==='attention'?'Relationship Needs Attention'
          :alertModal.type==='stalled'?`${alertModal.p.name} — Stalled`
          :'Alert Detail'
        return (
          <Modal title={title} onClose={()=>setAlertModal(null)} width={560}>
            <div style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700,color:hc,background:hc+'18',border:`1px solid ${hc}44`,borderRadius:999,padding:'3px 10px',marginBottom:16}}>{levelLabel}</div>

            {/* Renewal */}
            {alertModal.type==='renewal'&&(()=>{
              const {t}=alertModal; const d=daysUntil(t.renewalDate); const dc=d<=60?S.red:S.orange
              return <>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:S.surf2,borderRadius:8,marginBottom:16}}>
                  <div><div style={{fontSize:15,fontWeight:700,color:S.txt}}>{t.vendor}</div>{t.products&&<div style={{fontSize:12,color:S.muted,marginTop:2}}>{t.products}</div>}</div>
                  <div style={{textAlign:'right'}}><div style={{fontSize:32,fontWeight:800,color:dc,lineHeight:1}}>{d}</div><div style={{fontSize:11,color:S.muted}}>days left</div></div>
                </div>
                <InfoRow label='Category' val={t.category}/>
                <InfoRow label='Renewal Date' val={fmtDate(t.renewalDate)}/>
                <InfoRow label='Annual Cost' val={t.cost}/>
                <InfoRow label='Vendor Rep' val={t.vendorRep}/>
                <InfoRow label='Rep Email' val={t.vendorRepEmail}/>
                <InfoRow label='Client Owner' val={t.clientOwner}/>
                {t.notes&&<div style={{marginTop:12,fontSize:12,color:S.secondary,background:S.surf2,borderRadius:6,padding:'10px 12px',lineHeight:1.6}}>{t.notes}</div>}
                <div style={{display:'flex',gap:8,marginTop:18,flexWrap:'wrap'}}>
                  <Btn variant='primary' onClick={()=>{setTab('stack');setAlertModal(null)}}>View in Tech Stack</Btn>
                  <Btn onClick={()=>{setAlertModal(null);openAddFU(`Renew ${t.vendor} contract`,t.clientOwner||'')}}>+ Add Follow-Up</Btn>
                </div>
              </>
            })()}

            {/* Replacing */}
            {alertModal.type==='replacing'&&(()=>{
              const {t,relProjs}=alertModal; const sc=SC[t.status]||S.muted
              return <>
                <div style={{padding:'12px 16px',background:S.surf2,borderRadius:8,marginBottom:16}}>
                  <div style={{fontSize:15,fontWeight:700,color:S.txt,marginBottom:4}}>{t.vendor}</div>
                  {t.products&&<div style={{fontSize:12,color:S.muted,marginBottom:6}}>{t.products}</div>}
                  <Badge label={t.status} color={sc} bg={sc+'1a'}/>
                </div>
                <InfoRow label='Category' val={t.category}/>
                <InfoRow label='Client Owner' val={t.clientOwner}/>
                {t.notes&&<div style={{marginTop:10,fontSize:12,color:S.secondary,background:S.surf2,borderRadius:6,padding:'10px 12px',lineHeight:1.6}}>{t.notes}</div>}
                {relProjs.length>0&&<div style={{marginTop:14}}>
                  <SH>Related Projects</SH>
                  {relProjs.map(p=>{const pc=PSC[p.status]||S.muted;return<div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,marginBottom:4}}><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:S.txt}}>{p.name}</div><div style={{fontSize:11,color:S.muted}}>{p.primaryContact||''}</div></div><Badge label={p.status} color={pc} bg={pc+'1a'}/></div>})}
                </div>}
                <div style={{display:'flex',gap:8,marginTop:18,flexWrap:'wrap'}}>
                  <Btn variant='primary' onClick={()=>{setTab('stack');setAlertModal(null)}}>View in Tech Stack</Btn>
                  <Btn onClick={()=>{setAlertModal(null);openAddFU(`Plan ${t.vendor} replacement`,t.clientOwner||'')}}>+ Add Follow-Up</Btn>
                </div>
              </>
            })()}

            {/* Overdue follow-up */}
            {alertModal.type==='overdue'&&(()=>{
              const {fu}=alertModal; const daysOver=Math.abs(daysUntil(fu.dueDate)||0)
              return <>
                <div style={{padding:'12px 14px',background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,marginBottom:16}}>
                  <div style={{fontSize:14,fontWeight:700,color:S.txt,lineHeight:1.4}}>{fu.task}</div>
                </div>
                <InfoRow label='Contact' val={fu.contact}/>
                <InfoRow label='Due Date' val={fmtDate(fu.dueDate)}/>
                <InfoRow label='Days Overdue' val={`${daysOver} day${daysOver!==1?'s':''}`}/>
                <InfoRow label='Priority' val={fu.priority}/>
                {fu.context&&<div style={{marginTop:10,fontSize:12,color:S.secondary,background:S.surf2,borderRadius:6,padding:'10px 12px',lineHeight:1.6}}>{fu.context}</div>}
                <div style={{display:'flex',gap:8,marginTop:18,flexWrap:'wrap'}}>
                  <Btn variant='primary' onClick={()=>{setAcct(p=>({...p,followUps:p.followUps.map(f=>f.id===fu.id?{...f,status:'Done'}:f)}));setAlertModal(null)}}>✓ Mark Complete</Btn>
                  <Btn onClick={()=>{const nd=new Date();nd.setDate(nd.getDate()+3);const ds=nd.toISOString().split('T')[0];setAcct(p=>({...p,followUps:p.followUps.map(f=>f.id===fu.id?{...f,dueDate:ds}:f)}));setAlertModal(null)}}>Snooze 3 Days</Btn>
                  <Btn onClick={()=>{setTab('followups');setAlertModal(null)}}>Go to Follow-Ups</Btn>
                </div>
              </>
            })()}

            {/* Needs attention contacts */}
            {alertModal.type==='attention'&&(()=>{
              const {contacts}=alertModal
              return <>
                <div style={{fontSize:13,color:S.muted,marginBottom:12,lineHeight:1.6}}>These contacts need relationship-building attention. Click a row to go to the Contacts tab.</div>
                <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:16}}>
                  {contacts.map(c=>{
                    const ds=daysSince(c.lastInteracted)
                    return <div key={c.id}
                      onClick={()=>{setAlertModal(null);setTab('contacts')}}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,cursor:'pointer',transition:'background 0.1s'}}
                      onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                      onMouseLeave={e=>e.currentTarget.style.background=S.surf}>
                      <div style={{width:34,height:34,borderRadius:'50%',background:'rgba(249,115,22,0.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:S.orange,flexShrink:0,overflow:'hidden'}}>{c.contactPhoto?<img src={c.contactPhoto} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:initials(c.name)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:S.txt}}>{c.name}</div>
                        <div style={{fontSize:11,color:S.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.title}</div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontSize:11,color:ds===null?S.muted:ds>60?S.red:S.orange,fontWeight:600,marginBottom:3}}>{ds===null?'Never contacted':`${ds}d ago`}</div>
                        <Badge label='Needs Attention' color={S.orange} bg='rgba(249,115,22,0.12)' size={10}/>
                      </div>
                    </div>
                  })}
                </div>
                <Btn onClick={()=>{setTab('contacts');setAlertModal(null)}}>Go to Contacts</Btn>
              </>
            })()}

            {/* Stalled project */}
            {alertModal.type==='stalled'&&(()=>{
              const {p}=alertModal
              const currStage=p.timeline?.find(s=>s.status==='current')||p.timeline?.filter(s=>s.status==='completed').slice(-1)[0]
              const daysInStage=currStage?.date?daysSince(currStage.date):null
              return <>
                <div style={{padding:'12px 14px',background:'rgba(249,115,22,0.07)',border:'1px solid rgba(249,115,22,0.2)',borderRadius:8,marginBottom:16}}>
                  <div style={{fontSize:14,fontWeight:700,color:S.txt,marginBottom:2}}>{p.name}</div>
                  {p.vendor&&<div style={{fontSize:12,color:S.muted}}>{p.vendor}</div>}
                </div>
                <InfoRow label='Current Stage' val={currStage?.stage}/>
                <InfoRow label='Time in Stage' val={daysInStage!==null?`${daysInStage} days`:undefined}/>
                <InfoRow label='Waiting On' val={p.waitingOn}/>
                <InfoRow label='Primary Contact' val={p.primaryContact}/>
                <InfoRow label='Est. Close' val={fmtDate(p.closeDate)}/>
                {p.notes&&<div style={{marginTop:10,fontSize:12,color:S.secondary,background:S.surf2,borderRadius:6,padding:'10px 12px',lineHeight:1.6}}>{p.notes}</div>}
                <div style={{display:'flex',gap:8,marginTop:18,flexWrap:'wrap'}}>
                  <Btn variant='primary' onClick={()=>{setTab('projects');setAlertModal(null)}}>Go to Projects</Btn>
                  <Btn onClick={()=>{setAlertModal(null);openAddFU(`Unstall: ${p.name}`,p.primaryContact||'')}}>+ Add Follow-Up</Btn>
                </div>
              </>
            })()}

            {/* Generic */}
            {alertModal.type==='generic'&&<div style={{fontSize:13,color:S.secondary,lineHeight:1.6}}>{alertModal.text}</div>}
          </Modal>
        )
      })()}

      {/* Quick add follow-up modal */}
      {showAddFU&&(
        <Modal title='Add Follow-Up' onClose={()=>setShowAddFU(false)} width={480}>
          <Field label='Task' value={fuForm.task} onChange={v=>setFuForm(p=>({...p,task:v}))}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
            <Field label='Priority' value={fuForm.priority} onChange={v=>setFuForm(p=>({...p,priority:v}))} options={['Critical','High','Medium','Low']}/>
            <Field label='Due Date' value={fuForm.dueDate} onChange={v=>setFuForm(p=>({...p,dueDate:v}))} type='date'/>
            <Field label='Contact Name' value={fuForm.contact} onChange={v=>setFuForm(p=>({...p,contact:v}))} style={{gridColumn:'span 2'}}/>
          </div>
          <Field label='Context / Notes' value={fuForm.context} onChange={v=>setFuForm(p=>({...p,context:v}))} multiline/>
          <div style={{display:'flex',gap:8,marginTop:4}}>
            <Btn variant='primary' onClick={saveQuickFU}>Save Follow-Up</Btn>
            <Btn onClick={()=>setShowAddFU(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
