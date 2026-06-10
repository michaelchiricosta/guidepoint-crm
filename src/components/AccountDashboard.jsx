import { useState, useRef, useEffect } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { S, IC } from '../theme.js'
import { fmtDate } from '../utils.js'
import { INTERACTION_COLORS, INTERACTION_TYPES } from '../constants.js'
import { Badge } from './UI.jsx'

export default function AccountDashboard({acct, setTab}) {
  const [groupBy,setGroupBy] = useState('monthly')
  const [selectedContacts,setSelectedContacts] = useState([])
  const [hiddenContacts,setHiddenContacts] = useState([])
  const [filterOpen,setFilterOpen] = useState(false)
  const [expandedId,setExpandedId] = useState(null)
  const [calendarOpen,setCalendarOpen] = useState(false)
  const [contactFreqOpen,setContactFreqOpen] = useState(false)
  const [activityBreakOpen,setActivityBreakOpen] = useState(false)
  const [hoveredStat,setHoveredStat] = useState(null)
  const [calHovered,setCalHovered] = useState(null)
  const [breakMonth,setBreakMonth] = useState(()=>{const n=new Date();return{y:n.getFullYear(),m:n.getMonth()}})
  const filterRef = useRef(null)

  useEffect(()=>{
    if(!filterOpen)return
    const h=e=>{if(filterRef.current&&!filterRef.current.contains(e.target))setFilterOpen(false)}
    document.addEventListener('mousedown',h)
    return()=>document.removeEventListener('mousedown',h)
  },[filterOpen])

  const allContacts = Array.from(new Set(acct.interactions.map(i=>i.contact).filter(Boolean))).sort()
  const filtered = selectedContacts.length===0 ? acct.interactions : acct.interactions.filter(i=>selectedContacts.includes(i.contact))

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const last30Start = new Date(now); last30Start.setDate(now.getDate()-30); last30Start.setHours(0,0,0,0)
  const last30Count = acct.interactions.filter(i=>{if(!i.date)return false;const d=new Date(i.date+'T12:00:00');return d>=last30Start&&d<=now}).length
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
    for (let i=7;i>=0;i--) { const m=new Date(currentMonday); m.setDate(currentMonday.getDate()-i*7); buckets.push(m.toISOString().split('T')[0]) }
  } else {
    for (let i=11;i>=0;i--) { const d=new Date(now.getFullYear(),now.getMonth()-i,1); buckets.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`) }
  }
  const fmtBucket = key => {
    if (!key) return ''
    if (groupBy==='weekly') return new Date(key+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})
    const [y,m]=key.split('-'); return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-US',{month:'short',year:'2-digit'})
  }

  const LINE_PALETTE = ['#007AFF','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#ca8a04','#db2777']
  const lineContacts = Array.from(new Set(filtered.map(i=>i.contact).filter(Boolean))).sort()
  const lineColorMap = Object.fromEntries(lineContacts.map((c,i)=>[c, LINE_PALETTE[i%LINE_PALETTE.length]]))
  const lineData = buckets.map(b => {
    const row = {date: fmtBucket(b)}
    lineContacts.forEach(c => {
      row[c] = filtered.filter(i => i.contact===c && (groupBy==='weekly' ? getWeekKey(i.date) : getMonthKey(i.date)) === b).length
    })
    return row
  })

  const renderLineTooltip = ({active,payload,label}) => {
    if (!active||!payload?.length) return null
    const entries = payload.filter(p=>p.value>0)
    if (!entries.length) return null
    const total = entries.reduce((s,p)=>s+p.value,0)
    return (
      <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',padding:'12px',minWidth:180}}>
        <div style={{fontSize:12,fontWeight:700,color:S.txt,borderBottom:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`,paddingBottom:6,marginBottom:6}}>{label}</div>
        {entries.map((p,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:i<entries.length-1?4:0}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:p.color,flexShrink:0}}/>
              <span style={{fontSize:12,color:S.secondary}}>{p.dataKey}</span>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:S.txt}}>{p.value}</span>
          </div>
        ))}
        {entries.length>1&&<div style={{display:'flex',justifyContent:'space-between',borderTop:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`,paddingTop:4,marginTop:6}}>
          <span style={{fontSize:11,color:S.muted}}>Total</span>
          <span style={{fontSize:11,fontWeight:700,color:S.muted}}>{total}</span>
        </div>}
      </div>
    )
  }

  const typeBadge = t => ({
    bg: S.isLight ? ({Meeting:'#EBF4FF',Call:'#dcfce7',Email:'#fef9c3',Demo:'#ede9fe',Note:'#F9FAFB'}[t]||'#F9FAFB') : (INTERACTION_COLORS[t]||S.muted)+'1a',
    c:  S.isLight ? ({Meeting:'#0066CC',Call:'#15803d',Email:'#a16207',Demo:'#7c3aed',Note:'#475569'}[t]||'#475569') : (INTERACTION_COLORS[t]||S.muted)
  })

  const bucketMap = {}
  buckets.forEach(b => { bucketMap[b]={key:b}; INTERACTION_TYPES.forEach(t=>{bucketMap[b][t]=0;bucketMap[b]['_'+t]=[]}) })
  filtered.forEach(ix => {
    const bk = groupBy==='weekly' ? getWeekKey(ix.date) : getMonthKey(ix.date)
    if (!bk||!bucketMap[bk]) return
    if (INTERACTION_TYPES.includes(ix.type)) { bucketMap[bk][ix.type]++; bucketMap[bk]['_'+ix.type].push(ix) }
  })

  const feedItems = [...filtered].sort((a,b)=>(b.date||'').localeCompare(a.date||''))

  const calMonthIxs = acct.interactions.filter(i=>(i.date||'').startsWith(thisMonth))
  const calDayMap = {}
  calMonthIxs.forEach(ix=>{const day=parseInt((ix.date||'').split('-')[2]||'0');if(!calDayMap[day])calDayMap[day]=[];calDayMap[day].push(ix)})
  const calFirst=new Date(now.getFullYear(),now.getMonth(),1), calLast=new Date(now.getFullYear(),now.getMonth()+1,0)
  const calCells=[];for(let i=0;i<calFirst.getDay();i++)calCells.push(null);for(let d=1;d<=calLast.getDate();d++)calCells.push({day:d,ixs:calDayMap[d]||[]});while(calCells.length%7!==0)calCells.push(null)
  const typePriority=['Meeting','Call','Email','Demo','Note']
  const dominantType=ixs=>{for(const t of typePriority)if(ixs.some(x=>x.type===t))return t;return ixs[0]?.type||'Note'}

  const contactFreqData=Object.entries(cntMap).map(([name,count])=>{
    const c=(acct.contacts||[]).find(ct=>ct.name===name);const inf=c?.influence||'Stakeholder'
    return{name,count,inf,color:IC[inf]?.c||S.muted}
  }).sort((a,b)=>b.count-a.count)
  const contactLastIx=name=>{const ixs=acct.interactions.filter(i=>i.contact===name).sort((a,b)=>(b.date||'').localeCompare(a.date||''));return ixs[0]?.date||null}
  const contactTypes=name=>[...new Set(acct.interactions.filter(i=>i.contact===name).map(i=>i.type).filter(Boolean))]

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

  return (
    <div>
      {/* ── STAT CARDS ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:20}}>
        {[
          {key:'last30',bc:'#007AFF',onClick:()=>setCalendarOpen(true),label:'Last 30 Days',main:String(last30Count),sub:`interaction${last30Count!==1?'s':''} · click for calendar`},
          {key:'topContact',bc:'#16a34a',onClick:()=>setContactFreqOpen(true),label:'Most Contacted',main:topContact?topContact[0]:'—',sub:topContact?`${topContact[1]} interaction${topContact[1]!==1?'s':''}`:null},
          {key:'topType',bc:'#9333ea',onClick:()=>setActivityBreakOpen(true),label:'Top Activity Type',main:topType?topType[0]:'—',sub:topType?`${topType[1]} total`:null},
        ].map(({key,bc,onClick,label,main,sub})=>{
          const isHov=hoveredStat===key
          return (
            <div key={key} onClick={onClick}
              onMouseEnter={()=>setHoveredStat(key)}
              onMouseLeave={()=>setHoveredStat(null)}
              style={{background:S.surf,border:`1px solid ${S.bdr}`,borderTop:`3px solid ${bc}`,borderRadius:12,padding:'14px 16px',cursor:'pointer',boxShadow:isHov?'0 4px 12px rgba(0,0,0,0.1)':'0 1px 4px rgba(0,0,0,0.06)',transition:'all 0.15s',transform:isHov?'translateY(-1px)':'translateY(0)'}}>
              <div style={{fontSize:10,color:S.muted,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700,marginBottom:8}}>{label}</div>
              <div style={{fontSize:key==='last30'?28:15,fontWeight:800,color:S.txt,marginBottom:2,lineHeight:1.2}}>{main}</div>
              {sub&&<div style={{fontSize:11,color:S.muted}}>{sub}</div>}
            </div>
          )
        })}
      </div>

      {acct.interactions.length===0 ? (
        <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,padding:'60px 20px',textAlign:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
          <div style={{fontSize:40,marginBottom:14,opacity:0.25}}>📈</div>
          <div style={{fontSize:16,fontWeight:700,color:S.txt,marginBottom:8}}>No interactions logged yet</div>
          <div style={{fontSize:13,color:S.muted,marginBottom:22,lineHeight:1.6,maxWidth:380,margin:'0 auto 22px'}}>Process a call transcript in Intel Log to automatically populate this dashboard.</div>
          {setTab&&<button onClick={()=>setTab('intel')} style={{padding:'9px 20px',background:S.blue,border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>Go to Intel Log →</button>}
        </div>
      ) : (
        <>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
            <div style={{display:'flex',gap:2,background:S.surf2,borderRadius:8,padding:2,border:`1px solid ${S.bdr}`}}>
              {['weekly','monthly'].map(v=>(
                <button key={v} onClick={()=>setGroupBy(v)} style={{padding:'5px 14px',borderRadius:6,border:'none',background:groupBy===v?S.blue:'transparent',color:groupBy===v?'#ffffff':S.muted,fontSize:12,fontWeight:600,cursor:'pointer',transition:'all 0.15s'}}>{v==='weekly'?'Weekly':'Monthly'}</button>
              ))}
            </div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}>
              <div style={{position:'relative'}} ref={filterRef}>
                <button onClick={()=>setFilterOpen(v=>!v)} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,color:S.secondary,fontSize:12,fontWeight:500,cursor:'pointer'}}>
                  {selectedContacts.length===0?'All Contacts':`${selectedContacts.length} Contact${selectedContacts.length!==1?'s':''}`} <span style={{fontSize:10,color:S.muted}}>▾</span>
                </button>
                {filterOpen&&(
                  <div style={{position:'absolute',right:0,top:'calc(100% + 4px)',zIndex:200,background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:10,boxShadow:'0 4px 20px rgba(0,0,0,0.15)',minWidth:220,overflow:'hidden',padding:'4px 0'}}>
                    <div style={{padding:'6px 14px',borderBottom:`1px solid ${S.bdr}`}}>
                      <button onClick={()=>setSelectedContacts([])} style={{fontSize:11,color:selectedContacts.length===0?S.blue:S.muted,background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:0}}>Clear all (show all)</button>
                    </div>
                    {allContacts.map((c,i)=>{
                      const col = LINE_PALETTE[i%LINE_PALETTE.length]
                      const checked = selectedContacts.length===0||selectedContacts.includes(c)
                      return (
                        <label key={c} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',cursor:'pointer'}}
                          onMouseEnter={e=>e.currentTarget.style.background=S.surf2}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <input type='checkbox' checked={checked} readOnly style={{accentColor:col,width:14,height:14,cursor:'pointer'}}
                            onClick={()=>{if(selectedContacts.length===0)setSelectedContacts(allContacts.filter(x=>x!==c));else setSelectedContacts(p=>p.includes(c)?p.filter(x=>x!==c):[...p,c])}}/>
                          <div style={{width:8,height:8,borderRadius:'50%',background:col,flexShrink:0}}/>
                          <span style={{fontSize:12,color:S.txt}}>{c}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
              {selectedContacts.length>0&&(
                <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
                  {selectedContacts.map(c=>(
                    <span key={c} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',background:'#EBF4FF',border:`1px solid ${S.isLight?'#007AFF':'rgba(0,122,255,0.3)'}`,borderRadius:999,fontSize:11,color:S.blue}}>
                      {c}<button onClick={()=>setSelectedContacts(p=>p.filter(x=>x!==c))} style={{background:'none',border:'none',color:S.blue,cursor:'pointer',fontSize:13,lineHeight:1,padding:'0 0 0 2px'}}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,padding:'20px 20px 12px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)',marginBottom:10}}>
            <ResponsiveContainer width='100%' height={280}>
              <LineChart data={lineData} margin={{top:8,right:16,bottom:0,left:0}}>
                <CartesianGrid horizontal={true} vertical={false} stroke={S.isLight?'#F9FAFB':S.bdr} strokeDasharray='4 4'/>
                <XAxis dataKey='date' tick={{fontSize:11,fill:S.isLight?'#9CA3AF':S.muted}} axisLine={false} tickLine={false}/>
                <YAxis allowDecimals={false} tick={{fontSize:11,fill:S.isLight?'#9CA3AF':S.muted}} axisLine={false} tickLine={false} width={30}/>
                <RechartsTooltip content={renderLineTooltip}/>
                {lineContacts.filter(c=>!hiddenContacts.includes(c)).map(c=>(
                  <Line key={c} type='monotone' dataKey={c} stroke={lineColorMap[c]} strokeWidth={2.5}
                    dot={{r:4,fill:lineColorMap[c],stroke:'#ffffff',strokeWidth:2}}
                    activeDot={{r:6}} animationDuration={600}/>
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {lineContacts.length>0&&(
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:20,paddingLeft:4}}>
              {lineContacts.map(c=>{
                const col=lineColorMap[c]
                const hidden=hiddenContacts.includes(c)
                return (
                  <button key={c} onClick={()=>setHiddenContacts(p=>p.includes(c)?p.filter(x=>x!==c):[...p,c])}
                    style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:999,fontSize:12,color:hidden?S.dim:S.txt,cursor:'pointer',opacity:hidden?0.35:1,textDecoration:hidden?'line-through':'none',transition:'all 0.15s'}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:col,flexShrink:0}}/>
                    {c}
                  </button>
                )
              })}
            </div>
          )}

          {feedItems.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                <span style={{fontSize:11,fontWeight:700,color:S.secondary,letterSpacing:'0.08em',textTransform:'uppercase'}}>Activity Feed</span>
                <span style={{fontSize:11,fontWeight:700,color:S.blue,background:'#EBF4FF',borderRadius:999,padding:'1px 7px'}}>{feedItems.length}</span>
              </div>
              <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                {feedItems.map((ix,idx)=>{
                  const isExp=expandedId===ix.id
                  const isLast=idx===feedItems.length-1
                  const {bg:tbg,c:tc}=typeBadge(ix.type||'Note')
                  return (
                    <div key={ix.id} style={{borderBottom:isLast?'none':`1px solid ${S.isLight?'#F9FAFB':S.bdr}`}}>
                      <div onClick={()=>setExpandedId(isExp?null:ix.id)}
                        style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer',background:isExp?(S.surf2):'transparent',transition:'background 0.1s'}}
                        onMouseEnter={e=>{if(!isExp)e.currentTarget.style.background=S.surf2}}
                        onMouseLeave={e=>{if(!isExp)e.currentTarget.style.background='transparent'}}>
                        <span style={{fontSize:10,fontWeight:700,color:tc,background:tbg,padding:'3px 9px',borderRadius:999,flexShrink:0,whiteSpace:'nowrap'}}>{ix.type||'Note'}</span>
                        <div style={{flex:1,minWidth:0}}>
                          {ix.contact&&<div style={{fontSize:13,fontWeight:600,color:S.txt,marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ix.contact}</div>}
                          {ix.topics&&<div style={{fontSize:12,color:S.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ix.topics}</div>}
                        </div>
                        <div style={{fontSize:11,color:S.muted,flexShrink:0}}>{fmtDate(ix.date)}</div>
                      </div>
                      {isExp&&(
                        <div style={{background:S.surf2,borderTop:`1px solid ${S.isLight?'#F9FAFB':S.bdr}`,borderLeft:`3px solid ${tc}`,padding:'10px 16px 12px'}}>
                          {ix.summary&&<div style={{fontSize:13,color:S.secondary,lineHeight:1.65,marginBottom:6}}>{ix.summary.length>500?ix.summary.slice(0,500)+'…':ix.summary}</div>}
                          <div style={{fontSize:10,color:S.muted,display:'flex',gap:10}}>
                            <span>{fmtDate(ix.date)}</span>
                            {ix.duration&&<span>{ix.duration} min</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {calendarOpen&&(
        <div style={modalBack} onClick={e=>{if(e.target===e.currentTarget)setCalendarOpen(false)}}>
          <div style={modalBox('65vw','70vh')}>
            <div style={modalHdr}>
              <div style={{fontSize:14,fontWeight:700,color:S.txt}}>Last 30 Days — Interactions</div>
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
              <div style={{fontSize:12,fontWeight:600,color:S.muted,marginBottom:12}}>{last30Count} interaction{last30Count!==1?'s':''} in the last 30 days</div>
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
