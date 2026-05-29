
import { useState, useEffect, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { loadData, saveData } from './supabase.js'

const SK = 'gp-crm-v4'
const DARK_THEME = { bg:'#0a0e1a', surf:'#111827', surf2:'#0f1729', bdr:'#1e2d40', bdr2:'#2d3d50', txt:'#e2e8f0', muted:'#64748b', dim:'#334155', blue:'#3b82f6', green:'#22c55e', red:'#ef4444', orange:'#f97316', yellow:'#eab308', purple:'#a855f7', secondary:'#94a3b8', sidebarBg:'#060a12', headerBg:'#0c1017' }
const LIGHT_THEME = { bg:'#f1f5f9', surf:'#ffffff', surf2:'#f8fafc', bdr:'#e2e8f0', bdr2:'#cbd5e1', txt:'#0f172a', muted:'#64748b', dim:'#94a3b8', blue:'#3b82f6', green:'#22c55e', red:'#ef4444', orange:'#f97316', yellow:'#ca8a04', purple:'#a855f7', secondary:'#475569', sidebarBg:'#e2e8f0', headerBg:'#f1f5f9' }
let S = DARK_THEME
const PC = { Critical:{c:'#ef4444',b:'rgba(239,68,68,0.12)'}, High:{c:'#f97316',b:'rgba(249,115,22,0.12)'}, Medium:{c:'#eab308',b:'rgba(234,179,8,0.12)'}, Low:{c:'#22c55e',b:'rgba(34,197,94,0.12)'} }
const IC = { 'Executive Sponsor':{c:'#a855f7',b:'rgba(168,85,247,0.12)'}, 'Technical Gatekeeper':{c:'#3b82f6',b:'rgba(59,130,246,0.12)'}, 'Financial Gatekeeper':{c:'#eab308',b:'rgba(234,179,8,0.12)'}, 'Final Approval':{c:'#ef4444',b:'rgba(239,68,68,0.12)'}, 'Stakeholder':{c:'#64748b',b:'rgba(100,116,139,0.12)'}, 'Risk Factor':{c:'#f97316',b:'rgba(249,115,22,0.12)'}, 'Ally':{c:'#22c55e',b:'rgba(34,197,94,0.12)'} }
const SC = { Current:'#22c55e', Selected:'#3b82f6', Evaluating:'#eab308', Replacing:'#ef4444', Watch:'#f97316', Dropping:'#ef4444' }
const PSC = { 'Not Started':'#64748b', 'In Discussion':'#3b82f6', 'In Flight':'#22c55e', Stalled:'#f97316', Won:'#a855f7', Lost:'#ef4444' }
const INTERACTION_COLORS = { Meeting:'#3b82f6', Call:'#22c55e', Email:'#eab308', Demo:'#a855f7', Note:'#64748b' }
const INTERACTION_TYPES = ['Meeting','Call','Email','Demo','Note']
const STAGES = ['Awareness','NDA','Intro Call','Demo','Scoping','Pricing','Legal','Procurement','PO Received','Deployed']
const INFLUENCES = ['Executive Sponsor','Technical Gatekeeper','Financial Gatekeeper','Final Approval','Stakeholder','Risk Factor','Ally']
const TECH_CATS = ['SIEM / SOC','Endpoint','Identity / IAM','Cloud Security','Network / SASE','Email Security','AppSec','Pen Test / Red Team','Threat Intel','GRC','IT Operations','Other']
const TECH_STATS = ['Current','Evaluating','Replacing','Watch','Dropping','Selected']
const PROJ_STATS = ['Not Started','In Discussion','In Flight','Stalled','Won','Lost']

const uid = () => Math.random().toString(36).slice(2,9)
const fmtDate = d => { if (!d) return ''; try { return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) } catch { return d } }
const daysUntil = d => { if (!d) return null; return Math.ceil((new Date(d+'T12:00:00') - new Date()) / 86400000) }
const daysSince = d => { if (!d) return null; return Math.floor((new Date() - new Date(d+'T12:00:00')) / 86400000) }
const initials = n => n.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()
const calcHealthScore = acct => { let s=50; const strong=(acct.contacts||[]).filter(c=>c.relStatus==='Strong').length; s+=Math.min(strong*8,20); const last=acct.lastContact?daysSince(acct.lastContact):60; if(last>30)s-=20;else if(last>14)s-=8; const crit=(acct.followUps||[]).filter(f=>f.status==='Open'&&f.priority==='Critical').length; s-=Math.min(crit*12,24); const flying=(acct.projects||[]).filter(p=>p.status==='In Flight').length; s+=Math.min(flying*6,15); const renewals=(acct.techStack||[]).filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=60}).length; s-=Math.min(renewals*8,15); return Math.max(1,Math.min(100,s)) }
const getQuickWin = acct => { const overdue=(acct.followUps||[]).filter(f=>f.status==='Open'&&f.dueDate&&daysUntil(f.dueDate)<0).sort((a,b)=>daysUntil(a.dueDate)-daysUntil(b.dueDate)); if(overdue.length>0){const fu=overdue[0];const days=Math.abs(daysUntil(fu.dueDate));return{title:fu.task,meta:`Overdue by ${days} day${days!==1?'s':''}`,cta:'Go to Follow-Ups',tab:'followups',color:S.red}} const renew=(acct.techStack||[]).filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=90}).sort((a,b)=>daysUntil(a.renewalDate)-daysUntil(b.renewalDate)); if(renew.length>0){const t=renew[0];const d=daysUntil(t.renewalDate);return{title:`${t.vendor} renewal in ${d} day${d!==1?'s':''}`,meta:fmtDate(t.renewalDate)+(t.notes?' — '+t.notes.slice(0,70):''),cta:'Go to Tech Stack',tab:'stack',color:S.orange}} const stalled=(acct.projects||[]).filter(p=>p.status==='Stalled'); if(stalled.length>0){const p=stalled[0];return{title:p.name,meta:`Stalled project${p.waitingOn?' — Waiting on: '+p.waitingOn:' — no next action defined'}`,cta:'Go to Projects',tab:'projects',color:S.yellow}} return null }
const globalSearch = (data, query) => { if(!query||!query.trim()||query.length<2)return []; const q=query.toLowerCase(); const results=[]; (data.accounts||[]).forEach(acct=>{const an=acct.short||acct.name; (acct.contacts||[]).filter(c=>`${c.name} ${c.title}`.toLowerCase().includes(q)).slice(0,3).forEach(c=>results.push({accountId:acct.id,accountName:an,category:'Contacts',label:c.name,sublabel:c.title,tab:'contacts'})); (acct.projects||[]).filter(p=>`${p.name} ${p.vendor||''}`.toLowerCase().includes(q)).slice(0,3).forEach(p=>results.push({accountId:acct.id,accountName:an,category:'Projects',label:p.name,sublabel:p.vendor,tab:'projects'})); (acct.techStack||[]).filter(t=>t.vendor.toLowerCase().includes(q)).slice(0,3).forEach(t=>results.push({accountId:acct.id,accountName:an,category:'Tech Stack',label:t.vendor,sublabel:t.products,tab:'stack'})); (acct.intelLog||[]).filter(e=>(e.summary||'').toLowerCase().includes(q)||(e.participants||'').toLowerCase().includes(q)).slice(0,2).forEach(e=>results.push({accountId:acct.id,accountName:an,category:'Intel',label:(e.summary||'').slice(0,55)+((e.summary||'').length>55?'…':''),sublabel:fmtDate(e.date),tab:'intel'})) }); return results }

const SAMPLE = {
  apiKey: '',
  accounts: [{
    id:'bhsi', name:'Berkshire Hathaway Specialty Insurance', short:'BHSI',
    industry:'Insurance / Financial Services', hq:'Boston, MA', status:'Strategic',
    cloud:'Azure-primary (Azure / AWS / GCP)', users:'~5,000 globally',
    relationship:'6+ years', lastContact:'2026-05-19',
    notes:'Glass-box philosophy — they want to own licenses not rent platforms. Anti-AI-hype. Cost-conscious. Rudy is the north star.',
    contacts:[
      {id:'c1',name:'Jamie Jervey',title:'CISO',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'Information Security',influence:'Executive Sponsor',sentiment:'positive',relStatus:'Strong',toolsOwn:'Overall security portfolio',goals:'Strategic security partner. Modern transparent SOC.',pains:'Too many vendor voices. No clean decision framework. Overloaded.',notes:'Ultimate decision authority. Values trusted partners. Target for ORBIE Award Boston.',personalNotes:'Loves executive networking and camera presence. High-value intimate experiences over golf outings.',lastInteracted:'2026-03-13'},
      {id:'c2',name:'Rudy Montoya',title:'AVP, Information Security',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'Information Security',influence:'Technical Gatekeeper',sentiment:'positive',relStatus:'Strong',toolsOwn:'Entire security stack — runs day-to-day InfoSec',goals:'Defensible transparent architecture. No fake procurement.',pains:'10X delivery issues. QRadar migration complexity. Team asking approval on everything.',notes:'PRIMARY RELATIONSHIP. Candid, long memory, hates buzzwords and black-box. If Rudy respects you the account opens.',personalNotes:'Avid photographer (Leica D-Lux 7, black and white). 3D printing (Bamboo printer). Firearms enthusiast. Recently traveled to Italy.',lastInteracted:'2026-05-19'},
      {id:'c3',name:'Marc Wood',title:'CIO',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'IT',influence:'Financial Gatekeeper',sentiment:'neutral',relStatus:'Needs Attention',toolsOwn:'IT strategy and all technology investments',goals:'Data-driven governance. Strict ROI.',pains:'Vendors who cannot justify spend clearly.',notes:'Hardball negotiator. Does not do favors for vendors. Build through Rudy and Jamie — do not approach directly.',personalNotes:'',lastInteracted:''},
      {id:'c4',name:'Dave Bresnahan',title:'COO',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'Executive',influence:'Final Approval',sentiment:'neutral',relStatus:'Needs Attention',toolsOwn:'Strategic veto on major vendor decisions',goals:'Operational risk management. Clean decision process.',pains:'Availability due to international travel.',notes:'Final sign-off and approval bottleneck. Frame all material as risk decision not feature comparison.',personalNotes:'',lastInteracted:''},
      {id:'c5',name:'Jamie Dennis',title:'QA / Compliance',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'IT Compliance',influence:'Stakeholder',sentiment:'neutral',relStatus:'Building',toolsOwn:'Compliance processes and infrastructure alignment',goals:'Clean infrastructure deployments.',pains:'Not kept in loop by vendors and internal teams.',notes:'Critical for infrastructure buy-in. Pinged Mike 5/19 on Saviynt contract. Without his alignment deployments stall.',personalNotes:'',lastInteracted:'2026-05-19'},
      {id:'c6',name:'Bill Randall',title:'Future BHSI SOC Director',email:'',cell:'',linkedin:'',location:'Rhode Island (military deployment)',dept:'GuidePoint to BHSI',influence:'Ally',sentiment:'positive',relStatus:'Strong',toolsOwn:'FIDO2 analysis and secure browser evaluation',goals:'Join BHSI as SOC Director. Build modern SOC.',pains:'Currently on military deployment — transition in progress.',notes:'Deeply trusted by Rudy. Expected to join BHSI as SOC Director May 2026. FIDO2 and browser work must be documented before GuidePoint departure.',personalNotes:'Military deployment Guam/Rhode Island.',lastInteracted:''},
      {id:'c7',name:'Jake (SOC)',title:'SOC Engineer',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'Information Security',influence:'Risk Factor',sentiment:'negative',relStatus:'Needs Attention',toolsOwn:'Internal SOC engineering — moved team to 1Password unilaterally',goals:'Modern SOC tooling his way.',pains:'Feels ignored by security leadership.',notes:'Favors ReliaQuest and 10X internally. Slowed CyberArk WPM eval. Do NOT rely as champion. Rudy is frustrated with him.',personalNotes:'',lastInteracted:''}
    ],
    techStack:[
      {id:'t1',vendor:'QRadar / QROC',products:'Co-managed SIEM',category:'SIEM / SOC',status:'Replacing',renewalDate:'2026-04-01',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Rudy Montoya',notes:'EOL April 2026. WinCollect agents crashing on Exchange and GIS servers. 15-20TB log migration to AWS S3 needed.'},
      {id:'t2',vendor:'Google SecOps',products:'SIEM / Chronicle',category:'SIEM / SOC',status:'Selected',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Rudy Montoya',notes:'Target SIEM deployed with 10X. Rudy frustrated — cannot get incident list by priority. Caching issues persist.'},
      {id:'t3',vendor:'Saviynt',products:'IGA',category:'Identity / IAM',status:'Replacing',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Jamie Dennis',notes:'Only 3 of 10 target systems completed. Team hates it. Target replacement: SailPoint. Jamie Dennis pinged Mike on contract 5/19.'},
      {id:'t4',vendor:'Microsoft E5 Suite',products:'Entra ID, Defender EDR, Sentinel, Purview, PIM',category:'Identity / IAM',status:'Current',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Marc Wood',notes:'Core identity and endpoint platform. PIM is NOT full PAM. Rudy pushing back on Microsoft narrative. Sentinel adoption stalled.'},
      {id:'t5',vendor:'Cloudflare',products:'SASE, ZTNA, Gateway, VPN replacement',category:'Network / SASE',status:'Watch',renewalDate:'2026-12-01',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Alec Schmid',notes:'Final contract year 2026. Log noise severe — 20k unknown tunnel events per 5 minutes. Zscaler pivot opportunity as renewal approaches.'},
      {id:'t6',vendor:'Abnormal Security',products:'Email Protection',category:'Email Security',status:'Current',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Rudy Montoya',notes:'Rudy satisfied. Unlikely to replace. SIEM log integration desired.'},
      {id:'t7',vendor:'NetSpy',products:'PTaaS — Pen Testing as a Service',category:'Pen Test / Red Team',status:'Evaluating',renewalDate:'',cost:'',vendorRep:'Richard Booth',vendorRepEmail:'',clientOwner:'Rudy Montoya',notes:'Scoping call done. Demo this week. Good references from Geico and Metro. Manual testing with live chat and fast results. GuidePoint should capture the paper.'},
      {id:'t8',vendor:'Wiz',products:'CSPM / Cloud Security Posture',category:'Cloud Security',status:'Evaluating',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'Rudy Montoya',notes:'Post-Qualys CSPM gap since May 2025. Integrates well with Google SecOps. Favorable Google pricing. Internal DAST vs CSPM confusion needs resolving first.'}
    ],
    projects:[
      {id:'p1',name:'MDR / SecOps Stabilization',category:'MDR',vendor:'GuidePoint / 10X',status:'In Flight',description:'10X delivery issues creating GuidePoint MDR opening. Chris and Andy moved to Optiv Services LLC — status uncertain.',goals:'Stable transparent 24/7 MDR. Own Google SecOps and Cribl licenses.',pains:'10X SLA failures. Chad friction. Google SecOps missing basic priority reporting.',primaryContact:'Jamie Jervey',budget:true,closeDate:'2026-08-01',notes:'Position GuidePoint as continuity and stability play. Glass-box model is the differentiator.',timeline:STAGES.map((s,i)=>({stage:s,status:i<4?'completed':i===4?'current':'pending',date:i===0?'2026-01-01':i===1?'2026-02-01':i===2?'2026-03-13':i===3?'2026-03-27':'' }))},
      {id:'p2',name:'NetSpy PTaaS',category:'Pen Test / Red Team',vendor:'NetSpy',status:'In Discussion',description:'Cost-effective pen testing alternative to Mandiant. GuidePoint facilitating and capturing the paper.',goals:'Annual PTaaS with fast results and real manual testing.',pains:'Mandiant too expensive. Need off-year pen test solution.',primaryContact:'Rudy Montoya',budget:true,closeDate:'2026-06-30',notes:'Richard Booth is vendor rep. Wants to go direct — push through GuidePoint to control pricing and negotiation.',timeline:STAGES.map((s,i)=>({stage:s,status:i<3?'completed':i===3?'current':'pending',date:i===0?'2026-05-01':i===1?'2026-05-10':i===2?'2026-05-15':'' }))},
      {id:'p3',name:'Horizon 3 ASM',category:'ASM',vendor:'Horizon 3',status:'In Discussion',description:'Attack surface management. Jamie has budget allocated. Preferred over Pentera after poor Pentera engagement.',goals:'Continuous ASM separate from PTaaS — separation of duties.',pains:'No continuous attack-path tracking since Qualys terminated May 2025.',primaryContact:'Jamie Jervey',budget:true,closeDate:'2026-09-01',notes:'Confirm scope with Bill. NetSpy for PTaaS, Horizon 3 for ASM.',timeline:STAGES.map((s,i)=>({stage:s,status:i===0?'completed':i===1?'current':'pending',date:i===0?'2026-04-01':'' }))},
      {id:'p4',name:'Saviynt to SailPoint IGA',category:'IGA',vendor:'SailPoint',status:'Not Started',description:'Replace failing Saviynt IGA with SailPoint. Jamie Dennis reached out on Saviynt contract 5/19.',goals:'Functioning IGA covering all 10 target systems not just 3.',pains:'Saviynt only completed 3 of 10 systems. Entire team hates the platform.',primaryContact:'Jamie Dennis',budget:false,closeDate:'',notes:'Get Saviynt contract renewal date. Jamie Dennis must be aligned for deployment to succeed.',timeline:STAGES.map((s,i)=>({stage:s,status:i===0?'current':'pending',date:'' }))},
      {id:'p5',name:'Wiz CSPM',category:'CSPM',vendor:'Wiz',status:'In Discussion',description:'Fill post-Qualys cloud security gap across Azure, AWS, and GCP.',goals:'Real CSPM replacing Datadog stopgap.',pains:'No continuous exploitability tracking since Qualys killed May 2025.',primaryContact:'Rudy Montoya',budget:false,closeDate:'2026-10-01',notes:'Resolve internal DAST vs CSPM confusion first. Cloud Security Workshop is the entry point.',timeline:STAGES.map((s,i)=>({stage:s,status:i<4?'completed':i===4?'current':'pending',date:i===0?'2026-03-01':i===1?'2026-04-01':i===2?'2026-04-15':i===3?'2026-05-01':'' }))}
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
    relSuggestions:[]
  }]
}

const Badge = ({label,color,bg,size=11}) => <span style={{fontSize:size,fontWeight:600,color,background:bg,padding:'2px 8px',borderRadius:999,whiteSpace:'nowrap',display:'inline-block',lineHeight:'18px'}}>{label}</span>
const Btn = ({children,onClick,variant='ghost',disabled=false,style={}}) => {
  const v = {ghost:{background:'transparent',color:S.muted,border:`1px solid ${S.bdr}`},primary:{background:S.blue,color:'#fff',border:'none'},danger:{background:'rgba(239,68,68,0.1)',color:S.red,border:'1px solid rgba(239,68,68,0.3)'}}
  return <button onClick={onClick} disabled={disabled} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 12px',borderRadius:6,fontSize:13,fontWeight:500,cursor:disabled?'default':'pointer',opacity:disabled?0.5:1,...v[variant],...style}}>{children}</button>
}
const Field = ({label,value,onChange,type='text',options=null,multiline=false,style={}}) => (
  <div style={{marginBottom:12,...style}}>
    {label&&<div style={{fontSize:11,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{label}</div>}
    {options?<select value={value||''} onChange={e=>onChange(e.target.value)}><option value=''>Select...</option>{options.map(o=><option key={o} value={o}>{o}</option>)}</select>:multiline?<textarea value={value||''} onChange={e=>onChange(e.target.value)} rows={3}/>:<input type={type} value={value||''} onChange={e=>onChange(e.target.value)}/>}
  </div>
)
const Modal = ({title,onClose,children,width=520}) => {
  const mob = typeof window!=='undefined'&&window.innerWidth<768
  return (
  <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:mob?'flex-end':'center',justifyContent:'center',zIndex:1000,padding:mob?0:16}}>
    <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:mob?'12px 12px 0 0':12,width:'100%',maxWidth:mob?'100%':width,maxHeight:mob?'92vh':'90vh',overflow:'auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:`1px solid ${S.bdr}`}}>
        <div style={{fontSize:15,fontWeight:700,color:S.txt}}>{title}</div>
        <button onClick={onClose} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1}}>x</button>
      </div>
      <div style={{padding:20}}>{children}</div>
    </div>
  </div>
  )
}
const SH = ({children,mt=0}) => <div style={{fontSize:10,fontWeight:700,color:S.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8,marginTop:mt}}>{children}</div>
const Card = ({children,style={}}) => <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,...style}}>{children}</div>

function Overview({acct,setAcct,setTab}) {
  const openFU = acct.followUps.filter(f=>f.status==='Open')
  const alerts = []
  acct.techStack.forEach(t=>{
    const d = daysUntil(t.renewalDate)
    if (d!==null&&d>0&&d<=150) alerts.push({text:`${t.vendor} renewal in ${d} days — ${fmtDate(t.renewalDate)}`,level:d<=60?'critical':'high'})
    if (t.status==='Replacing') alerts.push({text:`${t.vendor} marked Replacing — ensure migration project is tracked`,level:'high'})
  })
  openFU.forEach(f=>{ if (f.dueDate&&daysUntil(f.dueDate)<0) alerts.push({text:`Overdue: ${f.task}`,level:'critical'}) })
  const needsAttn = acct.contacts.filter(c=>c.relStatus==='Needs Attention').length
  if (needsAttn>0) alerts.push({text:`${needsAttn} contact${needsAttn>1?'s':''} need relationship attention`,level:'medium'})
  const inFlight = acct.projects.filter(p=>p.status==='In Flight').length
  const lastC = acct.lastContact ? Math.abs(daysUntil(acct.lastContact)||0) : '?'
  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:16}}>
        {[{label:'Open Follow-Ups',val:openFU.length,c:openFU.length>3?S.orange:S.txt},{label:'Active Projects',val:inFlight,c:S.txt},{label:'Contacts Mapped',val:acct.contacts.length,c:S.txt},{label:'Days Since Contact',val:lastC,c:typeof lastC==='number'&&lastC>14?S.orange:S.green}].map(m=>(
          <Card key={m.label} style={{padding:'14px 16px'}}>
            <div style={{fontSize:10,color:S.muted,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.06em'}}>{m.label}</div>
            <div style={{fontSize:24,fontWeight:700,color:m.c}}>{m.val}</div>
          </Card>
        ))}
      </div>
      {alerts.length>0&&<><SH>Alerts</SH><div style={{marginBottom:16}}>{alerts.slice(0,6).map((a,i)=>{const c={critical:S.red,high:S.orange,medium:S.yellow}[a.level]||S.muted;return(<div key={i} style={{display:'flex',gap:10,padding:'8px 12px',background:S.surf,border:`1px solid ${S.bdr}`,borderLeft:`3px solid ${c}`,borderRadius:7,marginBottom:5}}><span style={{color:c,flexShrink:0}}>!</span><span style={{fontSize:13,color:S.secondary}}>{a.text}</span></div>)})}</div></>}
      <SH>Account Profile</SH>
      <Card style={{padding:'14px 16px',marginBottom:16}}>
        {[['Industry',acct.industry],['HQ',acct.hq],['Cloud',acct.cloud],['Users',acct.users],['Relationship',acct.relationship],['Last Contact',fmtDate(acct.lastContact)]].map(([k,v])=>(
          <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:`1px solid ${S.bdr}`,fontSize:13}}>
            <span style={{color:S.muted}}>{k}</span><span style={{color:S.txt}}>{v||'—'}</span>
          </div>
        ))}
      </Card>
      <SH>Priority Follow-Ups</SH>
      {openFU.sort((a,b)=>['Critical','High','Medium','Low'].indexOf(a.priority)-['Critical','High','Medium','Low'].indexOf(b.priority)).slice(0,5).map(f=>{
        const p=PC[f.priority]||PC.Low
        return <div key={f.id} style={{display:'flex',gap:8,padding:'9px 12px',background:S.surf,border:`1px solid ${S.bdr}`,borderLeft:`3px solid ${p.c}`,borderRadius:7,marginBottom:5}}><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:S.txt,marginBottom:2}}>{f.task}</div><div style={{fontSize:11,color:S.muted}}>{f.contact&&f.contact+' · '}{fmtDate(f.dueDate)||'No date set'}</div></div><Badge label={f.priority} color={p.c} bg={p.b}/></div>
      })}
      {(()=>{const qw=getQuickWin(acct);return qw?(<div style={{marginTop:16}}><SH>Quick Win</SH><div style={{padding:'14px 16px',background:S.surf2,border:`1px solid ${qw.color}44`,borderLeft:`4px solid ${qw.color}`,borderRadius:8}}><div style={{fontSize:13,fontWeight:700,color:S.txt,marginBottom:4}}>{qw.title}</div><div style={{fontSize:12,color:S.muted,marginBottom:10,lineHeight:1.5}}>{qw.meta}</div>{setTab&&<Btn onClick={()=>setTab(qw.tab)} style={{fontSize:12,padding:'5px 12px',background:qw.color,color:'#fff',border:'none'}}>{qw.cta} →</Btn>}</div></div>):null})()}
    </div>
  )
}

function Contacts({acct,setAcct}) {
  const [exp,setExp] = useState(null)
  const [showAdd,setShowAdd] = useState(false)
  const [form,setForm] = useState({})
  const [noteTarget,setNoteTarget] = useState(null)
  const [noteText,setNoteText] = useState('')
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const blank={id:'',name:'',title:'',email:'',cell:'',linkedin:'',location:'',dept:'',influence:'Stakeholder',sentiment:'neutral',relStatus:'Building',toolsOwn:'',goals:'',pains:'',notes:'',personalNotes:'',lastInteracted:''}
  const save=()=>{if(!form.name)return;if(form.id)setAcct(p=>({...p,contacts:p.contacts.map(c=>c.id===form.id?form:c)}));else setAcct(p=>({...p,contacts:[...p.contacts,{...form,id:uid()}]}));setShowAdd(false);setForm(blank)}
  const del=id=>{if(window.confirm('Delete contact?'))setAcct(p=>({...p,contacts:p.contacts.filter(c=>c.id!==id)}))}
  const sentC={positive:S.green,neutral:S.muted,negative:S.red}
  const relC={Strong:S.green,Building:S.blue,'Needs Attention':S.orange,Unknown:S.muted}
  const saveNote=c=>{if(!noteText.trim()){setNoteTarget(null);return};const stamp=`[${new Date().toISOString().split('T')[0]}] ${noteText.trim()}`;setAcct(p=>({...p,contacts:p.contacts.map(ct=>ct.id===c.id?{...ct,notes:(ct.notes?ct.notes+' | ':'')+stamp}:ct)}));setNoteTarget(null);setNoteText('')}
  const dismissMention=id=>setAcct(p=>({...p,unknownMentions:(p.unknownMentions||[]).filter(m=>m.id!==id)}))
  const dismissSuggestion=id=>setAcct(p=>({...p,relSuggestions:(p.relSuggestions||[]).filter(s=>s.id!==id)}))
  const applySuggestion=s=>{setAcct(p=>({...p,contacts:p.contacts.map(c=>{const fn=s.contactName.split(' ')[0].toLowerCase();return c.name.toLowerCase().includes(fn)?{...c,relStatus:s.suggestedStatus}:c}),relSuggestions:(p.relSuggestions||[]).filter(sg=>sg.id!==s.id)}))}
  return (
    <div>
      {(acct.unknownMentions||[]).length>0&&<div style={{marginBottom:12,padding:'12px 14px',background:'rgba(234,179,8,0.08)',border:'1px solid rgba(234,179,8,0.3)',borderRadius:8}}>
        <div style={{fontSize:13,fontWeight:700,color:S.yellow,marginBottom:2}}>People to Meet</div>
        <div style={{fontSize:11,color:S.muted,marginBottom:8}}>Mentioned in transcripts but not in your contacts yet</div>
        <div style={{display:'flex',flexDirection:'column',gap:5}}>
          {(acct.unknownMentions||[]).map(m=>(
            <div key={m.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
              <span style={{fontSize:12,color:S.txt,fontWeight:600}}>{m.name}</span>
              <div style={{display:'flex',gap:5}}>
                <Btn variant='primary' onClick={()=>{setForm({...blank,name:m.name});setShowAdd(true)}} style={{fontSize:11,padding:'4px 10px'}}>Add Contact</Btn>
                <Btn onClick={()=>dismissMention(m.id)} style={{fontSize:11,padding:'4px 8px'}}>✕</Btn>
              </div>
            </div>
          ))}
        </div>
      </div>}
      {(acct.relSuggestions||[]).length>0&&<div style={{marginBottom:12,display:'flex',flexDirection:'column',gap:5}}>
        {(acct.relSuggestions||[]).map(s=>(
          <div key={s.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,padding:'9px 12px',background:'rgba(59,130,246,0.08)',border:'1px solid rgba(59,130,246,0.25)',borderRadius:7,flexWrap:'wrap'}}>
            <span style={{fontSize:12,color:S.blue}}>AI suggests: Mark <strong>{s.contactName}</strong> as <strong>{s.suggestedStatus}</strong> — {s.reason}</span>
            <div style={{display:'flex',gap:5,flexShrink:0}}>
              <Btn variant='primary' onClick={()=>applySuggestion(s)} style={{fontSize:11,padding:'4px 10px'}}>Apply</Btn>
              <Btn onClick={()=>dismissSuggestion(s.id)} style={{fontSize:11,padding:'4px 8px'}}>Dismiss</Btn>
            </div>
          </div>
        ))}
      </div>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div style={{fontSize:13,color:S.muted}}>{acct.contacts.length} contacts</div>
        <Btn variant='primary' onClick={()=>{setForm(blank);setShowAdd(true)}}>+ Add Contact</Btn>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:5}}>
        {acct.contacts.map(c=>{
          const inf=IC[c.influence]||IC.Stakeholder;const open=exp===c.id
          const ds=daysSince(c.lastInteracted)
          const healthDot=ds===null?S.muted:ds<30?S.green:ds<60?S.orange:S.red
          const healthLabel=ds===null?'Never':ds+'d ago'
          const firstName=c.name.split(' ')[0].toLowerCase()
          const lastName=c.name.split(' ').slice(-1)[0].toLowerCase()
          const matchEntry=e=>{const h=`${e.participants||''} ${e.topics||''} ${e.summary||''}`.toLowerCase();return h.includes(firstName)||(lastName!==firstName&&h.includes(lastName))}
          const relHistory=[...(acct.interactions||[]).filter(matchEntry).map(e=>({...e,_s:'i'})),...(acct.intelLog||[]).filter(matchEntry).map(e=>({...e,_s:'l'}))].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
          return (<Card key={c.id}>
            <div onClick={()=>setExp(open?null:c.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',cursor:'pointer'}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:inf.b,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:inf.c,flexShrink:0}}>{initials(c.name)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:13,fontWeight:600,color:S.txt}}>{c.name}</span><span style={{width:7,height:7,borderRadius:'50%',background:sentC[c.sentiment]||S.muted,flexShrink:0}} title={c.sentiment}/></div>
                <div style={{fontSize:11,color:S.muted}}>{c.title} · {c.dept}</div>
              </div>
              <div style={{display:'flex',gap:5,flexShrink:0,flexWrap:'wrap',justifyContent:'flex-end',alignItems:'center'}}>
                <Badge label={c.influence} color={inf.c} bg={inf.b}/>
                {c.relStatus&&<Badge label={c.relStatus} color={relC[c.relStatus]||S.muted} bg={(relC[c.relStatus]||S.muted)+'22'}/>}
                <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:999,padding:'2px 8px',whiteSpace:'nowrap'}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:healthDot,flexShrink:0,display:'inline-block'}}/>
                  {healthLabel}
                </span>
                <button onClick={e=>{e.stopPropagation();if(noteTarget===c.id){setNoteTarget(null);setNoteText('')}else{setNoteTarget(c.id);setNoteText('')}}} style={{background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,cursor:'pointer',fontSize:11,padding:'3px 8px',whiteSpace:'nowrap',lineHeight:'18px'}}>Note</button>
              </div>
            </div>
            {noteTarget===c.id&&<div style={{padding:'8px 14px 10px',borderTop:`1px solid ${S.bdr}`,background:S.surf2}} onClick={e=>e.stopPropagation()}>
              <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} rows={2} placeholder='Quick note...' style={{marginBottom:6,fontSize:12}}/>
              <div style={{display:'flex',gap:6}}>
                <Btn variant='primary' onClick={()=>saveNote(c)} style={{fontSize:11,padding:'4px 10px'}}>Save</Btn>
                <Btn onClick={()=>{setNoteTarget(null);setNoteText('')}} style={{fontSize:11,padding:'4px 8px'}}>Cancel</Btn>
              </div>
            </div>}
            {open&&<div style={{padding:'12px 14px 16px',borderTop:`1px solid ${S.bdr}`}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 16px',marginBottom:10,fontSize:12}}>
                {[['Email',c.email],['Cell',c.cell],['Location',c.location]].map(([l,v])=><div key={l}><span style={{color:S.muted}}>{l}: </span><span style={{color:S.txt}}>{v||'—'}</span></div>)}
                <div key='li'><span style={{color:S.muted}}>LinkedIn: </span>{c.linkedin?<a href={c.linkedin} target='_blank' rel='noopener noreferrer' onClick={e=>e.stopPropagation()} style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:3}}><span style={{fontSize:10,fontWeight:700,color:'#fff',background:'#0a66c2',padding:'1px 6px',borderRadius:3,lineHeight:'16px'}}>in</span></a>:<span style={{color:S.txt}}>—</span>}</div>
              </div>
              {c.lastInteracted&&<div style={{fontSize:11,color:S.muted,marginBottom:8}}>Last interacted: {fmtDate(c.lastInteracted)}</div>}
              {[['Tools / Tech Owned',c.toolsOwn],['Key Goals',c.goals],['Key Pains',c.pains],['Notes',c.notes],['Personal Notes',c.personalNotes]].map(([l,v])=>v?<div key={l} style={{marginBottom:8}}><div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>{l}</div><div style={{fontSize:12,color:S.secondary,lineHeight:1.6}}>{v}</div></div>:null)}
              <div style={{marginTop:12,borderTop:`1px solid ${S.bdr}`,paddingTop:10}}>
                <SH>Interaction History</SH>
                {relHistory.length===0
                  ?<div style={{fontSize:12,color:S.dim}}>No interactions logged yet.</div>
                  :<div style={{display:'flex',flexDirection:'column',gap:5}}>
                    {relHistory.map((e,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'flex-start',gap:7}}>
                        <span style={{fontSize:10,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:4,padding:'1px 6px',whiteSpace:'nowrap',flexShrink:0}}>{fmtDate(e.date)}</span>
                        <Badge label={e.type||'Note'} color={INTERACTION_COLORS[e.type]||S.muted} bg={(INTERACTION_COLORS[e.type]||S.muted)+'1a'} size={10}/>
                        <span style={{fontSize:12,color:S.secondary,lineHeight:1.5}}>{(e.summary||'').split('\n')[0].slice(0,120)}{(e.summary||'').length>120?'…':''}</span>
                      </div>
                    ))}
                  </div>
                }
              </div>
              <div style={{display:'flex',gap:8,marginTop:10}}><Btn onClick={()=>{setForm(c);setShowAdd(true)}}>Edit</Btn><Btn variant='danger' onClick={()=>del(c.id)}>Delete</Btn></div>
            </div>}
          </Card>)
        })}
      </div>
      {showAdd&&<Modal title={form.id?'Edit Contact':'Add Contact'} onClose={()=>{setShowAdd(false);setForm(blank)}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
          <Field label='Name' value={form.name} onChange={f('name')} style={{gridColumn:'span 2'}}/>
          <Field label='Title' value={form.title} onChange={f('title')}/>
          <Field label='Department' value={form.dept} onChange={f('dept')}/>
          <Field label='Email' value={form.email} onChange={f('email')} type='email'/>
          <Field label='Cell' value={form.cell} onChange={f('cell')}/>
          <Field label='LinkedIn URL' value={form.linkedin} onChange={f('linkedin')} style={{gridColumn:'span 2'}}/>
          <Field label='Location' value={form.location} onChange={f('location')}/>
          <Field label='Last Interacted' value={form.lastInteracted} onChange={f('lastInteracted')} type='date'/>
          <Field label='Influence Level' value={form.influence} onChange={f('influence')} options={INFLUENCES}/>
          <Field label='Relationship Status' value={form.relStatus} onChange={f('relStatus')} options={['Strong','Building','Needs Attention','Unknown']}/>
          <Field label='Sentiment' value={form.sentiment} onChange={f('sentiment')} options={['positive','neutral','negative']}/>
        </div>
        <Field label='Tools / Tech They Own or Work In' value={form.toolsOwn} onChange={f('toolsOwn')} multiline/>
        <Field label='Key Goals' value={form.goals} onChange={f('goals')} multiline/>
        <Field label='Key Pains' value={form.pains} onChange={f('pains')} multiline/>
        <Field label='Professional Notes' value={form.notes} onChange={f('notes')} multiline/>
        <Field label='Personal Notes — spouse, kids, hobbies, weekend plans' value={form.personalNotes} onChange={f('personalNotes')} multiline/>
        <div style={{display:'flex',gap:8,marginTop:4}}><Btn variant='primary' onClick={save}>Save Contact</Btn><Btn onClick={()=>{setShowAdd(false);setForm(blank)}}>Cancel</Btn></div>
      </Modal>}
    </div>
  )
}

const HEATMAP_DOMAINS = [
  {name:'Cloud & App Security',color:'#0ea5e9',caps:['CNAPP/CSPM','CWPP','CIEM','CASB/SSPM','CDN/WAF','SAST','DAST/IAST','SCA','API Security','App Pen Testing']},
  {name:'Data Protection',color:'#8b5cf6',caps:['Data Governance','DSPM','DLP','GenAI/LLM Security','Data Encryption','Key Management','BC/DR Backup','GRC Platform','3rd Party Risk','DFIR']},
  {name:'Endpoint & Mail',color:'#f59e0b',caps:['Endpoint EDR','Server EDR','Endpoint Encryption','Insider Threat/DDR','MDM/EMM','Patch Management','Email Gateway','BEC/Phishing','DMARC','Email DLP']},
  {name:'Security Operations',color:'#ef4444',caps:['SIEM/XDR','SOAR','Threat Intel','MSSP/MDR','Vulnerability Management','Pen Testing','BAS/Continuous Testing','Log Management','Brand/Dark Web','DFIR']},
  {name:'Network Security',color:'#22c55e',caps:['Firewall','IDS/IPS','URL Filtering','Sandbox','DNS Security','SASE/ZTNA','Zero Trust','NAC','NTA/NDR','FW Segmentation']},
  {name:'Identity Security',color:'#f97316',caps:['Identity Store/AD','ITDR','IAM','SSO','MFA','IGA','PAM','Certificate Management','ISPM','Non-Human Identity']},
]
const CAP_KEYWORDS = {
  'CNAPP/CSPM':['cspm','cnapp','cloud security posture','wiz'],'CWPP':['cwpp','cloud workload'],'CIEM':['ciem','cloud identity entitlement'],'CASB/SSPM':['casb','sspm'],'CDN/WAF':['cdn','waf','web application firewall','cloudflare'],'SAST':['sast','static analysis'],'DAST/IAST':['dast','iast'],'SCA':['sca','software composition'],'API Security':['api security'],'App Pen Testing':['app pen','application pen'],
  'Data Governance':['data governance'],'DSPM':['dspm','data security posture'],'DLP':['dlp','data loss','purview'],'GenAI/LLM Security':['genai','llm','ai security'],'Data Encryption':['encryption','bitlocker'],'Key Management':['key management'],'BC/DR Backup':['backup','disaster recovery'],'GRC Platform':['grc','vanta','compliance'],'3rd Party Risk':['third party risk','3rd party'],'DFIR':['dfir','incident response','forensics'],
  'Endpoint EDR':['edr','defender','crowdstrike','sentinelone'],'Server EDR':['server edr','server endpoint'],'Endpoint Encryption':['endpoint encryption','bitlocker','full disk'],'Insider Threat/DDR':['insider threat','ddr'],'MDM/EMM':['mdm','emm','intune','mobile device'],'Patch Management':['patch management','wsus'],'Email Gateway':['email','abnormal','proofpoint','mimecast','gateway'],'BEC/Phishing':['bec','phishing','abnormal','email protection'],'DMARC':['dmarc','spf','dkim'],'Email DLP':['email dlp','purview'],
  'SIEM/XDR':['siem','xdr','chronicle','qradar','sentinel','google secops'],'SOAR':['soar','orchestration'],'Threat Intel':['threat intel','cti'],'MSSP/MDR':['mdr','mssp','managed detection','10x'],'Vulnerability Management':['vulnerability management','qualys','wiz','tenable'],'Pen Testing':['pen test','ptaas','netspy','mandiant'],'BAS/Continuous Testing':['bas','breach attack','continuous testing','horizon 3','pentera'],'Log Management':['log management','cribl'],'Brand/Dark Web':['dark web','brand monitoring'],
  'Firewall':['firewall','palo alto','fortinet'],'IDS/IPS':['ids','ips','intrusion'],'URL Filtering':['url filtering','web filtering','zscaler','cloudflare gateway'],'Sandbox':['sandbox','detonation'],'DNS Security':['dns security','dns filter'],'SASE/ZTNA':['sase','ztna','cloudflare','zscaler','netskope'],'Zero Trust':['zero trust','ztna','cloudflare access'],'NAC':['nac','network access control'],'NTA/NDR':['nta','ndr','network detection'],'FW Segmentation':['segmentation','microsegmentation'],
  'Identity Store/AD':['active directory','entra id','ldap'],'ITDR':['itdr','identity threat detection'],'IAM':['iam','entra','okta'],'SSO':['sso','single sign','saml'],'MFA':['mfa','multi-factor','authenticator'],'IGA':['iga','saviynt','sailpoint','identity governance'],'PAM':['pam','privileged access','cyberark','pim','delinea'],'Certificate Management':['certificate','pki','digicert'],'ISPM':['ispm','identity security posture'],'Non-Human Identity':['non-human','service account','machine identity'],
}
const makeArc = (cx,cy,r1,r2,a1,a2,gap=0.01) => {
  const s=a1+gap, e=a2-gap
  if(e<=s) return ''
  const lg=(e-s)>Math.PI?1:0, co=Math.cos, si=Math.sin
  return `M ${cx+r2*co(s)} ${cy+r2*si(s)} A ${r2} ${r2} 0 ${lg} 1 ${cx+r2*co(e)} ${cy+r2*si(e)} L ${cx+r1*co(e)} ${cy+r1*si(e)} A ${r1} ${r1} 0 ${lg} 0 ${cx+r1*co(s)} ${cy+r1*si(s)} Z`
}
const findVendor = (cap, techStack) => {
  const kws = (CAP_KEYWORDS[cap]||[cap.toLowerCase()])
  let best=null, bestScore=0
  for (const t of techStack) {
    const s=`${t.vendor} ${t.products} ${t.category} ${t.notes}`.toLowerCase()
    const score=kws.filter(k=>s.includes(k)).length
    if(score>bestScore){best=t;bestScore=score}
  }
  return bestScore>0?best:null
}
const capStatusFill = v => !v?S.bdr2:({Current:'#22c55e',Selected:'#22c55e',Evaluating:'#eab308',Watch:'#f97316',Replacing:'#ef4444',Dropping:'#ef4444'}[v.status]||S.bdr2)

function TechStack({acct,setAcct}) {
  const [view,setView] = useState('list')
  const [showAdd,setShowAdd] = useState(false)
  const [form,setForm] = useState({})
  const [hoveredSeg,setHoveredSeg] = useState(null)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const blank={id:'',vendor:'',products:'',category:'SIEM / SOC',status:'Current',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'',notes:''}
  const save=()=>{if(!form.vendor)return;if(form.id)setAcct(p=>({...p,techStack:p.techStack.map(t=>t.id===form.id?form:t)}));else setAcct(p=>({...p,techStack:[...p.techStack,{...form,id:uid()}]}));setShowAdd(false);setForm(blank)}
  const del=id=>{if(window.confirm('Delete?'))setAcct(p=>({...p,techStack:p.techStack.filter(t=>t.id!==id)}))}
  const grouped=TECH_CATS.reduce((acc,cat)=>{const items=acct.techStack.filter(t=>t.category===cat);if(items.length)acc[cat]=items;return acc},{})
  const upcoming=acct.techStack.filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=150}).length

  // Heatmap geometry: outer ring = domains (57px, thicker), inner ring = caps (48px)
  const CX=300,CY=300,OR1=195,OR2=252,IR1=142,IR2=190,LR=267,START=-Math.PI/2
  const domainToCategory={'Cloud & App Security':'Cloud Security','Data Protection':'GRC','Endpoint & Mail':'Email Security','Security Operations':'SIEM / SOC','Network Security':'Network / SASE','Identity Security':'Identity / IAM'}
  const allCaps=HEATMAP_DOMAINS.flatMap(d=>d.caps)
  const coveredCaps=allCaps.filter(cap=>findVendor(cap,acct.techStack))
  const coveragePct=Math.round(coveredCaps.length/allCaps.length*100)

  const hmSegments=[]
  let angle=START
  const anglePD=(2*Math.PI)/HEATMAP_DOMAINS.length
  HEATMAP_DOMAINS.forEach((domain,di)=>{
    const dS=angle,dE=angle+anglePD,mid=(dS+dE)/2
    hmSegments.push({type:'domain',di,domain,mid,path:makeArc(CX,CY,OR1,OR2,dS,dE,0.022)})
    const aPC=anglePD/domain.caps.length
    domain.caps.forEach((cap,ci)=>{
      const cS=dS+ci*aPC,cE=cS+aPC,vendor=findVendor(cap,acct.techStack)
      hmSegments.push({type:'cap',di,ci,domain,cap,vendor,fill:capStatusFill(vendor),path:makeArc(CX,CY,IR1,IR2,cS,cE,0.013)})
    })
    angle=dE
  })

  const handleCapHover=(seg,e)=>{if(seg.type!=='cap'){setHoveredSeg(null);return};setHoveredSeg({...seg,x:e.clientX,y:e.clientY})}
  const handleCapMove=(seg,e)=>{if(seg.type!=='cap')return;setHoveredSeg(p=>p?{...p,x:e.clientX,y:e.clientY}:null)}
  const handleCapClick=(seg)=>{
    if(seg.type!=='cap')return
    if(seg.vendor){setForm(seg.vendor);setShowAdd(true)}
    else{setForm({...blank,category:domainToCategory[seg.domain.name]||'Other'});setShowAdd(true)}
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:7,padding:2}}>
            {['list','heatmap'].map(v=><button key={v} onClick={()=>setView(v)} style={{padding:'5px 14px',borderRadius:5,border:'none',background:view===v?S.blue:'transparent',color:view===v?'#fff':S.muted,fontSize:12,fontWeight:600,cursor:'pointer'}}>{v==='list'?'List':'Heatmap'}</button>)}
          </div>
          <div style={{fontSize:12,color:S.muted,display:'flex',gap:16}}>
            <span>{acct.techStack.length} vendors</span>
            {upcoming>0&&<span style={{color:S.orange}}>{upcoming} renewal{upcoming>1?'s':''} within 5 months</span>}
          </div>
        </div>
        <Btn variant='primary' onClick={()=>{setForm(blank);setShowAdd(true)}}>+ Add Vendor</Btn>
      </div>

      {view==='list'&&<>
        {Object.entries(grouped).map(([cat,tools])=>(
          <div key={cat} style={{marginBottom:18}}>
            <SH>{cat}</SH>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {tools.map(t=>{
                const d=daysUntil(t.renewalDate);const rc=d!==null&&d<=60?S.red:d!==null&&d<=150?S.orange:null;const sc=SC[t.status]||S.muted
                return (<div key={t.id} style={{background:S.surf,border:`1px solid ${rc||S.bdr}`,borderRadius:7,padding:'10px 14px'}}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:3}}>
                        <span style={{fontSize:13,fontWeight:700,color:S.txt}}>{t.vendor}</span>
                        <Badge label={t.status} color={sc} bg={sc+'1a'}/>
                        {t.renewalDate&&d!==null&&<Badge label={'Renews '+fmtDate(t.renewalDate)+' ('+d+'d)'} color={rc||S.green} bg={(rc||S.green)+'1a'}/>}
                      </div>
                      {t.products&&<div style={{fontSize:12,color:S.muted,marginBottom:2}}>{t.products}</div>}
                      <div style={{fontSize:11,color:S.dim,display:'flex',gap:12,flexWrap:'wrap'}}>
                        {t.clientOwner&&<span>Owner: {t.clientOwner}</span>}
                        {t.vendorRep&&<span>Rep: {t.vendorRep}</span>}
                        {t.cost&&<span>Cost: {t.cost}</span>}
                      </div>
                      {t.notes&&<div style={{fontSize:12,color:S.secondary,marginTop:4}}>{t.notes}</div>}
                    </div>
                    <div style={{display:'flex',gap:6,flexShrink:0}}>
                      <button onClick={()=>{setForm(t);setShowAdd(true)}} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:12}}>Edit</button>
                      <button onClick={()=>del(t.id)} style={{background:'none',border:'none',color:S.red,cursor:'pointer',fontSize:12}}>Del</button>
                    </div>
                  </div>
                </div>)
              })}
            </div>
          </div>
        ))}
      </>}

      {view==='heatmap'&&<div>
        <div style={{textAlign:'center',marginBottom:10}}>
          <span style={{fontSize:13,color:S.muted}}>{coveredCaps.length} of {allCaps.length} capabilities covered · </span>
          <span style={{fontSize:14,fontWeight:700,color:coveragePct>=70?S.green:coveragePct>=40?S.yellow:S.red}}>{coveragePct}%</span>
        </div>
        <svg viewBox="-55 -55 710 710" style={{width:'100%',maxWidth:580,display:'block',margin:'0 auto',overflow:'visible'}}>
          {/* Inner capability ring */}
          {hmSegments.filter(s=>s.type==='cap').map((seg,i)=>(
            <path key={`c${i}`} d={seg.path} fill={seg.fill} stroke={S.bg} strokeWidth={0.5}
              style={{cursor:'pointer',transition:'filter 0.1s',filter:hoveredSeg?.cap===seg.cap&&hoveredSeg?.di===seg.di?'brightness(1.5) saturate(1.2)':'brightness(1)'}}
              onMouseEnter={e=>handleCapHover(seg,e)} onMouseMove={e=>handleCapMove(seg,e)}
              onMouseLeave={()=>setHoveredSeg(null)} onClick={()=>handleCapClick(seg)}/>
          ))}
          {/* Outer domain ring + labels */}
          {hmSegments.filter(s=>s.type==='domain').map((seg,i)=>{
            const lx=CX+LR*Math.cos(seg.mid), ly=CY+LR*Math.sin(seg.mid)
            const anchor=Math.cos(seg.mid)>0.1?'start':Math.cos(seg.mid)<-0.1?'end':'middle'
            const words=seg.domain.name.split(' '), half=Math.ceil(words.length/2)
            const l1=words.slice(0,half).join(' '), l2=words.slice(half).join(' ')
            return (
              <g key={`d${i}`}>
                <path d={seg.path} fill={seg.domain.color} stroke={S.bg} strokeWidth={1.5}/>
                <text textAnchor={anchor} fill={seg.domain.color} fontSize={9.5} fontWeight={700} letterSpacing='0.04em'>
                  <tspan x={lx} y={l2?ly-6:ly+4}>{l1}</tspan>
                  {l2&&<tspan x={lx} dy={13}>{l2}</tspan>}
                </text>
              </g>
            )
          })}
          {/* Center hole */}
          <circle cx={CX} cy={CY} r={IR1-10} fill={S.bg}/>
          <text x={CX} y={CY-5} textAnchor='middle' fontSize={10} fontWeight={800} fill={S.muted} letterSpacing='0.08em'>SECURITY</text>
          <text x={CX} y={CY+11} textAnchor='middle' fontSize={10} fontWeight={800} fill={S.muted} letterSpacing='0.08em'>HEATMAP</text>
        </svg>
        {/* Legend */}
        <div style={{display:'flex',justifyContent:'center',gap:16,marginTop:12,flexWrap:'wrap'}}>
          {[['Maintain','#22c55e'],['Review','#eab308'],['Invest','#f97316'],['Gap','#ef4444'],['Critical Gap',S.bdr2]].map(([label,color])=>(
            <div key={label} style={{display:'flex',alignItems:'center',gap:5}}>
              <div style={{width:11,height:11,borderRadius:2,background:color,border:`1px solid ${S.bdr2}`}}/>
              <span style={{fontSize:11,color:S.muted}}>{label}</span>
            </div>
          ))}
        </div>
      </div>}

      {/* Floating tooltip */}
      {hoveredSeg&&view==='heatmap'&&<div style={{position:'fixed',left:Math.min(hoveredSeg.x+14,window.innerWidth-240),top:Math.max(10,hoveredSeg.y-60),background:S.surf,border:`1px solid ${S.bdr}`,borderLeft:`3px solid ${hoveredSeg.domain.color}`,borderRadius:8,padding:'8px 12px',pointerEvents:'none',zIndex:9999,maxWidth:220,boxShadow:'0 4px 16px rgba(0,0,0,0.5)'}}>
        <div style={{fontSize:12,fontWeight:700,color:S.txt,marginBottom:4}}>{hoveredSeg.cap}</div>
        {hoveredSeg.vendor
          ?<><div style={{fontSize:12,color:S.muted,marginBottom:2}}>{hoveredSeg.vendor.vendor}</div><div style={{fontSize:11,color:capStatusFill(hoveredSeg.vendor),fontWeight:600}}>{hoveredSeg.vendor.status}</div></>
          :<div style={{fontSize:11,color:S.muted}}>No vendor mapped · click to add</div>
        }
      </div>}

      {showAdd&&<Modal title='Add / Edit Vendor' onClose={()=>{setShowAdd(false);setForm(blank)}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
          <Field label='Vendor Name' value={form.vendor} onChange={f('vendor')} style={{gridColumn:'span 2'}}/>
          <Field label='Products / Features' value={form.products} onChange={f('products')} style={{gridColumn:'span 2'}}/>
          <Field label='Category' value={form.category} onChange={f('category')} options={TECH_CATS}/>
          <Field label='Status' value={form.status} onChange={f('status')} options={TECH_STATS}/>
          <Field label='Contract Renewal Date' value={form.renewalDate} onChange={f('renewalDate')} type='date'/>
          <Field label='Annual Cost' value={form.cost} onChange={f('cost')}/>
          <Field label='Vendor Rep Name' value={form.vendorRep} onChange={f('vendorRep')}/>
          <Field label='Vendor Rep Email' value={form.vendorRepEmail} onChange={f('vendorRepEmail')} type='email'/>
          <Field label='Client Owner / User' value={form.clientOwner} onChange={f('clientOwner')} style={{gridColumn:'span 2'}}/>
        </div>
        <Field label='Notes' value={form.notes} onChange={f('notes')} multiline/>
        <div style={{display:'flex',gap:8,marginTop:4}}><Btn variant='primary' onClick={save}>Save</Btn><Btn onClick={()=>{setShowAdd(false);setForm(blank)}}>Cancel</Btn></div>
      </Modal>}
    </div>
  )
}

const InlineEdit = ({value, onChange, placeholder, multiline=false}) => {
  const [local, setLocal] = useState(value||'')
  useEffect(()=>{setLocal(value||'')},[value])
  const base={fontSize:12,color:S.secondary,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:4,padding:'4px 8px',width:'100%',lineHeight:1.5,resize:'vertical',boxSizing:'border-box'}
  if(multiline)return <textarea value={local} onChange={e=>setLocal(e.target.value)} onBlur={()=>onChange(local)} rows={2} placeholder={placeholder||''} style={base}/>
  return <input value={local} onChange={e=>setLocal(e.target.value)} onBlur={()=>onChange(local)} placeholder={placeholder||''} style={base}/>
}

function Projects({acct,setAcct}) {
  const [view,setView] = useState('pipeline')
  const [exp,setExp] = useState(null)
  const [showAdd,setShowAdd] = useState(false)
  const blank={id:'',name:'',category:'',vendor:'',status:'Not Started',description:'',goals:'',pains:'',primaryContact:'',budget:false,closeDate:'',notes:'',waitingOn:'',nextAction:'',timeline:STAGES.map(s=>({stage:s,status:'pending',date:''}))}
  const [form,setForm] = useState(blank)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const save=()=>{if(!form.name)return;if(form.id)setAcct(p=>({...p,projects:p.projects.map(j=>j.id===form.id?form:j)}));else setAcct(p=>({...p,projects:[...p.projects,{...form,id:uid()}]}));setShowAdd(false);setForm(blank)}
  const toggleStage=(projId,idx)=>{setAcct(p=>({...p,projects:p.projects.map(j=>{if(j.id!==projId)return j;const tl=j.timeline.map((s,i)=>i===idx?{...s,status:s.status==='completed'?'pending':'completed',date:s.status!=='completed'?new Date().toISOString().split('T')[0]:''}:s);return{...j,timeline:tl}})}))}
  const updateField=(projId,field,val)=>{setAcct(p=>({...p,projects:p.projects.map(j=>j.id===projId?{...j,[field]:val}:j)}))}
  const grouped=PROJ_STATS.reduce((acc,s)=>{acc[s]=acct.projects.filter(p=>p.status===s);return acc},{})

  const getStageDuration = p => {
    const curr=p.timeline.find(s=>s.status==='current'&&s.date)
    if(curr)return daysSince(curr.date)
    const done=p.timeline.filter(s=>s.status==='completed'&&s.date)
    if(!done.length)return null
    return daysSince(done[done.length-1].date)
  }

  const calcHistoricalAverages = () => {
    const pairs=STAGES.slice(0,-1).map((s,i)=>({from:s,to:STAGES[i+1],diffs:[]}))
    acct.projects.forEach(p=>{
      if(p.timeline.filter(s=>s.status==='completed'&&s.date).length<3)return
      p.timeline.forEach((s,i)=>{
        if(i===p.timeline.length-1)return
        const s2=p.timeline[i+1]
        if(s.status==='completed'&&s2.status==='completed'&&s.date&&s2.date){
          const d=Math.floor((new Date(s2.date+'T12:00:00')-new Date(s.date+'T12:00:00'))/86400000)
          if(d>=0)pairs[i].diffs.push(d)
        }
      })
    })
    return pairs.filter(p=>p.diffs.length>0).map(p=>({...p,avg:Math.round(p.diffs.reduce((a,b)=>a+b,0)/p.diffs.length)}))
  }

  const avgData=calcHistoricalAverages()

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:7,padding:2}}>
          {['pipeline','timeline'].map(v=><button key={v} onClick={()=>setView(v)} style={{padding:'5px 14px',borderRadius:5,border:'none',background:view===v?S.blue:'transparent',color:view===v?'#fff':S.muted,fontSize:12,fontWeight:600,cursor:'pointer'}}>{v==='pipeline'?'Pipeline':'Timeline'}</button>)}
        </div>
        <Btn variant='primary' onClick={()=>{setForm(blank);setShowAdd(true)}}>+ Add Project</Btn>
      </div>
      {view==='pipeline'&&<div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
        {['In Flight','In Discussion','Not Started','Stalled','Won','Lost'].map(status=>{
          const projs=grouped[status]||[];const sc=PSC[status]||S.muted
          return (<div key={status} style={{background:S.surf2,borderRadius:8,padding:10}}>
            <div style={{fontSize:11,fontWeight:700,color:sc,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em',display:'flex',justifyContent:'space-between'}}>
              {status}<span style={{background:sc+'22',borderRadius:999,padding:'1px 7px'}}>{projs.length}</span>
            </div>
            {projs.map(p=>{
              const comp=p.timeline.filter(s=>s.status==='completed').length
              return (<div key={p.id} onClick={()=>setExp(exp===p.id?null:p.id)} style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,padding:'9px 11px',marginBottom:6,cursor:'pointer'}}>
                <div style={{fontSize:12,fontWeight:600,color:S.txt,marginBottom:3}}>{p.name}</div>
                <div style={{fontSize:11,color:S.muted,marginBottom:4}}>{p.vendor} · {p.primaryContact||'—'}</div>
                {p.nextAction&&<div style={{fontSize:11,color:S.blue,marginBottom:4}}>→ Next: {p.nextAction}</div>}
                <div style={{height:3,background:S.bdr,borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',width:`${(comp/STAGES.length)*100}%`,background:sc}}/></div>
                <div style={{fontSize:10,color:S.muted,marginTop:3}}>{comp}/{STAGES.length} stages</div>
              </div>)
            })}
          </div>)
        })}
      </div>}
      {view==='timeline'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
        {acct.projects.map(p=>{
          const sc=PSC[p.status]||S.muted;const open=exp===p.id
          const stageDays=getStageDuration(p)
          return (<Card key={p.id}>
            <div onClick={()=>setExp(open?null:p.id)} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'11px 14px',cursor:'pointer'}}>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                  <span style={{fontSize:13,fontWeight:700,color:S.txt}}>{p.name}</span>
                  <Badge label={p.status} color={sc} bg={sc+'1a'}/>
                  {p.vendor&&<Badge label={p.vendor} color={S.muted} bg='rgba(100,116,139,0.1)'/>}
                  {stageDays!==null&&<Badge label={`In this stage: ${stageDays}d`} color={S.muted} bg='rgba(100,116,139,0.08)'/>}
                  {p.waitingOn&&<Badge label={`Waiting on: ${p.waitingOn}`} color={S.orange} bg='rgba(249,115,22,0.12)'/>}
                </div>
                <div style={{fontSize:11,color:S.muted}}>{p.primaryContact||'—'} · Close: {fmtDate(p.closeDate)||'TBD'}</div>
                {p.nextAction&&<div style={{fontSize:11,color:S.blue,marginTop:3}}>→ Next: {p.nextAction}</div>}
              </div>
            </div>
            <div style={{padding:'0 14px 14px'}}>
              <div style={{display:'flex',gap:2,marginBottom:8}}>
                {p.timeline.map((stage,i)=>{const c=stage.status==='completed'?S.green:stage.status==='current'?S.blue:S.bdr;return(<div key={i} onClick={e=>{e.stopPropagation();toggleStage(p.id,i)}} style={{flex:1,height:7,background:c,borderRadius:2,cursor:'pointer',transition:'background 0.2s'}} title={stage.stage+(stage.date?' - '+fmtDate(stage.date):'')+' (click to toggle)'}/>)})}
              </div>
              <div style={{display:'grid',gridTemplateColumns:`repeat(${p.timeline.length},1fr)`,gap:2}}>
                {p.timeline.map((stage,i)=>{
                  const c=stage.status==='completed'?S.green:stage.status==='current'?S.blue:S.dim
                  return (<div key={i} style={{textAlign:'center'}}>
                    <div style={{fontSize:9,color:c,fontWeight:stage.status!=='pending'?600:400,lineHeight:1.3,wordBreak:'break-word'}}>{stage.stage}{stage.status==='completed'?' ✓':''}</div>
                    {stage.status==='completed'&&stage.date&&<div style={{fontSize:8,color:S.muted,marginTop:1,lineHeight:1.2}}>{fmtDate(stage.date)}</div>}
                  </div>)
                })}
              </div>
              {open&&<div style={{marginTop:12,borderTop:`1px solid ${S.bdr}`,paddingTop:12}}>
                {p.description&&<p style={{fontSize:13,color:S.secondary,marginBottom:10,lineHeight:1.6}}>{p.description}</p>}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  <div>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Goals</div>
                    <InlineEdit value={p.goals} onChange={val=>updateField(p.id,'goals',val)} placeholder='Goals...' multiline/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Pains</div>
                    <InlineEdit value={p.pains} onChange={val=>updateField(p.id,'pains',val)} placeholder='Current pains...' multiline/>
                  </div>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Notes</div>
                  <InlineEdit value={p.notes} onChange={val=>updateField(p.id,'notes',val)} placeholder='Project notes...' multiline/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div>
                    <div style={{fontSize:10,color:S.blue,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Next Action</div>
                    <InlineEdit value={p.nextAction} onChange={val=>updateField(p.id,'nextAction',val)} placeholder='Next step...'/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:S.orange,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Waiting On</div>
                    <InlineEdit value={p.waitingOn} onChange={val=>updateField(p.id,'waitingOn',val)} placeholder='Who/what is blocking...'/>
                  </div>
                </div>
                <div style={{display:'flex',gap:8}}><Btn onClick={()=>{setForm(p);setShowAdd(true)}}>Edit</Btn><Btn variant='danger' onClick={()=>{if(window.confirm('Delete?'))setAcct(prev=>({...prev,projects:prev.projects.filter(j=>j.id!==p.id)}))}}>Delete</Btn></div>
              </div>}
            </div>
          </Card>)
        })}
        <div style={{padding:'14px 16px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,marginTop:6}}>
          <SH>Historical Stage Averages</SH>
          {avgData.length===0
            ?<div style={{fontSize:12,color:S.muted}}>Not enough completed projects to calculate averages yet.</div>
            :<table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr>
                  <th style={{textAlign:'left',color:S.muted,fontWeight:600,padding:'3px 8px 6px 0',borderBottom:`1px solid ${S.bdr}`}}>Stage</th>
                  <th style={{textAlign:'left',color:S.muted,fontWeight:600,padding:'3px 8px 6px',borderBottom:`1px solid ${S.bdr}`}}>Next Stage</th>
                  <th style={{textAlign:'right',color:S.muted,fontWeight:600,padding:'3px 0 6px 8px',borderBottom:`1px solid ${S.bdr}`}}>Avg Days</th>
                </tr>
              </thead>
              <tbody>
                {avgData.map((row,i)=>(
                  <tr key={i}>
                    <td style={{color:S.txt,padding:'4px 8px 4px 0'}}>{row.from}</td>
                    <td style={{color:S.txt,padding:'4px 8px'}}>{row.to}</td>
                    <td style={{color:S.blue,fontWeight:700,textAlign:'right',padding:'4px 0 4px 8px'}}>{row.avg}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>
      </div>}
      {showAdd&&<Modal title={form.id?'Edit Project':'Add Project'} onClose={()=>{setShowAdd(false);setForm(blank)}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
          <Field label='Project Name' value={form.name} onChange={f('name')} style={{gridColumn:'span 2'}}/>
          <Field label='Category' value={form.category} onChange={f('category')}/>
          <Field label='Vendor' value={form.vendor} onChange={f('vendor')}/>
          <Field label='Status' value={form.status} onChange={f('status')} options={PROJ_STATS}/>
          <Field label='Est. Close Date' value={form.closeDate} onChange={f('closeDate')} type='date'/>
          <Field label='Primary Contact Name' value={form.primaryContact} onChange={f('primaryContact')} style={{gridColumn:'span 2'}}/>
        </div>
        <Field label='Description' value={form.description} onChange={f('description')} multiline/>
        <Field label='Goals' value={form.goals} onChange={f('goals')} multiline/>
        <Field label='Pains Today' value={form.pains} onChange={f('pains')} multiline/>
        <Field label='Notes' value={form.notes} onChange={f('notes')} multiline/>
        <Field label='Next Action' value={form.nextAction} onChange={f('nextAction')}/>
        <Field label='Waiting On' value={form.waitingOn} onChange={f('waitingOn')}/>
        <div style={{display:'flex',gap:8,marginTop:4}}><Btn variant='primary' onClick={save}>Save</Btn><Btn onClick={()=>{setShowAdd(false);setForm(blank)}}>Cancel</Btn></div>
      </Modal>}
    </div>
  )
}

function FollowUps({acct,setAcct}) {
  const [showAdd,setShowAdd] = useState(false)
  const blank={id:'',contact:'',task:'',priority:'High',dueDate:'',status:'Open',context:''}
  const [form,setForm] = useState(blank)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const toggle=id=>setAcct(p=>({...p,followUps:p.followUps.map(fu=>fu.id===id?{...fu,status:fu.status==='Open'?'Done':'Open'}:fu)}))
  const save=()=>{if(!form.task)return;if(form.id)setAcct(p=>({...p,followUps:p.followUps.map(fu=>fu.id===form.id?form:fu)}));else setAcct(p=>({...p,followUps:[...p.followUps,{...form,id:uid()}]}));setShowAdd(false);setForm(blank)}
  const open=acct.followUps.filter(f=>f.status==='Open').sort((a,b)=>['Critical','High','Medium','Low'].indexOf(a.priority)-['Critical','High','Medium','Low'].indexOf(b.priority))
  const done=acct.followUps.filter(f=>f.status==='Done')
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
        <div style={{fontSize:13,color:S.muted}}>{open.length} open · {done.length} done</div>
        <Btn variant='primary' onClick={()=>{setForm(blank);setShowAdd(true)}}>+ Add</Btn>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:5}}>
        {open.map(fu=>{
          const p=PC[fu.priority]||PC.Low;const overdue=fu.dueDate&&daysUntil(fu.dueDate)<0
          return (<div key={fu.id} style={{display:'flex',gap:10,padding:'10px 12px',background:S.surf,border:`1px solid ${S.bdr}`,borderLeft:`3px solid ${p.c}`,borderRadius:8}}>
            <button onClick={()=>toggle(fu.id)} style={{width:18,height:18,borderRadius:4,border:`2px solid ${p.c}`,background:'transparent',flexShrink:0,marginTop:2}} aria-label='Complete'/>
            <div style={{flex:1}}>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:2}}>
                <span style={{fontSize:13,fontWeight:600,color:S.txt}}>{fu.task}</span>
                <Badge label={fu.priority} color={p.c} bg={p.b}/>
                {overdue&&<Badge label='OVERDUE' color={S.red} bg='rgba(239,68,68,0.12)'/>}
              </div>
              <div style={{fontSize:11,color:S.muted}}>{fu.contact&&fu.contact+' · '}{fu.dueDate&&fmtDate(fu.dueDate)+' · '}{fu.context}</div>
            </div>
            <button onClick={()=>{setForm(fu);setShowAdd(true)}} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:11,flexShrink:0}}>Edit</button>
          </div>)
        })}
      </div>
      {done.length>0&&<><SH mt={16}>Completed ({done.length})</SH>{done.slice(0,15).map(fu=><div key={fu.id} onClick={()=>toggle(fu.id)} style={{display:'flex',gap:8,padding:'6px 10px',cursor:'pointer',marginBottom:2}}><div style={{width:18,height:18,borderRadius:4,border:`2px solid ${S.green}`,background:'rgba(34,197,94,0.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}><span style={{color:S.green,fontSize:11}}>✓</span></div><span style={{fontSize:13,color:S.dim,textDecoration:'line-through'}}>{fu.task}</span></div>)}</>}
      {showAdd&&<Modal title={form.id?'Edit Follow-Up':'Add Follow-Up'} onClose={()=>{setShowAdd(false);setForm(blank)}}>
        <Field label='Task' value={form.task} onChange={f('task')}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
          <Field label='Priority' value={form.priority} onChange={f('priority')} options={['Critical','High','Medium','Low']}/>
          <Field label='Due Date' value={form.dueDate} onChange={f('dueDate')} type='date'/>
          <Field label='Contact Name' value={form.contact} onChange={f('contact')} style={{gridColumn:'span 2'}}/>
        </div>
        <Field label='Context / Notes' value={form.context} onChange={f('context')} multiline/>
        <div style={{display:'flex',gap:8,marginTop:4}}><Btn variant='primary' onClick={save}>Save</Btn><Btn onClick={()=>{setShowAdd(false);setForm(blank)}}>Cancel</Btn></div>
      </Modal>}
    </div>
  )
}

function IntelLog({acct,setAcct,apiKey}) {
  const effectiveKey = apiKey || import.meta.env.VITE_ANTHROPIC_KEY || ''
  const [text,setText] = useState('')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [result,setResult] = useState(null)
  const [showDate,setShowDate] = useState(false)
  const [customDate,setCustomDate] = useState('')
  const [search,setSearch] = useState('')
  const [typeFilter,setTypeFilter] = useState('All')
  const [dateFrom,setDateFrom] = useState('')
  const [dateTo,setDateTo] = useState('')

  const process = async (date) => {
    setLoading(true);setError('');setResult(null)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':effectiveKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({
          model:'claude-sonnet-4-6',max_tokens:8000,
          system:'You are an account intelligence analyst for a cybersecurity sales rep at GuidePoint Security. Extract structured intel from input. Return ONLY valid compact JSON. Be concise. Max 5 items per array. No markdown, no explanation.',
          messages:[{role:'user',content:`Extract intelligence and return JSON:
{
  "intelEntry":{"date":"${date}","type":"Call|Meeting|Email|Note","participants":"string","summary":"2-3 sentences","insights":["string"],"risks":["string"],"opportunities":["string"]},
  "newFollowUps":[{"contact":"contact name or empty","task":"string","priority":"Critical|High|Medium|Low","dueDate":"YYYY-MM-DD or empty","context":"string"}],
  "contactUpdates":[{"name":"exact contact name","lastInteracted":"${date}","noteToAppend":"new info only"}],
  "relationshipSuggestions":[{"contactName":"string","suggestedStatus":"Strong|Building|Needs Attention","reason":"one line explanation"}]
}

INPUT:
${text}`}]
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message)
      const raw = (data.content?.[0]?.text||'').replace(/```json|```/g,'').trim()
      const parsed = JSON.parse(raw)
      setAcct(prev=>{
        let next={...prev}
        if (parsed.intelEntry) {
          next.intelLog=[{...parsed.intelEntry,id:uid()},...(prev.intelLog||[])]
          next.lastContact=date
          // Auto-log interaction for Dashboard chart
          const entry=parsed.intelEntry
          const names=(entry.participants||'').split(/[+,&]/).map(n=>n.trim()).filter(n=>n&&!n.toLowerCase().startsWith('mike'))
          const contactName=names[0]||(entry.participants||'').split(/[+,&]/)[0]?.trim()||''
          const topics=(entry.insights||[]).slice(0,2).join('; ').slice(0,120)
          const firstSentence=(entry.summary||'').split(/(?<=[.!?])\s/)[0]||''
          next.interactions=[...(prev.interactions||[]),{id:uid(),contact:contactName,type:entry.type||'Note',date:entry.date,topics,summary:firstSentence}]
        }
        if (parsed.newFollowUps?.length) next.followUps=[...(prev.followUps||[]),...parsed.newFollowUps.map(fu=>({...fu,id:uid(),status:'Open'}))]
        if (parsed.contactUpdates?.length) {
          next.contacts=(prev.contacts||[]).map(c=>{const u=parsed.contactUpdates.find(u=>u.name&&c.name.toLowerCase().includes(u.name.split(' ')[0].toLowerCase()));return u?{...c,lastInteracted:u.lastInteracted||c.lastInteracted,notes:u.noteToAppend?(c.notes||'')+' | ['+date+'] '+u.noteToAppend:c.notes}:c})
          const existFn=(prev.contacts||[]).map(c=>c.name.split(' ')[0].toLowerCase())
          const newUnknowns=parsed.contactUpdates.filter(u=>u.name&&!existFn.some(fn=>u.name.toLowerCase().includes(fn))).map(u=>({id:uid(),name:u.name,mentionedDate:date,context:''})).filter(u=>!(prev.unknownMentions||[]).some(m=>m.name.toLowerCase()===u.name.toLowerCase()))
          if(newUnknowns.length) next.unknownMentions=[...(prev.unknownMentions||[]),...newUnknowns]
        }
        if (parsed.relationshipSuggestions?.length) next.relSuggestions=[...(prev.relSuggestions||[]),...parsed.relationshipSuggestions.map(s=>({...s,id:uid()}))]
        return next
      })
      setResult({followUps:parsed.newFollowUps?.length||0,contacts:parsed.contactUpdates?.length||0,entry:!!parsed.intelEntry})
      setText('')
    } catch(e) { setError('Error: '+(e.message||'Processing failed. Check your API key in Settings.')) }
    setLoading(false)
  }

  const handleProcess = () => {
    if (!effectiveKey) { setError('Add your Anthropic API key in Settings first.'); return }
    const detected = detectDate(text)
    setCustomDate(detected || '')
    setShowDate(true)
  }

  const exportIntel = () => {
    const lines=acct.intelLog.map(e=>[
      `${e.date||''} | ${e.type||'Note'} | ${e.participants||''}`,
      e.summary||'',
      (e.insights||[]).length?'Insights: '+(e.insights||[]).join('; '):'',
      (e.risks||[]).length?'Risks: '+(e.risks||[]).join('; '):'',
      (e.opportunities||[]).length?'Opportunities: '+(e.opportunities||[]).join('; '):'',
      '---'
    ].filter(Boolean).join('\n'))
    const blob=new Blob([lines.join('\n\n')],{type:'text/plain'})
    const a=document.createElement('a')
    a.href=URL.createObjectURL(blob)
    a.download=`intel-log-${(acct.short||acct.name||'export').replace(/[^a-z0-9]/gi,'-')}.txt`
    a.click()
  }

  const filtered=acct.intelLog.filter(e=>{
    if(typeFilter!=='All'&&e.type!==typeFilter)return false
    if(dateFrom&&e.date<dateFrom)return false
    if(dateTo&&e.date>dateTo)return false
    if(search.trim()){
      const q=search.toLowerCase()
      const hay=[e.summary,e.participants,...(e.insights||[]),...(e.risks||[]),...(e.opportunities||[])].filter(Boolean).join(' ').toLowerCase()
      if(!hay.includes(q))return false
    }
    return true
  })

  const hasFilters=!!(search.trim()||typeFilter!=='All'||dateFrom||dateTo)
  const clearFilters=()=>{setSearch('');setTypeFilter('All');setDateFrom('');setDateTo('')}

  return (
    <div>
      <Card style={{padding:16,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:600,color:S.txt,marginBottom:4}}>Add Intelligence</div>
        <div style={{fontSize:12,color:S.muted,marginBottom:10}}>Paste a call transcript, meeting notes, email, or quick note. AI extracts follow-ups, updates contacts, and logs the intel automatically.</div>
        {!effectiveKey&&<div style={{fontSize:11,color:S.orange,marginBottom:8,padding:'6px 10px',background:'rgba(249,115,22,0.08)',border:'1px solid rgba(249,115,22,0.2)',borderRadius:5}}>No API key — go to Settings and add your Anthropic API key to enable AI processing.</div>}
        <textarea value={text} onChange={e=>setText(e.target.value)} rows={8} placeholder={'Paste transcript, meeting notes, email, or a quick note here...\n\nExample: "Talked to Rudy today. NetSpy demo confirmed for Wednesday. Jamie Dennis reached back about Saviynt pricing — wants a decision by June..."'} style={{marginBottom:10}}/>
        {error&&<div style={{fontSize:12,color:S.red,marginBottom:8,lineHeight:1.5}}>{error}</div>}
        {result&&<div style={{fontSize:12,color:S.green,marginBottom:8,padding:'8px 12px',background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:6}}>Done — logged {result.entry?'1 intel entry':''},  added {result.followUps} follow-up{result.followUps!==1?'s':''}, updated {result.contacts} contact{result.contacts!==1?'s':''}</div>}
        <button onClick={handleProcess} disabled={loading||!text.trim()} style={{display:'flex',alignItems:'center',gap:6,padding:'9px 18px',background:loading||!text.trim()?S.dim:S.blue,border:'none',borderRadius:7,color:'#fff',fontSize:13,fontWeight:700,cursor:loading||!text.trim()?'default':'pointer',opacity:!text.trim()?0.5:1}}>
          {loading?'Processing...':'Process with AI'}
        </button>
      </Card>

      <div style={{marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search entries...' style={{flex:1,minWidth:160,fontSize:12,padding:'6px 10px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt}}/>
          <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:7,padding:2,flexShrink:0}}>
            {['All','Call','Meeting','Email','Note'].map(t=>(
              <button key={t} onClick={()=>setTypeFilter(t)} style={{padding:'4px 10px',borderRadius:5,border:'none',background:typeFilter===t?S.blue:'transparent',color:typeFilter===t?'#fff':S.muted,fontSize:11,fontWeight:600,cursor:'pointer'}}>{t}</button>
            ))}
          </div>
          <button onClick={exportIntel} style={{padding:'6px 12px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,color:S.muted,fontSize:12,cursor:'pointer',flexShrink:0}}>↓ Export</button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:S.muted,flexShrink:0}}>Date range:</span>
          <input type='date' value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{fontSize:11,padding:'4px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt}}/>
          <span style={{fontSize:11,color:S.muted}}>to</span>
          <input type='date' value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{fontSize:11,padding:'4px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt}}/>
          {hasFilters&&<button onClick={clearFilters} style={{fontSize:11,padding:'4px 8px',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:5,color:S.red,cursor:'pointer',flexShrink:0}}>Clear filters</button>}
          <span style={{fontSize:11,color:S.muted,marginLeft:'auto'}}>Showing {filtered.length} of {acct.intelLog.length} entries</span>
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {filtered.length===0&&<div style={{textAlign:'center',padding:'30px',color:S.muted,fontSize:13}}>{acct.intelLog.length===0?'No intel logged yet. Paste a transcript above to get started.':'No entries match your filters.'}</div>}
        {filtered.map(e=>(
          <Card key={e.id} style={{padding:'14px 16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <Badge label={e.type||'Note'} color={S.blue} bg='rgba(59,130,246,0.12)'/>
              <span style={{fontSize:12,color:S.muted}}>{fmtDate(e.date)}</span>
              {e.participants&&<span style={{fontSize:12,color:S.muted}}>· {e.participants}</span>}
            </div>
            <p style={{fontSize:13,color:S.secondary,margin:'0 0 10px',lineHeight:1.6}}>{e.summary}</p>
            {e.insights?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Key Insights</div>{e.insights.map((ins,i)=><div key={i} style={{fontSize:12,color:S.secondary,marginBottom:3,paddingLeft:10}}>→ {ins}</div>)}</div>}
            {e.risks?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:10,color:S.red,fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Risks</div>{e.risks.map((r,i)=><div key={i} style={{fontSize:12,color:S.secondary,marginBottom:3,paddingLeft:10}}>! {r}</div>)}</div>}
            {e.opportunities?.length>0&&<div><div style={{fontSize:10,color:S.green,fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Opportunities</div>{e.opportunities.map((o,i)=><div key={i} style={{fontSize:12,color:S.secondary,marginBottom:3,paddingLeft:10}}>+ {o}</div>)}</div>}
          </Card>
        ))}
      </div>
      {showDate&&<Modal title='Date this entry' onClose={()=>setShowDate(false)} width={380}>
        <p style={{fontSize:13,color:S.secondary,marginBottom:10}}>Is this a new entry from today, or are you uploading an older transcript or note?</p>
        {customDate&&<div style={{fontSize:12,color:S.green,padding:'6px 10px',background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:5,marginBottom:10}}>Date detected from text: <strong>{fmtDate(customDate)}</strong></div>}
        <Field label='Custom date (leave blank for today)' value={customDate} onChange={setCustomDate} type='date'/>
        <div style={{display:'flex',gap:8,marginTop:4}}>
          <Btn variant='primary' onClick={()=>{setShowDate(false);process(new Date().toISOString().split('T')[0])}}>Use Today</Btn>
          <Btn onClick={()=>{if(customDate){setShowDate(false);process(customDate)}}} style={{opacity:customDate?1:0.4}}>Use {customDate?fmtDate(customDate):'Custom Date'}</Btn>
        </div>
      </Modal>}
    </div>
  )
}

function Settings({data,setData,acct,setAcct,theme,setTheme}) {
  const [key,setKey] = useState(data.apiKey||'')
  const [saved,setSaved] = useState(false)
  const saveKey=()=>{setData(p=>({...p,apiKey:key}));setSaved(true);setTimeout(()=>setSaved(false),2000)}
  const exportData=()=>{const b=new Blob([JSON.stringify(data,null,2)]);const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='guidepoint-crm-backup.json';a.click()}
  return (
    <div style={{maxWidth:520}}>
      <SH>Appearance</SH>
      <Card style={{padding:'14px 16px',marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:S.txt,marginBottom:2}}>Color Theme</div>
            <div style={{fontSize:12,color:S.muted}}>Choose how the app looks for you</div>
          </div>
          <div style={{display:'flex',gap:4,background:S.surf2,borderRadius:8,padding:3}}>
            {[{v:'light',icon:'☀',label:'Light'},{v:'dark',icon:'☾',label:'Dark'}].map(({v,icon,label})=>(
              <button key={v} onClick={()=>setTheme(v)} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:6,border:'none',background:theme===v?S.blue:'transparent',color:theme===v?'#fff':S.muted,fontSize:12,fontWeight:600,cursor:'pointer',transition:'background 0.15s'}}>{icon} {label}</button>
            ))}
          </div>
        </div>
      </Card>
      <SH>Anthropic API Key</SH>
      <Card style={{padding:16,marginBottom:20}}>
        <p style={{fontSize:13,color:S.muted,marginBottom:12,lineHeight:1.6}}>Required for AI transcript processing in the Intel Log tab. Get your free key at <strong style={{color:S.blue}}>console.anthropic.com</strong> under API Keys. Each transcript costs roughly $0.01–0.05.</p>
        <Field label='API Key (starts with sk-ant-)' value={key} onChange={setKey}/>
        <Btn variant='primary' onClick={saveKey}>{saved?'Saved!':'Save API Key'}</Btn>
      </Card>
      <SH>Account Settings</SH>
      <Card style={{padding:16,marginBottom:20}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
          <Field label='Account Name' value={acct.name} onChange={v=>setAcct(p=>({...p,name:v}))} style={{gridColumn:'span 2'}}/>
          <Field label='Short Name' value={acct.short} onChange={v=>setAcct(p=>({...p,short:v}))}/>
          <Field label='Status' value={acct.status} onChange={v=>setAcct(p=>({...p,status:v}))} options={['Strategic','Active','Prospect','At Risk']}/>
          <Field label='Industry' value={acct.industry} onChange={v=>setAcct(p=>({...p,industry:v}))}/>
          <Field label='HQ' value={acct.hq} onChange={v=>setAcct(p=>({...p,hq:v}))}/>
          <Field label='Cloud Environment' value={acct.cloud} onChange={v=>setAcct(p=>({...p,cloud:v}))} style={{gridColumn:'span 2'}}/>
          <Field label='User Count' value={acct.users} onChange={v=>setAcct(p=>({...p,users:v}))}/>
          <Field label='Relationship Length' value={acct.relationship} onChange={v=>setAcct(p=>({...p,relationship:v}))}/>
        </div>
        <Field label='Account Notes' value={acct.notes} onChange={v=>setAcct(p=>({...p,notes:v}))} multiline/>
      </Card>
      <SH>Data Management</SH>
      <div style={{display:'flex',gap:8}}>
        <Btn onClick={exportData}>Export JSON Backup</Btn>
        <Btn variant='danger' onClick={()=>{if(window.confirm('Reset everything to sample BHSI data?'))setData(SAMPLE)}}>Reset to Sample Data</Btn>
      </div>
    </div>
  )
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

function Dashboard({acct}) {
  const [groupBy,setGroupBy] = useState('monthly')
  const [selectedContacts,setSelectedContacts] = useState([])
  const [expandedId,setExpandedId] = useState(null)

  const allContacts = Array.from(new Set(acct.interactions.map(i=>i.contact).filter(Boolean))).sort()

  // Contact multi-filter — empty = all
  const filtered = selectedContacts.length===0
    ? acct.interactions
    : acct.interactions.filter(i=>selectedContacts.includes(i.contact))

  // Stats (from all interactions, independent of filter)
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const thisMonthCount = acct.interactions.filter(i=>(i.date||'').startsWith(thisMonth)).length
  const cntMap={}; acct.interactions.forEach(i=>{if(i.contact)cntMap[i.contact]=(cntMap[i.contact]||0)+1})
  const topContact = Object.entries(cntMap).sort((a,b)=>b[1]-a[1])[0]
  const typeMap={}; acct.interactions.forEach(i=>{if(i.type)typeMap[i.type]=(typeMap[i.type]||0)+1})
  const topType = Object.entries(typeMap).sort((a,b)=>b[1]-a[1])[0]

  // Week key = ISO date string of that Monday
  const getMonday = d => { const m=new Date(d); m.setDate(d.getDate()-((d.getDay()+6)%7)); m.setHours(0,0,0,0); return m }
  const getWeekKey = dateStr => { if(!dateStr)return null; return getMonday(new Date(dateStr+'T12:00:00')).toISOString().split('T')[0] }
  const getMonthKey = dateStr => dateStr?dateStr.slice(0,7):null

  // Generate last 12 week/month bucket keys
  const currentMonday = getMonday(new Date(now))
  const buckets = []
  if (groupBy==='weekly') {
    for (let i=11;i>=0;i--) { const m=new Date(currentMonday); m.setDate(currentMonday.getDate()-i*7); buckets.push(m.toISOString().split('T')[0]) }
  } else {
    for (let i=11;i>=0;i--) { const d=new Date(now.getFullYear(),now.getMonth()-i,1); buckets.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`) }
  }

  // Build chart data — each bucket has counts + stored interactions per type
  const bucketMap = {}
  buckets.forEach(b => {
    bucketMap[b] = {key:b}
    INTERACTION_TYPES.forEach(t => { bucketMap[b][t]=0; bucketMap[b]['_'+t]=[] })
  })
  filtered.forEach(ix => {
    const bk = groupBy==='weekly' ? getWeekKey(ix.date) : getMonthKey(ix.date)
    if (!bk||!bucketMap[bk]) return
    if (INTERACTION_TYPES.includes(ix.type)) { bucketMap[bk][ix.type]++; bucketMap[bk]['_'+ix.type].push(ix) }
  })
  const chartData = buckets.map(b=>bucketMap[b])

  const fmtBucket = key => {
    if (!key) return ''
    if (groupBy==='weekly') return new Date(key+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})
    const [y,m]=key.split('-'); return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-US',{month:'short',year:'2-digit'})
  }

  const renderTooltip = ({active,payload,label}) => {
    if (!active||!payload?.length||!bucketMap[label]) return null
    const bucket = bucketMap[label]
    if (!INTERACTION_TYPES.some(t=>bucket[t]>0)) return null
    const dateLabel = groupBy==='weekly' ? `Week of ${fmtDate(label)}`
      : (()=>{ const [y,m]=label.split('-'); return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'}) })()
    return (
      <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,padding:'10px 14px',maxWidth:300,boxShadow:'0 4px 16px rgba(0,0,0,0.5)'}}>
        <div style={{fontSize:12,fontWeight:700,color:S.txt,marginBottom:8}}>{dateLabel}</div>
        {INTERACTION_TYPES.filter(t=>bucket[t]>0).map(t=>(
          <div key={t} style={{marginBottom:6}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
              <div style={{width:8,height:8,borderRadius:2,background:INTERACTION_COLORS[t],flexShrink:0}}/>
              <span style={{fontSize:12,color:INTERACTION_COLORS[t],fontWeight:600}}>{t} · {bucket[t]}</span>
            </div>
            {bucket['_'+t].map((ix,i)=>(
              <div key={i} style={{fontSize:11,paddingLeft:14,marginBottom:1}}>
                {ix.contact&&<span style={{color:S.secondary,fontWeight:500}}>{ix.contact}</span>}
                {ix.topics&&<span style={{color:S.muted}}> · {ix.topics.slice(0,70)}{ix.topics.length>70?'…':''}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  const feedItems = [...filtered].sort((a,b)=>(b.date||'').localeCompare(a.date||''))

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:700,color:S.txt}}>Interaction Dashboard</div>
        <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:7,padding:2}}>
          {['weekly','monthly'].map(v=>(
            <button key={v} onClick={()=>setGroupBy(v)} style={{padding:'5px 14px',borderRadius:5,border:'none',background:groupBy===v?S.blue:'transparent',color:groupBy===v?'#fff':S.muted,fontSize:12,fontWeight:600,cursor:'pointer'}}>{v==='weekly'?'Weekly':'Monthly'}</button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
        <Card style={{padding:'12px 14px'}}>
          <div style={{fontSize:10,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>This Month</div>
          <div style={{fontSize:22,fontWeight:700,color:S.txt}}>{thisMonthCount}</div>
          <div style={{fontSize:11,color:S.muted}}>interaction{thisMonthCount!==1?'s':''}</div>
        </Card>
        <Card style={{padding:'12px 14px'}}>
          <div style={{fontSize:10,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Most Contacted</div>
          {topContact
            ?<><div style={{fontSize:15,fontWeight:700,color:S.txt,marginBottom:1,lineHeight:1.3}}>{topContact[0]}</div><div style={{fontSize:11,color:S.muted}}>{topContact[1]} interaction{topContact[1]!==1?'s':''}</div></>
            :<div style={{fontSize:13,color:S.dim}}>—</div>}
        </Card>
        <Card style={{padding:'12px 14px'}}>
          <div style={{fontSize:10,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Top Activity Type</div>
          {topType
            ?<><div style={{fontSize:15,fontWeight:700,color:INTERACTION_COLORS[topType[0]]||S.txt,marginBottom:1}}>{topType[0]}</div><div style={{fontSize:11,color:S.muted}}>{topType[1]} total</div></>
            :<div style={{fontSize:13,color:S.dim}}>—</div>}
        </Card>
      </div>

      {/* Contact filter chips */}
      <div style={{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center',marginBottom:12}}>
        <span style={{fontSize:11,color:S.muted,flexShrink:0}}>Filter:</span>
        <button onClick={()=>setSelectedContacts([])} style={{padding:'3px 10px',borderRadius:999,border:`1px solid ${selectedContacts.length===0?S.blue:S.bdr}`,background:selectedContacts.length===0?'rgba(59,130,246,0.15)':'transparent',color:selectedContacts.length===0?S.blue:S.muted,fontSize:11,fontWeight:600,cursor:'pointer'}}>All Contacts</button>
        {allContacts.map(c=>(
          <button key={c} onClick={()=>setSelectedContacts(p=>p.includes(c)?p.filter(x=>x!==c):[...p,c])} style={{padding:'3px 10px',borderRadius:999,border:`1px solid ${selectedContacts.includes(c)?S.blue:S.bdr}`,background:selectedContacts.includes(c)?'rgba(59,130,246,0.15)':'transparent',color:selectedContacts.includes(c)?S.blue:S.muted,fontSize:11,fontWeight:500,cursor:'pointer'}}>{c}</button>
        ))}
      </div>

      {/* Type legend */}
      <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
        {INTERACTION_TYPES.filter(t=>filtered.some(i=>i.type===t)).map(t=>(
          <div key={t} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6}}>
            <div style={{width:9,height:9,borderRadius:2,background:INTERACTION_COLORS[t]}}/>
            <span style={{fontSize:11,color:S.txt,fontWeight:600}}>{filtered.filter(i=>i.type===t).length}</span>
            <span style={{fontSize:11,color:S.muted}}>{t}</span>
          </div>
        ))}
      </div>

      {/* Chart or empty state */}
      {acct.interactions.length===0
        ?<div style={{textAlign:'center',padding:'50px 20px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:600,color:S.muted,marginBottom:6}}>No interactions logged yet</div>
          <div style={{fontSize:12,color:S.dim,lineHeight:1.6,maxWidth:380,margin:'0 auto'}}>Process a call transcript in Intel Log to automatically populate this dashboard.</div>
        </div>
        :<Card style={{padding:'16px 8px 8px',marginBottom:16}}>
          <ResponsiveContainer width='100%' height={280}>
            <BarChart data={chartData} margin={{top:0,right:16,bottom:0,left:0}}>
              <CartesianGrid strokeDasharray='3 3' stroke={S.bdr} vertical={false}/>
              <XAxis dataKey='key' tickFormatter={fmtBucket} tick={{fontSize:11,fill:S.muted}} axisLine={{stroke:S.bdr}} tickLine={false}/>
              <YAxis allowDecimals={false} tick={{fontSize:11,fill:S.muted}} axisLine={false} tickLine={false}/>
              <RechartsTooltip content={renderTooltip} cursor={{fill:S.surf2}}/>
              {INTERACTION_TYPES.map((t,i)=><Bar key={t} dataKey={t} stackId='a' fill={INTERACTION_COLORS[t]} radius={i===INTERACTION_TYPES.length-1?[3,3,0,0]:[0,0,0,0]}/>)}
            </BarChart>
          </ResponsiveContainer>
        </Card>
      }

      {/* Activity feed */}
      {filtered.length>0&&<>
        <SH mt={4}>Activity Feed</SH>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          {feedItems.map(ix=>{
            const isExp=expandedId===ix.id
            const tc=INTERACTION_COLORS[ix.type]||S.muted
            return (
              <div key={ix.id} onClick={()=>setExpandedId(isExp?null:ix.id)} style={{background:S.surf,border:`1px solid ${S.bdr}`,borderLeft:`3px solid ${tc}`,borderRadius:7,padding:'8px 12px',cursor:'pointer'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <Badge label={ix.type||'Note'} color={tc} bg={tc+'1a'} size={10}/>
                  <span style={{fontSize:11,color:S.muted,flexShrink:0}}>{fmtDate(ix.date)}</span>
                  {ix.contact&&<span style={{fontSize:12,color:S.txt,fontWeight:600,flexShrink:0}}>{ix.contact}</span>}
                  {ix.topics&&<span style={{fontSize:11,color:S.secondary,flex:1,minWidth:0,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{ix.topics}</span>}
                </div>
                {isExp&&ix.summary&&<div style={{fontSize:12,color:S.secondary,marginTop:7,lineHeight:1.6,borderTop:`1px solid ${S.bdr}`,paddingTop:7}}>{ix.summary}</div>}
              </div>
            )
          })}
        </div>
      </>}
    </div>
  )
}

function Sidebar({data,activeId,setActiveId,setData,onNavigate,searchRef,lastSaved,theme,setTheme}) {
  const [showAdd,setShowAdd] = useState(false)
  const [newName,setNewName] = useState('')
  const [collapsed,setCollapsed] = useState(false)
  const [searchQ,setSearchQ] = useState('')

  useEffect(()=>{
    const check=()=>{if(window.innerWidth<768)setCollapsed(true)}
    check()
    window.addEventListener('resize',check)
    return()=>window.removeEventListener('resize',check)
  },[])

  const addAccount=()=>{if(!newName.trim())return;const id=uid();setData(p=>({...p,accounts:[...p.accounts,{...SAMPLE.accounts[0],id,name:newName,short:newName.slice(0,5).toUpperCase(),contacts:[],techStack:[],projects:[],interactions:[],intelLog:[],followUps:[],unknownMentions:[],relSuggestions:[]}]}));setActiveId(id);setShowAdd(false);setNewName('')}
  const sc={Strategic:'#a855f7',Active:'#22c55e',Prospect:'#3b82f6','At Risk':'#ef4444'}
  const searchResults = globalSearch(data, searchQ)
  const grouped = {}
  searchResults.forEach(r=>{if(!grouped[r.category])grouped[r.category]=[];grouped[r.category].push(r)})

  return (
    <div style={{width:collapsed?48:220,background:S.sidebarBg,borderRight:`1px solid ${S.bdr}`,display:'flex',flexDirection:'column',flexShrink:0,height:'100%',transition:'width 0.2s',overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:collapsed?'center':'space-between',padding:collapsed?'12px 0 4px':'12px 10px 4px'}}>
        {!collapsed&&<div>
          <div style={{fontSize:10,fontWeight:800,color:S.blue,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:2}}>GuidePoint</div>
          <div style={{fontSize:12,fontWeight:700,color:S.txt}}>Account Intel</div>
        </div>}
        <button onClick={()=>setCollapsed(c=>!c)} title={collapsed?'Expand sidebar':'Collapse sidebar'} style={{background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,cursor:'pointer',fontSize:13,padding:'3px 7px',lineHeight:1,flexShrink:0}}>{collapsed?'»':'«'}</button>
      </div>
      {!collapsed&&(
        <div style={{padding:'0 8px 6px'}}>
          <input
            ref={searchRef}
            value={searchQ}
            onChange={e=>setSearchQ(e.target.value)}
            placeholder='Search... (press /)'
            style={{width:'100%',fontSize:11,padding:'6px 10px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,boxSizing:'border-box'}}
          />
        </div>
      )}
      {!collapsed&&searchResults.length>0&&(
        <div style={{maxHeight:260,overflowY:'auto',borderTop:`1px solid ${S.bdr}`,borderBottom:`1px solid ${S.bdr}`,background:S.surf2,flexShrink:0}}>
          {Object.entries(grouped).map(([cat,items])=>(
            <div key={cat}>
              <div style={{fontSize:9,fontWeight:700,color:S.muted,letterSpacing:'0.1em',textTransform:'uppercase',padding:'6px 10px 2px'}}>{cat}</div>
              {items.map((r,i)=>(
                <button key={i} onClick={()=>{onNavigate(r.accountId,r.tab);setSearchQ('')}} style={{display:'block',width:'100%',textAlign:'left',padding:'5px 10px 5px',background:'transparent',border:'none',cursor:'pointer',borderRadius:0}} onMouseEnter={e=>e.currentTarget.style.background='rgba(59,130,246,0.08)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{fontSize:12,fontWeight:600,color:S.txt,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.label}</div>
                  <div style={{fontSize:10,color:S.muted,display:'flex',gap:4}}>
                    <span style={{flexShrink:0}}>{r.accountName}</span>
                    {r.sublabel&&<span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>· {r.sublabel}</span>}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {!collapsed&&<div style={{fontSize:10,fontWeight:700,color:S.muted,letterSpacing:'0.08em',textTransform:'uppercase',padding:'4px 14px'}}>My Accounts</div>}
      <div style={{flex:1,overflowY:'auto',padding:collapsed?'4px 6px':'0 8px'}}>
        {data.accounts.map(a=>{
          const hs=calcHealthScore(a)
          const hc=hs>=70?S.green:hs>=40?S.orange:S.red
          return (
          collapsed
          ? <button key={a.id} onClick={()=>setActiveId(a.id)} title={`${a.name} (Health: ${hs})`} style={{display:'flex',alignItems:'center',justifyContent:'center',width:'100%',padding:'5px 0',border:'none',background:'transparent',cursor:'pointer',marginBottom:3,borderRadius:7}}>
              <div style={{width:34,height:34,borderRadius:'50%',background:activeId===a.id?'rgba(59,130,246,0.2)':S.surf,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:activeId===a.id?S.blue:S.muted,border:`1px solid ${activeId===a.id?S.blue:S.bdr}`,flexShrink:0}}>
                {initials(a.short||a.name)}
              </div>
            </button>
          : <button key={a.id} onClick={()=>setActiveId(a.id)} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'8px',borderRadius:7,border:'none',background:activeId===a.id?'rgba(59,130,246,0.12)':'transparent',textAlign:'left',cursor:'pointer',marginBottom:2}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:sc[a.status]||S.muted,flexShrink:0}}/>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:12,fontWeight:600,color:activeId===a.id?S.blue:S.txt,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.short||a.name}</div>
                <div style={{fontSize:10,color:S.muted}}>{a.status}</div>
              </div>
              <span style={{fontSize:11,fontWeight:700,color:hc,flexShrink:0}}>{hs}</span>
            </button>
          )
        })}
      </div>
      {!collapsed&&<div style={{padding:'8px 10px',borderTop:`1px solid ${S.bdr}`}}>
        {showAdd?<div>
          <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder='Account name...' onKeyDown={e=>e.key==='Enter'&&addAccount()} style={{marginBottom:6,fontSize:12}}/>
          <div style={{display:'flex',gap:5}}>
            <Btn variant='primary' onClick={addAccount} style={{flex:1,justifyContent:'center',fontSize:12,padding:'5px 8px'}}>Add</Btn>
            <Btn onClick={()=>{setShowAdd(false);setNewName('')}} style={{fontSize:12,padding:'5px 8px'}}>x</Btn>
          </div>
        </div>:<button onClick={()=>setShowAdd(true)} style={{display:'flex',alignItems:'center',gap:6,width:'100%',padding:'7px 8px',background:'transparent',border:`1px dashed ${S.bdr}`,borderRadius:7,color:S.muted,fontSize:12,cursor:'pointer'}}>+ New Account</button>}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6,paddingTop:6,borderTop:`1px solid ${S.bdr}`}}>
          <span style={{fontSize:10,color:S.dim}}>Appearance</span>
          <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:5,padding:2}}>
            <button onClick={()=>setTheme('light')} title='Light mode' style={{padding:'2px 7px',borderRadius:4,border:'none',background:theme==='light'?S.surf:'transparent',color:theme==='light'?S.blue:S.muted,fontSize:13,cursor:'pointer',lineHeight:1.4}}>☀</button>
            <button onClick={()=>setTheme('dark')} title='Dark mode' style={{padding:'2px 7px',borderRadius:4,border:'none',background:theme==='dark'?S.surf:'transparent',color:theme==='dark'?S.blue:S.muted,fontSize:13,cursor:'pointer',lineHeight:1.4}}>☾</button>
          </div>
        </div>
        {lastSaved&&<div style={{fontSize:10,color:S.dim,textAlign:'center',marginTop:4}}>Last saved: {lastSaved}</div>}
      </div>}
    </div>
  )
}

const TABS = [{id:'overview',label:'Overview'},{id:'dashboard',label:'Dashboard'},{id:'contacts',label:'Contacts'},{id:'stack',label:'Tech Stack'},{id:'projects',label:'Projects'},{id:'followups',label:'Follow-Ups'},{id:'intel',label:'Intel Log'},{id:'settings',label:'Settings'}]

export default function App() {
  const [data,setData] = useState(null)
  const [activeId,setActiveId] = useState('bhsi')
  const [tab,setTab] = useState('overview')
  const searchRef = useRef(null)
  const [lastSavedLabel,setLastSavedLabel] = useState('')
  const [theme,setTheme] = useState(()=>{
    const t = localStorage.getItem('gp-theme')||'dark'
    document.documentElement.setAttribute('data-theme',t)
    return t
  })

  // Update module-level S on every render so all child components see the right theme
  S = theme==='light' ? LIGHT_THEME : DARK_THEME

  const handleSetTheme = t => {
    setTheme(t)
    localStorage.setItem('gp-theme',t)
    document.documentElement.setAttribute('data-theme',t)
  }

  useEffect(()=>{ loadData().then(d=>{ if(d) setData(d); else setData(SAMPLE) }) },[])

  useEffect(()=>{
    if(!data) return
    saveData(data)
    const saved = new Date()
    setLastSavedLabel('just now')
    const iv = setInterval(()=>{
      const mins=Math.floor((new Date()-saved)/60000)
      if(mins<1)setLastSavedLabel('just now')
      else if(mins===1)setLastSavedLabel('1 min ago')
      else setLastSavedLabel(`${mins} mins ago`)
    },30000)
    return()=>clearInterval(iv)
  },[data])

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

  if (!data) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:S.bg,color:S.muted,fontSize:14}}>Loading...</div>

  const acct = data.accounts.find(a=>a.id===activeId)||data.accounts[0]
  const setAcct = fn => setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===acct.id?(typeof fn==='function'?fn(a):fn):a)}))
  const critHighCount = (acct.followUps||[]).filter(f=>f.status==='Open'&&(f.priority==='Critical'||f.priority==='High')).length

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:S.bg}}>
      <Sidebar
        data={data}
        activeId={activeId}
        setActiveId={id=>{setActiveId(id);setTab('overview')}}
        setData={setData}
        onNavigate={(id,t)=>{setActiveId(id);setTab(t)}}
        searchRef={searchRef}
        lastSaved={lastSavedLabel}
        theme={theme}
        setTheme={handleSetTheme}
      />
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{background:S.headerBg,borderBottom:`1px solid ${S.bdr}`,padding:'10px 20px 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
            <div>
              <div style={{fontSize:10,color:S.blue,fontWeight:800,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:2}}>{acct.status}</div>
              <div style={{fontSize:17,fontWeight:800,color:S.txt}}>{acct.name}</div>
            </div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap',justifyContent:'flex-end'}}>
              {[acct.industry,acct.hq,'Last contact: '+fmtDate(acct.lastContact)].filter(Boolean).map(t=><span key={t} style={{fontSize:11,color:S.muted,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:999,padding:'2px 10px'}}>{t}</span>)}
            </div>
          </div>
          <div style={{display:'flex',overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'7px 14px',background:'transparent',border:'none',cursor:'pointer',fontSize:12,fontWeight:600,color:tab===t.id?S.blue:S.muted,borderBottom:tab===t.id?`2px solid ${S.blue}`:'2px solid transparent',whiteSpace:'nowrap',display:'inline-flex',alignItems:'center',gap:5,flexShrink:0}}>
                {t.label}
                {t.id==='intel'&&acct.intelLog.length>0&&<span style={{fontSize:10,fontWeight:700,background:tab===t.id?'rgba(59,130,246,0.2)':'rgba(100,116,139,0.15)',color:tab===t.id?S.blue:S.muted,borderRadius:999,padding:'1px 6px',lineHeight:'16px'}}>{acct.intelLog.length}</span>}
                {t.id==='followups'&&critHighCount>0&&<span style={{fontSize:10,fontWeight:700,background:S.red,color:'#fff',borderRadius:999,padding:'1px 6px',lineHeight:'16px'}}>{critHighCount}</span>}
              </button>
            ))}
          </div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'18px 20px 60px',background:S.bg}}>
          {tab==='overview'&&<Overview acct={acct} setAcct={setAcct} setTab={setTab}/>}
          {tab==='dashboard'&&<Dashboard acct={acct}/>}
          {tab==='contacts'&&<Contacts acct={acct} setAcct={setAcct}/>}
          {tab==='stack'&&<TechStack acct={acct} setAcct={setAcct}/>}
          {tab==='projects'&&<Projects acct={acct} setAcct={setAcct}/>}
          {tab==='followups'&&<FollowUps acct={acct} setAcct={setAcct}/>}
          {tab==='intel'&&<IntelLog acct={acct} setAcct={setAcct} apiKey={data.apiKey}/>}
          {tab==='settings'&&<Settings data={data} setData={setData} acct={acct} setAcct={setAcct} theme={theme} setTheme={handleSetTheme}/>}
        </div>
      </div>
    </div>
  )
}
