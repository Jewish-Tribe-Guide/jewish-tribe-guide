-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic vote toggle.
--
-- toggleVote used to be select → insert-or-delete → count: three round trips,
-- with a window between the select and the write where two fast taps (or two
-- tabs) could both see "not voted" and both insert, surfacing as a primary-key
-- violation. One function, one statement's worth of work, one round trip.
--
-- Concurrent toggles can't error any more (the insert is ON CONFLICT DO
-- NOTHING); at worst two simultaneous taps both report voted=true and leave a
-- single vote, which is the same state either serial order would reach.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function toggle_vote(p_resource_id uuid, p_token text)
returns table (voted boolean, vote_count bigint)
language plpgsql
as $$
declare
  removed int;
begin
  delete from vote where resource_id = p_resource_id and voter_token = p_token;
  get diagnostics removed = row_count;

  if removed = 0 then
    insert into vote (resource_id, voter_token) values (p_resource_id, p_token)
    on conflict do nothing;
  end if;

  return query
    select removed = 0, (select count(*) from vote where resource_id = p_resource_id);
end;
$$;

-- Server-only, like the table itself (service-role key).
revoke execute on function toggle_vote(uuid, text) from public, anon, authenticated;
