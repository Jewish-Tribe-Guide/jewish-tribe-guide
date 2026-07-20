-- ─────────────────────────────────────────────────────────────────────────────
-- Mikvah: split hours/phone/email/appointment by audience (run in Supabase
-- SQL editor, after category_external_link.sql).
--
-- The Mikvah category had one shared Hours/Email and a single "Appointment"
-- checkbox, but men's, women's, and keilim tevillah can genuinely run on
-- different schedules with different contacts, and appointments are really
-- only a women's-tevillah concern. This adds a Women's/Men's/Keilim Hours,
-- Phone (Women's also gets Email + free-text appointment notes), each tagged
-- with `audienceKey` pointing at the matching capability boolean
-- (womenTevillah/menTevillah/keilim) — the card hides other audiences'
-- fields when one of those filters is active (see GenericListingCard.tsx).
-- Existing field keys (e, hours, w, a, womenTevillah, menTevillah, keilim)
-- are preserved as-is (just two label tweaks) so no listing data is lost;
-- `hours`/`e` stay the general/shared fields, always shown.
--
-- Also sets the new "Other Mikvahs" header-button link to mikvah.org's
-- Philadelphia directory, for mikvahs not curated here.
--
-- Existing per-listing data for the new fields (womenHours, menPhone, etc.)
-- is empty until edited in — nothing to backfill, since this data didn't
-- exist under any key before.
-- ─────────────────────────────────────────────────────────────────────────────

update category
set
  fields = '[
    { "key": "e", "type": "text", "label": "General Email", "renderAs": "row", "filterable": false },
    { "key": "hours", "type": "hours", "label": "Hours", "renderAs": "row", "filterable": true },
    { "key": "womenTevillah", "type": "boolean", "label": "Women'"'"'s Tevillah", "renderAs": "badge", "filterable": true, "filterLabel": "Women'"'"'s" },
    { "key": "menTevillah", "type": "boolean", "label": "Men'"'"'s Tevillah", "renderAs": "badge", "filterable": true, "filterLabel": "Men'"'"'s" },
    { "key": "keilim", "type": "boolean", "label": "Keilim", "renderAs": "badge", "filterable": true, "filterLabel": "Keilim" },
    { "key": "a", "type": "boolean", "label": "Appointment Required (Women)", "renderAs": "badge", "filterable": true, "audienceKey": "womenTevillah" },
    { "key": "womenApptNotes", "type": "textarea", "label": "Appointment Notes (Women)", "renderAs": "row", "filterable": false, "audienceKey": "womenTevillah", "placeholder": "e.g. Call ahead to schedule; by appointment only on weekdays" },
    { "key": "womenHours", "type": "hours", "label": "Women'"'"'s Hours", "renderAs": "row", "filterable": true, "audienceKey": "womenTevillah" },
    { "key": "womenPhone", "type": "tel", "label": "Women'"'"'s Phone", "renderAs": "row", "filterable": false, "audienceKey": "womenTevillah" },
    { "key": "womenEmail", "type": "text", "label": "Women'"'"'s Email", "renderAs": "row", "filterable": false, "audienceKey": "womenTevillah" },
    { "key": "menHours", "type": "hours", "label": "Men'"'"'s Hours", "renderAs": "row", "filterable": true, "audienceKey": "menTevillah" },
    { "key": "menPhone", "type": "tel", "label": "Men'"'"'s Phone", "renderAs": "row", "filterable": false, "audienceKey": "menTevillah" },
    { "key": "keilimHours", "type": "hours", "label": "Keilim Hours", "renderAs": "row", "filterable": true, "audienceKey": "keilim" },
    { "key": "keilimPhone", "type": "tel", "label": "Keilim Phone", "renderAs": "row", "filterable": false, "audienceKey": "keilim" },
    { "key": "w", "type": "url", "label": "Website", "renderAs": "row", "filterable": false }
  ]'::jsonb,
  external_link_label = 'Other Mikvahs',
  external_link_url = 'https://mikvah.org/directory/philadelphia?lat=39.952584&lng=-75.165222&type=locality&country=US'
where id = 'mikvah';
