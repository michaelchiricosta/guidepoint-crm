import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Globe, RefreshCw, Plus, Trash2, X, Search, ExternalLink, Star, BookOpen, Pencil, AlertTriangle, CheckCircle, Loader, ToggleLeft, ToggleRight } from 'lucide-react'
import { uid } from '../utils.js'

// ── Default sources seeded when none exist ─────────────────────────────────────
const DEFAULT_SOURCES = [
  { id: 'guidepointsecurity', name: 'GuidePoint Security Blog', url: 'https://www.guidepointsecurity.com/blog/', feedUrl: 'https://www.guidepointsecurity.com/blog/feed/', enabled: true },
  { id: 'darkreading',        name: 'Dark Reading',             url: 'https://www.darkreading.com/',              feedUrl: 'https://www.darkreading.com/rss/all.xml',          enabled: true },
  { id: 'cio',                name: 'CIO.com',                  url: 'https://www.cio.com/',                      feedUrl: 'https://www.cio.com/feed/',                        enabled: true },
]

const timeSince = iso => {
  if (!iso) return ''
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 2) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  } catch { return '' }
}

const fmtPub = iso => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '' }
}

// ── KB helpers (kept from original) ───────────────────────────────────────────
export const CAT_COLORS = {
  'Identity & IAM': '#7c3aed', 'Threat Intelligence': '#dc2626', 'Cloud Security': '#0891b2',
  'Compliance & Risk': '#ea580c', 'SOC & Detection': '#1d4ed8', 'AI Security': '#059669',
  'Endpoint Security': '#0f172a', 'Vulnerability Mgmt': '#b45309', 'Security News': '#6b7280',
}
const CAT_LIST = Object.keys(CAT_COLORS)
const BLANK_KB = { title: '', sourceUrl: '', category: 'Security News', notes: '', relatedAccount: '', relatedVendor: '', tags: '', excerpt: '' }

function stripHtml(html) {
  try { const d = document.createElement('div'); d.innerHTML = html||''; return (d.textContent||d.innerText||'').replace(/\s+/g,' ').trim() }
  catch { return String(html||'') }
}

// ── Source status badge ────────────────────────────────────────────────────────
function SourceBadge({ result }) {
  if (!result) return null
  if (result.status === 'ok')       return <span style={{fontSize:10,fontWeight:700,color:'#15803d',background:'#dcfce7',borderRadius:4,padding:'2px 6px'}}>{result.count} items</span>
  if (result.status === 'error')    return <span style={{fontSize:10,fontWeight:700,color:'#dc2626',background:'#fee2e2',borderRadius:4,padding:'2px 6px'}} title={result.error}>⚠ Error</span>
  if (result.status === 'disabled') return <span style={{fontSize:10,color:'#9ca3af'}}>Disabled</span>
  return null
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MarketIntelligence({ data, setData, onBack }) {
  const [tab, setTab] = useState('feed')
  const [articles, setArticles] = useState([])
  const [fetching, setFetching] = useState(false)
  const [fetchedOnce, setFetchedOnce] = useState(false)
  const [sourceResults, setSourceResults] = useState([])

  // Source add form
  const [addUrl, setAddUrl] = useState('')
  const [addName, setAddName] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  // Feed UI
  const [search, setSearch] = useState('')
  const [feedFilter, setFeedFilter] = useState('all') // all | pinned | <sourceId>

  // KB
  const [showAddKb, setShowAddKb] = useState(false)
  const [kbForm, setKbForm] = useState(BLANK_KB)
  const [editingKbId, setEditingKbId] = useState(null)

  const sources      = data.blogSources        || []
  const pinnedIds    = new Set(data.marketIntelPinned  || [])
  const deletedIds   = new Set(data.marketIntelDeleted || [])
  const knowledgeBase = data.knowledgeBase     || []

  // Seed default sources if none exist (or if feedUrl missing from existing)
  useEffect(() => {
    const existing = data.blogSources || []
    if (existing.length === 0) {
      setData(prev => ({ ...prev, blogSources: DEFAULT_SOURCES.map(s => ({ ...s, createdAt: new Date().toISOString() })) }))
    } else {
      // Migrate legacy sources that have no feedUrl
      const needsMigration = existing.some(s => !s.feedUrl)
      if (needsMigration) {
        const KNOWN_FEEDS = { guidepointsecurity: 'https://www.guidepointsecurity.com/blog/feed/', darkreading: 'https://www.darkreading.com/rss/all.xml', cio: 'https://www.cio.com/feed/' }
        setData(prev => ({ ...prev, blogSources: (prev.blogSources||[]).map(s => s.feedUrl ? s : { ...s, feedUrl: KNOWN_FEEDS[s.id] || null }) }))
      }
      // Also add missing default sources
      const ids = new Set(existing.map(s => s.id))
      const missing = DEFAULT_SOURCES.filter(s => !ids.has(s.id))
      if (missing.length > 0) {
        setData(prev => ({ ...prev, blogSources: [...(prev.blogSources||[]), ...missing.map(s=>({...s,createdAt:new Date().toISOString()}))] }))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Fetch articles from /api/rss ──────────────────────────────────────────
  const fetchArticles = useCallback(async (srcs) => {
    const enabled = srcs.filter(s => s.enabled && s.feedUrl)
    if (enabled.length === 0) { setArticles([]); setSourceResults([]); setFetchedOnce(true); return }
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
      console.error('[MarketIntel] Fetch failed:', err.message)
      setSourceResults([{ status: 'error', error: err.message, name: 'All sources' }])
    }
    setFetching(false)
    setFetchedOnce(true)
  }, [])

  // Auto-fetch on first render once sources are ready
  useEffect(() => {
    const srcs = data.blogSources || []
    if (srcs.length > 0 && !fetchedOnce && !fetching) {
      fetchArticles(srcs)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.blogSources, fetchedOnce])

  // ── Source management ──────────────────────────────────────────────────────
  const toggleSource = id => {
    setData(prev => ({ ...prev, blogSources: (prev.blogSources||[]).map(s => s.id===id ? {...s,enabled:!s.enabled} : s) }))
  }

  const deleteSource = id => {
    if (!window.confirm('Remove this source?')) return
    setData(prev => ({ ...prev, blogSources: (prev.blogSources||[]).filter(s => s.id!==id) }))
    setSourceResults(prev => prev.filter(r => r.id!==id))
    setArticles(prev => prev.filter(a => a.sourceId!==id))
  }

  const discoverAndAdd = async () => {
    if (!addUrl.trim()) { setAddError('Enter a URL'); return }
    let url = addUrl.trim()
    if (!/^https?:\/\//.test(url)) url = 'https://' + url
    setAddError(''); setAddSuccess(''); setDiscovering(true)
    try {
      // First try the URL directly as a feed
      let feedUrl = null
      // If URL ends in .xml, .rss, /feed etc. treat as direct feed
      if (/\.(xml|rss|atom)$|\/feed\/?|\/rss\/?/.test(url.toLowerCase())) {
        feedUrl = url
      } else {
        // Discover
        const res = await fetch('/api/rss', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ discover: true, url }),
        })
        const json = await res.json()
        feedUrl = json.feedUrl || null
      }
      if (!feedUrl) { setAddError('Could not find an RSS feed at this URL. Try pasting the feed URL directly (e.g. .../feed or .../rss.xml).'); setDiscovering(false); return }
      const name = addName.trim() || new URL(url).hostname.replace('www.','')
      const newSource = { id: uid(), name, url, feedUrl, enabled: true, createdAt: new Date().toISOString() }
      setData(prev => ({ ...prev, blogSources: [...(prev.blogSources||[]), newSource] }))
      setAddSuccess(`Added "${name}" — feed: ${feedUrl}`)
      setAddUrl(''); setAddName('')
      setTimeout(() => { setAddSuccess(''); setShowAddForm(false) }, 3000)
      // Refresh articles to include new source
      fetchArticles([...(data.blogSources||[]), newSource])
    } catch (err) {
      setAddError('Discovery failed: ' + err.message)
    }
    setDiscovering(false)
  }

  // ── Article actions ────────────────────────────────────────────────────────
  const pinArticle = id => {
    setData(prev => {
      const pinned = new Set(prev.marketIntelPinned || [])
      pinned.has(id) ? pinned.delete(id) : pinned.add(id)
      return { ...prev, marketIntelPinned: [...pinned] }
    })
  }

  const deleteArticle = id => {
    setData(prev => {
      const deleted = new Set(prev.marketIntelDeleted || [])
      deleted.add(id)
      return { ...prev, marketIntelDeleted: [...deleted] }
    })
  }

  // ── KB CRUD (kept from original) ──────────────────────────────────────────
  const deleteKbItem = id => setData(prev => ({ ...prev, knowledgeBase: (prev.knowledgeBase||[]).filter(p=>p.id!==id) }))

  const saveKbEntry = () => {
    if (!kbForm.title.trim()) return
    const now = new Date().toISOString()
    const tags = kbForm.tags.split(',').map(t=>t.trim()).filter(Boolean)
    if (editingKbId) {
      setData(prev=>({...prev, knowledgeBase:(prev.knowledgeBase||[]).map(p=>p.id===editingKbId?{...p,...kbForm,tags,updatedAt:now}:p)}))
    } else {
      setData(prev=>({...prev, knowledgeBase:[{id:uid(),type:'manual',...kbForm,tags,sourceName:'Manual Entry',publishedDate:'',createdAt:now,updatedAt:now},...(prev.knowledgeBase||[])]}))
    }
    setKbForm(BLANK_KB); setShowAddKb(false); setEditingKbId(null)
  }

  // ── Filtered + sorted articles ─────────────────────────────────────────────
  const visibleArticles = articles.filter(a => {
    if (deletedIds.has(a.id)) return false
    if (feedFilter === 'pinned' && !pinnedIds.has(a.id)) return false
    if (feedFilter !== 'all' && feedFilter !== 'pinned' && a.sourceId !== feedFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!`${a.title} ${a.description} ${a.sourceName}`.toLowerCase().includes(q)) return false
    }
    return true
  })
  // Pinned first, then newest
  const sortedArticles = [
    ...visibleArticles.filter(a => pinnedIds.has(a.id)),
    ...visibleArticles.filter(a => !pinnedIds.has(a.id)),
  ]

  const enabledSources = sources.filter(s => s.enabled)
  const totalPinned = [...pinnedIds].filter(id => !deletedIds.has(id) && articles.some(a=>a.id===id)).length

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden',background:'#f8fafc'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.mi-card:hover{border-color:#93c5fd!important;box-shadow:0 2px 8px rgba(37,99,235,0.08)!important}`}</style>

      {/* TOP BAR */}
      <div style={{background:'#0f172a',padding:'11px 20px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
        <button onClick={onBack} style={{background:'transparent',border:'none',color:'#94a3b8',cursor:'pointer',display:'flex',alignItems:'center',gap:6,padding:0,fontSize:13,fontWeight:500}}
          onMouseEnter={e=>e.currentTarget.style.color='#e2e8f0'} onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}>
          <ArrowLeft size={15}/> Back
        </button>
        <div style={{width:1,height:16,background:'rgba(255,255,255,0.15)'}}/>
        <Globe size={15} color='#60a5fa'/>
        <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>Market Intelligence</span>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10}}>
          {totalPinned > 0 && <span style={{fontSize:11,color:'#fbbf24',fontWeight:600}}>★ {totalPinned} pinned</span>}
          <button onClick={()=>fetchArticles(sources)} disabled={fetching}
            style={{display:'flex',alignItems:'center',gap:6,background:fetching?'rgba(255,255,255,0.05)':'rgba(255,255,255,0.1)',color:fetching?'#475569':'#e2e8f0',border:'1px solid rgba(255,255,255,0.15)',borderRadius:7,padding:'6px 12px',fontSize:12,fontWeight:600,cursor:fetching?'not-allowed':'pointer'}}>
            {fetching
              ? <><span style={{display:'inline-block',width:11,height:11,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>Fetching…</>
              : <><RefreshCw size={12}/>Refresh Feeds</>}
          </button>
        </div>
      </div>

      {/* BODY */}
      <div style={{flex:1,overflowY:'auto',padding:'20px 28px 60px',WebkitOverflowScrolling:'touch'}}>
        <div style={{maxWidth:960,margin:'0 auto'}}>

          {/* ── SOURCES MANAGER ── */}
          <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,padding:'16px 20px',marginBottom:20}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:'#374151',letterSpacing:'0.05em',textTransform:'uppercase'}}>RSS Sources</div>
              <button onClick={()=>{setShowAddForm(v=>!v);setAddError('');setAddSuccess('')}}
                style={{display:'flex',alignItems:'center',gap:5,background:'#0f172a',color:'#fff',border:'none',borderRadius:7,padding:'6px 12px',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                <Plus size={13}/>{showAddForm?'Cancel':'Add Source'}
              </button>
            </div>

            {/* Add source form */}
            {showAddForm && (
              <div style={{background:'#f8fafc',border:'1px solid #e5e7eb',borderRadius:8,padding:'14px 16px',marginBottom:14}}>
                <div style={{fontSize:12,color:'#374151',marginBottom:10}}>Paste a website URL or direct RSS feed URL. Ledgr will discover the feed automatically.</div>
                <div style={{display:'flex',gap:8,marginBottom:8}}>
                  <input value={addName} onChange={e=>setAddName(e.target.value)} placeholder='Source name (optional)'
                    style={{flex:'0 0 200px',padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,outline:'none'}}/>
                  <input value={addUrl} onChange={e=>setAddUrl(e.target.value)} placeholder='https://example.com/blog'
                    style={{flex:1,padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,outline:'none'}}
                    onKeyDown={e=>e.key==='Enter'&&discoverAndAdd()}/>
                  <button onClick={discoverAndAdd} disabled={discovering||!addUrl.trim()}
                    style={{padding:'7px 16px',background:discovering||!addUrl.trim()?'#e5e7eb':'#2563eb',color:discovering||!addUrl.trim()?'#9ca3af':'#fff',border:'none',borderRadius:6,fontSize:13,fontWeight:600,cursor:discovering||!addUrl.trim()?'not-allowed':'pointer',whiteSpace:'nowrap'}}>
                    {discovering?<><span style={{display:'inline-block',width:10,height:10,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite',verticalAlign:'middle',marginRight:5}}/>Finding…</>:'Add Feed'}
                  </button>
                </div>
                {addError && <div style={{fontSize:12,color:'#dc2626',background:'#fee2e2',borderRadius:6,padding:'6px 10px'}}>{addError}</div>}
                {addSuccess && <div style={{fontSize:12,color:'#15803d',background:'#dcfce7',borderRadius:6,padding:'6px 10px',display:'flex',alignItems:'center',gap:6}}><CheckCircle size={13}/>{addSuccess}</div>}
              </div>
            )}

            {/* Source list */}
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {sources.length === 0 && <div style={{fontSize:13,color:'#94a3b8',textAlign:'center',padding:'16px 0'}}>No sources yet. Add one above.</div>}
              {sources.map(src => {
                const result = sourceResults.find(r=>r.id===src.id)
                return (
                  <div key={src.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:src.enabled?'#f8fafc':'#fff',border:'1px solid #e5e7eb',borderRadius:8,opacity:src.enabled?1:0.6}}>
                    <Globe size={14} color={src.enabled?'#2563eb':'#9ca3af'} style={{flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{src.name}</div>
                      <div style={{fontSize:11,color:'#9ca3af',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{src.feedUrl||src.url}</div>
                    </div>
                    <SourceBadge result={result}/>
                    {result?.status==='error' && <span title={result.error} style={{cursor:'help',color:'#dc2626',flexShrink:0}}><AlertTriangle size={14}/></span>}
                    <button onClick={()=>toggleSource(src.id)} title={src.enabled?'Disable':'Enable'}
                      style={{background:'none',border:'none',cursor:'pointer',color:src.enabled?'#2563eb':'#9ca3af',padding:'2px',display:'flex',alignItems:'center',flexShrink:0}}>
                      {src.enabled?<ToggleRight size={18}/>:<ToggleLeft size={18}/>}
                    </button>
                    <button onClick={()=>deleteSource(src.id)} title='Remove source'
                      style={{background:'none',border:'none',cursor:'pointer',color:'#d1d5db',padding:'2px',display:'flex',alignItems:'center',flexShrink:0}}
                      onMouseEnter={e=>e.currentTarget.style.color='#dc2626'} onMouseLeave={e=>e.currentTarget.style.color='#d1d5db'}>
                      <Trash2 size={14}/>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── TABS ── */}
          <div style={{display:'flex',marginBottom:16,borderBottom:'1px solid #e5e7eb'}}>
            {[
              {id:'feed',label:`RSS Feed (${visibleArticles.length}${articles.length?'/'+articles.filter(a=>!deletedIds.has(a.id)).length:''})`},
              {id:'kb',  label:`Knowledge Base (${knowledgeBase.length})`},
            ].map(t=>(
              <button key={t.id} onClick={()=>{setTab(t.id);setSearch('')}}
                style={{padding:'8px 18px',background:'transparent',border:'none',borderBottom:tab===t.id?'2px solid #2563eb':'2px solid transparent',fontSize:13,fontWeight:tab===t.id?700:500,color:tab===t.id?'#2563eb':'#64748b',cursor:'pointer',marginBottom:-1}}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── FEED TAB ── */}
          {tab==='feed'&&(
            <>
              {/* Feed controls */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap'}}>
                <div style={{position:'relative',flex:1,minWidth:160}}>
                  <Search size={13} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94a3b8',pointerEvents:'none'}}/>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search articles…'
                    style={{width:'100%',boxSizing:'border-box',paddingLeft:30,paddingRight:10,paddingTop:7,paddingBottom:7,border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,outline:'none',background:'#fff'}}/>
                </div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                  {[
                    {id:'all',   label:'All'},
                    {id:'pinned',label:`★ Pinned${totalPinned?` (${totalPinned})`:''}`,},
                    ...enabledSources.map(s=>({id:s.id,label:s.name.split(' ').slice(0,2).join(' ')})),
                  ].map(f=>(
                    <button key={f.id} onClick={()=>setFeedFilter(f.id)}
                      style={{fontSize:12,fontWeight:600,padding:'5px 11px',borderRadius:20,border:'1px solid',cursor:'pointer',background:feedFilter===f.id?'#0f172a':'#fff',color:feedFilter===f.id?'#fff':'#64748b',borderColor:feedFilter===f.id?'#0f172a':'#e5e7eb',whiteSpace:'nowrap'}}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Loading / empty states */}
              {fetching && !fetchedOnce && (
                <div style={{textAlign:'center',padding:'60px 20px'}}>
                  <div style={{display:'inline-block',width:28,height:28,border:'3px solid #e5e7eb',borderTopColor:'#2563eb',borderRadius:'50%',animation:'spin 0.7s linear infinite',marginBottom:12}}/>
                  <div style={{fontSize:14,color:'#64748b'}}>Loading RSS feeds…</div>
                </div>
              )}
              {!fetching && fetchedOnce && sortedArticles.length === 0 && (
                <div style={{textAlign:'center',padding:'60px 20px'}}>
                  <Globe size={32} color='#cbd5e1' style={{marginBottom:12}}/>
                  <div style={{fontSize:14,fontWeight:600,color:'#64748b',marginBottom:6}}>
                    {feedFilter==='pinned'?'No pinned articles yet':search?'No matching articles':'No RSS items found'}
                  </div>
                  <div style={{fontSize:13,color:'#94a3b8'}}>
                    {feedFilter==='pinned'?'Star articles to pin them here.':search?'Try a different search.':'Check your sources above or click "Refresh Feeds".'}
                  </div>
                </div>
              )}

              {/* Article grid */}
              {sortedArticles.length > 0 && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
                  {sortedArticles.map(article=>{
                    const isPinned = pinnedIds.has(article.id)
                    return (
                      <div key={article.id} className='mi-card'
                        style={{background:'#fff',border:`1px solid ${isPinned?'#fbbf24':'#e5e7eb'}`,borderRadius:10,padding:'13px 15px',transition:'border-color 0.1s,box-shadow 0.1s',position:'relative'}}>
                        {isPinned && <div style={{position:'absolute',top:10,right:10,fontSize:14}}>★</div>}
                        {/* Source + date */}
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:7,paddingRight:isPinned?20:0}}>
                          <span style={{fontSize:11,fontWeight:600,color:'#2563eb',background:'#eff6ff',borderRadius:4,padding:'2px 6px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:140}}>{article.sourceName}</span>
                          {article.publishedAt && <span style={{fontSize:11,color:'#94a3b8',flexShrink:0}}>{timeSince(article.publishedAt)}</span>}
                        </div>
                        {/* Title */}
                        <a href={article.link} target='_blank' rel='noopener noreferrer'
                          style={{fontSize:14,fontWeight:700,color:'#0f172a',lineHeight:1.4,display:'block',marginBottom:6,textDecoration:'none'}}
                          onMouseEnter={e=>e.currentTarget.style.color='#2563eb'} onMouseLeave={e=>e.currentTarget.style.color='#0f172a'}>
                          {article.title}
                        </a>
                        {/* Description */}
                        {article.description && (
                          <div style={{fontSize:12,color:'#64748b',lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',marginBottom:10}}>
                            {article.description}
                          </div>
                        )}
                        {/* Actions */}
                        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:'auto',paddingTop:8,borderTop:'1px solid #f3f4f6'}}>
                          <a href={article.link} target='_blank' rel='noopener noreferrer'
                            style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#2563eb',fontWeight:600,textDecoration:'none',background:'#eff6ff',borderRadius:5,padding:'4px 8px'}}
                            onMouseEnter={e=>e.currentTarget.style.background='#dbeafe'} onMouseLeave={e=>e.currentTarget.style.background='#eff6ff'}>
                            <ExternalLink size={11}/>Read
                          </a>
                          <span style={{fontSize:11,color:'#d1d5db',marginLeft:2}}>{fmtPub(article.publishedAt)}</span>
                          <div style={{marginLeft:'auto',display:'flex',gap:4}}>
                            <button onClick={()=>pinArticle(article.id)} title={isPinned?'Unpin':'Pin'}
                              style={{background:isPinned?'#fef3c7':'#f9fafb',border:`1px solid ${isPinned?'#fbbf24':'#e5e7eb'}`,borderRadius:5,padding:'4px 7px',cursor:'pointer',color:isPinned?'#d97706':'#9ca3af',fontSize:13,display:'flex',alignItems:'center'}}>
                              <Star size={12} fill={isPinned?'#fbbf24':'none'}/>
                            </button>
                            <button onClick={()=>deleteArticle(article.id)} title='Hide article'
                              style={{background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:5,padding:'4px 7px',cursor:'pointer',color:'#d1d5db',display:'flex',alignItems:'center'}}
                              onMouseEnter={e=>e.currentTarget.style.color='#dc2626'} onMouseLeave={e=>e.currentTarget.style.color='#d1d5db'}>
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Source errors */}
              {sourceResults.filter(r=>r.status==='error').length > 0 && (
                <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:6}}>
                  {sourceResults.filter(r=>r.status==='error').map(r=>(
                    <div key={r.id||r.name} style={{display:'flex',alignItems:'center',gap:8,background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#dc2626'}}>
                      <AlertTriangle size={13} style={{flexShrink:0}}/><strong>{r.name}:</strong> {r.error}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── KB TAB ── */}
          {tab==='kb'&&(
            <>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,gap:12}}>
                <div style={{position:'relative',flex:1,minWidth:160}}>
                  <Search size={13} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94a3b8',pointerEvents:'none'}}/>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search knowledge base…'
                    style={{width:'100%',boxSizing:'border-box',paddingLeft:30,paddingRight:10,paddingTop:7,paddingBottom:7,border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,outline:'none',background:'#fff'}}/>
                </div>
                <button onClick={()=>{setShowAddKb(true);setKbForm(BLANK_KB);setEditingKbId(null)}}
                  style={{display:'flex',alignItems:'center',gap:5,background:'#0f172a',color:'#fff',border:'none',borderRadius:8,padding:'7px 14px',fontSize:12,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                  <Plus size={13}/>Add Entry
                </button>
              </div>

              {showAddKb&&(
                <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,padding:'18px 20px',marginBottom:16}}>
                  <div style={{fontSize:13,fontWeight:700,color:'#0f172a',marginBottom:14}}>{editingKbId?'Edit Entry':'New Knowledge Base Entry'}</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                    <input value={kbForm.title} onChange={e=>setKbForm(f=>({...f,title:e.target.value}))} placeholder='Title *'
                      style={{gridColumn:'1/-1',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:7,fontSize:13,outline:'none'}}/>
                    <input value={kbForm.sourceUrl} onChange={e=>setKbForm(f=>({...f,sourceUrl:e.target.value}))} placeholder='Source URL (optional)'
                      style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:7,fontSize:13,outline:'none'}}/>
                    <select value={kbForm.category} onChange={e=>setKbForm(f=>({...f,category:e.target.value}))}
                      style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:7,fontSize:13,background:'#fff',outline:'none'}}>
                      {CAT_LIST.map(c=><option key={c}>{c}</option>)}
                    </select>
                    <input value={kbForm.relatedAccount} onChange={e=>setKbForm(f=>({...f,relatedAccount:e.target.value}))} placeholder='Related Account'
                      style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:7,fontSize:13,outline:'none'}}/>
                    <input value={kbForm.relatedVendor} onChange={e=>setKbForm(f=>({...f,relatedVendor:e.target.value}))} placeholder='Related Vendor'
                      style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:7,fontSize:13,outline:'none'}}/>
                    <input value={kbForm.tags} onChange={e=>setKbForm(f=>({...f,tags:e.target.value}))} placeholder='Tags, comma separated'
                      style={{gridColumn:'1/-1',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:7,fontSize:13,outline:'none'}}/>
                    <textarea value={kbForm.excerpt} onChange={e=>setKbForm(f=>({...f,excerpt:e.target.value}))} placeholder='Paste content or excerpt…'
                      rows={3} style={{gridColumn:'1/-1',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:7,fontSize:13,fontFamily:'inherit',resize:'vertical',outline:'none'}}/>
                    <textarea value={kbForm.notes} onChange={e=>setKbForm(f=>({...f,notes:e.target.value}))} placeholder='Your notes…'
                      rows={2} style={{gridColumn:'1/-1',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:7,fontSize:13,fontFamily:'inherit',resize:'vertical',outline:'none'}}/>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={saveKbEntry} disabled={!kbForm.title.trim()}
                      style={{background:kbForm.title.trim()?'#2563eb':'#e5e7eb',color:kbForm.title.trim()?'#fff':'#94a3b8',border:'none',borderRadius:7,padding:'8px 18px',fontSize:13,fontWeight:600,cursor:kbForm.title.trim()?'pointer':'not-allowed'}}>
                      {editingKbId?'Save Changes':'Save Entry'}
                    </button>
                    <button onClick={()=>{setShowAddKb(false);setKbForm(BLANK_KB);setEditingKbId(null)}}
                      style={{background:'#f1f5f9',color:'#64748b',border:'none',borderRadius:7,padding:'8px 14px',fontSize:13,cursor:'pointer'}}>Cancel</button>
                  </div>
                </div>
              )}

              {knowledgeBase.filter(item=>{
                if(!search) return true
                const q=search.toLowerCase()
                return `${item.title} ${item.notes||''} ${item.excerpt||''} ${item.relatedAccount||''} ${item.relatedVendor||''}`.toLowerCase().includes(q)
              }).length===0&&!showAddKb?(
                <div style={{textAlign:'center',padding:'60px 20px'}}>
                  <BookOpen size={32} color='#cbd5e1' style={{marginBottom:12}}/>
                  <div style={{fontSize:14,fontWeight:600,color:'#64748b',marginBottom:6}}>Knowledge base is empty</div>
                  <div style={{fontSize:13,color:'#94a3b8'}}>Add articles, research notes, or pasted content. Tag accounts and vendors to surface in Meeting Prep.</div>
                </div>
              ):(
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {knowledgeBase.filter(item=>{
                    if(!search) return true
                    const q=search.toLowerCase()
                    return `${item.title} ${item.notes||''} ${item.excerpt||''} ${item.relatedAccount||''} ${item.relatedVendor||''}`.toLowerCase().includes(q)
                  }).map(item=>{
                    const catColor=CAT_COLORS[item.category]||'#6b7280'
                    return (
                      <div key={item.id} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,padding:'12px 16px',display:'flex',alignItems:'flex-start',gap:12}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap'}}>
                            <span style={{fontSize:9,fontWeight:700,color:'#fff',background:catColor,borderRadius:4,padding:'2px 6px',textTransform:'uppercase'}}>{item.category||'Security'}</span>
                            {item.relatedAccount&&<span style={{fontSize:11,color:'#2563eb'}}>📂 {item.relatedAccount}</span>}
                            {item.relatedVendor&&<span style={{fontSize:11,color:'#7c3aed'}}>🔧 {item.relatedVendor}</span>}
                          </div>
                          <div style={{fontSize:14,fontWeight:600,color:'#0f172a',lineHeight:1.35}}>{item.title}</div>
                          {item.notes&&<div style={{fontSize:12,color:'#64748b',marginTop:3,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:1,WebkitBoxOrient:'vertical'}}>{item.notes}</div>}
                          {item.sourceUrl&&<a href={item.sourceUrl} target='_blank' rel='noopener noreferrer' style={{fontSize:11,color:'#2563eb',textDecoration:'none',marginTop:3,display:'inline-block'}}>Source ↗</a>}
                        </div>
                        <div style={{display:'flex',gap:6,flexShrink:0}}>
                          <button onClick={()=>{setKbForm({...item,tags:(item.tags||[]).join(', ')});setEditingKbId(item.id);setShowAddKb(true)}}
                            style={{background:'#f1f5f9',border:'none',borderRadius:7,padding:'5px 8px',cursor:'pointer',color:'#64748b',display:'flex',alignItems:'center'}}>
                            <Pencil size={13}/>
                          </button>
                          <button onClick={()=>deleteKbItem(item.id)}
                            style={{background:'#fee2e2',border:'none',borderRadius:7,padding:'5px 8px',cursor:'pointer',color:'#dc2626',display:'flex',alignItems:'center'}}>
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
