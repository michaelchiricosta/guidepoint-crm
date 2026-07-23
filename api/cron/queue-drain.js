export const maxDuration = 120;

import { createClient } from '@supabase/supabase-js';
import { analyzeCall } from '../../lib/analyzeCall.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_ATTEMPTS = 3;

export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: claimed, error: claimErr } = await supabase
    .from('call_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (claimErr) {
    return res.status(500).json({ ok: false, stage: 'claim_select', error: claimErr.message });
  }

  if (!claimed) {
    return res.status(200).json({ ok: true, drained: false, reason: 'queue_empty' });
  }

  const { data: lockResult, error: lockErr } = await supabase
    .from('call_queue')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', claimed.id)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (lockErr) {
    return res.status(500).json({ ok: false, stage: 'claim_lock', error: lockErr.message });
  }

  if (!lockResult) {
    return res.status(200).json({ ok: true, drained: false, reason: 'lost_race' });
  }

  const row = lockResult;

  try {
    const result = await analyzeCall(row.wave_session_id);

    await supabase
      .from('call_queue')
      .update({ status: 'analyzed', updated_at: new Date().toISOString() })
      .eq('id', row.id);

    return res.status(200).json({
      ok: true,
      drained: true,
      call_queue_id: row.id,
      wave_session_id: row.wave_session_id,
      matched_account: result.matched_account,
      matched_confidence: result.matched_confidence
    });
  } catch (err) {
    const attempts = (row.attempts || 0) + 1;
    const nextStatus = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';

    await supabase
      .from('call_queue')
      .update({
        status: nextStatus,
        attempts,
        last_error: String(err.message || err),
        updated_at: new Date().toISOString()
      })
      .eq('id', row.id);

    return res.status(500).json({
      ok: false,
      call_queue_id: row.id,
      attempts,
      next_status: nextStatus,
      error: String(err.message || err)
    });
  }
}
