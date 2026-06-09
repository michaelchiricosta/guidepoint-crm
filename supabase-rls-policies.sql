-- ============================================================
-- Ledgr — Supabase RLS Policies
-- Run all statements below in the Supabase SQL Editor:
--   https://supabase.com/dashboard/project/aenlxbxkrxgylgknlcft/sql
--
-- This file covers:
--   1. accounts table (app data)
--   2. contact-photos storage bucket
--   3. account-files storage bucket
--
-- Context: Ledgr is a single-user personal CRM with no auth system.
-- The anon key is used client-side. RLS is your last line of defense.
-- These policies allow the anon role to operate normally while keeping
-- RLS enabled (unauthenticated callers who do NOT use the anon key are
-- still blocked by default).
--
-- FUTURE: When you add Supabase Auth, replace `true` checks below with
-- `auth.uid() = <owner_column>` to tie data to a specific user account.
-- ============================================================


-- ── 1. accounts table ──────────────────────────────────────────────────────

-- Enable RLS on the accounts table (safe to run even if already enabled)
alter table public.accounts enable row level security;

-- Drop existing permissive policies if any (run DROP only if they exist)
drop policy if exists "anon select accounts" on public.accounts;
drop policy if exists "anon insert accounts" on public.accounts;
drop policy if exists "anon update accounts" on public.accounts;
drop policy if exists "anon delete accounts" on public.accounts;

-- Allow anon role to read only the single app-data row
create policy "anon select accounts"
  on public.accounts
  for select
  to anon
  using (id = 'user-data');

-- Allow anon role to insert only the single app-data row
create policy "anon insert accounts"
  on public.accounts
  for insert
  to anon
  with check (id = 'user-data');

-- Allow anon role to update only the single app-data row
create policy "anon update accounts"
  on public.accounts
  for update
  to anon
  using (id = 'user-data')
  with check (id = 'user-data');

-- Prevent deletion (app never deletes this row; block in case of accidents)
-- If you ever need to delete, run it directly in the SQL Editor.
-- (No delete policy = delete blocked for anon role)


-- ── 2. contact-photos storage bucket ──────────────────────────────────────

-- Create the public bucket (idempotent)
insert into storage.buckets (id, name, public)
values ('contact-photos', 'contact-photos', true)
on conflict (id) do update set public = true;

-- Drop old open policies
drop policy if exists "Allow contact photo uploads" on storage.objects;
drop policy if exists "Allow public contact photo reads" on storage.objects;
drop policy if exists "Allow contact photo updates" on storage.objects;
drop policy if exists "Allow contact photo deletion" on storage.objects;

-- Anon can upload photos only into contact-photos bucket
create policy "contact-photos anon insert"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'contact-photos');

-- Anyone can read (bucket is public; explicit policy for clarity)
create policy "contact-photos public read"
  on storage.objects for select
  using (bucket_id = 'contact-photos');

-- Anon can upsert (replace) photos
create policy "contact-photos anon update"
  on storage.objects for update
  to anon
  using (bucket_id = 'contact-photos');

-- Anon can delete photos (needed for photo replacement cleanup)
create policy "contact-photos anon delete"
  on storage.objects for delete
  to anon
  using (bucket_id = 'contact-photos');


-- ── 3. account-files storage bucket ───────────────────────────────────────

-- Create the private bucket (NOT public — files use signed URLs)
insert into storage.buckets (id, name, public)
values ('account-files', 'account-files', false)
on conflict (id) do update set public = false;

-- Drop old open policies if any
drop policy if exists "account-files anon insert" on storage.objects;
drop policy if exists "account-files anon select" on storage.objects;
drop policy if exists "account-files anon update" on storage.objects;
drop policy if exists "account-files anon delete" on storage.objects;

-- Anon can upload files into account-files bucket
create policy "account-files anon insert"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'account-files');

-- Anon can read (required for signed URL generation)
create policy "account-files anon select"
  on storage.objects for select
  to anon
  using (bucket_id = 'account-files');

-- Anon can delete files
create policy "account-files anon delete"
  on storage.objects for delete
  to anon
  using (bucket_id = 'account-files');
