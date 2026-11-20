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

After any restore, run `POST /api/admin/revalidate` (or redeploy). A write
straight to the database skips the cache refresh every admin save does, so
the site would keep showing the old copy for up to a day.

## Not done yet

- A restore has never been tried. The honest test is to load a copy into a
  throwaway Supabase project and open the site against it.
- Nothing runs the copy on a schedule. It's a command someone has to
  remember.
