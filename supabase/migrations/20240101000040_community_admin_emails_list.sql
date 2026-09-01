-- ─────────────────────────────────────────────────────────────────────────────
-- A community can now have several admins, not one shared login.
--
-- admin_email (singular) meant every community's console was either wide
-- open (unset, falls back to the superadmin list) or locked to exactly one
-- shared address — e.g. a Gmail inbox several people's real logins had to
-- funnel through. admin_emails is a real per-person allowlist instead: each
-- listed address signs in as itself, with its own audit trail, and losing
-- access to one no longer means losing access to all of them.
--
-- notify_on_submission is a plain on/off switch, not a second list: whether
-- a new submission emails the community's own admin_emails (or the global
-- NOTIFICATION_TO fallback if that's empty too). Started as a separate
-- notify_emails list — genuinely more flexible, but flexibility nobody
-- asked for; a yes/no toggle is what was actually wanted, so that's what
-- this ships as instead of building the more complicated thing "just in
-- case". Defaults true — every community wants submission alerts until it
-- says otherwise.
--
-- admin_email itself is left in place, unused by new code, rather than
-- dropped — it still holds real data for existing communities and this
-- migration backfills it into admin_emails below; nothing depends on
-- removing it yet, and doing that now would be pure risk for no gain.
-- ─────────────────────────────────────────────────────────────────────────────

alter table community add column if not exists admin_emails text[] not null default '{}';
alter table community add column if not exists notify_on_submission boolean not null default true;

update community
set admin_emails = array[admin_email]
where admin_email is not null and trim(admin_email) <> '' and admin_emails = '{}';
