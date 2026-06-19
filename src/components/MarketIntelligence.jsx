import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Globe, RefreshCw, Plus, Trash2, Star, ExternalLink, AlertTriangle, CheckCircle, X, Search, BookOpen, Pencil, ToggleLeft, ToggleRight, ChevronDown, ChevronUp } from 'lucide-react'
import { uid } from '../utils.js'

// ── Constants ─────────────────────────────────────────────────────────────────
const LS_COLLAPSED = 'ledgr-market-sources-collapsed'

const DEFAULT_SOURCES = [
  { id: 'guidepointsecurity', name: 'GuidePoint Security Blog', url: 'https://www.guidepointsecurity.com/blog/',  feedUrl: 'https://www.guidepointsecurity.com/blog/feed/', enabled: true },
  { id: 'darkreading',        name: 'Dark Reading',             url: 'https://www.darkreading.com/',              feedUrl: 'https://www.darkreading.com/rss/all.xml',           enabled: true },
  { id: 'cio',                name: 'CIO.com',                  url: 'https://www.cio.com/',                      feedUrl: 'https://www.cio.com/feed/',                         enabled: true },
]

export const CAT_COLORS = {
  'Identity & IAM': '#7c3aed', 'Threat Intelligence': '#dc2626', 'Cloud Security': '#0891b2',
  'Compliance & Risk': '#ea580c', 'SOC & Detection': '#1d4ed8', 'AI Security': '#059669',
  'Endpoint Security': '#0f172a', 'Vulnerability Mgmt': '#b45309', 'Security News': '#6b7280',
}
const CAT_LIST = Object.keys(CAT_COLORS)
const BLANK_KB = { title: '', sourceUrl: '', category: 'Security News', notes: '', relatedAccount: '', relatedVendor: '', tags: '', excerpt: '' }

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtPub = iso => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '' }
}

const sourceHue = id => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff; return Math.abs(h) % 360 }
const sourceInitial = name => (name || '?').charAt(0).toUpperCase()

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MarketIntelligence({ data, setData, onBack }) {
  const sources      = data.blogSources       || []
  const pinnedSet    = new Set(data.marketIntelPinned  || [])
  const deletedSet   = new Set(data.marketIntelDeleted || [])
  const knowledgeBase = data.knowledgeBase    || []

  // feed (session only)
  const [articles, setArticles]           = useState([])
  const [fetching, setFetching]           = useState(false)
  const [fetchedOnce, setFetchedOnce]     = useState(false)
  const [sourceResults, setSourceResults] = useState([])

  // sources section open/collapsed (localStorage persisted)
  const [sourcesOpen, setSourcesOpen] = useState(() => {
    try { const v = localStorage.getItem(LS_COLLAPSED); return v === null ? false : v !== 'true' }
    catch { return false }
  })

  // nav
  const [selectedNav, setSelectedNav] = useState('all')
  const [search, setSearch]           = useState('')

  // add source
  const [showAddForm, setShowAddForm] = useState(false)
  const [addUrl, setAddUrl]           = useState('')
  const [addName, setAddName]         = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [addError, setAddError]       = useState('')
  const [addSuccess, setAddSuccess]   = useState('')

  // KB
  const [kbMode, setKbMode]           = useState(false)
  const [showAddKb, setShowAddKb]     = useState(false)
  const [kbForm, setKbForm]           = useState(BLANK_KB)
  const [editingKbId, setEditingKbId] = useState(null)
  const [kbSearch, setKbSearch]       = useState('')

  // ── Seed / migrate sources ─────────────────────────────────────────────────
  useEffect(() => {
    const existing = data.blogSources || []
    if (existing.length === 0) {
      setData(prev => ({ ...prev, blogSources: DEFAULT_SOURCES.map(s => ({ ...s, createdAt: new Date().toISOString() })) }))
      return
    }
    const KNOWN = { guidepointsecurity: 'https://www.guidepointsecurity.com/blog/feed/', darkreading: 'https://www.darkreading.com/rss/all.xml', cio: 'https://www.cio.com/feed/' }
    const ids = new Set(existing.map(s => s.id))
    const missing = DEFAULT_SOURCES.filter(s => !ids.has(s.id))
    if (existing.some(s => !s.feedUrl) || missing.length > 0) {
      setData(prev => ({
        ...prev,
        blogSources: [
          ...(prev.blogSources || []).map(s => s.feedUrl ? s : { ...s, feedUrl: KNOWN[s.id] || null }),
          ...missing.map(s => ({ ...s, createdAt: new Date().toISOString() })),
        ],
      }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Fetch RSS feeds ────────────────────────────────────────────────────────
  const fetchArticles = useCallback(async srcs => {
    const enabled = (srcs || []).filter(s => s.enabled && s.feedUrl)
    if (!enabled.length) { setArticles([]); setSourceResults([]); setFetchedOnce(true); return }
    setFetching(true)
    try {
      const r = await fetch('/api/rss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sources: enabled }) })
      const j = await r.json()
      setArticles(j.items || [])
      setSourceResults(j.sourceResults || [])
    } catch (err) {
      setSourceResults([{ status: 'error', error: err.message, name: 'All sources' }])
    }
    setFetching(false)
    setFetchedOnce(true)
  }, [])

  useEffect(() => {
    if ((data.blogSources || []).length > 0 && !fetchedOnce && !fetching) fetchArticles(data.blogSources)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.blogSources, fetchedOnce])

  // ── Source management ──────────────────────────────────────────────────────
  const toggleSource = id => setData(prev => ({ ...prev, blogSources: (prev.blogSources||[]).map(s => s.id===id ? {...s,enabled:!s.enabled} : s) }))
  const deleteSource = id => {
    if (!window.confirm('Remove this source?')) return
    setData(prev => ({ ...prev, blogSources: (prev.blogSources||[]).filter(s => s.id!==id) }))
    setSourceResults(prev => prev.filter(r => r.id!==id))
    setArticles(prev => prev.filter(a => a.sourceId!==id))
    if (selectedNav === id) setSelectedNav('all')
  }
  const discoverAndAdd = async () => {
    if (!addUrl.trim()) { setAddError('Enter a URL'); return }
    let url = addUrl.trim()
    if (!/^https?:\/\//.test(url)) url = 'https://' + url
    setAddError(''); setAddSuccess(''); setDiscovering(true)
    try {
      let feedUrl = /\.(xml|rss|atom)$|\/feed\/?|\/rss\/?/.test(url.toLowerCase()) ? url : null
      if (!feedUrl) {
        const r = await fetch('/api/rss', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({discover:true,url}) })
        feedUrl = (await r.json()).feedUrl || null
      }
      if (!feedUrl) { setAddError('No RSS feed found. Try pasting the feed URL directly.'); setDiscovering(false); return }
      const name = addName.trim() || new URL(url).hostname.replace('www.','')
      const ns = { id: uid(), name, url, feedUrl, enabled: true, createdAt: new Date().toISOString() }
      const next = [...(data.blogSources||[]), ns]
      setData(prev => ({ ...prev, blogSources: next }))
      setAddSuccess(`Added "${name}"`)
      setAddUrl(''); setAddName('')
      fetchArticles(next)
      setTimeout(() => { setAddSuccess(''); setShowAddForm(false) }, 2500)
    } catch (err) { setAddError('Error: ' + err.message) }
    setDiscovering(false)
  }

  // ── Sources toggle ─────────────────────────────────────────────────────────
  const toggleSources = () => {
    setSourcesOpen(v => {
      const next = !v
      try { localStorage.setItem(LS_COLLAPSED, String(!next)) } catch {}
      return next
    })
  }

  // ── Article actions ────────────────────────────────────────────────────────
  const pinArticle   = id => setData(prev => { const s = new Set(prev.marketIntelPinned||[]); s.has(id)?s.delete(id):s.add(id); return {...prev,marketIntelPinned:[...s]} })
  const hideArticle  = id => setData(prev => ({...prev,marketIntelDeleted:[...new Set([...(prev.marketIntelDeleted||[]),id])]}))
  const unhideArticle = id => setData(prev => ({...prev,marketIntelDeleted:(prev.marketIntelDeleted||[]).filter(x=>x!==id)}))

  // ── KB ─────────────────────────────────────────────────────────────────────
  const deleteKb = id => setData(prev => ({...prev,knowledgeBase:(prev.knowledgeBase||[]).filter(p=>p.id!==id)}))
  const saveKb = () => {
    if (!kbForm.title.trim()) return
    const now = new Date().toISOString()
    const tags = kbForm.tags.split(',').map(t=>t.trim()).filter(Boolean)
    if (editingKbId) setData(prev=>({...prev,knowledgeBase:(prev.knowledgeBase||[]).map(p=>p.id===editingKbId?{...p,...kbForm,tags,updatedAt:now}:p)}))
    else setData(prev=>({...prev,knowledgeBase:[{id:uid(),type:'manual',...kbForm,tags,sourceName:'Manual',publishedDate:'',createdAt:now,updatedAt:now},...(prev.knowledgeBase||[])]}))
    setKbForm(BLANK_KB); setShowAddKb(false); setEditingKbId(null)
  }

  // ── Filtered / sorted articles ─────────────────────────────────────────────
  const filteredArticles = articles.filter(a => {
    if (selectedNav === 'pinned') return pinnedSet.has(a.id) && !deletedSet.has(a.id)
    if (selectedNav === 'hidden') return deletedSet.has(a.id)
    if (selectedNav !== 'all')   return a.sourceId === selectedNav && !deletedSet.has(a.id)
    return !deletedSet.has(a.id)
  }).filter(a => !search || `${a.title} ${a.description} ${a.sourceName}`.toLowerCase().includes(search.toLowerCase()))

  const sortedArticles = [...filteredArticles.filter(a=>pinnedSet.has(a.id)), ...filteredArticles.filter(a=>!pinnedSet.has(a.id))]
  const pinnedCount = [...pinnedSet].filter(id => !deletedSet.has(id) && articles.some(a=>a.id===id)).length
  const hiddenCount = deletedSet.size
  const srcResult = id => sourceResults.find(r => r.id === id)

  // ── Src avatar ─────────────────────────────────────────────────────────────
  const SrcAvatar = ({ src, size = 20 }) => {
    const hue = sourceHue(src.id)
    return (
      <div style={{ width:size, height:size, borderRadius:Math.floor(size*0.25), background:src.enabled?`hsl(${hue},60%,50%)`:'#D1D5DB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:Math.floor(size*0.45), fontWeight:800, color:'#fff', flexShrink:0, opacity:src.enabled?1:0.55 }}>
        {sourceInitial(src.name)}
      </div>
    )
  }

  // ── KB panel ───────────────────────────────────────────────────────────────
  const KBPanel = () => {
    const filtered = knowledgeBase.filter(item => {
      if (!kbSearch) return true
      const q = kbSearch.toLowerCase()
      return `${item.title} ${item.notes||''} ${item.excerpt||''} ${item.relatedAccount||''}`.toLowerCase().includes(q)
    })
    return (
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'12px 16px',borderBottom:'1px solid #F3F4F6',display:'flex',alignItems:'center',gap:8}}>
          <div style={{position:'relative',flex:1}}>
            <Search size={12} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'#9CA3AF',pointerEvents:'none'}}/>
            <input value={kbSearch} onChange={e=>setKbSearch(e.target.value)} placeholder='Search knowledge base…'
              style={{width:'100%',boxSizing:'border-box',paddingLeft:28,paddingRight:8,paddingTop:6,paddingBottom:6,border:'1px solid #E5E7EB',borderRadius:7,fontSize:12,outline:'none',background:'#F9FAFB'}}/>
          </div>
          <button onClick={()=>{setShowAddKb(true);setKbForm(BLANK_KB);setEditingKbId(null)}}
            style={{background:'#111827',color:'#fff',border:'none',borderRadius:7,padding:'6px 12px',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>
            + Add Entry
          </button>
        </div>
        {showAddKb && (
          <div style={{padding:'12px 16px',borderBottom:'1px solid #F3F4F6',background:'#F9FAFB'}}>
            <div style={{fontSize:12,fontWeight:700,color:'#374151',marginBottom:8}}>{editingKbId?'Edit Entry':'New Entry'}</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {[{key:'title',ph:'Title *'},{key:'sourceUrl',ph:'Source URL'},{key:'relatedAccount',ph:'Related Account'}].map(f=>(
                <input key={f.key} value={kbForm[f.key]} onChange={e=>setKbForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph}
                  style={{padding:'6px 9px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:12,outline:'none'}}/>
              ))}
              <select value={kbForm.category} onChange={e=>setKbForm(p=>({...p,category:e.target.value}))}
                style={{padding:'6px 9px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:12,background:'#fff',outline:'none'}}>
                {CAT_LIST.map(c=><option key={c}>{c}</option>)}
              </select>
              <textarea value={kbForm.excerpt} onChange={e=>setKbForm(p=>({...p,excerpt:e.target.value}))} placeholder='Content / excerpt…'
                rows={3} style={{padding:'6px 9px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:12,fontFamily:'inherit',resize:'vertical',outline:'none'}}/>
              <textarea value={kbForm.notes} onChange={e=>setKbForm(p=>({...p,notes:e.target.value}))} placeholder='Notes…'
                rows={2} style={{padding:'6px 9px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:12,fontFamily:'inherit',resize:'vertical',outline:'none'}}/>
            </div>
            <div style={{display:'flex',gap:6,marginTop:8}}>
              <button onClick={saveKb} disabled={!kbForm.title.trim()}
                style={{background:kbForm.title.trim()?'#2563EB':'#E5E7EB',color:kbForm.title.trim()?'#fff':'#9CA3AF',border:'none',borderRadius:6,padding:'7px 14px',fontSize:12,fontWeight:600,cursor:kbForm.title.trim()?'pointer':'not-allowed'}}>
                {editingKbId?'Save':'Add Entry'}
              </button>
              <button onClick={()=>{setShowAddKb(false);setKbForm(BLANK_KB);setEditingKbId(null)}}
                style={{background:'#F1F5F9',color:'#6B7280',border:'none',borderRadius:6,padding:'7px 12px',fontSize:12,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{padding:'0 16px',display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))',gap:12,paddingTop:14,paddingBottom:20}}>
          {filtered.length === 0 && !showAddKb
            ? <div style={{gridColumn:'1/-1',padding:'48px 20px',textAlign:'center'}}><BookOpen size={28} color='#E5E7EB' style={{marginBottom:10}}/><div style={{fontSize:13,color:'#9CA3AF'}}>No knowledge base entries yet.</div></div>
            : filtered.map(item => {
                const cc = CAT_COLORS[item.category] || '#6B7280'
                return (
                  <div key={item.id} style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:10,padding:'12px 14px',display:'flex',flexDirection:'column',gap:6}}>
                    <div style={{display:'flex',alignItems:'center',gap:5}}>
                      <span style={{fontSize:9,fontWeight:700,color:'#fff',background:cc,borderRadius:4,padding:'2px 6px',textTransform:'uppercase',flexShrink:0}}>{item.category||'Security'}</span>
                      {item.relatedAccount&&<span style={{fontSize:11,color:'#2563EB',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>📂 {item.relatedAccount}</span>}
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color:'#111827',lineHeight:1.35}}>{item.title}</div>
                    {item.notes&&<div style={{fontSize:11,color:'#6B7280',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{item.notes}</div>}
                    <div style={{display:'flex',gap:4,marginTop:4}}>
                      <button onClick={()=>{setKbForm({...item,tags:(item.tags||[]).join(', ')});setEditingKbId(item.id);setShowAddKb(true)}}
                        style={{background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:5,padding:'4px 7px',cursor:'pointer',color:'#6B7280',display:'flex',alignItems:'center'}}>
                        <Pencil size={12}/>
                      </button>
                      <button onClick={()=>deleteKb(item.id)}
                        style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:5,padding:'4px 7px',cursor:'pointer',color:'#DC2626',display:'flex',alignItems:'center'}}>
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  </div>
                )
              })
          }
        </div>
      </div>
    )
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden',background:'#F8FAFC'}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .mi-src-chip:hover .mi-src-actions{opacity:1!important}
      `}</style>

      {/* TOP BAR */}
      <div style={{background:'#FFFFFF',borderBottom:'1px solid #EEEFF2',padding:'0 16px',height:48,display:'flex',alignItems:'center',gap:10,flexShrink:0,boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
        <button onClick={onBack} style={{background:'transparent',border:'none',color:'#6B7280',cursor:'pointer',display:'flex',alignItems:'center',gap:5,padding:0,fontSize:13,fontWeight:500,whiteSpace:'nowrap'}}
          onMouseEnter={e=>e.currentTarget.style.color='#111827'} onMouseLeave={e=>e.currentTarget.style.color='#6B7280'}>
          <ArrowLeft size={15}/>Back
        </button>
        <div style={{width:1,height:18,background:'#E5E7EB'}}/>
        <Globe size={15} color='#007AFF'/>
        <span style={{fontSize:14,fontWeight:700,color:'#111827'}}>Market Intelligence</span>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
          <button onClick={()=>{setKbMode(v=>!v)}}
            style={{display:'flex',alignItems:'center',gap:5,background:kbMode?'#F3F4F6':'transparent',border:'1px solid #E5E7EB',borderRadius:7,padding:'5px 10px',fontSize:12,fontWeight:600,color:kbMode?'#374151':'#6B7280',cursor:'pointer'}}>
            <BookOpen size={13}/>{kbMode ? 'Feed' : 'Knowledge Base'}{!kbMode && knowledgeBase.length > 0 && <span style={{fontSize:10,color:'#9CA3AF',fontWeight:500}}>({knowledgeBase.length})</span>}
          </button>
          {!kbMode && (
            <>
              {fetching && <span style={{fontSize:12,color:'#9CA3AF',display:'flex',alignItems:'center',gap:5}}><span style={{display:'inline-block',width:12,height:12,border:'2px solid #E5E7EB',borderTopColor:'#007AFF',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>Fetching…</span>}
              <button onClick={()=>fetchArticles(sources)} disabled={fetching}
                style={{display:'flex',alignItems:'center',gap:6,background:fetching?'#F9FAFB':'#111827',color:fetching?'#9CA3AF':'#fff',border:'none',borderRadius:7,padding:'6px 12px',fontSize:12,fontWeight:600,cursor:fetching?'not-allowed':'pointer'}}>
                <RefreshCw size={12} style={{animation:fetching?'spin 0.7s linear infinite':'none'}}/>Refresh
              </button>
            </>
          )}
        </div>
      </div>

      {/* SOURCES BAR (collapsed or expanded) */}
      {!kbMode && (
        <div style={{background:'#FFFFFF',borderBottom:'1px solid #EEEFF2',flexShrink:0}}>
          {/* Always-visible compact bar */}
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 16px',minHeight:38}}>
            {!sourcesOpen && (
              <div style={{flex:1,display:'flex',gap:5,flexWrap:'wrap',alignItems:'center',overflow:'hidden'}}>
                {sources.length === 0
                  ? <span style={{fontSize:12,color:'#9CA3AF'}}>No sources configured — add one to get started.</span>
                  : <>
                      <span style={{fontSize:11,fontWeight:600,color:'#9CA3AF',flexShrink:0}}>Sources:</span>
                      {sources.map(s => (
                        <span key={s.id} style={{fontSize:11,color:s.enabled?'#374151':'#9CA3AF',background:s.enabled?'#F3F4F6':'#F9FAFB',borderRadius:4,padding:'2px 8px',fontWeight:s.enabled?500:400,opacity:s.enabled?1:0.65,whiteSpace:'nowrap'}}>
                          {s.name}
                        </span>
                      ))}
                      {sourceResults.some(r=>r.status==='error') && <AlertTriangle size={13} color='#EF4444' title='One or more sources have errors'/>}
                    </>
                }
              </div>
            )}
            {sourcesOpen && <div style={{flex:1}}/>}
            <button onClick={toggleSources}
              style={{display:'flex',alignItems:'center',gap:5,background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:7,padding:'5px 12px',fontSize:12,fontWeight:600,color:'#374151',cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}}>
              {sourcesOpen ? <><ChevronUp size={12}/>Hide Sources</> : <><ChevronDown size={12}/>Manage Sources</>}
            </button>
          </div>

          {/* Expanded management panel */}
          {sourcesOpen && (
            <div style={{padding:'0 16px 14px',borderTop:'1px solid #F3F4F6'}}>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,paddingTop:10,alignItems:'flex-start'}}>
                {sources.map(src => {
                  const res = srcResult(src.id)
                  return (
                    <div key={src.id} className='mi-src-chip'
                      style={{display:'flex',alignItems:'center',gap:6,background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:8,padding:'6px 10px',position:'relative'}}>
                      <SrcAvatar src={src} size={16}/>
                      <span style={{fontSize:12,color:src.enabled?'#374151':'#9CA3AF',fontWeight:500,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{src.name}</span>
                      {res?.status==='error' && <AlertTriangle size={11} color='#EF4444' title={res.error}/>}
                      {res?.status==='ok' && <span style={{fontSize:10,color:'#C4C9D4'}}>{res.count}</span>}
                      <div className='mi-src-actions' style={{display:'flex',gap:1,opacity:0,transition:'opacity 0.15s'}}>
                        <button onClick={()=>toggleSource(src.id)} title={src.enabled?'Disable':'Enable'}
                          style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',padding:'2px',display:'flex',alignItems:'center',borderRadius:3}}
                          onMouseEnter={e=>e.currentTarget.style.color='#374151'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
                          {src.enabled?<ToggleRight size={14} color='#007AFF'/>:<ToggleLeft size={14} color='#9CA3AF'/>}
                        </button>
                        <button onClick={()=>deleteSource(src.id)} title='Remove'
                          style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',padding:'2px',display:'flex',alignItems:'center',borderRadius:3}}
                          onMouseEnter={e=>e.currentTarget.style.color='#EF4444'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
                          <Trash2 size={11}/>
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* Add source */}
                {showAddForm ? (
                  <div style={{background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:8,padding:10,minWidth:260}}>
                    <div style={{fontSize:11,color:'#6B7280',marginBottom:6,lineHeight:1.4}}>Paste a website or RSS feed URL.</div>
                    <input value={addName} onChange={e=>setAddName(e.target.value)} placeholder='Name (optional)'
                      style={{width:'100%',boxSizing:'border-box',padding:'5px 8px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:12,outline:'none',marginBottom:5}}/>
                    <input value={addUrl} onChange={e=>setAddUrl(e.target.value)} placeholder='https://example.com'
                      style={{width:'100%',boxSizing:'border-box',padding:'5px 8px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:12,outline:'none',marginBottom:6}}
                      onKeyDown={e=>e.key==='Enter'&&discoverAndAdd()}/>
                    <div style={{display:'flex',gap:5}}>
                      <button onClick={discoverAndAdd} disabled={discovering||!addUrl.trim()}
                        style={{flex:1,background:discovering||!addUrl.trim()?'#E5E7EB':'#111827',color:discovering||!addUrl.trim()?'#9CA3AF':'#fff',border:'none',borderRadius:6,padding:'6px 0',fontSize:12,fontWeight:600,cursor:discovering||!addUrl.trim()?'not-allowed':'pointer'}}>
                        {discovering?'Finding…':'Add'}
                      </button>
                      <button onClick={()=>{setShowAddForm(false);setAddError('');setAddUrl('');setAddName('')}}
                        style={{background:'#F1F5F9',color:'#6B7280',border:'none',borderRadius:6,padding:'6px 9px',fontSize:12,cursor:'pointer'}}>✕</button>
                    </div>
                    {addError   && <div style={{marginTop:6,fontSize:11,color:'#DC2626',background:'#FEF2F2',borderRadius:5,padding:'4px 8px'}}>{addError}</div>}
                    {addSuccess && <div style={{marginTop:6,fontSize:11,color:'#15803D',background:'#DCFCE7',borderRadius:5,padding:'4px 8px',display:'flex',alignItems:'center',gap:4}}><CheckCircle size={11}/>{addSuccess}</div>}
                  </div>
                ) : (
                  <button onClick={()=>setShowAddForm(true)}
                    style={{display:'flex',alignItems:'center',gap:5,background:'transparent',border:'1px dashed #D1D5DB',borderRadius:8,padding:'6px 12px',color:'#9CA3AF',fontSize:12,fontWeight:600,cursor:'pointer',alignSelf:'center'}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='#9CA3AF';e.currentTarget.style.color='#374151'}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='#D1D5DB';e.currentTarget.style.color='#9CA3AF'}}>
                    <Plus size={13}/>Add Source
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONTENT AREA */}
      {kbMode ? (
        <KBPanel/>
      ) : (
        <div style={{flex:1,overflowY:'auto',padding:'14px 16px 24px'}}>
          {/* NAV FILTERS + SEARCH */}
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',marginBottom:14}}>
            {[
              {id:'all',    label:`All Articles`},
              {id:'pinned', label:`Pinned${pinnedCount>0?` (${pinnedCount})`:''}`},
              ...(hiddenCount>0 ? [{id:'hidden',label:`Hidden (${hiddenCount})`}] : []),
            ].map(({id,label}) => (
              <button key={id} onClick={()=>setSelectedNav(id)}
                style={{padding:'4px 12px',borderRadius:16,border:'1px solid',fontSize:12,fontWeight:600,cursor:'pointer',background:selectedNav===id?'#007AFF':'#FFFFFF',color:selectedNav===id?'#fff':'#374151',borderColor:selectedNav===id?'#007AFF':'#E5E7EB',whiteSpace:'nowrap'}}>
                {label}
              </button>
            ))}
            {sources.filter(s=>s.enabled).length > 1 && sources.filter(s=>s.enabled).map(src => (
              <button key={src.id} onClick={()=>setSelectedNav(src.id)}
                style={{padding:'4px 12px',borderRadius:16,border:'1px solid',fontSize:12,fontWeight:500,cursor:'pointer',background:selectedNav===src.id?'#007AFF':'#FFFFFF',color:selectedNav===src.id?'#fff':'#374151',borderColor:selectedNav===src.id?'#007AFF':'#E5E7EB',whiteSpace:'nowrap'}}>
                {src.name}
              </button>
            ))}
            <div style={{flex:1,minWidth:160,position:'relative'}}>
              <Search size={12} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'#9CA3AF',pointerEvents:'none'}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search articles…'
                style={{width:'100%',boxSizing:'border-box',paddingLeft:27,paddingRight:search?28:8,paddingTop:6,paddingBottom:6,border:'1px solid #E5E7EB',borderRadius:20,fontSize:12,outline:'none',background:'#FFFFFF'}}/>
              {search && <button onClick={()=>setSearch('')} style={{position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',padding:0,display:'flex'}}><X size={12}/></button>}
            </div>
          </div>

          {/* ARTICLE TILES */}
          {!fetchedOnce && fetching ? (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:60,gap:10}}>
              <div style={{width:24,height:24,border:'3px solid #E5E7EB',borderTopColor:'#007AFF',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
              <span style={{fontSize:13,color:'#9CA3AF'}}>Loading feeds…</span>
            </div>
          ) : sortedArticles.length === 0 ? (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:60,gap:8,textAlign:'center'}}>
              <Globe size={32} color='#E5E7EB'/>
              <div style={{fontSize:13,color:'#9CA3AF'}}>
                {sources.length===0?'Add a source to get started.':search?'No matching articles.':selectedNav==='pinned'?'No pinned articles yet.':'No articles found. Click Refresh.'}
              </div>
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))',gap:14}}>
              {sortedArticles.map(article => {
                const isPinned = pinnedSet.has(article.id)
                const isHidden = deletedSet.has(article.id)
                const hue = sourceHue(article.sourceId || article.id)
                return (
                  <div key={article.id}
                    style={{background:'#FFFFFF',borderRadius:10,border:`1px solid ${isPinned?'#FDE68A':'#E5E7EB'}`,padding:'14px 16px',display:'flex',flexDirection:'column',gap:8,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',transition:'box-shadow 0.15s'}}
                    onMouseEnter={e=>e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'}
                    onMouseLeave={e=>e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'}>
                    {/* Source + date */}
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{width:18,height:18,borderRadius:4,background:`hsl(${hue},60%,50%)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800,color:'#fff',flexShrink:0}}>
                        {sourceInitial(article.sourceName)}
                      </div>
                      <span style={{fontSize:11,color:'#9CA3AF',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{article.sourceName}</span>
                      {isPinned && <Star size={11} fill='#FBBF24' color='#FBBF24' style={{flexShrink:0}}/>}
                      <span style={{fontSize:11,color:'#D1D5DB',flexShrink:0,whiteSpace:'nowrap'}}>{fmtPub(article.publishedAt)}</span>
                    </div>
                    {/* Title */}
                    <div style={{fontSize:14,fontWeight:700,color:'#111827',lineHeight:1.4,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
                      {article.title}
                    </div>
                    {/* Description */}
                    {article.description && (
                      <div style={{fontSize:12,color:'#6B7280',lineHeight:1.55,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden',flex:1}}>
                        {article.description}
                      </div>
                    )}
                    {/* Actions */}
                    <div style={{display:'flex',alignItems:'center',gap:6,paddingTop:8,borderTop:'1px solid #F3F4F6',marginTop:'auto'}}>
                      <a href={article.link} target='_blank' rel='noopener noreferrer'
                        style={{display:'flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,color:'#007AFF',background:'#EBF4FF',borderRadius:6,padding:'4px 10px',textDecoration:'none',flexShrink:0}}
                        onMouseEnter={e=>e.currentTarget.style.background='#DBEAFE'}
                        onMouseLeave={e=>e.currentTarget.style.background='#EBF4FF'}>
                        <ExternalLink size={11}/>Open Original
                      </a>
                      <button onClick={()=>pinArticle(article.id)} title={isPinned?'Unpin':'Pin'}
                        style={{background:'transparent',border:'none',padding:'3px',cursor:'pointer',color:isPinned?'#FBBF24':'#D1D5DB',display:'flex',alignItems:'center',borderRadius:4,marginLeft:'auto'}}
                        onMouseEnter={e=>e.currentTarget.style.color='#FBBF24'}
                        onMouseLeave={e=>e.currentTarget.style.color=isPinned?'#FBBF24':'#D1D5DB'}>
                        <Star size={14} fill={isPinned?'#FBBF24':'none'}/>
                      </button>
                      {isHidden ? (
                        <button onClick={()=>unhideArticle(article.id)}
                          style={{background:'transparent',border:'none',padding:'3px 5px',cursor:'pointer',color:'#9CA3AF',fontSize:11,borderRadius:4}}>
                          Unhide
                        </button>
                      ) : (
                        <button onClick={()=>hideArticle(article.id)} title='Hide'
                          style={{background:'transparent',border:'none',padding:'3px',cursor:'pointer',color:'#D1D5DB',display:'flex',alignItems:'center',borderRadius:4}}
                          onMouseEnter={e=>e.currentTarget.style.color='#EF4444'}
                          onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>
                          <Trash2 size={13}/>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Source error notices */}
          {fetchedOnce && sourceResults.some(r=>r.status==='error') && (
            <div style={{marginTop:16,padding:'8px 12px',background:'#FEF2F2',borderRadius:8,border:'1px solid #FECACA'}}>
              {sourceResults.filter(r=>r.status==='error').map(r=>(
                <div key={r.id||r.name} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#DC2626',marginBottom:3}}>
                  <AlertTriangle size={11}/><strong>{r.name}:</strong> {r.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
