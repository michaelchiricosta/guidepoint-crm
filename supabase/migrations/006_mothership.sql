-- Mothership: GuidePoint internal knowledge base
-- Run in Supabase SQL Editor

create table if not exists mothership_intel (
  id uuid primary key default gen_random_uuid(),
  type text not null, -- 'text' | 'file'
  content text,       -- plain text intel or extracted file text
  file_name text,     -- display name (also used as title for text entries)
  file_path text,     -- Supabase storage path (files only)
  file_type text,     -- mime type (files only)
  file_size integer,  -- bytes (files only)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Storage bucket: create manually in Supabase Dashboard → Storage → New bucket
-- Bucket name: mothership-files
-- Public: false (private bucket — access controlled via anon key + service role)
-- After creating the bucket, add a storage policy:
--   Policy name: allow_anon_all
--   Allowed operations: SELECT, INSERT, DELETE
--   Target roles: anon, authenticated
