import { S } from '../theme.js'

export const Badge = ({label,color,bg,size=11}) => <span style={{fontSize:size,fontWeight:600,color,background:bg,padding:'2px 8px',borderRadius:999,whiteSpace:'nowrap',display:'inline-block',lineHeight:'18px'}}>{label}</span>

export const Btn = ({children,onClick,variant='ghost',disabled=false,style={}}) => {
  const v = {
    ghost:{background:S.isLight?S.surf:'transparent',color:S.secondary,border:`1px solid ${S.bdr}`},
    primary:{background:S.blue,color:'#fff',border:'none',fontWeight:600},
    danger:{background:S.isLight?'#fef2f2':'rgba(239,68,68,0.1)',color:S.red,border:S.isLight?'1px solid #fecaca':'1px solid rgba(239,68,68,0.3)'}
  }
  return <button onClick={onClick} disabled={disabled}
    onMouseEnter={e=>{if(!disabled&&variant==='primary')e.currentTarget.style.background='#1d4ed8';if(!disabled&&variant==='ghost')e.currentTarget.style.background=S.isLight?'#f8fafc':'rgba(255,255,255,0.05)'}}
    onMouseLeave={e=>{if(!disabled&&variant==='primary')e.currentTarget.style.background=S.blue;if(!disabled&&variant==='ghost')e.currentTarget.style.background=S.isLight?S.surf:'transparent'}}
    style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 14px',minHeight:36,borderRadius:8,fontSize:13,fontWeight:500,cursor:disabled?'default':'pointer',opacity:disabled?0.5:1,transition:'background 0.15s',...v[variant],...style}}>{children}</button>
}

export const Field = ({label,value,onChange,type='text',options=null,multiline=false,style={},placeholder=''}) => (
  <div style={{marginBottom:12,...style}}>
    {label&&<div style={{fontSize:11,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{label}</div>}
    {options?<select value={value||''} onChange={e=>onChange(e.target.value)}><option value=''>Select...</option>{options.map(o=><option key={o} value={o}>{o}</option>)}</select>:multiline?<textarea value={value||''} onChange={e=>onChange(e.target.value)} rows={3} placeholder={placeholder}/>:<input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>}
  </div>
)

export const Modal = ({title,onClose,children,width=520}) => {
  const mob = typeof window!=='undefined'&&window.innerWidth<768
  return (
  <div style={{position:'fixed',inset:0,background:S.isLight?'rgba(15,23,42,0.5)':'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:mob?0:16}}>
    <div style={{background:S.surf,border:mob?'none':`1px solid ${S.bdr}`,borderRadius:mob?0:14,boxShadow:S.isLight?'0 20px 60px rgba(0,0,0,0.15)':'0 20px 60px rgba(0,0,0,0.5)',width:'100%',maxWidth:mob?'100%':width,height:mob?'100%':'auto',maxHeight:mob?'100%':'90vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0}}>
        <div style={{fontSize:16,fontWeight:700,color:S.txt,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,marginRight:8}}>{title}</div>
        <button onClick={onClose} style={{background:'none',border:'none',color:S.dim,cursor:'pointer',fontSize:22,lineHeight:1,minHeight:36,minWidth:36,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}
          onMouseEnter={e=>e.currentTarget.style.color=S.muted}
          onMouseLeave={e=>e.currentTarget.style.color=S.dim}>×</button>
      </div>
      <div style={{padding:20,overflowY:'auto',flex:1}}>{children}</div>
    </div>
  </div>
  )
}

export const SH = ({children,mt=0}) => <div style={{fontSize:11,fontWeight:700,color:S.secondary,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8,marginTop:mt}}>{children}</div>

export const Card = ({children,style={}}) => <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,boxShadow:S.isLight?'0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)':'none',...style}}>{children}</div>
