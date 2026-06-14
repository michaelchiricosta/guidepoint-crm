
import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import { Clock, Trash2, Home, Calendar, AlertTriangle, RefreshCw, Target, Sun, Moon, Map, Zap, ArrowLeft, Pencil, User, Cpu, Share2, Eye, X, GitMerge, Building2, Folder, Bell, Maximize2, ChevronLeft, ChevronRight, LayoutGrid, List, Settings2, Package, Sparkles } from 'lucide-react'
import * as XLSX from 'xlsx'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { loadData, saveData, uploadFile, getFileUrl, deleteFile, supabase } from './supabase.js'
import { isBlockedAccount, getAccountOwner, isOpenNamedAccount } from './namedAccounts.js'
import { SECURITY_FRAMEWORK, resolveVendorMapping } from './securityFramework.js'
import { DARK_THEME, LIGHT_THEME, DARK_PC, LIGHT_PC, DARK_IC, LIGHT_IC, S, PC, IC, applyTheme } from './theme.js'
import { uid, extractJSON, fmtDate, daysUntil, daysSince, parseCost, fmtSpend, formatCompactCurrency, initials, calcDetailedHealthScore, calcHealthScore, getHealthColor, getQuickWin, sendToAppleReminders, globalSearch } from './utils.js'
import { SC, PSC, INTERACTION_COLORS, INTERACTION_TYPES, STAGES, INFLUENCES, TECH_STATS, PROJ_STATS } from './constants.js'
import { Badge, Btn, Field, Modal, SH, Card } from './components/UI.jsx'
import Settings from './components/Settings.jsx'
import AIHistory from './components/AIHistory.jsx'
import AIChatModal from './components/AIChatModal.jsx'
import Admin from './components/Admin.jsx'
import Files from './components/Files.jsx'
import AccountDashboard from './components/AccountDashboard.jsx'
import Actions from './components/Actions.jsx'
import Projects from './components/Projects.jsx'
import TechStack from './components/TechStack.jsx'
import VendorsPage from './components/VendorsPage.jsx'
import Contacts from './components/Contacts.jsx'
import IntelLog from './components/IntelLog.jsx'
import IntelInbox from './components/IntelInbox.jsx'
import Overview from './components/Overview.jsx'
import DailyBrief from './components/DailyBrief.jsx'
const WHEEL_DOMAINS = SECURITY_FRAMEWORK.domains.map(d => ({name: d.name, color: d.color, subs: d.subs}))

const SK = 'gp-crm-v4'
const TECH_CATS = WHEEL_DOMAINS.flatMap(d => d.subs).sort()

// Module-level guard — set by the contact photo upload handler so focus/save don't overwrite
let contactPhotoSaveTime = 0

// Shared retry wrapper for all Anthropic API calls — handles rate limits and overload
const callClaudeWithRetry = async (body, apiKey, onStatus, maxRetries=3) => {
  // Throttle: maintain at least 2s between calls to avoid bursting
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

const SAMPLE = {
  apiKey: '',
  accounts: [{
    id:'bhsi', name:'Berkshire Hathaway Specialty Insurance', short:'BHSI',
    industry:'Insurance / Financial Services', hq:'Boston, MA', status:'Strategic',
    cloud:'Azure-primary (Azure / AWS / GCP)', users:'~5,000 globally',
    relationship:'6+ years', lastContact:'2026-05-19',
    notes:'Glass-box philosophy — they want to own licenses not rent platforms. Anti-AI-hype. Cost-conscious. Rudy is the north star.',
    contacts:[
      {id:'c1',contactType:'Client',name:'Jamie Jervey',title:'CISO',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'Information Security',influence:'Executive Sponsor',sentiment:'positive',relStatus:'Strong',toolsOwn:'Overall security portfolio',goals:'Strategic security partner. Modern transparent SOC.',pains:'Too many vendor voices. No clean decision framework. Overloaded.',notes:'Ultimate decision authority. Values trusted partners. Target for ORBIE Award Boston.',personalNotes:'Loves executive networking and camera presence. High-value intimate experiences over golf outings.',lastInteracted:'2026-03-13',vendorCompany:'',contactPhoto:'',internalMeetings:[]},
      {id:'c2',contactType:'Client',name:'Rudy Montoya',title:'AVP, Information Security',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'Information Security',influence:'Technical Gatekeeper',sentiment:'positive',relStatus:'Strong',toolsOwn:'Entire security stack — runs day-to-day InfoSec',goals:'Defensible transparent architecture. No fake procurement.',pains:'10X delivery issues. QRadar migration complexity. Team asking approval on everything.',notes:'PRIMARY RELATIONSHIP. Candid, long memory, hates buzzwords and black-box. If Rudy respects you the account opens.',personalNotes:'Avid photographer (Leica D-Lux 7, black and white). 3D printing (Bamboo printer). Firearms enthusiast. Recently traveled to Italy.',lastInteracted:'2026-05-19',vendorCompany:'',contactPhoto:'',internalMeetings:[]},
      {id:'c3',contactType:'Client',name:'Marc Wood',title:'CIO',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'IT',influence:'Financial Gatekeeper',sentiment:'neutral',relStatus:'Needs Attention',toolsOwn:'IT strategy and all technology investments',goals:'Data-driven governance. Strict ROI.',pains:'Vendors who cannot justify spend clearly.',notes:'Hardball negotiator. Does not do favors for vendors. Build through Rudy and Jamie — do not approach directly.',personalNotes:'',lastInteracted:'',vendorCompany:'',contactPhoto:'',internalMeetings:[]},
      {id:'c4',contactType:'Client',name:'Dave Bresnahan',title:'COO',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'Executive',influence:'Final Approval',sentiment:'neutral',relStatus:'Needs Attention',toolsOwn:'Strategic veto on major vendor decisions',goals:'Operational risk management. Clean decision process.',pains:'Availability due to international travel.',notes:'Final sign-off and approval bottleneck. Frame all material as risk decision not feature comparison.',personalNotes:'',lastInteracted:'',vendorCompany:'',contactPhoto:'',internalMeetings:[]},
      {id:'c5',contactType:'Client',name:'Jamie Dennis',title:'QA / Compliance',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'IT Compliance',influence:'Stakeholder',sentiment:'neutral',relStatus:'Building',toolsOwn:'Compliance processes and infrastructure alignment',goals:'Clean infrastructure deployments.',pains:'Not kept in loop by vendors and internal teams.',notes:'Critical for infrastructure buy-in. Pinged Mike 5/19 on Saviynt contract. Without his alignment deployments stall.',personalNotes:'',lastInteracted:'2026-05-19',vendorCompany:'',contactPhoto:'',internalMeetings:[]},
      {id:'c6',contactType:'Client',name:'Bill Randall',title:'Future BHSI SOC Director',email:'',cell:'',linkedin:'',location:'Rhode Island (military deployment)',dept:'GuidePoint to BHSI',influence:'Ally',sentiment:'positive',relStatus:'Strong',toolsOwn:'FIDO2 analysis and secure browser evaluation',goals:'Join BHSI as SOC Director. Build modern SOC.',pains:'Currently on military deployment — transition in progress.',notes:'Deeply trusted by Rudy. Expected to join BHSI as SOC Director May 2026. FIDO2 and browser work must be documented before GuidePoint departure.',personalNotes:'Military deployment Guam/Rhode Island.',lastInteracted:'',vendorCompany:'',contactPhoto:'',internalMeetings:[]},
      {id:'c7',contactType:'Client',name:'Jake (SOC)',title:'SOC Engineer',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'Information Security',influence:'Risk Factor',sentiment:'negative',relStatus:'Needs Attention',toolsOwn:'Internal SOC engineering — moved team to 1Password unilaterally',goals:'Modern SOC tooling his way.',pains:'Feels ignored by security leadership.',notes:'Favors ReliaQuest and 10X internally. Slowed CyberArk WPM eval. Do NOT rely as champion. Rudy is frustrated with him.',personalNotes:'',lastInteracted:'',vendorCompany:'',contactPhoto:'',internalMeetings:[]},
      {id:'c8',contactType:'Internal',name:'Mike Chiricosta',title:'Enterprise Client Manager',email:'',cell:'',linkedin:'',location:'',dept:'GuidePoint Security',influence:'Ally',sentiment:'positive',relStatus:'Strong',toolsOwn:'',goals:'',pains:'',notes:'Account owner',personalNotes:'',lastInteracted:'',vendorCompany:'',contactPhoto:'',internalMeetings:[]}
    ],
    techStack:[
      {id:'t1',vendor:'QRadar / QROC',products:'Co-managed SIEM',category:'SIEM / SOC',status:'Replacing',renewalDate:'2026-04-01',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Rudy Montoya',replacementOptions:'',notes:'EOL April 2026. WinCollect agents crashing on Exchange and GIS servers. 15-20TB log migration to AWS S3 needed.'},
      {id:'t2',vendor:'Google SecOps',products:'SIEM / Chronicle',category:'SIEM / SOC',status:'Selected',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Rudy Montoya',replacementOptions:'',notes:'Target SIEM deployed with 10X. Rudy frustrated — cannot get incident list by priority. Caching issues persist.'},
      {id:'t3',vendor:'Saviynt',products:'IGA',category:'Identity / IAM',status:'Replacing',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Jamie Dennis',replacementOptions:'SailPoint',notes:'Only 3 of 10 target systems completed. Team hates it. Target replacement: SailPoint. Jamie Dennis pinged Mike on contract 5/19.'},
      {id:'t4',vendor:'Microsoft E5 Suite',products:'Entra ID, Defender EDR, Sentinel, Purview, PIM',category:'Identity / IAM',status:'Current',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Marc Wood',replacementOptions:'',notes:'Core identity and endpoint platform. PIM is NOT full PAM. Rudy pushing back on Microsoft narrative. Sentinel adoption stalled.'},
      {id:'t5',vendor:'Cloudflare',products:'SASE, ZTNA, Gateway, VPN replacement',category:'Network / SASE',status:'Watch',renewalDate:'2026-12-01',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Alec Schmid',replacementOptions:'Zscaler',notes:'Final contract year 2026. Log noise severe — 20k unknown tunnel events per 5 minutes. Zscaler pivot opportunity as renewal approaches.'},
      {id:'t6',vendor:'Abnormal Security',products:'Email Protection',category:'Email Security',status:'Current',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Rudy Montoya',replacementOptions:'',notes:'Rudy satisfied. Unlikely to replace. SIEM log integration desired.'},
      {id:'t7',vendor:'NetSpy',products:'PTaaS — Pen Testing as a Service',category:'Pen Test / Red Team',status:'Evaluating',renewalDate:'',cost:'',vendorRep:'Richard Booth',vendorRepEmail:'',clientOwner:'Rudy Montoya',replacementOptions:'',notes:'Scoping call done. Demo this week. Good references from Geico and Metro. Manual testing with live chat and fast results. GuidePoint should capture the paper.'},
      {id:'t8',vendor:'Wiz',products:'CSPM / Cloud Security Posture',category:'Cloud Security',status:'Evaluating',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Rudy Montoya',replacementOptions:'',notes:'Post-Qualys CSPM gap since May 2025. Integrates well with Google SecOps. Favorable Google pricing. Internal DAST vs CSPM confusion needs resolving first.'}
    ],
    projects:[
      {id:'p1',name:'MDR / SecOps Stabilization',category:'MDR',vendor:'GuidePoint / 10X',status:'In Flight',description:'10X delivery issues creating GuidePoint MDR opening. Chris and Andy moved to Optiv Services LLC — status uncertain.',goals:'Stable transparent 24/7 MDR. Own Google SecOps and Cribl licenses.',pains:'10X SLA failures. Chad friction. Google SecOps missing basic priority reporting.',primaryContact:'Jamie Jervey',budget:true,closeDate:'2026-08-01',notes:'Position GuidePoint as continuity and stability play. Glass-box model is the differentiator.',estimatedRevenue:'',estimatedGrossProfit:'',clientTargetDate:'',nextSteps:'',projectNotes:[],timeline:STAGES.map((s,i)=>({stage:s,status:i<4?'completed':i===4?'pending':i===5?'current':'pending',date:i===0?'2026-01-01':i===1?'2026-02-01':i===2?'2026-03-13':i===3?'2026-03-27':'' }))},
      {id:'p2',name:'NetSpy PTaaS',category:'Pen Test / Red Team',vendor:'NetSpy',status:'In Discussion',description:'Cost-effective pen testing alternative to Mandiant. GuidePoint facilitating and capturing the paper.',goals:'Annual PTaaS with fast results and real manual testing.',pains:'Mandiant too expensive. Need off-year pen test solution.',primaryContact:'Rudy Montoya',budget:true,closeDate:'2026-06-30',notes:'Richard Booth is vendor rep. Wants to go direct — push through GuidePoint to control pricing and negotiation.',estimatedRevenue:'',estimatedGrossProfit:'',clientTargetDate:'',nextSteps:'',projectNotes:[],timeline:STAGES.map((s,i)=>({stage:s,status:i<3?'completed':i===3?'current':'pending',date:i===0?'2026-05-01':i===1?'2026-05-10':i===2?'2026-05-15':'' }))},
      {id:'p3',name:'Horizon 3 ASM',category:'ASM',vendor:'Horizon 3',status:'In Discussion',description:'Attack surface management. Jamie has budget allocated. Preferred over Pentera after poor Pentera engagement.',goals:'Continuous ASM separate from PTaaS — separation of duties.',pains:'No continuous attack-path tracking since Qualys terminated May 2025.',primaryContact:'Jamie Jervey',budget:true,closeDate:'2026-09-01',notes:'Confirm scope with Bill. NetSpy for PTaaS, Horizon 3 for ASM.',estimatedRevenue:'',estimatedGrossProfit:'',clientTargetDate:'',nextSteps:'',projectNotes:[],timeline:STAGES.map((s,i)=>({stage:s,status:i===0?'completed':i===1?'current':'pending',date:i===0?'2026-04-01':'' }))},
      {id:'p4',name:'Saviynt to SailPoint IGA',category:'IGA',vendor:'SailPoint',status:'Not Started',description:'Replace failing Saviynt IGA with SailPoint. Jamie Dennis reached out on Saviynt contract 5/19.',goals:'Functioning IGA covering all 10 target systems not just 3.',pains:'Saviynt only completed 3 of 10 systems. Entire team hates the platform.',primaryContact:'Jamie Dennis',budget:false,closeDate:'',notes:'Get Saviynt contract renewal date. Jamie Dennis must be aligned for deployment to succeed.',estimatedRevenue:'',estimatedGrossProfit:'',clientTargetDate:'',nextSteps:'',projectNotes:[],timeline:STAGES.map((s,i)=>({stage:s,status:i===0?'current':'pending',date:'' }))},
      {id:'p5',name:'Wiz CSPM',category:'CSPM',vendor:'Wiz',status:'In Discussion',description:'Fill post-Qualys cloud security gap across Azure, AWS, and GCP.',goals:'Real CSPM replacing Datadog stopgap.',pains:'No continuous exploitability tracking since Qualys killed May 2025.',primaryContact:'Rudy Montoya',budget:false,closeDate:'2026-10-01',notes:'Resolve internal DAST vs CSPM confusion first. Cloud Security Workshop is the entry point.',estimatedRevenue:'',estimatedGrossProfit:'',clientTargetDate:'',nextSteps:'',projectNotes:[],timeline:STAGES.map((s,i)=>({stage:s,status:i<4?'completed':i===4?'pending':i===5?'current':'pending',date:i===0?'2026-03-01':i===1?'2026-04-01':i===2?'2026-04-15':i===3?'2026-05-01':'' }))}
    ],
    interactions:[
      {id:'i1',contact:'Rudy Montoya',type:'Call',date:'2026-05-19',duration:45,topics:'NetSpy PTaaS, Horizon 3 ASM, Optiv restructure, Google SecOps frustrations, Saviynt contract',summary:'Wide-ranging strategy call. Pen testing vendor selection, Optiv Services LLC chaos with Chris and Andy, Google SecOps missing basic reporting.'}
    ],
    intelLog:[
      {id:'l1',date:'2026-05-19',type:'Call',participants:'Rudy Montoya + Mike',summary:'Wide-ranging strategy call. NetSpy scoping done with demo scheduling in progress. 10X delivery issues real and growing. Optiv Services LLC restructure has Chris and Andy in limbo. Google SecOps frustrating Rudy with missing basic reporting and caching issues.',insights:['NetSpy scoping complete with Richard Booth — demo scheduling this week','Horizon 3 confirmed as preferred ASM over Pentera after poor Pentera engagement','Optiv Services LLC: 500 people moved overnight including Chris Morgan and Andy Myers','10X delivery issues — Chad had bad tone on call, Bill was upset, SLA commitments missed','Google SecOps cannot produce incident list by priority and has caching issues','Jamie Dennis pinged Mike on Saviynt contract morning of 5/19','Marianne working on GRC / Vanta evaluation — Mike committed to follow up','Internal team member pushing for DAST vendor before defining the actual problem'],risks:['10X delivery problems threatening MDR and Google SecOps transition stability','Optiv Services LLC sale could orphan Chris and Andy — GuidePoint continuity gap','Internal team bringing vendors in before Rudy defines requirements (Chad pattern repeating)'],opportunities:['MDR continuity play as Optiv organizational structure dissolves','Vanta GRC — new uncharted opportunity with Marianne','AppSec advisory — help Rudy build internal vendor evaluation framework','DAST vs CSPM clarification session is an entry point for the Wiz conversation']}
    ],
    followUps:[
      {id:'f1',contact:'Rudy Montoya',task:'Confirm NetSpy demo — week of May 19',priority:'Critical',dueDate:'2026-05-21',status:'Open',context:'Richard Booth is vendor contact. Video call only — Rudy said Jamie does not need to attend this one.'},
      {id:'f2',contact:'Jamie Dennis',task:'Respond to Jamie Dennis re: Saviynt contract renewal date',priority:'High',dueDate:'2026-05-22',status:'Open',context:'Pinged 5/19. Get renewal date and start SailPoint conversation in parallel.'},
      {id:'f3',contact:'Rudy Montoya',task:'Follow up with Marianne on Vanta and GRC evaluation',priority:'High',dueDate:'2026-05-23',status:'Open',context:'Mike committed on 5/19 call. Need to understand scope and who owns the budget.'},
      {id:'f4',contact:'Rudy Montoya',task:'GuidePoint pen test services — internal briefing before BHSI meeting',priority:'High',dueDate:'2026-05-22',status:'Open',context:'Get rundown from Peter Mullet before client-facing call. Know the capabilities cold.'},
      {id:'f5',contact:'Bill Randall',task:'Document Bill Randall FIDO2 analysis before GuidePoint departure',priority:'High',dueDate:'2026-05-30',status:'Open',context:'Bill becoming BHSI SOC Director. His FIDO2 and secure browser work must be formally handed off before he leaves GuidePoint.'},
      {id:'f6',contact:'Rudy Montoya',task:'Confirm Horizon 3 PTaaS vs ASM scope with Bill',priority:'Medium',dueDate:'2026-05-26',status:'Open',context:'Separation of duties: NetSpy for PTaaS, Horizon 3 for ASM. Verify with Bill what H3 actually covers.'}
    ],
    unknownMentions:[],
    relSuggestions:[],
    dismissedAlerts:[],
    snoozedAlerts:[],
    healthScoreOverrides:{},
    healthScoreHistory:[],
    upcomingDates:[],
    files:[],
    savedLinks:[],
    adminData:{},
    endpoints:'',
    orgChart:{nodes:[]}
  }],
  whitespaceAccounts:[],
  quotaTarget: 0,
  dailyBriefs: []
}




const MONTH_MAP = {january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12',jan:'01',feb:'02',mar:'03',apr:'04',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'}
const detectDate = text => {
  const t = text.slice(0,200)
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]
  const mdy = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
  const full = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/i)
  if (full) { const m=MONTH_MAP[full[1].toLowerCase()]; if(m) return `${full[3]}-${m}-${full[2].padStart(2,'0')}` }
  const partial = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i)
  if (partial) { const m=MONTH_MAP[partial[1].toLowerCase()]; if(m) return `${new Date().getFullYear()}-${m}-${partial[2].padStart(2,'0')}` }
  return null
}

function Sidebar({data,activeId,setActiveId,setData,onNavigate,searchRef,lastSaved,saveStatus,onRefresh,theme,setTheme,onGoHome,mobileMenuOpen,onCloseMobileMenu,collapsed,setCollapsed}) {
  const [showAdd,setShowAdd] = useState(false)
  const [newName,setNewName] = useState('')
  const [searchQ,setSearchQ] = useState('')
  const [isMobile,setIsMobile] = useState(typeof window!=='undefined'&&window.innerWidth<768)

  useEffect(()=>{
    const check=()=>{const mob=window.innerWidth<768;setIsMobile(mob);if(mob)setCollapsed(true)}
    check()
    window.addEventListener('resize',check)
    return()=>window.removeEventListener('resize',check)
  },[])

  const toggleCollapsed = () => { const n=!collapsed; setCollapsed(n); localStorage.setItem('sidebar-collapsed',n.toString()) }
  const addAccount=()=>{if(!newName.trim())return;const id=uid();const blank={id,name:newName,short:newName.slice(0,6).toUpperCase(),industry:'',hq:'',status:'Active',cloud:'',users:'',relationship:'',lastContact:'',notes:'',endpoints:'',contacts:[],techStack:[],projects:[],interactions:[],intelLog:[],followUps:[],files:[],savedLinks:[],adminData:{},upcomingDates:[],unknownMentions:[],relSuggestions:[],contactSuggestions:[],dismissedAlerts:[],snoozedAlerts:[],healthScoreOverrides:{},healthScoreHistory:[],aiHistory:[],logoImage:'',orgChart:{nodes:[]}};setData(p=>({...p,accounts:[...p.accounts,blank]}));setActiveId(id);setShowAdd(false);setNewName('')}
  const searchResults = globalSearch(data, searchQ)
  const grouped = {}
  searchResults.forEach(r=>{if(!grouped[r.category])grouped[r.category]=[];grouped[r.category].push(r)})

  if(isMobile&&!mobileMenuOpen) return null
  if(isMobile&&mobileMenuOpen) return (
    <>
      <div onClick={onCloseMobileMenu} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:150}}/>
      <div style={{position:'fixed',left:0,top:0,height:'100vh',zIndex:160,width:221,background:'#FFFFFF',display:'flex',flexDirection:'column',boxShadow:'4px 0 20px rgba(0,0,0,0.10)',overflowY:'auto',borderRight:'1px solid #EEEFF2'}}>
        <div style={{padding:'12px 16px',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #EEEFF2'}}>
          <img src="/Ledgr-full-logo.png" style={{height:'72px',width:'auto',maxWidth:'187px',objectFit:'contain',display:'block'}} alt="Ledgr."/>
          <button onClick={onCloseMobileMenu} style={{background:'transparent',border:'none',color:'#9CA3AF',cursor:'pointer',fontSize:22,lineHeight:1,padding:'0 4px'}}>×</button>
        </div>
        <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.1em',textTransform:'uppercase',padding:'12px 16px 4px',flexShrink:0}}>My Accounts</div>
        <div style={{flex:1,overflowY:'auto',padding:'0 8px'}}>
          {[...data.accounts].sort((a,b)=>a.name.localeCompare(b.name)).map(a=>{
            const hs=calcHealthScore(a)
            const hc=getHealthColor(hs)
            const isActive=activeId===a.id
            return (
              <button key={a.id} onClick={()=>setActiveId(a.id)}
                style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'10px 12px',borderRadius:8,border:'none',borderLeft:isActive?'3px solid #007AFF':'3px solid transparent',background:isActive?'#EBF4FF':'transparent',textAlign:'left',cursor:'pointer',marginBottom:1}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontSize:14,fontWeight:600,color:isActive?'#007AFF':'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.short||a.name}</div>
                </div>
                <span style={{fontSize:11,fontWeight:700,color:hc,background:hc+'20',borderRadius:999,padding:'2px 7px',flexShrink:0}}>{hs}</span>
              </button>
            )
          })}
        </div>
        <div style={{height:1,background:'#EEEFF2',flexShrink:0}}/>
        <div style={{padding:'12px',flexShrink:0}}>
          <button onClick={()=>{onGoHome&&onGoHome()}} style={{display:'flex',alignItems:'center',gap:6,width:'100%',padding:'10px 12px',background:'transparent',border:'1px solid #EEEFF2',borderRadius:8,color:'#6B7280',fontSize:13,cursor:'pointer'}}>← Home</button>
        </div>
      </div>
    </>
  )

  const SM = '#6B7280', SH2 = '#F9FAFB', SA = '#F0F7FF'

  return (
    <div style={{position:'fixed',top:0,left:0,height:'100vh',zIndex:100,width:collapsed?64:221,background:'#FFFFFF',borderRight:'1px solid #EEEFF2',display:'flex',flexDirection:'column',transition:'width 0.2s ease',overflow:'hidden'}}>
      {/* Logo area */}
      <div style={{padding:collapsed?'14px 0 10px':'12px 16px 12px',flexShrink:0,borderBottom:'1px solid #EEEFF2'}}>
        {!collapsed?(
          <div style={{position:'relative',display:'flex',justifyContent:'center',alignItems:'center'}}>
            <button onClick={onGoHome} style={{background:'none',border:'none',cursor:'pointer',padding:0}}>
              <img src="/Ledgr-full-logo.png" style={{height:'72px',width:'auto',maxWidth:'187px',objectFit:'contain',display:'block'}} alt="Ledgr."/>
            </button>
            <button onClick={toggleCollapsed} title="Collapse"
              style={{position:'absolute',right:0,background:'transparent',border:'none',color:'#9CA3AF',cursor:'pointer',fontSize:16,padding:'4px',lineHeight:1,transition:'color 0.15s'}}
              onMouseEnter={e=>e.currentTarget.style.color='#6B7280'}
              onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>‹</button>
          </div>
        ):(
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
            <button onClick={onGoHome} title="Home" style={{background:'none',border:'none',cursor:'pointer',padding:0}}>
              <img src="/Ledgr-L-logo.png" style={{width:'36px',height:'36px',objectFit:'contain',display:'block'}} alt="Ledgr."/>
            </button>
            <button onClick={toggleCollapsed} title="Expand"
              style={{background:'transparent',border:'none',color:'#9CA3AF',cursor:'pointer',fontSize:16,padding:'2px',lineHeight:1,transition:'color 0.15s'}}
              onMouseEnter={e=>e.currentTarget.style.color='#6B7280'}
              onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>›</button>
          </div>
        )}
      </div>
      {!collapsed&&(
        <div style={{padding:'8px 12px'}}>
          <div style={{position:'relative',display:'flex',alignItems:'center'}}>
            <input
              ref={searchRef}
              value={searchQ}
              onChange={e=>setSearchQ(e.target.value)}
              placeholder='Search...'
              style={{width:'100%',fontSize:13,padding:'7px 10px',paddingRight:42,background:'#F3F4F6',border:'none',borderRadius:8,color:'#111827',boxSizing:'border-box',outline:'none',fontFamily:'inherit'}}
            />
            <span style={{position:'absolute',right:8,background:'#E5E7EB',color:'#6B7280',fontSize:9,fontWeight:600,padding:'2px 5px',borderRadius:4,pointerEvents:'none',whiteSpace:'nowrap'}}>⌘K</span>
          </div>
        </div>
      )}
      {!collapsed&&searchResults.length>0&&(
        <div style={{maxHeight:260,overflowY:'auto',borderTop:'1px solid #EEEFF2',borderBottom:'1px solid #EEEFF2',background:'#F9FAFB',flexShrink:0}}>
          {Object.entries(grouped).map(([cat,items])=>(
            <div key={cat}>
              <div style={{fontSize:9,fontWeight:700,color:SM,letterSpacing:'0.1em',textTransform:'uppercase',padding:'6px 14px 2px'}}>{cat}</div>
              {items.map((r,i)=>(
                <button key={i} onClick={()=>{onNavigate(r.accountId,r.tab);setSearchQ('')}}
                  style={{display:'block',width:'100%',textAlign:'left',padding:'6px 14px',background:'transparent',border:'none',cursor:'pointer'}}
                  onMouseEnter={e=>e.currentTarget.style.background=SH2}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{fontSize:12,fontWeight:600,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.label}</div>
                  <div style={{fontSize:10,color:SM,display:'flex',gap:4}}>
                    <span style={{flexShrink:0}}>{r.accountName}</span>
                    {r.sublabel&&<span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>· {r.sublabel}</span>}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {!collapsed&&<div style={{fontSize:11,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',padding:'12px 16px 4px',flexShrink:0}}>My Accounts</div>}
      <div style={{flex:1,overflowY:'auto',padding:collapsed?'4px 8px':'0 8px'}}>
        {[...data.accounts].sort((a,b)=>a.name.localeCompare(b.name)).map(a=>{
          const hs=calcHealthScore(a)
          const hc=getHealthColor(hs)
          const isActive=activeId===a.id
          return (
          collapsed
          ? <button key={a.id} onClick={()=>setActiveId(a.id)} title={`${a.name} (Health: ${hs})`}
              style={{display:'flex',alignItems:'center',justifyContent:'center',width:'100%',padding:'5px 0',border:'none',background:'transparent',cursor:'pointer',marginBottom:2,borderRadius:8}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:isActive?'#F0F7FF':'#F9FAFB',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:isActive?'#007AFF':SM,border:`1px solid ${isActive?'#007AFF':'#EEEFF2'}`,flexShrink:0}}>
                {initials(a.short||a.name)}
              </div>
            </button>
          : <button key={a.id} onClick={()=>setActiveId(a.id)}
              style={{display:'flex',alignItems:'center',gap:8,width:'100%',height:38,padding:'0 12px',borderRadius:8,border:'none',background:isActive?SA:'transparent',textAlign:'left',cursor:'pointer',marginBottom:1,transition:'background 0.1s'}}
              onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=SH2}}
              onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background='transparent'}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:14,fontWeight:600,color:isActive?'#007AFF':'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.short||a.name}</div>
              </div>
              <span style={{fontSize:10,fontWeight:700,color:hc,background:hc+'20',borderRadius:999,padding:'1px 6px',flexShrink:0,lineHeight:'16px'}}>{hs}</span>
            </button>
          )
        })}
      </div>
      {/* Divider */}
      <div style={{height:1,background:'#EEEFF2',flexShrink:0}}/>
      {!collapsed&&<div style={{padding:'12px',flexShrink:0}}>
        {showAdd?<div>
          <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder='Account name...' onKeyDown={e=>e.key==='Enter'&&addAccount()}
            style={{marginBottom:6,fontSize:12,width:'100%',padding:'7px 10px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:8,color:ST,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/>
          <div style={{display:'flex',gap:5}}>
            <button onClick={addAccount} style={{flex:1,padding:'6px 8px',background:'#007AFF',border:'none',borderRadius:7,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>Add</button>
            <button onClick={()=>{setShowAdd(false);setNewName('')}} style={{padding:'6px 10px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:7,color:SM,fontSize:12,cursor:'pointer'}}>✕</button>
          </div>
        </div>:<button onClick={()=>setShowAdd(true)}
          style={{display:'flex',alignItems:'center',gap:6,width:'100%',padding:'8px 12px',background:'transparent',border:'1px dashed #D1D5DB',borderRadius:8,color:SM,fontSize:12,cursor:'pointer',transition:'background 0.15s'}}
          onMouseEnter={e=>e.currentTarget.style.background=SH2}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>+ New Account</button>}
        <button onClick={()=>onNavigate&&onNavigate(activeId,'settings')}
          style={{display:'flex',alignItems:'center',gap:8,width:'100%',height:38,padding:'0 12px',background:'transparent',border:'none',borderRadius:8,color:SM,fontSize:14,cursor:'pointer',transition:'all 0.15s',marginTop:8,textAlign:'left',boxSizing:'border-box'}}
          onMouseEnter={e=>{e.currentTarget.style.background=SH2;e.currentTarget.style.color='#111827'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=SM}}>
          <Settings2 size={18}/> Settings
        </button>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6}}>
          <span style={{fontSize:10,color:'#9CA3AF'}}>Theme</span>
          <div style={{display:'flex',gap:1,background:'#F3F4F6',borderRadius:6,padding:2}}>
            <button onClick={()=>setTheme('light')} title='Light mode'
              style={{padding:'3px 8px',borderRadius:4,border:'none',background:theme==='light'?'#FFFFFF':'transparent',color:theme==='light'?'#007AFF':SM,fontSize:12,cursor:'pointer',lineHeight:1.4}}>☀</button>
            <button onClick={()=>setTheme('dark')} title='Dark mode'
              style={{padding:'3px 8px',borderRadius:4,border:'none',background:theme==='dark'?'#FFFFFF':'transparent',color:theme==='dark'?'#007AFF':SM,fontSize:12,cursor:'pointer',lineHeight:1.4}}>☾</button>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4,marginTop:6}}>
          <div style={{fontSize:10,color:saveStatus==='error'?'#EF4444':'#9CA3AF',textAlign:'center'}}>
            {saveStatus==='saving'?'Saving...'
            :saveStatus==='error'?'Save failed — check connection'
            :lastSaved?`Saved ${lastSaved}`:''}
          </div>
          <button onClick={onRefresh} title="Refresh from Supabase"
            style={{background:'transparent',border:'none',cursor:'pointer',color:'#9CA3AF',padding:'1px 3px',fontSize:13,lineHeight:1,transition:'color 0.15s',flexShrink:0}}
            onMouseEnter={e=>e.currentTarget.style.color='#007AFF'}
            onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>↻</button>
        </div>
      </div>}
    </div>
  )
}

function LandingPageSidebar({data, theme, setTheme, setTodayModal, statDefs, setStatModal, onGoWhitespace, onGoAllProjects, onGoVendors, showAccounts, setShowAccounts, onOpenSettings, collapsed, setCollapsed, onGoDailyBrief, showDailyBriefPage}) {
  const toggleCollapsed = () => { const n=!collapsed; setCollapsed(n); localStorage.setItem('sidebar-collapsed',n.toString()) }

  const today = new Date().toISOString().split('T')[0]
  const todayBrief = (data.dailyBriefs||[]).find(b=>b.date===today)
  const briefIncompleteCount = todayBrief ? (todayBrief.sections?.actToday||[]).filter(a=>!a.completedToday).length : 0

  const navTop = [
    {id:'dailybrief',  label:'Daily Brief',  icon:<Sparkles size={18}/>,      action:()=>onGoDailyBrief&&onGoDailyBrief(), badge: briefIncompleteCount>0?briefIncompleteCount:null},
    {id:'dashboard',   label:'Dashboard',    icon:<Home size={18}/>,          action:()=>setShowAccounts(false)},
    {id:'accounts',    label:'Accounts',     icon:<Building2 size={18}/>,     action:()=>setShowAccounts(true)},
    {id:'allprojects', label:'All Projects', icon:<Folder size={18}/>,        action:()=>onGoAllProjects&&onGoAllProjects()},
    {id:'whitespace',  label:'Whitespace',   icon:<Map size={18}/>,           action:()=>onGoWhitespace&&onGoWhitespace()},
    {id:'vendors',     label:'Vendors',      icon:<Package size={18}/>,       action:()=>onGoVendors&&onGoVendors()},
  ]
  const navBottom = [
    {id:'tasks',    label:"Today's Tasks",  icon:<Calendar size={18}/>,     action:()=>setTodayModal(true)},
    {id:'critical', label:'Critical Items', icon:<AlertTriangle size={18}/>, action:()=>statDefs[1]&&setStatModal({...statDefs[1],items:statDefs[1].buildData()})},
    {id:'renewals', label:'Renewals',       icon:<RefreshCw size={18}/>,    action:()=>statDefs[2]&&setStatModal({...statDefs[2],items:statDefs[2].buildData()})},
  ]
  const activeId = showDailyBriefPage ? 'dailybrief' : showAccounts ? 'accounts' : 'dashboard'

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
    return {
      name: acct.short||acct.name,
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
    return (
      <div style={{background:'#FFFFFF',border:'1px solid #EEEFF2',borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,0.10)',padding:'10px 14px',minWidth:140}}>
        <div style={{fontSize:12,fontWeight:700,color:'#111827',marginBottom:5}}>{label}</div>
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
      <BarChart data={chartData} margin={{top:8,right:8,bottom:8,left:-20}} barGap={3} barCategoryGap="35%">
        <CartesianGrid vertical={false} stroke="#F3F4F6" strokeDasharray="3 3"/>
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#9CA3AF'}} interval={0}/>
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
      <div className="lp-chart-bar" style={{background:'#FFFFFF',borderRadius:12,padding:20,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',border:'1px solid #EEEFF2',flex:'0 0 63%',minWidth:0,boxSizing:'border-box'}}>
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
    <div className="lp-chart-perf" style={{background:'#fff',borderRadius:14,padding:20,boxShadow:'0 1px 3px rgba(0,0,0,0.06)',border:'1px solid #e2e8f0',flex:'0 0 35%',minWidth:0,boxSizing:'border-box'}}>
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

function LandingPage({data, setData, onEnterAccount, onNavigateTo, onOpenSettings, onGoWhitespace, onGoAllProjects, onGoVendors, onGoDailyBrief, briefGenerating, briefError, onGenerateBrief, theme, setTheme, showAccounts, setShowAccounts, sidebarCollapsed, setSidebarCollapsed}) {
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
  const scrollRef = useRef(null)
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

  return (
    <div style={{height:'100vh',background:S.bg,color:S.txt,overflow:'hidden'}}>
      {remindersToast&&<div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'rgba(34,197,94,0.92)',color:'#fff',padding:'9px 22px',borderRadius:8,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:'0 4px 16px rgba(0,0,0,0.35)',pointerEvents:'none',display:'flex',alignItems:'center',gap:7}}><Share2 size={14}/> Sending to Apple Reminders...</div>}
      {!mob&&<LandingPageSidebar data={data} theme={theme} setTheme={setTheme} setTodayModal={setTodayModal} statDefs={STAT_DEFS} setStatModal={setStatModal} onGoWhitespace={onGoWhitespace} onGoAllProjects={onGoAllProjects} onGoVendors={onGoVendors} showAccounts={showAccounts} setShowAccounts={setShowAccounts} onOpenSettings={onOpenSettings} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} onGoDailyBrief={onGoDailyBrief} showDailyBriefPage={false}/>}
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
                {label:'Dashboard',   action:()=>{setShowAccounts(false);setMobNavOpen(false)}},
                {label:'Accounts',    action:()=>{setShowAccounts(true); setMobNavOpen(false)}},
                {label:'All Projects',action:()=>{onGoAllProjects&&onGoAllProjects();setMobNavOpen(false)}},
                {label:'Whitespace',  action:()=>{onGoWhitespace&&onGoWhitespace();  setMobNavOpen(false)}},
                {label:'Vendors',     action:()=>{onGoVendors&&onGoVendors();         setMobNavOpen(false)}},
                {label:'Settings',    action:()=>{onOpenSettings&&onOpenSettings();   setMobNavOpen(false)}},
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
      <div ref={scrollRef} style={{marginLeft:mob?0:(sidebarCollapsed?64:221),transition:'margin-left 0.2s ease',height:'100vh',overflowY:'auto',WebkitOverflowScrolling:'touch'}}>
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

        {/* DAILY BRIEF PREVIEW CARD */}
        {!showAccounts&&(()=>{
          const today=new Date().toISOString().split('T')[0]
          const todayBrief=(data.dailyBriefs||[]).find(b=>b.date===today)
          const firstAction=todayBrief?.sections?.actToday?.[0]||null
          const estHour=new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'})).getHours()
          const estMin=new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'})).getMinutes()
          const before745=estHour<7||(estHour===7&&estMin<45)
          return(
            <div style={{background:'#fff',borderRadius:12,border:'1px solid #e2e8f0',padding:'16px 20px',marginBottom:20,boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',gap:7}}>
                  <Sparkles size={16} color='#2563eb'/>
                  <span style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>Today's Brief</span>
                </div>
                <button onClick={()=>onGoDailyBrief&&onGoDailyBrief()} style={{background:'transparent',border:'none',color:'#2563eb',fontSize:12,fontWeight:600,cursor:'pointer',padding:0}}>View Full Brief →</button>
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
              <div style={{display:'flex',gap:16,marginBottom:20,alignItems:'flex-start',flexWrap:'wrap'}}>
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

const WS_VENDORS = ['CrowdStrike','SentinelOne','Palo Alto','Zscaler','Okta','Splunk','Wiz','Varonis','SailPoint','CyberArk','Qualys','Tenable','Rapid7','Darktrace','Vectra','Arctic Wolf','ReliaQuest','Cloudflare','Fortinet','Check Point','Cisco','Proofpoint','Mimecast','Abnormal','KnowBe4','BeyondTrust','Delinea','Microsoft','ThreatLocker','LogRhythm','QRadar','Elastic','Datadog','Lacework','Orca','VMware','Symantec','1Password','Google','Saviynt','NetSpy','IBM','Carbon Black','FireEye','Mandiant','ServiceNow']

// Simple, fast contact extraction — only structured "Contact: Name, Title — context" lines
const parseContactsFromEntries = entries => {
  try {
    const map = {}
    const lines = entries.map(e=>e.text||'').join('\n').split('\n')
    for (const line of lines) {
      const m = line.match(/^Contact:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)[,\s]*([^—]{0,60}?)(?:\s*—\s*(.{0,200}))?$/)
      if (!m) continue
      const name = m[1].trim()
      const title = (m[2]||'').replace(/^[,\s]+|[,\s]+$/g,'').trim()
      const ctx = (m[3]||'').trim()
      if (!map[name]) map[name] = {name, title:'', contexts:[], mentions:0}
      if (!map[name].title && title) map[name].title = title
      if (ctx) map[name].contexts.push(ctx)
      map[name].mentions++
    }
    // Also scan for "Name, Title" pattern with simple title keyword list (no backtracking)
    const titleKw = ['VP','SVP','EVP','Director','Manager','CISO','CTO','CEO','CFO','COO','CIO','President','Head of','Head,']
    const allText = entries.map(e=>e.text||'').join('\n')
    const nameRe = /\b([A-Z][a-z]+ [A-Z][a-z]+)\s*[,(]\s*([^,.\n(]{3,40})/g
    let m2
    while ((m2 = nameRe.exec(allText)) !== null) {
      const name = m2[1].trim()
      const candidate = m2[2].trim()
      if (titleKw.some(t => candidate.toLowerCase().includes(t.toLowerCase()))) {
        if (!map[name]) map[name] = {name, title: candidate.slice(0,40), contexts:[], mentions:0}
        map[name].mentions++
      }
    }
    return Object.values(map)
  } catch(e) { return [] }
}

// Simple, fast tech extraction — structured lines + plain string indexOf for vendors
const parseTechFromEntries = entries => {
  try {
    const map = {}
    const allText = entries.map(e=>e.text||'').join('\n')
    const lower = allText.toLowerCase()
    // Structured "Technology: Vendor — Status — context" lines
    const lines = allText.split('\n')
    for (const line of lines) {
      const m = line.match(/^Technology:\s*([^—]+?)\s*—\s*(Customer|Evaluating|Replacing|Considering|Unknown)\s*—\s*(.{0,200})$/)
      if (!m) continue
      const name = m[1].trim(), status = m[2], ctx = m[3].trim()
      if (!map[name]) map[name] = {name, status, contexts:[], mentions:0}
      map[name].status = status
      if (ctx) map[name].contexts.push(ctx)
      map[name].mentions++
    }
    // Known vendor scan — simple toLowerCase indexOf, no complex regex
    for (const vendor of WS_VENDORS) {
      const vl = vendor.toLowerCase()
      const idx = lower.indexOf(vl)
      if (idx === -1) continue
      if (map[vendor]) { map[vendor].mentions++; continue }
      // Detect status with simple substring checks around the match
      const window = lower.slice(Math.max(0,idx-40), idx+vendor.length+40)
      let status = 'Unknown'
      if (window.includes('evaluat') || window.includes('looking at') || window.includes('considering')) status = 'Evaluating'
      else if (window.includes('customer') || window.includes('uses ') || window.includes('running') || window.includes('deployed')) status = 'Customer'
      else if (window.includes('replac')) status = 'Replacing'
      const ctx = allText.slice(Math.max(0,idx-40), idx+vendor.length+60).replace(/\s+/g,' ').trim()
      map[vendor] = {name:vendor, status, contexts:ctx?[ctx.slice(0,120)]:[], mentions:1}
    }
    return Object.values(map)
  } catch(e) { return [] }
}

function ExpandedWhitespaceRow({acct, updateAccount, isLight, onRescore, scoringId}) {
  const [editForm, setEditForm] = useState({name:acct.name||'',hq:acct.hq||'',industry:acct.industry||'',employees:acct.employees||'',revenue:acct.revenue||'',status:acct.status||'Prospect'})
  const [addingNote, setAddingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  // contact state
  const [addingContact, setAddingContact] = useState(false)
  const [contactForm, setContactForm] = useState({name:'',title:'',notes:''})
  const [editingCId, setEditingCId] = useState(null)
  const [editCForm, setEditCForm] = useState({name:'',title:'',notes:''})
  const [hoveredCId, setHoveredCId] = useState(null)
  const [expandedCNotes, setExpandedCNotes] = useState(new Set())
  // tech state
  const [addingTech, setAddingTech] = useState(false)
  const [techForm, setTechForm] = useState({name:'',status:'Unknown',notes:''})
  const [editingTId, setEditingTId] = useState(null)
  const [editTForm, setEditTForm] = useState({name:'',status:'Unknown',notes:''})
  const [hoveredTId, setHoveredTId] = useState(null)
  const [expandedTNotes, setExpandedTNotes] = useState(new Set())

  useEffect(()=>{setEditForm({name:acct.name||'',hq:acct.hq||'',industry:acct.industry||'',employees:acct.employees||'',revenue:acct.revenue||'',status:acct.status||'Prospect'})},[acct.id])
  const inBg = isLight ? '#ffffff' : 'rgba(255,255,255,0.05)'
  const inBdr = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)'
  const allEntries = [
    ...(acct.notes||[]).map(n=>({...n,_src:'note'})),
    ...(acct.intelLog||[]).map(n=>({...n,_src:'intel'}))
  ].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
  const contacts = acct.contacts || []
  const technologies = acct.technologies || []
  const extractedContacts = parseContactsFromEntries(allEntries)
  const extractedTech = parseTechFromEntries(allEntries)
  const TECH_SC = {Customer:{c:'#15803d',bg:'#dcfce7'},Evaluating:{c:'#1d4ed8',bg:'#dbeafe'},Replacing:{c:'#c2410c',bg:'#ffedd5'},Considering:{c:'#7c3aed',bg:'#ede9fe'},Unknown:{c:'#64748b',bg:'#f1f5f9'}}

  const sHdr = (icon,label,count) => (
    <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:10}}>
      <span style={{color:'#94a3b8',display:'flex'}}>{icon}</span>
      <span style={{fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.08em'}}>{label}</span>
      {count>0&&<span style={{fontSize:9,fontWeight:700,color:'#2563eb',background:'#dbeafe',borderRadius:999,padding:'1px 6px',marginLeft:2}}>{count}</span>}
    </div>
  )
  const toggleCNote = id => setExpandedCNotes(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s})
  const toggleTNote = id => setExpandedTNotes(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s})
  const startEditC = c => {setEditingCId(c.id);setEditCForm({name:c.name||'',title:c.title||'',notes:c.notes||''});setAddingContact(false)}
  const saveEditC = () => {if(!editCForm.name.trim())return;updateAccount(acct.id,{contacts:contacts.map(c=>c.id===editingCId?{...c,...editCForm}:c)});setEditingCId(null)}
  const deleteC = id => {if(!window.confirm('Remove this contact?'))return;updateAccount(acct.id,{contacts:contacts.filter(c=>c.id!==id)})}
  const startEditT = t => {setEditingTId(t.id);setEditTForm({name:t.name||'',status:t.status||'Unknown',notes:t.notes||''});setAddingTech(false)}
  const saveEditT = () => {if(!editTForm.name.trim())return;updateAccount(acct.id,{technologies:technologies.map(t=>t.id===editingTId?{...t,...editTForm}:t)});setEditingTId(null)}
  const deleteT = id => {if(!window.confirm('Remove this technology?'))return;updateAccount(acct.id,{technologies:technologies.filter(t=>t.id!==id)})}

  const frmBg = '#f0f9ff'; const frmBdr = '#bfdbfe'
  const frmStyle = {background:frmBg,border:`1px solid ${frmBdr}`,borderRadius:8,padding:12,marginBottom:4}
  const inp = {width:'100%',fontSize:12,padding:'5px 8px',background:'#ffffff',border:'1px solid #bfdbfe',borderRadius:5,color:'#0f172a',boxSizing:'border-box',outline:'none'}
  const lbl = {fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',marginBottom:3,display:'block'}

  return (
    <div style={{padding:'16px 24px 20px',background:isLight?'#f0f9ff':'rgba(37,99,235,0.04)',borderTop:`1px solid ${isLight?'#bfdbfe':'rgba(37,99,235,0.2)'}`}}>
      {/* Top row: Account Details + Notes & Intel */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1.8fr',gap:28,marginBottom:16}}>
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.08em'}}>Account Details</div>
            {onRescore&&<button onClick={()=>onRescore(acct.id)} disabled={scoringId===acct.id} style={{padding:'3px 9px',background:'transparent',border:'1px solid #bfdbfe',borderRadius:5,color:'#2563eb',fontSize:11,fontWeight:600,cursor:scoringId===acct.id?'default':'pointer',opacity:scoringId===acct.id?0.6:1}}>{scoringId===acct.id?'Scoring…':'Rescore'}</button>}
          </div>
          {[{label:'Name',key:'name'},{label:'HQ',key:'hq'},{label:'Industry',key:'industry'},{label:'Employees',key:'employees'},{label:'Revenue',key:'revenue'}].map(f=>(
            <div key={f.key} style={{marginBottom:9}}>
              <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',marginBottom:2}}>{f.label}</div>
              <input value={editForm[f.key]||''} onChange={e=>setEditForm(p=>({...p,[f.key]:e.target.value}))} onBlur={e=>updateAccount(acct.id,{[f.key]:e.target.value})}
                style={{width:'100%',fontSize:12,padding:'5px 8px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:5,color:S.txt,boxSizing:'border-box',outline:'none'}}/>
            </div>
          ))}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',marginBottom:2}}>Status</div>
            <select value={editForm.status||'Prospect'} onChange={e=>{setEditForm(p=>({...p,status:e.target.value}));updateAccount(acct.id,{status:e.target.value})}}
              style={{width:'100%',fontSize:12,padding:'5px 8px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:5,color:S.txt}}>
              {['Prospect','Researching','Reached Out','Active Conversation'].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.08em'}}>Notes & Intel</div>
            <button onClick={()=>setAddingNote(v=>!v)} style={{fontSize:11,color:'#2563eb',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:5,padding:'2px 8px',cursor:'pointer',fontWeight:600}}>+ Add Note</button>
          </div>
          {addingNote&&(
            <div style={{marginBottom:12}}>
              <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} rows={3} placeholder='Add a note...' autoFocus
                style={{width:'100%',fontSize:12,padding:'7px 9px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:6,color:S.txt,boxSizing:'border-box',resize:'none',fontFamily:'inherit',lineHeight:1.5,outline:'none'}}/>
              <div style={{display:'flex',gap:6,marginTop:6}}>
                <button onClick={()=>{if(!noteText.trim())return;updateAccount(acct.id,{notes:[{id:uid(),text:noteText,date:new Date().toISOString().split('T')[0],addedBy:''},...(acct.notes||[])]});setNoteText('');setAddingNote(false)}} style={{padding:'5px 14px',background:'#2563eb',border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save</button>
                <button onClick={()=>{setNoteText('');setAddingNote(false)}} style={{padding:'5px 10px',background:'transparent',border:`1px solid ${inBdr}`,borderRadius:5,color:S.muted,fontSize:12,cursor:'pointer'}}>Cancel</button>
              </div>
            </div>
          )}
          {allEntries.length===0&&!addingNote&&<div style={{fontSize:12,color:S.muted,fontStyle:'italic'}}>No notes yet.</div>}
          <div style={{maxHeight:260,overflowY:'auto',display:'flex',flexDirection:'column',gap:7}}>
            {allEntries.map(n=>(
              <div key={n.id} style={{padding:'8px 10px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:7}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                      <span style={{fontSize:10,color:'#94a3b8'}}>{fmtDate(n.date)}</span>
                      {n._src==='intel'&&<span style={{fontSize:9,fontWeight:700,color:'#7c3aed',background:'#ede9fe',borderRadius:4,padding:'1px 5px',lineHeight:1.4}}>AI</span>}
                    </div>
                    <div style={{fontSize:12,color:S.txt,lineHeight:1.6}}>{n.text}</div>
                  </div>
                  <button onClick={()=>{if(n._src==='intel'){updateAccount(acct.id,{intelLog:(acct.intelLog||[]).filter(x=>x.id!==n.id)})}else{updateAccount(acct.id,{notes:(acct.notes||[]).filter(x=>x.id!==n.id)})}}}
                    style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:13,padding:'0 2px',flexShrink:0,lineHeight:1}}
                    onMouseEnter={e=>e.currentTarget.style.color='#dc2626'} onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom sections stacked */}
      <div style={{borderTop:`1px solid ${isLight?'#bfdbfe':'rgba(37,99,235,0.15)'}`,paddingTop:16,display:'flex',flexDirection:'column',gap:16}}>

        {/* CONTACTS */}
        <div style={{background:isLight?'rgba(37,99,235,0.04)':'rgba(255,255,255,0.02)',border:`1px solid ${isLight?'#dbeafe':'rgba(255,255,255,0.08)'}`,borderRadius:8,padding:'12px 14px'}}>
          {sHdr(<User size={11}/>, 'Contacts Mentioned', contacts.length + extractedContacts.filter(ec=>!contacts.some(c=>c.name.toLowerCase()===ec.name.toLowerCase())).length)}
          {contacts.length===0&&extractedContacts.length===0&&!addingContact&&<div style={{fontSize:12,color:S.muted,marginBottom:8}}>No contacts added yet. Add a contact or process intel to extract mentions.</div>}
          <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:6}}>
            {/* Saved contacts — fully editable */}
            {contacts.map(c=>(
              <div key={c.id}>
                {editingCId===c.id?(
                  <div style={frmStyle}>
                    <div style={{marginBottom:8}}><span style={lbl}>Name *</span><input value={editCForm.name} onChange={e=>setEditCForm(p=>({...p,name:e.target.value}))} autoFocus style={inp}/></div>
                    <div style={{marginBottom:8}}><span style={lbl}>Title</span><input value={editCForm.title} onChange={e=>setEditCForm(p=>({...p,title:e.target.value}))} style={inp}/></div>
                    <div style={{marginBottom:10}}><span style={lbl}>Notes</span><textarea value={editCForm.notes} onChange={e=>setEditCForm(p=>({...p,notes:e.target.value}))} rows={2} style={{...inp,resize:'none',fontFamily:'inherit',lineHeight:1.5}}/></div>
                    <div style={{display:'flex',justifyContent:'flex-end',gap:6}}>
                      <button onClick={()=>setEditingCId(null)} style={{padding:'4px 10px',background:'transparent',border:'1px solid #bfdbfe',borderRadius:5,color:'#64748b',fontSize:11,cursor:'pointer'}}>Cancel</button>
                      <button onClick={saveEditC} style={{padding:'4px 12px',background:'#2563eb',border:'none',borderRadius:5,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
                    </div>
                  </div>
                ):(
                  <div onMouseEnter={()=>setHoveredCId(c.id)} onMouseLeave={()=>setHoveredCId(null)}
                    style={{padding:'7px 9px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:6}}>
                    <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                      <User size={12} style={{color:'#94a3b8',marginTop:2,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',marginBottom:1}}>
                          <span style={{fontSize:13,fontWeight:600,color:isLight?'#0f172a':S.txt}}>{c.name}</span>
                          {c.addedManually&&<span style={{fontSize:9,fontWeight:700,color:'#64748b',background:'#f1f5f9',borderRadius:4,padding:'1px 5px'}}>Manual</span>}
                        </div>
                        {c.title&&<div style={{fontSize:11,color:S.muted,marginBottom:2}}>{c.title}</div>}
                        {c.notes?(
                          <div style={{fontSize:11,color:S.muted,fontStyle:'italic',lineHeight:1.4}}>
                            {expandedCNotes.has(c.id)?c.notes:c.notes.slice(0,80)}
                            {c.notes.length>80&&<button onClick={e=>{e.stopPropagation();toggleCNote(c.id)}} style={{fontSize:10,color:'#2563eb',background:'none',border:'none',cursor:'pointer',padding:'0 0 0 4px',fontStyle:'normal'}}>{expandedCNotes.has(c.id)?'less':'more'}</button>}
                          </div>
                        ):<div style={{fontSize:11,color:'#cbd5e1',fontStyle:'italic'}}>No notes</div>}
                      </div>
                      <div style={{display:'flex',gap:3,flexShrink:0,opacity:hoveredCId===c.id?1:0,transition:'opacity 0.15s'}}>
                        <button onClick={()=>startEditC(c)} title='Edit' style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',padding:'2px',display:'flex',alignItems:'center'}} onMouseEnter={e=>e.currentTarget.style.color='#2563eb'} onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}><Pencil size={12}/></button>
                        <button onClick={()=>deleteC(c.id)} title='Delete' style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',padding:'2px 2px 2px 0',display:'flex',alignItems:'center',fontSize:14,lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color='#dc2626'} onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}>✕</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {/* AI-extracted contacts (read-only, deduped) */}
            {extractedContacts.filter(ec=>!contacts.some(c=>c.name.toLowerCase()===ec.name.toLowerCase())).map((c,ci)=>(
              <div key={'xc'+ci} style={{padding:'7px 9px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:6}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                  <User size={12} style={{color:'#94a3b8',marginTop:2,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',marginBottom:1}}>
                      <span style={{fontSize:13,fontWeight:600,color:isLight?'#0f172a':S.txt}}>{c.name}</span>
                      <span style={{fontSize:9,color:'#7c3aed',background:'#ede9fe',borderRadius:4,padding:'1px 5px',fontWeight:600}}>AI</span>
                      {c.mentions>1&&<span style={{fontSize:9,color:'#64748b',background:'#f1f5f9',borderRadius:4,padding:'1px 5px',fontWeight:600}}>×{c.mentions}</span>}
                    </div>
                    {c.title&&<div style={{fontSize:11,color:S.muted,marginBottom:1}}>{c.title}</div>}
                    {c.contexts[0]&&<div style={{fontSize:11,color:S.muted,fontStyle:'italic',lineHeight:1.4}}>{c.contexts[0].slice(0,80)}{c.contexts[0].length>80?'…':''}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {addingContact?(
            <div style={frmStyle}>
              <div style={{marginBottom:8}}><span style={lbl}>Name *</span><input value={contactForm.name} onChange={e=>setContactForm(p=>({...p,name:e.target.value}))} autoFocus style={inp}/></div>
              <div style={{marginBottom:8}}><span style={lbl}>Title</span><input value={contactForm.title} onChange={e=>setContactForm(p=>({...p,title:e.target.value}))} style={inp}/></div>
              <div style={{marginBottom:10}}><span style={lbl}>Notes</span><textarea value={contactForm.notes} onChange={e=>setContactForm(p=>({...p,notes:e.target.value}))} rows={2} style={{...inp,resize:'none',fontFamily:'inherit',lineHeight:1.5}}/></div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:6}}>
                <button onClick={()=>{setAddingContact(false);setContactForm({name:'',title:'',notes:''})}} style={{padding:'4px 10px',background:'transparent',border:'1px solid #bfdbfe',borderRadius:5,color:'#64748b',fontSize:11,cursor:'pointer'}}>Cancel</button>
                <button onClick={()=>{if(!contactForm.name.trim())return;updateAccount(acct.id,{contacts:[...contacts,{id:uid(),...contactForm,addedManually:true}]});setContactForm({name:'',title:'',notes:''});setAddingContact(false)}} style={{padding:'4px 12px',background:'#2563eb',border:'none',borderRadius:5,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
              </div>
            </div>
          ):(
            <button onClick={()=>{setAddingContact(true);setEditingCId(null)}} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer',padding:0,fontWeight:600}}>+ Add Contact</button>
          )}
        </div>

        {/* TECHNOLOGY */}
        <div style={{background:isLight?'rgba(37,99,235,0.04)':'rgba(255,255,255,0.02)',border:`1px solid ${isLight?'#dbeafe':'rgba(255,255,255,0.08)'}`,borderRadius:8,padding:'12px 14px'}}>
          {sHdr(<Cpu size={11}/>, 'Technology', technologies.length + extractedTech.filter(et=>!technologies.some(t=>t.name.toLowerCase()===et.name.toLowerCase())).length)}
          {technologies.length===0&&extractedTech.length===0&&!addingTech&&<div style={{fontSize:12,color:S.muted,marginBottom:8}}>No technology added yet. Add a vendor or process intel to extract mentions.</div>}
          <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:6}}>
            {/* Saved technologies — fully editable */}
            {technologies.map(t=>{
              const sc=TECH_SC[t.status]||TECH_SC.Unknown
              return (
                <div key={t.id}>
                  {editingTId===t.id?(
                    <div style={frmStyle}>
                      <div style={{marginBottom:8}}><span style={lbl}>Vendor / Technology *</span><input value={editTForm.name} onChange={e=>setEditTForm(p=>({...p,name:e.target.value}))} autoFocus style={inp}/></div>
                      <div style={{marginBottom:8}}><span style={lbl}>Status</span>
                        <select value={editTForm.status} onChange={e=>setEditTForm(p=>({...p,status:e.target.value}))} style={{...inp,padding:'5px 6px'}}>
                          {['Customer','Evaluating','Replacing','Considering','Unknown'].map(s=><option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div style={{marginBottom:10}}><span style={lbl}>Notes</span><textarea value={editTForm.notes} onChange={e=>setEditTForm(p=>({...p,notes:e.target.value}))} rows={2} style={{...inp,resize:'none',fontFamily:'inherit',lineHeight:1.5}}/></div>
                      <div style={{display:'flex',justifyContent:'flex-end',gap:6}}>
                        <button onClick={()=>setEditingTId(null)} style={{padding:'4px 10px',background:'transparent',border:'1px solid #bfdbfe',borderRadius:5,color:'#64748b',fontSize:11,cursor:'pointer'}}>Cancel</button>
                        <button onClick={saveEditT} style={{padding:'4px 12px',background:'#2563eb',border:'none',borderRadius:5,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
                      </div>
                    </div>
                  ):(
                    <div onMouseEnter={()=>setHoveredTId(t.id)} onMouseLeave={()=>setHoveredTId(null)}
                      style={{padding:'7px 9px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:6}}>
                      <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:sc.c,flexShrink:0,marginTop:3}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',marginBottom:1}}>
                            <span style={{fontSize:13,fontWeight:600,color:isLight?'#0f172a':S.txt}}>{t.name}</span>
                            <span style={{fontSize:9,fontWeight:700,color:sc.c,background:sc.bg,borderRadius:4,padding:'1px 6px'}}>{t.status}</span>
                            {t.addedManually&&<span style={{fontSize:9,fontWeight:700,color:'#64748b',background:'#f1f5f9',borderRadius:4,padding:'1px 5px'}}>Manual</span>}
                          </div>
                          {t.notes?(
                            <div style={{fontSize:11,color:S.muted,fontStyle:'italic',lineHeight:1.4}}>
                              {expandedTNotes.has(t.id)?t.notes:t.notes.slice(0,80)}
                              {t.notes.length>80&&<button onClick={e=>{e.stopPropagation();toggleTNote(t.id)}} style={{fontSize:10,color:'#2563eb',background:'none',border:'none',cursor:'pointer',padding:'0 0 0 4px',fontStyle:'normal'}}>{expandedTNotes.has(t.id)?'less':'more'}</button>}
                            </div>
                          ):<div style={{fontSize:11,color:'#cbd5e1',fontStyle:'italic'}}>No notes</div>}
                        </div>
                        <div style={{display:'flex',gap:3,flexShrink:0,opacity:hoveredTId===t.id?1:0,transition:'opacity 0.15s'}}>
                          <button onClick={()=>startEditT(t)} title='Edit' style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',padding:'2px',display:'flex',alignItems:'center'}} onMouseEnter={e=>e.currentTarget.style.color='#2563eb'} onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}><Pencil size={12}/></button>
                          <button onClick={()=>deleteT(t.id)} title='Delete' style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',padding:'2px 2px 2px 0',display:'flex',alignItems:'center',fontSize:14,lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color='#dc2626'} onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}>✕</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {/* AI-extracted tech (read-only, deduped) */}
            {extractedTech.filter(et=>!technologies.some(t=>t.name.toLowerCase()===et.name.toLowerCase())).map((t,ti)=>{
              const sc=TECH_SC[t.status]||TECH_SC.Unknown
              return (
                <div key={'xt'+ti} style={{padding:'7px 9px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:6}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:sc.c,flexShrink:0,marginTop:3}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',marginBottom:1}}>
                        <span style={{fontSize:13,fontWeight:600,color:isLight?'#0f172a':S.txt}}>{t.name}</span>
                        <span style={{fontSize:9,fontWeight:700,color:sc.c,background:sc.bg,borderRadius:4,padding:'1px 6px'}}>{t.status}</span>
                        <span style={{fontSize:9,color:'#7c3aed',background:'#ede9fe',borderRadius:4,padding:'1px 5px',fontWeight:600}}>AI</span>
                        {t.mentions>1&&<span style={{fontSize:9,color:'#64748b',background:'#f1f5f9',borderRadius:4,padding:'1px 5px',fontWeight:600}}>×{t.mentions}</span>}
                      </div>
                      {t.contexts[0]&&<div style={{fontSize:11,color:S.muted,fontStyle:'italic',lineHeight:1.4}}>{t.contexts[0].slice(0,80)}{t.contexts[0].length>80?'…':''}</div>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {addingTech?(
            <div style={frmStyle}>
              <div style={{marginBottom:8}}><span style={lbl}>Vendor / Technology *</span><input value={techForm.name} onChange={e=>setTechForm(p=>({...p,name:e.target.value}))} autoFocus style={inp}/></div>
              <div style={{marginBottom:8}}><span style={lbl}>Status</span>
                <select value={techForm.status} onChange={e=>setTechForm(p=>({...p,status:e.target.value}))} style={{...inp,padding:'5px 6px'}}>
                  {['Customer','Evaluating','Replacing','Considering','Unknown'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{marginBottom:10}}><span style={lbl}>Notes</span><textarea value={techForm.notes} onChange={e=>setTechForm(p=>({...p,notes:e.target.value}))} rows={2} style={{...inp,resize:'none',fontFamily:'inherit',lineHeight:1.5}}/></div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:6}}>
                <button onClick={()=>{setAddingTech(false);setTechForm({name:'',status:'Unknown',notes:''})}} style={{padding:'4px 10px',background:'transparent',border:'1px solid #bfdbfe',borderRadius:5,color:'#64748b',fontSize:11,cursor:'pointer'}}>Cancel</button>
                <button onClick={()=>{if(!techForm.name.trim())return;updateAccount(acct.id,{technologies:[...technologies,{id:uid(),...techForm,addedManually:true}]});setTechForm({name:'',status:'Unknown',notes:''});setAddingTech(false)}} style={{padding:'4px 12px',background:'#2563eb',border:'none',borderRadius:5,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
              </div>
            </div>
          ):(
            <button onClick={()=>{setAddingTech(true);setEditingTId(null)}} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer',padding:0,fontWeight:600}}>+ Add Technology</button>
          )}
        </div>
      </div>
    </div>
  )
}

const fuzzyMatchAccount = (name1, name2) => {
  if (!name1 || !name2) return false
  const clean = s => s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(inc|llc|ltd|corp|co|the|and|or|of|go to|goto)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const a = clean(name1)
  const b = clean(name2)
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const bigrams = s => { const bg=new Set(); for(let i=0;i<s.length-1;i++) bg.add(s.slice(i,i+2)); return bg }
  const bg1=bigrams(a), bg2=bigrams(b)
  let matches=0; bg2.forEach(bg=>{if(bg1.has(bg))matches++})
  const similarity = (2*matches)/(bg1.size+bg2.size)
  if (similarity > 0.7) return true
  const words1=a.split(' ').filter(w=>w.length>2)
  const words2=b.split(' ').filter(w=>w.length>2)
  const sharedWords=words1.filter(w=>words2.includes(w))
  if (sharedWords.length>0 && (sharedWords.length/Math.min(words1.length||1,words2.length||1))>0.6) return true
  return false
}

const fuzzyBigramScore = (name1, name2) => {
  if (!name1 || !name2) return 0
  const clean = s => s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(inc|llc|ltd|corp|co|the|and|or|of|go to|goto)\b/g,'').replace(/\s+/g,' ').trim()
  const a=clean(name1), b=clean(name2)
  if (a===b) return 1
  if (a.includes(b)||b.includes(a)) return 0.85
  const bigrams = s => { const bg=new Set(); for(let i=0;i<s.length-1;i++) bg.add(s.slice(i,i+2)); return bg }
  const bg1=bigrams(a), bg2=bigrams(b)
  if (!bg1.size&&!bg2.size) return 0
  let matches=0; bg2.forEach(bg=>{if(bg1.has(bg))matches++})
  return (2*matches)/(bg1.size+bg2.size)
}

function WhitespacePage({data, setData, theme, setTheme, onBack}) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('Recently Added')
  const [statusFilter, setStatusFilter] = useState('All')
  const [expandedId, setExpandedId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({name:'',hq:'',industry:'',employees:'',revenue:'',status:'Prospect',notes:''})
  const [hoveredId, setHoveredId] = useState(null)
  const [bannerOpen, setBannerOpen] = useState(false)
  const [showIntel, setShowIntel] = useState(false)
  const [intelText, setIntelText] = useState('')
  const [intelDate, setIntelDate] = useState('')
  const [intelLoading, setIntelLoading] = useState(false)
  const [intelError, setIntelError] = useState('')
  const [intelStatus, setIntelStatus] = useState('')
  const [pendingIntel, setPendingIntel] = useState(null)
  const [selectedIntel, setSelectedIntel] = useState(new Set())
  const [editingNameIdx, setEditingNameIdx] = useState(null)
  const [editingNameDraft, setEditingNameDraft] = useState('')
  const [pendingNames, setPendingNames] = useState({})

  // File upload state for Add Intelligence modal
  const [wsUploadedFile, setWsUploadedFile] = useState(null)
  const [wsFileLoading, setWsFileLoading] = useState(false)
  const [wsFileError, setWsFileError] = useState('')
  const [wsFileStatus, setWsFileStatus] = useState('')
  const [wsDragOver, setWsDragOver] = useState(false)
  const wsFileInputRef = useRef(null)
  const [wsPendingFile, setWsPendingFile] = useState(null)
  const [wsFileIsDirectType, setWsFileIsDirectType] = useState(false)
  const [wsShowDate, setWsShowDate] = useState(false)
  const [wsCustomDate, setWsCustomDate] = useState('')
  const [wsPendingDate, setWsPendingDate] = useState('')
  const [wsRetryStatus, setWsRetryStatus] = useState('')
  const [wsLargeDocWarning, setWsLargeDocWarning] = useState(false)
  const [wsFileCharCount, setWsFileCharCount] = useState(0)
  const [wsDateModalIsFile, setWsDateModalIsFile] = useState(false)

  // Merge & dedup state
  const [showMerge, setShowMerge] = useState(false)
  const [mergeStep, setMergeStep] = useState(1)
  const [mergeSelected, setMergeSelected] = useState(new Set())
  const [mergePrimary, setMergePrimary] = useState(null)
  const [mergeSearch, setMergeSearch] = useState('')
  const [showDupeReview, setShowDupeReview] = useState(false)
  const [dupeDismissed, setDupeDismissed] = useState(false)
  const [addDupeWarning, setAddDupeWarning] = useState(null)
  const [mergeToast, setMergeToast] = useState('')
  const [showAutoFillModal, setShowAutoFillModal] = useState(false)
  const [showCleanNotesModal, setShowCleanNotesModal] = useState(false)
  const [aiOpRunning, setAiOpRunning] = useState(false)
  const [aiOpProgress, setAiOpProgress] = useState('')
  const [aiOpSummary, setAiOpSummary] = useState('')
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef(null)
  const [recOpen, setRecOpen] = useState(false)
  const [recLoading, setRecLoading] = useState(false)
  const [recError, setRecError] = useState('')
  const [wsToast, setWsToast] = useState('')
  const [scoringAll, setScoringAll] = useState(false)
  const [scoringId, setScoringId] = useState(null)
  const [scoreProgress, setScoreProgress] = useState('')
  const mob = typeof window !== 'undefined' && window.innerWidth < 768
  const [mobFilterOpen, setMobFilterOpen] = useState(false)
  const [selectedForExport, setSelectedForExport] = useState(new Set())

  const ws = data.whitespaceAccounts || []
  const isLight = S.isLight
  const effectiveKey = data.apiKey || ''

  // Detect duplicate pairs among existing accounts
  const dupePairs = []
  for (let i=0;i<ws.length;i++) for (let j=i+1;j<ws.length;j++) if (fuzzyMatchAccount(ws[i].name,ws[j].name)) dupePairs.push([ws[i],ws[j]])
  const STATUS_ORDER = {'Active Conversation':0,'Reached Out':1,'Researching':2,'Prospect':3}
  const STATUS_COLORS = {Prospect:'#64748b',Researching:'#2563eb','Reached Out':'#ea580c','Active Conversation':'#0ebc5f'}
  const SORT_OPTS = ['Recently Added','Recently Updated','Name A-Z','Name Z-A','Status','Industry','Employees','Revenue','Intel','Sort by Opportunity','Hot']
  const STATUS_OPTS = ['All','Prospect','Researching','Reached Out','Active Conversation']

  const parseNum = s => {if(!s)return 0;const n=String(s).replace(/[$,\s]/g,'').toLowerCase();if(n.endsWith('k'))return parseFloat(n)*1000||0;if(n.endsWith('m'))return parseFloat(n)*1000000||0;if(n.endsWith('b'))return parseFloat(n)*1000000000||0;return parseFloat(n)||0}
  const fmtRel = iso => {if(!iso)return '';const d=Math.floor((new Date()-new Date(iso))/86400000);if(d===0)return 'Today';if(d===1)return 'Yesterday';if(d<7)return `${d}d ago`;if(d<30)return `${Math.floor(d/7)}w ago`;return `${Math.floor(d/30)}mo ago`}

  const filtered = ws.filter(a=>{
    if(statusFilter!=='All'&&a.status!==statusFilter)return false
    if(search.trim()){const q=search.toLowerCase();if(!`${a.name} ${a.hq} ${a.industry}`.toLowerCase().includes(q))return false}
    return true
  })
  const sorted = [...filtered].sort((a,b)=>{
    switch(sort){
      case 'Name A-Z':return(a.name||'').localeCompare(b.name||'')
      case 'Name Z-A':return(b.name||'').localeCompare(a.name||'')
      case 'Status':return(STATUS_ORDER[a.status]||3)-(STATUS_ORDER[b.status]||3)
      case 'Industry':return(a.industry||'').localeCompare(b.industry||'')
      case 'Employees':return parseNum(b.employees)-parseNum(a.employees)
      case 'Revenue':return parseNum(b.revenue)-parseNum(a.revenue)
      case 'Recently Updated':return(b.updatedAt||'').localeCompare(a.updatedAt||'')
      case 'Intel':return((b.intelLog||[]).length+(b.notes||[]).length)-((a.intelLog||[]).length+(a.notes||[]).length)
      case 'Sort by Opportunity':return(b.ai_opportunity_score||0)-(a.ai_opportunity_score||0)
      case 'Hot':return(isHot(b)?1:0)-(isHot(a)?1:0)
      default:return(b.addedAt||'').localeCompare(a.addedAt||'')
    }
  })

  const flameThreshold = (()=>{
    const scores = ws.filter(a=>a.ai_opportunity_score!=null).map(a=>a.ai_opportunity_score).sort((a,b)=>a-b)
    console.log('[FlameScore] scored:', scores.length, '/', ws.length, '— scores:', scores)
    if (scores.length === 0) return Infinity
    if (scores.length < 4) {
      // not enough accounts for percentile — use absolute cutoff of 75
      const threshold = 75
      console.log('[FlameScore] <4 scored, using absolute threshold:', threshold)
      return threshold
    }
    const p75 = scores[Math.floor(scores.length*0.75)]
    const p80 = scores[Math.min(Math.floor(scores.length*0.80),scores.length-1)]
    const threshold = (p75+p80)/2
    console.log('[FlameScore] p75=', p75, 'p80=', p80, 'threshold=', threshold)
    return threshold
  })()

  const isHot = (a) => {
    if (a.ai_opportunity_score != null) return a.ai_opportunity_score >= flameThreshold
    const signals = [
      ((a.intelLog||[]).length + (a.notes||[]).length) >= 3,
      a.status === 'Active Conversation',
      a.status === 'Reached Out',
      (a.contacts||[]).length >= 1,
      (a.technologies||[]).length >= 1,
      a.employees && parseInt(a.employees.replace(/\D/g,'')) >= 1000,
    ]
    return signals.filter(Boolean).length >= 2
  }

  const updateAccount = (id, changes) => {
    const now = new Date().toISOString()
    if (changes.status === 'Active Conversation') {
      const wsAcct = (data.whitespaceAccounts||[]).find(a => a.id === id)
      if (wsAcct && wsAcct.status !== 'Active Conversation') {
        const accountName = wsAcct.name || ''
        const existingAccount = (data.accounts||[]).find(a =>
          a.name.toLowerCase() === accountName.toLowerCase()
        )
        if (!existingAccount) {
          const newAcct = {
            id: uid(),
            name: wsAcct.name,
            short: wsAcct.name.slice(0,6).toUpperCase(),
            industry: wsAcct.industry || '',
            hq: wsAcct.hq || '',
            employees: wsAcct.employees || '',
            revenue: wsAcct.revenue || '',
            status: 'Prospect',
            health: 50,
            lastContact: '',
            notes: '',
            endpoints: '',
            cloud: '',
            users: '',
            relationship: '',
            contacts: [],
            followUps: [],
            projects: [],
            techStack: [],
            interactions: [],
            intelLog: wsAcct.intelLog || [],
            files: [],
            savedLinks: [],
            adminData: {},
            upcomingDates: [],
            unknownMentions: [],
            relSuggestions: [],
            contactSuggestions: [],
            dismissedAlerts: [],
            snoozedAlerts: [],
            healthScoreOverrides: {},
            healthScoreHistory: [],
            aiHistory: [],
            logoImage: '',
            orgChart: {nodes: []},
            createdAt: new Date().toISOString(),
            createdFromWhitespace: true
          }
          setData(prev => ({
            ...prev,
            whitespaceAccounts: (prev.whitespaceAccounts||[]).map(a => a.id===id ? {...a,...changes,updatedAt:now} : a),
            accounts: [...(prev.accounts||[]), newAcct]
          }))
          setWsToast(`${accountName} moved to Active Conversation — added to your accounts dashboard`)
          setTimeout(() => setWsToast(''), 4000)
          return
        }
      }
    }
    setData(prev=>({...prev,whitespaceAccounts:(prev.whitespaceAccounts||[]).map(a=>a.id===id?{...a,...changes,updatedAt:now}:a)}))
  }
  const deleteAccount = id => {
    if(!window.confirm('Delete this whitespace account?'))return
    setData(prev=>({...prev,whitespaceAccounts:(prev.whitespaceAccounts||[]).filter(a=>a.id!==id)}))
    if(expandedId===id)setExpandedId(null)
  }
  const addAccount = () => {
    if(!addForm.name.trim())return
    if (!addDupeWarning) {
      const match = (data.whitespaceAccounts||[]).find(a=>fuzzyMatchAccount(addForm.name, a.name))
      if (match) { setAddDupeWarning({match}); return }
    }
    const now = new Date().toISOString()
    const newA = {id:uid(),name:addForm.name,hq:addForm.hq,industry:addForm.industry,employees:addForm.employees,revenue:addForm.revenue,status:addForm.status,contacts:[],technologies:[],notes:addForm.notes?[{id:uid(),text:addForm.notes,date:new Date().toISOString().split('T')[0],addedBy:''}]:[],intelLog:[],addedAt:now,updatedAt:now}
    setData(prev=>({...prev,whitespaceAccounts:[...(prev.whitespaceAccounts||[]),newA]}))
    setAddForm({name:'',hq:'',industry:'',employees:'',revenue:'',status:'Prospect',notes:''})
    setShowAdd(false)
    setAddDupeWarning(null)
  }

  const escapeCSV = val => {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (/[,"\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"'
    return str
  }

  const exportSummaryCSV = () => {
    const headers = ['Account Name','HQ','Industry','Employees','Revenue']
    const rows = ws.map(a => [escapeCSV(a.name),escapeCSV(a.hq),escapeCSV(a.industry),escapeCSV(a.employees),escapeCSV(a.revenue)].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], {type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'whitespace-summary.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  const exportSelectedFullDetailsCSV = () => {
    const sel = ws.filter(a => selectedForExport.has(a.id))
    if (sel.length === 0) { alert('Select at least one account to export.'); return }
    const headers = ['Account Name','HQ','Industry','Employees','Revenue','Status','Contacts','Technologies','Notes','Intel Log','AI Score','AI Score Reasoning','Added','Updated']
    const rows = sel.map(a => {
      const notes = (a.notes||[]).map(n=>`[${n.date||''}] ${n.text||''}`).join(' | ')
      const intel = (a.intelLog||[]).map(n=>`[${n.date||''}] ${n.summary||n.text||''}`).join(' | ')
      return [
        escapeCSV(a.name), escapeCSV(a.hq), escapeCSV(a.industry),
        escapeCSV(a.employees), escapeCSV(a.revenue), escapeCSV(a.status),
        escapeCSV((a.contacts||[]).map(c=>c.name||c).join('; ')),
        escapeCSV((a.technologies||[]).join('; ')),
        escapeCSV(notes), escapeCSV(intel),
        escapeCSV(a.ai_opportunity_score!=null?String(a.ai_opportunity_score):''),
        escapeCSV(a.ai_score_reasoning||''),
        escapeCSV(a.addedAt||''), escapeCSV(a.updatedAt||''),
      ].join(',')
    })
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], {type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'whitespace-selected-full-details.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  const handleAutoFill = async () => {
    if (!effectiveKey) { alert('Add your Anthropic API key in Settings first.'); return }
    const missing = ws.filter(a => !a.employees || !a.revenue)
    if (missing.length === 0) { alert('All accounts already have employee and revenue data!'); return }
    setShowAutoFillModal(false)
    setAiOpRunning(true); setAiOpSummary(''); setAiOpProgress('')
    let updatedCount = 0
    for (let i = 0; i < missing.length; i++) {
      const account = missing[i]
      setAiOpProgress(`Processing ${i+1} of ${missing.length}: ${account.name}…`)
      try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {'Content-Type':'application/json','x-api-key':effectiveKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 600,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{role:'user',content:`Research the employee count and annual revenue for ${account.name}${account.hq?' headquartered in '+account.hq:''}${account.industry?' in the '+account.industry+' industry':''}. Search up to 3 trusted sources (company website, LinkedIn, Crunchbase, Pitchbook, public filings, press releases). Rules: (1) employees must be a single rounded integer — never a range, never use ~, never write "approximately" — if you find multiple estimates average them and round to the nearest 100 or 1000 as appropriate; (2) revenue must be a clean short string like $500M or $1.2B — no ~, no approximation language, no "around"; (3) if you cannot find reliable data for a field return an empty string for that field; (4) do not hallucinate or invent numbers. Return ONLY valid JSON with no other text: {"employees":"single integer as string e.g. 5000","revenue":"clean string e.g. $500M","source":"brief description of sources used"}`}]
          })
        })
        const result = await resp.json()
        let parsed = null
        for (const block of (result.content || [])) {
          if (block.type === 'text') {
            try { parsed = JSON.parse(block.text) } catch {
              const m = block.text.match(/\{[\s\S]*?\}/)
              if (m) try { parsed = JSON.parse(m[0]) } catch {}
            }
            if (parsed) break
          }
        }
        if (parsed) {
          const changes = {}
          const empRaw = parsed.employees ? String(parsed.employees).replace(/[~≈,\s]/g,'').trim() : ''
          const revRaw = parsed.revenue ? String(parsed.revenue).replace(/[~≈]/g,'').trim() : ''
          const empClean = empRaw && !empRaw.includes('-') && empRaw !== 'Notfound' ? empRaw : ''
          const revClean = revRaw && revRaw !== 'Notfound' ? revRaw : ''
          if (!account.employees && empClean) changes.employees = empClean
          if (!account.revenue && revClean) changes.revenue = revClean
          if (parsed.source && (changes.employees || changes.revenue)) changes.employeeSource = String(parsed.source)
          if (Object.keys(changes).length > 0) { updateAccount(account.id, changes); updatedCount++ }
        }
      } catch (err) { console.error(`Auto-fill failed for ${account.name}:`, err) }
    }
    setAiOpRunning(false); setAiOpProgress('')
    setAiOpSummary(`Updated ${updatedCount} of ${missing.length} accounts with employee and revenue data`)
  }

  const handleCleanNotes = async () => {
    if (!effectiveKey) { alert('Add your Anthropic API key in Settings first.'); return }
    const accts = ws.filter(a => ((a.intelLog||[]).length + (a.notes||[]).length) > 2)
    if (accts.length === 0) { alert('No accounts with more than 2 notes entries found.'); return }
    setShowCleanNotesModal(false)
    setAiOpRunning(true); setAiOpSummary(''); setAiOpProgress('')
    let updatedCount = 0
    for (let i = 0; i < accts.length; i++) {
      const account = accts[i]
      setAiOpProgress(`Cleaning notes for ${i+1} of ${accts.length}: ${account.name}…`)
      const allNotesText = [
        ...(account.notes||[]).map(n => `[${n.date||''}] ${n.text||''}`),
        ...(account.intelLog||[]).map(n => `[${n.date||''}] ${n.summary||n.text||''}`)
      ].join('\n\n')
      try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {'Content-Type':'application/json','x-api-key':effectiveKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            messages: [{role:'user',content:`You are cleaning up sales intelligence notes for ${account.name}. Here are all the notes and intel entries:\n\n${allNotesText}\n\nConsolidate these into clean, non-redundant notes. Rules: (1) Keep ALL unique facts, details, contacts, and intel — do not lose any real information. (2) Remove duplicate sentences and repetitive summaries. (3) Combine similar points into single clear statements. (4) Keep chronological context where relevant. (5) Return ONLY the cleaned notes as plain text, no headers, no JSON. Maximum 500 words.`}]
          })
        })
        const result = await resp.json()
        const text = (result.content||[]).find(b=>b.type==='text')?.text
        if (text) {
          const today = new Date().toISOString().split('T')[0]
          const cleanedEntry = { id: uid(), text: text.trim(), date: today, addedBy: 'AI Dedup' }
          updateAccount(account.id, {
            notes: [cleanedEntry],
            intelLog: [],
            intelArchive: [...(account.intelLog||[]), ...(account.notes||[])]
          })
          updatedCount++
        }
      } catch (err) { console.error(`Note clean failed for ${account.name}:`, err) }
    }
    setAiOpRunning(false); setAiOpProgress('')
    setAiOpSummary(`Cleaned and consolidated notes for ${updatedCount} of ${accts.length} accounts`)
  }

  useEffect(()=>{
    if(!showMoreMenu)return
    const h=e=>{if(moreMenuRef.current&&!moreMenuRef.current.contains(e.target))setShowMoreMenu(false)}
    document.addEventListener('mousedown',h)
    return()=>document.removeEventListener('mousedown',h)
  },[showMoreMenu])

  const fetchRecommendations = async () => {
    if (!effectiveKey) { setRecError('Add your Anthropic API key in Settings first.'); return }
    setRecLoading(true); setRecError('')
    const dismissed = data.dismissedWhitespaceSuggestions || []
    const context = {
      whitespaceAccounts: ws.map(a => ({
        name: a.name, status: a.status, employees: a.employees, revenue: a.revenue,
        industry: a.industry, hq: a.hq,
        intelCount: ((a.intelLog||[]).length + (a.notes||[]).length),
        lastIntel: ([...(a.intelLog||[]),...(a.notes||[])].sort((x,y)=>(y.date||'').localeCompare(x.date||''))[0]?.date)||'',
        contacts: (a.contacts||[]).map(c=>c.name),
        technologies: (a.technologies||[]).map(t=>t.vendor),
        notes: [...(a.intelLog||[]),...(a.notes||[])].slice(0,2).map(n=>n.summary||n.text||'').join(' ').slice(0,300)
      })),
      myAccounts: (data.accounts||[]).map(a=>({name:a.name, contacts:(a.contacts||[]).map(c=>c.name)}))
    }
    const dismissedNote = dismissed.length > 0 ? `\n\nDo NOT include these previously dismissed accounts: ${dismissed.join(', ')}` : ''
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':effectiveKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body: JSON.stringify({
          model:'claude-sonnet-4-6',
          max_tokens:2000,
          system:'You are a cybersecurity sales advisor helping an Enterprise Client Manager at GuidePoint Security prioritize whitespace accounts to pursue. Analyze the accounts and identify the top 10 highest priority targets.',
          messages:[{role:'user',content:`Here is my whitespace account data and my existing named accounts:\n${JSON.stringify(context,null,2)}${dismissedNote}\n\nIdentify the TOP 10 whitespace accounts to prioritize RIGHT NOW. For each account return:\n- name: exact account name from the data\n- priority: "Hot" | "Warm" | "Watch"\n- reasons: array of exactly 3 short bullet points explaining why (mention specific signals like known contacts, intel activity, direct contracts, vendor relationships, industry urgency, employee size, revenue)\n\nReturn ONLY valid JSON:\n{"recommendations":[{"name":"...","priority":"Hot","reasons":["...","...","..."]}]}`}]
        })
      })
      const result = await resp.json()
      if (result.error) throw new Error(result.error.message)
      const text = (result.content||[]).find(b=>b.type==='text')?.text||''
      const parsed = extractJSON(text)
      const recs = parsed?.recommendations || []
      setData(prev=>({...prev, whitespaceRecommendations: recs}))
    } catch(err) {
      console.error('Recommendations error:', err)
      setRecError('Failed to get recommendations. Check your API key.')
    } finally {
      setRecLoading(false)
    }
  }

  const scoreOneAccount = async (acct) => {
    const empN = parseNum(acct.employees||'')
    const empTier = empN<=1000?'Under 1,000 (lowest weight)':empN<=3500?'1,001–3,500 (low-medium weight)':empN<=6000?'3,501–6,000 (medium weight)':empN<=15000?'6,001–15,000 (medium-high weight)':empN<=40000?'15,001–40,000 (high weight)':'40,001+ (highest weight)'
    const allNotes = [...(acct.intelLog||[]).map(n=>n.summary||n.text||''),...(acct.notes||[]).map(n=>n.text||'')].filter(Boolean)
    const lastIntelDate = [...(acct.intelLog||[]),...(acct.notes||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0]?.date||''
    const ctx = {name:acct.name,hq:acct.hq||'',employees:acct.employees||'',employeeTier:empTier,revenue:acct.revenue||'',status:acct.status||'',industry:acct.industry||'',vendors:(acct.technologies||[]).map(t=>({name:t.name,status:t.status})),contacts:(acct.contacts||[]).map(c=>c.name),notes:allNotes.slice(0,8),lastIntelDate,intelCount:allNotes.length}
    const prompt = `You are a cybersecurity sales scoring engine for GuidePoint Security. Score this whitespace prospect's AI opportunity score from 1-100.\n\nAccount:\n${JSON.stringify(ctx,null,2)}\n\nWeighting:\n- Employee count tier: ${empTier}\n  Exact tiers: Under 1,000=lowest weight | 1,001-3,500=low-medium weight | 3,501-6,000=medium weight | 6,001-15,000=medium-high weight | 15,001-40,000=high weight | 40,001+=highest weight\n- Revenue: higher revenue scores higher\n- Notes/intel: active evaluations, renewals, vendor dissatisfaction, budget cycles, known gaps score higher\n- Displacement opportunity: incumbent vendors GuidePoint could displace score higher\n- Whitespace coverage: fewer known vendors = more opportunity = higher score\n- Intel recency: recent notes score higher than stale or empty\n\nReturn ONLY valid JSON, no preamble or markdown:\n{"score":<integer 1-100>,"reasoning":"<1-2 sentences on the top factors>"}`
    const {data:result} = await callClaudeWithRetry({model:'claude-sonnet-4-6',max_tokens:300,messages:[{role:'user',content:prompt}]},effectiveKey)
    if (result.error) throw new Error(result.error.message)
    const text = (result.content||[]).find(b=>b.type==='text')?.text||''
    const parsed = extractJSON(text)
    if (!parsed?.score) throw new Error('Invalid score response')
    return {score:parsed.score,reasoning:parsed.reasoning||''}
  }

  const scoreAllAccounts = async () => {
    if (!effectiveKey) {alert('Add your Anthropic API key in Settings first.');return}
    const unscored = ws.filter(a=>a.ai_opportunity_score==null)
    if (!unscored.length) {alert('All accounts are already scored. Use Rescore on individual accounts to refresh.');return}
    setScoringAll(true)
    let done = 0
    for (const acct of unscored) {
      setScoreProgress(`Scoring ${acct.name}… (${done+1}/${unscored.length})`)
      try {
        const {score,reasoning} = await scoreOneAccount(acct)
        console.log(`[Score] ✓ ${acct.name}: score=${score}, reasoning="${reasoning}"`)
        setData(prev=>({...prev,whitespaceAccounts:(prev.whitespaceAccounts||[]).map(a=>a.id===acct.id?{...a,ai_opportunity_score:score,ai_score_reasoning:reasoning,ai_score_updated_at:new Date().toISOString()}:a)}))
        done++
      } catch(err){console.error(`Score failed for ${acct.name}:`,err)}
    }
    setScoringAll(false); setScoreProgress('')
  }

  const rescoreAccount = async (acctId) => {
    if (!effectiveKey) {alert('Add your Anthropic API key in Settings first.');return}
    const acct = ws.find(a=>a.id===acctId); if(!acct)return
    setScoringId(acctId)
    try {
      const {score,reasoning} = await scoreOneAccount(acct)
      console.log(`[Rescore] ✓ ${acct.name}: score=${score}, reasoning="${reasoning}"`)
      setData(prev=>({...prev,whitespaceAccounts:(prev.whitespaceAccounts||[]).map(a=>a.id===acctId?{...a,ai_opportunity_score:score,ai_score_reasoning:reasoning,ai_score_updated_at:new Date().toISOString()}:a)}))
    } catch(err){console.error(`Rescore failed for ${acct.name}:`,err)}
    finally{setScoringId(null)}
  }

  const executeMerge = async () => {
    if (mergeSelected.size < 2 || !mergePrimary) return
    const selectedIds = [...mergeSelected]
    console.log('Merge clicked, selected:', selectedIds, 'primary:', mergePrimary)
    const primary = ws.find(a=>a.id===mergePrimary)
    if (!primary) { console.warn('Primary account not found:', mergePrimary); return }
    const others = ws.filter(a=>mergeSelected.has(a.id)&&a.id!==mergePrimary)
    const allIntelLog = [...(primary.intelLog||[]),...others.flatMap(a=>a.intelLog||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
    const allNotes = [...(primary.notes||[]),...others.flatMap(a=>a.notes||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
    const contactMap = new Map()
    ;[...(primary.contacts||[]),...others.flatMap(a=>a.contacts||[])].forEach(c=>{const k=((c.email||'').toLowerCase().trim()||(c.name||'').toLowerCase().trim());if(!contactMap.has(k))contactMap.set(k,c)})
    const techMap = new Map()
    ;[...(primary.technologies||[]),...others.flatMap(a=>a.technologies||[])].forEach(t=>{const k=(t.vendor||'').toLowerCase().trim();if(!techMap.has(k))techMap.set(k,t)})
    const histMap = new Map()
    ;[...(primary.aiHistory||[]),...others.flatMap(a=>a.aiHistory||[])].forEach(h=>{if(!histMap.has(h.id))histMap.set(h.id,h)})
    const fuMap = new Map()
    ;[...(primary.followUps||[]),...others.flatMap(a=>a.followUps||[])].forEach(fu=>{if(!fuMap.has(fu.id))fuMap.set(fu.id,fu)})
    const projMap = new Map()
    ;[...(primary.projects||[]),...others.flatMap(a=>a.projects||[])].forEach(proj=>{if(!projMap.has(proj.id))projMap.set(proj.id,proj)})
    const mergedAccount = {
      ...primary,
      notes: allNotes,
      intelLog: allIntelLog,
      contacts: [...contactMap.values()],
      technologies: [...techMap.values()],
      aiHistory: [...histMap.values()],
      followUps: [...fuMap.values()],
      projects: [...projMap.values()],
      updatedAt: new Date().toISOString()
    }
    const allSelectedIds = [...mergeSelected]
    const newWhitespaceAccounts = [...(ws.filter(a=>!allSelectedIds.includes(a.id))), mergedAccount]
    const mergedData = {...data, whitespaceAccounts: newWhitespaceAccounts}
    setData(prev=>({...prev, whitespaceAccounts: newWhitespaceAccounts}))
    window._lastDirectSave = Date.now()
    try {
      await saveData(mergedData)
    } catch(e) {
      console.error('Merge save failed:', e)
      setMergeToast('Merge failed to save — please try again')
      setTimeout(()=>setMergeToast(''),4000)
      return
    }
    const msg = `${mergeSelected.size} accounts merged into "${primary.name}"`
    setMergeToast(msg); setTimeout(()=>setMergeToast(''),4000)
    setShowMerge(false); setMergeSelected(new Set()); setMergePrimary(null); setMergeStep(1); setMergeSearch('')
  }

  const handleDupeAction = (action, pairA, pairB) => {
    if (action==='keepA') {
      setData(prev=>({...prev,whitespaceAccounts:prev.whitespaceAccounts.filter(a=>a.id!==pairB.id)}))
    } else if (action==='keepB') {
      setData(prev=>({...prev,whitespaceAccounts:prev.whitespaceAccounts.filter(a=>a.id!==pairA.id)}))
    } else if (action==='merge') {
      const allNotes=[...(pairA.notes||[]),...(pairB.notes||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
      const allIntelLog=[...(pairA.intelLog||[]),...(pairB.intelLog||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
      const contactMap=new Map(); [...(pairA.contacts||[]),...(pairB.contacts||[])].forEach(c=>{const k=(c.name||'').toLowerCase();if(!contactMap.has(k))contactMap.set(k,c)})
      const techMap=new Map(); [...(pairA.technologies||[]),...(pairB.technologies||[])].forEach(t=>{const k=(t.vendor||'').toLowerCase();if(!techMap.has(k))techMap.set(k,t)})
      const merged={...pairA,notes:allNotes,intelLog:allIntelLog,contacts:[...contactMap.values()],technologies:[...techMap.values()],updatedAt:new Date().toISOString()}
      setData(prev=>({...prev,whitespaceAccounts:prev.whitespaceAccounts.filter(a=>a.id!==pairB.id).map(a=>a.id===pairA.id?merged:a)}))
    }
  }

  const WS_FILE_CHAR_LIMIT = 100000
  const WS_IMAGE_EXTS = ['png','jpg','jpeg','webp']
  const WS_TEXT_EXTS = ['txt','pdf','doc','docx','md']

  const loadMammothWS = () => new Promise((resolve, reject) => {
    if (window.mammoth) { resolve(window.mammoth); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
    script.onload = () => resolve(window.mammoth)
    script.onerror = () => reject(new Error('Failed to load mammoth.js'))
    document.head.appendChild(script)
  })

  const loadPdfJsWS = () => new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; resolve(window.pdfjsLib) }
    script.onerror = () => reject(new Error('Failed to load PDF.js'))
    document.head.appendChild(script)
  })

  const resetWsFileState = () => {
    setWsUploadedFile(null); setWsPendingFile(null); setWsFileIsDirectType(false)
    setWsFileError(''); setWsFileStatus(''); setWsFileCharCount(0); setWsLargeDocWarning(false)
    setWsCustomDate(''); setWsPendingDate('')
  }

  const wsHandleFile = async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!WS_IMAGE_EXTS.includes(ext) && !WS_TEXT_EXTS.includes(ext)) {
      setWsFileError('Unsupported file type. Use TXT, PDF, DOCX, MD, PNG, JPG, or WEBP.')
      return
    }
    setWsFileError(''); setWsFileStatus('')

    if (ext === 'pdf') {
      if (file.size > 32 * 1024 * 1024) { setWsFileError(`PDF too large (${(file.size/1024/1024).toFixed(1)}MB). Maximum size is 32MB.`); return }
      if (file.size > 20 * 1024 * 1024) setWsFileStatus(`Large PDF detected (${(file.size/1024/1024).toFixed(1)}MB). Analysis may take longer.`)
      setWsUploadedFile({name:file.name, size:file.size})
      setWsFileIsDirectType(true)
      setWsPendingFile(file)
      try {
        const headerText = await new Promise(resolve => { const r=new FileReader(); r.onload=e=>resolve(e.target.result||''); r.onerror=()=>resolve(''); r.readAsText(file.slice(0,1000)) })
        setWsCustomDate(detectDate(headerText)||'')
      } catch { setWsCustomDate('') }
      setWsDateModalIsFile(true)
      setWsShowDate(true)
    } else if (WS_IMAGE_EXTS.includes(ext)) {
      if (file.size > 32 * 1024 * 1024) { setWsFileError('File too large. Maximum size is 32MB.'); return }
      if (!effectiveKey) { setWsFileError('Add your Anthropic API key in Settings to process images.'); return }
      setWsUploadedFile({name:file.name, size:file.size})
      setWsFileIsDirectType(true)
      setWsPendingFile(file)
      setWsCustomDate('')
      setWsDateModalIsFile(true)
      setWsShowDate(true)
    } else if (ext==='docx'||ext==='doc') {
      if (file.size > 32 * 1024 * 1024) { setWsFileError('File too large. Maximum size is 32MB.'); return }
      setWsFileLoading(true); setWsFileIsDirectType(false)
      setWsUploadedFile({name:file.name, size:file.size})
      try {
        const mammoth = await loadMammothWS()
        const ab = await file.arrayBuffer()
        const result = await mammoth.extractRawText({arrayBuffer:ab})
        let extracted = result.value
        setWsFileCharCount(extracted.length)
        if (extracted.length > WS_FILE_CHAR_LIMIT) { extracted='[Note: This document was truncated to 100,000 characters for processing.]\n\n'+extracted.slice(0,WS_FILE_CHAR_LIMIT); setWsLargeDocWarning(true) }
        setIntelText(extracted)
        setWsCustomDate(detectDate(extracted)||'')
        setWsDateModalIsFile(false)
        setWsShowDate(true)
      } catch(e) { setWsFileError('DOCX extraction failed. Try a different format or copy-paste the content.'); setWsUploadedFile(null) }
      finally { setWsFileLoading(false) }
    } else if (ext==='txt'||ext==='md') {
      if (file.size > 32 * 1024 * 1024) { setWsFileError('File too large. Maximum size is 32MB.'); return }
      setWsFileLoading(true); setWsFileIsDirectType(false)
      setWsUploadedFile({name:file.name, size:file.size})
      try {
        let extracted = await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=e=>resolve(e.target.result);r.onerror=reject;r.readAsText(file)})
        setWsFileCharCount(extracted.length)
        if (extracted.length > WS_FILE_CHAR_LIMIT) { extracted='[Note: This document was truncated to 100,000 characters for processing.]\n\n'+extracted.slice(0,WS_FILE_CHAR_LIMIT); setWsLargeDocWarning(true) }
        setIntelText(extracted)
        setWsCustomDate(detectDate(extracted)||'')
        setWsDateModalIsFile(false)
        setWsShowDate(true)
      } catch(e) { setWsFileError('Could not read file. Try copy-pasting the content.'); setWsUploadedFile(null) }
      finally { setWsFileLoading(false) }
    }
  }

  const processFileIntel = async (date, forceFallback = false) => {
    if (!wsPendingFile) return
    const ext = wsPendingFile.name.split('.').pop().toLowerCase()
    setIntelLoading(true); setIntelError(''); setIntelStatus(''); setWsRetryStatus('')
    setWsPendingDate(date)

    const SYS_WS = 'You are an account intelligence analyst. Extract prospect company names and notes from vendor calls and sales intel documents. Return ONLY valid JSON. Start with { and end with }. No markdown, no code blocks, no text before or after the JSON.'
    const buildPromptWS = txt => `Extract all prospect/whitespace accounts from this input. Return ONLY this JSON structure with no other text:\n{"accounts":[{"name":"Company Name","hq":"city, state or empty string","industry":"industry or empty string","employees":"headcount as string like '5,000' or '5k' or empty string","revenue":"annual revenue as string like '$500M' or '500 million' or empty string","note":"2-3 sentence intel summary","status":"Prospect|Researching|Reached Out|Active Conversation"}]}\n\nRules:\n- Include every company mentioned as a prospect or target\n- Keep notes SHORT — 2-3 sentences max per account\n- Extract the following fields if mentioned anywhere in the input — revenue (annual revenue as a string like '$500M' or '500 million'), employees (headcount as a string like '5,000' or '5k'), hq (city and state), industry (the company's industry). These may appear anywhere in the text — in passing mentions, context, or background information. If revenue is mentioned as a range use the midpoint.\n- Do not include GuidePoint, the vendor you are speaking with, or the user themselves as accounts\n- Return empty accounts array [] if no prospects found\n- CRITICAL: Return valid JSON only, nothing else\n\nInput:\n${txt}`

    const onStatus = msg => { if(msg) setWsRetryStatus(msg); else setWsRetryStatus('') }

    const callTextApiWS = async (inputText) => {
      const {data: resp} = await callClaudeWithRetry({
        model:'claude-sonnet-4-6', max_tokens:8000,
        system:SYS_WS,
        messages:[{role:'user',content:buildPromptWS(inputText)}]
      }, effectiveKey, onStatus)
      if (resp.error) throw new Error(resp.error.message||'API error')
      const raw = resp.content?.[0]?.text||''
      let parsed = extractJSON(raw)
      if (!parsed) {
        try {
          const {data: fix} = await callClaudeWithRetry({model:'claude-sonnet-4-6',max_tokens:4000,messages:[{role:'user',content:`Fix this malformed JSON and return ONLY valid JSON:\n${raw}`}]}, effectiveKey, null)
          parsed = extractJSON(fix.content?.[0]?.text||'')
        } catch {}
      }
      return parsed?.accounts || []
    }

    const pdfTextFallbackWS = async () => {
      try {
        const pdfjsLib = await loadPdfJsWS()
        const ab = await wsPendingFile.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({data:ab}).promise
        let fullText = ''
        for (let i=1;i<=pdf.numPages;i++) { const pg=await pdf.getPage(i); const ct=await pg.getTextContent(); fullText+=ct.items.map(it=>it.str).join(' ')+'\n' }
        if (fullText.trim().length > 50) {
          let txt = fullText.length > WS_FILE_CHAR_LIMIT ? '[Truncated]\n\n'+fullText.slice(0,WS_FILE_CHAR_LIMIT) : fullText
          return await callTextApiWS(txt)
        }
      } catch(e2) { console.log('[WS PDF.js fallback]', e2.message) }
      try {
        const pt = await new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result||'');r.onerror=rej;r.readAsText(wsPendingFile)})
        if (pt.trim().length > 50) {
          let txt = pt.length > WS_FILE_CHAR_LIMIT ? '[Truncated]\n\n'+pt.slice(0,WS_FILE_CHAR_LIMIT) : pt
          return await callTextApiWS(txt)
        }
      } catch(e3) { console.log('[WS plain text fallback]', e3.message) }
      return null
    }

    try {
      let allAccounts = []
      if (WS_IMAGE_EXTS.includes(ext)) {
        const b64raw = await new Promise(resolve=>{const r=new FileReader();r.onload=e=>resolve(e.target.result);r.readAsDataURL(wsPendingFile)})
        const cleanBase64 = b64raw.includes(',') ? b64raw.split(',')[1] : b64raw
        const {data: imgData} = await callClaudeWithRetry({
          model:'claude-sonnet-4-6', max_tokens:8000,
          messages:[{role:'user',content:[
            {type:'image',source:{type:'base64',media_type:wsPendingFile.type||'image/jpeg',data:cleanBase64}},
            {type:'text',text:buildPromptWS('')}
          ]}]
        }, effectiveKey, onStatus)
        if (imgData.error) throw new Error(`${imgData.error.type}: ${imgData.error.message}`)
        const rawImg = imgData.content?.[0]?.text||''
        let parsed = extractJSON(rawImg)
        if (!parsed) throw new Error('Could not parse AI response.')
        allAccounts = parsed?.accounts || []
      } else if (ext === 'pdf') {
        if (forceFallback) {
          const accs = await pdfTextFallbackWS()
          if (!accs) throw new Error('All extraction methods failed for this PDF.')
          allAccounts = accs
        } else {
          let directFailed = false
          try {
            const b64raw = await new Promise(resolve=>{const r=new FileReader();r.onload=e=>resolve(e.target.result);r.readAsDataURL(wsPendingFile)})
            const cleanBase64 = b64raw.includes(',') ? b64raw.split(',')[1] : b64raw
            if (cleanBase64.length > 6700000) throw new Error('PDF_TOO_LARGE_FOR_API')
            const {data: pdfData} = await callClaudeWithRetry({
              model:'claude-sonnet-4-6', max_tokens:8000,
              messages:[{role:'user',content:[
                {type:'document',source:{type:'base64',media_type:'application/pdf',data:cleanBase64}},
                {type:'text',text:buildPromptWS('')}
              ]}]
            }, effectiveKey, onStatus)
            if (pdfData.error) { directFailed = true; console.log('[WS Direct PDF] Error:', pdfData.error.type, pdfData.error.message) }
            else {
              const rawPdf = pdfData.content?.[0]?.text||''
              let parsed = extractJSON(rawPdf)
              if (!parsed) { directFailed = true }
              else allAccounts = parsed?.accounts || []
            }
          } catch(e1) { directFailed = true; console.log('[WS Direct PDF] Exception:', e1.message) }
          if (directFailed) {
            const accs = await pdfTextFallbackWS()
            if (!accs) throw new Error('All extraction methods failed. Try a different PDF or copy-paste the text.')
            allAccounts = accs
          }
        }
      }

      setIntelStatus('')
      if (allAccounts.length === 0) { setIntelError('No prospect companies found in the document.'); setIntelLoading(false); return }
      // Fuzzy dedup within batch
      const dedupedDoc = []
      allAccounts.forEach(a => {
        const existIdx = dedupedDoc.findIndex(b=>fuzzyMatchAccount(a.name,b.name))
        if (existIdx>=0) { if(a.note&&a.note.trim()) dedupedDoc[existIdx]={...dedupedDoc[existIdx],note:[dedupedDoc[existIdx].note,a.note].filter(Boolean).join(' | ')} }
        else dedupedDoc.push(a)
      })
      allAccounts = dedupedDoc
      const sel = new Set()
      allAccounts.forEach((a,i) => {
        const inCRM = (data.accounts||[]).some(ac=>(ac.name||'').toLowerCase().slice(0,8)===(a.name||'').toLowerCase().slice(0,8))
        const blocked = isBlockedAccount(a.name)
        if (!inCRM && !blocked) sel.add(i)
      })
      setPendingIntel({accounts:allAccounts, date})
      setSelectedIntel(sel)
      setShowIntel(false)
      setWsUploadedFile(null); setWsPendingFile(null); setWsFileIsDirectType(false)
    } catch(e) {
      const msg = e.message||'Processing failed.'
      if (msg==='OVERLOADED') setIntelError('Anthropic API is busy right now. Please wait 30 seconds and try again.')
      else setIntelError('Processing failed: '+(msg||'Unknown error'))
    }
    setIntelLoading(false); setWsRetryStatus('')
  }

  const handleWsProcess = () => {
    if (wsFileIsDirectType && wsPendingFile) {
      setWsDateModalIsFile(true)
      setWsShowDate(true)
    } else {
      processIntel()
    }
  }

  const openIntel = () => {
    const detected = detectDate(intelText)
    setIntelDate(detected || new Date().toISOString().split('T')[0])
    setIntelError(''); setIntelStatus('')
    setShowIntel(true)
  }

  const processIntel = async (dateOverride) => {
    if (!effectiveKey) { setIntelError('Add your Anthropic API key in Settings first.'); return }
    if (!intelText.trim()) { setIntelError('Please paste some text first.'); return }
    const date = dateOverride || intelDate || new Date().toISOString().split('T')[0]
    setIntelLoading(true); setIntelError(''); setIntelStatus('')

    const SYS = 'You are an account intelligence analyst. Extract prospect company names and notes from vendor calls and sales intel documents. Return ONLY valid JSON. Start with { and end with }. No markdown, no code blocks, no text before or after the JSON.'
    const buildPrompt = txt => `Extract all prospect/whitespace accounts from this input. Return ONLY this JSON structure with no other text:\n{"accounts":[{"name":"Company Name","hq":"city, state or empty string","industry":"industry or empty string","employees":"headcount as string like '5,000' or '5k' or empty string","revenue":"annual revenue as string like '$500M' or '500 million' or empty string","note":"2-3 sentence intel summary","status":"Prospect|Researching|Reached Out|Active Conversation"}]}\n\nRules:\n- Include every company mentioned as a prospect or target\n- Keep notes SHORT — 2-3 sentences max per account\n- Extract the following fields if mentioned anywhere in the input — revenue (annual revenue as a string like '$500M' or '500 million'), employees (headcount as a string like '5,000' or '5k'), hq (city and state), industry (the company's industry). These may appear anywhere in the text — in passing mentions, context, or background information. If revenue is mentioned as a range use the midpoint.\n- Do not include GuidePoint, the vendor you are speaking with, or the user themselves as accounts\n- Return empty accounts array [] if no prospects found\n- CRITICAL: Return valid JSON only, nothing else\n\nInput:\n${txt}`

    const runChunk = async (txt, idx, total) => {
      if (total > 1) setIntelStatus(`Processing chunk ${idx+1} of ${total}…`)
      const {data: resp} = await callClaudeWithRetry({
        model:'claude-sonnet-4-6', max_tokens:8000,
        system:SYS,
        messages:[{role:'user',content:buildPrompt(txt)}]
      }, effectiveKey, null)
      if (resp.error) throw new Error(resp.error.message||'API error')
      const raw = resp.content?.[0]?.text||''
      console.log(`Whitespace AI raw (chunk ${idx+1}/${total}):`, raw)
      let parsed = extractJSON(raw)
      if (!parsed) {
        // Fallback: ask Claude to fix the malformed JSON
        try {
          const {data: fix} = await callClaudeWithRetry({
            model:'claude-sonnet-4-6', max_tokens:4000,
            messages:[{role:'user',content:`This JSON is malformed. Fix it and return ONLY valid JSON, nothing else:\n${raw}`}]
          }, effectiveKey, null)
          parsed = extractJSON(fix.content?.[0]?.text||'')
        } catch {}
      }
      return parsed?.accounts || []
    }

    try {
      const CHUNK = 6000
      let allAccounts = []

      if (intelText.length <= CHUNK) {
        allAccounts = await runChunk(intelText, 0, 1)
      } else {
        // Split on double-newlines into chunks of max CHUNK chars
        const chunks = []
        let cur = ''
        for (const para of intelText.split(/\n\n+/)) {
          if (cur && (cur + '\n\n' + para).length > CHUNK) { chunks.push(cur.trim()); cur = para }
          else { cur = cur ? cur + '\n\n' + para : para }
        }
        if (cur.trim()) chunks.push(cur.trim())
        for (let i = 0; i < chunks.length; i++) {
          const chunk_accounts = await runChunk(chunks[i], i, chunks.length)
          allAccounts.push(...chunk_accounts)
        }
        // Fuzzy dedup within batch — merge notes for similar names
        const deduped = []
        allAccounts.forEach(a => {
          const existIdx = deduped.findIndex(b=>fuzzyMatchAccount(a.name,b.name))
          if (existIdx>=0) { if(a.note&&a.note.trim()) deduped[existIdx]={...deduped[existIdx],note:[deduped[existIdx].note,a.note].filter(Boolean).join(' | ')} }
          else deduped.push(a)
        })
        allAccounts = deduped
      }

      setIntelStatus('')
      if (allAccounts.length === 0) {
        setIntelError('No prospect companies found in the text.')
        setIntelLoading(false); return
      }
      const sel = new Set()
      allAccounts.forEach((a,i) => {
        const inCRM = (data.accounts||[]).some(ac=>(ac.name||'').toLowerCase().slice(0,8)===(a.name||'').toLowerCase().slice(0,8))
        const blocked = isBlockedAccount(a.name)
        if (!inCRM && !blocked) sel.add(i)
      })
      setPendingIntel({accounts:allAccounts, date})
      setSelectedIntel(sel)
      setShowIntel(false)
    } catch(e) {
      setIntelStatus('')
      setIntelError('Processing failed: '+(e.message||'Unknown error'))
    }
    setIntelLoading(false)
  }

  const saveIntel = () => {
    if (!pendingIntel) return
    const {accounts, date} = pendingIntel
    const now = new Date().toISOString()
    setData(prev=>{
      let wsList = [...(prev.whitespaceAccounts||[])]
      accounts.forEach((a,i)=>{
        if (!selectedIntel.has(i)) return
        const finalName = (pendingNames[i]||'').trim() || a.name
        const noteEntry = {id:uid(), text:a.note, date, addedBy:'ai'}
        const existIdx = wsList.findIndex(w=>fuzzyMatchAccount(finalName, w.name))
        if (existIdx>=0) {
          const ex = {...wsList[existIdx]}
          if (!ex.hq && a.hq) ex.hq = a.hq
          if (!ex.industry && a.industry) ex.industry = a.industry
          if (!ex.employees && a.employees) ex.employees = a.employees
          if (!ex.revenue && a.revenue) ex.revenue = a.revenue
          ex.intelLog = [noteEntry, ...(ex.intelLog||[])]
          ex.updatedAt = now
          wsList[existIdx] = ex
        } else {
          wsList.push({id:uid(),name:finalName,hq:a.hq||'',industry:a.industry||'',employees:a.employees||'',revenue:a.revenue||'',status:a.status||'Prospect',contacts:[],technologies:[],notes:[],intelLog:[noteEntry],addedAt:now,updatedAt:now})
        }
      })
      return {...prev, whitespaceAccounts:wsList}
    })
    setPendingIntel(null); setSelectedIntel(new Set()); setIntelText(''); setIntelDate(''); setPendingNames({}); setEditingNameIdx(null); setEditingNameDraft('')
  }

  const closeIntelModal = () => { setPendingIntel(null); setPendingNames({}); setEditingNameIdx(null); setEditingNameDraft('') }

  const SM = S.sideMuted; const ST = S.sideTxt; const SB = S.sideBdr

  return (
    <div style={{display:'flex',flexDirection:mob?'column':'row',height:mob?'auto':'100vh',minHeight:mob?'100vh':undefined,overflow:mob?'visible':'hidden',background:isLight?'#f1f5f9':S.bg}}>
      {/* SIDEBAR — desktop only */}
      {!mob&&<div style={{width:240,flexShrink:0,background:'#FFFFFF',display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',borderRight:'1px solid #EEEFF2'}}>
        <div style={{padding:'12px 16px 12px',flexShrink:0,borderBottom:'1px solid #EEEFF2'}}>
          <div style={{display:'flex',justifyContent:'center',alignItems:'center'}}>
            <img src="/Ledgr-full-logo.png" alt="Ledgr." style={{height:'72px',width:'auto',maxWidth:'187px',objectFit:'contain',display:'block'}}/>
          </div>
        </div>
        <div style={{padding:'12px 12px 4px',flexShrink:0}}>
          <button onClick={onBack}
            style={{display:'flex',alignItems:'center',gap:6,width:'100%',padding:'8px 12px',background:'transparent',border:'1px solid #EEEFF2',borderRadius:8,color:SM,fontSize:12,cursor:'pointer',transition:'all 0.15s'}}
            onMouseEnter={e=>{e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.color=ST}}
            onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=SM}}>
            ← Back to Accounts
          </button>
        </div>
        <div style={{padding:'8px 12px 4px',flexShrink:0}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search...'
            style={{width:'100%',fontSize:11,padding:'7px 10px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:8,color:ST,boxSizing:'border-box',outline:'none'}}/>
        </div>
        <div style={{padding:'4px 12px 8px',flexShrink:0}}>
          <select value={sort} onChange={e=>setSort(e.target.value)}
            style={{width:'100%',fontSize:11,padding:'6px 8px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:8,color:ST,boxSizing:'border-box'}}>
            {SORT_OPTS.map(o=><option key={o}>{o}</option>)}
          </select>
        </div>
        <div style={{padding:'4px 12px 8px',flexShrink:0}}>
          <div style={{fontSize:9,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:5}}>Status Filter</div>
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            {STATUS_OPTS.map(s=>(
              <button key={s} onClick={()=>setStatusFilter(s)}
                style={{textAlign:'left',padding:'5px 8px',borderRadius:6,border:'none',background:statusFilter===s?'#EBF4FF':'transparent',color:statusFilter===s?'#007AFF':SM,fontSize:11,cursor:'pointer',fontWeight:statusFilter===s?700:400}}
                onMouseEnter={e=>{if(statusFilter!==s)e.currentTarget.style.background='#F9FAFB'}}
                onMouseLeave={e=>{if(statusFilter!==s)e.currentTarget.style.background='transparent'}}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div style={{padding:'2px 12px 6px',flexShrink:0}}>
          <div style={{fontSize:10,color:'#9CA3AF'}}>{sorted.length} account{sorted.length!==1?'s':''}</div>
        </div>
        <div style={{marginTop:'auto',padding:'12px',flexShrink:0}}>
          <div style={{height:1,background:SB,marginBottom:12}}/>
          <button onClick={()=>setShowAdd(true)}
            style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,width:'100%',padding:'9px 12px',background:'#007AFF',border:'none',borderRadius:8,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>
            + Add Account
          </button>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10}}>
            <span style={{fontSize:10,color:'#9CA3AF'}}>Theme</span>
            <div style={{display:'flex',gap:1,background:'#F3F4F6',borderRadius:6,padding:2}}>
              <button onClick={()=>setTheme('light')} style={{padding:'3px 8px',borderRadius:4,border:'none',background:theme==='light'?'#FFFFFF':'transparent',color:theme==='light'?'#007AFF':SM,fontSize:12,cursor:'pointer',lineHeight:1.4}}>☀</button>
              <button onClick={()=>setTheme('dark')} style={{padding:'3px 8px',borderRadius:4,border:'none',background:theme==='dark'?'#FFFFFF':'transparent',color:theme==='dark'?'#007AFF':SM,fontSize:12,cursor:'pointer',lineHeight:1.4}}>☾</button>
            </div>
          </div>
        </div>
      </div>}

      {/* ── Mobile filter drawer ── */}
      {mob&&mobFilterOpen&&<>
        <div onClick={()=>setMobFilterOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:300}}/>
        <div style={{position:'fixed',left:0,top:0,height:'100vh',width:280,zIndex:310,background:'#FFFFFF',boxShadow:'4px 0 24px rgba(0,0,0,0.12)',display:'flex',flexDirection:'column',overflowY:'auto'}}>
          <div style={{padding:'18px 16px 14px',borderBottom:'1px solid #EEEFF2',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
            <span style={{fontSize:15,fontWeight:700,color:'#111827'}}>Filters</span>
            <button onClick={()=>setMobFilterOpen(false)} style={{background:'transparent',border:'none',color:'#9CA3AF',cursor:'pointer',fontSize:24,lineHeight:1,padding:'0 4px'}}>×</button>
          </div>
          <div style={{padding:'14px 16px',flex:1}}>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Search</div>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search accounts…'
                style={{width:'100%',fontSize:13,padding:'8px 10px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:8,color:'#111827',boxSizing:'border-box',outline:'none'}}/>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Sort By</div>
              <select value={sort} onChange={e=>setSort(e.target.value)}
                style={{width:'100%',fontSize:13,padding:'8px 10px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:8,color:'#111827',boxSizing:'border-box'}}>
                {SORT_OPTS.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Status</div>
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {STATUS_OPTS.map(s=>(
                  <button key={s} onClick={()=>setStatusFilter(s)}
                    style={{textAlign:'left',padding:'9px 10px',borderRadius:7,border:'none',background:statusFilter===s?'#EBF4FF':'transparent',color:statusFilter===s?'#007AFF':'#374151',fontSize:13,cursor:'pointer',fontWeight:statusFilter===s?700:400}}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div style={{fontSize:11,color:'#9CA3AF',marginTop:4}}>{sorted.length} account{sorted.length!==1?'s':''}</div>
          </div>
          <div style={{padding:'12px 16px',borderTop:'1px solid #EEEFF2',flexShrink:0}}>
            <button onClick={()=>setShowAdd(true)}
              style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,width:'100%',padding:'11px 12px',background:'#007AFF',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>
              + Add Account
            </button>
          </div>
        </div>
      </>}

      {/* MAIN */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:mob?'visible':'hidden',minWidth:0}}>
        <div style={{padding:mob?'12px 14px':'16px 24px 14px',background:isLight?'#ffffff':S.headerBg,borderBottom:`1px solid ${isLight?'#e2e8f0':S.bdr}`,flexShrink:0,boxShadow:isLight?'0 1px 3px rgba(0,0,0,0.06)':'none',position:mob?'sticky':'relative',top:0,zIndex:mob?100:'auto'}}>
          {/* ── Mobile top bar ── */}
          {mob?(
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <button onClick={onBack} style={{display:'inline-flex',alignItems:'center',gap:4,background:'transparent',border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,borderRadius:7,color:'#2563eb',cursor:'pointer',fontSize:12,fontWeight:600,padding:'6px 10px',flexShrink:0,whiteSpace:'nowrap'}}>
                <ArrowLeft size={12}/>Back
              </button>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontSize:16,fontWeight:800,color:isLight?'#0f172a':S.txt,whiteSpace:'nowrap'}}>Whitespace</span>
                  <span style={{fontSize:11,fontWeight:700,color:'#2563eb',background:'#dbeafe',borderRadius:999,padding:'2px 7px',flexShrink:0}}>{ws.length}</span>
                </div>
              </div>
              <button onClick={()=>setMobFilterOpen(true)}
                style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 12px',background:isLight?'#f1f5f9':'rgba(255,255,255,0.08)',border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,borderRadius:7,color:S.txt,fontSize:12,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                ⚙ Filters{(search||statusFilter!=='All')?<span style={{width:6,height:6,borderRadius:'50%',background:'#2563eb',display:'inline-block',flexShrink:0}}/>:null}
              </button>
              <button onClick={()=>{setIntelText('');setIntelDate('');setIntelError('');setIntelStatus('');resetWsFileState();setShowIntel(true)}}
                style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:34,height:34,background:'linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%)',border:'none',borderRadius:7,color:'#fff',cursor:'pointer',flexShrink:0}}
                title="Add Intelligence"><Zap size={14}/></button>
              <div ref={moreMenuRef} style={{position:'relative',flexShrink:0}}>
                <button onClick={()=>setShowMoreMenu(v=>!v)}
                  style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:34,height:34,background:isLight?'#f8fafc':S.surf2,border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,borderRadius:7,color:S.muted,fontSize:18,fontWeight:700,cursor:'pointer',lineHeight:1}}
                  title="More actions">⋯</button>
                {showMoreMenu&&(
                  <div style={{position:'absolute',right:0,top:'calc(100% + 6px)',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.15)',overflow:'hidden',minWidth:210,zIndex:200}}>
                    {[
                      {label:'+ Add Account', action:()=>{setShowAdd(true);setShowMoreMenu(false)}},
                      {label:'Score All Accounts', action:()=>{setShowMoreMenu(false);scoreAllAccounts()}},
                      {label:'Merge Accounts', action:()=>{setShowMerge(true);setMergeStep(1);setMergeSelected(new Set());setMergePrimary(null);setMergeSearch('');setShowMoreMenu(false)}},
                      {label:'Auto-fill Missing Data', action:()=>{const missing=ws.filter(a=>!a.employees||!a.revenue);if(missing.length===0){alert('All accounts already have employee and revenue data!');setShowMoreMenu(false);return}setAiOpSummary('');setShowAutoFillModal(true);setShowMoreMenu(false)}},
                      {label:'Clean Duplicate Notes', action:()=>{const accts=ws.filter(a=>((a.intelLog||[]).length+(a.notes||[]).length)>2);if(accts.length===0){alert('No accounts with more than 2 notes entries found.');setShowMoreMenu(false);return}setAiOpSummary('');setShowCleanNotesModal(true);setShowMoreMenu(false)}},
                      {label:'Export Summary CSV', action:()=>{exportSummaryCSV();setShowMoreMenu(false)}},
                      {label:'Export Selected Full Details', action:()=>{exportSelectedFullDetailsCSV();setShowMoreMenu(false)}},
                    ].map((item,i,arr)=>(
                      <button key={item.label} onClick={item.action}
                        style={{display:'block',width:'100%',padding:'12px 16px',background:'transparent',border:'none',borderBottom:i<arr.length-1?`1px solid ${S.bdr}`:'none',color:S.txt,fontSize:13,cursor:'pointer',textAlign:'left'}}
                        onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ):(
            /* ── Desktop top bar (unchanged) ── */
            <>
              <button onClick={onBack} style={{display:'inline-flex',alignItems:'center',gap:6,background:'transparent',border:'none',color:'#2563eb',cursor:'pointer',fontSize:12,fontWeight:600,padding:'0 0 10px',lineHeight:1}}>
                <ArrowLeft size={13}/>Back to Accounts
              </button>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                    <div style={{fontSize:22,fontWeight:900,color:isLight?'#0f172a':S.txt,letterSpacing:'-0.02em'}}>Whitespace</div>
                    <span style={{fontSize:11,fontWeight:700,color:'#2563eb',background:'#dbeafe',borderRadius:999,padding:'2px 9px'}}>{ws.length}</span>
                  </div>
                  <div style={{fontSize:12,color:'#64748b'}}>Prospect accounts you're tracking for future opportunities</div>
                </div>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search accounts…'
                  style={{width:200,fontSize:12,padding:'7px 10px',background:isLight?'#f8fafc':S.surf2,border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,borderRadius:7,color:S.txt,outline:'none',flexShrink:0}}/>
                <button onClick={()=>{setIntelText('');setIntelDate('');setIntelError('');setIntelStatus('');resetWsFileState();setShowIntel(true)}}
                  style={{display:'inline-flex',alignItems:'center',gap:6,padding:'9px 16px',background:'linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%)',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:'0 2px 8px rgba(37,99,235,0.3)',flexShrink:0}}>
                  <Zap size={14}/>Add Intelligence
                </button>
                <button onClick={scoreAllAccounts} disabled={scoringAll||!effectiveKey}
                  title={!effectiveKey?'Add your Anthropic API key in Settings first':'Score all unscored accounts with AI opportunity scores'}
                  style={{display:'inline-flex',alignItems:'center',gap:6,padding:'9px 14px',background:scoringAll?'#f59e0b':'linear-gradient(135deg,#d97706 0%,#f59e0b 100%)',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:scoringAll||!effectiveKey?'default':'pointer',boxShadow:'0 2px 8px rgba(245,158,11,0.3)',flexShrink:0,opacity:!effectiveKey?0.5:1}}>
                  <span style={{fontSize:14}}>🔥</span>{scoringAll?'Scoring…':'Score All'}
                </button>
                <div ref={moreMenuRef} style={{position:'relative',flexShrink:0}}>
                  <button onClick={()=>setShowMoreMenu(v=>!v)}
                    style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:36,height:36,background:isLight?'#f8fafc':S.surf2,border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,borderRadius:8,color:S.muted,fontSize:18,fontWeight:700,cursor:'pointer',lineHeight:1}}
                    title="More actions">⋯</button>
                  {showMoreMenu&&(
                    <div style={{position:'absolute',right:0,top:'calc(100% + 6px)',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.15)',overflow:'hidden',minWidth:210,zIndex:100}}>
                      {[
                        {label:'+ Add Account', action:()=>{setShowAdd(true);setShowMoreMenu(false)}},
                        {label:'Merge Accounts', action:()=>{setShowMerge(true);setMergeStep(1);setMergeSelected(new Set());setMergePrimary(null);setMergeSearch('');setShowMoreMenu(false)}},
                        {label:'Auto-fill Missing Data', action:()=>{const missing=ws.filter(a=>!a.employees||!a.revenue);if(missing.length===0){alert('All accounts already have employee and revenue data!');setShowMoreMenu(false);return}setAiOpSummary('');setShowAutoFillModal(true);setShowMoreMenu(false)}},
                        {label:'Clean Duplicate Notes', action:()=>{const accts=ws.filter(a=>((a.intelLog||[]).length+(a.notes||[]).length)>2);if(accts.length===0){alert('No accounts with more than 2 notes entries found.');setShowMoreMenu(false);return}setAiOpSummary('');setShowCleanNotesModal(true);setShowMoreMenu(false)}},
                        {label:'Score All Accounts', action:()=>{setShowMoreMenu(false);scoreAllAccounts()}},
                        {label:'Export Summary CSV', action:()=>{exportSummaryCSV();setShowMoreMenu(false)}},
                        {label:'Export Selected Full Details', action:()=>{exportSelectedFullDetailsCSV();setShowMoreMenu(false)}},
                      ].map((item,i,arr)=>(
                        <button key={item.label} onClick={item.action}
                          style={{display:'block',width:'100%',padding:'10px 16px',background:'transparent',border:'none',borderBottom:i<arr.length-1?`1px solid ${S.bdr}`:'none',color:S.txt,fontSize:13,cursor:'pointer',textAlign:'left'}}
                          onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        {/* Named accounts banner */}
        <div style={{background:isLight?'#eff6ff':'rgba(37,99,235,0.08)',borderBottom:`1px solid ${isLight?'#bfdbfe':'rgba(37,99,235,0.2)'}`,flexShrink:0}}>
          <button onClick={()=>setBannerOpen(v=>!v)} style={{display:'flex',alignItems:'center',gap:6,width:'100%',padding:'7px 20px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
            <svg width="12" height="12" viewBox="0 0 12 12" style={{flexShrink:0,transform:bannerOpen?'rotate(90deg)':'rotate(0deg)',transition:'transform 0.15s',color:'#64748b'}}><polyline points="3,2 9,6 3,10" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{fontSize:12,color:isLight?'#1d4ed8':'#93c5fd',fontWeight:500}}>Referencing 1,829 named accounts</span>
            <span style={{fontSize:12,color:S.muted}}>·</span>
            <span style={{fontSize:12,color:S.muted}}>1,234 blocked</span>
            <span style={{fontSize:12,color:S.muted}}>·</span>
            <span style={{fontSize:12,color:'#0ebc5f'}}>595 open (Pete Ballas &amp; Carl Morris)</span>
            <span style={{fontSize:12,color:S.muted}}>·</span>
            <span style={{fontSize:12,color:S.muted}}>Unknown accounts always available</span>
          </button>
          {bannerOpen&&(
            <div style={{padding:'4px 20px 10px 38px',fontSize:12,color:S.muted,lineHeight:1.7}}>
              <div>Blocked accounts are named by another rep — you can still track them but cannot pursue them without clearing conflict.</div>
              <div>Open accounts (Pete Ballas &amp; Carl Morris) are available for pursuit — they show as available in the tracker.</div>
              <div>Any company not on the named accounts list is always fully available.</div>
            </div>
          )}
        </div>
        {mergeToast&&(
          <div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'#1e293b',color:'#f0fdf4',padding:'10px 22px',borderRadius:10,fontSize:13,fontWeight:600,zIndex:2000,boxShadow:'0 4px 20px rgba(0,0,0,0.4)',display:'flex',alignItems:'center',gap:8}}>
            <span style={{color:'#4ade80'}}>✓</span>{mergeToast}
          </div>
        )}
        {scoreProgress&&(
          <div style={{position:'fixed',bottom:60,left:'50%',transform:'translateX(-50%)',background:'#1e293b',color:'#f0fdf4',padding:'10px 22px',borderRadius:10,fontSize:13,fontWeight:600,zIndex:2002,boxShadow:'0 4px 20px rgba(0,0,0,0.5)',display:'flex',alignItems:'center',gap:8,whiteSpace:'nowrap'}}>
            <span style={{fontSize:14}}>⚡</span>{scoreProgress}
          </div>
        )}
        {wsToast&&(
          <div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'#0f172a',color:'#f0fdf4',padding:'10px 22px',borderRadius:10,fontSize:13,fontWeight:600,zIndex:2001,boxShadow:'0 4px 20px rgba(0,0,0,0.5)',display:'flex',alignItems:'center',gap:8}}>
            <span style={{color:'#4ade80'}}>✓</span>{wsToast}
          </div>
        )}
        {!dupeDismissed&&dupePairs.length>0&&(
          <div style={{background:isLight?'#fffbeb':'rgba(234,179,8,0.08)',borderBottom:`1px solid ${isLight?'#fde68a':'rgba(234,179,8,0.25)'}`,padding:'8px 20px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <span style={{fontSize:13,color:'#92400e',fontWeight:600}}>⚠ {dupePairs.length} possible duplicate{dupePairs.length!==1?'s':''} found</span>
            <button onClick={()=>setShowDupeReview(true)} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:0}}>Review →</button>
            <button onClick={()=>setDupeDismissed(true)} style={{fontSize:12,color:S.muted,background:'none',border:'none',cursor:'pointer',padding:0,marginLeft:'auto'}}>Dismiss</button>
          </div>
        )}
        <div style={{flex:1,overflowY:'auto'}}>
          {/* AI RECOMMENDATIONS */}
          {ws.length>0&&(
            <div style={{borderBottom:`1px solid ${isLight?'#e2e8f0':S.bdr}`,flexShrink:0}}>
              <button onClick={()=>{setRecOpen(v=>!v);if(!recOpen&&!(data.whitespaceRecommendations||[]).length)fetchRecommendations()}}
                style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'10px 20px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
                <span style={{fontSize:15}}>✦</span>
                <span style={{fontSize:13,fontWeight:700,color:'#2563eb'}}>AI Recommendations</span>
                <span style={{fontSize:12,color:S.muted}}>{(data.whitespaceRecommendations||[]).filter(r=>!(data.dismissedWhitespaceSuggestions||[]).includes(r.name)).length>0?`${(data.whitespaceRecommendations||[]).filter(r=>!(data.dismissedWhitespaceSuggestions||[]).includes(r.name)).length} accounts to prioritize`:'Click to generate'}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" style={{marginLeft:'auto',flexShrink:0,transform:recOpen?'rotate(90deg)':'rotate(0deg)',transition:'transform 0.15s'}}><polyline points="3,2 9,6 3,10" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {recOpen&&<button onClick={e=>{e.stopPropagation();fetchRecommendations()}}
                  style={{padding:'4px 10px',background:isLight?'#eff6ff':'rgba(37,99,235,0.12)',border:`1px solid ${isLight?'#bfdbfe':'rgba(37,99,235,0.25)'}`,borderRadius:6,color:'#2563eb',fontSize:11,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                  {recLoading?'Loading…':'Refresh'}
                </button>}
              {recOpen&&(data.dismissedWhitespaceSuggestions||[]).length>0&&<button onClick={e=>{e.stopPropagation();setData(prev=>({...prev,dismissedWhitespaceSuggestions:[]}))}}
                  style={{padding:'4px 10px',background:'transparent',border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,borderRadius:6,color:S.muted,fontSize:11,cursor:'pointer',flexShrink:0}}>
                  Reset dismissed
                </button>}
              </button>
              {recOpen&&(
                <div style={{padding:'0 20px 16px'}}>
                  {recError&&<div style={{fontSize:12,color:'#dc2626',marginBottom:8}}>{recError}</div>}
                  {recLoading&&!(data.whitespaceRecommendations||[]).length&&(
                    <div style={{fontSize:13,color:S.muted,padding:'12px 0'}}>Analyzing your whitespace accounts…</div>
                  )}
                  {(()=>{
                    const dismissed=data.dismissedWhitespaceSuggestions||[]
                    const visibleRecs=(data.whitespaceRecommendations||[]).filter(r=>!dismissed.includes(r.name)).sort((a,b)=>{const aS=ws.find(w=>w.name===a.name)?.ai_opportunity_score??-1;const bS=ws.find(w=>w.name===b.name)?.ai_opportunity_score??-1;if(aS>=0&&bS>=0)return bS-aS;return 0}).slice(0,3)
                    const dismissRec=(name)=>setData(prev=>({...prev,dismissedWhitespaceSuggestions:[...(prev.dismissedWhitespaceSuggestions||[]),name]}))
                    return visibleRecs.length>0?(
                      <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(3,1fr)',gap:12}}>
                        {visibleRecs.map((rec,i)=>{
                          const pc=rec.priority==='Hot'?'#dc2626':rec.priority==='Warm'?'#f59e0b':'#2563eb'
                          const pb=rec.priority==='Hot'?'#fef2f2':rec.priority==='Warm'?'#fffbeb':'#eff6ff'
                          return (
                            <div key={i} style={{background:isLight?'#ffffff':S.surf,borderRadius:12,border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,padding:14,boxShadow:isLight?'0 1px 3px rgba(0,0,0,0.06)':'none',position:'relative'}}>
                              <button onClick={()=>dismissRec(rec.name)}
                                title="Dismiss"
                                style={{position:'absolute',top:8,right:8,background:'transparent',border:'none',cursor:'pointer',color:S.muted,fontSize:14,lineHeight:1,padding:'2px 4px',borderRadius:4}}
                                onMouseEnter={e=>e.currentTarget.style.color=isLight?'#0f172a':S.txt}
                                onMouseLeave={e=>e.currentTarget.style.color=S.muted}>×</button>
                              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:8,paddingRight:20}}>
                                <div style={{fontSize:15,fontWeight:700,color:isLight?'#0f172a':S.txt,lineHeight:1.3}}>{rec.name}</div>
                                <span style={{fontSize:10,fontWeight:700,color:pc,background:pb,borderRadius:999,padding:'2px 8px',whiteSpace:'nowrap',flexShrink:0}}>{rec.priority}</span>
                              </div>
                              <ul style={{margin:0,padding:'0 0 0 14px',listStyle:'disc'}}>
                                {(rec.reasons||[]).map((r,j)=>(
                                  <li key={j} style={{fontSize:12,color:S.muted,lineHeight:1.5,marginBottom:2}}>{r}</li>
                                ))}
                              </ul>
                              {ws.find(a=>a.name===rec.name)&&(
                                <button onClick={()=>setExpandedId(ws.find(a=>a.name===rec.name)?.id||null)}
                                  style={{marginTop:10,fontSize:11,fontWeight:600,color:'#2563eb',background:'transparent',border:'none',cursor:'pointer',padding:0}}>
                                  View Account →
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ):null
                  })()}
                  {!recLoading&&!(data.whitespaceRecommendations||[]).filter(r=>!(data.dismissedWhitespaceSuggestions||[]).includes(r.name)).length&&!recError&&(
                    <div style={{fontSize:12,color:S.muted}}>Click Refresh to generate AI recommendations.</div>
                  )}
                </div>
              )}
            </div>
          )}
          {ws.length===0?(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:16,padding:40}}>
              <svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="#94a3b8" strokeWidth="2"/><circle cx="24" cy="24" r="10" fill="none" stroke="#94a3b8" strokeWidth="1.5"/><circle cx="24" cy="24" r="2" fill="#94a3b8"/><line x1="24" y1="4" x2="24" y2="8" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/><line x1="24" y1="40" x2="24" y2="44" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/><line x1="4" y1="24" x2="8" y2="24" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/><line x1="40" y1="24" x2="44" y2="24" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/></svg>
              <div style={{fontSize:20,fontWeight:700,color:S.txt}}>No whitespace accounts yet</div>
              <div style={{fontSize:13,color:S.muted,textAlign:'center',lineHeight:1.7}}>Track prospect accounts you want to pursue. Add accounts manually<br/>or let AI detect them from your intel.</div>
              <button onClick={()=>setShowAdd(true)} style={{padding:'10px 24px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',marginTop:8}}>+ Add Your First Account</button>
            </div>
          ):sorted.length===0?(
            <div style={{padding:40,textAlign:'center',color:S.muted,fontSize:13}}>No accounts match your search or filter.</div>
          ):(
            <div style={mob?{overflowX:'auto',WebkitOverflowScrolling:'touch'}:{}}>
              <div style={{display:'flex',alignItems:'center',padding:'8px 16px',background:isLight?'#f8fafc':'rgba(255,255,255,0.03)',borderBottom:`1px solid ${isLight?'#e2e8f0':S.bdr}`,fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',position:'sticky',top:mob?0:0,zIndex:10,userSelect:'none',minWidth:mob?900:undefined}}>
                <div style={{width:32,flexShrink:0,textAlign:'center'}}>
                  <input type="checkbox" style={{cursor:'pointer',accentColor:'#2563eb'}}
                    checked={sorted.length>0&&sorted.every(a=>selectedForExport.has(a.id))}
                    onChange={e=>{if(e.target.checked)setSelectedForExport(new Set(sorted.map(a=>a.id)));else setSelectedForExport(new Set())}}/>
                </div>
                <div style={{width:28,flexShrink:0}}/>
                <div style={{width:28,flexShrink:0,textAlign:'center'}}>🔥</div>
                <div style={{flex:'0 0 200px',cursor:'pointer'}} onClick={()=>setSort(sort==='Name A-Z'?'Name Z-A':'Name A-Z')}>Name{sort==='Name A-Z'?' ↑':sort==='Name Z-A'?' ↓':''}</div>
                <div style={{flex:'0 0 120px'}}>HQ</div>
                <div style={{flex:'1 1 140px',cursor:'pointer'}} onClick={()=>setSort('Industry')}>Industry{sort==='Industry'?' ↑':''}</div>
                <div style={{flex:'0 0 90px',textAlign:'right',cursor:'pointer'}} onClick={()=>setSort('Employees')}>Employees{sort==='Employees'?' ↓':''}</div>
                <div style={{flex:'0 0 110px',textAlign:'right',paddingRight:16,cursor:'pointer'}} onClick={()=>setSort('Revenue')}>Revenue{sort==='Revenue'?' ↓':''}</div>
                <div style={{flex:'0 0 70px',textAlign:'center',cursor:'pointer'}} onClick={()=>setSort('Intel')}>Intel{sort==='Intel'?' ↓':''}</div>
                <div style={{flex:'0 0 90px',textAlign:'right',cursor:'pointer'}} onClick={()=>setSort('Recently Updated')}>Updated{sort==='Recently Updated'?' ↓':''}</div>
                <div style={{flex:'0 0 130px',textAlign:'right',cursor:'pointer'}} onClick={()=>setSort('Status')}>Status{sort==='Status'?' ↑':''}</div>
                <div style={{width:44,flexShrink:0}}/>
              </div>
              {sorted.map((acct,i)=>{
                const isExp = expandedId===acct.id
                const sc = STATUS_COLORS[acct.status]||'#64748b'
                const isHov = hoveredId===acct.id
                const intelCount = (acct.notes||[]).length + (acct.intelLog||[]).length
                return (
                  <div key={acct.id} style={{borderBottom:`1px solid ${isLight?'#f1f5f9':'rgba(255,255,255,0.05)'}`,background:isExp?(isLight?'#f0f9ff':'rgba(37,99,235,0.05)'):i%2===0?(isLight?'#ffffff':'transparent'):(isLight?'#f8fafc':'rgba(255,255,255,0.015)')}}>
                    <div style={{display:'flex',alignItems:'center',padding:'12px 16px',cursor:'pointer',minWidth:mob?900:undefined}}
                      onClick={()=>setExpandedId(isExp?null:acct.id)}
                      onMouseEnter={()=>setHoveredId(acct.id)}
                      onMouseLeave={()=>setHoveredId(null)}>
                      <div style={{width:32,flexShrink:0,textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" style={{cursor:'pointer',accentColor:'#2563eb'}}
                          checked={selectedForExport.has(acct.id)}
                          onChange={e=>{setSelectedForExport(prev=>{const s=new Set(prev);if(e.target.checked)s.add(acct.id);else s.delete(acct.id);return s})}}/>
                      </div>
                      <div style={{width:28,flexShrink:0,color:'#94a3b8',fontSize:11}}>{isExp?'▼':'▶'}</div>
                      <div style={{width:28,flexShrink:0,textAlign:'center',fontSize:14}}>
                        {isHot(acct)?<span title='Hot account'>🔥</span>:null}
                      </div>
                      <div style={{flex:'0 0 200px',display:'flex',alignItems:'center',paddingRight:12,minWidth:0}}>
                        <span style={{fontWeight:700,fontSize:14,color:isLight?'#0f172a':S.txt,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{acct.name}</span>
                      </div>
                      <div style={{flex:'0 0 120px',fontSize:12,color:'#64748b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingRight:12}}>{acct.hq||''}</div>
                      <div style={{flex:'1 1 140px',fontSize:12,color:'#64748b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingRight:12}}>{acct.industry||''}</div>
                      <div style={{flex:'0 0 90px',textAlign:'right',fontSize:12,color:'#64748b'}}>{acct.employees||''}</div>
                      <div style={{flex:'0 0 110px',textAlign:'right',fontSize:12,color:'#64748b',paddingRight:16}}>{acct.revenue||''}</div>
                      <div style={{flex:'0 0 70px',textAlign:'center'}}>
                        {intelCount>0&&<span style={{fontSize:11,fontWeight:600,color:'#7c3aed',background:'#ede9fe',borderRadius:999,padding:'2px 7px'}}>{intelCount}</span>}
                      </div>
                      <div style={{flex:'0 0 90px',textAlign:'right',fontSize:11,color:'#94a3b8'}}>{fmtRel(acct.updatedAt||acct.addedAt)}</div>
                      <div style={{flex:'0 0 130px',textAlign:'right'}}>
                        <span style={{fontSize:11,fontWeight:700,color:'#fff',background:sc,borderRadius:999,padding:'3px 10px',whiteSpace:'nowrap'}}>{acct.status}</span>
                      </div>
                      <div style={{width:44,flexShrink:0,display:'flex',justifyContent:'flex-end'}} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>deleteAccount(acct.id)} style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:10,padding:'2px 4px',display:'flex',alignItems:'center'}}
                          onMouseEnter={e=>e.currentTarget.style.color='#dc2626'} onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}><Trash2 size={12}/></button>
                      </div>
                    </div>
                    {isExp&&<ExpandedWhitespaceRow key={acct.id+'-exp'} acct={acct} updateAccount={updateAccount} isLight={isLight} onRescore={rescoreAccount} scoringId={scoringId}/>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ADD ACCOUNT MODAL */}
      {showAdd&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={()=>setShowAdd(false)}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,padding:28,width:'100%',maxWidth:480,boxShadow:'0 20px 60px rgba(0,0,0,0.4)',maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,color:S.txt,marginBottom:18}}>Add Whitespace Account</div>
            {[{label:'Account Name *',key:'name'},{label:'HQ / Location',key:'hq'},{label:'Industry',key:'industry'},{label:'Employees',key:'employees',placeholder:'e.g. 5,000'},{label:'Revenue',key:'revenue',placeholder:'e.g. $500M'}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{f.label}</div>
                <input value={addForm[f.key]||''} onChange={e=>setAddForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder||''}
                  style={{width:'100%',fontSize:13,padding:'8px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,boxSizing:'border-box',outline:'none'}}/>
              </div>
            ))}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Status</div>
              <select value={addForm.status} onChange={e=>setAddForm(p=>({...p,status:e.target.value}))}
                style={{width:'100%',fontSize:13,padding:'8px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt}}>
                {['Prospect','Researching','Reached Out','Active Conversation'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Initial Notes</div>
              <textarea value={addForm.notes||''} onChange={e=>setAddForm(p=>({...p,notes:e.target.value}))} rows={3} placeholder='What do you know about this account so far?'
                style={{width:'100%',fontSize:13,padding:'8px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,boxSizing:'border-box',resize:'vertical',fontFamily:'inherit',lineHeight:1.5}}/>
            </div>
            {addDupeWarning&&(
              <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'12px 14px',marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:600,color:'#92400e',marginBottom:8}}>⚠ Similar account already exists: <strong>{addDupeWarning.match.name}</strong></div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>{setShowAdd(false);setAddDupeWarning(null);setExpandedId(addDupeWarning.match.id)}} style={{flex:1,padding:'8px',background:'#2563eb',border:'none',borderRadius:7,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>Update Existing</button>
                  <button onClick={addAccount} style={{flex:1,padding:'8px',background:'transparent',border:'1px solid #fde68a',borderRadius:7,color:'#92400e',fontSize:12,fontWeight:600,cursor:'pointer'}}>Create Anyway</button>
                </div>
              </div>
            )}
            <div style={{display:'flex',gap:10}}>
              <button onClick={addAccount} style={{flex:1,padding:'11px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Add Account</button>
              <button onClick={()=>{setShowAdd(false);setAddForm({name:'',hq:'',industry:'',employees:'',revenue:'',status:'Prospect',notes:''});setAddDupeWarning(null)}} style={{padding:'11px 16px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD INTELLIGENCE MODAL */}
      {showIntel&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={()=>{resetWsFileState();setShowIntel(false)}}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,width:'65vw',maxWidth:900,maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.5)'}} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{padding:'20px 24px 14px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:17,fontWeight:700,color:S.txt,marginBottom:4}}>Add Whitespace Intelligence</div>
                  <div style={{fontSize:12,color:S.muted,lineHeight:1.5}}>Paste a transcript or upload a file. AI extracts prospect accounts and maps them to your whitespace tracker.</div>
                </div>
                <button onClick={()=>{resetWsFileState();setShowIntel(false)}} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,padding:'0 4px',marginTop:-2}}>×</button>
              </div>
            </div>
            {/* Scrollable content */}
            <div style={{flex:1,padding:'16px 24px',display:'flex',flexDirection:'column',gap:12,overflowY:'auto',minHeight:0}}>
              {/* Textarea — hidden when PDF or image is loaded */}
              {!wsFileIsDirectType&&(
                <div style={{position:'relative'}}>
                  <textarea
                    value={intelText}
                    onChange={e=>setIntelText(e.target.value)}
                    placeholder={`Paste a vendor call or quick note here...\n\nExample: 'On a call with CrowdStrike today. They mentioned Waters Corporation is actively evaluating EDR — no incumbent, budget confirmed Q3. Also Watts Water is looking at SIEM. Sarah Chen is the IT contact at Waters.'`}
                    rows={7}
                    style={{width:'100%',fontSize:13,padding:'12px 14px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:8,color:S.txt,boxSizing:'border-box',resize:'vertical',fontFamily:'inherit',lineHeight:1.6,outline:'none',display:'block'}}
                  />
                  <div style={{textAlign:'right',fontSize:11,color:S.muted,marginTop:3}}>{intelText.length.toLocaleString()} / 40,000</div>
                </div>
              )}
              {/* PDF / image file preview card */}
              {wsFileIsDirectType&&wsUploadedFile&&(
                <div style={{background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'14px 16px',display:'flex',alignItems:'center',gap:14}}>
                  <div style={{fontSize:32,flexShrink:0,lineHeight:1}}>{wsUploadedFile.name.endsWith('.pdf')?'📄':'🖼️'}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#1e40af',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{wsUploadedFile.name}</div>
                    <div style={{fontSize:11,color:'#3b82f6',marginTop:2}}>{(wsUploadedFile.size/1024).toFixed(0)} KB · Ready to analyze with AI</div>
                    <div style={{fontSize:11,color:'#64748b',marginTop:3}}>{wsUploadedFile.name.endsWith('.pdf')?'PDF will be analyzed directly by AI':'Image will be analyzed directly by AI'}</div>
                  </div>
                  <button onClick={e=>{e.stopPropagation();resetWsFileState()}} style={{background:'none',border:'none',color:'#60a5fa',cursor:'pointer',fontSize:18,lineHeight:1,padding:0,flexShrink:0}}>×</button>
                </div>
              )}
              {/* File upload zone — visible when no file loaded */}
              {!wsUploadedFile&&(
                <div
                  onDragOver={e=>{e.preventDefault();setWsDragOver(true)}}
                  onDragLeave={()=>setWsDragOver(false)}
                  onDrop={e=>{e.preventDefault();setWsDragOver(false);const f=e.dataTransfer.files[0];if(f)wsHandleFile(f)}}
                  onClick={()=>!wsFileLoading&&wsFileInputRef.current?.click()}
                  style={{border:`2px dashed ${wsDragOver?'#2563eb':'#cbd5e1'}`,borderRadius:8,padding:20,textAlign:'center',background:wsDragOver?'#eff6ff':S.surf2,cursor:wsFileLoading?'default':'pointer',transition:'all 0.15s'}}>
                  <input ref={wsFileInputRef} type='file' accept='.txt,.pdf,.doc,.docx,.md,.png,.jpg,.jpeg,.webp' style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)wsHandleFile(f);e.target.value=''}}/>
                  {wsFileLoading?(
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:13,color:S.muted}}>
                      <span style={{display:'inline-block',width:14,height:14,border:'2px solid #cbd5e1',borderTop:'2px solid #2563eb',borderRadius:'50%',animation:'ilSpin 0.75s linear infinite',flexShrink:0}}/>
                      Reading file...
                    </div>
                  ):(
                    <>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{margin:'0 auto 6px',display:'block'}}><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <div style={{fontSize:13,color:S.muted,marginBottom:2}}>Drop a file here or click to upload</div>
                      <div style={{fontSize:11,color:'#94a3b8'}}>Supports PDF, DOCX, TXT, MD, PNG, JPG, WEBP</div>
                    </>
                  )}
                </div>
              )}
              {/* DOCX / TXT file pill */}
              {!wsFileIsDirectType&&wsUploadedFile&&(
                <div>
                  <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:999,padding:'4px 10px',fontSize:12,color:'#1d4ed8'}}>
                    <span>📄 {wsUploadedFile.name} · {(wsUploadedFile.size/1024).toFixed(0)} KB</span>
                    <button onClick={e=>{e.stopPropagation();resetWsFileState()}} style={{background:'none',border:'none',color:'#60a5fa',cursor:'pointer',fontSize:16,lineHeight:1,padding:0,display:'flex',alignItems:'center'}}>×</button>
                  </div>
                  {wsFileCharCount>0&&<div style={{fontSize:11,color:S.muted,marginTop:3,paddingLeft:2}}>Extracted: {wsFileCharCount.toLocaleString()} characters{wsFileCharCount>WS_FILE_CHAR_LIMIT?` (processing first ${WS_FILE_CHAR_LIMIT.toLocaleString()})`:''}</div>}
                </div>
              )}
              {wsLargeDocWarning&&(
                <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#92400e',display:'flex',alignItems:'flex-start',gap:6}}>
                  <span style={{flexShrink:0,fontSize:14}}>⚠</span>
                  <span>Large document — processing first 100,000 characters. Upload remaining pages separately if needed.</span>
                </div>
              )}
              {wsFileStatus&&!intelLoading&&(
                <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#0369a1',display:'flex',alignItems:'center',gap:6}}>
                  <span style={{display:'inline-block',width:12,height:12,border:'2px solid #bae6fd',borderTop:'2px solid #0369a1',borderRadius:'50%',animation:'ilSpin 0.75s linear infinite',flexShrink:0}}/>
                  {wsFileStatus}
                </div>
              )}
              {wsFileError&&(
                <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#dc2626'}}>{wsFileError}</div>
              )}
              {intelError&&wsFileIsDirectType&&wsPendingFile&&wsPendingFile.name.endsWith('.pdf')&&(
                <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#dc2626',display:'flex',alignItems:'flex-start',gap:8}}>
                  <div style={{flex:1}}>{intelError}</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',flexShrink:0}}>
                    <button onClick={()=>{setIntelError('');processFileIntel(wsPendingDate,true)}} style={{fontSize:12,color:'#1d4ed8',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'3px 10px',cursor:'pointer',fontWeight:600}}>Try Again (text extraction)</button>
                    <button onClick={()=>{resetWsFileState();setIntelError('')}} style={{fontSize:12,color:'#64748b',background:'transparent',border:'1px solid #e2e8f0',borderRadius:6,padding:'3px 8px',cursor:'pointer'}}>Clear file</button>
                  </div>
                </div>
              )}
            </div>
            {/* Fixed footer */}
            <div style={{padding:'12px 24px 16px',borderTop:`1px solid ${S.bdr}`,flexShrink:0,display:'flex',alignItems:'center',gap:12}}>
              {!wsFileIsDirectType&&(
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:12,color:S.muted,fontWeight:500}}>Date:</span>
                  <input type='date' value={intelDate} onChange={e=>setIntelDate(e.target.value)}
                    style={{fontSize:12,padding:'5px 8px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,outline:'none'}}/>
                </div>
              )}
              {intelError&&!wsFileIsDirectType&&<div style={{fontSize:12,color:S.red,flex:1}}>{intelError}</div>}
              {!intelError&&(wsRetryStatus||intelStatus)&&<div style={{fontSize:12,color:S.muted,flex:1}}>{wsRetryStatus||intelStatus}</div>}
              <button onClick={handleWsProcess} disabled={intelLoading||(wsFileIsDirectType?!wsPendingFile:!intelText.trim())}
                style={{marginLeft:'auto',display:'inline-flex',alignItems:'center',gap:7,padding:'10px 24px',background:intelLoading||(wsFileIsDirectType?!wsPendingFile:!intelText.trim())?'#94a3b8':'linear-gradient(135deg,#1d4ed8,#2563eb)',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:intelLoading||(wsFileIsDirectType?!wsPendingFile:!intelText.trim())?'not-allowed':'pointer',minWidth:180,justifyContent:'center',whiteSpace:'nowrap'}}>
                {intelLoading?<><span style={{display:'inline-block',width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'ilSpin 0.7s linear infinite'}}/>Processing…</>:wsFileIsDirectType?<><Zap size={14}/>Analyze Document with AI</>:<><Zap size={14}/>Process with AI</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DATE CONFIRMATION MODAL for whitespace file uploads */}
      {wsShowDate&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1100,padding:20}} onClick={()=>setWsShowDate(false)}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,padding:24,width:'100%',maxWidth:380,boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:15,fontWeight:700,color:S.txt,marginBottom:6}}>{wsDateModalIsFile?'When did this document originate?':'Confirm document date'}</div>
            <p style={{fontSize:13,color:S.muted,marginBottom:12,lineHeight:1.6}}>{wsDateModalIsFile?'When was this document created or the event it describes occurred?':'Is the date in this document correct?'}</p>
            {wsCustomDate&&<div style={{fontSize:12,color:'#15803d',padding:'6px 10px',background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:5,marginBottom:12}}>Date detected: <strong>{fmtDate(wsCustomDate)}</strong></div>}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Custom date (leave blank for today)</div>
              <input type='date' value={wsCustomDate} onChange={e=>setWsCustomDate(e.target.value)}
                style={{width:'100%',boxSizing:'border-box',fontSize:13,padding:'8px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,outline:'none'}}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{const d=new Date().toISOString().split('T')[0];setWsShowDate(false);wsDateModalIsFile?processFileIntel(d):processIntel(d)}}
                style={{flex:1,padding:'9px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Use Today</button>
              <button onClick={()=>{if(wsCustomDate){setWsShowDate(false);wsDateModalIsFile?processFileIntel(wsCustomDate):processIntel(wsCustomDate)}}}
                style={{flex:1,padding:'9px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.txt,fontSize:13,cursor:'pointer',opacity:wsCustomDate?1:0.4}}>
                {wsCustomDate?`Use ${fmtDate(wsCustomDate)}`:'Use Custom Date'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MERGE ACCOUNTS MODAL */}
      {showMerge&&(()=>{
        const mergeFiltered = ws.filter(a=>!mergeSearch.trim()||(a.name||'').toLowerCase().includes(mergeSearch.toLowerCase()))
        const mergeSelectedAccts = ws.filter(a=>mergeSelected.has(a.id))
        const primaryAcct = ws.find(a=>a.id===mergePrimary)
        // Preview counts for step 2
        const previewNotes = mergeSelectedAccts.reduce((sum,a)=>sum+(a.notes||[]).length,0)
        const previewIntel = mergeSelectedAccts.reduce((sum,a)=>sum+(a.intelLog||[]).length,0)
        const contactNames = new Set(); mergeSelectedAccts.forEach(a=>(a.contacts||[]).forEach(c=>contactNames.add((c.name||'').toLowerCase())))
        const techNames = new Set(); mergeSelectedAccts.forEach(a=>(a.technologies||[]).forEach(t=>techNames.add((t.vendor||'').toLowerCase())))
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={()=>setShowMerge(false)}>
            <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,width:'65vw',maxWidth:860,maxHeight:'75vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.5)'}} onClick={e=>e.stopPropagation()}>
              {/* Header */}
              <div style={{padding:'20px 24px 14px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:17,fontWeight:700,color:S.txt,marginBottom:3}}>{mergeStep===1?'Merge Accounts':'Configure Merge'}</div>
                  <div style={{fontSize:12,color:S.muted}}>{mergeStep===1?'Select 2 or more accounts to merge into one':'Choose the primary account to keep as the base'}</div>
                </div>
                <button onClick={()=>setShowMerge(false)} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,padding:'0 4px'}}>×</button>
              </div>
              {/* Step 1: Select accounts */}
              {mergeStep===1&&(
                <>
                  <div style={{padding:'12px 24px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0}}>
                    <input value={mergeSearch} onChange={e=>setMergeSearch(e.target.value)} placeholder='Search accounts…'
                      style={{width:'100%',boxSizing:'border-box',fontSize:13,padding:'8px 12px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,outline:'none'}}/>
                  </div>
                  <div style={{flex:1,overflowY:'auto'}}>
                    {mergeFiltered.map(a=>{
                      const checked = mergeSelected.has(a.id)
                      const intelCnt = (a.notes||[]).length+(a.intelLog||[]).length
                      return (
                        <div key={a.id} onClick={()=>{setMergeSelected(prev=>{const ns=new Set(prev);if(ns.has(a.id))ns.delete(a.id);else ns.add(a.id);return ns})}}
                          style={{display:'flex',alignItems:'center',gap:12,padding:'11px 24px',borderBottom:`1px solid ${S.bdr}`,cursor:'pointer',background:checked?(isLight?'#f0f9ff':'rgba(37,99,235,0.05)'):'transparent'}}
                          onMouseEnter={e=>{if(!checked)e.currentTarget.style.background=S.surf2}}
                          onMouseLeave={e=>{e.currentTarget.style.background=checked?(isLight?'#f0f9ff':'rgba(37,99,235,0.05)'):'transparent'}}>
                          <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${checked?'#2563eb':S.bdr}`,background:checked?'#2563eb':'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                            {checked&&<svg width="10" height="8" viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:14,fontWeight:700,color:S.txt,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</div>
                            {(a.hq||a.industry)&&<div style={{fontSize:11,color:S.muted}}>{[a.hq,a.industry].filter(Boolean).join(' · ')}</div>}
                          </div>
                          <div style={{display:'flex',gap:8,flexShrink:0,fontSize:11,color:S.muted}}>
                            {intelCnt>0&&<span style={{color:'#7c3aed',fontWeight:600}}>{intelCnt} intel</span>}
                            {(a.contacts||[]).length>0&&<span>{(a.contacts||[]).length} contacts</span>}
                            {(a.technologies||[]).length>0&&<span>{(a.technologies||[]).length} tech</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{padding:'14px 24px',borderTop:`1px solid ${S.bdr}`,display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
                    <span style={{fontSize:12,color:S.muted}}>{mergeSelected.size} account{mergeSelected.size!==1?'s':''} selected</span>
                    <button onClick={()=>{if(mergeSelected.size>=2){const ids=[...mergeSelected];setMergePrimary(ids[0]);setMergeStep(2)}}} disabled={mergeSelected.size<2}
                      style={{marginLeft:'auto',padding:'10px 24px',background:mergeSelected.size<2?'#94a3b8':'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:mergeSelected.size<2?'not-allowed':'pointer'}}>
                      Next →
                    </button>
                  </div>
                </>
              )}
              {/* Step 2: Configure merge */}
              {mergeStep===2&&(
                <>
                  <div style={{flex:1,overflowY:'auto',padding:'16px 24px',display:'flex',flexDirection:'column',gap:16}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>Primary Account (keep this name &amp; details)</div>
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        {mergeSelectedAccts.map(a=>(
                          <label key={a.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:mergePrimary===a.id?(isLight?'#eff6ff':'rgba(37,99,235,0.1)'):S.surf2,border:`2px solid ${mergePrimary===a.id?'#2563eb':S.bdr}`,borderRadius:8,cursor:'pointer',transition:'all 0.12s'}}>
                            <input type='radio' checked={mergePrimary===a.id} onChange={()=>setMergePrimary(a.id)} style={{accentColor:'#2563eb',width:16,height:16,flexShrink:0}}/>
                            <div style={{flex:1}}>
                              <div style={{fontSize:14,fontWeight:700,color:S.txt}}>{a.name}</div>
                              {(a.hq||a.industry)&&<div style={{fontSize:11,color:S.muted}}>{[a.hq,a.industry].filter(Boolean).join(' · ')}</div>}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div style={{background:S.surf2,borderRadius:10,padding:'14px 16px'}}>
                      <div style={{fontSize:12,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>Merge Preview</div>
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        {[
                          {label:'Notes',value:previewNotes},
                          {label:'Intel entries',value:previewIntel},
                          {label:'Contacts',value:contactNames.size,suffix:' (duplicates removed)'},
                          {label:'Technologies',value:techNames.size,suffix:' (duplicates removed)'},
                        ].map(r=>(
                          <div key={r.label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:13}}>
                            <span style={{color:S.muted}}>{r.label}</span>
                            <span style={{fontWeight:700,color:S.txt}}>{r.value}{r.suffix||''}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{marginTop:10,fontSize:12,color:S.muted,lineHeight:1.5}}>
                        Primary account name, HQ, industry, employees, revenue, and status will be kept. All intel, contacts, and technologies from all selected accounts will be combined.
                      </div>
                    </div>
                  </div>
                  <div style={{padding:'14px 24px',borderTop:`1px solid ${S.bdr}`,display:'flex',gap:10,flexShrink:0}}>
                    <button onClick={()=>setMergeStep(1)} style={{padding:'10px 18px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>← Back</button>
                    <button onClick={executeMerge} disabled={!mergePrimary}
                      style={{flex:1,padding:'10px',background:!mergePrimary?'#94a3b8':'linear-gradient(135deg,#1d4ed8,#2563eb)',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:!mergePrimary?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7}}>
                      <GitMerge size={14}/>Merge Accounts
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* DUPLICATE REVIEW MODAL */}
      {showDupeReview&&(()=>{
        // Filter to only pairs still present (after merges/deletes)
        const livePairs = dupePairs.filter(([a,b])=>ws.some(w=>w.id===a.id)&&ws.some(w=>w.id===b.id))
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={()=>setShowDupeReview(false)}>
            <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,width:'70vw',maxWidth:900,maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.5)'}} onClick={e=>e.stopPropagation()}>
              <div style={{padding:'20px 24px 14px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:17,fontWeight:700,color:S.txt,marginBottom:3}}>Review Possible Duplicates</div>
                  <div style={{fontSize:12,color:S.muted}}>{livePairs.length} pair{livePairs.length!==1?'s':''} detected. Review each and choose how to handle them.</div>
                </div>
                <button onClick={()=>setShowDupeReview(false)} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,padding:'0 4px'}}>×</button>
              </div>
              <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
                {livePairs.length===0?(
                  <div style={{padding:'40px',textAlign:'center',color:S.muted,fontSize:13}}>No duplicates remaining. All good!</div>
                ):livePairs.map(([a,b],pi)=>{
                  const aIntel=(a.notes||[]).length+(a.intelLog||[]).length
                  const bIntel=(b.notes||[]).length+(b.intelLog||[]).length
                  return (
                    <div key={pi} style={{padding:'16px 24px',borderBottom:`1px solid ${S.bdr}`}}>
                      <div style={{display:'flex',gap:16,marginBottom:12}}>
                        {[{acct:a,intel:aIntel},{acct:b,intel:bIntel}].map(({acct,intel},si)=>(
                          <div key={si} style={{flex:1,background:S.surf2,borderRadius:8,padding:'12px 14px'}}>
                            <div style={{fontSize:14,fontWeight:700,color:S.txt,marginBottom:3}}>{acct.name}</div>
                            {(acct.hq||acct.industry)&&<div style={{fontSize:11,color:S.muted,marginBottom:5}}>{[acct.hq,acct.industry].filter(Boolean).join(' · ')}</div>}
                            <div style={{display:'flex',gap:10,fontSize:11,color:S.muted,flexWrap:'wrap'}}>
                              {intel>0&&<span style={{color:'#7c3aed',fontWeight:600}}>{intel} intel</span>}
                              {(acct.contacts||[]).length>0&&<span>{(acct.contacts||[]).length} contacts</span>}
                              {(acct.technologies||[]).length>0&&<span>{(acct.technologies||[]).length} tech</span>}
                              <span style={{fontSize:10,color:'#64748b',background:S.bdr,borderRadius:4,padding:'1px 6px'}}>{acct.status||'Prospect'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={()=>handleDupeAction('keepA',a,b)} style={{flex:1,padding:'8px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,fontSize:12,fontWeight:600,cursor:'pointer'}}>Keep "{a.name.slice(0,22)}{a.name.length>22?'…':''}"</button>
                        <button onClick={()=>{handleDupeAction('merge',a,b);if(livePairs.length<=1)setShowDupeReview(false)}} style={{flex:1,padding:'8px',background:'#2563eb',border:'none',borderRadius:7,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}><GitMerge size={12}/>Merge</button>
                        <button onClick={()=>handleDupeAction('keepB',a,b)} style={{flex:1,padding:'8px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,fontSize:12,fontWeight:600,cursor:'pointer'}}>Keep "{b.name.slice(0,22)}{b.name.length>22?'…':''}"</button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{padding:'14px 24px',borderTop:`1px solid ${S.bdr}`,display:'flex',justifyContent:'flex-end',flexShrink:0}}>
                <button onClick={()=>{setShowDupeReview(false);setDupeDismissed(true)}} style={{padding:'10px 20px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>Done</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* CONFIRMATION MODAL */}
      {pendingIntel&&(()=>{
        const totalFound = pendingIntel.accounts.length
        const blockedCount = pendingIntel.accounts.filter(a=>isBlockedAccount(a.name)).length
        const availableCount = totalFound - blockedCount
        const allBlocked = blockedCount === totalFound
        const confirmName = i => { if((editingNameDraft||'').trim())setPendingNames(p=>({...p,[i]:editingNameDraft.trim()})); setEditingNameIdx(null); setEditingNameDraft('') }
        const cancelName = () => { setEditingNameIdx(null); setEditingNameDraft('') }
        return (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={closeIntelModal}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,width:'60vw',maxWidth:780,maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.5)'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'20px 24px 14px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:17,fontWeight:700,color:S.txt,marginBottom:3}}>Review Extracted Accounts</div>
                  <div style={{fontSize:12,color:S.muted}}>Select accounts to add or update in your whitespace tracker. Click the pencil to correct a name.</div>
                </div>
                <button onClick={closeIntelModal} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,padding:'0 4px'}}>×</button>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10,marginTop:10,flexWrap:'wrap'}}>
                <span style={{fontSize:12,color:S.muted}}>{totalFound} found</span>
                {blockedCount>0&&<><span style={{fontSize:12,color:S.muted}}>·</span><span style={{fontSize:12,color:'#dc2626',fontWeight:600}}>{blockedCount} blocked</span></>}
                {availableCount>0&&<><span style={{fontSize:12,color:S.muted}}>·</span><span style={{fontSize:12,color:'#0ebc5f',fontWeight:600}}>{availableCount} available</span></>}
                <span style={{flex:1}}/>
                <button onClick={()=>setSelectedIntel(new Set(pendingIntel.accounts.map((_,i)=>i).filter(i=>!isBlockedAccount(pendingIntel.accounts[i].name))))} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer',padding:0,fontWeight:600}}>Select Available</button>
                <span style={{fontSize:12,color:S.muted}}>·</span>
                <button onClick={()=>setSelectedIntel(new Set())} style={{fontSize:12,color:S.muted,background:'none',border:'none',cursor:'pointer',padding:0}}>Deselect All</button>
                <span style={{fontSize:12,color:S.muted}}>{selectedIntel.size} of {totalFound} selected</span>
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
              {allBlocked?(
                <div style={{padding:'32px 24px',textAlign:'center'}}>
                  <div style={{fontSize:15,fontWeight:700,color:S.txt,marginBottom:8}}>All accounts mentioned are already in the named accounts list.</div>
                  <div style={{fontSize:13,color:S.muted,lineHeight:1.6}}>These accounts are covered by other reps. You can still add them to your whitespace tracker for monitoring, but you cannot actively pursue them without clearing the conflict.</div>
                </div>
              ):(
                pendingIntel.accounts.map((a,i)=>{
                  const displayName = pendingNames[i] || a.name
                  const inWS = (data.whitespaceAccounts||[]).find(w=>fuzzyMatchAccount(displayName, w.name))
                  const possibleWS = !inWS && (data.whitespaceAccounts||[]).find(w=>{ const s=fuzzyBigramScore(displayName,w.name); return s>=0.5&&s<0.7 })
                  const inCRM = (data.accounts||[]).some(ac=>(ac.name||'').toLowerCase().slice(0,8)===(displayName||'').toLowerCase().slice(0,8))
                  const blocked = isBlockedAccount(displayName)
                  const openNamed = !blocked && isOpenNamedAccount(displayName)
                  const owner = getAccountOwner(displayName)
                  const isChecked = selectedIntel.has(i)
                  const dimmed = inCRM
                  const isEditingThis = editingNameIdx === i
                  return (
                    <div key={i} onClick={()=>{if(dimmed||isEditingThis)return;setSelectedIntel(prev=>{const ns=new Set(prev);if(ns.has(i))ns.delete(i);else ns.add(i);return ns})}}
                      style={{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 24px',borderBottom:`1px solid ${S.bdr}`,cursor:dimmed||isEditingThis?'default':'pointer',opacity:dimmed?0.45:1,background:isChecked&&!dimmed?(S.isLight?'#f0f9ff':'rgba(37,99,235,0.05)'):'transparent'}}
                      onMouseEnter={e=>{if(!dimmed&&!isEditingThis)e.currentTarget.style.background=S.surf2}}
                      onMouseLeave={e=>{e.currentTarget.style.background=isChecked&&!dimmed?(S.isLight?'#f0f9ff':'rgba(37,99,235,0.05)'):'transparent'}}>
                      <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${isChecked&&!dimmed?'#2563eb':S.bdr}`,background:isChecked&&!dimmed?'#2563eb':'transparent',flexShrink:0,marginTop:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {isChecked&&!dimmed&&<svg width="10" height="8" viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3,flexWrap:'wrap'}}>
                          {isEditingThis ? (
                            <div style={{display:'flex',alignItems:'center',gap:5}} onClick={e=>e.stopPropagation()}>
                              <input
                                autoFocus
                                value={editingNameDraft}
                                onChange={e=>setEditingNameDraft(e.target.value)}
                                onKeyDown={e=>{if(e.key==='Enter')confirmName(i);else if(e.key==='Escape')cancelName()}}
                                style={{fontSize:13,fontWeight:600,padding:'3px 8px',background:'#ffffff',border:'1px solid #2563eb',borderRadius:4,color:'#0f172a',outline:'none',minWidth:180}}
                              />
                              <button onClick={()=>confirmName(i)} title='Save' style={{background:'transparent',border:'none',cursor:'pointer',color:'#16a34a',padding:'2px',display:'flex',alignItems:'center'}}>
                                <svg width="14" height="14" viewBox="0 0 14 14"><polyline points="2,7 6,11 12,3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              </button>
                              <button onClick={cancelName} title='Cancel' style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',padding:'2px',display:'flex',alignItems:'center',fontSize:15,lineHeight:1}}>×</button>
                            </div>
                          ) : (
                            <>
                              <span style={{fontSize:14,fontWeight:700,color:S.txt}}>{displayName}</span>
                              <button onClick={e=>{e.stopPropagation();setEditingNameIdx(i);setEditingNameDraft(displayName)}} title='Edit name'
                                style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',padding:'1px 2px',display:'flex',alignItems:'center',lineHeight:1,marginLeft:2}}
                                onMouseEnter={e=>e.currentTarget.style.color='#2563eb'}
                                onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}>
                                <Pencil size={12}/>
                              </button>
                            </>
                          )}
                          {blocked&&<span style={{fontSize:10,fontWeight:700,color:'#dc2626',background:'#fee2e2',borderRadius:4,padding:'1px 7px',whiteSpace:'nowrap'}}>Named — {owner||'Other rep'}</span>}
                          {openNamed&&<span style={{fontSize:10,fontWeight:700,color:'#1d4ed8',background:'#dbeafe',borderRadius:4,padding:'1px 7px',whiteSpace:'nowrap'}}>Open ({owner})</span>}
                          {!blocked&&!openNamed&&!inCRM&&!inWS&&!possibleWS&&<span style={{fontSize:10,fontWeight:700,color:'#15803d',background:'#dcfce7',borderRadius:4,padding:'1px 7px'}}>New</span>}
                          {inWS&&<span style={{fontSize:10,fontWeight:700,color:'#a16207',background:'#fef9c3',borderRadius:4,padding:'1px 7px',whiteSpace:'nowrap',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis'}}>Update existing{inWS.name.toLowerCase()!==displayName.toLowerCase()?` · Matches: ${inWS.name}`:''}</span>}
                          {possibleWS&&<span style={{fontSize:10,fontWeight:700,color:'#d97706',background:'#fef3c7',borderRadius:4,padding:'1px 7px',whiteSpace:'nowrap'}}>Possible match? · {possibleWS.name}</span>}
                          {inCRM&&<span style={{fontSize:10,fontWeight:700,color:'#64748b',background:S.surf2,borderRadius:4,padding:'1px 7px',border:`1px solid ${S.bdr}`}}>In CRM</span>}
                        </div>
                        {(a.hq||a.industry||a.employees||a.revenue)&&(
                          <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:5}}>
                            {a.hq&&<span style={{fontSize:10,color:'#64748b',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:12,padding:'1px 8px',whiteSpace:'nowrap'}}>HQ: {a.hq}</span>}
                            {a.employees&&<span style={{fontSize:10,color:'#64748b',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:12,padding:'1px 8px',whiteSpace:'nowrap'}}>Employees: {a.employees}</span>}
                            {a.revenue&&<span style={{fontSize:10,color:'#64748b',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:12,padding:'1px 8px',whiteSpace:'nowrap'}}>Revenue: {a.revenue}</span>}
                            {a.industry&&<span style={{fontSize:10,color:'#64748b',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:12,padding:'1px 8px',whiteSpace:'nowrap'}}>Industry: {a.industry}</span>}
                          </div>
                        )}
                        {a.note&&<div style={{fontSize:12,color:S.muted,fontStyle:'italic',lineHeight:1.5}}>{a.note.slice(0,120)}{a.note.length>120?'…':''}</div>}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div style={{padding:'14px 24px',borderTop:`1px solid ${S.bdr}`,display:'flex',gap:10,flexShrink:0}}>
              <button onClick={saveIntel} disabled={selectedIntel.size===0}
                style={{flex:1,padding:'11px',background:selectedIntel.size===0?'#94a3b8':'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:selectedIntel.size===0?'not-allowed':'pointer'}}>
                Add Selected ({selectedIntel.size})
              </button>
              <button onClick={closeIntelModal} style={{padding:'11px 20px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* AUTO-FILL CONFIRMATION MODAL */}
      {showAutoFillModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:20}} onClick={()=>setShowAutoFillModal(false)}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,padding:28,width:'100%',maxWidth:440,boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,color:S.txt,marginBottom:10}}>Auto-fill Missing Data</div>
            <div style={{fontSize:13,color:S.muted,lineHeight:1.6,marginBottom:20}}>
              AI will search for employee count and revenue for <strong style={{color:S.txt}}>{ws.filter(a=>!a.employees||!a.revenue).length} accounts</strong> with missing data. This uses your API key.
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={handleAutoFill} style={{flex:1,padding:'10px',background:'#15803d',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Continue</button>
              <button onClick={()=>setShowAutoFillModal(false)} style={{padding:'10px 20px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAN NOTES CONFIRMATION MODAL */}
      {showCleanNotesModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:20}} onClick={()=>setShowCleanNotesModal(false)}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,padding:28,width:'100%',maxWidth:480,boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,color:S.txt,marginBottom:10}}>Clean Duplicate Notes</div>
            <div style={{fontSize:13,color:S.muted,lineHeight:1.6,marginBottom:20}}>
              AI will clean up redundant notes for <strong style={{color:S.txt}}>{ws.filter(a=>((a.intelLog||[]).length+(a.notes||[]).length)>2).length} accounts</strong>. Duplicate and repetitive information will be consolidated. Original entries are archived and not lost.
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={handleCleanNotes} style={{flex:1,padding:'10px',background:'#1d4ed8',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Continue</button>
              <button onClick={()=>setShowCleanNotesModal(false)} style={{padding:'10px 20px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* AI OPERATION PROGRESS OVERLAY */}
      {aiOpRunning&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2100,padding:20}}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,padding:32,width:'100%',maxWidth:440,boxShadow:'0 20px 60px rgba(0,0,0,0.5)',textAlign:'center'}}>
            <div style={{fontSize:28,marginBottom:12}}>⏳</div>
            <div style={{fontSize:15,fontWeight:700,color:S.txt,marginBottom:8}}>AI Working…</div>
            <div style={{fontSize:13,color:S.muted,lineHeight:1.6}}>{aiOpProgress}</div>
          </div>
        </div>
      )}

      {/* AI OPERATION SUMMARY TOAST */}
      {aiOpSummary&&!aiOpRunning&&(
        <div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'#1e293b',color:'#f0fdf4',padding:'12px 24px',borderRadius:10,fontSize:13,fontWeight:600,zIndex:2000,boxShadow:'0 4px 20px rgba(0,0,0,0.4)',display:'flex',alignItems:'center',gap:10}}>
          <span style={{color:'#4ade80'}}>✓</span>{aiOpSummary}
          <button onClick={()=>setAiOpSummary('')} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:16,lineHeight:1,marginLeft:8}}>×</button>
        </div>
      )}
    </div>
  )
}

const TABS = [{id:'overview',label:'Overview'},{id:'dashboard',label:'Dashboard'},{id:'contacts',label:'Contacts'},{id:'stack',label:'Tech Stack'},{id:'projects',label:'Projects'},{id:'followups',label:'Actions'},{id:'intel',label:'Intel Log'},{id:'aihistory',label:'History'},{id:'files',label:'Files'},{id:'admin',label:'Admin'},{id:'settings',label:'Settings'}]

function KanbanCard({p, col, updateProject}) {
  const [editingDate, setEditingDate] = useState(false)
  const comp=p.timeline.filter(s=>s.status==='completed').length
  const currStage=p.timeline.find(s=>s.status==='current')
  return (
    <div style={{background:'#f8fafc',borderRadius:10,border:'1px solid #e2e8f0',padding:'12px 13px'}}>
      <div style={{fontSize:14,fontWeight:700,color:'#0f172a',lineHeight:1.3,marginBottom:5}}>{p.name}</div>
      {p.vendor&&<div style={{fontSize:12,color:'#64748b',marginBottom:6}}>{p.vendor}</div>}
      {currStage&&(
        <div style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,color:col.color,background:col.bg,border:`1px solid ${col.border}`,borderRadius:999,padding:'2px 9px',marginBottom:8}}>
          {currStage.stage}
        </div>
      )}
      <div style={{height:3,background:'#e2e8f0',borderRadius:2,overflow:'hidden',marginBottom:4}}>
        <div style={{height:'100%',width:`${(comp/STAGES.length)*100}%`,background:col.color,borderRadius:2}}/>
      </div>
      <div style={{fontSize:11,color:'#94a3b8',marginBottom:8}}>{comp}/{STAGES.length} stages complete</div>
      {editingDate?(
        <div style={{marginTop:4}}>
          <input type='date' defaultValue={p.clientTargetDate||''} autoFocus
            onBlur={e=>{updateProject(p.id,'clientTargetDate',e.target.value);setEditingDate(false)}}
            onKeyDown={e=>{if(e.key==='Enter'){updateProject(p.id,'clientTargetDate',e.target.value);setEditingDate(false)}if(e.key==='Escape')setEditingDate(false)}}
            style={{fontSize:12,padding:'4px 8px',border:'1px solid #bfdbfe',borderRadius:6,color:'#0f172a',background:'#fff',width:'100%',boxSizing:'border-box'}}/>
        </div>
      ):(
        <div onClick={()=>setEditingDate(true)} style={{fontSize:12,color:p.clientTargetDate?'#16a34a':'#94a3b8',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4}}
          onMouseEnter={e=>e.currentTarget.style.color=p.clientTargetDate?'#15803d':'#475569'}
          onMouseLeave={e=>e.currentTarget.style.color=p.clientTargetDate?'#16a34a':'#94a3b8'}>
          {p.clientTargetDate?`🎯 Target: ${fmtDate(p.clientTargetDate)}`:'+ Set target date'}
        </div>
      )}
    </div>
  )
}

function ClientView({acct, setAcct, onClose}) {
  const [cvTab, setCvTab] = useState('projects')
  const [cvHoveredSeg, setCvHoveredSeg] = useState(null)
  const [cvEditModal, setCvEditModal] = useState(null)
  const [cvEditForm, setCvEditForm] = useState({vendor:'',products:'',replacementOptions:'',contractSale:''})
  const [tlFilter, setTlFilter] = useState(new Set(['In Flight','In Discussion','Not Started','Stalled']))
  const [tlSort, setTlSort] = useState('Status')

  useEffect(()=>{
    const h = e => { if(e.key==='Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  },[onClose])

  const updateProject = (id, field, val) => {
    setAcct(p=>({...p, projects: p.projects.map(j=>j.id===id?{...j,[field]:val}:j)}))
  }

  const activeProjects = acct.projects.filter(p=>['In Flight','In Discussion','Not Started','Stalled'].includes(p.status))

  const fmtMonthYear = d => {
    if(!d) return ''
    try { return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',year:'numeric'}) } catch { return d }
  }

  const toggleTlFilter = s => setTlFilter(prev=>{const n=new Set(prev);n.has(s)?n.delete(s):n.add(s);return n})

  const cvCapToTechCat = {}

  const handleCvCapHover = (seg,e) => {
    if(seg.type!=='cap'){setCvHoveredSeg(null);return}
    setCvHoveredSeg({...seg,x:e.clientX,y:e.clientY})
  }
  const handleCvCapMove = (seg,e) => {
    if(seg.type!=='cap')return
    setCvHoveredSeg(p=>p?{...p,x:e.clientX,y:e.clientY}:null)
  }
  const handleCvCapClick = (seg) => {
    if(seg.type!=='cap')return
    if(seg.vendor){
      setCvEditForm({vendor:seg.vendor.vendor||'',products:seg.vendor.products||'',replacementOptions:seg.vendor.replacementOptions||'',contractSale:seg.vendor.contractSale||''})
      setCvEditModal({...seg})
    } else {
      setCvEditForm({vendor:'',products:seg.sub||seg.cap,replacementOptions:'',contractSale:''})
      setCvEditModal({...seg,newEntry:true,category:seg.sub||seg.cap})
    }
  }
  const saveCvEdit = () => {
    if(!cvEditModal)return
    if(cvEditModal.vendor){
      setAcct(p=>({...p,techStack:p.techStack.map(t=>t.id===cvEditModal.vendor.id?{...t,...cvEditForm}:t)}))
    } else {
      if(!cvEditForm.vendor)return
      const newEntry={id:uid(),vendor:cvEditForm.vendor,products:cvEditForm.products,replacementOptions:cvEditForm.replacementOptions,contractSale:cvEditForm.contractSale,category:cvEditModal.category||'Other',status:'Current',renewalDate:'',cost:'',totalRevenue:'',grossProfit:'',vendorRep:'',vendorRepEmail:'',clientOwner:'',notes:'',contractSaleDetails:''}
      setAcct(p=>({...p,techStack:[...p.techStack,newEntry]}))
    }
    setCvEditModal(null)
  }

  const sortedTlProjects = [...activeProjects].filter(p=>tlFilter.has(p.status)).sort((a,b)=>{
    if(tlSort==='Project Name')return a.name.localeCompare(b.name)
    if(tlSort==='Most Recent Stage'){const ac=a.timeline.filter(s=>s.status==='completed').length;const bc=b.timeline.filter(s=>s.status==='completed').length;return bc-ac}
    if(tlSort==='Client Target Date'){const aD=a.clientTargetDate||'9999-99-99';const bD=b.clientTargetDate||'9999-99-99';return aD.localeCompare(bD)}
    const order=['In Flight','In Discussion','Not Started','Stalled']
    return order.indexOf(a.status)-order.indexOf(b.status)
  })

  // ── Heatmap geometry (interactive) ──
  const HM_CX=410,HM_CY=410,HM_OR2=330,HM_OR1=278,HM_IR2=268,HM_IR1=171,HM_START=-Math.PI/2
  const cvTotalSubs=WHEEL_DOMAINS.reduce((sum,d)=>sum+d.subs.length,0)
  const hmSegs=[]
  let angle=HM_START
  WHEEL_DOMAINS.forEach((domain,di)=>{
    const domainAngle=(domain.subs.length/cvTotalSubs)*2*Math.PI
    const dS=angle,dE=angle+domainAngle
    hmSegs.push({type:'domain',di,domain,dS,dE,path:makeArc(HM_CX,HM_CY,HM_OR1,HM_OR2,dS,dE,0.018)})
    const subAngle=domainAngle/domain.subs.length
    domain.subs.forEach((sub,ci)=>{
      const cS=dS+ci*subAngle,cE=cS+subAngle
      const vendor=findVendorForSub(sub,acct.techStack)
      const secondary=!vendor?getSecondaryVendors(sub,acct.techStack):[]
      const midA=(cS+cE)/2,midR=(HM_IR1+HM_IR2)/2
      const centX=HM_CX+midR*Math.cos(midA),centY=HM_CY+midR*Math.sin(midA)
      hmSegs.push({type:'cap',di,ci,domain,cap:sub,sub,vendor,secondary,centX,centY,
        fill:capStatusFill(vendor),path:makeArc(HM_CX,HM_CY,HM_IR1,HM_IR2,cS,cE,0.01)})
    })
    angle=dE
  })
  const cvAllSubs=WHEEL_DOMAINS.flatMap(d=>d.subs)
  const cvCoveredSubs=cvAllSubs.filter(sub=>findVendorForSub(sub,acct.techStack))
  const coveragePct=Math.round(cvCoveredSubs.length/cvAllSubs.length*100)
  const logoUrl=acct.heatmapLogoUrl||null

  // ── Tech stack by category ──
  const stackGrouped=TECH_CATS.reduce((acc,cat)=>{
    const items=acct.techStack.filter(t=>t.category===cat&&t.status!=='Current Gap')
    if(items.length)acc[cat]=items
    return acc
  },{})

  // ── Contacts ──
  const clientContacts=(acct.contacts||[]).filter(c=>(c.contactType||'Client')==='Client')
  const orgNodes=acct.orgChart?.nodes||[]

  // ── Org chart (read-only) ──
  const NODE_W=120, NODE_H=80
  const CANVAS_W=4000, CANVAS_H=3000
  const [cvZoom,setCvZoom]=useState(1)
  const [cvPan,setCvPan]=useState({x:0,y:0})
  const [cvPanning,setCvPanning]=useState(false)
  const [cvPanStart,setCvPanStart]=useState(null)
  const cvCanvasRef=useRef(null)

  const centerCvOnRoot = () => {
    if(!cvCanvasRef.current)return
    const rootNode=orgNodes.find(n=>!n.parentId)
    if(!rootNode)return
    const canvasWidth=cvCanvasRef.current.offsetWidth
    const defaultZoom=0.8
    const targetX=rootNode.x!=null?rootNode.x/100*CANVAS_W:2000
    const targetY=rootNode.y!=null?rootNode.y/100*CANVAS_H:100
    setCvZoom(defaultZoom)
    setCvPan({x:canvasWidth/2-(targetX+NODE_W/2)*defaultZoom, y:60-targetY*defaultZoom})
  }

  useEffect(()=>{
    if(cvTab!=='contacts')return
    const t=setTimeout(centerCvOnRoot,50)
    return()=>clearTimeout(t)
  },[cvTab])

  const ORG_GRAD_MAP={
    blue:{gradient:'linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%)',shadow:'rgba(59,130,246,0.35)'},
    purple:{gradient:'linear-gradient(135deg,#a855f7 0%,#7c3aed 100%)',shadow:'rgba(168,85,247,0.35)'},
    green:{gradient:'linear-gradient(135deg,#22c55e 0%,#15803d 100%)',shadow:'rgba(34,197,94,0.35)'},
    orange:{gradient:'linear-gradient(135deg,#f97316 0%,#c2410c 100%)',shadow:'rgba(249,115,22,0.35)'},
    red:{gradient:'linear-gradient(135deg,#ef4444 0%,#b91c1c 100%)',shadow:'rgba(239,68,68,0.35)'},
    teal:{gradient:'linear-gradient(135deg,#14b8a6 0%,#0f766e 100%)',shadow:'rgba(20,184,166,0.35)'},
    pink:{gradient:'linear-gradient(135deg,#ec4899 0%,#be185d 100%)',shadow:'rgba(236,72,153,0.35)'},
    gold:{gradient:'linear-gradient(135deg,#f59e0b 0%,#b45309 100%)',shadow:'rgba(245,158,11,0.35)'},
  }
  const getGrad=n=>ORG_GRAD_MAP[n.gradientId||'blue']||ORG_GRAD_MAP.blue

  const svgLine = n => {
    const parent=orgNodes.find(p=>p.contactId===n.parentId)
    if(!parent)return null
    const cx1=n.x/100*CANVAS_W+NODE_W/2,cy1=n.y/100*CANVAS_H
    const cx2=parent.x/100*CANVAS_W+NODE_W/2,cy2=parent.y/100*CANVAS_H+NODE_H
    const my=(cy1+cy2)/2
    return <path key={`line-${n.contactId}`} d={`M${cx2},${cy2} C${cx2},${my} ${cx1},${my} ${cx1},${cy1}`} stroke='rgba(148,163,184,0.6)' strokeWidth={2} fill='none'/>
  }

  const KANBAN_COLS = [
    {status:'In Flight',color:'#2563eb',bg:'#eff6ff',border:'#bfdbfe'},
    {status:'In Discussion',color:'#7c3aed',bg:'#f5f3ff',border:'#ddd6fe'},
    {status:'Not Started',color:'#64748b',bg:'#f8fafc',border:'#e2e8f0'},
    {status:'Stalled',color:'#ea580c',bg:'#fff7ed',border:'#fed7aa'},
  ]

  return (
    <div style={{position:'fixed',inset:0,zIndex:2000,background:'#f8fafc',display:'flex',flexDirection:'column',overflowY:'auto'}}>

      {/* ── Header ── */}
      <div style={{background:'#ffffff',padding:'0 28px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:16,padding:'14px 0 0'}}>
          {acct.logoImage&&<img src={acct.logoImage} alt='' style={{width:40,height:40,borderRadius:'50%',objectFit:'cover',border:'1px solid #e2e8f0',flexShrink:0}}/>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:22,fontWeight:800,color:'#0f172a',lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{acct.name}</div>
            <div style={{display:'flex',gap:6,marginTop:5,flexWrap:'wrap'}}>
              {[acct.industry,acct.hq].filter(Boolean).map(t=>(
                <span key={t} style={{fontSize:11,color:'#64748b',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:999,padding:'2px 10px'}}>{t}</span>
              ))}
            </div>
          </div>
          <button onClick={onClose} style={{display:'inline-flex',alignItems:'center',gap:6,background:'transparent',border:'1px solid #e2e8f0',borderRadius:8,color:'#475569',cursor:'pointer',fontSize:12,fontWeight:600,padding:'7px 14px',flexShrink:0}}
            onMouseEnter={e=>{e.currentTarget.style.background='#f8fafc';e.currentTarget.style.borderColor='#94a3b8'}}
            onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor='#e2e8f0'}}>
            <X size={14}/> Exit Client View
          </button>
        </div>

        {/* Tab nav */}
        <div style={{display:'flex',gap:0,marginTop:4}}>
          {[{id:'projects',label:'Projects'},{id:'techstack',label:'Tech Stack'},{id:'contacts',label:'Contacts'}].map(t=>(
            <button key={t.id} onClick={()=>setCvTab(t.id)}
              style={{padding:'10px 20px',background:'transparent',border:'none',borderBottom:cvTab===t.id?'2px solid #2563eb':'2px solid transparent',cursor:'pointer',fontSize:14,fontWeight:600,color:cvTab===t.id?'#2563eb':'#64748b',transition:'all 0.15s'}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{flex:1,padding:'28px 28px 60px',maxWidth:1400,width:'100%',margin:'0 auto',boxSizing:'border-box'}}>

        {/* ══ PROJECTS TAB ══ */}
        {cvTab==='projects'&&(
          <div>
            {/* Kanban */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:36}}>
              {KANBAN_COLS.map(col=>{
                const projs=acct.projects.filter(p=>p.status===col.status)
                return (
                  <div key={col.status} style={{background:'#ffffff',borderRadius:14,border:`1px solid ${col.border}`,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.05)'}}>
                    <div style={{padding:'10px 14px',background:col.bg,borderBottom:`1px solid ${col.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:12,fontWeight:700,color:col.color,textTransform:'uppercase',letterSpacing:'0.06em'}}>{col.status}</span>
                      <span style={{fontSize:11,fontWeight:700,color:col.color,background:'#ffffff',borderRadius:999,padding:'1px 8px',border:`1px solid ${col.border}`}}>{projs.length}</span>
                    </div>
                    <div style={{padding:10,display:'flex',flexDirection:'column',gap:8,minHeight:120}}>
                      {projs.length===0&&<div style={{fontSize:12,color:'#94a3b8',textAlign:'center',padding:'16px 0'}}>No projects</div>}
                      {projs.map(p=>(
                        <KanbanCard key={p.id} p={p} col={col} updateProject={updateProject}/>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Timeline */}
            {activeProjects.length>0&&(
              <div>
                {/* Controls */}
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
                  <div style={{fontSize:13,fontWeight:700,color:'#64748b',letterSpacing:'0.08em',textTransform:'uppercase',marginRight:4}}>Project Timelines</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',flex:1}}>
                    {[{s:'In Flight',c:'#2563eb'},{s:'In Discussion',c:'#7c3aed'},{s:'Not Started',c:'#64748b'},{s:'Stalled',c:'#ea580c'}].map(({s,c})=>{
                      const active=tlFilter.has(s)
                      return (
                        <button key={s} onClick={()=>toggleTlFilter(s)}
                          style={{padding:'4px 12px',borderRadius:999,fontSize:11,fontWeight:600,cursor:'pointer',border:`1px solid ${active?c:'#e2e8f0'}`,background:active?c+'18':'transparent',color:active?c:'#94a3b8',transition:'all 0.12s'}}>
                          {s}
                        </button>
                      )
                    })}
                  </div>
                  <select value={tlSort} onChange={e=>setTlSort(e.target.value)} style={{fontSize:12,padding:'5px 9px',background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:7,color:'#374151',cursor:'pointer',flexShrink:0}}>
                    <option value='Status'>Sort: Status</option>
                    <option value='Project Name'>Sort: Name A–Z</option>
                    <option value='Most Recent Stage'>Sort: Most Recent Stage</option>
                    <option value='Client Target Date'>Sort: Target Date</option>
                  </select>
                </div>
                {sortedTlProjects.length===0&&<div style={{fontSize:13,color:'#94a3b8',textAlign:'center',padding:'24px',background:'#ffffff',borderRadius:12,border:'1px solid #e2e8f0'}}>No projects match the selected filters.</div>}
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  {sortedTlProjects.map(p=>{
                    const sc=PSC[p.status]||'#64748b'
                    const targetDate=p.clientTargetDate
                    return (
                      <div key={p.id} style={{background:'#ffffff',borderRadius:12,border:'1px solid #e2e8f0',padding:'18px 20px',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                          <span style={{fontSize:15,fontWeight:700,color:'#0f172a'}}>{p.name}</span>
                          <span style={{fontSize:11,fontWeight:600,color:sc,background:sc+'18',border:`1px solid ${sc}44`,borderRadius:999,padding:'2px 8px'}}>{p.status}</span>
                          {p.vendor&&<span style={{fontSize:11,color:'#94a3b8'}}>{p.vendor}</span>}
                        </div>
                        {/* Stage dots */}
                        <div style={{display:'flex',alignItems:'flex-start',overflowX:'auto',gap:0,paddingBottom:4}}>
                          {p.timeline.map((stage,i)=>{
                            const isComp=stage.status==='completed'
                            const isCurr=stage.status==='current'
                            const dotColor=isComp?'#16a34a':isCurr?'#2563eb':'#cbd5e1'
                            const lineColor=isComp?'#16a34a':'#e2e8f0'
                            return (
                              <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',flex:'1 1 0',minWidth:0,position:'relative'}}>
                                {i<p.timeline.length-1&&<div style={{position:'absolute',top:8,left:'50%',width:'100%',height:2,background:lineColor,zIndex:0}}/>}
                                <div style={{width:16,height:16,borderRadius:'50%',background:dotColor,border:`2px solid ${isComp?'#16a34a':isCurr?'#2563eb':'#cbd5e1'}`,flexShrink:0,zIndex:1,boxShadow:isCurr?'0 0 0 3px rgba(37,99,235,0.2)':undefined}}/>
                                <div style={{fontSize:9,color:isComp?'#16a34a':isCurr?'#2563eb':'#94a3b8',fontWeight:isCurr?700:isComp?600:400,marginTop:5,textAlign:'center',lineHeight:1.3,wordBreak:'break-word',padding:'0 2px'}}>{stage.stage}</div>
                              </div>
                            )
                          })}
                        </div>
                        {targetDate&&(
                          <div style={{marginTop:10,display:'inline-flex',alignItems:'center',gap:5,fontSize:12,color:'#16a34a',fontWeight:600,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:6,padding:'4px 10px'}}>
                            🎯 Target Go-Live: {fmtDate(targetDate)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ TECH STACK TAB ══ */}
        {cvTab==='techstack'&&(
          <div>
            {/* Heatmap wheel — interactive */}
            <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #e2e8f0',padding:'24px',marginBottom:28,boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <style>{`@keyframes cvHmFadeIn{from{opacity:0}to{opacity:1}}`}</style>
              <div style={{fontSize:13,fontWeight:700,color:'#64748b',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:16}}>Security Coverage Heatmap</div>
              <div style={{display:'flex',justifyContent:'center'}}>
                <svg viewBox="0 0 820 820" style={{width:'100%',maxWidth:560,display:'block',margin:'0 auto',filter:'drop-shadow(0 8px 40px rgba(0,0,0,0.8))',touchAction:'none'}}>
                  <defs>
                    <radialGradient id="cv-hm-gc" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#4ade80"/><stop offset="55%" stopColor="#22c55e"/><stop offset="100%" stopColor="#16a34a"/></radialGradient>
                    <radialGradient id="cv-hm-ge" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#fde047"/><stop offset="55%" stopColor="#eab308"/><stop offset="100%" stopColor="#ca8a04"/></radialGradient>
                    <radialGradient id="cv-hm-gw" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#fb923c"/><stop offset="55%" stopColor="#f97316"/><stop offset="100%" stopColor="#ea580c"/></radialGradient>
                    <radialGradient id="cv-hm-gr" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#f87171"/><stop offset="55%" stopColor="#ef4444"/><stop offset="100%" stopColor="#dc2626"/></radialGradient>
                    <radialGradient id="cv-hm-gn" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#555555"/><stop offset="55%" stopColor="#4a4a4a"/><stop offset="100%" stopColor="#3d3d3d"/></radialGradient>
                    <linearGradient id="cv-hm-dg0" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#ff9cc5"/><stop offset="100%" stopColor="#d42070"/></linearGradient>
                    <linearGradient id="cv-hm-dg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#ff7a77"/><stop offset="100%" stopColor="#c9100d"/></linearGradient>
                    <linearGradient id="cv-hm-dg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#96e8a4"/><stop offset="100%" stopColor="#30a048"/></linearGradient>
                    <linearGradient id="cv-hm-dg3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#6eaaff"/><stop offset="100%" stopColor="#1255cc"/></linearGradient>
                    <linearGradient id="cv-hm-dg4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#4dd4e2"/><stop offset="100%" stopColor="#007a88"/></linearGradient>
                    <linearGradient id="cv-hm-dg5" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#ffe566"/><stop offset="100%" stopColor="#c49800"/></linearGradient>
                    <linearGradient id="cv-hm-dg6" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#c89be8"/><stop offset="100%" stopColor="#7d3bad"/></linearGradient>
                    <radialGradient id="cv-hm-ctr" cx="50%" cy="35%" r="70%"><stop offset="0%" stopColor="#1a2a4a"/><stop offset="100%" stopColor="#08111f"/></radialGradient>
                    <filter id="cv-hm-round" x="-5%" y="-5%" width="110%" height="110%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
                      <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/>
                      <feComposite in="SourceGraphic" in2="goo" operator="in"/>
                    </filter>
                    {hmSegs.filter(s=>s.type==='domain').map((seg,i)=>{
                      const {dS,dE}=seg,mid=(dS+dE)/2,lg=(dE-dS)>Math.PI?1:0
                      const r=302
                      const path=Math.sin(mid)>0.1
                        ?`M ${HM_CX+r*Math.cos(dE)} ${HM_CY+r*Math.sin(dE)} A ${r} ${r} 0 ${lg} 0 ${HM_CX+r*Math.cos(dS)} ${HM_CY+r*Math.sin(dS)}`
                        :`M ${HM_CX+r*Math.cos(dS)} ${HM_CY+r*Math.sin(dS)} A ${r} ${r} 0 ${lg} 1 ${HM_CX+r*Math.cos(dE)} ${HM_CY+r*Math.sin(dE)}`
                      return <path key={`cv-ta${i}`} id={`cv-hm-ta-${i}`} d={path} fill="none"/>
                    })}
                  </defs>
                  {[HM_IR1,HM_IR2,HM_OR1,HM_OR2].map(r=>(
                    <circle key={r} cx={HM_CX} cy={HM_CY} r={r} fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth={0.75}/>
                  ))}
                  <g filter="url(#cv-hm-round)">
                    {hmSegs.filter(s=>s.type==='domain').map((seg,i)=>(
                      <path key={`cvd${i}`} d={seg.path} fill={`url(#cv-hm-dg${i})`} stroke="none"/>
                    ))}
                    {hmSegs.filter(s=>s.type==='cap'&&!!s.vendor).map((seg)=>{
                      const gid={Current:'cv-hm-gc',Selected:'cv-hm-gc',Evaluating:'cv-hm-ge',Watch:'cv-hm-gw',Replacing:'cv-hm-gr',Dropping:'cv-hm-gr','Current Gap':'cv-hm-gn'}[seg.vendor.status]||'cv-hm-gc'
                      const isHov=cvHoveredSeg?.di===seg.di&&cvHoveredSeg?.ci===seg.ci
                      const idx=seg.di*10+seg.ci
                      return (
                        <path key={`cvcv-${seg.di}-${seg.ci}`} d={seg.path} fill={`url(#${gid})`} stroke="none"
                          style={{cursor:'pointer',transformOrigin:`${seg.centX}px ${seg.centY}px`,transform:isHov?'scale(1.1)':'scale(1)',opacity:cvHoveredSeg&&!isHov?0.82:1,transition:'transform 0.15s ease,opacity 0.15s ease',animation:'cvHmFadeIn 0.55s ease-out both',animationDelay:`${idx*11}ms`}}
                          onMouseEnter={e=>handleCvCapHover(seg,e)} onMouseMove={e=>handleCvCapMove(seg,e)}
                          onMouseLeave={()=>setCvHoveredSeg(null)} onClick={()=>handleCvCapClick(seg)}/>
                      )
                    })}
                  </g>
                  {hmSegs.filter(s=>s.type==='cap'&&!s.vendor).map((seg)=>{
                    const isHov=cvHoveredSeg?.di===seg.di&&cvHoveredSeg?.ci===seg.ci
                    const idx=seg.di*10+seg.ci
                    return (
                      <path key={`cvce-${seg.di}-${seg.ci}`} d={seg.path}
                        fill={isHov?'rgba(255,255,255,0.35)':'rgba(255,255,255,0.20)'} stroke="none"
                        style={{cursor:'pointer',transformOrigin:`${seg.centX}px ${seg.centY}px`,transform:isHov?'scale(1.1)':'scale(1)',opacity:cvHoveredSeg&&!isHov?0.82:1,transition:'transform 0.15s ease,opacity 0.15s ease',animation:'cvHmFadeIn 0.55s ease-out both',animationDelay:`${idx*11}ms`}}
                        onMouseEnter={e=>handleCvCapHover(seg,e)} onMouseMove={e=>handleCvCapMove(seg,e)}
                        onMouseLeave={()=>setCvHoveredSeg(null)} onClick={()=>handleCvCapClick(seg)}/>
                    )
                  })}
                  {hmSegs.filter(s=>s.type==='cap'&&!s.vendor&&s.secondary?.length>0).map((seg)=>(
                    <path key={`cvsec-${seg.di}-${seg.ci}`} d={seg.path}
                      fill={seg.domain.color+'45'} stroke="none" style={{pointerEvents:'none'}}/>
                  ))}
                  {hmSegs.filter(s=>s.type==='cap'&&!!s.vendor).map((seg)=>(
                    <circle key={`cvvd-${seg.di}-${seg.ci}`} cx={seg.centX} cy={seg.centY} r={2.8} fill="rgba(255,255,255,0.88)" style={{pointerEvents:'none'}}/>
                  ))}
                  {(()=>{
                    const abbrev=['IDENTITY & ACCESS','CLOUD & APP SEC','NETWORK & INFRA','SEC OPERATIONS','DATA & ENDPOINT','RISK & COMPLY','OT / IoT']
                    return hmSegs.filter(s=>s.type==='domain').map((seg,i)=>(
                      <text key={`cvdl${i}`} fontSize={11} fontWeight={700} letterSpacing="0.05em" fill="rgba(255,255,255,0.95)">
                        <textPath href={`#cv-hm-ta-${i}`} startOffset="50%" textAnchor="middle">{abbrev[i]}</textPath>
                      </text>
                    ))
                  })()}
                  <circle cx={HM_CX} cy={HM_CY} r={HM_IR1-10} fill="url(#cv-hm-ctr)"/>
                  {(()=>{
                    const logoR=Math.round((HM_IR1-10)*0.60)
                    if(logoUrl){
                      return <>
                        <defs><clipPath id="cv-hm-logo-clip"><circle cx={HM_CX} cy={HM_CY} r={logoR}/></clipPath></defs>
                        <circle cx={HM_CX} cy={HM_CY} r={logoR} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)" strokeWidth={1}/>
                        <image x={HM_CX-logoR} y={HM_CY-logoR} width={logoR*2} height={logoR*2} href={logoUrl} clipPath="url(#cv-hm-logo-clip)" preserveAspectRatio="xMidYMid meet"/>
                      </>
                    }
                    return <>
                      <path d={`M ${HM_CX} ${HM_CY-46} L ${HM_CX-13} ${HM_CY-40} L ${HM_CX-13} ${HM_CY-26} Q ${HM_CX} ${HM_CY-18} ${HM_CX} ${HM_CY-18} Q ${HM_CX+13} ${HM_CY-26} ${HM_CX+13} ${HM_CY-26} L ${HM_CX+13} ${HM_CY-40} Z`} fill="url(#cv-hm-gc)" opacity={0.85}/>
                      <text x={HM_CX} y={HM_CY+22} textAnchor="middle" dominantBaseline="auto" fontSize={54} fontWeight={800} fill="#ffffff" letterSpacing="-2">{coveragePct}%</text>
                      <text x={HM_CX} y={HM_CY+44} textAnchor="middle" dominantBaseline="auto" fontSize={11} fontWeight={600} fill="#94a3b8" letterSpacing="0.14em">COVERAGE</text>
                    </>
                  })()}
                </svg>
              </div>
              {/* Heatmap tooltip */}
              {cvHoveredSeg&&(()=>{
                const sc=cvHoveredSeg.vendor?capStatusFill(cvHoveredSeg.vendor):'#64748b'
                const tx=Math.min(cvHoveredSeg.x+16,window.innerWidth-270)
                const ty=Math.max(10,cvHoveredSeg.y-70)
                const knownVendors=getKnownVendorsForSub(cvHoveredSeg.sub||cvHoveredSeg.cap)
                return (
                  <div style={{position:'fixed',left:tx,top:ty,zIndex:3000,background:'rgba(15,23,42,0.95)',borderRadius:10,padding:'10px 14px',pointerEvents:'none',minWidth:200,maxWidth:260,boxShadow:'0 8px 24px rgba(0,0,0,0.4)',border:'1px solid rgba(255,255,255,0.08)'}}>
                    <div style={{fontSize:11,color:'#64748b',marginBottom:4,letterSpacing:'0.04em',textTransform:'uppercase'}}>{cvHoveredSeg.domain.name}</div>
                    <div style={{fontSize:13,fontWeight:700,color:'#f1f5f9',marginBottom:6,lineHeight:1.3}}>{cvHoveredSeg.cap}</div>
                    {cvHoveredSeg.vendor?(
                      <>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                          <div style={{width:8,height:8,borderRadius:'50%',background:sc,flexShrink:0}}/>
                          <span style={{fontSize:12,fontWeight:600,color:'#e2e8f0'}}>{cvHoveredSeg.vendor.vendor}</span>
                        </div>
                        {cvHoveredSeg.vendor.products&&<div style={{fontSize:11,color:'#94a3b8',marginBottom:4}}>{cvHoveredSeg.vendor.products}</div>}
                        <div style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:700,color:sc,background:sc+'22',borderRadius:999,padding:'2px 8px'}}>{cvHoveredSeg.vendor.status}</div>
                        <div style={{fontSize:10,color:'#475569',marginTop:6}}>Click to edit</div>
                      </>
                    ):(
                      <>
                        <div style={{fontSize:11,color:'#475569',marginBottom:4}}>No coverage — gap</div>
                        {knownVendors.length>0&&<div style={{fontSize:10,color:'#64748b',marginBottom:6}}>Known vendors: {knownVendors.slice(0,3).join(', ')}</div>}
                        <div style={{fontSize:11,color:'#3b82f6',fontWeight:600}}>Click to add vendor →</div>
                      </>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Restricted edit modal */}
            {cvEditModal&&(
              <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:3000,padding:16}}>
                <div style={{background:'#ffffff',borderRadius:14,boxShadow:'0 20px 60px rgba(0,0,0,0.2)',width:'100%',maxWidth:440,overflow:'hidden'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:'1px solid #f1f5f9'}}>
                    <div>
                      <div style={{fontSize:15,fontWeight:700,color:'#0f172a'}}>{cvEditModal.vendor?'Edit Vendor':'Add Vendor'}</div>
                      <div style={{fontSize:12,color:'#64748b',marginTop:2}}>{cvEditModal.cap} · {cvEditModal.domain?.name}</div>
                    </div>
                    <button onClick={()=>setCvEditModal(null)} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:20,lineHeight:1,padding:'2px 6px'}}>×</button>
                  </div>
                  <div style={{padding:'20px'}}>
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Vendor Name</div>
                      <input value={cvEditForm.vendor} onChange={e=>setCvEditForm(p=>({...p,vendor:e.target.value}))} placeholder='Vendor name...' style={{width:'100%',fontSize:13,padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:7,color:'#0f172a',background:'#f8fafc',boxSizing:'border-box'}}/>
                    </div>
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Products / Features</div>
                      <input value={cvEditForm.products} onChange={e=>setCvEditForm(p=>({...p,products:e.target.value}))} placeholder='Products or features...' style={{width:'100%',fontSize:13,padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:7,color:'#0f172a',background:'#f8fafc',boxSizing:'border-box'}}/>
                    </div>
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Replacement Options</div>
                      <input value={cvEditForm.replacementOptions} onChange={e=>setCvEditForm(p=>({...p,replacementOptions:e.target.value}))} placeholder='Alternative vendors being considered...' style={{width:'100%',fontSize:13,padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:7,color:'#0f172a',background:'#f8fafc',boxSizing:'border-box'}}/>
                    </div>
                    <div style={{marginBottom:20}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Contract Sale</div>
                      <select value={cvEditForm.contractSale} onChange={e=>setCvEditForm(p=>({...p,contractSale:e.target.value}))} style={{width:'100%',fontSize:13,padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:7,color:'#0f172a',background:'#f8fafc',boxSizing:'border-box'}}>
                        <option value=''>Not Set</option>
                        <option value='GuidePoint'>GuidePoint</option>
                        <option value='Direct'>Direct</option>
                        <option value='Other VAR'>Other VAR</option>
                      </select>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={saveCvEdit} style={{flex:1,padding:'10px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Save</button>
                      <button onClick={()=>setCvEditModal(null)} style={{padding:'10px 16px',background:'transparent',border:'1px solid #e2e8f0',borderRadius:8,color:'#64748b',fontSize:13,cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Vendor list */}
            <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #e2e8f0',padding:'24px',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <div style={{fontSize:13,fontWeight:700,color:'#64748b',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:16}}>Technology Vendors</div>
              {Object.entries(stackGrouped).map(([cat,tools])=>(
                <div key={cat} style={{marginBottom:20}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#94a3b8',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:8,paddingBottom:4,borderBottom:'1px solid #f1f5f9'}}>{cat}</div>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {tools.map(t=>{
                      const sc=SC[t.status]||'#64748b'
                      const renewalDisplay=t.renewalDate?fmtMonthYear(t.renewalDate):null
                      const d=t.renewalDate?daysUntil(t.renewalDate):null
                      const renewColor=d!==null&&d<=60?'#ef4444':d!==null&&d<=150?'#f97316':null
                      return (
                        <div key={t.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'#f8fafc',borderRadius:8,border:'1px solid #f1f5f9'}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>{t.vendor}</div>
                            {t.products&&<div style={{fontSize:12,color:'#64748b',marginTop:1}}>{t.products}</div>}
                          </div>
                          <span style={{fontSize:11,fontWeight:600,color:'#64748b',background:'#f1f5f9',borderRadius:999,padding:'2px 9px',whiteSpace:'nowrap',flexShrink:0}}>{cat}</span>
                          <span style={{fontSize:11,fontWeight:600,color:sc,background:sc+'18',borderRadius:999,padding:'2px 9px',whiteSpace:'nowrap',flexShrink:0}}>{t.status}</span>
                          {renewalDisplay&&<span style={{fontSize:11,color:renewColor||'#64748b',fontWeight:renewColor?700:400,whiteSpace:'nowrap',flexShrink:0}}>Renews {renewalDisplay}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(stackGrouped).length===0&&<div style={{fontSize:13,color:'#94a3b8',textAlign:'center',padding:'24px 0'}}>No tech stack entries yet.</div>}
            </div>
          </div>
        )}

        {/* ══ CONTACTS TAB ══ */}
        {cvTab==='contacts'&&(
          <div>
            {/* Org chart — read-only */}
            {orgNodes.length>0&&(
              <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #e2e8f0',marginBottom:28,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
                <div style={{padding:'16px 20px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div style={{fontSize:13,fontWeight:700,color:'#64748b',letterSpacing:'0.08em',textTransform:'uppercase'}}>Org Chart</div>
                  <div style={{display:'flex',gap:4,background:'#f8fafc',borderRadius:8,padding:2,border:'1px solid #e2e8f0'}}>
                    {[{label:'−',onClick:()=>setCvZoom(z=>Math.max(0.25,z-0.1))},{label:`${Math.round(cvZoom*100)}%`,onClick:null,style:{minWidth:44,textAlign:'center',fontSize:11,fontWeight:700,color:'#374151',padding:'6px 4px',cursor:'default'}},{label:'+',onClick:()=>setCvZoom(z=>Math.min(3,z+0.1))}].map((b,i)=>(
                      <button key={i} onClick={b.onClick||undefined} style={{...(b.style||{}),padding:b.style?undefined:'6px 10px',background:'transparent',border:'none',color:'#374151',fontSize:13,fontWeight:600,cursor:b.onClick?'pointer':'default',minHeight:28}}>{b.label}</button>
                    ))}
                    <button onClick={centerCvOnRoot} title='Reset view to root node' style={{padding:'6px 10px',background:'transparent',border:'none',borderLeft:'1px solid #e2e8f0',color:'#64748b',fontSize:11,fontWeight:600,cursor:'pointer',minHeight:28,whiteSpace:'nowrap'}}>⊡ Reset View</button>
                  </div>
                </div>
                <div ref={cvCanvasRef}
                  style={{position:'relative',width:'100%',height:500,backgroundImage:'radial-gradient(circle, #e2e8f0 1px, transparent 1px)',backgroundSize:'24px 24px',backgroundColor:'#f8fafc',cursor:cvPanning?'grabbing':'grab',overflow:'hidden',userSelect:'none'}}
                  onMouseDown={e=>{if(e.target===cvCanvasRef.current||e.target.dataset?.role==='content'){e.preventDefault();setCvPanning(true);setCvPanStart({x:e.clientX-cvPan.x,y:e.clientY-cvPan.y})}}}
                  onMouseMove={e=>{if(!cvPanning||!cvPanStart)return;setCvPan({x:e.clientX-cvPanStart.x,y:e.clientY-cvPanStart.y})}}
                  onMouseUp={()=>setCvPanning(false)}
                  onMouseLeave={()=>setCvPanning(false)}>
                  <div data-role='content' style={{position:'relative',width:CANVAS_W,height:CANVAS_H,transform:`translate(${cvPan.x}px,${cvPan.y}px) scale(${cvZoom})`,transformOrigin:'0 0'}}>
                    <svg style={{position:'absolute',top:0,left:0,width:CANVAS_W,height:CANVAS_H,overflow:'visible',pointerEvents:'none'}} width={CANVAS_W} height={CANVAS_H}>
                      {orgNodes.filter(n=>n.parentId).map(n=>svgLine(n))}
                    </svg>
                    {orgNodes.map(n=>{
                      const c=clientContacts.find(x=>x.id===n.contactId)
                      if(!c)return null
                      const grad=getGrad(n)
                      const nodeX=n.x/100*CANVAS_W, nodeY=n.y/100*CANVAS_H
                      return (
                        <div key={n.contactId} style={{position:'absolute',left:`${nodeX}px`,top:`${nodeY}px`,width:NODE_W,background:grad.gradient,borderRadius:14,padding:'8px 10px 10px',boxShadow:`0 4px 16px ${grad.shadow}`,userSelect:'none'}}>
                          <div style={{width:42,height:42,borderRadius:'50%',background:'rgba(255,255,255,0.9)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#3c90ff',margin:'0 auto 6px',overflow:'hidden'}}>{c.contactPhoto?<img src={c.contactPhoto} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:initials(c.name)}</div>
                          <div style={{fontSize:11,fontWeight:700,color:'#fff',textAlign:'center',lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</div>
                          <div style={{fontSize:9,color:'rgba(255,255,255,0.8)',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:2}}>{c.title}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Client contacts list */}
            <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #e2e8f0',padding:'24px',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <div style={{fontSize:13,fontWeight:700,color:'#64748b',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:16}}>Client Contacts</div>
              {clientContacts.length===0&&<div style={{fontSize:13,color:'#94a3b8',textAlign:'center',padding:'24px 0'}}>No client contacts yet.</div>}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10}}>
                {clientContacts.map(c=>(
                  <div key={c.id} style={{background:'#f8fafc',borderRadius:10,border:'1px solid #e2e8f0',padding:'14px 16px'}}>
                    <div style={{width:36,height:36,borderRadius:'50%',background:'#eff6ff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#2563eb',marginBottom:10,overflow:'hidden'}}>{c.contactPhoto?<img src={c.contactPhoto} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:initials(c.name)}</div>
                    <div style={{fontSize:15,fontWeight:700,color:'#0f172a',lineHeight:1.3,marginBottom:3}}>{c.name}</div>
                    <div style={{fontSize:12,color:'#64748b',lineHeight:1.4}}>{c.title}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>


    </div>
  )
}

function AllProjectsPage({data, setData, onBack}) {
  const projBlank={id:'',name:'',category:'',vendor:'',status:'Not Started',description:'',goals:'',pains:'',primaryContact:'',budget:false,closeDate:'',notes:'',waitingOn:'',nextAction:'',estimatedRevenue:'',estimatedGrossProfit:'',clientTargetDate:'',nextSteps:'',projectNotes:[],timeline:STAGES.map(s=>({stage:s,status:'pending',date:''}))}
  const [view,setView] = useState('timeline')
  const [search,setSearch] = useState('')
  const [statusFilter,setStatusFilter] = useState(new Set(['In Flight']))
  const [accountFilter,setAccountFilter] = useState(()=>new Set(data.accounts.map(a=>a.id)))
  const [vendorSearch,setVendorSearch] = useState('')
  const [sort,setSort] = useState('Account')
  const [collapsed,setCollapsed] = useState(new Set())
  const [editModal,setEditModal] = useState(null)
  const [editForm,setEditForm] = useState({})
  const [moveMenu,setMoveMenu] = useState(null)
  const [statusMenus,setStatusMenus] = useState(null)
  const [notePopover,setNotePopover] = useState(null)
  const [noteText,setNoteText] = useState('')
  const [addModal,setAddModal] = useState(false)
  const [addForm,setAddForm] = useState({})
  const [addAcctId,setAddAcctId] = useState(data.accounts[0]?.id||'')
  const mob = typeof window !== 'undefined' && window.innerWidth < 768
  const [mobFilterOpen, setMobFilterOpen] = useState(false)

  const allWithAcct = data.accounts.flatMap(a=>(a.projects||[]).map(p=>({...p,_aid:a.id,_aname:a.short||a.name})))

  const filtered = allWithAcct.filter(p=>{
    if(!accountFilter.has(p._aid))return false
    if(!statusFilter.has(p.status))return false
    if(vendorSearch&&!(p.vendor||'').toLowerCase().includes(vendorSearch.toLowerCase()))return false
    if(search){const q=search.toLowerCase();if(!p.name.toLowerCase().includes(q)&&!(p.vendor||'').toLowerCase().includes(q)&&!p._aname.toLowerCase().includes(q))return false}
    return true
  })

  const sorted = [...filtered].sort((a,b)=>{
    if(sort==='Account')return a._aname.localeCompare(b._aname)||a.name.localeCompare(b.name)
    if(sort==='Status')return PROJ_STATS.indexOf(a.status)-PROJ_STATS.indexOf(b.status)
    if(sort==='Close Date')return(a.closeDate||'9999').localeCompare(b.closeDate||'9999')
    return 0
  })

  const grouped = data.accounts.filter(a=>accountFilter.has(a.id)).map(a=>({a,projs:sorted.filter(p=>p._aid===a.id)})).filter(g=>g.projs.length>0)

  const updateProj = (aid,pid,upd) => setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===aid?{...a,projects:(a.projects||[]).map(p=>p.id===pid?{...p,...upd}:p)}:a)}))
  const moveStatus = (aid,pid,ns) => {updateProj(aid,pid,{status:ns});setMoveMenu(null);setStatusMenus(null)}
  const saveEdit = () => {
    if(!editForm.name)return
    const{_aid,_aname,...proj}=editForm
    if(proj.id){updateProj(editModal.aid,proj.id,proj)}
    else setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===editModal.aid?{...a,projects:[...(a.projects||[]),{...proj,id:uid()}]}:a)}))
    setEditModal(null)
  }
  const saveAdd = () => {
    if(!addForm.name||!addAcctId)return
    setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===addAcctId?{...a,projects:[...(a.projects||[]),{...projBlank,...addForm,id:uid()}]}:a)}))
    setAddModal(false);setAddForm({})
  }
  const addNote = (aid,pid) => {
    if(!noteText.trim()){setNotePopover(null);return}
    const today=new Date().toISOString().split('T')[0]
    const proj=(data.accounts.find(a=>a.id===aid)?.projects||[]).find(p=>p.id===pid)
    updateProj(aid,pid,{notes:proj?.notes?proj.notes+' | ['+today+']: '+noteText.trim():'['+today+']: '+noteText.trim()})
    setNotePopover(null);setNoteText('')
  }
  const updateProjectStage = (aid,pid,stageIdx,newStatus) => {
    setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===aid?{...a,projects:(a.projects||[]).map(proj=>proj.id===pid?{...proj,timeline:proj.timeline.map((stage,idx)=>idx===stageIdx?{...stage,status:newStatus,date:newStatus==='pending'?'':new Date().toISOString().split('T')[0]}:stage)}:proj)}:a)}))
  }

  const SW={'Awareness':0.10,'NDA':0.10,'Intro Call':0.15,'Demo':0.20,'POC':0.30,'Scoping':0.40,'Pricing':0.60,'Legal':0.90,'Procurement':0.90,'PO Received':1.00,'Deployed':1.00}
  const totalActive=allWithAcct.filter(p=>p.status==='In Flight'||p.status==='In Discussion').length
  const totalWeighted=allWithAcct.filter(p=>p.status!=='Lost'&&p.estimatedRevenue).reduce((s,p)=>{const rev=parseCost(p.estimatedRevenue);const cs=p.timeline?.find(t=>t.status==='current')?.stage||p.timeline?.filter(t=>t.status==='completed').slice(-1)[0]?.stage;return s+rev*(SW[cs]??0.10)},0)
  const stalledCount=allWithAcct.filter(p=>p.status==='Stalled').length
  const acctColors=data.accounts.reduce((acc,a,i)=>{acc[a.id]=`hsl(${(i*57+200)%360},60%,48%)`;return acc},{})

  useEffect(()=>{
    const h=()=>{setMoveMenu(null);setStatusMenus(null);setNotePopover(null)}
    document.addEventListener('click',h)
    return()=>document.removeEventListener('click',h)
  },[])

  const sideStyle={padding:'7px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:8,color:'#6B7280',fontSize:12,fontWeight:500,userSelect:'none'}
  const ff=k=>v=>setEditForm(p=>({...p,[k]:v}))
  const fa=k=>v=>setAddForm(p=>({...p,[k]:v}))

  return(
    <div style={{height:mob?'auto':'100vh',minHeight:mob?'100vh':undefined,background:S.bg,color:S.txt,display:'flex',flexDirection:mob?'column':'row',overflow:mob?'visible':'hidden'}}>
      <style>{`
  .all-projects-sidebar * {
    color: #111827 !important;
  }
  .all-projects-sidebar input[type="checkbox"] {
    accent-color: #007AFF;
    width: 14px;
    height: 14px;
  }
  .all-projects-sidebar label {
    color: #111827 !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    cursor: pointer;
  }
`}</style>
      {/* ── SIDEBAR ── */}
      {!mob&&<div className="all-projects-sidebar" style={{width:220,height:'100vh',flexShrink:0,display:'flex',flexDirection:'column',background:'#FFFFFF',borderRight:'1px solid #EEEFF2',overflow:'hidden'}}>
        <div style={{padding:'12px 16px 12px',flexShrink:0,borderBottom:'1px solid #EEEFF2'}}>
          <div style={{display:'flex',justifyContent:'center',alignItems:'center'}}>
            <img src="/Ledgr-full-logo.png" alt="Ledgr." style={{height:'72px',width:'auto',maxWidth:'187px',objectFit:'contain',display:'block'}}/>
          </div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
          <button onClick={onBack} style={{...sideStyle,background:'transparent',border:'none',width:'100%',textAlign:'left',marginBottom:4}}>
            <ArrowLeft size={13}/> Back to Accounts
          </button>
          {/* Account filter */}
          <div style={{fontSize:10,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em',padding:'8px 14px 5px',fontWeight:600}}>Accounts</div>
          {data.accounts.map(a=>(
            <label key={a.id}
              style={{display:'flex',alignItems:'center',gap:'8px',padding:'5px 8px',borderRadius:'6px',cursor:'pointer',color:'#111827',margin:'1px 6px',boxSizing:'border-box',transition:'background 0.1s'}}
              onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <input type='checkbox' checked={accountFilter.has(a.id)}
                onChange={e=>{setAccountFilter(prev=>{const n=new Set(prev);e.target.checked?n.add(a.id):n.delete(a.id);return n})}}
                style={{accentColor:'#007AFF',cursor:'pointer',flexShrink:0}}/>
              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:'13px',color:'#111827',fontWeight:'500'}}>{a.short||a.name}</span>
            </label>
          ))}
          {/* Status filter */}
          <div style={{fontSize:10,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em',padding:'10px 14px 5px',fontWeight:600,marginTop:6}}>Status</div>
          {(()=>{
            const PCOL={'In Flight':'#007AFF','In Discussion':'#8B5CF6','Not Started':'#9CA3AF','Stalled':'#F97316','Won':'#10B981','Lost':'#EF4444'}
            return PROJ_STATS.map(s=>{
              const sc=PCOL[s]||'#9CA3AF';const act=statusFilter.has(s)
              return(
                <button key={s}
                  onClick={()=>setStatusFilter(prev=>{const n=new Set(prev);if(n.has(s)){if(n.size>1)n.delete(s)}else n.add(s);return n})}
                  style={{display:'block',width:'calc(100% - 12px)',margin:'2px 6px',padding:'5px 10px',borderRadius:5,
                    border:`1px solid ${act?sc:'#EEEFF2'}`,
                    background:act?sc+'1A':'transparent',
                    color:act?sc:'#6B7280',
                    fontSize:11,fontWeight:600,cursor:'pointer',textAlign:'left',transition:'all 0.12s'}}>
                  {s}
                </button>
              )
            })
          })()}
          {/* Vendor filter */}
          <div style={{fontSize:10,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em',padding:'10px 14px 5px',fontWeight:600,marginTop:6}}>Vendor</div>
          <div style={{padding:'2px 10px 8px'}}>
            <input value={vendorSearch} onChange={e=>setVendorSearch(e.target.value)} placeholder='Filter by vendor...'
              style={{width:'100%',fontSize:11,padding:'5px 8px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:5,color:'#111827',boxSizing:'border-box'}}/>
          </div>
        </div>
      </div>}

      {/* ── Mobile filter drawer ── */}
      {mob&&mobFilterOpen&&<>
        <div onClick={()=>setMobFilterOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:300}}/>
        <div style={{position:'fixed',left:0,top:0,height:'100vh',width:280,zIndex:310,background:'#FFFFFF',boxShadow:'4px 0 24px rgba(0,0,0,0.12)',display:'flex',flexDirection:'column',overflowY:'auto'}}>
          <div style={{padding:'18px 16px 14px',borderBottom:'1px solid #EEEFF2',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
            <span style={{fontSize:15,fontWeight:700,color:'#111827'}}>Filters</span>
            <button onClick={()=>setMobFilterOpen(false)} style={{background:'transparent',border:'none',color:'#9CA3AF',cursor:'pointer',fontSize:24,lineHeight:1,padding:'0 4px'}}>×</button>
          </div>
          <div style={{padding:'14px 16px',flex:1,overflowY:'auto'}}>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Search</div>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search projects…'
                style={{width:'100%',fontSize:13,padding:'8px 10px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:8,color:'#111827',boxSizing:'border-box',outline:'none'}}/>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Sort By</div>
              <select value={sort} onChange={e=>setSort(e.target.value)} style={{width:'100%',fontSize:13,padding:'8px 10px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:8,color:'#111827',boxSizing:'border-box'}}>
                {['Account','Status','Close Date'].map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Vendor Filter</div>
              <input value={vendorSearch} onChange={e=>setVendorSearch(e.target.value)} placeholder='Filter by vendor...'
                style={{width:'100%',fontSize:13,padding:'8px 10px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:8,color:'#111827',boxSizing:'border-box',outline:'none'}}/>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Accounts</div>
              {data.accounts.map(a=>(
                <label key={a.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',cursor:'pointer',color:'#111827'}}>
                  <input type='checkbox' checked={accountFilter.has(a.id)}
                    onChange={e=>{setAccountFilter(prev=>{const n=new Set(prev);e.target.checked?n.add(a.id):n.delete(a.id);return n})}}
                    style={{accentColor:'#007AFF',cursor:'pointer',flexShrink:0}}/>
                  <span style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.short||a.name}</span>
                </label>
              ))}
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Status</div>
              {(()=>{
                const PCOL={'In Flight':'#007AFF','In Discussion':'#8B5CF6','Not Started':'#9CA3AF','Stalled':'#F97316','Won':'#10B981','Lost':'#EF4444'}
                return PROJ_STATS.map(s=>{const sc=PCOL[s]||'#9CA3AF';const act=statusFilter.has(s);return(
                  <button key={s} onClick={()=>setStatusFilter(prev=>{const n=new Set(prev);if(n.has(s)){if(n.size>1)n.delete(s)}else n.add(s);return n})}
                    style={{display:'block',width:'100%',margin:'3px 0',padding:'8px 10px',borderRadius:6,border:`1px solid ${act?sc:'#EEEFF2'}`,background:act?sc+'1A':'transparent',color:act?sc:'#6B7280',fontSize:13,fontWeight:600,cursor:'pointer',textAlign:'left'}}>
                    {s}
                  </button>
                )})
              })()}
            </div>
            <div style={{fontSize:11,color:'#9CA3AF'}}>{filtered.length} project{filtered.length!==1?'s':''}</div>
          </div>
          <div style={{padding:'12px 16px',borderTop:'1px solid #EEEFF2',flexShrink:0}}>
            <button onClick={()=>{setAddForm({...projBlank,status:'Not Started'});setAddModal(true);setMobFilterOpen(false)}}
              style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,width:'100%',padding:'11px 12px',background:'#007AFF',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>
              + Add Project
            </button>
          </div>
        </div>
      </>}

      {/* ── MAIN ── */}
      <div style={{flex:1,overflowY:mob?'visible':'auto',background:S.isLight?'#f1f5f9':S.bg}}>
        {/* Header bar */}
        <div style={{background:S.surf,padding:mob?'12px 14px':'14px 24px',display:'flex',alignItems:'center',gap:mob?8:12,position:'sticky',top:0,zIndex:100,flexWrap:'nowrap'}}>
          {mob?(
            <>
              <button onClick={onBack} style={{display:'inline-flex',alignItems:'center',gap:4,background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:7,color:S.blue,cursor:'pointer',fontSize:12,fontWeight:600,padding:'6px 10px',flexShrink:0,whiteSpace:'nowrap'}}>
                <ArrowLeft size={12}/>Back
              </button>
              <h1 style={{fontSize:16,fontWeight:800,color:S.txt,margin:0,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>All Projects</h1>
              <span style={{fontSize:11,fontWeight:700,color:S.blue,background:S.isLight?'#dbeafe':'rgba(59,130,246,0.15)',borderRadius:999,padding:'2px 7px',flexShrink:0}}>{filtered.length}</span>
              <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:7,padding:2,border:`1px solid ${S.bdr}`,flexShrink:0}}>
                {[{v:'timeline',l:'⊟'},{v:'pipeline',l:'⊞'}].map(({v,l})=>(
                  <button key={v} onClick={()=>setView(v)} title={v} style={{padding:'5px 8px',borderRadius:5,border:'none',background:view===v?S.blue:'transparent',color:view===v?'#fff':S.muted,fontSize:13,fontWeight:600,cursor:'pointer'}}>{l}</button>
                ))}
              </div>
              <button onClick={()=>setMobFilterOpen(true)}
                style={{display:'inline-flex',alignItems:'center',gap:4,padding:'7px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,fontSize:12,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                ⚙{(search||vendorSearch||statusFilter.size<6)?<span style={{width:6,height:6,borderRadius:'50%',background:S.blue,display:'inline-block'}}/>:null}
              </button>
            </>
          ):(
            <>
              <h1 style={{fontSize:20,fontWeight:800,color:S.txt,margin:0,flex:1,minWidth:120}}>All Projects</h1>
              <span style={{fontSize:12,fontWeight:600,color:S.blue,background:S.isLight?'#dbeafe':'rgba(59,130,246,0.15)',borderRadius:999,padding:'2px 10px'}}>{filtered.length}</span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search...'
                style={{fontSize:12,padding:'6px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,width:160}}/>
              <select value={sort} onChange={e=>setSort(e.target.value)} style={{fontSize:12,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt}}>
                {['Account','Status','Close Date'].map(o=><option key={o} value={o}>{o}</option>)}
              </select>
              <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:7,padding:2,border:`1px solid ${S.bdr}`}}>
                {[{v:'timeline',l:'Timeline'},{v:'pipeline',l:'Pipeline'}].map(({v,l})=>(
                  <button key={v} onClick={()=>setView(v)} style={{padding:'4px 12px',borderRadius:5,border:'none',background:view===v?S.blue:'transparent',color:view===v?'#fff':S.muted,fontSize:12,fontWeight:600,cursor:'pointer'}}>{l}</button>
                ))}
              </div>
              <button onClick={()=>{setAddForm({...projBlank,status:'Not Started'});setAddModal(true)}}
                style={{padding:'6px 14px',background:S.blue,color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>+ Add Project</button>
            </>
          )}
        </div>

        <div style={{padding:'16px 24px'}}>
          {/* Stats row */}
          <div style={{display:'grid',gridTemplateColumns:mob?'repeat(2,1fr)':'repeat(4,1fr)',gap:mob?8:10,marginBottom:mob?14:20}}>
            {[
              {label:'Active Projects',value:totalActive,color:'#16a34a',sub:'In Flight + In Discussion'},
              {label:'Weighted Pipeline',value:formatCompactCurrency(totalWeighted),color:'#0891b2',sub:'stage-weighted revenue'},
              {label:'Stalled',value:stalledCount,color:stalledCount>0?S.orange:S.muted,sub:'need attention'},
              {label:'Total Projects',value:allWithAcct.length,color:S.blue,sub:'across all accounts'},
            ].map(st=>(
              <div key={st.label} style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:10,padding:'12px 16px',boxShadow:S.isLight?'0 1px 3px rgba(0,0,0,0.06)':'none'}}>
                <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>{st.label}</div>
                <div style={{fontSize:26,fontWeight:800,color:st.color,lineHeight:1,marginBottom:2}}>{st.value}</div>
                <div style={{fontSize:11,color:S.dim}}>{st.sub}</div>
              </div>
            ))}
          </div>

          {filtered.length===0&&(
            <div style={{textAlign:'center',padding:'48px 20px',color:S.muted,fontSize:14,background:S.surf,borderRadius:12,border:`1px solid ${S.bdr}`}}>
              No projects found. Adjust your filters or add a project.
            </div>
          )}

          {/* ── TIMELINE VIEW ── */}
          {view==='timeline'&&filtered.length>0&&(
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {grouped.map(({a:acct,projs})=>{
                const isCol=collapsed.has(acct.id)
                return(
                  <div key={acct.id} className={mob?'ap-project-scroll':undefined} style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,overflow:mob?'auto':'visible',boxShadow:S.isLight?'0 1px 3px rgba(0,0,0,0.06)':'none'}}>
                    {/* Account section header */}
                    <div onClick={()=>setCollapsed(prev=>{const n=new Set(prev);n.has(acct.id)?n.delete(acct.id):n.add(acct.id);return n})}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',cursor:'pointer',background:S.isLight?'#f8fafc':S.surf2,borderBottom:isCol?'none':`1px solid ${S.bdr}`,borderRadius:isCol?12:'12px 12px 0 0'}}>
                      <span style={{fontSize:10,color:S.dim,transform:`rotate(${isCol?'-90deg':'0deg'})`,transition:'transform 0.15s',display:'inline-block',lineHeight:1}}>▼</span>
                      <span style={{fontSize:13,fontWeight:700,color:S.txt,flex:1}}>{acct.short||acct.name}</span>
                      <span style={{fontSize:10,color:S.muted,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:999,padding:'2px 8px'}}>{projs.length} project{projs.length!==1?'s':''}</span>
                    </div>
                    {!isCol&&projs.map(p=>{
                      const sc=PSC[p.status]||S.muted
                      return(
                        <div key={p.id} className="ap-project-row" style={{padding:'10px 16px',borderBottom:`1px solid ${S.bdr}`,display:'flex',alignItems:'center',gap:12,transition:'background 0.1s'}}
                          onMouseEnter={e=>e.currentTarget.style.background=S.isLight?'#f8fafc':S.surf2+'80'}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          {/* Left label col */}
                          <div style={{width:190,flexShrink:0}}>
                            <div style={{fontSize:12,fontWeight:700,color:S.txt,marginBottom:2,lineHeight:1.3}}>{p.name}</div>
                            {p.vendor&&<div style={{fontSize:10,color:S.muted,marginBottom:2}}>{p.vendor}</div>}
                            <span style={{fontSize:9,fontWeight:700,color:sc,background:sc+'18',borderRadius:999,padding:'1px 6px'}}>{p.status}</span>
                            {p.waitingOn&&<div style={{fontSize:10,color:'#ea580c',background:'rgba(234,88,12,0.1)',borderRadius:999,padding:'1px 7px',marginTop:3,display:'inline-flex',alignItems:'center',gap:3,maxWidth:'100%'}}>
                              <span style={{flexShrink:0}}>⏳</span>
                              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.waitingOn.length>35?p.waitingOn.slice(0,35)+'…':p.waitingOn}</span>
                            </div>}
                          </div>
                          {/* Timeline bar — clickable stages */}
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:'flex',gap:2,marginBottom:3}}>
                              {p.timeline.map((stage,i)=>{
                                const c=stage.status==='completed'?'#0ebc5f':stage.status==='current'?'#2563eb':'#e2e8f0'
                                const next=stage.status==='pending'?'current':stage.status==='current'?'completed':'pending'
                                return<div key={i} onClick={e=>{e.stopPropagation();updateProjectStage(p._aid,p.id,i,next)}}
                                  style={{flex:1,height:6,background:c,borderRadius:2,cursor:'pointer',transition:'background 0.15s'}}
                                  title={`${stage.stage} — click to set ${next}`+(stage.date?' ['+fmtDate(stage.date)+']':'')}/>
                              })}
                            </div>
                            <div style={{display:'grid',gridTemplateColumns:`repeat(${p.timeline.length},1fr)`,gap:1,marginBottom:4}}>
                              {p.timeline.map((stage,i)=>{
                                const c=stage.status==='completed'?'#0ebc5f':stage.status==='current'?'#2563eb':'#94a3b8'
                                const next=stage.status==='pending'?'current':stage.status==='current'?'completed':'pending'
                                return<div key={i} onClick={e=>{e.stopPropagation();updateProjectStage(p._aid,p.id,i,next)}}
                                  style={{textAlign:'center',fontSize:7,color:c,fontWeight:stage.status!=='pending'?700:400,lineHeight:1.2,overflow:'hidden',wordBreak:'break-all',cursor:'pointer'}}>
                                  {stage.stage.split(' ').slice(0,2).join(' ')}{stage.status==='completed'?'✓':stage.status==='current'?'●':''}
                                </div>
                              })}
                            </div>
                            {(p.closeDate||p.estimatedRevenue)&&<div style={{display:'flex',gap:10,fontSize:10,color:S.muted}}>
                              {p.closeDate&&<span>Close: {fmtDate(p.closeDate)}</span>}
                              {p.estimatedRevenue&&<span style={{color:S.blue}}>Rev: {p.estimatedRevenue}</span>}
                            </div>}
                          </div>
                          {/* Action buttons */}
                          <div style={{display:'flex',gap:3,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                            <button title='Edit' onClick={()=>{setEditModal({aid:p._aid});setEditForm({...projBlank,...p})}}
                              style={{background:'none',border:'none',cursor:'pointer',color:S.muted,padding:'4px 6px',borderRadius:4,fontSize:12}}>✏</button>
                            <div style={{position:'relative'}}>
                              <button title='Move status' onClick={()=>setMoveMenu(moveMenu===p.id?null:p.id)}
                                style={{background:'none',border:'none',cursor:'pointer',color:S.muted,padding:'4px 6px',borderRadius:4,fontSize:12}}>⬆</button>
                              {moveMenu===p.id&&(
                                <div style={{position:'absolute',right:0,top:'calc(100% + 2px)',zIndex:300,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,boxShadow:'0 4px 20px rgba(0,0,0,0.2)',minWidth:150,overflow:'hidden'}}>
                                  {PROJ_STATS.filter(s=>s!==p.status).map(s=>(
                                    <button key={s} onClick={()=>moveStatus(p._aid,p.id,s)}
                                      style={{display:'block',width:'100%',textAlign:'left',padding:'7px 12px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,fontSize:11,color:PSC[s]||S.txt,cursor:'pointer',fontWeight:600}}>→ {s}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div style={{position:'relative'}}>
                              <button title='Add note' onClick={()=>{setNotePopover(notePopover===p.id?null:p.id);setNoteText('')}}
                                style={{background:'none',border:'none',cursor:'pointer',color:S.muted,padding:'4px 6px',borderRadius:4,fontSize:12}}>💬</button>
                              {notePopover===p.id&&(
                                <div style={{position:'absolute',right:0,top:'calc(100% + 2px)',zIndex:300,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.18)',padding:10,width:230}}>
                                  <div style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Quick Note</div>
                                  <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} rows={3} autoFocus placeholder='Add a note...'
                                    style={{width:'100%',fontSize:12,padding:'6px 8px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,resize:'none',fontFamily:'inherit',boxSizing:'border-box'}}/>
                                  <div style={{display:'flex',gap:6,marginTop:6}}>
                                    <button onClick={()=>addNote(p._aid,p.id)} style={{flex:1,padding:'5px',background:S.blue,color:'#fff',border:'none',borderRadius:5,fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
                                    <button onClick={()=>setNotePopover(null)} style={{padding:'5px 10px',background:'transparent',color:S.muted,border:`1px solid ${S.bdr}`,borderRadius:5,fontSize:11,cursor:'pointer'}}>Cancel</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── PIPELINE VIEW ── */}
          {view==='pipeline'&&filtered.length>0&&(
            <div>
              <div style={{display:'grid',gridTemplateColumns:mob?'repeat(2,1fr)':'repeat(4,1fr)',gap:mob?8:12,marginBottom:mob?8:12}}>
                {['In Flight','In Discussion','Not Started','Stalled'].map(status=>{
                  const projs=sorted.filter(p=>p.status===status);const sc=PSC[status]||S.muted
                  return(
                    <div key={status} style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:10,padding:10}}>
                      <div style={{fontSize:11,fontWeight:700,color:sc,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        {status}<span style={{background:sc+'22',borderRadius:999,padding:'1px 7px'}}>{projs.length}</span>
                      </div>
                      {projs.length===0&&<div style={{fontSize:11,color:S.dim,textAlign:'center',padding:'14px 6px',border:`1px dashed ${S.bdr}`,borderRadius:6}}>No projects</div>}
                      {projs.map(p=>{
                        const comp=p.timeline.filter(s=>s.status==='completed').length;const acol=acctColors[p._aid]
                        return(
                          <div key={p.id} style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,padding:'9px 11px',marginBottom:6,boxShadow:S.isLight?'0 1px 3px rgba(0,0,0,0.06)':'none'}}>
                            <div style={{display:'flex',alignItems:'flex-start',gap:4,marginBottom:4}}>
                              <div style={{fontSize:12,fontWeight:700,color:S.txt,flex:1,lineHeight:1.3}}>{p.name}</div>
                              <button onClick={()=>{setEditModal({aid:p._aid});setEditForm({...projBlank,...p})}} style={{background:'none',border:'none',cursor:'pointer',color:S.muted,padding:'1px 4px',fontSize:12}}>✏</button>
                            </div>
                            <span style={{display:'inline-block',fontSize:9,fontWeight:700,color:'#fff',background:acol,borderRadius:999,padding:'1px 6px',marginBottom:4}}>{p._aname}</span>
                            {p.vendor&&<div style={{fontSize:11,color:S.muted,marginBottom:3}}>{p.vendor}</div>}
                            {p.estimatedRevenue&&<div style={{fontSize:11,color:S.blue,marginBottom:3}}>Rev: {p.estimatedRevenue}</div>}
                            <div style={{height:3,background:S.bdr,borderRadius:2,overflow:'hidden',marginBottom:3}}>
                              <div style={{height:'100%',width:`${(comp/STAGES.length)*100}%`,background:sc}}/>
                            </div>
                            <div style={{fontSize:10,color:S.muted,marginBottom:5}}>{comp}/{STAGES.length} stages</div>
                            <div style={{position:'relative'}} onClick={e=>e.stopPropagation()}>
                              <button onClick={()=>setStatusMenus(sm=>sm===p.id?null:p.id)}
                                style={{fontSize:10,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'3px 0',cursor:'pointer',width:'100%',textAlign:'center',fontWeight:600}}>
                                Move to… ↕
                              </button>
                              {statusMenus===p.id&&(
                                <div style={{position:'absolute',bottom:'calc(100% + 3px)',left:0,zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,boxShadow:'0 -4px 20px rgba(0,0,0,0.2)',minWidth:'100%',overflow:'hidden'}}>
                                  {PROJ_STATS.filter(s=>s!==p.status).map(s=>(
                                    <button key={s} onClick={()=>moveStatus(p._aid,p.id,s)}
                                      style={{display:'block',width:'100%',textAlign:'left',padding:'7px 12px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,fontSize:11,color:PSC[s]||S.txt,cursor:'pointer',fontWeight:600}}>→ {s}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
              {['Won','Lost'].map(status=>{
                const projs=sorted.filter(p=>p.status===status);if(!projs.length)return null;const sc=PSC[status]||S.muted
                return(
                  <div key={status} style={{marginTop:10,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:10,padding:10,opacity:0.75}}>
                    <div style={{fontSize:11,fontWeight:700,color:sc,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em'}}>{status} <span style={{background:sc+'22',borderRadius:999,padding:'1px 7px'}}>{projs.length}</span></div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>
                      {projs.map(p=>(
                        <div key={p.id} style={{background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6,padding:'7px 9px'}}>
                          <div style={{fontSize:11,fontWeight:600,color:S.secondary,marginBottom:2}}>{p.name}</div>
                          <div style={{fontSize:10,color:S.muted}}>{p._aname}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── EDIT MODAL ── */}
      {editModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:S.surf,borderRadius:12,width:'100%',maxWidth:660,maxHeight:'90vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)',border:`1px solid ${S.bdr}`}}>
            <div style={{padding:'14px 20px',borderBottom:`1px solid ${S.bdr}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:15,fontWeight:700,color:S.txt}}>Edit Project — <span style={{color:S.muted,fontWeight:400}}>{data.accounts.find(a=>a.id===editModal.aid)?.short||''}</span></span>
              <button onClick={()=>setEditModal(null)} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
            </div>
            <div style={{padding:20}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <Field label='Project Name' value={editForm.name||''} onChange={ff('name')} style={{gridColumn:'span 2'}}/>
                <Field label='Vendor' value={editForm.vendor||''} onChange={ff('vendor')}/>
                <Field label='Status' value={editForm.status||''} onChange={ff('status')} options={PROJ_STATS}/>
                <Field label='Primary Contact' value={editForm.primaryContact||''} onChange={ff('primaryContact')}/>
                <Field label='Close Date' value={editForm.closeDate||''} onChange={ff('closeDate')} type='date'/>
                <Field label='Est. Revenue' value={editForm.estimatedRevenue||''} onChange={ff('estimatedRevenue')} placeholder='e.g. $50k'/>
                <Field label='Est. Gross Profit' value={editForm.estimatedGrossProfit||''} onChange={ff('estimatedGrossProfit')} placeholder='e.g. $15k'/>
                <Field label='Next Action' value={editForm.nextAction||''} onChange={ff('nextAction')} style={{gridColumn:'span 2'}}/>
                <Field label='Waiting On' value={editForm.waitingOn||''} onChange={ff('waitingOn')} style={{gridColumn:'span 2'}}/>
                <Field label='Notes' value={editForm.notes||''} onChange={ff('notes')} multiline style={{gridColumn:'span 2'}}/>
              </div>
              <div style={{display:'flex',gap:8,marginTop:12}}>
                <button onClick={saveEdit} style={{padding:'8px 20px',background:S.blue,color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer'}}>Save</button>
                <button onClick={()=>setEditModal(null)} style={{padding:'8px 14px',background:'transparent',color:S.muted,border:`1px solid ${S.bdr}`,borderRadius:7,fontSize:13,cursor:'pointer'}}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD PROJECT MODAL ── */}
      {addModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:S.surf,borderRadius:12,width:'100%',maxWidth:520,maxHeight:'90vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)',border:`1px solid ${S.bdr}`}}>
            <div style={{padding:'14px 20px',borderBottom:`1px solid ${S.bdr}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:15,fontWeight:700,color:S.txt}}>Add Project</span>
              <button onClick={()=>setAddModal(false)} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
            </div>
            <div style={{padding:20}}>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Account</div>
                <select value={addAcctId} onChange={e=>setAddAcctId(e.target.value)} style={{width:'100%',fontSize:13,padding:'7px 10px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt}}>
                  {data.accounts.map(a=><option key={a.id} value={a.id}>{a.short||a.name}</option>)}
                </select>
              </div>
              <Field label='Project Name' value={addForm.name||''} onChange={fa('name')}/>
              <Field label='Vendor' value={addForm.vendor||''} onChange={fa('vendor')}/>
              <Field label='Status' value={addForm.status||'Not Started'} onChange={fa('status')} options={PROJ_STATS}/>
              <Field label='Close Date' value={addForm.closeDate||''} onChange={fa('closeDate')} type='date'/>
              <Field label='Est. Revenue' value={addForm.estimatedRevenue||''} onChange={fa('estimatedRevenue')} placeholder='e.g. $50k'/>
              <div style={{display:'flex',gap:8,marginTop:4}}>
                <button onClick={saveAdd} style={{padding:'8px 20px',background:S.blue,color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer'}}>Add Project</button>
                <button onClick={()=>setAddModal(false)} style={{padding:'8px 14px',background:'transparent',color:S.muted,border:`1px solid ${S.bdr}`,borderRadius:7,fontSize:13,cursor:'pointer'}}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [data,setData] = useState(null)
  const [storageReady,setStorageReady] = useState(false)
  const [initialLoadDone,setInitialLoadDone] = useState(false)
  const [saveStatus,setSaveStatus] = useState('idle')
  const [activeId,setActiveId] = useState('bhsi')
  const [tab,setTab] = useState('overview')
  const searchRef = useRef(null)
  const saveInProgress = useRef(false)
  const lastSaveTime = useRef(0)
  const [lastSavedLabel,setLastSavedLabel] = useState('')
  const [isLandingPage,setIsLandingPage] = useState(true)
  const [showAccounts,setShowAccounts] = useState(false)
  const [showWhitespace,setShowWhitespace] = useState(false)
  const [showAllProjects,setShowAllProjects] = useState(false)
  const [showVendors,setShowVendors] = useState(false)
  const [showDailyBriefPage,setShowDailyBriefPage] = useState(false)
  const [briefGenerating,setBriefGenerating] = useState(false)
  const [briefError,setBriefError] = useState(null)
  const [showClientView,setShowClientView] = useState(false)
  const [mobileMenuOpen,setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed,setSidebarCollapsed] = useState(()=>localStorage.getItem('sidebar-collapsed')==='true')
  const [theme,setTheme] = useState(()=>{
    const t = localStorage.getItem('gp-theme')||'light'
    document.documentElement.setAttribute('data-theme',t)
    return t
  })

  // Update module-level S, PC, IC on every render so all child components see the right theme
  applyTheme(theme)

  const handleSetTheme = t => {
    setTheme(t)
    localStorage.setItem('gp-theme',t)
    document.documentElement.setAttribute('data-theme',t)
  }

  const applyLoad = d => {
    const loaded = d || SAMPLE
    const today = new Date().toISOString().split('T')[0]
    const accounts = loaded.accounts.map(acct=>{
      const history = acct.healthScoreHistory || []
      if(history.some(h=>h.date===today)) return {...acct, healthScoreOverrides:acct.healthScoreOverrides||{}, healthScoreHistory:history}
      const score = calcDetailedHealthScore({...acct, healthScoreOverrides:acct.healthScoreOverrides||{}}).total
      return {...acct, healthScoreOverrides:acct.healthScoreOverrides||{}, healthScoreHistory:[...history,{date:today,score}].slice(-30)}
    })
    setData({...loaded, accounts, whitespaceAccounts:loaded.whitespaceAccounts||[]})
    setStorageReady(true)
    setInitialLoadDone(true)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ loadData().then(applyLoad) },[])

  const safeLoadData = async () => {
    if (Date.now() - contactPhotoSaveTime < 5000) { console.log('Skipping reload — contact photo save in progress'); return }
    if (Date.now() - (window._lastDirectSave || 0) < 8000) { console.log('Skipping reload — direct save in progress'); return }
    console.log('safeLoadData called, inProgress:', saveInProgress.current, 'lastSave:', lastSaveTime.current)
    if (saveInProgress.current) { console.log('Skipping reload — save in progress'); return }
    if (Date.now() - lastSaveTime.current < 5000) { console.log('Skipping reload — recent save'); return }
    const savedData = await loadData()
    if (saveInProgress.current) { console.log('Skipping reload — save started during load'); return }
    if (Date.now() - lastSaveTime.current < 5000) { console.log('Skipping reload — save completed during load'); return }
    if (savedData) applyLoad(savedData)
    else setStorageReady(true)
  }

  const handleRefresh = () => {
    setStorageReady(false)
    loadData().then(applyLoad)
  }

  useEffect(()=>{
    if(!data || !initialLoadDone || !storageReady) return
    if (Date.now() - contactPhotoSaveTime < 5000) return
    if (Date.now() - (window._lastDirectSave || 0) < 8000) return
    console.log('Auto-save triggered')
    let iv
    const timer = setTimeout(()=>{
      setSaveStatus('saving')
      const saved = new Date()
      saveData(data).then(({error})=>{
        if(error){
          setSaveStatus('error')
        } else {
          setSaveStatus('saved')
          setLastSavedLabel('just now')
          iv = setInterval(()=>{
            const mins=Math.floor((new Date()-saved)/60000)
            if(mins<1)setLastSavedLabel('just now')
            else if(mins===1)setLastSavedLabel('1 min ago')
            else setLastSavedLabel(`${mins} mins ago`)
          },30000)
        }
      })
    }, 2000)
    return()=>{clearTimeout(timer);clearInterval(iv)}
  },[data,initialLoadDone,storageReady])

  useEffect(()=>{
    const handler=e=>{
      if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown',handler)
    return()=>window.removeEventListener('keydown',handler)
  },[])

  useEffect(()=>{
    const handleFocus = () => {
      console.log('Focus triggered reload at:', Date.now(), 'lastSave:', lastSaveTime.current)
      safeLoadData()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  const generateDailyBrief = async () => {
    if (briefGenerating || !data) return
    const effectiveApiKey = data.apiKey || ''
    if (!effectiveApiKey) { setBriefError('No API key configured. Add your Anthropic key in Settings.'); return }
    setBriefGenerating(true)
    setBriefError(null)
    try {
      const todayDate = new Date()
      const today = todayDate.toISOString().split('T')[0]
      const accountContext = (data.accounts || []).map(acct => {
        const daysSinceContact = acct.lastContact ? Math.floor((Date.now()-new Date(acct.lastContact))/86400000) : 999
        const openFollowUps = (acct.followUps||[]).filter(f=>f.status==='Open')
        const criticalFollowUps = openFollowUps.filter(f=>f.priority==='Critical'||f.priority==='High')
        const overdueFollowUps = openFollowUps.filter(f=>f.dueDate&&new Date(f.dueDate)<todayDate)
        const activeProjects = (acct.projects||[]).filter(p=>['In Flight','In Discussion','Not Started','Stalled'].includes(p.status))
        const upcomingRenewals = (acct.techStack||[]).filter(t=>{if(!t.renewalDate)return false;const days=Math.floor((new Date(t.renewalDate)-todayDate)/86400000);return days>=0&&days<=90})
        const recentIntel = (acct.intelLog||[]).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,3).map(e=>e.text?.slice(0,400)||'').join(' | ')
        const promisedDeliverables = openFollowUps.filter(f=>f.task?.toLowerCase().includes('send')||f.task?.toLowerCase().includes('share')||f.task?.toLowerCase().includes('provide')||f.task?.toLowerCase().includes('forward')||(f.waitingOn||'').toLowerCase().includes('mike'))
        return {
          name:acct.name,industry:acct.industry||'',employees:acct.employees||'',revenue:acct.revenue||'',hq:acct.hq||'',
          daysSinceContact,health:acct.health||50,
          openFollowUpsCount:openFollowUps.length,
          criticalFollowUps:criticalFollowUps.map(f=>({task:f.task,dueDate:f.dueDate,waitingOn:f.waitingOn})),
          overdueFollowUps:overdueFollowUps.map(f=>({task:f.task,dueDate:f.dueDate})),
          promisedDeliverables:promisedDeliverables.map(f=>f.task),
          activeProjects:activeProjects.map(p=>({name:p.name,vendor:p.vendor,status:p.status,stage:(p.timeline||[]).find(s=>s.status==='current')?.stage||'',waitingOn:p.waitingOn||'',nextSteps:p.nextSteps||'',estimatedCloseDate:p.estimatedCloseDate||'',estimatedRevenue:p.estimatedRevenue||''})),
          stalledProjects:activeProjects.filter(p=>p.status==='Stalled').map(p=>p.name),
          upcomingRenewals:upcomingRenewals.map(t=>({vendor:t.vendor,renewalDate:t.renewalDate,daysUntil:Math.floor((new Date(t.renewalDate)-todayDate)/86400000),annualCost:t.annualCost||''})),
          recentIntel,
          techStackVendors:(acct.techStack||[]).map(t=>t.vendor).filter(Boolean).join(', '),
          contacts:(acct.contacts||[]).map(c=>({name:c.name,title:c.title,relationship:c.relationship}))
        }
      })
      const whitespaceContext = (data.whitespaceAccounts||[]).filter(a=>a.status==='Active Conversation'||a.status==='Reached Out').map(a=>({name:a.name,status:a.status,industry:a.industry}))
      const systemPrompt = `You are Ledgr. — the AI chief of staff for Mike Chiricosta, Enterprise Client Manager at GuidePoint Security covering New England. GuidePoint is a cybersecurity VAR and services firm. You think like the most strategic, highest-paid enterprise sales executive in cybersecurity.

Your job is to generate Mike's Daily Brief — a prioritized, actionable morning memo that tells him exactly what to do today to be the most valuable, indispensable resource his clients have ever worked with.

CORE PHILOSOPHY — never forget this:
- The best reps don't manage accounts. They manage momentum. Every account either has momentum or it doesn't.
- Every action must have a CLIENT-FIRST angle — not "follow up on X" but "here is what is happening in their world and here is what you bring them"
- Clients want someone who thinks for them, covers their blind spots, and shows up with perspective not just updates
- "Just following up" is never acceptable — every touchpoint must deliver value
- Help Mike arm his CISOs to sell security upstairs to CFOs and CIOs when relevant
- Quick wins AND long-term seeds — never lose sight of either
- Business conversation drives results — translate security gaps into business risk, peer benchmarks, and financial exposure
- Help clients cover their blind spots — bring them something they did not ask for
- The goal is for Mike's clients to feel cared for, covered, and confident — like they have a second set of eyes on their security program

PRIORITIZATION LOGIC — do NOT use due dates as the primary driver. Weight by:
1. Promised deliverables Mike committed to on a call — highest urgency
2. Deals with imminent close dates or budget deadlines
3. Accounts with competitive threats or vendor evaluations in progress
4. Accounts where momentum is stalling — no contact AND active project is dangerous
5. Upcoming renewals within 60 days where Mike is not clearly in the conversation
6. High-value accounts with no recent contact
7. New trigger events — new CISO, recent breach in their industry, regulatory change affecting them

OUTPUT — return ONLY valid JSON, no markdown, no preamble, no explanation:
{
  "briefSummary": "2-3 sentence executive summary of today — overall state of Mike's book and the single most important thing to accomplish today",
  "actToday": [{"account":"","contact":"","action":"","clientFirstAngle":"","suggestedOpener":"","whileYouHaveThem":[],"upsairsKit":"","urgencyReason":"","estimatedMinutes":15,"completedToday":false}],
  "moveForward": [{"account":"","contact":"","action":"","clientFirstAngle":"","timeframe":"","urgencyReason":""}],
  "longGame": [{"account":"","action":"","why":"","plantThisSeed":""}],
  "renewalRadar": [{"account":"","vendor":"","daysUntil":0,"annualCost":"","inConversation":true,"alert":""}],
  "marketPulse": [{"headline":"","relevance":"","talkingPoint":""}]
}`
      const userPrompt = `Today is ${todayDate.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'America/New_York'})}.

Here is Mike's complete book of business:
${JSON.stringify(accountContext,null,2)}

Active whitespace accounts being pursued:
${JSON.stringify(whitespaceContext,null,2)}

Generate Mike's Daily Brief. For actToday select MAX 3 accounts — the absolute highest leverage actions for today only. For moveForward select MAX 5. For longGame select MAX 3. For renewalRadar include ALL renewals within 90 days found in the data. For marketPulse use your knowledge of the current cybersecurity landscape to provide exactly 3 relevant bullets about what is happening right now in identity security, EDR, cloud security, AI security, ransomware, or regulatory changes — things Mike should know and bring to his clients to demonstrate he is the most knowledgeable person in the room.

Remember: every action must have a client-first angle. Never recommend just following up. Always bring something valuable. Help Mike show up like a trusted advisor not a rep checking boxes.`

      const {res, data: responseData} = await callClaudeWithRetry({
        model:'claude-sonnet-4-20250514',
        max_tokens:4000,
        system:systemPrompt,
        messages:[{role:'user',content:userPrompt}]
      }, effectiveApiKey, null, 3)

      const rawText = responseData.content?.[0]?.text || ''
      let briefData
      try {
        const cleaned = rawText.replace(/```json|```/g,'').trim()
        briefData = JSON.parse(cleaned)
      } catch(e) {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (jsonMatch) briefData = JSON.parse(jsonMatch[0])
        else throw new Error('Could not parse brief response')
      }
      const newBrief = {
        date:today,
        generatedAt:new Date().toISOString(),
        briefSummary:briefData.briefSummary||'',
        sections:{
          actToday:(briefData.actToday||[]).map(a=>({...a,completedToday:false})),
          moveForward:briefData.moveForward||[],
          longGame:briefData.longGame||[],
          renewalRadar:briefData.renewalRadar||[],
          marketPulse:briefData.marketPulse||[]
        }
      }
      setData(prev=>{
        const existingBriefs=(prev.dailyBriefs||[]).filter(b=>b.date!==today)
        return {...prev,dailyBriefs:[newBrief,...existingBriefs].slice(0,30)}
      })
    } catch(err) {
      console.error('Daily brief generation failed:',err)
      setBriefError('Could not generate brief. Check your API key in Settings.')
    } finally {
      setBriefGenerating(false)
    }
  }

  // Auto-generate brief after 7:45am EST if not already generated today
  useEffect(()=>{
    const checkAndGenerateBrief = async () => {
      if (!data || !data.apiKey || briefGenerating) return
      const today = new Date().toISOString().split('T')[0]
      const now = new Date()
      const estTime = new Date(now.toLocaleString('en-US',{timeZone:'America/New_York'}))
      const estHour = estTime.getHours()
      const estMinutes = estTime.getMinutes()
      const isAfter745am = estHour > 7 || (estHour === 7 && estMinutes >= 45)
      const todayBriefExists = (data.dailyBriefs||[]).some(b=>b.date===today)
      if (isAfter745am && !todayBriefExists) { generateDailyBrief() }
    }
    if (initialLoadDone) checkAndGenerateBrief()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[initialLoadDone])

  if (!data) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:S.bg,color:S.muted,fontSize:14}}>Loading...</div>

  if (showDailyBriefPage) return (
    <DailyBrief
      data={data}
      setData={setData}
      apiKey={data.apiKey}
      briefGenerating={briefGenerating}
      briefError={briefError}
      onGenerateNow={generateDailyBrief}
      onBack={()=>{setShowDailyBriefPage(false);setIsLandingPage(true)}}
    />
  )

  if (showWhitespace) return (
    <WhitespacePage
      data={data}
      setData={setData}
      theme={theme}
      setTheme={handleSetTheme}
      onBack={()=>{setShowWhitespace(false);setIsLandingPage(true)}}
    />
  )

  if (showAllProjects) return (
    <AllProjectsPage
      data={data}
      setData={setData}
      onBack={()=>{setShowAllProjects(false);setIsLandingPage(true)}}
    />
  )

  if (showVendors) return (
    <VendorsPage
      data={data}
      setData={setData}
      apiKey={data.apiKey}
      onBack={()=>{setShowVendors(false);setIsLandingPage(true)}}
    />
  )

  if (isLandingPage) return (
    <LandingPage
      data={data}
      setData={setData}
      onEnterAccount={id=>{setActiveId(id);setTab('overview');setIsLandingPage(false)}}
      onNavigateTo={(id,t)=>{setActiveId(id);setTab(t);setIsLandingPage(false)}}
      onOpenSettings={()=>{const first=data.accounts[0];if(first){setActiveId(first.id);setTab('settings');setIsLandingPage(false)}}}
      onGoWhitespace={()=>{setShowWhitespace(true);setIsLandingPage(false)}}
      onGoAllProjects={()=>{setShowAllProjects(true);setIsLandingPage(false)}}
      onGoVendors={()=>{setShowVendors(true);setIsLandingPage(false)}}
      onGoDailyBrief={()=>{setShowDailyBriefPage(true);setIsLandingPage(false)}}
      briefGenerating={briefGenerating}
      briefError={briefError}
      onGenerateBrief={generateDailyBrief}
      theme={theme}
      setTheme={handleSetTheme}
      showAccounts={showAccounts}
      setShowAccounts={setShowAccounts}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
    />
  )

  const acct = data.accounts.find(a=>a.id===activeId)||data.accounts[0]
  const setAcct = fn => setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===acct.id?(typeof fn==='function'?fn(a):fn):a)}))
  const critHighCount = (acct.followUps||[]).filter(f=>f.status==='Open'&&(f.priority==='Critical'||f.priority==='High')).length
  const todayIso = new Date().toISOString().split('T')[0]
  const overdueOrTodayCount = (acct.followUps||[]).filter(f=>f.status==='Open'&&f.dueDate&&f.dueDate<=todayIso).length
  const mob = typeof window!=='undefined'&&window.innerWidth<768

  return (
    <div style={{height:mob?'auto':'100vh',minHeight:mob?'100vh':'auto',overflow:mob?'visible':'hidden',background:S.bg}}>
      {mob&&(
        <button onClick={()=>setMobileMenuOpen(true)} style={{position:'fixed',top:12,left:12,zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,padding:'8px 10px',cursor:'pointer',boxShadow:'0 2px 8px rgba(0,0,0,0.15)'}}>
          <div style={{width:18,height:2,background:S.txt,marginBottom:4,borderRadius:1}}/>
          <div style={{width:18,height:2,background:S.txt,marginBottom:4,borderRadius:1}}/>
          <div style={{width:18,height:2,background:S.txt,borderRadius:1}}/>
        </button>
      )}
      <Sidebar
        data={data}
        activeId={activeId}
        setActiveId={id=>{setActiveId(id);setTab('overview');setMobileMenuOpen(false)}}
        setData={setData}
        onNavigate={(id,t)=>{setActiveId(id);setTab(t);setMobileMenuOpen(false)}}
        searchRef={searchRef}
        lastSaved={lastSavedLabel}
        saveStatus={saveStatus}
        onRefresh={handleRefresh}
        theme={theme}
        setTheme={handleSetTheme}
        onGoHome={()=>{setIsLandingPage(true);setMobileMenuOpen(false)}}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobileMenu={()=>setMobileMenuOpen(false)}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />
      <div style={{marginLeft:mob?0:(sidebarCollapsed?64:221),transition:'margin-left 0.2s ease',display:'flex',flexDirection:'column',height:mob?'auto':'100vh',overflow:mob?'visible':'hidden'}}>
        <div style={{background:S.isLight?'#ffffff':S.headerBg,padding:mob?'10px 14px 0 50px':'12px 24px 0',flexShrink:0,position:mob?'sticky':'relative',top:0,zIndex:mob?100:'auto'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:S.isLight?10:10}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <button onClick={()=>{setShowAccounts(true);setIsLandingPage(true)}} style={{display:'inline-flex',alignItems:'center',gap:4,background:'transparent',border:'1px solid #EEEFF2',borderRadius:6,color:'#9CA3AF',cursor:'pointer',fontSize:12,fontWeight:500,padding:'5px 10px',flexShrink:0,whiteSpace:'nowrap'}}>‹ All Accounts</button>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                {acct.logoImage&&<div style={{width:28,height:28,borderRadius:'50%',overflow:'hidden',flexShrink:0,border:`1px solid ${S.bdr}`}}><img src={acct.logoImage} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/></div>}
                <div>
                  <div style={{fontSize:20,fontWeight:700,color:'#111827',lineHeight:1.2}}>{acct.name}</div>
                </div>
              </div>
            </div>
            {!mob&&<div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end',alignItems:'center'}}>
              {acct.lastContact&&<span style={{fontSize:11,color:S.muted}}>Last contact: {fmtDate(acct.lastContact)}</span>}
            </div>}
            <button onClick={()=>setShowClientView(true)} style={{display:'inline-flex',alignItems:'center',gap:6,background:'#FFFFFF',border:'1px solid #EEEFF2',borderRadius:8,color:'#374151',cursor:'pointer',fontSize:12,fontWeight:600,padding:'6px 14px',flexShrink:0,boxShadow:'0 1px 2px rgba(0,0,0,0.06)',whiteSpace:'nowrap'}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='#007AFF';e.currentTarget.style.color='#007AFF'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='#EEEFF2';e.currentTarget.style.color='#374151'}}>
              <Eye size={14}/> Client View
            </button>
          </div>
          <style>{`@keyframes fuPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.75)}}@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
          <div style={{display:'flex',overflowX:'auto',WebkitOverflowScrolling:'touch',position:mob?'relative':'sticky',top:mob?undefined:0,zIndex:mob?undefined:10}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)}
                onMouseEnter={e=>{if(tab!==t.id)e.currentTarget.style.color=S.txt}}
                onMouseLeave={e=>{if(tab!==t.id)e.currentTarget.style.color=S.muted}}
                style={{padding:mob?'10px 12px':'7px 14px',minWidth:mob?80:undefined,background:'transparent',border:'none',cursor:'pointer',fontSize:mob?13:12,fontWeight:600,color:tab===t.id?S.blue:S.muted,borderBottom:tab===t.id?`2px solid ${S.blue}`:'2px solid transparent',whiteSpace:'nowrap',display:'inline-flex',alignItems:'center',gap:5,flexShrink:0,transition:'color 0.15s'}}>
                {t.label}
                {t.id==='followups'&&critHighCount>0&&<span style={{width:8,height:8,borderRadius:'50%',background:'#dc2626',display:'inline-block',flexShrink:0,animation:'fuPulse 1s ease-in-out infinite'}}/>}
                {t.id==='followups'&&overdueOrTodayCount>0&&<span style={{width:7,height:7,borderRadius:'50%',background:'#fc413d',display:'inline-block',marginLeft:overdueOrTodayCount>0&&critHighCount>0?2:5,flexShrink:0,animation:'blink 1s infinite'}}/>}
              </button>
            ))}
          </div>
        </div>
        <div style={{flex:mob?'none':1,overflowY:mob?'visible':'auto',WebkitOverflowScrolling:'touch',padding:mob?'14px 14px 60px':'18px 20px 60px',background:S.bg}}>
          {tab==='overview'&&<Overview acct={acct} setAcct={setAcct} setTab={setTab} apiKey={data.apiKey}/>}
          {tab==='dashboard'&&<AccountDashboard acct={acct} setTab={setTab}/>}
          {tab==='contacts'&&<Contacts acct={acct} setAcct={setAcct} data={data} setData={setData} onContactPhotoSave={()=>{ contactPhotoSaveTime = Date.now() }}/>}
          {tab==='stack'&&<TechStack acct={acct} setAcct={setAcct} apiKey={data.apiKey}/>}
          {tab==='projects'&&<Projects acct={acct} setAcct={setAcct}/>}
          {tab==='followups'&&<Actions acct={acct} setAcct={setAcct} apiKey={data.apiKey} whitespaceAccounts={data.whitespaceAccounts||[]}/>}
          {tab==='intel'&&<IntelLog acct={acct} setAcct={setAcct} apiKey={data.apiKey} appData={data} setAppData={setData}/>}
          {tab==='aihistory'&&<AIHistory acct={acct} setAcct={setAcct} setData={setData} apiKey={data.apiKey}/>}
          {tab==='files'&&<Files acct={acct} setAcct={setAcct}/>}
          {tab==='admin'&&<Admin acct={acct} setAcct={setAcct}/>}
          {tab==='settings'&&<Settings data={data} setData={setData} acct={acct} setAcct={setAcct} theme={theme} setTheme={handleSetTheme} saveInProgress={saveInProgress} lastSaveTime={lastSaveTime} onReset={()=>setData(SAMPLE)}/>}
        </div>
      </div>
      {showClientView&&acct&&<ClientView acct={acct} setAcct={setAcct} onClose={()=>setShowClientView(false)}/>}
    </div>
  )
}
