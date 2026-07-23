export const maxDuration = 120;

import { createClient } from '@supabase/supabase-js';
import { analyzeCall } from '../../lib/analyzeCall.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const waveSessionId = req.query.wave_session_id;
  if (!waveSessionId) {
    return res.status(400).json({ error: 'wave_session_id query param required' });
  }

  // Delete any existing row for this session so repeated test runs don't hit a unique constraint.
  await supabase
    .from('call_analysis')
    .delete()
    .eq('wave_session_id', waveSessionId);

  try {
    const result = await analyzeCall(waveSessionId);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
