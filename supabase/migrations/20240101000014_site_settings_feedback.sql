-- ─────────────────────────────────────────────────────────────────────────────
-- Site settings: feedback form fields (run in Supabase SQL editor, after
-- site_settings.sql).
--
-- Makes the footer's "Send feedback" button/form admin-editable — it can be
-- turned off entirely, and its button label, modal heading, and success
-- message can be customized, same as the rest of site_settings. See
-- src/lib/siteSettings.ts.
-- ─────────────────────────────────────────────────────────────────────────────

alter table site_settings add column if not exists feedback_enabled boolean not null default true;
alter table site_settings add column if not exists feedback_button_label text not null default 'Have general feedback about the site? Send a note';
alter table site_settings add column if not exists feedback_heading text not null default 'Send feedback';
alter table site_settings add column if not exists feedback_success_message text not null default 'We appreciate your feedback and will take it into account.';
