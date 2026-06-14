import { useState } from 'react'
import { RefreshCw, ArrowLeft, CheckCircle2, Circle, Sparkles, X, ChevronRight } from 'lucide-react'

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

const SL={fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.1em',textTransform:'uppercase',padding:'10px 16px 4px'}

const SectionLabel=({icon,label,count})=>(
  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,marginTop:28}}>
    <span style={{fontSize:15}}>{icon}</span>
    <span style={{fontSize:11,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase'}}>{label}</span>
    {count!=null&&<span style={{fontSize:11,fontWeight:700,background:'#1e293b',color:'#fff',borderRadius:999,padding:'1px 6px'}}>{count}</span>}
  </div>
)

// Full-detail modal
const DetailModal=({item,type,onClose,isPast,onToggle,idx})=>{
  if(!item)return null
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:540,maxHeight:'85vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.25)',display:'flex',flexDirection:'column'}}>
        {/* Modal header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',padding:'20px 20px 0',gap:12,flexShrink:0}}>
          <div>
            {item.account&&<div style={{fontSize:11,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>{item.account}{item.contact&&<span style={{fontWeight:400,textTransform:'none',marginLeft:6,color:'#94a3b8'}}>· {item.contact}</span>}</div>}
            <div style={{fontSize:17,fontWeight:700,color:'#0f172a',lineHeight:1.4}}>{item.action||item.headline}</div>
          </div>
          <button onClick={onClose} style={{background:'#f1f5f9',border:'none',borderRadius:8,padding:7,cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b'}}>
            <X size={16}/>
          </button>
        </div>

        <div style={{padding:'16px 20px 24px',display:'flex',flexDirection:'column',gap:14}}>
          {/* Why this matters */}
          {item.clientFirstAngle&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Why This Matters</div>
              <div style={{fontSize:13,color:'#374151',lineHeight:1.6}}>{item.clientFirstAngle}</div>
            </div>
          )}

          {/* Relevance (market pulse) */}
          {item.relevance&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Why This Matters</div>
              <div style={{fontSize:13,color:'#374151',lineHeight:1.6}}>{item.relevance}</div>
            </div>
          )}

          {/* Suggested opener */}
          {item.suggestedOpener&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Suggested Opener</div>
              <div style={{borderLeft:'2px solid #e5e7eb',paddingLeft:12}}>
                <span style={{fontSize:13,color:'#1e40af',fontStyle:'italic',lineHeight:1.6}}>"{item.suggestedOpener}"</span>
              </div>
            </div>
          )}

          {/* Talking point (market pulse) */}
          {item.talkingPoint&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Talking Point</div>
              <div style={{borderLeft:'2px solid #e5e7eb',paddingLeft:12}}>
                <span style={{fontSize:13,color:'#1e40af',fontStyle:'italic',lineHeight:1.6}}>{item.talkingPoint}</span>
              </div>
            </div>
          )}

          {/* Also advance */}
          {item.whileYouHaveThem?.length>0&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Also Advance</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {item.whileYouHaveThem.map((wt,wi)=>(
                  <span key={wi} style={{fontSize:12,background:'#f1f5f9',color:'#475569',borderRadius:999,padding:'3px 10px',border:'1px solid #e5e7eb'}}>{wt}</span>
                ))}
              </div>
            </div>
          )}

          {/* Plant this seed (long game) */}
          {item.plantThisSeed&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Plant This Seed</div>
              <div style={{fontSize:13,color:'#2563eb',fontStyle:'italic',lineHeight:1.6}}>{item.plantThisSeed}</div>
            </div>
          )}

          {/* Why (long game) */}
          {item.why&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Why It Matters (30–90 Days)</div>
              <div style={{fontSize:13,color:'#374151',lineHeight:1.6}}>{item.why}</div>
            </div>
          )}

          {/* Upstairs kit */}
          {item.upsairsKit&&item.upsairsKit.trim()&&(
            <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'10px 14px',display:'flex',gap:8,alignItems:'flex-start'}}>
              <span style={{fontSize:14,flexShrink:0}}>💼</span>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'#92400e',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:3}}>Upstairs Kit</div>
                <div style={{fontSize:13,color:'#92400e',lineHeight:1.6}}>{item.upsairsKit}</div>
              </div>
            </div>
          )}

          {/* Urgency reason */}
          {item.urgencyReason&&(
            <div style={{paddingTop:10,borderTop:'1px solid #f1f5f9'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Why Today</div>
              <div style={{fontSize:12,color:'#64748b',lineHeight:1.5,fontStyle:'italic'}}>{item.urgencyReason}</div>
            </div>
          )}

          {/* Urgency reason (move forward) */}
          {item.urgencyReason===undefined&&item.timeframe&&(
            <div style={{paddingTop:10,borderTop:'1px solid #f1f5f9'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Timeframe</div>
              <div style={{fontSize:12,color:'#64748b',lineHeight:1.5}}>{item.timeframe}</div>
            </div>
          )}

          {/* Renewal alert */}
          {item.alert&&(
            <div style={{paddingTop:10,borderTop:'1px solid #f1f5f9'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Status</div>
              <div style={{fontSize:13,color:'#374151',lineHeight:1.5}}>{item.alert}</div>
            </div>
          )}

          {/* Complete checkbox for actToday */}
          {type==='actToday'&&!isPast&&(
            <div style={{paddingTop:10,borderTop:'1px solid #f1f5f9'}}>
              <button onClick={()=>{onToggle&&onToggle();onClose()}}
                style={{display:'flex',alignItems:'center',gap:8,background:item.completedToday?'#f0fdf4':'#fff',border:`1px solid ${item.completedToday?'#86efac':'#e5e7eb'}`,borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:13,color:item.completedToday?'#15803d':'#374151',fontWeight:600}}>
                {item.completedToday?<CheckCircle2 size={16} color='#22c55e'/>:<Circle size={16} color='#9ca3af'/>}
                {item.completedToday?'Marked complete — click to undo':'Mark as complete'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DailyBrief({data,setData,apiKey,briefGenerating,briefError,onGenerateNow,onBack}){
  const today=new Date().toISOString().split('T')[0]
  const briefs=data.dailyBriefs||[]
  const todayBrief=briefs.find(b=>b.date===today)||null
  const pastBriefs=briefs.filter(b=>b.date!==today).slice(0,29)

  const [selectedDate,setSelectedDate]=useState(today)
  const [summaryExpanded,setSummaryExpanded]=useState(false)
  const [detailModal,setDetailModal]=useState(null) // {item, type, idx}

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

  const briefRow=b=>{
    const isSelected=selectedDate===b.date
    return(
      <div key={b.date} onClick={()=>setSelectedDate(b.date)}
        style={{padding:'8px 12px',cursor:'pointer',borderRadius:6,margin:'1px 8px',background:isSelected?'#1e3a5f':'transparent',transition:'background 0.1s'}}
        onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background='rgba(255,255,255,0.08)'}}
        onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.background='transparent'}}>
        <div style={{fontSize:13,fontWeight:600,color:isSelected?'#fff':'#cbd5e1'}}>{fmt(b.date)}</div>
        {b.briefSummary&&<div style={{fontSize:10,color:'#94a3b8',marginTop:2,lineHeight:1.4,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{b.briefSummary.slice(0,80)}</div>}
      </div>
    )
  }

  const CardShell=({onClick,style,children})=>(
    <div onClick={onClick}
      style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,padding:'13px 16px',cursor:'pointer',transition:'box-shadow 0.15s,border-color 0.15s',...style}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)';e.currentTarget.style.borderColor='#d1d5db'}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.borderColor='#e5e7eb'}}>
      {children}
    </div>
  )

  const renderBrief=brief=>{
    if(!brief)return(
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',flexDirection:'column',gap:12}}>
        {briefGenerating
          ?<><div style={{fontSize:14,color:'#64748b'}}>Generating your morning brief...</div><div style={{width:32,height:32,border:'3px solid #e2e8f0',borderTopColor:'#2563eb',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/></>
          :<div style={{fontSize:14,color:'#94a3b8'}}>No brief yet. Click "+ Generate Now" to create one.</div>
        }
      </div>
    )

    const {actToday=[],moveForward=[],longGame=[],renewalRadar=[],marketPulse=[]}=brief.sections||{}
    const isPast=brief.date!==today
    const fullSummary=brief.briefSummary||''
    const firstSentenceEnd=fullSummary.search(/[.!?](\s|$)/)
    const firstSentence=firstSentenceEnd>0?fullSummary.slice(0,firstSentenceEnd+1):fullSummary
    const restSummary=firstSentenceEnd>0?fullSummary.slice(firstSentenceEnd+1).trim():''

    return(
      <div style={{maxWidth:680}}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

        {/* Archived banner */}
        {isPast&&<div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'8px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
          <Sparkles size={13} color='#2563eb'/>
          <span style={{fontSize:12,color:'#1d4ed8',fontWeight:500}}>Archived brief from {fmtFull(brief.date)}</span>
        </div>}

        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:18,gap:12}}>
          <div style={{fontSize:24,fontWeight:800,color:'#0f172a',lineHeight:1.15,letterSpacing:'-0.02em'}}>
            {isToday?`Today — ${fmtFull(today)}`:fmtFull(brief.date)}
          </div>
          {isToday&&!isPast&&(
            <button onClick={onGenerateNow} disabled={briefGenerating}
              style={{display:'flex',alignItems:'center',gap:5,background:'transparent',border:'1px solid #e2e8f0',borderRadius:7,padding:'6px 12px',cursor:briefGenerating?'not-allowed':'pointer',color:'#64748b',fontSize:12,fontWeight:500,flexShrink:0,opacity:briefGenerating?0.5:1,whiteSpace:'nowrap'}}>
              <RefreshCw size={12} style={{animation:briefGenerating?'spin 0.8s linear infinite':'none'}}/> Regenerate
            </button>
          )}
        </div>

        {/* Focus callout */}
        {firstSentence&&(
          <div style={{marginBottom:20}}>
            <div style={{borderLeft:'2px solid #2563eb',paddingLeft:14,paddingTop:4,paddingBottom:4}}>
              <div style={{fontSize:15,color:'#0f172a',lineHeight:1.6}}>{firstSentence}</div>
            </div>
            {restSummary&&<div style={{marginTop:5,paddingLeft:16}}>
              <button onClick={()=>setSummaryExpanded(p=>!p)} style={{background:'transparent',border:'none',color:'#9ca3af',fontSize:11,cursor:'pointer',padding:0,fontWeight:500}}>
                {summaryExpanded?'▲ Hide context':'▼ Full context'}
              </button>
              {summaryExpanded&&<div style={{fontSize:12,color:'#64748b',lineHeight:1.6,marginTop:4}}>{restSummary}</div>}
            </div>}
          </div>
        )}

        <div style={{height:1,background:'#f1f5f9',marginBottom:4}}/>

        {/* ACT TODAY */}
        <SectionLabel icon='🎯' label='Act Today' count={actToday.length}/>
        {actToday.length===0&&<div style={{fontSize:13,color:'#94a3b8',marginBottom:24}}>No urgent actions for today.</div>}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {actToday.map((item,idx)=>(
            <CardShell key={idx}
              onClick={()=>setDetailModal({item,type:'actToday',idx,briefDate:brief.date})}
              style={{opacity:item.completedToday?0.5:1,borderLeft:item.completedToday?'3px solid #22c55e':'3px solid transparent'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <button onClick={e=>{e.stopPropagation();if(!isPast)toggleActToday(brief.date,idx)}}
                  style={{background:'transparent',border:'none',padding:0,cursor:'pointer',flexShrink:0,color:item.completedToday?'#22c55e':'#d1d5db',display:'flex',alignItems:'center'}}>
                  {item.completedToday?<CheckCircle2 size={16}/>:<Circle size={16}/>}
                </button>
                <span style={{fontSize:11,fontWeight:700,color:'#0f172a',letterSpacing:'0.06em',textTransform:'uppercase',flex:1,textDecoration:item.completedToday?'line-through':'none'}}>{item.account}</span>
                {item.contact&&<span style={{fontSize:12,color:'#94a3b8'}}>{item.contact}</span>}
                {item.estimatedMinutes&&<span style={{fontSize:11,color:'#94a3b8',background:'#f8fafc',border:'1px solid #e5e7eb',borderRadius:999,padding:'1px 7px',flexShrink:0}}>{item.estimatedMinutes}m</span>}
                <ChevronRight size={14} color='#d1d5db'/>
              </div>
              <div style={{fontSize:14,fontWeight:600,color:'#0f172a',lineHeight:1.45,marginTop:7,paddingLeft:24,textDecoration:item.completedToday?'line-through':'none'}}>{item.action}</div>
              {item.urgencyReason&&<div style={{fontSize:11,color:'#94a3b8',fontStyle:'italic',marginTop:4,paddingLeft:24}}>{item.urgencyReason}</div>}
            </CardShell>
          ))}
        </div>

        {/* MOVE FORWARD */}
        <SectionLabel icon='📅' label='Move Forward This Week' count={moveForward.length}/>
        {moveForward.length===0&&<div style={{fontSize:13,color:'#94a3b8',marginBottom:24}}>Nothing queued for this week.</div>}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {moveForward.map((item,idx)=>(
            <CardShell key={idx} onClick={()=>setDetailModal({item,type:'moveForward',idx})}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:11,fontWeight:700,color:'#0f172a',letterSpacing:'0.06em',textTransform:'uppercase',flex:1}}>{item.account}</span>
                {item.contact&&<span style={{fontSize:12,color:'#94a3b8'}}>{item.contact}</span>}
                {item.timeframe&&<span style={{fontSize:11,color:'#92400e',background:'#fef3c7',borderRadius:999,padding:'1px 7px',flexShrink:0,fontWeight:500}}>{item.timeframe}</span>}
                <ChevronRight size={14} color='#d1d5db'/>
              </div>
              <div style={{fontSize:13,fontWeight:500,color:'#1e293b',lineHeight:1.5,marginTop:6}}>{item.action}</div>
            </CardShell>
          ))}
        </div>

        {/* LONG GAME */}
        <SectionLabel icon='🌱' label='Long Game' count={longGame.length}/>
        {longGame.length===0&&<div style={{fontSize:13,color:'#94a3b8',marginBottom:24}}>No long-game seeds right now.</div>}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {longGame.map((item,idx)=>(
            <CardShell key={idx} onClick={()=>setDetailModal({item,type:'longGame',idx})}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:11,fontWeight:700,color:'#0f172a',letterSpacing:'0.06em',textTransform:'uppercase',flex:1}}>{item.account}</span>
                <ChevronRight size={14} color='#d1d5db'/>
              </div>
              <div style={{fontSize:13,fontWeight:500,color:'#1e293b',lineHeight:1.5,marginTop:6}}>{item.action}</div>
            </CardShell>
          ))}
        </div>

        {/* RENEWAL RADAR */}
        {renewalRadar.length>0&&<>
          <SectionLabel icon='🔄' label='Renewal Radar' count={renewalRadar.length}/>
          <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,overflow:'hidden'}}>
            {renewalRadar.map((item,idx)=>{
              const dot=item.daysUntil<30?'#ef4444':item.daysUntil<60?'#f59e0b':'#22c55e'
              return(
                <div key={idx}
                  onClick={()=>setDetailModal({item,type:'renewalRadar',idx})}
                  style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',borderBottom:idx<renewalRadar.length-1?'1px solid #f1f5f9':'none',cursor:'pointer',transition:'background 0.1s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#f9fafb'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:dot,flexShrink:0}}/>
                  <span style={{fontSize:13,fontWeight:600,color:'#0f172a',flex:1,minWidth:0}}>{item.vendor}</span>
                  <span style={{fontSize:12,color:'#64748b',flexShrink:0}}>{item.account}</span>
                  {item.daysUntil!=null&&<span style={{fontSize:11,fontWeight:600,color:dot,flexShrink:0,minWidth:28,textAlign:'right'}}>{item.daysUntil}d</span>}
                  {item.annualCost&&<span style={{fontSize:12,color:'#475569',fontWeight:500,flexShrink:0}}>{item.annualCost}</span>}
                  {item.inConversation!=null&&<span style={{fontSize:11,color:item.inConversation?'#15803d':'#dc2626',fontWeight:500,flexShrink:0}}>{item.inConversation?'✓ Active':'⚠ At risk'}</span>}
                  <ChevronRight size={13} color='#d1d5db'/>
                </div>
              )
            })}
          </div>
        </>}

        {/* MARKET PULSE */}
        {marketPulse.length>0&&<>
          <SectionLabel icon='📡' label='Market Pulse'/>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {marketPulse.map((item,idx)=>(
              <CardShell key={idx} onClick={()=>setDetailModal({item,type:'marketPulse',idx})}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#0f172a',flex:1,lineHeight:1.4}}>{item.headline}</div>
                  <ChevronRight size={14} color='#d1d5db' style={{flexShrink:0}}/>
                </div>
                {item.relevance&&<div style={{fontSize:12,color:'#64748b',marginTop:4,lineHeight:1.5}}>{item.relevance.slice(0,90)}{item.relevance.length>90?'…':''}</div>}
              </CardShell>
            ))}
          </div>
        </>}

        <div style={{height:60}}/>
      </div>
    )
  }

  // Find selected brief item for modal toggle
  const modalBriefDate=detailModal?.briefDate
  const modalIdx=detailModal?.idx

  return(
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:'#f8fafc'}}>
      {/* LEFT NAV */}
      <div style={{width:220,flexShrink:0,background:'#0f172a',display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden'}}>
        <div style={{padding:'16px 16px 12px',borderBottom:'1px solid rgba(255,255,255,0.08)',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <Sparkles size={15} color='#60a5fa'/>
            <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>Daily Brief</span>
          </div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'4px 0'}}>
          <div style={SL}>Today</div>
          <div onClick={()=>setSelectedDate(today)}
            style={{padding:'8px 12px',cursor:'pointer',borderRadius:6,margin:'1px 8px',background:selectedDate===today?'#1e3a5f':'transparent',transition:'background 0.1s'}}
            onMouseEnter={e=>{if(selectedDate!==today)e.currentTarget.style.background='rgba(255,255,255,0.08)'}}
            onMouseLeave={e=>{if(selectedDate!==today)e.currentTarget.style.background='transparent'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:13,fontWeight:600,color:selectedDate===today?'#fff':'#cbd5e1'}}>{fmt(today)}</span>
              {briefGenerating&&<div style={{width:11,height:11,border:'2px solid rgba(255,255,255,0.15)',borderTopColor:'#60a5fa',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>}
              {!briefGenerating&&!todayBrief&&<span style={{fontSize:10,color:'#475569'}}>—</span>}
              {!briefGenerating&&todayBrief&&incompleteCount>0&&<span style={{fontSize:10,fontWeight:700,background:'#dc2626',color:'#fff',borderRadius:999,padding:'1px 6px',minWidth:16,textAlign:'center'}}>{incompleteCount}</span>}
            </div>
            {briefGenerating&&<div style={{fontSize:10,color:'#475569',marginTop:2}}>Generating...</div>}
          </div>
          {pastBriefs.length>0&&<>
            <div style={SL}>Archive</div>
            {thisWeek.length>0&&<><div style={{fontSize:10,color:'#334155',padding:'2px 20px 1px',fontWeight:600}}>This Week</div>{thisWeek.map(briefRow)}</>}
            {lastWeek.length>0&&<><div style={{fontSize:10,color:'#334155',padding:'6px 20px 1px',fontWeight:600}}>Last Week</div>{lastWeek.map(briefRow)}</>}
            {earlier.length>0&&<><div style={{fontSize:10,color:'#334155',padding:'6px 20px 1px',fontWeight:600}}>Earlier</div>{earlier.map(briefRow)}</>}
          </>}
        </div>
        <div style={{padding:12,borderTop:'1px solid rgba(255,255,255,0.08)',flexShrink:0}}>
          <button onClick={onGenerateNow} disabled={briefGenerating}
            style={{width:'100%',padding:'8px 12px',background:briefGenerating?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:7,color:briefGenerating?'#475569':'#e2e8f0',fontSize:12,fontWeight:600,cursor:briefGenerating?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:6,justifyContent:'center'}}>
            {briefGenerating?<><div style={{width:11,height:11,border:'2px solid rgba(255,255,255,0.12)',borderTopColor:'#60a5fa',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/> Generating...</>:'+ Generate Now'}
          </button>
          <button onClick={onBack} style={{width:'100%',padding:'7px 12px',background:'transparent',border:'none',color:'#475569',fontSize:12,cursor:'pointer',marginTop:4,display:'flex',alignItems:'center',gap:5,justifyContent:'center'}}>
            <ArrowLeft size={12}/> Back to Dashboard
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{flex:1,overflowY:'auto',padding:'32px 40px',WebkitOverflowScrolling:'touch'}}>
        {briefError&&(
          <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 14px',marginBottom:20,color:'#dc2626',fontSize:13,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span>{briefError}</span>
            <button onClick={onGenerateNow} style={{marginLeft:12,background:'transparent',border:'none',color:'#dc2626',cursor:'pointer',textDecoration:'underline',fontSize:12,fontWeight:600,flexShrink:0}}>Retry</button>
          </div>
        )}
        {renderBrief(selectedBrief)}
      </div>

      {/* DETAIL MODAL */}
      {detailModal&&(
        <DetailModal
          item={detailModal.item}
          type={detailModal.type}
          idx={detailModal.idx}
          isPast={selectedDate!==today}
          onClose={()=>setDetailModal(null)}
          onToggle={()=>{
            if(detailModal.type==='actToday'&&detailModal.briefDate){
              toggleActToday(detailModal.briefDate,detailModal.idx)
              // Re-sync detailModal item
              setDetailModal(prev=>({...prev,item:{...prev.item,completedToday:!prev.item.completedToday}}))
            }
          }}
        />
      )}
    </div>
  )
}
