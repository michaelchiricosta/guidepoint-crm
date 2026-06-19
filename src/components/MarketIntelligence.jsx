import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Globe, RefreshCw, Plus, Trash2, Star, ExternalLink, AlertTriangle, CheckCircle, Loader, ChevronRight, X, Search, BookOpen, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
import { uid } from '../utils.js'

// ── Default sources ───────────────────────────────────────────────────────────
const DEFAULT_SOURCES = [
  { id: 'guidepointsecurity', name: 'GuidePoint Security Blog', url: 'https://www.guidepointsecurity.com/blog/',  feedUrl: 'https://www.guidepointsecurity.com/blog/feed/', enabled: true },
  { id: 'darkreading',        name: 'Dark Reading',             url: 'https://www.darkreading.com/',              feedUrl: 'https://www.darkreading.com/rss/all.xml',           enabled: true },
  { id: 'cio',                name: 'CIO.com',                  url: 'https://www.cio.com/',                      feedUrl: 'https://www.cio.com/feed/',                         enabled: true },
]

// ── KB categories (kept for Knowledge Base tab) ───────────────────────────────
export const CAT_COLORS = {
  'Identity & IAM': '#7c3aed', 'Threat Intelligence': '#dc2626', 'Cloud Security': '#0891b2',
  'Compliance & Risk': '#ea580c', 'SOC & Detection': '#1d4ed8', 'AI Security': '#059669',
  'Endpoint Security': '#0f172a', 'Vulnerability Mgmt': '#b45309', 'Security News': '#6b7280',
}
const CAT_LIST = Object.keys(CAT_COLORS)
const BLANK_KB = { title: '', sourceUrl: '', category: 'Security News', notes: '', relatedAccount: '', relatedVendor: '', tags: '', excerpt: '' }

// ── Helpers ───────────────────────────────────────────────────────────────────
const timeSince = iso => {
  if (!iso) return ''
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
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

// Soft source colour from id hash
const sourceHue = id => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff
  return Math.abs(h) % 360
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MarketIntelligence({ data, setData, onBack }) {
  // ── feed state (not persisted) ────────────────────────────────────────────
  const [articles, setArticles]         = useState([])
  const [fetching, setFetching]         = useState(false)
  const [fetchedOnce, setFetchedOnce]   = useState(false)
  const [sourceResults, setSourceResults] = useState([])

  // ── UI state ──────────────────────────────────────────────────────────────
  const [selectedNav, setSelectedNav]   = useState('all') // 'all' | 'pinned' | 'hidden' | sourceId
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [search, setSearch]             = useState('')
  const [leftOpen, setLeftOpen]         = useState(true)   // mobile left-panel toggle
  const [showAddForm, setShowAddForm]   = useState(false)
  const [addUrl, setAddUrl]             = useState('')
  const [addName, setAddName]           = useState('')
  const [discovering, setDiscovering]   = useState(false)
  const [addError, setAddError]         = useState('')
  const [addSuccess, setAddSuccess]     = useState('')

  // ── KB state ──────────────────────────────────────────────────────────────
  const [kbMode, setKbMode]             = useState(false) // true = showing KB tab
  const [showAddKb, setShowAddKb]       = useState(false)
  const [kbForm, setKbForm]             = useState(BLANK_KB)
  const [editingKbId, setEditingKbId]   = useState(null)
  const [kbSearch, setKbSearch]         = useState('')

  // responsive: treat ≤900px as "mobile"
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 900)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Derived data ──────────────────────────────────────────────────────────
  const sources     = data.blogSources        || []
  const pinnedSet   = new Set(data.marketIntelPinned  || [])
  const deletedSet  = new Set(data.marketIntelDeleted || [])
  const knowledgeBase = data.knowledgeBase    || []

  // ── Seed / migrate sources ────────────────────────────────────────────────
  useEffect(() => {
    const existing = data.blogSources || []
    if (existing.length === 0) {
      setData(prev => ({ ...prev, blogSources: DEFAULT_SOURCES.map(s => ({ ...s, createdAt: new Date().toISOString() })) }))
      return
    }
    const needsMigration = existing.some(s => !s.feedUrl)
    const KNOWN = { guidepointsecurity: 'https://www.guidepointsecurity.com/blog/feed/', darkreading: 'https://www.darkreading.com/rss/all.xml', cio: 'https://www.cio.com/feed/' }
    const ids = new Set(existing.map(s => s.id))
    const missing = DEFAULT_SOURCES.filter(s => !ids.has(s.id))
    if (needsMigration || missing.length > 0) {
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

  // ── Fetch feeds ───────────────────────────────────────────────────────────
  const fetchArticles = useCallback(async srcs => {
    const enabled = (srcs || []).filter(s => s.enabled && s.feedUrl)
    if (!enabled.length) { setArticles([]); setSourceResults([]); setFetchedOnce(true); return }
    setFetching(true)
    try {
      const res = await fetch('/api/rss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: enabled }),
      })
      const json = await res.json()
      setArticles(json.items || [])
      setSourceResults(json.sourceResults || [])
    } catch (err) {
      setSourceResults([{ status: 'error', error: err.message, name: 'All sources' }])
    }
    setFetching(false)
    setFetchedOnce(true)
  }, [])

  useEffect(() => {
    if ((data.blogSources || []).length > 0 && !fetchedOnce && !fetching) {
      fetchArticles(data.blogSources)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.blogSources, fetchedOnce])

  // ── Source management ─────────────────────────────────────────────────────
  const toggleSource = id => setData(prev => ({ ...prev, blogSources: (prev.blogSources||[]).map(s => s.id===id ? {...s, enabled:!s.enabled} : s) }))
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
      let feedUrl = null
      if (/\.(xml|rss|atom)$|\/feed\/?|\/rss\/?/.test(url.toLowerCase())) {
        feedUrl = url
      } else {
        const r = await fetch('/api/rss', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({discover:true, url}) })
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
      setTimeout(() => { setAddSuccess(''); setShowAddForm(false) }, 3000)
    } catch (err) { setAddError('Error: ' + err.message) }
    setDiscovering(false)
  }

  // ── Article actions ───────────────────────────────────────────────────────
  const pinArticle = id => setData(prev => {
    const s = new Set(prev.marketIntelPinned || [])
    s.has(id) ? s.delete(id) : s.add(id)
    return { ...prev, marketIntelPinned: [...s] }
  })
  const hideArticle = id => {
    setData(prev => ({ ...prev, marketIntelDeleted: [...new Set([...(prev.marketIntelDeleted||[]), id])] }))
    if (selectedArticle?.id === id) setSelectedArticle(null)
  }
  const unhideArticle = id => setData(prev => ({ ...prev, marketIntelDeleted: (prev.marketIntelDeleted||[]).filter(x=>x!==id) }))

  // ── KB ────────────────────────────────────────────────────────────────────
  const deleteKb = id => setData(prev => ({ ...prev, knowledgeBase: (prev.knowledgeBase||[]).filter(p=>p.id!==id) }))
  const saveKb = () => {
    if (!kbForm.title.trim()) return
    const now = new Date().toISOString()
    const tags = kbForm.tags.split(',').map(t=>t.trim()).filter(Boolean)
    if (editingKbId) {
      setData(prev => ({ ...prev, knowledgeBase: (prev.knowledgeBase||[]).map(p=>p.id===editingKbId?{...p,...kbForm,tags,updatedAt:now}:p) }))
    } else {
      setData(prev => ({ ...prev, knowledgeBase: [{id:uid(),type:'manual',...kbForm,tags,sourceName:'Manual',publishedDate:'',createdAt:now,updatedAt:now},...(prev.knowledgeBase||[])] }))
    }
    setKbForm(BLANK_KB); setShowAddKb(false); setEditingKbId(null)
  }

  // ── Filtered article list ─────────────────────────────────────────────────
  const filteredArticles = articles.filter(a => {
    if (selectedNav === 'pinned')  return pinnedSet.has(a.id) && !deletedSet.has(a.id)
    if (selectedNav === 'hidden')  return deletedSet.has(a.id)
    if (selectedNav !== 'all')     return a.sourceId === selectedNav && !deletedSet.has(a.id)
    return !deletedSet.has(a.id)
  }).filter(a => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${a.title} ${a.description} ${a.sourceName}`.toLowerCase().includes(q)
  })

  const sortedArticles = [
    ...filteredArticles.filter(a => pinnedSet.has(a.id)),
    ...filteredArticles.filter(a => !pinnedSet.has(a.id)),
  ]

  const pinnedCount = [...pinnedSet].filter(id => !deletedSet.has(id) && articles.some(a=>a.id===id)).length
  const hiddenCount = deletedSet.size

  // ── Source result lookup ──────────────────────────────────────────────────
  const srcResult = id => sourceResults.find(r => r.id === id)

  // ── Panel widths ──────────────────────────────────────────────────────────
  const LEFT_W  = 220
  const MID_W   = 340

  // ── Left panel nav item ───────────────────────────────────────────────────
  const NavItem = ({ id, label, icon, count, color }) => {
    const active = selectedNav === id && !kbMode
    return (
      <button
        onClick={() => { setSelectedNav(id); setKbMode(false); setSelectedArticle(null); if(isMobile) setLeftOpen(false) }}
        style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'7px 12px', border:'none', background: active ? '#EBF4FF' : 'transparent', color: active ? '#007AFF' : '#374151', borderRadius:7, fontSize:13, fontWeight: active?700:400, cursor:'pointer', textAlign:'left', transition:'background 0.1s' }}
        onMouseEnter={e=>{ if(!active) e.currentTarget.style.background='#F9FAFB' }}
        onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent' }}>
        <span style={{flexShrink:0,color:active?'#007AFF':color||'#9CA3AF'}}>{icon}</span>
        <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label}</span>
        {count!=null && count>0 && <span style={{fontSize:11,color:active?'#007AFF':'#9CA3AF',fontWeight:600,flexShrink:0}}>{count}</span>}
      </button>
    )
  }

  // ── Article list card ─────────────────────────────────────────────────────
  const ArticleCard = ({ article }) => {
    const isPinned  = pinnedSet.has(article.id)
    const isHidden  = deletedSet.has(article.id)
    const isActive  = selectedArticle?.id === article.id
    const hue       = sourceHue(article.sourceId || article.id)
    return (
      <div onClick={() => setSelectedArticle(article)}
        style={{
          padding:'12px 14px', borderBottom:'1px solid #F3F4F6', cursor:'pointer',
          background: isActive ? '#EBF4FF' : '#fff',
          transition:'background 0.1s',
          opacity: isHidden ? 0.5 : 1,
        }}
        onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background='#F9FAFB' }}
        onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background= isActive ? '#EBF4FF' : '#fff' }}>
        {/* source + date row */}
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
          <div style={{width:18,height:18,borderRadius:4,background:`hsl(${hue},60%,50%)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800,color:'#fff',flexShrink:0}}>
            {sourceInitial(article.sourceName)}
          </div>
          <span style={{fontSize:11,color:'#9CA3AF',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{article.sourceName}</span>
          {isPinned && <Star size={10} fill='#FBBF24' color='#FBBF24' style={{flexShrink:0}}/>}
          <span style={{fontSize:11,color:'#D1D5DB',flexShrink:0}}>{timeSince(article.publishedAt)}</span>
        </div>
        {/* title */}
        <div style={{fontSize:13,fontWeight:600,color:'#111827',lineHeight:1.4,marginBottom:4,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
          {article.title}
        </div>
        {/* excerpt */}
        {article.description && (
          <div style={{fontSize:12,color:'#6B7280',lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
            {article.description}
          </div>
        )}
        {/* actions row */}
        <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:4,marginTop:8}}>
          <button onClick={()=>pinArticle(article.id)} title={isPinned?'Unpin':'Pin'}
            style={{background:'transparent',border:'none',padding:'3px',cursor:'pointer',color:isPinned?'#FBBF24':'#D1D5DB',display:'flex',alignItems:'center',borderRadius:4}}
            onMouseEnter={e=>e.currentTarget.style.color='#FBBF24'} onMouseLeave={e=>e.currentTarget.style.color=isPinned?'#FBBF24':'#D1D5DB'}>
            <Star size={13} fill={isPinned?'#FBBF24':'none'}/>
          </button>
          {isHidden
            ? <button onClick={()=>unhideArticle(article.id)} title='Unhide' style={{background:'transparent',border:'none',padding:'3px 5px',cursor:'pointer',color:'#9CA3AF',fontSize:11,borderRadius:4}}>Unhide</button>
            : <button onClick={()=>hideArticle(article.id)} title='Hide' style={{background:'transparent',border:'none',padding:'3px',cursor:'pointer',color:'#D1D5DB',display:'flex',alignItems:'center',borderRadius:4}}
                onMouseEnter={e=>e.currentTarget.style.color='#EF4444'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>
                <Trash2 size={13}/>
              </button>
          }
        </div>
      </div>
    )
  }

  // ── Right reader panel content ────────────────────────────────────────────
  const ReaderPanel = () => {
    if (!selectedArticle) return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:12,padding:40}}>
        <Globe size={36} color='#E5E7EB'/>
        <div style={{fontSize:14,color:'#9CA3AF',textAlign:'center',lineHeight:1.6}}>
          Select an article to read it here.
        </div>
      </div>
    )
    const a = selectedArticle
    const isPinned = pinnedSet.has(a.id)
    const isHidden = deletedSet.has(a.id)
    const hue = sourceHue(a.sourceId || a.id)
    return (
      <div style={{display:'flex',flexDirection:'column',height:'100%',overflowY:'auto'}}>
        <div style={{padding:'20px 24px 16px',borderBottom:'1px solid #F3F4F6',flexShrink:0}}>
          {/* source chip */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
            <div style={{width:22,height:22,borderRadius:5,background:`hsl(${hue},60%,50%)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#fff',flexShrink:0}}>
              {sourceInitial(a.sourceName)}
            </div>
            <span style={{fontSize:12,fontWeight:600,color:'#6B7280'}}>{a.sourceName}</span>
            <span style={{fontSize:12,color:'#D1D5DB'}}>·</span>
            <span style={{fontSize:12,color:'#9CA3AF'}}>{fmtPub(a.publishedAt)}</span>
            <div style={{marginLeft:'auto',display:'flex',gap:6}}>
              <button onClick={()=>pinArticle(a.id)} title={isPinned?'Unpin':'Pin'}
                style={{background:isPinned?'#FEF3C7':'#F9FAFB',border:`1px solid ${isPinned?'#FDE68A':'#E5E7EB'}`,borderRadius:6,padding:'5px 8px',cursor:'pointer',color:isPinned?'#D97706':'#9CA3AF',display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600}}>
                <Star size={13} fill={isPinned?'#FBBF24':'none'} color={isPinned?'#FBBF24':'currentColor'}/>{isPinned?'Pinned':'Pin'}
              </button>
              {isHidden
                ? <button onClick={()=>unhideArticle(a.id)} style={{background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'#6B7280',fontSize:11,fontWeight:600}}>Unhide</button>
                : <button onClick={()=>hideArticle(a.id)} style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'#DC2626',display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600}}>
                    <Trash2 size={13}/>Hide
                  </button>
              }
            </div>
          </div>
          {/* title */}
          <h2 style={{fontSize:20,fontWeight:800,color:'#111827',lineHeight:1.35,margin:'0 0 14px'}}>{a.title}</h2>
          {/* open link */}
          <a href={a.link} target='_blank' rel='noopener noreferrer'
            style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,fontWeight:600,color:'#007AFF',textDecoration:'none',background:'#EBF4FF',borderRadius:7,padding:'7px 14px'}}
            onMouseEnter={e=>e.currentTarget.style.background='#DBEAFE'} onMouseLeave={e=>e.currentTarget.style.background='#EBF4FF'}>
            <ExternalLink size={13}/>Read Full Article
          </a>
        </div>
        {/* body */}
        <div style={{padding:'20px 24px',flex:1}}>
          {a.description
            ? <p style={{fontSize:15,color:'#374151',lineHeight:1.75,margin:0}}>{a.description}</p>
            : <p style={{fontSize:14,color:'#9CA3AF',fontStyle:'italic'}}>No preview available. Open the full article to read it.</p>
          }
          {a.author && <div style={{marginTop:20,fontSize:12,color:'#9CA3AF'}}>By {a.author}</div>}
        </div>
      </div>
    )
  }

  // ── KB entry list ─────────────────────────────────────────────────────────
  const KBPanel = () => {
    const filtered = knowledgeBase.filter(item => {
      if (!kbSearch) return true
      const q = kbSearch.toLowerCase()
      return `${item.title} ${item.notes||''} ${item.excerpt||''} ${item.relatedAccount||''} ${item.relatedVendor||''}`.toLowerCase().includes(q)
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
            <div style={{fontSize:12,fontWeight:700,color:'#374151',marginBottom:10}}>{editingKbId?'Edit Entry':'New Entry'}</div>
            <div style={{display:'flex',flexDirection:'column',gap:7}}>
              <input value={kbForm.title} onChange={e=>setKbForm(f=>({...f,title:e.target.value}))} placeholder='Title *'
                style={{padding:'6px 9px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:13,outline:'none'}}/>
              <input value={kbForm.sourceUrl} onChange={e=>setKbForm(f=>({...f,sourceUrl:e.target.value}))} placeholder='Source URL'
                style={{padding:'6px 9px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:12,outline:'none'}}/>
              <select value={kbForm.category} onChange={e=>setKbForm(f=>({...f,category:e.target.value}))}
                style={{padding:'6px 9px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:12,background:'#fff',outline:'none'}}>
                {CAT_LIST.map(c=><option key={c}>{c}</option>)}
              </select>
              <input value={kbForm.relatedAccount} onChange={e=>setKbForm(f=>({...f,relatedAccount:e.target.value}))} placeholder='Related Account'
                style={{padding:'6px 9px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:12,outline:'none'}}/>
              <textarea value={kbForm.excerpt} onChange={e=>setKbForm(f=>({...f,excerpt:e.target.value}))} placeholder='Content / excerpt…'
                rows={3} style={{padding:'6px 9px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:12,fontFamily:'inherit',resize:'vertical',outline:'none'}}/>
              <textarea value={kbForm.notes} onChange={e=>setKbForm(f=>({...f,notes:e.target.value}))} placeholder='Notes…'
                rows={2} style={{padding:'6px 9px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:12,fontFamily:'inherit',resize:'vertical',outline:'none'}}/>
            </div>
            <div style={{display:'flex',gap:7,marginTop:10}}>
              <button onClick={saveKb} disabled={!kbForm.title.trim()}
                style={{background:kbForm.title.trim()?'#2563EB':'#E5E7EB',color:kbForm.title.trim()?'#fff':'#9CA3AF',border:'none',borderRadius:6,padding:'7px 14px',fontSize:12,fontWeight:600,cursor:kbForm.title.trim()?'pointer':'not-allowed'}}>
                {editingKbId?'Save':'Add Entry'}
              </button>
              <button onClick={()=>{setShowAddKb(false);setKbForm(BLANK_KB);setEditingKbId(null)}}
                style={{background:'#F1F5F9',color:'#6B7280',border:'none',borderRadius:6,padding:'7px 12px',fontSize:12,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        )}
        {filtered.length === 0 && !showAddKb ? (
          <div style={{padding:'48px 20px',textAlign:'center'}}>
            <BookOpen size={28} color='#E5E7EB' style={{marginBottom:10}}/>
            <div style={{fontSize:13,color:'#9CA3AF'}}>No knowledge base entries yet.</div>
          </div>
        ) : filtered.map(item => {
          const cc = CAT_COLORS[item.category] || '#6B7280'
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
        })}
      </div>
    )
  }

  // ── Add Source form ───────────────────────────────────────────────────────
  const AddSourceForm = () => (
    <div style={{padding:'12px 14px',borderBottom:'1px solid #F3F4F6',background:'#F9FAFB'}}>
      <div style={{fontSize:11,color:'#6B7280',marginBottom:8,lineHeight:1.4}}>Paste a website or RSS feed URL. Ledgr discovers the feed automatically.</div>
      <input value={addName} onChange={e=>setAddName(e.target.value)} placeholder='Name (optional)'
        style={{width:'100%',boxSizing:'border-box',padding:'6px 9px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:12,outline:'none',marginBottom:6}}/>
      <input value={addUrl} onChange={e=>setAddUrl(e.target.value)} placeholder='https://example.com/blog'
        style={{width:'100%',boxSizing:'border-box',padding:'6px 9px',border:'1px solid #E5E7EB',borderRadius:6,fontSize:12,outline:'none',marginBottom:6}}
        onKeyDown={e=>e.key==='Enter'&&discoverAndAdd()}/>
      <div style={{display:'flex',gap:6}}>
        <button onClick={discoverAndAdd} disabled={discovering||!addUrl.trim()}
          style={{flex:1,background:discovering||!addUrl.trim()?'#E5E7EB':'#111827',color:discovering||!addUrl.trim()?'#9CA3AF':'#fff',border:'none',borderRadius:6,padding:'7px 0',fontSize:12,fontWeight:600,cursor:discovering||!addUrl.trim()?'not-allowed':'pointer'}}>
          {discovering?<><span style={{display:'inline-block',width:10,height:10,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite',verticalAlign:'middle',marginRight:5}}/>Finding…</>:'Add Feed'}
        </button>
        <button onClick={()=>{setShowAddForm(false);setAddError('');setAddUrl('');setAddName('')}}
          style={{background:'#F1F5F9',color:'#6B7280',border:'none',borderRadius:6,padding:'7px 10px',fontSize:12,cursor:'pointer'}}>✕</button>
      </div>
      {addError && <div style={{marginTop:7,fontSize:11,color:'#DC2626',background:'#FEF2F2',borderRadius:5,padding:'5px 9px'}}>{addError}</div>}
      {addSuccess && <div style={{marginTop:7,fontSize:11,color:'#15803D',background:'#DCFCE7',borderRadius:5,padding:'5px 9px',display:'flex',alignItems:'center',gap:5}}><CheckCircle size={11}/>{addSuccess}</div>}
    </div>
  )

  // ── Left panel ────────────────────────────────────────────────────────────
  const LeftPanel = () => (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* header */}
      <div style={{padding:'14px 14px 10px',borderBottom:'1px solid #F3F4F6',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:12,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.07em'}}>Market Intel</span>
          <button onClick={()=>fetchArticles(sources)} disabled={fetching} title='Refresh all feeds'
            style={{background:'none',border:'none',cursor:fetching?'not-allowed':'pointer',color:'#9CA3AF',padding:'3px',display:'flex',alignItems:'center',borderRadius:5}}
            onMouseEnter={e=>e.currentTarget.style.color='#374151'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
            <RefreshCw size={14} style={{animation:fetching?'spin 0.7s linear infinite':'none'}}/>
          </button>
        </div>
      </div>
      {/* nav */}
      <div style={{flex:1,overflowY:'auto',padding:'8px 8px 0'}}>
        <div style={{marginBottom:4}}>
          <NavItem id='all'    label='All Articles'   icon={<Globe size={14}/>}     count={articles.filter(a=>!deletedSet.has(a.id)).length}/>
          <NavItem id='pinned' label='Pinned'         icon={<Star size={14}/>}      count={pinnedCount}/>
          {hiddenCount > 0 && <NavItem id='hidden' label='Hidden' icon={<Trash2 size={14}/>} count={hiddenCount}/>}
        </div>
        <div style={{height:1,background:'#F3F4F6',margin:'8px 4px'}}/>
        <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.07em',padding:'0 4px 4px'}}>Sources</div>
        {sources.map(src => {
          const active = selectedNav === src.id && !kbMode
          const res = srcResult(src.id)
          const hue = sourceHue(src.id)
          return (
            <div key={src.id}
              style={{display:'flex',alignItems:'center',gap:7,padding:'5px 8px',borderRadius:7,background:active?'#EBF4FF':'transparent',cursor:'pointer',marginBottom:1}}
              onClick={() => { setSelectedNav(src.id); setKbMode(false); setSelectedArticle(null); if(isMobile) setLeftOpen(false) }}
              onMouseEnter={e=>{ if(!active) e.currentTarget.style.background='#F9FAFB' }}
              onMouseLeave={e=>{ if(!active) e.currentTarget.style.background=active?'#EBF4FF':'transparent' }}>
              <div style={{width:20,height:20,borderRadius:5,background:src.enabled?`hsl(${hue},60%,50%)`:'#D1D5DB',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800,color:'#fff',flexShrink:0,opacity:src.enabled?1:0.6}}>
                {sourceInitial(src.name)}
              </div>
              <span style={{flex:1,fontSize:13,fontWeight:active?700:400,color:active?'#007AFF':src.enabled?'#374151':'#9CA3AF',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {src.name}
              </span>
              {res?.status==='error' && <span title={res.error} style={{color:'#EF4444',flexShrink:0,cursor:'help'}}><AlertTriangle size={11}/></span>}
              {res?.status==='ok' && <span style={{fontSize:10,color:'#9CA3AF',flexShrink:0}}>{res.count}</span>}
              {/* source controls */}
              <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:2,flexShrink:0,opacity:0}} className='src-actions'>
                <button onClick={()=>toggleSource(src.id)} title={src.enabled?'Disable':'Enable'}
                  style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',padding:'2px',display:'flex',alignItems:'center',borderRadius:3}}>
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
        {/* Add source */}
        {showAddForm ? <AddSourceForm/> : (
          <button onClick={()=>setShowAddForm(true)}
            style={{display:'flex',alignItems:'center',gap:6,width:'100%',padding:'7px 8px',background:'transparent',border:'1px dashed #D1D5DB',borderRadius:7,color:'#9CA3AF',fontSize:12,fontWeight:600,cursor:'pointer',marginTop:6,marginBottom:6}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='#9CA3AF';e.currentTarget.style.color='#374151'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='#D1D5DB';e.currentTarget.style.color='#9CA3AF'}}>
            <Plus size={13}/>Add Source
          </button>
        )}
        <div style={{height:1,background:'#F3F4F6',margin:'8px 4px'}}/>
        {/* KB nav */}
        <button onClick={()=>{ setKbMode(true); setSelectedArticle(null); if(isMobile) setLeftOpen(false) }}
          style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'7px 12px',border:'none',background:kbMode?'#EBF4FF':'transparent',color:kbMode?'#007AFF':'#374151',borderRadius:7,fontSize:13,fontWeight:kbMode?700:400,cursor:'pointer',marginBottom:8}}
          onMouseEnter={e=>{ if(!kbMode) e.currentTarget.style.background='#F9FAFB' }}
          onMouseLeave={e=>{ if(!kbMode) e.currentTarget.style.background='transparent' }}>
          <BookOpen size={14} color={kbMode?'#007AFF':'#9CA3AF'}/>
          <span style={{flex:1,textAlign:'left'}}>Knowledge Base</span>
          <span style={{fontSize:11,color:'#9CA3AF'}}>{knowledgeBase.length}</span>
        </button>
      </div>
    </div>
  )

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden',background:'#F8FAFC',fontFamily:'inherit'}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .src-row:hover .src-actions{opacity:1!important}
        .src-actions{transition:opacity 0.15s}
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={{background:'#FFFFFF',borderBottom:'1px solid #EEEFF2',padding:'0 20px',height:48,display:'flex',alignItems:'center',gap:12,flexShrink:0,boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
        <button onClick={onBack}
          style={{background:'transparent',border:'none',color:'#6B7280',cursor:'pointer',display:'flex',alignItems:'center',gap:5,padding:0,fontSize:13,fontWeight:500,whiteSpace:'nowrap'}}
          onMouseEnter={e=>e.currentTarget.style.color='#111827'} onMouseLeave={e=>e.currentTarget.style.color='#6B7280'}>
          <ArrowLeft size={15}/>Back
        </button>
        <div style={{width:1,height:18,background:'#E5E7EB'}}/>
        <Globe size={15} color='#007AFF'/>
        <span style={{fontSize:14,fontWeight:700,color:'#111827'}}>Market Intelligence</span>
        {isMobile && (
          <button onClick={()=>setLeftOpen(v=>!v)}
            style={{marginLeft:'auto',background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:7,padding:'5px 10px',fontSize:12,fontWeight:600,color:'#374151',cursor:'pointer'}}>
            {leftOpen?'✕ Sources':'☰ Sources'}
          </button>
        )}
        {!isMobile && (
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10}}>
            {fetching && <span style={{fontSize:12,color:'#9CA3AF',display:'flex',alignItems:'center',gap:5}}><span style={{display:'inline-block',width:12,height:12,border:'2px solid #E5E7EB',borderTopColor:'#007AFF',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>Fetching…</span>}
            <button onClick={()=>fetchArticles(sources)} disabled={fetching}
              style={{display:'flex',alignItems:'center',gap:6,background:fetching?'#F9FAFB':'#111827',color:fetching?'#9CA3AF':'#fff',border:'none',borderRadius:7,padding:'7px 14px',fontSize:12,fontWeight:600,cursor:fetching?'not-allowed':'pointer'}}>
              <RefreshCw size={12} style={{animation:fetching?'spin 0.7s linear infinite':'none'}}/>Refresh
            </button>
          </div>
        )}
      </div>

      {/* ── THREE PANELS ── */}
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* LEFT PANEL */}
        {(!isMobile || leftOpen) && (
          <div style={{
            width: isMobile ? '100%' : LEFT_W,
            flexShrink: 0,
            borderRight: '1px solid #EEEFF2',
            background: '#FFFFFF',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            position: isMobile ? 'absolute' : 'relative',
            top: isMobile ? 0 : 'auto',
            left: isMobile ? 0 : 'auto',
            height: isMobile ? '100%' : 'auto',
            zIndex: isMobile ? 50 : 'auto',
            boxShadow: isMobile ? '4px 0 20px rgba(0,0,0,0.1)' : 'none',
          }}>
            <LeftPanel/>
          </div>
        )}

        {/* MIDDLE PANEL — article list */}
        {!kbMode && (
          <div style={{
            width: isMobile ? '100%' : MID_W,
            flexShrink: 0,
            borderRight: '1px solid #EEEFF2',
            background: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* middle header */}
            <div style={{padding:'10px 14px',borderBottom:'1px solid #F3F4F6',flexShrink:0,display:'flex',alignItems:'center',gap:8}}>
              <div style={{position:'relative',flex:1}}>
                <Search size={12} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'#9CA3AF',pointerEvents:'none'}}/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search…'
                  style={{width:'100%',boxSizing:'border-box',paddingLeft:27,paddingRight:8,paddingTop:6,paddingBottom:6,border:'1px solid #E5E7EB',borderRadius:7,fontSize:12,outline:'none',background:'#F9FAFB'}}/>
                {search && <button onClick={()=>setSearch('')} style={{position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',padding:0,display:'flex',alignItems:'center'}}><X size={12}/></button>}
              </div>
              <span style={{fontSize:12,color:'#9CA3AF',whiteSpace:'nowrap',flexShrink:0}}>{sortedArticles.length}</span>
            </div>
            {/* article list */}
            <div style={{flex:1,overflowY:'auto'}}>
              {!fetchedOnce && fetching ? (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:10}}>
                  <div style={{width:24,height:24,border:'3px solid #E5E7EB',borderTopColor:'#007AFF',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
                  <span style={{fontSize:13,color:'#9CA3AF'}}>Loading…</span>
                </div>
              ) : sortedArticles.length === 0 ? (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:8,padding:24}}>
                  <Globe size={28} color='#E5E7EB'/>
                  <div style={{fontSize:13,color:'#9CA3AF',textAlign:'center',lineHeight:1.5}}>
                    {selectedNav==='pinned'?'No pinned articles. Star articles to pin them here.':search?'No articles match your search.':'No articles found. Click Refresh above.'}
                  </div>
                  {sourceResults.some(r=>r.status==='error') && (
                    <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:5,width:'100%'}}>
                      {sourceResults.filter(r=>r.status==='error').map(r=>(
                        <div key={r.id||r.name} style={{display:'flex',alignItems:'center',gap:6,background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:7,padding:'6px 10px',fontSize:11,color:'#DC2626'}}>
                          <AlertTriangle size={11} style={{flexShrink:0}}/><strong>{r.name}:</strong> {r.error}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : sortedArticles.map(a => <ArticleCard key={a.id} article={a}/>)}
              {/* source errors at bottom of list */}
              {sortedArticles.length > 0 && sourceResults.some(r=>r.status==='error') && (
                <div style={{padding:'8px 12px',borderTop:'1px solid #F3F4F6'}}>
                  {sourceResults.filter(r=>r.status==='error').map(r=>(
                    <div key={r.id||r.name} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#DC2626',marginBottom:4}}>
                      <AlertTriangle size={11}/><strong>{r.name}:</strong> {r.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* RIGHT PANEL — reader or KB */}
        <div style={{flex:1,background:'#FFFFFF',overflow:'hidden',display:'flex',flexDirection:'column'}}>
          {kbMode ? <KBPanel/> : <ReaderPanel/>}
        </div>
      </div>
    </div>
  )
}
