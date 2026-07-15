-- ─────────────────────────────────────────────────────────────────────────────
-- Unified moderation queue (run in Supabase SQL editor, after schema.sql).
--
-- Every proposed change — add/edit/remove a listing, tag, or category — is one
-- row here. The live `resource` / `tag` / `resource_tag` tables hold only
-- approved data; approving a submission APPLIES the change to those tables.
--
--   operation    what to do:   create | update | delete
--   target_type  what it's about: listing | tag | category
--   target_id    the existing row being changed (null for a create)
--   payload      proposed values (new listing fields, edited fields, tag ref…)
--   note         optional submitter reason (e.g. "permanently closed")
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists submission (
  id           uuid primary key default gen_random_uuid(),
  operation    text not null check (operation in ('create', 'update', 'delete')),
  target_type  text not null check (target_type in ('listing', 'tag', 'category')),
  target_id    uuid,
  payload      jsonb not null default '{}'::jsonb,
  note         text,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by jsonb,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);

create index if not exists submission_status_idx on submission (status);
create index if not exists submission_target_idx on submission (target_type, target_id);

-- Submissions are private (only the owner reviews them). Enable RLS with NO
-- public policies, so the anon key can't read them; the server uses service-role.
alter table submission enable row level security;

-- Allow listings to be soft-deleted (an approved removal sets status='archived',
-- so it never shows publicly but can be restored). Replaces the original
-- status check from schema.sql.
alter table resource drop constraint if exists resource_status_check;
alter table resource
  add constraint resource_status_check
  check (status in ('pending', 'approved', 'rejected', 'archived'));
