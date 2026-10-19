# Where things stand

The running list of what's outstanding, kept in the repo so it survives a
change of Claude account (artifacts and Claude's own notes stay with the old
account). Update it in the same commit as the work that changes it.

Last updated: Oct 19, 2026.

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
  Say She Ate), minyanim at Mikveh Israel and Mekor
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
1a. **Watches on shuls' and mikvahs' own pages** (built Oct 19, see Done).
   None is on the live site. Dry run against live (reads only, Oct 19,
   `scripts/listing-pages-dry-run.mts`), what each would file the first
   time its page changes:
   - Mekor Habracha, mekorhabracha.org/davening: nothing differs.
   - B'nai Abraham Chabad, phillyshul.com/minyans: nothing differs.
   - Society Hill Synagogue, societyhillsynagogue.org/minyan: nothing.
   - Kol Tzedek, kol-tzedek.org/shabbat.html: "New: kabbalas shabbos ·
     Fri · 6:30pm" (the page: Friday services at 6:30pm, twice a month;
     the listing has no Friday time).
   - Temple Beth Zion-Beth Israel, bzbi.org/worship: "New: shacharis ·
     Shabbos · 9:30 AM" (the listing has no times); waits while its
     current queue suggestion is there.
   - Mikvah Mei Shalva (philamikvah.org/appointments), LMC Mikvah
     (lmcmikvah.org/appointments-and-membership), Ohel Leah
     (mikvahohelleah.org/make-an-appointment), Moishe Zvi
     (mikvahwestphilly.com): nothing differs.
   - Can't be read (blocked to servers): Lower Merion Synagogue, Sons of
     Israel (406), Chabad of the Main Line (403). Not worth a watch.
   Adding the nine readable ones is Admin → Watches → add the page, pick
   the listing, tick "It's the listing's own page…". Needs the user's yes.
## For the user or the community

2. **Every live place has a date** (checked Oct 17, 11 PM: 155 of 155).
   80 were stamped confirmed on Oct 17 with the user's yes (`confirmedAt`
   2026-10-18T00:00Z, backup in that session's scratchpad); the last
   undated one, The Brazillian BBQ (spelled so on live, off Keystone-K's
   list), was confirmed by someone that evening. The trust line now says
   "every listing dated" once the live cache refreshes (any admin save).
   Shtetl, Rita's, New York Bagel Bakery and Sababa Falafel are dated by
   Google's sync but still have the problems that held them back (off
   Keystone-K's list, closed temporarily, bad place id): fix or remove each.

## Getting the branch live

3. **Merged Oct 17.** The live Keystone-K watch's first run (07:00 UTC
   daily) will file about 34 suggestions at once and email the admins one
   digest. The test project's daily watch run is on `main` now too.
4. **Migration 083 (`confirmed_by_visitor`) is run on both databases**
   (the user, Oct 18): a visitor's Yes on a whole listing says "Confirmed
   by community".
   **Check 077 and 082 on the live database, now that the code is live.**
   Tables and columns through 081 are there. 077 (eruv suggestions, a
   database rule) and 082 (confirming a contact box, a database function)
   can't be seen through the API: without them a public eruv suggestion
   fails to send and Yes under a contact box says "Didn't save". 067's
   columns (Today) are missing too, harmless while Today is held back.
5. **Menu watches start on the live site Oct 18** (merged with #324, no
   migration). The first daily run, 07:00 UTC Oct 18, gives every live food
   place with a menu link a watch of its own (17 on Oct 18, created by "menu
   links" on the Watches tab) and only records each menu as it is. From
   then on a menu is read every morning for free; the AI (`OPENAI_API_KEY`)
   reads it only when its words change, at most 3 a run, and dishes the
   listing doesn't have wait on the Main dishes tab. Pausing one stops it;
   removing one brings it back the next morning. The test project's daily
   run makes the watches but never calls the AI.
6. **Shul newsletters** (built Oct 18 on `redesign/shul-newsletters`, not
   merged; no migration). The guide's Gmail (phillyjewishguide@gmail.com)
   is subscribed to shul newsletters. A Google Apps Script in that account
   (`scripts/newsletter-apps-script.js`) runs hourly: it asks the site for
   the newsletter senders on the Watches tab and sends only their new
   emails to `/api/inbound/newsletter` (since Oct 18, the user: "every email
   seems excessive"; it used to send the whole inbox and add each stranger
   as an unlinked row). The AI reads each for the shul's times, from the
   words or else its PDF or picture, and for anything it says about other
   places in the guide. It reads from the day the email was sent, so an old
   one's "this Shabbos" is never filed as next week's. Each change goes to
   the queue as "Shul newsletter (automated)", from "<shul>'s newsletter",
   and approving it dates the listing "Confirmed by <shul>". Each sender is
   a row on the Watches tab ("Newsletter from …"), added there by address
   with its shul; a new subscription is picked up on the next run, from the
   last two weeks. A paused one isn't sent. The daily watch run flags a
   newsletter that hasn't come in a month.
   **For the user:** `NEWSLETTER_SECRET` is in Vercel; redeploy Production
   so it applies (the 503 on Oct 18 was the old deployment). Once the
   senders-only change is live, paste the new script over the old one in
   script.google.com (the secret property and the hourly trigger stay),
   then run `readNewsletters` once.
6b. **Mekor Habracha watch** (built Oct 18 on
   `claude/unruffled-aryabhata-926203`, no migration; the comparison in 6a,
   made daily). A website watch on mekorhabracha.org/center-city is read
   by code, never the AI (`src/lib/mekorWatch.ts`, `mekorRun.ts`). It
   matches each Mekor place to a guide listing by its certificate link
   (Keystone-K's shared pages don't count), else by name and street number
   or phone, and files nothing when unsure. It never changes a listing: each
   difference goes to the queue as "Mekor Habracha list (automated)",
   quoting Mekor's entry: a place the guide lacks (Google is asked first,
   and a closed one is skipped; an archived one says so), a hechsher the
   guide shows that Mekor doesn't, or Mekor's other than Keystone-K, and
   an IKC place Mekor doesn't list (removing IKC, for a person to decide).
   Keystone-K is never added or taken off from here; Keystone-K's watch
   owns it. It never re-files what it filed before, approved or rejected,
   and skips places already in the queue from anyone. It files nothing if
   it reads fewer than 40 places.
   **Production dry run, Oct 18 (read-only): 18 suggestions**, as 6a,
   plus Primo Water Ice. Mekor's is in Cherry Hill, the guide's in Haddon
   Township, a different branch, so it's filed as new.
   On the test project the watch row exists and filed 15, and a second
   run filed nothing. Until this merges, the test project's daily run
   treats it as a plain website check.
   **Live on Oct 19** (the user's yes): the watch is on production's
   Watches tab as "Mekor Habracha kosher list". A dry run against
   production that day read 78 places and found 18 differences, one of
   them closed on Google (Z Candy Bar), so 17 to file. It was added
   straight to the database, so it didn't run at once: it files at the
   next daily run (07:00 UTC), or at once with Check now on the Watches
   tab. Its agreement dates listings only once `redesign/oct18-fixes` is
   deployed.

6a. **Mekor Habracha's kosher list** (mekorhabracha.org/center-city,
   78 places, "Last Updated 2026-10-12"; the user, Oct 18: stay in sync,
   and flag a hechsher we show that they don't). Compared with the live
   guide Oct 18, read-only:
   - **Every IKC place we list is on Mekor as IKC except two.** Zevi's
     Bakery: not on Mekor, but its own site says IKC. **Magical Sweet
     Shop: we say IKC, Mekor says Keystone-K, Keystone-K's list doesn't
     have it, its site says only "Certified Kosher".** Nothing records
     where our IKC came from (there since at least July), and its
     certificate link points at one of our own preview pages. Needs a
     person to find out (call 856-309-1100, or ask Mekor).
   - **On Mekor, not in the guide:** Cafe 613 at Temple Hillel, Shevy's
     Babka Paradise (Chabad at Penn; Spring Garden St), Z Candy Bar,
     Mike's Chicken (KCL, Lakewood delivery), La Chic N Sweet (Rabbi
     Amiram Gabbai, no address), Cinnaholic (Cherry-K; Mekor's address is
     Tasty Twisters'), Kosher Experience x2 (Cherry-K). Kosher Corner,
     Penn's kosher dining and the Brodsky Center are already in the live
     queue from Keystone-K's watch.
   - **Archived here, still on Mekor:** Shtetl, Rita's Roosevelt Mall,
     Nothing Bundt Cakes Springfield (none on Keystone-K's list now, so
     likely Mekor is behind), and PLNT Burger Jenkintown, which Mekor
     lists as IKC while ours said Keystone-K: may belong back, as IKC.
   - **Smaller:** Nothing Bundt Cakes Cherry Hill and Marlton are
     "Cherry-K" on Mekor, "Keystone-K" here (Keystone-K's list has both).
     Mekor calls Lipkin's "Best Cake Kosher Bakery" (same address, phone
     and Keystone-K page).
   A daily Mekor watch, shaped like Keystone-K's, is proposed as its own
   piece of work; its first run would file the above in the queue.

## Small open decisions

7. The "+" button covers part of the third tile in a row on the phone home.

## Done Oct 19 (on `claude/youthful-davinci-9f768f`, not merged)

- **A watch on a listing's own page** (from the parent session's brief,
  Oct 19): a shul's page of davening times, or a mikvah's page of hours,
  tied to its listing on the Watches tab (a tick box when adding; group
  "Shul and mikvah pages"). Read every morning; only when the page's words
  change does the AI read it (sharing the menu watches' 3 reads a run),
  and what differs goes to the queue as "Their website (automated)", noted
  "From their website, changed <date>", with the page beside it. Agreeing
  never dates the listing; the same suggestion is never filed twice; a
  listing with anything in the queue waits. Shuls use the schedule reader
  (usual times only, never one week's); mikvahs the any-field reader, hours
  only. What the live dry run taught it: a page's menus are dropped before
  reading; a time comes off only where the page gives that tefillah that
  day (Society Hill's Monday-minyan page); a time the listing already has
  that day isn't new, whatever its season or the name the AI gives it
  (Mekor's page gives both seasons); and the schedule reader now takes
  "around 15 minutes before sunset", "candle-lighting", "10 am", and a time
  given twice as one, which helps the paste box too.

## Done Oct 19, after #331 (merged in #332)

- **The usual times close the way they open** (the user, Oct 19: tapping
  anywhere opened them, only the arrow closed them). Opened, their whole
  top, title and "Not this week" line, folds them again.
- **This week's times keep the WhatsApp group.** A newsletter gives the
  times, not the group; each of the week's minyanim now takes the group of
  the usual minyan it stands in for (the same tefillah on that weekday,
  either season), in the week's box and on the Minyanim list.
- **The Minyanim list says "This week's times"** for a week that goes by
  its dates. It said "Shabbat Schedule times" on Mekor's weekday minyanim:
  that week was approved before weeks were named by their dates.
- **Why dates hadn't moved yet:** the dating went live with #331's deploy
  (Oct 19, 17:10 UTC), after that day's 07:00 run. Refuah agrees with five
  hospitals today, so they read "Confirmed by Refuah, Oct 20" after the
  next run; Penn Presbyterian and Pennsylvania Hospital have nothing on
  Refuah and keep theirs. The 20 places dated "Keystone-K's list" (older
  approvals) become "Keystone-K" as the watch dates them.

## Done Oct 19 (#331, merged)

- **A shul's week of newsletter times** (the user, Oct 19):
  - The usual box this week replaces folds **back** after it's opened
    (an up chevron beside its title).
  - Opened, it's a grey, dashed box with its times faded: still readable,
    plainly not this week's. The line saying why, and its Confirmed footer,
    stay at full strength.
  - "This week's schedule" ends in the usual "Confirmed by …, date" line
    with ✎ Edit, instead of "Posted Mon … Update their times".
  - That Edit opens this week's times in the same editor as the usual
    boxes, offering only the days the week covers. A changed row applies to
    that week's matching dates; the usual times aren't touched, and the
    queue shows the change like any other schedule edit.
- **Mekor's newsletter week** (the user, Oct 19: "it read the email as all
  for shabbos schedule"). The reading was right: one week, Sun Oct 18 to
  Friday night, weekday times and all. Two things around it were wrong:
  - It was named for the email's first heading, "Shabbat Schedule". A
    week's heading now names it only when the week is just a Shabbos;
    anything longer goes by its dates ("Oct 18–23"), when it's read and
    when it's shown, so the live post reads right with no data change.
  - Its Friday night folded the usual Shabbos times away, greyed, though
    Shabbos morning's still held. They fold now only for a week with
    Shabbos's own times.
  - One week per email, not a Shabbos post and a weekday post: decided.
- **A watch that agrees dates the listing** (the user, Oct 19: "I'm not
  seeing updated confirmations"). Both daily jobs were running; nothing
  dated a listing but an approved suggestion, so agreement, the usual
  case, left the date at the last approval. Now Keystone-K's list,
  Mekor's list (once its live watch has the user's yes, 6b) and a
  hospital's Refuah page date each listing they agree
  with ("Confirmed by Keystone-K, Oct 20"), daily (`sourceConfirm.ts`).
  Not a hospital Refuah has nothing for, and not a listing with a
  suggestion outstanding or rejected. Live from the first daily run after
  this is deployed (07:00 UTC); no migration.
- **Google's date is when its hours were last read** (decided, not
  changed): every night asks only whether a place is still open; hours,
  phone and website are re-read once a week, a seventh of the places each
  night (Sep 29, for the Google bill). Most places were read on Oct 17,
  so "Checked with Google, Oct 17" moves on, place by place, by Oct 24.
  The trust sheet said every source was read again every day; it says
  "Read again every day, hours every week." now (the user's yes, Oct 19),
  and "every week" alone when Google is the only source listed.
- **The daily test-project job keeps going once a watch dates a
  listing.** That job runs the watches outside Next, where refreshing the
  site's cache throws; the dates are written first, and the refresh is
  now skipped there with a note in the log.

## Done Oct 18 (on `redesign/oct18-fixes`, not merged)

- **Coming back to the app no longer slows the next tap** (the user: taps
  took seconds after switching apps, scrolling didn't). Coming back used to
  re-render the whole page on the server every time, and a tap made while
  that was out waited for it. Now the tab asks `/api/content-version`
  first and re-renders only when something changed.
- **A confirmed box stays confirmed** when the listing is closed and
  opened again in the same tab (the page's own copy catches up later).
- **Phone home:** no Hebrew date over Right now ("Right now · Sunday");
  examples under the search box lead with everyday things and things
  people wouldn't think to ask (Challah, Shabbos-friendly hotel, Young
  professionals, Ice cream, Kosher wine); chalav yisroel milk is gone. A
  search that lands on its places without a sentence counts as a good
  example now, which is what let the hotel and young-professionals ones in.
- **Trust sheet:** "Read again every day." without the eruv's Friday
  rhythm, which stays on the Eruv page.
- **Northeast and Elkins Park have their map lines on the live site**
  (the user's yes, Oct 18: "not seeing two of the eruvs on the map").
  They had been set up on the dev database only; their map links, lines,
  approval, Northeast's colour and Elkins Park's left-out directions were
  copied to live (backup in that session's scratchpad). The map reads them
  through `/api/eruv/maps`, which the CDN keeps for an hour, so they show
  within the hour with no admin save.
- **Lower Merion:** Sunday to Thursday, last Friday's post shows as "Up
  last Shabbos" in grey instead of an amber "Not posted yet this week"
  (Friday and Shabbos are unchanged). A read that gets no answer is tried
  once more straight away (live failed one on Oct 17, twice).
- **The Watches tab is grouped** (the user, Oct 18: "it's getting big and
  there are groupings to be had"): Kosher lists (Keystone-K, Mekor), Shul
  newsletters, Hospitals on Refuah, Menus, Other pages, always in that
  order (`src/lib/watchGroups.ts`). Each heading gives the count and what
  needs doing ("1 to link", "2 not working", "1 paused"). A group of more
  than four starts closed but still shows anything not working or waiting
  to be linked, and a row just linked or paused stays where it was. The
  per-watch buttons are unchanged. Still open: each menu row repeats the
  same paragraph, and on a phone a row's words squeeze into a narrow
  column beside its buttons (both were there before the grouping).

## Done Oct 17

- **The hospitals' Refuah watches are on the live site** (Oct 18, with
  the user's yes): seven website watches on `refuah.com/hospitals/<id>`,
  each tied to its live listing, copied from the test project's. The dry
  run found all seven matching Refuah, so the first run files nothing.
  Penn Presbyterian and Pennsylvania Hospital have nothing on Refuah yet.
- **Every date line says who gave it, with a verb** (the user, Oct 18).
  A person (a visitor's Yes, any approved edit, an admin's own):
  "Confirmed by community, Oct 17" (`details.confirmedBy`; a box's own
  date is always a visitor's; a Yes on the whole listing needs migration
  083). An authority: "Confirmed by Keystone-K, Oct 12", "Confirmed by
  Refuah" (`details.confirmedFrom`). Google, which isn't the source of
  truth for anything: "Checked with Google, Aug 28" (its own line, and an
  approved Google change). Plain "Confirmed" only on dates nothing records
  the giver of: the Oct 17 bulk stamp and the Aug 20 batch.
  **Retroactive, done:** dev (9) and live (24, the user's yes Oct 18: the
  listings whose date is an approved edit, the menus sent Oct 17–18;
  backup in that session's scratchpad). Live has no Keystone-K or
  Google-dated approvals to relabel. Live shows the new words once PR #324
  is merged and deployed.

- **A food place's menu link can be suggested.** Edit listing → Main dishes
  has a "Menu link" box (food places only; a grocery's items have none). The
  queue and the admin email show it as "Menu link", and approving it sets
  "Full menu". The Main dishes tab's Read starts from it, and falls back to
  the website.

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
  each source named only once its check ran that week. No reading
  schedules beyond "every day" (Oct 18).
- **Search box** on the phone home is the category pages' blue-edged box.
- **Try asking keeps the minyan questions** (Oct 17). On a phone, up to six
  in one row that swipes sideways, running to the screen's edge so the last
  one shows cut off; a computer shows the three that fit.
- **What changed / "what's happening in Philly"** stays off the phone home
  until the activity log has real traffic.
