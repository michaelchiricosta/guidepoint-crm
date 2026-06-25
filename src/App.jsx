
import { useState, useEffect, useRef, memo } from 'react'
import { ArrowLeft, Eye, X, Settings2 } from 'lucide-react'
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
import Overview from './components/Overview.jsx'
import LandingPage from './components/LandingPage.jsx'
import WhitespacePage from './components/WhitespacePage.jsx'
import { trackAI, FEATURES, mergeAIRecords, getRecords } from './utils/aiTracker.js'
import { AI_MODELS, DEFAULT_AI_SETTINGS, hashStr, getAICache, setAICache, checkBudget, friendlyApiError, withLock, isLocked, callClaudeWithRetry } from './utils/aiHelper.js'
const WHEEL_DOMAINS = SECURITY_FRAMEWORK.domains.map(d => ({name: d.name, color: d.color, subs: d.subs}))

const SK = 'gp-crm-v4'
const TECH_CATS = WHEEL_DOMAINS.flatMap(d => d.subs).sort()

// Module-level guard — set by the contact photo upload handler so focus/save don't overwrite
let contactPhotoSaveTime = 0


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
  dailyBriefs: [],
  meetingPreps: [],
  dailyJournals: [],
  knowledgeBase: [],
  marketPulses: [],
  marketIntelPinned: [],
  marketIntelDeleted: [],
  blogSources: [
    { id: 'guidepointsecurity', name: 'GuidePoint Security Blog', url: 'https://www.guidepointsecurity.com/blog/', feedUrl: 'https://www.guidepointsecurity.com/blog/feed/', enabled: true },
    { id: 'darkreading',        name: 'Dark Reading',             url: 'https://www.darkreading.com/',              feedUrl: 'https://www.darkreading.com/rss/all.xml',          enabled: true },
    { id: 'cio',                name: 'CIO.com',                  url: 'https://www.cio.com/',                      feedUrl: 'https://www.cio.com/feed/',                        enabled: true },
  ]
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
            style={{marginBottom:6,fontSize:12,width:'100%',padding:'7px 10px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:8,color:'#111827',outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/>
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
                            <button title='Delete project' onClick={()=>{if(window.confirm('Delete this project? This cannot be undone.'))setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===p._aid?{...a,projects:(a.projects||[]).filter(j=>j.id!==p.id)}:a)}))}}
                              style={{background:'none',border:'none',cursor:'pointer',color:'#dc2626',padding:'4px 6px',borderRadius:4,fontSize:14,lineHeight:1}}>×</button>
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
                              <button onClick={e=>{e.stopPropagation();if(window.confirm('Delete this project? This cannot be undone.'))setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===p._aid?{...a,projects:(a.projects||[]).filter(j=>j.id!==p.id)}:a)}))}} style={{background:'none',border:'none',cursor:'pointer',color:'#dc2626',padding:'1px 4px',fontSize:14,lineHeight:1}}>×</button>
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
              <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'space-between',alignItems:'center',flexWrap:'wrap'}}>
                {editForm.id&&<button onClick={()=>{if(window.confirm('Delete this project? This cannot be undone.')){setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===editModal.aid?{...a,projects:(a.projects||[]).filter(j=>j.id!==editForm.id)}:a)}));setEditModal(null)}}} style={{padding:'8px 16px',background:'transparent',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:7,fontSize:13,fontWeight:600,cursor:'pointer'}}>Delete Project</button>}
                <div style={{display:'flex',gap:8,marginLeft:'auto'}}>
                  <button onClick={saveEdit} style={{padding:'8px 20px',background:S.blue,color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer'}}>Save</button>
                  <button onClick={()=>setEditModal(null)} style={{padding:'8px 14px',background:'transparent',color:S.muted,border:`1px solid ${S.bdr}`,borderRadius:7,fontSize:13,cursor:'pointer'}}>Cancel</button>
                </div>
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
  const lastKnownVersion = useRef(null)
  const saveBroadcast = useRef(null)
  const navRestoredRef = useRef(false)
  // saveBlockedRef: true after a version conflict — stops auto-saves until user reloads.
  // Using a ref (not state) so stale closures (focus handler) see the live value.
  const saveBlockedRef = useRef(false)
  // pendingChanges: true while a save is queued but not yet committed.
  const pendingChanges = useRef(false)
  const [lastSavedLabel,setLastSavedLabel] = useState('')
  const [conflictWarning,setConflictWarning] = useState(false)
  const [remoteUpdateWarning,setRemoteUpdateWarning] = useState(false)
  const [isLandingPage,setIsLandingPage] = useState(true)
  const [showAccounts,setShowAccounts] = useState(false)
  const [showWhitespace,setShowWhitespace] = useState(false)
  const [showAllProjects,setShowAllProjects] = useState(false)
  const [showVendors,setShowVendors] = useState(false)
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

  const applyLoad = result => {
    const loaded = result?.appData || result || SAMPLE
    lastKnownVersion.current = result?.version ?? null
    // Unblock saves — a fresh load gives us the authoritative version
    saveBlockedRef.current = false
    pendingChanges.current = false
    setConflictWarning(false)
    setRemoteUpdateWarning(false)
    const today = new Date().toISOString().split('T')[0]
    const accounts = loaded.accounts.map(acct=>{
      const history = acct.healthScoreHistory || []
      if(history.some(h=>h.date===today)) return {...acct, healthScoreOverrides:acct.healthScoreOverrides||{}, healthScoreHistory:history}
      const score = calcDetailedHealthScore({...acct, healthScoreOverrides:acct.healthScoreOverrides||{}}).total
      return {...acct, healthScoreOverrides:acct.healthScoreOverrides||{}, healthScoreHistory:[...history,{date:today,score}].slice(-30)}
    })
    // Merge API key from localStorage — it is never persisted to Supabase (stripped in saveData).
    // Fallback to loaded.apiKey for one-time migration of keys stored in old saves.
    const localApiKey = localStorage.getItem('ledgr_anthropic_api_key') || loaded.apiKey || ''
    // Merge AI usage records: union of localStorage (current session) + Supabase blob (other devices).
    // The merged set is written back to localStorage so the AI Usage Dashboard sees cross-device data.
    const localAI = getRecords()
    const mergedAI = mergeAIRecords(localAI, loaded.aiUsageLog || [])
    try { localStorage.setItem('ledgr_ai_usage_v1', JSON.stringify(mergedAI)) } catch {}
    setData({...loaded, accounts, whitespaceAccounts:loaded.whitespaceAccounts||[], knowledgeBase:loaded.knowledgeBase||[], marketPulses:loaded.marketPulses||[], marketIntelPinned:loaded.marketIntelPinned||[], marketIntelDeleted:loaded.marketIntelDeleted||[], blogSources:loaded.blogSources||SAMPLE.blogSources, dailyJournals:loaded.dailyJournals||[], dailyBriefItemChats:loaded.dailyBriefItemChats||[], aiCache:loaded.aiCache||{}, aiSettings:{...DEFAULT_AI_SETTINGS,...(loaded.aiSettings||{})}, aiUsageLog:mergedAI, apiKey: localApiKey || 'server-managed'})
    setStorageReady(true)
    setInitialLoadDone(true)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ loadData().then(applyLoad) },[])

  // Restore navigation state once, after data first loads.
  // Runs after every render but navRestoredRef guards it to execute only once.
  useEffect(()=>{
    if (!initialLoadDone || !data || navRestoredRef.current) return
    navRestoredRef.current = true
    try {
      const saved = JSON.parse(localStorage.getItem('ledgr-nav') || 'null')
      if (!saved) return
      if (saved.page === 'whitespace') {
        setShowWhitespace(true); setIsLandingPage(false)
      } else if (saved.page === 'allprojects') {
        setShowAllProjects(true); setIsLandingPage(false)
      } else if (saved.page === 'vendors') {
        setShowVendors(true); setIsLandingPage(false)
      } else if (saved.page === 'account' && saved.activeId) {
        const exists = data.accounts.find(a => a.id === saved.activeId)
        if (exists) {
          setActiveId(saved.activeId)
          setTab(saved.tab || 'overview')
          setIsLandingPage(false)
        }
        // account no longer exists → fall through to landing (default state)
      }
      // saved.page === 'landing' → keep default state (isLandingPage=true)
    } catch(e) { console.warn('[NavRestore]', e) }
  }, [initialLoadDone, data])

  // Persist navigation state to localStorage whenever it changes.
  // Skip before initial load so we don't overwrite a saved state with default values.
  useEffect(()=>{
    if (!initialLoadDone) return
    const page = showWhitespace ? 'whitespace'
      : showAllProjects ? 'allprojects'
      : showVendors ? 'vendors'
      : !isLandingPage ? 'account'
      : 'landing'
    try { localStorage.setItem('ledgr-nav', JSON.stringify({ page, activeId, tab })) } catch(e) {}
  }, [showWhitespace, showAllProjects, showVendors, isLandingPage, activeId, tab, initialLoadDone])

  const safeLoadData = async () => {
    // Skip focus reload if a save is queued but not yet committed — reloading now would discard
    // the pending local changes before they reach Supabase (2-second auto-save debounce window).
    if (pendingChanges.current) { console.log('Skipping reload — unsaved changes pending'); return }
    // Skip if we're in a conflict state — the user needs to consciously click "Reload Now".
    if (saveBlockedRef.current) { console.log('Skipping reload — save blocked (version conflict)'); return }
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
    // Do not attempt to save while blocked by a version conflict — saves would always fail
    // with the stale version. User must reload to get a fresh version before saving resumes.
    if (saveBlockedRef.current) return
    if (Date.now() - contactPhotoSaveTime < 5000) return
    if (Date.now() - (window._lastDirectSave || 0) < 8000) return
    console.log('Auto-save triggered')
    pendingChanges.current = true  // a save is queued; safeLoadData will skip focus reloads
    let iv
    const timer = setTimeout(()=>{
      setSaveStatus('saving')
      const saved = new Date()
      saveData(data, lastKnownVersion.current).then(({ error, conflict, nextVersion }) => {
        pendingChanges.current = false  // save attempt completed (success or failure)
        if (conflict) {
          setSaveStatus('idle')
          // Block all future auto-saves — lastKnownVersion is now stale.
          // The user must reload to get the server's current version before saving can resume.
          saveBlockedRef.current = true
          setConflictWarning(true)
          return
        }
        if(error){
          setSaveStatus('error')
          return
        }
        lastSaveTime.current = Date.now()  // guard future focus reloads from overwriting unsaved changes
        if (nextVersion != null) lastKnownVersion.current = nextVersion
        try { saveBroadcast.current?.postMessage({ type: 'saved', version: nextVersion }) } catch {}
        setSaveStatus('saved')
        setLastSavedLabel('just now')
        iv = setInterval(()=>{
          const mins=Math.floor((new Date()-saved)/60000)
          if(mins<1)setLastSavedLabel('just now')
          else if(mins===1)setLastSavedLabel('1 min ago')
          else setLastSavedLabel(`${mins} mins ago`)
        },30000)
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

  useEffect(() => {
    let channel
    try {
      channel = new BroadcastChannel('ledgr-saves')
      saveBroadcast.current = channel
      channel.onmessage = e => {
        if (e.data?.type === 'saved') setRemoteUpdateWarning(true)
      }
    } catch {}
    return () => {
      try { channel?.close() } catch {}
      saveBroadcast.current = null
    }
  }, [])

  const generateDailyBrief = async () => {
    if (briefGenerating || !data) return
    return withLock('daily-brief', _doGenerateDailyBrief)
  }

  const _doGenerateDailyBrief = async () => {
    setBriefGenerating(true)
    setBriefError(null)
    try {
      const todayDate = new Date()
      const today = todayDate.toISOString().split('T')[0]
      // ── Date thresholds ────────────────────────────────────────────────────────
      const fiveDaysAgo = new Date(todayDate); fiveDaysAgo.setDate(fiveDaysAgo.getDate()-5)
      const fiveDaysAgoStr = fiveDaysAgo.toISOString().split('T')[0]
      const sevenDaysAgo = new Date(todayDate); sevenDaysAgo.setDate(sevenDaysAgo.getDate()-7)
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

      // ── Annotate each account with intelligence-first signals ───────────────
      const annotatedAccounts = (data.accounts || []).map(acct => {
        const intelSorted = (acct.intelLog || []).sort((a,b) => new Date(b.date)-new Date(a.date))
        const recentIntel = intelSorted.filter(e => (e.date||'') >= fiveDaysAgoStr)
        const daysSinceContact = acct.lastContact ? Math.floor((Date.now()-new Date(acct.lastContact))/86400000) : 999
        const activeProjects = (acct.projects||[]).filter(p => ['In Flight','In Discussion','Not Started','Stalled'].includes(p.status))
        const openFollowUps = (acct.followUps||[]).filter(f => f.status==='Open')
        const renewals = (acct.techStack||[]).filter(t => {
          if (!t.renewalDate) return false
          const d = Math.floor((new Date(t.renewalDate+'T12:00:00')-todayDate)/86400000)
          return d >= 0 && d <= 90
        }).map(t => ({ vendor:t.vendor, daysUntil:Math.floor((new Date(t.renewalDate+'T12:00:00')-todayDate)/86400000), renewalDate:t.renewalDate, annualCost:t.annualCost||'' }))
        const evaluating = (acct.techStack||[]).filter(t => t.status==='Evaluating').map(t => t.vendor)
        const contacts = (acct.contacts||[]).slice(0,5).map(c => `${c.name}${c.title?` (${c.title})`:''}${c.relationship?` [${c.relationship}]`:''}`)
        return { acct, recentIntel, daysSinceContact, activeProjects, openFollowUps, renewals, evaluating, contacts }
      })

      // ── Build intelligence-first context as readable text (not JSON) ────────
      const ctxParts = []

      // PRIMARY: accounts with recent intel (last 5 days)
      const withIntel = annotatedAccounts.filter(a => a.recentIntel.length > 0)
      if (withIntel.length) {
        ctxParts.push('=== RECENT INTEL LOGS (Last 5 Days) — Primary Signal ===')
        for (const { acct, recentIntel, activeProjects, openFollowUps, renewals, evaluating, contacts } of withIntel) {
          ctxParts.push(`\n[${acct.name}]${acct.industry?' — '+acct.industry:''}`)
          if (contacts.length) ctxParts.push(`  Contacts: ${contacts.join(', ')}`)
          if (evaluating.length) ctxParts.push(`  Evaluating: ${evaluating.join(', ')}`)
          for (const e of recentIntel.slice(0,3)) {
            ctxParts.push(`  ${e.date} | ${e.type||'Note'} | ${e.participants||''}`)
            if (e.summary) ctxParts.push(`    Summary: ${String(e.summary).slice(0,350)}`)
            if (e.insights?.length) ctxParts.push(`    Insights: ${e.insights.slice(0,3).join(' | ')}`)
            if (e.opportunities?.length) ctxParts.push(`    Opportunities: ${e.opportunities.slice(0,2).join(' | ')}`)
            if (e.risks?.length) ctxParts.push(`    Risks: ${e.risks.slice(0,2).join(' | ')}`)
          }
          if (activeProjects.length) ctxParts.push(`  Active Projects: ${activeProjects.slice(0,3).map(p=>`${p.name} [${p.status}${p.vendor?'/'+p.vendor:''}]${p.waitingOn?', waiting: '+p.waitingOn:''}${p.estimatedCloseDate?', close: '+p.estimatedCloseDate:''}`).join('; ')}`)
          if (renewals.length) ctxParts.push(`  Renewals: ${renewals.map(r=>`${r.vendor} in ${r.daysUntil}d`).join(', ')}`)
          const highPri = openFollowUps.filter(f=>f.priority==='Critical'||f.priority==='High').slice(0,3)
          if (highPri.length) ctxParts.push(`  High-Priority Actions: ${highPri.map(f=>f.task).join(' | ')}`)
        }
      }

      // SUPPORTING: active projects but no recent intel
      const withProjectsOnly = annotatedAccounts.filter(a => a.recentIntel.length===0 && a.activeProjects.length>0)
      if (withProjectsOnly.length) {
        ctxParts.push('\n=== ACTIVE PROJECTS — No Recent Intel (Supporting Context) ===')
        for (const { acct, activeProjects, daysSinceContact, renewals } of withProjectsOnly) {
          const proj = activeProjects.slice(0,2).map(p=>`${p.name} [${p.status}${p.vendor?'/'+p.vendor:''}]`).join(', ')
          ctxParts.push(`${acct.name}: ${proj} | ${daysSinceContact<999?daysSinceContact+'d since contact':'contact date unknown'}${renewals.length?` | Renewal: ${renewals[0].vendor} in ${renewals[0].daysUntil}d`:''}`)
        }
      }

      // Renewals with no other recent activity
      const renewalOnly = annotatedAccounts.filter(a => a.recentIntel.length===0 && a.activeProjects.length===0 && a.renewals.length>0)
      if (renewalOnly.length) {
        ctxParts.push('\n=== RENEWALS — No Recent Activity ===')
        renewalOnly.flatMap(a=>a.renewals.map(r=>`${a.acct.name}: ${r.vendor} in ${r.daysUntil}d (${r.renewalDate})${r.annualCost?' | '+r.annualCost:''}`)).forEach(l=>ctxParts.push(l))
      }

      // Accounts with no recent contact worth flagging
      const inactive = annotatedAccounts
        .filter(a => a.recentIntel.length===0 && a.daysSinceContact>14 && a.daysSinceContact<999)
        .sort((a,b)=>a.daysSinceContact-b.daysSinceContact)
      if (inactive.length) {
        ctxParts.push('\n=== NO RECENT CONTACT (14+ Days) — Surface in "Things You May Be Missing" ===')
        ctxParts.push(inactive.slice(0,8).map(a=>`${a.acct.name}: ${a.daysSinceContact}d${a.activeProjects.length?` [${a.activeProjects.length} active project(s)]`:''}`).join(' | '))
      }

      // Prospects in active conversation
      const prospects = (data.whitespaceAccounts||[]).filter(a=>a.status==='Active Conversation'||a.status==='Reached Out').slice(0,5)
      if (prospects.length) {
        ctxParts.push(`\n=== PROSPECTS IN ACTIVE CONVERSATION ===`)
        ctxParts.push(prospects.map(a=>`${a.name} (${a.status}${a.industry?', '+a.industry:''})`).join(', '))
      }

      // Market intelligence and GPS briefs (last 7 days)
      const recentPulses = (data.marketPulses||[]).filter(p=>p.publishedDate&&p.publishedDate>=sevenDaysAgoStr).slice(0,8)
      const kbItems = (data.knowledgeBase||[]).filter(p=>p.createdAt&&p.createdAt>=sevenDaysAgo.toISOString()).slice(0,4)
      if (recentPulses.length||kbItems.length) {
        ctxParts.push('\n=== MARKET INTELLIGENCE / GPS BRIEFS (Last 7 Days) ===')
        ;[...recentPulses,...kbItems].forEach(p=>{
          const s=p.aiSummary||p.excerpt||''
          ctxParts.push(`- [${p.publishedDate||p.createdAt?.split('T')[0]||'recent'}] ${p.title}${s?': '+s.slice(0,150):''}`)
        })
      }

      const accountContextText = ctxParts.join('\n')

      // Yesterday's journal for continuity
      const yesterday = new Date(todayDate); yesterday.setDate(yesterday.getDate()-1)
      const yesterdayStr = yesterday.toISOString().split('T')[0]
      const yesterdayJournal = (data.dailyJournals||[]).find(j=>j.date===yesterdayStr)
      const journalContext = yesterdayJournal
        ? `\n=== YESTERDAY'S JOURNAL (${yesterdayStr}) ===\nSummary: ${yesterdayJournal.aiSummary||'none'}\nDebrief: ${(yesterdayJournal.debriefText||'none').slice(0,400)}\n`
        : ''

      const systemPrompt = `You are Ledgr — a trusted Chief of Staff and strategic advisor to Mike Chiricosta, Enterprise Client Manager at GuidePoint Security covering New England enterprise accounts. GuidePoint is a leading cybersecurity VAR and managed services firm.

Your role is not to produce an action list. Your role is to brief Mike every morning so that within 90 seconds he knows:
- What changed in the last 5 days
- Where momentum is building and where it is slipping
- What deserves his strategic attention today
- What he may be overlooking
- How to approach the day

You think like an experienced cybersecurity enterprise sales leader who has managed a large territory for over a decade. You synthesize, prioritize, and coach. You never dump data.

ACCOUNT PRIORITIZATION:
- Accounts appear in the brief because they have fresh intelligence — not because they have overdue tasks
- Evaluate momentum for each active account: Building / Stable / Losing — derived from intel logs, meetings, project movement, customer engagement
- If an account has had no meaningful contact in 14+ days, surface it briefly in "Things You May Be Missing"
- Never list every account. Synthesize. Prioritize. Explain why.

DATA PRIORITY:
1. Intel logs from last 5 days — this is the primary signal. If an account has no recent intel, it has low priority.
2. Active projects, meetings, buying signals, stakeholder changes, vendor evaluations
3. Open actions and follow-ups are supporting context only — do not lead with them
4. Historical context only where it explains why something matters today

VOICE:
- Address Mike directly: "You have built strong momentum with...", "You may be overlooking...", "You promised James..."
- Sound like a trusted advisor who knows this territory intimately, not like software generating a report
- Never produce fluff. Every sentence earns its place.
- Tone: confident, direct, substantive, coaching

OUTPUT: Write in clean markdown. Use # for section headers. Target 400–600 words. Reading time: 90 seconds.`

      const userPrompt = `Today is ${todayDate.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'America/New_York'})}.

${accountContextText}
${journalContext}
Write Mike's Daily Brief using exactly this structure. Do not add extra sections or omit any.

# Executive Brief
3–5 sentences. The state of Mike's territory today. What matters most and why right now.

---

# What Changed
Only meaningful developments from the last 5 days, organized by account. For each: what happened, why it matters, and what it implies for Mike. Only include accounts where something genuinely changed.

---

# Momentum Report
Only accounts with meaningful momentum worth commenting on. For each: state momentum as Building / Stable / Losing, explain what is driving that, and tell Mike what to do about it.

---

# Things You May Be Missing
Think critically. Surface overlooked accounts, fading conversations, cross-account patterns, or strategic risks Mike may not be seeing day-to-day. Call out accounts that have gone quiet for 14+ days. Do NOT invent facts.

---

# Market Intelligence
Only include if GPS briefs or market intel from the context directly connects to a recent customer conversation or active deal. If the connection is weak, omit this section entirely.

---

# Coaching Notes
Advice from an experienced enterprise sales leader. Where to lean in. Where to slow down. Where to challenge assumptions. Where relationships need attention. Where new opportunity may exist.

---

# Today's Five Biggest Moves
The five highest-impact things Mike should accomplish today, numbered 1–5, in priority order. Grounded in today's intelligence — not simply the most overdue tasks.`

      const _briefInputChars = systemPrompt.length + userPrompt.length
      const _briefStart = Date.now()
      const { data: responseData } = await callClaudeWithRetry({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      }, null, null)

      trackAI({ feature: FEATURES.DAILY_BRIEF, operation: 'generate-brief', model: 'claude-sonnet-4-6', inputChars: _briefInputChars, maxTokensOut: 3000, durationMs: Date.now() - _briefStart, success: !responseData?.error })

      if (responseData?.error) {
        throw new Error(responseData.error.message || responseData.error.type || 'API error')
      }

      const rawText = responseData?.content?.[0]?.text || ''
      if (!rawText) throw new Error('No content returned from AI')

      const briefSummary = rawText.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('-'))?.trim().slice(0, 200) || ''
      const newBrief = {
        date: today,
        generatedAt: new Date().toISOString(),
        markdownContent: rawText,
        briefSummary,
      }
      setData(prev => {
        const existingBriefs = (prev.dailyBriefs || []).filter(b => b.date !== today)
        return { ...prev, dailyBriefs: [newBrief, ...existingBriefs].slice(0, 30) }
      })
    } catch(err) {
      if (import.meta.env.DEV) console.error('[DailyBrief] Generation error:', err.message)
      setBriefError(friendlyApiError(err))
    } finally {
      setBriefGenerating(false)
    }
  }

  // Auto-generate brief after 7:45am EST if not already generated today
  useEffect(()=>{
    const checkAndGenerateBrief = async () => {
      if (!data || briefGenerating) return
      const today = new Date().toISOString().split('T')[0]
      const now = new Date()
      const estTime = new Date(now.toLocaleString('en-US',{timeZone:'America/New_York'}))
      const estHour = estTime.getHours()
      const estMinutes = estTime.getMinutes()
      const isAfter745am = estHour > 7 || (estHour === 7 && estMinutes >= 45)
      const todayBriefExists = (data.dailyBriefs||[]).some(b=>b.date===today)
      if (isAfter745am && !todayBriefExists && data.aiSettings?.allowAutoDailyBrief === true) { generateDailyBrief() }
    }
    if (initialLoadDone) checkAndGenerateBrief()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[initialLoadDone])

  if (!data) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:S.bg,color:S.muted,fontSize:14}}>Loading...</div>

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
      {conflictWarning&&(
        <div style={{position:'fixed',top:0,left:0,right:0,zIndex:9999,background:'#7c3aed',color:'#fff',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,fontSize:13,fontWeight:500,boxShadow:'0 2px 8px rgba(0,0,0,0.2)'}}>
          <span>&#9888; This data was changed in another tab or device. Reload before saving to avoid overwriting newer changes.</span>
          <div style={{display:'flex',gap:8,flexShrink:0}}>
            <button onClick={()=>{setConflictWarning(false);handleRefresh()}} style={{background:'rgba(255,255,255,0.2)',border:'1px solid rgba(255,255,255,0.4)',borderRadius:6,color:'#fff',fontSize:12,fontWeight:700,padding:'4px 12px',cursor:'pointer'}}>Reload Now</button>
            <button onClick={()=>setConflictWarning(false)} style={{background:'transparent',border:'1px solid rgba(255,255,255,0.3)',borderRadius:6,color:'#fff',fontSize:12,padding:'4px 10px',cursor:'pointer'}}>Dismiss</button>
          </div>
        </div>
      )}
      {remoteUpdateWarning&&!conflictWarning&&(
        <div style={{position:'fixed',top:0,left:0,right:0,zIndex:9998,background:'#0066CC',color:'#fff',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,fontSize:13,fontWeight:500,boxShadow:'0 2px 8px rgba(0,0,0,0.2)'}}>
          <span>&#8505; Another tab saved newer data. Reload to get the latest changes.</span>
          <div style={{display:'flex',gap:8,flexShrink:0}}>
            <button onClick={()=>{setRemoteUpdateWarning(false);handleRefresh()}} style={{background:'rgba(255,255,255,0.2)',border:'1px solid rgba(255,255,255,0.4)',borderRadius:6,color:'#fff',fontSize:12,fontWeight:700,padding:'4px 12px',cursor:'pointer'}}>Reload Now</button>
            <button onClick={()=>setRemoteUpdateWarning(false)} style={{background:'transparent',border:'1px solid rgba(255,255,255,0.3)',borderRadius:6,color:'#fff',fontSize:12,padding:'4px 10px',cursor:'pointer'}}>Dismiss</button>
          </div>
        </div>
      )}
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
