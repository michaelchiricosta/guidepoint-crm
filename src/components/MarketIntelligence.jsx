import { useState } from 'react'
import { ArrowLeft, Globe, RefreshCw, Plus, Trash2, X, Search, ExternalLink, Loader, BookOpen, Pencil } from 'lucide-react'
import { uid } from '../utils.js'

// TODO: Migrate blog sync to a Vercel serverless function / cron job for production.
// Currently uses allorigins.win CORS proxy for client-side blog fetching.
// This works for manual sync but is not suitable for high-frequency automated use.
// Suggested path: Vercel Edge Function at /api/sync-blog that fetches, parses, and returns posts.

const ALLORIGINS = 'https://api.allorigins.win/get?url='
const GP_WP_API = 'https://www.guidepointsecurity.com/wp-json/wp/v2/posts?per_page=20&_fields=id,title,link,date,excerpt'
const GP_RSS = 'https://www.guidepointsecurity.com/feed/'

const stripHtml = html => {
  try {
    const d = document.createElement('div')
    d.innerHTML = html || ''
    return (d.textContent || d.innerText || '').replace(/\s+/g, ' ').trim()
  } catch { return String(html || '') }
}

const detectCategory = text => {
  const t = (text || '').toLowerCase()
  if (/identity|iam|mfa|pam|privileged|entra|okta|sailpoint|saviynt|access management/.test(t)) return 'Identity & IAM'
  if (/ransomware|malware|phishing|threat|attack|breach|exploit|apt|adversary/.test(t)) return 'Threat Intelligence'
  if (/cloud|aws|azure|gcp|cspm|sase|zero.trust|cloudflare|zscaler|cnapp/.test(t)) return 'Cloud Security'
  if (/compliance|regulatory|hipaa|sox|pci|nist|gdpr|cmmc|audit|governance/.test(t)) return 'Compliance & Risk'
  if (/siem|soc|incident|detection|response|xdr|chronicle|splunk|mdr/.test(t)) return 'SOC & Detection'
  if (/\bai\b|machine.learning|llm|genai|artificial.intel/.test(t)) return 'AI Security'
  if (/endpoint|edr|crowdstrike|sentinelone|defender|epp|carbon.black/.test(t)) return 'Endpoint Security'
  if (/pen.test|penetration|red.team|vulnerability|patch|asm|scanning/.test(t)) return 'Vulnerability Mgmt'
  return 'Security News'
}

export const CAT_COLORS = {
  'Identity & IAM':     '#7c3aed',
  'Threat Intelligence':'#dc2626',
  'Cloud Security':     '#0891b2',
  'Compliance & Risk':  '#ea580c',
  'SOC & Detection':    '#1d4ed8',
  'AI Security':        '#059669',
  'Endpoint Security':  '#0f172a',
  'Vulnerability Mgmt': '#b45309',
  'Security News':      '#6b7280',
}

const CAT_LIST = Object.keys(CAT_COLORS)

const fmtDate = d => {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

const timeSince = iso => {
  if (!iso) return ''
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 2) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  } catch { return '' }
}

const parseWpPosts = posts =>
  (posts || [])
    .map(p => ({
      id: uid(),
      externalId: String(p.id || ''),
      title: stripHtml(p.title?.rendered || ''),
      sourceUrl: p.link || '',
      sourceName: 'GuidePoint Security Blog',
      sourceId: 'guidepointsecurity',
      excerpt: stripHtml(p.excerpt?.rendered || '').slice(0, 500),
      publishedDate: p.date ? p.date.split('T')[0] : '',
      type: 'blog',
      aiSummary: '', keyTakeaways: [], whyItMatters: '', applicableAccounts: [], suggestedUse: '',
      notes: '', relatedAccount: '', relatedVendor: '', tags: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }))
    .filter(p => p.title && p.sourceUrl)
    .map(p => ({ ...p, category: detectCategory(p.title + ' ' + p.excerpt) }))

const parseRssFeed = xml => {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    if (doc.querySelector('parsererror')) throw new Error('XML parse error')
    return Array.from(doc.querySelectorAll('item')).slice(0, 20).map(item => {
      const title = stripHtml(item.querySelector('title')?.textContent || '')
      const link = (item.querySelector('link')?.textContent || item.querySelector('guid')?.textContent || '').trim()
      const pubDate = item.querySelector('pubDate')?.textContent?.trim() || ''
      const desc = stripHtml(item.querySelector('description')?.textContent || '').slice(0, 500)
      let pubDateIso = ''
      try { if (pubDate) pubDateIso = new Date(pubDate).toISOString().split('T')[0] } catch {}
      if (!title || !link) return null
      return {
        id: uid(), externalId: link,
        title, sourceUrl: link, sourceName: 'GuidePoint Security Blog', sourceId: 'guidepointsecurity',
        excerpt: desc, publishedDate: pubDateIso, type: 'blog',
        category: detectCategory(title + ' ' + desc),
        aiSummary: '', keyTakeaways: [], whyItMatters: '', applicableAccounts: [], suggestedUse: '',
        notes: '', relatedAccount: '', relatedVendor: '', tags: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }
    }).filter(Boolean)
  } catch { return [] }
}

const BLANK_KB = { title: '', sourceUrl: '', category: 'Security News', notes: '', relatedAccount: '', relatedVendor: '', tags: '', excerpt: '' }

// ---- Item Detail Modal ----
function ItemModal({ item, onClose, onDelete }) {
  if (!item) return null
  const catColor = CAT_COLORS[item.category] || '#6b7280'
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 620, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 20px 0', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: catColor, borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.category || 'Security News'}</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{item.sourceName || (item.type === 'manual' ? 'Manual Entry' : '')}</span>
              {item.publishedDate && <span style={{ fontSize: 11, color: '#94a3b8' }}>· {fmtDate(item.publishedDate)}</span>}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', lineHeight: 1.3, marginBottom: 4 }}>{item.title}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                style={{ background: '#eff6ff', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#2563eb', textDecoration: 'none' }}>
                <ExternalLink size={15} />
              </a>
            )}
            <button onClick={() => { onDelete(item.id); onClose() }}
              style={{ background: '#fee2e2', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#dc2626' }}>
              <Trash2 size={15} />
            </button>
            <button onClick={onClose}
              style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#64748b' }}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div style={{ padding: '16px 20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {item.excerpt && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Excerpt</div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{item.excerpt}</div>
            </div>
          )}
          {item.aiSummary && (
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', borderLeft: '2px solid #2563eb' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>AI Summary</div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{item.aiSummary}</div>
            </div>
          )}
          {item.keyTakeaways?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Key Takeaways</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {item.keyTakeaways.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 700, marginTop: 1, flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {item.whyItMatters && (
            <div style={{ background: '#fffbeb', borderRadius: 8, padding: '10px 14px', border: '1px solid #fde68a' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Why It Matters</div>
              <div style={{ fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>{item.whyItMatters}</div>
            </div>
          )}
          {item.suggestedUse && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Use In Conversation</div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65, fontStyle: 'italic' }}>{item.suggestedUse}</div>
            </div>
          )}
          {item.notes && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Notes</div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{item.notes}</div>
            </div>
          )}
          {(item.relatedAccount || item.relatedVendor || (item.tags || []).length > 0) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {item.relatedAccount && <span style={{ fontSize: 12, color: '#2563eb', background: '#eff6ff', borderRadius: 6, padding: '3px 10px', fontWeight: 500 }}>📂 {item.relatedAccount}</span>}
              {item.relatedVendor && <span style={{ fontSize: 12, color: '#7c3aed', background: '#f5f3ff', borderRadius: 6, padding: '3px 10px', fontWeight: 500 }}>🔧 {item.relatedVendor}</span>}
              {(item.tags || []).map(t => <span key={t} style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '2px 8px' }}>{t}</span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Main Component ----
export default function MarketIntelligence({ data, setData, onBack }) {
  const [tab, setTab] = useState('feed')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(null)
  const [syncError, setSyncError] = useState(null)
  const [syncResult, setSyncResult] = useState(null)
  const [openItem, setOpenItem] = useState(null)
  const [showAddKb, setShowAddKb] = useState(false)
  const [kbForm, setKbForm] = useState(BLANK_KB)
  const [editingKbId, setEditingKbId] = useState(null)
  const [generatingAI, setGeneratingAI] = useState(null)

  const marketPulses = data.marketPulses || []
  const knowledgeBase = data.knowledgeBase || []
  const blogSources = data.blogSources || []
  const gpSource = blogSources.find(s => s.id === 'guidepointsecurity') || null

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const allItems = [
    ...marketPulses.map(p => ({ ...p, _list: 'pulse' })),
    ...knowledgeBase.map(p => ({ ...p, _list: 'kb' })),
  ]
  const filtered = allItems.filter(item => {
    if (tab === 'kb' && item._list !== 'kb') return false
    if (tab === 'feed' && item._list !== 'pulse') return false
    if (filter === 'blog' && item.type !== 'blog') return false
    if (filter === 'manual' && item.type !== 'manual') return false
    if (filter === 'recent' && (!item.publishedDate || item.publishedDate < thirtyDaysAgo)) return false
    if (filter === 'gp' && item.sourceId !== 'guidepointsecurity') return false
    if (search) {
      const q = search.toLowerCase()
      if (!(item.title + ' ' + (item.excerpt || '') + ' ' + (item.category || '') + ' ' + (item.sourceName || '') + ' ' + (item.aiSummary || '')).toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a, b) => {
    const da = a.publishedDate || a.createdAt || ''
    const db = b.publishedDate || b.createdAt || ''
    return db.localeCompare(da)
  })

  // ---- Blog Fetch ----
  const fetchBlogPosts = async () => {
    const abortCtrl = new AbortController()
    const toId = setTimeout(() => abortCtrl.abort(), 22000)
    try {
      // Try WP REST API first
      try {
        const res = await fetch(ALLORIGINS + encodeURIComponent(GP_WP_API), { signal: abortCtrl.signal })
        clearTimeout(toId)
        if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`)
        const wrapper = await res.json()
        if (!wrapper.contents) throw new Error('Empty proxy response')
        const posts = JSON.parse(wrapper.contents)
        if (!Array.isArray(posts) || !posts.length) throw new Error('WP API returned no posts')
        return { posts: parseWpPosts(posts), method: 'WordPress API' }
      } catch (wpErr) {
        // Fall back to RSS
        const res2 = await fetch(ALLORIGINS + encodeURIComponent(GP_RSS), { signal: abortCtrl.signal })
        clearTimeout(toId)
        if (!res2.ok) throw new Error(`RSS proxy HTTP ${res2.status}`)
        const wrapper2 = await res2.json()
        if (!wrapper2.contents) throw new Error('Empty RSS response')
        const posts2 = parseRssFeed(wrapper2.contents)
        if (!posts2.length) throw new Error('No items parsed from RSS feed')
        return { posts: posts2, method: 'RSS feed' }
      }
    } catch (err) {
      clearTimeout(toId)
      throw err
    }
  }

  // ---- AI Summarize (batch) ----
  const aiSummarizePosts = async (posts, apiKey) => {
    if (!posts.length || !apiKey) return posts
    const input = posts.slice(0, 10).map(p => ({
      id: p.id, title: p.title,
      excerpt: (p.excerpt || '').slice(0, 300),
      category: p.category,
    }))
    const sys = `You analyze GuidePoint Security blog posts for an enterprise security sales rep named Mike at GuidePoint. Return ONLY a JSON array with one object per post:
[{"id":"same as input","aiSummary":"2-3 sentences: enterprise security insight and business relevance","keyTakeaways":["takeaway 1","takeaway 2","takeaway 3"],"whyItMatters":"one sentence on strategic significance for enterprise buyers","applicableAccounts":["insurance","financial services","healthcare","or other relevant industries"],"suggestedUse":"one specific way Mike could reference this in a client call"}]`
    const usr = `Analyze these blog posts for sales intelligence:\n${JSON.stringify(input, null, 2)}`
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, system: sys, messages: [{ role: 'user', content: usr }] }),
    })
    const rd = await res.json()
    if (!res.ok) throw new Error(`AI ${res.status}: ${rd.error?.message || JSON.stringify(rd)}`)
    const raw = rd.content?.[0]?.text || ''
    let summaries = []
    try {
      const s = raw.indexOf('['), e = raw.lastIndexOf(']')
      if (s !== -1 && e !== -1) summaries = JSON.parse(raw.slice(s, e + 1))
    } catch {}
    return posts.map(p => {
      const s = summaries.find(s => s.id === p.id)
      return s ? { ...p, aiSummary: s.aiSummary || '', keyTakeaways: s.keyTakeaways || [], whyItMatters: s.whyItMatters || '', applicableAccounts: s.applicableAccounts || [], suggestedUse: s.suggestedUse || '' } : p
    })
  }

  // ---- Sync Blog ----
  const syncBlogSource = async () => {
    setSyncing('guidepointsecurity')
    setSyncError(null)
    setSyncResult(null)
    const now = new Date().toISOString()
    try {
      const { posts, method } = await fetchBlogPosts()
      const existing = data.marketPulses || []
      const existingUrls = new Set(existing.map(p => p.sourceUrl).filter(Boolean))
      const newPosts = posts.filter(p => p.sourceUrl && !existingUrls.has(p.sourceUrl))
      const skipped = posts.length - newPosts.length

      let finalPosts = newPosts
      if (newPosts.length > 0 && data.apiKey) {
        try { finalPosts = await aiSummarizePosts(newPosts, data.apiKey) }
        catch (aiErr) { console.warn('AI summarization skipped:', aiErr.message) }
      }

      const updatedPulses = [...finalPosts, ...existing].slice(0, 300)
      const updatedSources = ensureGpSource(data.blogSources).map(s =>
        s.id === 'guidepointsecurity'
          ? { ...s, lastSyncedAt: now, lastSyncStatus: 'success', lastSyncNewItems: finalPosts.length, lastSyncSkipped: skipped, lastSyncError: null }
          : s
      )
      setData(prev => ({ ...prev, marketPulses: updatedPulses, blogSources: updatedSources }))
      setSyncResult({ newItems: finalPosts.length, skipped, method, aiDone: !!data.apiKey && newPosts.length > 0 })
    } catch (err) {
      const updatedSources = ensureGpSource(data.blogSources).map(s =>
        s.id === 'guidepointsecurity'
          ? { ...s, lastSyncedAt: now, lastSyncStatus: 'error', lastSyncError: err.message }
          : s
      )
      setData(prev => ({ ...prev, blogSources: updatedSources }))
      setSyncError(err.message)
    } finally {
      setSyncing(null)
    }
  }

  // ---- AI Summarize Single ----
  const generateSingleAI = async item => {
    if (!data.apiKey || generatingAI) return
    setGeneratingAI(item.id)
    try {
      const [summarized] = await aiSummarizePosts([item], data.apiKey)
      const updateList = (list, updated) => list.map(p => p.id === updated.id ? updated : p)
      setData(prev => ({
        ...prev,
        marketPulses: updateList(prev.marketPulses || [], summarized),
        knowledgeBase: updateList(prev.knowledgeBase || [], summarized),
      }))
      if (openItem?.id === item.id) setOpenItem(summarized)
    } catch (err) { console.warn('Single AI failed:', err.message) }
    finally { setGeneratingAI(null) }
  }

  // ---- KB CRUD ----
  const deleteItem = id => {
    setData(prev => ({
      ...prev,
      marketPulses: (prev.marketPulses || []).filter(p => p.id !== id),
      knowledgeBase: (prev.knowledgeBase || []).filter(p => p.id !== id),
    }))
    if (openItem?.id === id) setOpenItem(null)
  }

  const saveKbEntry = () => {
    if (!kbForm.title.trim()) return
    const now = new Date().toISOString()
    const tags = kbForm.tags.split(',').map(t => t.trim()).filter(Boolean)
    if (editingKbId) {
      setData(prev => ({
        ...prev,
        knowledgeBase: (prev.knowledgeBase || []).map(p =>
          p.id === editingKbId ? { ...p, ...kbForm, tags, type: 'manual', updatedAt: now } : p
        ),
      }))
    } else {
      const entry = {
        id: uid(), type: 'manual', ...kbForm, tags,
        sourceName: kbForm.sourceUrl ? 'External' : 'Manual Entry',
        publishedDate: '', aiSummary: '', keyTakeaways: [], whyItMatters: '', applicableAccounts: [], suggestedUse: '',
        createdAt: now, updatedAt: now,
      }
      setData(prev => ({ ...prev, knowledgeBase: [entry, ...(prev.knowledgeBase || [])] }))
    }
    setKbForm(BLANK_KB)
    setShowAddKb(false)
    setEditingKbId(null)
  }

  const FEED_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'gp', label: 'GuidePoint Blog' },
    { id: 'recent', label: 'Recent (30d)' },
  ]

  const ItemCard = ({ item }) => {
    const catColor = CAT_COLORS[item.category] || '#6b7280'
    const hasAI = !!item.aiSummary
    return (
      <div onClick={() => setOpenItem(item)}
        style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.1s, box-shadow 0.1s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(37,99,235,0.08)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: catColor, borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{item.category || 'Security'}</span>
          {item.type === 'blog' && <span style={{ fontSize: 10, color: '#64748b' }}>{item.sourceName}</span>}
          {item.type === 'manual' && <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>Manual</span>}
          {item.publishedDate && <span style={{ fontSize: 10, color: '#94a3b8' }}>· {fmtDate(item.publishedDate)}</span>}
          {hasAI && <span style={{ fontSize: 9, fontWeight: 700, color: '#059669', background: '#f0fdf4', borderRadius: 4, padding: '1px 5px', marginLeft: 'auto', flexShrink: 0 }}>✨ AI</span>}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.4, marginBottom: 5 }}>{item.title}</div>
        {item.aiSummary
          ? <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.aiSummary}</div>
          : item.excerpt
            ? <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.excerpt}</div>
            : null}
        {item.relatedAccount && <div style={{ fontSize: 11, color: '#2563eb', marginTop: 5, fontWeight: 500 }}>📂 {item.relatedAccount}</div>}
        {!hasAI && data.apiKey && (
          <button onClick={e => { e.stopPropagation(); generateSingleAI(item) }} disabled={!!generatingAI}
            style={{ marginTop: 8, fontSize: 11, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, padding: '3px 8px', cursor: generatingAI ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            {generatingAI === item.id ? <><Loader size={10} style={{ animation: 'spin 0.8s linear infinite' }} /> Generating...</> : '✨ Generate AI Summary'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#f8fafc' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* TOP BAR */}
      <div style={{ background: '#0f172a', padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}
          onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
          onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
          <ArrowLeft size={15} /> Back to Dashboard
        </button>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
        <Globe size={15} color='#60a5fa' />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Market Intelligence</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#475569' }}>{marketPulses.length + knowledgeBase.length} items</span>
      </div>

      {/* BODY */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px 60px', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {/* SOURCES CARD */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Blog Sources</div>
            {/* TODO: Add /api/sync-blog serverless function + Vercel cron for auto-sync */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Globe size={16} color='#2563eb' style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>GuidePoint Security Blog</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>guidepointsecurity.com/blog · via WordPress API + RSS fallback</div>
              </div>
              {gpSource?.lastSyncedAt && (
                <div style={{ fontSize: 11, color: gpSource.lastSyncStatus === 'error' ? '#dc2626' : '#64748b', textAlign: 'right', flexShrink: 0 }}>
                  {timeSince(gpSource.lastSyncedAt)}<br />
                  {gpSource.lastSyncStatus === 'success' && <span style={{ color: '#15803d' }}>+{gpSource.lastSyncNewItems || 0} new · {gpSource.lastSyncSkipped || 0} skipped</span>}
                  {gpSource.lastSyncStatus === 'error' && <span style={{ color: '#dc2626' }}>Error on last sync</span>}
                </div>
              )}
              <button onClick={syncBlogSource} disabled={!!syncing}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: syncing ? '#f1f5f9' : '#0f172a', color: syncing ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
                {syncing === 'guidepointsecurity'
                  ? <><Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Syncing...</>
                  : <><RefreshCw size={12} /> Sync GuidePoint Blog</>}
              </button>
            </div>
            {syncError && (
              <div style={{ marginTop: 10, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#dc2626' }}>
                <strong>Sync failed:</strong> {syncError}
                <div style={{ marginTop: 3, color: '#991b1b', fontSize: 11 }}>This may be a temporary network issue with the CORS proxy. Try again in a moment.</div>
              </div>
            )}
            {syncResult && (
              <div style={{ marginTop: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#15803d' }}>
                ✓ Synced via {syncResult.method} — <strong>{syncResult.newItems}</strong> new post{syncResult.newItems !== 1 ? 's' : ''} added, {syncResult.skipped} duplicate{syncResult.skipped !== 1 ? 's' : ''} skipped
                {syncResult.aiDone ? ' · AI summaries generated' : syncResult.newItems > 0 ? ' · Add API key in Settings to enable AI summaries' : ''}
              </div>
            )}
          </div>

          {/* TABS */}
          <div style={{ display: 'flex', marginBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
            {[
              { id: 'feed', label: `Intelligence Feed (${marketPulses.length})` },
              { id: 'kb', label: `Knowledge Base (${knowledgeBase.length})` },
            ].map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setFilter('all'); setSearch('') }}
                style={{ padding: '8px 18px', background: 'transparent', border: 'none', borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent', fontSize: 13, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? '#2563eb' : '#64748b', cursor: 'pointer', marginBottom: -1 }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ---- FEED TAB ---- */}
          {tab === 'feed' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search posts..."
                    style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }} />
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {FEED_FILTERS.map(f => (
                    <button key={f.id} onClick={() => setFilter(f.id)}
                      style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 20, border: '1px solid', cursor: 'pointer', background: filter === f.id ? '#0f172a' : '#fff', color: filter === f.id ? '#fff' : '#64748b', borderColor: filter === f.id ? '#0f172a' : '#e5e7eb' }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <Globe size={32} color='#cbd5e1' style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>No posts yet</div>
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>Click "Sync GuidePoint Blog" above to pull the latest posts.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 12 }}>
                  {filtered.map(item => <ItemCard key={item.id} item={item} />)}
                </div>
              )}
            </>
          )}

          {/* ---- KB TAB ---- */}
          {tab === 'kb' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search knowledge base..."
                    style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }} />
                </div>
                <button onClick={() => { setShowAddKb(true); setKbForm(BLANK_KB); setEditingKbId(null) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  <Plus size={13} /> Add Entry
                </button>
              </div>

              {showAddKb && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>{editingKbId ? 'Edit Entry' : 'New Knowledge Base Entry'}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <input value={kbForm.title} onChange={e => setKbForm(f => ({ ...f, title: e.target.value }))} placeholder="Title *"
                      style={{ gridColumn: '1/-1', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, outline: 'none' }} />
                    <input value={kbForm.sourceUrl} onChange={e => setKbForm(f => ({ ...f, sourceUrl: e.target.value }))} placeholder="Source URL (optional)"
                      style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, outline: 'none' }} />
                    <select value={kbForm.category} onChange={e => setKbForm(f => ({ ...f, category: e.target.value }))}
                      style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', outline: 'none' }}>
                      {CAT_LIST.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <input value={kbForm.relatedAccount} onChange={e => setKbForm(f => ({ ...f, relatedAccount: e.target.value }))} placeholder="Related Account (optional)"
                      style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, outline: 'none' }} />
                    <input value={kbForm.relatedVendor} onChange={e => setKbForm(f => ({ ...f, relatedVendor: e.target.value }))} placeholder="Related Vendor (optional)"
                      style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, outline: 'none' }} />
                    <input value={kbForm.tags} onChange={e => setKbForm(f => ({ ...f, tags: e.target.value }))} placeholder="Tags, comma separated"
                      style={{ gridColumn: '1/-1', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, outline: 'none' }} />
                    <textarea value={kbForm.excerpt} onChange={e => setKbForm(f => ({ ...f, excerpt: e.target.value }))} placeholder="Paste content or excerpt here..."
                      rows={3} style={{ gridColumn: '1/-1', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
                    <textarea value={kbForm.notes} onChange={e => setKbForm(f => ({ ...f, notes: e.target.value }))} placeholder="Your notes..."
                      rows={2} style={{ gridColumn: '1/-1', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={saveKbEntry} disabled={!kbForm.title.trim()}
                      style={{ background: kbForm.title.trim() ? '#2563eb' : '#e5e7eb', color: kbForm.title.trim() ? '#fff' : '#94a3b8', border: 'none', borderRadius: 7, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: kbForm.title.trim() ? 'pointer' : 'not-allowed' }}>
                      {editingKbId ? 'Save Changes' : 'Save Entry'}
                    </button>
                    <button onClick={() => { setShowAddKb(false); setKbForm(BLANK_KB); setEditingKbId(null) }}
                      style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {filtered.length === 0 && !showAddKb ? (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <BookOpen size={32} color='#cbd5e1' style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Knowledge base is empty</div>
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>Add articles, research, or pasted content. Tag accounts and vendors to surface in Meeting Prep.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filtered.map(item => {
                    const catColor = CAT_COLORS[item.category] || '#6b7280'
                    return (
                      <div key={item.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setOpenItem(item)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: catColor, borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase' }}>{item.category || 'Security'}</span>
                            {item.relatedAccount && <span style={{ fontSize: 11, color: '#2563eb' }}>📂 {item.relatedAccount}</span>}
                            {item.relatedVendor && <span style={{ fontSize: 11, color: '#7c3aed' }}>🔧 {item.relatedVendor}</span>}
                            {!!item.aiSummary && <span style={{ fontSize: 9, color: '#059669', fontWeight: 700, background: '#f0fdf4', borderRadius: 4, padding: '1px 5px', marginLeft: 'auto' }}>✨ AI</span>}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', lineHeight: 1.35 }}>{item.title}</div>
                          {item.notes && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{item.notes}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {!item.aiSummary && data.apiKey && (
                            <button onClick={() => generateSingleAI(item)} disabled={!!generatingAI} title="Generate AI summary"
                              style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 7, padding: '5px 8px', cursor: generatingAI === item.id ? 'not-allowed' : 'pointer', color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                              {generatingAI === item.id ? <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : '✨'}
                            </button>
                          )}
                          <button onClick={() => { setKbForm({ ...item, tags: (item.tags || []).join(', ') }); setEditingKbId(item.id); setShowAddKb(true) }}
                            style={{ background: '#f1f5f9', border: 'none', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteItem(item.id)}
                            style={{ background: '#fee2e2', border: 'none', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
                            <Trash2 size={13} />
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

      {openItem && (
        <ItemModal item={openItem} onClose={() => setOpenItem(null)} onDelete={deleteItem} />
      )}
    </div>
  )
}

// ---- Helper used by sync to ensure GP source exists ----
function ensureGpSource(sources) {
  const list = sources || []
  if (list.find(s => s.id === 'guidepointsecurity')) return list
  return [...list, {
    id: 'guidepointsecurity', name: 'GuidePoint Security Blog',
    url: 'https://www.guidepointsecurity.com/blog/',
    enabled: true, lastSyncedAt: null, lastSyncStatus: null,
    lastSyncNewItems: 0, lastSyncSkipped: 0, lastSyncError: null,
  }]
}
