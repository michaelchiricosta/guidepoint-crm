import { useState, useRef } from 'react'
import { S } from '../theme.js'
import { Field, Btn, SH, Card } from './UI.jsx'
import { supabase, getLoadTiming, getSaveTiming } from '../supabase.js'
import { DEFAULT_AI_SETTINGS, checkBudget, get529Retries } from '../utils/aiHelper.js'
import { getRecords, getStats } from '../utils/aiTracker.js'

const LS_API_KEY = 'ledgr_anthropic_api_key'

export default function Settings({data,setData,acct,setAcct,theme,setTheme,saveInProgress,lastSaveTime,onReset}) {
  const [key,setKey] = useState(()=>localStorage.getItem(LS_API_KEY)||data.apiKey||'')
  const [saved,setSaved] = useState(false)
  const [logoStatus,setLogoStatus] = useState(null)
  const [pdfLoading,setPdfLoading] = useState(false)
  const logoInputRef = useRef(null)
  const saveKey=()=>{
    localStorage.setItem(LS_API_KEY, key)
    // Keep data.apiKey in sync so existing AI callers that read data.apiKey still work,
    // but supabase.js strips it before persisting so it never reaches the database.
    setData(p=>({...p,apiKey:key}))
    setSaved(true);setTimeout(()=>setSaved(false),2000)
  }
  const exportData=()=>{
    // Strip API key and cache from backup — key lives in localStorage, cache is ephemeral
    const {apiKey:_k, aiCache:_c, ...exportable} = data
    const b=new Blob([JSON.stringify(exportable,null,2)])
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='guidepoint-crm-backup.json';a.click()
  }
  const LOGO_COLORS = ['#007AFF','#7c3aed','#0ebc5f','#ea580c','#0891b2','#e91e8c']
  const acctIdx = (data.accounts||[]).findIndex(a=>a.id===acct.id)
  const logoColor = LOGO_COLORS[Math.max(0,acctIdx)%LOGO_COLORS.length]
  const logoInitial = (acct.name||'?')[0].toUpperCase()
  const compressImage = (file) => new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    const img = new Image()
    img.onload = () => {
      const maxSize = 200
      let w = img.width, h = img.height
      if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize } }
      else { if (h > maxSize) { w = w * maxSize / h; h = maxSize } }
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = URL.createObjectURL(file)
  })
  const handleLogoSave = async (compressed) => {
    saveInProgress.current = true
    lastSaveTime.current = Date.now()
    const updatedAccounts = (data.accounts||[]).map(a => a.id===acct.id ? {...a,logoImage:compressed} : a)
    const updatedData = {...data, accounts:updatedAccounts}
    setData(updatedData)
    setAcct(p=>({...p,logoImage:compressed}))
    setLogoStatus('saving')
    try {
      const {apiKey:_k, aiCache:_c, ...safeUpdated} = updatedData
      const {error} = await supabase.from('accounts').upsert({id:'user-data',data:safeUpdated,updated_at:new Date().toISOString()})
      if (error) throw error
      console.log('Logo saved to Supabase for:', acct.name)
      setLogoStatus('saved')
      setTimeout(()=>setLogoStatus(null),2000)
    } catch(err) {
      console.error('Logo save failed:', err)
      setLogoStatus(null)
      alert('Logo save failed. Please try again.')
    } finally {
      setTimeout(()=>{ saveInProgress.current = false }, 3000)
    }
  }
  const handleRemoveLogo = async () => {
    saveInProgress.current = true
    lastSaveTime.current = Date.now()
    const updatedAccounts = (data.accounts||[]).map(a => a.id===acct.id ? {...a,logoImage:''} : a)
    const updatedData = {...data, accounts:updatedAccounts}
    setData(updatedData)
    setAcct(p=>({...p,logoImage:''}))
    try {
      const {apiKey:_k, aiCache:_c, ...safeUpdated} = updatedData
      await supabase.from('accounts').upsert({id:'user-data',data:safeUpdated,updated_at:new Date().toISOString()})
    } catch(err) { console.error('Logo remove failed:', err) }
    finally { setTimeout(()=>{ saveInProgress.current = false }, 3000) }
  }
  const generateMasterAccountPlan = async () => {
    setPdfLoading(true)
    try {
      const jsPDFLib = (await import('jspdf')).default
      const doc = new jsPDFLib({ orientation: 'portrait', unit: 'mm', format: 'letter' })
      const PW = doc.internal.pageSize.getWidth()
      const PH = doc.internal.pageSize.getHeight()
      const ML = 20, MR = 20, CW = PW - ML - MR
      const SAFE = PH - 18
      let y = 20

      const NAVY=[13,31,61], BLUE=[0,91,187], LTBLUE=[219,234,254]
      const GRAY=[107,114,128], LGRAY=[243,244,246]
      const BLACK=[17,24,39], WHITE=[255,255,255]
      const RED=[220,38,38], GREEN=[22,163,74], ORANGE=[234,88,12]

      const tc = (...rgb) => doc.setTextColor(...rgb)
      const fc = (...rgb) => doc.setFillColor(...rgb)
      const fn = (size, style='normal') => { doc.setFontSize(size); doc.setFont('helvetica',style) }
      const fmtD = d => d ? new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''
      const trunc = (s,n=300) => { if(!s)return''; s=String(s); return s.length>n?s.slice(0,n)+'… (See Ledgr for full detail)':s }

      // Add page break if not enough space, with thin nav header on continuation pages
      const guard = (space=14) => {
        if (y+space>SAFE) {
          doc.addPage()
          fc(...NAVY); doc.rect(0,0,PW,8,'F')
          fn(7); tc(...WHITE)
          doc.text(`Master Account Plan — ${acct.name}`,ML,5.5)
          doc.text(new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),PW-MR,5.5,{align:'right'})
          y=16
        }
      }

      const sect = title => {
        guard(18); y+=5
        fc(...NAVY); doc.rect(ML,y,CW,7.5,'F')
        fn(8.5,'bold'); tc(...WHITE); doc.text(title.toUpperCase(),ML+4,y+5.2)
        y+=13; tc(...BLACK)
      }

      const hRule = () => {
        guard(4)
        doc.setDrawColor(226,232,240); doc.setLineWidth(0.25)
        doc.line(ML,y,ML+CW,y); y+=3.5
      }

      // Render wrapped text advancing y; handles page breaks mid-block
      const wrapText = (text,x,maxW,size,style='normal',color=BLACK) => {
        if(!text)return
        fn(size,style); tc(...color)
        const lh = size*0.43
        const lines = doc.splitTextToSize(String(text),maxW)
        let i=0
        while(i<lines.length){
          const fits = Math.max(1,Math.floor((SAFE-y)/lh))
          const batch = lines.slice(i,i+fits)
          guard(batch.length*lh)
          doc.text(batch,x,y); y+=batch.length*lh; i+=batch.length
        }
      }

      // Draw a small colored pill badge, return width consumed
      const chipBadge = (text,color,cx,cy) => {
        fn(6.5,'bold')
        const w = Math.max(doc.getTextWidth(text)+5,14)
        fc(...color); doc.roundedRect(cx,cy-3.5,w,5.2,1.2,1.2,'F')
        tc(...WHITE); doc.text(text,cx+w/2,cy+0.5,{align:'center'})
        return w+3
      }

      // ── COVER ──────────────────────────────────────────────────
      fc(...NAVY); doc.rect(0,0,PW,58,'F')

      fc(...BLUE); doc.circle(ML+13,21,13,'F')
      fn(17,'bold'); tc(...WHITE)
      doc.text((acct.name||'A')[0].toUpperCase(),ML+13,25.5,{align:'center'})

      fn(19,'bold'); tc(...WHITE)
      doc.text((acct.name||'Account').slice(0,42),ML+32,18)
      fn(10); tc(...LTBLUE)
      doc.text('MASTER ACCOUNT PLAN',ML+32,26)
      fn(8); tc(160,185,220)
      doc.text(`Generated: ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}`,ML+32,34)
      fn(8,'bold'); tc(180,200,235)
      doc.text('GuidePoint Security',PW-MR,34,{align:'right'})

      const hdrChips=[acct.status,acct.industry].filter(Boolean)
      let chipX=ML+32
      fn(7.5,'bold')
      hdrChips.forEach(c=>{
        fc(30,50,90); const w=doc.getTextWidth(c)+8
        doc.roundedRect(chipX,39.5,w,5.5,1.5,1.5,'F')
        tc(160,200,255); doc.text(c,chipX+w/2,43.5,{align:'center'})
        chipX+=w+4
      })

      // Stats strip
      y=66
      const qStats=[
        {label:'Active Projects',val:String((acct.projects||[]).filter(p=>['In Flight','In Discussion'].includes(p.status)).length)},
        {label:'Open Actions',   val:String((acct.followUps||[]).filter(f=>f.status==='Open').length)},
        {label:'Contacts',       val:String((acct.contacts||[]).length)},
        {label:'Intel Entries',  val:String((acct.intelLog||[]).length)},
      ]
      const sW=CW/4
      qStats.forEach(({label,val},i)=>{
        const sx=ML+i*sW
        fc(...LGRAY); doc.rect(sx,y,sW-2,16,'F')
        fn(16,'bold'); tc(...NAVY); doc.text(val,sx+sW/2-1,y+10,{align:'center'})
        fn(7); tc(...GRAY); doc.text(label,sx+sW/2-1,y+14.5,{align:'center'})
      })
      y+=24

      // ── SECTION 1: Account Overview ────────────────────────────
      sect('Account Overview')
      const ovPairs=[
        ['Industry',acct.industry],['HQ / Location',acct.hq],
        ['Cloud Environment',acct.cloud],['User Count',acct.users],
        ['Endpoints',acct.endpoints],['Account Status',acct.status],
        ['Relationship',acct.relationship],['Last Contact',fmtD(acct.lastContact)],
      ].filter(([,v])=>v)

      for(let i=0;i<ovPairs.length;i+=2){
        guard(16); const rowY=y
        const [l1,v1]=ovPairs[i], [l2,v2]=ovPairs[i+1]||[]
        fn(7.5,'bold'); tc(...GRAY); doc.text(l1.toUpperCase(),ML,rowY)
        fn(9); tc(...BLACK)
        const ln1=doc.splitTextToSize(String(v1),CW/2-8); doc.text(ln1,ML,rowY+4.5)
        const h1=ln1.length*4.5+7
        let h2=0
        if(l2&&v2){
          fn(7.5,'bold'); tc(...GRAY); doc.text(l2.toUpperCase(),ML+CW/2,rowY)
          fn(9); tc(...BLACK)
          const ln2=doc.splitTextToSize(String(v2),CW/2-8); doc.text(ln2,ML+CW/2,rowY+4.5)
          h2=ln2.length*4.5+7
        }
        y=rowY+Math.max(h1,h2)
      }
      if(acct.notes){
        guard(14); y+=2
        fn(7.5,'bold'); tc(...GRAY); doc.text('ACCOUNT NOTES',ML,y); y+=5
        wrapText(trunc(acct.notes,500),ML,CW,8.5); y+=3
      }

      // ── SECTION 2: Key Contacts ────────────────────────────────
      if((acct.contacts||[]).length>0){
        sect('Key Contacts')
        acct.contacts.forEach((c,idx)=>{
          guard(26); if(idx>0)hRule()
          fn(10.5,'bold'); tc(...NAVY)
          const cName=(c.name||'Unknown').slice(0,40); doc.text(cName,ML,y)
          let bx=ML+doc.getTextWidth(cName)+5
          if(c.relStatus){const bc=c.relStatus==='Strong'?GREEN:c.relStatus==='Building'?BLUE:c.relStatus==='Needs Attention'?RED:ORANGE; bx+=chipBadge(c.relStatus,bc,bx,y)}
          if(c.influence)chipBadge(c.influence,NAVY,bx,y)
          y+=5
          if(c.title){fn(8.5,'italic');tc(...GRAY);doc.text(c.title.slice(0,60),ML,y);y+=5}
          const dPairs=[
            [c.email?`Email: ${c.email}`:null, c.phone?`Phone: ${c.phone}`:null],
            [c.lastInteracted?`Last Contact: ${fmtD(c.lastInteracted)}`:null, c.contactType?`Type: ${c.contactType}`:null],
          ]
          dPairs.forEach(([left,right])=>{
            if(!left&&!right)return; guard(5); fn(8); tc(...GRAY)
            if(left)doc.text(left.slice(0,55),ML,y)
            if(right)doc.text(right.slice(0,55),ML+CW/2,y)
            y+=4.5
          })
          if(c.notes){
            guard(8); fn(8,'italic'); tc(...GRAY)
            const nl=doc.splitTextToSize(trunc(c.notes,200),CW); doc.text(nl,ML,y); y+=nl.length*3.8
          }
          y+=3
        })
      }

      // ── SECTION 3: Technology Stack ────────────────────────────
      if((acct.techStack||[]).length>0){
        sect('Technology Stack')
        const TCW=[42,48,26,32,27]
        const TCOL=['VENDOR','CATEGORY','STATUS','RENEWAL DATE','ANNUAL COST']
        guard(10); fc(...LGRAY); doc.rect(ML,y,CW,7,'F')
        let xc=ML
        TCOL.forEach((h,i)=>{fn(7,'bold');tc(...GRAY);doc.text(h,xc+2,y+5);xc+=TCW[i]})
        y+=9
        acct.techStack.forEach((t,i)=>{
          guard(12)
          if(i%2===0){doc.setFillColor(250,252,255);doc.rect(ML,y-1,CW,7.5,'F')}
          xc=ML
          fn(8.5,'bold'); tc(...BLACK); doc.text((t.vendor||'').slice(0,24),xc+2,y+4); xc+=TCW[0]
          fn(8.5); tc(...GRAY); doc.text((t.category||'').slice(0,30),xc+2,y+4); xc+=TCW[1]
          const sc=t.status==='Active'?GREEN:t.status==='Evaluating'?BLUE:t.status==='Replacing'?RED:GRAY
          tc(...sc); fn(8.5,'bold'); doc.text(t.status||'—',xc+2,y+4); xc+=TCW[2]
          tc(...GRAY); fn(8.5); doc.text(fmtD(t.renewalDate)||'—',xc+2,y+4); xc+=TCW[3]
          doc.text(t.cost?String(t.cost).slice(0,12):'—',xc+2,y+4); y+=8
          if(t.notes){
            guard(7); fn(7.5,'italic'); tc(155,165,180)
            const nl=doc.splitTextToSize(`  ↳ ${t.notes.slice(0,200)}`,CW-4); doc.text(nl,ML+2,y); y+=nl.length*3.5+1
          }
        })
      }

      // ── SECTION 4: Projects & Pipeline ────────────────────────
      if((acct.projects||[]).length>0){
        sect('Projects & Pipeline')
        const SORD=['In Flight','In Discussion','Not Started','Stalled','Won','Lost']
        const sortedP=[...acct.projects].sort((a,b)=>SORD.indexOf(a.status)-SORD.indexOf(b.status))
        sortedP.forEach((p,idx)=>{
          guard(30); if(idx>0)hRule()
          fn(10.5,'bold'); tc(...NAVY)
          const pn=(p.name||'Unnamed Project').slice(0,50); doc.text(pn,ML,y)
          const psc=p.status==='In Flight'?BLUE:p.status==='In Discussion'?[147,197,253]:p.status==='Won'?GREEN:p.status==='Lost'?RED:p.status==='Stalled'?ORANGE:GRAY
          chipBadge(p.status||'—',psc,ML+doc.getTextWidth(pn)+5,y); y+=5.5
          const currSt=p.timeline?.find(s=>s.status==='current')?.stage||p.timeline?.filter(s=>s.status==='completed').slice(-1)[0]?.stage||''
          const meta=[p.vendor,currSt].filter(Boolean).join(' · ')
          if(meta){fn(8.5,'italic');tc(...GRAY);doc.text(meta,ML,y);y+=4.5}
          if(p.estimatedRevenue||p.closeDate){
            guard(7)
            if(p.estimatedRevenue){fn(7.5,'bold');tc(...GRAY);doc.text('EST. REVENUE:',ML,y);fn(8.5);tc(...BLACK);doc.text(String(p.estimatedRevenue),ML+30,y)}
            if(p.closeDate){fn(7.5,'bold');tc(...GRAY);doc.text('TARGET CLOSE:',ML+CW/2,y);fn(8.5);tc(...BLACK);doc.text(fmtD(p.closeDate),ML+CW/2+30,y)}
            y+=5
          }
          if(p.primaryContact||p.waitingOn){
            guard(7)
            if(p.primaryContact){fn(7.5,'bold');tc(...GRAY);doc.text('CONTACT:',ML,y);fn(8.5);tc(...BLACK);doc.text(String(p.primaryContact).slice(0,45),ML+22,y)}
            if(p.waitingOn){fn(7.5,'bold');tc(...GRAY);doc.text('WAITING ON:',ML+CW/2,y);fn(8.5);tc(...BLACK);doc.text(String(p.waitingOn).slice(0,50),ML+CW/2+26,y)}
            y+=5
          }
          const ns=p.nextAction||p.nextSteps||''
          if(ns){
            guard(8); fn(7.5,'bold'); tc(...GRAY); doc.text('NEXT STEPS:',ML,y); fn(8.5); tc(...BLACK)
            const nsL=doc.splitTextToSize(ns.slice(0,140),CW-28); doc.text(nsL,ML+28,y); y+=nsL.length*4.5
          }
          if(p.notes){
            guard(10); fn(8.5,'italic'); tc(...GRAY)
            const nl=doc.splitTextToSize(trunc(p.notes,250),CW); doc.text(nl,ML,y); y+=nl.length*4
          }
          y+=3
        })
      }

      // ── SECTION 5: Open Actions ────────────────────────────────
      const openFUs=(acct.followUps||[]).filter(f=>f.status==='Open')
      if(openFUs.length>0){
        sect('Open Actions & Follow-Ups')
        const PORD=['Critical','High','Medium','Low']
        const sortedFUs=[...openFUs].sort((a,b)=>PORD.indexOf(a.priority)-PORD.indexOf(b.priority))
        sortedFUs.forEach((f,idx)=>{
          guard(20); if(idx>0)hRule()
          const pc=f.priority==='Critical'?RED:f.priority==='High'?ORANGE:f.priority==='Medium'?BLUE:GRAY
          chipBadge(f.priority||'Low',pc,ML,y)
          fn(9.5,'bold'); tc(...BLACK)
          const tl=doc.splitTextToSize(f.task||'',CW-24); doc.text(tl,ML+22,y); y+=tl.length*5
          const meta=[f.contact?`Contact: ${f.contact}`:null,f.dueDate?`Due: ${fmtD(f.dueDate)}`:null].filter(Boolean).join('   ')
          if(meta){fn(8);tc(...GRAY);doc.text(meta,ML,y);y+=4.5}
          if(f.context){
            guard(8); fn(8.5,'italic'); tc(...GRAY)
            const cl=doc.splitTextToSize(trunc(f.context,200),CW); doc.text(cl,ML,y); y+=cl.length*4
          }
          y+=3
        })
      }

      // ── SECTION 6: Recent Intel Log ────────────────────────────
      const intelSorted=[...(acct.intelLog||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,10)
      if(intelSorted.length>0){
        sect('Recent Intelligence Log')
        intelSorted.forEach((entry,idx)=>{
          guard(24); if(idx>0)hRule()
          fn(9,'bold'); tc(...NAVY); doc.text(fmtD(entry.date)||'—',ML,y)
          if(entry.type)chipBadge(entry.type,BLUE,ML+34,y); y+=5
          if(entry.participants){fn(7.5,'italic');tc(...GRAY);doc.text(`Participants: ${entry.participants.slice(0,110)}`,ML,y);y+=4.5}
          if(entry.summary){
            fn(8.5); tc(...BLACK)
            const sl=doc.splitTextToSize(trunc(entry.summary,350),CW)
            guard(sl.length*4); doc.text(sl,ML,y); y+=sl.length*4+2
          }
          const buls=[
            ...(entry.insights||[]).slice(0,2).map(i=>`• ${i}`),
            ...(entry.risks||[]).slice(0,1).map(r=>`⚠ ${r}`),
            ...(entry.opportunities||[]).slice(0,1).map(o=>`→ ${o}`),
          ]
          if(buls.length){
            fn(7.5); tc(...GRAY)
            buls.forEach(b=>{const bl=doc.splitTextToSize(b.slice(0,200),CW);guard(bl.length*3.8);doc.text(bl,ML+2,y);y+=bl.length*3.8})
          }
          y+=3
        })
      }

      // ── SECTION 7: AI Account Intelligence Summary ─────────────
      if(acct.aiSummary?.content){
        sect('AI Account Intelligence Summary')
        if(acct.aiSummary.generatedAt){fn(8,'italic');tc(...GRAY);doc.text(`Generated: ${fmtD(acct.aiSummary.generatedAt.split('T')[0])}`,ML,y);y+=5}
        const cleaned=acct.aiSummary.content
          .replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*]+)\*/g,'$1')
          .replace(/^#+ /gm,'').replace(/^---\s*$/gm,'').trim()
        wrapText(trunc(cleaned,2500),ML,CW,8.5); y+=3
      }

      // ── SECTION 8: Upcoming Dates ──────────────────────────────
      const upcoming=(acct.upcomingDates||[]).filter(d=>new Date(d.date+'T12:00:00')>=new Date()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,10)
      if(upcoming.length>0){
        sect('Upcoming Dates')
        upcoming.forEach(d=>{
          guard(7); fn(8.5,'bold'); tc(...NAVY); doc.text(fmtD(d.date),ML,y)
          fn(8.5); tc(...BLACK); doc.text((d.title||'').slice(0,80),ML+30,y)
          if(d.type){fn(7.5);tc(...GRAY);doc.text(`[${d.type}]`,PW-MR,y,{align:'right'})}
          y+=5
        })
      }

      // ── SECTION 9: Files ───────────────────────────────────────
      const acctFiles=acct.files||[]
      if(acctFiles.length>0){
        sect('Files')
        guard(8); fn(8.5); tc(...BLACK)
        doc.text(`${acctFiles.length} file${acctFiles.length!==1?'s':''} on file. Open Ledgr to view and download.`,ML,y); y+=6
        acctFiles.slice(0,12).forEach(f=>{
          guard(6); fn(8); tc(...GRAY)
          doc.text(`• ${(f.name||f.fileName||'File').slice(0,72)}`,ML+2,y); y+=4.5
        })
      }

      // ── FOOTER on all pages ────────────────────────────────────
      const pgCount=doc.getNumberOfPages()
      for(let pg=1;pg<=pgCount;pg++){
        doc.setPage(pg)
        fc(...NAVY); doc.rect(0,PH-10,PW,10,'F')
        fn(7); tc(180,200,230)
        doc.text('CONFIDENTIAL — GuidePoint Security Internal Use Only',ML,PH-3.5)
        doc.text(`Page ${pg} of ${pgCount}`,PW-MR,PH-3.5,{align:'right'})
      }

      // ── SAVE ───────────────────────────────────────────────────
      const safeName=(acct.name||'Account').replace(/[^a-zA-Z0-9 \-_]/g,'').trim()
      const ds=new Date().toISOString().split('T')[0]
      doc.save(`Master Account Plan - ${safeName} - ${ds}.pdf`)
    } catch(err) {
      console.error('[MasterAccountPlan] PDF export failed:',err)
      alert('PDF export failed. Please try again.')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div style={{maxWidth:520}}>
      <SH>Account Logo</SH>
      <Card style={{padding:16,marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{width:80,height:80,borderRadius:'50%',overflow:'hidden',flexShrink:0,border:'1px solid #e2e8f0',background:acct.logoImage?'white':logoColor,display:'flex',alignItems:'center',justifyContent:'center'}}>
            {acct.logoImage&&acct.logoImage.length>10
              ?<img src={acct.logoImage} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
              :<span style={{color:'white',fontSize:28,fontWeight:800}}>{logoInitial}</span>
            }
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{saveInProgress.current=true;lastSaveTime.current=Date.now();logoInputRef.current?.click()}} style={{padding:'6px 14px',background:'#007AFF',border:'none',borderRadius:6,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>Upload Logo</button>
              {acct.logoImage&&acct.logoImage.length>10&&<button onClick={handleRemoveLogo} style={{padding:'6px 14px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:6,color:S.muted,fontSize:13,fontWeight:600,cursor:'pointer'}}>Remove Logo</button>}
            </div>
            {logoStatus&&<span style={{fontSize:12,color:logoStatus==='saving'?S.muted:'#16a34a'}}>{logoStatus==='saving'?'Saving…':'Saved!'}</span>}
          </div>
        </div>
        <input ref={logoInputRef} type='file' accept='image/*' style={{display:'none'}} onChange={async e=>{const f=e.target.files[0];if(!f)return;const c=await compressImage(f);await handleLogoSave(c);e.target.value=''}}/>
      </Card>
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
        <p style={{fontSize:13,color:S.muted,marginBottom:0,lineHeight:1.6}}>
          AI is now managed server-side. The Anthropic API key is configured in the Vercel project environment variables (<strong style={{color:S.txt}}>ANTHROPIC_API_KEY</strong>) — it never reaches the browser.
        </p>
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
          <Field label='Number of Endpoints' value={acct.endpoints||''} onChange={v=>setAcct(p=>({...p,endpoints:v}))}/>
        </div>
        <Field label='Account Notes' value={acct.notes} onChange={v=>setAcct(p=>({...p,notes:v}))} multiline/>
      </Card>
      <SH>Account Export</SH>
      <Card style={{padding:16,marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:180}}>
            <div style={{fontSize:13,fontWeight:600,color:S.txt,marginBottom:2}}>Master Account Plan</div>
            <div style={{fontSize:12,color:S.muted,lineHeight:1.5}}>Download a professional PDF covering contacts, tech stack, pipeline, open actions, and recent intel.</div>
          </div>
          <button
            onClick={generateMasterAccountPlan}
            disabled={pdfLoading}
            style={{flexShrink:0,padding:'8px 18px',background:pdfLoading?'#93c5fd':'#007AFF',border:'none',borderRadius:7,color:'#fff',fontSize:13,fontWeight:700,cursor:pdfLoading?'default':'pointer',whiteSpace:'nowrap',transition:'background 0.15s',opacity:pdfLoading?0.75:1}}
          >
            {pdfLoading?'Generating…':'Export Master Account Plan'}
          </button>
        </div>
      </Card>
      <SH>AI Budget &amp; Controls</SH>
      <Card style={{padding:16,marginBottom:20}}>
        {(()=>{
          const ai = {...DEFAULT_AI_SETTINGS,...(data.aiSettings||{})}
          const budget = checkBudget(data)
          const upd = changes => setData(p=>({...p,aiSettings:{...DEFAULT_AI_SETTINGS,...(p.aiSettings||{}),...changes}}))
          return (<>
            {budget.warn&&<div style={{background:budget.blocked?'#FEF2F2':'#FFFBEB',border:`1px solid ${budget.blocked?'#FCA5A5':'#FDE68A'}`,borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:12,color:budget.blocked?'#991B1B':'#92400E'}}>
              AI spend this month: <strong>${budget.spend.toFixed(2)}</strong> of <strong>${budget.budget}</strong> ({budget.pct.toFixed(0)}%)
              {budget.blocked?' — budget limit reached':''}
            </div>}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
              <div style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:S.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Monthly Budget ($)</label>
                <input type='number' min={0} step={5} value={ai.monthlyBudgetDollars} onChange={e=>upd({monthlyBudgetDollars:+e.target.value})}
                  style={{width:'100%',padding:'8px 10px',border:`1px solid ${S.bdr}`,borderRadius:6,fontSize:13,color:S.txt,background:S.bg,boxSizing:'border-box'}}/>
              </div>
              <div style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:S.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Warn at (%)</label>
                <input type='number' min={50} max={99} value={ai.warnAtPercent} onChange={e=>upd({warnAtPercent:+e.target.value})}
                  style={{width:'100%',padding:'8px 10px',border:`1px solid ${S.bdr}`,borderRadius:6,fontSize:13,color:S.txt,background:S.bg,boxSizing:'border-box'}}/>
              </div>
              <div style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:S.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Block at (%)</label>
                <input type='number' min={80} max={100} value={ai.blockAtPercent} onChange={e=>upd({blockAtPercent:+e.target.value})}
                  style={{width:'100%',padding:'8px 10px',border:`1px solid ${S.bdr}`,borderRadius:6,fontSize:13,color:S.txt,background:S.bg,boxSizing:'border-box'}}/>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:4}}>
              {[
                {key:'allowAutoDailyBrief',label:'Auto-generate Daily Brief at 7:45am EST',sub:'When off, open Daily Brief and click Generate manually'},
                {key:'allowAutoMarketSync',label:'Auto-sync Market Intel once per day',sub:'When off, use the Sync button manually'},
              ].map(({key:k,label,sub})=>(
                <div key={k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:500,color:S.txt}}>{label}</div>
                    <div style={{fontSize:11,color:S.muted,marginTop:2}}>{sub}</div>
                  </div>
                  <button onClick={()=>upd({[k]:!ai[k]})} style={{flexShrink:0,width:40,height:22,borderRadius:11,border:'none',cursor:'pointer',background:ai[k]?'#2563eb':'#D1D5DB',transition:'background 0.15s',position:'relative'}}>
                    <span style={{position:'absolute',top:2,left:ai[k]?20:2,width:18,height:18,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 3px rgba(0,0,0,0.2)',transition:'left 0.15s'}}/>
                  </button>
                </div>
              ))}
            </div>
            <div style={{marginTop:14,fontSize:11,color:S.muted,lineHeight:1.5}}>
              Costs are estimated (max_tokens ceiling). Actual spend is typically 20–40% lower.<br/>
              Cheap model (extraction): Haiku 4.5 · Strong model (briefs/drafts): Sonnet 4.6
            </div>
          </>)
        })()}
      </Card>
      <SH>Data Health</SH>
      <Card style={{padding:16,marginBottom:20}}>
        {(()=>{
          const accounts = data.accounts || []
          const contactCount = accounts.reduce((s,a) => s + (a.contacts||[]).length, 0)
          const intelCount   = accounts.reduce((s,a) => s + (a.intelLog||[]).length, 0)
          const actionCount  = accounts.reduce((s,a) => s + (a.followUps||[]).length, 0)
          const healthCount  = accounts.reduce((s,a) => s + (a.healthScoreHistory||[]).length, 0)
          const cacheCount   = Object.keys(data.aiCache || {}).length

          // Estimate blob size: serialize everything that would go to Supabase
          const { apiKey: _k, aiUsageLog: _ul, ...forSize } = data
          const blobBytes = new Blob([JSON.stringify(forSize)]).size
          const blobKB = (blobBytes / 1024).toFixed(1)
          const blobMB = (blobBytes / 1048576).toFixed(2)
          const blobDisplay = blobBytes >= 1048576 ? `${blobMB} MB` : `${blobKB} KB`
          const blobWarn = blobBytes > 800 * 1024

          const loadT = getLoadTiming()
          const saveT = getSaveTiming()
          const fmtMs = ms => ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms/1000).toFixed(1)} s`
          const fmtAt = iso => iso ? new Date(iso).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '—'

          const row = (label, value, accent, sub) => (
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:`1px solid ${S.bdr}`}}>
              <div>
                <span style={{fontSize:12,color:S.muted}}>{label}</span>
                {sub && <span style={{fontSize:11,color:S.muted,marginLeft:6}}>{sub}</span>}
              </div>
              <span style={{fontSize:13,fontWeight:700,color:accent||S.txt}}>{value}</span>
            </div>
          )

          return (
            <div>
              {row('Blob size (est.)', blobDisplay, blobWarn ? '#dc2626' : blobBytes > 400*1024 ? '#d97706' : '#15803d')}
              {row('Accounts', accounts.length)}
              {row('Contacts', contactCount)}
              {row('Intel log entries', intelCount)}
              {row('Open actions', actionCount)}
              {row('AI cache entries', `${cacheCount}`, cacheCount > 180 ? '#d97706' : undefined, '(max 200)')}
              {row('Health score history', `${healthCount}`, undefined, '(90-day rolling)')}
              {row('Last load', fmtMs(loadT.durationMs), undefined, loadT.at ? `at ${fmtAt(loadT.at)}` : '')}
              {row('Last save', fmtMs(saveT.durationMs), undefined, saveT.at ? `at ${fmtAt(saveT.at)}` : '')}
              <div style={{marginTop:10,fontSize:11,color:S.muted,lineHeight:1.5}}>
                Blob size is the estimated Supabase payload. Green &lt;400 KB · Yellow 400–800 KB · Red &gt;800 KB.{blobWarn && <strong style={{color:'#dc2626'}}> Consider archiving old intel or actions to reduce size.</strong>}
              </div>
            </div>
          )
        })()}
      </Card>
      <SH>AI Diagnostics</SH>
      <Card style={{padding:16,marginBottom:20}}>
        {(()=>{
          const todayStr = new Date().toISOString().split('T')[0]
          const allRecords = getRecords()
          const todayRecords = allRecords.filter(r => (r.ts||r.timestamp||'').startsWith(todayStr) && r.source !== 'sample')
          const allStats = getStats(allRecords.filter(r => r.source !== 'sample'))
          const todayInputTokens = todayRecords.reduce((s,r) => s + (r.estimatedInputTokens ?? r.inputTokensEst ?? 0), 0)
          const todayOutputTokens = todayRecords.reduce((s,r) => s + (r.estimatedOutputTokens ?? r.maxTokensOut ?? 0), 0)
          const todayCost = todayRecords.reduce((s,r) => s + (r.estimatedCost ?? r.costEst ?? 0), 0)
          const todayCacheHits = todayRecords.filter(r => r.cacheHit || r.status === 'cache_hit').length
          const retries = get529Retries()
          const retryCount = retries.length
          const last529 = retries[0]?.ts ? new Date(retries[0].ts) : null
          const fmt529 = last529 ? last529.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' at ' + last529.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : 'None recorded'

          const row = (label, value, accent) => (
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:`1px solid ${S.bdr}`}}>
              <span style={{fontSize:12,color:S.muted}}>{label}</span>
              <span style={{fontSize:13,fontWeight:700,color:accent||S.txt}}>{value}</span>
            </div>
          )

          return (
            <div>
              {row('Requests today', `${todayRecords.length} calls`)}
              {row('Tokens today (est.)', `${(todayInputTokens + todayOutputTokens).toLocaleString()} tokens`)}
              {row('Est. cost today', `$${todayCost.toFixed(4)}`)}
              {row('Cache hits today', todayCacheHits > 0 ? `${todayCacheHits} saved` : '0')}
              {row('Cache hit rate (all time)', `${allStats.cacheHitRate ?? 0}%`, allStats.cacheHitRate >= 20 ? '#15803d' : undefined)}
              {row('529 retries (all time)', retryCount > 0 ? `${retryCount}` : '0', retryCount > 5 ? '#dc2626' : undefined)}
              {row('Last 529 overload', fmt529, retryCount > 0 ? '#92400e' : undefined)}
              <div style={{marginTop:10,fontSize:11,color:S.muted,lineHeight:1.5}}>
                Tokens are estimated from max_tokens ceiling. Cache hits save cost and speed. 529 retries indicate Anthropic server overload.
              </div>
            </div>
          )
        })()}
      </Card>
      <SH>Data Management</SH>
      <div style={{display:'flex',gap:8}}>
        <Btn onClick={exportData}>Export JSON Backup</Btn>
        <Btn variant='danger' onClick={()=>{if(window.confirm('Reset everything to sample BHSI data?'))onReset()}}>Reset to Sample Data</Btn>
      </div>
    </div>
  )
}
