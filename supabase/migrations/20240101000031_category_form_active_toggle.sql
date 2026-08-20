-- ─────────────────────────────────────────────────────────────────────────────
-- Adds an "active" toggle to both category and form, so an admin can hide
-- either from the public site (and every direct link to it) without
-- deleting it — the row, its listings/responses, and its configuration all
-- stay intact for whenever it's turned back on. Defaults true so every
-- existing row stays visible exactly as it is today.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists active boolean not null default true;
alter table form add column if not exists active boolean not null default true;
