-- ─────────────────────────────────────────────────────────────────────────────
-- Custom forms (run in Supabase SQL editor, after form_responses.sql).
--
-- Admins can now create arbitrary forms (not just the fixed Support/Volunteer
-- pair) via the `form` table — see formStore.createForm. Each custom form's
-- responses need a stable grouping key that survives a title rename, so add
-- `form_id` (the form's own id, e.g. 'event-rsvp') alongside the existing
-- `request_type` (kept as a human-readable label — for a custom form this is
-- just the form's title at submission time, not one of the 5 fixed strings).
--
-- Built-in submissions (Direct Support / Volunteer / Volunteer Edit /
-- Volunteer Removal / Feedback) leave `form_id` null — they're not part of
-- the custom-forms system, and /inbox + the Feedback view in /admin filter on
-- `request_type` explicitly rather than on `form_id`.
-- ─────────────────────────────────────────────────────────────────────────────

alter table form_response add column if not exists form_id text;

create index if not exists form_response_form_id_idx on form_response (form_id, created_at desc);

-- request_type was closed to the 5 built-in strings; a custom form's title can
-- be anything, so it can no longer be a fixed enum. form_id (not request_type)
-- is now the reliable identity for grouping/filtering everywhere it matters.
alter table form_response drop constraint if exists form_response_request_type_check;
