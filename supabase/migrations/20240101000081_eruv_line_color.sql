-- An eruv's line in a colour the guide chooses (Oct 15 2026).
--
-- Each eruv's map is drawn as the eruv draws it (076), colours included.
-- Northeast's own map draws its boundary in a very pale cyan (#ccffff),
-- next to white on a Google map, so it was hard to see. An admin can now
-- set the colour its lines are drawn in. Only the colour: the line itself
-- is still read from the eruv's own map every hour, and its shading,
-- markers and widths are still theirs.
--
--   line_color  '#rrggbb' to draw its lines in; null, its own colours.

alter table public.eruv add column if not exists line_color text;
