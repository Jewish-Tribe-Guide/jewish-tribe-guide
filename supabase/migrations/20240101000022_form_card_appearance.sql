-- ─────────────────────────────────────────────────────────────────────────────
-- Adds icon + optional photo background/text color for a form's home-screen
-- card (run in Supabase SQL editor, after category_card_image.sql) — the same
-- fields categories already have, now for Patient & Family Support, Volunteer
-- for Patients, and any custom form. Goes through the existing draft/publish
-- flow: the `draft` column is a jsonb blob that already carries whatever
-- shape the client sends, so only the published columns need adding here.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "form" add column if not exists icon text;
alter table "form" add column if not exists card_image_url text;
alter table "form" add column if not exists card_text_color text;
