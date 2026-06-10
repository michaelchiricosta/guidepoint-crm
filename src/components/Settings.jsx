import { useState, useRef } from 'react'
import { S } from '../theme.js'
import { Field, Btn, SH, Card } from './UI.jsx'
import { supabase } from '../supabase.js'

export default function Settings({data,setData,acct,setAcct,theme,setTheme,saveInProgress,lastSaveTime,onReset}) {
  const [key,setKey] = useState(data.apiKey||'')
  const [saved,setSaved] = useState(false)
  const [logoStatus,setLogoStatus] = useState(null)
  const logoInputRef = useRef(null)
  const saveKey=()=>{setData(p=>({...p,apiKey:key}));setSaved(true);setTimeout(()=>setSaved(false),2000)}
  const exportData=()=>{const b=new Blob([JSON.stringify(data,null,2)]);const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='guidepoint-crm-backup.json';a.click()}
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
      const {error} = await supabase.from('accounts').upsert({id:'user-data',data:updatedData,updated_at:new Date().toISOString()})
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
      await supabase.from('accounts').upsert({id:'user-data',data:updatedData,updated_at:new Date().toISOString()})
    } catch(err) { console.error('Logo remove failed:', err) }
    finally { setTimeout(()=>{ saveInProgress.current = false }, 3000) }
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
          <Field label='Number of Endpoints' value={acct.endpoints||''} onChange={v=>setAcct(p=>({...p,endpoints:v}))}/>
        </div>
        <Field label='Account Notes' value={acct.notes} onChange={v=>setAcct(p=>({...p,notes:v}))} multiline/>
      </Card>
      <SH>Data Management</SH>
      <div style={{display:'flex',gap:8}}>
        <Btn onClick={exportData}>Export JSON Backup</Btn>
        <Btn variant='danger' onClick={()=>{if(window.confirm('Reset everything to sample BHSI data?'))onReset()}}>Reset to Sample Data</Btn>
      </div>
    </div>
  )
}
