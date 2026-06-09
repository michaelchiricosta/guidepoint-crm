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

// ─── Data ─────────────────────────────────────────────────────────────────────

export const loadData = async () => {
  try {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', 'user-data')
      .single()
      .throwOnError()
    if (!data) return null
    return data.data
  } catch (e) {
    console.error('[loadData] error:', e.message)
    return null
  }
}

export const saveData = async (appData) => {
  const { error } = await supabase
    .from('accounts')
    .upsert({ id: 'user-data', data: appData, updated_at: new Date().toISOString() })
  if (error) console.error('[saveData] error:', error.message)
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
