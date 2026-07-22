-- Migration 007: call analysis pipeline tables
-- Supports the queue-drain cron (api/cron/queue-drain.js).
-- call_queue and wave_sync_state already exist (created directly in Supabase dashboard
-- when wave-detect was first deployed). This migration adds the missing columns to
-- call_queue and creates the four new tables queue-drain depends on.

-- ─── call_queue: add columns that queue-drain reads/writes ───────────────────
-- The table already exists. These are no-ops if the column is already there.
alter table if exists call_queue add column if not exists attempts    integer  default 0;
alter table if exists call_queue add column if not exists last_error  text;
alter table if exists call_queue add column if not exists updated_at  timestamptz default now();
alter table if exists call_queue add column if not exists created_at  timestamptz default now();

-- ─── call_analysis ───────────────────────────────────────────────────────────
-- One row per processed call_queue row.
-- account_id and contact_ids may be null when the speaker match fails.
create table if not exists call_analysis (
  id                  uuid        primary key default gen_random_uuid(),
  call_queue_id       uuid        not null,
  wave_session_id     text        not null,
  account_id          text,
  contact_ids         text[]      default array[]::text[],
  matched_confidence  text,
  raw_extraction      jsonb,
  distilled           jsonb,
  created_at          timestamptz default now()
);

create index if not exists idx_call_analysis_wave_session_id on call_analysis(wave_session_id);
create index if not exists idx_call_analysis_account_id      on call_analysis(account_id);

-- ─── open_items ──────────────────────────────────────────────────────────────
-- Recurring follow-up items surfaced across calls.
-- times_flagged increments each time the same item text appears in a new call.
create table if not exists open_items (
  id            uuid        primary key default gen_random_uuid(),
  account_id    text,
  contact_ids   text[]      default array[]::text[],
  item_text     text        not null,
  times_flagged integer     default 1,
  status        text        default 'open',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_open_items_account_id on open_items(account_id);
create index if not exists idx_open_items_status     on open_items(status);

-- ─── contact_context ─────────────────────────────────────────────────────────
-- Rolling summary per contact, updated after each analyzed call.
-- One row per contact (contact_id is unique).
create table if not exists contact_context (
  id              uuid        primary key default gen_random_uuid(),
  contact_id      text        not null unique,
  rolling_summary text,
  updated_at      timestamptz default now()
);

create index if not exists idx_contact_context_contact_id on contact_context(contact_id);

-- ─── ea_preferences ──────────────────────────────────────────────────────────
-- Standing rep preferences that shape distillation output.
-- Examples: "never draft emails to CISO-level contacts", "flag renewal risk always".
-- queue-drain reads active=true rows and passes them verbatim to the distillation prompt.
create table if not exists ea_preferences (
  id              uuid        primary key default gen_random_uuid(),
  active          boolean     default true,
  preference_text text        not null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
