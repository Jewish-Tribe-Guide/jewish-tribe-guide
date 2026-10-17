# Where things stand

The running list of what's outstanding, kept in the repo so it survives a
change of Claude account (artifacts and Claude's own notes stay with the old
account). Update it in the same commit as the work that changes it.

Last updated: Oct 17, 2026.

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

1. **Shorter search hint.** The user said "let's shorten search" (Oct 17).
   Live today: "Search — kosher food, mikvah, shuls, schools…", cut off on
   phones. Proposed: "Ask: challah, pizza open now" (already set on the
   dev/test database). It's `site_settings.search_placeholder`, also the
   Site tab's "Search placeholder", and desktop shows it too. Needs the
   exact wording confirmed, then a cache refresh after the write (or the
   user changes it in Admin → Site, which refreshes on its own). Note: the
   live site's older search may not answer "pizza open now" as well as
   this branch does; doing it at the merge avoids that.
2. **Philly Synagogues:** add the "Minyan" yes/no field, and rename the
   category "Shuls & minyanim".

## For the user or the community

3. **Confirm the 23 live places with no date.** They say "Not confirmed by
   anyone yet": 5 cemeteries, all 8 Networking groups, 2 WhatsApp groups, 3
   mikvahs (Ohel Leah, Mei Shalva, Moishe Zvi), 4 restaurants (The Kosher
   Grill, Chalavita, The Brazilian BBQ, Zevi's Bakery) and CKids. Once all
   are dated, the home's trust line says "155 places · every listing dated"
   by itself, and the sheet says "when it was last checked" instead of "if
   and when".

## Getting the branch live

4. **Merge `redesign/map-google-sizes` into `main`.** Until then the Keystone
   K check and the eruv status reads don't run on the live site, so the
   trust sheet can name only Google there.
5. **Check the live database has every migration first.** Tables and columns
   through 081 are there (checked Oct 17). Not yet checked: 077 (eruv
   suggestions, a database rule) and 082 (confirming a contact box, a
   database function). Then deploy, verify, and only then any content that
   needs the new code.

## To build next

6. **Say where each fact came from** on every "last checked" line, not just
   Google's: "From the Keystone K's list, Oct 12", "From centercityeruv.com,
   1:25 PM", "From Refuah, Oct 6". Today a Keystone change approved by an
   admin says only "Confirmed Oct 12". The trust sheet's third line becomes
   "Every fact says where and when" once this is done.
7. **Watch the hospitals' Refuah pages** for changes (a `website` watch, the
   same mechanism as the Keystone K list). The hospital details were copied
   from Refuah once, on Oct 6, and nothing reads Refuah again.

## Small open decisions

8. The Try buttons under search still suggest minyanim ("Next Mincha",
   "Next Shacharis"). Leave minyanim out, since weekday minyanim don't drive
   this community?
9. The "+" button covers part of the third tile in a row on the phone home.
10. Optional: add a Google Maps key to CI, so the desktop map is tested with
    a real map.

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
- **What changed / "what's happening in Philly"** stays off the phone home
  until the activity log has real traffic.
