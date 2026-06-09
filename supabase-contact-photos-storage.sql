-- Supabase Storage setup for contact-photos bucket
--
-- Run this in the Supabase SQL editor at:
--   https://supabase.com/dashboard/project/aenlxbxkrxgylgknlcft/sql
--
-- Steps:
--   1. Go to Supabase dashboard → Storage → Create bucket named "contact-photos"
--      Set it to PUBLIC so photos are served via stable URLs.
--   2. Run the RLS policies below in the SQL editor.
--
-- Alternatively, run all statements below and the bucket will be created
-- if it does not already exist.

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
