-- Migration 008: add reviewed_items to call_analysis
--
-- Persists which items the user has dismissed or marked handled in the Maggie UI.
-- Shape: { "action_items": [0, 2], "draft_emails": [1], "flags": [0] }
-- Each key holds an array of integer indices into the corresponding distilled array.
-- Empty object means nothing has been handled yet.

alter table call_analysis
  add column if not exists reviewed_items jsonb default '{}'::jsonb;
