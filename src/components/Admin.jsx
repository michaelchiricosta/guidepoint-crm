import { useState } from 'react'
import { S } from '../theme.js'
import { Card } from './UI.jsx'

export default function Admin({acct,setAcct}) {
  const [copied,setCopied] = useState(false)
  const d = acct.adminData||{}
  const save = (k,v) => setAcct(p=>({...p,adminData:{...(p.adminData||{}),[k]:v}}))

  const FIELDS = [
    {key:'accountName',label:'Account Name',defaultVal:acct.name,type:'text'},
    {key:'opportunityName',label:'Opportunity Name',type:'text'},
    {key:'closeDate',label:'Estimated Close Date',type:'date'},
    {key:'customerContact',label:'Customer Contact',type:'text'},
    {key:'customerEmail',label:'Customer Email',type:'text'},
    {key:'customerTitle',label:'Customer Title',type:'text'},
    {key:'shipTo',label:'Ship To Address',type:'textarea'},
    {key:'revenue',label:'Est. Top Line Revenue',type:'text',prefix:'$'},
    {key:'products',label:'Products',type:'textarea'},
    {key:'vendorContact',label:'Vendor Contact',type:'text'},
    {key:'vendorEmail',label:'Vendor Email',type:'text'},
  ]

  const copyAll = () => {
    const text = FIELDS.map(f=>`${f.label}: ${d[f.key]||f.defaultVal||''}`).join('\n')
    navigator.clipboard.writeText(text).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)})
  }

  return (
    <div style={{maxWidth:680}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{fontSize:15,fontWeight:700,color:S.txt}}>Opportunity / Admin Data</div>
        <button onClick={copyAll} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:copied?('#D1FAE5'):S.surf,border:`1px solid ${copied?(S.isLight?'#86efac':S.green):S.bdr}`,borderRadius:8,color:copied?S.green:S.secondary,fontSize:12,fontWeight:600,cursor:'pointer',transition:'all 0.2s'}}>
          {copied?'✓ Copied!':'📋 Copy All'}
        </button>
      </div>
      <Card style={{overflow:'hidden',padding:0}}>
        {FIELDS.map((f,i)=>{
          const val = d[f.key]!==undefined ? d[f.key] : (f.defaultVal||'')
          const isEven = i%2===0
          return (
            <div key={f.key} style={{display:'flex',alignItems:f.type==='textarea'?'flex-start':'center',borderBottom:i<FIELDS.length-1?`1px solid ${S.isLight?'#F9FAFB':S.bdr}`:'none',background:isEven?(S.surf):(S.isLight?'#fafafa':S.surf2)}}>
              <div style={{width:200,flexShrink:0,padding:'12px 16px',fontSize:12,fontWeight:600,color:S.muted}}>
                {f.prefix&&<span style={{color:S.isLight?'#16a34a':S.green,marginRight:2}}>{f.prefix}</span>}
                {f.label}
              </div>
              <div style={{flex:1,padding:'8px 12px 8px 0'}}>
                {f.type==='textarea'?(
                  <textarea value={val} rows={2}
                    onChange={e=>save(f.key,e.target.value)}
                    onBlur={e=>save(f.key,e.target.value)}
                    style={{width:'100%',fontSize:13,padding:'6px 10px',background:'transparent',border:`1px solid transparent`,borderRadius:6,color:S.txt,resize:'vertical',lineHeight:1.5,fontFamily:'inherit',boxSizing:'border-box',outline:'none'}}
                    onFocus={e=>{e.target.style.background=S.surf;e.target.style.border=`1px solid ${S.blue}`;e.target.style.boxShadow='0 0 0 3px rgba(37,99,235,0.1)'}}
                    onBlurCapture={e=>{e.target.style.background='transparent';e.target.style.border='1px solid transparent';e.target.style.boxShadow='none'}}
                    placeholder={`Enter ${f.label.toLowerCase()}…`}/>
                ):(
                  <input type={f.type} value={val}
                    onChange={e=>save(f.key,e.target.value)}
                    style={{width:'100%',fontSize:13,padding:'6px 10px',background:'transparent',border:'1px solid transparent',borderRadius:6,color:S.txt,fontFamily:'inherit',boxSizing:'border-box',outline:'none'}}
                    onFocus={e=>{e.target.style.background=S.surf;e.target.style.border=`1px solid ${S.blue}`;e.target.style.boxShadow='0 0 0 3px rgba(37,99,235,0.1)'}}
                    onBlur={e=>{e.target.style.background='transparent';e.target.style.border='1px solid transparent';e.target.style.boxShadow='none'}}
                    placeholder={`Enter ${f.label.toLowerCase()}…`}/>
                )}
              </div>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
