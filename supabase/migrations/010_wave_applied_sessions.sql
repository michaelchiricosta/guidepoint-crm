-- Migration 010: wave_applied_sessions
-- Tracks Wave sessions processed by the auto-sync cron (api/wave-cron.js).
-- Prevents the same session from being re-analyzed on subsequent 30-minute runs.
-- Each row = one session that was fetched from Wave; account_names lists any matches found.

create table if not exists wave_applied_sessions (
  id            bigserial primary key,
  session_id    text        not null unique,
  account_names text[]      not null default '{}',
  applied_at    timestamptz not null default now(),
  source        text        not null default 'cron'
);

-- Only accessed server-side via service role key, which bypasses RLS,
-- so no anon policies needed. Enable RLS anyway to block accidental anon access.
alter table wave_applied_sessions enable row level security;
