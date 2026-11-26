-- The community email (Nov 25 2026, boards E1-E3): one Gmail that belongs
-- to the guide, not to any one admin. Replies to the site's emails go to it
-- (confirmationEmail.ts), and it is the inbox the newsletter script reads
-- the shuls' and eruvs' emails from.
--
-- Until this runs, the code reads the Gmail the newsletter script last said
-- it runs in (newsletter_setup.account), then the first admin, as before.
-- Safe before or after the deploy.

alter table public.community add column if not exists contact_email text;

insert into public.migration_ran (name) values ('20240101000116_community_email') on conflict (name) do nothing;
