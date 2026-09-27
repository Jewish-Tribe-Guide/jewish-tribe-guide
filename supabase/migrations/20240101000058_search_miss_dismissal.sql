-- ─────────────────────────────────────────────────────────────────────────────
-- The admin's "Missed searches" list (its own admin tab) reads the
-- search_miss counts from 057 and lets an admin dismiss one: a search the
-- guide will never answer ("zzqx", "weather"), so it stops sitting at the top
-- of the to-do list. Restoring it deletes the row.
--
-- Run in the Supabase SQL editor, after 057. The list still loads without
-- this table; only Dismiss fails, with a message saying so.
--
-- Server-only, same as 057: RLS on, no policies, service_role grants alone.
-- `key` is the normalised search text, exactly as daily_count stores it.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists search_miss_dismissal (
  community_id text not null,
  key          text not null,
  dismissed_at timestamptz not null default now(),
  primary key (community_id, key)
);

alter table search_miss_dismissal enable row level security;
grant select, insert, update, delete on public.search_miss_dismissal to service_role;
