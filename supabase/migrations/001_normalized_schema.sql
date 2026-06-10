-- ─────────────────────────────────────────────────────────────────────────────
-- Ledgr Normalized Schema — Migration 001
-- Phase 0: Infrastructure preparation. These tables are NOT yet read or written
-- by the application. The single-blob architecture (accounts.data JSONB) remains
-- the source of truth until a future dual-write migration phase.
--
-- Run this in the Supabase SQL editor. All statements are idempotent (IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Workspaces ───────────────────────────────────────────────────────────────
-- Future: one row per user or team. Today's app is single-tenant (one blob).
-- API keys should migrate here (or to Supabase Vault) rather than living in
-- the JSONB blob where they are plaintext and travel with every export.
create table if not exists workspaces (
  id          uuid primary key default gen_random_uuid(),
  owner_email text not null unique,
  quota_target numeric(12,2) default 0,
  -- API key stored here is still plaintext; true solution is Supabase Vault.
  -- See: https://supabase.com/docs/guides/database/vault
  api_key_enc text,             -- placeholder: encrypt before storing
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─── Accounts (normalized) ────────────────────────────────────────────────────
create table if not exists accounts_normalized (
  id                    text primary key,          -- matches blob account id (uid())
  workspace_id          uuid references workspaces(id) on delete cascade,
  name                  text not null,
  short                 text,
  industry              text,
  hq                    text,
  status                text,                      -- Active | Strategic | At Risk | Churned
  cloud                 text,
  users                 text,
  relationship          text,
  last_contact          date,
  notes                 text,
  endpoints             text,
  logo_image            text,                      -- base64 or storage URL
  admin_data            jsonb default '{}'::jsonb,
  org_chart             jsonb default '{"nodes":[]}'::jsonb,
  health_score_overrides jsonb default '{}'::jsonb,
  upcoming_dates        jsonb default '[]'::jsonb,
  unknown_mentions      jsonb default '[]'::jsonb,
  rel_suggestions       jsonb default '[]'::jsonb,
  contact_suggestions   jsonb default '[]'::jsonb,
  dismissed_alerts      jsonb default '[]'::jsonb,
  snoozed_alerts        jsonb default '[]'::jsonb,
  saved_links           jsonb default '[]'::jsonb,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ─── Contacts ────────────────────────────────────────────────────────────────
create table if not exists contacts (
  id                text primary key,
  account_id        text not null references accounts_normalized(id) on delete cascade,
  contact_type      text,                          -- Client | Vendor | Internal
  name              text not null,
  title             text,
  email             text,
  cell              text,
  linkedin          text,
  location          text,
  dept              text,
  influence         text,                          -- Executive Sponsor | Technical Gatekeeper | etc.
  sentiment         text,                          -- positive | neutral | negative
  rel_status        text,                          -- Strong | Building | Needs Attention
  tools_own         text,
  goals             text,
  pains             text,
  notes             text,
  personal_notes    text,
  last_interacted   date,
  vendor_company    text,
  contact_photo     text,                          -- storage URL
  added_manually    boolean default false,
  internal_meetings jsonb default '[]'::jsonb,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ─── Tech Stack ───────────────────────────────────────────────────────────────
create table if not exists tech_stack (
  id                  text primary key,
  account_id          text not null references accounts_normalized(id) on delete cascade,
  vendor              text not null,
  products            text,
  category            text,
  status              text,                        -- Current | Evaluating | Replacing | Selected | Watch
  renewal_date        date,
  cost                text,
  vendor_rep          text,
  vendor_rep_email    text,
  client_owner        text,
  replacement_options text,
  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ─── Projects ────────────────────────────────────────────────────────────────
create table if not exists projects (
  id                     text primary key,
  account_id             text not null references accounts_normalized(id) on delete cascade,
  name                   text not null,
  category               text,
  vendor                 text,
  status                 text,                     -- Not Started | In Discussion | In Flight | Stalled | Won | Lost
  description            text,
  goals                  text,
  pains                  text,
  primary_contact        text,
  has_budget             boolean default false,
  close_date             date,
  notes                  text,
  waiting_on             text,
  next_action            text,
  estimated_revenue      numeric(14,2),
  estimated_gross_profit numeric(14,2),
  client_target_date     date,
  timeline               jsonb default '[]'::jsonb, -- [{stage, status, date}]
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- ─── Actions (follow-ups) ─────────────────────────────────────────────────────
create table if not exists actions (
  id          text primary key,
  account_id  text not null references accounts_normalized(id) on delete cascade,
  contact     text,
  task        text not null,
  priority    text,                                -- Critical | High | Medium | Low
  due_date    date,
  status      text default 'Open',                -- Open | Done
  context     text,
  ai_intel    jsonb,                              -- cached AI brief (mirrors fu.aiIntel in blob)
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─── Action AI briefs ─────────────────────────────────────────────────────────
-- This table already exists in production (created in Round 7).
-- Re-stated here so the normalized migration is self-contained.
create table if not exists action_ai_briefs (
  id           uuid primary key default gen_random_uuid(),
  account_id   text not null,
  action_id    text not null,
  brief        jsonb not null,
  generated_at timestamptz default now(),
  unique (account_id, action_id)
);

-- ─── Intel Log ────────────────────────────────────────────────────────────────
create table if not exists intel_logs (
  id           text primary key,
  account_id   text not null references accounts_normalized(id) on delete cascade,
  date         date,
  type         text,                              -- Call | Email | Meeting | Note | etc.
  participants text,
  summary      text,
  insights     text[] default array[]::text[],
  risks        text[] default array[]::text[],
  opportunities text[] default array[]::text[],
  raw_text     text,                              -- original pasted content (if AI-parsed)
  created_at   timestamptz default now()
);

-- ─── Interactions ────────────────────────────────────────────────────────────
create table if not exists interactions (
  id         text primary key,
  account_id text not null references accounts_normalized(id) on delete cascade,
  contact    text,
  type       text,                                -- Call | Email | Meeting | Demo | etc.
  date       date,
  duration   integer,                             -- minutes
  topics     text,
  summary    text,
  created_at timestamptz default now()
);

-- ─── AI History ──────────────────────────────────────────────────────────────
create table if not exists ai_history (
  id         uuid primary key default gen_random_uuid(),
  account_id text not null references accounts_normalized(id) on delete cascade,
  type       text,                                -- chat | intel | score | etc.
  prompt     text,
  response   text,
  model      text,
  tokens_in  integer,
  tokens_out integer,
  created_at timestamptz default now()
);

-- ─── Health Score History ─────────────────────────────────────────────────────
create table if not exists health_score_history (
  id         uuid primary key default gen_random_uuid(),
  account_id text not null references accounts_normalized(id) on delete cascade,
  score      integer not null,
  breakdown  jsonb,
  recorded_at date not null default current_date
);

-- ─── Account Files (metadata) ─────────────────────────────────────────────────
-- Actual file bytes live in the Supabase `account-files` storage bucket.
-- This table holds the metadata currently stored in the blob (acct.files[]).
create table if not exists account_files (
  id          text primary key,                   -- matches blob file.id
  account_id  text not null references accounts_normalized(id) on delete cascade,
  name        text not null,
  type        text,
  size        integer,
  uploaded_at timestamptz,
  category    text,
  notes       text,
  path        text not null                       -- storage bucket path
);

-- ─── Whitespace Accounts ─────────────────────────────────────────────────────
create table if not exists whitespace_accounts (
  id                    text primary key,
  workspace_id          uuid references workspaces(id) on delete cascade,
  name                  text not null,
  hq                    text,
  industry              text,
  employees             text,
  revenue               text,
  status                text,
  notes                 jsonb default '[]'::jsonb,   -- [{id, text, date, addedBy}]
  contacts              jsonb default '[]'::jsonb,   -- lightweight: name strings or objects
  technologies          jsonb default '[]'::jsonb,   -- [{name, status}]
  intel_log             jsonb default '[]'::jsonb,
  ai_opportunity_score  integer,
  ai_score_reasoning    text,
  ai_score_updated_at   timestamptz,
  added_at              timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes (add selectively as query patterns are confirmed)
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_contacts_account_id        on contacts(account_id);
create index if not exists idx_tech_stack_account_id      on tech_stack(account_id);
create index if not exists idx_projects_account_id        on projects(account_id);
create index if not exists idx_actions_account_id         on actions(account_id);
create index if not exists idx_actions_status             on actions(status);
create index if not exists idx_intel_logs_account_id      on intel_logs(account_id);
create index if not exists idx_interactions_account_id    on interactions(account_id);
create index if not exists idx_ai_history_account_id      on ai_history(account_id);
create index if not exists idx_health_score_history_acct  on health_score_history(account_id, recorded_at);
create index if not exists idx_account_files_account_id   on account_files(account_id);
create index if not exists idx_whitespace_workspace_id    on whitespace_accounts(workspace_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS stubs (disabled until auth is wired — enable per-table when ready)
-- ─────────────────────────────────────────────────────────────────────────────
-- alter table accounts_normalized enable row level security;
-- alter table contacts enable row level security;
-- alter table tech_stack enable row level security;
-- alter table projects enable row level security;
-- alter table actions enable row level security;
-- alter table intel_logs enable row level security;
-- alter table ai_history enable row level security;
-- alter table health_score_history enable row level security;
-- alter table account_files enable row level security;
-- alter table whitespace_accounts enable row level security;
