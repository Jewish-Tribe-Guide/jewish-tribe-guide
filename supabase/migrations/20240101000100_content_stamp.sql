-- ─────────────────────────────────────────────────────────────────────────────
-- When the site's content last changed (Nov 16 2026, src/lib/contentStamp.ts).
--
-- A tab coming back asks /api/content-version whether anything changed
-- since it loaded (RefreshContentOnReturn). That used to be a fingerprint
-- each server worked out and cached for itself, and the live servers held
-- different copies, so the answer was "changed" on nearly every return
-- when nothing had. This is one row every server reads: every admin save,
-- approval and nightly job moves it on (revalidatePublicContent).
--
--   id          'all' (one row; any save reaches every community's layout)
--   changed_at  when content last changed
--
-- Run in the Supabase SQL editor. The site works without it: the check
-- falls back to the old fingerprint.
--
-- Server-only, as 070, 080, 086 and 096: RLS on, no policies, service_role
-- grants alone.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.content_stamp (
  id         text primary key,
  changed_at timestamptz not null default now()
);

alter table public.content_stamp enable row level security;
grant select, insert, update, delete on public.content_stamp to service_role;

insert into public.content_stamp (id) values ('all') on conflict (id) do nothing;
