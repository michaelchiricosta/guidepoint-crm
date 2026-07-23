-- Migration 009: RLS policies for call analysis pipeline tables
--
-- These tables were created in migrations 007 and 008 but without RLS policies,
-- so the anon key (used by the frontend) silently gets empty results on SELECT.
-- Matches the pattern from migration 003 (anon full access, single-user app).

-- ─── call_analysis ───────────────────────────────────────────────────────────
alter table if exists call_analysis enable row level security;

drop policy if exists "anon select call_analysis" on call_analysis;
drop policy if exists "anon insert call_analysis" on call_analysis;
drop policy if exists "anon update call_analysis" on call_analysis;
drop policy if exists "anon delete call_analysis" on call_analysis;

create policy "anon select call_analysis" on call_analysis for select to anon using (true);
create policy "anon insert call_analysis" on call_analysis for insert to anon with check (true);
create policy "anon update call_analysis" on call_analysis for update to anon using (true) with check (true);
create policy "anon delete call_analysis" on call_analysis for delete to anon using (true);

-- ─── open_items ──────────────────────────────────────────────────────────────
alter table if exists open_items enable row level security;

drop policy if exists "anon select open_items" on open_items;
drop policy if exists "anon insert open_items" on open_items;
drop policy if exists "anon update open_items" on open_items;

create policy "anon select open_items" on open_items for select to anon using (true);
create policy "anon insert open_items" on open_items for insert to anon with check (true);
create policy "anon update open_items" on open_items for update to anon using (true) with check (true);

-- ─── contact_context ─────────────────────────────────────────────────────────
alter table if exists contact_context enable row level security;

drop policy if exists "anon select contact_context" on contact_context;
drop policy if exists "anon insert contact_context" on contact_context;
drop policy if exists "anon update contact_context" on contact_context;

create policy "anon select contact_context" on contact_context for select to anon using (true);
create policy "anon insert contact_context" on contact_context for insert to anon with check (true);
create policy "anon update contact_context" on contact_context for update to anon using (true) with check (true);

-- ─── ea_preferences ──────────────────────────────────────────────────────────
alter table if exists ea_preferences enable row level security;

drop policy if exists "anon select ea_preferences" on ea_preferences;
drop policy if exists "anon insert ea_preferences" on ea_preferences;
drop policy if exists "anon update ea_preferences" on ea_preferences;

create policy "anon select ea_preferences" on ea_preferences for select to anon using (true);
create policy "anon insert ea_preferences" on ea_preferences for insert to anon with check (true);
create policy "anon update ea_preferences" on ea_preferences for update to anon using (true) with check (true);
