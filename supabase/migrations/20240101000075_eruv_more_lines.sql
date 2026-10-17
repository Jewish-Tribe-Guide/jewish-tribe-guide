-- The Northeast and Elkins Park eruvim publish their lines too (Oct 7 2026),
-- as Google My Maps:
--   - the Northeast on JCOR's eruv page (jcor.org, "Eruv Map"): "Northeast
--     Philadelphia New Eruv Boundries", new as of 5786;
--   - Elkins Park's map, which also draws a walking route from the Elkins
--     Park House to the Young Israel. That isn't the eruv's line, so it's
--     left out of the area.
-- Only where an admin hasn't set a line already. The lines themselves are
-- read on the next run and wait for an admin's yes, as every line does.

update public.eruv
set line_url = 'https://www.google.com/maps/d/viewer?mid=18xpArWe3BIxPziXzXyIsuUXNnn-qkdY',
    website = case when website = 'https://jcor.org/' then 'https://jcor.org/#eruv-info' else website end,
    updated_at = now()
where community_id = 'philly' and id = 'northeast' and line_url is null;

update public.eruv
set line_url = 'https://www.google.com/maps/d/viewer?mid=1a_1M1sNwHGSF3bZ6tzFFtovJkdc',
    line_leave_out = array['Directions from Elkins Park House to Young Israel of Elkins Park'],
    updated_at = now()
where community_id = 'philly' and id = 'elkins-park' and line_url is null;
