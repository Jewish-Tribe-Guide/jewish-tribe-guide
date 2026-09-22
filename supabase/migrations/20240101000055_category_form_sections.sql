-- ─────────────────────────────────────────────────────────────────────────────
-- Admin-defined groups for the intake/edit form's optional fields — see
-- CategoryFormSection / CategoryField.formSection in src/lib/categories.ts.
--
-- A field the admin hasn't assigned to a section (or hasn't set formSection
-- at all) falls into a single generic "More details" catch-all in the form
-- instead — this column only needs to exist for a category to get its own
-- named, independently-collapsible groups (e.g. "Kosher details", "Store
-- type and delivery") in place of that catch-all. Null/empty array means
-- "no real sections defined yet", not an error — every category behaves
-- exactly as before this column existed until an admin (or an ops migration
-- like this one) sets it.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists form_sections jsonb;
