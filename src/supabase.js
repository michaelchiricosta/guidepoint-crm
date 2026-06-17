import { createClient } from '@supabase/supabase-js'

// Anon (publishable) key — safe to be client-side. Supabase RLS is the access gate.
// Override via VITE_SUPABASE_URL / VITE_SUPABASE_KEY env vars to avoid hardcoding in source.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://aenlxbxkrxgylgknlcft.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_3rSqBpPP1xF2H6QWw5-xsw_YhpKuMyW'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: {
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  }
})

// ─── Upload limits ────────────────────────────────────────────────────────────
const FILE_MAX_BYTES   = 25 * 1024 * 1024   // 25 MB for account documents
const PHOTO_MAX_BYTES  =  5 * 1024 * 1024   //  5 MB for contact photos

const ALLOWED_FILE_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
])

const ALLOWED_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// Strip path traversal chars and control characters; truncate to 100 chars.
const sanitizeFileName = name => {
  const base = String(name || 'file')
    .replace(/[/\\]/g, '_')       // no path separators
    .replace(/\.{2,}/g, '_')      // no ..
    .replace(/[^\w\s.\-]/g, '_')  // only word chars, spaces, dots, hyphens
    .trim()
    .slice(0, 100)
  return base || 'file'
}

// ─── Feature flag ─────────────────────────────────────────────────────────────
// Set to false to disable normalized dual-write without touching any other logic.
const ENABLE_NORMALIZED_DUAL_WRITE = true

// ─── Save/load timing (localStorage, never Supabase) ─────────────────────────
const _LS_LOAD_MS = 'ledgr_load_duration_ms'
const _LS_LOAD_TS = 'ledgr_load_time'
const _LS_SAVE_MS = 'ledgr_save_duration_ms'
const _LS_SAVE_TS = 'ledgr_save_time'

const _recordTiming = (msKey, tsKey, ms) => {
  try { localStorage.setItem(msKey, String(ms)); localStorage.setItem(tsKey, new Date().toISOString()) } catch {}
}

export const getLoadTiming = () => {
  try {
    const ms = parseInt(localStorage.getItem(_LS_LOAD_MS) || '0') || null
    return { durationMs: ms, at: localStorage.getItem(_LS_LOAD_TS) || null }
  } catch { return { durationMs: null, at: null } }
}

export const getSaveTiming = () => {
  try {
    const ms = parseInt(localStorage.getItem(_LS_SAVE_MS) || '0') || null
    return { durationMs: ms, at: localStorage.getItem(_LS_SAVE_TS) || null }
  } catch { return { durationMs: null, at: null } }
}

// ─── Pre-save pruning ─────────────────────────────────────────────────────────

// Cap aiCache to 200 newest entries (by cachedAt).
const _pruneAICache = (cache) => {
  if (!cache || typeof cache !== 'object') return {}
  const entries = Object.entries(cache)
  if (entries.length <= 200) return cache
  const sorted = entries.sort((a, b) =>
    new Date(b[1]?.cachedAt || 0).getTime() - new Date(a[1]?.cachedAt || 0).getTime()
  )
  return Object.fromEntries(sorted.slice(0, 200))
}

// Cap healthScoreHistory to last 90 days per account.
const _pruneHealthHistory = (accounts) => {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  return accounts.map(a => {
    if (!a.healthScoreHistory?.length) return a
    const pruned = a.healthScoreHistory.filter(e => (e.date || '') >= cutoffStr)
    return pruned.length === a.healthScoreHistory.length ? a : { ...a, healthScoreHistory: pruned }
  })
}

// Master pre-save transform: prune volatile/large fields, never persists apiKey.
const _prepareForSave = (data) => {
  // apiKey — never reaches Supabase (stripped by caller too, belt-and-suspenders)
  // aiUsageLog — legacy field superseded by aiTracker localStorage; strip to save space
  // aiCache — cap to 200 entries to prevent unbounded growth
  // healthScoreHistory — cap to 90 days per account
  const { apiKey: _k, aiUsageLog: _ul, ...safe } = data
  if (safe.aiCache) safe.aiCache = _pruneAICache(safe.aiCache)
  if (safe.accounts?.length) safe.accounts = _pruneHealthHistory(safe.accounts)
  return safe
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export const loadData = async () => {
  const t0 = Date.now()
  try {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', 'user-data')
      .single()
      .throwOnError()
    _recordTiming(_LS_LOAD_MS, _LS_LOAD_TS, Date.now() - t0)
    if (!data) return null
    return data.data
  } catch (e) {
    console.error('[loadData] error:', e.message)
    return null
  }
}

export const saveData = async (appData) => {
  const t0 = Date.now()
  // Strip secrets + volatile fields, prune large caches before persisting.
  const pruned = _prepareForSave(appData)
  const { error } = await supabase
    .from('accounts')
    .upsert({ id: 'user-data', data: pruned, updated_at: new Date().toISOString() })
  _recordTiming(_LS_SAVE_MS, _LS_SAVE_TS, Date.now() - t0)
  if (error) console.error('[saveData] error:', error.message)
  // Dual-write: sync normalized tables after a successful blob save.
  // Best-effort, fire-and-forget — blob result is returned immediately regardless
  // of sync outcome. Toggle off via ENABLE_NORMALIZED_DUAL_WRITE above.
  if (!error && ENABLE_NORMALIZED_DUAL_WRITE) {
    syncAppDataToNormalized(appData).catch(e =>
      console.warn('[saveData] normalized sync failed (non-fatal):', e.message)
    )
  }
  return { error }
}

// ─── Account files ────────────────────────────────────────────────────────────

export const uploadFile = async (accountId, file, category, notes) => {
  if (file.size > FILE_MAX_BYTES) {
    throw new Error(`File is too large (${(file.size/1024/1024).toFixed(1)} MB). Maximum is 25 MB.`)
  }
  if (!ALLOWED_FILE_MIME.has(file.type)) {
    throw new Error(`File type "${file.type || 'unknown'}" is not allowed. Use PDF, Word, Excel, PowerPoint, CSV, TXT, or image files.`)
  }
  const safeName = sanitizeFileName(file.name)
  const filePath = `${accountId}/${Date.now()}_${safeName}`
  const { error } = await supabase.storage
    .from('account-files')
    .upload(filePath, file)
  if (error) throw new Error('Upload failed. Please try again.')
  return {
    id: Date.now().toString(),
    name: file.name.slice(0, 200),   // store original display name (truncated)
    type: file.type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    category: category || 'Other',
    notes: notes || '',
    path: filePath
  }
}

export const getFileUrl = async (path) => {
  const { data } = await supabase.storage
    .from('account-files')
    .createSignedUrl(path, 3600)
  return data?.signedUrl
}

export const deleteFile = async (path) => {
  const { error } = await supabase.storage
    .from('account-files')
    .remove([path])
  if (error) throw new Error('Delete failed. Please try again.')
}

// ─── Contact photos ───────────────────────────────────────────────────────────

export const uploadContactPhoto = async (accountId, contactId, file) => {
  if (file.size > PHOTO_MAX_BYTES) {
    throw new Error(`Photo is too large (${(file.size/1024/1024).toFixed(1)} MB). Maximum is 5 MB.`)
  }
  if (!ALLOWED_PHOTO_MIME.has(file.type)) {
    throw new Error('Only JPEG, PNG, GIF, or WebP images are allowed for contact photos.')
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const safeExt = ['jpg','jpeg','png','gif','webp'].includes(ext) ? ext : 'jpg'
  const path = `${accountId}/${contactId}-${Date.now()}.${safeExt}`
  const { error: uploadError } = await supabase.storage
    .from('contact-photos')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) throw new Error('Photo upload failed. Please try again.')
  const { data: urlData } = supabase.storage
    .from('contact-photos')
    .getPublicUrl(path)
  return { url: urlData.publicUrl, path }
}

export const deleteContactPhoto = async (path) => {
  if (!path) return
  const { error } = await supabase.storage
    .from('contact-photos')
    .remove([path])
  if (error) console.error('[deleteContactPhoto] error:', error.message)
}

// ─── Action AI briefs ─────────────────────────────────────────────────────────
// Required table (run once in Supabase SQL editor):
//   create table if not exists action_ai_briefs (
//     id uuid primary key default gen_random_uuid(),
//     account_id text not null,
//     action_id  text not null,
//     brief      jsonb not null,
//     generated_at timestamptz default now(),
//     unique (account_id, action_id)
//   );

export const saveActionBrief = async (accountId, actionId, brief) => {
  try {
    const { error } = await supabase
      .from('action_ai_briefs')
      .upsert(
        { account_id: accountId, action_id: actionId, brief, generated_at: new Date().toISOString() },
        { onConflict: 'account_id,action_id' }
      )
    if (error) console.warn('[saveActionBrief] write failed (table may not exist yet):', error.message)
  } catch (e) {
    console.warn('[saveActionBrief] exception:', e.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FUTURE MIGRATION HELPERS — Phase 1+
//
// These functions target the normalized schema defined in
// supabase/migrations/001_normalized_schema.sql.
//
// They are NOT called anywhere in the application. The blob architecture
// (loadData / saveData) remains the sole source of truth until a future
// dual-write migration phase explicitly wires these in.
//
// API KEY NOTE
// ─────────────────────────────────────────────────────────────────────────────
// Current state:  data.apiKey lives inside the JSONB blob, plaintext.
// Risks:          - Visible in all Supabase exports and row-level dumps
//                 - Travels with every saveData() write
//                 - No encryption, no rotation, no per-user isolation
// Recommended:    Move to the `workspaces.api_key_enc` column (AES-256 via
//                 Supabase Vault) or read from a server-side environment
//                 variable so the key never reaches the browser.
//                 See: https://supabase.com/docs/guides/database/vault
// ─────────────────────────────────────────────────────────────────────────────

// ── Accounts ──────────────────────────────────────────────────────────────────

export const getNormalizedAccounts = async () => {
  try {
    const { data, error } = await supabase
      .from('accounts_normalized')
      .select('*')
      .order('name')
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[getNormalizedAccounts] error:', e.message)
    return []
  }
}

export const upsertNormalizedAccount = async (account) => {
  try {
    const { error } = await supabase
      .from('accounts_normalized')
      .upsert({ ...account, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) throw error
  } catch (e) {
    console.warn('[upsertNormalizedAccount] error:', e.message)
  }
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export const getContactsByAccount = async (accountId) => {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('account_id', accountId)
      .order('name')
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[getContactsByAccount] error:', e.message)
    return []
  }
}

export const upsertContact = async (contact) => {
  try {
    const { error } = await supabase
      .from('contacts')
      .upsert({ ...contact, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) throw error
  } catch (e) {
    console.warn('[upsertContact] error:', e.message)
  }
}

// ── Projects ──────────────────────────────────────────────────────────────────

export const getProjectsByAccount = async (accountId) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('account_id', accountId)
      .order('name')
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[getProjectsByAccount] error:', e.message)
    return []
  }
}

export const upsertProject = async (project) => {
  try {
    const { error } = await supabase
      .from('projects')
      .upsert({ ...project, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) throw error
  } catch (e) {
    console.warn('[upsertProject] error:', e.message)
  }
}

// ── Actions (follow-ups) ──────────────────────────────────────────────────────

export const getActionsByAccount = async (accountId) => {
  try {
    const { data, error } = await supabase
      .from('actions')
      .select('*')
      .eq('account_id', accountId)
      .order('due_date', { ascending: true, nullsFirst: false })
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[getActionsByAccount] error:', e.message)
    return []
  }
}

export const upsertAction = async (action) => {
  try {
    const { error } = await supabase
      .from('actions')
      .upsert({ ...action, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) throw error
  } catch (e) {
    console.warn('[upsertAction] error:', e.message)
  }
}

// ── Intel Log ────────────────────────────────────────────────────────────────

export const getIntelLogsByAccount = async (accountId) => {
  try {
    const { data, error } = await supabase
      .from('intel_logs')
      .select('*')
      .eq('account_id', accountId)
      .order('date', { ascending: false })
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[getIntelLogsByAccount] error:', e.message)
    return []
  }
}

export const upsertIntelLog = async (entry) => {
  try {
    const { error } = await supabase
      .from('intel_logs')
      .upsert(entry, { onConflict: 'id' })
    if (error) throw error
  } catch (e) {
    console.warn('[upsertIntelLog] error:', e.message)
  }
}

// ── Action AI Briefs (normalized read path) ───────────────────────────────────

export const getActionBrief = async (accountId, actionId) => {
  try {
    const { data, error } = await supabase
      .from('action_ai_briefs')
      .select('brief, generated_at')
      .eq('account_id', accountId)
      .eq('action_id', actionId)
      .maybeSingle()
    if (error) throw error
    return data || null
  } catch (e) {
    console.warn('[getActionBrief] error:', e.message)
    return null
  }
}

export const upsertActionBrief = async (accountId, actionId, brief) => {
  try {
    const { error } = await supabase
      .from('action_ai_briefs')
      .upsert(
        { account_id: accountId, action_id: actionId, brief, generated_at: new Date().toISOString() },
        { onConflict: 'account_id,action_id' }
      )
    if (error) throw error
  } catch (e) {
    console.warn('[upsertActionBrief] error:', e.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — DUAL-WRITE SYNC
// syncAppDataToNormalized is called by saveData() after every successful blob
// write. It is fire-and-forget — failures are logged but never propagate back.
// This entire block will be removed once reads are migrated off the blob.
// ─────────────────────────────────────────────────────────────────────────────

// Coerce empty strings to null for PostgreSQL date/timestamptz columns.
const _toDate = v => (v && typeof v === 'string' && v.trim()) ? v.trim() : null

// Coerce empty strings / non-numbers to null for numeric columns.
const _toNum = v => {
  if (v === '' || v === null || v === undefined) return null
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? null : n
}

// ── Field mappers (blob camelCase → normalized snake_case) ────────────────────

const _mapAccount = a => ({
  id: a.id,
  name: a.name || '',
  short: a.short || '',
  industry: a.industry || '',
  hq: a.hq || '',
  status: a.status || '',
  cloud: a.cloud || '',
  users: a.users || '',
  relationship: a.relationship || '',
  last_contact: _toDate(a.lastContact),
  notes: a.notes || '',
  endpoints: a.endpoints || '',
  logo_image: a.logoImage || '',
  admin_data: a.adminData || {},
  org_chart: a.orgChart || { nodes: [] },
  health_score_overrides: a.healthScoreOverrides || {},
  upcoming_dates: a.upcomingDates || [],
  unknown_mentions: a.unknownMentions || [],
  rel_suggestions: a.relSuggestions || [],
  contact_suggestions: a.contactSuggestions || [],
  dismissed_alerts: a.dismissedAlerts || [],
  snoozed_alerts: a.snoozedAlerts || [],
  saved_links: a.savedLinks || [],
  updated_at: new Date().toISOString()
})

const _mapContact = (c, accountId) => ({
  id: c.id,
  account_id: accountId,
  contact_type: c.contactType || '',
  name: c.name || '',
  title: c.title || '',
  email: c.email || '',
  cell: c.cell || '',
  linkedin: c.linkedin || '',
  location: c.location || '',
  dept: c.dept || '',
  influence: c.influence || '',
  sentiment: c.sentiment || '',
  rel_status: c.relStatus || '',
  tools_own: c.toolsOwn || '',
  goals: c.goals || '',
  pains: c.pains || '',
  notes: c.notes || '',
  personal_notes: c.personalNotes || '',
  last_interacted: _toDate(c.lastInteracted),
  vendor_company: c.vendorCompany || '',
  contact_photo: c.contactPhoto || '',
  added_manually: !!c.addedManually,
  internal_meetings: c.internalMeetings || [],
  updated_at: new Date().toISOString()
})

const _mapTechStack = (t, accountId) => ({
  id: t.id,
  account_id: accountId,
  vendor: t.vendor || '',
  products: t.products || '',
  category: t.category || '',
  status: t.status || '',
  renewal_date: _toDate(t.renewalDate),
  cost: t.cost || '',
  vendor_rep: t.vendorRep || '',
  vendor_rep_email: t.vendorRepEmail || '',
  client_owner: t.clientOwner || '',
  replacement_options: t.replacementOptions || '',
  notes: t.notes || '',
  updated_at: new Date().toISOString()
})

const _mapProject = (p, accountId) => ({
  id: p.id,
  account_id: accountId,
  name: p.name || '',
  category: p.category || '',
  vendor: p.vendor || '',
  status: p.status || '',
  description: p.description || '',
  goals: p.goals || '',
  pains: p.pains || '',
  primary_contact: p.primaryContact || '',
  has_budget: !!p.budget,
  close_date: _toDate(p.closeDate),
  notes: p.notes || '',
  waiting_on: p.waitingOn || '',
  next_action: p.nextAction || '',
  estimated_revenue: _toNum(p.estimatedRevenue),
  estimated_gross_profit: _toNum(p.estimatedGrossProfit),
  client_target_date: _toDate(p.clientTargetDate),
  timeline: p.timeline || [],
  updated_at: new Date().toISOString()
})

const _mapAction = (fu, accountId) => ({
  id: fu.id,
  account_id: accountId,
  contact: fu.contact || '',
  task: fu.task || '',
  priority: fu.priority || '',
  due_date: _toDate(fu.dueDate),
  status: fu.status || 'Open',
  context: fu.context || '',
  ai_intel: fu.aiIntel || null,
  updated_at: new Date().toISOString()
})

const _mapIntelLog = (e, accountId) => ({
  id: e.id,
  account_id: accountId,
  date: _toDate(e.date),
  type: e.type || '',
  participants: e.participants || '',
  summary: e.summary || '',
  insights: Array.isArray(e.insights) ? e.insights : [],
  risks: Array.isArray(e.risks) ? e.risks : [],
  opportunities: Array.isArray(e.opportunities) ? e.opportunities : [],
  raw_text: e.rawText || null
})

const _mapInteraction = (i, accountId) => ({
  id: i.id,
  account_id: accountId,
  contact: i.contact || '',
  type: i.type || '',
  date: _toDate(i.date),
  duration: typeof i.duration === 'number' ? i.duration : null,
  topics: i.topics || '',
  summary: i.summary || ''
})

const _mapFile = (f, accountId) => ({
  id: f.id,
  account_id: accountId,
  name: f.name || '',
  type: f.type || '',
  size: typeof f.size === 'number' ? f.size : null,
  uploaded_at: f.uploadedAt || null,
  category: f.category || '',
  notes: f.notes || '',
  path: f.path || ''
})

const _mapWhitespaceAccount = ws => ({
  id: ws.id,
  name: ws.name || '',
  hq: ws.hq || '',
  industry: ws.industry || '',
  employees: ws.employees || '',
  revenue: ws.revenue || '',
  status: ws.status || '',
  notes: Array.isArray(ws.notes) ? ws.notes : [],
  contacts: ws.contacts || [],
  technologies: ws.technologies || [],
  intel_log: ws.intelLog || [],
  ai_opportunity_score: typeof ws.ai_opportunity_score === 'number' ? ws.ai_opportunity_score : null,
  ai_score_reasoning: ws.ai_score_reasoning || null,
  ai_score_updated_at: ws.ai_score_updated_at || null,
  added_at: ws.addedAt || new Date().toISOString(),
  updated_at: ws.updatedAt || new Date().toISOString()
})

// Blob stores full chat SESSIONS (not individual messages). Each session has:
// {id (uid string), date (ISO), title, messages (array), pinned, pinnedMessages}.
// The per-message prompt/response/model columns are kept null for now —
// they exist for a future per-message write path.
const _mapAIHistory = (session, accountId) => ({
  id: session.id,
  account_id: accountId,
  date: session.date || null,
  title: session.title || '',
  messages: Array.isArray(session.messages) ? session.messages : [],
  pinned: !!session.pinned,
  pinned_messages: Array.isArray(session.pinnedMessages) ? session.pinnedMessages : [],
  type: 'chat',
  prompt: null,
  response: null,
  model: null
})

// Blob entries are {date, score} with no ID. Upserted on (account_id, recorded_at).
// The uuid PK is generated by Postgres on insert and not touched on update.
const _mapHealthScore = (entry, accountId) => ({
  account_id: accountId,
  score: typeof entry.score === 'number' ? entry.score : (parseInt(entry.score) || 0),
  breakdown: entry.breakdown || null,
  recorded_at: entry.date || new Date().toISOString().split('T')[0]
})

// ── Batch upsert ──────────────────────────────────────────────────────────────
const _batchUpsert = async (table, rows, onConflict = 'id') => {
  if (!rows.length) return
  const { error } = await supabase.from(table).upsert(rows, { onConflict })
  if (error) throw new Error(`${table}: ${error.message}`)
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export const syncAppDataToNormalized = async (appData) => {
  const t0 = Date.now()
  const accounts = appData.accounts || []
  const errors = []

  // accounts_normalized
  try {
    await _batchUpsert('accounts_normalized', accounts.filter(a => a.id).map(_mapAccount))
  } catch (e) { errors.push(e.message) }

  // contacts
  try {
    const rows = accounts.flatMap(a => (a.contacts || []).filter(c => c.id).map(c => _mapContact(c, a.id)))
    await _batchUpsert('contacts', rows)
  } catch (e) { errors.push(e.message) }

  // tech_stack
  try {
    const rows = accounts.flatMap(a => (a.techStack || []).filter(t => t.id).map(t => _mapTechStack(t, a.id)))
    await _batchUpsert('tech_stack', rows)
  } catch (e) { errors.push(e.message) }

  // projects
  try {
    const rows = accounts.flatMap(a => (a.projects || []).filter(p => p.id).map(p => _mapProject(p, a.id)))
    await _batchUpsert('projects', rows)
  } catch (e) { errors.push(e.message) }

  // actions (blob field: followUps)
  try {
    const rows = accounts.flatMap(a => (a.followUps || []).filter(f => f.id).map(f => _mapAction(f, a.id)))
    await _batchUpsert('actions', rows)
  } catch (e) { errors.push(e.message) }

  // intel_logs
  try {
    const rows = accounts.flatMap(a => (a.intelLog || []).filter(e => e.id).map(e => _mapIntelLog(e, a.id)))
    await _batchUpsert('intel_logs', rows)
  } catch (e) { errors.push(e.message) }

  // interactions
  try {
    const rows = accounts.flatMap(a => (a.interactions || []).filter(i => i.id).map(i => _mapInteraction(i, a.id)))
    await _batchUpsert('interactions', rows)
  } catch (e) { errors.push(e.message) }

  // account_files
  try {
    const rows = accounts.flatMap(a => (a.files || []).filter(f => f.id && f.path).map(f => _mapFile(f, a.id)))
    await _batchUpsert('account_files', rows)
  } catch (e) { errors.push(e.message) }

  // whitespace_accounts
  try {
    const rows = (appData.whitespaceAccounts || []).filter(a => a.id).map(_mapWhitespaceAccount)
    await _batchUpsert('whitespace_accounts', rows)
  } catch (e) { errors.push(e.message) }

  // ai_history (blob field: aiHistory) — session-level records, text PK from uid()
  try {
    const rows = accounts.flatMap(a => (a.aiHistory || []).filter(s => s.id).map(s => _mapAIHistory(s, a.id)))
    await _batchUpsert('ai_history', rows)
  } catch (e) { errors.push(e.message) }

  // health_score_history — no IDs in blob; upsert on (account_id, recorded_at)
  try {
    const rows = accounts.flatMap(a => (a.healthScoreHistory || []).filter(e => e.date).map(e => _mapHealthScore(e, a.id)))
    await _batchUpsert('health_score_history', rows, 'account_id,recorded_at')
  } catch (e) { errors.push(e.message) }

  if (errors.length) {
    console.warn(`[syncAppDataToNormalized] ${errors.length} error(s) in ${Date.now() - t0}ms:`, errors)
  } else {
    console.debug(`[syncAppDataToNormalized] OK (${Date.now() - t0}ms)`)
  }
}

// ── Developer validation utility ──────────────────────────────────────────────
// Usage from browser devtools:
//   const m = await import('/src/supabase.js')
//   await m.validateNormalizedSync(window.__debugAppData)
// (Expose window.__debugAppData from App.jsx when needed.)

export const validateNormalizedSync = async (appData) => {
  const accounts = appData.accounts || []
  const blobCounts = {
    accounts:  accounts.length,
    contacts:  accounts.reduce((s, a) => s + (a.contacts  || []).length, 0),
    projects:  accounts.reduce((s, a) => s + (a.projects  || []).length, 0),
    actions:   accounts.reduce((s, a) => s + (a.followUps || []).length, 0),
    intelLogs: accounts.reduce((s, a) => s + (a.intelLog  || []).length, 0),
    files:     accounts.reduce((s, a) => s + (a.files     || []).length, 0)
  }

  const [acctR, cntcR, projR, actnR, intlR, fileR] = await Promise.all([
    supabase.from('accounts_normalized').select('*', { count: 'exact', head: true }),
    supabase.from('contacts').select('*',            { count: 'exact', head: true }),
    supabase.from('projects').select('*',            { count: 'exact', head: true }),
    supabase.from('actions').select('*',             { count: 'exact', head: true }),
    supabase.from('intel_logs').select('*',          { count: 'exact', head: true }),
    supabase.from('account_files').select('*',       { count: 'exact', head: true })
  ])

  const normCounts = {
    accounts:  acctR.count ?? '?',
    contacts:  cntcR.count ?? '?',
    projects:  projR.count ?? '?',
    actions:   actnR.count ?? '?',
    intelLogs: intlR.count ?? '?',
    files:     fileR.count ?? '?'
  }

  console.group('[validateNormalizedSync] Blob vs Normalized counts')
  Object.keys(blobCounts).forEach(k => {
    const ok = blobCounts[k] === normCounts[k]
    console.log(`  ${ok ? '✓' : '✗'} ${k.padEnd(12)}: blob=${blobCounts[k]}  normalized=${normCounts[k]}`)
  })
  console.groupEnd()
}
