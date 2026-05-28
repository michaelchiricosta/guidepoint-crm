
import { useState, useEffect } from 'react'

const SK = 'gp-crm-v4'
const S = { bg:'#0a0e1a', surf:'#111827', surf2:'#0f1729', bdr:'#1e2d40', bdr2:'#2d3d50', txt:'#e2e8f0', muted:'#64748b', dim:'#334155', blue:'#3b82f6', green:'#22c55e', red:'#ef4444', orange:'#f97316', yellow:'#eab308', purple:'#a855f7' }
const PC = { Critical:{c:'#ef4444',b:'rgba(239,68,68,0.12)'}, High:{c:'#f97316',b:'rgba(249,115,22,0.12)'}, Medium:{c:'#eab308',b:'rgba(234,179,8,0.12)'}, Low:{c:'#22c55e',b:'rgba(34,197,94,0.12)'} }
const IC = { 'Executive Sponsor':{c:'#a855f7',b:'rgba(168,85,247,0.12)'}, 'Technical Gatekeeper':{c:'#3b82f6',b:'rgba(59,130,246,0.12)'}, 'Financial Gatekeeper':{c:'#eab308',b:'rgba(234,179,8,0.12)'}, 'Final Approval':{c:'#ef4444',b:'rgba(239,68,68,0.12)'}, 'Stakeholder':{c:'#64748b',b:'rgba(100,116,139,0.12)'}, 'Risk Factor':{c:'#f97316',b:'rgba(249,115,22,0.12)'}, 'Ally':{c:'#22c55e',b:'rgba(34,197,94,0.12)'} }
const SC = { Current:'#22c55e', Selected:'#3b82f6', Evaluating:'#eab308', Replacing:'#ef4444', Watch:'#f97316', Dropping:'#ef4444' }
const PSC = { 'Not Started':'#64748b', 'In Discussion':'#3b82f6', 'In Flight':'#22c55e', Stalled:'#f97316', Won:'#a855f7', Lost:'#ef4444' }
const STAGES = ['Awareness','NDA','Intro Call','Demo','Scoping','Pricing','Legal','Procurement','PO Received','Deployed']
const INFLUENCES = ['Executive Sponsor','Technical Gatekeeper','Financial Gatekeeper','Final Approval','Stakeholder','Risk Factor','Ally']
const TECH_CATS = ['SIEM / SOC','Endpoint','Identity / IAM','Cloud Security','Network / SASE','Email Security','AppSec','Pen Test / Red Team','Threat Intel','GRC','IT Operations','Other']
const TECH_STATS = ['Current','Evaluating','Replacing','Watch','Dropping','Selected']
const PROJ_STATS = ['Not Started','In Discussion','In Flight','Stalled','Won','Lost']

const uid = () => Math.random().toString(36).slice(2,9)
const fmtDate = d => { if (!d) return ''; try { return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) } catch { return d } }
const daysUntil = d => { if (!d) return null; return Math.ceil((new Date(d+'T12:00:00') - new Date()) / 86400000) }
const initials = n => n.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()

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
    ]
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
const Modal = ({title,onClose,children,width=520}) => (
  <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}>
    <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,width:'100%',maxWidth:width,maxHeight:'90vh',overflow:'auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:`1px solid ${S.bdr}`}}>
        <div style={{fontSize:15,fontWeight:700,color:S.txt}}>{title}</div>
        <button onClick={onClose} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1}}>x</button>
      </div>
      <div style={{padding:20}}>{children}</div>
    </div>
  </div>
)
const SH = ({children,mt=0}) => <div style={{fontSize:10,fontWeight:700,color:S.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8,marginTop:mt}}>{children}</div>
const Card = ({children,style={}}) => <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,...style}}>{children}</div>

function Overview({acct,setAcct}) {
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
      {alerts.length>0&&<><SH>Alerts</SH><div style={{marginBottom:16}}>{alerts.slice(0,6).map((a,i)=>{const c={critical:S.red,high:S.orange,medium:S.yellow}[a.level]||S.muted;return(<div key={i} style={{display:'flex',gap:10,padding:'8px 12px',background:S.surf,border:`1px solid ${S.bdr}`,borderLeft:`3px solid ${c}`,borderRadius:7,marginBottom:5}}><span style={{color:c,flexShrink:0}}>!</span><span style={{fontSize:13,color:'#cbd5e1'}}>{a.text}</span></div>)})}</div></>}
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
    </div>
  )
}

function Contacts({acct,setAcct}) {
  const [exp,setExp] = useState(null)
  const [showAdd,setShowAdd] = useState(false)
  const [form,setForm] = useState({})
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const blank={id:'',name:'',title:'',email:'',cell:'',linkedin:'',location:'',dept:'',influence:'Stakeholder',sentiment:'neutral',relStatus:'Building',toolsOwn:'',goals:'',pains:'',notes:'',personalNotes:'',lastInteracted:''}
  const save=()=>{if(!form.name)return;if(form.id)setAcct(p=>({...p,contacts:p.contacts.map(c=>c.id===form.id?form:c)}));else setAcct(p=>({...p,contacts:[...p.contacts,{...form,id:uid()}]}));setShowAdd(false);setForm(blank)}
  const del=id=>{if(window.confirm('Delete contact?'))setAcct(p=>({...p,contacts:p.contacts.filter(c=>c.id!==id)}))}
  const sentC={positive:S.green,neutral:S.muted,negative:S.red}
  const relC={Strong:S.green,Building:S.blue,'Needs Attention':S.orange,Unknown:S.muted}
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div style={{fontSize:13,color:S.muted}}>{acct.contacts.length} contacts</div>
        <Btn variant='primary' onClick={()=>{setForm(blank);setShowAdd(true)}}>+ Add Contact</Btn>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:5}}>
        {acct.contacts.map(c=>{
          const inf=IC[c.influence]||IC.Stakeholder;const open=exp===c.id
          return (<Card key={c.id}>
            <div onClick={()=>setExp(open?null:c.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',cursor:'pointer'}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:inf.b,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:inf.c,flexShrink:0}}>{initials(c.name)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:13,fontWeight:600,color:S.txt}}>{c.name}</span><span style={{width:7,height:7,borderRadius:'50%',background:sentC[c.sentiment]||S.muted,flexShrink:0}} title={c.sentiment}/></div>
                <div style={{fontSize:11,color:S.muted}}>{c.title} · {c.dept}</div>
              </div>
              <div style={{display:'flex',gap:5,flexShrink:0,flexWrap:'wrap',justifyContent:'flex-end'}}>
                <Badge label={c.influence} color={inf.c} bg={inf.b}/>
                {c.relStatus&&<Badge label={c.relStatus} color={relC[c.relStatus]||S.muted} bg={(relC[c.relStatus]||S.muted)+'22'}/>}
              </div>
            </div>
            {open&&<div style={{padding:'12px 14px 16px',borderTop:`1px solid ${S.bdr}`}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 16px',marginBottom:10,fontSize:12}}>
                {[['Email',c.email],['Cell',c.cell],['LinkedIn',c.linkedin],['Location',c.location]].map(([l,v])=><div key={l}><span style={{color:S.muted}}>{l}: </span><span style={{color:S.txt}}>{v||'—'}</span></div>)}
              </div>
              {c.lastInteracted&&<div style={{fontSize:11,color:S.muted,marginBottom:8}}>Last interacted: {fmtDate(c.lastInteracted)}</div>}
              {[['Tools / Tech Owned',c.toolsOwn],['Key Goals',c.goals],['Key Pains',c.pains],['Notes',c.notes],['Personal Notes',c.personalNotes]].map(([l,v])=>v?<div key={l} style={{marginBottom:8}}><div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>{l}</div><div style={{fontSize:12,color:'#94a3b8',lineHeight:1.6}}>{v}</div></div>:null)}
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

function TechStack({acct,setAcct}) {
  const [showAdd,setShowAdd] = useState(false)
  const [form,setForm] = useState({})
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const blank={id:'',vendor:'',products:'',category:'SIEM / SOC',status:'Current',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'',notes:''}
  const save=()=>{if(!form.vendor)return;if(form.id)setAcct(p=>({...p,techStack:p.techStack.map(t=>t.id===form.id?form:t)}));else setAcct(p=>({...p,techStack:[...p.techStack,{...form,id:uid()}]}));setShowAdd(false);setForm(blank)}
  const del=id=>{if(window.confirm('Delete?'))setAcct(p=>({...p,techStack:p.techStack.filter(t=>t.id!==id)}))}
  const grouped=TECH_CATS.reduce((acc,cat)=>{const items=acct.techStack.filter(t=>t.category===cat);if(items.length)acc[cat]=items;return acc},{})
  const upcoming=acct.techStack.filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=150}).length
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:12,color:S.muted,display:'flex',gap:16}}>
          <span>{acct.techStack.length} vendors</span>
          {upcoming>0&&<span style={{color:S.orange}}>{upcoming} renewal{upcoming>1?'s':''} within 5 months</span>}
        </div>
        <Btn variant='primary' onClick={()=>{setForm(blank);setShowAdd(true)}}>+ Add Vendor</Btn>
      </div>
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
                    {t.notes&&<div style={{fontSize:12,color:'#94a3b8',marginTop:4}}>{t.notes}</div>}
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

function Projects({acct,setAcct}) {
  const [view,setView] = useState('pipeline')
  const [exp,setExp] = useState(null)
  const [showAdd,setShowAdd] = useState(false)
  const blank={id:'',name:'',category:'',vendor:'',status:'Not Started',description:'',goals:'',pains:'',primaryContact:'',budget:false,closeDate:'',notes:'',timeline:STAGES.map(s=>({stage:s,status:'pending',date:''}))}
  const [form,setForm] = useState(blank)
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const save=()=>{if(!form.name)return;if(form.id)setAcct(p=>({...p,projects:p.projects.map(j=>j.id===form.id?form:j)}));else setAcct(p=>({...p,projects:[...p.projects,{...form,id:uid()}]}));setShowAdd(false);setForm(blank)}
  const toggleStage=(projId,idx)=>{setAcct(p=>({...p,projects:p.projects.map(j=>{if(j.id!==projId)return j;const tl=j.timeline.map((s,i)=>i===idx?{...s,status:s.status==='completed'?'pending':'completed',date:s.status!=='completed'?new Date().toISOString().split('T')[0]:''}:s);return{...j,timeline:tl}})}))}
  const grouped=PROJ_STATS.reduce((acc,s)=>{acc[s]=acct.projects.filter(p=>p.status===s);return acc},{})
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
                <div style={{fontSize:11,color:S.muted,marginBottom:6}}>{p.vendor} · {p.primaryContact||'—'}</div>
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
          return (<Card key={p.id}>
            <div onClick={()=>setExp(open?null:p.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',cursor:'pointer'}}>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3,flexWrap:'wrap'}}>
                  <span style={{fontSize:13,fontWeight:700,color:S.txt}}>{p.name}</span>
                  <Badge label={p.status} color={sc} bg={sc+'1a'}/>
                  {p.vendor&&<Badge label={p.vendor} color={S.muted} bg='rgba(100,116,139,0.1)'/>}
                </div>
                <div style={{fontSize:11,color:S.muted}}>{p.primaryContact||'—'} · Close: {fmtDate(p.closeDate)||'TBD'}</div>
              </div>
            </div>
            <div style={{padding:'0 14px 14px'}}>
              <div style={{display:'flex',gap:2,marginBottom:6}}>
                {p.timeline.map((stage,i)=>{const c=stage.status==='completed'?S.green:stage.status==='current'?S.blue:S.bdr;return(<div key={i} onClick={e=>{e.stopPropagation();toggleStage(p.id,i)}} style={{flex:1,height:7,background:c,borderRadius:2,cursor:'pointer',transition:'background 0.2s'}} title={stage.stage+(stage.date?' - '+fmtDate(stage.date):'')+' (click to toggle)'}/>)})}
              </div>
              <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                {p.timeline.map((stage,i)=>{const c=stage.status==='completed'?S.green:stage.status==='current'?S.blue:S.dim;return(<span key={i} style={{fontSize:10,color:c,fontWeight:stage.status!=='pending'?600:400}}>{stage.stage}{stage.status==='completed'?' ✓':''}{i<p.timeline.length-1?' → ':''}</span>)})}
              </div>
              {open&&<div style={{marginTop:12,borderTop:`1px solid ${S.bdr}`,paddingTop:12}}>
                {p.description&&<p style={{fontSize:13,color:'#94a3b8',marginBottom:8,lineHeight:1.6}}>{p.description}</p>}
                {p.goals&&<div style={{marginBottom:6}}><span style={{fontSize:11,color:S.muted,fontWeight:700}}>GOALS: </span><span style={{fontSize:12,color:'#94a3b8'}}>{p.goals}</span></div>}
                {p.pains&&<div style={{marginBottom:6}}><span style={{fontSize:11,color:S.muted,fontWeight:700}}>PAINS: </span><span style={{fontSize:12,color:'#94a3b8'}}>{p.pains}</span></div>}
                {p.notes&&<div style={{marginBottom:10}}><span style={{fontSize:11,color:S.muted,fontWeight:700}}>NOTES: </span><span style={{fontSize:12,color:'#94a3b8'}}>{p.notes}</span></div>}
                <div style={{display:'flex',gap:8}}><Btn onClick={()=>{setForm(p);setShowAdd(true)}}>Edit</Btn><Btn variant='danger' onClick={()=>{if(window.confirm('Delete?'))setAcct(prev=>({...prev,projects:prev.projects.filter(j=>j.id!==p.id)}))}}>Delete</Btn></div>
              </div>}
            </div>
          </Card>)
        })}
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
  const [text,setText] = useState('')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [result,setResult] = useState(null)
  const [showDate,setShowDate] = useState(false)
  const [customDate,setCustomDate] = useState('')

  const process = async (date) => {
    setLoading(true);setError('');setResult(null)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({
          model:'claude-sonnet-4-6',max_tokens:8000,
          system:'You are an account intelligence analyst for a cybersecurity sales rep at GuidePoint Security. Extract structured intel from input. Return ONLY valid compact JSON. Be concise. Max 5 items per array. No markdown, no explanation.',
          messages:[{role:'user',content:`Extract intelligence and return JSON:
{
  "intelEntry":{"date":"${date}","type":"Call|Meeting|Email|Note","participants":"string","summary":"2-3 sentences","insights":["string"],"risks":["string"],"opportunities":["string"]},
  "newFollowUps":[{"contact":"contact name or empty","task":"string","priority":"Critical|High|Medium|Low","dueDate":"YYYY-MM-DD or empty","context":"string"}],
  "contactUpdates":[{"name":"exact contact name","lastInteracted":"${date}","noteToAppend":"new info only"}]
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
        if (parsed.intelEntry) { next.intelLog=[{...parsed.intelEntry,id:uid()},...(prev.intelLog||[])]; next.lastContact=date }
        if (parsed.newFollowUps?.length) next.followUps=[...(prev.followUps||[]),...parsed.newFollowUps.map(fu=>({...fu,id:uid(),status:'Open'}))]
        if (parsed.contactUpdates?.length) next.contacts=(prev.contacts||[]).map(c=>{const u=parsed.contactUpdates.find(u=>u.name&&c.name.toLowerCase().includes(u.name.split(' ')[0].toLowerCase()));return u?{...c,lastInteracted:u.lastInteracted||c.lastInteracted,notes:u.noteToAppend?(c.notes||'')+' | ['+date+'] '+u.noteToAppend:c.notes}:c})
        return next
      })
      setResult({followUps:parsed.newFollowUps?.length||0,contacts:parsed.contactUpdates?.length||0,entry:!!parsed.intelEntry})
      setText('')
    } catch(e) { setError('Error: '+(e.message||'Processing failed. Check your API key in Settings.')) }
    setLoading(false)
  }

  const handleProcess = () => { if (!apiKey) { setError('Add your Anthropic API key in Settings first.'); return } setShowDate(true) }

  return (
    <div>
      <Card style={{padding:16,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:600,color:S.txt,marginBottom:4}}>Add Intelligence</div>
        <div style={{fontSize:12,color:S.muted,marginBottom:10}}>Paste a call transcript, meeting notes, email, or quick note. AI extracts follow-ups, updates contacts, and logs the intel automatically.</div>
        {!apiKey&&<div style={{fontSize:11,color:S.orange,marginBottom:8,padding:'6px 10px',background:'rgba(249,115,22,0.08)',border:'1px solid rgba(249,115,22,0.2)',borderRadius:5}}>No API key — go to Settings and add your Anthropic API key to enable AI processing.</div>}
        <textarea value={text} onChange={e=>setText(e.target.value)} rows={8} placeholder={'Paste transcript, meeting notes, email, or a quick note here...\n\nExample: "Talked to Rudy today. NetSpy demo confirmed for Wednesday. Jamie Dennis reached back about Saviynt pricing — wants a decision by June..."'} style={{marginBottom:10}}/>
        {error&&<div style={{fontSize:12,color:S.red,marginBottom:8,lineHeight:1.5}}>{error}</div>}
        {result&&<div style={{fontSize:12,color:S.green,marginBottom:8,padding:'8px 12px',background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:6}}>Done — logged {result.entry?'1 intel entry':''},  added {result.followUps} follow-up{result.followUps!==1?'s':''}, updated {result.contacts} contact{result.contacts!==1?'s':''}</div>}
        <button onClick={handleProcess} disabled={loading||!text.trim()} style={{display:'flex',alignItems:'center',gap:6,padding:'9px 18px',background:loading||!text.trim()?S.dim:S.blue,border:'none',borderRadius:7,color:'#fff',fontSize:13,fontWeight:700,cursor:loading||!text.trim()?'default':'pointer',opacity:!text.trim()?0.5:1}}>
          {loading?'Processing...':'Process with AI'}
        </button>
      </Card>
      <SH>Intel Log ({acct.intelLog.length} entries)</SH>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {acct.intelLog.length===0&&<div style={{textAlign:'center',padding:'30px',color:S.muted,fontSize:13}}>No intel logged yet. Paste a transcript above to get started.</div>}
        {acct.intelLog.map(e=>(
          <Card key={e.id} style={{padding:'14px 16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <Badge label={e.type||'Note'} color={S.blue} bg='rgba(59,130,246,0.12)'/>
              <span style={{fontSize:12,color:S.muted}}>{fmtDate(e.date)}</span>
              {e.participants&&<span style={{fontSize:12,color:S.muted}}>· {e.participants}</span>}
            </div>
            <p style={{fontSize:13,color:'#cbd5e1',margin:'0 0 10px',lineHeight:1.6}}>{e.summary}</p>
            {e.insights?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:10,color:S.muted,fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Key Insights</div>{e.insights.map((ins,i)=><div key={i} style={{fontSize:12,color:'#94a3b8',marginBottom:3,paddingLeft:10}}>→ {ins}</div>)}</div>}
            {e.risks?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:10,color:S.red,fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Risks</div>{e.risks.map((r,i)=><div key={i} style={{fontSize:12,color:'#94a3b8',marginBottom:3,paddingLeft:10}}>! {r}</div>)}</div>}
            {e.opportunities?.length>0&&<div><div style={{fontSize:10,color:S.green,fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Opportunities</div>{e.opportunities.map((o,i)=><div key={i} style={{fontSize:12,color:'#94a3b8',marginBottom:3,paddingLeft:10}}>+ {o}</div>)}</div>}
          </Card>
        ))}
      </div>
      {showDate&&<Modal title='Date this entry' onClose={()=>setShowDate(false)} width={380}>
        <p style={{fontSize:13,color:'#94a3b8',marginBottom:14}}>Is this a new entry from today, or are you uploading an older transcript or note?</p>
        <Field label='Custom date (leave blank for today)' value={customDate} onChange={setCustomDate} type='date'/>
        <div style={{display:'flex',gap:8,marginTop:4}}>
          <Btn variant='primary' onClick={()=>{setShowDate(false);process(new Date().toISOString().split('T')[0])}}>Use Today</Btn>
          <Btn onClick={()=>{if(customDate){setShowDate(false);process(customDate)}}} style={{opacity:customDate?1:0.4}}>Use {customDate?fmtDate(customDate):'Custom Date'}</Btn>
        </div>
      </Modal>}
    </div>
  )
}

function Settings({data,setData,acct,setAcct}) {
  const [key,setKey] = useState(data.apiKey||'')
  const [saved,setSaved] = useState(false)
  const saveKey=()=>{setData(p=>({...p,apiKey:key}));setSaved(true);setTimeout(()=>setSaved(false),2000)}
  const exportData=()=>{const b=new Blob([JSON.stringify(data,null,2)]);const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='guidepoint-crm-backup.json';a.click()}
  return (
    <div style={{maxWidth:520}}>
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

function Sidebar({data,activeId,setActiveId,setData}) {
  const [showAdd,setShowAdd] = useState(false)
  const [newName,setNewName] = useState('')
  const addAccount=()=>{if(!newName.trim())return;const id=uid();setData(p=>({...p,accounts:[...p.accounts,{...SAMPLE.accounts[0],id,name:newName,short:newName.slice(0,5).toUpperCase(),contacts:[],techStack:[],projects:[],interactions:[],intelLog:[],followUps:[]}]}));setActiveId(id);setShowAdd(false);setNewName('')}
  const sc={Strategic:'#a855f7',Active:'#22c55e',Prospect:'#3b82f6','At Risk':'#ef4444'}
  return (
    <div style={{width:220,background:'#060a12',borderRight:`1px solid ${S.bdr}`,display:'flex',flexDirection:'column',flexShrink:0,height:'100%'}}>
      <div style={{padding:'14px 14px 8px'}}>
        <div style={{fontSize:10,fontWeight:800,color:S.blue,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:2}}>GuidePoint Security</div>
        <div style={{fontSize:13,fontWeight:700,color:S.txt}}>Account Intelligence</div>
      </div>
      <div style={{fontSize:10,fontWeight:700,color:S.muted,letterSpacing:'0.08em',textTransform:'uppercase',padding:'8px 14px 4px'}}>My Accounts</div>
      <div style={{flex:1,overflowY:'auto',padding:'0 8px'}}>
        {data.accounts.map(a=>(
          <button key={a.id} onClick={()=>setActiveId(a.id)} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'8px',borderRadius:7,border:'none',background:activeId===a.id?'rgba(59,130,246,0.12)':'transparent',textAlign:'left',cursor:'pointer',marginBottom:2}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:sc[a.status]||S.muted,flexShrink:0}}/>
            <div style={{minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:activeId===a.id?S.blue:S.txt,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.short||a.name}</div>
              <div style={{fontSize:10,color:S.muted}}>{a.status}</div>
            </div>
          </button>
        ))}
      </div>
      <div style={{padding:'8px 10px',borderTop:`1px solid ${S.bdr}`}}>
        {showAdd?<div>
          <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder='Account name...' onKeyDown={e=>e.key==='Enter'&&addAccount()} style={{marginBottom:6,fontSize:12}}/>
          <div style={{display:'flex',gap:5}}>
            <Btn variant='primary' onClick={addAccount} style={{flex:1,justifyContent:'center',fontSize:12,padding:'5px 8px'}}>Add</Btn>
            <Btn onClick={()=>{setShowAdd(false);setNewName('')}} style={{fontSize:12,padding:'5px 8px'}}>x</Btn>
          </div>
        </div>:<button onClick={()=>setShowAdd(true)} style={{display:'flex',alignItems:'center',gap:6,width:'100%',padding:'7px 8px',background:'transparent',border:`1px dashed ${S.bdr}`,borderRadius:7,color:S.muted,fontSize:12,cursor:'pointer'}}>+ New Account</button>}
      </div>
    </div>
  )
}

const TABS = [{id:'overview',label:'Overview'},{id:'contacts',label:'Contacts'},{id:'stack',label:'Tech Stack'},{id:'projects',label:'Projects'},{id:'followups',label:'Follow-Ups'},{id:'intel',label:'Intel Log'},{id:'settings',label:'Settings'}]

export default function App() {
  const [data,setData] = useState(null)
  const [activeId,setActiveId] = useState('bhsi')
  const [tab,setTab] = useState('overview')

  useEffect(()=>{ const s=localStorage.getItem(SK); if(s){try{setData(JSON.parse(s))}catch{setData(SAMPLE)}}else setData(SAMPLE) },[])
  useEffect(()=>{ if(data)localStorage.setItem(SK,JSON.stringify(data)) },[data])

  if (!data) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:S.muted,fontSize:14}}>Loading...</div>

  const acct = data.accounts.find(a=>a.id===activeId)||data.accounts[0]
  const setAcct = fn => setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===acct.id?(typeof fn==='function'?fn(a):fn):a)}))

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:S.bg}}>
      <Sidebar data={data} activeId={activeId} setActiveId={id=>{setActiveId(id);setTab('overview')}} setData={setData}/>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{background:'#0c1017',borderBottom:`1px solid ${S.bdr}`,padding:'10px 20px 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
            <div>
              <div style={{fontSize:10,color:S.blue,fontWeight:800,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:2}}>{acct.status}</div>
              <div style={{fontSize:17,fontWeight:800,color:'#f1f5f9'}}>{acct.name}</div>
            </div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap',justifyContent:'flex-end'}}>
              {[acct.industry,acct.hq,'Last contact: '+fmtDate(acct.lastContact)].filter(Boolean).map(t=><span key={t} style={{fontSize:11,color:S.muted,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:999,padding:'2px 10px'}}>{t}</span>)}
            </div>
          </div>
          <div style={{display:'flex',overflowX:'auto'}}>
            {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'7px 14px',background:'transparent',border:'none',cursor:'pointer',fontSize:12,fontWeight:600,color:tab===t.id?S.blue:S.muted,borderBottom:tab===t.id?`2px solid ${S.blue}`:'2px solid transparent',whiteSpace:'nowrap'}}>{t.label}</button>)}
          </div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'18px 20px 60px'}}>
          {tab==='overview'&&<Overview acct={acct} setAcct={setAcct}/>}
          {tab==='contacts'&&<Contacts acct={acct} setAcct={setAcct}/>}
          {tab==='stack'&&<TechStack acct={acct} setAcct={setAcct}/>}
          {tab==='projects'&&<Projects acct={acct} setAcct={setAcct}/>}
          {tab==='followups'&&<FollowUps acct={acct} setAcct={setAcct}/>}
          {tab==='intel'&&<IntelLog acct={acct} setAcct={setAcct} apiKey={data.apiKey}/>}
          {tab==='settings'&&<Settings data={data} setData={setData} acct={acct} setAcct={setAcct}/>}
        </div>
      </div>
    </div>
  )
}
