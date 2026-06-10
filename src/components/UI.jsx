import { S } from '../theme.js'

export const Badge = ({label,color,bg,size=11}) => (
  <span style={{fontSize:size,fontWeight:600,color,background:bg,padding:'2px 8px',borderRadius:20,whiteSpace:'nowrap',display:'inline-block',lineHeight:'18px'}}>{label}</span>
)

export const Btn = ({children,onClick,variant='ghost',disabled=false,style={}}) => {
  const v = {
    ghost:       {background:'#FFFFFF',color:'#374151',border:'1px solid #EEEFF2'},
    primary:     {background:'#007AFF',color:'#FFFFFF',border:'none',fontWeight:500,boxShadow:'0 1px 3px rgba(0,122,255,0.25)'},
    secondary:   {background:'#FFFFFF',color:'#374151',border:'1px solid #EEEFF2'},
    danger:      {background:'#FEE2E2',color:'#DC2626',border:'1px solid #FECACA'},
    destructive: {background:'#EF4444',color:'#FFFFFF',border:'none'},
  }
  const hov = {
    ghost:       e=>{ e.currentTarget.style.background='#F9FAFB'; e.currentTarget.style.borderColor='#D1D5DB' },
    primary:     e=>{ e.currentTarget.style.background='#0066CC' },
    secondary:   e=>{ e.currentTarget.style.background='#F9FAFB'; e.currentTarget.style.borderColor='#D1D5DB' },
    danger:      e=>{ e.currentTarget.style.background='#FEE2E2' },
    destructive: e=>{ e.currentTarget.style.background='#DC2626' },
  }
  const unHov = {
    ghost:       e=>{ e.currentTarget.style.background='#FFFFFF'; e.currentTarget.style.borderColor='#EEEFF2' },
    primary:     e=>{ e.currentTarget.style.background='#007AFF' },
    secondary:   e=>{ e.currentTarget.style.background='#FFFFFF'; e.currentTarget.style.borderColor='#EEEFF2' },
    danger:      e=>{ e.currentTarget.style.background='#FEE2E2' },
    destructive: e=>{ e.currentTarget.style.background='#EF4444' },
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={e=>{ if(!disabled) hov[variant]?.(e) }}
      onMouseLeave={e=>{ if(!disabled) unHov[variant]?.(e) }}
      style={{
        display:'inline-flex',alignItems:'center',gap:6,
        padding:'9px 18px',minHeight:36,
        borderRadius:8,fontSize:14,fontWeight:500,
        cursor:disabled?'default':'pointer',
        opacity:disabled?0.5:1,
        transition:'background 0.15s,border-color 0.15s',
        ...v[variant],...style
      }}
    >{children}</button>
  )
}

export const Field = ({label,value,onChange,type='text',options=null,multiline=false,style={},placeholder=''}) => (
  <div style={{marginBottom:12,...style}}>
    {label&&<div style={{fontSize:11,color:'#9CA3AF',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{label}</div>}
    {options
      ? <select value={value||''} onChange={e=>onChange(e.target.value)}>
          <option value=''>Select...</option>
          {options.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      : multiline
        ? <textarea value={value||''} onChange={e=>onChange(e.target.value)} rows={3} placeholder={placeholder}/>
        : <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>
    }
  </div>
)

export const Modal = ({title,onClose,children,width=520}) => {
  const mob = typeof window!=='undefined'&&window.innerWidth<768
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:mob?0:16}}>
      <div style={{
        background:'#FFFFFF',
        border:mob?'none':'1px solid #EEEFF2',
        borderRadius:mob?0:12,
        boxShadow:'0 20px 60px rgba(0,0,0,0.15)',
        width:'100%',maxWidth:mob?'100%':width,
        height:mob?'100%':'auto',maxHeight:mob?'100%':'90vh',
        overflow:'hidden',display:'flex',flexDirection:'column'
      }}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:'1px solid #EEEFF2',flexShrink:0}}>
          <div style={{fontSize:16,fontWeight:600,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,marginRight:8}}>{title}</div>
          <button
            onClick={onClose}
            style={{background:'none',border:'none',color:'#9CA3AF',cursor:'pointer',fontSize:20,lineHeight:1,minHeight:36,minWidth:36,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,borderRadius:6,transition:'color 0.15s'}}
            onMouseEnter={e=>e.currentTarget.style.color='#6B7280'}
            onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>×</button>
        </div>
        <div style={{padding:20,overflowY:'auto',flex:1}}>{children}</div>
      </div>
    </div>
  )
}

export const SH = ({children,mt=0}) => (
  <div style={{fontSize:11,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8,marginTop:mt}}>{children}</div>
)

export const Card = ({children,style={},onClick,hoverable=false}) => {
  const base = {
    background:'#FFFFFF',
    border:'1px solid #EEEFF2',
    borderRadius:12,
    boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
    transition: hoverable ? 'box-shadow 0.15s' : undefined,
    cursor: onClick ? 'pointer' : undefined,
    ...style
  }
  if (!onClick && !hoverable) return <div style={base}>{children}</div>
  return (
    <div
      style={base}
      onClick={onClick}
      onMouseEnter={hoverable ? e=>{ e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.10)' } : undefined}
      onMouseLeave={hoverable ? e=>{ e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.06)' } : undefined}
    >{children}</div>
  )
}
