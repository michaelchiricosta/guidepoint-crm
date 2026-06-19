import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, Globe, RefreshCw, Plus, Trash2, Star, ExternalLink, AlertTriangle, CheckCircle, X, Search, BookOpen, Pencil, ToggleLeft, ToggleRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
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

const LEFT_W_OPEN = 220
const LEFT_W_ICON = 52
const MID_W       = 340

// ── Tiny helpers ──────────────────────────────────────────────────────────────
const timeSince = iso => {
  if (!iso) return ''
  try {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 2) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  } catch { return '' }
}

const fmtPub = iso => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '' }
}

const sourceInitial = name => (name || '?').charAt(0).toUpperCase()
const sourceHue = id => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff; return Math.abs(h) % 360 }

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MarketIntelligence({ data, setData, onBack }) {
  // feed (session only)
  const [articles, setArticles]           = useState([])
  const [fetching, setFetching]           = useState(false)
  const [fetchedOnce, setFetchedOnce]     = useState(false)
  const [sourceResults, setSourceResults] = useState([])

  // left panel
  const [leftCollapsed, setLeftCollapsed] = useState(() => {
    try { return localStorage.getItem(LS_COLLAPSED) === 'true' } catch { return false }
  })
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  // nav
  const [selectedNav, setSelectedNav]     = useState('all')
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [search, setSearch]               = useState('')

  // add source
  const [showAddForm, setShowAddForm]     = useState(false)
  const [addUrl, setAddUrl]               = useState('')
  const [addName, setAddName]             = useState('')
  const [discovering, setDiscovering]     = useState(false)
  const [addError, setAddError]           = useState('')
  const [addSuccess, setAddSuccess]       = useState('')

  // reader
  const [articleContent, setArticleContent] = useState(null)  // {html,text,byline,siteName,publishedAt,fallback} | 'loading' | 'error'
  const articleCache = useRef({})  // url → parsed content (session cache)

  // KB
  const [kbMode, setKbMode]               = useState(false)
  const [showAddKb, setShowAddKb]         = useState(false)
  const [kbForm, setKbForm]               = useState(BLANK_KB)
  const [editingKbId, setEditingKbId]     = useState(null)
  const [kbSearch, setKbSearch]           = useState('')

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 900)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth <= 900)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // Persist collapsed state
  const toggleLeftCollapsed = () => {
    setLeftCollapsed(v => {
      const next = !v
      try { localStorage.setItem(LS_COLLAPSED, String(next)) } catch {}
      return next
    })
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const sources      = data.blogSources       || []
  const pinnedSet    = new Set(data.marketIntelPinned  || [])
  const deletedSet   = new Set(data.marketIntelDeleted || [])
  const knowledgeBase = data.knowledgeBase    || []

  // ── Seed / migrate ─────────────────────────────────────────────────────────
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

  // ── Fetch full article ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedArticle) { setArticleContent(null); return }
    const url = selectedArticle.link
    if (!url) { setArticleContent('error'); return }
    if (articleCache.current[url]) { setArticleContent(articleCache.current[url]); return }
    setArticleContent('loading')
    let cancelled = false
    fetch(`/api/article?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        if (j.error) {
          setArticleContent('error')
        } else {
          articleCache.current[url] = j
          setArticleContent(j)
        }
      })
      .catch(() => { if (!cancelled) setArticleContent('error') })
    return () => { cancelled = true }
  }, [selectedArticle])

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

  // ── Article actions ────────────────────────────────────────────────────────
  const pinArticle  = id => setData(prev => { const s = new Set(prev.marketIntelPinned||[]); s.has(id)?s.delete(id):s.add(id); return {...prev,marketIntelPinned:[...s]} })
  const hideArticle = id => { setData(prev => ({...prev,marketIntelDeleted:[...new Set([...(prev.marketIntelDeleted||[]),id])]})); if(selectedArticle?.id===id){setSelectedArticle(null)} }
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

  // ── Filtered list ──────────────────────────────────────────────────────────
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

  // ── Left panel width (desktop) ─────────────────────────────────────────────
  const leftW = isMobile ? 0 : leftCollapsed ? LEFT_W_ICON : LEFT_W_OPEN

  // ── Source avatar ──────────────────────────────────────────────────────────
  const SrcAvatar = ({ src, size = 20, style = {} }) => {
    const hue = sourceHue(src.id)
    return (
      <div style={{ width:size, height:size, borderRadius:Math.floor(size*0.25), background:src.enabled?`hsl(${hue},60%,50%)`:'#D1D5DB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:Math.floor(size*0.45), fontWeight:800, color:'#fff', flexShrink:0, opacity:src.enabled?1:0.55, ...style }}>
        {sourceInitial(src.name)}
      </div>
    )
  }

  // ── Collapsed icon-rail nav item ───────────────────────────────────────────
  const IconNavItem = ({ id, title, icon, active }) => (
    <button title={title} onClick={()=>{setSelectedNav(id);setKbMode(false);setSelectedArticle(null)}}
      style={{display:'flex',alignItems:'center',justifyContent:'center',width:36,height:36,borderRadius:8,background:active?'#EBF4FF':'transparent',border:'none',cursor:'pointer',color:active?'#007AFF':'#9CA3AF',margin:'2px auto'}}
      onMouseEnter={e=>{if(!active)e.currentTarget.style.background='#F3F4F6'}} onMouseLeave={e=>{if(!active)e.currentTarget.style.background='transparent'}}>
      {icon}
    </button>
  )

  // ── Left panel (expanded) ──────────────────────────────────────────────────
  const ExpandedLeft = () => (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      <div style={{padding:'12px 10px 8px',borderBottom:'1px solid #F3F4F6',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontSize:11,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.07em'}}>Sources</span>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <button onClick={()=>fetchArticles(sources)} disabled={fetching} title='Refresh'
            style={{background:'none',border:'none',cursor:fetching?'not-allowed':'pointer',color:'#9CA3AF',padding:'3px',display:'flex',borderRadius:5}}
            onMouseEnter={e=>e.currentTarget.style.color='#374151'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
            <RefreshCw size={13} style={{animation:fetching?'spin 0.7s linear infinite':'none'}}/>
          </button>
          {!isMobile && (
            <button onClick={toggleLeftCollapsed} title='Collapse sidebar'
              style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',padding:'3px',display:'flex',borderRadius:5}}
              onMouseEnter={e=>e.currentTarget.style.color='#374151'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
              <PanelLeftClose size={14}/>
            </button>
          )}
          {isMobile && (
            <button onClick={()=>setMobileDrawerOpen(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',padding:'3px',display:'flex',borderRadius:5}}>
              <X size={14}/>
            </button>
          )}
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'6px 8px 0'}}>
        {/* nav filters */}
        {[
          {id:'all',    label:'All Articles',   icon:<Globe size={14}/>,   count:articles.filter(a=>!deletedSet.has(a.id)).length},
          {id:'pinned', label:'Pinned',          icon:<Star size={14}/>,    count:pinnedCount},
          ...(hiddenCount>0?[{id:'hidden',label:'Hidden',icon:<Trash2 size={14}/>,count:hiddenCount}]:[]),
        ].map(({id,label,icon,count})=>{
          const active = selectedNav===id && !kbMode
          return (
            <button key={id} onClick={()=>{setSelectedNav(id);setKbMode(false);setSelectedArticle(null);if(isMobile)setMobileDrawerOpen(false)}}
              style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'6px 10px',border:'none',background:active?'#EBF4FF':'transparent',color:active?'#007AFF':'#374151',borderRadius:7,fontSize:13,fontWeight:active?700:400,cursor:'pointer',textAlign:'left',marginBottom:1}}
              onMouseEnter={e=>{if(!active)e.currentTarget.style.background='#F9FAFB'}} onMouseLeave={e=>{if(!active)e.currentTarget.style.background='transparent'}}>
              <span style={{color:active?'#007AFF':'#9CA3AF',flexShrink:0}}>{icon}</span>
              <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label}</span>
              {count>0&&<span style={{fontSize:11,color:active?'#007AFF':'#9CA3AF',fontWeight:600,flexShrink:0}}>{count}</span>}
            </button>
          )
        })}
        <div style={{height:1,background:'#F3F4F6',margin:'6px 2px 8px'}}/>
        <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.07em',padding:'0 2px 5px'}}>Feeds</div>

        {/* source rows */}
        {sources.map(src=>{
          const active = selectedNav===src.id && !kbMode
          const res = srcResult(src.id)
          return (
            <div key={src.id} className='mi-src-row'
              style={{display:'flex',alignItems:'center',gap:7,padding:'5px 8px',borderRadius:7,background:active?'#EBF4FF':'transparent',cursor:'pointer',marginBottom:1,position:'relative'}}
              onClick={()=>{setSelectedNav(src.id);setKbMode(false);setSelectedArticle(null);if(isMobile)setMobileDrawerOpen(false)}}
              onMouseEnter={e=>{ if(!active)e.currentTarget.style.background='#F9FAFB' }}
              onMouseLeave={e=>{ if(!active)e.currentTarget.style.background=active?'#EBF4FF':'transparent' }}>
              <SrcAvatar src={src} size={20}/>
              <span style={{flex:1,fontSize:13,fontWeight:active?700:400,color:active?'#007AFF':src.enabled?'#374151':'#9CA3AF',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {src.name}
              </span>
              {res?.status==='error' && <span title={res.error} style={{color:'#EF4444',flexShrink:0,cursor:'help'}}><AlertTriangle size={11}/></span>}
              {res?.status==='ok'    && <span style={{fontSize:10,color:'#C4C9D4',flexShrink:0}}>{res.count}</span>}
              <div onClick={e=>e.stopPropagation()} className='mi-src-actions' style={{display:'flex',gap:1,flexShrink:0,opacity:0,transition:'opacity 0.15s',position:'absolute',right:6,background:active?'#EBF4FF':'#F9FAFB',borderRadius:5,padding:'1px'}}>
                <button onClick={()=>toggleSource(src.id)} title={src.enabled?'Disable':'Enable'}
                  style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',padding:'2px',display:'flex',alignItems:'center',borderRadius:3}}
                  onMouseEnter={e=>e.currentTarget.style.color='#374151'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
                  {src.enabled?<ToggleRight size={13}/>:<ToggleLeft size={13}/>}
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

        {/* add source */}
        {showAddForm ? (
          <div style={{padding:'10px',background:'#F9FAFB',borderRadius:8,border:'1px solid #E5E7EB',marginTop:6}}>
            <div style={{fontSize:11,color:'#6B7280',marginBottom:7,lineHeight:1.4}}>Paste a website or RSS feed URL.</div>
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
            style={{display:'flex',alignItems:'center',gap:6,width:'100%',padding:'6px 8px',background:'transparent',border:'1px dashed #D1D5DB',borderRadius:7,color:'#9CA3AF',fontSize:12,fontWeight:600,cursor:'pointer',marginTop:6,marginBottom:4}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='#9CA3AF';e.currentTarget.style.color='#374151'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='#D1D5DB';e.currentTarget.style.color='#9CA3AF'}}>
            <Plus size={13}/>Add Source
          </button>
        )}

        <div style={{height:1,background:'#F3F4F6',margin:'6px 2px 4px'}}/>
        {/* KB */}
        <button onClick={()=>{setKbMode(true);setSelectedArticle(null);if(isMobile)setMobileDrawerOpen(false)}}
          style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'6px 10px',border:'none',background:kbMode?'#EBF4FF':'transparent',color:kbMode?'#007AFF':'#374151',borderRadius:7,fontSize:13,fontWeight:kbMode?700:400,cursor:'pointer',marginBottom:6}}
          onMouseEnter={e=>{if(!kbMode)e.currentTarget.style.background='#F9FAFB'}} onMouseLeave={e=>{if(!kbMode)e.currentTarget.style.background='transparent'}}>
          <BookOpen size={14} color={kbMode?'#007AFF':'#9CA3AF'}/>
          <span style={{flex:1,textAlign:'left'}}>Knowledge Base</span>
          <span style={{fontSize:11,color:'#9CA3AF'}}>{knowledgeBase.length}</span>
        </button>
      </div>
    </div>
  )

  // ── Collapsed icon rail ────────────────────────────────────────────────────
  const CollapsedLeft = () => (
    <div style={{display:'flex',flexDirection:'column',height:'100%',alignItems:'center',padding:'10px 0',gap:2}}>
      <button onClick={toggleLeftCollapsed} title='Expand sidebar'
        style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',padding:'7px',display:'flex',borderRadius:7,marginBottom:4}}
        onMouseEnter={e=>e.currentTarget.style.color='#374151'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
        <PanelLeftOpen size={15}/>
      </button>
      <div style={{width:32,height:1,background:'#F3F4F6',margin:'2px 0 4px'}}/>
      <IconNavItem id='all'    title='All Articles' icon={<Globe size={15}/>}    active={selectedNav==='all'&&!kbMode}/>
      <IconNavItem id='pinned' title='Pinned'       icon={<Star size={15}/>}     active={selectedNav==='pinned'&&!kbMode}/>
      {hiddenCount>0&&<IconNavItem id='hidden' title='Hidden' icon={<Trash2 size={15}/>} active={selectedNav==='hidden'&&!kbMode}/>}
      <div style={{width:32,height:1,background:'#F3F4F6',margin:'4px 0'}}/>
      {sources.map(src=>{
        const active = selectedNav===src.id && !kbMode
        const res = srcResult(src.id)
        return (
          <div key={src.id} style={{position:'relative'}} title={src.name}>
            <button onClick={()=>{setSelectedNav(src.id);setKbMode(false);setSelectedArticle(null)}}
              style={{background:active?'#EBF4FF':'transparent',border:'none',cursor:'pointer',padding:'6px',borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center'}}
              onMouseEnter={e=>{if(!active)e.currentTarget.style.background='#F3F4F6'}} onMouseLeave={e=>{if(!active)e.currentTarget.style.background=active?'#EBF4FF':'transparent'}}>
              <SrcAvatar src={src} size={24}/>
            </button>
            {res?.status==='error' && <div style={{position:'absolute',top:2,right:2,width:7,height:7,borderRadius:'50%',background:'#EF4444',border:'1px solid #fff'}}/>}
          </div>
        )
      })}
      <div style={{marginTop:'auto',paddingBottom:4}}>
        <button onClick={()=>{setKbMode(true);setSelectedArticle(null)}} title='Knowledge Base'
          style={{background:kbMode?'#EBF4FF':'transparent',border:'none',cursor:'pointer',color:kbMode?'#007AFF':'#9CA3AF',padding:'7px',display:'flex',borderRadius:7}}
          onMouseEnter={e=>{if(!kbMode)e.currentTarget.style.color='#374151'}} onMouseLeave={e=>{if(!kbMode)e.currentTarget.style.color='#9CA3AF'}}>
          <BookOpen size={15}/>
        </button>
        <button onClick={()=>fetchArticles(sources)} disabled={fetching} title='Refresh feeds'
          style={{background:'none',border:'none',cursor:fetching?'not-allowed':'pointer',color:'#9CA3AF',padding:'7px',display:'flex',borderRadius:7}}
          onMouseEnter={e=>e.currentTarget.style.color='#374151'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
          <RefreshCw size={14} style={{animation:fetching?'spin 0.7s linear infinite':'none'}}/>
        </button>
      </div>
    </div>
  )

  // ── Article card ───────────────────────────────────────────────────────────
  const ArticleCard = ({ article }) => {
    const isPinned = pinnedSet.has(article.id)
    const isActive = selectedArticle?.id === article.id
    const hue = sourceHue(article.sourceId || article.id)
    return (
      <div onClick={()=>setSelectedArticle(article)}
        style={{padding:'12px 14px',borderBottom:'1px solid #F3F4F6',cursor:'pointer',background:isActive?'#EBF4FF':'#fff',transition:'background 0.1s'}}
        onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background='#F9FAFB'}}
        onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background=isActive?'#EBF4FF':'#fff'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
          <div style={{width:18,height:18,borderRadius:4,background:`hsl(${hue},60%,50%)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800,color:'#fff',flexShrink:0}}>{sourceInitial(article.sourceName)}</div>
          <span style={{fontSize:11,color:'#9CA3AF',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{article.sourceName}</span>
          {isPinned && <Star size={10} fill='#FBBF24' color='#FBBF24' style={{flexShrink:0}}/>}
          <span style={{fontSize:11,color:'#D1D5DB',flexShrink:0}}>{timeSince(article.publishedAt)}</span>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:'#111827',lineHeight:1.4,marginBottom:4,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{article.title}</div>
        {article.description && <div style={{fontSize:12,color:'#6B7280',lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{article.description}</div>}
        <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:4,marginTop:8}}>
          <button onClick={()=>pinArticle(article.id)} title={isPinned?'Unpin':'Pin'}
            style={{background:'transparent',border:'none',padding:'3px',cursor:'pointer',color:isPinned?'#FBBF24':'#D1D5DB',display:'flex',alignItems:'center',borderRadius:4}}
            onMouseEnter={e=>e.currentTarget.style.color='#FBBF24'} onMouseLeave={e=>e.currentTarget.style.color=isPinned?'#FBBF24':'#D1D5DB'}>
            <Star size={13} fill={isPinned?'#FBBF24':'none'}/>
          </button>
          {deletedSet.has(article.id)
            ? <button onClick={()=>unhideArticle(article.id)} style={{background:'transparent',border:'none',padding:'3px 5px',cursor:'pointer',color:'#9CA3AF',fontSize:11,borderRadius:4}}>Unhide</button>
            : <button onClick={()=>hideArticle(article.id)} style={{background:'transparent',border:'none',padding:'3px',cursor:'pointer',color:'#D1D5DB',display:'flex',alignItems:'center',borderRadius:4}}
                onMouseEnter={e=>e.currentTarget.style.color='#EF4444'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>
                <Trash2 size={13}/>
              </button>
          }
        </div>
      </div>
    )
  }

  // ── Reader panel ───────────────────────────────────────────────────────────
  const ReaderPanel = () => {
    if (!selectedArticle) return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:12,padding:40,color:'#9CA3AF'}}>
        <Globe size={36} color='#E5E7EB'/>
        <div style={{fontSize:14,textAlign:'center',lineHeight:1.6}}>Select an article to read it here.</div>
      </div>
    )
    const a = selectedArticle
    const isPinned = pinnedSet.has(a.id)
    const isHidden = deletedSet.has(a.id)
    const hue = sourceHue(a.sourceId || a.id)
    const content = articleContent  // 'loading' | 'error' | null | {…}

    // Determine what to show as the body
    const isLoading  = content === 'loading'
    const hasFull    = content && content !== 'loading' && content !== 'error' && (content.contentHtml || content.textContent)
    const hasFallback = content && content !== 'loading' && content !== 'error'
    const hasError   = content === 'error'

    return (
      <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
        {/* header */}
        <div style={{padding:'18px 24px 14px',borderBottom:'1px solid #F3F4F6',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap'}}>
            <div style={{width:22,height:22,borderRadius:5,background:`hsl(${hue},60%,50%)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#fff',flexShrink:0}}>{sourceInitial(a.sourceName)}</div>
            <span style={{fontSize:12,fontWeight:600,color:'#6B7280'}}>{content?.siteName || a.sourceName}</span>
            <span style={{fontSize:12,color:'#D1D5DB'}}>·</span>
            <span style={{fontSize:12,color:'#9CA3AF'}}>{fmtPub(content?.publishedAt || a.publishedAt)}</span>
            {content?.byline && <><span style={{fontSize:12,color:'#D1D5DB'}}>·</span><span style={{fontSize:12,color:'#9CA3AF'}}>By {content.byline}</span></>}
            <div style={{marginLeft:'auto',display:'flex',gap:6,flexShrink:0}}>
              <button onClick={()=>pinArticle(a.id)}
                style={{background:isPinned?'#FEF3C7':'#F9FAFB',border:`1px solid ${isPinned?'#FDE68A':'#E5E7EB'}`,borderRadius:6,padding:'5px 8px',cursor:'pointer',color:isPinned?'#D97706':'#9CA3AF',display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600}}>
                <Star size={12} fill={isPinned?'#FBBF24':'none'} color={isPinned?'#FBBF24':'currentColor'}/>{isPinned?'Pinned':'Pin'}
              </button>
              {isHidden
                ? <button onClick={()=>unhideArticle(a.id)} style={{background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'#6B7280',fontSize:11,fontWeight:600}}>Unhide</button>
                : <button onClick={()=>hideArticle(a.id)} style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'#DC2626',display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600}}>
                    <Trash2 size={12}/>Hide
                  </button>
              }
            </div>
          </div>
          <h2 style={{fontSize:20,fontWeight:800,color:'#111827',lineHeight:1.35,margin:'0 0 14px'}}>{content?.title || a.title}</h2>
          <a href={a.link} target='_blank' rel='noopener noreferrer'
            style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12,fontWeight:600,color:'#007AFF',textDecoration:'none',background:'#EBF4FF',borderRadius:7,padding:'6px 12px'}}
            onMouseEnter={e=>e.currentTarget.style.background='#DBEAFE'} onMouseLeave={e=>e.currentTarget.style.background='#EBF4FF'}>
            <ExternalLink size={12}/>Open Original
          </a>
        </div>

        {/* body */}
        <div style={{flex:1,overflowY:'auto',padding:'20px 24px'}}>
          {isLoading && (
            <div style={{display:'flex',alignItems:'center',gap:10,color:'#9CA3AF',fontSize:13}}>
              <span style={{display:'inline-block',width:16,height:16,border:'2px solid #E5E7EB',borderTopColor:'#007AFF',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
              Loading full article…
            </div>
          )}

          {hasError && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:'#9CA3AF',fontStyle:'italic',marginBottom:12}}>Full article unavailable. <a href={a.link} target='_blank' rel='noopener noreferrer' style={{color:'#007AFF'}}>Open original ↗</a></div>
              {a.description && <p style={{fontSize:15,color:'#374151',lineHeight:1.75,margin:0}}>{a.description}</p>}
            </div>
          )}

          {hasFull && !isLoading && (
            <>
              {content.fallback && (
                <div style={{marginBottom:14,fontSize:12,color:'#9CA3AF',fontStyle:'italic'}}>Showing extracted content. <a href={a.link} target='_blank' rel='noopener noreferrer' style={{color:'#007AFF'}}>Open original ↗</a></div>
              )}
              {content.excerpt && !content.contentHtml && !content.textContent && (
                <p style={{fontSize:15,color:'#374151',lineHeight:1.75,margin:'0 0 16px'}}>{content.excerpt}</p>
              )}
              {/* Render safe HTML if available, else paragraph text */}
              {content.contentHtml ? (
                <div className='mi-article-body' dangerouslySetInnerHTML={{__html: content.contentHtml}}/>
              ) : content.textContent ? (
                <div>
                  {content.textContent.split('\n\n').filter(p=>p.trim().length>20).slice(0,40).map((p,i)=>(
                    <p key={i} style={{fontSize:15,color:'#374151',lineHeight:1.75,margin:'0 0 14px'}}>{p.trim()}</p>
                  ))}
                </div>
              ) : null}
            </>
          )}

          {!isLoading && !content && a.description && (
            <p style={{fontSize:15,color:'#374151',lineHeight:1.75,margin:0}}>{a.description}</p>
          )}
        </div>
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
        <div style={{padding:'12px 14px',borderBottom:'1px solid #F3F4F6',display:'flex',alignItems:'center',gap:8}}>
          <div style={{position:'relative',flex:1}}>
            <Search size={12} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'#9CA3AF',pointerEvents:'none'}}/>
            <input value={kbSearch} onChange={e=>setKbSearch(e.target.value)} placeholder='Search…'
              style={{width:'100%',boxSizing:'border-box',paddingLeft:28,paddingRight:8,paddingTop:6,paddingBottom:6,border:'1px solid #E5E7EB',borderRadius:7,fontSize:12,outline:'none',background:'#F9FAFB'}}/>
          </div>
          <button onClick={()=>{setShowAddKb(true);setKbForm(BLANK_KB);setEditingKbId(null)}}
            style={{background:'#111827',color:'#fff',border:'none',borderRadius:7,padding:'6px 10px',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>
            + Add
          </button>
        </div>
        {showAddKb && (
          <div style={{padding:'12px 14px',borderBottom:'1px solid #F3F4F6',background:'#F9FAFB'}}>
            <div style={{fontSize:12,fontWeight:700,color:'#374151',marginBottom:8}}>{editingKbId?'Edit Entry':'New Entry'}</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {[
                {key:'title',ph:'Title *',type:'input'},
                {key:'sourceUrl',ph:'Source URL',type:'input'},
                {key:'relatedAccount',ph:'Related Account',type:'input'},
              ].map(f=>(
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
        {filtered.length===0&&!showAddKb
          ? <div style={{padding:'48px 20px',textAlign:'center'}}><BookOpen size={28} color='#E5E7EB' style={{marginBottom:10}}/><div style={{fontSize:13,color:'#9CA3AF'}}>No knowledge base entries yet.</div></div>
          : filtered.map(item=>{
              const cc=CAT_COLORS[item.category]||'#6B7280'
              return (
                <div key={item.id} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 14px',borderBottom:'1px solid #F3F4F6'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:4}}>
                      <span style={{fontSize:9,fontWeight:700,color:'#fff',background:cc,borderRadius:4,padding:'2px 6px',textTransform:'uppercase',flexShrink:0}}>{item.category||'Security'}</span>
                      {item.relatedAccount&&<span style={{fontSize:11,color:'#2563EB',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>📂 {item.relatedAccount}</span>}
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color:'#111827',lineHeight:1.35}}>{item.title}</div>
                    {item.notes&&<div style={{fontSize:11,color:'#6B7280',marginTop:2,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:1,WebkitBoxOrient:'vertical'}}>{item.notes}</div>}
                  </div>
                  <div style={{display:'flex',gap:4,flexShrink:0}}>
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
    )
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden',background:'#F8FAFC'}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .mi-src-row:hover .mi-src-actions{opacity:1!important}
        .mi-article-body{font-size:15px;color:#374151;line-height:1.75}
        .mi-article-body p{margin:0 0 14px}
        .mi-article-body h1,.mi-article-body h2,.mi-article-body h3,.mi-article-body h4{color:#111827;margin:20px 0 8px;line-height:1.3}
        .mi-article-body h1{font-size:22px}.mi-article-body h2{font-size:18px}.mi-article-body h3{font-size:16px}
        .mi-article-body a{color:#007AFF;text-decoration:none}
        .mi-article-body a:hover{text-decoration:underline}
        .mi-article-body img{max-width:100%;height:auto;border-radius:8px;margin:8px 0}
        .mi-article-body ul,.mi-article-body ol{padding-left:20px;margin:0 0 14px}
        .mi-article-body li{margin-bottom:4px}
        .mi-article-body blockquote{border-left:3px solid #E5E7EB;margin:0 0 14px;padding:4px 14px;color:#6B7280;font-style:italic}
        .mi-article-body figure,.mi-article-body figcaption{max-width:100%}
        .mi-article-body figcaption{font-size:12px;color:#9CA3AF;margin-top:4px}
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
        {isMobile && (
          <button onClick={()=>setMobileDrawerOpen(v=>!v)}
            style={{marginLeft:'auto',background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:7,padding:'5px 10px',fontSize:12,fontWeight:600,color:'#374151',cursor:'pointer'}}>
            {mobileDrawerOpen?'✕ Sources':'☰ Sources'}
          </button>
        )}
        {!isMobile && (
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
            {fetching && <span style={{fontSize:12,color:'#9CA3AF',display:'flex',alignItems:'center',gap:5}}><span style={{display:'inline-block',width:12,height:12,border:'2px solid #E5E7EB',borderTopColor:'#007AFF',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>Fetching…</span>}
            <button onClick={()=>fetchArticles(sources)} disabled={fetching}
              style={{display:'flex',alignItems:'center',gap:6,background:fetching?'#F9FAFB':'#111827',color:fetching?'#9CA3AF':'#fff',border:'none',borderRadius:7,padding:'6px 12px',fontSize:12,fontWeight:600,cursor:fetching?'not-allowed':'pointer'}}>
              <RefreshCw size={12} style={{animation:fetching?'spin 0.7s linear infinite':'none'}}/>Refresh
            </button>
          </div>
        )}
      </div>

      {/* PANELS */}
      <div style={{flex:1,display:'flex',overflow:'hidden',position:'relative'}}>

        {/* Mobile drawer overlay */}
        {isMobile && mobileDrawerOpen && (
          <div style={{position:'absolute',inset:0,zIndex:100,display:'flex'}}>
            <div style={{width:260,background:'#FFFFFF',borderRight:'1px solid #EEEFF2',overflow:'hidden',display:'flex',flexDirection:'column',height:'100%'}}>
              <ExpandedLeft/>
            </div>
            <div style={{flex:1,background:'rgba(0,0,0,0.3)'}} onClick={()=>setMobileDrawerOpen(false)}/>
          </div>
        )}

        {/* LEFT PANEL — desktop only */}
        {!isMobile && (
          <div style={{width:leftW,flexShrink:0,borderRight:'1px solid #EEEFF2',background:'#FFFFFF',overflow:'hidden',display:'flex',flexDirection:'column',transition:'width 0.2s ease'}}>
            {leftCollapsed ? <CollapsedLeft/> : <ExpandedLeft/>}
          </div>
        )}

        {/* MIDDLE — article list */}
        {!kbMode && (
          <div style={{width:isMobile?'100%':MID_W,flexShrink:0,borderRight:'1px solid #EEEFF2',background:'#FFFFFF',display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{padding:'10px 12px',borderBottom:'1px solid #F3F4F6',flexShrink:0,display:'flex',alignItems:'center',gap:8}}>
              <div style={{position:'relative',flex:1}}>
                <Search size={12} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'#9CA3AF',pointerEvents:'none'}}/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search…'
                  style={{width:'100%',boxSizing:'border-box',paddingLeft:27,paddingRight:8,paddingTop:6,paddingBottom:6,border:'1px solid #E5E7EB',borderRadius:7,fontSize:12,outline:'none',background:'#F9FAFB'}}/>
                {search && <button onClick={()=>setSearch('')} style={{position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',padding:0,display:'flex'}}><X size={12}/></button>}
              </div>
              <span style={{fontSize:12,color:'#D1D5DB',flexShrink:0}}>{sortedArticles.length}</span>
            </div>
            <div style={{flex:1,overflowY:'auto'}}>
              {!fetchedOnce && fetching ? (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:10}}>
                  <div style={{width:24,height:24,border:'3px solid #E5E7EB',borderTopColor:'#007AFF',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
                  <span style={{fontSize:13,color:'#9CA3AF'}}>Loading feeds…</span>
                </div>
              ) : sortedArticles.length === 0 ? (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:8,padding:24,textAlign:'center'}}>
                  <Globe size={28} color='#E5E7EB'/>
                  <div style={{fontSize:13,color:'#9CA3AF'}}>
                    {selectedNav==='pinned'?'No pinned articles yet.':search?'No results.':'No articles found. Click Refresh.'}
                  </div>
                </div>
              ) : sortedArticles.map(a=><ArticleCard key={a.id} article={a}/>)}
              {sortedArticles.length>0 && sourceResults.some(r=>r.status==='error') && (
                <div style={{padding:'8px 12px',borderTop:'1px solid #F3F4F6'}}>
                  {sourceResults.filter(r=>r.status==='error').map(r=>(
                    <div key={r.id||r.name} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#DC2626',marginBottom:3}}>
                      <AlertTriangle size={11}/><strong>{r.name}:</strong> {r.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* RIGHT — reader or KB */}
        <div style={{flex:1,background:'#FFFFFF',overflow:'hidden',display:'flex',flexDirection:'column',minWidth:0}}>
          {kbMode ? <KBPanel/> : <ReaderPanel/>}
        </div>
      </div>
    </div>
  )
}
