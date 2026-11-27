-- How long the "+ Add" box's AI read takes (Nov 26 2026, docs/add-rethink.md).
--
-- The reader timed every read and threw the time away, so nobody knew how
-- long a visitor waits. One row per read: no post text, no photo, no
-- visitor, only what it took.
--
--   community_id  whose box
--   ms            the whole request, as the visitor waits for it
--   model_ms      the reader's own model call within it
--   model         the model
--   effort        the thinking level sent (null: the model's default)
--   photos        how many photos or PDFs came with it
--   proposals     how many changes it read
--   follow_ups    second reads after it (a menu, a shul's week)
--   input_tokens, cached_tokens, output_tokens  from the model's usage
--
-- Run in the Supabase SQL editor, dev then live. The box works without it:
-- the time just isn't kept.
--
-- Server-only: RLS on, no policies, service_role grants alone.

create table if not exists public.message_read_time (
  id            bigint generated always as identity primary key,
  community_id  text not null,
  read_at       timestamptz not null default now(),
  ms            integer not null,
  model_ms      integer,
  model         text,
  effort        text,
  photos        smallint not null default 0,
  proposals     smallint not null default 0,
  follow_ups    smallint not null default 0,
  input_tokens  integer,
  cached_tokens integer,
  output_tokens integer
);

create index if not exists message_read_time_at on public.message_read_time (community_id, read_at desc);

alter table public.message_read_time enable row level security;
grant select, insert, update, delete on public.message_read_time to service_role;
grant usage, select on sequence public.message_read_time_id_seq to service_role;

insert into public.migration_ran (name) values ('20240101000117_message_read_time') on conflict (name) do nothing;
