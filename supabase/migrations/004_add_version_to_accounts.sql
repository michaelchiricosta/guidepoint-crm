-- Migration: 004_add_version_to_accounts.sql
-- Adds optimistic concurrency version column to the accounts blob row.
-- Run once in the Supabase SQL Editor.

alter table public.accounts
  add column if not exists version integer default 1;

-- Backfill the existing user-data row so version is never null.
update public.accounts
  set version = 1
  where id = 'user-data' and version is null;
