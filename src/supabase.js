import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://aenlxbxkrxgylgknlcft.supabase.co'
const SUPABASE_KEY = 'sb_publishable_3rSqBpPP1xF2H6QWw5-xsw_YhpKuMyW'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export const loadData = async () => {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', 'user-data')
    .single()
  if (error || !data) return null
  return data.data
}

export const saveData = async (appData) => {
  const { error } = await supabase
    .from('accounts')
    .upsert({ id: 'user-data', data: appData, updated_at: new Date().toISOString() })
  if (error) console.error('Save error:', error)
}
