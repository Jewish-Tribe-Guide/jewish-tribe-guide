-- ─────────────────────────────────────────────────────────────────────────────
-- Upvotes (run in Supabase SQL editor, after schema.sql + categories.sql).
--
-- Anonymous, instant (not moderated) upvotes. One vote per listing per browser
-- token; toggling = insert/delete. A per-category flag controls whether a
-- category shows upvotes at all.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists vote (
  resource_id  uuid not null references resource (id) on delete cascade,
  voter_token  text not null,          -- anonymous per-browser token
  created_at   timestamptz not null default now(),
  primary key (resource_id, voter_token)
);

create index if not exists vote_resource_idx on vote (resource_id);

-- Votes are written/read only via server route handlers (service-role key).
alter table vote enable row level security;

-- Which categories allow upvotes (set per category; the Add-Category form opts in).
alter table category add column if not exists upvotes_enabled boolean not null default false;
