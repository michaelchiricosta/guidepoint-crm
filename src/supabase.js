import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://aenlxbxkrxgylgknlcft.supabase.co'
const SUPABASE_KEY = 'sb_publishable_3rSqBpPP1xF2H6QWw5-xsw_YhpKuMyW'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: {
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  }
})

export const loadData = async () => {
  try {
    console.log('[loadData] fetching from Supabase', new Date().toISOString())
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', 'user-data')
      .single()
      .throwOnError()
    if (!data) {
      console.log('[loadData] no data returned')
      return null
    }
    console.log('[loadData] loaded', JSON.stringify(data.data).length, 'bytes', new Date().toISOString())
    return data.data
  } catch (e) {
    console.error('[loadData] error:', e.message)
    return null
  }
}

export const saveData = async (appData) => {
  console.log('[saveData] saving', JSON.stringify(appData).length, 'bytes', new Date().toISOString())
  const { error } = await supabase
    .from('accounts')
    .upsert({ id: 'user-data', data: appData, updated_at: new Date().toISOString() })
  if (error) console.error('[saveData] error:', error)
  return { error }
}

export const uploadFile = async (accountId, file, category, notes) => {
  const filePath = `${accountId}/${Date.now()}_${file.name}`
  const { data, error } = await supabase.storage
    .from('account-files')
    .upload(filePath, file)
  if (error) throw error
  return {
    id: Date.now().toString(),
    name: file.name,
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
  if (error) throw error
}
