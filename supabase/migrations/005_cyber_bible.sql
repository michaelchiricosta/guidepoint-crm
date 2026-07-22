-- Migration: 005_cyber_bible.sql
-- Dedicated normalized tables for the Cyber Bible feature.
-- Run once in the Supabase SQL Editor when ready to migrate off the JSONB blob.
-- Currently the app stores cyber_bible data in accounts.data.cyberBible (JSONB blob).

create table if not exists cyber_bible_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  cogs_rank integer,
  tagline text,
  overview text,
  industry_position text,
  industry_position_reason text,
  founded_year integer,
  hq text,
  website text,
  last_enriched_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists cyber_bible_products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references cyber_bible_vendors(id) on delete cascade,
  name text not null,
  description text,
  primary_domain text,
  primary_sub_domain text,
  secondary_domains jsonb default '[]',
  key_capabilities jsonb default '[]',
  ideal_customer text,
  not_a_fit_when text,
  differentiators jsonb default '[]',
  weaknesses jsonb default '[]',
  things_to_watch_out_for jsonb default '[]',
  typical_competitors jsonb default '[]',
  created_at timestamptz default now()
);

create table if not exists cyber_bible_comparisons (
  id uuid primary key default gen_random_uuid(),
  vendor_a_slug text,
  vendor_b_slug text,
  product_a_id text,
  product_b_id text,
  comparison_type text,
  content jsonb not null,
  generated_at timestamptz default now()
);
