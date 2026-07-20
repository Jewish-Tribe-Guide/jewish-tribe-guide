-- ─────────────────────────────────────────────────────────────────────────────
-- Mikvah: short in-section labels (run in Supabase SQL editor, after
-- mikvah_audience_fields.sql).
--
-- Adds `shortLabel` to each of Mikvah's audience-scoped fields, e.g.
-- "Phone" instead of "Women's Phone" — shown only inside that field's
-- collapsible section in the intake form (the "Women's" heading already
-- says who it's for there). The card display, which doesn't group by
-- section, keeps using the full `label` unchanged. See CategoryField.shortLabel
-- in src/lib/categories.ts.
--
-- Replaces the whole `fields` array (same approach as the previous Mikvah
-- migration) rather than patching individual jsonb array elements, since
-- Postgres has no simple "update the object at array index N" jsonb
-- operator — full-array replacement is easier to read and verify than
-- chained jsonb_set calls over array indices.
-- ─────────────────────────────────────────────────────────────────────────────

update category
set
  fields = '[
    { "key": "e", "type": "text", "label": "General Email", "renderAs": "row", "filterable": false },
    { "key": "hours", "type": "hours", "label": "Hours", "renderAs": "row", "filterable": true },
    { "key": "womenTevillah", "type": "boolean", "label": "Women''s Tevillah", "renderAs": "badge", "filterable": true, "filterLabel": "Women''s" },
    { "key": "menTevillah", "type": "boolean", "label": "Men''s Tevillah", "renderAs": "badge", "filterable": true, "filterLabel": "Men''s" },
    { "key": "keilim", "type": "boolean", "label": "Keilim", "renderAs": "badge", "filterable": true, "filterLabel": "Keilim" },
    { "key": "a", "type": "boolean", "label": "Appointment Required (Women)", "shortLabel": "Appointment Required", "renderAs": "badge", "filterable": true, "audienceKey": "womenTevillah" },
    { "key": "womenApptNotes", "type": "textarea", "label": "Appointment Notes (Women)", "shortLabel": "Notes", "renderAs": "row", "filterable": false, "audienceKey": "womenTevillah", "placeholder": "e.g. Call ahead to schedule; by appointment only on weekdays" },
    { "key": "womenHours", "type": "hours", "label": "Women''s Hours", "shortLabel": "Hours", "renderAs": "row", "filterable": true, "audienceKey": "womenTevillah" },
    { "key": "womenPhone", "type": "tel", "label": "Women''s Phone", "shortLabel": "Phone", "renderAs": "row", "filterable": false, "audienceKey": "womenTevillah" },
    { "key": "womenEmail", "type": "text", "label": "Women''s Email", "shortLabel": "Email", "renderAs": "row", "filterable": false, "audienceKey": "womenTevillah" },
    { "key": "menHours", "type": "hours", "label": "Men''s Hours", "shortLabel": "Hours", "renderAs": "row", "filterable": true, "audienceKey": "menTevillah" },
    { "key": "menPhone", "type": "tel", "label": "Men''s Phone", "shortLabel": "Phone", "renderAs": "row", "filterable": false, "audienceKey": "menTevillah" },
    { "key": "keilimHours", "type": "hours", "label": "Keilim Hours", "shortLabel": "Hours", "renderAs": "row", "filterable": true, "audienceKey": "keilim" },
    { "key": "keilimPhone", "type": "tel", "label": "Keilim Phone", "shortLabel": "Phone", "renderAs": "row", "filterable": false, "audienceKey": "keilim" },
    { "key": "w", "type": "url", "label": "Website", "renderAs": "row", "filterable": false }
  ]'::jsonb
where id = 'mikvah';
