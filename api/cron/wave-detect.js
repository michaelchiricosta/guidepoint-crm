// api/cron/wave-detect.js
// Vercel Cron: runs every 10-15 minutes (Pro plan required for sub-daily schedules).
// Job: pull new "session.completed" events from Wave's event feed, drop them into call_queue.
// Does NOT fetch transcripts or analyze anything — that's Cron #2's job.
// Keeping this step cheap and fast avoids serverless timeout issues.
//
// Uses Wave's event feed (GET /v1/events + POST /v1/events/ack), not session polling.
// This is purpose-built for exactly this use case: Wave tracks your position in the
// event stream server-side per API token, so there's no "since" timestamp math and
// no risk of double-processing a session across cron runs.
// Requires an API token with the `events:read` scope.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WAVE_API_BASE = 'https://api.wave.co/v1';
const WAVE_API_KEY = process.env.WAVE_API_KEY;

export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let newSessionCount = 0;
    let pages = 0;
    let lastCursor = null;
    const MAX_PAGES = 5;

    let hasMore = true;
    while (hasMore && pages < MAX_PAGES) {
      const resp = await fetch(`${WAVE_API_BASE}/events`, {
        headers: { Authorization: `Bearer ${WAVE_API_KEY}` }
      });

      if (!resp.ok) {
        throw new Error(`Wave API error: ${resp.status} ${await resp.text()}`);
      }

      const body = await resp.json();
      const events = body.events || [];
      hasMore = !!body.has_more;
      lastCursor = body.next_cursor || lastCursor;

      for (const event of events) {
        if (event.type !== 'session.completed') continue;

        const session = event.data?.session;
        if (!session?.id) continue;

        const { error: insertErr } = await supabase
          .from('call_queue')
          .upsert(
            {
              wave_session_id: session.id,
              session_title: session.title || null,
              session_date: session.timestamp || null,
              status: 'pending'
            },
            { onConflict: 'wave_session_id', ignoreDuplicates: true }
          );

        if (insertErr) {
          console.error(`Failed to queue session ${session.id}:`, insertErr);
          continue;
        }
        newSessionCount++;
      }

      pages++;

      if (events.length > 0) {
        await fetch(`${WAVE_API_BASE}/events/ack`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${WAVE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ cursor: lastCursor })
        });
      }
    }

    const { data: syncState } = await supabase
      .from('wave_sync_state')
      .select('id')
      .order('last_synced_at', { ascending: false })
      .limit(1)
      .single();

    await supabase.from('wave_sync_state').upsert({
      id: syncState?.id,
      last_cursor: lastCursor,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    return res.status(200).json({
      ok: true,
      newSessionsQueued: newSessionCount,
      pagesFetched: pages
    });
  } catch (err) {
    console.error('wave-detect cron failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
