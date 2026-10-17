# Where things stand

The running list of what's outstanding, kept in the repo so it survives a
change of Claude account (artifacts and Claude's own notes stay with the old
account). Update it in the same commit as the work that changes it.

Last updated: Oct 17, 2026 (evening).

## The branch

All of the redesign is on `redesign/map-google-sizes`, pushed. It is about
580 commits ahead of `main`, which is what the live site runs (main was last
merged Sep 14). Nothing below reaches the live site until this branch is
merged.

The user checks work on each commit's Vercel preview, on their phone. The
preview reads the **dev/test database**, not the live one, so its numbers
differ (150 places there, 155 live). A tab opened before a deploy keeps the
old code until it's closed and reopened.

## Waiting for a yes to change the live site

The rule (AGENTS.md): nothing is written to the live database without a yes
for that exact change, in the same conversation. Show the dry run first.

1. **Philly Synagogues:** add the "Minyan" yes/no field, and rename the
   category "Shuls & minyanim".
2. **The hospitals' Refuah watches on the live site** (after the merge, and
   after the hospital fields from Oct 6 are set up on the live Hospital
   category; until then the watch has no fields to compare and files
   nothing). Seven website watches, one per hospital, each tied to its
   listing, on `refuah.com/hospitals/<id>` (the live listings' Refuah links
   already point there). Added on the dev/test database Oct 17. Two of the
   seven (Penn Presbyterian, Pennsylvania Hospital) have nothing on Refuah.

## For the user or the community

3. **Confirm the 23 live places with no date.** They say "Not confirmed by
   anyone yet": 5 cemeteries, all 8 Networking groups, 2 WhatsApp groups, 3
   mikvahs (Ohel Leah, Mei Shalva, Moishe Zvi), 4 restaurants (The Kosher
   Grill, Chalavita, The Brazilian BBQ, Zevi's Bakery) and CKids. Once all
   are dated, the home's trust line says "155 places · every listing dated"
   by itself, and the sheet says "where and when it was last checked"
   instead of "if and when".

## Getting the branch live

4. **Merge `redesign/map-google-sizes` into `main`.** Until then the Keystone
   K check, the eruv status reads, the Refuah watch and the "From …" dates
   don't run on the live site, so the trust sheet can name only Google there.
   The live Keystone-K watch row exists (since Oct 5) but has never run:
   `main` has neither its code nor its daily schedule. Its first live run
   will file about 34 suggestions at once (dev's first run, Oct 17: levels
   the guide lacks, one moved Keystone page, 4 places off the list, 10 on
   it but not in the guide) and email the admins one digest.
5. **Check the live database has every migration first.** Tables and columns
   through 081 are there (checked Oct 17). Not yet checked: 077 (eruv
   suggestions, a database rule) and 082 (confirming a contact box, a
   database function). Then deploy, verify, and only then any content that
   needs the new code.

## Small open decisions

6. The "+" button covers part of the third tile in a row on the phone home.
7. **Keep the preview's checks current?** Scheduled jobs run only on the
   production deployment, so on the dev/test database (what the previews
   read) Google's check and the watches run only when someone runs them.
   They were run by hand Oct 17, so the preview's trust sheet names Google
   and Keystone-K until about Oct 24, then only the eruv again. A daily
   GitHub Actions schedule against the test database would keep them; the
   Google part costs Places calls (about what the live site's nightly run
   costs).

## Done Oct 17

- **Shorter search hint, live:** `site_settings.search_placeholder` is "Ask:
  challah, pizza open now" on both databases (the user's yes, Oct 17; was
  "Search — kosher food, mikvah, shuls, schools…"). The live site shows it
  after its cache refreshes: any save in Admin, or by itself within a day.
- **Every dated line says where it came from.** An approved change from a
  named outside source (Keystone-K's list, Refuah) dates the listing "From
  Keystone-K's list, Oct 12" (`details.confirmedFrom`); a person's later
  confirmation is "Confirmed" again. Eruv lines: "From centercityeruv.com,
  1:25 PM". Google keeps its own line. Changes approved before Oct 17 still
  say "Confirmed".
- **Refuah watch.** Refuah's pages build in the browser, so the watch reads
  the public data service the page calls (`hospitals:getWithReferences`).
  If Refuah renames that, the watch shows as not working and the admin is
  emailed; nothing wrong is filed.
- **Maps key in CI:** repo secrets `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and
  `_MAP_ID`, passed to the e2e and prod-smoke builds.

## Decided, so not to reopen

- **Phone home order:** trust line, search, Right now, tiles. Search stays
  right under the trust line.
- **Trust line stays two lines** ("Kept up by the community" over "155
  places · …"); the one-line version was tried and not taken (Oct 17).
- **Tiles: one grid, no group headings, every category** (Oct 17). Under
  headings, groups of one or two left tiles alone in a row. No "Also:" line.
- **Right now:** on a weekday, what's open in Food and Grocery (Grocery says
  how many kosher items are tracked); on Friday, the candles card with the
  eruvim's status on it and Before candles; on Shabbos, the card with the
  eruvim. Never weekday minyanim.
- **Trust sheet ("How this guide stays right"):** the idea in three lines,
  each source named only once its check ran that week.
- **Search box** on the phone home is the category pages' blue-edged box.
- **Try asking keeps the minyan questions** (Oct 17). On a phone, up to six
  in one row that swipes sideways, running to the screen's edge so the last
  one shows cut off; a computer shows the three that fit.
- **What changed / "what's happening in Philly"** stays off the phone home
  until the activity log has real traffic.
