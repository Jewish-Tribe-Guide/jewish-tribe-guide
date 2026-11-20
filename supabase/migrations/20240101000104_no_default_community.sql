-- No community by default (Nov 20 2026, the health sweep).
--
-- Migration 027 gave community_id a default of 'philly' on nine tables, so
-- an insert that forgot to say which community still worked while Philly
-- was the only one. It said to drop the default once a second community
-- existed: from then on, a forgotten community is a row filed silently
-- under Philly. There are four now.
--
-- Without it, such an insert fails loudly instead (community_id is not
-- null). Every insert in the site names its community; the setup and
-- import scripts do too since this change (scripts/seedCommunity.mjs).
-- src/test/noDefaultCommunity.test.ts fails if a later migration puts a
-- default back.
--
-- Run in the Supabase SQL editor, dev then live, after the deploy that
-- carries it. Safe to run twice.

do $$
declare t text;
begin
  foreach t in array array[
    'resource', 'category', 'form', 'home_section', 'site_settings',
    'submission', 'form_response', 'hospital', 'tag'
  ] loop
    if to_regclass(t) is not null then
      execute format('alter table %I alter column community_id drop default', t);
    end if;
  end loop;
end $$;
