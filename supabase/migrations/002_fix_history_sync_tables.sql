-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002 — Fix history tables for dual-write sync
--
-- Fixes two tables that were skipped in Phase 1:
--   1. ai_history        — id column was uuid; blob uses uid() strings
--   2. health_score_history — no unique constraint; can't do idempotent upserts
--
-- Both tables are empty in production (Phase 0 never wrote to them).
-- All statements are safe to re-run (idempotent where possible).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. ai_history — change id from uuid to text ─────────────────────────────
--
-- The app stores chat SESSIONS in acct.aiHistory[], not individual messages.
-- Each session has: id (uid() string), date, title, messages (JSONB array),
-- pinned (bool), pinnedMessages (string[]).
--
-- The original schema assumed individual prompt/response rows and used a
-- generated UUID as PK. The actual blob data uses short uid() string IDs.
-- We change the PK to text and drop the auto-generated UUID default.
-- The prompt/response/model/tokens columns are retained as nullable for future
-- per-message write paths.
--
-- If the table has existing rows (from manual inserts), the USING clause
-- casts uuid → text safely.

alter table ai_history alter column id type text using id::text;
alter table ai_history alter column id drop default;

-- Add session-level columns that match the actual blob shape.
-- All are nullable so existing rows (if any) are not disturbed.
alter table ai_history add column if not exists title          text;
alter table ai_history add column if not exists messages       jsonb    default '[]'::jsonb;
alter table ai_history add column if not exists pinned         boolean  default false;
alter table ai_history add column if not exists pinned_messages jsonb   default '[]'::jsonb;
alter table ai_history add column if not exists date           timestamptz;

-- ─── 2. health_score_history — add unique constraint for upsert ───────────────
--
-- Blob entries are {date, score} with no ID. The only natural key is
-- (account_id, recorded_at). Adding a unique constraint lets us upsert
-- idempotently without knowing the generated uuid PK.
--
-- One entry per account per day matches the app logic:
--   if (history.some(h => h.date === today)) return  ← only appends once per day

alter table health_score_history
  add constraint if not exists health_score_history_account_recorded_uniq
  unique (account_id, recorded_at);
