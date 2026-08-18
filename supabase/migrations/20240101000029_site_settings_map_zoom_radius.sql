-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a configurable cap (miles) on how far a point can be from the visitor
-- (or the community center, if no location is set) and still count toward
-- the map's automatic "fit everything" zoom, run whenever a category is
-- selected or the map narrows to search results.
--
-- Without this, a single far-off listing — e.g. a delivery-only address
-- miles outside town — could force the whole map to zoom out to fit it the
-- moment its category was selected. Null (the default) keeps the original
-- unbounded behavior; an admin sets a real number (e.g. 10) in the Site tab
-- to cap it. Outlier points are still plotted on the map either way — this
-- only affects the automatic initial framing, not what's shown once panned
-- to. See src/components/map/ResourceMap.tsx's own zoomRadiusMiles prop.
-- ─────────────────────────────────────────────────────────────────────────────

alter table site_settings add column if not exists map_zoom_radius_miles numeric;
