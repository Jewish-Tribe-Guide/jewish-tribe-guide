-- ─────────────────────────────────────────────────────────────────────────────
-- Data-driven intake forms (run in Supabase SQL editor, after category_capabilities.sql).
--
-- Moves the guided "Request support" / "Volunteer" wizards out of code and into
-- the database, so an admin can add/reorder/retitle questions from /admin
-- without a deploy. `title`/`submit_label`/`success_title`/`success_message`/
-- `steps` are what the live wizards render right now. `draft` holds a complete
-- in-progress copy of those same fields (FormDraft — see src/lib/forms.ts)
-- while an admin is editing, so the preview can run the real Wizard component
-- against it and nothing reaches a real patient or volunteer until published.
--
-- After running this DDL, seed the two built-in forms with:
--   node --env-file=.env.local scripts/seed-forms.mjs
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists form (
  id               text primary key,          -- 'support' | 'volunteer'
  title            text not null,
  submit_label     text not null default 'Submit',
  success_title    text not null default 'All set',
  success_message  text not null default '',
  steps            jsonb not null default '[]'::jsonb,  -- FormStep[] — published, live
  draft            jsonb,                                -- FormDraft | null — unpublished edits
  updated_at       timestamptz not null default now()
);

-- Forms are public reference data — the live wizards read the published steps
-- directly (no auth), same as `category`.
alter table form enable row level security;
create policy "public reads forms" on form for select using (true);
