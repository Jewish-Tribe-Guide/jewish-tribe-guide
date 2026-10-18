# Where things stand

The running list of what's outstanding, kept in the repo so it survives a
change of Claude account (artifacts and Claude's own notes stay with the old
account). Update it in the same commit as the work that changes it.

Last updated: Oct 17, 2026 (evening).

## The branch

The redesign was merged into `main` on Oct 17 at 7:24 PM (#322, at
7d5fead6) and is live. Later work is on `redesign/map-google-sizes` until
the next merge.

The user checks work on each commit's Vercel preview, on their phone. The
preview reads the **dev/test database**, not the live one. A tab opened
before a deploy keeps the old code until it's closed and reopened.

**Preview and live differed by their databases, not code** (compared table
by table, Oct 17). The redesign's setup was built on the dev database and
never copied to the live one. **Copied Oct 17 with the user's yes** (group
A, 25 rows, backup kept): hospital and hotel boxes and "Within a walk",
Food's Main dishes, form sections and question card, WhatsApp off the map,
descriptions in headers (WhatsApp, Networking, Cemetery), shuls not grouped
by denomination, Grocery's "Kosher Type", phone tabs Home · Map · You and
You in the desktop menu, the desktop home order, five category card images
(copied into live storage). The live site shows it after any admin save
(Admin → Site → Save) or within a day.

Still different, each needing the user:

- **Group B, which side is right:** Cemetery (dev renamed it "Cemetery" and
  dropped its Cemetery/Funeral Home type; live has funeral homes), the
  Mikvah pin colour (live blue #1544ab, dev magenta #a11956), the hero and
  desktop wording (they differ; recommend keeping live's), the logo (live's
  is newer; keep).
- **Listing edits made on the preview, dev only:** main dishes and menus at
  six food places (Charlie was a sinner, Sweet Box, Bar Bombón, HipCityVeg,
  Say She Ate), the hospitals' Refuah contacts (the boxes stay hidden on
  live until these are there), minyanim at Mikveh Israel and Mekor
  Habracha, grocery items at GIANT, Costco, ShopRite and Trader Joe's,
  levels at Lipkin's, Sweet Box and Montefiore, Ohel Leah's keilim note,
  Hampton Inn's photo.
- **Dev is behind live:** 12 listings are only on live (Zevi's Bakery,
  cemeteries, schools). Dev writes need no yes.

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

3. **Seven live places still have no date, on purpose.** On Oct 17 (the
   user's yes) every other approved live listing with no confirmation was
   stamped confirmed (80 of them, `confirmedAt` 2026-10-18T00:00Z, backup in
   that session's scratchpad), so they show "Confirmed Oct 17" and are asked
   "Still right?" after 90 days. Held back because something is known to be
   wrong: Shtetl, The Brazilian BBQ and Rita's at Roosevelt Mall (off
   Keystone-K's list), New York Bagel Bakery and Rita's at 1709 Grant Ave
   and 2124 South St (Google: closed temporarily), Sababa Falafel (bad place
   id). Fix or remove each; until all are dated the trust line keeps "if
   and when".

## Getting the branch live

4. **Merged Oct 17.** The live Keystone-K watch's first run (07:00 UTC
   daily) will file about 34 suggestions at once and email the admins one
   digest. The test project's daily watch run is on `main` now too.
5. **Check 077 and 082 on the live database, now that the code is live.**
   Tables and columns through 081 are there. 077 (eruv suggestions, a
   database rule) and 082 (confirming a contact box, a database function)
   can't be seen through the API: without them a public eruv suggestion
   fails to send and Yes under a contact box says "Didn't save". 067's
   columns (Today) are missing too, harmless while Today is held back.

## Small open decisions

6. The "+" button covers part of the third tile in a row on the phone home.

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
- **The preview's watches run daily** (the user, Oct 17: watches yes,
  Google's check no, since it costs Places calls).
  `.github/workflows/test-watches.yml` runs `scripts/run-test-watches.mts`
  against the test database at 07:30 UTC: Keystone-K's list and the Refuah
  pages, no Google calls, no emails. GitHub runs schedules only from
  `main`, so the daily run starts with the merge. Until then the preview's
  trust sheet names Keystone-K until about Oct 24 (run by hand Oct 17), and
  Google's line goes when its Oct 17 run is a week old; Google's check on
  the preview stays a by-hand thing. A new place on Keystone-K's list is
  filed there saying "Google wasn't asked whether it's still open".
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
