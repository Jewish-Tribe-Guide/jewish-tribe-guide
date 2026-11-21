# Backups and getting things back

Written Nov 20 2026 (the health sweep). Before this, nothing in the repo
said how to get the site's data back, and nothing made a copy of it outside
Supabase.

## The two copies

1. **Supabase's own backups**, inside the Supabase account. The first way
   back for the database. What exists depends on the plan, so check it
   (below). They hold the database only. Photos, logos and uploads live in
   Storage, and a database backup records their names, not the files.
2. **Our own copy**, on your machine, made by `scripts/backup.mjs`. Every
   table as JSON plus every stored file. It only reads, so it's safe to run
   against live:

   ```bash
   npm run backup -- --prod
   ```

   Takes a couple of minutes. It lands in `backups/prod-<project>-<time>/`,
   which git ignores. It holds private rows (submissions, admin and
   subscriber emails), so keep it on an encrypted disk and don't share it.
   Run it weekly, and always before a change to live data.

## What to check in Supabase (once, then when the plan changes)

In the live project's dashboard, **Database → Backups**:

- Which plan the project is on, and whether daily backups are listed
  there. If none are listed, our own copy is the only one.
- How many days they go back.
- Whether **Point in Time Recovery** is on. It lets you restore to a
  given minute rather than last night, and is a paid add-on.

Then tell Claude what you found, so this file can say it.

## Getting things back

Any restore to live is a write to production: Claude asks first, every
time (`AGENTS.md`).

- **Something went wrong in the last day or so, across the board**:
  restore from Supabase's backups (Database → Backups → Restore). It
  replaces the whole database with that day's copy, and the site is down
  while it runs. Anything since that copy is lost, so take our own copy
  first if the database is still readable.
- **One listing, page or setting was changed or deleted by mistake**:
  find it in our latest copy (`tables/<table>.json`) and put that one row
  back. Claude writes a small script for it, runs it on dev first, and
  shows you what it will change on live before it runs.
- **A photo or logo is gone**: it's in our copy's `storage/<bucket>/`,
  under the same path. Upload it back to the same path in Storage.

- **The whole Supabase project is gone** (or its backups can't be used):
  rebuild it from our copy into a new project.
  1. Make a new Supabase project.
  2. Run every file in `supabase/migrations/` in its SQL editor, in order.
     They rebuild every table (tried Nov 21: all 104 ran clean on a fresh
     Postgres 17).
  3. Put the copy in, rows and files:

     ```bash
     RESTORE_URL=https://<new>.supabase.co RESTORE_KEY=<its service role key> \
       node --env-file=.env.local scripts/restore.mjs backups/prod-<ref>-<time> --replace
     ```

     `--replace` empties the few tables the migrations fill themselves
     (community, eruv, page, watch, content_stamp) first; the copy is the
     truth. It won't run against the project the copy came from or live.
     Rows that name a photo by the old project's address are pointed at
     the new one.
  4. In Vercel, point `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     and `SUPABASE_SERVICE_ROLE_KEY` at the new project, and redeploy.
  5. Set up sign-in again in the new project's Authentication settings:
     the site's address as the redirect, and Google sign-in if it's used.
     Admins' accounts aren't in the copy and don't need to be: a magic
     link makes one on first sign-in, and who is an admin is in the
     `community` rows, which are.

After any restore, run `POST /api/admin/revalidate` (or redeploy). A write
straight to the database skips the cache refresh every admin save does, so
the site would keep showing the old copy for up to a day.

## Not done yet

- **The drill (Nov 21)**: the first live copy (Nov 21, 05:33 UTC) was
  restored into a throwaway Postgres 17 with PostgREST in front, built from
  the migrations folder alone. Every table came back with exactly the
  copy's count (29 tables, 3,901 rows), and the site ran on it: home,
  Food (74 places), Synagogues. What it found:
  - Migration 045 needs `pgcrypto`, which Supabase has on every project
    and a bare Postgres doesn't. Nothing to do on Supabase.
  - A copy older than the newest migration has a column the new project
    doesn't (`contribution_note`, dropped by 106). The restore leaves such
    a column out and says whether any row held something in it.
  - Live has `site_settings.map_zoom_radius_miles`, which no migration
    makes: left from before the setting moved to the Map category
    (`category.map_zoom_radius_miles`, migration 029, which the code
    reads). Empty in every row. Migration 107 drops it.
  - Not tried: files (the drill had no Storage; the copy's 186 files are
    all there and none is empty) and sign-in (no Auth). A real Supabase
    project would cover both.
- Nothing runs the copy on a schedule. It's a command someone has to
  remember.
