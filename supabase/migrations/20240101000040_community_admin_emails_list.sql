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
-- notify_emails is a second, independent list — who gets emailed about a
-- new submission. Defaults empty, which src/lib/email.ts reads as "same as
-- admin_emails": most communities want their admins to see new submissions,
-- but the two shouldn't be forced to be identical (an admin who doesn't
-- want inbox alerts, or a notify-only address that isn't a real admin).
--
-- admin_email itself is left in place, unused by new code, rather than
-- dropped — it still holds real data for existing communities and this
-- migration backfills it into admin_emails below; nothing depends on
-- removing it yet, and doing that now would be pure risk for no gain.
-- ─────────────────────────────────────────────────────────────────────────────

alter table community add column if not exists admin_emails text[] not null default '{}';
alter table community add column if not exists notify_emails text[] not null default '{}';

update community
set admin_emails = array[admin_email]
where admin_email is not null and trim(admin_email) <> '' and admin_emails = '{}';
