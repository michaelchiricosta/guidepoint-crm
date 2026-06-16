-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003 — Enable RLS on all normalized tables
--
-- Context: Ledgr is a single-user app. The anon key is used client-side.
-- RLS was disabled in the original schema stubs (001) because auth was not
-- yet wired. This migration enables RLS and adds explicit anon-access policies
-- that preserve current app behaviour without adding multi-user auth logic.
--
-- Policy model (single-user, anon role):
--   SELECT / INSERT / UPDATE — allowed for anon (app reads + writes via blob sync)
--   DELETE — blocked for anon on most tables (data is soft-deleted in the blob)
--
-- FUTURE: When Supabase Auth is added, replace `using (true)` with
--   `using (auth.uid() = owner_id)` and add an owner_id column.
--
-- All statements are idempotent — safe to re-run.
-- Run in Supabase SQL editor:
--   https://supabase.com/dashboard/project/aenlxbxkrxgylgknlcft/sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── workspaces ───────────────────────────────────────────────────────────────
alter table if exists workspaces enable row level security;

drop policy if exists "anon select workspaces"  on workspaces;
drop policy if exists "anon insert workspaces"  on workspaces;
drop policy if exists "anon update workspaces"  on workspaces;

create policy "anon select workspaces"  on workspaces for select to anon using (true);
create policy "anon insert workspaces"  on workspaces for insert to anon with check (true);
create policy "anon update workspaces"  on workspaces for update to anon using (true) with check (true);

-- ─── accounts_normalized ─────────────────────────────────────────────────────
alter table if exists accounts_normalized enable row level security;

drop policy if exists "anon select accounts_normalized"  on accounts_normalized;
drop policy if exists "anon insert accounts_normalized"  on accounts_normalized;
drop policy if exists "anon update accounts_normalized"  on accounts_normalized;

create policy "anon select accounts_normalized"  on accounts_normalized for select to anon using (true);
create policy "anon insert accounts_normalized"  on accounts_normalized for insert to anon with check (true);
create policy "anon update accounts_normalized"  on accounts_normalized for update to anon using (true) with check (true);

-- ─── contacts ─────────────────────────────────────────────────────────────────
alter table if exists contacts enable row level security;

drop policy if exists "anon select contacts"  on contacts;
drop policy if exists "anon insert contacts"  on contacts;
drop policy if exists "anon update contacts"  on contacts;

create policy "anon select contacts"  on contacts for select to anon using (true);
create policy "anon insert contacts"  on contacts for insert to anon with check (true);
create policy "anon update contacts"  on contacts for update to anon using (true) with check (true);

-- ─── tech_stack ───────────────────────────────────────────────────────────────
alter table if exists tech_stack enable row level security;

drop policy if exists "anon select tech_stack"  on tech_stack;
drop policy if exists "anon insert tech_stack"  on tech_stack;
drop policy if exists "anon update tech_stack"  on tech_stack;

create policy "anon select tech_stack"  on tech_stack for select to anon using (true);
create policy "anon insert tech_stack"  on tech_stack for insert to anon with check (true);
create policy "anon update tech_stack"  on tech_stack for update to anon using (true) with check (true);

-- ─── projects ─────────────────────────────────────────────────────────────────
alter table if exists projects enable row level security;

drop policy if exists "anon select projects"  on projects;
drop policy if exists "anon insert projects"  on projects;
drop policy if exists "anon update projects"  on projects;

create policy "anon select projects"  on projects for select to anon using (true);
create policy "anon insert projects"  on projects for insert to anon with check (true);
create policy "anon update projects"  on projects for update to anon using (true) with check (true);

-- ─── actions ──────────────────────────────────────────────────────────────────
alter table if exists actions enable row level security;

drop policy if exists "anon select actions"  on actions;
drop policy if exists "anon insert actions"  on actions;
drop policy if exists "anon update actions"  on actions;

create policy "anon select actions"  on actions for select to anon using (true);
create policy "anon insert actions"  on actions for insert to anon with check (true);
create policy "anon update actions"  on actions for update to anon using (true) with check (true);

-- ─── action_ai_briefs ─────────────────────────────────────────────────────────
alter table if exists action_ai_briefs enable row level security;

drop policy if exists "anon select action_ai_briefs"  on action_ai_briefs;
drop policy if exists "anon insert action_ai_briefs"  on action_ai_briefs;
drop policy if exists "anon update action_ai_briefs"  on action_ai_briefs;

create policy "anon select action_ai_briefs"  on action_ai_briefs for select to anon using (true);
create policy "anon insert action_ai_briefs"  on action_ai_briefs for insert to anon with check (true);
create policy "anon update action_ai_briefs"  on action_ai_briefs for update to anon using (true) with check (true);

-- ─── intel_logs ───────────────────────────────────────────────────────────────
alter table if exists intel_logs enable row level security;

drop policy if exists "anon select intel_logs"  on intel_logs;
drop policy if exists "anon insert intel_logs"  on intel_logs;
drop policy if exists "anon update intel_logs"  on intel_logs;

create policy "anon select intel_logs"  on intel_logs for select to anon using (true);
create policy "anon insert intel_logs"  on intel_logs for insert to anon with check (true);
create policy "anon update intel_logs"  on intel_logs for update to anon using (true) with check (true);

-- ─── interactions ─────────────────────────────────────────────────────────────
alter table if exists interactions enable row level security;

drop policy if exists "anon select interactions"  on interactions;
drop policy if exists "anon insert interactions"  on interactions;
drop policy if exists "anon update interactions"  on interactions;

create policy "anon select interactions"  on interactions for select to anon using (true);
create policy "anon insert interactions"  on interactions for insert to anon with check (true);
create policy "anon update interactions"  on interactions for update to anon using (true) with check (true);

-- ─── ai_history ───────────────────────────────────────────────────────────────
alter table if exists ai_history enable row level security;

drop policy if exists "anon select ai_history"  on ai_history;
drop policy if exists "anon insert ai_history"  on ai_history;
drop policy if exists "anon update ai_history"  on ai_history;

create policy "anon select ai_history"  on ai_history for select to anon using (true);
create policy "anon insert ai_history"  on ai_history for insert to anon with check (true);
create policy "anon update ai_history"  on ai_history for update to anon using (true) with check (true);

-- ─── health_score_history ─────────────────────────────────────────────────────
alter table if exists health_score_history enable row level security;

drop policy if exists "anon select health_score_history"  on health_score_history;
drop policy if exists "anon insert health_score_history"  on health_score_history;
drop policy if exists "anon update health_score_history"  on health_score_history;

create policy "anon select health_score_history"  on health_score_history for select to anon using (true);
create policy "anon insert health_score_history"  on health_score_history for insert to anon with check (true);
create policy "anon update health_score_history"  on health_score_history for update to anon using (true) with check (true);

-- ─── account_files ────────────────────────────────────────────────────────────
alter table if exists account_files enable row level security;

drop policy if exists "anon select account_files"  on account_files;
drop policy if exists "anon insert account_files"  on account_files;
drop policy if exists "anon update account_files"  on account_files;
drop policy if exists "anon delete account_files"  on account_files;

create policy "anon select account_files"  on account_files for select to anon using (true);
create policy "anon insert account_files"  on account_files for insert to anon with check (true);
create policy "anon update account_files"  on account_files for update to anon using (true) with check (true);
-- Allow delete for file management (users can delete their own uploaded files)
create policy "anon delete account_files"  on account_files for delete to anon using (true);

-- ─── whitespace_accounts ──────────────────────────────────────────────────────
alter table if exists whitespace_accounts enable row level security;

drop policy if exists "anon select whitespace_accounts"  on whitespace_accounts;
drop policy if exists "anon insert whitespace_accounts"  on whitespace_accounts;
drop policy if exists "anon update whitespace_accounts"  on whitespace_accounts;

create policy "anon select whitespace_accounts"  on whitespace_accounts for select to anon using (true);
create policy "anon insert whitespace_accounts"  on whitespace_accounts for insert to anon with check (true);
create policy "anon update whitespace_accounts"  on whitespace_accounts for update to anon using (true) with check (true);
