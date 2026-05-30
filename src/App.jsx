
import { useState, useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { loadData, saveData } from './supabase.js'

const SK = 'gp-crm-v4'
const DARK_THEME = { bg:'#0a0e1a', surf:'#111827', surf2:'#0f1729', bdr:'#1e2d40', bdr2:'#2d3d50', txt:'#e2e8f0', muted:'#64748b', dim:'#334155', blue:'#3b82f6', green:'#22c55e', red:'#ef4444', orange:'#f97316', yellow:'#eab308', purple:'#a855f7', secondary:'#94a3b8', sidebarBg:'#060a12', headerBg:'#0c1017' }
const LIGHT_THEME = { bg:'#f1f5f9', surf:'#ffffff', surf2:'#f8fafc', bdr:'#e2e8f0', bdr2:'#cbd5e1', txt:'#0f172a', muted:'#64748b', dim:'#94a3b8', blue:'#3b82f6', green:'#22c55e', red:'#ef4444', orange:'#f97316', yellow:'#ca8a04', purple:'#a855f7', secondary:'#475569', sidebarBg:'#e2e8f0', headerBg:'#f1f5f9' }
let S = DARK_THEME
const PC = { Critical:{c:'#ef4444',b:'rgba(239,68,68,0.12)'}, High:{c:'#f97316',b:'rgba(249,115,22,0.12)'}, Medium:{c:'#eab308',b:'rgba(234,179,8,0.12)'}, Low:{c:'#22c55e',b:'rgba(34,197,94,0.12)'} }
const IC = { 'Executive Sponsor':{c:'#a855f7',b:'rgba(168,85,247,0.12)'}, 'Technical Gatekeeper':{c:'#3b82f6',b:'rgba(59,130,246,0.12)'}, 'Financial Gatekeeper':{c:'#eab308',b:'rgba(234,179,8,0.12)'}, 'Final Approval':{c:'#ef4444',b:'rgba(239,68,68,0.12)'}, 'Stakeholder':{c:'#64748b',b:'rgba(100,116,139,0.12)'}, 'Risk Factor':{c:'#f97316',b:'rgba(249,115,22,0.12)'}, 'Ally':{c:'#22c55e',b:'rgba(34,197,94,0.12)'} }
const SC = { Current:'#22c55e', Selected:'#3b82f6', Evaluating:'#3b82f6', Replacing:'#f97316', Watch:'#a855f7', Dropping:'#ef4444' }
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
const calcDetailedHealthScore = acct => {
  const ov = acct.healthScoreOverrides || {}
  const strong=(acct.contacts||[]).filter(c=>c.relStatus==='Strong').length
  const building=(acct.contacts||[]).filter(c=>c.relStatus==='Building').length
  const needsAttn=(acct.contacts||[]).filter(c=>c.relStatus==='Needs Attention').length
  const relCalc=Math.max(0,Math.min(25,Math.min(strong*5,15)+Math.min(building*2,8)-needsAttn*3))
  const relVal=ov.relationship?.value??relCalc
  const lastDays=acct.lastContact?daysSince(acct.lastContact)??999:999
  const engCalc=lastDays<=7?20:lastDays<=14?15:lastDays<=30?10:lastDays<=60?5:0
  const engVal=ov.engagement?.value??engCalc
  const inFl=(acct.projects||[]).filter(p=>p.status==='In Flight').length
  const inDs=(acct.projects||[]).filter(p=>p.status==='In Discussion').length
  const stl=(acct.projects||[]).filter(p=>p.status==='Stalled').length
  const pipeCalc=Math.max(0,Math.min(20,Math.min(inFl*7,14)+Math.min(inDs*3,9)-stl*5))
  const pipeVal=ov.pipeline?.value??pipeCalc
  const critFU=(acct.followUps||[]).filter(f=>f.status==='Open'&&f.priority==='Critical').length
  const ren60=(acct.techStack||[]).filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=60}).length
  const negSen=(acct.contacts||[]).filter(c=>c.sentiment==='negative').length
  const lostP=(acct.projects||[]).filter(p=>p.status==='Lost').length
  const riskCalc=Math.max(0,20-critFU*4-ren60*3-negSen*3-lostP*2)
  const riskVal=ov.risk?.value??riskCalc
  const evalVend=(acct.techStack||[]).filter(t=>t.status==='Evaluating').length
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-180)
  const won180=(acct.projects||[]).filter(p=>{if(p.status!=='Won')return false;const ls=p.timeline?.filter(s=>s.status==='completed').slice(-1)[0];return ls?.date&&new Date(ls.date+'T12:00:00')>=cutoff}).length
  const oppCalc=Math.min(15,Math.min(evalVend*3,9)+Math.min(won180*6,12))
  const oppVal=ov.opportunity?.value??oppCalc
  const calcTotal=Math.max(0,Math.min(100,relVal+engVal+pipeVal+riskVal+oppVal))
  const total=ov.totalOverride!==undefined?Math.max(0,Math.min(100,Number(ov.totalOverride))):calcTotal
  const helpArr=[
    strong>0&&{pts:Math.min(strong*5,15),label:`${strong} Strong relationship${strong!==1?'s':''}`},
    engVal>0&&{pts:engVal,label:lastDays<=7?'Contacted within 7 days':lastDays<=14?'Contacted this week':lastDays<=30?'Contacted this month':'Recent contact logged'},
    inFl>0&&{pts:Math.min(inFl*7,14),label:`${inFl} in-flight project${inFl!==1?'s':''}`},
    inDs>0&&{pts:Math.min(inDs*3,9),label:`${inDs} project${inDs!==1?'s':''} in discussion`},
    evalVend>0&&{pts:Math.min(evalVend*3,9),label:`${evalVend} vendor${evalVend!==1?'s':''} being evaluated`},
    won180>0&&{pts:Math.min(won180*6,12),label:`${won180} project${won180!==1?'s':''} won recently`},
    building>0&&{pts:Math.min(building*2,8),label:`${building} Building relationship${building!==1?'s':''}`},
  ].filter(Boolean).sort((a,b)=>b.pts-a.pts).slice(0,3)
  const hurtArr=[
    critFU>0&&{pts:critFU*4,label:`${critFU} Critical follow-up${critFU!==1?'s':''} open`},
    stl>0&&{pts:stl*5,label:`${stl} stalled project${stl!==1?'s':''}`},
    ren60>0&&{pts:ren60*3,label:`${ren60} renewal${ren60!==1?'s':''} due within 60 days`},
    negSen>0&&{pts:negSen*3,label:`${negSen} contact${negSen!==1?'s':''} with negative sentiment`},
    needsAttn>0&&{pts:needsAttn*3,label:`${needsAttn} contact${needsAttn!==1?'s':''} needing attention`},
    lostP>0&&{pts:lostP*2,label:`${lostP} lost project${lostP!==1?'s':''}`},
  ].filter(Boolean).sort((a,b)=>b.pts-a.pts).slice(0,3)
  return {
    components:[
      {key:'relationship',label:'Relationship Strength',value:relVal,max:25,calc:relCalc,overridden:!!ov.relationship,override:ov.relationship},
      {key:'engagement',label:'Engagement Recency',value:engVal,max:20,calc:engCalc,overridden:!!ov.engagement,override:ov.engagement},
      {key:'pipeline',label:'Active Pipeline',value:pipeVal,max:20,calc:pipeCalc,overridden:!!ov.pipeline,override:ov.pipeline},
      {key:'risk',label:'Risk Factors',value:riskVal,max:20,calc:riskCalc,overridden:!!ov.risk,override:ov.risk},
      {key:'opportunity',label:'Opportunity Coverage',value:oppVal,max:15,calc:oppCalc,overridden:!!ov.opportunity,override:ov.opportunity},
    ],
    total,calcTotal,isManualOverride:ov.totalOverride!==undefined,helping:helpArr,hurting:hurtArr
  }
}
const calcHealthScore = acct => calcDetailedHealthScore(acct).total
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
      {id:'c1',contactType:'Client',name:'Jamie Jervey',title:'CISO',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'Information Security',influence:'Executive Sponsor',sentiment:'positive',relStatus:'Strong',toolsOwn:'Overall security portfolio',goals:'Strategic security partner. Modern transparent SOC.',pains:'Too many vendor voices. No clean decision framework. Overloaded.',notes:'Ultimate decision authority. Values trusted partners. Target for ORBIE Award Boston.',personalNotes:'Loves executive networking and camera presence. High-value intimate experiences over golf outings.',lastInteracted:'2026-03-13',vendorCompany:'',internalMeetings:[]},
      {id:'c2',contactType:'Client',name:'Rudy Montoya',title:'AVP, Information Security',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'Information Security',influence:'Technical Gatekeeper',sentiment:'positive',relStatus:'Strong',toolsOwn:'Entire security stack — runs day-to-day InfoSec',goals:'Defensible transparent architecture. No fake procurement.',pains:'10X delivery issues. QRadar migration complexity. Team asking approval on everything.',notes:'PRIMARY RELATIONSHIP. Candid, long memory, hates buzzwords and black-box. If Rudy respects you the account opens.',personalNotes:'Avid photographer (Leica D-Lux 7, black and white). 3D printing (Bamboo printer). Firearms enthusiast. Recently traveled to Italy.',lastInteracted:'2026-05-19',vendorCompany:'',internalMeetings:[]},
      {id:'c3',contactType:'Client',name:'Marc Wood',title:'CIO',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'IT',influence:'Financial Gatekeeper',sentiment:'neutral',relStatus:'Needs Attention',toolsOwn:'IT strategy and all technology investments',goals:'Data-driven governance. Strict ROI.',pains:'Vendors who cannot justify spend clearly.',notes:'Hardball negotiator. Does not do favors for vendors. Build through Rudy and Jamie — do not approach directly.',personalNotes:'',lastInteracted:'',vendorCompany:'',internalMeetings:[]},
      {id:'c4',contactType:'Client',name:'Dave Bresnahan',title:'COO',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'Executive',influence:'Final Approval',sentiment:'neutral',relStatus:'Needs Attention',toolsOwn:'Strategic veto on major vendor decisions',goals:'Operational risk management. Clean decision process.',pains:'Availability due to international travel.',notes:'Final sign-off and approval bottleneck. Frame all material as risk decision not feature comparison.',personalNotes:'',lastInteracted:'',vendorCompany:'',internalMeetings:[]},
      {id:'c5',contactType:'Client',name:'Jamie Dennis',title:'QA / Compliance',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'IT Compliance',influence:'Stakeholder',sentiment:'neutral',relStatus:'Building',toolsOwn:'Compliance processes and infrastructure alignment',goals:'Clean infrastructure deployments.',pains:'Not kept in loop by vendors and internal teams.',notes:'Critical for infrastructure buy-in. Pinged Mike 5/19 on Saviynt contract. Without his alignment deployments stall.',personalNotes:'',lastInteracted:'2026-05-19',vendorCompany:'',internalMeetings:[]},
      {id:'c6',contactType:'Client',name:'Bill Randall',title:'Future BHSI SOC Director',email:'',cell:'',linkedin:'',location:'Rhode Island (military deployment)',dept:'GuidePoint to BHSI',influence:'Ally',sentiment:'positive',relStatus:'Strong',toolsOwn:'FIDO2 analysis and secure browser evaluation',goals:'Join BHSI as SOC Director. Build modern SOC.',pains:'Currently on military deployment — transition in progress.',notes:'Deeply trusted by Rudy. Expected to join BHSI as SOC Director May 2026. FIDO2 and browser work must be documented before GuidePoint departure.',personalNotes:'Military deployment Guam/Rhode Island.',lastInteracted:'',vendorCompany:'',internalMeetings:[]},
      {id:'c7',contactType:'Client',name:'Jake (SOC)',title:'SOC Engineer',email:'',cell:'',linkedin:'',location:'Boston, MA',dept:'Information Security',influence:'Risk Factor',sentiment:'negative',relStatus:'Needs Attention',toolsOwn:'Internal SOC engineering — moved team to 1Password unilaterally',goals:'Modern SOC tooling his way.',pains:'Feels ignored by security leadership.',notes:'Favors ReliaQuest and 10X internally. Slowed CyberArk WPM eval. Do NOT rely as champion. Rudy is frustrated with him.',personalNotes:'',lastInteracted:'',vendorCompany:'',internalMeetings:[]},
      {id:'c8',contactType:'Internal',name:'Mike Chiricosta',title:'Enterprise Client Manager',email:'',cell:'',linkedin:'',location:'',dept:'GuidePoint Security',influence:'Ally',sentiment:'positive',relStatus:'Strong',toolsOwn:'',goals:'',pains:'',notes:'Account owner',personalNotes:'',lastInteracted:'',vendorCompany:'',internalMeetings:[]}
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
    relSuggestions:[],
    dismissedAlerts:[],
    snoozedAlerts:[],
    healthScoreOverrides:{},
    healthScoreHistory:[]
  }]
}

const Badge = ({label,color,bg,size=11}) => <span style={{fontSize:size,fontWeight:600,color,background:bg,padding:'2px 8px',borderRadius:999,whiteSpace:'nowrap',display:'inline-block',lineHeight:'18px'}}>{label}</span>
const Btn = ({children,onClick,variant='ghost',disabled=false,style={}}) => {
  const v = {ghost:{background:'transparent',color:S.muted,border:`1px solid ${S.bdr}`},primary:{background:S.blue,color:'#fff',border:'none'},danger:{background:'rgba(239,68,68,0.1)',color:S.red,border:'1px solid rgba(239,68,68,0.3)'}}
  return <button onClick={onClick} disabled={disabled} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 12px',minHeight:44,borderRadius:6,fontSize:13,fontWeight:500,cursor:disabled?'default':'pointer',opacity:disabled?0.5:1,...v[variant],...style}}>{children}</button>
}
const Field = ({label,value,onChange,type='text',options=null,multiline=false,style={},placeholder=''}) => (
  <div style={{marginBottom:12,...style}}>
    {label&&<div style={{fontSize:11,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{label}</div>}
    {options?<select value={value||''} onChange={e=>onChange(e.target.value)}><option value=''>Select...</option>{options.map(o=><option key={o} value={o}>{o}</option>)}</select>:multiline?<textarea value={value||''} onChange={e=>onChange(e.target.value)} rows={3} placeholder={placeholder}/>:<input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>}
  </div>
)
const Modal = ({title,onClose,children,width=520}) => {
  const mob = typeof window!=='undefined'&&window.innerWidth<768
  return (
  <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:mob?0:16}}>
    <div style={{background:S.surf,border:mob?'none':`1px solid ${S.bdr}`,borderRadius:mob?0:12,width:'100%',maxWidth:mob?'100%':width,height:mob?'100%':'auto',maxHeight:mob?'100%':'90vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0}}>
        <div style={{fontSize:15,fontWeight:700,color:S.txt,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,marginRight:8}}>{title}</div>
        <button onClick={onClose} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,minHeight:44,minWidth:44,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>×</button>
      </div>
      <div style={{padding:20,overflowY:'auto',flex:1}}>{children}</div>
    </div>
  </div>
  )
}
const SH = ({children,mt=0}) => <div style={{fontSize:10,fontWeight:700,color:S.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8,marginTop:mt}}>{children}</div>
const Card = ({children,style={}}) => <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,...style}}>{children}</div>

function HealthScoreModal({acct, setAcct, onClose}) {
  const [editingComp, setEditingComp] = useState(null)
  const [compInput, setCompInput] = useState('')
  const [compReason, setCompReason] = useState('')
  const [totalActive, setTotalActive] = useState(()=>acct.healthScoreOverrides?.totalOverride!==undefined)
  const [totalInput, setTotalInput] = useState(()=>String(acct.healthScoreOverrides?.totalOverride??''))
  const [totalReason, setTotalReason] = useState(()=>acct.healthScoreOverrides?.totalOverrideReason||'')

  const ds = calcDetailedHealthScore(acct)
  const {total:score, isManualOverride, components, helping, hurting} = ds
  const hc = score>=70?S.green:score>=40?S.orange:S.red
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
          <div style={{fontSize:10,fontWeight:700,color:S.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:10}}>Score Breakdown</div>
          {components.map(comp=>{
            const isEdit=editingComp===comp.key
            return (
              <div key={comp.key} style={{marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap'}}>
                      <span style={{fontSize:12,fontWeight:600,color:S.txt}}>{comp.label}</span>
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

function Overview({acct,setAcct,setTab,apiKey}) {
  const [showDismissed,setShowDismissed] = useState(false)
  const [alertModal,setAlertModal] = useState(null)
  const [hoveredAlert,setHoveredAlert] = useState(null)
  const [showAddFU,setShowAddFU] = useState(false)
  const [showAIChat,setShowAIChat] = useState(false)
  const [showHealthModal,setShowHealthModal] = useState(false)
  const [hoveredCard,setHoveredCard] = useState(null)
  const [snoozeOpenFor,setSnoozeOpenFor] = useState(null)
  const [showSnoozed,setShowSnoozed] = useState(false)
  const [snoozeToast,setSnoozeToast] = useState(false)
  const [fuForm,setFuForm] = useState({task:'',contact:'',priority:'High',dueDate:'',context:''})

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
  const effectiveKey = apiKey || import.meta.env.VITE_ANTHROPIC_KEY || ''
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

  const InfoRow = ({label,val}) => (
    <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:`1px solid ${S.bdr}`,fontSize:13,gap:12}}>
      <span style={{color:S.muted,flexShrink:0}}>{label}</span><span style={{color:S.txt,textAlign:'right'}}>{val||'—'}</span>
    </div>
  )

  return (
    <div>
      <style>{`@keyframes aiPulse{0%,100%{opacity:0.85}50%{opacity:1;text-shadow:0 0 12px rgba(14,165,233,0.8)}}`}</style>
      {snoozeToast&&<div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'rgba(34,197,94,0.92)',color:'#fff',padding:'9px 22px',borderRadius:8,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:'0 4px 16px rgba(0,0,0,0.35)',pointerEvents:'none',display:'flex',alignItems:'center',gap:7}}><Clock size={14}/> Snoozed!</div>}
      <div style={{display:'grid',gridTemplateColumns:mob?'repeat(2,1fr)':'repeat(6,1fr)',gap:8,marginBottom:16}}>
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
          const hg=hs>=70?'linear-gradient(135deg,#14532d 0%,#16a34a 50%,#4ade80 100%)':hs>=40?'linear-gradient(135deg,#7c2d12 0%,#ea580c 50%,#fb923c 100%)':'linear-gradient(135deg,#7f1d1d 0%,#dc2626 50%,#f87171 100%)'
          const hh=hs>=70?'filter:brightness(1.1)':'filter:brightness(1.1)'
          return (
            <div onClick={()=>setShowHealthModal(true)}
              style={{background:hg,border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,padding:'16px 20px',cursor:'pointer',transition:'filter 0.2s',boxShadow:'0 2px 8px rgba(0,0,0,0.3)',minHeight:80,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}
              onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.15)'}
              onMouseLeave={e=>e.currentTarget.style.filter='brightness(1)'}>
              <div style={{fontSize:13,color:'rgba(255,255,255,0.9)',fontWeight:600,lineHeight:1.3}}>Health Score</div>
              <div style={{fontSize:32,fontWeight:800,color:'#fff',lineHeight:1,flexShrink:0}}>{hs}</div>
            </div>
          )
        })()}
        {/* Metric cards */}
        {[{label:'Open Follow-Ups',val:openFU.length,c:S.txt,tab:'followups'},{label:'Active Projects',val:inFlight,c:S.txt,tab:'projects'},{label:'Contacts Mapped',val:acct.contacts.length,c:S.txt,tab:'contacts'},{label:'Days Since Contact',val:lastC,c:typeof lastC==='number'&&lastC>14?S.orange:S.green,tab:'intel'}].map(m=>{
          const isHov = hoveredCard===m.label
          return (
            <div key={m.label}
              onClick={()=>setTab(m.tab)}
              onMouseEnter={()=>setHoveredCard(m.label)}
              onMouseLeave={()=>setHoveredCard(null)}
              style={{background:isHov?'linear-gradient(135deg,rgba(0,0,0,0.25) 0%,rgba(0,0,0,0.06) 100%)':'linear-gradient(135deg,rgba(0,0,0,0.20) 0%,rgba(0,0,0,0.04) 100%)',border:`1px solid ${isHov?'rgba(59,130,246,0.4)':S.bdr}`,borderRadius:8,padding:'16px 20px',boxShadow:'0 2px 8px rgba(0,0,0,0.15)',minHeight:80,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,cursor:'pointer',transition:'all 0.15s ease',position:'relative'}}>
              <div style={{fontSize:13,color:S.txt,opacity:0.8,fontWeight:600,lineHeight:1.3,maxWidth:'60%'}}>{m.label}</div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,flexShrink:0}}>
                <div style={{fontSize:32,fontWeight:800,color:m.c,lineHeight:1}}>{m.val}</div>
                <div style={{fontSize:11,color:S.blue,fontWeight:600,opacity:isHov?1:0,transition:'opacity 0.15s ease'}}>View →</div>
              </div>
            </div>
          )
        })}
      </div>
      {showAIChat&&<AIChatModal acct={acct} setAcct={setAcct} effectiveKey={effectiveKey} onClose={()=>setShowAIChat(false)}/>}
      {showHealthModal&&<HealthScoreModal acct={acct} setAcct={setAcct} onClose={()=>setShowHealthModal(false)}/>}
      {alerts.length>0&&(
        <>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div style={{fontSize:10,fontWeight:700,color:S.muted,letterSpacing:'0.1em',textTransform:'uppercase'}}>Alerts</div>
            {visibleAlerts.length>0&&<button onClick={clearAll} style={{fontSize:11,color:S.muted,background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,padding:'2px 8px',cursor:'pointer',lineHeight:'18px'}}>Clear All</button>}
          </div>
          <div style={{marginBottom:16}}>
            {visibleAlerts.map(a=>{
              const c={critical:S.red,high:S.orange,medium:S.yellow}[a.level]||S.muted
              const isHov = hoveredAlert===a.id
              const isSnoozeOpen = snoozeOpenFor===a.id
              return (
                <div key={a.id} style={{position:'relative',marginBottom:5}}>
                  <div
                    onClick={()=>openAlertDetail(a)}
                    onMouseEnter={()=>setHoveredAlert(a.id)}
                    onMouseLeave={()=>setHoveredAlert(null)}
                    style={{display:'flex',gap:10,padding:'8px 12px',background:isHov?S.surf2:S.surf,border:`1px solid ${S.bdr}`,borderLeft:`3px solid ${c}`,borderRadius:7,alignItems:'center',cursor:'pointer',transition:'background 0.1s'}}>
                    <span style={{color:c,flexShrink:0}}>!</span>
                    <span style={{fontSize:13,color:S.secondary,flex:1}}>{a.text}</span>
                    <span style={{fontSize:11,color:S.muted,opacity:isHov?1:0,transition:'opacity 0.15s',flexShrink:0,whiteSpace:'nowrap',marginRight:4}}>→ View details</span>
                    <button onClick={e=>{e.stopPropagation();setSnoozeOpenFor(isSnoozeOpen?null:a.id)}} title='Snooze alert'
                      style={{background:'transparent',border:'none',color:isSnoozeOpen?S.blue:S.dim,cursor:'pointer',padding:'0 4px',lineHeight:1,flexShrink:0,display:'flex',alignItems:'center'}}>
                      <Clock size={14}/>
                    </button>
                    <button onClick={e=>{e.stopPropagation();dismiss(a.id)}} title='Dismiss alert' style={{background:'transparent',border:'none',color:S.dim,cursor:'pointer',fontSize:16,padding:'0 4px',lineHeight:1,flexShrink:0}}>×</button>
                  </div>
                  {isSnoozeOpen&&(
                    <div onClick={e=>e.stopPropagation()} style={{position:'absolute',right:0,top:'calc(100% + 4px)',zIndex:100,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,boxShadow:'0 4px 20px rgba(0,0,0,0.5)',minWidth:210,overflow:'hidden'}}>
                      {[{label:'Later Today',sub:'5:00 PM today',opt:'later'},{label:'Tomorrow',sub:'8:00 AM tomorrow',opt:'tomorrow'},{label:'3 Days from Now',sub:'8:00 AM',opt:'3days'},{label:'Next Week',sub:'Monday 7:00 AM',opt:'nextweek'}].map(o=>(
                        <button key={o.opt} onClick={()=>snooze(a.id,o.opt)}
                          style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 14px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,cursor:'pointer',textAlign:'left'}}
                          onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <Clock size={13} color={S.muted}/>
                          <div>
                            <div style={{fontSize:13,color:S.txt,fontWeight:500}}>{o.label}</div>
                            <div style={{fontSize:10,color:S.muted}}>{o.sub}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {showDismissed&&hiddenAlerts.map(a=>{
              const c={critical:S.red,high:S.orange,medium:S.yellow}[a.level]||S.muted
              return (
                <div key={a.id} style={{display:'flex',gap:10,padding:'8px 12px',background:S.surf2,border:`1px solid ${S.bdr}`,borderLeft:`3px solid ${c}55`,borderRadius:7,marginBottom:5,alignItems:'center',opacity:0.55}}>
                  <span style={{color:c,flexShrink:0}}>!</span>
                  <span style={{fontSize:13,color:S.muted,flex:1,textDecoration:'line-through'}}>{a.text}</span>
                </div>
              )
            })}
            {showSnoozed&&snoozedAlertsList.map(a=>{
              const c={critical:S.red,high:S.orange,medium:S.yellow}[a.level]||S.muted
              const entry=(acct.snoozedAlerts||[]).find(s=>s.id===a.id)
              const untilStr=entry?new Date(entry.snoozedUntil).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''
              return (
                <div key={a.id} style={{display:'flex',gap:8,padding:'7px 12px',background:S.surf2,border:`1px solid ${S.bdr}`,borderLeft:`3px solid ${c}55`,borderRadius:7,marginBottom:4,alignItems:'center',opacity:0.65}}>
                  <Clock size={12} color={S.muted}/>
                  <span style={{fontSize:12,color:S.muted,flex:1}}>{a.text}</span>
                  <span style={{fontSize:10,color:S.muted,whiteSpace:'nowrap',flexShrink:0}}>Until {untilStr}</span>
                </div>
              )
            })}
            {hiddenAlerts.length>0&&(
              <button onClick={()=>setShowDismissed(v=>!v)} style={{fontSize:11,color:S.muted,background:'transparent',border:'none',cursor:'pointer',padding:'2px 0',textDecoration:'underline',marginTop:4,display:'block'}}>
                {showDismissed?'Hide dismissed alerts':`${hiddenAlerts.length} alert${hiddenAlerts.length!==1?'s':''} hidden — show all`}
              </button>
            )}
            {snoozedAlertsList.length>0&&(
              <button onClick={()=>setShowSnoozed(v=>!v)} style={{fontSize:11,color:S.muted,background:'transparent',border:'none',cursor:'pointer',padding:'2px 0',textDecoration:'underline',marginTop:4,display:'block'}}>
                {showSnoozed?'Hide snoozed alerts':`${snoozedAlertsList.length} alert${snoozedAlertsList.length!==1?'s':''} snoozed — show all`}
              </button>
            )}
          </div>
        </>
      )}
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
                      <div style={{width:34,height:34,borderRadius:'50%',background:'rgba(249,115,22,0.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:S.orange,flexShrink:0}}>{initials(c.name)}</div>
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

function Contacts({acct,setAcct}) {
  const [exp,setExp] = useState(null)
  const [showAdd,setShowAdd] = useState(false)
  const [form,setForm] = useState({})
  const [noteTarget,setNoteTarget] = useState(null)
  const [noteText,setNoteText] = useState('')
  const [contactSearch,setContactSearch] = useState('')
  const [clientFilter,setClientFilter] = useState('All')
  const [clientSort,setClientSort] = useState('Name')
  const [sectionExp,setSectionExp] = useState({client:true,vendor:true,internal:true})
  const [meetingFormFor,setMeetingFormFor] = useState(null)
  const [meetingForm,setMeetingForm] = useState({date:'',clientContactIds:[],topics:'',notes:''})
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const blank={id:'',name:'',title:'',email:'',cell:'',linkedin:'',location:'',dept:'',influence:'Stakeholder',sentiment:'neutral',relStatus:'Building',toolsOwn:'',goals:'',pains:'',notes:'',personalNotes:'',lastInteracted:'',contactType:'Client',vendorCompany:'',internalMeetings:[]}
  const save=()=>{if(!form.name)return;const saved={...blank,...form};if(form.id)setAcct(p=>({...p,contacts:p.contacts.map(c=>c.id===form.id?saved:c)}));else setAcct(p=>({...p,contacts:[...p.contacts,{...saved,id:uid()}]}));setShowAdd(false);setForm(blank)}
  const del=id=>{if(window.confirm('Delete contact?'))setAcct(p=>({...p,contacts:p.contacts.filter(c=>c.id!==id)}))}
  const sentC={positive:S.green,neutral:S.muted,negative:S.red}
  const relC={Strong:S.green,Building:S.blue,'Needs Attention':S.orange,Unknown:S.muted}
  const saveNote=c=>{if(!noteText.trim()){setNoteTarget(null);return};const stamp=`[${new Date().toISOString().split('T')[0]}] ${noteText.trim()}`;setAcct(p=>({...p,contacts:p.contacts.map(ct=>ct.id===c.id?{...ct,notes:(ct.notes?ct.notes+' | ':'')+stamp}:ct)}));setNoteTarget(null);setNoteText('')}
  const dismissMention=id=>setAcct(p=>({...p,unknownMentions:(p.unknownMentions||[]).filter(m=>m.id!==id)}))
  const dismissSuggestion=id=>setAcct(p=>({...p,relSuggestions:(p.relSuggestions||[]).filter(s=>s.id!==id)}))
  const applySuggestion=s=>{setAcct(p=>({...p,contacts:p.contacts.map(c=>{const fn=s.contactName.split(' ')[0].toLowerCase();return c.name.toLowerCase().includes(fn)?{...c,relStatus:s.suggestedStatus}:c}),relSuggestions:(p.relSuggestions||[]).filter(sg=>sg.id!==s.id)}))}
  const logMeeting=internalId=>{
    if(!meetingForm.date)return
    setAcct(p=>({...p,contacts:p.contacts.map(c=>c.id===internalId?{...c,internalMeetings:[...(c.internalMeetings||[]),{id:uid(),...meetingForm}]}:c)}))
    setMeetingFormFor(null);setMeetingForm({date:'',clientContactIds:[],topics:'',notes:''})
  }

  const allContacts=acct.contacts||[]
  const sq=contactSearch.toLowerCase().trim()
  const matchSearch=c=>!sq||c.name.toLowerCase().includes(sq)||c.title.toLowerCase().includes(sq)||(c.dept||'').toLowerCase().includes(sq)
  const clientContacts=allContacts.filter(c=>(c.contactType||'Client')==='Client')
  const vendorContacts=allContacts.filter(c=>c.contactType==='Vendor')
  const internalContacts=allContacts.filter(c=>c.contactType==='Internal')
  const clientsList=clientContacts

  const applyFilter=c=>{
    if(!matchSearch(c))return false
    if(clientFilter==='Active')return c.relStatus==='Strong'||c.relStatus==='Building'
    if(clientFilter==='Prospect')return c.relStatus==='Unknown'||c.relStatus==='Needs Attention'
    if(clientFilter==='Executive Sponsor')return c.influence==='Executive Sponsor'
    if(clientFilter==='Needs Attention')return c.relStatus==='Needs Attention'
    return true
  }
  const applySort=(a,b)=>{
    if(clientSort==='Name')return a.name.localeCompare(b.name)
    if(clientSort==='Last Interacted'){const da=daysSince(a.lastInteracted)??999,db=daysSince(b.lastInteracted)??999;return da-db}
    if(clientSort==='Relationship Status'){const o=['Strong','Building','Needs Attention','Unknown'];return(o.indexOf(a.relStatus)||0)-(o.indexOf(b.relStatus)||0)}
    if(clientSort==='Influence Level')return(INFLUENCES.indexOf(a.influence)||0)-(INFLUENCES.indexOf(b.influence)||0)
    if(clientSort==='Days Since Contact'){const da=daysSince(a.lastInteracted)??-1,db=daysSince(b.lastInteracted)??-1;return db-da}
    return 0
  }
  const filteredClients=clientContacts.filter(applyFilter).sort(applySort)
  const filteredVendors=vendorContacts.filter(matchSearch)
  const filteredInternal=internalContacts.filter(matchSearch)

  const renderCard=c=>{
    const ctype=c.contactType||'Client'
    const isInternal=ctype==='Internal',isVendor=ctype==='Vendor'
    const inf=IC[c.influence]||IC.Stakeholder
    const isOpen=exp===c.id
    const ds=daysSince(c.lastInteracted)
    const healthDot=ds===null?S.muted:ds<30?S.green:ds<60?S.orange:S.red
    const healthLabel=ds===null?'Never':ds+'d ago'
    const fn=c.name.split(' ')[0].toLowerCase(),ln=c.name.split(' ').slice(-1)[0].toLowerCase()
    const matchEntry=e=>{const h=`${e.participants||''} ${e.topics||''} ${e.summary||''}`.toLowerCase();return h.includes(fn)||(ln!==fn&&h.includes(ln))}
    const relHistory=[...(acct.interactions||[]).filter(matchEntry).map(e=>({...e,_s:'i'})),...(acct.intelLog||[]).filter(matchEntry).map(e=>({...e,_s:'l'}))].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
    const avatarBg=isInternal?'rgba(59,130,246,0.15)':isVendor?'rgba(168,85,247,0.15)':inf.b
    const avatarColor=isInternal?S.blue:isVendor?S.purple:inf.c
    return (
      <Card key={c.id}>
        <div onClick={()=>setExp(isOpen?null:c.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',cursor:'pointer'}}>
          <div style={{width:36,height:36,borderRadius:'50%',background:avatarBg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:avatarColor,flexShrink:0,position:'relative'}}>
            {initials(c.name)}
            {isInternal&&<span style={{position:'absolute',bottom:-2,right:-2,width:12,height:12,borderRadius:'50%',background:S.blue,display:'flex',alignItems:'center',justifyContent:'center',fontSize:7,color:'#fff',border:`1px solid ${S.surf}`}}>G</span>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              <span style={{fontSize:13,fontWeight:600,color:S.txt}}>{c.name}</span>
              {!isInternal&&<span style={{width:7,height:7,borderRadius:'50%',background:sentC[c.sentiment]||S.muted,flexShrink:0}} title={c.sentiment}/>}
              {isInternal&&<Badge label='GP Internal' color={S.blue} bg='rgba(59,130,246,0.12)' size={10}/>}
              {isVendor&&c.vendorCompany&&<Badge label={c.vendorCompany} color={S.purple} bg='rgba(168,85,247,0.12)' size={10}/>}
            </div>
            <div style={{fontSize:11,color:S.muted}}>{c.title}{c.dept?` · ${c.dept}`:''}</div>
          </div>
          <div style={{display:'flex',gap:5,flexShrink:0,flexWrap:'wrap',justifyContent:'flex-end',alignItems:'center'}}>
            {!isInternal&&<Badge label={c.influence} color={inf.c} bg={inf.b}/>}
            {!isInternal&&c.relStatus&&<Badge label={c.relStatus} color={relC[c.relStatus]||S.muted} bg={(relC[c.relStatus]||S.muted)+'22'}/>}
            {!isInternal&&<span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:999,padding:'2px 8px',whiteSpace:'nowrap'}}><span style={{width:6,height:6,borderRadius:'50%',background:healthDot,flexShrink:0,display:'inline-block'}}/>{healthLabel}</span>}
            <button onClick={e=>{e.stopPropagation();if(noteTarget===c.id){setNoteTarget(null);setNoteText('')}else{setNoteTarget(c.id);setNoteText('')}}} style={{background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,cursor:'pointer',fontSize:11,padding:'3px 8px',whiteSpace:'nowrap',lineHeight:'18px'}}>Note</button>
          </div>
        </div>
        {noteTarget===c.id&&<div style={{padding:'8px 14px 10px',borderTop:`1px solid ${S.bdr}`,background:S.surf2}} onClick={e=>e.stopPropagation()}>
          <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} rows={2} placeholder='Quick note...' style={{marginBottom:6,fontSize:12}}/>
          <div style={{display:'flex',gap:6}}><Btn variant='primary' onClick={()=>saveNote(c)} style={{fontSize:11,padding:'4px 10px'}}>Save</Btn><Btn onClick={()=>{setNoteTarget(null);setNoteText('')}} style={{fontSize:11,padding:'4px 8px'}}>Cancel</Btn></div>
        </div>}
        {isOpen&&<div style={{padding:'12px 14px 16px',borderTop:`1px solid ${S.bdr}`}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 16px',marginBottom:10,fontSize:12}}>
            {[['Email',c.email],['Cell',c.cell],['Location',c.location]].map(([l,v])=><div key={l}><span style={{color:S.muted}}>{l}: </span><span style={{color:S.txt}}>{v||'—'}</span></div>)}
            <div><span style={{color:S.muted}}>LinkedIn: </span>{c.linkedin?<a href={c.linkedin} target='_blank' rel='noopener noreferrer' onClick={e=>e.stopPropagation()} style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:3}}><span style={{fontSize:10,fontWeight:700,color:'#fff',background:'#0a66c2',padding:'1px 6px',borderRadius:3,lineHeight:'16px'}}>in</span></a>:<span style={{color:S.txt}}>—</span>}</div>
          </div>
          {isVendor&&c.vendorCompany&&<div style={{fontSize:12,color:S.secondary,marginBottom:8}}><span style={{color:S.muted}}>Company: </span>{c.vendorCompany}</div>}
          {c.lastInteracted&&<div style={{fontSize:11,color:S.muted,marginBottom:8}}>Last interacted: {fmtDate(c.lastInteracted)}</div>}
          {[['Tools / Tech Owned',c.toolsOwn],['Key Goals',c.goals],['Key Pains',c.pains],['Notes',c.notes],['Personal Notes',c.personalNotes]].map(([l,v])=>v?<div key={l} style={{marginBottom:8}}><div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>{l}</div><div style={{fontSize:12,color:S.secondary,lineHeight:1.6}}>{v}</div></div>:null)}
          {isInternal&&(
            <div style={{marginTop:12,borderTop:`1px solid ${S.bdr}`,paddingTop:10}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <SH>Meeting History with Clients</SH>
                <button onClick={e=>{e.stopPropagation();if(meetingFormFor===c.id){setMeetingFormFor(null)}else{setMeetingFormFor(c.id);setMeetingForm({date:new Date().toISOString().split('T')[0],clientContactIds:[],topics:'',notes:''})}}} style={{fontSize:11,color:S.blue,background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.25)',borderRadius:5,padding:'3px 10px',cursor:'pointer',fontWeight:600}}>+ Log Meeting</button>
              </div>
              {meetingFormFor===c.id&&(
                <div style={{background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:8,padding:'12px 14px',marginBottom:10}} onClick={e=>e.stopPropagation()}>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Date</div>
                    <input type='date' value={meetingForm.date} onChange={e=>setMeetingForm(p=>({...p,date:e.target.value}))} style={{fontSize:12,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,width:'100%',boxSizing:'border-box'}}/>
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Client Contacts Present</div>
                    {clientsList.length===0&&<div style={{fontSize:12,color:S.dim}}>No client contacts added yet.</div>}
                    <div style={{display:'flex',flexDirection:'column',gap:4}}>
                      {clientsList.map(cc=>(
                        <label key={cc.id} style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:S.txt,cursor:'pointer'}}>
                          <input type='checkbox' checked={(meetingForm.clientContactIds||[]).includes(cc.id)} onChange={ev=>{const ids=meetingForm.clientContactIds||[];setMeetingForm(p=>({...p,clientContactIds:ev.target.checked?[...ids,cc.id]:ids.filter(id=>id!==cc.id)}))}} style={{cursor:'pointer'}}/>
                          {cc.name}<span style={{color:S.muted,fontSize:10,marginLeft:4}}>— {cc.title}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Topics</div>
                    <input value={meetingForm.topics} onChange={e=>setMeetingForm(p=>({...p,topics:e.target.value}))} placeholder='Topics discussed...' style={{width:'100%',fontSize:12,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,boxSizing:'border-box'}}/>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Notes</div>
                    <textarea value={meetingForm.notes} onChange={e=>setMeetingForm(p=>({...p,notes:e.target.value}))} rows={2} placeholder='Meeting notes...' style={{width:'100%',fontSize:12,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit'}}/>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>logMeeting(c.id)} style={{padding:'5px 12px',background:S.blue,border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save Meeting</button>
                    <button onClick={()=>{setMeetingFormFor(null);setMeetingForm({date:'',clientContactIds:[],topics:'',notes:''})}} style={{padding:'5px 10px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,fontSize:12,cursor:'pointer'}}>Cancel</button>
                  </div>
                </div>
              )}
              {(c.internalMeetings||[]).length===0&&meetingFormFor!==c.id&&<div style={{fontSize:12,color:S.dim}}>No meetings logged yet.</div>}
              <div style={{display:'flex',flexDirection:'column',gap:5}}>
                {(c.internalMeetings||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(m=>(
                  <div key={m.id} style={{padding:'8px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                      <span style={{fontSize:11,color:S.muted,fontWeight:600,flexShrink:0}}>{fmtDate(m.date)}</span>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{(m.clientContactIds||[]).map(id=>{const cc=allContacts.find(ct=>ct.id===id);return cc?<Badge key={id} label={cc.name.split(' ')[0]} color={S.blue} bg='rgba(59,130,246,0.12)' size={10}/>:null})}</div>
                    </div>
                    {m.topics&&<div style={{fontSize:12,color:S.txt,fontWeight:500,marginBottom:2}}>{m.topics}</div>}
                    {m.notes&&<div style={{fontSize:11,color:S.secondary,lineHeight:1.5}}>{m.notes}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!isInternal&&(
            <div style={{marginTop:12,borderTop:`1px solid ${S.bdr}`,paddingTop:10}}>
              <SH>Interaction History</SH>
              {relHistory.length===0?<div style={{fontSize:12,color:S.dim}}>No interactions logged yet.</div>:<div style={{display:'flex',flexDirection:'column',gap:5}}>{relHistory.map((e,i)=>(
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:7}}>
                  <span style={{fontSize:10,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:4,padding:'1px 6px',whiteSpace:'nowrap',flexShrink:0}}>{fmtDate(e.date)}</span>
                  <Badge label={e.type||'Note'} color={INTERACTION_COLORS[e.type]||S.muted} bg={(INTERACTION_COLORS[e.type]||S.muted)+'1a'} size={10}/>
                  <span style={{fontSize:12,color:S.secondary,lineHeight:1.5}}>{(e.summary||'').split('\n')[0].slice(0,120)}{(e.summary||'').length>120?'…':''}</span>
                </div>
              ))}</div>}
            </div>
          )}
          <div style={{display:'flex',gap:8,marginTop:10}}><Btn onClick={()=>{setForm({...blank,...c});setShowAdd(true)}}>Edit</Btn><Btn variant='danger' onClick={()=>del(c.id)}>Delete</Btn></div>
        </div>}
      </Card>
    )
  }

  const Section=({type,label,color,contacts})=>{
    const isExp=sectionExp[type]
    const ctype=type==='client'?'Client':type==='vendor'?'Vendor':'Internal'
    return (
      <div style={{marginBottom:14}}>
        <div onClick={()=>setSectionExp(p=>({...p,[type]:!p[type]}))} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',cursor:'pointer',userSelect:'none',borderBottom:`1px solid ${S.bdr}`,marginBottom:8}}
          onMouseEnter={e=>e.currentTarget.style.opacity='0.7'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
          <span style={{fontSize:11,color:S.muted}}>{isExp?'▼':'▶'}</span>
          <span style={{fontSize:13,fontWeight:700,color:S.txt}}>{label}</span>
          <span style={{fontSize:11,fontWeight:700,color,background:color+'1a',borderRadius:999,padding:'1px 8px',marginLeft:2}}>{contacts.length}</span>
        </div>
        {isExp&&contacts.length===0&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8}}>
            <span style={{fontSize:12,color:S.dim}}>None added yet</span>
            <button onClick={()=>{setForm({...blank,contactType:ctype});setShowAdd(true)}} style={{fontSize:11,color:S.blue,background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.25)',borderRadius:5,padding:'3px 10px',cursor:'pointer',fontWeight:600}}>+ Add {ctype} Contact</button>
          </div>
        )}
        {isExp&&contacts.length>0&&<div style={{display:'flex',flexDirection:'column',gap:5}}>{contacts.map(c=>renderCard(c))}</div>}
      </div>
    )
  }

  const ftype=form.contactType||'Client'

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
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div style={{fontSize:13,color:S.muted}}>{allContacts.length} contacts</div>
        <Btn variant='primary' onClick={()=>{setForm(blank);setShowAdd(true)}}>+ Add Contact</Btn>
      </div>
      <input value={contactSearch} onChange={e=>setContactSearch(e.target.value)} placeholder='Search by name, title, or department...' style={{width:'100%',fontSize:12,padding:'7px 11px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,marginBottom:10,boxSizing:'border-box'}}/>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:7,padding:2}}>
          {['All','Active','Prospect','Executive Sponsor','Needs Attention'].map(pill=>(
            <button key={pill} onClick={()=>setClientFilter(pill)} style={{padding:'4px 10px',borderRadius:5,border:'none',background:clientFilter===pill?S.blue:'transparent',color:clientFilter===pill?'#fff':S.muted,fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>{pill}</button>
          ))}
        </div>
        <select value={clientSort} onChange={e=>setClientSort(e.target.value)} style={{fontSize:11,padding:'5px 8px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,marginLeft:'auto'}}>
          {['Name','Last Interacted','Relationship Status','Influence Level','Days Since Contact'].map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <Section type='client' label='Client Contacts' color={S.blue} contacts={filteredClients}/>
      <Section type='vendor' label='Vendor Contacts' color={S.purple} contacts={filteredVendors}/>
      <Section type='internal' label='Internal Contacts' color={S.green} contacts={filteredInternal}/>
      {showAdd&&<Modal title={form.id?'Edit Contact':'Add Contact'} onClose={()=>{setShowAdd(false);setForm(blank)}}>
        <Field label='Contact Type' value={ftype} onChange={f('contactType')} options={['Client','Vendor','Internal']}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
          <Field label='Name' value={form.name} onChange={f('name')} style={{gridColumn:'span 2'}}/>
          {ftype==='Vendor'&&<Field label='Company / Vendor Name' value={form.vendorCompany||''} onChange={f('vendorCompany')} style={{gridColumn:'span 2'}}/>}
          <Field label='Title' value={form.title} onChange={f('title')}/>
          <Field label='Department' value={form.dept} onChange={f('dept')}/>
          <Field label='Email' value={form.email} onChange={f('email')} type='email'/>
          <Field label='Cell' value={form.cell} onChange={f('cell')}/>
          <Field label='LinkedIn URL' value={form.linkedin} onChange={f('linkedin')} style={{gridColumn:'span 2'}}/>
          <Field label='Location' value={form.location} onChange={f('location')}/>
          <Field label='Last Interacted' value={form.lastInteracted} onChange={f('lastInteracted')} type='date'/>
          {ftype!=='Internal'&&<><Field label='Influence Level' value={form.influence} onChange={f('influence')} options={INFLUENCES}/><Field label='Relationship Status' value={form.relStatus} onChange={f('relStatus')} options={['Strong','Building','Needs Attention','Unknown']}/><Field label='Sentiment' value={form.sentiment} onChange={f('sentiment')} options={['positive','neutral','negative']}/></>}
        </div>
        {ftype!=='Internal'&&<><Field label='Tools / Tech They Own or Work In' value={form.toolsOwn} onChange={f('toolsOwn')} multiline/><Field label='Key Goals' value={form.goals} onChange={f('goals')} multiline/><Field label='Key Pains' value={form.pains} onChange={f('pains')} multiline/></>}
        <Field label='Professional Notes' value={form.notes} onChange={f('notes')} multiline/>
        {ftype!=='Internal'&&<Field label='Personal Notes — spouse, kids, hobbies, weekend plans' value={form.personalNotes} onChange={f('personalNotes')} multiline/>}
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
const capStatusFill = v => !v?S.bdr2:({Current:'#22c55e',Selected:'#22c55e',Evaluating:'#3b82f6',Watch:'#a855f7',Replacing:'#f97316',Dropping:'#ef4444'}[v.status]||S.bdr2)

function TechStack({acct,setAcct}) {
  const [view,setView] = useState('list')
  const [showAdd,setShowAdd] = useState(false)
  const [form,setForm] = useState({})
  const [hoveredSeg,setHoveredSeg] = useState(null)
  const [legendModal,setLegendModal] = useState(null)
  const mob = typeof window!=='undefined'&&window.innerWidth<768
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const blank={id:'',vendor:'',products:'',category:'SIEM / SOC',status:'Current',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'',replacementOptions:'',notes:''}
  const save=()=>{if(!form.vendor)return;if(form.id)setAcct(p=>({...p,techStack:p.techStack.map(t=>t.id===form.id?form:t)}));else setAcct(p=>({...p,techStack:[...p.techStack,{...form,id:uid()}]}));setShowAdd(false);setForm(blank)}
  const del=id=>{if(window.confirm('Delete?'))setAcct(p=>({...p,techStack:p.techStack.filter(t=>t.id!==id)}))}
  const grouped=TECH_CATS.reduce((acc,cat)=>{const items=acct.techStack.filter(t=>t.category===cat);if(items.length)acc[cat]=items;return acc},{})
  const upcoming=acct.techStack.filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=150}).length

  // Heatmap geometry — 680px wheel diameter, viewBox 820×820
  const HM_CX=410,HM_CY=410,HM_OR2=330,HM_OR1=278,HM_IR2=268,HM_IR1=188,HM_START=-Math.PI/2
  const domainToCategory={'Cloud & App Security':'Cloud Security','Data Protection':'GRC','Endpoint & Mail':'Endpoint','Security Operations':'SIEM / SOC','Network Security':'Network / SASE','Identity Security':'Identity / IAM'}
  const capToCategory={'SAST':'AppSec','DAST/IAST':'AppSec','SCA':'AppSec','API Security':'AppSec','App Pen Testing':'AppSec','Pen Testing':'Pen Test / Red Team','BAS/Continuous Testing':'Pen Test / Red Team','Threat Intel':'Threat Intel','GRC Platform':'GRC','3rd Party Risk':'GRC','Email Gateway':'Email Security','BEC/Phishing':'Email Security','DMARC':'Email Security','Email DLP':'Email Security','Endpoint EDR':'Endpoint','Server EDR':'Endpoint','Endpoint Encryption':'Endpoint','Insider Threat/DDR':'Endpoint','MDM/EMM':'Endpoint','Patch Management':'Endpoint','Log Management':'SIEM / SOC','SIEM/XDR':'SIEM / SOC'}
  const allCaps=HEATMAP_DOMAINS.flatMap(d=>d.caps)
  const coveredCaps=allCaps.filter(cap=>findVendor(cap,acct.techStack))
  const coveragePct=Math.round(coveredCaps.length/allCaps.length*100)

  const makeTextArcPath=(cx,cy,r,a1,a2)=>{
    const mid=(a1+a2)/2, lg=(a2-a1)>Math.PI?1:0
    if(Math.sin(mid)>0.1) return `M ${cx+r*Math.cos(a2)} ${cy+r*Math.sin(a2)} A ${r} ${r} 0 ${lg} 0 ${cx+r*Math.cos(a1)} ${cy+r*Math.sin(a1)}`
    return `M ${cx+r*Math.cos(a1)} ${cy+r*Math.sin(a1)} A ${r} ${r} 0 ${lg} 1 ${cx+r*Math.cos(a2)} ${cy+r*Math.sin(a2)}`
  }

  const hmSegments=[]
  let angle=HM_START
  const anglePD=(2*Math.PI)/HEATMAP_DOMAINS.length
  HEATMAP_DOMAINS.forEach((domain,di)=>{
    const dS=angle,dE=angle+anglePD,mid=(dS+dE)/2
    hmSegments.push({type:'domain',di,domain,mid,
      path:makeArc(HM_CX,HM_CY,HM_OR1,HM_OR2,dS,dE,0.018),
      textArcPath:makeTextArcPath(HM_CX,HM_CY,302,dS,dE)})
    const aPC=anglePD/domain.caps.length
    domain.caps.forEach((cap,ci)=>{
      const cS=dS+ci*aPC,cE=cS+aPC,vendor=findVendor(cap,acct.techStack)
      const midA=(cS+cE)/2,midR=(HM_IR1+HM_IR2)/2
      const centX=HM_CX+midR*Math.cos(midA),centY=HM_CY+midR*Math.sin(midA)
      hmSegments.push({type:'cap',di,ci,domain,cap,vendor,centX,centY,
        fill:capStatusFill(vendor),path:makeArc(HM_CX,HM_CY,HM_IR1,HM_IR2,cS,cE,0.01)})
    })
    angle=dE
  })

  const handleCapHover=(seg,e)=>{if(seg.type!=='cap'){setHoveredSeg(null);return};setHoveredSeg({...seg,x:e.clientX,y:e.clientY})}
  const handleCapMove=(seg,e)=>{if(seg.type!=='cap')return;setHoveredSeg(p=>p?{...p,x:e.clientX,y:e.clientY}:null)}
  const handleCapClick=(seg)=>{
    if(seg.type!=='cap')return
    if(seg.vendor){
      // Editing existing vendor: merge with blank so all fields are defined
      setForm({...blank,...seg.vendor})
      setShowAdd(true)
    } else {
      // New vendor: pre-fill category (per-cap first, then domain fallback) and products
      const category = capToCategory[seg.cap] || domainToCategory[seg.domain.name] || 'Other'
      setForm({...blank, category, products: seg.cap})
      setShowAdd(true)
    }
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
        <style>{`
          @keyframes hmFadeIn{from{opacity:0}to{opacity:1}}
          @keyframes hmSpin{to{transform:rotate(360deg)}}
          .hm-spin-cw{transform-box:fill-box;transform-origin:center;animation:hmSpin 8s linear infinite}
          .hm-spin-ccw{transform-box:fill-box;transform-origin:center;animation:hmSpin 14s linear infinite reverse}
        `}</style>
        <div style={{display:'flex',justifyContent:'center'}}>
        <svg viewBox="0 0 820 820" style={{width:'100%',maxWidth:680,display:'block',margin:'0 auto',filter:'drop-shadow(0 8px 40px rgba(0,0,0,0.8))'}}>
          <defs>
            {/* Cap status radial gradients */}
            <radialGradient id="hm-gc" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#4ade80"/><stop offset="55%" stopColor="#22c55e"/><stop offset="100%" stopColor="#16a34a"/></radialGradient>
            <radialGradient id="hm-ge" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#fde047"/><stop offset="55%" stopColor="#eab308"/><stop offset="100%" stopColor="#ca8a04"/></radialGradient>
            <radialGradient id="hm-gw" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#fb923c"/><stop offset="55%" stopColor="#f97316"/><stop offset="100%" stopColor="#ea580c"/></radialGradient>
            <radialGradient id="hm-gr" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#f87171"/><stop offset="55%" stopColor="#ef4444"/><stop offset="100%" stopColor="#dc2626"/></radialGradient>
            <radialGradient id="hm-gn" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#555555"/><stop offset="55%" stopColor="#4a4a4a"/><stop offset="100%" stopColor="#3d3d3d"/></radialGradient>
            {/* Domain ring linear gradients */}
            <linearGradient id="hm-dg0" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#0ea5e9"/><stop offset="100%" stopColor="#0369a1"/></linearGradient>
            <linearGradient id="hm-dg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#a855f7"/><stop offset="100%" stopColor="#7c3aed"/></linearGradient>
            <linearGradient id="hm-dg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#f59e0b"/><stop offset="100%" stopColor="#b45309"/></linearGradient>
            <linearGradient id="hm-dg3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#ef4444"/><stop offset="100%" stopColor="#b91c1c"/></linearGradient>
            <linearGradient id="hm-dg4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#22c55e"/><stop offset="100%" stopColor="#15803d"/></linearGradient>
            <linearGradient id="hm-dg5" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#f97316"/><stop offset="100%" stopColor="#c2410c"/></linearGradient>
            {/* Center circle gradient */}
            <radialGradient id="hm-ctr" cx="50%" cy="35%" r="70%"><stop offset="0%" stopColor="#1a2a4a"/><stop offset="100%" stopColor="#08111f"/></radialGradient>
            {/* Crosshatch pattern for empty segments */}
            <pattern id="hm-xhatch" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2"/>
            </pattern>
            {/* Rounded-edge gooey filter — applied per group so empty segments stay outside */}
            <filter id="hm-round" x="-5%" y="-5%" width="110%" height="110%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
              <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/>
              <feComposite in="SourceGraphic" in2="goo" operator="in"/>
            </filter>
            {/* Text arc paths for curved domain labels */}
            {hmSegments.filter(s=>s.type==='domain').map((seg,i)=>(
              <path key={`ta${i}`} id={`hm-ta-${i}`} d={seg.textArcPath} fill="none"/>
            ))}
          </defs>

          {/* Faint radial grid */}
          {[HM_IR1,HM_IR2,HM_OR1,HM_OR2].map(r=>(
            <circle key={r} cx={HM_CX} cy={HM_CY} r={r} fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth={0.75}/>
          ))}
          {Array.from({length:6},(_,i)=>{
            const a=HM_START+i*anglePD
            return <line key={i} x1={HM_CX} y1={HM_CY} x2={HM_CX+(HM_OR2+8)*Math.cos(a)} y2={HM_CY+(HM_OR2+8)*Math.sin(a)} stroke="rgba(255,255,255,0.035)" strokeWidth={0.75}/>
          })}

          {/* Rounded group: domain ring + vendor-filled caps (goo filter works on fully-opaque fills) */}
          <g filter="url(#hm-round)">
            {hmSegments.filter(s=>s.type==='domain').map((seg,i)=>(
              <path key={`d${i}`} d={seg.path} fill={`url(#hm-dg${i})`} stroke="none"/>
            ))}
            {hmSegments.filter(s=>s.type==='cap'&&!!s.vendor).map((seg)=>{
              const isHov=hoveredSeg?.di===seg.di&&hoveredSeg?.ci===seg.ci
              const gid={Current:'hm-gc',Selected:'hm-gc',Evaluating:'hm-ge',Watch:'hm-gw',Replacing:'hm-gr',Dropping:'hm-gr'}[seg.vendor.status]||'hm-gc'
              const idx=seg.di*10+seg.ci
              return (
                <path key={`cv-${seg.di}-${seg.ci}`} d={seg.path} fill={`url(#${gid})`} stroke="none"
                  style={{cursor:'pointer',transformOrigin:`${seg.centX}px ${seg.centY}px`,
                    transform:isHov?'scale(1.1)':'scale(1)',
                    opacity:hoveredSeg&&!isHov?0.82:1,
                    transition:'transform 0.15s ease,opacity 0.15s ease',
                    animation:'hmFadeIn 0.55s ease-out both',animationDelay:`${idx*11}ms`}}
                  onMouseEnter={e=>handleCapHover(seg,e)} onMouseMove={e=>handleCapMove(seg,e)}
                  onMouseLeave={()=>setHoveredSeg(null)} onClick={()=>handleCapClick(seg)}/>
              )
            })}
          </g>

          {/* Empty/no-vendor caps — transparent white outside filter so alpha isn't killed */}
          {hmSegments.filter(s=>s.type==='cap'&&!s.vendor).map((seg)=>{
            const isHov=hoveredSeg?.di===seg.di&&hoveredSeg?.ci===seg.ci
            const idx=seg.di*10+seg.ci
            return (
              <path key={`ce-${seg.di}-${seg.ci}`} d={seg.path}
                fill={isHov?'rgba(255,255,255,0.35)':'rgba(255,255,255,0.20)'} stroke="none"
                style={{cursor:'pointer',transformOrigin:`${seg.centX}px ${seg.centY}px`,
                  transform:isHov?'scale(1.1)':'scale(1)',
                  opacity:hoveredSeg&&!isHov?0.82:1,
                  transition:'transform 0.15s ease,opacity 0.15s ease',
                  animation:'hmFadeIn 0.55s ease-out both',animationDelay:`${idx*11}ms`}}
                onMouseEnter={e=>handleCapHover(seg,e)} onMouseMove={e=>handleCapMove(seg,e)}
                onMouseLeave={()=>setHoveredSeg(null)} onClick={()=>handleCapClick(seg)}/>
            )
          })}

          {/* Vendor dots — rendered above the filter group */}
          {hmSegments.filter(s=>s.type==='cap'&&!!s.vendor).map((seg)=>(
            <circle key={`vd-${seg.di}-${seg.ci}`} cx={seg.centX} cy={seg.centY} r={2.8}
              fill="rgba(255,255,255,0.88)" style={{pointerEvents:'none'}}/>
          ))}

          {/* Domain labels curved inside the outer ring */}
          {(()=>{
            const abbrev=['CLOUD & APP SEC','DATA PROTECTION','ENDPOINT & MAIL','SEC OPERATIONS','NETWORK SEC','IDENTITY SEC']
            return hmSegments.filter(s=>s.type==='domain').map((seg,i)=>(
              <text key={`dl${i}`} fontSize={11} fontWeight={700} letterSpacing="0.05em" fill="rgba(255,255,255,0.95)">
                <textPath href={`#hm-ta-${i}`} startOffset="50%" textAnchor="middle">{abbrev[i]}</textPath>
              </text>
            ))
          })()}

          {/* Center circle */}
          <circle cx={HM_CX} cy={HM_CY} r={HM_IR1-10} fill="url(#hm-ctr)"/>
          {/* Rotating rings */}
          <circle cx={HM_CX} cy={HM_CY} r={HM_IR1-16} fill="none"
            stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} strokeDasharray="95 970"
            className="hm-spin-cw"/>
          <circle cx={HM_CX} cy={HM_CY} r={HM_IR1-22} fill="none"
            stroke="rgba(255,255,255,0.09)" strokeWidth={1} strokeDasharray="200 970"
            className="hm-spin-ccw"/>
          {/* Shield icon */}
          <path d={`M ${HM_CX} ${HM_CY-80} L ${HM_CX-13} ${HM_CY-74} L ${HM_CX-13} ${HM_CY-60} Q ${HM_CX} ${HM_CY-52} ${HM_CX} ${HM_CY-52} Q ${HM_CX+13} ${HM_CY-60} ${HM_CX+13} ${HM_CY-60} L ${HM_CX+13} ${HM_CY-74} Z`}
            fill="url(#hm-gc)" opacity={0.85}/>
          {/* Coverage % */}
          <text x={HM_CX} y={HM_CY-14} textAnchor="middle" fontSize={54} fontWeight={800} fill="#ffffff" letterSpacing="-2">{coveragePct}%</text>
          <text x={HM_CX} y={HM_CY+12} textAnchor="middle" fontSize={11} fontWeight={600} fill="#94a3b8" letterSpacing="0.14em">COVERAGE</text>
        </svg>
        </div>

        {/* Legend — clickable gradient pills with capability counts */}
        {(()=>{
          const cs=hmSegments.filter(s=>s.type==='cap')
          const ld=[
            {label:'Maintain',g:'linear-gradient(135deg,#4ade80,#16a34a)',color:'#22c55e',filter:s=>s.vendor&&['Current','Selected'].includes(s.vendor.status)},
            {label:'Review',g:'linear-gradient(135deg,#fb923c,#ea580c)',color:'#f97316',filter:s=>s.vendor&&s.vendor.status==='Watch'},
            {label:'Invest',g:'linear-gradient(135deg,#fde047,#ca8a04)',color:'#eab308',filter:s=>s.vendor&&s.vendor.status==='Evaluating'},
            {label:'Gap',g:'linear-gradient(135deg,#f87171,#dc2626)',color:'#ef4444',filter:s=>s.vendor&&['Replacing','Dropping'].includes(s.vendor.status)},
            {label:'Critical Gap',g:'linear-gradient(135deg,#555555,#3d3d3d)',color:'#94a3b8',filter:s=>!s.vendor},
          ]
          return (
            <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:18,flexWrap:'wrap'}}>
              {ld.map(l=>{
                const segs=cs.filter(l.filter)
                return (
                  <button key={l.label} onClick={()=>setLegendModal({...l,segments:segs})}
                    style={{display:'flex',alignItems:'center',gap:7,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:999,padding:'6px 14px',cursor:'pointer'}}>
                    <div style={{width:26,height:11,borderRadius:4,background:l.g,flexShrink:0}}/>
                    <span style={{fontSize:12,fontWeight:600,color:S.txt}}>{l.label}</span>
                    <span style={{fontSize:11,color:S.muted,background:S.surf2,borderRadius:999,padding:'1px 8px',fontWeight:700}}>{segs.length}</span>
                  </button>
                )
              })}
            </div>
          )
        })()}
      </div>}

      {/* Rich tooltip */}
      {hoveredSeg&&view==='heatmap'&&(()=>{
        const sc=hoveredSeg.vendor?capStatusFill(hoveredSeg.vendor):S.bdr2
        const tx=Math.min(hoveredSeg.x+16,window.innerWidth-270)
        const ty=Math.max(10,hoveredSeg.y-70)
        return (
          <div style={{position:'fixed',left:tx,top:ty,background:S.surf,border:`1px solid ${S.bdr}`,borderLeft:`4px solid ${sc}`,borderRadius:10,padding:'12px 16px',pointerEvents:'none',zIndex:9999,maxWidth:260,boxShadow:'0 8px 32px rgba(0,0,0,0.65)'}}>
            <div style={{fontSize:13,fontWeight:700,color:S.txt,marginBottom:6,lineHeight:1.3}}>{hoveredSeg.cap}</div>
            <div style={{fontSize:11,color:S.muted,marginBottom:6,letterSpacing:'0.04em',textTransform:'uppercase'}}>{hoveredSeg.domain.name}</div>
            {hoveredSeg.vendor
              ?<>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <span style={{fontSize:12,fontWeight:600,color:S.secondary}}>{hoveredSeg.vendor.vendor}</span>
                </div>
                {hoveredSeg.vendor.products&&<div style={{fontSize:11,color:S.muted,marginBottom:6}}>{hoveredSeg.vendor.products}</div>}
                <div style={{display:'inline-flex',alignItems:'center',gap:5,background:sc+'20',border:`1px solid ${sc}44`,borderRadius:999,padding:'2px 10px',marginBottom:8}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:sc,display:'inline-block',flexShrink:0}}/>
                  <span style={{fontSize:11,fontWeight:700,color:sc}}>{hoveredSeg.vendor.status}</span>
                </div>
                <div style={{fontSize:10,color:S.dim,borderTop:`1px solid ${S.bdr}`,paddingTop:6,marginTop:2}}>Click to edit vendor</div>
              </>
              :<>
                <div style={{fontSize:11,color:S.muted,marginBottom:8}}>No vendor mapped</div>
                <div style={{fontSize:11,color:S.blue,fontWeight:600}}>Click to add vendor →</div>
              </>
            }
          </div>
        )
      })()}

      {/* Legend category modal */}
      {legendModal&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:mob?'stretch':'center',justifyContent:'center',zIndex:1000,padding:mob?0:20}}
        onClick={()=>setLegendModal(null)}>
        <div style={{background:S.surf,border:mob?'none':`1px solid ${S.bdr}`,borderTop:`3px solid ${legendModal.color}`,borderRadius:mob?0:12,width:'100%',maxWidth:mob?'100%':840,height:mob?'100%':'auto',maxHeight:mob?'100%':'80vh',overflow:'hidden',display:'flex',flexDirection:'column'}}
          onClick={e=>e.stopPropagation()}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:22,height:14,borderRadius:4,background:legendModal.g,flexShrink:0}}/>
              <span style={{fontSize:16,fontWeight:700,color:legendModal.color}}>{legendModal.label}</span>
              <span style={{fontSize:13,color:S.muted}}>— {legendModal.segments.length} capabilit{legendModal.segments.length===1?'y':'ies'}</span>
            </div>
            <button onClick={()=>setLegendModal(null)} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,padding:'0 4px'}}>×</button>
          </div>
          <div style={{overflow:'auto',flex:1,padding:'8px 20px 16px'}}>
            {legendModal.segments.length===0&&<div style={{fontSize:13,color:S.muted,padding:'20px 0',textAlign:'center'}}>No capabilities in this category.</div>}
            {legendModal.segments.map((seg,i)=>{
              const existingNotes=seg.vendor?(seg.vendor.replacementNotes||''):((acct.hmCapNotes||{})[seg.cap]||'')
              return (
                <div key={i} style={{borderLeft:`3px solid ${legendModal.color}44`,paddingLeft:12,marginTop:12,paddingBottom:12,borderBottom:`1px solid ${S.bdr}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6,gap:12}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:S.txt,marginBottom:2}}>{seg.cap}</div>
                      <div style={{fontSize:11,color:S.muted}}>{seg.domain.name}</div>
                    </div>
                    <div style={{flexShrink:0}}>
                      {seg.vendor
                        ?<span style={{fontSize:12,fontWeight:600,color:S.secondary,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'2px 8px'}}>{seg.vendor.vendor}</span>
                        :<span style={{fontSize:11,color:S.dim,fontStyle:'italic'}}>No vendor mapped</span>}
                    </div>
                  </div>
                  <textarea
                    defaultValue={existingNotes}
                    placeholder="Replacement options / notes..."
                    rows={2}
                    style={{width:'100%',fontSize:12,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'6px 8px',color:S.txt,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit',lineHeight:1.5}}
                    onBlur={e=>{
                      const val=e.target.value
                      if(seg.vendor){
                        setAcct(p=>({...p,techStack:p.techStack.map(t=>t.id===seg.vendor.id?{...t,replacementNotes:val}:t)}))
                      } else {
                        setAcct(p=>({...p,hmCapNotes:{...(p.hmCapNotes||{}),[seg.cap]:val}}))
                      }
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>}

      {showAdd&&<Modal title={form.id?'Edit Vendor':'Add Vendor'} onClose={()=>{setShowAdd(false);setForm(blank)}}>
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
        <Field label='Replacement Options' value={form.replacementOptions} onChange={f('replacementOptions')} multiline placeholder='List alternative vendors being considered'/>
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
  const [moveMenu,setMoveMenu] = useState(null)
  const [statusMenu,setStatusMenu] = useState(null)
  const blank={id:'',name:'',category:'',vendor:'',status:'Not Started',description:'',goals:'',pains:'',primaryContact:'',budget:false,closeDate:'',notes:'',waitingOn:'',nextAction:'',timeline:STAGES.map(s=>({stage:s,status:'pending',date:''}))}
  const [form,setForm] = useState(blank)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const save=()=>{if(!form.name)return;if(form.id)setAcct(p=>({...p,projects:p.projects.map(j=>j.id===form.id?form:j)}));else setAcct(p=>({...p,projects:[...p.projects,{...form,id:uid()}]}));setShowAdd(false);setForm(blank)}
  const toggleStage=(projId,idx)=>{setAcct(p=>({...p,projects:p.projects.map(j=>{if(j.id!==projId)return j;const tl=j.timeline.map((s,i)=>i===idx?{...s,status:s.status==='completed'?'pending':'completed',date:s.status!=='completed'?new Date().toISOString().split('T')[0]:''}:s);return{...j,timeline:tl}})}))}
  const updateField=(projId,field,val)=>{setAcct(p=>({...p,projects:p.projects.map(j=>j.id===projId?{...j,[field]:val}:j)}))}
  const moveStatus=(projId,newStatus)=>{updateField(projId,'status',newStatus);setMoveMenu(null);setStatusMenu(null)}
  const openEdit=(p,e)=>{if(e)e.stopPropagation();setForm({...blank,...p});setShowAdd(true)}
  const grouped=PROJ_STATS.reduce((acc,s)=>{acc[s]=acct.projects.filter(p=>p.status===s);return acc},{})

  useEffect(()=>{
    const h=()=>{setMoveMenu(null);setStatusMenu(null)}
    document.addEventListener('click',h)
    return()=>document.removeEventListener('click',h)
  },[])

  const penBtn={background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:13,padding:'2px 5px',borderRadius:4,lineHeight:1,flexShrink:0}

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
      {view==='pipeline'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
          {['In Flight','In Discussion','Not Started','Stalled','Won','Lost'].map(status=>{
            const projs=grouped[status]||[];const sc=PSC[status]||S.muted
            return (
              <div key={status} style={{background:S.surf2,borderRadius:8,padding:10}}>
                <div style={{fontSize:11,fontWeight:700,color:sc,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  {status}<span style={{background:sc+'22',borderRadius:999,padding:'1px 7px'}}>{projs.length}</span>
                </div>
                {projs.length===0&&<div style={{fontSize:11,color:S.dim,textAlign:'center',padding:'14px 6px',border:`1px dashed ${S.bdr}`,borderRadius:6}}>No projects</div>}
                {projs.map(p=>{
                  const comp=p.timeline.filter(s=>s.status==='completed').length
                  return (
                    <div key={p.id} style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,padding:'9px 11px',marginBottom:6,position:'relative'}}>
                      {/* Name + edit button */}
                      <div style={{display:'flex',alignItems:'flex-start',gap:4,marginBottom:4}}>
                        <div style={{fontSize:12,fontWeight:600,color:S.txt,flex:1,lineHeight:1.3}}>{p.name}</div>
                        <button onClick={e=>openEdit(p,e)} style={penBtn} title='Edit'>✏</button>
                      </div>
                      {/* Clickable inline status badge */}
                      <div style={{position:'relative',display:'inline-block',marginBottom:5}} onClick={e=>e.stopPropagation()}>
                        <button onClick={e=>{e.stopPropagation();setStatusMenu(sm=>sm===p.id?null:p.id);setMoveMenu(null)}}
                          style={{background:sc+'1a',border:`1px solid ${sc}44`,borderRadius:999,padding:'2px 8px',fontSize:10,fontWeight:700,color:sc,cursor:'pointer',display:'flex',alignItems:'center',gap:3}}>
                          {p.status}<span style={{fontSize:8,opacity:0.7}}>▾</span>
                        </button>
                        {statusMenu===p.id&&(
                          <div style={{position:'absolute',top:'calc(100% + 3px)',left:0,zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,boxShadow:'0 4px 20px rgba(0,0,0,0.35)',minWidth:160,overflow:'hidden'}}
                            onClick={e=>e.stopPropagation()}>
                            {PROJ_STATS.filter(s=>s!==p.status).map(s=>(
                              <button key={s} onClick={()=>moveStatus(p.id,s)}
                                style={{display:'block',width:'100%',textAlign:'left',padding:'8px 12px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,fontSize:12,color:PSC[s]||S.txt,cursor:'pointer',fontWeight:600}}>
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{fontSize:11,color:S.muted,marginBottom:4}}>{p.vendor&&<span>{p.vendor} · </span>}{p.primaryContact||'—'}</div>
                      {p.nextAction&&<div style={{fontSize:11,color:S.blue,marginBottom:5}}>→ {p.nextAction}</div>}
                      <div style={{height:3,background:S.bdr,borderRadius:2,overflow:'hidden',marginBottom:3}}>
                        <div style={{height:'100%',width:`${(comp/STAGES.length)*100}%`,background:sc}}/>
                      </div>
                      <div style={{fontSize:10,color:S.muted,marginBottom:7}}>{comp}/{STAGES.length} stages</div>
                      {/* Move to... dropdown */}
                      <div style={{position:'relative'}} onClick={e=>e.stopPropagation()}>
                        <button onClick={e=>{e.stopPropagation();setMoveMenu(mm=>mm===p.id?null:p.id);setStatusMenu(null)}}
                          style={{fontSize:10,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'3px 0',cursor:'pointer',width:'100%',textAlign:'center',fontWeight:600}}>
                          Move to… ↕
                        </button>
                        {moveMenu===p.id&&(
                          <div style={{position:'absolute',bottom:'calc(100% + 3px)',left:0,zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,boxShadow:'0 -4px 20px rgba(0,0,0,0.35)',minWidth:'100%',overflow:'hidden'}}
                            onClick={e=>e.stopPropagation()}>
                            {PROJ_STATS.filter(s=>s!==p.status).map(s=>(
                              <button key={s} onClick={()=>moveStatus(p.id,s)}
                                style={{display:'block',width:'100%',textAlign:'left',padding:'8px 12px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,fontSize:12,color:PSC[s]||S.txt,cursor:'pointer',fontWeight:600}}>
                                → {s}
                              </button>
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
      )}
      {view==='timeline'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
        {acct.projects.map(p=>{
          const sc=PSC[p.status]||S.muted;const open=exp===p.id
          const stageDays=getStageDuration(p)
          return (<Card key={p.id}>
            <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'11px 14px'}}>
              <div style={{flex:1,cursor:'pointer'}} onClick={()=>setExp(open?null:p.id)}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                  <span style={{fontSize:13,fontWeight:700,color:S.txt}}>{p.name}</span>
                  {/* Clickable inline status dropdown */}
                  <div style={{position:'relative',display:'inline-block'}} onClick={e=>e.stopPropagation()}>
                    <button onClick={e=>{e.stopPropagation();setStatusMenu(sm=>sm===p.id?null:p.id);setMoveMenu(null)}}
                      style={{background:sc+'1a',border:`1px solid ${sc}44`,borderRadius:999,padding:'2px 8px',fontSize:10,fontWeight:700,color:sc,cursor:'pointer',display:'flex',alignItems:'center',gap:3}}>
                      {p.status}<span style={{fontSize:8,opacity:0.7}}>▾</span>
                    </button>
                    {statusMenu===p.id&&(
                      <div style={{position:'absolute',top:'calc(100% + 3px)',left:0,zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:7,boxShadow:'0 4px 20px rgba(0,0,0,0.35)',minWidth:160,overflow:'hidden'}}
                        onClick={e=>e.stopPropagation()}>
                        {PROJ_STATS.filter(s=>s!==p.status).map(s=>(
                          <button key={s} onClick={()=>moveStatus(p.id,s)}
                            style={{display:'block',width:'100%',textAlign:'left',padding:'8px 12px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,fontSize:12,color:PSC[s]||S.txt,cursor:'pointer',fontWeight:600}}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {p.vendor&&<Badge label={p.vendor} color={S.muted} bg='rgba(100,116,139,0.1)'/>}
                  {stageDays!==null&&<Badge label={`In stage: ${stageDays}d`} color={S.muted} bg='rgba(100,116,139,0.08)'/>}
                  {p.waitingOn&&<Badge label={`Waiting: ${p.waitingOn}`} color={S.orange} bg='rgba(249,115,22,0.12)'/>}
                </div>
                <div style={{fontSize:11,color:S.muted}}>{p.primaryContact||'—'} · Close: {fmtDate(p.closeDate)||'TBD'}</div>
                {p.nextAction&&<div style={{fontSize:11,color:S.blue,marginTop:3}}>→ Next: {p.nextAction}</div>}
              </div>
              <button onClick={e=>openEdit(p,e)} style={penBtn} title='Edit project'>✏</button>
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
                {/* Quick status action buttons */}
                {['In Discussion','In Flight','Stalled','Won'].filter(s=>s!==p.status).length>0&&(
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                    {['In Discussion','In Flight','Stalled','Won'].filter(s=>s!==p.status).map(s=>{
                      const c=PSC[s]||S.muted
                      return <button key={s} onClick={()=>moveStatus(p.id,s)} style={{fontSize:11,fontWeight:600,color:c,background:c+'15',border:`1px solid ${c}44`,borderRadius:5,padding:'4px 10px',cursor:'pointer'}}>→ {s}</button>
                    })}
                  </div>
                )}
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
                <div style={{display:'flex',gap:8}}><Btn onClick={()=>openEdit(p,null)}>Edit</Btn><Btn variant='danger' onClick={()=>{if(window.confirm('Delete?'))setAcct(prev=>({...prev,projects:prev.projects.filter(j=>j.id!==p.id)}))}}>Delete</Btn></div>
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
  const [showCompleted,setShowCompleted] = useState(false)
  const [snoozeDropOpen,setSnoozeDropOpen] = useState(false)
  const [snoozeShowCustom,setSnoozeShowCustom] = useState(false)
  const [snoozeCustomDate,setSnoozeCustomDate] = useState('')
  const [fuSnoozeToast,setFuSnoozeToast] = useState(false)
  const blank={id:'',contact:'',task:'',priority:'High',dueDate:'',status:'Open',context:''}
  const [form,setForm] = useState(blank)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const toggle=id=>setAcct(p=>({...p,followUps:p.followUps.map(fu=>fu.id===id?{...fu,status:fu.status==='Open'?'Done':'Open'}:fu)}))
  const save=()=>{if(!form.task)return;if(form.id)setAcct(p=>({...p,followUps:p.followUps.map(fu=>fu.id===form.id?form:fu)}));else setAcct(p=>({...p,followUps:[...p.followUps,{...form,id:uid()}]}));setShowAdd(false);setForm(blank)}

  const snoozeFollowUp = (option) => {
    const now=new Date(); const until=new Date()
    if (option==='later') { until.setHours(17,0,0,0); if(until<=now){until.setDate(until.getDate()+1);until.setHours(17,0,0,0)} }
    else if (option==='tomorrow') { until.setDate(until.getDate()+1); until.setHours(8,0,0,0) }
    else if (option==='3days') { until.setDate(until.getDate()+3); until.setHours(8,0,0,0) }
    else if (option==='nextweek') { const day=now.getDay(); const d=day===1?7:((1+7-day)%7)||7; until.setDate(until.getDate()+d); until.setHours(7,0,0,0) }
    const dateStr=until.toISOString().split('T')[0]
    const updated={...form,dueDate:dateStr,status:'Open'}
    setForm(updated)
    if(form.id) setAcct(p=>({...p,followUps:p.followUps.map(fu=>fu.id===form.id?updated:fu)}))
    setSnoozeDropOpen(false); setSnoozeShowCustom(false); setSnoozeCustomDate('')
    setFuSnoozeToast(true); setTimeout(()=>setFuSnoozeToast(false),2000)
  }

  const applyCustomSnooze = () => {
    if (!snoozeCustomDate) return
    const updated={...form,dueDate:snoozeCustomDate,status:'Open'}
    setForm(updated)
    if(form.id) setAcct(p=>({...p,followUps:p.followUps.map(fu=>fu.id===form.id?updated:fu)}))
    setSnoozeDropOpen(false); setSnoozeShowCustom(false); setSnoozeCustomDate('')
    setFuSnoozeToast(true); setTimeout(()=>setFuSnoozeToast(false),2000)
  }

  useEffect(()=>{
    if(!snoozeDropOpen)return
    const h=()=>{setSnoozeDropOpen(false);setSnoozeShowCustom(false)}
    document.addEventListener('click',h)
    return()=>document.removeEventListener('click',h)
  },[snoozeDropOpen])

  const open=acct.followUps.filter(f=>f.status==='Open').sort((a,b)=>['Critical','High','Medium','Low'].indexOf(a.priority)-['Critical','High','Medium','Low'].indexOf(b.priority))
  const done=acct.followUps.filter(f=>f.status==='Done')

  return (
    <div>
      {fuSnoozeToast&&<div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'rgba(34,197,94,0.92)',color:'#fff',padding:'9px 22px',borderRadius:8,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:'0 4px 16px rgba(0,0,0,0.35)',pointerEvents:'none',display:'flex',alignItems:'center',gap:7}}><Clock size={14}/> Snoozed!</div>}
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
            <button onClick={()=>{setForm(fu);setShowAdd(true);setSnoozeDropOpen(false);setSnoozeShowCustom(false)}} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:11,flexShrink:0}}>Edit</button>
          </div>)
        })}
      </div>
      {done.length>0&&(
        <>
          <div onClick={()=>setShowCompleted(v=>!v)}
            style={{display:'flex',alignItems:'center',gap:6,padding:'8px 4px',cursor:'pointer',marginTop:16,borderTop:`1px solid ${S.bdr}`,userSelect:'none'}}
            onMouseEnter={e=>e.currentTarget.style.opacity='0.65'}
            onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            <span style={{fontSize:11,color:S.muted}}>{showCompleted?'▼':'▶'}</span>
            <span style={{fontSize:10,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.1em'}}>Completed ({done.length})</span>
          </div>
          {showCompleted&&done.slice(0,15).map(fu=>(
            <div key={fu.id} onClick={()=>toggle(fu.id)} style={{display:'flex',gap:8,padding:'6px 10px',cursor:'pointer',marginBottom:2}}>
              <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${S.green}`,background:'rgba(34,197,94,0.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}><span style={{color:S.green,fontSize:11}}>✓</span></div>
              <span style={{fontSize:13,color:S.dim,textDecoration:'line-through'}}>{fu.task}</span>
            </div>
          ))}
        </>
      )}
      {showAdd&&<Modal title={form.id?'Edit Follow-Up':'Add Follow-Up'} onClose={()=>{setShowAdd(false);setForm(blank);setSnoozeDropOpen(false);setSnoozeShowCustom(false)}}>
        <Field label='Task' value={form.task} onChange={f('task')}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
          <Field label='Priority' value={form.priority} onChange={f('priority')} options={['Critical','High','Medium','Low']}/>
          <Field label='Due Date' value={form.dueDate} onChange={f('dueDate')} type='date'/>
          <Field label='Contact Name' value={form.contact} onChange={f('contact')} style={{gridColumn:'span 2'}}/>
        </div>
        <Field label='Context / Notes' value={form.context} onChange={f('context')} multiline/>
        <div style={{display:'flex',gap:8,marginTop:4,alignItems:'center',flexWrap:'wrap'}}>
          <Btn variant='primary' onClick={save}>Save</Btn>
          {form.id&&(
            <div style={{position:'relative'}} onClick={e=>e.stopPropagation()}>
              <button onClick={()=>{setSnoozeDropOpen(v=>!v);setSnoozeShowCustom(false)}}
                style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 12px',minHeight:44,borderRadius:6,fontSize:13,fontWeight:500,cursor:'pointer',background:'transparent',color:S.muted,border:`1px solid ${S.bdr}`}}>
                <Clock size={14}/> Snooze
              </button>
              {snoozeDropOpen&&(
                <div style={{position:'absolute',bottom:'calc(100% + 4px)',left:0,zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,boxShadow:'0 4px 20px rgba(0,0,0,0.5)',minWidth:220,overflow:'hidden'}}>
                  {[{label:'Later Today',sub:'5:00 PM today',opt:'later'},{label:'Tomorrow',sub:'8:00 AM tomorrow',opt:'tomorrow'},{label:'In 3 Days',sub:'8:00 AM',opt:'3days'},{label:'Next Week',sub:'Monday 7:00 AM',opt:'nextweek'}].map(o=>(
                    <button key={o.opt} onClick={()=>snoozeFollowUp(o.opt)}
                      style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 14px',background:'transparent',border:'none',borderBottom:`1px solid ${S.bdr}`,cursor:'pointer',textAlign:'left'}}
                      onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <Clock size={13} color={S.muted}/>
                      <div><div style={{fontSize:13,color:S.txt,fontWeight:500}}>{o.label}</div><div style={{fontSize:10,color:S.muted}}>{o.sub}</div></div>
                    </button>
                  ))}
                  {!snoozeShowCustom
                    ?<button onClick={e=>{e.stopPropagation();setSnoozeShowCustom(true)}}
                        style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 14px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}
                        onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <Clock size={13} color={S.muted}/>
                        <div style={{fontSize:13,color:S.txt,fontWeight:500}}>Custom Date</div>
                      </button>
                    :<div style={{padding:'8px 14px',display:'flex',gap:6,alignItems:'center'}} onClick={e=>e.stopPropagation()}>
                        <input type='date' value={snoozeCustomDate} onChange={e=>setSnoozeCustomDate(e.target.value)}
                          style={{flex:1,fontSize:12,padding:'4px 7px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:5,color:S.txt}}/>
                        <button onClick={applyCustomSnooze} style={{padding:'4px 10px',background:S.blue,border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Set</button>
                      </div>
                  }
                </div>
              )}
            </div>
          )}
          <Btn onClick={()=>{setShowAdd(false);setForm(blank);setSnoozeDropOpen(false);setSnoozeShowCustom(false)}}>Cancel</Btn>
        </div>
      </Modal>}
    </div>
  )
}

function AIChatModal({acct, setAcct, effectiveKey, onClose, initialMessages=[], initialPinned=[], initialSessionId=null}) {
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

  const SYSTEM_PROMPT = `You are an account intelligence assistant for a cybersecurity sales rep at GuidePoint Security. You have been given detailed information about a specific account. Answer questions ONLY based on the information provided about this account. Do not use outside knowledge about vendors, companies, or cybersecurity beyond what is in the account data. Be concise, direct, and actionable. If the answer is not in the account data, say so clearly. Format responses cleanly — use bullet points for lists, bold for key names. Never make up information not present in the account context.`

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
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {'Content-Type':'application/json','x-api-key':effectiveKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body: JSON.stringify({model:'claude-sonnet-4-6', max_tokens:2000, system:SYSTEM_PROMPT, messages:apiMessages})
      })
      const data = await res.json()
      if(data.error) throw new Error(data.error.message)
      const aiText = data.content?.[0]?.text || 'No response received.'
      setMessages(prev=>[...prev, {id:uid(), role:'assistant', content:aiText, timestamp:new Date()}])
    } catch(e) {
      setError(e.message || 'API error. Check your API key in Settings.')
    }
    setLoading(false)
  }

  const sendMessage = async (msgText) => {
    if(!msgText.trim() || loading) return
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
            <div style={{borderTop:`1px solid ${S.bdr}`,padding:'12px 18px',flexShrink:0,display:'flex',gap:10,alignItems:'flex-end'}}>
              <textarea
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(input)}}}
                placeholder='Ask anything about this account... (Enter to send, Shift+Enter for new line)'
                rows={1}
                style={{flex:1,fontSize:13,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:8,padding:'10px 12px',color:S.txt,resize:'none',lineHeight:1.5,fontFamily:'inherit',maxHeight:120,overflowY:'auto'}}
              />
              <button onClick={()=>sendMessage(input)} disabled={!input.trim()||loading}
                style={{padding:'10px 18px',background:!input.trim()||loading?S.dim:S.blue,border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:!input.trim()||loading?'default':'pointer',flexShrink:0,opacity:!input.trim()||loading?0.5:1,minHeight:42}}>
                Send
              </button>
            </div>
          )}
        </div>
      </div>
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
          system:'You are an account intelligence analyst for a cybersecurity sales rep at GuidePoint Security. Extract structured intel from input. Return ONLY valid compact JSON. Be concise. Max 5 items per insights/risks/opportunities arrays. No markdown, no explanation.',
          messages:[{role:'user',content:`Extract intelligence and return JSON:

FOLLOW-UP RULES: Extract a MAXIMUM of 3 follow-up tasks. Be aggressive about consolidation — if multiple related actions involve the same topic, vendor, or outcome, combine them into a single task. For example if the transcript mentions updating a quote, adding a module, hitting a price target, and sending to a contact, that is ONE follow-up not four. Each task should be a complete actionable sentence that captures all the context needed. Only include follow-ups that are genuinely time-sensitive or critical to the deal or relationship. Skip anything vague, aspirational, or not clearly actionable. If there are fewer than 3 truly important follow-ups return fewer — do not pad to reach 3. Priority: Critical for hard deadlines or deal blockers, High for relationship or project momentum, Medium for everything else.

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

function AIHistory({acct, setAcct, apiKey}) {
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

  const deleteSession = (sessionId) => {
    if(!window.confirm('Delete this chat session?')) return
    setAcct(prev=>({...prev, aiHistory:(prev.aiHistory||[]).filter(s=>s.id!==sessionId)}))
    if(expanded===sessionId) setExpanded(null)
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
              <div key={i} style={{background:S.surf,border:'1px solid rgba(234,179,8,0.3)',borderLeft:'3px solid #eab308',borderRadius:8,padding:'12px 14px'}}>
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
                    <button onClick={()=>deleteSession(s.id)} style={{fontSize:11,color:S.red,background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:5,padding:'4px 8px',cursor:'pointer'}}>Delete</button>
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
  const [calendarOpen,setCalendarOpen] = useState(false)
  const [contactFreqOpen,setContactFreqOpen] = useState(false)
  const [activityBreakOpen,setActivityBreakOpen] = useState(false)
  const [hoveredStat,setHoveredStat] = useState(null)
  const [calHovered,setCalHovered] = useState(null)
  const [breakMonth,setBreakMonth] = useState(()=>{const n=new Date();return{y:n.getFullYear(),m:n.getMonth()}})

  const allContacts = Array.from(new Set(acct.interactions.map(i=>i.contact).filter(Boolean))).sort()
  const filtered = selectedContacts.length===0 ? acct.interactions : acct.interactions.filter(i=>selectedContacts.includes(i.contact))

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const thisMonthCount = acct.interactions.filter(i=>(i.date||'').startsWith(thisMonth)).length
  const cntMap={}; acct.interactions.forEach(i=>{if(i.contact)cntMap[i.contact]=(cntMap[i.contact]||0)+1})
  const topContact = Object.entries(cntMap).sort((a,b)=>b[1]-a[1])[0]
  const typeMap={}; acct.interactions.forEach(i=>{if(i.type)typeMap[i.type]=(typeMap[i.type]||0)+1})
  const topType = Object.entries(typeMap).sort((a,b)=>b[1]-a[1])[0]

  const getMonday = d => { const m=new Date(d); m.setDate(d.getDate()-((d.getDay()+6)%7)); m.setHours(0,0,0,0); return m }
  const getWeekKey = dateStr => { if(!dateStr)return null; return getMonday(new Date(dateStr+'T12:00:00')).toISOString().split('T')[0] }
  const getMonthKey = dateStr => dateStr?dateStr.slice(0,7):null
  const currentMonday = getMonday(new Date(now))
  const buckets = []
  if (groupBy==='weekly') {
    for (let i=11;i>=0;i--) { const m=new Date(currentMonday); m.setDate(currentMonday.getDate()-i*7); buckets.push(m.toISOString().split('T')[0]) }
  } else {
    for (let i=11;i>=0;i--) { const d=new Date(now.getFullYear(),now.getMonth()-i,1); buckets.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`) }
  }
  const bucketMap = {}
  buckets.forEach(b => { bucketMap[b]={key:b}; INTERACTION_TYPES.forEach(t=>{bucketMap[b][t]=0;bucketMap[b]['_'+t]=[]}) })
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
    const bucket=bucketMap[label]
    if (!INTERACTION_TYPES.some(t=>bucket[t]>0)) return null
    const dateLabel=groupBy==='weekly'?`Week of ${fmtDate(label)}`:(()=>{const [y,m]=label.split('-');return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'})})()
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

  // Calendar data
  const calMonthIxs = acct.interactions.filter(i=>(i.date||'').startsWith(thisMonth))
  const calDayMap = {}
  calMonthIxs.forEach(ix=>{const day=parseInt((ix.date||'').split('-')[2]||'0');if(!calDayMap[day])calDayMap[day]=[];calDayMap[day].push(ix)})
  const calFirst=new Date(now.getFullYear(),now.getMonth(),1), calLast=new Date(now.getFullYear(),now.getMonth()+1,0)
  const calCells=[];for(let i=0;i<calFirst.getDay();i++)calCells.push(null);for(let d=1;d<=calLast.getDate();d++)calCells.push({day:d,ixs:calDayMap[d]||[]});while(calCells.length%7!==0)calCells.push(null)
  const typePriority=['Meeting','Call','Email','Demo','Note']
  const dominantType=ixs=>{for(const t of typePriority)if(ixs.some(x=>x.type===t))return t;return ixs[0]?.type||'Note'}

  // Contact frequency
  const contactFreqData=Object.entries(cntMap).map(([name,count])=>{
    const c=(acct.contacts||[]).find(ct=>ct.name===name);const inf=c?.influence||'Stakeholder'
    return{name,count,inf,color:IC[inf]?.c||S.muted}
  }).sort((a,b)=>b.count-a.count)
  const contactLastIx=name=>{const ixs=acct.interactions.filter(i=>i.contact===name).sort((a,b)=>(b.date||'').localeCompare(a.date||''));return ixs[0]?.date||null}
  const contactTypes=name=>[...new Set(acct.interactions.filter(i=>i.contact===name).map(i=>i.type).filter(Boolean))]

  // Activity breakdown (month selector)
  const breakMonthStr=`${breakMonth.y}-${String(breakMonth.m+1).padStart(2,'0')}`
  const breakIxs=acct.interactions.filter(i=>(i.date||'').startsWith(breakMonthStr))
  const breakTypeMap={};breakIxs.forEach(i=>{if(i.type)breakTypeMap[i.type]=(breakTypeMap[i.type]||0)+1})
  const pieData=INTERACTION_TYPES.filter(t=>breakTypeMap[t]>0).map(t=>({name:t,value:breakTypeMap[t],color:INTERACTION_COLORS[t]}))
  const pieTotal=pieData.reduce((s,d)=>s+d.value,0)
  const breakLabel=new Date(breakMonth.y,breakMonth.m,1).toLocaleDateString('en-US',{month:'long',year:'numeric'})
  const prevBreak=()=>{let m=breakMonth.m-1,y=breakMonth.y;if(m<0){m=11;y--};setBreakMonth({y,m})}
  const nextBreak=()=>{let m=breakMonth.m+1,y=breakMonth.y;if(m>11){m=0;y++};setBreakMonth({y,m})}

  const modalBack={position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}
  const modalBox=(w,h)=>({width:w,height:h,background:S.surf,borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden',border:`1px solid ${S.bdr}`,boxShadow:'0 24px 80px rgba(0,0,0,0.7)'})
  const modalHdr={display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0}
  const xBtn=cb=><button onClick={cb} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,padding:'0 4px'}}>×</button>

  const statCardStyle=(key)=>{
    const h=hoveredStat===key
    return{padding:'12px 14px',cursor:'pointer',border:`1px solid ${h?'rgba(59,130,246,0.45)':S.bdr}`,background:h?S.surf2:S.surf,borderRadius:8,transition:'all 0.15s',position:'relative',overflow:'hidden'}
  }

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

      {/* Clickable stats row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
        {[
          {key:'thisMonth',onClick:()=>setCalendarOpen(true),label:'This Month\'s Interactions',main:thisMonthCount,sub:`interaction${thisMonthCount!==1?'s':''} · click for calendar`,mainColor:S.txt},
          {key:'topContact',onClick:()=>setContactFreqOpen(true),label:'Most Contacted',main:topContact?topContact[0]:null,sub:topContact?`${topContact[1]} interaction${topContact[1]!==1?'s':''}`:null,mainColor:S.txt},
          {key:'topType',onClick:()=>setActivityBreakOpen(true),label:'Top Activity Type',main:topType?topType[0]:null,sub:topType?`${topType[1]} total`:null,mainColor:topType?INTERACTION_COLORS[topType[0]]||S.txt:S.txt},
        ].map(({key,onClick,label,main,sub,mainColor})=>(
          <div key={key} style={statCardStyle(key)} onClick={onClick} onMouseEnter={()=>setHoveredStat(key)} onMouseLeave={()=>setHoveredStat(null)}>
            <div style={{fontSize:10,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{label}</div>
            {main!=null?<><div style={{fontSize:key==='thisMonth'?22:15,fontWeight:700,color:mainColor,marginBottom:1,lineHeight:1.3}}>{main}</div><div style={{fontSize:11,color:S.muted}}>{sub}</div></>:<div style={{fontSize:13,color:S.dim}}>—</div>}
            <div style={{position:'absolute',bottom:8,right:12,fontSize:11,color:S.blue,fontWeight:600,opacity:hoveredStat===key?1:0,transition:'opacity 0.15s'}}>→</div>
          </div>
        ))}
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

      {/* Chart */}
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

      {/* Activity feed — one-at-a-time expand */}
      {filtered.length>0&&<>
        <SH mt={4}>Activity Feed</SH>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          {feedItems.map(ix=>{
            const isExp=expandedId===ix.id
            const tc=INTERACTION_COLORS[ix.type]||S.muted
            const topics=(ix.topics||'').split(',').map(t=>t.trim()).filter(Boolean)
            return (
              <div key={ix.id} style={{background:S.surf,border:`1px solid ${S.bdr}`,borderLeft:`3px solid ${tc}`,borderRadius:7,overflow:'hidden'}}>
                <div onClick={()=>setExpandedId(isExp?null:ix.id)} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',padding:'8px 12px',cursor:'pointer'}}>
                  <Badge label={ix.type||'Note'} color={tc} bg={tc+'1a'} size={10}/>
                  <span style={{fontSize:11,color:S.muted,flexShrink:0}}>{fmtDate(ix.date)}</span>
                  {ix.contact&&<span style={{fontSize:12,color:S.txt,fontWeight:600,flexShrink:0}}>{ix.contact}</span>}
                  {ix.topics&&<span style={{fontSize:11,color:S.secondary,flex:1,minWidth:0,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{ix.topics}</span>}
                  <span style={{fontSize:11,color:S.dim,flexShrink:0,marginLeft:'auto'}}>{isExp?'▲':'▼'}</span>
                </div>
                <div style={{maxHeight:isExp?'320px':'0',overflow:'hidden',transition:'max-height 0.25s ease'}}>
                  <div style={{padding:'10px 12px 12px',borderTop:`1px solid ${S.bdr}`,borderLeft:`3px solid ${tc}`,marginLeft:-3}}>
                    {topics.length>1&&(
                      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:8}}>
                        {topics.map((t,j)=><Badge key={j} label={t} color={tc} bg={tc+'1a'} size={10}/>)}
                      </div>
                    )}
                    {ix.summary&&<div style={{fontSize:12,color:S.secondary,lineHeight:1.65,marginBottom:8}}>{ix.summary.length>500?ix.summary.slice(0,500)+'…':ix.summary}</div>}
                    <div style={{fontSize:10,color:S.muted,display:'flex',gap:10}}>
                      <span>{fmtDate(ix.date)}</span>
                      {ix.duration&&<span>{ix.duration} min</span>}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </>}

      {/* ── Calendar modal ── */}
      {calendarOpen&&(
        <div style={modalBack} onClick={e=>{if(e.target===e.currentTarget)setCalendarOpen(false)}}>
          <div style={modalBox('65vw','70vh')}>
            <div style={modalHdr}>
              <div style={{fontSize:14,fontWeight:700,color:S.txt}}>{now.toLocaleDateString('en-US',{month:'long',year:'numeric'})} — Interactions</div>
              {xBtn(()=>setCalendarOpen(false))}
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:16}}>
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>(
                  <div key={d} style={{textAlign:'center',fontSize:9,fontWeight:700,color:S.muted,padding:'3px 0',textTransform:'uppercase',letterSpacing:'0.08em'}}>{d}</div>
                ))}
                {calCells.map((cell,i)=>{
                  if(!cell)return<div key={i}/>
                  const{day,ixs}=cell
                  const isToday=day===now.getDate()
                  const dom=ixs.length>0?dominantType(ixs):null
                  const dc=dom?INTERACTION_COLORS[dom]:null
                  const extra=ixs.length>1?ixs.length-1:0
                  return(
                    <div key={i} style={{position:'relative',padding:'6px 2px',textAlign:'center',borderRadius:6,background:isToday?'rgba(59,130,246,0.08)':'transparent',border:isToday?'1px solid rgba(59,130,246,0.35)':'1px solid transparent',cursor:ixs.length>0?'pointer':'default'}}
                      onMouseEnter={()=>ixs.length>0&&setCalHovered(day)}
                      onMouseLeave={()=>setCalHovered(null)}>
                      {dc&&<div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:28,height:28,borderRadius:'50%',background:dc+'28',border:`1px solid ${dc}55`,pointerEvents:'none'}}/>}
                      <div style={{position:'relative',fontSize:12,fontWeight:ixs.length>0?700:400,color:ixs.length>0?(dc||S.txt):S.muted,lineHeight:1.6}}>{day}</div>
                      {extra>0&&<div style={{position:'absolute',top:1,right:3,fontSize:8,fontWeight:700,color:dc,background:dc+'28',borderRadius:999,padding:'0 3px',lineHeight:'13px'}}>+{extra}</div>}
                      {calHovered===day&&ixs.length>0&&(
                        <div onClick={e=>e.stopPropagation()} style={{position:'absolute',top:'calc(100% + 4px)',left:'50%',transform:'translateX(-50%)',zIndex:100,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,padding:'8px 10px',boxShadow:'0 4px 20px rgba(0,0,0,0.6)',minWidth:210,textAlign:'left',maxWidth:280}}>
                          {ixs.map((ix,j)=>(
                            <div key={j} style={{marginBottom:j<ixs.length-1?6:0,paddingBottom:j<ixs.length-1?6:0,borderBottom:j<ixs.length-1?`1px solid ${S.bdr}`:'none'}}>
                              <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:1}}>
                                <div style={{width:7,height:7,borderRadius:'50%',background:INTERACTION_COLORS[ix.type]||S.muted,flexShrink:0}}/>
                                <span style={{fontSize:11,fontWeight:700,color:INTERACTION_COLORS[ix.type]||S.txt}}>{ix.type||'Note'}</span>
                                {ix.contact&&<span style={{fontSize:11,color:S.secondary}}>· {ix.contact}</span>}
                              </div>
                              {ix.topics&&<div style={{fontSize:10,color:S.muted,paddingLeft:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ix.topics.slice(0,60)}{ix.topics.length>60?'…':''}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:10}}>
                {INTERACTION_TYPES.filter(t=>calMonthIxs.some(i=>i.type===t)).map(t=>(
                  <div key={t} style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,borderRadius:'50%',background:INTERACTION_COLORS[t]}}/><span style={{fontSize:11,color:S.secondary}}>{t}</span></div>
                ))}
              </div>
              <div style={{fontSize:12,fontWeight:600,color:S.muted,marginBottom:12}}>{calMonthIxs.length} interaction{calMonthIxs.length!==1?'s':''} this month</div>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {[...calMonthIxs].sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map((ix,i)=>{
                  const tc=INTERACTION_COLORS[ix.type]||S.muted
                  return(
                    <div key={i} style={{display:'flex',gap:10,padding:'7px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderLeft:`3px solid ${tc}`,borderRadius:6,alignItems:'center'}}>
                      <span style={{fontSize:10,color:S.muted,flexShrink:0,minWidth:72}}>{fmtDate(ix.date)}</span>
                      <Badge label={ix.type||'Note'} color={tc} bg={tc+'1a'} size={9}/>
                      {ix.contact&&<span style={{fontSize:12,color:S.txt,fontWeight:600,flexShrink:0}}>{ix.contact}</span>}
                      {ix.topics&&<span style={{fontSize:11,color:S.secondary,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ix.topics}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Contact frequency modal ── */}
      {contactFreqOpen&&(
        <div style={modalBack} onClick={e=>{if(e.target===e.currentTarget)setContactFreqOpen(false)}}>
          <div style={modalBox('60vw','65vh')}>
            <div style={modalHdr}>
              <div style={{fontSize:14,fontWeight:700,color:S.txt}}>Contact Frequency — {now.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div>
              {xBtn(()=>setContactFreqOpen(false))}
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
              {contactFreqData.length===0
                ?<div style={{textAlign:'center',padding:'40px 20px',color:S.muted,fontSize:13}}>No interactions logged. Process a transcript in Intel Log to populate.</div>
                :<>
                  <ResponsiveContainer width='100%' height={Math.max(100,contactFreqData.length*38)}>
                    <BarChart data={contactFreqData} layout='vertical' margin={{top:0,right:50,bottom:0,left:90}}>
                      <XAxis type='number' allowDecimals={false} tick={{fontSize:10,fill:S.muted}} axisLine={false} tickLine={false}/>
                      <YAxis type='category' dataKey='name' tick={{fontSize:11,fill:S.txt}} axisLine={false} tickLine={false} width={86}/>
                      <RechartsTooltip formatter={(v,n,p)=>[`${v} interactions`,p.payload?.inf||'']} contentStyle={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,fontSize:11,color:S.txt}}/>
                      <Bar dataKey='count' radius={[0,4,4,0]} label={{position:'right',fontSize:11,fontWeight:700,fill:S.txt}}>
                        {contactFreqData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{marginTop:16}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 60px 110px 1fr',gap:'4px 12px',padding:'5px 8px',fontSize:9,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:`1px solid ${S.bdr}`,marginBottom:4}}>
                      <span>Contact</span><span style={{textAlign:'center'}}>Count</span><span>Last Interaction</span><span>Types</span>
                    </div>
                    {contactFreqData.map((row,i)=>(
                      <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 60px 110px 1fr',gap:'4px 12px',padding:'7px 8px',borderBottom:`1px solid ${S.bdr}`,alignItems:'center'}}>
                        <div><div style={{fontSize:12,fontWeight:600,color:S.txt,marginBottom:2}}>{row.name}</div><Badge label={row.inf} color={row.color} bg={row.color+'1a'} size={9}/></div>
                        <div style={{fontSize:15,fontWeight:800,color:row.color,textAlign:'center'}}>{row.count}</div>
                        <div style={{fontSize:11,color:S.muted}}>{contactLastIx(row.name)?fmtDate(contactLastIx(row.name)):'—'}</div>
                        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>{contactTypes(row.name).map(t=><Badge key={t} label={t} color={INTERACTION_COLORS[t]||S.muted} bg={(INTERACTION_COLORS[t]||S.muted)+'1a'} size={9}/>)}</div>
                      </div>
                    ))}
                  </div>
                </>
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Activity breakdown modal ── */}
      {activityBreakOpen&&(
        <div style={modalBack} onClick={e=>{if(e.target===e.currentTarget)setActivityBreakOpen(false)}}>
          <div style={modalBox('55vw','60vh')}>
            <div style={modalHdr}>
              <div style={{fontSize:14,fontWeight:700,color:S.txt}}>Activity Breakdown</div>
              {xBtn(()=>setActivityBreakOpen(false))}
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:14,marginBottom:16}}>
                <button onClick={prevBreak} style={{background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,cursor:'pointer',padding:'4px 12px',fontSize:15,lineHeight:1}}>←</button>
                <span style={{fontSize:13,fontWeight:700,color:S.txt,minWidth:160,textAlign:'center'}}>{breakLabel}</span>
                <button onClick={nextBreak} style={{background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,cursor:'pointer',padding:'4px 12px',fontSize:15,lineHeight:1}}>→</button>
              </div>
              {pieData.length===0
                ?<div style={{textAlign:'center',padding:'30px',color:S.muted,fontSize:13}}>No interactions in {breakLabel}.</div>
                :<>
                  <ResponsiveContainer width='100%' height={220}>
                    <PieChart>
                      <Pie data={pieData} cx='50%' cy='50%' innerRadius={50} outerRadius={85} paddingAngle={3} dataKey='value' label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine fontSize={11}>
                        {pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                      </Pie>
                      <RechartsTooltip formatter={(v,n)=>[`${v} interaction${v!==1?'s':''}`,n]} contentStyle={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,fontSize:11,color:S.txt}}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{marginTop:12}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 60px 60px',gap:'4px 16px',padding:'4px 8px',fontSize:9,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:`1px solid ${S.bdr}`,marginBottom:4}}>
                      <span>Type</span><span style={{textAlign:'center'}}>Count</span><span style={{textAlign:'right'}}>%</span>
                    </div>
                    {pieData.map((row,i)=>(
                      <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 60px 60px',gap:'4px 16px',padding:'6px 8px',borderBottom:`1px solid ${S.bdr}`,alignItems:'center'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:10,height:10,borderRadius:3,background:row.color,flexShrink:0}}/><span style={{fontSize:12,color:S.txt,fontWeight:600}}>{row.name}</span></div>
                        <div style={{fontSize:13,fontWeight:700,color:row.color,textAlign:'center'}}>{row.value}</div>
                        <div style={{fontSize:12,color:S.muted,textAlign:'right'}}>{((row.value/pieTotal)*100).toFixed(0)}%</div>
                      </div>
                    ))}
                  </div>
                </>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Sidebar({data,activeId,setActiveId,setData,onNavigate,searchRef,lastSaved,theme,setTheme,onGoHome}) {
  const [showAdd,setShowAdd] = useState(false)
  const [newName,setNewName] = useState('')
  const [collapsed,setCollapsed] = useState(false)
  const [searchQ,setSearchQ] = useState('')
  const [logoHovered, setLogoHovered] = useState(false)
  const [isMobile,setIsMobile] = useState(typeof window!=='undefined'&&window.innerWidth<768)

  useEffect(()=>{
    const check=()=>{const mob=window.innerWidth<768;setIsMobile(mob);if(mob)setCollapsed(true)}
    check()
    window.addEventListener('resize',check)
    return()=>window.removeEventListener('resize',check)
  },[])

  const addAccount=()=>{if(!newName.trim())return;const id=uid();setData(p=>({...p,accounts:[...p.accounts,{...SAMPLE.accounts[0],id,name:newName,short:newName.slice(0,5).toUpperCase(),contacts:[],techStack:[],projects:[],interactions:[],intelLog:[],followUps:[],unknownMentions:[],relSuggestions:[]}]}));setActiveId(id);setShowAdd(false);setNewName('')}
  const sc={Strategic:'#a855f7',Active:'#22c55e',Prospect:'#3b82f6','At Risk':'#ef4444'}
  const searchResults = globalSearch(data, searchQ)
  const grouped = {}
  searchResults.forEach(r=>{if(!grouped[r.category])grouped[r.category]=[];grouped[r.category].push(r)})

  if(isMobile) return null

  return (
    <div style={{width:collapsed?48:220,background:S.sidebarBg,borderRight:`1px solid ${S.bdr}`,display:'flex',flexDirection:'column',flexShrink:0,height:'100%',transition:'width 0.2s',overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:collapsed?'center':'space-between',padding:collapsed?'12px 0 4px':'12px 10px 4px'}}>
        {!collapsed&&<button onClick={onGoHome} onMouseEnter={()=>setLogoHovered(true)} onMouseLeave={()=>setLogoHovered(false)} title="Home" style={{background:'none',border:'none',cursor:'pointer',padding:0,textAlign:'left'}}>
          <div style={{fontSize:10,fontWeight:800,color:S.blue,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:2}}>GuidePoint</div>
          <div style={{fontSize:12,fontWeight:700,color:logoHovered?S.blue:S.txt,transition:'color 0.15s'}}>Account Intel</div>
          {logoHovered&&<div style={{fontSize:9,color:S.muted,marginTop:1,fontWeight:600}}>← Home</div>}
        </button>}
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

function LandingPage({data, setData, onEnterAccount, onNavigateTo, onOpenSettings, theme, setTheme}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [hoveredId, setHoveredId] = useState(null)
  const [hoveredStat, setHoveredStat] = useState(null)
  const [statModal, setStatModal] = useState(null)
  const mob = typeof window!=='undefined'&&window.innerWidth<768

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric',year:'numeric'})

  const totalOpenFUs = data.accounts.reduce((s,a)=>s+(a.followUps||[]).filter(f=>f.status==='Open').length, 0)
  const criticalItems = data.accounts.reduce((s,a)=>s+(a.followUps||[]).filter(f=>f.status==='Open'&&f.priority==='Critical').length, 0)
  const renewals90 = data.accounts.reduce((s,a)=>s+(a.techStack||[]).filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=90}).length, 0)
  const activeProjects = data.accounts.reduce((s,a)=>s+(a.projects||[]).filter(p=>p.status==='In Flight').length, 0)

  const addAccount = () => {
    if (!newName.trim()) return
    const id = uid()
    setData(p=>({...p,accounts:[...p.accounts,{...SAMPLE.accounts[0],id,name:newName,short:newName.slice(0,5).toUpperCase(),contacts:[],techStack:[],projects:[],interactions:[],intelLog:[],followUps:[],unknownMentions:[],relSuggestions:[],dismissedAlerts:[]}]}))
    onEnterAccount(id)
    setShowAdd(false)
    setNewName('')
  }

  const statusColor = {Strategic:'#a855f7',Active:'#22c55e',Prospect:'#3b82f6','At Risk':'#ef4444'}
  const GP_BLUE = '#0066cc'
  const GP_LIGHT = '#0ea5e9'

  const priOrd = {'Critical':0,'High':1,'Medium':2,'Low':3}
  const buildFUData = (critOnly=false) => data.accounts.flatMap(a=>
    (a.followUps||[]).filter(f=>f.status==='Open'&&(!critOnly||f.priority==='Critical')).map(f=>({...f,accountName:a.short||a.name,accountId:a.id}))
  ).sort((a,b)=>{const pd=(priOrd[a.priority]||3)-(priOrd[b.priority]||3);return pd!==0?pd:(a.dueDate||'9999').localeCompare(b.dueDate||'9999')})
  const buildRenewalData = () => data.accounts.flatMap(a=>
    (a.techStack||[]).filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=90}).map(t=>({...t,accountName:a.short||a.name,accountId:a.id,daysLeft:daysUntil(t.renewalDate)}))
  ).sort((a,b)=>a.daysLeft-b.daysLeft)
  const buildProjectData = () => data.accounts.flatMap(a=>
    (a.projects||[]).filter(p=>p.status==='In Flight').map(p=>({...p,accountName:a.short||a.name,accountId:a.id}))
  ).sort((a,b)=>(a.closeDate||'9999').localeCompare(b.closeDate||'9999'))

  const STAT_DEFS = [
    {label:'Open Follow-Ups',value:totalOpenFUs,color:GP_LIGHT,type:'followups',tab:'followups',buildData:()=>buildFUData(false)},
    {label:'Critical Items',value:criticalItems,color:S.red,type:'critical',tab:'followups',buildData:()=>buildFUData(true)},
    {label:'Renewals (90d)',value:renewals90,color:S.orange,type:'renewals',tab:'stack',buildData:buildRenewalData},
    {label:'Active Projects',value:activeProjects,color:S.green,type:'projects',tab:'projects',buildData:buildProjectData},
  ]

  const todaysReminders = data.accounts.flatMap(a=>
    (a.followUps||[]).filter(f=>f.status==='Open'&&f.dueDate&&daysUntil(f.dueDate)!==null&&daysUntil(f.dueDate)<=3)
    .map(f=>({...f,accountName:a.short||a.name,accountId:a.id}))
  ).sort((a,b)=>(daysUntil(a.dueDate)||0)-(daysUntil(b.dueDate)||0))

  const StatIcon = ({type}) => {
    if (type==='followups') return <svg width="18" height="18" viewBox="0 0 18 18"><rect x="2" y="2" width="14" height="14" rx="2" fill="none" stroke={GP_LIGHT} strokeWidth="1.5"/><line x1="5" y1="6" x2="13" y2="6" stroke={GP_LIGHT} strokeWidth="1.4" strokeLinecap="round"/><line x1="5" y1="9" x2="13" y2="9" stroke={GP_LIGHT} strokeWidth="1.4" strokeLinecap="round"/><line x1="5" y1="12" x2="9" y2="12" stroke={GP_LIGHT} strokeWidth="1.4" strokeLinecap="round"/></svg>
    if (type==='critical') return <svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 2 L16 16 L2 16 Z" fill="none" stroke={S.red} strokeWidth="1.5" strokeLinejoin="round"/><line x1="9" y1="7.5" x2="9" y2="11" stroke={S.red} strokeWidth="1.5" strokeLinecap="round"/><circle cx="9" cy="13" r="0.8" fill={S.red}/></svg>
    if (type==='renewals') return <svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="6.5" fill="none" stroke={S.orange} strokeWidth="1.5"/><line x1="9" y1="5" x2="9" y2="9" stroke={S.orange} strokeWidth="1.5" strokeLinecap="round"/><line x1="9" y1="9" x2="12" y2="11" stroke={S.orange} strokeWidth="1.5" strokeLinecap="round"/></svg>
    if (type==='projects') return <svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 2 L11 7 L16 8 L12 12 L13 17 L9 14.5 L5 17 L6 12 L2 8 L7 7 Z" fill="none" stroke={S.green} strokeWidth="1.4" strokeLinejoin="round"/></svg>
    return null
  }

  return (
    <div style={{minHeight:'100vh',background:S.bg,color:S.txt,overflowY:'auto'}}>
      {/* Header */}
      <div style={{background:S.headerBg,borderBottom:`1px solid ${S.bdr}`,padding:mob?'0 16px':'0 28px',display:'flex',alignItems:'center',justifyContent:'space-between',height:60,position:'sticky',top:0,zIndex:100,backdropFilter:'blur(8px)'}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <svg width="28" height="28" viewBox="0 0 28 28" style={{flexShrink:0}}>
            <path d="M14 2 L24 6 L24 14 C24 20 19.5 25.5 14 27 C8.5 25.5 4 20 4 14 L4 6 Z" fill="none" stroke={GP_LIGHT} strokeWidth="1.5" strokeLinejoin="round"/>
            <circle cx="14" cy="15" r="4.5" fill="none" stroke={GP_LIGHT} strokeWidth="1.2" opacity="0.75"/>
            <circle cx="14" cy="15" r="1.8" fill={GP_LIGHT}/>
          </svg>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:S.txt,letterSpacing:'0.01em',lineHeight:1.2}}>GuidePoint Security</div>
            <div style={{fontSize:10,color:GP_LIGHT,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>Account Intelligence</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          {!mob&&<span style={{fontSize:12,color:S.muted}}>{dateStr}</span>}
          <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:6,padding:2}}>
            {[{v:'light',icon:'☀'},{v:'dark',icon:'☾'}].map(({v,icon})=>(
              <button key={v} onClick={()=>setTheme(v)} style={{padding:'4px 9px',minHeight:44,borderRadius:4,border:'none',background:theme===v?S.blue+'33':'transparent',color:theme===v?S.blue:S.muted,cursor:'pointer',fontSize:13,transition:'all 0.15s'}}>{icon}</button>
            ))}
          </div>
          <button onClick={onOpenSettings} title='Settings' style={{background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,color:S.muted,cursor:'pointer',padding:'5px 9px',minHeight:44,fontSize:14,lineHeight:1}}>⚙</button>
        </div>
      </div>

      <div style={{maxWidth:1160,margin:'0 auto',padding:mob?'24px 16px 60px':'44px 28px 80px'}}>
        {/* Hero */}
        <div style={{marginBottom:mob?24:40}}>
          <div style={{fontSize:mob?20:30,fontWeight:800,color:S.txt,marginBottom:8,lineHeight:1.2}}>{greeting}</div>
          <div style={{fontSize:14,color:S.muted,lineHeight:1.8}}>
            You have <span style={{color:S.txt,fontWeight:700}}>{data.accounts.length}</span> account{data.accounts.length!==1?'s':''}
            {totalOpenFUs>0&&<>, <span style={{color:GP_LIGHT,fontWeight:700}}>{totalOpenFUs}</span> open follow-up{totalOpenFUs!==1?'s':''}</>}
            {criticalItems>0&&<> (<span style={{color:S.red,fontWeight:700}}>{criticalItems} critical</span>)</>}
            {renewals90>0&&<>, <span style={{color:S.orange,fontWeight:700}}>{renewals90}</span> renewal{renewals90!==1?'s':''} within 90 days</>}
          </div>
        </div>

        {/* Cross-account stats — clickable cards */}
        <div className={mob?'scroll-no-bar':undefined} style={{display:mob?'flex':'grid',gridTemplateColumns:mob?undefined:'repeat(4,1fr)',flexDirection:mob?'row':undefined,gap:12,marginBottom:mob?32:48,overflowX:mob?'auto':'visible',paddingBottom:mob?8:0,WebkitOverflowScrolling:mob?'touch':undefined}}>
          {STAT_DEFS.map(stat=>(
            <button key={stat.label}
              onClick={()=>setStatModal({...stat,items:stat.buildData()})}
              onMouseEnter={()=>setHoveredStat(stat.label)}
              onMouseLeave={()=>setHoveredStat(null)}
              style={{background:S.surf,border:`1px solid ${hoveredStat===stat.label?stat.color:S.bdr}`,boxShadow:hoveredStat===stat.label?`0 4px 16px ${stat.color}22`:'none',borderRadius:12,padding:'18px 20px',textAlign:'left',cursor:'pointer',transition:'all 0.15s',flexShrink:mob?0:undefined,width:mob?160:undefined,minWidth:mob?160:undefined}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                <span style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em'}}>{stat.label}</span>
                <StatIcon type={stat.type}/>
              </div>
              <div style={{fontSize:36,fontWeight:800,color:stat.color,lineHeight:1}}>{stat.value}</div>
            </button>
          ))}
        </div>

        {/* Today's Reminders */}
        {todaysReminders.length>0&&(
          <div style={{marginBottom:mob?28:40}}>
            <div style={{fontSize:11,fontWeight:700,color:S.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:14}}>Today's Reminders — {todaysReminders.length}</div>
            <div className='scroll-no-bar' style={{display:'flex',flexDirection:'row',gap:10,overflowX:'auto',paddingBottom:8,WebkitOverflowScrolling:'touch'}}>
              {todaysReminders.map(r=>{
                const p=PC[r.priority]||PC.Low
                const d=daysUntil(r.dueDate)
                return (
                  <div key={r.id} onClick={()=>onNavigateTo(r.accountId,'followups')}
                    style={{background:S.surf,border:`1px solid ${S.bdr}`,borderLeft:`3px solid ${p.c}`,borderRadius:10,padding:'12px 14px',cursor:'pointer',flexShrink:0,width:mob?240:undefined,minWidth:mob?240:260,maxWidth:320}}
                    onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                    onMouseLeave={e=>e.currentTarget.style.background=S.surf}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5,flexWrap:'wrap'}}>
                      <span style={{fontSize:10,fontWeight:700,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:4,padding:'1px 6px',whiteSpace:'nowrap'}}>{r.accountName}</span>
                      <Badge label={r.priority} color={p.c} bg={p.b} size={10}/>
                      {d<0&&<Badge label='OVERDUE' color={S.red} bg='rgba(239,68,68,0.1)' size={10}/>}
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color:S.txt,marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.task}</div>
                    <div style={{fontSize:11,color:S.muted}}>
                      {r.contact&&<span>{r.contact} · </span>}
                      <span style={{color:d<0?S.red:d===0?S.orange:S.muted}}>{d<0?`${Math.abs(d)}d overdue`:d===0?'Due today':`Due in ${d}d`}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {data.accounts.length === 0 ? (
          <div style={{textAlign:'center',padding:'70px 20px'}}>
            <svg width="60" height="60" viewBox="0 0 60 60" style={{margin:'0 auto 20px',display:'block',opacity:0.4}}>
              <path d="M30 4 L52 13 L52 30 C52 43.5 42 53.5 30 57 C18 53.5 8 43.5 8 30 L8 13 Z" fill="none" stroke={GP_LIGHT} strokeWidth="2.5" strokeLinejoin="round"/>
              <circle cx="30" cy="32" r="9" fill="none" stroke={GP_LIGHT} strokeWidth="2"/>
              <circle cx="30" cy="32" r="3.5" fill={GP_LIGHT}/>
            </svg>
            <div style={{fontSize:22,fontWeight:700,color:S.txt,marginBottom:10}}>Welcome to Account Intelligence</div>
            <div style={{fontSize:14,color:S.muted,marginBottom:30,lineHeight:1.7}}>Add your first account to start tracking contacts, projects,<br/>and tech stack intelligence.</div>
            <button onClick={()=>setShowAdd(true)} style={{padding:'12px 28px',background:GP_BLUE,border:'none',borderRadius:8,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',letterSpacing:'0.01em'}}>+ Add Your First Account</button>
          </div>
        ) : (
          <div>
            <div style={{fontSize:11,fontWeight:700,color:S.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:16}}>Your Accounts — {data.accounts.length}</div>
            <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
              {data.accounts.map(acct=>{
                const hs=calcHealthScore(acct)
                const hc=hs>=70?S.green:hs>=40?S.orange:S.red
                const openFUs=(acct.followUps||[]).filter(f=>f.status==='Open').length
                const critFUs=(acct.followUps||[]).filter(f=>f.status==='Open'&&f.priority==='Critical').length
                const activePjs=(acct.projects||[]).filter(p=>p.status==='In Flight').length
                const lastC=acct.lastContact?daysSince(acct.lastContact):null
                const renewCount=(acct.techStack||[]).filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=90}).length
                const isHov=hoveredId===acct.id
                const r=22, circ=2*Math.PI*r, progress=(hs/100)*circ
                return (
                  <div key={acct.id} onClick={()=>onEnterAccount(acct.id)}
                    onMouseEnter={()=>setHoveredId(acct.id)}
                    onMouseLeave={()=>setHoveredId(null)}
                    style={{background:isHov?S.surf2:S.surf,border:`1px solid ${isHov?GP_BLUE:S.bdr}`,borderRadius:14,cursor:'pointer',transform:isHov?'translateY(-3px)':'translateY(0)',boxShadow:isHov?`0 10px 36px rgba(0,102,204,0.18)`:`0 2px 8px rgba(0,0,0,0.08)`,transition:'all 0.15s ease',overflow:'hidden',display:'flex',flexDirection:'column'}}
                  >
                    <div style={{padding:'20px 20px 16px',flex:1}}>
                      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:14}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:15,fontWeight:800,color:S.txt,marginBottom:4,lineHeight:1.3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{acct.name}</div>
                          {(acct.industry||acct.hq)&&<div style={{fontSize:12,color:S.muted,marginBottom:10,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{[acct.industry,acct.hq].filter(Boolean).join(' · ')}</div>}
                          <span style={{fontSize:11,fontWeight:700,color:statusColor[acct.status]||S.muted,background:(statusColor[acct.status]||S.muted)+'25',padding:'3px 10px',borderRadius:999,display:'inline-block'}}>{acct.status||'Active'}</span>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
                          <svg width="58" height="58" viewBox="0 0 56 56">
                            <circle cx="28" cy="28" r={r} fill="none" stroke={S.bdr} strokeWidth="4"/>
                            <circle cx="28" cy="28" r={r} fill="none" stroke={hc} strokeWidth="4"
                              strokeDasharray={`${progress} ${circ}`} strokeLinecap="round" transform="rotate(-90 28 28)"/>
                            <text x="28" y="33" textAnchor="middle" fontSize="13" fontWeight="800" fill={hc}>{hs}</text>
                          </svg>
                          <div style={{fontSize:9,color:S.dim,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginTop:2}}>Health</div>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
                        {[
                          {label:`${openFUs} follow-up${openFUs!==1?'s':''}`,c:S.secondary},
                          {label:`${activePjs} project${activePjs!==1?'s':''}`,c:S.secondary},
                          {label:lastC===null?'No contact yet':`${lastC}d since contact`,c:lastC===null?S.dim:lastC>30?S.orange:lastC>14?S.yellow:S.green},
                        ].map(chip=>(
                          <span key={chip.label} style={{fontSize:11,color:chip.c,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6,padding:'4px 9px',fontWeight:600,whiteSpace:'nowrap'}}>{chip.label}</span>
                        ))}
                      </div>
                      {(renewCount>0||critFUs>0)&&(
                        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                          {renewCount>0&&<span style={{fontSize:11,color:S.orange,fontWeight:600}}>▲ {renewCount} renewal{renewCount!==1?'s':''} due</span>}
                          {critFUs>0&&<span style={{fontSize:11,color:S.red,fontWeight:600}}>● {critFUs} critical</span>}
                        </div>
                      )}
                    </div>
                    <div style={{height:4,background:S.bdr}}>
                      <div style={{height:'100%',width:`${hs}%`,background:hc,transition:'width 0.4s'}}/>
                    </div>
                  </div>
                )
              })}
              <div onClick={()=>setShowAdd(true)}
                onMouseEnter={e=>{e.currentTarget.style.background=S.surf2;e.currentTarget.style.borderColor=GP_LIGHT+'66'}}
                onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor=S.bdr}}
                style={{background:'transparent',border:`1px dashed ${S.bdr}`,borderRadius:14,padding:20,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,minHeight:190,transition:'all 0.15s'}}
              >
                <div style={{width:44,height:44,borderRadius:'50%',border:`2px dashed ${GP_LIGHT}55`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:`${GP_LIGHT}77`}}>+</div>
                <div style={{fontSize:13,fontWeight:700,color:S.muted}}>Add Account</div>
              </div>
            </div>
          </div>
        )}
      </div>

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
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:mob?'stretch':'center',justifyContent:'center',zIndex:1000,padding:mob?0:20}}
          onClick={()=>setStatModal(null)}>
          <div style={{background:S.surf,border:mob?'none':`1px solid ${S.bdr}`,borderTop:`3px solid ${statModal.color}`,borderRadius:mob?0:12,width:'100%',maxWidth:mob?'100%':860,height:mob?'100%':'auto',maxHeight:mob?'100%':'80vh',overflow:'hidden',display:'flex',flexDirection:'column'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0}}>
              <div>
                <span style={{fontSize:16,fontWeight:700,color:statModal.color}}>{statModal.label}</span>
                <span style={{fontSize:13,color:S.muted,marginLeft:10}}>{statModal.items.length} item{statModal.items.length!==1?'s':''}</span>
              </div>
              <button onClick={()=>setStatModal(null)} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,padding:'0 4px'}}>×</button>
            </div>
            <div style={{overflow:'auto',flex:1,padding:'4px 0'}}>
              {statModal.items.length===0&&<div style={{padding:'32px 20px',textAlign:'center',color:S.muted,fontSize:13}}>No items in this category.</div>}
              {(statModal.type==='followups'||statModal.type==='critical')&&statModal.items.map((item,i)=>{
                const p=PC[item.priority]||PC.Low
                const d=item.dueDate?daysUntil(item.dueDate):null
                return (
                  <div key={i} onClick={()=>{onNavigateTo(item.accountId,statModal.tab);setStatModal(null)}}
                    style={{display:'flex',alignItems:'flex-start',gap:12,padding:'11px 20px',borderBottom:`1px solid ${S.bdr}`,cursor:'pointer',borderLeft:`3px solid ${p.c}44`,transition:'background 0.1s'}}
                    onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{fontSize:11,fontWeight:700,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'2px 7px',whiteSpace:'nowrap',flexShrink:0}}>{item.accountName}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:S.txt,marginBottom:2}}>{item.task}</div>
                      <div style={{fontSize:11,color:S.muted}}>{item.contact&&<span>{item.contact} · </span>}{d!==null&&<span style={{color:d<0?S.red:S.muted}}>{d<0?`Overdue ${Math.abs(d)}d`:fmtDate(item.dueDate)}</span>}</div>
                    </div>
                    <Badge label={item.priority} color={p.c} bg={p.b}/>
                  </div>
                )
              })}
              {statModal.type==='renewals'&&statModal.items.map((item,i)=>{
                const dc=item.daysLeft<30?S.red:item.daysLeft<60?S.orange:S.yellow
                return (
                  <div key={i} onClick={()=>{onNavigateTo(item.accountId,statModal.tab);setStatModal(null)}}
                    style={{display:'flex',alignItems:'center',gap:12,padding:'11px 20px',borderBottom:`1px solid ${S.bdr}`,cursor:'pointer',transition:'background 0.1s'}}
                    onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{fontSize:11,fontWeight:700,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'2px 7px',whiteSpace:'nowrap',flexShrink:0}}>{item.accountName}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:S.txt,marginBottom:2}}>{item.vendor}</div>
                      {item.products&&<div style={{fontSize:11,color:S.muted}}>{item.products}</div>}
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:dc}}>{item.daysLeft}d</div>
                      <div style={{fontSize:11,color:S.muted}}>{fmtDate(item.renewalDate)}</div>
                      {item.cost&&<div style={{fontSize:11,color:S.muted}}>{item.cost}</div>}
                    </div>
                  </div>
                )
              })}
              {statModal.type==='projects'&&statModal.items.map((item,i)=>{
                const comp=item.timeline?item.timeline.filter(s=>s.status==='completed').length:0
                return (
                  <div key={i} onClick={()=>{onNavigateTo(item.accountId,statModal.tab);setStatModal(null)}}
                    style={{display:'flex',alignItems:'flex-start',gap:12,padding:'11px 20px',borderBottom:`1px solid ${S.bdr}`,cursor:'pointer',transition:'background 0.1s'}}
                    onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{fontSize:11,fontWeight:700,color:S.muted,background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:5,padding:'2px 7px',whiteSpace:'nowrap',flexShrink:0}}>{item.accountName}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:S.txt,marginBottom:2}}>{item.name}</div>
                      <div style={{fontSize:11,color:S.muted}}>
                        {item.vendor&&<span>{item.vendor} · </span>}
                        {item.primaryContact&&<span>{item.primaryContact} · </span>}
                        {item.closeDate&&<span>Close: {fmtDate(item.closeDate)}</span>}
                      </div>
                    </div>
                    <div style={{fontSize:11,fontWeight:700,color:S.green,flexShrink:0}}>{comp}/{STAGES.length} stages</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const TABS = [{id:'overview',label:'Overview'},{id:'dashboard',label:'Dashboard'},{id:'contacts',label:'Contacts'},{id:'stack',label:'Tech Stack'},{id:'projects',label:'Projects'},{id:'followups',label:'Follow-Ups'},{id:'intel',label:'Intel Log'},{id:'aihistory',label:'History'},{id:'settings',label:'Settings'}]

export default function App() {
  const [data,setData] = useState(null)
  const [activeId,setActiveId] = useState('bhsi')
  const [tab,setTab] = useState('overview')
  const searchRef = useRef(null)
  const [lastSavedLabel,setLastSavedLabel] = useState('')
  const [isLandingPage,setIsLandingPage] = useState(true)
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

  useEffect(()=>{
    loadData().then(d=>{
      const loaded = d || SAMPLE
      const today = new Date().toISOString().split('T')[0]
      const accounts = loaded.accounts.map(acct=>{
        const history = acct.healthScoreHistory || []
        if(history.some(h=>h.date===today)) return {...acct, healthScoreOverrides:acct.healthScoreOverrides||{}, healthScoreHistory:history}
        const score = calcDetailedHealthScore({...acct, healthScoreOverrides:acct.healthScoreOverrides||{}}).total
        return {...acct, healthScoreOverrides:acct.healthScoreOverrides||{}, healthScoreHistory:[...history,{date:today,score}].slice(-30)}
      })
      setData({...loaded, accounts})
    })
  },[])

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

  if (isLandingPage) return (
    <LandingPage
      data={data}
      setData={setData}
      onEnterAccount={id=>{setActiveId(id);setTab('overview');setIsLandingPage(false)}}
      onNavigateTo={(id,t)=>{setActiveId(id);setTab(t);setIsLandingPage(false)}}
      onOpenSettings={()=>{const first=data.accounts[0];if(first){setActiveId(first.id);setTab('settings');setIsLandingPage(false)}}}
      theme={theme}
      setTheme={handleSetTheme}
    />
  )

  const acct = data.accounts.find(a=>a.id===activeId)||data.accounts[0]
  const setAcct = fn => setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===acct.id?(typeof fn==='function'?fn(a):fn):a)}))
  const critHighCount = (acct.followUps||[]).filter(f=>f.status==='Open'&&(f.priority==='Critical'||f.priority==='High')).length
  const mob = typeof window!=='undefined'&&window.innerWidth<768

  return (
    <div style={{display:mob?'block':'flex',height:mob?'auto':'100vh',minHeight:mob?'100vh':'auto',overflow:mob?'visible':'hidden',background:S.bg}}>
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
        onGoHome={()=>setIsLandingPage(true)}
      />
      <div style={{flex:mob?'none':1,display:'flex',flexDirection:'column',overflow:mob?'visible':'hidden'}}>
        <div style={{background:S.headerBg,borderBottom:`1px solid ${S.bdr}`,padding:mob?'10px 14px 0':'10px 20px 0',flexShrink:0,position:mob?'sticky':'relative',top:0,zIndex:mob?100:'auto'}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
              <button onClick={()=>setIsLandingPage(true)} style={{display:'inline-flex',alignItems:'center',gap:4,background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:5,color:S.muted,cursor:'pointer',fontSize:11,fontWeight:600,padding:'4px 10px',marginTop:3,flexShrink:0,whiteSpace:'nowrap'}}>← All Accounts</button>
              <div>
                <div style={{fontSize:10,color:S.blue,fontWeight:800,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:2}}>{acct.status}</div>
                <div style={{fontSize:17,fontWeight:800,color:S.txt}}>{acct.name}</div>
              </div>
            </div>
            {!mob&&<div style={{display:'flex',gap:5,flexWrap:'wrap',justifyContent:'flex-end'}}>
              {[acct.industry,acct.hq,'Last contact: '+fmtDate(acct.lastContact)].filter(Boolean).map(t=><span key={t} style={{fontSize:11,color:S.muted,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:999,padding:'2px 10px'}}>{t}</span>)}
            </div>}
          </div>
          <div style={{display:'flex',overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'7px 14px',background:'transparent',border:'none',cursor:'pointer',fontSize:12,fontWeight:600,color:tab===t.id?S.blue:S.muted,borderBottom:tab===t.id?`2px solid ${S.blue}`:'2px solid transparent',whiteSpace:'nowrap',display:'inline-flex',alignItems:'center',gap:5,flexShrink:0}}>
                {t.label}
                {t.id==='intel'&&acct.intelLog.length>0&&<span style={{fontSize:10,fontWeight:700,background:tab===t.id?'rgba(59,130,246,0.2)':'rgba(100,116,139,0.15)',color:tab===t.id?S.blue:S.muted,borderRadius:999,padding:'1px 6px',lineHeight:'16px'}}>{acct.intelLog.length}</span>}
                {t.id==='followups'&&critHighCount>0&&<span style={{fontSize:10,fontWeight:700,background:S.red,color:'#fff',borderRadius:999,padding:'1px 6px',lineHeight:'16px'}}>{critHighCount}</span>}
                {t.id==='aihistory'&&(acct.aiHistory||[]).length>0&&<span style={{fontSize:10,fontWeight:700,background:tab===t.id?'rgba(59,130,246,0.2)':'rgba(100,116,139,0.15)',color:tab===t.id?S.blue:S.muted,borderRadius:999,padding:'1px 6px',lineHeight:'16px'}}>{(acct.aiHistory||[]).length}</span>}
              </button>
            ))}
          </div>
        </div>
        <div style={{flex:mob?'none':1,overflowY:mob?'visible':'auto',WebkitOverflowScrolling:'touch',padding:mob?'14px 14px 60px':'18px 20px 60px',background:S.bg}}>
          {tab==='overview'&&<Overview acct={acct} setAcct={setAcct} setTab={setTab} apiKey={data.apiKey}/>}
          {tab==='dashboard'&&<Dashboard acct={acct}/>}
          {tab==='contacts'&&<Contacts acct={acct} setAcct={setAcct}/>}
          {tab==='stack'&&<TechStack acct={acct} setAcct={setAcct}/>}
          {tab==='projects'&&<Projects acct={acct} setAcct={setAcct}/>}
          {tab==='followups'&&<FollowUps acct={acct} setAcct={setAcct}/>}
          {tab==='intel'&&<IntelLog acct={acct} setAcct={setAcct} apiKey={data.apiKey}/>}
          {tab==='aihistory'&&<AIHistory acct={acct} setAcct={setAcct} apiKey={data.apiKey}/>}
          {tab==='settings'&&<Settings data={data} setData={setData} acct={acct} setAcct={setAcct} theme={theme} setTheme={handleSetTheme}/>}
        </div>
      </div>
    </div>
  )
}
