-- Feedback's heading and thank-you words (board Feedback, Nov 15 2026): the
-- drawn words become the defaults. Both stay admin-editable (Feedback in the
-- admin's Settings); only a row still holding the old default is changed,
-- so words an admin wrote are kept.
--
-- Run in the Supabase SQL editor. Without it the site works as before and
-- shows the old words.

alter table public.site_settings alter column feedback_heading set default 'Feedback';
alter table public.site_settings alter column feedback_success_message set default 'We read every note. If you left an email, we’ll write back.';

update public.site_settings set feedback_heading = 'Feedback'
  where feedback_heading = 'Send feedback';
update public.site_settings set feedback_success_message = 'We read every note. If you left an email, we’ll write back.'
  where feedback_success_message = 'We appreciate your feedback and will take it into account.';
