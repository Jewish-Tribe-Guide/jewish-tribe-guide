-- ─────────────────────────────────────────────────────────────────────────────
-- Form responses (run in Supabase SQL editor, after forms.sql).
--
-- Every /api/requests submission (support, volunteer signup/edit/removal,
-- feedback) lands here as the system of record, in addition to the legacy
-- Google Sheets append (best-effort — see route.ts). Distinct from `submission`
-- (listing/category moderation) — different domain, don't conflate them.
--
-- `data` keeps the same two-part shape the app already uses everywhere else
-- (contact vs. request-specific formData) so a new admin-created form needs no
-- new columns and no new code to read/write here.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists form_response (
  id           uuid primary key default gen_random_uuid(),
  request_id   text not null unique,
  request_type text not null check (
    request_type in ('Direct Support', 'Volunteer', 'Volunteer Edit', 'Volunteer Removal', 'Feedback')
  ),
  contact      jsonb not null default '{}'::jsonb,
  data         jsonb not null default '{}'::jsonb,
  status       text not null default 'new' check (status in ('new', 'handled')),
  created_at   timestamptz not null default now(),
  handled_at   timestamptz
);

create index if not exists form_response_type_idx on form_response (request_type, created_at desc);

-- Private (only the inbox allowlist reads this) — RLS on with NO public
-- policies, same stance as `submission`. The server uses service-role for all
-- reads/writes; the anon key can't touch this table at all.
alter table form_response enable row level security;
