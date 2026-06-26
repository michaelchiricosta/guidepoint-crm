import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { ArrowLeft, Plus, Search, Trash2, Pencil, Upload, X, ChevronRight, ChevronDown, FileSpreadsheet } from 'lucide-react'
import { S } from '../theme.js'
import { uid, extractJSON } from '../utils.js'
import { SECURITY_FRAMEWORK } from '../securityFramework.js'

// ── AI helper ─────────────────────────────────────────────────────────────────
const callAI = async (body, onStatus, maxRetries = 3) => {
  const lastCall = window._lastAnthropicCall || 0
  const wait = 2000 - (Date.now() - lastCall)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    window._lastAnthropicCall = Date.now()
    const res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    const overloaded = data.error?.type === 'overloaded_error' || res.status === 529 || res.status === 429
    if (overloaded && attempt < maxRetries - 1) {
      const delay = Math.pow(2, attempt) * 2000
      if (onStatus) onStatus(`API busy — retrying in ${Math.round(delay / 1000)}s…`)
      await new Promise(r => setTimeout(r, delay))
      continue
    }
    if (overloaded) throw new Error('API overloaded — please try again')
    if (data.error) throw new Error(data.error.message || 'API error')
    if (onStatus) onStatus(null)
    return data
  }
  throw new Error('API overloaded — please try again')
}

// ── Vendor matching ───────────────────────────────────────────────────────────
const fuzzyMatchVendor = (a, b) => {
  if (!a || !b) return false
  const clean = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\b(inc|llc|ltd|corp|co|the|and|or|of)\b/g, '').replace(/\s+/g, ' ').trim()
  const ca = clean(a), cb = clean(b)
  if (ca === cb || ca.includes(cb) || cb.includes(ca)) return true
  const bigrams = s => { const bg = new Set(); for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2)); return bg }
  const bg1 = bigrams(ca), bg2 = bigrams(cb)
  let m = 0; bg2.forEach(bg => { if (bg1.has(bg)) m++ })
  return (2 * m) / (bg1.size + bg2.size) > 0.7
}

// ── Spreadsheet column mapping ────────────────────────────────────────────────
const HEADER_ALIASES = {
  vendorColumn:      ['vendor', 'partner', 'company', 'manufacturer', 'oem', 'brand', 'provider', 'vendor name', 'partner name', 'distributor'],
  repNameColumn:     ['rep', 'sales rep', 'account owner', 'owner', 'partner rep', 'cam', 'channel rep', 'representative', 'contact', 'contact name', 'name', 'rep name', 'assigned to', 'ae', 'se'],
  repEmailColumn:    ['email', 'rep email', 'owner email', 'contact email', 'email address'],
  repPhoneColumn:    ['phone', 'rep phone', 'mobile', 'cell', 'phone number', 'direct', 'direct phone'],
  accountNameColumn: ['account', 'account name', 'client', 'customer', 'company name', 'end customer', 'prospect', 'end user', 'customer name', 'account_name', 'client name'],
  statusColumn:      ['status', 'customer type', 'type', 'relationship', 'stage', 'account status', 'customer status'],
  notesColumn:       ['notes', 'comments', 'details', 'context', 'description', 'notes/comments', 'additional info'],
}

const normalizeHdr = h => (h || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

const detectColumnMapping = headers => {
  const norm = headers.map(normalizeHdr)
  const result = {}
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = norm.findIndex(h => aliases.some(a => h === a || h.startsWith(a) || a.startsWith(h)))
    result[field] = idx >= 0 ? headers[idx] : ''
  }
  return result
}

const normalizeStatus = s => {
  if (!s) return 'Target'
  const l = (s || '').toLowerCase()
  if (['customer', 'current', 'active', 'existing', 'installed base', 'live'].some(v => l.includes(v))) return 'Customer'
  if (['engaged', 'prospect', 'lead', 'qualified', 'opportun', 'eval', 'progress', 'active prospect', 'in negotiation'].some(v => l.includes(v))) return 'Engaged'
  return 'Target'
}

// ── Constants ─────────────────────────────────────────────────────────────────
const VENDOR_CATS = [...SECURITY_FRAMEWORK.domains.map(d => d.name), 'Technology', 'Professional Services', 'Hardware', 'Other']
const STATUS_OPTS = ['Customer', 'Engaged', 'Target']
const STATUS_STYLE = {
  Customer: { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  Engaged:  { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
  Target:   { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
}
const BLANK_VENDOR = { id: '', name: '', companyName: '', website: '', category: '', notes: '', reps: [] }
const BLANK_REP    = { id: '', name: '', email: '', phone: '', title: '', notes: '', accounts: [] }
const BLANK_ACCT   = { id: '', accountName: '', status: 'Target', notes: '' }
const BLANK_CM     = { id: '', name: '', email: '', phone: '', title: '', region: '', notes: '' }

// ── Global Import (Channel Manager) column aliases ────────────────────────────
const CM_HEADER_ALIASES = {
  vendorColumn:  ['vendor', 'vendor name', 'company', 'company name', 'partner', 'partner name', 'manufacturer', 'oem'],
  cmNameColumn:  ['channel manager', 'channel manager name', 'partner manager', 'partner manager name', 'channel rep', 'cam', 'channel account manager'],
  emailColumn:   ['email', 'channel manager email', 'partner manager email', 'contact email'],
  phoneColumn:   ['phone', 'mobile', 'cell', 'contact phone'],
  titleColumn:   ['title', 'role', 'job title'],
  notesColumn:   ['notes', 'comments', 'details'],
  regionColumn:  ['region', 'territory', 'area'],
}

const detectGIMapping = headers => {
  const norm = headers.map(normalizeHdr)
  const result = {}
  for (const [field, aliases] of Object.entries(CM_HEADER_ALIASES)) {
    const idx = norm.findIndex(h => aliases.some(a => h === a || h.startsWith(a) || a.startsWith(h)))
    result[field] = idx >= 0 ? headers[idx] : ''
  }
  return result
}

// ── Migration: legacy vendors with contacts[] but no reps[] ───────────────────
const normalizeVendor = v => {
  if (v.reps !== undefined) return { ...v, name: v.name || v.companyName || '', channelManagers: v.channelManagers || [] }
  return {
    ...v,
    name: v.name || v.companyName || '',
    channelManagers: v.channelManagers || [],
    reps: (v.contacts || []).map(ct => ({
      id: ct.id || uid(),
      name: ct.name || '',
      email: ct.email || '',
      phone: ct.phone || '',
      title: ct.title || '',
      notes: [ct.notes, ct.region && `Region: ${ct.region}`, ct.territory && `Territory: ${ct.territory}`, ct.sourceDocument && `Source: ${ct.sourceDocument}`].filter(Boolean).join('\n'),
      accounts: [],
    })),
  }
}

// ── Cell helper for spreadsheet import ───────────────────────────────────────
const getCell = (row, headers, colHeader) => {
  if (!colHeader) return ''
  const idx = headers.indexOf(colHeader)
  return idx < 0 ? '' : String(row[idx] ?? '').trim()
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VendorsPage({ data, setData, onBack }) {
  const directory = (data.vendorDirectory || []).map(normalizeVendor)

  // ── State ──────────────────────────────────────────────────────────────────
  const [selId, setSelId] = useState(() => {
    const first = (data.vendorDirectory || []).find(v => v.id)
    return first?.id || null
  })
  const [search, setSearch] = useState('')
  const [expandedReps, setExpandedReps] = useState(new Set())

  // Vendor form
  const [showVendorForm, setShowVendorForm] = useState(false)
  const [vendorForm, setVendorForm] = useState(BLANK_VENDOR)

  // Rep form
  const [repModal, setRepModal] = useState(null)
  const [repForm, setRepForm] = useState(BLANK_REP)

  // Account form
  const [addingAccountForRep, setAddingAccountForRep] = useState(null)
  const [newAcctForm, setNewAcctForm] = useState(BLANK_ACCT)

  // PDF/DOCX upload (existing)
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [review, setReview] = useState(null)
  const [reviewSel, setReviewSel] = useState(new Set())
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)

  // Spreadsheet import — coverage (vendor-scoped)
  const [ssStatus, setSsStatus] = useState('')
  const [ssError, setSsError] = useState('')
  const [ssReview, setSsReview] = useState(null)
  const [ssMapping, setSsMapping] = useState({})
  const [ssDragOver, setSsDragOver] = useState(false)
  const ssFileRef = useRef(null)

  // Global Import — channel managers (multi-vendor)
  const [giStatus, setGiStatus] = useState('')
  const [giError, setGiError] = useState('')
  const [giReview, setGiReview] = useState(null)
  const [giMapping, setGiMapping] = useState({})
  const giFileRef = useRef(null)

  // Channel Manager modal
  const [cmModal, setCmModal] = useState(null)   // {vendorId, cmId?}
  const [cmForm, setCmForm] = useState(BLANK_CM)

  // Coverage search
  const [coverageSearch, setCoverageSearch] = useState('')

  // Toast
  const [importToast, setImportToast] = useState(null)

  // ── Fix missing vendor IDs once on mount ───────────────────────────────────
  useEffect(() => {
    const raw = data.vendorDirectory || []
    const needsFix = raw.some(v => !v.id)
    if (!needsFix) return
    const fixed = raw.map(v => v.id ? v : { ...v, id: uid() })
    setData(prev => ({ ...prev, vendorDirectory: fixed }))
    if (!selId && fixed.length > 0) setSelId(fixed[0].id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────
  const sel = directory.find(v => v.id === selId) || null
  const filtered = directory.filter(v => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    if ((v.name || '').toLowerCase().includes(q)) return true
    if ((v.category || '').toLowerCase().includes(q)) return true
    if ((v.channelManagers || []).some(cm =>
      `${cm.name} ${cm.email} ${cm.region} ${cm.notes} ${cm.title}`.toLowerCase().includes(q)
    )) return true
    return false
  }).sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()))

  // Coverage search results — accounts and channel managers across all vendors
  const coverageResults = (() => {
    if (!coverageSearch.trim()) return []
    const q = coverageSearch.toLowerCase()
    const results = []
    for (const vendor of directory) {
      for (const rep of (vendor.reps || [])) {
        for (const acct of (rep.accounts || [])) {
          if (`${acct.accountName} ${rep.name} ${vendor.name} ${acct.notes} ${rep.email}`.toLowerCase().includes(q)) {
            results.push({ vendor, rep, acct, type: 'account' })
          }
        }
      }
      for (const cm of (vendor.channelManagers || [])) {
        if (`${cm.name} ${cm.email} ${cm.region} ${cm.notes} ${cm.title} ${vendor.name}`.toLowerCase().includes(q)) {
          results.push({ vendor, cm, type: 'channelManager' })
        }
      }
    }
    return results
  })()

  // ── Persistence ────────────────────────────────────────────────────────────
  const persist = dirs => setData(prev => ({ ...prev, vendorDirectory: dirs }))
  const updateVendor = (id, changes) => persist(directory.map(v => v.id === id ? { ...v, ...changes } : v))

  // ── Vendor CRUD ────────────────────────────────────────────────────────────
  const saveVendor = () => {
    if (!vendorForm.name.trim()) return
    const name = vendorForm.name.trim()
    if (vendorForm.id) {
      persist(directory.map(v => v.id === vendorForm.id ? { ...v, ...vendorForm, name, companyName: name } : v))
    } else {
      // FIX: id must come AFTER spreads so it isn't overwritten by BLANK_VENDOR.id = ''
      const nv = { ...BLANK_VENDOR, ...vendorForm, id: uid(), name, companyName: name, reps: [] }
      persist([...directory, nv])
      setSelId(nv.id)
    }
    setShowVendorForm(false)
    setVendorForm(BLANK_VENDOR)
  }

  const deleteVendor = id => {
    const vendor = directory.find(v => v.id === id)
    const name = vendor?.name || vendor?.companyName || 'this vendor'
    if (!window.confirm(`Delete ${name} and all reps/accounts under it?`)) return
    persist(directory.filter(v => v.id !== id))
    if (selId === id) setSelId(directory.find(v => v.id !== id)?.id || null)
  }

  // ── Rep CRUD ───────────────────────────────────────────────────────────────
  const saveRep = () => {
    if (!repForm.name.trim() || !repModal) return
    const vendor = directory.find(v => v.id === repModal.vendorId)
    if (!vendor) return
    const reps = repForm.id
      ? (vendor.reps || []).map(r => r.id === repForm.id ? { ...r, ...repForm } : r)
      : [...(vendor.reps || []), { id: uid(), ...repForm, accounts: repForm.accounts || [] }]
    updateVendor(repModal.vendorId, { reps })
    setRepModal(null)
    setRepForm(BLANK_REP)
  }

  const deleteRep = (vendorId, repId) => {
    const vendor = directory.find(v => v.id === vendorId)
    if (!vendor) return
    const rep = (vendor.reps || []).find(r => r.id === repId)
    const repName = rep?.name || 'this rep'
    if (!window.confirm(`Delete ${repName} and all accounts under this rep?`)) return
    updateVendor(vendorId, { reps: (vendor.reps || []).filter(r => r.id !== repId) })
    setExpandedReps(prev => { const s = new Set(prev); s.delete(repId); return s })
  }

  // ── Account CRUD ───────────────────────────────────────────────────────────
  const addAccount = (vendorId, repId) => {
    if (!newAcctForm.accountName.trim()) return
    const vendor = directory.find(v => v.id === vendorId)
    if (!vendor) return
    const reps = (vendor.reps || []).map(r =>
      r.id === repId ? { ...r, accounts: [...(r.accounts || []), { id: uid(), ...newAcctForm }] } : r
    )
    updateVendor(vendorId, { reps })
    setNewAcctForm(BLANK_ACCT)
    setAddingAccountForRep(null)
  }

  const updateAccount = (vendorId, repId, acctId, changes) => {
    const vendor = directory.find(v => v.id === vendorId)
    if (!vendor) return
    const reps = (vendor.reps || []).map(r =>
      r.id === repId
        ? { ...r, accounts: (r.accounts || []).map(a => a.id === acctId ? { ...a, ...changes } : a) }
        : r
    )
    updateVendor(vendorId, { reps })
  }

  const deleteAccount = (vendorId, repId, acctId) => {
    const vendor = directory.find(v => v.id === vendorId)
    if (!vendor) return
    const reps = (vendor.reps || []).map(r =>
      r.id === repId ? { ...r, accounts: (r.accounts || []).filter(a => a.id !== acctId) } : r
    )
    updateVendor(vendorId, { reps })
  }

  const toggleRep = repId => setExpandedReps(prev => {
    const s = new Set(prev); s.has(repId) ? s.delete(repId) : s.add(repId); return s
  })

  // ── Channel Manager CRUD ───────────────────────────────────────────────────
  const saveCm = () => {
    if (!cmForm.name.trim() || !cmModal) return
    const vendor = directory.find(v => v.id === cmModal.vendorId)
    if (!vendor) return
    const cms = cmForm.id
      ? (vendor.channelManagers || []).map(c => c.id === cmForm.id ? { ...c, ...cmForm } : c)
      : [...(vendor.channelManagers || []), { id: uid(), ...cmForm }]
    updateVendor(cmModal.vendorId, { channelManagers: cms })
    setCmModal(null); setCmForm(BLANK_CM)
  }

  const deleteCm = (vendorId, cmId) => {
    const vendor = directory.find(v => v.id === vendorId)
    if (!vendor) return
    const cm = (vendor.channelManagers || []).find(c => c.id === cmId)
    const vendorName = vendor.name || vendor.companyName || 'this vendor'
    const cmName = cm?.name || 'this channel manager'
    if (!window.confirm(`Delete ${cmName} from ${vendorName}?`)) return
    updateVendor(vendorId, { channelManagers: (vendor.channelManagers || []).filter(c => c.id !== cmId) })
  }

  // ── PDF/DOCX Import ────────────────────────────────────────────────────────
  const handleDocFile = async file => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'doc', 'docx', 'txt'].includes(ext)) {
      setUploadError('Unsupported type. Use PDF, DOCX, or TXT.')
      return
    }
    if (file.size > 30 * 1024 * 1024) {
      setUploadError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 30 MB.`)
      return
    }
    setUploadError(''); setUploadStatus('Reading document…')
    try {
      const ab = await file.arrayBuffer()
      let text = ''
      if (ext === 'pdf') {
        setUploadStatus('Loading PDF parser…')
        if (!window.pdfjsLib) {
          await new Promise((res, rej) => {
            const s = document.createElement('script')
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
            s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res() }
            s.onerror = () => rej(new Error('Failed to load PDF parser'))
            document.head.appendChild(s)
          })
        }
        const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise
        for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) {
          const page = await pdf.getPage(i)
          const tc = await page.getTextContent()
          text += tc.items.map(it => it.str).join(' ') + '\n'
        }
      } else if (ext === 'doc' || ext === 'docx') {
        setUploadStatus('Loading Word parser…')
        if (!window.mammoth) {
          await new Promise((res, rej) => {
            const s = document.createElement('script')
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
            s.onload = () => res()
            s.onerror = () => rej(new Error('Failed to load Word parser'))
            document.head.appendChild(s)
          })
        }
        text = (await window.mammoth.extractRawText({ arrayBuffer: ab })).value
      } else {
        text = new TextDecoder().decode(ab)
      }
      text = text.slice(0, 80000)
      setUploadStatus('Extracting vendors with AI…')
      const prompt = `Extract all vendor company information and contacts from this document. Group contacts under their companies.

Return ONLY valid JSON:
{
  "companies": [
    {
      "companyName": "string",
      "website": "string or empty",
      "category": "one of: ${VENDOR_CATS.slice(0, 8).join(', ')}, or Other",
      "notes": "string or empty",
      "contacts": [
        {"name":"string","title":"string","email":"string","phone":"string","region":"string","territory":"string","notes":"string","sourceDocument":"${file.name}"}
      ]
    }
  ]
}

Extract every person and company mentioned. Use empty string for missing fields. Do not fabricate data.

Document:
${text}`
      const resp = await callAI({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }, setUploadStatus)
      const parsed = extractJSON(resp.content?.[0]?.text || '')
      if (!parsed?.companies?.length) throw new Error('No vendor data found in document')
      setReview({ companies: parsed.companies, fileName: file.name })
      setReviewSel(new Set(parsed.companies.map((_, i) => i)))
      setUploadStatus('')
    } catch (err) {
      setUploadError(`Extraction failed: ${err.message}`)
      setUploadStatus('')
    }
  }

  const confirmDocReview = () => {
    if (!review) return
    const toImport = review.companies.filter((_, i) => reviewSel.has(i))
    let newDir = [...directory]
    let addedVendors = 0, addedReps = 0
    const toRep = c => ({
      id: uid(), name: c.name || '', email: c.email || '', phone: c.phone || '', title: c.title || '',
      notes: [c.notes, c.region && `Region: ${c.region}`, c.territory && `Territory: ${c.territory}`, c.sourceDocument && `Source: ${c.sourceDocument}`].filter(Boolean).join('\n'),
      accounts: [],
    })
    toImport.forEach(ec => {
      const existing = newDir.find(v => fuzzyMatchVendor(v.name || v.companyName, ec.companyName))
      if (existing) {
        const knownEmails = new Set((existing.reps || []).map(r => (r.email || '').toLowerCase()).filter(Boolean))
        const knownNames  = new Set((existing.reps || []).map(r => (r.name || '').toLowerCase()).filter(Boolean))
        const fresh = (ec.contacts || []).filter(c => {
          if (c.email && knownEmails.has(c.email.toLowerCase())) return false
          if (!c.email && c.name && knownNames.has(c.name.toLowerCase())) return false
          return true
        }).map(toRep)
        addedReps += fresh.length
        newDir = newDir.map(v => v.id === existing.id ? { ...existing, reps: [...(existing.reps || []), ...fresh] } : v)
      } else {
        const reps = (ec.contacts || []).map(toRep)
        addedReps += reps.length
        addedVendors++
        const nv = { id: uid(), name: ec.companyName, companyName: ec.companyName, website: ec.website || '', category: ec.category || '', notes: ec.notes || '', reps }
        newDir.push(nv)
        if (!selId) setSelId(nv.id)
      }
    })
    persist(newDir)
    setReview(null); setReviewSel(new Set())
    const msg = [addedVendors ? `${addedVendors} vendor${addedVendors !== 1 ? 's' : ''}` : null, addedReps ? `${addedReps} rep${addedReps !== 1 ? 's' : ''}` : null].filter(Boolean).join(' and ')
    toast(msg ? `Added ${msg}.` : 'Nothing new to import — all reps already existed.')
  }

  // ── Spreadsheet Import ────────────────────────────────────────────────────
  const handleSpreadsheet = async file => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setSsError('Unsupported type. Use .xlsx, .xls, or .csv.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setSsError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`)
      return
    }
    setSsError(''); setSsStatus('Reading spreadsheet…')
    try {
      const ab = await file.arrayBuffer()
      const wb = XLSX.read(ab, { type: 'array' })
      const sheetName = wb.SheetNames[0]
      if (!sheetName) throw new Error('No worksheets found')
      const sheet = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      if (rows.length < 2) throw new Error('No data rows found')
      const headers = rows[0].map(h => String(h).trim()).filter(Boolean)
      const dataRows = rows.slice(1)
        .filter(r => r.some(c => String(c).trim() !== ''))
        .slice(0, 5000)
        .map(r => headers.map((_, i) => r[i] !== undefined ? r[i] : ''))
      if (dataRows.length === 0) throw new Error('No data rows found')

      // Deterministic column mapping
      let mapping = detectColumnMapping(headers)

      // AI mapping if key columns are unclear (vendor column not needed — import is scoped to selected vendor)
      const hasCritical = mapping.accountNameColumn || mapping.repNameColumn
      if (!hasCritical) {
        setSsStatus('Using AI to identify columns…')
        const sampleRows = dataRows.slice(0, 5).map(r => {
          const obj = {}
          headers.forEach((h, i) => { if (String(r[i] ?? '').trim()) obj[h] = String(r[i]).trim() })
          return obj
        })
        try {
          const aiPrompt = `You are mapping columns from a vendor coverage spreadsheet to standard fields.

Headers: ${JSON.stringify(headers)}
Sample rows (up to 5): ${JSON.stringify(sampleRows, null, 2)}

Return ONLY valid JSON — use exact header names from the list above, or "" if not present:
{
  "repNameColumn": "",
  "repEmailColumn": "",
  "repPhoneColumn": "",
  "accountNameColumn": "",
  "statusColumn": "",
  "notesColumn": ""
}`
          const aiResp = await callAI({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: aiPrompt }] }, setSsStatus)
          const aiParsed = extractJSON(aiResp.content?.[0]?.text || '')
          if (aiParsed) mapping = { ...mapping, ...aiParsed }
        } catch { /* ignore AI errors, use deterministic mapping */ }
      }

      setSsReview({ rows: dataRows, headers, fileName: file.name })
      setSsMapping(mapping)
      setSsStatus('')
    } catch (err) {
      setSsError(`Import failed: ${err.message}`)
      setSsStatus('')
    }
  }

  const confirmSpreadsheetImport = () => {
    if (!ssReview || !sel) return
    const { rows, headers, fileName } = ssReview
    const now = new Date().toISOString()
    const vendorName = sel.name || sel.companyName || 'vendor'

    // Parse rows — vendor column intentionally ignored; import is scoped to sel
    const parsedRows = rows.map(row => ({
      repName:     getCell(row, headers, ssMapping.repNameColumn),
      repEmail:    getCell(row, headers, ssMapping.repEmailColumn),
      repPhone:    getCell(row, headers, ssMapping.repPhoneColumn),
      accountName: getCell(row, headers, ssMapping.accountNameColumn),
      status:      normalizeStatus(getCell(row, headers, ssMapping.statusColumn)),
      notes:       getCell(row, headers, ssMapping.notesColumn),
    })).filter(r => r.accountName)

    // Group by rep
    const byRep = {}
    parsedRows.forEach(row => {
      const rKey = (row.repEmail || row.repName || '__norep__').toLowerCase()
      if (!byRep[rKey]) byRep[rKey] = { repName: row.repName, repEmail: row.repEmail, repPhone: row.repPhone, accounts: [] }
      byRep[rKey].accounts.push({ accountName: row.accountName, status: row.status, notes: row.notes, sourceFileName: fileName, importedAt: now })
    })

    // Work on a copy of the selected vendor's reps
    const vendor = { ...sel, reps: (sel.reps || []).map(r => ({ ...r, accounts: [...(r.accounts || [])] })) }
    let addedReps = 0, addedAccounts = 0

    Object.values(byRep).forEach(({ repName, repEmail, repPhone, accounts }) => {
      // Match rep: email first, then exact normalized name
      let rIdx = -1
      if (repEmail) rIdx = vendor.reps.findIndex(r => (r.email || '').toLowerCase() === repEmail.toLowerCase())
      if (rIdx < 0 && repName) {
        const normName = repName.toLowerCase().trim()
        rIdx = vendor.reps.findIndex(r => (r.name || '').toLowerCase().trim() === normName)
      }

      if (rIdx >= 0) {
        const rep = { ...vendor.reps[rIdx], accounts: [...(vendor.reps[rIdx].accounts || [])] }
        const existingNames = new Set(rep.accounts.map(a => (a.accountName || '').toLowerCase().trim()))
        const newAccts = accounts.filter(a => !existingNames.has(a.accountName.toLowerCase().trim()))
        // Fill missing fields in existing accounts; preserve existing non-empty values
        rep.accounts = rep.accounts.map(a => {
          const imp = accounts.find(ia => ia.accountName.toLowerCase().trim() === a.accountName.toLowerCase().trim())
          if (!imp) return a
          return { ...a, status: a.status || imp.status, notes: a.notes || imp.notes, sourceFileName: a.sourceFileName || imp.sourceFileName }
        })
        rep.accounts.push(...newAccts.map(a => ({ ...a, id: uid() })))
        vendor.reps[rIdx] = rep
        addedAccounts += newAccts.length
      } else {
        vendor.reps.push({ id: uid(), name: repName || '', email: repEmail || '', phone: repPhone || '', title: '', notes: '', accounts: accounts.map(a => ({ ...a, id: uid() })) })
        addedReps++
        addedAccounts += accounts.length
      }
    })

    persist(directory.map(v => v.id === sel.id ? vendor : v))
    setSsReview(null); setSsMapping({})

    if (addedAccounts === 0 && addedReps === 0) {
      toast(`No new data to import — all accounts already exist under ${vendorName}.`)
    } else {
      const parts = [
        addedReps     ? `${addedReps} rep${addedReps !== 1 ? 's' : ''}` : null,
        addedAccounts ? `${addedAccounts} account${addedAccounts !== 1 ? 's' : ''}` : null,
      ].filter(Boolean)
      toast(`Imported ${parts.join(' and ')} into ${vendorName}.`)
    }
  }

  // ── Global Import — multi-vendor channel managers ─────────────────────────
  const handleGlobalImport = async file => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext)) { setGiError('Unsupported type. Use .xlsx, .xls, or .csv.'); return }
    if (file.size > 10 * 1024 * 1024) { setGiError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`); return }
    setGiError(''); setGiStatus('Reading spreadsheet…')
    try {
      const ab = await file.arrayBuffer()
      const wb = XLSX.read(ab, { type: 'array' })
      const sheetName = wb.SheetNames[0]
      if (!sheetName) throw new Error('No worksheets found')
      const sheet = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      if (rows.length < 2) throw new Error('No data rows found')
      const headers = rows[0].map(h => String(h).trim()).filter(Boolean)
      const dataRows = rows.slice(1)
        .filter(r => r.some(c => String(c).trim() !== ''))
        .slice(0, 5000)
        .map(r => headers.map((_, i) => r[i] !== undefined ? r[i] : ''))
      if (dataRows.length === 0) throw new Error('No data rows found')

      let mapping = detectGIMapping(headers)

      // AI fallback if vendor or CM name column unclear
      if (!mapping.vendorColumn || !mapping.cmNameColumn) {
        setGiStatus('Using AI to identify columns…')
        const sampleRows = dataRows.slice(0, 5).map(r => {
          const obj = {}
          headers.forEach((h, i) => { if (String(r[i] ?? '').trim()) obj[h] = String(r[i]).trim() })
          return obj
        })
        try {
          const aiPrompt = `You are mapping columns from a vendor channel manager spreadsheet for a cybersecurity company.

Headers: ${JSON.stringify(headers)}
Sample rows: ${JSON.stringify(sampleRows, null, 2)}

Return ONLY valid JSON using exact header names from the list above, or "" if not present:
{
  "vendorColumn": "",
  "cmNameColumn": "",
  "emailColumn": "",
  "phoneColumn": "",
  "titleColumn": "",
  "notesColumn": "",
  "regionColumn": ""
}`
          const aiResp = await callAI({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: aiPrompt }] }, setGiStatus)
          const aiParsed = extractJSON(aiResp.content?.[0]?.text || '')
          if (aiParsed) mapping = { ...mapping, ...aiParsed }
        } catch { /* use deterministic mapping */ }
      }

      setGiReview({ rows: dataRows, headers, fileName: file.name })
      setGiMapping(mapping)
      setGiStatus('')
    } catch (err) {
      setGiError(`Import failed: ${err.message}`)
      setGiStatus('')
    }
  }

  const confirmGlobalImport = () => {
    if (!giReview) return
    const { rows, headers, fileName } = giReview
    const now = new Date().toISOString()

    const parsedRows = rows.map(row => ({
      vendorName: getCell(row, headers, giMapping.vendorColumn),
      cmName:     getCell(row, headers, giMapping.cmNameColumn),
      email:      getCell(row, headers, giMapping.emailColumn),
      phone:      getCell(row, headers, giMapping.phoneColumn),
      title:      getCell(row, headers, giMapping.titleColumn),
      notes:      getCell(row, headers, giMapping.notesColumn),
      region:     getCell(row, headers, giMapping.regionColumn),
    }))

    const validRows = parsedRows.filter(r => r.vendorName && (r.cmName || r.email))
    const skipped = rows.length - validRows.length

    // Group by vendor
    const byVendor = {}
    validRows.forEach(row => {
      const vKey = (row.vendorName || '').toLowerCase().trim()
      if (!byVendor[vKey]) byVendor[vKey] = { vendorName: row.vendorName, cms: [] }
      byVendor[vKey].cms.push({ name: row.cmName, email: row.email, phone: row.phone, title: row.title, notes: row.notes, region: row.region })
    })

    const newDir = directory.map(v => ({ ...v, channelManagers: [...(v.channelManagers || [])] }))
    let addedVendors = 0, addedCMs = 0, updatedCMs = 0

    Object.values(byVendor).forEach(({ vendorName, cms }) => {
      let vIdx = newDir.findIndex(v => fuzzyMatchVendor(v.name || v.companyName, vendorName))
      if (vIdx < 0) {
        newDir.push({ id: uid(), name: vendorName, companyName: vendorName, website: '', category: '', notes: '', reps: [], channelManagers: [] })
        vIdx = newDir.length - 1
        addedVendors++
      }
      const vendor = { ...newDir[vIdx], channelManagers: [...(newDir[vIdx].channelManagers || [])] }

      cms.forEach(cm => {
        let cmIdx = -1
        if (cm.email) cmIdx = vendor.channelManagers.findIndex(c => (c.email || '').toLowerCase() === cm.email.toLowerCase())
        if (cmIdx < 0 && cm.name) cmIdx = vendor.channelManagers.findIndex(c => (c.name || '').toLowerCase().trim() === cm.name.toLowerCase().trim())

        if (cmIdx >= 0) {
          const ex = vendor.channelManagers[cmIdx]
          vendor.channelManagers[cmIdx] = {
            ...ex,
            email: ex.email || cm.email, phone: ex.phone || cm.phone,
            title: ex.title || cm.title, notes: ex.notes || cm.notes, region: ex.region || cm.region,
          }
          updatedCMs++
        } else {
          vendor.channelManagers.push({ id: uid(), name: cm.name || '', email: cm.email || '', phone: cm.phone || '', title: cm.title || '', region: cm.region || '', notes: cm.notes || '', sourceFileName: fileName, importedAt: now })
          addedCMs++
        }
      })
      newDir[vIdx] = vendor
    })

    persist(newDir)
    setGiReview(null); setGiMapping({})

    const vendorCount = Object.keys(byVendor).length
    const totalCMs = addedCMs + updatedCMs
    toast(totalCMs > 0
      ? `Imported ${totalCMs} channel manager${totalCMs !== 1 ? 's' : ''} across ${vendorCount} vendor${vendorCount !== 1 ? 's' : ''}.${skipped > 0 ? ` (${skipped} row${skipped !== 1 ? 's' : ''} skipped — missing vendor or name)` : ''}`
      : `No new channel managers imported.${skipped > 0 ? ` ${skipped} row${skipped !== 1 ? 's' : ''} skipped.` : ''}`
    )
  }

  // ── Toast helper ──────────────────────────────────────────────────────────
  const toast = msg => { setImportToast(msg); setTimeout(() => setImportToast(null), 6000) }

  // ── Styles ────────────────────────────────────────────────────────────────
  const inp = { width: '100%', padding: '7px 10px', border: `1px solid ${S.bdr}`, borderRadius: 6, fontSize: 13, color: S.txt, background: S.surf2, boxSizing: 'border-box', outline: 'none' }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: S.bg }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Sidebar ── */}
      <div style={{ width: 221, flexShrink: 0, background: '#FFFFFF', display: 'flex', flexDirection: 'column', borderRight: '1px solid #EEEFF2', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #EEEFF2', flexShrink: 0 }}>
          <button onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 12, fontWeight: 600, padding: '2px 0', marginBottom: 8 }}
            onMouseEnter={e => e.currentTarget.style.color = '#111827'} onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}>
            <ArrowLeft size={13} /> Back
          </button>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Vendor Directory</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{directory.length} vendor{directory.length !== 1 ? 's' : ''}</div>
        </div>

        <div style={{ padding: '10px 10px 4px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search vendors…'
              style={{ width: '100%', padding: '7px 8px 7px 26px', fontSize: 12, background: '#F9FAFB', border: '1px solid #EEEFF2', borderRadius: 6, color: '#111827', boxSizing: 'border-box', outline: 'none' }} />
          </div>
        </div>

        <div style={{ padding: '4px 10px 8px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <button onClick={() => { setVendorForm(BLANK_VENDOR); setShowVendorForm(true) }}
            style={{ width: '100%', padding: '7px', background: '#EBF4FF', border: '1px solid #BFDBFE', borderRadius: 6, color: '#007AFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <Plus size={12} /> Add Vendor
          </button>
          <button onClick={() => giFileRef.current?.click()} title='Import channel managers across multiple vendors from spreadsheet'
            style={{ width: '100%', padding: '6px', background: '#F5F3FF', border: '1px solid #C4B5FD', borderRadius: 6, color: '#7C3AED', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            🌐 Global Import (Channel Mgrs)
          </button>
          <button onClick={() => fileRef.current?.click()} title='Import vendor contacts from PDF / DOCX'
            style={{ width: '100%', padding: '6px', background: '#F9FAFB', border: '1px solid #EEEFF2', borderRadius: 6, color: '#6B7280', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Upload size={11} /> Import Vendor PDF / DOCX
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '20px 14px', fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
              {directory.length === 0 ? 'No vendors yet.' : 'No vendors match.'}
            </div>
          )}
          {filtered.map(v => {
            const isAct = selId === v.id
            const repCount = (v.reps || []).length
            const acctCount = (v.reps || []).reduce((s, r) => s + (r.accounts || []).length, 0)
            return (
              <div key={v.id}
                onClick={() => { setSelId(v.id); setCoverageSearch('') }}
                style={{ padding: '9px 12px', cursor: 'pointer', borderLeft: isAct ? '3px solid #007AFF' : '3px solid transparent', background: isAct ? '#EBF4FF' : 'transparent', color: isAct ? '#007AFF' : '#374151', transition: 'all 0.1s', borderBottom: '1px solid #EEEFF2' }}
                onMouseEnter={e => { if (!isAct) { e.currentTarget.style.background = '#F9FAFB'; e.currentTarget.style.color = '#111827' } }}
                onMouseLeave={e => { if (!isAct) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#374151' } }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name || v.companyName}</div>
                <div style={{ fontSize: 10, color: '#9CA3AF' }}>
                  {v.category || 'Uncategorized'}{(v.channelManagers || []).length > 0 ? ` · ${(v.channelManagers || []).length} CM${(v.channelManagers || []).length !== 1 ? 's' : ''}` : ''} · {repCount} rep{repCount !== 1 ? 's' : ''}{acctCount > 0 ? ` · ${acctCount} acct${acctCount !== 1 ? 's' : ''}` : ''}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* Hidden file inputs */}
        <input ref={fileRef} type='file' accept='.pdf,.doc,.docx,.txt' style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleDocFile(f); e.target.value = '' }} />
        <input ref={ssFileRef} type='file' accept='.xlsx,.xls,.csv' style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleSpreadsheet(f); e.target.value = '' }} />
        <input ref={giFileRef} type='file' accept='.xlsx,.xls,.csv' style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleGlobalImport(f); e.target.value = '' }} />

        {/* ── Coverage Search Bar ── */}
        <div style={{ marginBottom: 20, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
          <input
            value={coverageSearch}
            onChange={e => setCoverageSearch(e.target.value)}
            placeholder='Search accounts across all vendors and reps… (e.g. "Mass General" or a rep name)'
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 36px', border: '1px solid #EEEFF2', borderRadius: 8, fontSize: 13, color: '#111827', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', outline: 'none' }}
            onFocus={e => { e.target.style.borderColor = '#007AFF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,122,255,0.1)' }}
            onBlur={e => { e.target.style.borderColor = '#EEEFF2'; e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)' }}
          />
          {coverageSearch && (
            <button onClick={() => setCoverageSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2 }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* ── Coverage Search Results ── */}
        {coverageSearch.trim() && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: S.txt, marginBottom: 12 }}>
              {coverageResults.length === 0
                ? `No results for "${coverageSearch}"`
                : `${coverageResults.length} result${coverageResults.length !== 1 ? 's' : ''} for "${coverageSearch}"`}
            </div>
            {(() => {
              const acctResults = coverageResults.filter(r => r.type === 'account')
              const cmResults   = coverageResults.filter(r => r.type === 'channelManager')
              // Group account results by account name
              const byAcct = {}
              acctResults.forEach(({ vendor, rep, acct }) => {
                const key = acct.accountName.toLowerCase()
                if (!byAcct[key]) byAcct[key] = { accountName: acct.accountName, coverages: [] }
                byAcct[key].coverages.push({ vendor, rep, acct })
              })
              return (
                <>
                  {Object.values(byAcct).map(({ accountName, coverages }) => (
                    <div key={accountName} style={{ background: '#fff', border: '1px solid #EEEFF2', borderRadius: 8, marginBottom: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div style={{ padding: '10px 14px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', flex: 1 }}>{accountName}</div>
                        <span style={{ fontSize: 11, color: '#6B7280', flexShrink: 0 }}>{coverages.length} vendor coverage{coverages.length !== 1 ? 's' : ''}</span>
                      </div>
                      {coverages.map(({ vendor, rep, acct }, i) => {
                        const ss = STATUS_STYLE[acct.status] || STATUS_STYLE.Target
                        return (
                          <div key={i}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 14px', borderBottom: i < coverages.length - 1 ? '1px solid #F3F4F6' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                            onClick={() => { setSelId(vendor.id); setCoverageSearch(''); setExpandedReps(prev => { const s = new Set(prev); s.add(rep.id); return s }) }}
                            onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{vendor.name || vendor.companyName}</span>
                                <span style={{ fontSize: 11, color: '#9CA3AF' }}>·</span>
                                <span style={{ fontSize: 12, color: '#374151' }}>{rep.name || 'Unknown Rep'}</span>
                                {rep.email && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{rep.email}</span>}
                              </div>
                              {acct.notes && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2, lineHeight: 1.4 }}>{acct.notes}</div>}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: ss.color, background: ss.bg, border: `1px solid ${ss.border}`, padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>{acct.status}</span>
                            <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0, marginTop: 2 }}>→</span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                  {cmResults.length > 0 && (
                    <div style={{ background: '#fff', border: '1px solid #EDE9FE', borderRadius: 8, marginBottom: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div style={{ padding: '10px 14px', borderBottom: '1px solid #F5F3FF', background: '#F5F3FF', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#5B21B6', flex: 1 }}>🌐 Channel Managers</div>
                        <span style={{ fontSize: 11, color: '#7C3AED', flexShrink: 0 }}>{cmResults.length} match{cmResults.length !== 1 ? 'es' : ''}</span>
                      </div>
                      {cmResults.map(({ vendor, cm }, i) => (
                        <div key={i}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < cmResults.length - 1 ? '1px solid #F5F3FF' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                          onClick={() => { setSelId(vendor.id); setCoverageSearch('') }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{cm.name}</span>
                              {cm.title && <span style={{ fontSize: 11, color: '#7C3AED', background: '#EDE9FE', padding: '1px 7px', borderRadius: 4 }}>{cm.title}</span>}
                              <span style={{ fontSize: 11, color: '#9CA3AF' }}>at</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{vendor.name || vendor.companyName}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                              {cm.email && <span style={{ fontSize: 11, color: '#6B7280' }}>{cm.email}</span>}
                              {cm.region && <span style={{ fontSize: 11, color: '#6B7280' }}>📍 {cm.region}</span>}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>→</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* ── Content (hidden when coverage search active) ── */}
        {!coverageSearch.trim() && (
          <>
            {/* PDF upload status/error */}
            {(uploadStatus || uploadError) && (
              <div style={{ background: S.surf, border: `1px solid ${S.bdr}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                {uploadStatus && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 14, height: 14, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: S.txt }}>{uploadStatus}</span>
                  </div>
                )}
                {uploadError && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#dc2626' }}>{uploadError}</span>
                    <button onClick={() => setUploadError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                  </div>
                )}
              </div>
            )}

            {/* Global Import status/error */}
            {(giStatus || giError) && !giReview && (
              <div style={{ background: S.surf, border: `1px solid ${S.bdr}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                {giStatus && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 14, height: 14, border: '2px solid #7C3AED', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: S.txt }}>{giStatus}</span>
                  </div>
                )}
                {giError && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#dc2626' }}>{giError}</span>
                    <button onClick={() => setGiError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                  </div>
                )}
              </div>
            )}

            {/* Spreadsheet status/error */}
            {(ssStatus || ssError) && (
              <div style={{ background: S.surf, border: `1px solid ${S.bdr}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                {ssStatus && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 14, height: 14, border: '2px solid #15803d', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: S.txt }}>{ssStatus}</span>
                  </div>
                )}
                {ssError && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#dc2626' }}>{ssError}</span>
                    <button onClick={() => setSsError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                  </div>
                )}
              </div>
            )}

            {/* ── PDF Review ── */}
            {review && (
              <div style={{ background: S.surf, border: `1px solid ${S.bdr}`, borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: S.txt }}>Review Extracted Vendors</div>
                    <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>
                      {review.fileName} &nbsp;·&nbsp; {review.companies.length} compan{review.companies.length === 1 ? 'y' : 'ies'} found &nbsp;·&nbsp;
                      <button onClick={() => setReviewSel(reviewSel.size === review.companies.length ? new Set() : new Set(review.companies.map((_, i) => i)))}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: S.blue, fontSize: 12, fontWeight: 600 }}>
                        {reviewSel.size === review.companies.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setReview(null); setReviewSel(new Set()) }}
                      style={{ padding: '7px 14px', background: 'transparent', border: `1px solid ${S.bdr}`, borderRadius: 6, color: S.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={confirmDocReview} disabled={reviewSel.size === 0}
                      style={{ padding: '7px 16px', background: reviewSel.size > 0 ? '#007AFF' : '#9CA3AF', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: reviewSel.size > 0 ? 'pointer' : 'not-allowed' }}>
                      {reviewSel.size === review.companies.length ? 'Save All' : `Save ${reviewSel.size} of ${review.companies.length}`}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                  {review.companies.map((ec, i) => {
                    const willMerge = !!directory.find(d => fuzzyMatchVendor(d.name || d.companyName, ec.companyName))
                    const isChecked = reviewSel.has(i)
                    return (
                      <div key={i} onClick={() => setReviewSel(prev => { const ns = new Set(prev); ns.has(i) ? ns.delete(i) : ns.add(i); return ns })}
                        style={{ padding: '12px 14px', background: isChecked ? '#EBF4FF' : '#f8fafc', border: `1px solid ${isChecked ? 'rgba(0,122,255,0.5)' : S.bdr}`, borderRadius: 8, cursor: 'pointer', userSelect: 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <input type='checkbox' checked={isChecked} readOnly style={{ marginTop: 3, cursor: 'pointer', accentColor: '#007AFF', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: S.txt }}>{ec.companyName}</span>
                              {ec.category && <span style={{ fontSize: 10, background: '#e0f2fe', color: '#0369a1', padding: '1px 7px', borderRadius: 4 }}>{ec.category}</span>}
                              {willMerge && <span style={{ fontSize: 10, background: '#fef3c7', color: '#d97706', padding: '1px 7px', borderRadius: 4, fontWeight: 600 }}>Will merge</span>}
                              {(ec.contacts || []).length > 0 && <span style={{ fontSize: 10, color: S.muted }}>{(ec.contacts || []).length} rep{(ec.contacts || []).length !== 1 ? 's' : ''}</span>}
                            </div>
                            {(ec.contacts || []).length > 0 && (
                              <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {(ec.contacts || []).slice(0, 8).map((ct, j) => (
                                  <span key={j} style={{ fontSize: 11, color: S.muted, background: '#f1f5f9', border: `1px solid ${S.bdr}`, padding: '2px 8px', borderRadius: 4 }}>
                                    {ct.name}{ct.title ? ` · ${ct.title}` : ''}
                                  </span>
                                ))}
                                {(ec.contacts || []).length > 8 && <span style={{ fontSize: 11, color: S.muted, padding: '2px 4px' }}>+{(ec.contacts || []).length - 8} more</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Global Import Review (channel managers, multi-vendor) ── */}
            {giReview && (
              <div style={{ background: S.surf, border: '1px solid #C4B5FD', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: S.txt, marginBottom: 2 }}>🌐 Global Import — Channel Managers</div>
                <div style={{ fontSize: 12, color: S.muted, marginBottom: 16 }}>
                  {giReview.fileName} · {giReview.rows.length} data row{giReview.rows.length !== 1 ? 's' : ''} · Creates or updates vendors and adds channel managers
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 18 }}>
                  {[
                    { key: 'vendorColumn',  label: 'Vendor / Company Name ✱' },
                    { key: 'cmNameColumn',  label: 'Channel Manager Name ✱' },
                    { key: 'emailColumn',   label: 'Email' },
                    { key: 'phoneColumn',   label: 'Phone' },
                    { key: 'titleColumn',   label: 'Title / Role' },
                    { key: 'regionColumn',  label: 'Region / Territory' },
                    { key: 'notesColumn',   label: 'Notes' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: S.muted, marginBottom: 3 }}>{label}</div>
                      <select value={giMapping[key] || ''} onChange={e => setGiMapping(p => ({ ...p, [key]: e.target.value }))}
                        style={{ width: '100%', padding: '5px 7px', border: `1px solid ${(key === 'vendorColumn' || key === 'cmNameColumn') && giMapping[key] ? '#C4B5FD' : S.bdr}`, borderRadius: 5, fontSize: 12, color: S.txt, background: S.surf, boxSizing: 'border-box', outline: 'none' }}>
                        <option value=''>(not mapped)</option>
                        {giReview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: S.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Preview (first 5 rows)</div>
                  <div style={{ overflowX: 'auto', border: `1px solid ${S.bdr}`, borderRadius: 6 }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
                      <thead><tr>{giReview.headers.slice(0, 8).map(h => <th key={h} style={{ textAlign: 'left', padding: '5px 10px', background: '#F9FAFB', color: '#6B7280', fontWeight: 600, borderBottom: `1px solid ${S.bdr}`, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                      <tbody>{giReview.rows.slice(0, 5).map((row, i) => <tr key={i} style={{ borderBottom: i < 4 ? `1px solid ${S.bdr}` : 'none' }}>{giReview.headers.slice(0, 8).map((_, j) => <td key={j} style={{ padding: '5px 10px', color: S.txt, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(row[j] ?? '').slice(0, 80)}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setGiReview(null); setGiMapping({}) }}
                    style={{ padding: '7px 14px', background: 'transparent', border: `1px solid ${S.bdr}`, borderRadius: 6, color: S.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={confirmGlobalImport} disabled={!giMapping.vendorColumn || !giMapping.cmNameColumn}
                    style={{ padding: '7px 16px', background: giMapping.vendorColumn && giMapping.cmNameColumn ? '#7C3AED' : '#9CA3AF', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: giMapping.vendorColumn && giMapping.cmNameColumn ? 'pointer' : 'not-allowed' }}>
                    Import {giReview.rows.length} Row{giReview.rows.length !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            )}

            {/* ── Spreadsheet Review ── */}
            {ssReview && (
              <div style={{ background: S.surf, border: '1px solid #86EFAC', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
                {!sel && (
                  <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e' }}>
                    No vendor selected — select a vendor first, then import. <button onClick={() => { setSsReview(null); setSsMapping({}) }} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 600, padding: 0, marginLeft: 8 }}>Cancel</button>
                  </div>
                )}
                <div style={{ fontSize: 15, fontWeight: 700, color: S.txt, marginBottom: 2 }}>
                  Import Coverage → <span style={{ color: '#007AFF' }}>{sel?.name || sel?.companyName || '(no vendor selected)'}</span>
                </div>
                <div style={{ fontSize: 12, color: S.muted, marginBottom: 16 }}>
                  {ssReview.fileName} · {ssReview.rows.length} data row{ssReview.rows.length !== 1 ? 's' : ''} · All rows will be imported as reps/accounts under {sel ? (sel.name || sel.companyName) : 'the selected vendor'}
                </div>

                {/* Column mapping */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 18 }}>
                  {[
                    { key: 'repNameColumn',     label: 'Rep / Owner Name' },
                    { key: 'repEmailColumn',    label: 'Rep Email' },
                    { key: 'repPhoneColumn',    label: 'Rep Phone' },
                    { key: 'accountNameColumn', label: 'Account / Client Name ✱' },
                    { key: 'statusColumn',      label: 'Status / Relationship' },
                    { key: 'notesColumn',       label: 'Notes' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: S.muted, marginBottom: 3 }}>{label}</div>
                      <select value={ssMapping[key] || ''} onChange={e => setSsMapping(p => ({ ...p, [key]: e.target.value }))}
                        style={{ width: '100%', padding: '5px 7px', border: `1px solid ${key === 'accountNameColumn' && ssMapping[key] ? '#86EFAC' : S.bdr}`, borderRadius: 5, fontSize: 12, color: S.txt, background: S.surf, boxSizing: 'border-box', outline: 'none' }}>
                        <option value=''>(not mapped)</option>
                        {ssReview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Data preview */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: S.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Preview (first 5 rows)</div>
                  <div style={{ overflowX: 'auto', border: `1px solid ${S.bdr}`, borderRadius: 6 }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
                      <thead>
                        <tr>
                          {ssReview.headers.slice(0, 8).map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '5px 10px', background: '#F9FAFB', color: '#6B7280', fontWeight: 600, borderBottom: `1px solid ${S.bdr}`, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ssReview.rows.slice(0, 5).map((row, i) => (
                          <tr key={i} style={{ borderBottom: i < 4 ? `1px solid ${S.bdr}` : 'none' }}>
                            {ssReview.headers.slice(0, 8).map((_, j) => (
                              <td key={j} style={{ padding: '5px 10px', color: S.txt, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {String(row[j] ?? '').slice(0, 80)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setSsReview(null); setSsMapping({}) }}
                    style={{ padding: '7px 14px', background: 'transparent', border: `1px solid ${S.bdr}`, borderRadius: 6, color: S.muted, fontSize: 13, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={confirmSpreadsheetImport} disabled={!ssMapping.accountNameColumn || !sel}
                    style={{ padding: '7px 16px', background: ssMapping.accountNameColumn && sel ? '#15803D' : '#9CA3AF', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: ssMapping.accountNameColumn && sel ? 'pointer' : 'not-allowed' }}>
                    Import {ssReview.rows.length} Row{ssReview.rows.length !== 1 ? 's' : ''} into {sel ? (sel.name || sel.companyName) : '(select vendor first)'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Empty State ── */}
            {!sel && !review && !ssReview && !giReview && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '35vh', gap: 10, color: S.muted }}>
                <div style={{ fontSize: 36, opacity: 0.3 }}>🏢</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: S.txt }}>No vendor selected</div>
                <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 380, lineHeight: 1.6 }}>
                  Select a vendor from the sidebar to view channel managers, reps, and accounts.
                  <br/>
                  Use <strong>🌐 Global Import</strong> in the sidebar to bulk-import channel managers across multiple vendors from a spreadsheet.
                  <br/>
                  Use <strong>Import Coverage</strong> inside a selected vendor to load rep/account data.
                </div>
              </div>
            )}

            {/* ── Vendor Detail ── */}
            {sel && !review && !ssReview && (
              <>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: S.txt, lineHeight: 1.2 }}>{sel.name || sel.companyName}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                      {sel.category && <span style={{ fontSize: 11, background: '#EBF4FF', color: '#007AFF', padding: '2px 9px', borderRadius: 4 }}>{sel.category}</span>}
                      {sel.website && <a href={sel.website.startsWith('http') ? sel.website : `https://${sel.website}`} target='_blank' rel='noreferrer'
                        style={{ fontSize: 12, color: S.blue, textDecoration: 'none', fontWeight: 500 }}>{sel.website}</a>}
                    </div>
                    {sel.notes && <div style={{ fontSize: 13, color: S.muted, marginTop: 6, maxWidth: 560, lineHeight: 1.5 }}>{sel.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => { setVendorForm({ ...sel, name: sel.name || sel.companyName || '' }); setShowVendorForm(true) }}
                      style={{ padding: '7px 13px', background: 'transparent', border: `1px solid ${S.bdr}`, borderRadius: 6, color: S.txt, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Pencil size={12} /> Edit
                    </button>
                    <button onClick={() => deleteVendor(sel.id)}
                      style={{ padding: '7px 13px', background: 'transparent', border: '1px solid #fca5a5', borderRadius: 6, color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>

                {/* ── Channel Managers ── */}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: S.txt }}>
                        Channel Managers <span style={{ fontSize: 12, fontWeight: 400, color: S.muted }}>({(sel.channelManagers || []).length})</span>
                      </div>
                      <div style={{ fontSize: 11, color: S.muted, marginTop: 1 }}>GuidePoint's liaisons into this vendor</div>
                    </div>
                    <button onClick={() => { setCmModal({ vendorId: sel.id }); setCmForm(BLANK_CM) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#7C3AED', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  {(sel.channelManagers || []).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '12px 20px', color: S.muted, fontSize: 12, background: S.surf, borderRadius: 8, border: `1px dashed ${S.bdr}` }}>
                      No channel managers yet — use <strong>🌐 Global Import</strong> or click Add.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(sel.channelManagers || []).map(cm => (
                        <div key={cm.id} style={{ background: S.surf, border: '1px solid #EDE9FE', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>👤</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: S.txt }}>{cm.name}</span>
                              {cm.title && <span style={{ fontSize: 10, color: '#7C3AED', background: '#EDE9FE', padding: '1px 7px', borderRadius: 4 }}>{cm.title}</span>}
                              {cm.region && <span style={{ fontSize: 10, color: S.muted, background: S.surf2, padding: '1px 7px', borderRadius: 4 }}>📍 {cm.region}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 12, marginTop: 3, flexWrap: 'wrap' }}>
                              {cm.email && <a href={`mailto:${cm.email}`} style={{ fontSize: 11, color: S.blue, textDecoration: 'none' }}>{cm.email}</a>}
                              {cm.phone && <span style={{ fontSize: 11, color: S.muted }}>{cm.phone}</span>}
                            </div>
                            {cm.notes && <div style={{ fontSize: 11, color: S.muted, marginTop: 2, fontStyle: 'italic' }}>{cm.notes}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                            <button onClick={() => { setCmModal({ vendorId: sel.id, cmId: cm.id }); setCmForm({ ...cm }) }}
                              style={{ padding: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: S.muted, borderRadius: 4, display: 'flex' }}
                              onMouseEnter={e => e.currentTarget.style.color = '#7C3AED'} onMouseLeave={e => e.currentTarget.style.color = S.muted}>
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteCm(sel.id, cm.id)}
                              style={{ padding: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: S.muted, borderRadius: 4, display: 'flex' }}
                              onMouseEnter={e => e.currentTarget.style.color = '#dc2626'} onMouseLeave={e => e.currentTarget.style.color = S.muted}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Reps header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: S.txt }}>Sales Reps ({(sel.reps || []).length})</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <button onClick={() => ssFileRef.current?.click()} title='Import rep/account coverage from spreadsheet'
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 6, color: '#15803D', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    <FileSpreadsheet size={11} /> Import Coverage
                  </button>
                  <button onClick={() => { setRepModal({ vendorId: sel.id }); setRepForm(BLANK_REP) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#007AFF', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    <Plus size={12} /> Add Rep
                  </button>
                  </div>
                </div>

                {(sel.reps || []).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '28px 20px', color: S.muted, fontSize: 13, background: S.surf, borderRadius: 8, border: `1px dashed ${S.bdr}` }}>
                    No reps yet. Add a sales rep or import a spreadsheet to load coverage data.
                  </div>
                )}

                {/* Rep list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(sel.reps || []).map(rep => {
                    const isExpanded = expandedReps.has(rep.id)
                    const acctCount = (rep.accounts || []).length
                    return (
                      <div key={rep.id} style={{ background: S.surf, border: `1px solid ${S.bdr}`, borderRadius: 8, overflow: 'hidden' }}>
                        {/* Rep header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => toggleRep(rep.id)}>
                          <span style={{ color: S.muted, display: 'flex', flexShrink: 0 }}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: S.txt }}>{rep.name}</span>
                              {rep.title && <span style={{ fontSize: 12, color: S.muted }}>{rep.title}</span>}
                              {acctCount > 0 && (
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#007AFF', background: '#EBF4FF', borderRadius: 999, padding: '1px 7px' }}>
                                  {acctCount} account{acctCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 14, marginTop: 2, flexWrap: 'wrap' }}>
                              {rep.email && <span style={{ fontSize: 12, color: S.muted }}>{rep.email}</span>}
                              {rep.phone && <span style={{ fontSize: 12, color: S.muted }}>{rep.phone}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => { setRepModal({ vendorId: sel.id, repId: rep.id }); setRepForm({ ...rep }) }}
                              style={{ padding: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: S.muted, borderRadius: 4, display: 'flex' }}
                              onMouseEnter={e => e.currentTarget.style.color = '#007AFF'} onMouseLeave={e => e.currentTarget.style.color = S.muted}>
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteRep(sel.id, rep.id)}
                              style={{ padding: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: S.muted, borderRadius: 4, display: 'flex' }}
                              onMouseEnter={e => e.currentTarget.style.color = '#dc2626'} onMouseLeave={e => e.currentTarget.style.color = S.muted}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Rep body */}
                        {isExpanded && (
                          <div style={{ borderTop: `1px solid ${S.bdr}`, padding: '14px 16px', background: '#fafafa' }}>
                            {rep.notes && <div style={{ fontSize: 12, color: S.muted, fontStyle: 'italic', marginBottom: 12, lineHeight: 1.55, paddingLeft: 2 }}>{rep.notes}</div>}

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Accounts {acctCount > 0 && `(${acctCount})`}
                              </div>
                              {addingAccountForRep !== rep.id && (
                                <button onClick={() => { setAddingAccountForRep(rep.id); setNewAcctForm(BLANK_ACCT) }}
                                  style={{ fontSize: 12, fontWeight: 600, color: '#007AFF', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <Plus size={11} /> Add Account
                                </button>
                              )}
                            </div>

                            {acctCount > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                                {(rep.accounts || []).map(acct => {
                                  const ss = STATUS_STYLE[acct.status] || STATUS_STYLE.Target
                                  return (
                                    <div key={acct.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', background: '#fff', borderRadius: 6, border: `1px solid ${S.bdr}` }}>
                                      <input
                                        value={acct.accountName}
                                        onChange={e => updateAccount(sel.id, rep.id, acct.id, { accountName: e.target.value })}
                                        placeholder='Account name'
                                        style={{ flex: '0 0 170px', padding: '4px 7px', border: `1px solid ${S.bdr}`, borderRadius: 5, fontSize: 13, fontWeight: 600, color: S.txt, background: 'transparent', outline: 'none', minWidth: 0 }}
                                      />
                                      <select
                                        value={acct.status}
                                        onChange={e => updateAccount(sel.id, rep.id, acct.id, { status: e.target.value })}
                                        style={{ flex: '0 0 96px', padding: '4px 5px', border: `1px solid ${ss.border}`, borderRadius: 5, fontSize: 11, fontWeight: 700, color: ss.color, background: ss.bg, outline: 'none', cursor: 'pointer' }}>
                                        {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                                      </select>
                                      <input
                                        value={acct.notes}
                                        onChange={e => updateAccount(sel.id, rep.id, acct.id, { notes: e.target.value })}
                                        placeholder='Quick notes…'
                                        style={{ flex: 1, padding: '4px 7px', border: `1px solid ${S.bdr}`, borderRadius: 5, fontSize: 12, color: S.txt, background: 'transparent', outline: 'none', minWidth: 0 }}
                                      />
                                      <button onClick={() => deleteAccount(sel.id, rep.id, acct.id)}
                                        style={{ padding: '3px 4px', background: 'transparent', border: 'none', cursor: 'pointer', color: S.muted, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                                        onMouseEnter={e => e.currentTarget.style.color = '#dc2626'} onMouseLeave={e => e.currentTarget.style.color = S.muted}>
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Add account form */}
                            {addingAccountForRep === rep.id && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px', background: '#EBF4FF', borderRadius: 6, border: '1px solid #BFDBFE', marginBottom: 8 }}>
                                <input
                                  autoFocus
                                  value={newAcctForm.accountName}
                                  onChange={e => setNewAcctForm(p => ({ ...p, accountName: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') addAccount(sel.id, rep.id); if (e.key === 'Escape') { setAddingAccountForRep(null); setNewAcctForm(BLANK_ACCT) } }}
                                  placeholder='Account name…'
                                  style={{ flex: '0 0 170px', padding: '4px 7px', border: '1px solid #BFDBFE', borderRadius: 5, fontSize: 13, fontWeight: 600, color: S.txt, background: '#fff', outline: 'none' }}
                                />
                                <select
                                  value={newAcctForm.status}
                                  onChange={e => setNewAcctForm(p => ({ ...p, status: e.target.value }))}
                                  style={{ flex: '0 0 96px', padding: '4px 5px', border: '1px solid #BFDBFE', borderRadius: 5, fontSize: 11, fontWeight: 700, color: '#475569', background: '#fff', outline: 'none', cursor: 'pointer' }}>
                                  {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <button onClick={() => addAccount(sel.id, rep.id)}
                                  style={{ padding: '4px 12px', background: '#007AFF', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                                  Add
                                </button>
                                <button onClick={() => { setAddingAccountForRep(null); setNewAcctForm(BLANK_ACCT) }}
                                  style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #BFDBFE', borderRadius: 5, color: S.muted, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
                                  Cancel
                                </button>
                              </div>
                            )}

                            {acctCount === 0 && addingAccountForRep !== rep.id && (
                              <div style={{ fontSize: 12, color: S.muted, fontStyle: 'italic', paddingLeft: 2 }}>No accounts tracked yet.</div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Toast ── */}
      {importToast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'rgba(22,163,74,0.93)', color: '#fff', padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {importToast}
        </div>
      )}

      {/* ── Vendor Form Modal ── */}
      {showVendorForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => { setShowVendorForm(false); setVendorForm(BLANK_VENDOR) }}>
          <div style={{ background: S.surf, borderRadius: 10, padding: '24px 28px', width: '100%', maxWidth: 460, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: S.txt }}>{vendorForm.id ? 'Edit Vendor' : 'Add Vendor'}</div>
              <button onClick={() => { setShowVendorForm(false); setVendorForm(BLANK_VENDOR) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.muted, padding: 2 }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: S.muted, marginBottom: 4 }}>Company Name *</div>
                <input value={vendorForm.name || ''} onChange={e => setVendorForm(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && saveVendor()} autoFocus style={inp} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: S.muted, marginBottom: 4 }}>Category</div>
                <select value={vendorForm.category || ''} onChange={e => setVendorForm(p => ({ ...p, category: e.target.value }))} style={inp}>
                  <option value=''>Select category…</option>
                  {VENDOR_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: S.muted, marginBottom: 4 }}>Website</div>
                <input value={vendorForm.website || ''} onChange={e => setVendorForm(p => ({ ...p, website: e.target.value }))} placeholder='acme.com' style={inp} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: S.muted, marginBottom: 4 }}>Notes</div>
                <textarea value={vendorForm.notes || ''} onChange={e => setVendorForm(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => { setShowVendorForm(false); setVendorForm(BLANK_VENDOR) }}
                style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${S.bdr}`, borderRadius: 6, color: S.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveVendor}
                style={{ padding: '8px 16px', background: '#007AFF', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Channel Manager Form Modal ── */}
      {cmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => { setCmModal(null); setCmForm(BLANK_CM) }}>
          <div style={{ background: S.surf, borderRadius: 10, padding: '24px 28px', width: '100%', maxWidth: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: S.txt }}>{cmForm.id ? 'Edit Channel Manager' : 'Add Channel Manager'}</div>
              <button onClick={() => { setCmModal(null); setCmForm(BLANK_CM) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.muted, padding: 2 }}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { k: 'name',   l: 'Full Name *', span: 2 },
                { k: 'title',  l: 'Title / Role' },
                { k: 'email',  l: 'Email' },
                { k: 'phone',  l: 'Phone' },
                { k: 'region', l: 'Region / Territory' },
              ].map(({ k, l, span }) => (
                <div key={k} style={{ gridColumn: span === 2 ? 'span 2' : undefined }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: S.muted, marginBottom: 4 }}>{l}</div>
                  <input value={cmForm[k] || ''} onChange={e => setCmForm(p => ({ ...p, [k]: e.target.value }))}
                    autoFocus={k === 'name'} style={inp} />
                </div>
              ))}
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: S.muted, marginBottom: 4 }}>Notes</div>
                <textarea value={cmForm.notes || ''} onChange={e => setCmForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => { setCmModal(null); setCmForm(BLANK_CM) }}
                style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${S.bdr}`, borderRadius: 6, color: S.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveCm}
                style={{ padding: '8px 16px', background: '#7C3AED', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rep Form Modal ── */}
      {repModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => { setRepModal(null); setRepForm(BLANK_REP) }}>
          <div style={{ background: S.surf, borderRadius: 10, padding: '24px 28px', width: '100%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: S.txt }}>{repForm.id ? 'Edit Rep' : 'Add Sales Rep'}</div>
              <button onClick={() => { setRepModal(null); setRepForm(BLANK_REP) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.muted, padding: 2 }}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { k: 'name', l: 'Full Name *', span: 2 },
                { k: 'title', l: 'Title' },
                { k: 'email', l: 'Email' },
                { k: 'phone', l: 'Phone', span: 1 },
              ].map(({ k, l, span }) => (
                <div key={k} style={{ gridColumn: span === 2 ? 'span 2' : undefined }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: S.muted, marginBottom: 4 }}>{l}</div>
                  <input value={repForm[k] || ''} onChange={e => setRepForm(p => ({ ...p, [k]: e.target.value }))}
                    autoFocus={k === 'name'} style={inp} />
                </div>
              ))}
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: S.muted, marginBottom: 4 }}>Notes</div>
                <textarea value={repForm.notes || ''} onChange={e => setRepForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => { setRepModal(null); setRepForm(BLANK_REP) }}
                style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${S.bdr}`, borderRadius: 6, color: S.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveRep}
                style={{ padding: '8px 16px', background: '#007AFF', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
