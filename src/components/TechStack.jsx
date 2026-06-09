import { useState, useRef } from 'react'
import { List, User } from 'lucide-react'
import { S } from '../theme.js'
import { uid, fmtDate, daysUntil } from '../utils.js'
import { TECH_STATS } from '../constants.js'
import { Btn, Field, Modal } from './UI.jsx'
import { SECURITY_FRAMEWORK, resolveVendorMapping } from '../securityFramework.js'

const WHEEL_DOMAINS = SECURITY_FRAMEWORK.domains.map(d => ({name: d.name, color: d.color, subs: d.subs}))
const TECH_CATS = WHEEL_DOMAINS.flatMap(d => d.subs).sort()

const makeArc = (cx,cy,r1,r2,a1,a2,gap=0.01) => {
  const s=a1+gap, e=a2-gap
  if(e<=s) return ''
  const lg=(e-s)>Math.PI?1:0, co=Math.cos, si=Math.sin
  return `M ${cx+r2*co(s)} ${cy+r2*si(s)} A ${r2} ${r2} 0 ${lg} 1 ${cx+r2*co(e)} ${cy+r2*si(e)} L ${cx+r1*co(e)} ${cy+r1*si(e)} A ${r1} ${r1} 0 ${lg} 0 ${cx+r1*co(s)} ${cy+r1*si(s)} Z`
}
const findVendorForSub = (sub, techStack) =>
  techStack.find(t => resolveVendorMapping(t.vendor, t.category).primarySub === sub) || null
const getSecondaryVendors = (sub, techStack) =>
  techStack.filter(t => resolveVendorMapping(t.vendor, t.category).secondarySubs.includes(sub))
const getKnownVendorsForSub = sub =>
  Object.entries(SECURITY_FRAMEWORK.vendorMap).filter(([,v])=>v.primarySub===sub).map(([k])=>k)
const capStatusFill = v => !v?S.bdr2:({Current:'#22c55e',Selected:'#22c55e',Evaluating:'#3b82f6',Watch:'#a855f7',Replacing:'#f97316',Dropping:'#ef4444','Current Gap':'#64748b'}[v.status]||S.bdr2)

export default function TechStack({acct,setAcct}) {
  const isTouchDevice = typeof window!=='undefined'&&('ontouchstart' in window||navigator.maxTouchPoints>0)
  const [view,setView] = useState('list')
  const [collapsedDomains, setCollapsedDomains] = useState({})
  const [showAdd,setShowAdd] = useState(false)
  const [form,setForm] = useState({})
  const [hoveredSeg,setHoveredSeg] = useState(null)
  const [legendModal,setLegendModal] = useState(null)
  const [saleFilter,setSaleFilter] = useState('All')
  const [logoUrl,setLogoUrl] = useState(acct.heatmapLogoUrl||null)
  const logoInputRef = useRef(null)
  const handleLogoUpload = e => {
    const file=e.target.files[0]
    if(!file)return
    const reader=new FileReader()
    reader.onload=ev=>{
      const url=ev.target.result
      setLogoUrl(url)
      setAcct(p=>({...p,heatmapLogoUrl:url}))
    }
    reader.readAsDataURL(file)
  }
  const removeLogo = () => {
    setLogoUrl(null)
    setAcct(p=>({...p,heatmapLogoUrl:null}))
    if(logoInputRef.current)logoInputRef.current.value=''
  }
  const mob = typeof window!=='undefined'&&window.innerWidth<768
  const f=k=>v=>setForm(p=>({...p,[k]:v}))
  const blank={id:'',vendor:'',products:'',category:'SIEM',status:'Current',renewalDate:'',cost:'',totalRevenue:'',grossProfit:'',vendorRep:'',vendorRepEmail:'',clientOwner:'',replacementOptions:'',notes:'',contractSale:'',contractSaleDetails:'',aiNotes:'',aiNotesUpdatedAt:'',aiNotesHistory:[]}
  const save=()=>{
    const isGap=form.status==='Current Gap'
    if(!form.vendor&&!isGap)return
    const entry={...form,vendor:form.vendor||(isGap?'No Solution':''),primarySub:form.category}
    if(!entry.vendor)return
    if(entry.id)setAcct(p=>({...p,techStack:p.techStack.map(t=>t.id===entry.id?entry:t)}))
    else setAcct(p=>({...p,techStack:[...p.techStack,{...entry,id:uid()}]}))
    setShowAdd(false);setForm(blank)
  }
  const del=id=>{if(window.confirm('Delete?'))setAcct(p=>({...p,techStack:p.techStack.filter(t=>t.id!==id)}))}
  const openVendorEdit=item=>{
    const mapping=resolveVendorMapping(item.vendor||'',item.category||'')
    const initialCategory=item.primarySub||mapping.primarySub||item.category||''
    setForm({...blank,...item,category:initialCategory,primarySub:initialCategory})
    setShowAdd(true)
  }
  const filteredStack=saleFilter==='All'?acct.techStack:acct.techStack.filter(t=>saleFilter==='Not Set'?!t.contractSale:t.contractSale===saleFilter)
  const grouped=TECH_CATS.reduce((acc,cat)=>{const items=filteredStack.filter(t=>t.category===cat);if(items.length)acc[cat]=items;return acc},{})
  const upcoming=acct.techStack.filter(t=>{const d=daysUntil(t.renewalDate);return d!==null&&d>0&&d<=150}).length

  // Heatmap geometry — 680px wheel diameter, viewBox 820×820
  const HM_CX=410,HM_CY=410,HM_OR2=330,HM_OR1=278,HM_IR2=268,HM_IR1=171,HM_START=-Math.PI/2
  const totalSubs=WHEEL_DOMAINS.reduce((sum,d)=>sum+d.subs.length,0)
  const allSubs=WHEEL_DOMAINS.flatMap(d=>d.subs)
  const coveredSubs=allSubs.filter(sub=>findVendorForSub(sub,acct.techStack))
  const coveragePct=Math.round(coveredSubs.length/allSubs.length*100)

  const makeTextArcPath=(cx,cy,r,a1,a2)=>{
    const mid=(a1+a2)/2, lg=(a2-a1)>Math.PI?1:0
    if(Math.sin(mid)>0.1) return `M ${cx+r*Math.cos(a2)} ${cy+r*Math.sin(a2)} A ${r} ${r} 0 ${lg} 0 ${cx+r*Math.cos(a1)} ${cy+r*Math.sin(a1)}`
    return `M ${cx+r*Math.cos(a1)} ${cy+r*Math.sin(a1)} A ${r} ${r} 0 ${lg} 1 ${cx+r*Math.cos(a2)} ${cy+r*Math.sin(a2)}`
  }

  const hmSegments=[]
  let angle=HM_START
  WHEEL_DOMAINS.forEach((domain,di)=>{
    const domainAngle=(domain.subs.length/totalSubs)*2*Math.PI
    const dS=angle,dE=angle+domainAngle,mid=(dS+dE)/2
    hmSegments.push({type:'domain',di,domain,mid,dS,dE,
      path:makeArc(HM_CX,HM_CY,HM_OR1,HM_OR2,dS,dE,0.018),
      textArcPath:makeTextArcPath(HM_CX,HM_CY,302,dS,dE)})
    const subAngle=domainAngle/domain.subs.length
    domain.subs.forEach((sub,ci)=>{
      const cS=dS+ci*subAngle,cE=cS+subAngle
      const vendor=findVendorForSub(sub,acct.techStack)
      const secondary=!vendor?getSecondaryVendors(sub,acct.techStack):[]
      const midA=(cS+cE)/2,midR=(HM_IR1+HM_IR2)/2
      const centX=HM_CX+midR*Math.cos(midA),centY=HM_CY+midR*Math.sin(midA)
      hmSegments.push({type:'cap',di,ci,domain,cap:sub,sub,vendor,secondary,centX,centY,
        fill:capStatusFill(vendor),path:makeArc(HM_CX,HM_CY,HM_IR1,HM_IR2,cS,cE,0.01)})
    })
    angle=dE
  })

  const handleCapHover=(seg,e)=>{if(seg.type!=='cap'){setHoveredSeg(null);return};setHoveredSeg({...seg,x:e.clientX,y:e.clientY})}
  const handleCapMove=(seg,e)=>{if(seg.type!=='cap')return;setHoveredSeg(p=>p?{...p,x:e.clientX,y:e.clientY}:null)}
  const handleCapClick=(seg)=>{
    if(seg.type!=='cap')return
    if(seg.vendor){
      openVendorEdit({...blank,...seg.vendor})
    } else {
      setForm({...blank,category:seg.sub,primarySub:seg.sub,products:seg.sub})
      setShowAdd(true)
    }
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:7,padding:2}}>
            {['list','heatmap'].map(v=><button key={v} onClick={()=>setView(v)} style={{padding:'5px 14px',borderRadius:5,border:'none',background:view===v?S.blue:'transparent',color:view===v?'#fff':S.muted,fontSize:12,fontWeight:600,cursor:'pointer'}}>{v==='list'?'List':'Heatmap'}</button>)}
          </div>
          <div style={{fontSize:12,color:S.muted,display:'flex',gap:16}}>
            <span>{acct.techStack.length} vendors</span>
            {upcoming>0&&<span style={{color:S.orange}}>{upcoming} renewal{upcoming>1?'s':''} within 5 months</span>}
          </div>
          {view==='list'&&<select value={saleFilter} onChange={e=>setSaleFilter(e.target.value)} style={{fontSize:11,padding:'5px 9px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,cursor:'pointer'}}>
            {['All','GuidePoint','Direct','Other VAR','Not Set'].map(o=><option key={o} value={o}>{o==='All'?'All Sales':o}</option>)}
          </select>}
        </div>
        <Btn variant='primary' onClick={()=>{setForm(blank);setShowAdd(true)}}>+ Add Vendor</Btn>
      </div>

      {view==='list'&&<>
        {(()=>{
          const subVendorMap = {}
          ;(acct.techStack||[]).forEach(item=>{
            const mapping=resolveVendorMapping(item.vendor,item.category)
            const sub=mapping.primarySub||item.primarySub||item.category
            if(!subVendorMap[sub])subVendorMap[sub]=[]
            subVendorMap[sub].push(item)
          })
          return SECURITY_FRAMEWORK.domains.map(domain=>{
            const isCollapsed=collapsedDomains[domain.name]
            const coveredCount=domain.subs.filter(sub=>subVendorMap[sub]&&subVendorMap[sub].length>0).length
            return (
              <div key={domain.name} style={{marginBottom:6}}>
                <div onClick={()=>setCollapsedDomains(p=>({...p,[domain.name]:!p[domain.name]}))} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:S.surf,cursor:'pointer',borderLeft:`3px solid ${domain.color}`,borderRadius:isCollapsed?8:'8px 8px 0 0',border:`1px solid ${S.bdr}`,borderLeft:`3px solid ${domain.color}`}}>
                  <span style={{fontSize:13,fontWeight:700,color:domain.color}}>{domain.name}</span>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:12,color:S.muted}}>{coveredCount}/{domain.subs.length}</span>
                    <span style={{color:S.muted,fontSize:16,display:'inline-block',transform:isCollapsed?'rotate(0deg)':'rotate(90deg)',transition:'transform 0.15s',lineHeight:1}}>›</span>
                  </div>
                </div>
                {!isCollapsed&&(
                  <div style={{border:`1px solid ${S.bdr}`,borderTop:'none',borderRadius:'0 0 8px 8px',overflow:'hidden'}}>
                    {domain.subs.map((sub,si)=>{
                      const items=subVendorMap[sub]||[]
                      const primaryItem=items[0]||null
                      const extraCount=items.length-1
                      const covered=items.length>0
                      return (
                        <div key={sub} style={{display:'flex',alignItems:'center',padding:'8px 12px 8px 20px',borderBottom:si<domain.subs.length-1?`1px solid ${S.bdr}`:'none',background:S.surf,transition:'background 0.1s'}}
                          onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                          onMouseLeave={e=>e.currentTarget.style.background=S.surf}>
                          <div style={{width:7,height:7,borderRadius:'50%',background:covered?'#0ebc5f':'#94a3b8',flexShrink:0,marginRight:10}}/>
                          <span style={{flex:1,fontSize:13,color:S.txt}}>{sub}</span>
                          {covered?(
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <span onClick={()=>openVendorEdit({...blank,...primaryItem})} style={{fontSize:13,fontWeight:600,color:S.txt,cursor:'pointer'}}
                                onMouseEnter={e=>e.target.style.color=S.blue}
                                onMouseLeave={e=>e.target.style.color=S.txt}>{primaryItem.vendor}</span>
                              {extraCount>0&&<span style={{fontSize:11,color:S.muted}}>+{extraCount} more</span>}
                            </div>
                          ):(
                            <span onClick={()=>{setForm({...blank,category:sub,primarySub:sub});setShowAdd(true)}} style={{fontSize:13,color:'#2563eb',cursor:'pointer',fontWeight:500}}>+ Add</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        })()}
      </>}

      {!isTouchDevice&&view==='heatmap'&&<div>
        <style>{`
          @keyframes hmFadeIn{from{opacity:0}to{opacity:1}}
          @keyframes hmSpin{to{transform:rotate(360deg)}}
          .hm-spin-cw{transform-box:fill-box;transform-origin:center;animation:hmSpin 8s linear infinite}
          .hm-spin-ccw{transform-box:fill-box;transform-origin:center;animation:hmSpin 14s linear infinite reverse}
        `}</style>
        <div style={{display:'flex',justifyContent:'center'}}>
        <svg viewBox="0 0 820 820" style={{width:'100%',maxWidth:680,display:'block',margin:'0 auto',filter:'drop-shadow(0 8px 40px rgba(0,0,0,0.8))',touchAction:'none'}}>
          <defs>
            {/* Cap status radial gradients */}
            <radialGradient id="hm-gc" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#4ade80"/><stop offset="55%" stopColor="#22c55e"/><stop offset="100%" stopColor="#16a34a"/></radialGradient>
            <radialGradient id="hm-ge" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#fde047"/><stop offset="55%" stopColor="#eab308"/><stop offset="100%" stopColor="#ca8a04"/></radialGradient>
            <radialGradient id="hm-gw" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#fb923c"/><stop offset="55%" stopColor="#f97316"/><stop offset="100%" stopColor="#ea580c"/></radialGradient>
            <radialGradient id="hm-gr" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#f87171"/><stop offset="55%" stopColor="#ef4444"/><stop offset="100%" stopColor="#dc2626"/></radialGradient>
            <radialGradient id="hm-gn" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#555555"/><stop offset="55%" stopColor="#4a4a4a"/><stop offset="100%" stopColor="#3d3d3d"/></radialGradient>
            {/* Domain ring linear gradients — ordered to match WHEEL_DOMAINS */}
            <linearGradient id="hm-dg0" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#ff9cc5"/><stop offset="100%" stopColor="#d42070"/></linearGradient>
            <linearGradient id="hm-dg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#ff7a77"/><stop offset="100%" stopColor="#c9100d"/></linearGradient>
            <linearGradient id="hm-dg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#96e8a4"/><stop offset="100%" stopColor="#30a048"/></linearGradient>
            <linearGradient id="hm-dg3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#6eaaff"/><stop offset="100%" stopColor="#1255cc"/></linearGradient>
            <linearGradient id="hm-dg4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#4dd4e2"/><stop offset="100%" stopColor="#007a88"/></linearGradient>
            <linearGradient id="hm-dg5" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#ffe566"/><stop offset="100%" stopColor="#c49800"/></linearGradient>
            <linearGradient id="hm-dg6" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#c89be8"/><stop offset="100%" stopColor="#7d3bad"/></linearGradient>
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
          {hmSegments.filter(s=>s.type==='domain').map((seg,i)=>(
            <line key={i} x1={HM_CX} y1={HM_CY} x2={HM_CX+(HM_OR2+8)*Math.cos(seg.dS)} y2={HM_CY+(HM_OR2+8)*Math.sin(seg.dS)} stroke="rgba(255,255,255,0.035)" strokeWidth={0.75}/>
          ))}

          {/* Rounded group: domain ring + vendor-filled caps (goo filter works on fully-opaque fills) */}
          <g filter="url(#hm-round)">
            {hmSegments.filter(s=>s.type==='domain').map((seg,i)=>(
              <path key={`d${i}`} d={seg.path} fill={`url(#hm-dg${i})`} stroke="none"/>
            ))}
            {hmSegments.filter(s=>s.type==='cap'&&!!s.vendor).map((seg)=>{
              const isHov=hoveredSeg?.di===seg.di&&hoveredSeg?.ci===seg.ci
              const gid={Current:'hm-gc',Selected:'hm-gc',Evaluating:'hm-ge',Watch:'hm-gw',Replacing:'hm-gr',Dropping:'hm-gr','Current Gap':'hm-gn'}[seg.vendor.status]||'hm-gc'
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

          {/* Empty/no-vendor caps — neutral for truly empty, domain tint for secondary coverage */}
          {hmSegments.filter(s=>s.type==='cap'&&!s.vendor).map((seg)=>{
            const isHov=hoveredSeg?.di===seg.di&&hoveredSeg?.ci===seg.ci
            const idx=seg.di*10+seg.ci
            const hasSecondary = seg.secondary && seg.secondary.length > 0
            const fillColor = hasSecondary
              ? (isHov ? seg.domain.color+'99' : seg.domain.color+'45')
              : (isHov ? 'rgba(255,255,255,0.12)' : (S.isLight ? '#f1f5f9' : '#1e293b'))
            return (
              <path key={`ce-${seg.di}-${seg.ci}`} d={seg.path}
                fill={fillColor} stroke="none"
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
            const abbrev=['IDENTITY & ACCESS','CLOUD & APP SEC','NETWORK & INFRA','SEC OPERATIONS','DATA & ENDPOINT','RISK & COMPLY','OT / IoT']
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
          {(()=>{
            const logoR=Math.round((HM_IR1-10)*0.60)
            if(logoUrl){
              return <>
                <defs>
                  <clipPath id="hm-logo-clip"><circle cx={HM_CX} cy={HM_CY} r={logoR}/></clipPath>
                </defs>
                <circle cx={HM_CX} cy={HM_CY} r={logoR} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)" strokeWidth={1}/>
                <image x={HM_CX-logoR} y={HM_CY-logoR} width={logoR*2} height={logoR*2}
                  href={logoUrl} clipPath="url(#hm-logo-clip)" preserveAspectRatio="xMidYMid meet"/>
              </>
            }
            return <>
              {/* Shield icon — shifted down so group is vertically centered */}
              <path d={`M ${HM_CX} ${HM_CY-46} L ${HM_CX-13} ${HM_CY-40} L ${HM_CX-13} ${HM_CY-26} Q ${HM_CX} ${HM_CY-18} ${HM_CX} ${HM_CY-18} Q ${HM_CX+13} ${HM_CY-26} ${HM_CX+13} ${HM_CY-26} L ${HM_CX+13} ${HM_CY-40} Z`}
                fill="url(#hm-gc)" opacity={0.85}/>
              {/* Coverage % — centered */}
              <text x={HM_CX} y={HM_CY+22} textAnchor="middle" dominantBaseline="auto" fontSize={54} fontWeight={800} fill="#ffffff" letterSpacing="-2">{coveragePct}%</text>
              <text x={HM_CX} y={HM_CY+44} textAnchor="middle" dominantBaseline="auto" fontSize={11} fontWeight={600} fill="#94a3b8" letterSpacing="0.14em">COVERAGE</text>
            </>
          })()}
        </svg>
        </div>

        {/* Logo upload controls */}
        <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:8,marginBottom:8}}>
          <input ref={logoInputRef} type='file' accept='image/*' onChange={handleLogoUpload} style={{display:'none'}} id='hm-logo-input'/>
          <label htmlFor='hm-logo-input' style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 14px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:999,fontSize:12,fontWeight:600,color:S.secondary,cursor:'pointer'}}>
            {logoUrl?'Replace Logo':'Upload Company Logo'}
          </label>
          {logoUrl&&<button onClick={removeLogo} style={{padding:'5px 12px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:999,fontSize:12,color:S.muted,cursor:'pointer'}}>Remove</button>}
        </div>

        {/* Legend — clickable gradient pills with capability counts */}
        {(()=>{
          const cs=hmSegments.filter(s=>s.type==='cap')
          const ld=[
            {label:'Maintain',g:'linear-gradient(135deg,#4ade80,#16a34a)',color:'#22c55e',filter:s=>s.vendor&&['Current','Selected'].includes(s.vendor.status)},
            {label:'Review',g:'linear-gradient(135deg,#fb923c,#ea580c)',color:'#f97316',filter:s=>s.vendor&&s.vendor.status==='Watch'},
            {label:'Evaluating',g:'linear-gradient(135deg,#fde047,#ca8a04)',color:'#eab308',filter:s=>s.vendor&&s.vendor.status==='Evaluating'},
            {label:'Current Gap',g:'linear-gradient(135deg,#94a3b8,#475569)',color:'#64748b',filter:s=>s.vendor&&s.vendor.status==='Current Gap'},
            {label:'Unlabeled',g:'linear-gradient(135deg,#555555,#3d3d3d)',color:'#94a3b8',filter:s=>!s.vendor},
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

      {/* Mobile heatmap — sub-domain list by domain */}
      {isTouchDevice&&view==='heatmap'&&(
        <div>
          <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:8,marginBottom:14,padding:'8px 12px',background:S.surf,borderRadius:8,border:`1px solid ${S.bdr}`}}>
            <span style={{fontSize:13,fontWeight:700,color:S.txt}}>{coveragePct}% Coverage</span>
            <span style={{fontSize:11,color:S.muted}}>·</span>
            <span style={{fontSize:11,color:S.muted}}>{coveredSubs.length}/{allSubs.length} capabilities</span>
          </div>
          {WHEEL_DOMAINS.map(domain=>{
            const domSubs=domain.subs.map(sub=>({sub,vendor:findVendorForSub(sub,acct.techStack)}))
            const covered=domSubs.filter(c=>c.vendor).length
            return (
              <div key={domain.name} style={{marginBottom:12,background:S.surf,borderRadius:10,border:`1px solid ${S.bdr}`,overflow:'hidden'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:`1px solid ${S.bdr}`,background:domain.color+'18'}}>
                  <span style={{fontSize:12,fontWeight:700,color:domain.color}}>{domain.name}</span>
                  <span style={{fontSize:11,color:S.muted,fontWeight:600}}>{covered}/{domSubs.length}</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:0}}>
                  {domSubs.map(({sub,vendor},ci)=>{
                    const fill=capStatusFill(vendor)
                    return (
                      <div key={sub} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 14px',borderBottom:ci<domSubs.length-1?`1px solid ${S.bdr2}`:'none',gap:8}}
                        onClick={()=>{if(vendor){openVendorEdit({...blank,...vendor})}else{setForm({...blank,category:sub,primarySub:sub,products:sub});setShowAdd(true)}}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}>
                          <div style={{width:8,height:8,borderRadius:'50%',background:fill,flexShrink:0}}/>
                          <span style={{fontSize:12,color:S.txt,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sub}</span>
                        </div>
                        {vendor
                          ?<span style={{fontSize:11,color:S.secondary,fontWeight:600,flexShrink:0}}>{vendor.vendor}</span>
                          :<span style={{fontSize:11,color:S.blue,flexShrink:0}}>+ Add</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Rich tooltip */}
      {!isTouchDevice&&hoveredSeg&&view==='heatmap'&&(()=>{
        const sc=hoveredSeg.vendor?capStatusFill(hoveredSeg.vendor):S.bdr2
        const tx=Math.min(hoveredSeg.x+16,window.innerWidth-270)
        const ty=Math.max(10,hoveredSeg.y-70)
        const knownVendors=getKnownVendorsForSub(hoveredSeg.sub||hoveredSeg.cap)
        return (
          <div style={{position:'fixed',left:tx,top:ty,background:S.surf,border:`1px solid ${S.bdr}`,borderLeft:`4px solid ${sc}`,borderRadius:10,padding:'12px 16px',pointerEvents:'none',zIndex:9999,maxWidth:260,boxShadow:'0 8px 32px rgba(0,0,0,0.65)'}}>
            <div style={{fontSize:11,color:S.muted,marginBottom:4,letterSpacing:'0.04em',textTransform:'uppercase'}}>{hoveredSeg.domain.name}</div>
            <div style={{fontSize:13,fontWeight:700,color:S.txt,marginBottom:6,lineHeight:1.3}}>{hoveredSeg.cap}</div>
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
                <div style={{fontSize:11,color:S.muted,marginBottom:4}}>No coverage — gap</div>
                {knownVendors.length>0&&<div style={{fontSize:10,color:S.dim,marginBottom:8}}>Known vendors: {knownVendors.slice(0,3).join(', ')}</div>}
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
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Category</div>
            <select value={form.category||form.primarySub||''} onChange={e=>setForm(p=>({...p,category:e.target.value,primarySub:e.target.value}))}>
              <option value=''>Select category...</option>
              {SECURITY_FRAMEWORK.domains.map(d=>(
                <optgroup key={d.name} label={d.name}>
                  {d.subs.map(sub=>(
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <Field label='Status' value={form.status} onChange={f('status')} options={TECH_STATS}/>
          <Field label='Contract Renewal Date' value={form.renewalDate} onChange={f('renewalDate')} type='date' style={{gridColumn:'span 2'}}/>
          <div style={{gridColumn:'span 2',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0 12px'}}>
            <Field label='Annual Cost (Client Pays)' value={form.cost} onChange={f('cost')} placeholder='e.g. $50,000'/>
            <Field label='Total Revenue (GP Books)' value={form.totalRevenue||''} onChange={f('totalRevenue')} placeholder='e.g. $50,000'/>
            <Field label='Gross Profit' value={form.grossProfit||''} onChange={f('grossProfit')} placeholder='e.g. $15,000'/>
          </div>
          <Field label='Vendor Rep Name' value={form.vendorRep} onChange={f('vendorRep')}/>
          <Field label='Vendor Rep Email' value={form.vendorRepEmail} onChange={f('vendorRepEmail')} type='email'/>
          <Field label='Client Owner / User' value={form.clientOwner} onChange={f('clientOwner')} style={{gridColumn:'span 2'}}/>
          <Field label='Contract Sale' value={form.contractSale||''} onChange={f('contractSale')} options={['','GuidePoint','Direct','Other VAR']} placeholder='Not set'/>
          <Field label='Contract Sale Details' value={form.contractSaleDetails||''} onChange={f('contractSaleDetails')}/>
        </div>
        <Field label='Replacement Options' value={form.replacementOptions} onChange={f('replacementOptions')} multiline placeholder='List alternative vendors being considered'/>
        <div style={{background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'12px',marginBottom:8}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:14}}>✨</span><span style={{fontSize:12,fontWeight:700,color:'#2563eb'}}>AI Intelligence</span><span style={{fontSize:11,color:'#64748b',fontStyle:'italic'}}>(read-only — auto-updated from intel)</span></div>
            {form.aiNotesUpdatedAt&&<span style={{fontSize:10,color:'#94a3b8'}}>Updated {fmtDate(form.aiNotesUpdatedAt)}</span>}
          </div>
          {(form.aiNotes||'')?(()=>{const parts=(form.aiNotes||'').split('\n\n');const prose=parts[0]||'';const bullets=parts.slice(1).join('\n').split('\n').filter(l=>l.startsWith('•'));return(<><div style={{fontSize:12,lineHeight:1.6,color:'#1e3a5f',marginBottom:3}}>{prose}</div>{bullets.length>0&&<ul style={{margin:'3px 0 0',paddingLeft:16,fontSize:11,color:'#374151'}}>{bullets.map((b,bi)=><li key={bi}>{b.replace(/^•\s*/,'')}</li>)}</ul>}</>)})():<div style={{fontSize:12,color:'#94a3b8',fontStyle:'italic'}}>No AI notes yet — upload intel mentioning this vendor to auto-populate</div>}
          {((form.aiNotesHistory)||[]).length>0&&<details style={{marginTop:8}}><summary style={{fontSize:11,color:'#2563eb',cursor:'pointer',userSelect:'none'}}>View History ({(form.aiNotesHistory||[]).length})</summary>{(form.aiNotesHistory||[]).map((h,hi)=><div key={hi} style={{marginTop:6,borderTop:'1px solid #bfdbfe',paddingTop:6,fontSize:11,color:'#475569'}}><span style={{fontWeight:600}}>{fmtDate(h.date)||'—'}</span>: {h.summary?.slice(0,120)}{(h.summary||'').length>120?'…':''}</div>)}</details>}
        </div>
        <Field label='Notes' value={form.notes} onChange={f('notes')} multiline/>
        <div style={{display:'flex',gap:8,marginTop:4}}><Btn variant='primary' onClick={save}>Save</Btn><Btn onClick={()=>{setShowAdd(false);setForm(blank)}}>Cancel</Btn></div>
      </Modal>}
    </div>
  )
}
