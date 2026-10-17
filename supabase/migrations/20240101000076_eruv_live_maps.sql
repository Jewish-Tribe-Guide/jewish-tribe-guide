-- The eruvim's own maps, shown as they draw them (Oct 12 2026).
--
-- The guide used to read each eruv's line on Thursdays, hold a changed line
-- for an admin's yes, and work out the area it encloses. Now it reads each
-- eruv's map about every hour and shows it as the eruv draws it: its lines
-- and colours, its shading and its markers, without the parts an admin
-- chose to leave out. Nothing waits for a yes; an admin hears only when a
-- part they left out is no longer in the eruv's file (renamed or removed),
-- since the map could then show something it shouldn't.
--
--   line             the last good read of the eruv's file, as it came,
--                    shown when their site can't be reached;
--   line_leave_out   the parts not shown, by name (unchanged);
--   line_hide_points new: not their markers (Northeast's and Elkins Park's
--                    maps pin their shuls, which the guide already shows);
--   line_missing     new: left-out names the file no longer has, as last
--                    told to the admins, so they hear once.
--
-- line_pending, line_approved_at and line_approved_by are no longer used.

alter table public.eruv add column if not exists line_hide_points boolean not null default false;
alter table public.eruv add column if not exists line_missing text[] not null default '{}';

-- Center City's own site draws 21 of the 31 pieces in its file, by a list
-- in its page (`boundarySegments`). The other ten aren't its boundary: the
-- old Washington Avenue and Front Street borders, the old Grey's Ferry
-- border and Lines 25-30 (together about 1.9 km² west of 25th Street that
-- its map leaves out), and the South Street Bridge connector.
update public.eruv
set line_leave_out = array[
      'Washington Border',
      'Front St Border',
      'Grey''s Ferry Border',
      'South Street Bridge',
      'Line 25',
      'Line 26',
      'Line 27',
      'Line 28',
      'Line 29',
      'Line 30'
    ],
    updated_at = now()
where community_id = 'philly'
  and id = 'center-city'
  and line_url = 'https://www.centercityeruv.com/map-data.geojson'
  and line_leave_out = '{}';

-- Northeast's map pins its shuls, kollel, mikvah and a café; Elkins Park's
-- its shul, its yeshiva and the ends of a walking route. The guide shows
-- the places itself.
update public.eruv
set line_hide_points = true,
    updated_at = now()
where community_id = 'philly'
  and id in ('northeast', 'elkins-park');
