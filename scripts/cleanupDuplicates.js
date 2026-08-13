// scripts/cleanupDuplicates.js
//
// One-time cleanup for the wave-cron duplicate-write bug (account_names vs
// account_name column mismatch in wave_applied_sessions caused sessions to
// never be marked "applied", so the same call kept getting reprocessed every
// ~30 minutes and duplicate intel log entries + follow-ups piled up).
//
// This script:
//   1. Loads the accounts blob (table `accounts`, row id='user-data')
//   2. Dedupes intelLog per account by sessionId (keeps the most recent —
//      intelLog is always prepended newest-first throughout the app)
//   3. Dedupes followUps per account (by sessionId+task where present, else
//      by exact task+dueDate+contact match for legacy entries with no sessionId)
//   4. Saves the cleaned blob back with a single update call
//   5. Backfills wave_applied_sessions from the (now deduped) intel logs so
//      cron won't reprocess sessions that are already reflected in the data
//
// Usage:
//   node scripts/cleanupDuplicates.js
//
// Delete this file after it runs successfully once.

import { createClient } from '@supabase/supabase-js'

// Falls back to the same defaults src/supabase.js uses client-side, since
// .env.local only has VERCEL_OIDC_TOKEN locally — set SUPABASE_SERVICE_ROLE_KEY
// in the environment first if you want this to run with elevated privileges.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://aenlxbxkrxgylgknlcft.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_KEY || 'sb_publishable_3rSqBpPP1xF2H6QWw5-xsw_YhpKuMyW'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function dedupeIntelLog(account) {
  const seen = new Set()
  const before = (account.intelLog || []).length
  // intelLog is always prepended (newest at index 0) everywhere it's written,
  // so keeping the first occurrence of a sessionId during forward iteration
  // keeps the most recent copy.
  const intelLog = (account.intelLog || []).filter(entry => {
    if (!entry.sessionId) return true // keep manual entries
    if (seen.has(entry.sessionId)) return false
    seen.add(entry.sessionId)
    return true
  })
  return { intelLog, before, after: intelLog.length }
}

// NOTE: follow-ups written before this fix have no `sessionId` field at all
// (only intelLog entries did) -- wave-cron.js now tags new follow-ups with
// sessionId, but historical Wave-auto follow-ups can only be deduped by exact
// content match (task+dueDate+contact). That catches verbatim repeats but NOT
// paraphrased duplicates from re-runs where Claude worded the same action
// item slightly differently each time -- those need manual review.
function dedupeFollowUps(account) {
  const seenKeys = new Set()
  const before = (account.followUps || []).length
  const followUps = (account.followUps || []).filter(fu => {
    if (fu.sessionId) {
      const key = `sid:${fu.sessionId}-${fu.task}`
      if (seenKeys.has(key)) return false
      seenKeys.add(key)
      return true
    }
    if (fu.source === 'Wave AI (auto)') {
      const key = `legacy:${fu.task}|${fu.dueDate}|${fu.contact}`
      if (seenKeys.has(key)) return false
      seenKeys.add(key)
      return true
    }
    return true // keep manual / non-Wave follow-ups untouched
  })
  return { followUps, before, after: followUps.length }
}

async function main() {
  console.log('[cleanup] Loading accounts blob...')
  const { data: row, error: loadErr } = await supabase
    .from('accounts')
    .select('data, version')
    .eq('id', 'user-data')
    .single()
  if (loadErr) {
    console.error('[cleanup] Failed to load accounts blob:', loadErr.message)
    process.exit(1)
  }

  const accounts = row.data.accounts || []
  let totalIntelRemoved = 0
  let totalFollowUpsRemoved = 0

  const updatedAccounts = accounts.map(account => {
    const intelResult = dedupeIntelLog(account)
    const fuResult = dedupeFollowUps(account)
    const intelRemoved = intelResult.before - intelResult.after
    const fuRemoved = fuResult.before - fuResult.after

    if (intelRemoved > 0 || fuRemoved > 0) {
      console.log(`[cleanup] ${account.name}: intelLog ${intelResult.before} -> ${intelResult.after} (-${intelRemoved})  |  followUps ${fuResult.before} -> ${fuResult.after} (-${fuRemoved})`)
    }

    totalIntelRemoved += intelRemoved
    totalFollowUpsRemoved += fuRemoved

    return { ...account, intelLog: intelResult.intelLog, followUps: fuResult.followUps }
  })

  console.log(`[cleanup] Totals: removed ${totalIntelRemoved} duplicate intel entries, ${totalFollowUpsRemoved} exact-duplicate follow-ups`)
  console.log('[cleanup] NOTE: legacy Wave-auto follow-ups had no sessionId, so only verbatim-text duplicates could be')
  console.log('[cleanup]       removed automatically. Reworded repeats of the same action item from earlier re-runs may')
  console.log('[cleanup]       still remain -- worth a manual pass over the Actions tab for the accounts listed above.')

  if (totalIntelRemoved === 0 && totalFollowUpsRemoved === 0) {
    console.log('[cleanup] Nothing to dedupe.')
  } else {
    console.log('[cleanup] Saving cleaned blob back to Supabase...')
    const newData = { ...row.data, accounts: updatedAccounts }
    const currentVersion = row.version ?? null
    let saveErr = null

    if (currentVersion !== null) {
      const { data: updated, error } = await supabase
        .from('accounts')
        .update({ data: newData, version: currentVersion + 1, updated_at: new Date().toISOString() })
        .eq('id', 'user-data')
        .eq('version', currentVersion)
        .select('version')
      saveErr = error || (!updated?.length ? new Error('version conflict — another save happened concurrently, re-run the script') : null)
    } else {
      const { error } = await supabase
        .from('accounts')
        .update({ data: newData, updated_at: new Date().toISOString() })
        .eq('id', 'user-data')
      saveErr = error
    }

    if (saveErr) {
      console.error('[cleanup] FAILED to save cleaned blob:', saveErr.message)
      process.exit(1)
    }
    console.log('[cleanup] Cleaned blob saved successfully.')
  }

  // ── Backfill wave_applied_sessions ──────────────────────────────────────────
  // The table's real unique constraint is `wave_applied_sessions_session_id_key`
  // — a single column on session_id, NOT a (session_id, account_name) composite
  // — confirmed directly against the schema. Collapse to one row per session_id.
  console.log('[cleanup] Backfilling wave_applied_sessions...')
  const processedSessions = []
  for (const account of updatedAccounts) {
    const sessionEntries = (account.intelLog || [])
      .filter(e => e.sessionId && (e.source || '').includes('Wave'))
      .map(e => ({
        session_id: e.sessionId,
        account_id: account.id,
        account_name: account.name,
        applied_at: new Date().toISOString(),
        source: 'cleanup',
      }))
    processedSessions.push(...sessionEntries)
  }

  const unique = [...new Map(processedSessions.map(s => [s.session_id, s])).values()]

  if (unique.length === 0) {
    console.log('[cleanup] No Wave sessions found to backfill.')
  } else {
    const { error: backfillErr } = await supabase
      .from('wave_applied_sessions')
      .upsert(unique, { onConflict: 'session_id' })
    if (backfillErr) console.error('[cleanup] wave_applied_sessions upsert error:', backfillErr.message)
    else console.log(`[cleanup] Marked ${unique.length} sessions as applied`)
  }

  console.log('[cleanup] Done.')
}

main().catch(err => {
  console.error('[cleanup] Unexpected error:', err)
  process.exit(1)
})
