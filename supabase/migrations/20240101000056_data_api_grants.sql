-- Supabase is removing the automatic default privileges that used to make every
-- new table reachable through the Data API (PostgREST) as soon as it was
-- created. From 2026-10-30, a table with no explicit GRANT is invisible to the
-- API even though RLS is enabled and correct — this backfills the grants the
-- existing production project already has implicitly, so replaying these
-- migrations against a fresh database (new community project, a recreated
-- TEST_SUPABASE_* project, a preview branch) keeps working. RLS policies on
-- each table remain the real access control; these grants only open the door
-- PostgREST checks first.

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'campaign_banner',
      'category',
      'community',
      'form',
      'form_response',
      'home_section',
      'hospital',
      'page',
      'resource',
      'resource_tag',
      'site_settings',
      'submission',
      'subscriber',
      'tag',
      'vote'
    ])
  loop
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- submission.case_number is a bigserial, so inserting into it needs USAGE on
-- its sequence too — a table-level grant alone doesn't cover that.
grant usage, select on sequence public.submission_case_number_seq to authenticated;
grant usage, select on sequence public.submission_case_number_seq to service_role;
