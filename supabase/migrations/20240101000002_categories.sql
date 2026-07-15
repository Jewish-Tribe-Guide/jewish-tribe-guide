-- ─────────────────────────────────────────────────────────────────────────────
-- Data-driven categories (run in Supabase SQL editor, after schema.sql).
--
-- Moves category definitions out of code and into the database, so approving a
-- public "add a category" submission can create a category that appears on the
-- site immediately. `fields` holds the category-specific field definitions plus
-- presentation hints (renderAs / filterable) used by the generic card renderer.
--
-- After running this DDL, seed the four built-in categories with:
--   node --env-file=.env.local scripts/seed-categories.mjs
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists category (
  id           text primary key,          -- slug, e.g. 'grocery', 'dentist'
  label        text not null,             -- singular, e.g. 'Grocery Store'
  plural_label text not null,             -- e.g. 'Grocery Stores'
  icon         text not null default '📋',
  description  text not null default '',
  fields       jsonb not null default '[]'::jsonb,  -- CategoryField[] (+ hints)
  sort_order   int not null default 100,
  created_at   timestamptz not null default now()
);

create index if not exists category_sort_idx on category (sort_order, label);

-- Categories are public reference data — anyone may read them.
alter table category enable row level security;
create policy "public reads categories" on category for select using (true);
