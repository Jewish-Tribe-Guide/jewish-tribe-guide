-- Hospitals as data, not code. The patient module (map pins, "About Your
-- Hospital", volunteer/support forms) previously read a hardcoded array; this
-- table lets a community edit them without touching the codebase. The rich
-- per-hospital "Jewish life" details live in the `info` jsonb column.
create table if not exists hospital (
  id          text primary key,
  name        text not null,
  latitude    double precision not null,
  longitude   double precision not null,
  timezone    text not null,
  sort_order  int not null default 0,
  info        jsonb
);

create index if not exists hospital_sort_idx on hospital (sort_order, name);

alter table hospital enable row level security;
create policy "public reads hospitals" on hospital for select using (true);
