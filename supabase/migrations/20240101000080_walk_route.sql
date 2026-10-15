-- ─────────────────────────────────────────────────────────────────────────────
-- Walking times along the streets (Oct 15): from a listing with places
-- "Within a walk" (a hotel's shuls, a hospital's food, shuls, hotels,
-- mikvah) to each of those places, as OpenRouteService walks it over
-- OpenStreetMap. Worked out once and kept: a walk doesn't change unless one
-- end moves. The guide used to show only a straight-line estimate.
--
-- One row per pair, written by the nightly job (/api/cron/walk-routes),
-- never by hand:
--
--   from_lat/from_lng, to_lat/to_lng  where each end was when it was worked
--                   out; a listing that moves since is worked out again,
--                   and until then shows the estimate
--   minutes, meters  the walk; null when there's no walking route at all
--                   (the estimate shows)
--
-- Run in the Supabase SQL editor, before deploying the code that calls it.
-- The site works without it: every walk shows its straight-line estimate.
--
-- Server-only, as 070 and 074: RLS on, no policies, service_role grants
-- alone. The public reads it through /api/walk-routes.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.walk_route (
  community_id text not null,
  from_id      uuid not null references public.resource (id) on delete cascade,
  to_id        uuid not null references public.resource (id) on delete cascade,
  from_lat     double precision not null,
  from_lng     double precision not null,
  to_lat       double precision not null,
  to_lng       double precision not null,
  minutes      integer,
  meters       integer,
  worked_out_at timestamptz not null default now(),
  primary key (from_id, to_id)
);

create index if not exists walk_route_community_idx on public.walk_route (community_id);

alter table public.walk_route enable row level security;
grant select, insert, update, delete on public.walk_route to service_role;
