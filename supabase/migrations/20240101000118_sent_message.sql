-- A post or photo sent with the "+ Add" box, read after it's sent
-- (Nov 27 2026, docs/add-rethink.md, boards S1b–S4c).
--
-- The box used to read a paste while the visitor waited and checked the
-- read. Now Send keeps what they sent here and answers at once; the AI
-- reads it in the background, at a higher thinking level, and files what
-- it reads as ordinary suggestions for an admin (submission rows). What it
-- can't file (which place it means, nothing it can read, the reader down)
-- stays here for an admin, as the original.
--
--   community_id   whose box
--   listing_id     the listing the box was opened from, if any ("Update X")
--   text           what they pasted or wrote
--   photo_urls     their photos or PDFs, kept in site-assets/message-source/
--   email          "email me when it's on the site", if they gave one
--   status         reading: not read yet (or a read that failed, to try again)
--                  filed:   read; everything it said is in submission_ids
--                  left:    read, and some or all of it is for an admin (left)
--                  done:    an admin dealt with what was left
--   submission_ids what the read filed
--   left           what it couldn't file, a short line each, for the admin
--   attempts       reads tried, so a post that always fails stops
--   read_at        when it was read
--
-- The phone that sent it keeps its id, to show "Your updates" on You.
--
-- Run in the Supabase SQL editor, dev then live, BEFORE deploying the code
-- that uses it: without it the box can't send a paste.
--
-- Server-only: RLS on, no policies, service_role grants alone.

create table if not exists public.sent_message (
  id             uuid primary key default gen_random_uuid(),
  community_id   text not null,
  listing_id     uuid,
  text           text not null default '',
  photo_urls     text[] not null default '{}',
  email          text,
  status         text not null default 'reading' check (status in ('reading', 'filed', 'left', 'done')),
  submission_ids uuid[] not null default '{}',
  left_for_admin text[] not null default '{}',
  attempts       smallint not null default 0,
  created_at     timestamptz not null default now(),
  read_at        timestamptz
);

create index if not exists sent_message_status on public.sent_message (community_id, status, created_at);

alter table public.sent_message enable row level security;
grant select, insert, update, delete on public.sent_message to service_role;

insert into public.migration_ran (name) values ('20240101000118_sent_message') on conflict (name) do nothing;
