# Ledgr — Security Notes

Last updated: 2026-06-09

---

## Current Security Posture

Ledgr is a single-user personal CRM deployed on Vercel with a Supabase backend and direct Anthropic API calls from the browser. There is no user authentication system. The app is protected by:

- Supabase Row Level Security (RLS) on the `accounts` table
- Supabase RLS policies on both storage buckets
- The Supabase anon (publishable) key — designed to be client-side visible; RLS is the gate
- File type and size validation at the client layer before upload
- Anthropic API key stored in app settings (user-provided), never hardcoded

---

## What Was Hardened (2026-06-09)

### 1. Removed VITE_ANTHROPIC_KEY env var fallback
**Risk before:** `IntelLog.jsx`, `AIHistory.jsx`, and `Overview.jsx` fell back to `import.meta.env.VITE_ANTHROPIC_KEY`. If that variable was ever set in Vercel environment variables, the Anthropic API key would be baked into the public JavaScript bundle and exposed to anyone who downloads the app.

**Fix:** Removed the fallback. The only source for the Anthropic API key is the user-provided value stored in app settings (`data.apiKey`), passed as a prop. `VITE_ANTHROPIC_KEY` must never be set.

### 2. Supabase credentials moved to env vars
**Risk before:** Supabase URL and anon key were hardcoded strings in `src/supabase.js`, committed to the repository.

**Fix:** `supabase.js` now reads from `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` env vars, falling back to the current hardcoded values for continuity. Move these to Vercel environment variables to fully remove them from source.

### 3. File type and size validation (centralized in supabase.js)
**Risk before:** `uploadFile()` accepted any file type and had no server-enforced size limit. `uploadContactPhoto()` accepted any MIME type.

**Fix:**
- `uploadFile()` enforces 25 MB hard limit; only allows PDF, Word, Excel, PowerPoint, CSV, TXT, and images
- `uploadContactPhoto()` enforces 5 MB hard limit; only allows JPEG, PNG, GIF, WebP
- Clean user-facing error messages — no raw error objects exposed

### 4. File name sanitization
**Risk before:** `uploadFile()` used `file.name` directly in the storage path — could contain `../` or other path traversal characters.

**Fix:** `sanitizeFileName()` strips path separators, `..`, and non-word characters before constructing the storage path. The original display name is stored separately for the UI.

### 5. Files.jsx: removed soft "upload anyway" confirm for large files
**Risk before:** Files over 10 MB showed a `confirm()` dialog; users could click through to upload arbitrarily large files, running up Supabase storage costs.

**Fix:** Hard limit enforced in `supabase.js`. The confirm dialog is gone. If a file exceeds the limit, the upload is blocked with a clean error message.

### 6. Replaced alert() error messages with inline UI errors
**Risk before:** `Files.jsx` used `alert('Could not load file: ' + e.message)` which could surface raw Supabase/storage error text.

**Fix:** All file action errors now appear as dismissable inline banners in the UI. No raw error strings shown to the user.

### 7. Contact photo error display
**Risk before:** Photo upload errors showed a raw `alert()` with `err.message`.

**Fix:** Errors appear as a toast-style banner with a clean message. The raw error is never shown.

### 8. AI chat input length cap
**Risk before:** The AI chat textarea had no length limit — very long inputs could generate large expensive API calls.

**Fix:** Input is capped at 4,000 characters. A char counter appears when approaching the limit (yellow at 80%, red at 100%). Messages over the limit are blocked before sending.

### 9. AI CISO generation cooldown
**Risk before:** The "Regenerate" button in TechStack AI CISO could be clicked rapidly, triggering multiple expensive AI calls in quick succession.

**Fix:** 30-second cooldown enforced client-side via `window._lastCisoGenAt`. A clear countdown message appears if the user tries to regenerate too quickly.

### 10. VendorsPage vendor doc size limit
**Risk before:** Vendor document uploads for AI extraction had no size limit — a large file could trigger a very large AI call.

**Fix:** Hard 20 MB limit enforced before the file is read or sent for extraction.

### 11. VendorsPage: replaced alert() with setUploadError
**Risk before:** The API key check in vendor upload used `alert()`.

**Fix:** Uses `setUploadError()` for in-UI display.

---

## Remaining Risks

### No authentication
The biggest remaining risk. The Supabase anon key is in the public bundle (or source code). Anyone who discovers the URL and key can read and overwrite all app data.

**Mitigation in place:** RLS policies restrict the `accounts` table to only the `user-data` row. An attacker cannot access other rows or tables. However, they can read and overwrite `user-data`.

**Future fix:** Add Supabase Auth (email/password or magic link). Update RLS policies to use `auth.uid()`. This is a 2-3 hour change and is the most impactful security improvement remaining.

### Anthropic API key stored in Supabase
The user's Anthropic API key is stored as part of `data.apiKey` in the `accounts` table. If an attacker reads the `user-data` row, they get the API key.

**Mitigation:** The key is user-provided and only used for AI features. It is never logged server-side.

**Future fix:** Store the Anthropic API key as a Vercel environment variable (`ANTHROPIC_API_KEY`) and proxy all Claude calls through a Vercel API route (`/api/claude`). This removes the key from client-side code and from Supabase entirely. This would also remove the need for `anthropic-dangerous-direct-browser-access` header.

### Client-side rate limiting only
All spend controls (file size limits, chat input cap, CISO cooldown) are enforced client-side only. A determined attacker calling Supabase or Anthropic APIs directly bypasses them.

**Mitigation:** These are personal-CRM-appropriate controls. For real multi-user apps, enforce limits server-side.

---

## Manual Supabase Steps Required

Run the contents of `supabase-rls-policies.sql` in the Supabase SQL Editor to enable and enforce RLS:

1. Go to: https://supabase.com/dashboard/project/aenlxbxkrxgylgknlcft/sql
2. Paste the full contents of `supabase-rls-policies.sql`
3. Click Run

This is not done automatically — it must be done once manually.

---

## Environment Variables

### Safe client-side (VITE_ prefix — baked into public bundle at build time)

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_SUPABASE_URL` | `https://aenlxbxkrxgylgknlcft.supabase.co` | Anon key URL — safe to be public |
| `VITE_SUPABASE_KEY` | `sb_publishable_3r...` | Anon key — safe to be public WITH RLS enabled |

Set these in Vercel → Project → Settings → Environment Variables to remove them from source code.

### Must NEVER be client-side (VITE_ prefix)

| Variable | Reason |
|----------|--------|
| `VITE_ANTHROPIC_KEY` | Would bake Claude API key into public bundle — NEVER SET THIS |
| `ANTHROPIC_API_KEY` | Should only exist as a server-side env var if you add an API proxy route |
| Any Supabase service role key | Would grant full database access without RLS |

---

## Spend Control Recommendations

| Control | Current | Recommended |
|---------|---------|-------------|
| File upload size | 25 MB hard limit | Consider 10 MB for most use cases |
| Contact photo size | 5 MB hard limit | OK |
| AI chat input | 4,000 char limit | OK |
| AI CISO generation | 30s cooldown | OK |
| Vendor doc size | 20 MB hard limit | OK |
| Supabase storage total | No limit | Monitor in Supabase dashboard |
| Anthropic API spend | No server-side limit | Set a monthly spend cap in Anthropic Console |

---

## Future Auth / RLS Improvement Plan

When you are ready to add real authentication:

1. Enable Supabase Auth (email/password or magic link) in the Supabase dashboard
2. Add a `user_id uuid references auth.users` column to the `accounts` table
3. Update all RLS policies to `using (auth.uid() = user_id)` instead of `using (id = 'user-data')`
4. Update `saveData` / `loadData` to filter by `user_id = auth.uid()`
5. Add login/logout UI (can be a simple modal — ~1 hour of work)
6. Move the Anthropic API key to a Vercel API route at `/api/claude` to prevent key exposure

Until then, treat the app as "security through obscurity + RLS" — adequate for a personal CRM, not adequate for shared or multi-user use.

---

## SQL Files in This Repository

| File | Purpose |
|------|---------|
| `supabase-rls-policies.sql` | Full RLS for `accounts` table, `contact-photos` bucket, `account-files` bucket — **run this manually** |
| `supabase-contact-photos-storage.sql` | Older contact-photos-only setup — superseded by `supabase-rls-policies.sql` |
