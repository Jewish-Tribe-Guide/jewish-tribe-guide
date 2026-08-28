-- ─────────────────────────────────────────────────────────────────────────────
-- A category owns its colour.
--
-- Until now it didn't. The colour was derived at render time from the
-- category's POSITION in the active list sorted alphabetically by plural
-- label: the Nth category got PALETTE[N % 20]. Nothing was stored, so the
-- colour was a property of the list rather than of the category, and every one
-- of these silently reassigned it:
--
--   * renaming a category, which moves it alphabetically — and shifts the
--     colour of every category it jumped over
--   * hiding or unhiding one, which adds or removes a position
--   * adding one
--   * running against a different database — production and the disposable
--     test project have different category lists, so the same code drew
--     different coloured pins in each
--
-- Colour is doing identity work on the map (teal means Grocery), and identity
-- must not move because something unrelated was renamed.
--
-- The backfill below reproduces exactly what the positional rule computes
-- today, so the day this ships nothing changes colour. From then on the value
-- is stored, editable in the category editor, and stays put.
--
-- Kept nullable rather than NOT NULL: a null means "no colour chosen", and
-- getCategoryColor falls back to the positional rule for it. That keeps a
-- brand-new category — created after this migration, with nothing in the
-- column — behaving as it does today instead of rendering an invisible pin.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category
  add column if not exists pin_color text;

-- The same twenty colours, in the same order, as PALETTE in
-- src/lib/categoryColor.ts. Duplicated here rather than imported because a
-- migration is SQL; categoryColor.test.ts asserts the two lists agree.
--
-- row_number() over (order by plural_label) reproduces the render-time
-- ordering (listCategories sorts by plural_label ascending). Active rows are
-- numbered first, so their colours match precisely what is on screen now;
-- inactive rows continue the numbering afterwards, so they hold a sensible
-- colour if they are ever switched back on.
with palette as (
  select array[
    '#2657bf','#2c8c47','#7a36bf','#c55526','#257d96',
    '#b63167','#ad7c29','#423fb8','#267e75','#5d8d28',
    '#a11956','#9a6a0d','#352ba4','#076c64','#4c7b0d',
    '#1544ab','#117a36','#691fab','#b1420c','#056b84'
  ] as colors
),
ordered as (
  select
    id,
    community_id,
    row_number() over (
      partition by community_id
      order by (case when active then 0 else 1 end), plural_label
    ) - 1 as idx
  from category
)
update category c
   set pin_color = (select colors[(o.idx % 20) + 1] from palette)
  from ordered o
 where c.id = o.id
   and c.community_id = o.community_id
   and c.pin_color is null;
