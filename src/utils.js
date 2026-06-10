import { S } from './theme.js'

export const uid = () => Math.random().toString(36).slice(2,9)

export const extractJSON = text => {
  if (!text) return null
  try { return JSON.parse(text) } catch {}
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) { try { return JSON.parse(codeBlock[1].trim()) } catch {} }
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) { try { return JSON.parse(jsonMatch[0]) } catch {} }
  const arrayMatch = text.match(/"accounts"\s*:\s*(\[[\s\S]*?\])\s*[,}]/)
  if (arrayMatch) { try { return { accounts: JSON.parse(arrayMatch[1]) } } catch {} }
  return null
}

export const fmtDate = d => { if (!d) return ''; try { return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) } catch { return d } }
export const daysUntil = d => { if (!d) return null; return Math.ceil((new Date(d+'T12:00:00') - new Date()) / 86400000) }
export const daysSince = d => { if (!d) return null; return Math.floor((new Date() - new Date(d+'T12:00:00')) / 86400000) }
export const parseCost = s => { if(!s)return 0; const c=String(s).replace(/[$,\s]/g,'').toLowerCase(); if(c.endsWith('k'))return parseFloat(c)*1000||0; if(c.endsWith('m'))return parseFloat(c)*1000000||0; return parseFloat(c)||0 }
export const fmtSpend = n => { if(!n)return '$0'; if(n>=1000000)return `$${(n/1000000).toFixed(1).replace(/\.0$/,'')}M`; if(n>=1000)return `$${n.toLocaleString()}`; return `$${n}` }
export const formatCompactCurrency = n => { if(!n||isNaN(n))return '$0'; if(n>=1000000)return `$${(n/1000000).toFixed(1).replace(/\.0$/,'')}M`; if(n>=1000)return `$${Math.round(n/1000)}k`; return `$${n.toLocaleString()}` }
export const initials = n => n.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()

export const calcDetailedHealthScore = acct => {
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
  const intelCount=acct.intelLog?.length||0
  const riskFactor=intelCount<5?intelCount/5:1
  const riskCalc=Math.max(0,20-(critFU*4+ren60*3+negSen*3+lostP*2)*riskFactor)
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
    critFU>0&&{pts:critFU*4,label:`${critFU} Critical action${critFU!==1?'s':''} open`},
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
    total,calcTotal,isManualOverride:ov.totalOverride!==undefined,helping:helpArr,hurting:hurtArr,intelCount
  }
}

export const calcHealthScore = acct => calcDetailedHealthScore(acct).total

export const getHealthColor = score => {
  if (score===null||score===undefined||isNaN(score)) return '#94a3b8'
  const s=Math.max(0,Math.min(100,score))
  const stops=[
    {at:0,  color:[220,38, 38]},
    {at:7,  color:[225,55, 35]},
    {at:14, color:[230,75, 30]},
    {at:21, color:[234,100,25]},
    {at:28, color:[238,125,20]},
    {at:35, color:[240,150,15]},
    {at:42, color:[242,170,10]},
    {at:50, color:[234,179,8]},
    {at:57, color:[200,185,10]},
    {at:64, color:[160,185,15]},
    {at:71, color:[100,180,20]},
    {at:78, color:[60, 175,30]},
    {at:85, color:[34, 168,50]},
    {at:92, color:[22, 160,60]},
    {at:100,color:[15, 150,70]},
  ]
  let lower=stops[0],upper=stops[stops.length-1]
  for(let i=0;i<stops.length-1;i++){if(s>=stops[i].at&&s<=stops[i+1].at){lower=stops[i];upper=stops[i+1];break}}
  const range=upper.at-lower.at,t=range===0?0:(s-lower.at)/range
  const r=Math.round(lower.color[0]+t*(upper.color[0]-lower.color[0]))
  const g=Math.round(lower.color[1]+t*(upper.color[1]-lower.color[1]))
  const b=Math.round(lower.color[2]+t*(upper.color[2]-lower.color[2]))
  return `rgb(${r},${g},${b})`
}

export const getQuickWin = acct => { const overdue=(acct.followUps||[]).filter(f=>f.status==='Open'&&f.dueDate&&daysUntil(f.dueDate)<0).sort((a,b)=>daysUntil(a.dueDate)-daysUntil(b.dueDate)); if(overdue.length>0){const fu=overdue[0];const days=Math.abs(daysUntil(fu.dueDate));return{title:fu.task,meta:`Overdue by ${days} day${days!==1?'s':''}`,cta:'Go to Actions',tab:'followups',color:S.red}} const renew=(acct.techStack||[]).filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=90}).sort((a,b)=>daysUntil(a.renewalDate)-daysUntil(b.renewalDate)); if(renew.length>0){const t=renew[0];const d=daysUntil(t.renewalDate);return{title:`${t.vendor} renewal in ${d} day${d!==1?'s':''}`,meta:fmtDate(t.renewalDate)+(t.notes?' — '+t.notes.slice(0,70):''),cta:'Go to Tech Stack',tab:'stack',color:S.orange}} const stalled=(acct.projects||[]).filter(p=>p.status==='Stalled'); if(stalled.length>0){const p=stalled[0];return{title:p.name,meta:`Stalled project${p.waitingOn?' — Waiting on: '+p.waitingOn:' — no next action defined'}`,cta:'Go to Projects',tab:'projects',color:S.yellow}} return null }

export const sendToAppleReminders = (followUp, accountName) => {
  const title = followUp.task || ''
  const notes = [
    followUp.context || '',
    followUp.contact ? 'Contact: ' + followUp.contact : '',
    accountName ? 'Account: ' + accountName : '',
    followUp.dueDate ? 'Due: ' + followUp.dueDate : ''
  ].filter(Boolean).join(' | ')
  const input = notes ? `${title} — ${notes}` : title
  const encoded = encodeURIComponent(input)
  window.location.href = `shortcuts://run-shortcut?name=Add%20to%20Reminders&input=${encoded}`
}

export const globalSearch = (data, query) => { if(!query||!query.trim()||query.length<2)return []; const q=query.toLowerCase(); const results=[]; (data.accounts||[]).forEach(acct=>{const an=acct.short||acct.name; (acct.contacts||[]).filter(c=>`${c.name} ${c.title}`.toLowerCase().includes(q)).slice(0,3).forEach(c=>results.push({accountId:acct.id,accountName:an,category:'Contacts',label:c.name,sublabel:c.title,tab:'contacts'})); (acct.projects||[]).filter(p=>`${p.name} ${p.vendor||''}`.toLowerCase().includes(q)).slice(0,3).forEach(p=>results.push({accountId:acct.id,accountName:an,category:'Projects',label:p.name,sublabel:p.vendor,tab:'projects'})); (acct.techStack||[]).filter(t=>t.vendor.toLowerCase().includes(q)).slice(0,3).forEach(t=>results.push({accountId:acct.id,accountName:an,category:'Tech Stack',label:t.vendor,sublabel:t.products,tab:'stack'})); (acct.intelLog||[]).filter(e=>(e.summary||'').toLowerCase().includes(q)||(e.participants||'').toLowerCase().includes(q)).slice(0,2).forEach(e=>results.push({accountId:acct.id,accountName:an,category:'Intel',label:(e.summary||'').slice(0,55)+((e.summary||'').length>55?'…':''),sublabel:fmtDate(e.date),tab:'intel'})) }); return results }
