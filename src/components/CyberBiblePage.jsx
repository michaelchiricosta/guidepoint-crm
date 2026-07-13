import React, { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, BookOpen, Zap, RefreshCw, Search, X, ChevronDown, ChevronRight, GitCompare, Star, AlertTriangle, CheckCircle, Eye, Package, Loader } from 'lucide-react'
import { S } from '../theme.js'
import { enrichVendor, compareVendors } from '../utils/cyberBible.js'

const SEED_VENDORS = [
  'CrowdStrike', 'Palo Alto Networks', 'Microsoft', 'SentinelOne', 'Zscaler',
  'Splunk', 'Okta', 'Fortinet', 'Check Point', 'Tenable',
  'Rapid7', 'Qualys', 'Varonis', 'Cyberark', 'Sailpoint',
  'Proofpoint', 'Mimecast', 'Darktrace', 'Vectra AI', 'Illumio',
  'Claroty', 'Nozomi Networks', 'Armis', 'Axonius', 'Orca Security',
  'Wiz', 'Lacework', 'Snyk', 'Recorded Future', 'Corelight',
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

function Spinner() {
  return <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
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

function VendorCard({ vendor, onSelect, onEnrich, enriching }) {
  const domains = Array.from(new Set((vendor.products || []).map(p => p.primary_domain).filter(Boolean))).slice(0, 3)
  const productCount = (vendor.products || []).length
  const pos = vendor.industry_position
  const ps = pos ? (POSITION_STYLE[pos] || null) : null

  return (
    <div
      onClick={() => onSelect(vendor)}
      style={{
        background: S.surf, borderRadius: 12, border: `1px solid ${S.bdr}`, padding: 20,
        cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.15s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', position: 'relative',
      }}
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

      {vendor.tagline && (
        <p style={{ fontSize: 13, color: S.muted, margin: '0 0 10px', lineHeight: 1.5 }}>{vendor.tagline}</p>
      )}

      {vendor.overview && (
        <p style={{ fontSize: 12, color: S.muted, margin: '0 0 12px', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {vendor.overview}
        </p>
      )}

      {vendor.gp_summary && (
        <div style={{ background: '#EBF4FF', borderRadius: 8, padding: '8px 10px', marginBottom: 12, fontSize: 12, color: '#1D4ED8', lineHeight: 1.5 }}>
          <strong style={{ display: 'block', marginBottom: 2 }}>GP Angle</strong>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{vendor.gp_summary}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
        {domains.map(d => <DomainPill key={d} domain={d} />)}
        {productCount > 0 && <span style={{ fontSize: 11, color: S.muted, alignSelf: 'center', marginLeft: 2 }}>{productCount} product{productCount !== 1 ? 's' : ''}</span>}
      </div>

      {!vendor.last_enriched_at ? (
        <button
          onClick={e => { e.stopPropagation(); onEnrich(vendor) }}
          disabled={enriching}
          style={{ fontSize: 12, background: enriching ? S.bdr : '#007AFF', color: enriching ? S.muted : '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: enriching ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {enriching ? <><Spinner /> Enriching...</> : <><Zap size={12} /> Enrich Now</>}
        </button>
      ) : (
        <div style={{ fontSize: 11, color: S.muted }}>
          Enriched {new Date(vendor.last_enriched_at).toLocaleDateString()}
          <button
            onClick={e => { e.stopPropagation(); onEnrich(vendor) }}
            disabled={enriching}
            style={{ marginLeft: 8, fontSize: 11, background: 'none', border: 'none', color: '#007AFF', cursor: enriching ? 'default' : 'pointer', padding: 0 }}
          >
            {enriching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      )}
    </div>
  )
}

function CompareModal({ vendorA, productA, vendors, onClose, onSave, saved }) {
  const [vendorBName, setVendorBName] = useState('')
  const [selectedProductB, setSelectedProductB] = useState(null)
  const [searchB, setSearchB] = useState('')
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState(null)

  const vendorB = vendors.find(v => v.name === vendorBName) || null
  const cacheKey = `${vendorA.name}|${productA?.name || ''}|${vendorBName}|${selectedProductB?.name || ''}`

  useEffect(() => {
    if (saved[cacheKey]) setResult(saved[cacheKey])
    else setResult(null)
  }, [cacheKey])

  async function runCompare() {
    setRunning(true); setErr(null)
    try {
      const res = await compareVendors(vendorA.name, productA?.name || '', vendorBName, selectedProductB?.name || '')
      setResult(res)
      onSave(cacheKey, res)
    } catch (e) {
      setErr(e.message)
    } finally {
      setRunning(false)
    }
  }

  const filteredVendors = vendors.filter(v => v.name !== vendorA.name && v.name.toLowerCase().includes(searchB.toLowerCase()))

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
            {!vendorBName ? (
              <>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: S.muted }} />
                  <input
                    value={searchB} onChange={e => setSearchB(e.target.value)}
                    placeholder="Search vendors..."
                    style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 8, border: `1px solid ${S.bdr}`, fontSize: 13, background: S.surf, color: S.txt, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                  {filteredVendors.map(v => (
                    <div key={v.name} onClick={() => setVendorBName(v.name)}
                      style={{ padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: S.txt }}
                      onMouseEnter={e => e.currentTarget.style.background = S.bdr}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >{v.name}</div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 15, color: S.txt }}>{vendorBName}</div>
                <button onClick={() => { setVendorBName(''); setSelectedProductB(null); setSearchB('') }} style={{ fontSize: 11, color: '#007AFF', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>Change</button>
                {vendorB?.products?.length > 0 && (
                  <select
                    value={selectedProductB?.name || ''}
                    onChange={e => setSelectedProductB(vendorB.products.find(p => p.name === e.target.value) || null)}
                    style={{ display: 'block', marginTop: 8, width: '100%', padding: '6px 8px', borderRadius: 8, border: `1px solid ${S.bdr}`, fontSize: 13, background: S.surf, color: S.txt }}
                  >
                    <option value="">All products</option>
                    {vendorB.products.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                )}
              </>
            )}
          </div>
        </div>

        <button
          onClick={runCompare}
          disabled={!vendorBName || running}
          style={{ background: (!vendorBName || running) ? S.bdr : '#007AFF', color: (!vendorBName || running) ? S.muted : '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: (!vendorBName || running) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}
        >
          {running ? <><Spinner /> Running...</> : <><GitCompare size={14} /> Run Comparison</>}
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
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1D4ED8', marginBottom: 8 }}>Choose {vendorBName} if…</div>
                <div style={{ fontSize: 13, color: '#1E3A8A', lineHeight: 1.6 }}>{result.choose_b_if}</div>
              </div>
            </div>

            {result.key_differences?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: S.txt, marginBottom: 10 }}>Key Differences</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: S.bg }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', color: S.muted, fontWeight: 600 }}>Dimension</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', color: S.muted, fontWeight: 600 }}>{vendorA.name}</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', color: S.muted, fontWeight: 600 }}>{vendorBName}</th>
                    </tr>
                  </thead>
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
        <button
          onClick={() => onCompare(product)}
          style={{ background: 'none', border: `1px solid ${S.bdr}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, color: S.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        >
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

function VendorDetail({ vendor, onBack, vendors, comparisons, onSaveComparison, onEnrich, enriching }) {
  const [filterDomain, setFilterDomain] = useState('')
  const [compareProduct, setCompareProduct] = useState(null)

  const filteredProducts = (vendor.products || []).filter(p =>
    !filterDomain || p.primary_domain === filterDomain || (p.secondary_domains || []).includes(filterDomain)
  )

  const allDomains = Array.from(new Set((vendor.products || []).flatMap(p => [p.primary_domain, ...(p.secondary_domains || [])]).filter(Boolean)))

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
          <button
            onClick={() => onEnrich(vendor)}
            disabled={enriching}
            style={{ background: enriching ? S.bdr : '#F4F6F9', color: enriching ? S.muted : S.txt, border: `1px solid ${S.bdr}`, borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: enriching ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {enriching ? <><Spinner /> Refreshing...</> : <><RefreshCw size={13} /> Refresh</>}
          </button>
        </div>

        {vendor.overview && <p style={{ fontSize: 14, color: S.muted, lineHeight: 1.7, margin: '0 0 16px' }}>{vendor.overview}</p>}

        {vendor.industry_position_reason && (
          <div style={{ background: '#F4F6F9', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: S.muted, marginBottom: vendor.gp_summary ? 12 : 0 }}>
            <strong style={{ color: S.txt }}>Market position: </strong>{vendor.industry_position_reason}
          </div>
        )}

        {vendor.gp_summary && (
          <div style={{ background: '#EBF4FF', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 13, color: '#1D4ED8', lineHeight: 1.6 }}>
            <strong>GP Angle: </strong>{vendor.gp_summary}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button
          onClick={() => setFilterDomain('')}
          style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: !filterDomain ? '#007AFF' : S.bg, color: !filterDomain ? '#fff' : S.muted }}
        >
          All ({(vendor.products || []).length})
        </button>
        {allDomains.map(d => {
          const count = (vendor.products || []).filter(p => p.primary_domain === d || (p.secondary_domains || []).includes(d)).length
          const dc = DOMAIN_COLORS[d] || {}
          return (
            <button
              key={d}
              onClick={() => setFilterDomain(filterDomain === d ? '' : d)}
              style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: filterDomain === d ? (dc.text || '#007AFF') : (dc.bg || S.bg), color: filterDomain === d ? '#fff' : (dc.text || S.muted) }}
            >
              {d} ({count})
            </button>
          )
        })}
      </div>

      {filteredProducts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: S.muted, fontSize: 14 }}>
          No products match this filter.
        </div>
      ) : (
        filteredProducts.map(p => (
          <ProductCard key={p.name} product={p} onCompare={prod => setCompareProduct(prod)} />
        ))
      )}

      {compareProduct && (
        <CompareModal
          vendorA={vendor}
          productA={compareProduct}
          vendors={vendors}
          saved={comparisons}
          onClose={() => setCompareProduct(null)}
          onSave={(key, res) => onSaveComparison(key, res)}
        />
      )}
    </div>
  )
}

export default function CyberBiblePage({ data, setData, onBack }) {
  const cyberBible = data.cyberBible || { vendors: [], comparisons: {} }
  const [vendors, setVendors] = useState(() => {
    const saved = cyberBible.vendors || []
    return SEED_VENDORS.map((name, i) => {
      const existing = saved.find(v => v.name === name)
      return existing || { name, cogs_rank: i + 1 }
    })
  })
  const [comparisons, setComparisons] = useState(cyberBible.comparisons || {})
  const [selectedVendor, setSelectedVendor] = useState(null)
  const [enrichingId, setEnrichingId] = useState(null)
  const [enrichAllRunning, setEnrichAllRunning] = useState(false)
  const [enrichAllStatus, setEnrichAllStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDomain, setFilterDomain] = useState('')
  const [filterPosition, setFilterPosition] = useState('')

  const persist = useCallback((updatedVendors, updatedComparisons) => {
    setData(prev => ({
      ...prev,
      cyberBible: { vendors: updatedVendors, comparisons: updatedComparisons },
    }))
  }, [setData])

  async function handleEnrich(vendor) {
    const key = vendor.name
    if (enrichingId === key) return
    setEnrichingId(key)
    try {
      const profile = await enrichVendor(vendor.name)
      const updated = vendors.map(v =>
        v.name === vendor.name
          ? { ...v, ...profile, name: vendor.name, cogs_rank: vendor.cogs_rank, last_enriched_at: new Date().toISOString() }
          : v
      )
      setVendors(updated)
      if (selectedVendor?.name === vendor.name) {
        setSelectedVendor(updated.find(v => v.name === vendor.name))
      }
      persist(updated, comparisons)
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
    let current = [...vendors]
    for (let i = 0; i < unenriched.length; i++) {
      const vendor = unenriched[i]
      setEnrichAllStatus(`Enriching ${vendor.name} (${i + 1}/${unenriched.length})…`)
      setEnrichingId(vendor.name)
      try {
        const profile = await enrichVendor(vendor.name)
        current = current.map(v =>
          v.name === vendor.name
            ? { ...v, ...profile, name: vendor.name, cogs_rank: vendor.cogs_rank, last_enriched_at: new Date().toISOString() }
            : v
        )
        setVendors([...current])
        persist([...current], comparisons)
      } catch (e) {
        console.error(`EnrichAll: ${vendor.name} failed:`, e.message)
      }
      setEnrichingId(null)
    }
    setEnrichAllRunning(false)
    setEnrichAllStatus('')
  }

  function handleSaveComparison(key, result) {
    const updated = { ...comparisons, [key]: result }
    setComparisons(updated)
    persist(vendors, updated)
  }

  const enrichedCount = vendors.filter(v => v.last_enriched_at).length

  const filteredVendors = vendors.filter(v => {
    if (searchQuery && !v.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterDomain) {
      const domains = (v.products || []).flatMap(p => [p.primary_domain, ...(p.secondary_domains || [])]).filter(Boolean)
      if (!domains.includes(filterDomain)) return false
    }
    if (filterPosition && v.industry_position !== filterPosition) return false
    return true
  })

  if (selectedVendor) {
    return (
      <div style={{ minHeight: '100vh', background: '#F4F6F9', fontFamily: 'Inter, -apple-system, sans-serif' }}>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        <VendorDetail
          vendor={selectedVendor}
          onBack={() => setSelectedVendor(null)}
          vendors={vendors}
          comparisons={comparisons}
          onSaveComparison={handleSaveComparison}
          onEnrich={handleEnrich}
          enriching={enrichingId === selectedVendor.name}
        />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F4F6F9', fontFamily: 'Inter, -apple-system, sans-serif' }}>
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
              <div style={{ fontSize: 11, color: S.muted }}>{enrichedCount}/{vendors.length} vendors enriched</div>
            </div>
          </div>
        </div>
        <button
          onClick={handleEnrichAll}
          disabled={enrichAllRunning}
          style={{ background: enrichAllRunning ? S.bdr : '#007AFF', color: enrichAllRunning ? S.muted : '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: enrichAllRunning ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {enrichAllRunning ? <><Spinner /> {enrichAllStatus || 'Enriching…'}</> : <><Zap size={14} /> Enrich All</>}
        </button>
      </div>

      {/* Filters */}
      <div style={{ background: S.surf, borderBottom: `1px solid ${S.bdr}`, padding: '12px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: S.muted }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search vendors…"
            style={{ padding: '7px 10px 7px 32px', borderRadius: 8, border: `1px solid ${S.bdr}`, fontSize: 13, background: S.bg, color: S.txt, width: 220 }}
          />
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

      {/* Grid */}
      <div style={{ padding: 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {filteredVendors.map(vendor => (
            <VendorCard
              key={vendor.name}
              vendor={vendor}
              onSelect={setSelectedVendor}
              onEnrich={handleEnrich}
              enriching={enrichingId === vendor.name}
            />
          ))}
        </div>
        {filteredVendors.length === 0 && (
          <div style={{ textAlign: 'center', padding: 80, color: S.muted, fontSize: 15 }}>
            No vendors match your filters.
          </div>
        )}
      </div>
    </div>
  )
}
