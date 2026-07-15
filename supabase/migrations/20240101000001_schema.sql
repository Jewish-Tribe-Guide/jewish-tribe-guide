-- ─────────────────────────────────────────────────────────────────────────────
-- Jewish Patient Connect — resource directory schema (run in Supabase SQL editor)
--
-- Design notes:
--   • One generic `resource` table for ALL directory categories (grocery,
--     restaurant, hotel, mikvah, dentist, car_repair, …). Category-specific
--     fields live in the `details` JSONB blob, so adding a new category needs
--     NO migration — only a config entry in the app's categories.ts.
--   • Every submittable thing shares one lifecycle: pending → approved → rejected.
--     The public site only ever renders `approved` rows.
--   • Tags are a general-purpose faceting system (kosher products first, but also
--     usable for languages, insurance, amenities later). Associations between a
--     resource and a tag are themselves moderated via `resource_tag.status`.
--   • All writes happen server-side via the service-role key (Next.js route
--     handlers), which bypasses RLS. RLS below is a defense-in-depth backstop so
--     the public anon key can only ever read approved content.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Resources ────────────────────────────────────────────────────────────────
create table if not exists resource (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,                 -- 'grocery' | 'restaurant' | 'dentist' | …
  name         text not null,
  hospital_id  text not null,                 -- matches the ids in src/data/hospitals.js
  distance     numeric,                       -- miles from the hospital
  address      text,
  phone        text,
  details      jsonb not null default '{}'::jsonb,  -- category-specific fields
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  submitted_by jsonb,                         -- { name, email } of the submitter (optional)
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);

create index if not exists resource_status_idx      on resource (status);
create index if not exists resource_category_idx     on resource (category);
create index if not exists resource_hospital_id_idx  on resource (hospital_id);

-- ── Tags (controlled vocabulary) ─────────────────────────────────────────────
create table if not exists tag (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,            -- 'kosher-cheese'
  label      text not null,                   -- 'Kosher Cheese'
  "group"    text not null default 'general', -- 'kosher_product' | 'language' | …
  created_at timestamptz not null default now()
);

create index if not exists tag_group_idx on tag ("group");

-- ── Resource ↔ Tag (moderated many-to-many) ──────────────────────────────────
-- e.g. "Kosher Mart (resource) carries Kosher Cheese (tag)" — pending until approved.
create table if not exists resource_tag (
  id           uuid primary key default gen_random_uuid(),
  resource_id  uuid not null references resource (id) on delete cascade,
  tag_id       uuid not null references tag (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  submitted_by jsonb,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  unique (resource_id, tag_id)
);

create index if not exists resource_tag_resource_idx on resource_tag (resource_id);
create index if not exists resource_tag_tag_idx      on resource_tag (tag_id);
create index if not exists resource_tag_status_idx   on resource_tag (status);

-- ── Row-Level Security (backstop; server uses service-role and bypasses this) ─
alter table resource     enable row level security;
alter table tag          enable row level security;
alter table resource_tag enable row level security;

-- Public anon key may read ONLY approved content. No public insert/update/delete:
-- all writes go through server route handlers using the service-role key.
create policy "public reads approved resources"
  on resource for select using (status = 'approved');

create policy "public reads tags"
  on tag for select using (true);

create policy "public reads approved resource_tags"
  on resource_tag for select using (status = 'approved');
