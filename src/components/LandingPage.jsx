import { useState, useEffect, useRef, useMemo, memo } from 'react'
import { Home, Calendar, AlertTriangle, RefreshCw, Map, Sun, Moon, X, Pencil, Clock, Share2, Building2, Folder, FolderOpen, Maximize2, LayoutGrid, List, Settings2, Package, Sparkles, FileText, BookOpen, Globe, BarChart2, ChevronRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { S, PC } from '../theme.js'
import { uid, fmtDate, daysUntil, daysSince, parseCost, formatCompactCurrency, calcHealthScore, getHealthColor, sendToAppleReminders } from '../utils.js'
import { STAGES } from '../constants.js'
import { checkBudget } from '../utils/aiHelper.js'
import IntelInbox from './IntelInbox.jsx'
import DailyBrief from './DailyBrief.jsx'
import MeetingPrep from './MeetingPrep.jsx'
import EndOfDayJournal from './EndOfDayJournal.jsx'
import MarketIntelligence from './MarketIntelligence.jsx'
import AIUsageDashboard from './AIUsageDashboard.jsx'

function LandingPageSidebar({data, theme, setTheme, setTodayModal, statDefs, setStatModal, onGoWhitespace, onGoAllProjects, onGoVendors, onGoFiles, showAccounts, setShowAccounts, onOpenSettings, collapsed, setCollapsed, onGoDailyBrief, showDailyBriefPage, onGoMeetingPrep, showMeetingPrepPage, onGoEndOfDay, showEndOfDayPage, onGoMarketIntel, showMarketIntelPage, onGoAIUsage, showAIUsagePage}) {
  const toggleCollapsed = () => { const n=!collapsed; setCollapsed(n); localStorage.setItem('sidebar-collapsed',n.toString()) }

  const today = new Date().toISOString().split('T')[0]
  const todayBrief = (data.dailyBriefs||[]).find(b=>b.date===today)
  const briefIncompleteCount = todayBrief ? (todayBrief.sections?.actToday||[]).filter(a=>!a.completedToday).length : 0
  const nowHour = new Date().getHours()
  const nowDay = new Date().getDay()
  const afterFourPm = nowHour >= 16 && nowDay >= 1 && nowDay <= 5
  const todayJournal = (data.dailyJournals||[]).find(j=>j.date===today)
  const journalBadge = afterFourPm && (!todayJournal || todayJournal.status!=='complete') ? '!' : null

  const navTop = [
    {id:'dashboard',   label:'Dashboard',   icon:<Home size={18}/>,       action:()=>setShowAccounts(false)},
    {id:'accounts',    label:'Accounts',    icon:<Building2 size={18}/>,  action:()=>setShowAccounts(true)},
    {id:'allprojects', label:'All Projects',icon:<Folder size={18}/>,     action:()=>onGoAllProjects&&onGoAllProjects()},
    {id:'whitespace',  label:'Whitespace',  icon:<Map size={18}/>,        action:()=>onGoWhitespace&&onGoWhitespace()},
    {id:'vendors',     label:'Vendors',     icon:<Package size={18}/>,    action:()=>onGoVendors&&onGoVendors()},
    {id:'files',       label:'Files',       icon:<FolderOpen size={18}/>, action:()=>onGoFiles&&onGoFiles()},
    {id:'dailybrief',  label:'Daily Brief',       icon:<Sparkles size={18}/>, action:()=>onGoDailyBrief&&onGoDailyBrief(),     badge: briefIncompleteCount>0?briefIncompleteCount:null},
    {id:'meetingprep', label:'Meeting Prep',      icon:<FileText size={18}/>, action:()=>onGoMeetingPrep&&onGoMeetingPrep()},
    {id:'endofday',    label:'Journal',           icon:<BookOpen size={18}/>, action:()=>onGoEndOfDay&&onGoEndOfDay(),          badge: journalBadge},
    {id:'marketintel', label:'Market Intel',      icon:<Globe size={18}/>,    action:()=>onGoMarketIntel&&onGoMarketIntel()},
    {id:'aiusage',     label:'AI Usage',          icon:<BarChart2 size={18}/>,action:()=>onGoAIUsage&&onGoAIUsage()},
  ]
  const navBottom = [
    {id:'tasks',    label:"Today's Tasks",  icon:<Calendar size={18}/>,     action:()=>setTodayModal(true)},
    {id:'critical', label:'Critical Items', icon:<AlertTriangle size={18}/>, action:()=>statDefs[1]&&setStatModal({...statDefs[1],items:statDefs[1].buildData()})},
    {id:'renewals', label:'Renewals',       icon:<RefreshCw size={18}/>,    action:()=>statDefs[2]&&setStatModal({...statDefs[2],items:statDefs[2].buildData()})},
  ]
  const activeId = showAIUsagePage ? 'aiusage' : showDailyBriefPage ? 'dailybrief' : showMeetingPrepPage ? 'meetingprep' : showEndOfDayPage ? 'endofday' : showMarketIntelPage ? 'marketintel' : showAccounts ? 'accounts' : 'dashboard'

  const navItem = (item, isActive) => collapsed ? (
    <div key={item.id} onClick={item.action} title={item.label}
      onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
      onMouseLeave={e=>e.currentTarget.style.background=isActive?'#F0F7FF':'transparent'}
      style={{height:38,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:6,margin:'1px 8px',position:'relative',
        background:isActive?'#F0F7FF':'transparent',color:isActive?'#007AFF':'#9CA3AF',transition:'background 0.1s'}}>
      {item.icon}
      {item.badge&&<span style={{position:'absolute',top:4,right:4,background:'#dc2626',color:'#fff',fontSize:9,fontWeight:700,borderRadius:999,minWidth:14,height:14,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 3px'}}>{item.badge}</span>}
    </div>
  ) : (
    <div key={item.id} onClick={item.action}
      onMouseEnter={e=>{if(!isActive){e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.color='#111827'}}}
      onMouseLeave={e=>{if(!isActive){e.currentTarget.style.background='transparent';e.currentTarget.style.color='#9CA3AF'}}}
      style={{height:38,padding:'0 16px',borderRadius:6,margin:'1px 8px',cursor:'pointer',display:'flex',alignItems:'center',gap:10,
        color:isActive?'#007AFF':'#9CA3AF',fontSize:14,fontWeight:isActive?600:500,
        background:isActive?'#F0F7FF':'transparent',transition:'all 0.1s'}}>
      <span style={{display:'flex',flexShrink:0,position:'relative'}}>
        {item.icon}
        {item.badge&&<span style={{position:'absolute',top:-5,right:-6,background:'#dc2626',color:'#fff',fontSize:9,fontWeight:700,borderRadius:999,minWidth:14,height:14,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 3px'}}>{item.badge}</span>}
      </span>
      {item.label}
    </div>
  )

  return (
    <div style={{position:'fixed',top:0,left:0,height:'100vh',zIndex:100,width:collapsed?64:221,background:'#FFFFFF',borderRight:'1px solid #EEEFF2',display:'flex',flexDirection:'column',overflow:'hidden',transition:'width 0.2s ease'}}>
      {collapsed ? (
        <div style={{padding:'14px 0 10px',flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',gap:8,borderBottom:'1px solid #EEEFF2'}}>
          <img src="/Ledgr-L-logo.png" style={{width:'36px',height:'36px',objectFit:'contain'}} alt="Ledgr."/>
          <button onClick={toggleCollapsed} title="Expand sidebar"
            style={{background:'transparent',border:'none',color:'#9CA3AF',cursor:'pointer',padding:'2px',display:'flex',alignItems:'center',justifyContent:'center',transition:'color 0.15s',fontSize:16}}
            onMouseEnter={e=>e.currentTarget.style.color='#6B7280'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>›</button>
        </div>
      ) : (
        <div style={{padding:'12px 16px 12px',flexShrink:0,borderBottom:'1px solid #EEEFF2'}}>
          <div style={{position:'relative',display:'flex',justifyContent:'center',alignItems:'center'}}>
            <img src="/Ledgr-full-logo.png" style={{height:'72px',width:'auto',maxWidth:'187px',objectFit:'contain',display:'block'}} alt="Ledgr."/>
            <button onClick={toggleCollapsed} title="Collapse sidebar"
              style={{position:'absolute',right:0,background:'transparent',border:'none',color:'#9CA3AF',cursor:'pointer',padding:'4px',lineHeight:1,transition:'color 0.15s'}}
              onMouseEnter={e=>e.currentTarget.style.color='#6B7280'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>‹</button>
          </div>
        </div>
      )}
      <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
        {!collapsed&&<div style={{fontSize:11,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',padding:'10px 16px 4px'}}>Navigation</div>}
        {navTop.map(item=>navItem(item, activeId===item.id))}
        <div style={{height:1,background:'#EEEFF2',margin:'8px 12px'}}/>
        {!collapsed&&<div style={{fontSize:11,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',padding:'4px 16px 4px'}}>Quick Access</div>}
        {navBottom.map(item=>navItem(item, false))}
      </div>
      <div style={{borderTop:'1px solid #EEEFF2',padding:collapsed?'10px 0':'10px 12px',flexShrink:0}}>
        {collapsed ? (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
            <button onClick={onOpenSettings} title='Settings'
              style={{width:38,height:38,borderRadius:6,border:'none',background:'transparent',color:'#9CA3AF',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s'}}
              onMouseEnter={e=>e.currentTarget.style.color='#111827'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
              <Settings2 size={18}/>
            </button>
          </div>
        ) : (
          <div>
            <div onClick={onOpenSettings}
              onMouseEnter={e=>{e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.color='#111827'}}
              onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='#9CA3AF'}}
              style={{height:38,padding:'0 16px',borderRadius:6,margin:'0 0 6px',cursor:'pointer',display:'flex',alignItems:'center',gap:10,color:'#9CA3AF',fontSize:14,fontWeight:500,background:'transparent',transition:'all 0.1s'}}>
              <Settings2 size={18}/>
              Settings
            </div>
            <div style={{display:'flex',gap:1,background:'#F3F4F6',borderRadius:8,padding:2}}>
              {[{v:'light',icon:<Sun size={13}/>},{v:'dark',icon:<Moon size={13}/>}].map(({v,icon})=>(
                <button key={v} onClick={()=>setTheme(v)}
                  style={{flex:1,padding:'5px',borderRadius:6,border:'none',background:theme===v?'#FFFFFF':'transparent',color:theme===v?'#007AFF':'#6B7280',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s'}}>
                  {icon}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const LOGO_COLORS = ['#2563eb','#7c3aed','#0ebc5f','#ea580c','#0891b2']

const RoundedTopBar = ({x, y, width, height, fill}) => {
  if (!height || height <= 0) return null
  const r = Math.min(4, height)
  return <path d={`M${x},${y+height} L${x},${y+r} Q${x},${y} ${x+r},${y} L${x+width-r},${y} Q${x+width},${y} ${x+width},${y+r} L${x+width},${y+height} Z`} fill={fill}/>
}

const BarChartCard = memo(function BarChartCard({data}) {
  const [view, setView] = useState('projects')
  const [showExpanded, setShowExpanded] = useState(false)
  const [animated, setAnimated] = useState(true)
  useEffect(() => { const t = setTimeout(() => setAnimated(false), 1200); return () => clearTimeout(t) }, [])

  const getAccountGP = (acct) => (acct.projects||[])
    .filter(p=>p.status==='Won')
    .reduce((sum,p)=>{
      const raw = p.estimatedGrossProfit||p.grossProfit||''
      const num = parseFloat(String(raw).replace(/[$,kKmM]/g,'').trim())
      const multiplier = /k/i.test(raw)?1000:/m/i.test(raw)?1000000:1
      return sum+(isNaN(num)?0:num*multiplier)
    },0)

  const chartData = useMemo(() => (data.accounts||[]).map((acct) => {
    const inFlight = (acct.projects||[]).filter(p=>p.status==='In Flight').length
    const inDiscussion = (acct.projects||[]).filter(p=>p.status==='In Discussion').length
    const gp = getAccountGP(acct)
    const rawName = acct.short||acct.name
    return {
      name: rawName.length > 13 ? rawName.slice(0, 12) + '…' : rawName,
      fullName: rawName,
      'In Flight': inFlight,
      'In Discussion': inDiscussion,
      gp,
    }
  }), [data.accounts])

  const totalInFlight = chartData.reduce((s,d)=>s+d['In Flight'],0)
  const totalInDiscussion = chartData.reduce((s,d)=>s+d['In Discussion'],0)
  const totalGP = chartData.reduce((s,d)=>s+d.gp,0)

  const CustomTooltip = ({active, payload, label}) => {
    if (!active||!payload||!payload.length) return null
    const fullLabel = payload[0]?.payload?.fullName || label
    return (
      <div style={{background:'#FFFFFF',border:'1px solid #EEEFF2',borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,0.10)',padding:'10px 14px',minWidth:140}}>
        <div style={{fontSize:12,fontWeight:700,color:'#111827',marginBottom:5}}>{fullLabel}</div>
        {payload.map((p,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:p.fill,flexShrink:0}}/>
            <span style={{fontSize:11,color:'#6B7280'}}>{p.name}:</span>
            <span style={{fontSize:11,fontWeight:700,color:'#111827'}}>{view==='gp'?formatCompactCurrency(Number(p.value)):p.value}</span>
          </div>
        ))}
      </div>
    )
  }

  const mobChart = typeof window!=='undefined'&&window.innerWidth<768

  const ChartBody = ({height=220}) => (
    <div style={mobChart?{overflowX:'auto',WebkitOverflowScrolling:'touch'}:{}}>
    <div style={mobChart?{minWidth:Math.max(500,chartData.length*70)}:{}}>
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{top:8,right:8,bottom:20,left:-20}} barGap={3} barCategoryGap="35%">
        <CartesianGrid vertical={false} stroke="#F3F4F6" strokeDasharray="3 3"/>
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#9CA3AF'}} interval={0} angle={-35} textAnchor="end" height={60}/>
        <YAxis axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#9CA3AF'}} width={36} allowDecimals={false}/>
        <RechartsTooltip content={<CustomTooltip/>} cursor={{fill:'rgba(0,0,0,0.03)'}}/>
        {view==='projects' ? (
          <>
            <Bar dataKey="In Flight" shape={<RoundedTopBar fill="#007AFF"/>} maxBarSize={10} isAnimationActive={animated} animationDuration={800}/>
            <Bar dataKey="In Discussion" shape={<RoundedTopBar fill="#BFDBFE"/>} maxBarSize={10} isAnimationActive={animated} animationDuration={800}/>
          </>
        ) : (
          <Bar dataKey="gp" name="Closed Won GP" shape={<RoundedTopBar fill="#10B981"/>} maxBarSize={10} isAnimationActive={animated} animationDuration={800}/>
        )}
      </BarChart>
    </ResponsiveContainer>
    </div>
    </div>
  )

  const LegendRow = () => view==='projects' ? (
    <div style={{display:'flex',gap:16,paddingTop:8}}>
      <span style={{display:'flex',alignItems:'center',gap:5,fontSize:12,color:'#6B7280'}}><span style={{width:8,height:8,borderRadius:'50%',background:'#007AFF',display:'inline-block',flexShrink:0}}/>In Flight</span>
      <span style={{display:'flex',alignItems:'center',gap:5,fontSize:12,color:'#6B7280'}}><span style={{width:8,height:8,borderRadius:'50%',background:'#BFDBFE',display:'inline-block',flexShrink:0}}/>In Discussion</span>
    </div>
  ) : (
    <div style={{display:'flex',gap:16,paddingTop:8}}>
      <span style={{display:'flex',alignItems:'center',gap:5,fontSize:12,color:'#6B7280'}}><span style={{width:8,height:8,borderRadius:'50%',background:'#10B981',display:'inline-block',flexShrink:0}}/>Closed Won GP</span>
    </div>
  )

  const TogglePills = () => (
    <div style={{display:'flex',gap:4,background:'#F3F4F6',borderRadius:20,padding:3}}>
      {[{v:'projects',label:'Projects'},{v:'gp',label:'Gross Profit'}].map(({v,label})=>(
        <button key={v} onClick={()=>setView(v)}
          style={{padding:'4px 14px',borderRadius:20,border:'none',fontSize:11,fontWeight:600,cursor:'pointer',transition:'all 0.15s',
            background:view===v?'#007AFF':'transparent',color:view===v?'#FFFFFF':'#6B7280'}}>
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <>
      {showExpanded&&(
        <div onClick={()=>setShowExpanded(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#FFFFFF',borderRadius:12,padding:28,boxShadow:'0 20px 60px rgba(0,0,0,0.20)',width:'90vw',height:'85vh',boxSizing:'border-box',display:'flex',flexDirection:'column',border:'1px solid #EEEFF2'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4,flexShrink:0}}>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:'#111827'}}>Projects & Pipeline</div>
                <div style={{fontSize:12,color:'#6B7280'}}>Track active deals by account</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <TogglePills/>
                <button onClick={()=>setShowExpanded(false)} style={{background:'transparent',border:'none',cursor:'pointer',color:'#9CA3AF',padding:'4px',display:'flex',alignItems:'center',borderRadius:6}}
                  onMouseEnter={e=>e.currentTarget.style.color='#111827'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
                  <X size={18}/>
                </button>
              </div>
            </div>
            <div style={{flexShrink:0}}><LegendRow/></div>
            <div style={{flex:1,minHeight:0,marginTop:8}}>
              <ChartBody height={460}/>
            </div>
          </div>
        </div>
      )}
      <div className="lp-chart-bar" style={{background:'#FFFFFF',borderRadius:12,padding:20,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',border:'1px solid #EEEFF2',flex:'0 0 63%',minWidth:0,boxSizing:'border-box',height:'100%'}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:4}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:'#111827'}}>Projects & Pipeline</div>
            <div style={{fontSize:12,color:'#6B7280'}}>Track active deals by account</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <TogglePills/>
            <button onClick={()=>setShowExpanded(true)} title="Expand" style={{background:'transparent',border:'none',cursor:'pointer',color:'#9CA3AF',padding:'4px',display:'flex',alignItems:'center',borderRadius:6}}
              onMouseEnter={e=>e.currentTarget.style.color='#007AFF'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
              <Maximize2 size={15}/>
            </button>
          </div>
        </div>
        <LegendRow/>
        <ChartBody height={220}/>
      </div>
    </>
  )
})

function PerformanceGaugeCard({data, setData, onGoAllProjects}) {
  const quotaTarget = data.quotaTarget || 0
  const [quotaInput, setQuotaInput] = useState(quotaTarget>0?formatCompactCurrency(quotaTarget):'')
  const [editing, setEditing] = useState(false)
  const [gaugeHover, setGaugeHover] = useState(false)

  const STAGE_WEIGHTS = {'Awareness':0.1,'NDA':0.1,'Intro Call':0.15,'Demo':0.2,'POC':0.3,'Scoping':0.4,'Pricing':0.6,'Legal':0.9,'Procurement':0.9,'PO Received':1.0,'Deployed':1.0}

  const attainedGP = (data.accounts||[]).reduce((sum,acct)=>
    sum+(acct.projects||[]).filter(p=>p.status==='Won').reduce((s,p)=>s+parseCost(p.estimatedGrossProfit||''),0),0)

  const inProgressGP = (data.accounts||[]).reduce((sum,acct)=>
    sum+(acct.projects||[]).filter(p=>p.status==='In Flight'||p.status==='In Discussion').reduce((s,p)=>{
      const cur=[...(p.timeline||[])].reverse().find(s2=>s2.status==='current')?.stage
      return s+parseCost(p.estimatedGrossProfit||'')*(STAGE_WEIGHTS[cur]||0.2)
    },0),0)

  const pct = quotaTarget>0?Math.min(100,Math.round((attainedGP/quotaTarget)*100)):0

  const CIRC = 2*Math.PI*80
  const HALF = CIRC/2
  const aPct = quotaTarget>0?Math.min(1,attainedGP/quotaTarget):0
  const iPct = quotaTarget>0?Math.min(1-aPct,inProgressGP/quotaTarget):0

  const totalProj = (data.accounts||[]).reduce((s,a)=>s+(a.projects||[]).filter(p=>p.status!=='Lost').length,0)
  const wonProj   = (data.accounts||[]).reduce((s,a)=>s+(a.projects||[]).filter(p=>p.status==='Won').length,0)
  const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate()-30)
  const activeAcc = (data.accounts||[]).filter(a=>a.lastContact&&new Date(a.lastContact+'T12:00:00')>=thirtyAgo).length
  const totalCrit    = (data.accounts||[]).reduce((s,a)=>s+(a.followUps||[]).filter(f=>f.priority==='Critical').length,0)
  const clearedCrit  = (data.accounts||[]).reduce((s,a)=>s+(a.followUps||[]).filter(f=>f.priority==='Critical'&&f.status==='Done').length,0)

  const handleBlur = () => {
    const raw = quotaInput.trim()
    let v = 0
    if (raw) {
      const num = parseFloat(raw.replace(/[$,]/g,''))
      v = /k$/i.test(raw)?num*1000:/m$/i.test(raw)?num*1000000:num
    }
    setData(prev=>({...prev,quotaTarget:v||0}))
    setQuotaInput(v>0?formatCompactCurrency(v):'')
    setEditing(false)
  }

  return (
    <div className="lp-chart-perf" style={{background:'#fff',borderRadius:14,padding:20,boxShadow:'0 1px 3px rgba(0,0,0,0.06)',border:'1px solid #e2e8f0',flex:'0 0 35%',minWidth:0,boxSizing:'border-box',height:'100%'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <div style={{fontSize:15,fontWeight:700,color:'#0f172a'}}>Your Performance</div>
        <button onClick={onGoAllProjects} style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'#2563eb',fontWeight:600,padding:0}}>View all →</button>
      </div>
      <div style={{position:'relative',display:'block',width:'100%',maxWidth:260,margin:'0 auto'}}>
        <svg viewBox="0 0 200 110" width="100%" style={{display:'block',cursor:'pointer'}}
          onMouseEnter={()=>setGaugeHover(true)}
          onMouseLeave={()=>setGaugeHover(false)}>
          <circle cx={100} cy={100} r={80} fill="none" stroke="#e2e8f0" strokeWidth={11}
            strokeDasharray={`${HALF} ${CIRC}`} transform="rotate(180 100 100)" strokeLinecap="round"/>
          {aPct>0&&<circle cx={100} cy={100} r={80} fill="none" stroke="#0ebc5f" strokeWidth={11}
            strokeDasharray={`${aPct*HALF} ${CIRC}`} transform="rotate(180 100 100)" strokeLinecap="round"/>}
          {iPct>0&&<circle cx={100} cy={100} r={80} fill="none" stroke="#2563eb" strokeWidth={11}
            strokeDasharray={`${iPct*HALF} ${CIRC}`} transform={`rotate(${180+aPct*180} 100 100)`} strokeLinecap="round"/>}
          {!gaugeHover ? (
            <>
              <text x={100} y={88} textAnchor="middle" fontSize={28} fontWeight={800} fill="#0f172a">{pct}%</text>
              <text x={100} y={103} textAnchor="middle" fontSize={13} fill="#64748b">of quota</text>
            </>
          ) : (
            <>
              <text x={100} y={50} textAnchor="middle" fontSize={10} fill="#94a3b8">Closed (Won)</text>
              <text x={100} y={64} textAnchor="middle" fontSize={15} fontWeight={700} fill="#0ebc5f">{attainedGP>0?formatCompactCurrency(attainedGP):'$0'}</text>
              <text x={100} y={81} textAnchor="middle" fontSize={10} fill="#94a3b8">Weighted Pipeline</text>
              <text x={100} y={97} textAnchor="middle" fontSize={15} fontWeight={700} fill="#2563eb">{inProgressGP>0?formatCompactCurrency(inProgressGP):'$0'}</text>
            </>
          )}
        </svg>
      </div>
      <div style={{textAlign:'center',marginTop:4,marginBottom:12}}>
        <span style={{fontSize:11,color:'#64748b',marginRight:6}}>Quota Target:</span>
        <input
          value={editing?quotaInput:(quotaTarget>0?formatCompactCurrency(quotaTarget):'')}
          onFocus={()=>{setEditing(true);setQuotaInput(quotaTarget>0?String(quotaTarget):'')} }
          onChange={e=>setQuotaInput(e.target.value)}
          onBlur={handleBlur}
          placeholder="Set quota target"
          style={{fontSize:12,fontWeight:600,color:'#0f172a',border:'1px solid #e2e8f0',borderRadius:6,padding:'3px 8px',width:130,textAlign:'center',background:'#f8fafc',outline:'none'}}
        />
      </div>
      <div style={{borderTop:'1px solid #f1f5f9',paddingTop:8}}>
        {[
          {c:'#0ebc5f',label:'Won Projects',           val:`${wonProj} / ${totalProj}`,   ok:wonProj>0},
          {c:'#2563eb',label:'Active Accounts (30d)',   val:`${activeAcc} / ${(data.accounts||[]).length}`, ok:activeAcc>0},
          {c:'#ea580c',label:'Critical Actions Cleared', val:`${clearedCrit} / ${Math.max(totalCrit,clearedCrit)}`, ok:clearedCrit>0},
        ].map((m,i)=>(
          <div key={i} style={{display:'flex',flexDirection:typeof window!=='undefined'&&window.innerWidth<768?'column':'row',justifyContent:'space-between',alignItems:typeof window!=='undefined'&&window.innerWidth<768?'flex-start':'center',gap:2,padding:'6px 0',borderBottom:'0.5px solid #f1f5f9',fontSize:13}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{width:7,height:7,borderRadius:'50%',background:m.c,flexShrink:0}}/>
              <span style={{color:'#475569'}}>{m.label}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <span style={{fontWeight:700,color:'#0f172a'}}>{m.val}</span>
              {m.ok&&<span style={{color:'#0ebc5f',fontSize:12}}>✓</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LandingPage({data, setData, onEnterAccount, onNavigateTo, onOpenSettings, onGoWhitespace, onGoAllProjects, onGoVendors, onGoFiles, onGoDailyBrief, onGoMeetingPrep, onGoEndOfDay, briefGenerating, briefError, onGenerateBrief, theme, setTheme, showAccounts, setShowAccounts, sidebarCollapsed, setSidebarCollapsed}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [hoveredId, setHoveredId] = useState(null)
  const [statModal, setStatModal] = useState(null)
  const [viewMode, setViewMode] = useState(()=>localStorage.getItem('accounts-view-mode')||'grid')
  const [listSearch, setListSearch] = useState('')
  const [listSortKey, setListSortKey] = useState('name')
  const [listSortDir, setListSortDir] = useState('asc')
  const mob = typeof window!=='undefined'&&window.innerWidth<768
  const [mobNavOpen, setMobNavOpen] = useState(false)
  const [showDailyBriefPage, setShowDailyBriefPage] = useState(false)
  const [showMeetingPrepPage, setShowMeetingPrepPage] = useState(false)
  const [showEndOfDayPage, setShowEndOfDayPage] = useState(false)
  const [showMarketIntelPage, setShowMarketIntelPage] = useState(false)
  const [showAIUsagePage, setShowAIUsagePage] = useState(false)
  const scrollRef = useRef(null)
  const clearBriefPages = () => { setShowDailyBriefPage(false); setShowMeetingPrepPage(false); setShowEndOfDayPage(false); setShowMarketIntelPage(false); setShowAIUsagePage(false) }
  const [logoScale, setLogoScale] = useState(1)
  useEffect(()=>{
    if(!mob)return
    const el=scrollRef.current
    if(!el)return
    let rafId=null
    const onScroll=()=>{
      if(rafId)return
      rafId=requestAnimationFrame(()=>{
        setLogoScale(Math.max(0.4,1-el.scrollTop/150))
        rafId=null
      })
    }
    el.addEventListener('scroll',onScroll,{passive:true})
    return()=>{el.removeEventListener('scroll',onScroll);if(rafId)cancelAnimationFrame(rafId)}
  },[mob])
  const LOGO_COLORS = ['#2563eb','#7c3aed','#0ebc5f','#ea580c','#0891b2','#e91e8c']

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric',year:'numeric'})

  const [todayModal, setTodayModal] = useState(false)
  const [intelInboxOpen, setIntelInboxOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [taskForm, setTaskForm] = useState(null)
  const [taskSnoozeOpen, setTaskSnoozeOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [saveFlash, setSaveFlash] = useState(null)
  const [todayEditRow, setTodayEditRow] = useState(null)
  const [todayEditFlash, setTodayEditFlash] = useState(null)
  const [remindersToast, setRemindersToast] = useState(false)
  const [taskContexts, setTaskContexts] = useState({})
  const [taskContextLoading, setTaskContextLoading] = useState(null)
  const [expandedContextIds, setExpandedContextIds] = useState(new Set())
  const lpTodayStr = new Date().toISOString().split('T')[0]
  const totalOpenFUs = data.accounts.reduce((s,a)=>s+(a.followUps||[]).filter(f=>f.status==='Open').length, 0)
  const highCriticalFUs = data.accounts.reduce((s,a)=>s+(a.followUps||[]).filter(f=>f.status==='Open'&&(f.priority==='Critical'||f.priority==='High')).length, 0)
  const hcDueTodayOrOverdue = data.accounts.reduce((s,a)=>s+(a.followUps||[]).filter(f=>{if(f.status!=='Open')return false;if(f.priority!=='Critical'&&f.priority!=='High')return false;const d=daysUntil(f.dueDate);return d!==null&&d<=0}).length, 0)
  const criticalItems = data.accounts.reduce((s,a)=>s+(a.followUps||[]).filter(f=>{if(f.status!=='Open'||f.priority!=='Critical')return false;const d=daysUntil(f.dueDate);return d!==null&&d<=3}).length, 0)
  const renewals90 = data.accounts.reduce((s,a)=>s+(a.techStack||[]).filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=90}).length, 0)
  const activeProjects = data.accounts.reduce((s,a)=>s+(a.projects||[]).filter(p=>p.status==='In Flight').length, 0)
  const todayTasksCount = data.accounts.reduce((s,a)=>s+(a.followUps||[]).filter(f=>f.status==='Open'&&f.dueDate&&f.dueDate<=lpTodayStr).length, 0)

  // Insight card data
  const healthyCount  = data.accounts.filter(a=>calcHealthScore(a)>=70).length
  const atRiskCount   = data.accounts.filter(a=>{const s=calcHealthScore(a);return s>=40&&s<70}).length
  const criticalHSCount = data.accounts.filter(a=>calcHealthScore(a)<40).length
  const allOverdueFUs = data.accounts.flatMap(a=>(a.followUps||[]).filter(f=>f.status==='Open'&&f.dueDate&&f.dueDate<lpTodayStr))
  const overdueCritFUs = allOverdueFUs.filter(f=>f.priority==='Critical').length
  const overdueHighFUs = allOverdueFUs.filter(f=>f.priority==='High').length
  const oldestOverdueDays = allOverdueFUs.length>0?Math.max(...allOverdueFUs.map(f=>daysSince(f.dueDate)||0)):0
  const renewalsList = data.accounts.flatMap(a=>(a.techStack||[]).filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=90}).map(t=>({...t,acctName:a.short||a.name,daysLeft:daysUntil(t.renewalDate)||999})))
  renewalsList.sort((a,b)=>a.daysLeft-b.daysLeft)
  const renewalValue = renewalsList.reduce((s,t)=>s+parseCost(t.cost||''),0)
  const nextRenewal = renewalsList[0]||null
  const stalledProjects = data.accounts.flatMap(a=>(a.projects||[]).filter(p=>p.status==='Stalled').map(p=>({...p,acctName:a.short||a.name,lastDate:[...(p.timeline||[])].reverse().find(s2=>s2.status==='current')?.date||null})))
  const avgStalledDays = stalledProjects.length>0?Math.round(stalledProjects.reduce((s,p)=>s+(p.lastDate?daysSince(p.lastDate)||0:0),0)/stalledProjects.length):0
  const wsAccts = data.whitespaceAccounts||[]
  const wsTotal = wsAccts.reduce((s,a)=>s+(a.intelLog||[]).length,0)
  const wsMonthStr = (()=>{const d=new Date();d.setDate(1);return d.toISOString().split('T')[0]})()
  const wsNew = wsAccts.reduce((s,a)=>s+(a.intelLog||[]).filter(e=>e.date&&e.date>=wsMonthStr).length,0)
  const WS_STATUSES = ['Prospect','Researching','Reached Out','Active']
  const wsStatusCounts = WS_STATUSES.map(st=>wsAccts.filter(a=>a.status===st).length)
  const wsStatusTotal = wsStatusCounts.reduce((s,n)=>s+n,0)
  const wsStatusColors = ['#64748b','#2563eb','#ea580c','#0ebc5f']

  const todayGrouped = data.accounts
    .map(a=>({account:a,tasks:(a.followUps||[]).filter(f=>f.status==='Open'&&f.dueDate&&f.dueDate<=lpTodayStr).sort((a,b)=>{const ao=a.dueDate<lpTodayStr,bo=b.dueDate<lpTodayStr;if(ao&&!bo)return -1;if(!ao&&bo)return 1;if(ao&&bo)return a.dueDate.localeCompare(b.dueDate);return['Critical','High','Medium','Low'].indexOf(a.priority)-['Critical','High','Medium','Low'].indexOf(b.priority)})}))
    .filter(g=>g.tasks.length>0)
    .sort((a,b)=>{const ac=a.tasks.some(t=>t.priority==='Critical'),bc=b.tasks.some(t=>t.priority==='Critical');if(ac&&!bc)return -1;if(!ac&&bc)return 1;return b.tasks.length-a.tasks.length})
  const markTaskDone = (accountId,taskId) => setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===accountId?{...a,followUps:a.followUps.map(fu=>fu.id===taskId?{...fu,status:'Done'}:fu)}:a)}))
  const markAllTodayDone = () => {if(!window.confirm(`Mark all ${todayTasksCount} task${todayTasksCount!==1?'s':''} complete?`))return;setData(prev=>({...prev,accounts:prev.accounts.map(a=>({...a,followUps:(a.followUps||[]).map(fu=>fu.status==='Open'&&fu.dueDate&&fu.dueDate<=lpTodayStr?{...fu,status:'Done'}:fu)}))}));setTodayModal(false)}
  const openTaskDetail = (accountId,fu) => { setSelectedTask({accountId}); setTaskForm({...fu}); setTaskSnoozeOpen(false) }
  const closeDetail = () => { setSelectedTask(null); setTaskForm(null); setTaskSnoozeOpen(false) }

  const toggleTaskContext = async (key, taskTitle, dueDate, contact, account) => {
    const isExpanded = expandedContextIds.has(key)
    setExpandedContextIds(prev => { const n=new Set(prev); isExpanded?n.delete(key):n.add(key); return n })
    if (isExpanded || taskContexts[key]) return // already cached or collapsing
    setTaskContextLoading(key)
    try {
      const recentIntel = [...(account.intelLog||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5).map(e=>`[${e.date||''}] ${(e.summary||e.text||'').slice(0,250)}`).join('\n')
      const activeProjs = (account.projects||[]).filter(p=>['In Flight','In Discussion'].includes(p.status)).slice(0,3).map(p=>`${p.name} (${p.status})${p.nextSteps?': '+p.nextSteps:''}`).join('; ')
      const recentNotes = (account.followUps||[]).filter(f=>f.status==='Done'&&f.context).sort((a,b)=>(b.dueDate||'').localeCompare(a.dueDate||'')).slice(0,3).map(f=>f.context).join(' | ')
      const prompt = `You are a sales intelligence assistant for an Enterprise Client Manager at GuidePoint Security.\n\nTask: "${taskTitle}"\nDue: ${dueDate||'today'}\nAccount: ${account.name}${contact?`\nContact: ${contact}`:''}\n\nRecent intel (last 3-5 entries):\n${recentIntel||'None available'}\n\nActive projects:\n${activeProjs||'None'}\n\nRecent completed task notes:\n${recentNotes||'None'}\n\nWrite 2-3 sentences of specific, actionable context for this task. Reference actual names, dates, deals, vendors, or decisions from the intel above. Be concrete — not generic. Do not add headers or bullet points, just prose.`
      const resp = await fetch('/api/ai', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:200,messages:[{role:'user',content:prompt}]})
      })
      const result = await resp.json()
      if (result.error) throw new Error(result.error.message||'API error')
      const text = (result.content||[]).find(b=>b.type==='text')?.text?.trim()||''
      setTaskContexts(prev=>({...prev,[key]:{text:text||'No context available.',generatedAt:new Date().toISOString()}}))
    } catch(err) {
      console.error('[TaskContext]',err)
      setTaskContexts(prev=>({...prev,[key]:{text:'Could not generate context.',generatedAt:new Date().toISOString(),error:true}}))
    }
    setTaskContextLoading(null)
  }

  const openEditItem = (type, accountId, item) => {
    setEditingItem(prev => prev?.itemId===item.id ? null : {type, accountId, itemId:item.id, form:{...item}})
  }
  const saveEditItem = () => {
    if (!editingItem) return
    const {type, accountId, itemId, form} = editingItem
    if (type==='followup') setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===accountId?{...a,followUps:(a.followUps||[]).map(fu=>fu.id===itemId?{...fu,...form}:fu)}:a)}))
    else if (type==='techstack') setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===accountId?{...a,techStack:(a.techStack||[]).map(t=>t.id===itemId?{...t,...form}:t)}:a)}))
    setStatModal(prev=>prev?{...prev,items:prev.items.map(item=>item.id===itemId?{...item,...form}:item)}:null)
    setSaveFlash(itemId); setTimeout(()=>setSaveFlash(null),1500); setEditingItem(null)
  }
  const completeFUInModal = (accountId, itemId) => {
    setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===accountId?{...a,followUps:(a.followUps||[]).map(fu=>fu.id===itemId?{...fu,status:'Done'}:fu)}:a)}))
    setStatModal(prev=>prev?{...prev,items:prev.items.filter(item=>item.id!==itemId)}:null)
  }
  const openTodayEdit = (accountId, fu) => {
    setTodayEditRow(prev=>prev?.fuId===fu.id?null:{accountId,fuId:fu.id,form:{...fu}})
  }
  const saveTodayEdit = () => {
    if (!todayEditRow) return
    const {accountId,fuId,form} = todayEditRow
    setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===accountId?{...a,followUps:(a.followUps||[]).map(fu=>fu.id===fuId?{...fu,...form}:fu)}:a)}))
    setTodayEditFlash(fuId); setTimeout(()=>setTodayEditFlash(null),1500); setTodayEditRow(null)
  }
  const updateTaskField = (k,v) => {
    if(!taskForm||!selectedTask) return
    const updated={...taskForm,[k]:v}
    setTaskForm(updated)
    setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===selectedTask.accountId?{...a,followUps:a.followUps.map(fu=>fu.id===updated.id?updated:fu)}:a)}))
  }
  const snoozeTaskDetail = option => {
    const now=new Date(); const until=new Date()
    if(option==='later'){until.setHours(17,0,0,0);if(until<=now){until.setDate(until.getDate()+1);until.setHours(17,0,0,0)}}
    else if(option==='tomorrow'){until.setDate(until.getDate()+1);until.setHours(8,0,0,0)}
    else if(option==='3days'){until.setDate(until.getDate()+3);until.setHours(8,0,0,0)}
    else if(option==='nextweek'){const day=now.getDay();const d=day===1?7:((1+7-day)%7)||7;until.setDate(until.getDate()+d);until.setHours(7,0,0,0)}
    updateTaskField('dueDate',until.toISOString().split('T')[0])
    setTaskSnoozeOpen(false); closeDetail()
  }

  const addAccount = () => {
    if (!newName.trim()) return
    const id = uid()
    const blank = {id,name:newName,short:newName.slice(0,6).toUpperCase(),industry:'',hq:'',status:'Active',cloud:'',users:'',relationship:'',lastContact:'',notes:'',endpoints:'',contacts:[],techStack:[],projects:[],interactions:[],intelLog:[],followUps:[],files:[],savedLinks:[],adminData:{},upcomingDates:[],unknownMentions:[],relSuggestions:[],contactSuggestions:[],dismissedAlerts:[],snoozedAlerts:[],healthScoreOverrides:{},healthScoreHistory:[],aiHistory:[],logoImage:'',orgChart:{nodes:[]}}
    setData(p=>({...p,accounts:[...p.accounts,blank]}))
    onEnterAccount(id)
    setShowAdd(false)
    setNewName('')
  }

  const statusColor = {Strategic:'#a855f7',Active:'#22c55e',Prospect:'#3b82f6','At Risk':'#ef4444'}
  const GP_BLUE = '#0066cc'
  const GP_LIGHT = '#0ea5e9'

  const priOrd = {'Critical':0,'High':1,'Medium':2,'Low':3}
  const buildFUData = (filter='hc') => data.accounts.flatMap(a=>
    (a.followUps||[]).filter(f=>{
      if (f.status!=='Open') return false
      if (filter==='hc') return f.priority==='Critical'||f.priority==='High'
      if (filter==='critical3d') { if (f.priority!=='Critical') return false; const d=daysUntil(f.dueDate); return d!==null&&d<=3 }
      return true
    }).map(f=>({...f,accountName:a.short||a.name,accountId:a.id}))
  ).sort((a,b)=>{const pd=(priOrd[a.priority]||3)-(priOrd[b.priority]||3);return pd!==0?pd:(a.dueDate||'9999').localeCompare(b.dueDate||'9999')})
  const buildRenewalData = () => data.accounts.flatMap(a=>
    (a.techStack||[]).filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=90}).map(t=>({...t,accountName:a.short||a.name,accountId:a.id,daysLeft:daysUntil(t.renewalDate)}))
  ).sort((a,b)=>a.daysLeft-b.daysLeft)
  const buildProjectData = () => data.accounts.flatMap(a=>
    (a.projects||[]).filter(p=>p.status==='In Flight').map(p=>({...p,accountName:a.short||a.name,accountId:a.id}))
  ).sort((a,b)=>(a.closeDate||'9999').localeCompare(b.closeDate||'9999'))

  const STAT_DEFS = [
    {label:'HIGH / CRITICAL',value:highCriticalFUs,color:'#2563eb',iconColor:S.isLight?'#000000':'#1c1c1e',type:'followups',tab:'followups',buildData:()=>buildFUData('hc'),ctx:`${hcDueTodayOrOverdue} due today or overdue`},
    {label:'Critical Items',value:criticalItems,color:'#dc2626',type:'critical',tab:'followups',buildData:()=>buildFUData('critical3d'),ctx:'due within 3 days'},
    {label:'Renewals (90d)',value:renewals90,color:'#ea580c',type:'renewals',tab:'stack',buildData:buildRenewalData,ctx:'need attention'},
    {label:'Active Projects',value:activeProjects,color:'#16a34a',iconColor:'rgba(22,163,74,0.5)',type:'projects',tab:'projects',buildData:buildProjectData,ctx:'in flight'},
  ]

  const StatIconLg = ({type,color,iconColor}) => {
    const ic = iconColor||color
    const s = {width:20,height:20}
    if (type==='followups') return <svg {...s} viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="16" rx="3" fill="none" stroke={ic} strokeWidth="1.6"/><line x1="5" y1="7" x2="15" y2="7" stroke={ic} strokeWidth="1.5" strokeLinecap="round"/><line x1="5" y1="10.5" x2="15" y2="10.5" stroke={ic} strokeWidth="1.5" strokeLinecap="round"/><line x1="5" y1="14" x2="10" y2="14" stroke={ic} strokeWidth="1.5" strokeLinecap="round"/></svg>
    if (type==='critical') return <svg {...s} viewBox="0 0 20 20"><path d="M10 2 L18 18 L2 18 Z" fill="none" stroke={ic} strokeWidth="1.6" strokeLinejoin="round"/><line x1="10" y1="8" x2="10" y2="12.5" stroke={ic} strokeWidth="1.6" strokeLinecap="round"/><circle cx="10" cy="15" r="0.9" fill={ic}/></svg>
    if (type==='renewals') return <svg {...s} viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke={ic} strokeWidth="1.6"/><line x1="10" y1="5.5" x2="10" y2="10" stroke={ic} strokeWidth="1.6" strokeLinecap="round"/><line x1="10" y1="10" x2="13.5" y2="12.5" stroke={ic} strokeWidth="1.6" strokeLinecap="round"/></svg>
    if (type==='projects') return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ic} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
    return null
  }

  const _budget = data ? checkBudget(data) : null
  return (
    <div style={{height:'100vh',background:S.bg,color:S.txt,overflow:'hidden'}}>
      <style>{`@keyframes tcDot{0%,80%,100%{opacity:0.3;transform:scale(0.8)}40%{opacity:1;transform:scale(1)}}`}</style>
      {remindersToast&&<div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'rgba(34,197,94,0.92)',color:'#fff',padding:'9px 22px',borderRadius:8,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:'0 4px 16px rgba(0,0,0,0.35)',pointerEvents:'none',display:'flex',alignItems:'center',gap:7}}><Share2 size={14}/> Sending to Apple Reminders...</div>}
      {_budget?.warn&&<div style={{position:'fixed',top:0,left:0,right:0,zIndex:500,background:_budget.blocked?'#FEF2F2':'#FFFBEB',borderBottom:`1px solid ${_budget.blocked?'#FCA5A5':'#FDE68A'}`,padding:'7px 20px',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:12}}>
        <AlertTriangle size={13} style={{color:_budget.blocked?'#dc2626':'#d97706',flexShrink:0}}/>
        <span style={{color:_budget.blocked?'#991B1B':'#92400E',fontWeight:500}}>
          {_budget.blocked
            ? `AI budget limit reached (${_budget.pct.toFixed(0)}% of $${_budget.budget}/mo). Non-essential AI calls are paused. Go to Settings → AI Budget to adjust.`
            : `AI spend at ${_budget.pct.toFixed(0)}% of monthly budget ($${_budget.spend.toFixed(2)} of $${_budget.budget}). Reduce usage or increase budget in Settings → AI Budget.`}
        </span>
      </div>}
      {!mob&&<LandingPageSidebar data={data} theme={theme} setTheme={setTheme} setTodayModal={setTodayModal} statDefs={STAT_DEFS} setStatModal={setStatModal} onGoWhitespace={onGoWhitespace} onGoAllProjects={onGoAllProjects} onGoVendors={onGoVendors} onGoFiles={onGoFiles} showAccounts={showAccounts} setShowAccounts={v=>{setShowAccounts(v);clearBriefPages()}} onOpenSettings={onOpenSettings} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} onGoDailyBrief={()=>{clearBriefPages();setShowDailyBriefPage(true)}} showDailyBriefPage={showDailyBriefPage} onGoMeetingPrep={()=>{clearBriefPages();setShowMeetingPrepPage(true)}} showMeetingPrepPage={showMeetingPrepPage} onGoEndOfDay={()=>{clearBriefPages();setShowEndOfDayPage(true)}} showEndOfDayPage={showEndOfDayPage} onGoMarketIntel={()=>{clearBriefPages();setShowMarketIntelPage(true)}} showMarketIntelPage={showMarketIntelPage} onGoAIUsage={()=>{clearBriefPages();setShowAIUsagePage(true)}} showAIUsagePage={showAIUsagePage}/>}
      {mob&&<>
        <button onClick={()=>setMobNavOpen(true)} aria-label="Open menu"
          style={{position:'fixed',top:12,right:12,zIndex:200,background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:8,padding:'10px 11px',cursor:'pointer',boxShadow:'0 2px 8px rgba(0,0,0,0.10)',display:'flex',flexDirection:'column',gap:4}}>
          <div style={{width:18,height:2,background:'#111827',borderRadius:1}}/>
          <div style={{width:18,height:2,background:'#111827',borderRadius:1}}/>
          <div style={{width:18,height:2,background:'#111827',borderRadius:1}}/>
        </button>
        {mobNavOpen&&<>
          <div onClick={()=>setMobNavOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:250}}/>
          <div style={{position:'fixed',left:0,top:0,height:'100vh',width:270,zIndex:260,background:'#FFFFFF',boxShadow:'4px 0 24px rgba(0,0,0,0.12)',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'18px 20px 14px',borderBottom:'1px solid #EEEFF2',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <img src="/Ledgr-full-logo.png" style={{height:44,objectFit:'contain',display:'block'}} alt="Ledgr."/>
              <button onClick={()=>setMobNavOpen(false)} style={{background:'transparent',border:'none',color:'#9CA3AF',cursor:'pointer',fontSize:24,lineHeight:1,padding:'0 4px'}}>×</button>
            </div>
            <div style={{flex:1,overflowY:'auto',paddingTop:8}}>
              {[
                {label:'Dashboard',       action:()=>{setShowAccounts(false);clearBriefPages();setMobNavOpen(false)}},
                {label:'Accounts',        action:()=>{setShowAccounts(true);clearBriefPages();setMobNavOpen(false)}},
                {label:'All Projects',    action:()=>{onGoAllProjects&&onGoAllProjects();setMobNavOpen(false)}},
                {label:'Whitespace',      action:()=>{onGoWhitespace&&onGoWhitespace();setMobNavOpen(false)}},
                {label:'Vendors',         action:()=>{onGoVendors&&onGoVendors();setMobNavOpen(false)}},
                {label:'Files',           action:()=>{onGoFiles&&onGoFiles();setMobNavOpen(false)}},
                {label:'Daily Brief',     action:()=>{clearBriefPages();setShowDailyBriefPage(true);setMobNavOpen(false)}},
                {label:'Meeting Prep',    action:()=>{clearBriefPages();setShowMeetingPrepPage(true);setMobNavOpen(false)}},
                {label:'Journal',         action:()=>{clearBriefPages();setShowEndOfDayPage(true);setMobNavOpen(false)}},
                {label:'Market Intel',    action:()=>{clearBriefPages();setShowMarketIntelPage(true);setMobNavOpen(false)}},
                {label:'Settings',        action:()=>{onOpenSettings&&onOpenSettings();setMobNavOpen(false)}},
              ].map(item=>(
                <button key={item.label} onClick={item.action}
                  style={{display:'block',width:'100%',textAlign:'left',padding:'15px 24px',background:'transparent',border:'none',borderBottom:'1px solid #F9FAFB',fontSize:15,fontWeight:500,color:'#111827',cursor:'pointer',boxSizing:'border-box'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </>}
      </>}
      {showDailyBriefPage&&<div style={{marginLeft:mob?0:(sidebarCollapsed?64:221),transition:'margin-left 0.2s ease',height:'100vh',overflow:'hidden'}}>
        <DailyBrief data={data} setData={setData} briefGenerating={briefGenerating} briefError={briefError} onGenerateNow={onGenerateBrief} onBack={()=>setShowDailyBriefPage(false)}/>
      </div>}
      {showMeetingPrepPage&&<div style={{marginLeft:mob?0:(sidebarCollapsed?64:221),transition:'margin-left 0.2s ease',height:'100vh',overflow:'hidden'}}>
        <MeetingPrep data={data} setData={setData} onBack={()=>setShowMeetingPrepPage(false)}/>
      </div>}
      {showEndOfDayPage&&<div style={{marginLeft:mob?0:(sidebarCollapsed?64:221),transition:'margin-left 0.2s ease',height:'100vh',overflow:'hidden'}}>
        <EndOfDayJournal data={data} setData={setData} onBack={()=>setShowEndOfDayPage(false)}/>
      </div>}
      {showMarketIntelPage&&<div style={{marginLeft:mob?0:(sidebarCollapsed?64:221),transition:'margin-left 0.2s ease',height:'100vh',overflow:'hidden'}}>
        <MarketIntelligence data={data} setData={setData} onBack={()=>setShowMarketIntelPage(false)}/>
      </div>}
      {showAIUsagePage&&<div style={{marginLeft:mob?0:(sidebarCollapsed?64:221),transition:'margin-left 0.2s ease',height:'100vh',overflowY:'auto'}}>
        <AIUsageDashboard onBack={()=>setShowAIUsagePage(false)} apiKey={data?.apiKey} data={data} setData={setData}/>
      </div>}
      <div ref={scrollRef} style={{marginLeft:mob?0:(sidebarCollapsed?64:221),transition:'margin-left 0.2s ease',height:'100vh',overflowY:'auto',WebkitOverflowScrolling:'touch',display:showDailyBriefPage||showMeetingPrepPage||showEndOfDayPage||showMarketIntelPage||showAIUsagePage?'none':'block'}}>
      {/* HERO SECTION */}
      {mob ? (
        <div style={{background:'#ffffff',padding:'14px 24px 10px',display:'flex',justifyContent:'center',alignItems:'center',borderBottom:'1px solid #f1f5f9',position:'sticky',top:0,zIndex:100}}>
          <img src="/ledgr-mobile.png" alt="Ledgr."
            style={{height:44,maxWidth:'60%',objectFit:'contain',display:'block',transform:`scale(${logoScale})`,transformOrigin:'center center',transition:'transform 120ms ease-out'}}
            onError={e=>{e.currentTarget.style.display='none';e.currentTarget.nextSibling.style.display='block'}}/>
          <span style={{display:'none',fontSize:22,fontWeight:800,color:'#0f172a',letterSpacing:'-0.02em'}}>Ledgr.</span>
        </div>
      ) : (
        <div style={{background:'#ffffff',padding:'12px 48px 10px',display:'flex',alignItems:'center'}}>
          <div style={{maxWidth:1160,margin:'0 auto',width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:20}}>
            <div>
              <div style={{fontSize:22,fontWeight:800,color:'#0f172a',marginBottom:4,lineHeight:1.2,letterSpacing:'-0.02em'}}>{greeting}, Mike</div>
              <div style={{fontSize:12,color:'#64748b',lineHeight:1.5}}>
                <span style={{fontWeight:600,color:'#0f172a'}}>{data.accounts.length}</span> account{data.accounts.length!==1?'s':''}
                {totalOpenFUs>0&&<> · <span style={{color:'#2563eb',fontWeight:600}}>{totalOpenFUs}</span> open action{totalOpenFUs!==1?'s':''}</>}
                {criticalItems>0&&<> · <span style={{color:'#dc2626',fontWeight:600}}>{criticalItems} critical</span></>}
                {renewals90>0&&<> · <span style={{color:'#ea580c',fontWeight:600}}>{renewals90}</span> renewal{renewals90!==1?'s':''} within 90 days</>}
              </div>
            </div>
            <div style={{display:'flex',gap:8,flexShrink:0,marginRight:32}}>
              <button
                onClick={()=>setIntelInboxOpen(true)}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 14px rgba(15,23,42,0.35)';e.currentTarget.style.transform='translateY(-1px)'}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 4px rgba(15,23,42,0.15)';e.currentTarget.style.transform='translateY(0)'}}
                style={{
                  background:'linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#1d4ed8 100%)',
                  border:'none',
                  boxShadow:'0 1px 4px rgba(15,23,42,0.15)',
                  borderRadius:10,
                  padding:'9px 16px',
                  cursor:'pointer',
                  display:'flex',
                  alignItems:'center',
                  gap:8,
                  transition:'all 0.2s',
                  transform:'translateY(0)',
                  whiteSpace:'nowrap',
                }}>
                <svg width="15" height="12" viewBox="0 0 22 17" fill="none"><rect x="1" y="1" width="20" height="15" rx="2" stroke="rgba(255,255,255,0.75)" strokeWidth="1.6"/><path d="M1 5l10 6 10-6" stroke="rgba(255,255,255,0.75)" strokeWidth="1.6" strokeLinecap="round"/></svg>
                <span style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.92)',letterSpacing:'0.01em'}}>Intel Inbox</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{maxWidth:1160,margin:'0 auto',padding:mob?'20px 16px 60px':'28px 32px 80px'}}>

        {/* STATS ROW */}
        <div style={{display:'grid',gridTemplateColumns:mob?'repeat(2,1fr)':'repeat(5,1fr)',gap:mob?8:12,marginBottom:mob?20:36}}>
          {/* Today's Tasks — hero tile (blue gradient) */}
          <button
            onClick={()=>setTodayModal(true)}
            onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 8px 24px rgba(37,99,235,0.4)';e.currentTarget.style.transform='translateY(-2px)'}}
            onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 2px 8px rgba(37,99,235,0.25)';e.currentTarget.style.transform='translateY(0)'}}
            style={S.isLight?{
              background:'linear-gradient(135deg,#1d4ed8 0%,#2563eb 60%,#3b82f6 100%)',
              border:'none',
              boxShadow:'0 2px 8px rgba(37,99,235,0.25)',
              borderRadius:12,padding:mob?'12px 14px':'18px 20px',textAlign:'left',cursor:'pointer',transition:'all 0.2s',
              transform:'translateY(0)',
              minHeight:mob?80:110,display:'flex',flexDirection:'column',justifyContent:'space-between',
            }:{
              background:'linear-gradient(135deg,#1e1b4b 0%,#4338ca 50%,#6366f1 100%)',
              border:`1px solid ${S.bdr}`,
              boxShadow:'none',
              borderRadius:12,padding:mob?'12px 14px':'18px 20px',textAlign:'left',cursor:'pointer',transition:'all 0.15s',
              minHeight:mob?80:110,display:'flex',flexDirection:'column',justifyContent:'space-between',
            }}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:10,color:'rgba(255,255,255,0.75)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em'}}>Today's Tasks</span>
              <div style={{width:42,height:42,borderRadius:8,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <svg width="16" height="16" viewBox="0 0 18 18"><rect x="2" y="2" width="14" height="14" rx="2" fill="none" stroke="rgba(220,38,38,0.5)" strokeWidth="1.5"/><line x1="6" y1="2" x2="6" y2="5" stroke="rgba(220,38,38,0.5)" strokeWidth="1.5" strokeLinecap="round"/><line x1="12" y1="2" x2="12" y2="5" stroke="rgba(220,38,38,0.5)" strokeWidth="1.5" strokeLinecap="round"/><line x1="2" y1="8" x2="16" y2="8" stroke="rgba(220,38,38,0.5)" strokeWidth="1.2"/></svg>
              </div>
            </div>
            <div>
              <div style={{fontSize:mob?28:40,fontWeight:900,color:'#ffffff',lineHeight:1,marginBottom:3}}>{todayTasksCount}</div>
              <div style={{fontSize:11,color:'rgba(255,255,255,0.6)'}}>tasks due or overdue</div>
            </div>
          </button>
          {STAT_DEFS.map(stat=>(
            <button key={stat.label}
              onClick={()=>stat.type==='projects'&&onGoAllProjects?onGoAllProjects():setStatModal({...stat,items:stat.buildData()})}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.1)';e.currentTarget.style.transform='translateY(-2px)'}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)';e.currentTarget.style.transform='translateY(0)'}}
              style={S.isLight?{
                background:'#ffffff',
                border:'1px solid #e2e8f0',
                borderTop:'none',
                boxShadow:'0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)',
                borderRadius:12,padding:mob?'12px 14px':'18px 20px',textAlign:'left',cursor:'pointer',transition:'all 0.2s',
                transform:'translateY(0)',
                minHeight:mob?80:110,display:'flex',flexDirection:'column',justifyContent:'space-between',
              }:{
                background:S.surf,
                border:`1px solid ${S.bdr}`,
                boxShadow:'none',
                borderRadius:12,padding:mob?'12px 14px':'18px 20px',textAlign:'left',cursor:'pointer',transition:'all 0.15s',
                minHeight:mob?80:110,display:'flex',flexDirection:'column',justifyContent:'space-between',
              }}>
              {S.isLight?(
                <>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em'}}>{stat.label}</span>
                    {!mob&&<div style={{width:36,height:36,borderRadius:10,background:stat.color+'15',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <StatIconLg type={stat.type} color={stat.color} iconColor={stat.iconColor}/>
                    </div>}
                  </div>
                  <div>
                    <div style={{fontSize:mob?24:36,fontWeight:900,color:'#0f172a',lineHeight:1,marginBottom:3}}>{stat.value}</div>
                    <div style={{fontSize:11,color:'#94a3b8'}}>{stat.ctx}</div>
                  </div>
                </>
              ):(
                <>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em'}}>{stat.label}</span>
                    <div style={{width:36,height:36,borderRadius:10,background:stat.color+'20',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <StatIconLg type={stat.type} color={stat.color} iconColor={stat.iconColor}/>
                    </div>
                  </div>
                  <div style={{fontSize:mob?24:36,fontWeight:800,color:stat.color,lineHeight:1}}>{stat.value}</div>
                </>
              )}
            </button>
          ))}
        </div>


        {showAccounts ? (
          // === ACCOUNTS PAGE ===
          data.accounts.length===0 ? (
            <div style={{textAlign:'center',padding:'70px 20px'}}>
              <div style={{fontSize:22,fontWeight:700,color:S.txt,marginBottom:10}}>No Accounts Yet</div>
              <div style={{fontSize:14,color:S.muted,marginBottom:30,lineHeight:1.7}}>Add your first account to start tracking contacts, projects,<br/>and tech stack intelligence.</div>
              <button onClick={()=>setShowAdd(true)} style={{padding:'12px 28px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>+ Add Your First Account</button>
            </div>
          ) : (
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <span style={{fontSize:20,fontWeight:800,color:S.txt}}>Your Accounts</span>
                  <span style={{fontSize:12,fontWeight:700,color:'#2563eb',background:'#dbeafe',borderRadius:999,padding:'2px 10px'}}>{data.accounts.length}</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:8,padding:2}}>
                    <button onClick={()=>{setViewMode('grid');localStorage.setItem('accounts-view-mode','grid')}} title="Grid view"
                      style={{padding:'5px 7px',borderRadius:6,border:'none',background:viewMode==='grid'?'#eff6ff':'transparent',color:viewMode==='grid'?'#2563eb':'#94a3b8',cursor:'pointer',display:'flex',alignItems:'center',transition:'all 0.15s'}}><LayoutGrid size={15}/></button>
                    <button onClick={()=>{setViewMode('list');localStorage.setItem('accounts-view-mode','list')}} title="List view"
                      style={{padding:'5px 7px',borderRadius:6,border:'none',background:viewMode==='list'?'#eff6ff':'transparent',color:viewMode==='list'?'#2563eb':'#94a3b8',cursor:'pointer',display:'flex',alignItems:'center',transition:'all 0.15s'}}><List size={15}/></button>
                  </div>
                  <button onClick={()=>setShowAdd(true)} style={{padding:'8px 16px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Add Account</button>
                </div>
              </div>
              {viewMode==='list'?(
                <div>
                  <input value={listSearch} onChange={e=>setListSearch(e.target.value)} placeholder="Search accounts..."
                    style={{width:'100%',padding:'8px 12px',marginBottom:12,border:`1px solid ${S.bdr}`,borderRadius:8,fontSize:13,color:S.txt,background:S.surf,outline:'none',boxSizing:'border-box'}}/>
                  <div style={{background:S.surf,borderRadius:12,border:`1px solid ${S.bdr}`,overflow:'hidden'}}>
                    <div style={{display:'grid',gridTemplateColumns:'44px 1fr 110px 110px 96px 56px 96px 72px 28px',alignItems:'center',padding:'0 16px',background:S.surf2,borderBottom:`1px solid ${S.bdr}`,height:38}}>
                      {[{k:'',l:''},{k:'name',l:'Account'},{k:'hq',l:'HQ'},{k:'industry',l:'Industry'},{k:'status',l:'Status'},{k:'health',l:'Health'},{k:'lastContact',l:'Last Contact'},{k:'followUps',l:'Actions'},{k:'',l:''}].map(({k,l},i)=>(
                        <div key={i} onClick={()=>{if(!k)return;if(listSortKey===k)setListSortDir(d=>d==='asc'?'desc':'asc');else{setListSortKey(k);setListSortDir('asc')}}}
                          style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.06em',cursor:k?'pointer':'default',userSelect:'none',display:'flex',alignItems:'center',gap:2,whiteSpace:'nowrap'}}>
                          {l}{k&&<span style={{color:listSortKey===k?'#2563eb':'#cbd5e1',fontSize:10}}>{listSortKey===k?(listSortDir==='asc'?'↑':'↓'):'↕'}</span>}
                        </div>
                      ))}
                    </div>
                    {(()=>{
                      const sc2={Strategic:'#7c3aed',Active:'#16a34a',Prospect:'#2563eb','At Risk':'#dc2626'}
                      const sorted=[...(data.accounts||[])].filter(a=>!listSearch||a.name.toLowerCase().includes(listSearch.toLowerCase())).sort((a,b)=>{
                        let va,vb
                        if(listSortKey==='health'){va=calcHealthScore(a);vb=calcHealthScore(b)}
                        else if(listSortKey==='lastContact'){va=a.lastContact?daysSince(a.lastContact):9999;vb=b.lastContact?daysSince(b.lastContact):9999}
                        else if(listSortKey==='followUps'){va=(a.followUps||[]).filter(f=>f.status==='Open').length;vb=(b.followUps||[]).filter(f=>f.status==='Open').length}
                        else{va=(a[listSortKey]||'').toString().toLowerCase();vb=(b[listSortKey]||'').toString().toLowerCase()}
                        const cmp=typeof va==='string'?va.localeCompare(vb):va-vb
                        return listSortDir==='asc'?cmp:-cmp
                      })
                      if(sorted.length===0)return <div style={{padding:'32px',textAlign:'center',color:S.muted,fontSize:13}}>No accounts match "{listSearch}"</div>
                      return sorted.map((acct,idx)=>{
                        const hs=calcHealthScore(acct)
                        const hc=getHealthColor(hs)
                        const lastC=acct.lastContact?daysSince(acct.lastContact):null
                        const openFUs=(acct.followUps||[]).filter(f=>f.status==='Open').length
                        const logoColor=LOGO_COLORS[(data.accounts||[]).indexOf(acct)%LOGO_COLORS.length]
                        const initial=(acct.name||'?')[0].toUpperCase()
                        return (
                          <div key={acct.id} onClick={()=>onEnterAccount(acct.id)}
                            onMouseEnter={e=>e.currentTarget.style.background=S.isLight?'#f1f5f9':'rgba(255,255,255,0.04)'}
                            onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?(S.isLight?'#ffffff':S.surf):(S.isLight?'#f8fafc':S.surf2)}
                            style={{display:'grid',gridTemplateColumns:'44px 1fr 110px 110px 96px 56px 96px 72px 28px',alignItems:'center',padding:'0 16px',height:52,cursor:'pointer',background:idx%2===0?(S.isLight?'#ffffff':S.surf):(S.isLight?'#f8fafc':S.surf2),borderBottom:idx<sorted.length-1?`1px solid ${S.bdr}`:'none',transition:'background 0.1s'}}>
                            <div>
                              {acct.logoImage&&acct.logoImage.length>10
                                ?<img src={acct.logoImage} style={{width:42,height:42,borderRadius:'50%',objectFit:'cover',border:'1px solid #e2e8f0',display:'block'}}/>
                                :<div style={{width:42,height:42,borderRadius:'50%',background:logoColor,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#fff'}}>{initial}</div>
                              }
                            </div>
                            <div style={{fontWeight:600,fontSize:13,color:S.txt,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingRight:8}}>{acct.name}</div>
                            <div style={{fontSize:12,color:S.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{acct.hq||'—'}</div>
                            <div style={{fontSize:12,color:S.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{acct.industry||'—'}</div>
                            <div><span style={{fontSize:11,fontWeight:600,color:sc2[acct.status]||'#64748b',background:(sc2[acct.status]||'#64748b')+'18',borderRadius:999,padding:'2px 8px',whiteSpace:'nowrap'}}>{acct.status||'—'}</span></div>
                            <div style={{fontWeight:700,fontSize:13,color:hc}}>{hs}</div>
                            <div style={{fontSize:12,color:lastC===null?S.muted:lastC>30?'#dc2626':lastC>14?'#ea580c':'#16a34a'}}>{lastC===null?'—':lastC>30?'30d+':lastC+'d'}</div>
                            <div style={{fontSize:12,color:openFUs>0?'#dc2626':S.muted,fontWeight:openFUs>0?700:400}}>{openFUs}</div>
                            <div style={{fontSize:16,color:S.dim,textAlign:'center'}}>›</div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>
              ):(
              <div style={{display:'grid',gridTemplateColumns:(()=>{const w=typeof window!=='undefined'?window.innerWidth:1400;if(w<360)return '1fr';if(w<900)return 'repeat(2,1fr)';if(w<1200)return 'repeat(3,1fr)';return 'repeat(4,1fr)'})(),gap:14,gridAutoRows:'1fr'}}>
                {[...(data.accounts||[])].sort((a,b)=>a.name.localeCompare(b.name)).map((acct,acctIdx)=>{
                  const openFUs=(acct.followUps||[]).filter(f=>f.status==='Open').length
                  const critFUs=(acct.followUps||[]).filter(f=>f.status==='Open'&&f.priority==='Critical').length
                  const highFUs=(acct.followUps||[]).filter(f=>f.status==='Open'&&f.priority==='High').length
                  const activePjs=(acct.projects||[]).filter(p=>p.status==='In Flight').length
                  const lastC=acct.lastContact?daysSince(acct.lastContact):null
                  const isHov=hoveredId===acct.id
                  const logoColor=LOGO_COLORS[acctIdx%LOGO_COLORS.length]
                  const initial=(acct.name||'?')[0].toUpperCase()
                  return (
                    <div key={acct.id}
                      onClick={()=>onEnterAccount(acct.id)}
                      onMouseEnter={()=>setHoveredId(acct.id)}
                      onMouseLeave={()=>setHoveredId(null)}
                      style={{
                        background:S.isLight?'#ffffff':'linear-gradient(145deg,#0f1929 0%,#111827 60%,#0a1628 100%)',
                        border:S.isLight?'1px solid #e2e8f0':`1px solid ${isHov?'rgba(59,130,246,0.4)':'rgba(59,130,246,0.15)'}`,
                        borderRadius:16,
                        boxShadow:isHov?'0 8px 24px rgba(0,0,0,0.10)':'0 2px 8px rgba(0,0,0,0.06)',
                        transform:isHov?'translateY(-2px)':'translateY(0)',
                        transition:'all 0.2s ease',cursor:'pointer',overflow:'hidden',display:'flex',flexDirection:'column',padding:0,height:'100%',minHeight:130,boxSizing:'border-box'
                      }}>
                      {/* TOP: logo + name */}
                      <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 16px 8px'}}>
                        <div style={{flexShrink:0,width:57,height:57}}>
                          {acct.logoImage&&acct.logoImage.length>10
                            ?<img src={acct.logoImage} style={{width:57,height:57,borderRadius:'50%',objectFit:'cover',border:'1px solid #e2e8f0',display:'block'}}/>
                            :<div style={{width:57,height:57,borderRadius:'50%',background:logoColor,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,color:'#fff'}}>{initial}</div>
                          }
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:17,fontWeight:800,color:S.isLight?'#0f172a':'#f1f5f9',lineHeight:1.3}}>{acct.name}</div>
                        </div>
                      </div>
                      {/* SPACER */}
                      <div style={{flex:1}}/>
                      {/* STAT ROW — pinned to bottom */}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',borderTop:`1px solid ${S.isLight?'#f1f5f9':'rgba(255,255,255,0.06)'}`,padding:'10px 16px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:4}}>
                          {(()=>{const cc=lastC===null?'#94a3b8':lastC>30?'#dc2626':lastC>14?'#ea580c':'#16a34a';return(<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={cc} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span style={{fontSize:12,color:cc}}>{lastC===null?'—':lastC>30?'30d+':lastC+'d'}</span></>)})()}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:4}}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(22,163,74,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                          <span style={{fontSize:12,color:'#64748b'}}>{activePjs}</span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:4}}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={critFUs>0?'#fc413d':'#1c1c1e'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                          <span style={{fontSize:12,color:critFUs>0?'#fc413d':'#64748b'}}>{openFUs}</span>
                        </div>
                      </div>
                      {/* ALERT STRIP */}
                      {critFUs>0&&<div style={{padding:'4px 16px',background:S.isLight?'#fef2f2':'rgba(220,38,38,0.12)',borderTop:`1px solid ${S.isLight?'#fecaca':'rgba(220,38,38,0.2)'}`,display:'flex',alignItems:'center',gap:6}}>
                        <span style={{color:'#dc2626',fontSize:11}}>⚠</span>
                        <span style={{fontSize:11,color:'#dc2626',fontWeight:600}}>{critFUs} critical item{critFUs!==1?'s':''}</span>
                      </div>}
                      {!critFUs&&highFUs>0&&<div style={{height:3,background:'linear-gradient(90deg,#c2410c,#f97316)'}}/>}
                    </div>
                  )
                })}
                <div onClick={()=>setShowAdd(true)}
                  onMouseEnter={e=>{e.currentTarget.style.background=S.isLight?'#f0f9ff':'rgba(255,255,255,0.02)';e.currentTarget.style.borderColor=S.isLight?'#93c5fd':'rgba(255,255,255,0.12)'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor=S.isLight?'#cbd5e1':'rgba(255,255,255,0.08)'}}
                  style={{background:'transparent',border:`2px dashed ${S.isLight?'#cbd5e1':'rgba(255,255,255,0.08)'}`,borderRadius:16,padding:16,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,height:'100%',boxSizing:'border-box',transition:'all 0.2s'}}>
                  <div style={{width:48,height:48,borderRadius:'50%',background:S.isLight?'#f1f5f9':'rgba(255,255,255,0.04)',border:`1px solid ${S.isLight?'#e2e8f0':'rgba(255,255,255,0.1)'}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <span style={{fontSize:22,color:'#94a3b8',lineHeight:1}}>+</span>
                  </div>
                  <div style={{fontSize:13,fontWeight:600,color:'#64748b'}}>Add Account</div>
                </div>
              </div>
              )}
            </div>
          )
        ) : (
          // === DASHBOARD ===
          data.accounts.length===0 ? (
            <div style={{textAlign:'center',padding:'70px 20px'}}>
              <div style={{fontSize:22,fontWeight:700,color:S.txt,marginBottom:10}}>Welcome to Ledgr.</div>
              <div style={{fontSize:14,color:S.muted,marginBottom:30,lineHeight:1.7}}>Add your first account to start tracking contacts, projects,<br/>and tech stack intelligence.</div>
              <button onClick={()=>setShowAdd(true)} style={{padding:'12px 28px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>+ Add Your First Account</button>
            </div>
          ) : (
            <div>
              {/* CHART ROW */}
              <div style={{display:'flex',gap:16,marginBottom:20,alignItems:'stretch',flexWrap:'wrap'}}>
                <BarChartCard data={data}/>
                <PerformanceGaugeCard data={data} setData={setData} onGoAllProjects={onGoAllProjects}/>
              </div>
              {/* INSIGHT CARDS */}
              <div style={{display:'grid',gridTemplateColumns:mob?'repeat(2,1fr)':'repeat(5,1fr)',gap:12}}>
                <div onClick={()=>setShowAccounts(true)} style={{background:'#fff',borderRadius:12,border:'1px solid #e2e8f0',borderLeft:'3px solid #2563eb',padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)',cursor:'pointer'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Relationship Health</div>
                  <div style={{fontSize:28,fontWeight:800,color:'#0f172a',lineHeight:1,marginBottom:6}}>{data.accounts.length}</div>
                  <div style={{height:4,borderRadius:2,overflow:'hidden',background:'#f1f5f9',marginBottom:6,display:'flex'}}>
                    {data.accounts.length>0&&<div style={{flex:healthyCount,background:'#0ebc5f',height:'100%'}}/>}
                    {data.accounts.length>0&&<div style={{flex:atRiskCount,background:'#f59e0b',height:'100%'}}/>}
                    {data.accounts.length>0&&<div style={{flex:criticalHSCount,background:'#dc2626',height:'100%'}}/>}
                  </div>
                  <div style={{fontSize:12,color:'#64748b',lineHeight:1.5}}><span style={{color:'#0ebc5f',fontWeight:600}}>{healthyCount} Healthy</span> · <span style={{color:'#f59e0b',fontWeight:600}}>{atRiskCount} At Risk</span> · <span style={{color:'#dc2626',fontWeight:600}}>{criticalHSCount} Critical</span></div>
                  <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>accounts total</div>
                </div>
                <div onClick={()=>setTodayModal(true)} style={{background:'#fff',borderRadius:12,border:'1px solid #e2e8f0',borderLeft:'3px solid #dc2626',padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)',cursor:'pointer'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Overdue Actions</div>
                  <div style={{fontSize:28,fontWeight:800,color:'#0f172a',lineHeight:1,marginBottom:6}}>{allOverdueFUs.length}</div>
                  <div style={{fontSize:12,color:'#64748b'}}><span style={{color:'#dc2626',fontWeight:600}}>{overdueCritFUs} Critical</span> · <span style={{color:'#ea580c',fontWeight:600}}>{overdueHighFUs} High</span></div>
                  <div style={{fontSize:11,color:oldestOverdueDays>0?'#dc2626':'#94a3b8',marginTop:4}}>{oldestOverdueDays>0?`Oldest: ${oldestOverdueDays} days ago`:'No overdue items'}</div>
                </div>
                <div onClick={()=>statDefs[2]&&setStatModal({...statDefs[2],items:statDefs[2].buildData()})} style={{background:'#fff',borderRadius:12,border:'1px solid #e2e8f0',borderLeft:'3px solid #ea580c',padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)',cursor:'pointer'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Renewal Radar</div>
                  <div style={{fontSize:28,fontWeight:800,color:'#0f172a',lineHeight:1,marginBottom:6}}>{renewals90}</div>
                  <div style={{fontSize:12,color:'#64748b'}}>{renewalValue>0?formatCompactCurrency(renewalValue)+' at risk':'renewals within 90d'}</div>
                  <div style={{fontSize:11,color:'#94a3b8',marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{nextRenewal?`Next: ${(nextRenewal.vendor||nextRenewal.acctName)||'—'} in ${nextRenewal.daysLeft}d`:'No upcoming renewals'}</div>
                </div>
                <div onClick={()=>onGoAllProjects&&onGoAllProjects()} style={{background:'#fff',borderRadius:12,border:'1px solid #e2e8f0',borderLeft:'3px solid #f59e0b',padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)',cursor:'pointer'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Stalled Projects</div>
                  <div style={{fontSize:28,fontWeight:800,color:'#0f172a',lineHeight:1,marginBottom:6}}>{stalledProjects.length}</div>
                  <div style={{fontSize:12,color:stalledProjects.length>0?'#f59e0b':'#64748b'}}>{stalledProjects.length>0?`Avg ${avgStalledDays} days stalled`:'No stalled projects'}</div>
                  <div style={{fontSize:11,color:'#94a3b8',marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{stalledProjects.slice(0,2).map(p=>p.acctName||p.name).join(', ')||'—'}</div>
                </div>
                <div onClick={()=>onGoWhitespace&&onGoWhitespace()} style={{background:'#fff',borderRadius:12,border:'1px solid #e2e8f0',borderLeft:'3px solid #7c3aed',padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)',cursor:'pointer'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Whitespace Intel</div>
                  <div style={{fontSize:28,fontWeight:800,color:'#0f172a',lineHeight:1,marginBottom:6}}>{wsTotal}</div>
                  <div style={{fontSize:12,color:'#64748b'}}>{wsAccts.length} accounts tracked</div>
                  <div style={{fontSize:11,color:wsNew>0?'#7c3aed':'#94a3b8',marginTop:2}}>{wsNew>0?`${wsNew} new this month`:'No new entries'}</div>
                  {wsStatusTotal>0&&<div style={{height:4,borderRadius:2,overflow:'hidden',background:'#f1f5f9',marginTop:6,display:'flex'}}>{WS_STATUSES.map((st,i)=>wsStatusCounts[i]>0?<div key={st} style={{flex:wsStatusCounts[i],background:wsStatusColors[i],height:'100%'}}/>:null)}</div>}
                </div>
              </div>

              {/* DAILY BRIEF PREVIEW CARD */}
              {(()=>{
                const today=new Date().toISOString().split('T')[0]
                const todayBrief=(data.dailyBriefs||[]).find(b=>b.date===today)
                const firstAction=todayBrief?.sections?.actToday?.[0]||null
                const estHour=new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'})).getHours()
                const estMin=new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'})).getMinutes()
                const before745=estHour<7||(estHour===7&&estMin<45)
                return(
                  <div style={{background:'#fff',borderRadius:12,border:'1px solid #e2e8f0',padding:'16px 20px',marginTop:20,marginBottom:12,boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <Sparkles size={16} color='#2563eb'/>
                        <span style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>Today's Brief</span>
                      </div>
                      <button onClick={()=>{clearBriefPages();setShowDailyBriefPage(true)}} style={{background:'transparent',border:'none',color:'#2563eb',fontSize:12,fontWeight:600,cursor:'pointer',padding:0}}>View Full Brief →</button>
                    </div>
                    {briefGenerating&&!todayBrief&&(
                      <div style={{display:'flex',alignItems:'center',gap:8,color:'#64748b',fontSize:13}}>
                        <div style={{width:14,height:14,border:'2px solid #e2e8f0',borderTopColor:'#2563eb',borderRadius:'50%',animation:'spin 0.8s linear infinite',flexShrink:0}}/>
                        Generating your morning brief...
                      </div>
                    )}
                    {!briefGenerating&&!todayBrief&&before745&&(
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                        <span style={{fontSize:13,color:'#94a3b8'}}>Your brief will be ready at 7:45 AM EST</span>
                        <button onClick={()=>onGenerateBrief&&onGenerateBrief()} style={{fontSize:12,fontWeight:600,background:'#eff6ff',color:'#2563eb',border:'1px solid #bfdbfe',borderRadius:7,padding:'5px 12px',cursor:'pointer'}}>Generate Now</button>
                      </div>
                    )}
                    {!briefGenerating&&!todayBrief&&!before745&&(
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                        <span style={{fontSize:13,color:'#94a3b8'}}>No brief yet today</span>
                        <button onClick={()=>onGenerateBrief&&onGenerateBrief()} style={{fontSize:12,fontWeight:600,background:'#eff6ff',color:'#2563eb',border:'1px solid #bfdbfe',borderRadius:7,padding:'5px 12px',cursor:'pointer'}}>Generate Now</button>
                      </div>
                    )}
                    {briefError&&!todayBrief&&(
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                        <span style={{fontSize:13,color:'#dc2626'}}>{briefError}</span>
                        <button onClick={()=>onGenerateBrief&&onGenerateBrief()} style={{fontSize:12,fontWeight:600,background:'#fee2e2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:7,padding:'5px 12px',cursor:'pointer'}}>Retry</button>
                      </div>
                    )}
                    {todayBrief&&(
                      <div>
                        {todayBrief.briefSummary&&<div style={{fontSize:13,color:'#475569',lineHeight:1.6,marginBottom:firstAction?10:0}}>{todayBrief.briefSummary}</div>}
                        {firstAction&&(
                          <div style={{background:'#fef2f2',borderLeft:'3px solid #dc2626',borderRadius:8,padding:'10px 14px',marginTop:8}}>
                            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                              <span style={{fontSize:12,fontWeight:700,color:'#dc2626'}}>🎯 Top Priority</span>
                              <span style={{fontSize:12,fontWeight:600,color:'#0f172a'}}>{firstAction.account}</span>
                            </div>
                            <div style={{fontSize:13,color:'#1e293b',fontWeight:500,lineHeight:1.4}}>{firstAction.action}</div>
                            {firstAction.clientFirstAngle&&<div style={{fontSize:12,color:'#64748b',fontStyle:'italic',marginTop:4,lineHeight:1.4}}>{firstAction.clientFirstAngle}</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* END OF DAY JOURNAL CARD — show after 4pm if journal incomplete */}
              {(()=>{
                const today=new Date().toISOString().split('T')[0]
                const nowHour=new Date().getHours()
                const afterFourPm=nowHour>=16&&new Date().getDay()>=1&&new Date().getDay()<=5
                const todayJournal=(data.dailyJournals||[]).find(j=>j.date===today)
                if(!afterFourPm)return null
                return(
                  <div style={{background:'#fff',borderRadius:12,border:'1px solid #e2e8f0',padding:'14px 18px',marginBottom:16,boxShadow:'0 1px 4px rgba(0,0,0,0.04)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <BookOpen size={16} color={todayJournal?.status==='complete'?'#22c55e':'#f59e0b'}/>
                      <div>
                        <div style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>Journal</div>
                        {todayJournal?.status==='complete'
                          ?<div style={{fontSize:12,color:'#22c55e',fontWeight:500}}>Completed today</div>
                          :todayJournal
                            ?<div style={{fontSize:12,color:'#64748b'}}>Draft in progress — finish closing out your day</div>
                            :<div style={{fontSize:12,color:'#64748b'}}>Ready to wrap up today and set up tomorrow?</div>
                        }
                      </div>
                    </div>
                    {todayJournal?.status!=='complete'&&(
                      <button onClick={()=>onGoEndOfDay&&onGoEndOfDay()} style={{fontSize:12,fontWeight:600,background:'#eff6ff',color:'#2563eb',border:'1px solid #bfdbfe',borderRadius:7,padding:'5px 14px',cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}}>
                        {todayJournal?'Continue →':'Start →'}
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>
          )
        )}
      </div>

      {/* Intel Inbox modal */}
      {intelInboxOpen&&(
        <IntelInbox
          data={data}
          setData={setData}
          apiKey={data.apiKey}
          onClose={()=>setIntelInboxOpen(false)}
        />
      )}

      {/* Today's Tasks modal */}
      {todayModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:mob?0:20}} onClick={()=>{setTodayModal(false);closeDetail()}}>
          <div style={{background:'#FFFFFF',borderRadius:mob?0:16,boxShadow:'0 8px 40px rgba(0,0,0,0.12)',maxWidth:mob?'100%':680,width:'90vw',maxHeight:mob?'100%':'80vh',overflow:'hidden',display:'flex',flexDirection:'column',height:mob?'100%':'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'24px 28px 20px',borderBottom:'1px solid #F3F4F6',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center'}}>
                <span style={{fontSize:16,fontWeight:600,color:'#111827'}}>Today's Tasks</span>
                <span style={{fontSize:12,fontWeight:500,color:'#6B7280',background:'#F3F4F6',borderRadius:20,padding:'2px 10px',marginLeft:10}}>{todayTasksCount}</span>
              </div>
              <button onClick={()=>{setTodayModal(false);closeDetail()}}
                style={{width:32,height:32,borderRadius:8,background:'#F9FAFB',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#6B7280',flexShrink:0}}
                onMouseEnter={e=>e.currentTarget.style.background='#F3F4F6'} onMouseLeave={e=>e.currentTarget.style.background='#F9FAFB'}>
                <X size={16}/>
              </button>
            </div>
            <div style={{flex:1,overflowY:'auto'}} onClick={()=>taskSnoozeOpen&&setTaskSnoozeOpen(false)}>
              {selectedTask&&taskForm ? (
                /* ── Detail panel ── */
                <div style={{padding:'16px 20px'}}>
                  <button onClick={closeDetail} style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:12,color:S.muted,background:'transparent',border:'none',cursor:'pointer',padding:'0 0 14px',fontWeight:600}}>← Back to list</button>
                  {/* Task */}
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Task</div>
                    <textarea value={taskForm.task||''} onChange={e=>updateTaskField('task',e.target.value)} rows={2} style={{width:'100%',fontSize:13,padding:'7px 9px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit',lineHeight:1.5}}/>
                  </div>
                  {/* Priority + Due Date */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                    <div>
                      <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Priority</div>
                      <select value={taskForm.priority||'High'} onChange={e=>updateTaskField('priority',e.target.value)} style={{width:'100%',fontSize:12,padding:'6px 8px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt}}>
                        {['Critical','High','Medium','Low'].map(o=><option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Due Date</div>
                      <input type='date' value={taskForm.dueDate||''} onChange={e=>updateTaskField('dueDate',e.target.value)} style={{width:'100%',fontSize:12,padding:'6px 8px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,boxSizing:'border-box'}}/>
                    </div>
                  </div>
                  {/* Contact */}
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Contact</div>
                    <input value={taskForm.contact||''} onChange={e=>updateTaskField('contact',e.target.value)} placeholder='Contact name...' style={{width:'100%',fontSize:12,padding:'6px 9px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,boxSizing:'border-box'}}/>
                  </div>
                  {/* Context/Notes */}
                  <div style={{marginBottom:18}}>
                    <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Context / Notes</div>
                    <textarea value={taskForm.context||''} onChange={e=>updateTaskField('context',e.target.value)} rows={3} placeholder='Context or notes...' style={{width:'100%',fontSize:12,padding:'6px 9px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit',lineHeight:1.5}}/>
                  </div>
                  {/* Action buttons */}
                  <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:20,flexWrap:'wrap'}}>
                    <button onClick={()=>{markTaskDone(selectedTask.accountId,taskForm.id);closeDetail()}} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'9px 18px',background:S.green,border:'none',borderRadius:7,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>✓ Mark Complete</button>
                    <div style={{position:'relative'}}>
                      <button onClick={e=>{e.stopPropagation();setTaskSnoozeOpen(v=>!v)}} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'9px 14px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:7,color:S.muted,fontSize:13,fontWeight:500,cursor:'pointer'}}>
                        <Clock size={14}/> Snooze
                      </button>
                      {taskSnoozeOpen&&(
                        <div onClick={e=>e.stopPropagation()} style={{position:'absolute',top:'calc(100% + 4px)',left:0,zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,boxShadow:'0 4px 20px rgba(0,0,0,0.5)',minWidth:210,overflow:'hidden'}}>
                          {[{label:'Later Today',sub:'5:00 PM today',opt:'later'},{label:'Tomorrow',sub:'8:00 AM',opt:'tomorrow'},{label:'In 3 Days',sub:'8:00 AM',opt:'3days'},{label:'Next Week',sub:'Monday 7:00 AM',opt:'nextweek'}].map(o=>(
                            <button key={o.opt} onClick={()=>snoozeTaskDetail(o.opt)}
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
                  </div>
                  <button onClick={()=>{setTodayModal(false);onNavigateTo(selectedTask.accountId,'followups')}} style={{fontSize:11,color:S.muted,background:'transparent',border:'none',cursor:'pointer',padding:0,textDecoration:'underline'}}>View in account →</button>
                </div>
              ) : todayGrouped.length===0 ? (
                /* ── Empty state ── */
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:48,gap:12}}>
                  <div style={{width:48,height:48,borderRadius:'50%',background:'#F3F4F6',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <span style={{fontSize:14,color:'#9CA3AF'}}>No items</span>
                </div>
              ) : (
                /* ── Task list ── */
                todayGrouped.map(g=>{
                  return (
                    <div key={g.account.id}>
                      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 28px 6px',background:'#FAFAFA'}}>
                        <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>{g.account.name}</span>
                        <span style={{fontSize:10,color:'#9CA3AF',marginLeft:'auto'}}>{g.tasks.length} task{g.tasks.length!==1?'s':''}</span>
                      </div>
                      {g.tasks.map(fu=>{
                        const p=PC[fu.priority]||PC.Low
                        const isOverdue=fu.dueDate<lpTodayStr
                        const daysOver=isOverdue?Math.round((new Date()-new Date(fu.dueDate+'T12:00:00'))/86400000):0
                        const isEditingThis = todayEditRow?.fuId===fu.id
                        const priorityBg = fu.priority==='Critical'?'#FEE2E2':fu.priority==='High'?'#FEF3C7':'#F3F4F6'
                        const priorityColor = fu.priority==='Critical'?'#DC2626':fu.priority==='High'?'#D97706':'#6B7280'
                        return (
                          <div key={fu.id}>
                            <div className="mob-modal-row" style={{display:'flex',alignItems:'center',gap:0,minHeight:64,padding:'12px 28px',borderBottom:'1px solid #F9FAFB',transition:'background 0.1s'}}
                              onMouseEnter={e=>{if(!isEditingThis)e.currentTarget.style.background='#FAFAFA'}}
                              onMouseLeave={e=>{if(!isEditingThis)e.currentTarget.style.background='transparent'}}>
                              <button onClick={()=>markTaskDone(g.account.id,fu.id)} title='Mark complete'
                                style={{width:16,height:16,borderRadius:4,border:'1.5px solid #D1D5DB',background:'#FFFFFF',flexShrink:0,marginRight:16,cursor:'pointer'}}/>
                              <span style={{width:48,minWidth:48,background:'#F0F7FF',color:'#007AFF',fontSize:11,fontWeight:600,textTransform:'uppercase',borderRadius:6,padding:'4px 0',textAlign:'center',marginRight:16,flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{(g.account.short||g.account.name||'').slice(0,6)}</span>
                              <div style={{flex:1,minWidth:0,marginRight:12}}>
                                <div style={{fontSize:14,fontWeight:500,color:'#111827',lineHeight:1.3}}>{fu.task}</div>
                                <div style={{fontSize:12,color:'#9CA3AF',marginTop:2}}>{fu.contact&&<span>{fu.contact}{isOverdue||true?' · ':''}</span>}{isOverdue?<span style={{color:'#DC2626'}}>{daysOver}d overdue</span>:<span>Due today</span>}</div>
                              </div>
                              <div className="mob-modal-actions" style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                                {todayEditFlash===fu.id&&<span style={{fontSize:11,color:'#10B981',fontWeight:700}}>Saved!</span>}
                                <span style={{background:'#F0F7FF',color:'#007AFF',fontSize:11,fontWeight:500,borderRadius:20,padding:'3px 10px',whiteSpace:'nowrap'}}>{isOverdue?`${daysOver}d overdue`:'Today'}</span>
                                <span style={{background:priorityBg,color:priorityColor,fontSize:11,fontWeight:500,borderRadius:20,padding:'3px 10px',whiteSpace:'nowrap'}}>{fu.priority}</span>
                                <button onClick={()=>openTaskDetail(g.account.id,fu)}
                                  style={{background:'#FFFFFF',border:'1px solid #EEEFF2',color:'#374151',fontSize:12,borderRadius:6,padding:'4px 12px',cursor:'pointer',whiteSpace:'nowrap'}}
                                  onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'} onMouseLeave={e=>e.currentTarget.style.background='#FFFFFF'}>View</button>
                                <button onClick={e=>{e.stopPropagation();openTodayEdit(g.account.id,fu)}} title='Edit'
                                  style={{background:'transparent',border:'none',color:'#D1D5DB',cursor:'pointer',padding:'2px',display:'flex',alignItems:'center',flexShrink:0}}
                                  onMouseEnter={e=>e.currentTarget.style.color='#007AFF'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}><Pencil size={14}/></button>
                                <button onClick={()=>{sendToAppleReminders(fu,g.account.name);setRemindersToast(true);setTimeout(()=>setRemindersToast(false),2000)}}
                                  title='Send to Apple Reminders'
                                  style={{background:'transparent',border:'none',color:'#D1D5DB',cursor:'pointer',padding:'2px',display:'flex',alignItems:'center',flexShrink:0}}
                                  onMouseEnter={e=>e.currentTarget.style.color='#007AFF'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}><Share2 size={14}/></button>
                                <button onClick={e=>{e.stopPropagation();toggleTaskContext(fu.id,fu.task,fu.dueDate,fu.contact,g.account)}}
                                  title='AI context'
                                  style={{background:'transparent',border:'none',color:'#D1D5DB',cursor:'pointer',padding:'2px',display:'flex',alignItems:'center',flexShrink:0,transition:'color 0.15s'}}
                                  onMouseEnter={e=>e.currentTarget.style.color='#6B7280'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>
                                  <ChevronRight size={16} style={{transform:expandedContextIds.has(fu.id)?'rotate(90deg)':'rotate(0deg)',transition:'transform 0.15s'}}/>
                                </button>
                              </div>
                            </div>
                            {isEditingThis&&todayEditRow&&(
                              <div style={{margin:'0 20px 8px 43px',background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:8,padding:12}}>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                                  <div style={{gridColumn:'span 2'}}>
                                    <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',marginBottom:3}}>Task</div>
                                    <textarea value={todayEditRow.form.task||''} onChange={e=>setTodayEditRow(r=>({...r,form:{...r.form,task:e.target.value}}))} rows={2} style={{width:'100%',fontSize:12,padding:'5px 8px',background:'#fff',border:'1px solid #bfdbfe',borderRadius:5,color:S.txt,resize:'none',boxSizing:'border-box',fontFamily:'inherit',lineHeight:1.4}}/>
                                  </div>
                                  <div>
                                    <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',marginBottom:3}}>Priority</div>
                                    <select value={todayEditRow.form.priority||'High'} onChange={e=>setTodayEditRow(r=>({...r,form:{...r.form,priority:e.target.value}}))} style={{width:'100%',fontSize:12,padding:'5px 6px',background:'#fff',border:'1px solid #bfdbfe',borderRadius:5,color:S.txt}}>
                                      {['Critical','High','Medium','Low'].map(o=><option key={o}>{o}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',marginBottom:3}}>Due Date</div>
                                    <input type='date' value={todayEditRow.form.dueDate||''} onChange={e=>setTodayEditRow(r=>({...r,form:{...r.form,dueDate:e.target.value}}))} style={{width:'100%',fontSize:12,padding:'5px 6px',background:'#fff',border:'1px solid #bfdbfe',borderRadius:5,color:S.txt,boxSizing:'border-box'}}/>
                                  </div>
                                  <div style={{gridColumn:'span 2'}}>
                                    <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',marginBottom:3}}>Contact</div>
                                    <input value={todayEditRow.form.contact||''} onChange={e=>setTodayEditRow(r=>({...r,form:{...r.form,contact:e.target.value}}))} placeholder='Contact name...' style={{width:'100%',fontSize:12,padding:'5px 8px',background:'#fff',border:'1px solid #bfdbfe',borderRadius:5,color:S.txt,boxSizing:'border-box'}}/>
                                  </div>
                                </div>
                                <div style={{display:'flex',gap:6}}>
                                  <button onClick={saveTodayEdit} style={{padding:'5px 14px',background:'#2563eb',border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save Changes</button>
                                  <button onClick={()=>setTodayEditRow(null)} style={{padding:'5px 10px',background:'transparent',border:'1px solid #bfdbfe',borderRadius:5,color:S.muted,fontSize:12,cursor:'pointer'}}>Cancel</button>
                                </div>
                              </div>
                            )}
                            {expandedContextIds.has(fu.id)&&(
                              <div style={{background:'#F9FAFB',borderTop:'1px solid #F3F4F6',padding:'10px 28px 14px 28px'}}>
                                {taskContextLoading===fu.id?(
                                  <div style={{display:'flex',gap:5,alignItems:'center',padding:'4px 0'}}>
                                    {[0,1,2].map(i=><span key={i} style={{width:5,height:5,borderRadius:'50%',background:'#9CA3AF',display:'inline-block',animation:`tcDot 1.2s ${i*0.3}s ease-in-out infinite`}}/>)}
                                  </div>
                                ):taskContexts[fu.id]?(
                                  <div>
                                    <p style={{fontSize:13,color:'#374151',lineHeight:1.6,fontStyle:'italic',margin:'0 0 6px 0'}}>{taskContexts[fu.id].text}</p>
                                    <div style={{fontSize:11,color:'#9CA3AF',textAlign:'right'}}>Generated just now</div>
                                  </div>
                                ):null}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>
            {!selectedTask&&todayGrouped.length>0&&(
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 28px',borderTop:'1px solid #F3F4F6',flexShrink:0,background:'#FFFFFF'}}>
                <span style={{fontSize:12,color:'#9CA3AF'}}>{todayTasksCount} task{todayTasksCount!==1?'s':''} across {todayGrouped.length} account{todayGrouped.length!==1?'s':''}</span>
                <button onClick={markAllTodayDone} style={{fontSize:12,color:'#059669',background:'#D1FAE5',border:'none',borderRadius:8,padding:'7px 16px',cursor:'pointer',fontWeight:600}}
                  onMouseEnter={e=>e.currentTarget.style.background='#A7F3D0'} onMouseLeave={e=>e.currentTarget.style.background='#D1FAE5'}>Mark All Complete</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add account modal */}
      {showAdd&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:mob?'stretch':'center',justifyContent:'center',zIndex:1000,padding:mob?0:16}}>
          <div style={{background:S.surf,border:mob?'none':`1px solid ${S.bdr}`,borderRadius:mob?0:12,padding:mob?20:26,width:'100%',maxWidth:mob?'100%':400,boxShadow:mob?'none':'0 20px 60px rgba(0,0,0,0.4)'}}>
            <div style={{fontSize:15,fontWeight:700,color:S.txt,marginBottom:14}}>Add New Account</div>
            <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addAccount()} placeholder='Account name...' autoFocus
              style={{width:'100%',fontSize:14,padding:'10px 12px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:8,color:S.txt,boxSizing:'border-box',marginBottom:14,outline:'none'}}/>
            <div style={{display:'flex',gap:8}}>
              <button onClick={addAccount} style={{flex:1,padding:'12px 16px',background:GP_BLUE,border:'none',borderRadius:7,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',minHeight:44}}>Add Account</button>
              <button onClick={()=>{setShowAdd(false);setNewName('')}} style={{padding:'12px 14px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:7,color:S.muted,fontSize:13,cursor:'pointer',minHeight:44}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Stat detail modal */}
      {statModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:mob?0:20}}
          onClick={()=>{setStatModal(null);setEditingItem(null)}}>
          <div style={{background:'#FFFFFF',borderRadius:mob?0:16,boxShadow:'0 8px 40px rgba(0,0,0,0.12)',maxWidth:mob?'100%':680,width:'90vw',maxHeight:mob?'100%':'80vh',overflow:'hidden',display:'flex',flexDirection:'column',height:mob?'100%':'auto'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'24px 28px 20px',borderBottom:'1px solid #F3F4F6',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center'}}>
                <span style={{fontSize:16,fontWeight:600,color:'#111827'}}>{statModal.label}</span>
                <span style={{fontSize:12,fontWeight:500,color:'#6B7280',background:'#F3F4F6',borderRadius:20,padding:'2px 10px',marginLeft:10}}>{statModal.items.length}</span>
              </div>
              <button onClick={()=>{setStatModal(null);setEditingItem(null)}}
                style={{width:32,height:32,borderRadius:8,background:'#F9FAFB',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#6B7280',flexShrink:0}}
                onMouseEnter={e=>e.currentTarget.style.background='#F3F4F6'} onMouseLeave={e=>e.currentTarget.style.background='#F9FAFB'}>
                <X size={16}/>
              </button>
            </div>
            <div style={{overflowY:'auto',flex:1,padding:'8px 0'}}>
              {statModal.items.length===0&&(
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:48,gap:12}}>
                  <div style={{width:48,height:48,borderRadius:'50%',background:'#F3F4F6',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </div>
                  <span style={{fontSize:14,color:'#9CA3AF'}}>No items</span>
                </div>
              )}
              {(statModal.type==='followups'||statModal.type==='critical')&&statModal.items.map((item,i)=>{
                const p=PC[item.priority]||PC.Low
                const d=item.dueDate?daysUntil(item.dueDate):null
                const urgLabel=d!==null?(d<0?`${Math.abs(d)}d overdue`:d===0?'Today':d===1?'Tomorrow':`In ${d}d`):null
                const isEditingThis = editingItem?.itemId===item.id
                const ef = isEditingThis ? editingItem.form : null
                const priorityBg = item.priority==='Critical'?'#FEE2E2':item.priority==='High'?'#FEF3C7':'#F3F4F6'
                const priorityColor = item.priority==='Critical'?'#DC2626':item.priority==='High'?'#D97706':'#6B7280'
                return (
                  <div key={item.id||i}>
                    <div className="mob-modal-row" style={{display:'flex',alignItems:'center',minHeight:64,padding:'12px 28px',borderBottom:'1px solid #F9FAFB',transition:'background 0.1s'}}
                      onMouseEnter={e=>{if(!isEditingThis)e.currentTarget.style.background='#FAFAFA'}}
                      onMouseLeave={e=>{if(!isEditingThis)e.currentTarget.style.background='transparent'}}>
                      <button onClick={()=>completeFUInModal(item.accountId,item.id)} title='Mark complete'
                        style={{width:16,height:16,borderRadius:4,border:'1.5px solid #D1D5DB',background:'#FFFFFF',flexShrink:0,marginRight:16,cursor:'pointer'}}/>
                      <span style={{width:48,minWidth:48,background:'#F0F7FF',color:'#007AFF',fontSize:11,fontWeight:600,textTransform:'uppercase',borderRadius:6,padding:'4px 0',textAlign:'center',marginRight:16,flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{(item.accountName||'').slice(0,6)}</span>
                      <div style={{flex:1,minWidth:0,marginRight:12}}>
                        <div style={{fontSize:14,fontWeight:500,color:'#111827',lineHeight:1.3}}>{item.task}</div>
                        <div style={{fontSize:12,color:'#9CA3AF',marginTop:2}}>{item.contact&&<span>{item.contact}{d!==null?' · ':''}</span>}{d!==null&&<span style={{color:d<0?'#DC2626':'#9CA3AF'}}>{d<0?`Overdue ${Math.abs(d)}d`:fmtDate(item.dueDate)}</span>}</div>
                      </div>
                      <div className="mob-modal-actions" style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                        {saveFlash===item.id&&<span style={{fontSize:11,color:'#10B981',fontWeight:700}}>Saved!</span>}
                        {urgLabel&&<span style={{background:'#F0F7FF',color:'#007AFF',fontSize:11,fontWeight:500,borderRadius:20,padding:'3px 10px',whiteSpace:'nowrap'}}>{urgLabel}</span>}
                        <span style={{background:priorityBg,color:priorityColor,fontSize:11,fontWeight:500,borderRadius:20,padding:'3px 10px',whiteSpace:'nowrap'}}>{item.priority}</span>
                        <button onClick={()=>{onNavigateTo(item.accountId,statModal.tab);setStatModal(null)}}
                          style={{background:'#FFFFFF',border:'1px solid #EEEFF2',color:'#374151',fontSize:12,borderRadius:6,padding:'4px 12px',cursor:'pointer',whiteSpace:'nowrap'}}
                          onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'} onMouseLeave={e=>e.currentTarget.style.background='#FFFFFF'}>View</button>
                        <button onClick={()=>openEditItem('followup',item.accountId,item)} title='Edit'
                          style={{background:'transparent',border:'none',color:'#D1D5DB',cursor:'pointer',padding:'2px',display:'flex',alignItems:'center',flexShrink:0}}
                          onMouseEnter={e=>e.currentTarget.style.color='#007AFF'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}><Pencil size={14}/></button>
                        <button onClick={e=>{e.stopPropagation();const acct=data.accounts.find(a=>a.id===item.accountId)||{name:item.accountName||'',intelLog:[],projects:[],followUps:[]};toggleTaskContext(item.id,item.task,item.dueDate,item.contact,acct)}}
                          title='AI context'
                          style={{background:'transparent',border:'none',color:'#D1D5DB',cursor:'pointer',padding:'2px',display:'flex',alignItems:'center',flexShrink:0,transition:'color 0.15s'}}
                          onMouseEnter={e=>e.currentTarget.style.color='#6B7280'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>
                          <ChevronRight size={16} style={{transform:expandedContextIds.has(item.id)?'rotate(90deg)':'rotate(0deg)',transition:'transform 0.15s'}}/>
                        </button>
                      </div>
                    </div>
                    {isEditingThis&&ef&&(
                      <div style={{margin:'0 16px 8px 47px',background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:8,padding:12}}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                          <div style={{gridColumn:'span 2'}}>
                            <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',marginBottom:3}}>Task</div>
                            <textarea value={ef.task||''} onChange={e=>setEditingItem(ei=>({...ei,form:{...ei.form,task:e.target.value}}))} rows={2} style={{width:'100%',fontSize:12,padding:'5px 8px',background:'#fff',border:'1px solid #bfdbfe',borderRadius:5,color:S.txt,resize:'none',boxSizing:'border-box',fontFamily:'inherit',lineHeight:1.4}}/>
                          </div>
                          <div>
                            <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',marginBottom:3}}>Priority</div>
                            <select value={ef.priority||'High'} onChange={e=>setEditingItem(ei=>({...ei,form:{...ei.form,priority:e.target.value}}))} style={{width:'100%',fontSize:12,padding:'5px 6px',background:'#fff',border:'1px solid #bfdbfe',borderRadius:5,color:S.txt}}>
                              {['Critical','High','Medium','Low'].map(o=><option key={o}>{o}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',marginBottom:3}}>Due Date</div>
                            <input type='date' value={ef.dueDate||''} onChange={e=>setEditingItem(ei=>({...ei,form:{...ei.form,dueDate:e.target.value}}))} style={{width:'100%',fontSize:12,padding:'5px 6px',background:'#fff',border:'1px solid #bfdbfe',borderRadius:5,color:S.txt,boxSizing:'border-box'}}/>
                          </div>
                          <div style={{gridColumn:'span 2'}}>
                            <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',marginBottom:3}}>Contact</div>
                            <input value={ef.contact||''} onChange={e=>setEditingItem(ei=>({...ei,form:{...ei.form,contact:e.target.value}}))} placeholder='Contact name...' style={{width:'100%',fontSize:12,padding:'5px 8px',background:'#fff',border:'1px solid #bfdbfe',borderRadius:5,color:S.txt,boxSizing:'border-box'}}/>
                          </div>
                        </div>
                        <div style={{display:'flex',gap:6}}>
                          <button onClick={saveEditItem} style={{padding:'5px 14px',background:'#2563eb',border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save Changes</button>
                          <button onClick={()=>setEditingItem(null)} style={{padding:'5px 10px',background:'transparent',border:'1px solid #bfdbfe',borderRadius:5,color:S.muted,fontSize:12,cursor:'pointer'}}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {expandedContextIds.has(item.id)&&(
                      <div style={{background:'#F9FAFB',borderTop:'1px solid #F3F4F6',padding:'10px 28px 14px 28px'}}>
                        {taskContextLoading===item.id?(
                          <div style={{display:'flex',gap:5,alignItems:'center',padding:'4px 0'}}>
                            {[0,1,2].map(i2=><span key={i2} style={{width:5,height:5,borderRadius:'50%',background:'#9CA3AF',display:'inline-block',animation:`tcDot 1.2s ${i2*0.3}s ease-in-out infinite`}}/>)}
                          </div>
                        ):taskContexts[item.id]?(
                          <div>
                            <p style={{fontSize:13,color:'#374151',lineHeight:1.6,fontStyle:'italic',margin:'0 0 6px 0'}}>{taskContexts[item.id].text}</p>
                            <div style={{fontSize:11,color:'#9CA3AF',textAlign:'right'}}>Generated just now</div>
                          </div>
                        ):null}
                      </div>
                    )}
                  </div>
                )
              })}
              {statModal.type==='renewals'&&statModal.items.map((item,i)=>{
                const dc=item.daysLeft<30?'#DC2626':item.daysLeft<60?'#D97706':'#D97706'
                const dcBg=item.daysLeft<30?'#FEE2E2':'#FEF3C7'
                const isEditingThis = editingItem?.itemId===item.id
                const ef = isEditingThis ? editingItem.form : null
                return (
                  <div key={item.id||i}>
                    <div className="mob-modal-row" style={{display:'flex',alignItems:'center',minHeight:64,padding:'12px 28px',borderBottom:'1px solid #F9FAFB',transition:'background 0.1s'}}
                      onMouseEnter={e=>{if(!isEditingThis)e.currentTarget.style.background='#FAFAFA'}}
                      onMouseLeave={e=>{if(!isEditingThis)e.currentTarget.style.background='transparent'}}>
                      <button onClick={()=>setStatModal(prev=>prev?{...prev,items:prev.items.filter(it=>it.id!==item.id)}:null)} title='Acknowledge renewal'
                        style={{width:16,height:16,borderRadius:4,border:'1.5px solid #D1D5DB',background:'#FFFFFF',flexShrink:0,marginRight:16,cursor:'pointer'}}/>
                      <span style={{width:48,minWidth:48,background:'#F0F7FF',color:'#007AFF',fontSize:11,fontWeight:600,textTransform:'uppercase',borderRadius:6,padding:'4px 0',textAlign:'center',marginRight:16,flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{(item.accountName||'').slice(0,6)}</span>
                      <div style={{flex:1,minWidth:0,marginRight:12}}>
                        <div style={{fontSize:14,fontWeight:500,color:'#111827',lineHeight:1.3}}>{item.vendor}</div>
                        <div style={{fontSize:12,color:'#9CA3AF',marginTop:2}}>{item.products&&<span>{item.products} · </span>}{fmtDate(item.renewalDate)}{item.cost&&<span> · {item.cost}</span>}</div>
                      </div>
                      <div className="mob-modal-actions" style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                        {saveFlash===item.id&&<span style={{fontSize:11,color:'#10B981',fontWeight:700}}>Saved!</span>}
                        <span style={{background:'#F0F7FF',color:'#007AFF',fontSize:11,fontWeight:500,borderRadius:20,padding:'3px 10px',whiteSpace:'nowrap'}}>In {item.daysLeft}d</span>
                        <span style={{background:dcBg,color:dc,fontSize:11,fontWeight:500,borderRadius:20,padding:'3px 10px',whiteSpace:'nowrap'}}>{item.daysLeft<30?'Critical':'Upcoming'}</span>
                        <button onClick={()=>{onNavigateTo(item.accountId,statModal.tab);setStatModal(null)}}
                          style={{background:'#FFFFFF',border:'1px solid #EEEFF2',color:'#374151',fontSize:12,borderRadius:6,padding:'4px 12px',cursor:'pointer',whiteSpace:'nowrap'}}
                          onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'} onMouseLeave={e=>e.currentTarget.style.background='#FFFFFF'}>View</button>
                        <button onClick={()=>openEditItem('techstack',item.accountId,item)} title='Edit'
                          style={{background:'transparent',border:'none',color:'#D1D5DB',cursor:'pointer',padding:'2px',display:'flex',alignItems:'center',flexShrink:0}}
                          onMouseEnter={e=>e.currentTarget.style.color='#007AFF'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}><Pencil size={14}/></button>
                      </div>
                    </div>
                    {isEditingThis&&ef&&(
                      <div style={{margin:'0 16px 8px 48px',background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:8,padding:12}}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                          <div style={{gridColumn:'span 2'}}>
                            <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',marginBottom:3}}>Vendor</div>
                            <input value={ef.vendor||''} onChange={e=>setEditingItem(ei=>({...ei,form:{...ei.form,vendor:e.target.value}}))} style={{width:'100%',fontSize:12,padding:'5px 8px',background:'#fff',border:'1px solid #bfdbfe',borderRadius:5,color:S.txt,boxSizing:'border-box'}}/>
                          </div>
                          <div>
                            <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',marginBottom:3}}>Renewal Date</div>
                            <input type='date' value={ef.renewalDate||''} onChange={e=>setEditingItem(ei=>({...ei,form:{...ei.form,renewalDate:e.target.value}}))} style={{width:'100%',fontSize:12,padding:'5px 6px',background:'#fff',border:'1px solid #bfdbfe',borderRadius:5,color:S.txt,boxSizing:'border-box'}}/>
                          </div>
                          <div>
                            <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',marginBottom:3}}>Annual Cost</div>
                            <input value={ef.cost||''} onChange={e=>setEditingItem(ei=>({...ei,form:{...ei.form,cost:e.target.value}}))} placeholder='e.g. $24,000' style={{width:'100%',fontSize:12,padding:'5px 8px',background:'#fff',border:'1px solid #bfdbfe',borderRadius:5,color:S.txt,boxSizing:'border-box'}}/>
                          </div>
                          <div style={{gridColumn:'span 2'}}>
                            <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',marginBottom:3}}>Notes</div>
                            <textarea value={ef.notes||''} onChange={e=>setEditingItem(ei=>({...ei,form:{...ei.form,notes:e.target.value}}))} rows={2} style={{width:'100%',fontSize:12,padding:'5px 8px',background:'#fff',border:'1px solid #bfdbfe',borderRadius:5,color:S.txt,resize:'none',boxSizing:'border-box',fontFamily:'inherit',lineHeight:1.4}}/>
                          </div>
                        </div>
                        <div style={{display:'flex',gap:6}}>
                          <button onClick={saveEditItem} style={{padding:'5px 14px',background:'#2563eb',border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save Changes</button>
                          <button onClick={()=>setEditingItem(null)} style={{padding:'5px 10px',background:'transparent',border:'1px solid #bfdbfe',borderRadius:5,color:S.muted,fontSize:12,cursor:'pointer'}}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {statModal.type==='projects'&&statModal.items.map((item,i)=>{
                const comp=item.timeline?item.timeline.filter(s=>s.status==='completed').length:0
                return (
                  <div key={i} onClick={()=>{onNavigateTo(item.accountId,statModal.tab);setStatModal(null)}}
                    style={{display:'flex',alignItems:'center',minHeight:64,padding:'12px 28px',borderBottom:'1px solid #F9FAFB',cursor:'pointer',transition:'background 0.1s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#FAFAFA'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{width:48,minWidth:48,background:'#F0F7FF',color:'#007AFF',fontSize:11,fontWeight:600,textTransform:'uppercase',borderRadius:6,padding:'4px 0',textAlign:'center',marginRight:16,flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{(item.accountName||'').slice(0,6)}</span>
                    <div style={{flex:1,minWidth:0,marginRight:12}}>
                      <div style={{fontSize:14,fontWeight:500,color:'#111827',lineHeight:1.3}}>{item.name}</div>
                      <div style={{fontSize:12,color:'#9CA3AF',marginTop:2}}>
                        {item.vendor&&<span>{item.vendor} · </span>}
                        {item.primaryContact&&<span>{item.primaryContact}</span>}
                        {item.closeDate&&<span> · Close: {fmtDate(item.closeDate)}</span>}
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                      <span style={{background:'#F0F7FF',color:'#007AFF',fontSize:11,fontWeight:500,borderRadius:20,padding:'3px 10px',whiteSpace:'nowrap'}}>{comp}/{STAGES.length} stages</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  )
}
