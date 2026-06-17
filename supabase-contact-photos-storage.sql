-- ⚠️  DEPRECATED — DO NOT RUN THIS FILE
-- =========================================================
-- This file is superseded by supabase-rls-policies.sql
-- which includes updated policies with:
--   - anon role restriction (not open to all)
--   - image extension allowlist (jpg, jpeg, png, gif, webp)
--   - account-files private bucket policies
--
-- Run supabase-rls-policies.sql instead.
-- This file is kept for historical reference only.
-- =========================================================
--
-- Original: Supabase Storage setup for contact-photos bucket

-- Create the public bucket (safe to run if it already exists)
insert into storage.buckets (id, name, public)
values ('contact-photos', 'contact-photos', true)
on conflict (id) do update set public = true;

-- Allow anyone to upload photos (single-user app, no auth)
create policy "Allow contact photo uploads"
  on storage.objects for insert
  with check (bucket_id = 'contact-photos');

-- Allow public reads (bucket is public, but explicit policy is good practice)
create policy "Allow public contact photo reads"
  on storage.objects for select
  using (bucket_id = 'contact-photos');

-- Allow photo replacement (update)
create policy "Allow contact photo updates"
  on storage.objects for update
  using (bucket_id = 'contact-photos');

-- Allow photo deletion
create policy "Allow contact photo deletion"
  on storage.objects for delete
  using (bucket_id = 'contact-photos');
