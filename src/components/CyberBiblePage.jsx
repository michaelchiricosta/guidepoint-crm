import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, BookOpen, Zap, RefreshCw, Search, X, ChevronDown, ChevronRight, GitCompare, Loader, Database } from 'lucide-react'
import { S } from '../theme.js'
import { enrichVendor, compareVendors } from '../utils/cyberBible.js'
import { supabase } from '../supabase.js'

// Vendors shown in the grid before Supabase data loads (name + rank only)
const SEED_NAMES = [
  'CrowdStrike', 'Palo Alto Networks', 'Zscaler', 'Proofpoint', 'Splunk',
  'Wiz', 'ReliaQuest', 'Okta', 'Varonis', 'CyberArk',
  'F5', 'Tenable', 'SentinelOne', 'Rapid7', 'Netskope',
  'Abnormal AI', 'Deepwatch', 'Axonius', 'Cloudflare', 'Expel',
  'SailPoint', 'Delinea', 'Cribl', 'Google Security Operations', 'Snyk',
  'Qualys', 'Ping Identity', 'Cisco Security', 'Check Point Software Technologies', 'Corelight',
]

const DOMAINS = ['Identity & Access', 'Cloud & App Security', 'Network & Infra', 'Data & Endpoint', 'Risk & Compliance', 'OT/IoT', 'Sec Operations']

const DOMAIN_COLORS = {
  'Identity & Access':    { bg: '#EDE9FE', text: '#7C3AED' },
  'Cloud & App Security': { bg: '#DBEAFE', text: '#1D4ED8' },
  'Network & Infra':      { bg: '#D1FAE5', text: '#059669' },
  'Data & Endpoint':      { bg: '#FEF3C7', text: '#D97706' },
  'Risk & Compliance':    { bg: '#FEE2E2', text: '#DC2626' },
  'OT/IoT':               { bg: '#FCE7F3', text: '#BE185D' },
  'Sec Operations':       { bg: '#E0F2FE', text: '#0369A1' },
}

const POSITION_STYLE = {
  'Leader':       { bg: '#007AFF', text: '#FFFFFF' },
  'Challenger':   { bg: '#10B981', text: '#FFFFFF' },
  'Up and Comer': { bg: '#F59E0B', text: '#FFFFFF' },
  'Niche':        { bg: '#6B7280', text: '#FFFFFF' },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function DomainPill({ domain }) {
  const c = DOMAIN_COLORS[domain] || { bg: '#F3F4F6', text: '#374151' }
  return (
    <span style={{ background: c.bg, color: c.text, borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>
      {domain}
    </span>
  )
}

function PositionBadge({ position }) {
  if (!position) return null
  const s = POSITION_STYLE[position] || { bg: '#E5E7EB', text: '#374151' }
  return (
    <span style={{ background: s.bg, color: s.text, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
      {position}
    </span>
  )
}

function Spinner({ size = 16 }) {
  return <Loader size={size} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
}

function CollapsibleSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: `1px solid ${S.bdr}`, paddingBottom: 12, marginBottom: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: S.txt, fontWeight: 600, fontSize: 13 }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  )
}

function BulletList({ items, color }) {
  if (!items?.length) return <span style={{ color: S.muted, fontSize: 13 }}>None listed</span>
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 13, color: color || S.txt, marginBottom: 4 }}>{item}</li>
      ))}
    </ul>
  )
}

// ── Supabase data layer ───────────────────────────────────────────────────────

async function fetchAllVendors() {
  const { data, error } = await supabase
    .from('cyber_bible_vendors')
    .select('id, name, slug, cogs_rank, tagline, overview, industry_position, industry_position_reason, founded_year, hq, website, last_enriched_at')
    .order('cogs_rank', { ascending: true })
  if (error) throw error
  return data || []
}

async function fetchProductsForVendor(vendorId) {
  const { data, error } = await supabase
    .from('cyber_bible_products')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('name', { ascending: true })
  if (error) throw error
  return data || []
}

async function countProductsForVendors(vendorIds) {
  if (!vendorIds.length) return {}
  const { data, error } = await supabase
    .from('cyber_bible_products')
    .select('vendor_id, primary_domain')
    .in('vendor_id', vendorIds)
  if (error) return {}
  const counts = {}
  const domains = {}
  ;(data || []).forEach(p => {
    counts[p.vendor_id] = (counts[p.vendor_id] || 0) + 1
    if (!domains[p.vendor_id]) domains[p.vendor_id] = new Set()
    if (p.primary_domain) domains[p.vendor_id].add(p.primary_domain)
  })
  return { counts, domains: Object.fromEntries(Object.entries(domains).map(([k, v]) => [k, Array.from(v)])) }
}

async function upsertVendorToSupabase(vendorName, cogsRank, profile) {
  const { data: vendorRow, error: vendorErr } = await supabase
    .from('cyber_bible_vendors')
    .upsert({
      name: vendorName,
      slug: slugify(vendorName),
      cogs_rank: cogsRank,
      tagline: profile.tagline,
      overview: profile.overview,
      industry_position: profile.industry_position,
      industry_position_reason: profile.industry_position_reason,
      founded_year: profile.founded_year || null,
      hq: profile.hq || null,
      website: profile.website || null,
      last_enriched_at: new Date().toISOString(),
    }, { onConflict: 'slug' })
    .select()
    .single()

  if (vendorErr) throw vendorErr

  // Replace products
  await supabase.from('cyber_bible_products').delete().eq('vendor_id', vendorRow.id)

  if (profile.products?.length) {
    const products = profile.products.map(p => ({
      vendor_id: vendorRow.id,
      name: p.name,
      description: p.description || null,
      primary_domain: p.primary_domain || null,
      primary_sub_domain: p.primary_sub_domain || null,
      secondary_domains: p.secondary_domains || [],
      key_capabilities: p.key_capabilities || [],
      ideal_customer: p.ideal_customer || null,
      not_a_fit_when: p.not_a_fit_when || null,
      differentiators: p.differentiators || [],
      weaknesses: p.weaknesses || [],
      things_to_watch_out_for: p.things_to_watch_out_for || [],
      typical_competitors: p.typical_competitors || [],
    }))
    const { error: prodErr } = await supabase.from('cyber_bible_products').insert(products)
    if (prodErr) throw prodErr
  }

  return vendorRow
}

// ── Compare modal ─────────────────────────────────────────────────────────────

function CompareModal({ vendorA, productA, allVendors, onClose, comparisons, onSaveComparison }) {
  const [vendorBId, setVendorBId] = useState('')
  const [selectedProductB, setSelectedProductB] = useState(null)
  const [productsB, setProductsB] = useState([])
  const [searchB, setSearchB] = useState('')
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [loadingB, setLoadingB] = useState(false)
  const [err, setErr] = useState(null)

  const vendorB = allVendors.find(v => v.id === vendorBId) || null
  const cacheKey = `${vendorA.name}|${productA?.name || ''}|${vendorB?.name || ''}|${selectedProductB?.name || ''}`

  useEffect(() => {
    if (!vendorBId) { setProductsB([]); setSelectedProductB(null); return }
    setLoadingB(true)
    fetchProductsForVendor(vendorBId).then(p => { setProductsB(p); setLoadingB(false) }).catch(() => setLoadingB(false))
  }, [vendorBId])

  useEffect(() => {
    if (comparisons[cacheKey]) setResult(comparisons[cacheKey])
    else setResult(null)
  }, [cacheKey])

  async function runCompare() {
    setRunning(true); setErr(null)
    try {
      const res = await compareVendors(vendorA.name, productA?.name || '', vendorB?.name || '', selectedProductB?.name || '')
      setResult(res)
      onSaveComparison(cacheKey, res)
    } catch (e) { setErr(e.message) }
    finally { setRunning(false) }
  }

  const filteredVendors = allVendors.filter(v => v.id !== vendorA.id && v.name.toLowerCase().includes(searchB.toLowerCase()))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ background: S.surf, borderRadius: 16, width: '100%', maxWidth: 760, maxHeight: '90vh', overflow: 'auto', padding: 32 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: S.txt }}>Compare Vendors</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.muted }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ background: '#EBF4FF', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#007AFF', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Vendor A (pre-selected)</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: S.txt }}>{vendorA.name}</div>
            {productA && <div style={{ fontSize: 13, color: S.muted, marginTop: 4 }}>{productA.name}</div>}
          </div>
          <div style={{ background: S.bg, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: S.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Vendor B</div>
            {!vendorBId ? (
              <>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: S.muted }} />
                  <input value={searchB} onChange={e => setSearchB(e.target.value)} placeholder="Search vendors…"
                    style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 8, border: `1px solid ${S.bdr}`, fontSize: 13, background: S.surf, color: S.txt, boxSizing: 'border-box' }} />
                </div>
                <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                  {filteredVendors.map(v => (
                    <div key={v.id} onClick={() => setVendorBId(v.id)}
                      style={{ padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: S.txt }}
                      onMouseEnter={e => e.currentTarget.style.background = S.bdr}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >{v.name}</div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 15, color: S.txt }}>{vendorB?.name}</div>
                <button onClick={() => { setVendorBId(''); setSelectedProductB(null); setSearchB('') }} style={{ fontSize: 11, color: '#007AFF', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>Change</button>
                {loadingB ? <div style={{ fontSize: 12, color: S.muted, marginTop: 8 }}>Loading products…</div> : productsB.length > 0 && (
                  <select value={selectedProductB?.id || ''} onChange={e => setSelectedProductB(productsB.find(p => p.id === e.target.value) || null)}
                    style={{ display: 'block', marginTop: 8, width: '100%', padding: '6px 8px', borderRadius: 8, border: `1px solid ${S.bdr}`, fontSize: 13, background: S.surf, color: S.txt }}>
                    <option value="">All products</option>
                    {productsB.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </>
            )}
          </div>
        </div>

        <button onClick={runCompare} disabled={!vendorBId || running}
          style={{ background: (!vendorBId || running) ? S.bdr : '#007AFF', color: (!vendorBId || running) ? S.muted : '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: (!vendorBId || running) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          {running ? <><Spinner /> Running…</> : <><GitCompare size={14} /> Run Comparison</>}
        </button>

        {err && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16 }}>{err}</div>}

        {result && (
          <div>
            <div style={{ background: '#F4F6F9', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: S.txt, marginBottom: 4 }}>{result.headline}</div>
              <div style={{ fontSize: 13, color: S.muted }}>{result.capability_overlap}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div style={{ background: '#D1FAE5', borderRadius: 10, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#059669', marginBottom: 8 }}>Choose {vendorA.name} if…</div>
                <div style={{ fontSize: 13, color: '#065F46', lineHeight: 1.6 }}>{result.choose_a_if}</div>
              </div>
              <div style={{ background: '#DBEAFE', borderRadius: 10, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1D4ED8', marginBottom: 8 }}>Choose {vendorB?.name} if…</div>
                <div style={{ fontSize: 13, color: '#1E3A8A', lineHeight: 1.6 }}>{result.choose_b_if}</div>
              </div>
            </div>
            {result.key_differences?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: S.txt, marginBottom: 10 }}>Key Differences</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: S.bg }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: S.muted, fontWeight: 600 }}>Dimension</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: S.muted, fontWeight: 600 }}>{vendorA.name}</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: S.muted, fontWeight: 600 }}>{vendorB?.name}</th>
                  </tr></thead>
                  <tbody>
                    {result.key_differences.map((d, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${S.bdr}` }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: S.txt }}>{d.dimension}</td>
                        <td style={{ padding: '8px 12px', color: S.muted }}>{d.vendor_a}</td>
                        <td style={{ padding: '8px 12px', color: S.muted }}>{d.vendor_b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.guidepoint_angle && (
              <div style={{ background: '#EBF4FF', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#007AFF', marginBottom: 6 }}>GuidePoint Angle</div>
                <div style={{ fontSize: 13, color: '#1D4ED8', lineHeight: 1.6 }}>{result.guidepoint_angle}</div>
              </div>
            )}
            {result.bottom_line && (
              <div style={{ background: S.bg, borderRadius: 10, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: S.txt, marginBottom: 6 }}>Bottom Line</div>
                <div style={{ fontSize: 13, color: S.muted, lineHeight: 1.6 }}>{result.bottom_line}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Product card ──────────────────────────────────────────────────────────────

function ProductCard({ product, onCompare }) {
  return (
    <div style={{ background: S.surf, borderRadius: 12, border: `1px solid ${S.bdr}`, padding: 20, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: S.txt }}>{product.name}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {product.primary_domain && <DomainPill domain={product.primary_domain} />}
            {(product.secondary_domains || []).map(d => <DomainPill key={d} domain={d} />)}
          </div>
        </div>
        <button onClick={() => onCompare(product)}
          style={{ background: 'none', border: `1px solid ${S.bdr}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, color: S.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <GitCompare size={12} /> Compare
        </button>
      </div>

      {product.description && <p style={{ fontSize: 13, color: S.muted, margin: '0 0 14px', lineHeight: 1.6 }}>{product.description}</p>}

      <CollapsibleSection title="Key Capabilities" defaultOpen>
        <BulletList items={product.key_capabilities} />
      </CollapsibleSection>
      <CollapsibleSection title="Ideal Customer">
        <p style={{ fontSize: 13, color: S.txt, margin: 0, lineHeight: 1.6 }}>{product.ideal_customer || '—'}</p>
      </CollapsibleSection>
      <CollapsibleSection title="Not a Fit When">
        <p style={{ fontSize: 13, color: '#D97706', margin: 0, lineHeight: 1.6 }}>{product.not_a_fit_when || '—'}</p>
      </CollapsibleSection>
      <CollapsibleSection title="Differentiators">
        <BulletList items={product.differentiators} color="#059669" />
      </CollapsibleSection>
      <CollapsibleSection title="Weaknesses">
        <BulletList items={product.weaknesses} color="#DC2626" />
      </CollapsibleSection>
      <CollapsibleSection title="Watch Out For">
        <BulletList items={product.things_to_watch_out_for} color="#D97706" />
      </CollapsibleSection>
      {product.typical_competitors?.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: S.muted, marginBottom: 6 }}>Competes with</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {product.typical_competitors.map(c => (
              <span key={c} style={{ background: S.bg, border: `1px solid ${S.bdr}`, borderRadius: 20, padding: '2px 8px', fontSize: 11, color: S.muted }}>{c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Vendor detail view ────────────────────────────────────────────────────────

function VendorDetail({ vendor, allVendors, onBack, comparisons, onSaveComparison, onEnrich, enriching }) {
  const [products, setProducts] = useState(vendor._products || [])
  const [loadingProducts, setLoadingProducts] = useState(!vendor._products)
  const [filterDomain, setFilterDomain] = useState('')
  const [compareProduct, setCompareProduct] = useState(null)

  useEffect(() => {
    if (vendor._products) { setProducts(vendor._products); setLoadingProducts(false); return }
    fetchProductsForVendor(vendor.id).then(p => { setProducts(p); setLoadingProducts(false) }).catch(() => setLoadingProducts(false))
  }, [vendor.id])

  const filteredProducts = products.filter(p =>
    !filterDomain || p.primary_domain === filterDomain || (p.secondary_domains || []).includes(filterDomain)
  )
  const allDomains = Array.from(new Set(products.flatMap(p => [p.primary_domain, ...(p.secondary_domains || [])]).filter(Boolean)))

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 40px' }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#007AFF', fontSize: 14, padding: '16px 0', fontWeight: 500 }}>
        <ArrowLeft size={16} /> Back to Cyber Bible
      </button>

      <div style={{ background: S.surf, borderRadius: 16, border: `1px solid ${S.bdr}`, padding: 28, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: S.txt }}>{vendor.name}</h1>
            {vendor.tagline && <p style={{ margin: '6px 0 0', fontSize: 15, color: S.muted }}>{vendor.tagline}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <PositionBadge position={vendor.industry_position} />
              {vendor.hq && <span style={{ fontSize: 12, color: S.muted }}>📍 {vendor.hq}</span>}
              {vendor.founded_year && <span style={{ fontSize: 12, color: S.muted }}>Est. {vendor.founded_year}</span>}
              {vendor.cogs_rank && <span style={{ fontSize: 12, color: S.muted }}>#{vendor.cogs_rank} by COGS</span>}
            </div>
          </div>
          <button onClick={() => onEnrich(vendor)} disabled={enriching}
            style={{ background: enriching ? S.bdr : '#F4F6F9', color: enriching ? S.muted : S.txt, border: `1px solid ${S.bdr}`, borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: enriching ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {enriching ? <><Spinner /> Refreshing…</> : <><RefreshCw size={13} /> Refresh</>}
          </button>
        </div>

        {vendor.overview && <p style={{ fontSize: 14, color: S.muted, lineHeight: 1.7, margin: '0 0 16px' }}>{vendor.overview}</p>}
        {vendor.industry_position_reason && (
          <div style={{ background: '#F4F6F9', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: S.muted }}>
            <strong style={{ color: S.txt }}>Market position: </strong>{vendor.industry_position_reason}
          </div>
        )}
      </div>

      {loadingProducts ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 40, color: S.muted, fontSize: 14 }}>
          <Spinner /> Loading products…
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <button onClick={() => setFilterDomain('')}
              style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: !filterDomain ? '#007AFF' : S.bg, color: !filterDomain ? '#fff' : S.muted }}>
              All ({products.length})
            </button>
            {allDomains.map(d => {
              const count = products.filter(p => p.primary_domain === d || (p.secondary_domains || []).includes(d)).length
              const dc = DOMAIN_COLORS[d] || {}
              return (
                <button key={d} onClick={() => setFilterDomain(filterDomain === d ? '' : d)}
                  style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: filterDomain === d ? (dc.text || '#007AFF') : (dc.bg || S.bg), color: filterDomain === d ? '#fff' : (dc.text || S.muted) }}>
                  {d} ({count})
                </button>
              )
            })}
          </div>

          {filteredProducts.length === 0
            ? <div style={{ textAlign: 'center', padding: 60, color: S.muted, fontSize: 14 }}>No products match this filter.</div>
            : filteredProducts.map(p => <ProductCard key={p.id} product={p} onCompare={prod => setCompareProduct(prod)} />)
          }
        </>
      )}

      {compareProduct && (
        <CompareModal
          vendorA={vendor}
          productA={compareProduct}
          allVendors={allVendors}
          comparisons={comparisons}
          onClose={() => setCompareProduct(null)}
          onSaveComparison={onSaveComparison}
        />
      )}
    </div>
  )
}

// ── Vendor card ───────────────────────────────────────────────────────────────

function VendorCard({ vendor, productCount, domains, onSelect, onEnrich, enriching }) {
  const isEnriched = !!vendor.last_enriched_at
  const pos = vendor.industry_position
  const ps = pos ? (POSITION_STYLE[pos] || null) : null

  return (
    <div onClick={() => onSelect(vendor)}
      style={{ background: S.surf, borderRadius: 12, border: `1px solid ${S.bdr}`, padding: 20, cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', position: 'relative' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = '' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: S.txt }}>{vendor.name}</div>
          {vendor.cogs_rank && <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>#{vendor.cogs_rank} by COGS</div>}
        </div>
        {ps && <span style={{ background: ps.bg, color: ps.text, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{pos}</span>}
      </div>

      {vendor.tagline && <p style={{ fontSize: 13, color: S.muted, margin: '0 0 10px', lineHeight: 1.5 }}>{vendor.tagline}</p>}

      {vendor.overview && (
        <p style={{ fontSize: 12, color: S.muted, margin: '0 0 12px', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {vendor.overview}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
        {(domains || []).slice(0, 3).map(d => <DomainPill key={d} domain={d} />)}
        {productCount > 0 && <span style={{ fontSize: 11, color: S.muted, alignSelf: 'center', marginLeft: 2 }}>{productCount} product{productCount !== 1 ? 's' : ''}</span>}
      </div>

      {!isEnriched ? (
        <button onClick={e => { e.stopPropagation(); onEnrich(vendor) }} disabled={enriching}
          style={{ fontSize: 12, background: enriching ? S.bdr : '#007AFF', color: enriching ? S.muted : '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: enriching ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          {enriching ? <><Spinner size={12} /> Enriching…</> : <><Zap size={12} /> Enrich Now</>}
        </button>
      ) : (
        <div style={{ fontSize: 11, color: S.muted }}>
          Enriched {new Date(vendor.last_enriched_at).toLocaleDateString()}
          <button onClick={e => { e.stopPropagation(); onEnrich(vendor) }} disabled={enriching}
            style={{ marginLeft: 8, fontSize: 11, background: 'none', border: 'none', color: '#007AFF', cursor: enriching ? 'default' : 'pointer', padding: 0 }}>
            {enriching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CyberBiblePage({ data, setData, onBack }) {
  const [vendors, setVendors] = useState(() =>
    SEED_NAMES.map((name, i) => ({ name, cogs_rank: i + 1, _stub: true }))
  )
  const [productCounts, setProductCounts] = useState({})
  const [productDomains, setProductDomains] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selectedVendor, setSelectedVendor] = useState(null)
  const [enrichingId, setEnrichingId] = useState(null)
  const [enrichAllRunning, setEnrichAllRunning] = useState(false)
  const [enrichAllStatus, setEnrichAllStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDomain, setFilterDomain] = useState('')
  const [filterPosition, setFilterPosition] = useState('')
  const comparisons = data.cyberBible?.comparisons || {}

  const loadVendors = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const rows = await fetchAllVendors()
      // Merge with SEED_NAMES so unenriched vendors still appear (with stub data)
      const bySlug = Object.fromEntries(rows.map(r => [r.slug, r]))
      const merged = SEED_NAMES.map((name, i) => {
        const s = slugify(name)
        return bySlug[s] || { name, cogs_rank: i + 1, _stub: true }
      })
      setVendors(merged)

      // Fetch product counts and domains for all enriched vendors
      const enrichedIds = merged.filter(v => v.id).map(v => v.id)
      if (enrichedIds.length) {
        const { counts, domains } = await countProductsForVendors(enrichedIds)
        setProductCounts(counts || {})
        setProductDomains(domains || {})
      }
    } catch (e) {
      setLoadError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadVendors() }, [])

  function saveComparisons(updated) {
    setData(prev => ({ ...prev, cyberBible: { ...(prev.cyberBible || {}), comparisons: updated } }))
  }

  function handleSaveComparison(key, result) {
    const updated = { ...comparisons, [key]: result }
    saveComparisons(updated)
  }

  async function handleEnrich(vendor) {
    const key = vendor.name
    if (enrichingId === key) return
    setEnrichingId(key)
    try {
      const profile = await enrichVendor(vendor.name)
      const rank = vendor.cogs_rank || (SEED_NAMES.indexOf(vendor.name) + 1) || 99
      await upsertVendorToSupabase(vendor.name, rank, profile)
      await loadVendors()
      // If detail view is open, reload products
      if (selectedVendor?.name === vendor.name) {
        const products = await fetchProductsForVendor(selectedVendor.id || (vendors.find(v => v.name === vendor.name)?.id))
        setSelectedVendor(v => v ? { ...v, _products: products } : v)
      }
    } catch (e) {
      alert(`Enrichment failed for ${vendor.name}: ${e.message}`)
    } finally {
      setEnrichingId(null)
    }
  }

  async function handleEnrichAll() {
    const unenriched = vendors.filter(v => !v.last_enriched_at)
    if (unenriched.length === 0) { alert('All vendors are already enriched.'); return }
    setEnrichAllRunning(true)
    for (let i = 0; i < unenriched.length; i++) {
      const vendor = unenriched[i]
      setEnrichAllStatus(`Enriching ${vendor.name} (${i + 1}/${unenriched.length})…`)
      setEnrichingId(vendor.name)
      try {
        const profile = await enrichVendor(vendor.name)
        const rank = vendor.cogs_rank || (SEED_NAMES.indexOf(vendor.name) + 1) || 99
        await upsertVendorToSupabase(vendor.name, rank, profile)
      } catch (e) {
        console.error(`EnrichAll: ${vendor.name} failed:`, e.message)
      }
      setEnrichingId(null)
    }
    setEnrichAllRunning(false)
    setEnrichAllStatus('')
    await loadVendors()
  }

  async function handleSelectVendor(vendor) {
    if (vendor._stub || !vendor.id) { setSelectedVendor(vendor); return }
    // Pre-fetch products before entering detail view
    try {
      const products = await fetchProductsForVendor(vendor.id)
      setSelectedVendor({ ...vendor, _products: products })
    } catch {
      setSelectedVendor(vendor)
    }
  }

  const enrichedCount = vendors.filter(v => v.last_enriched_at).length

  const filteredVendors = vendors.filter(v => {
    if (searchQuery && !v.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterDomain) {
      const vDomains = v.id ? (productDomains[v.id] || []) : []
      if (!vDomains.includes(filterDomain)) return false
    }
    if (filterPosition && v.industry_position !== filterPosition) return false
    return true
  })

  if (selectedVendor) {
    return (
      <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#F4F6F9', fontFamily: 'Inter, -apple-system, sans-serif' }}>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        <div style={{ flex: 1, overflowY: 'auto' }}>
        <VendorDetail
          vendor={selectedVendor}
          allVendors={vendors.filter(v => !v._stub)}
          onBack={() => setSelectedVendor(null)}
          comparisons={comparisons}
          onSaveComparison={handleSaveComparison}
          onEnrich={handleEnrich}
          enriching={enrichingId === selectedVendor.name}
        />
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#F4F6F9', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ background: S.surf, borderBottom: `1px solid ${S.bdr}`, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#007AFF', fontSize: 14, fontWeight: 500 }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ width: 1, height: 20, background: S.bdr }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BookOpen size={20} color="#007AFF" />
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: S.txt }}>Cyber Bible</div>
              <div style={{ fontSize: 11, color: S.muted }}>
                {loading ? 'Loading…' : `${enrichedCount}/${vendors.length} vendors enriched`}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadVendors} disabled={loading} title="Refresh from database"
            style={{ background: 'none', border: `1px solid ${S.bdr}`, borderRadius: 8, padding: '8px 10px', cursor: loading ? 'default' : 'pointer', color: S.muted, display: 'flex', alignItems: 'center' }}>
            {loading ? <Spinner size={14} /> : <Database size={14} />}
          </button>
          <button onClick={handleEnrichAll} disabled={enrichAllRunning || loading}
            style={{ background: (enrichAllRunning || loading) ? S.bdr : '#007AFF', color: (enrichAllRunning || loading) ? S.muted : '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: (enrichAllRunning || loading) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {enrichAllRunning ? <><Spinner /> {enrichAllStatus || 'Enriching…'}</> : <><Zap size={14} /> Enrich All</>}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: S.surf, borderBottom: `1px solid ${S.bdr}`, padding: '12px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: S.muted }} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search vendors…"
            style={{ padding: '7px 10px 7px 32px', borderRadius: 8, border: `1px solid ${S.bdr}`, fontSize: 13, background: S.bg, color: S.txt, width: 220 }} />
        </div>
        <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${S.bdr}`, fontSize: 13, background: S.bg, color: S.txt }}>
          <option value="">All Domains</option>
          {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterPosition} onChange={e => setFilterPosition(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${S.bdr}`, fontSize: 13, background: S.bg, color: S.txt }}>
          <option value="">All Positions</option>
          {['Leader', 'Challenger', 'Up and Comer', 'Niche'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {(searchQuery || filterDomain || filterPosition) && (
          <button onClick={() => { setSearchQuery(''); setFilterDomain(''); setFilterPosition('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.muted, fontSize: 13 }}>Clear filters</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: S.muted }}>{filteredVendors.length} of {vendors.length} vendors</span>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
      {loadError && (
        <div style={{ margin: 24, background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: 16, fontSize: 14 }}>
          Error loading from Supabase: {loadError}
          <button onClick={loadVendors} style={{ marginLeft: 12, fontSize: 13, color: '#DC2626', background: 'none', border: '1px solid #DC2626', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* Grid */}
      <div style={{ padding: 32 }}>
        {loading && !vendors.some(v => !v._stub) ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 60, color: S.muted, fontSize: 15, justifyContent: 'center' }}>
            <Spinner size={20} /> Loading vendors from database…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {filteredVendors.map(vendor => (
              <VendorCard
                key={vendor.id || vendor.name}
                vendor={vendor}
                productCount={vendor.id ? (productCounts[vendor.id] || 0) : 0}
                domains={vendor.id ? (productDomains[vendor.id] || []) : []}
                onSelect={handleSelectVendor}
                onEnrich={handleEnrich}
                enriching={enrichingId === vendor.name}
              />
            ))}
          </div>
        )}
        {!loading && filteredVendors.length === 0 && (
          <div style={{ textAlign: 'center', padding: 80, color: S.muted, fontSize: 15 }}>No vendors match your filters.</div>
        )}
      </div>
      </div>
    </div>
  )
}
