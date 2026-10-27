# Where things stand

The running list of what's outstanding, kept in the repo so it survives a
change of Claude account (artifacts and Claude's own notes stay with the old
account). Update it in the same commit as the work that changes it.

Last updated: Oct 26, 2026.

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
1a. **Watches on shuls' and mikvahs' own pages** are on the live site
   (checked Oct 23): Mekor, B'nai Abraham, Society Hill, Kol Tzedek,
   Rodeph Shalom, Leyv Ha-Ir, the Little Shul, Mikveh Israel, Sons of
   Israel, Lower Merion, Chabad of the Main Line, South Philadelphia
   Shtiebel and the mikvahs, among others.

1b. **Eruv status by email (6c):** migration 084 is run on both databases
   (the user, Oct 19). Northeast's address on live is still to set: a yes,
   once the branch is deployed. Elkins Park's sender is still unknown.
1c. **"Candle Lighting & Zmanim"** (decided Oct 20): the user renamed it
   on live Oct 20 (label and plural). Its description there is still
   empty; dev has "Candle lighting, Havdalah and daily zmanim", which
   category search reads ("havdalah" finds it). Until the three-line tiles are
   live, the phone home cuts the name to "Candle Lighting &…".

1d. **Migration 085 (`watch.last_check`)** is run on both databases
   (checked Oct 23). A watch's last check is kept across reloads.
1e. **Migration 086 (`job_run`)** is run on both databases (the user,
   Oct 24; checked). The live jobs start recording once this branch is
   deployed.
1f. **Migration 087 (`job_run.kinds`)** is run on both databases (the
   user, Oct 25; checked). Each run saves its counts per kind from the
   next run on, so Last night's earlier nights fill in one night at a
   time (live, once this branch is deployed).

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
3. **Check the menu reader's browser on the preview** (Oct 20): Admin →
   Main dishes → Insomnia Cookies → "Read again" should come back with
   cookies, brownies and ice cream within about 20 seconds. It's the one
   part that can only run on Vercel (see "a menu page built by a script").
   Oct 21: it ran there, but Insomnia came back as a cookie notice. Now
   "Read again" on Ben & Jerry's, Center City Pretzel, Insomnia and
   Diane's says why each fails (see "a menu that can't be read says why").
4. **Go through the menus read, after that** (the user, Oct 21): for each
   place read, what the reader got right and which dishes it missed.
   Dishes added by hand are now looked for on each read after (see
   "dishes added by hand are checked"), so "Read again" after adding
   them shows which the reader finds.
   **Oct 26, "is the reader picking up what I added?"** On the live site
   5 places had 33 dishes added by hand (Espresso Cafe's Bagels, the 8
   flavours on each of the 4 Dottie's Donuts). None had been looked for:
   all were added after the Oct 22 reads, and a menu whose words don't
   change was never read by the AI again. Asked locally (nothing saved),
   the reader found all 33 ("Cream Cheese Bagel", "chocolate, vanilla,
   …"): not a missed dish, a name mismatch or the wrong page. Now:
   - Each dish no read has found yet says, on its place's Dishes box on
     the kind page (and on its Dishes line under "more checked"): On its
     menu, Not found on its menu, or Not looked for yet.
   - The daily run reads an unchanged menu again when its listing has
     dishes the last read never looked for, from the run's 3 AI reads
     (`dishesToLookFor`). One it names gets its menu date; one it doesn't
     waits on the kind page.
   - Still open: two of the Dottie's branches share dotties.com with the
     first branch's watch (one watch per page), so the daily run never
     looks for theirs. Read it now on each does.
   **Oct 26, "why does HipCityVeg say Oct 17, and Goldie?"** Two causes,
   both fixed on `redesign/oct18-fixes` (not live until it deploys):
   - Menus are checked last each night, and the shul and mikvah pages
     spent the run's AI reads first: on Oct 26, 1 of 22 reads was a
     menu. A changed menu (Goldie, Sweet Box, Roling's, Nanas, Sweet
     Trading, Gelbstein's) kept its old date night after night. Menus now
     have 8 reads a night of their own (`MENU_READS_PER_RUN`), taken
     first, then the shared ones. Not ordered by who waited longest: with
     8, every changed menu found on Oct 26 is read in one night.
   - 7 places never read (HipCityVeg, Lipkin's, PKS, Center City Pretzel,
     Star of David, The Brazilian BBQ, The Kosher Grill) had dishes dated
     by the Oct 17–18 reads, before readings were kept. Dated dishes kept
     them out of the morning first read (they looked "sent through the
     site"), and with no reading and no menu link they had no watch. The
     morning read (`/api/cron/read-menus`, 5 a morning) now reads them
     too; one that agrees with the listing dates its dishes, one that
     doesn't waits on the kind page, and from then on the place has a
     watch. A place whose website menu can't be read now says so ("Menu
     can't be read") instead of nothing.
   - Mike's, Bar Bombón and Mama's need a browser to draw their menu,
     1 a night; Tasty Twisters' page is unchanged but its date is stuck at
     Oct 22, cause not found yet.

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
6c. **Eruv status by email** (the user, Oct 19; built on
   `claude/zen-golick-e5ddec`, migration 084 run on dev and live). Northeast
   (a groups.io list) and Elkins Park announce up and down only by email.
   Each eruv's status source (its page, or the address its emails come
   from) is set on the admin Watches tab since Oct 19 (it was on Eruvim). The Gmail script that sends shul
   newsletters sends these too, since the site lists them with the
   newsletters' senders. No script change is needed.
   Each email is read by the status page's own sentence reader, never the
   AI (`src/lib/eruvEmail.ts`), and goes live at once with no approval, as
   a page read does. It reads the subject and the body, leaving out a
   quoted reply and the list's footer. It is dated by when it was sent.
   **How long it counts (decided here; tell the user):** through the
   Shabbos of the week it was sent, Sunday to Shabbos. After that, Sunday
   to Thursday say "Up last Shabbos" (or "Down last Shabbos") in grey, and
   Friday and Shabbos say "Not posted yet this week" in amber, as Lower
   Merion's dated post does. A down expires the same way, since nothing
   reads it again. Until the first email: "Not posted yet this week". A
   Shabbos followed by Yom Tov on Sunday shows "last Shabbos" on Yom Tov.
   Not handled yet.
   An email that says both up and down marks the status "Couldn't read
   their status", as such a page does. One that says neither (other news)
   changes nothing. Either way the email is kept on the eruv's row on the
   Watches tab, where
   an admin can say "It says up", "It says down" or "Not about the
   status". Up or down goes live at once.
   An eruv has a status page or a status email, not both: a page is read
   again all day, while an email stands for its week.
   A mailing list sends each email from whoever posted it, so a list is
   matched by its own address: the Gmail script searches `list:` too and
   sends each email's List-Post address, and the site matches an eruv (or
   a shul newsletter) by it. groups.io's owner and sign-up addresses
   (`…+owner@groups.io`, what its page shows) are kept as the list's.
   **Northeast:** `jcor-ne-philadelphia@groups.io`, set on dev Oct 19.
   **For the user:** subscribe phillyjewishguide@gmail.com to the list;
   after this branch is deployed, paste the new Gmail script over the old
   one (the secret and trigger stay); then set Northeast's address on live
   (a yes). The script talks to the live site, so the preview can't receive
   a real email.
   **Open: Elkins Park.** No sender yet: how YIEP announces its status
   isn't known (ask 267-415-6760, yiep.org, whether there's an email
   list). Once the user sends its sender address, it's Add a watch → Eruv
   status on the Watches tab, no code: dev first, then live with a yes. Until then it
   shows "No status online".

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
8. Counts on the admin's To do tabs (how many are waiting in the queue,
   Watches, Read questions, Responses). Not shown: no count is loaded
   anywhere the nav can read it, and the agreement was no new requests just
   for these. Showing them would mean the sign-in check (or one new small
   request) returning the four counts on every admin page load.

## Building: the Watches tab by kind of place (drawings settled Oct 24)

Canvas: https://claude.ai/artifact/VBDTZ5Zm7wR1R6FVQaKaMS. Every revision
is a new board beside the old one. Only the latest board for each screen,
nothing superseded: https://claude.ai/artifact/NDNpGaksvhsFk5beuX5ZWA
("Watches: what we're settling on"); a new settled board goes on both.

**Building in five pieces** (agreed Oct 24, on `redesign/oct18-fixes`):

1. **The tab's rows and each kind's page: BUILT Oct 25.** The tab starts
   with a row per category in the site's order (alphabetical): its
   sources line, then waiting for you / not checked / up to date, then
   "Not watched:" for the kinds with no address. Each row opens
   `/<community>/admin/watches/kind/<category>`, with the three tabs.
   `watchPlaces.ts` puts each job's own standing for a place together,
   so the counts can't disagree with the job pages. A list's finding
   on a grocery goes under Grocery; a place only a list has goes under
   Food. Not done yet, on purpose:
   - Every row now opens in place (pieces 2 to 4).
   - The old job rows stayed under "Job pages" until pieces 2 to 4 held
     what they did; the job pages went Oct 26 (piece 6). The watch list
     and Add a watch are gone (piece 5, What's tracked).
   - On the test site Food shows 25 waiting (mostly places only a kosher
     list has), 22 not checked and 49 up to date.
2. **Up to date, opened in boxes: BUILT Oct 25.** An up-to-date row opens
   under itself on a computer, on its own screen on a phone, as drawn
   (FinalShuls3, FinalPhoneShul3, FinalAddSource3, FinalFoodMenus3). A
   box per part a source keeps, each footed "Same as <source> · read
   <day> · Change":
   - Shuls: this week's (from its newsletter or page), usual weekday,
     usual Shabbos. Mikvahs: a box per section. Food: Dishes, Kosher.
     Hospitals: their Refuah boxes. Eruvim: Status, Details (from its
     website) and Map, as the Eruv page has them (Oct 25).
   - Then Google's fields ("Name and contact", or "Hours and contact"),
     its website's, and a person's, each a box of its own. Google's and
     the lists' have no Change.
   - Under them: Add a source (a shul: a page or its newsletter's email;
     a mikvah: a page; a food place with no menu link: its menu page),
     Read it now / Read them now (none with only Google and a
     newsletter), Open its listing.
   - Change gives a page in place of the one read (the old one is
     stopped), a newsletter's new email, a new menu link, or a new
     Refuah page.
   - A read that finds something moves the place, and the page says
     where it went.
   Not done, on purpose:
   - Dishes come in one list: a menu reading keeps one page, so the
     drawing's heading per menu page needs the reader to keep its pages.
   - No Add a source for hospitals: one source. A hospital's Change
     gives a new Refuah page. An eruv's Status and Map have Change (a
     status page or its emails; a map), and Add a source when nothing
     gives its status. Its Status box has "Its page dates each week's
     post".
   - **Stop** (Oct 25), what each job page's Reads × did, asked first
     ("Stop reading mekorhabracha.org/davening?"): a shul's or mikvah's
     page stopped, a menu link unlinked (a menu found on its website:
     No menu online), a Refuah page stopped, an eruv's status or map
     emptied, its website's read paused. A hospital Refuah doesn't have
     has Not on Refuah beside Give its page on Refuah. Newsletters have
     no Stop, as on the Shul times page. A place's whole Off switch
     isn't here: stopping each source does it, and giving a page turns
     it back on.
   - On the test site, 13 food places have an approved menu reading but
     no dishes on the listing (Playa Bowls among them). They show no
     Dishes box rather than a "Same as its menu" that isn't so.
3. **Not checked, opened by what's wrong: BUILT Oct 25.** A not-checked
   row opens in place too, as drawn (FinalFood3, FinalPhonePlace3,
   FinalStopped2, EruvNotChecked): its pill, then a group per problem,
   lit, each "<page> · <what's wrong>", the fields it leaves unchecked,
   and its own button. Then "N more checked", a line each (what, the
   listing's value, its source and when, Change), and Open its listing.
   - Google: "Nothing checks its name" (Find it on Google / Not on
     Google); "its Google listing · failed every night since Sep 10"
     (the same two). A field a page of its website would check, once it
     loads, goes with that page and its Read it now.
   - Pages: "never read · added Oct 23", "failed every night since Oct
     22", "not read since …" with Read it now; a site that's down is one
     group ("· 5 pages", Read them now). Times or hours that can't be
     read: Give the page with its times. No page: Add a source.
   - Menus: never read (Read it now), can't be read (Give its menu
     page), didn't load (Read it now). Hospitals: Refuah didn't load
     (Read it now), not found (Give its page on Refuah).
   - Eruvim: no status (Find its status page, searching its website,
     and Add a source), an email it couldn't read (the email, with It
     says up / down / Not about the status, right there), a status page
     or map that didn't load (Read it now). Both were links to the Eruv
     page until Oct 25.
   - Built with it, as agreed Oct 24: a "You" field goes back to Not
     checked after a year; Not on Google on a match Google stopped
     answering for drops the match (it used to be refused).
   Not done, on purpose:
   - A matched place with a field nothing checks and no page to add
     (a grocery's website) has "Check it against Google" (a paid call;
     its answer waits with Use / Keep). It linked to the Google page
     until Oct 26.
   - The pills are piece 1's ("Google stopped answering Oct 17"), not a
     count of the fields in the groups.
4. **Waiting for you by source, in the agreed order: BUILT Oct 25.**
   - **4a, the order: BUILT Oct 25.** A place off a kosher list first, its
     pill red ("Off Keystone-K’s list · Oct 24"); then Google's closures
     ("Closed for now, says Google · Oct 12"); then new places; then
     changes. A closure waits until Keep closed (dated, so it stops
     waiting until Google changes its answer again) or Show as open.
   - **4b, a waiting place opened in place: BUILT Oct 25**
     (`waitingGroups.ts`). A group per source, "From
     mekorhabracha.org/davening · Oct 25", what it would change lit with
     "Was …", its own buttons, then "3 more up to date" and Open its
     listing. Each group decides what its job page would, by the same
     calls:
     - a change: Accept / Edit / Keep as is (Google's check: Use / Keep;
       a menu read: Use / Skip; a kosher list's: only the Kosher box's
       keys, through `kosherProposal`, now shared with the Kosher page);
     - a closure: Keep closed / Show as open (FinalClosed);
     - off a list with no hechsher left: Hechsher "None, was
       Keystone-K", Remove the listing / Keep it / Edit (FinalDropped);
     - a place only a list has: what it would add, Add as new / Don't
       add (FinalNewPlace); one not filed yet says it's suggested after
       tomorrow morning's read, with no buttons.
     Fixed on the way: Open its listing on a place not checked went to
     the job page it waits on, not its listing.
     - **Edit opens the box here: BUILT Oct 25** (`findingEdits.ts`):
       the same box its job page opens, filled in with what was read,
       saved straight to the listing. A group with several changes opens
       them one after another (a mikvah's two sections). An eruv's opens
       the eruv editor. Each job page now builds its box from the same
       code.
     - **Bring it back: BUILT Oct 25.** A new place a kosher list has
       that the guide archived ("Archived, as “…”") has Bring it back,
       on its kind's row and on the Kosher page: the archived listing
       comes back with the list's hechsher, and the suggestion closes.
       It uses the Archived tab's restore, which already existed. Off a
       list and archived: Bring it back alone.
     Not done, on purpose:
     - A waiting place with nothing a group can show (a page that
       differs, nothing filed from it yet) has Read it again, to file
       what it says. It linked to its job page until Oct 26. None seen on
       the test site.
5. **Last night, a line per kind: BUILT Oct 25** (`nightKinds.ts`,
   `NightlyRuns.tsx`, FinalNightly). Closed: "Everything read", or which
   kinds weren't ("Kosher certification, minyan times and menus not all
   read"), amber. Opened: Google, Kosher certification, Hospitals,
   Eruvs, Minyan times, Mikvah hours, Menus, each its run's time and "11 of
   20 read · 9 didn’t load". A kind opens to what it reads, Not read last
   night (Never read, Didn’t load, Not reached; a place's pages as one
   line, "· 5 pages"), each a link to its job page, and its last 14
   nights.
   - Last night comes from the sources as they are now (each watch's
     last read, each listing's last Google answer), so one read again
     since stops showing. The nights before come from the count each run
     saves per community and kind (migration 087, 1f).
   - Newsletters aren't counted: they're read as each email comes in.
   - **Mikvah hours, not Websites** (the user, Oct 25): the line is the
     mikvahs' pages of hours only. A listing's page goes by its
     listing's category, as the watch list does (`listingReads.ts`), so
     Mikvah Moishe Zvi's page ("its website") is no longer counted as
     Minyan times. A page added by hand for no shul or mikvah isn't
     counted (none on either site).
   - Gone from the tab: the old row per job. Walks have no line; their
     email when they break still goes out.
   - **The read-menus job is part of Menus** (the user, Oct 25). A food
     place whose menu was never read is Never read on it, by name,
     linking to Dishes, whether its menu's watch loaded or not. When that
     job failed, didn't run or isn't set up, the line says so ("reading
     new menus failed"). A night it read some says "· 3 new menus read".
   - Each place missed goes by its name ("Menu · Say She Ate" is Say
     She Ate; "Center City Eruv’s website" is Center City Eruv).
   - **What's tracked, in place of the watch list: BUILT Oct 25** (the
     user: "I want to see everything that's being tracked"). The section
     is renamed What's tracked. Each line opens "All N tracked": every
     place or page it covers, one line per place, its status ("Read Oct
     24", "Not loading since Oct 20"), problems first, each a link to its
     job page.
     - **Newsletters** is a line of its own, with no run time: "2
       newsletters · last email Oct 24 · 1 to link". Needs a look lists
       senders not linked to a shul (with the Link box and Not a shul),
       quiet for a month, or whose last email couldn't be read.
     - **Other pages**: pages added by hand for no shul or mikvah. Shows
       only when there are some (none on either site).
     - **Phone, email and hours** ("Reads a place’s own website when
       Google doesn’t have them."): a food place's own website, read for
       the phone and hours Google doesn't keep. Each place says why: "Not
       on Google · Read Oct 25", "Google has no hours · …". Five on the
       live site (four not on Google, Sababa Falafel with no hours there),
       which had been counted as Mikvah hours. Shows only when there are
       some.
     - **Every kind of place: BUILT Oct 25** (the user: "read phone,
       email and hours from the website for the other kinds of place
       too, only where Google doesn't have them"). `ownSiteCategories`:
       every kind of place but shuls, mikvahs and hospitals (their own
       jobs), with a phone, an email or hours to read. A place with no
       hours field (a hotel) is read for phone and email alone, by code,
       no AI. Hours are read by the AI only when the page changes. What a
       food place's site finds waits on Dishes. Dry run on the live
       site: the next morning adds GIANT (grocery, Google has no phone),
       CKids Philly (not on Google) and BZBI's Early Childhood (Google
       has no hours). Schools and hotels have no gaps today; cemeteries
       have no phone field.
     - **Findings wait under their kind: BUILT Oct 25** (the user:
       "every category that has a watch of some sort should be on the
       watch list. So grocery should go to grocery"). What a grocery's,
       childcare's, hotel's or school's own website finds now waits under
       that kind's row (counted in its Waiting for you, opened there with
       Accept / Edit / Keep as is), not in the
       moderation queue; its email links to that page. Every kind with a
       watch has a row: a kind Google doesn't cover gets one from its
       read websites. On the live site every watched place is a mikvah,
       food place, hospital or shul today; Childcare already has a row
       (from Google), and its websites join it once read.
     - **Weekly link check: BUILT Oct 25** (the user: "let's also add a
       check for links now"). Every Sunday (`/api/cron/check-links`,
       added to `vercel.json`) each link a listing shows that nothing
       else opens — kosher certificates, Refuah, WhatsApp groups,
       websites Google doesn't keep — is opened once. No AI, nothing
       read. Not found or no such site counts at once; didn't answer
       counts only on a second check a week later. What's tracked has a
       Links line; a link that doesn't open puts its place on Not
       checked ("Link doesn’t open") with Check it again. A hospital's
       Refuah link isn't checked: its Refuah watch reads that page
       already (the link carries a `?q=` search the watch doesn't). Dry
       run on the live site: 85 links, 1 doesn't open — House of
       Kosher's certificate (houseofkosher.com/Philadelphia, 404). With
       the user's yes, the live listing now links its Keystone-K page,
       keystone-k.org/kosher/house-of-kosher/ (Oct 25), so the first
       run should find none. The cron first runs on
       production once this branch deploys.
     - Gone with the watch list: Add a watch, and Pause, Remove and Check
       now on leftover pages. Pages are added from a place's own box (Add
       a source).
6. **The job pages gone: BUILT Oct 26** (the user: "my goal would be to
   have everything accounted for so then we can remove job pages"). The
   seven pages under `/admin/watches/` (Google, Dishes, Hospitals, Mikvah
   hours, Shul times, Eruv status, Kosher certification) and their
   components are deleted; what only they did is on the kinds' pages:
   - **Not read** under an opened place: a shul or mikvah turned off, a
     page of it stopped, a hospital off Refuah, a menu marked No menu
     online, a food place's or eruv's website stopped. Each has Read it
     again (the job pages' Turn back on).
   - **Kosher:** a food place on neither list gets a Kosher box ("On
     neither list") whose Change gives its page on Keystone-K's list; on
     Keystone-K's, the same Change. Off a list that has it by a near
     name: It's <name> now, beside Remove the listing / Keep it. Read it
     now also reads the lists it's on.
   - **Menus:** a menu that can't be read has Photos of the menu and No
     menu online beside Give its menu page.
   - **Check it against Google** on its own place, not a link away.
   - **A kosher list** is stopped, or read again, from its line in
     What's tracked (Kosher lists, All N tracked).
   - Every link that went to a job page — What's tracked's lines, the
     findings' emails — opens the place on its kind's page instead
     (`?place=<id>`, on its tab). A kosher list's findings email links
     to the Watches tab.
   Dropped on purpose: a whole Off switch per place (stopping each source
   does it; giving a page turns it back on), and Stop on a newsletter (it
   had none on the Shul times page either).

Settled with the user so far:

- Rows are the site's categories. A place's card shows only what needs
  the admin. Tabs: Waiting for you, Not checked, Up to date.
- **Not checked** holds only what won't fix itself: a field no source
  covers, a source that stopped answering, or a source never read or not
  read for over 36 hours (with Read it now). A source not yet read stays
  off it for its first night. A place with two problems shows one group
  per problem, each with its own buttons (Mix 7).
- **Waiting for you** groups a place's changes by source, each group
  with its own Accept / Edit / Keep as is (Mix 5). No Check now there.
  Under one checker per field, two sources never disagree on a field.
- **Nightly runs** is one line per kind of source (Google, Kosher
  certification, Hospitals, Eruvs, Minyan times, Websites, Menus), its
  run time on the right and what was read under it. Every line opens to
  what it reads, last night's misses, and its last 14 nights. Walks are
  not on it.
- **The 3 AM watches run stays one job** (the user, Oct 24), not one
  run per kind. Each kind's last night comes from its watches'
  `last_check` times. Those times keep only the latest read, so a kind's
  14 nights need the run to save its count per kind in its `job_run`
  row (a new column, so a migration). Google's hours already have a job
  and rows of their own.
- **Not on Google** (`notOnGoogle()`, googleJobRun.ts) changes nothing on
  the listing: it saves the date, and every field nothing else checks
  becomes the admin's ("You · Oct 24"), so the place moves to Up to date.
  Picking a Google match later clears it. A "You" field goes back to
  Not checked after a year, and Not on Google on a place whose match has
  died drops the dead match (both agreed Oct 24, built Oct 25 with
  piece 3; a live match is still refused). Since Oct 25 it first adds
  and reads the place's own website, where its kind reads one, so only
  the fields that page doesn't give become the admin's. Before that,
  CKids Philly came out all "You" with nothing reading its site until
  the next morning's run (`readOwnSiteNow()`, hoursJobRun.ts).
- **Minyan times come in every kind the live site already keeps**: the
  usual weekday table and Shabbos, this week's times (including "No
  minyan this week" and a whole posted week), Yom Tov schedules (replace
  or add), zman-based times with limits, summer or winter only, minyanim
  that need ten, minyanim at another place, and join links. The drawings
  show only a one-off clock-time change. Built change lines say each one
  the way the listing does: a zman rule as the rule, and a Yom Tov
  schedule as one item ("Chanukah schedule, Dec 4–12"), not dozens of
  times.
- **A place with two sources** (a shul's website and its newsletter):
  each finding is filed with its source and the page or email it came
  from, so each source is its own group in Waiting, accepted on its own.
  The website usually gives the usual times; the newsletter gives this
  week's, as a week beside the usual times. For the same days a week from
  the newsletter or a person wins over the website's (the user, Oct 20;
  `postedBy` in schedules.ts). An agreeing website read confirms and
  clears older findings; an approved newsletter change shows "Confirmed
  by <shul>".
- **Waiting for you, in order**: a place off a certifier's list first
  (red pill), then Google closures, then new places, then changes. Drawn
  Oct 24, accepted as drawn:
  - **Off a kosher list** (Stephen's Cafe, made up): Hechsher "None, was
    Keystone-K", Remove the listing / Keep it / Edit. That is what the
    Keystone-K watch's `gone` finding already proposes (archive when it
    was the only hechsher). Never filed yet.
  - **Closed for now, says Google** (Rita's, Grant Ave, real since Oct
    12): a closure is on the site at once today, so the card is Keep
    closed / Show as open, and it reopens by itself when Google says so.
    Three such places in Philly now (two Rita's, New York Bagel Bakery).
  - Agreed Oct 24: a person's fix wins over a website that still
    contradicts it, and that source stays quiet on the field until the
    page's text changes. One place in two categories (House of Kosher)
    gets one finding, shown in both rows, cleared by one approval.
  - The settled canvas's row 1 still shows Food's Waiting as 13; the new
    boards count 17 (13 new places, 3 closures, 1 drop).
- **A Google match failing for more than a few nights** (agreed Oct 24):
  the card offers only Find it on Google and Not on Google. Check again
  (the same paid call on the same place) goes. Redrawn as Sababa, no
  Check again, on both canvases.
- **Up to date shows where each field comes from** (drawn Oct 24, not
  reviewed; Synagogues, real Philly data): each row has a grey sources
  line ("Google · its website · its newsletter"), so a shul with a
  newsletter is told apart from one without (6 of 14 have one). An
  opened place groups its fields by source, each with its link or
  email and when it was last read: Mekor Habracha's Google fields, its
  usual weekday and Shabbos times from mekorhabracha.org/davening, and
  this week's from its newsletter. Change sits on a source you chose,
  not on Google's.
  **Redrawn Oct 24 in the live job pages' style** (the user preferred
  it): an opened place is one box per section, laid out as the job
  pages' `job-box` already does (day headings, what left, time right,
  Summer/Winter under), with the source on a line at the box's foot
  ("Same as mekorhabracha.org/davening · read Oct 23 · Change"). Boxes:
  This week's schedule (from its newsletter), Usual weekday times, Usual
  Shabbos times, Name and contact (its Google listing). No "Same" pills
  in Up to date. "Add a source · Read them now · Open its listing" under
  the boxes, replacing the job page's Reads box and "Add a page". Every
  kind of place opens this way, with the box its job page already has.
  B'nai Abraham (Add a source open) and Playa Bowls redrawn the same
  way Oct 24; on the settled canvas they replace the grouped-look boards.
  **Agreed Oct 24:** Add a source and Read now stay once per place
  (Change is the one per source, on each box's foot). Read now says
  "Read it now" for one page and "Read them now" for several. On a phone
  the three links sit on one row. Agreed, not drawn: no Read now on
  a place with only Google and a newsletter (nothing to read on demand).
  The Final page of the original canvas shows only the latest boards;
  earlier ones are on "Final, earlier versions".
- **Add a source** (agreed Oct 24) sits at the bottom of every opened
  place. One box takes a web page or the email a newsletter comes from;
  an email also needs the guide's inbox subscribed, and the box says so
  in one line. Drawn on B'nai Abraham Chabad. Only kinds that fit the
  place are taken (newsletters for shul times and eruv status, as
  `watchPurposes.ts` already allows).
- **More than one menu page** (raised Oct 24, not decided): reading
  already merges up to 3 menu pages (`readMenus`, `MAX_MENU_PAGES`), but
  the nightly watch fingerprints only `details.menuUrl` and the Dishes
  line shows one page. Recommended: watch each page that gave dishes and
  list each on the Dishes line. Drawn Oct 24 as Playa Bowls, Wynnewood
  (Food, Up to date): "From its menu: Bowls · Smoothies · Surf Quenchers
  · Oct 22", one link per page. Those are the three pages `findMenus`
  really finds on its site. Dishes holds ten in all, and today the first
  page fills them (`readMenus` tops up from later pages only below ten),
  so Bowls gives all ten and the other two pages add nothing. **Agreed
  Oct 24: take a few from each page.** Redrawn with the Dishes field one
  line per page (Bowls 4, Smoothies 4, Surf Quenchers 2, real names off
  the pages). For the build: split the ten across the pages that gave
  dishes, keeping anything already on the listing. In the boxed look
  the Dishes box has a heading per page and its foot links all three
  ("Same as its menu: Bowls · Smoothies · Surf Quenchers · read Oct 22").

## Building next: the job pages, as drawn (agreed Oct 21)

**Gone Oct 26**: these pages were removed once the kinds' pages held what
they did (piece 6 above). Kept for the history of what was decided.

The user, Oct 21: "great, let's do it". There is one drawing per page, all
agreed:
- Shul times: https://claude.ai/artifact/B3vwpSiqwdK833s9VAVHBc
- Mikvah hours: https://claude.ai/artifact/7MUNppcA4S4yvXKupEKJPR
- Main dishes: https://claude.ai/artifact/7EYjgU1WcHrXG2W6Qpigb7
- Hospitals: https://claude.ai/artifact/Jf2Nvzj8dy1fWop5ZzVFmy
- Kosher certification: https://claude.ai/artifact/2PPYvecC87w2KLNeHgYfTN
- Eruv status: https://claude.ai/artifact/9Kv6MGeAEooZREzW28hiBu

**Rules on every page:**
- An opened place is its listing's own boxes. Boxes with an update come
  first, open; boxes with nothing new sit closed below them; Reads is last.
- A changed row has one highlight colour. A row going away is crossed out,
  with a tag saying why ("Not on the menu", "Not on Refuah"). A changed
  value has "was …" beside it. A new row is only highlighted. There are no
  New or Changed tags.
- Pills: a place's row says "N updates". A box's pill names the kind when
  it holds one kind ("1 new", "2 changes", "3 not on the menu"), and says
  "N updates" only when it mixes kinds.
- The buttons are Use this / Edit / Keep the listing. Use this takes off
  what the source no longer has. Each box ends with "From X · read
  Oct 21". After Use this, the box shows a grey "Used Oct 21".
- Edit is the listing's own per-box Edit sheet (`BoxEditSheet`), filled
  with the source's version, with the button "Save to the listing".
- Reads: the Reading switch, then one line per page, each naming the boxes
  it updated ("Usual weekday times · Usual Shabbos times", "Menu link ·
  Main dishes"; "Nothing from it" if none), with a date or a greyed reason
  and a ×. Below them: Add a page · Read them now · Open its listing.
  Can't be read opens straight to Reads.
- A field Google keeps (`details.googleFields`) isn't read from the
  website. The address is never checked.

**Per page:**
- **Kosher:**
  - The two lists sit at the top, each with the page's only Reading
    switches.
  - Each list speaks only for its own hechsher.
  - "What isn't kosher?" is compared only for being there or not.
  - No hechsher left: "Archive the listing".
  - "It's <near name> now" is offered only when the list has a near name.
  - A New on a list place that is left out isn't shown again.
- **Hospitals:**
  - Entries are compared by name, phones, email and website, never their
    wording.
  - Eruv and Sukkah aren't checked here.
- **Eruv:**
  - Status and map go live as today, with no Use this.
  - Details (hotline, email-alerts link) are read from the eruv's website
    and wait for Use this. "Where it goes" is never compared.
  - "Up" is green.

**Decided before building:**
- An item an admin added by hand is never crossed out because a read missed
  it. The reader is asked to look for it next time.
- Watches never read the guide's own pages. **Built Oct 21:**
  - `guidePage.ts` knows the guide's hosts: phillyjewishguide.com, plus
    `NEXT_PUBLIC_SITE_URL` and Vercel's addresses.
  - `fetchPublic` and the browser render refuse those hosts, a redirect
    to one included. The reason given is "it's a page of this guide, not
    the place's own".
  - Both add-a-page routes refuse one.
  - Dev's one such watch, Moishe Zvi's, is removed. Production had none,
    so nothing there changed.
- A read that agrees with the listing clears that watch's older finding.
  **Not built yet.**
- The uncommitted filing-side work is committed as it was, then built on.
- Mikvah hours given as notes ("by appointment, 48 hours ahead"): the user,
  Oct 22, "yes" to reading them as a note under the hours they belong to,
  shown and approved like a changed time. Built with step 4.

**Order:**
1. The own-pages fix (built).
2. Main dishes, which sets the shared box, Reads and Edit pieces.
   **Built Oct 21** (compared with its drawing on dev, computer and phone):
   - The shared pieces are in `JobBoxes.tsx`: a place's row (full screen
     on a phone, "‹ Main dishes"), Box, its rows (gone crossed out with
     its tag, new highlighted), Use this / Edit / Keep the listing, the
     source line, and Reads with its switch and a × per page.
   - `dishProposal.ts` marks the listing's list by the menu. A dish with
     a menu date (`itemMenu`) that the menu no longer names is crossed out
     and Use this takes it off. One with no menu date (added by hand or
     by a visitor) is kept, "Not found on the menu", and looked for again.
   - Edit is the listing's own dishes editor (`ListingEditor`'s new
     `preset` and `adminSave`), saved through the route's `save`; its menu
     link field is hidden there, since Reads has it. The route's `use` and
     `save` write the list whole (`setMenuDishes`), so
     `approve_menu_dishes` (migration 065) is no longer called.
   - Reading switch off = No menu; the × on a menu link takes the link
     off; on a website, No menu. Places not read yet are read as the page
     opens, five at most.
   - Board 3 **built Oct 22** (compared on dev, computer and phone,
     Chalavita's hours finding stubbed in the browser): a food place whose
     hours or phone Google doesn't keep gets a watch on its home page from
     the daily run (`homePageWatchChanges`, no search; taken off again when
     Google takes them over). Its hours are filed as the section `hours`,
     shown as an open Hours box, a day the listing lacks highlighted with
     nothing struck under it ("New"), Use this / Edit / Keep the listing
     (`FoodHours.tsx`). Its phone is a Phone box (below). Main dishes
     comes after them, then Same boxes, then Reads, which names the home
     page "Hours · Phone" with a × that stops it. A finding puts the place
     in To check even with No menu (`dishStatus`).
   - Not built, as the drawing says: board 5 (a menu that moved, a "New
     menu link" update in Reads).
3. Shul times. **Built Oct 22** (compared with its drawing on dev, computer
   and phone, with the shul's updates stubbed in the browser; dev's own
   are older, unsplit filings):
   - A box per update, named for its part: Usual Shabbos times ("7 new"),
     This week's schedule ("Oct 21–24"), Usual weekday times. Rows sit
     under their days ("Friday night", "Monday to Friday", "Wed, Oct 21
     and Thu, Oct 22"), a tefillah's times on one line ("6:45 and 8:15
     AM"), a changed time beside its old one (`timesProposal.ts`).
   - A usual part a page gives that matches is a closed "Same" box, "Same
     as" its page.
   - Each check now records the parts its page gave (`WatchCheck.parts`,
     `partsGiven`); older checks are worked out from their lines
     (`partsFromRead`). Reads names each page by the parts it gave, pages
     that gave a part first, greyed ones last.
   - A finding carries its part and page (`watchFindings.ts`). Use this
     approves only that part. Edit is the listing's own box editor
     (`BoxEditSheet`'s `preset` and `save`), filled with the website's
     version; the hours route's `?item=` hands it the listing.
   - A filing from before parts (dev has three, Sons of Israel's) shows
     whole in a "From its website" box with Compare.
   - A newsletter's times are filed by part too (the user, Oct 22), one
     update each, boxed "From its newsletter". So a newsletter no longer
     files one whole update that stops the website reader filing for that
     shul. Older newsletter updates stay whole until decided.
   - Edit on a This week's schedule that gives two weeks (Kol Tzedek's,
     Mikveh Israel's: this week and next) had no Edit; it opens both
     weeks now, a list each under its dates, one Save (the user, Oct 22).
   - A day a week's schedule leaves out (Kol Tzedek's Oct 22–24 is only
     Shabbos morning) shows the usual times plainly; it said "Times for
     Oct 18 – Oct 24 times not posted". A Yom Tov day still says not
     posted.
   - A calendar's lines carry an event's end ("8:10 AM–8:40 AM"), so the
     reader can note it (Rodeph Shalom's Thursday minyan, the user, Oct
     22). Every calendar's lines change, so each is read once more.
   - A Zoom link from a calendar: **built Oct 22**, PR #346 (see "Done
     Oct 22: a minyan's join link" below). Not from a newsletter: the
     Apps Script sends the email's plain text, which has no links
     (Society Hill's "Click here to Zoom", BZBI's weekday minyan).
   - This week's schedule made only of dated services (BZBI's newsletter
     "Sat Oct 24") had no line under it; it has the confirmed line and
     Edit now (the user, Oct 22).
   - Kol Tzedek's Friday night is on its Weekly Services page
     (kol-tzedek.org/shabbat.html, "All Friday services begin at
     6:30pm"), which isn't one of its watched pages yet. Nothing to add
     by hand: the morning's search follows the links on a shul's Google
     website, like Main dishes, and finds it (and calendar.html, and
     the Shtiebel's /calendar; checked Oct 22, fetch only). It went live
     Oct 22, so its first morning is Oct 23. "Read them now" searches
     first too now, a shul with pages or without (the user, Oct 22).
     BZBI's and Chabad of the Main Line's websites turn the reader away
     (403), so only BZBI's newsletter is read.
   - "Read them now" on Sons of Israel said "Unexpected token 'A'…"
     (Oct 22): its pages, read by the AI one after another, passed the
     host's 60s and the host's error page isn't JSON. Now every page is
     read: the job page asks for each one in its own request, in order,
     and the row says "Reading 2 of 4…". The search gets 10s, and an
     answer that isn't JSON says "That took too long. Try again." on any
     admin page. "Turn back on" reads the same way.
   - Sons of Israel was read again every time Shul times opened (Oct 22):
     its newsletter-links page was never reached, so it always counted as
     not read yet, and opening the page searched and re-read all its
     pages, filing its suggestions afresh. Opening the page now reads only
     pages never read, and only those.
   - The page with a date wins (the user, Oct 22: "since calendar has date
     and 9am we go with that"). Sons of Israel's calendar gives this
     Saturday's Shacharis at 9:00, its Tefillot page 8:30. A usual time a
     page gives is no longer filed where a date from today on (a week on
     the listing, one waiting in the queue, or the same page's) gives that
     weekday's tefillah another clock time, and its check says so
     (`yieldToDated`, listingPageRun.ts). Relative times and one season's
     times aren't held against a date. Its 8:30 suggestions already in
     production's queue (37673a26, f113d578) and the home page's "Off:
     9:00" (b5dde002) are still there for the user to decide.
   - A shul's newsletter is one of its reads (the user, Oct 22): a line in
     its Reads ("communications@bzbi.org · Newsletter · read Oct 22"), and
     a shul read from one is Checked, not Can't be read. Off the Watches
     tab's list once linked; a sender not tied to a shul yet stays there.
   - A page whose read waited behind a suggestion already in the queue
     kept "In the queue" after that suggestion was decided, with nothing
     to open (Sons of Israel's home page, Oct 22). It settles once a
     finding is decided after the read (`settles`, watches.ts).
4. Mikvah hours. **Built Oct 22** (compared with its drawing on dev,
   computer and phone; Lower Merion's update stubbed in the browser, Moishe
   Zvi's two from a real read on dev):
   - A box per section the listing ticks (Women's, Men's, Keilim;
     `hoursSections.ts`), each with Hours ("Sunday 7:30–9:30 PM", the old
     hours struck beside a changed day) and Notes (a changed note lit
     whole, the old one struck under it). "N changes" or "Same", "Same as"
     its page (`MikvahHours.tsx`).
   - Notes are read too: each section's notes go to the reader beside its
     hours, which is told to keep the guide's note when it says the same.
     A page that only says "by appointment" is found and read.
   - A reading is filed a section at a time (`splitSections`), its source
     naming the section and its keys. Use this approves only those keys
     onto the listing as it is then (`rebaseSection` in
     `approveSubmission`), so approving Women's never undoes Men's. A
     section waiting from the same page is replaced; one filed before
     isn't filed again.
   - Edit is the section's own editor ("Women's hours", its hours and
     notes), filled with the website's, saving only that section's keys.
   - An older finding whose lines all sit in one section shows as that
     section's box; one across sections shows whole with Compare.
   - The Contact box **built Oct 22** (compared on dev, computer and
     phone; Lower Merion's email change stubbed, Moishe Zvi's Same from its
     real fields). See "Phone and Contact boxes" below.
   - **Phone and Contact boxes** (all three job pages, `ContactBoxes.tsx`,
     `contactRead.ts`): each listing page read also reads the phones and
     emails on it, by code, no AI. Only what Google doesn't keep is checked
     (`googleKeeps`: `placeId` set and the field in `googleFields`); the
     address never. A number is "the same" however it's written; a change
     is proposed only when the listing's is gone and exactly one new one of
     that kind is there; an email only when none the listing knows is on
     the page. Filed as the section `contact`, apart from hours and times.
     The box is "Phone" when that's all it checks, else "Contact". An
     update is open, after the hours or times updates and above the Same
     boxes; Same is closed, after them, "Same as" its page. Edit is the
     listing's own contact box (address, phone, website, email), and
     whatever the admin changes there is saved with it (the approval takes
     `reviewEdit.fields` too). Shul times shows a shul's Phone the same
     way (Leyv Ha-Ir's, as its notes say); not drawn as a box, so built in
     the page's pattern.
   - **Waiting on the user:** a mikvah's section phones and emails
     (Women's Phone, Men's Phone…) are checked in its Contact box, not in
     the Women's / Men's boxes. The drawing doesn't say which; tell me if
     they belong in their sections.
5. Hospitals. **Built Oct 22** (compared with its drawing on dev,
   computer and phone; updates stubbed in the browser):
   - An opened hospital is its listing's boxes that hold contacts (Who to
     call, Kosher food, A place to stay, Rides, Also; `hospitalBoxes.ts`).
     A box Refuah updates comes first, open: each person a row, "From X ·
     who · note" under the name, phones on the right, a changed phone
     beside what it was, a person going crossed out "Not on Refuah". Boxes
     that agree sit closed, "Same as Refuah". Reads is last: the one
     Refuah page, its × stops it (kept as a stopped page, so the daily
     match doesn't put it back), "Not on Refuah" when it can't be read.
   - Refuah's reading is filed a box at a time, its source naming the box
     and its keys, and approved onto the listing as it is then
     (`rebaseSection`). A box waiting with the same reading stays; one
     filed before isn't filed again. Edit is the box's own editor, the one
     visitors use (a row a person, Add a person), filled with Refuah's.
   - **Only what came from Refuah is ever crossed out.** Entries carry no
     source, so the watch remembers the entries it matched
     (`WatchCheck.refuahHad`, carried forward each read). An entry the
     guide has that Refuah doesn't is crossed out only if it's on that
     list; otherwise it's kept, and listed in the note as added by hand.
     The first read matches everything, so nothing is crossed out until a
     later one. The cost: an entry Refuah dropped before the first read
     (or before choosing a different Refuah page) counts as hand-added and
     stays until someone removes it.
   - An older whole-hospital filing shows in a "From Refuah" box with
     Compare.
   - Found while comparing: Mikvah hours strikes a changed day's old hours
     (the shared `BoxRow`), where its drawing has "was 8:30–10:30 PM" in
     small grey, as Hospitals now does. Not changed yet: `MikvahHours.tsx`
     and `TimesProposal.tsx` were being edited by the Contact/Phone boxes
     session, which has now committed (Oct 22), so they're free.
6. Kosher. **Built Oct 22** (compared with its drawing on dev, computer
   and phone; the lists' findings stubbed in the browser):
   - The page says "N places have an update from a list." The Lists box
     holds both lists, each with its page, "read <date>" and the page's
     only Reading switches, and Read them now. Tabs: To check, New on a
     list, Checked, On neither list.
   - An opened place is its listing's Kosher box (`kosherBox.ts`: the
     editor's facts row headed by a hechsher): Hechsher, Meat, dairy or
     parve, Certificate, What isn't kosher?. A new value only highlighted,
     a changed one with "was …", What isn't kosher? compared only for
     being there. Use this takes only the rows it changes; Edit is the
     listing's own Kosher box, filled with the list's, saved onto the
     listing as it is now (everything else as it is today, not as it was
     when the list was read). Reads is last: the place's pages on the
     lists, with no switch, and Add a page (its page on Keystone-K's list).
   - No hechsher left: the rows crossed out, "Not on Keystone-K's list",
     Archive the listing / Edit / Keep the listing, and "It's <name> now"
     only when the list has a place by a near name. Renamed, archived (an
     edit that leaves none files a removal), Edit on a removal and Add a
     page are each filed as the list's own suggestion and approved at once
     (`POST /api/admin/watches/kosher`), so the listing's history says so.
   - New on a list: a Place box (name, address, category, Google's line)
     and a Kosher box, Add it / Edit (the whole new-listing editor, filled
     in) / Leave it out. One left out isn't shown again.
   - An older finding wider than the box shows whole, with Compare. A
     grocery has no hechsher, so no Kosher box: its findings show whole.
   - Food only (the user, Oct 22: "We only need to check Food, not grocery
     stores"). Groceries aren't on the page and no new grocery is
     suggested; they're still matched with the lists, so one on a list
     isn't a new place (`KOSHER_JOB_CATEGORIES`, `kosherJob.ts`).
   - Not as drawn: the tabs show their counts on all four (the other job
     pages hide an empty one), and "It's … now" uses the list's full
     name for the place.
7. Eruv. **Built Oct 22** (compared with its drawing on dev, computer and
   phone; the eruvim stubbed in the browser):
   - Each eruv's website is read every day, by code with no AI
     (`eruvWebsite.ts`, `eruvWebsiteRun.ts`), for its hotline and its
     email-alerts link. Hotline: offered only when the eruv's number is
     gone from the page and exactly one other number is there; the eruv's
     wording ("option 3") stays while the number does. Email alerts:
     offered only when the eruv has none or its link is gone, and the page
     has exactly one sign-up link. Where it goes and the website itself
     are never compared.
   - The daily run gives each eruv website its own watch (`createdBy`
     "eruv website", no migration), takes away one no eruv has, and keeps
     a paused one. A change is filed as an ordinary eruv suggestion from
     "Its website (automated, eruv)", waiting on Eruv status, not the
     moderation queue; the same reading is never filed twice, and a newer
     one replaces one still waiting.
   - The page: "N eruvim have an update from their websites", tabs To
     check / Can't be read / Checked. An opened eruv is Details (Use this
     takes only the rows it changes; Edit is the eruv's own suggestion
     form, filled with the website's, "Save to the listing"), Status (green
     Up, the words, the date, "on the site at once"), Map, and Reads (the
     website's switch, a line per page, merged into "Status page · Status,
     Details" when the status page is the website; × asks before it stops
     reading; Find its status page, Add a page, Add its emails, Read them
     now, Open its listing). An email it couldn't read and "Its page dates
     each week's post" stay in Reads.
   - The Watches tab's Eruv row now counts To check, and an eruv's website
     isn't listed among the other watches.
   - Not as drawn: a map that didn't load can't say "last read Oct 15"
     (a failed read overwrites that date); the Reading switch is the
     website's only, so an eruv with no website has one that does nothing;
     "was …" shows the whole old value, as on every other page; an eruv
     with no hotline is never given one.
   - **Live once it reaches `main`:** the daily run then adds a website
     watch per eruv in production and files what differs. Nothing is
     written before that.
8. Watches tab tidy-up. **Built Oct 22** (the user's go-ahead):
   - The "Menu" section is gone: the daily run's menu watches aren't
     listed (an admin's own watch on a menu still is). A menu page that
     didn't open this morning is now on Main dishes instead: the place is
     in Can't be read, "Menu didn't load", and its line in Reads says
     "didn't load" (`menuDidntLoad`, `watchJobs.ts`). A read of that page
     since (Read now) clears it. The Dishes row's "didn't load" counts the
     same places.
   - The tab no longer looks like it reloads: the list shows once its own
     read is back, each job row's counts as theirs are ("Loading…" until
     then), and coming back to it shows what it last showed while it reads
     again. Job pages still load afresh each visit.
   - Faster loads (the user's go-ahead, "solve it appropriately"). Opening
     the tab re-runs no job, but two reads fetched outside sites live: the
     Kosher page read Keystone-K's and Mekor's lists every time, and the
     tab's Hospitals counts asked Refuah. Now each list's run keeps what
     it read on its watch (`last_check.listRead`, no migration) and the
     Kosher page shows that; it reads a list live only before the list's
     first run since this change (so once per list, on its next daily run
     or Check now). The tab asks for Hospitals with `?counts`, which skips
     Refuah. Every admin read also checks the sign-in and the community's
     admins at once rather than one after the other.
   - Opening a job page does no work (the user, Oct 22: "why is AI
     reading menus and searching places' websites when we're just trying
     to load what we already did"). Mikvah hours and Shul times searched
     the website of every place with no page on each open, because the
     morning's search threw away a "found nothing". It now keeps why, and
     when, as a never-read watch per place and job (`hours search`,
     `recordSearch` in `hoursJobRun.ts`, no migration); the page shows
     that, or "Not searched yet" until the first morning run or Check
     now reaches it. Main dishes read up to 5 never-read menus by AI on
     open; a new daily cron, `/api/cron/read-menus` (07:30, `vercel.json`),
     reads up to 5 a morning instead (`menuPlaceRead.ts`), and "Read now"
     still reads one on demand. On dev nothing runs the crons, so dev
     shows "Not searched yet" until Check now.
   - A row moves as soon as it's decided (the user, Oct 22: "I would've
     expected it to move to the other tab"). Rows used to stay in the tab
     they loaded in for the whole visit. Now each row's tab follows what it
     is now, on all five job pages. Used or kept with nothing left goes to
     Checked; reading turned off goes to Off; a stopped page goes to Can't
     be read; Read now that finds an update goes to To check. The tab counts
     follow. On Kosher, a new place added or left out, and a finding that
     matches no place, leave the page once decided. Off stays open while
     it's the tab showing, even after its last row leaves.
   - Eruv status (the user, Oct 22). Center City's map said "timeout",
     but that was a dev row left from Oct 15: a good read of an unchanged
     map saved nothing, so it never cleared an old error. Production
     reads it fine. Now a good read clears it, and Read them now dates the
     map's read even when the map is the same. Details named no source
     until the daily run had given the eruv's website its watch, and dev
     never runs that. Now the box says "Read from its website · not read
     yet", and Read them now gives the website its watch and reads it
     (`POST /api/admin/watches/eruv { action: 'read' }`).
   - Main dishes: a menu read that agrees with the listing is kept (the
     user, Oct 22: "If I add the menu it should have that as it's date last
     seen"). Adding a menu, Read now or a photo whose dishes are all the
     listing's already dates them "seen" from that menu, as Use this would,
     and the row goes to Checked. A read with anything new still waits.
   - Shul times: a calendar's week that's the same now shows what it
     read (Rodeph Shalom, Leyv Ha-Ir: "Same" with nothing under it). The
     week's dated lines show in a "This week's schedule" box, "Same as" its
     page, until an update to it is kept.
   - Shul times: the South Philadelphia Shtiebel's calendar is read from
     its "Add our Calendar" link (`calendar/u/0?cid=…`); its embed is drawn
     by a script. It still needs its page: Add a page,
     southphiladelphiashtiebel.org/calendar.
   - Mikvah hours: notes as updates (the user, Oct 22). Ohel Leah's pages
     hadn't changed since notes began to be read, so the morning run never
     read their notes. A page last read before then (`NOTES_READ_FROM`, the
     merge of #340) is read once more. A note that differs from the
     listing's only in its spacing (Lower Merion's blank lines) is the same
     note. On dev, Read them now reads them.
   - Main dishes: menus read better (the user, Oct 22). A menu page's
     pictures that say they're the menu are read beside words that name
     dishes, and add what only they name (LUHV: four products in words, its
     menus as pictures). A holiday's menu link comes after the everyday
     one (House of Kosher's Thanksgiving PDF came first). House of Kosher's
     menu link is still the Thanksgiving PDF: set it to the catering menu.
   - Main dishes: up to three menu pages per place, put together (the
     user, Oct 22). A menu link is read with the other menu pages its
     website links to (Rita's location page and Treats page, Playa Bowls'
     Bowls and Smoothies, the Sweet Shop's Catering and Sweet Shop);
     dishes from the first page come first, each once, ten at most. Each
     page is an AI read, from the morning run's budget too. A picture's
     alt text counts as the page's words (Rita's Blendini, Concrete and
     Shakes are named only in pictures); a Wix picture's address is read
     whole (the Sweet Shop's Bakery Menu came out broken). A chain's
     "Find a bakery" or locations page is never a menu page. A menu page
     whose pictures have alt text has a new fingerprint, so the morning
     run reads it once more. On dev, Read now on each.
   - A dish added by hand on the Dishes page (Edit, Save to the listing)
     is dated "seen" that day, as one added through the queue is; it
     showed no date until a reading found it (the user, Oct 22). Never an
     "on its menu" date, so a read that misses it still can't cross it out.

Each page is compared with its drawing, side by side, before it's called
done. All of it is on dev. Anything live (Refuah watches, hospital fields)
waits for a yes.

## Planned: keeping listings current (agreed Oct 21, not built; to be drawn first)

The user, Oct 21: Main dishes needed no watch set up. A food place's
Google website was enough: the reader found its menu and the tab listed
it. The same should hold for everything the site keeps current.

**Drawn Oct 21:** https://claude.ai/artifact/RLGXHudw7AjUC3FKmyor14 (a
page of its own; the design canvas couldn't be opened from this login).
The main page, Mikvah hours with three sources, Hospitals, a finding to
compare, and one it can't read, on desktop and phone.

**Settled with the user, Oct 21 (after the drawing)**
- **The tab stays "Watches".** Main dishes folds into it as the Dishes job.
- **A switch per job, and Off per place.** A job is switched on per
  category, for what the reader can read in it (named hours fields, times,
  a menu); "Mikvah hours" is Philly's name for one, so it fits any
  community. With a job on, any place can be turned off. Every reason a
  place isn't read (no menu, no hours online, not on Refuah, turned off)
  is one Off section saying why, with "Turn back on", which reads it
  straight away and puts it back where that read belongs.
- **"Compare"** opens a finding: in place on desktop, its own screen on
  the phone. **Approve line by line,** a tick per line, like dishes.
- **"Nothing on Refuah yet"** is its own quiet section on Hospitals (a
  match with no contacts: nothing to do).
- **A newsletter is one of its shul's sources.** An email from a sender
  nobody has linked shows at the top of Shul times ("Which shul is it?" /
  "Ignore"). An eruv's status email stays set on the eruv.
- **A finding a visitor also sent in** says "also sent in by a visitor, in
  the queue"; approving either settles both.
- **A source says which fields it's for,** so a hand-added one can be
  instead of or as well as a found one; for its fields it wins. When two
  sources disagree, the finding shows both.
- **Every hand-added source says what the reader did,** worked out on its
  own: "On its website, but the reader didn't find it there on its own" or
  "Not on its website", rechecked each time it searches that website again.
  "The reader gets smarter" means the user brings a miss back to a
  session and the reader's code changes when it's a pattern (with a test
  on that real page); it never learns on its own.
- The user expects few findings a day once everything is connected; an
  admin validates them.
- Kosher certification when the two lists disagree: built with step 5
  (each list's line beside the listing's), not drawn.

**The idea**
- **Every listing is connected to its source automatically,** from what
  we already know. Food places, shuls and mikvahs start from the website
  Google gave us, and the reader finds the right page on it. Hospitals are
  matched to Refuah by map position. An eruv is found from its website.
- **A manual source is the fallback,** for when it can't find one or
  finds the wrong one, as "Give its menu link" is on Main dishes.
- **One admin page, a row per job:** Dishes, Shul times, Mikvah hours,
  Hospitals, Eruv status, Kosher certification. Each row has its counts
  (checked, to check, can't be read, a source that didn't load today).
  Each opens a Main dishes-style page with every place in that category:
  where it's read from and why ("Found from its website's Menu link",
  "Matched to Refuah's Pennsylvania Hospital, 800 Spruce St", "Added by
  you"), when it was last read, what it says next to what the listing
  says, and for one it can't read, why and the ways out.
- **No Watches tab.** A source covering many places becomes a job of its
  own: Keystone-K's list is "Kosher certification", with each food place
  on it or not. A shul's newsletter is one of that shul's sources. A
  broken source shows on its job's row, and the email alert stays.

**Decided (the user, Oct 21)**
- **Findings go to the job pages,** next to what the listing says, not the
  moderation queue. The queue keeps what people send in. Today the shul,
  mikvah and Refuah watches file to the queue.
- **Refuah: build it now;** the user asks Refuah afterwards. Checked Oct
  21: its data service can be searched from a server, with no browser
  (`hospitals:list` by map position, nearest first, and `hospitals:search`
  by name, both with addresses and map positions). It's the service its
  own site uses, not a published one; its robots.txt allows everything;
  its terms weren't read. Match by map position, not name: searching
  "Pennsylvania Hospital" put HUP first. Penn Presbyterian and
  Pennsylvania Hospital are on Refuah now but empty (no liaisons, no
  services).
- **The eruv works the same way:** its status found from its website, and
  where it can't be, the user says on the Eruv page how to find it. Status
  is already read by code from a page or an email (6c above), and goes
  live with no approval; that stays. What moves is where its source is set
  (now the Watches tab). It matters most on Friday afternoon, so it's read
  more often then.

**How sources work**
- **A place has a list of sources, not one link.** A mikvah may have a
  women's hours page, a men's and a keilim page, each saying what it's
  read for, with its own last read and problems. Found ones and ones an
  admin adds sit side by side. **And one source can serve several
  places** (Refuah, Keystone-K's list, one page for two mikvahs).
- **It remembers where it found things.** Next time it goes straight to
  that page rather than searching the whole website. It searches again
  only when that page breaks, stops having the thing, or once a month.
- **It watches the page with the link, not only what it links to:** a
  restaurant uploading "menu-fall-2026.pdf" under a new name each season
  is noticed that way.
- **A source an admin added is never replaced by the search.** One it
  found itself can be, and the page says so ("Its menu moved: now read
  from …"). No learning beyond remembering: the page can always say why
  it reads where it reads.

**Build order**
1. **Finish menus:** BUILT Oct 21 on `redesign/oct18-fixes`. What it does
   and doesn't do yet:
   - **Already true before this, and easy to miss:** approving a reading
     on Main dishes writes the page it was read from as the place's menu
     link (`approve_menu_dishes`; since Oct 21 `setMenuDishes`). So most "menu links" are
     the reader's own finds, and were watched daily already.
   - **New: a place with no menu link yet** is watched on the page its
     latest reading found the menu on. Conditions: dishes were read there
     (not photos, a failure or "no menu"), and the page is on the place's
     own website or is a PDF (`foundMenuPage`, `menuWatch.ts`). A reading
     waiting or skipped counts. A menu link that's an ordering app gives
     way to it.
   - **New: a watched page that stops opening sends the run back to the
     website** (`findMenus`, as Main dishes does). A menu found on another
     page of the place's own site is saved as a reading waiting on Main
     dishes: "Its menu page stopped opening, and the menu is now at …
     Approving makes that its menu link." The watch keeps failing until
     then, and its error says where the menu went, so the admin's email
     says it too.
   - **Never moved without a person.** That's stricter than the plan above
     ("one it found itself can be replaced"): a found link and one an
     admin typed look the same once approved, so the run never tells them
     apart and only ever proposes. Once a reading is from another page
     (waiting, skipped or approved), that place isn't searched again.
   - **Budget:** one search per daily run (`MENU_SEARCHES_PER_RUN`). It
     takes one of the run's three AI reads, so the run's AI time doesn't
     grow. Check now always searches.
   - **Tried on real sites, with writes refused:** PLNT Burger, watched on
     a dead page, found `/menu` and would have saved six dishes with that
     note, in 38s (nearly all of it the AI). Judah's menu times out at
     45s on the AI on every read, the ordinary one too: not new, worth a
     look. Dev's 11 failing menu watches all open fine now: stale.
   - **Not done yet:** the monthly re-search, and searching again when a
     page still opens but no longer has the menu. Both need somewhere to
     keep when a place was last searched. Watching the page that links to
     a PDF (a "menu-fall-2026.pdf" renamed each season) is also not done.
2. **Hospitals:** BUILT Oct 21 on `redesign/oct18-fixes`. What it does
   and doesn't do yet:
   - **The Watches tab starts with two job rows,** Dishes and Hospitals,
     each with checked / to check / can't be read / didn't load today.
     The whole row opens its page. Main dishes is no longer a tab: it's
     the Dishes page (`/admin/watches/dishes`; the old address
     redirects). Hospital watches are off the tab's list, and "Hospital
     on Refuah" is no longer something Add a watch offers.
   - **Matched automatically, every morning, before the reads**
     (`syncRefuahWatches`, `refuahMatch.ts`): each hospital listing on
     the map gets the Refuah hospital nearest it, if within 0.2 mi. Two
     listings nearest one record: the nearer gets it. Refuah's list is
     asked per hospital position (`hospitals:list` with no position
     returns 50 hospitals, none in Philly). It never touches a page an
     admin gave, and removes only its own watches. Refuah down: nothing
     removed.
   - **The Hospitals page** (`/admin/watches/hospitals`): To check, Can't
     be read (not found, or its page didn't load), Not read yet, Checked,
     and quiet "Nothing on Refuah yet" and "Off" sections. Each row says
     what it is matched to: "Matched to Refuah's Pennsylvania Hospital,
     800 Spruce St · same spot on the map", or "Given by hand: …". Opened:
     its Refuah page, Check now, "Choose a different Refuah hospital" (the
     nearest four, or a pasted link), "Fill it in yourself", Turn off.
     Can't be read offers the nearest four and "Not on Refuah"; Off has
     "Turn back on", which reads it straight away.
   - **"Not read yet"** includes a watch whose page opened but whose
     result wasn't kept: every Refuah watch today except dev's CHOP,
     since the live site runs `main`'s code. Each fills in on the first
     run of this branch's code, or on Check now.
   - **Live data, read only (Oct 21):** all seven Philly hospitals match
     on their own to the same Refuah pages they were given by hand, so
     the first live run adds and removes nothing.
   - **Not done yet:** the per-category job switch isn't built.
     (Differences wait on the page with Compare since step 6.)
     "Off" here is the hospitals' own (a paused watch, or a "not on
     Refuah" marker watch).
3. **Mikvahs:** one dry run first (read each website once, save nothing,
   count how many it reads right), then connected.
   - **Dry run, Oct 21, live data, nothing saved**
     (`scripts/hours-pages-dry-run.mts`, finding pages with
     `hoursPages.ts`): 4 of 4 mikvahs read right, from 14 pages, with no
     page given by hand. Lower Merion: its home page (women's), Men's
     Mikvah and Keilim Mikvah pages were all found from its home page's
     links. Women's reads 7:30–9:30 PM, Sun–Thu, against the listing's
     8:30–10:30 PM, the known change. Men's agrees (its Friday "until 1 hour
     before candle lighting" rightly left out). Keilim agrees. Mei Shalva,
     Moishe Zvi and Ohel Leah are by appointment only: nothing read from
     any of their 10 pages, which is right; Ohel Leah's "the kelim mikvah
     closes at sunset" isn't weekly hours, and wasn't read as any.
   - **One judgement call:** "every weeknight" was read as Sunday to
     Thursday; the listing has Sunday closed.
   - **The pages the AI read hours from are exactly the ones with a clock
     time on them** ("7:30PM", "4:30 AM"), so the daily search for pages
     can be done without the AI.
   - **Connected, BUILT Oct 21 (not merged).** Every morning, before the
     reads, `/api/cron/watches` searches each mikvah's website
     (`syncHoursWatches`, `hoursJobRun.ts`): its home page and up to four
     of its links that may give hours (`hoursPages`), each kept if it has
     a clock time on it (`looksLikeHours`). Fetches only, no AI; all
     places at once, each given 20s. A page it finds is watched as
     "listing pages (found)" and read by the AI on its first morning
     (a page found, not given by hand, used to only get its fingerprint
     taken then, so it was never read until it changed; fixed Oct 21),
     within the run's three AI reads shared with menus, so a few new
     pages can take a few mornings; Check now reads one at once. It
     never touches a page an admin gave, and removes only its own
     pages it no longer finds; one that just didn't load, a website that
     won't open, or a place turned off is left as it is.
   - **The Mikvah hours page** (`/admin/watches/hours`, a row on the
     Watches tab; its pages aren't listed below there any more): To
     check, Can't be read, Not read yet, Checked, and a closed "Off". The
     intro says what's read ("Women's Hours, Men's Hours and Keilim
     Hours"). Opened, a place shows each page it's read from, where that
     came from ("Found from its website's Men's Mikvah link", "Added by
     hand") and what its last read found, with Check now; one added by
     hand can be stopped. Can't be read says why ("Read its website: no
     weekly hours on it.", "No website on Google.", "Its website wouldn't
     open: …"), with "Fill it in yourself", "Give its hours page" and "No
     hours online". Any place can be turned off; "Turn back on" reads its
     pages straight away, or searches its website then and there.
   - **Live data, read only (Oct 21):** each of the four already has its
     home page watched, given by hand on Oct 19. The first live run adds
     Lower Merion's Men's Mikvah and Keilim Mikvah pages, and nothing
     else: its home page is the one given (as http://; a page is the same
     page with http or https, www. or not, `samePage`), and the other
     three are by appointment only, so they show under Can't be read
     ("Read its page: no weekly hours on it.") until "No hours online" is
     pressed for each. That is the deployed code writing watches, so it
     happens only once this branch is merged.
   - **Not done yet:** no "Add photos"; no "Read it for" per page
     (every page is read for all the named hours); "What the reader did"
     isn't shown for a page added by hand; there's no monthly re-search
     (it's every morning, cheap since it's fetches only).
4. **Shuls:** the same dry run. Its count decides how far this goes for
   shuls, or whether newsletters are the real source.
   - **Dry run, Oct 21, live data, nothing saved**
     (`scripts/shul-pages-dry-run.mts`, finding pages with `timesPages`:
     links called davening, minyanim, services, schedule, Shabbat,
     calendar…). Run twice. Of 14 shuls:
     - **6 read right, and would file only what's right:** B'nai Abraham
       (its Minyans page, agrees), Rodeph Shalom (its calendar's
       Thursday online minyan, as on Oct 20), Shivtei Yeshuron (agrees),
       Mikveh Israel (Friday night 6:00 PM, new), Kol Tzedek (Friday
       6:30 PM, new, as on Oct 19), BZBI (its week from its Shabbat
       page's calendar; the listing has no times).
     - **3 read their times right but would also file something wrong:**
       Mekor Habracha (the OU's daily 1:00 PM Tehillim phone call on its
       bulletin board, as a minyan every day, both runs; and "Fri 7:00 PM"
       beside the listing's "at candle lighting, not after 7:00 PM"),
       Society Hill (its once-a-month family service as every week, and
       end times: "6:00–7:15 pm, was 5:30pm"), Kesher Israel (only end
       times: "8:00 AM – 8:40 AM, was 8:00am", six times over).
     - **2 have nothing to read:** Leyv Ha-Ir (its calendar is empty this
       week, as on Oct 20), South Philadelphia Shtiebel (its calendar is
       drawn by script; its holiday pages rightly read as nothing).
     - **3 turn the reader away:** Lower Merion Synagogue, Sons of Israel
       (406), Chabad of the Main Line (403).
   - **Finding the page works:** 8 of the 9 pages given by hand on Oct 19
     were found on their own (not Chabad of the Main Line's, whose site is
     blocked). Two finder bugs the run turned up, fixed for mikvahs too: a
     page's query was dropped (Leyv Ha-Ir's pages are all
     `index.cfm?…pageId=`), and /calendar and /calendar/ were two pages.
   - **The AI varies on labels between runs:** Rodeph Shalom's and BZBI's
     Shabbat morning service was Shacharis one run and "other" the next.
   - **Decided (the user, Oct 21):** "I don't mind adding shuls
     automatically, but we should be able to see what they're reading…
     and then an admin can remove or replace them or just check the
     website". So shuls are connected the mikvahs' way, and the reader's
     faults were fixed first. And on Mekor's Friday ("at candle lighting,
     not after 7:00 PM" against the website's "7:00 PM" in summer): "we're
     just trying to show what they have. So if they say it one way we can
     adjust and show it on our site that way." A website's different
     wording for the same time is a change to suggest, not a match.
   - **Reader fixes, BUILT Oct 21 (not merged)** (`scheduleReader.ts`):
     a service not held every week ("once a month", "the last Shabbat of
     the month"), a phone call, a class or a program is left out, by the
     prompt and again after it; a time range ("6:00–7:15 pm") is its
     start; a time labelled for one season ("Summer", "Winter") is read
     as "Summer only"/"Winter only", and compared only in its season
     (`compareTimes`), so a listing with both seasons' times isn't
     offered the other season's.
   - **Reader fixes, BUILT Oct 22** (`scheduleReader.ts`): a rule in a
     sentence is the rule the listing keeps: Sons of Israel's
     "Approximately 15 minutes before shkiah." is 15 min before Sunset,
     not a change (a full stop, "shkiya", "within 10 minutes after",
     "following", and times up to 60 characters). "Within 10 minutes
     of" candle lighting or havdalah is still kept as written: it
     doesn't say before or after. A morning "Shabbat service" or
     "Services" is that day's Shacharis (Kesher Israel's was left out as
     a program), its start the time and its end in the notes; a range
     with no am/pm ("9:00–11:30") is its start.
   - **Dry run again after the fixes (Oct 21, nothing saved):** the
     Tehillim call, the monthly family service and Kesher Israel's end
     times are gone. What would be filed: Rodeph Shalom's Thursday
     8:10 AM and BZBI's week (as before), Mikveh Israel's and Kol
     Tzedek's Friday nights (new), Society Hill's Friday 6:00 PM (was
     5:30 PM) and Mekor's Friday 7:00 PM (was "At Candle Lighting (not
     after 7:00 PM)"), both what the websites say.
   - **Connected, BUILT Oct 21 (not merged):** the same morning search
     as mikvahs, for shuls (`timesPages`), and the **Shul times page**
     (`/admin/watches/times`, a row on the Watches tab: "N shuls, from
     their websites"). The same sections as Mikvah hours. Opened, a shul
     shows each page with what it read ("It read": Shacharis Mon–Fri
     7:00 AM…), "Stop reading this page" on any page (a stopped page is
     kept, turned off, and never found again; "Read it again" turns it
     back on and reads it), "Open its website", and "Give another page
     with its times" to replace one. Mikvah hours has the same controls.
   - **Live data, read only:** the first live run adds the shuls' found
     pages and reads them over the next mornings, filing what differs to
     the queue. That is the deployed code writing, so it happens only
     once this branch is merged.
   - **The newsletter stays the source** for the three shuls whose
     websites turn the reader away (Lower Merion Synagogue, Sons of
     Israel 406, Chabad of the Main Line 403) and for the Orthodox shuls
     whose times move each week.
5. **Eruv and Kosher certification** move onto job pages. **BUILT Oct 21
   (not merged).** The Watches tab stays, under that name: it is the page
   of job rows, and the one-off watches below them.
   - **Eruv status page** (`/admin/watches/eruv`, a row on the Watches
     tab: "N eruvim. Goes live on its own"). Sections: Can't be read (no
     source, or an email it couldn't make out), Didn't load, Read. Each
     eruv says what it reads from ("Read from its status page, …", "Read
     from its emails, from …"), with Check now, "Use a different page"
     and "Stop reading" (confirmed on the page). The row's "to check" is
     "–": an eruv's status goes live with no approval.
   - **"Find it on its website"** searches the eruv's website for pages
     that say it's up or down (`eruvFind.ts`, the eruv words in
     `hoursPages.ts`) and offers each, with what it says: "Read its status
     from here". **Offered, never set on its own**, because a status shows
     on the site at once. Saves nothing until the admin picks one.
   - **Elkins Park stays "No source":** its website in the guide
     (yiep.org/eruv-map) answers 404. Its website or status page is the
     user's to give.
   - **Kosher certification page** (`/admin/watches/kosher`, a row: "N
     food places, from Keystone-K's and Mekor Habracha's lists"). Both
     lists are read when the page opens and compared with every approved
     food place (`kosherJob.ts`). Sections: To check (a list says
     something the listing doesn't, each to Compare on its row (step 6),
     "here after tomorrow morning's read" or decided before), On a list,
     not in the guide, and closed: Checked, Decided before, On neither
     list. Each list shows its size and its morning read, with Check now
     and Pause. This answers "Kosher certification when the two lists
     disagree": a place shows each list's line beside the listing's.
     Redrawn Oct 22 as the listing's Kosher box (see "Building next: the
     job pages", item 6).
   - **The lists' morning reads file what differs,** as before; since
     step 6 it waits on this page, not in the moderation queue.
   - **"Add a watch" no longer offers an eruv or a kosher list**; they are
     given on their job pages.
   - Fixes found on the way: every site on WordPress.com (192.0.78.x) was
     refused as a private address, Elkins Park's eruv among them
     (`menuReader.ts`; only 192.0.0.x and 192.0.2.x are set aside); a
     Keystone-K entry
     whose label's colon sits outside its bold read as ": Dairy – …"; an
     eruv website that didn't open now says "Its website, …, wouldn't
     open: …"; Mekor's "updated 2026-10-12" says "Oct 12".
6. **Findings on the job pages: BUILT Oct 21** (the user: "let's do step
   6"; on `redesign/oct18-fixes`, not merged). What a watch finds waits on
   the job page that reads the place (Mikvah hours, Shul times, Hospitals,
   Kosher certification), on its row, beside what the listing says, not in
   the moderation queue. "The queue keeps what people send in."
   - **Storage is unchanged.** A watch still files a pending suggestion,
     so the runs' never-twice rule is the same. The queue leaves out those
     a job page shows (`watchFindings.ts`, `onAJobPage`). Refuah's and the
     kosher lists' always are. A website's or a newsletter's are only
     when its place is in a category a job reads, so a hand-added watch
     elsewhere still files to the queue. Decided ones stay in the
     queue's history.
   - **Compare** opens a finding: in place on desktop, its own screen on
     the phone with "‹ {job}" back. It shows a line per field: the
     listing says / its page (newsletter, Refuah, Keystone-K, Mekor) says.
     There is a tick per line; untick one and "Update 2 on the listing"
     becomes "Update 1". Update is the queue's own approval, with
     `only` (the ticked lines; the unticked stay as the listing says), so
     it dates the listing ("confirmed by Refuah" and so on) and refreshes
     the site. "Skip for now" is a rejection: it's not shown again until
     its source says something new.
   - **A line that would empty the listing starts unticked.** This is for
     a field what was read leaves empty but the listing has. An approval
     replaces the details whole, so a finding filed before the listing
     gained, say, its main dishes would have emptied them (seen in dev,
     Oct 21: Keystone-K findings from Oct 17). It also covers a list
     taking a hechsher off; ticking it empties the listing's. The "confirmed
     at" date isn't a line: every approval sets it.
   - **Sections count what waits:** a place with a finding waiting is To
     check. Once decided, it's Checked, and its row says "Updated on the
     listing Oct 21." or "Skipped Oct 21: shown again if its page
     changes." A row acted on stays where it was until reload. Check now
     that files something fetches it, to compare there.
   - **The Watches tab** says findings wait on each job's page. "Add a
     watch" says which page a place's findings wait on (the listings carry
     `job`), or the moderation queue when no job reads it. Digest emails
     link to the job page (built before).
   - **Not built:** "also sent in by a visitor, in the queue" (planned as
     a follow-up). A place with a visitor's suggestion waiting is still not
     filed, and its row says so with a link to the queue. Also not built:
     Undo (not planned); a check on a real phone; and a per-minyan view of
     a schedule's change. A whole week's minyanim show as two blocks, so
     finding the one changed time is by eye.

7. **One page for every job: Shul times and Mikvah hours BUILT Oct 21**
   (on `redesign/oct18-fixes`, not merged). The user, after seeing six
   pages that each looked different: "Each listing is there, showing the
   source reading from, the results, how it compares to what we have... A
   way to have it check again, a way to replace the source or add a
   source." So a job page is one list (`JobPage.tsx`), in tabs (the user:
   "can the to check, can't be read, not read yet be tabs so the page
   isn't so messy"): **To check · Can't be read · Not read yet · Checked**,
   and **Off** when there are any, each with its count, A–Z within. It
   opens on the first with anything in it. A row stays in its tab for the
   visit, so one just checked doesn't vanish; its pill says what it is now.
   - **Every row, closed,** has the place, how its last read compares
     ("Differs from the listing", "Couldn't read", "Didn't load", "Not
     read yet", "Same as the listing", "Off"), where it read from and when
     ("From mekorhabracha.org/davening · read Oct 21"), and **Check now**
     (Turn back on for one that's off). A finding to Compare sits under it.
   - **The count at the top** is "5 need you · 16 shuls".
   - **Opened:** each page, how it was found, what it read and how that
     compares, with "Use a different page" (gives one and stops the old
     one) and "Stop reading this page". Stopped pages have "Read it again".
     Then "Add a page", "Turn off this place" (or "No times online" for
     one with nothing to read), "Open its listing" and "Open its website".
   - **Check now works on every row,** "Not read yet" included: it reads
     all the place's pages. A place with no page has its website searched
     now, and the pages found are added and read. Opening the page also
     adds what its website search finds, as the morning's run would. So a
     row is never stuck with nothing to check, and the Watches tab, which
     searches nothing, now counts those as not read rather than "can't be
     read" (it showed 13 can't be read for Shul times, against the
     page's 4).
   - **Next, once the user has seen it:** Dishes, Hospitals, Eruv and
     Kosher onto the same page; the Watches tab's "Menu" list goes (it is
     Dishes again; done Oct 22, item 8 under the job pages); and the tab's
     row counts come from the same statuses.
   - **Decided Oct 21 (the user):** a read that agrees with the listing
     clears that watch's older finding still waiting (Mekor Habracha's
     Oct 20 finding, which its Oct 21 read agrees with). Not built; see
     "Building next" above.
   - **Redrawn for Shul times, Oct 21, not built**
     (https://claude.ai/artifact/B3vwpSiqwdK833s9VAVHBc, replaces board 6
     of the keeping-current drawing for this page). The user: "website
     wins", mimic it ("if the website says 10 minutes before shkiyah that's
     what we want"), and show "what the reader proposes the new listing
     should be and how it differs. Like the moderation queue."
     - No Compare step: the row says the change in a line; opened, it is
       the proposal in the listing's own boxes, changes marked, with Use
       this · Edit · Keep the listing.
     - A Reading on/off switch per shul, in place of Turn off / Turn back
       on / No times online.
     - **Usual times and this week's schedule are proposed separately**
       (the user: "there's a whole difference between this week schedule
       and usual times"). A page of usual times proposes only usual times;
       a posted week proposes only that week, as This week's schedule
       (Use this week · Edit · Skip this week).
     - **"Not read yet" goes** (the user, Oct 21): a page is read as soon
       as it's found, so the tabs are To check · Can't be read · Checked
       (and Off).
     - Found drawing it, **fixed Oct 21:** the reader didn't write seasons
       the website's way. Mekor's website gives Friday night as 7:00 PM in
       summer and around candle-lighting in winter. Its Oct 20 finding kept
       the all-year row, and its Oct 21 read called the listing a match.
       Three causes:
       - a page of usual times was compared in this season only;
       - "at candle lighting (not after 7:00 PM)" counted as the same as
         "at candle lighting";
       - the AI split one Friday night minyan into two or three prayers.

       Now a page that labels seasons is compared season by season, a
       rule's limit counts, and evening prayers at one time are one
       Mincha & Maariv. Read three times, Mekor's page gave the same
       proposal each time, as drawn. Mekor's Oct 20 finding is still
       waiting in the queue on dev.
     - **Read-only check of all 27 shul pages on dev, Oct 21:** besides
       Mekor, Kol Tzedek and Society Hill each propose one new Friday
       evening time. It also found pages that shouldn't be read, all
       added by the website search. **Fixed Oct 21:**
       - Beth Zion-Beth Israel had 5 pages, two of them High Holy Days
         pages, all showing the same site calendar, so each would propose
         the same week. Now pages that show one calendar are read as one:
         the page whose own words give the most times (its Worship page).
       - The Shtiebel's pages were its High Holidays 5785, Sukkot and
         Chanukah pages. A page for one holiday, one Hebrew year or a
         sermon is never read for shul times now, whatever folder it's
         in.
       - The Rosenbach (a museum, 5 pages) and Mikveh Israel's About and
         Visit pages passed because any clock time counted: opening hours,
         a footer's office hours. Now a shul's page needs a clock time
         beside a davening word (Shacharit, Mincha, services, minyan…).
       - Rodeph Shalom's calendar page loads; it was given by hand and
         read its calendar this morning. Nothing to fix.

       Of the 27 pages on dev, 16 are now stopped (3 had been stopped by
       hand already) and 11 are still read. Production has no found
       pages yet, so nothing there changes. The Rosenbach is archived on production; dev's copy is
       stale and still approved. The morning search takes away found pages
       it no longer finds, so it would have dropped them anyway.
       Open: the Shtiebel now has no page. Its home and calendar pages
       show no times the reader can see (production also reads its
       newsletter).
     - **A page's dated times are this week's schedule, Oct 21.** Mikveh
       Israel's home page gives "Shabbat Lekh Lekha", Friday 6:00 PM. It
       was proposed as one day's extra, "as well as the regular times".
       The user: "If we have specific dates then it should all go on this
       week." Now a website page's dated times are proposed as that
       week's schedule, from the first date to Shabbos, with the usual
       times those days kept in it. They are apart from its usual times,
       and a week already on the listing isn't filed again. The newsletter
       and the paste box still read dated times as before.
     - **A calendar posted as pictures is read, Oct 21.** Mikveh Israel's
       Calendar page has an empty event list. The month is two images,
       "Oct. High Holiday calendar 2026.png" and "Calendar September
       2026.png". Now a shul's page with no calendar and no davening time
       in its words is read from its calendar pictures, the way a PDF is,
       a week at a time. Each week becomes that week's schedule, like a
       calendar feed's.
       - Which pictures: ones whose file name or alt text says calendar,
         schedule, davening, zmanim or luach, then ones the shape of a
         printed page (upright, at least 1000 pixels tall). At most two.
         Never a logo, a banner or a photo. Never a picture that names a
         month the weeks aren't in, so September's is skipped in October.
       - Not on a page that gives its times in words, and never on a
         mikvah's hours page.
       - The morning search keeps a page with such a picture, as it keeps
         a PDF. Pages showing the same pictures are read once.
       - The pictures are downloaded only when the AI reads them. The
         page's fingerprint changes when a picture is replaced, on
         Sunday, and on Thursday when next week is added. So the daily run
         reads each week once. That is one AI read with images for each
         week.
       - Also fixed: "9:00 A.M." (with dots) was kept as text, so it never
         matched the listing's 9:00am.

       Dry read on dev, as of Thursday Oct 22, using the October picture:
       Mon/Thu Shacharis 7:15 AM; Mincha 2:00 PM Monday to Thursday;
       Friday 6:00 PM on Oct 23 and 5:45 PM on Oct 30; Shabbos 9:00 AM.
       It would file the two Friday times, each in its week's schedule.
       Read twice. On the second read the cheapest model missed Monday
       Oct 26's Mincha. Nothing was taken off the listing, because a usual
       minyan a week doesn't mention is kept.
       The page is still stopped on dev. "Read it again" on the Shul times
       page starts it again. Production has no found pages, so to use this
       there, give the page by hand.
     - **Kol Tzedek's calendar is read, Oct 21.** Its home page embeds a
       Google Calendar, but the embed names the calendar in base64, so
       the feed address the reader built was a 404. And Google's feed is
       every event the calendar ever had (4.8 MB), over the 3 MB a page
       may be. Now the name is decoded, and a calendar feed may be up to
       20 MB. Dev's home page now reads "Sat Oct 24 10:00 AM In-Person
       Shabbat Morning Services" and the rest of the week. Production
       watches the same home page (given by hand), so it reads the
       calendar once this is deployed; its newsletter is read too.
       Calendars the reader takes: iCal links, Google Calendar embeds,
       event lists in a page's scripts, and (since later Oct 21) a month
       posted as pictures. Not: one drawn by a script from its own server.

## Done Oct 27: the week's days when the clocks go back (on `redesign/oct18-fixes`)

- **The Minyanim view's week no longer loses a day.** It was built 24 hours
  at a time. Nov 1 has 25 (the clocks go back), so just after midnight that
  week Sunday showed twice and Monday never did. Days are now counted on the
  calendar. The same fix covers the spring day that has 23.
- **An item seen the day before reads "yesterday" after the clocks go
  forward too.** It took away 24 hours, so just after midnight the morning
  after, it said the date instead.

## Done Oct 26, last: "+ Add" in light apricot, with an edge (on `redesign/oct18-fixes`)

- **The floating "+ Add" is light apricot (`#fdba74`) with ink text and a
  1.5px deeper apricot edge (`#f59e5a`)**, on every screen that has it: the
  site's own and each category page's. Drawn as board O on the canvas
  `8qmL8PXNLN7qqfM7GK75ix`, after gold, ink, blue and brighter warm colours
  were turned down.
- **Smaller on the phone (48px), with the word "Add" there too.** Desktop
  stays 56px.
- **A named change to "colour only for meaning":** apricot (`--color-add`,
  `--color-add-edge`) means "you can add here" and is used nowhere else.
  Blue stays the colour of everything else you tap.
- Both buttons are one component now (`AddButton.tsx`).
- Not checked on a real phone yet.

## Done Oct 26, later: two small fixes from the user (on `redesign/oct18-fixes`)

- **A tap outside the home search's results only closes them.** It used
  to go on to what was under it: search "hospital", tap away, and Grocery
  opened. The next tap works as usual.
- **Each Has item counts as a filter.** Challah, chicken and wine show
  "Filters 3", not 1. Each one narrows the list again. A dropdown's
  choices (Meat or Dairy) widen it, so they still count once.
- **A "+ Add" that stands out** became light apricot, not gold (above).

## Done Oct 26: shuls' times read each week; an approval settles its finding (on `redesign/oct18-fixes`)

Found Oct 26 (read only, live): nothing from a shul's page had been filed
since Oct 23. Every finding from Oct 19–23 had been decided, and the
approved times are live. But a page whose text hadn't changed was never
read again, so a new week's times never arrived.

- **A shul's times page is read once each week, even if unchanged.** The
  week starts Sunday. A full read files what differs, like a changed page.
  The check keeps the week it read (`readWeek`). A compare after the
  listing moved doesn't count as the week's read. Mikvah and other hours
  pages are still read only when they change.
- **Shuls' pages get 20 reads a night of their own.** Past that, they share
  the run's 3, as before. Menus no longer hold them up. The cost is about
  45 shul pages × 1 extra read a week.
- **Compares go from 3 a night to 12.** About 45 pages are waiting to be
  compared after the Oct 23 approvals. At 3 a night, a listing like Mei
  Shalva's stayed dated Oct 18 for days.
- **A carried check keeps its own date.** A run that read only the phone
  used to re-date the old finding to that morning. So an approval made
  after the real read looked older than the finding, and Mikvah Ohel Leah
  and LMC men's kept saying "differs". They now settle once approved.
- **…and the two already stuck are read again (Oct 26, later).** Their
  stored checks were re-dated to Oct 26 07:49 before that fix, after the
  Oct 23 approvals they waited behind, so they'd never settle; the user saw
  them as two mikvahs "Waiting for you" with no change. Now a check that
  waited behind a suggestion is read again in full on the first night
  nothing waits for the listing (`stoodBehind`, `listingPageRun.ts`): what
  still differs is filed as a new suggestion, what doesn't clears. No
  database write. Also covers the Little Shul's home page (waiting since
  Oct 23). LMC men's "difference" was only spaces; notes ignore spacing
  since Oct 22, so its re-read should clear it.
- Reaches the live site with the next merge and deploy.

**Wrong place (built Oct 26, on `redesign/oct18-fixes`, PR 359):** a
Google change waiting for you has Accept, Keep as is and **Wrong place**.
Wrong place drops the match and everything it said: what Google wrote,
the check, Keep as is, its closure and its description, which shows on the
public listing. The listing's own values stay. Nothing checks its name
until it's found on Google or said not to be, so the place opens on Find
it on Google / Not on Google. The dropped place id is kept as
`googleWrong`; Find it on Google never offers it again, and the place-id
backfill script skips that listing.
- **Still open: BZBI Early Childhood** (matched to the temple's place id).
  It was decided with Keep as is before the button existed, so nothing is
  waiting, and only a waiting Google change shows Wrong place. Its Google
  phone is still read every night. Decided Oct 26 (the user): Wrong place
  stays on the waiting card only, not on an up-to-date place's Google box.

**Nothing skipped shows as read (built Oct 26, on `redesign/oct18-fixes`):**
the user: "really misleading that some things are skipped but shown as
read". A shul page or menu that loaded but needed the AI after the night's
reads were spent was recorded like a read: its read date moved, the run
said "Checked 108 of 108", and the tab counted it read. Now:
- **A watch skipped this way stays as it was.** Neither run date moves.
  The tab says Not reached, and the next night takes it ahead of those it
  read.
- **The run says so:** "Ran out of reads: N not read, for the next night".
- **The menus job** says "N couldn't be read" for a menu it couldn't find,
  and no longer counts that as read.
- **Enough reads for all of it:**
  - 40 shul-page reads a night instead of 20. All 32 pages are due the
    night their week starts, which would have left 9 on Oct 26.
  - The menus job gets 5 minutes instead of 1, and up to 20 first reads a
    night instead of 5. 18 places were never read on Oct 26; the old job
    managed about 2–3 a night.
  - The watches run starts watches until 250s instead of 200s. On Oct 26
    it did 108 watches in 143s with about 30 AI reads. The night every
    shul's page is read for its new week adds 32, which would have left the
    menus (checked last) for the next night. The slowest read seen is 34s,
    so one started at 250s still ends inside the 300s limit.
- Live: PR 360 merged Oct 26 (deployed 19:33Z), with Wrong place and the
  waiting-mikvahs fix. The mikvahs clear on the first nightly run after it.

**Found Oct 26, waiting on the user:**
- **Elkins Park Eruv's website page** (`yiep.org/eruv-map`) is gone (404
  since Oct 25). yiep.org now only links a Google map of the boundaries,
  from /our-community/. It has no status source, so its row says "Nothing
  gives its status" and the website failure (with its Stop) doesn't show.
  The user chose to change its website to `yiep.org/` in its listing: the
  next nightly run drops the dead page's watch and watches the new one.
- **Chabad of the Main Line's schedule page** answers every read with
  Cloudflare's bot check (403 since Oct 20). Stopped by the user Oct 26.

**Stop on a page that doesn't load (built Oct 26, own PR).** A page that
failed showed only Read it now; Stop was only under a working page's box.
Now its problem has Stop beside Read it now, asked first, for a shul's or
mikvah's page, an eruv's website, status page or map, a hospital's Refuah
page, and a food place's menu. Not offered when several pages of a site are
down together: that row stands for all of them, and Stop names one page.

## Built Oct 26: a shul's week, weekdays then Shabbos (on `redesign/oct18-fixes`)

Drawing: https://claude.ai/artifact/6piwThENnhVRoacWqEHBD1 (boards 1–6, and
1b, 3b, 4b, 5b beside them). Approved and built Oct 26: boards 1b, 2, 3,
3b, 4b, 5b.

Why: last week's week posts ran out after Shabbos Oct 24, and only shuls
whose page changed got Oct 25–31.

- **Shabbos goes first once the shul's last weekday minyan of the week has
  started**, for the dated boxes and the usual boxes alike
  (`shabbosComesFirst` in `schedules.ts`). Usually that's Friday's last
  Shacharis; a shul with nothing on Friday switches after Thursday's last;
  one with no weekday minyan at all, on Friday. After havdalah the week
  comes first again. Replaced the Thursday 6 PM switch.
- **A week post splits into two boxes:** "This week's schedule" (its
  weekdays) and "This Shabbos" (Friday night and Shabbos, with candle
  lighting from the shul's own times or the site's zmanim). Each box's
  Edit opens the post its times came from. When only the usual times are
  known there is no dated This Shabbos box; Usual Shabbos times stays.
- **The waiting card** is "Not on the guide yet" and "+ Add this week's
  schedule", with no footer.
- **Every shul page is read Thursday night and Friday night** (the 3 AM
  runs on Friday and Saturday), whether or not it changed, so this
  Shabbos's times and then next week's are in by havdalah. It used to be
  Sunday 3 AM (`weeklyReadDue` in `listingPageRun.ts`). The optional
  Friday-midday read on board 6 was not built.
- **A Shabbos post headed by a date alone** ("Fri Oct 30", from a shul's
  page) now goes by its dates; it showed "Fri Oct 30, Oct 30".
- **Differs from the boards:** dates use the site's format ("Oct 25–30",
  not "Sun Oct 25 – Fri Oct 30"); times that have started today are
  greyed; the dated boxes sit above the Yom Tov box and the usual boxes.
- **Not seen yet:** the first Thursday-night and Friday-night reads happen
  on the nightly runs after this deploys (Oct 30 and 31, 3 AM).

## Done Oct 24: every nightly job keeps a record; the watches all get checked (on `redesign/oct18-fixes`)

Found Oct 24: the live watches run checked 29 of 107 watches and stopped,
and the same the day before. 35 had never been checked. It had 60
seconds (copied from the AI routes on Oct 5, when it ran one watch) and
went through the watches in the order they were added, so it stopped in
about the same place every morning. Nothing showed it anywhere.

- **The watches run has five minutes, and an order.** Kosher lists first,
  then hospitals, eruv websites, shul times and mikvah hours, other
  websites, and menus last (the slow AI reads). A watch that missed a
  night (36 hours, since Vercel starts a cron any time in its hour) goes
  ahead of everything, and within each group the one checked longest ago
  goes first (`src/lib/watchRunOrder.ts`). No watch starts after 200
  seconds; what's left goes first the next night. The eruv maps now run
  alongside the start, not after every watch.
- **Six at once, kosher and hospitals always first (Oct 25).** The Oct 25
  run still read only 74 of 107: one at a time, six AI reads of a place's
  own page (10–34s each) took 2½ of its 3½ minutes. And the backlog went
  ahead of everything, so Keystone-K and the 7 Refuah pages, read the
  night before, were the ones left over. Now six are read at once, never
  two on one site (Refuah's go one after another) nor for one place
  (`runSideBySide`, `watchRunOrder.ts`), and the kosher lists and
  hospitals go ahead of any backlog. Replaying the Oct 25 night's own
  times: 179s one at a time, about 34s six at once (its slowest read), so
  the five minutes hold several times today's list; more at once is the
  lever if it grows past that. The AI read cap holds as it is (each read
  takes from it in one step). Not yet run live: the first proof is the
  night after this deploys.
- **Every nightly job records its runs** (migration 086, `job_run`;
  `src/lib/jobRunStore.ts`): Google hours, Watches, Menus and Walks. Each
  run saves a row when it starts and fills it in at the end with what it
  did in a line, a warning (ran out of time, not set up) or its error. A
  record that can't be saved never fails the job.
- **The Watches tab had "Nightly runs"** (`NightlyRuns.tsx`): a row per
  job with how it works, the last run's line, and, without opening
  anything, Failed, Cut off (started, never finished), Didn't run (no run
  in 30 hours) or Needs a look. Replaced Oct 25 by Last night, a line per
  kind (piece 5), which says the same per kind: "Didn’t run since Oct
  22", "Failed", "stopped before it finished".
- **Vercel allows the 300 seconds:** the preview of 23e02ab5 built and
  deployed with it.
- **An email when a job breaks, and one when it works again**
  (`jobAlert` in `jobRuns.ts`, `sendJobAlert` in `email.ts`), to every
  community's admins once. Nothing while it stays broken. A run that was
  cut off can't send anything, so the next run tells of it. A job that
  stops running at all sends nothing; only the tab shows "Didn't run".
- **Seen on dev:** a real Walks run, plus sample rows (failed, ran out of
  time, cut off) added and deleted again. The email itself has only been
  checked by the unit tests; no real one has been sent.

## Done Oct 23, later: the trust sheet's checks; a pasted week as this week's (on `redesign/oct18-fixes`)

- **"We check it every day" names minyan times, mikvah hours, kosher
  certifications and hospitals again.** It only read the places' box
  dates, and a check that reads a page and finds a difference dates
  nothing, so the sheet said "Menus and eruv status" while every shul's
  and mikvah's page, Refuah and both kosher lists were read that morning.
  It now also asks `/api/checks` (`src/lib/checksRun.ts`): each kind of
  check with when one of its pages was last read properly. Only the kind
  and the time leave the server. A kind named needs a proper read in the
  last week, as before. On live: shul pages, newsletters, Keystone-K,
  Refuah and Mekor were all read this week.
- **A pasted week the same as the usual times can be added as this week's
  schedule.** The box offered only "Mark them confirmed" (the usual times)
  and the server refused to file a week that changed nothing. Now the box
  says "The same as their usual times." with "Add as this week's
  schedule", and the queue reads "posted as this week's schedule". A
  schedule (not a week) that matches still just confirms.
- **A one-day time isn't shown again beside a week's own.** BZBI's week
  (approved from a paste) gave Shabbos 9:30, and the newsletter's one-day
  "Sat Oct 24 · 9:30 AM" was still stored: two 9:30 Shacharis on the
  Minyanim page. A one-day time that a covering week already has is left
  out (`resolveDay`), as one matching the usual times already was.

- **A week given by weekday goes on Sunday to Shabbos.** BZBI's "this
  week's schedule" (Sunday 9:00, Monday 7:45…), pasted on a Friday, came
  back dated Fri Oct 23 – Thu Oct 29 once and Sun Oct 25 – Sat Oct 31 the
  next: the AI chose. Now it's the guide's week, as in Edit listing: the
  week around the day it was sent, the next once Shabbos is over
  (`weekdaysOnGuideWeek`). A message that names its dates is left as read.
  The live week approved earlier (Oct 23 – Oct 29) stays as it is.

## Done Oct 23, after that: three small fixes (on `redesign/oct18-fixes`)

- **A one-day time that's just the usual one isn't "This week's
  schedule".** BZBI's newsletter gave "Sat Oct 24, 9:30 AM" (Oct 22, case
  1199) before BZBI had a usual Shabbos time. Once it had one, the box
  showed the usual 9:30 as this week's. The next-minyan line already left
  it out. BZBI is the only shul with a one-day time like this on live; week
  posts repeat usual times on purpose.
- **Map: with a place saved, All is lit.** Every category on is All, saved
  places included. Before, with anything saved, the map opened with every
  category lit and All not.
- **Map: Saved sits right of All.** Tapping All turns Saved off. It used to
  turn it on, so the address read `?pinned=1` and, opened again, showed only
  the saved places.

## Done Oct 23, at the end: every check dates what it checked (on `redesign/oct18-fixes`)

The user: "We're dating what we're checking. We're not dating a whole
listing." No exceptions by category. Going forward only: no live data was
rewritten, and each check dates its own boxes on its next daily run.

- **Each check dates only the box it read** (`details.sectionConfirmed`,
  with which check in `details.sectionFrom`; `src/lib/boxDates.ts`):
  Google the contact box, a menu read its dishes, Keystone-K and Mekor
  Habracha the certification, a shul's website its times (weekday,
  Shabbos, this week), Refuah the hospital boxes it gave contacts for, a
  mikvah's website the hours it read. The listing's own date is now only
  a person's.
- **A date a check gave the whole listing before today is no box's.**
  Mekor's read of a bakery's hechsher no longer dates its description. Until
  the next runs, those boxes show their older date or none.
- **Every date shown is the date of what's beside it:** a shul row's "Times
  not confirmed" goes by its times' boxes, the question cards by the times,
  the home's dated count by any box.
- **The certification's date is kept but not shown** (the user: there's
  nowhere to show it, and the hechsher already links its certificate).
- **An admin approving a check's suggestion still dates the listing** (as
  "From Keystone-K"). Boxes ignore that date, and the check's next agreeing
  run dates the box.
- **Trust sheet:** "We check it every day": what ran this week (minyan
  times, mikvah hours, kosher certifications, menus, hospitals, eruv
  status), then "Places on Google Maps are checked against Google." No
  sources by name. "People fill in the rest" now reads: "New places, kosher
  items at grocery stores, and Shabbos-friendly hotels. A person reviews
  every change before it shows." The third line reads: "Something wrong?
  Open the place and tap Edit listing." `/api/sources` is gone, since the
  sheet reads what was checked off the listings it already has.
- **Home trust line:** "· checked with Google" (was "hours checked with
  Google every night").

## Done Oct 23: Northeast's eruv email reads as up (on `redesign/oct18-fixes`)

- **Northeast's weekly "Eruv is UP" email was kept as unclear.** Its body
  says "Don't assume the Eruv is down if you don't get an email message",
  which the reader took as a "down". A status sentence that only supposes
  one ("assume", "if", "whether", "unless") is now left out.
- **Check now (Eruvim tab) and Read them now (Watches tab) read a waiting
  email again**, so one kept by a reader since fixed goes live without an
  admin choosing up or down. Still unreadable, it keeps waiting.
- This week's (Oct 23) was marked Up by hand on the Watches tab.

## Done Oct 23, last: this week's schedule from Edit listing (on `redesign/oct18-fixes`)

Drawing SwWk3BLEYTtVu2k3w2UJ5s v3. The user: "You should be able to add
this week's schedule from the main site… and that there's no minyan this
week."

- **Every shul's Edit listing has "This week's schedule"**, under "Not on
  the listing yet" until the week has a post, then a row ("Oct 18 – Oct 24
  · Shacharis 10 AM", or "· No minyan"). It opens the week's days from the
  usual times (this season's), with "+ Add a minyan" and Done. Opened and
  Done with nothing changed sends nothing.
- **"No minyan this week" is a plain link under Done.** It goes back to
  the list with the row Changed and "Send 1 change". Reopened, it reads
  "No minyan this week" with "+ Add a minyan"; adding one means just that
  minyan that week.
- **The week is Sunday to Shabbos**, the next one once Shabbos is over.
  Everything goes to the admin queue as a week post.
- **A weekly shul's page is unchanged** (board 1): its waiting box keeps
  its one "+ Add this week's schedule". No minyan is offered only in the
  editor.
- Not as drawn: the days are grouped as the box groups them ("Shabbos
  morning", not "Shabbos · Oct 31"); Rosh Chodesh and Yom Tov rows of the
  usual times aren't carried into a new week.
- A usual minyan's note is carried into a new week with its time, since
  the usual times are only where the week starts (the user, Oct 23, after
  briefly having it dropped). Each minyan's note can be edited there.

## Done Oct 23, later still: a monthly shul's home page gives its weeks (on `redesign/oct18-fixes`, #352)

- **The Little Shul's home page now gives this week's schedule.** It says
  "Next Shabbos Services will be: Saturday, November 7th, Saturday,
  December 5th" and "held the 1st Saturday of each month at 10:00 AM".
  The reader used to drop all of it as "not every week". Now it takes
  each date it names. A week with one of them is posted as that week's
  schedule, even at the usual time. A week between them goes to the
  queue as "No minyan this week", read as "No minyan Oct 23–24 (their
  website)". Checked against the real page with the AI: no minyan this
  week and next.
- **Only for a page that says the shul doesn't meet every week**, whose
  dates cover each usual minyan and reach past the weeks read. A weekly
  shul's page giving one changed date says nothing about the weeks around
  it.
- **A date has to fall on the weekday its words name.** The page's past
  "Saturday, October 3rd" came back as next year's Oct 3, a Sunday, and
  is now dropped. "1st Saturday of each month" also counts as not weekly
  now; before, only "first" did.

## Done Oct 23, after the PR opened: a website that agrees confirms (on `redesign/oct18-fixes`, #351)

- **A shul's or mikvah's own page that agrees with the listing now dates
  it**, as Keystone-K, Mekor and Refuah do. The line reads "Confirmed by
  <the shul>, <date>", the same line an approved website suggestion gives.
  (The user: "If the website shows it then the website shows it.") Before
  this, B'nai Abraham Chabad and Society Hill kept the date of their last
  approval while their pages agreed every morning.
- **An unchanged page that agreed dates the listing again each morning,
  with no AI**, while the listing stays as it was when the page was last
  read. If the listing changes (an approval, a newsletter, an admin's
  edit), the page is read once more to compare, from its own 3 reads a
  run, separate from the 3 a changed page gets. A difference found that
  way is never filed: the page said nothing new, so the listing is the
  newer one. Each page already watched is read once this way, since none
  had been compared yet.
- ~~**The whole listing gets the date**~~ (changed later Oct 23: only the
  boxes the page gave are dated).
- **The summer/winter line names the minyan and says "instead of"**:
  "In summer, Friday: Mincha 7 PM instead of 5 min before candle
  lighting." "Also" is kept only for a one-season minyan with no pair,
  which really is held as well ("In winter, also Mincha 12:20 PM,
  following Kiddush.").
- **A page that can't be read says why, when the site said**: "Couldn't
  read the page: it turned the reader away (403)", or "it didn't answer
  in time". Shivtei Yeshuron's two pages read fine at 8:31 AM on Oct 23,
  failed at 10:54 AM, and read fine from here afterwards (its calendar's
  next service is Nov 7). That points to the site, not the reader. The
  next run will say what it answered.

## Done Oct 23, last of all: summer and winter by the zman (on `redesign/oct18-fixes`, not merged)

- **A shul's summer/winter pair** goes by the zman. A pair is one clock
  time and one zman, for the same minyan on a shared day. It's summer
  while the zman is later than the clock time. Mekor's Friday is 7:00 PM
  in summer and at candle lighting in winter. With candle lighting at 5:48
  on Oct 23, and the clocks not back until Nov 1, it now shows candle
  lighting. Its weekdays (15 min before sunset, or Maariv 6:30 PM) and
  B'nai Abraham's Friday work the same way.
- **This applies everywhere a season is used:** the next minyan, the
  Minyanim list, the listing's weekday table and Shabbos list (with "In
  summer, …" under them), and the dimmed rows.
- **Anything else** (no pair, or a zman not known yet) keeps the clock
  change's season, as before.
- **Reading a newsletter or website** still compares against the clock
  change's season. A week's times are compared with every time the shul
  has, so this only affects a whole new schedule with no season named.

## Done Oct 23, last: "No minyan this week" (on `redesign/oct18-fixes`, not merged)

The user: "Not being able to read is different than reading and confirming
there is nothing."

- **A calendar that is the shul's whole schedule** is one that lists each
  of the shul's usual minyanim on a date, on that weekday, within 15
  minutes of its time. Shivtei Yeshuron's and Leyv Ha-Ir's list their
  usual Shabbos minyan on its dates. A calendar of classes and events
  beside a daily minyan never lists the minyan, so it never counts. A usual
  time set by a zman never counts either, since it can't be compared with
  a clock time.
- **A week of such a calendar** goes to the queue as the shul's whole week.
  A day it gives nothing for has no minyan, its usual time included, so
  Leyv Ha-Ir's Oct 25–31 (Friday night only) has no Shabbos morning.
- **A week with nothing in it** goes to the queue as "no minyan". The
  queue shows "No minyan this week" with its dates. Once approved, the
  listing shows a "This week's schedule" box saying "No minyan this week",
  with the usual times folded under "Not this week: no minyan this week".
  A week the newsletter (or a person) gave days of is left to it.
- **Shul times** says what was read: "No minyan Oct 20–24 (their
  calendar)". That's "agrees" or "differs", never "couldn't read".
- **On the live site**, this happens only when each watch reads its
  calendar again, and each week waits in the queue for approval.
  Nothing was written to production.
- **The risk** stays as agreed: a calendar not filled in yet reads the
  same as an empty week. The admin sees "No minyan" before it goes on.

## Done Oct 23, later: this week after Shabbos, and what an unconfirmed time says (on `redesign/oct18-fixes`, not merged)

- **This week's schedule** runs from today through Shabbos, so on Friday
  Shabbos is last. Once havdalah has passed on Saturday night (today's,
  from the zmanim), it is the week ahead, Sunday to Shabbos. With no
  havdalah known, Shabbos stays.
- **A minyan with no posted times that day** says "Usual time · last
  checked Oct 12" under it, in grey, on the Minyanim list and a hotel's
  walk list. The date is its own box's: the usual Shabbos box's for a
  Friday-night or Saturday row, else the weekday box's.
- **Every week a shul sent out** is "✓ This week's times" on the Minyanim
  list, a Shabbos-only one too. Mikveh Israel's "Shabbat Lekh Lekha" said
  "Shabbat Lekh Lekha times". The card's own heading still has the name.
- **The public times box, when nothing could be read** from what was sent
  (a bare link, which it never opens), says "No times could be read from
  it" and, for a link, "A link isn't opened here. Paste the times
  themselves, or add a photo of them", with Try again. Before, it showed
  the guide's own times as "How they'll show in the guide", then
  "Everything matches what the guide has" and Mark them confirmed. That is
  what made Chabad Mainline's link look read.

## Done Oct 23: sign-up minyanim and another shul's minyan, read off a message (on `redesign/oct18-fixes`, not merged)

From Mekor's newsletter of Oct 23.

- **"Held when there is sufficient interest"** marks that minyan "Only on
  days enough people sign up", in a week or as a usual time. Its WhatsApp
  group is the usual minyan's that day (the same tefillah, else Mincha &
  Maariv for a Maariv, and back); none yet when there's no usual one. Shul
  times and the queue show it ("Sign-up: chat.whatsapp.com/…", "· only if
  enough sign up").
- **A minyan held elsewhere** ("2:00pm Mincha at 1818 Market or Mikveh
  Israel") is left out only when the place it names is another shul in
  the guide that already has it: same tefillah, that day, within 15
  minutes. The finding's note says "Left out: Mincha 2:00pm, already on
  Kahal Kadosh Mikveh Israel." Anything else stays, with "at …" in its
  note, so a shul's own second location still comes through. Plain code,
  no extra AI read.
- Only new reads. Mekor's waiting findings (1230–1232) still have the
  2:00pm Mincha.
- **A calendar's monthly repeat** ("first Shabbos of the month", the
  Little Shul's Google Calendar) is laid out over the days, as a weekly one
  was. A date of a repeat moved on its own (Google's RECURRENCE-ID) is that
  event, not the repeat's too.
- **A calendar with no services in the weeks read** says so and names its
  next ("Their calendar has no services Oct 18 – Oct 31. Next: Sat Nov 7,
  10:00 AM, Sabbath Service."), not just "can't find times".
- **A dated time that's one of the usual times** isn't shown twice (BZBI's
  Shabbos 9:30). Every dated time on a day shows, not only the first.
- **Chabad of the Main Line's schedule page** can't be watched: it sends a
  "Just a moment" check to every program, which the guide gives up on by
  design. The public box doesn't open links for shul times either (only
  for menus); it reads the words sent.

## Done Oct 22: Google is a Watches job (on `redesign/oct18-fixes`, not merged)

Drawn and agreed: https://claude.ai/artifact/6gCnW6nVTDXySkcYENvAqF (v2,
"Google: who checks each field"). Compared with the boards on dev,
computer and phone.

- **Watches row:** "Google · N listings, from Google Maps", with checked /
  to check / can't be read (no "didn't load": it loads no pages).
- **Its page** (`/admin/<community>/watches/google`, `GoogleJob.tsx`):
  "N listings have a field nothing checks", tabs To check / Can't be read
  / Checked. Every approved listing in a category with an address.
- **Fields box:** Name, Hours, Phone, Website, each with who checks it:
  Google (it keeps the field), Its website (a page a job reads that
  loads), You (kept by hand, for good) or Nothing, lit. Worked out each
  load (`googleJobRun.ts`), nothing stored for it.
- **Check against Google** is one Places call, on a tap only. Changed rows
  show "was …"; Use Google's / Edit / Keep the listing. Use and Edit are
  filed as Google Maps and approved, like a sync change. What already
  matches is handed to Google to keep.
- **No match:** Find it on Google (a search sheet, This one) and Not on
  Google. **Can't be read:** "Not read since …", Find it on Google, Open
  its listing.
- **A closure** is its own Open or closed box, Show as open, on the site
  at once. Its read date is Google's latest answer on it (the closure
  check runs more often than the full sync).
- The Metrics tab's old Google sync coverage panel and its four routes
  are gone.
- **Live numbers (read Oct 22):** 141 listings, 122 checked, 18 to check,
  1 can't be read; the drawing had 123/17/1. Chalavita's hours and phone
  and Sababa's hours say Nothing on live, not Its website: their home-page
  watches (board 3, Dishes) come with this branch's next deploy and the
  morning run after it.
- Rita's has two listings on South St, one closed: maybe a duplicate.

## Done Oct 22: a minyan's join link (on `redesign/minyan-join-link`)

The user, Oct 22: Rodeph Shalom's watch "didn't pick up on … zoom link for
8:10 minyan".

- A minyan can have a join link (`joinLink`: Zoom, Google Meet, a YouTube
  or Vimeo live link, or any web link). The listing shows it on the
  minyan's own row: "Join on Zoom", "Watch on YouTube", the whole phrase
  the link. In the usual weekday table, whose cells hold times, it goes
  under the table and names the minyan ("Join Thu Shacharis on Zoom").
  Also on the tapped minyan's box. A week's time with none takes its
  usual minyan's link, the same tefillah that weekday at the same time.
- Anyone can set it in the minyan editor under More ("Zoom or livestream
  link"); a web link only. The queue, the admin's times proposal and the
  schedule summary all say it ("Online: upenn.zoom.us/j/…").
- The website reader fills it from a shul's calendar, by code (the reader
  prompt is unchanged and never sees the links): a feed's own join link
  (its URL, LOCATION, a Google Meet, or a short DESCRIPTION with one), or
  the event's own page, opened for services only (minyan, service,
  shacharit…), from today, at most 4 pages a read. A page gives its link
  only when it has one meeting, outside its header and footer; a channel
  link (Rodeph Shalom's footer YouTube) isn't one. The link goes on the
  website's week's time at the same date and time, and the admin's note
  says so. Its links are in the page's fingerprint, so a new one is read
  the next morning.
- Rodeph Shalom: its feed's URL and LOCATION are the minyan's page, and
  that page's one link is `upenn.zoom.us/j/97084263584`. It fills on the
  next read after this deploys: its fingerprint changes with the link.
- Not done: the usual (regular) minyan isn't given the calendar's link;
  only the week's time is. A person can add it to the usual minyan in
  the editor.

## Done Oct 22: the admin nav is five groups (on top of the Eruvim move, #343)

- The admin's one row of tabs is now two rows: the groups on top, the open
  group's tabs underneath. **To do:** Moderation queue, Watches, Read
  questions, Responses. **Listings:** Categories, Campaigns, Archived.
  **Look:** Site, Desktop, Mobile. **Insights:** Metrics, Missed searches
  (and What changed, when it is switched on). **Settings:** Team, and
  Communities for the site owner only.
- Every page keeps its URL; the open group comes from the address. A
  group's own link opens its first tab. History (approved/rejected, opened
  from the Metrics tiles) sits under Insights → Metrics.
- On a phone all five groups fit; the tabs row scrolls sideways.
- No counts on the To do tabs yet (Small open decisions, 8).

## Done Oct 22: the Eruvim tab is on the Eruv row

- **Admin → Categories → Eruv → Edit** now holds what was the Eruvim tab,
  under the card's own fields: each eruv's name, order, where it goes,
  website, hotline, alerts link, map link, parts and markers left out, line
  colour, Check now, Remove, and Add an eruv. Each eruv still saves on its
  own. No category has a tab of its own now.
- The Eruvim tab is gone from the admin nav. `/<community>/admin/eruvim`
  redirects to Categories (`next.config.ts`).
- Fixed after merging: that redirect also caught `/api/admin/eruvim` (as
  community "api"), so the Eruv row loaded the categories instead and said
  "run migration 074". 074 was already on both databases. The redirects
  now skip `api`, and `nextConfigRoutes.test.ts` fails if any redirect or
  rewrite catches an API route.
- A community without the Eruv card has nowhere to edit eruvim until it
  adds one (+ Add Eruv on Categories). The site shows eruvim only with that
  card anyway.
- Unchanged: the public eruv suggestion box (EruvEditor) and the Watches
  tab's Eruv status page.

## Done Oct 20: "Check now" is the full check (on `redesign/oct18-fixes`, not merged)

- **A shul's, mikvah's or menu page is read by the AI on Check now**,
  changed or not. The daily run is unchanged: the AI only when the page
  changed. Check now sets the fingerprint, and files what differs as the
  daily run would, never the same suggestion twice. A listing that already
  has a suggestion waiting is shown what differs, and nothing is filed.
  Adding a watch checks it the same way. Rate-limited: 20 in 10 minutes.
- **The opened row shows what it read and from where** (the page, or the
  page and its calendar), as short lines ("Shacharis Mon–Fri 7:00 AM"),
  then "Agrees with the listing." or each difference, "in the queue".
  Or "Found no times on this page" / "The page wouldn't open". The
  row's line says it in one: "Read Oct 20: agrees with the listing".
- **Lists say what they compared:** "Read Oct 20: 78 on the list, 74
  match the guide, 4 suggestions in the queue" (Keystone-K, Mekor
  Habracha); Refuah says how many contacts it read. Opened, a list names
  each place it differs on and why one wasn't filed ("Rita's: IKC in the
  guide, not on Mekor's list (filed before)", "(closed on Google, not
  filed)"), kept from every daily run, so no Check now is needed to see
  them (the user, Oct 20). Until migration 085 is run, nothing is kept and
  the row falls back to "Read Oct 20: nothing new".
- **A page the AI has never read says so:** "Opens · not read yet", not
  a green "Working". One where it found nothing says "Reads nothing".
- **A mikvah's hours go to the right field** (the user, Oct 20, on Lower
  Merion Community Mikvah's homepage: "open from 7:30PM – 9:30PM every
  weeknight"). The AI put that under the plain "Hours" or gave it no days,
  and the check said it agreed with women's hours of 8:30–10:30. Now a
  page is read for a category's named hours (women's, men's, keilim), not
  the plain "Hours" beside them, and the AI is told what each holds now,
  only to tell them apart. 5 of 5 reads of that page now give Women's
  Hours 7:30–9:30 PM and the difference; pages with no weekly hours
  (Mei Shalva, Ohel Leah) still read nothing, and the AI didn't echo the
  listing's hours from a page that has none.
- **A read it can't compare is never "agrees":** hours with no days, a
  time that doesn't fit, one day only. The row says "Needs a look" and
  "couldn't compare it with the listing", with what it read.
- **Lower Merion Community Mikvah's women's hours are 8:30–10:30 PM on
  both databases; its page says 7:30–9:30 PM every weeknight** (and "call
  before 9:00 PM", where the listing's note says 10:00 PM). Check now on
  dev's watch (lmcmikvah.org) files it to dev's queue; live needs a yes.
  Men's and keilim hours are on their own pages (lmcmikvah.org/mens-mikvah,
  /keilim-mikvah), each needing its own watch; neither is watched yet.
  Read there (Oct 20), both agree with the listing: men's 6 of 6 once the
  AI was told to give every hours the page states, matching or not (told
  only what's listed, it gave only what differed, and twice of four gave
  just Friday, "until 1 hour before candle lighting", which weekly hours
  can't hold and it now leaves out); keilim 3 of 3. Ohel Leah's kelim
  page ("closes shortly before sundown") is left out the same way.
- Kept on the watch until the next check (migration 085, see 1d). The
  daily run's AI reads keep theirs too; a morning that only saw the page
  unchanged leaves the last one.
- Checked by tests (41 fail against the old code) and in the local admin
  console on dev, on Mekor Habracha's davening page (a watch added there
  on dev Oct 20). Its first read filed one difference to dev's queue
  ("New: mincha maariv · Fri · 7:00 PM"; the page gives Friday
  7:00 PM and dev's listing has no Friday time). Check now again read the
  same page and filed nothing, the suggestion still waiting. The AI read
  Friday as one "Mincha & Maariv" the first time and as Kabbalas Shabbos,
  Mincha and Maariv the second: the same page can come back worded a
  little differently.

## Done Oct 20: seven small fixes (on `redesign/oct18-fixes`, not merged)

The user's list of seven, all agreed.

1. **No gap under "N listings"** on categories with no map (Networking,
   Cemetery, WhatsApp): the toolbar's margin is gone when the heading sits
   in it.
2. **The trust sheet opens whole.** Which lists were read is fetched while
   the home is idle, so "Where there's a source, we check it…" shows with
   no loading bar.
3. **"Within 5 mi"** added to How far, for a short drive. Choices kept,
   not a miles box.
4. **"Candle Lighting & Zmanim"** for Prayer & Shabbat Times (dev; the
   user renamed it on live, see 1c). Home tiles show up to three lines of a name, so it
   isn't cut to "Candle Lighting &…".
5. **Phone home search: a tap away closes the results** (and Escape). The
   words stay; tapping the box or typing opens them again.
6. **Adding a food place by hand:**
   - What a choice brings up is in that choice's row. Picking "Scheduled
     Deliveries" showed the Delivery WhatsApp Group in the contact row; it
     now shows right under Store Type, in a row named "Store type and
     delivery" (the admin's section name).
   - A menu link alone counts as entered: Main dishes says "Menu link"
     and leaves "Not on the listing yet".
   - A new menu link is read for its dishes when you leave the box (the
     "+ Add" box's own menu reader, `mode=menu` with the place's name).
     The dishes go into the list to check, and on to an admin with the
     rest. Not in the admin console or its preview. Works in edits too,
     for a link that's new.
   - Not checked for real: Cloudflare's bot check fails in the in-app
     browser (error 600010), so no read went out locally; covered by tests
     (3 fail against the old editor, 2 against the old route).
7. **Paste a photo on a phone:** a Paste button beside Upload reads a
   photo copied from Google Images (or an image link). Needs an iPhone to
   check Safari's own Paste bubble.

## Done Oct 20: menus posted as pictures are read (on `redesign/oct18-fixes`, not merged)

The user, Oct 20: Unit Su Vege's menu couldn't be read on the Main dishes
tab, but a photo of it sent through the site worked. "If the reader could
also read menus posted as pictures on the website itself that would be
amazing … I want to see if that would have caught many."

- **The menu reader reads a menu's pictures** (`menuPictures` and
  `readMenu` in `src/lib/menuReader.ts`). A page's pictures that say
  they're its menu (address, alt text or link: "menu", "brochure",
  "flyer") are kept with it, and on a page that is the menu (its menu
  link, or a page its website links to as its menu) its other pictures
  too, four at most, never a logo, icon, SVG or GIF. They're read, as
  photos sent in the "+ Add" box are, only when the page's words name no
  dishes, or it has almost none. A menu link that is a picture works
  too. Same everywhere the reader runs: Main dishes' "Read its menu", a
  menu link sent in "+ Add" or typed in the editor, and the daily menu
  watch (which says "read from the pictures of its menu").
- Dishes read off a picture can't be checked against the page's words;
  Main dishes says so beside each ("from a picture of the menu: open the
  menu to check"), as it does for a PDF.
- **What it would have caught** (dev, every place whose reading had
  failed, 27, re-read with the real AI, nothing saved):
  - 3 now read from their pictures: A La Karte (9 dishes from its
    catering brochure), Star of David Kosher Grill (10, its menu page is
    only pictures), The Kosher Grill at Citizens Bank Park (3).
  - 2 now read from their words (their failure was the site not
    answering that day): Ben & Jerry's, Espresso Cafe & Sushi Bar.
  - 12 can't be opened at all, so pictures don't help: blocked, gone, or
    drawn by a script (Judah, I Want Moore, 20th Street Pizza, House of
    Kosher, Mike's Chicken, Stephen's Cafe, Insomnia Cookies ×2, Diane's,
    LUHV Vegan Deli, Shlomo's, Center City Pretzel).
  - 10 have no menu on the page read: Unit Su Vege (its menu is drawn
    by a script from an ordering service, MenuFreeZone, so it isn't a
    picture either), LUHV ×2 (its pictures are food photos), Savvati,
    Deluxe Catering, Slices and Rolls, Magical Sweet Shop, Miss Rachel's,
    Gelbstein's, and Shtetl, whose website now goes to a gambling site
    (the Main dishes tab already flags it as moved).
  So pictures fix a few; most failures need a person to give the menu,
  which is what's next.
- **Next (agreed Oct 20):** the failed row's options. Built later the
  same day, see "a menu that couldn't be read" below.
- Checked by tests (10 new, each failing against the old code; one
  caught Next.js images all counting as one picture, which hid Mordy's
  menu behind its header photo) and the re-read above.

## Done Oct 21, later: dishes added by hand are checked on every read (on `redesign/oct18-fixes`, not merged)

The user, Oct 21: "if I add something manually from a menu … will future
reads look for that and tell me if it's successfully finding/tracking it?"
Before this, no: a read only proposed up to ten dishes of its own, and a
hand-added one was dated once, at approval, and never looked for again.

- **Each read is given the listing's dishes** (the "sometimes" ones and
  hand-added ones too): the Main dishes tab's "Read again", "Give its menu
  link", photos, and the menu watch. For each, the AI points to the menu's
  words for it, checked on the page as every dish is, or leaves it out.
- **Found:** it comes ticked, marked "(on the listing)", on top of the ten.
  Approving dates it again ("on its menu" today). The listing's spelling is
  kept, so it never turns into a second copy.
- **Not found:** "Not on this menu any more? Hummus. It stays on the
  listing until you take it off." Never taken off by itself. Said only of
  a menu read whole (its words, or a PDF), and only when the read named
  some dishes: a few photos may be only part of a menu, and a cookie
  notice names none. The menu watch files a reading for a menu that
  changed and lost a listed dish, even with nothing new on it.
- **Not checked:** a listed dish a reading didn't look for says "Not
  checked against this menu" (readings made before this, a reading of
  photos, a dish added at approval). "Read again" checks them.
- **Kept without a migration:** the missing ones are stored among the
  reading's `dishes`, marked `missing` (`menuReadingStore.ts`). Approving
  can now send up to 60 dishes (was 15), for a listing with many.
- **Left out: an unchanged page counting as "still on its menu".** The
  page's fingerprint is the menu watch's, not kept with the reading, so
  there's no telling a page unchanged since an approval. A dish stays
  dated from the last approval until a read finds it again.
- Checked by tests: 5 in `menuReader.test.ts`, 3 in the new
  `menuReadingStore.test.ts`, 3 in `menuWatchRun.test.ts`, 2 in the
  route's, 2 in `MainDishes.test.tsx`; all 15 fail against the old code.

## Done Oct 21: a menu that can't be read says why (on `redesign/oct18-fixes`, not merged)

The user, Oct 21: 11 places still couldn't be read on the preview. Three
are ordering apps (Slices and Rolls and Stephen's on Toast, LUHV Deli on
Square) and one has no website (The Brazilian BBQ). 20th Street Pizza's
whole website is an ordering store, and it turns away anything that isn't
a person's browser (403 to the reader and the browser): an ordering app,
so a person's screenshots. Shlomo's is a market (No menu).

That leaves four that read on a laptop and not on the site:
- Ben & Jerry's (Ice Cream, Sundaes, Shakes, Sorbet)
- Center City Pretzel (Pretzels)
- Insomnia ×2 (Cookies, Brownies, Ice Cream, Cookie Sandwiches, Cookie Cakes)
- Diane's (Cakes, Cupcakes, Tarts, Rugelach, Macaroons, Cookies, Kugel,
  Challah, from her home page: no menu page, but it names them)

None of their `robots.txt` keeps readers off those pages. The likely
cause is that they turn away visits from cloud servers like Vercel's:
benjerry.com answers a server's request for its `robots.txt` with 403;
on the preview Insomnia's page was drawn but only its cookie notice came,
as if its menu's own request was refused; Diane's needs no drawing at all.
Not proved: the note said only "Couldn't read a menu on its website", and
there's no access to Vercel's logs from here.

- **Now the note says why:** the reader tells what it was told, page by
  page (`Trouble` in `menuReader.ts`): turned away (403, 401, 429, 999),
  not there (404), an error, no answer in time, not a public address, not
  a page, an ordering app, asked to prove it's a person, drawn by a
  script and too slow to draw, the browser's own error, drawn and still
  empty, or almost no words and no menu pictures. The Main dishes tab
  says it after "Couldn't read a menu on its website:" (and for a menu
  link, and "Give its menu link"); the menu watch's error too. The browser
  now also gives up on a page that answers it with an error (a site can
  let a plain fetch in and turn a browser away).
- **And a chain's ordering site is an ordering app:** an `order.`,
  `orders.`, `ordering.` or `online-order.` subdomain. Ben & Jerry's sent
  the browser to `order.benjerry.com` (its dishes came from its ordinary
  menu page anyway).
- **If it's cloud servers being turned away,** those places are like
  Toast: a person's screenshots. Sending the reader through a home
  connection to get past it would be getting round their block.
- Checked by tests: 5 in `menuReader.test.ts`, 4 in `renderPage.test.ts`,
  1 in `menuWatchRun.test.ts`, 1 in the route's; against the old code 12
  fail (the 9 new ones that test a reason, and 3 updated expectations).

## Done Oct 20, later: a menu page built by a script is drawn in a browser (on `redesign/oct18-fixes`, not merged)

The user, Oct 20: "build the failed-row options first, then the browser
fallback". Some places' own sites send an empty page and a program that
draws the menu in the visitor's browser; the reader downloaded the page
but never ran the program, so it saw nothing.

- **Now, when a page comes back with almost no words and no menu
  pictures, it's opened in a headless Chromium**, given four seconds to
  draw, and read as drawn (`src/lib/renderPage.ts`). An empty home page is
  drawn and the links it then has are followed; a menu page with nothing
  on it is drawn too. At most three pages a website. A page with its
  words already is never drawn.
- **Where:** Main dishes' "Read its menu" and "Give its menu link", and
  the menu watch. "Check now" always draws; the daily run draws one page a
  run (it has a minute for every watch), and one left undrawn isn't
  counted as a failure. Not the public "+ Add" box: a visitor's link stays
  a plain fetch.
- **Never a way round a block.** A site that refuses the reader is never
  drawn (20th Street Pizza's "prove you're a person" refuses the plain
  fetch, so it never gets that far); a drawn page that turns out to be
  one is given up on; an ordering app's page is never opened, even when a
  site sends the browser there. Every request a drawn page makes goes
  through the reader's own check (no private addresses), and pictures,
  video and fonts aren't loaded.
- **What it catches** (locally, real sites, nothing saved): Mike's Chicken
  (6 dishes), Insomnia ×2 (5 each), Center City Pretzel (Pretzels), about
  15 seconds each. Not LUHV Vegan Deli or Unit Su Vege (drawn, still no
  dishes). With the morning's changes, 18 of the 27 places on dev now
  read; the rest need a person (menu link or photos) or have no menu.
- **Corrected Oct 21, from the user's look:** Unit Su Vege's menu is
  pictures on its own site, at `unitsuvege.com/order/showNormalMenu.html`
  (8 pages); its "MENU" button is a script, not a link, so the reader
  never finds the page. The earlier "drawn from MenuFreeZone" was wrong.
  Given that link ("Give its menu link"), it reads 10 dishes from the
  first 2 pages (two small button pictures take the other 2 of the 4).
  LUHV Vegan Deli's menu is on its Square Online order page
  (`deli.luhvfood.com/s/order?location=…`), which shows the menu with no
  clicks once the location is in the address. Decided Oct 21: the reader
  stays off it. The site's own `robots.txt` asks every reader but
  Google's to keep out of `/s/`, and Square's buyer terms forbid robots
  and scrapers (the UK, Irish and Canadian ones say so; the US text
  wasn't found). A screenshot the reader took would be no different; one
  a person takes and adds ("Add photos of the menu") is fine. So a
  Square store's order page (`/s/order`, on any domain) now counts as an
  ordering app, which before it didn't: given as a menu link it would
  have been opened and drawn.
- **Done on dev, Oct 21:** Unit Su Vege given its menu link; 9 dishes
  waiting in "To check" for the user to approve. LUHV Vegan Deli needs
  a person's screenshots of its order page.
- **How it runs on Vercel:** `@sparticuz/chromium` 153 (a Chromium built
  for serverless functions, matching Playwright 1.63's) with
  `playwright-core` 1.63, both now production dependencies; locally,
  Playwright's own Chromium. `next.config.ts` lists both packages' files
  for the three routes that read menus (about 80MB; the limit is 250MB).
  `MENU_RENDER=off` (an environment variable, then a redeploy) turns it
  off.
- **Not checked yet: that it starts on Vercel.** It can only run there.
  **For the user:** on the branch's preview, Main dishes → Insomnia
  Cookies → "Read again" should come back with cookies, brownies and ice
  cream within about 20 seconds. If it says it couldn't read a menu,
  the Vercel logs will say "[renderPage] couldn't draw".
- Checked by tests: `renderPage.test.ts` (3: what a drawn page may
  request, the challenge check, never opening a browser for an ordering
  app or private address, or when off); 4 in `menuReader.test.ts` (3 fail
  against the reader without it; at most three drawn); 2 in
  `menuWatchRun.test.ts` (the run's budget, "Check now" always). Each of
  ten one-line breaks fails its own test.

## Done Oct 20, later: a menu that couldn't be read gets three ways on (on `redesign/oct18-fixes`, not merged)

Agreed with the user Oct 20 ("build the failed-row options first, then the
browser fallback"). On the Main dishes tab, each row under "Couldn't be
read" now has:

- **Give its menu link.** Saved on the listing as its menu link straight
  away (its "Full menu", and from then on what the tab reads first and the
  menu watch watches), then read. Saved even when it can't be read: an
  ordering app's link (Toast) is still a good "Full menu" for a visitor,
  and the row then says to add photos instead.
- **Add photos of the menu** (up to 3, or a PDF). Read as the "+ Add"
  box reads photos, and kept as a reading to check like any other, each
  dish "from a picture of the menu". The photos aren't kept and don't
  become its menu link.
- **No menu.** For a place with none to read (a butcher, a caterer who
  cooks to order). It leaves "Couldn't be read" for its own folded "No
  menu" group, counted on its own ("· 2 no menu"), isn't read again, and
  says who said so and when; Undo takes it back. Kept as a skipped
  reading with the note "No menu" (`isNoMenu`, `menuReadingStore.ts`), so
  **no migration**: this environment can't run SQL, and it works on both
  databases as soon as it's deployed. A later reading (a menu link,
  photos, the menu watch finding dishes) replaces it.
- **Dishes from a menu sent through the site say so.** A place whose
  dishes were approved from a menu sent in the "+ Add" box after the tab
  last failed (or said no menu) now says "Its dishes came from a menu
  sent through the site, approved Oct 20", under "Approved and skipped",
  instead of a stale "Couldn't read".
- The browser fallback came next: see "a menu page built by a script"
  above.
- Checked by tests: 5 new in `MainDishes.test.tsx` (4 fail against the
  old tab; the fifth guards the date rule, and fails when it's taken
  out), 7 new in the route's (6 fail against the old route; photos not
  marked as pictures, and Undo clearing any reading, each fail their own),
  and `e2e-admin-write/main-dishes.spec.ts` drives No menu, a reload,
  Undo, and a menu link saved on the listing, against the test project.

## Done Oct 20, later: menus on another page, or by another name (on `redesign/oct18-fixes`, not merged)

The user, Oct 20, of the menus still not read: "Some just aren't being
read right and some have their menu on toast … Is there an option for the
reader to maybe take a screenshot and then read it?"

- **The reader asks as the website watch does** (`MENU_FETCH_HEADERS`,
  `src/lib/menuReader.ts`), with the guide's name in it. Four places'
  sites refused its old "compatible; … menu reader" and nothing else:
  Judah, House of Kosher, Diane's, I Want Moore.
- **A menu by another name counts** (`menuLinks`): "Our Food",
  "Catering", "Shop", "Bakery", "Online Ordering" and the like, after
  the links that say "menu". So does a place's own store on its own name
  (store.gelbsteinsbakery.com). An ordering app's link still never is.
- **Up to three pages are read, best first** (`findMenus`, `readMenus`):
  the first link can be the wrong page (Diane's "Thanksgiving menu coming
  soon", I Want Moore's list of its shop's sections). The next one is read
  when a page names no dishes, the website itself last; within 30 seconds,
  so the request still answers. Main dishes' "Read its menu" and a website
  sent in "+ Add" both do this. A place's own menu link is still read as
  it is, alone. The daily menu watch is unchanged: it watches one page.
- **What it catches** (dev, the 27 places whose reading had failed,
  re-read with the real AI, nothing saved): 14 of 27 are read now, 9 more
  than this morning's pictures change.
  - Judah (10, from its pictures), Gelbstein's (5, its store), House of
    Kosher (5, a PDF), LUHV ×2 (its "Our Food"), Diane's (8), I Want
    Moore (9, its breakfast page), Deluxe Catering (9, its sealed-meals
    page), Magical Sweet Shop (only "Soups", from its catering page: a
    weak reading, worth a look before approving).
  - 13 still aren't: no menu on the site (Miss Rachel's, Savvati's
    pages name no dishes, Shlomo's is a meat and fish market, not a
    restaurant), a menu only on an ordering app (Slices and Rolls and
    Stephen's on Toast, Unit Su Vege's drawn from MenuFreeZone), a site
    that asks a visitor to prove they're a person (20th Street Pizza),
    a website gone (Shtetl, now a gambling site), and drawn by a script
    after it loads (LUHV Vegan Deli, Center City Pretzel, Mike's
    Chicken, Insomnia ×2).
- **Not done, on purpose: getting into Toast and the like.** A screenshot
  of an ordering app or a "prove you're a person" page would be getting
  round a block the site put there, which the watches already don't do
  (`websiteWatch.ts`), and ordering apps are never fetched (agreed Oct 6).
  For those, a person gives the menu (the "Next" below).
- **Tried, not built: drawing a page as a browser does.** Rendered
  locally in Chromium (each place's own site only), the script-drawn ones
  give 3 places, 4 listings: Insomnia ×2, Center City Pretzel, Mike's
  Chicken. Not LUHV Vegan Deli, Unit Su Vege or the rest. On Vercel it
  needs a headless browser in the function (`@sparticuz/chromium`, about
  50MB and several seconds a read) or a paid rendering service. Not worth
  it for 3 places while "Give its menu link" / "Add photos" cover them;
  worth revisiting if script-drawn sites grow. The user, Oct 20: build it,
  as a fallback only when a page comes back nearly empty, after the
  failed-row options.
- Checked by tests (5 new in `menuReader.test.ts`, all 5 failing against
  the old file; each of six one-line mutations (old headers, no other
  names, own subdomain not counted, one page only, first page only, no
  time limit) fails its own test).

## Done Oct 20, later: a calendar's week is this week's schedule (on `redesign/oct18-fixes`, not merged)

Replaces "the next three weeks" and "As well as their usual times" in the
section below (the user, Oct 20: "everything through the queue. ready to
build").

- **A calendar is read one week at a time**: this week from today to
  Shabbos, and from Thursday next week too, each on its own, each to the
  queue as that week's schedule ("Times for Oct 18 – Oct 24"). Every
  time it gives goes on, the ones that match the usual times too, and it
  goes to the queue even when the whole week matches: a week the shul's
  calendar gives is this week's schedule, which usual times aren't. A
  usual minyan the calendar doesn't mention that day stays. A week
  already on the listing as it would be files nothing.
- **One box, day by day** ("This week's schedule"), whether the week came
  from the website or a newsletter, with no "usual times" wording: each
  day from today to Shabbos with its times, a one-day service on its day,
  and a time given twice shown once. Edit opens the newsletter’s week when
  there is one. The newsletter still wins on any day both give: the box takes a
  newsletter's (or a person's) week over the website's, and the website's
  week leaves out those days before it's filed.
- **An events-only calendar** (none of the shul's usual minyanim in its
  week, as Leyv Ha-Ir's monthly Kabbalat Shabbat) only adds what differs,
  each on its own date, and the watch says so: "Their calendar for Oct
  25–31 has none of their usual minyanim, so only its other services go
  on…".
- **With a calendar, the page's own words aren't read for times** (still
  for hours). The text the watch fingerprints starts from Sunday, so it
  reads the same all week (it moved every day before) and changes on a
  Sunday, on the Thursday next week is added, and when the calendar does.
- **Gap, plainly:** from Thursday this week is read again. If an admin
  rejected Sunday's suggestion, Thursday's (the days left) can come back
  to the queue once.
- Checked by tests (each new rule fails against the old code: 23 in all,
  7 of them the box) and real-AI dry runs above. Not checked in a
  browser.

## Done Oct 20: one "Shul’s times", websites' calendars read (on `redesign/oct18-fixes`, not merged)

- **One choice for a shul's times, from its website or its email** (the
  user, Oct 20: "one Shul's times choice, website or email"). "Shul’s
  usual times" and "Shul’s weekly times" were two in Add a watch and two
  groups in the list; now both are "Shul’s times". An email address goes
  to the newsletter reader as before; a web address to the website reader.
- **The website reader takes dated times now** ("the website reader should
  also take dated services and calendars"). It used to drop anything but a
  shul's usual times, leaving a week's times to the newsletter. Now a
  week's times go to the queue as that week's schedule, and a dated
  service as that day's.
- **It reads a calendar on the page** (`src/lib/calendarFeed.ts`): an iCal
  feed the page links to (`.ics`, `?ical=1`, `webcal:`, an embedded Google
  Calendar), or the event list a calendar widget is handed in the page's
  scripts. The next three weeks become a line each, read with the page. A
  watch can also be given the feed's own address. Tried on Leyv Ha-Ir
  (events in its scripts) and Rodeph Shalom (an iCal feed).
- **A calendar's dates stay dates** (the user, Oct 20: "not to guess on
  anything a shul does"). A usual time is one the shul states, on a
  schedule page (Mekor Habracha, Chabad); a calendar's services go to the
  queue as those dates' times, however regular, and an admin can make one
  a usual time. This replaced, the same day, a rule that made a time a
  calendar showed on two same weekdays a usual one: it would have made
  a twice-a-month service "every Friday", and Leyv Ha-Ir's monthly
  Kabbalat Shabbat (Oct 30, Nov 20, Dec 11) missed that only by a day.
  The reader is told so too ("Each entry is for its date only, however
  often it repeats"). Dry runs, 3 each: Leyv Ha-Ir, Oct 30 that day only;
  Rodeph Shalom, Thu Oct 22 and Oct 29 each that day only (it was "New:
  shacharis · Thu"); Mekor Habracha's davening page still reads usual
  times. The month a calendar shows doesn't matter: Leyv's page carries
  every event to June 2027, and the watch takes the next three weeks of
  them each morning.
- **This week's dated times are in "This week's schedule", all week**
  (the user, Oct 20: Rodeph Shalom's Thursday minyan, approved on dev,
  showed nowhere). A one-day addition (a calendar's service, a one-off a
  message gave) used to show only that day and the day before, in a box
  of its own. Now every one from today to Shabbos is listed there, "As
  well as their usual times", under a week the shul sent out when there is
  one ("Also this week"). Checked on dev's Rodeph Shalom listing: "Thu Oct
  22 · Shacharis 8:10 AM". A Yom Tov schedule keeps its own box.
- **A one-day addition no longer pushes a Yom Tov schedule or a sent week
  off its day.** Each date took only the latest-starting schedule, so a
  calendar's Thursday minyan on Chol HaMoed would have put that day back
  on the usual times. It's added beside them now.
- **The newsletter wins when they disagree** ("the newsletter wins when
  they disagree"). What the website reads is marked as the website's. The
  website leaves out any day the newsletter (or a person, through Update
  their times) has given a week for, and a newsletter's week takes the
  website's times off its days.
- **Gaps, plainly:** if a website suggestion and a newsletter suggestion
  for one shul are both waiting in the queue, whichever is approved last
  wins (the website watch never files while anything is waiting, so this
  needs the newsletter to arrive after it). A calendar's lines move on
  every day, so a calendar watch asks the AI most mornings, within the
  run's three reads. A one-off on a day the shul has a usual time for
  that tefillah is shown beside it, not in its place, as one-offs from
  messages already are.
- `scripts/listing-pages-dry-run.mts` takes an address with `=` in it now
  (Leyv's has two).
- Checked by tests (21 of the new ones fail against the old code; the
  calendar reader's own tests caught a weekly repeat running a day past
  its end) and the dry run above. Not checked in a browser, as before.

## Done Oct 19: the Watches tab redrawn (#336, merged)

- **Add a watch asks what it's for first** (the user, Oct 19: "add url or
  email and then another to state what we're adding for"; built as drawn
  in the mockup they approved). Three questions: what it keeps current
  (Eruv status, Shul’s usual times, Shul’s weekly times, Hours, Kosher
  list, Hospital contacts, Anything else; the two shul ones are one since
  Oct 20, above), which place (only places that
  have what it reads: shuls with davening times, places with hours), and
  where it's read (a page or an email address, checked against the
  choice: weekly times only by email). Then it says in a sentence what
  will happen. `src/lib/watchPurposes.ts` holds the list; the server
  checks the same rules.
- **The list is grouped in the same words**, each row led by the place,
  with where it's read from, what it last found, and a pill (Working, Not
  working, To link, Paused…). Tapping a row opens what it does and its
  buttons. A summary line says how many watches and how many need you.
- **Eruv status moved here from the Eruvim tab**, first group: its page or
  email, an email it couldn't read (with It says up / down), Check now,
  Stop reading, and "Add its source" for one with none. The Eruvim tab now
  only says where the status is read from and links here.
- **Deviations from the drawing:** "Mikvah hours" is "Hours" (any place
  with hours, no category-specific code). Menus aren't offered in Add,
  since they're added on their own for each menu link (and, since Oct 20,
  a new link typed in an add or edit is read for its dishes there and
  then). No Name field.
- Not checked in a browser: the local admin sign-in was refused to this
  session, so it was checked by its tests only (35 fail against the old
  code).

## Done Oct 19: faster PR checks (#335, merged)

- **A PR goes green in about half the time** (the user, Oct 19: "PRs are
  taking a really long time"). It took ~20 minutes: everything waited for
  lint, typecheck and the unit tests (~4.5 min), then the end-to-end suite
  ran alone for ~10 minutes, one test at a time. Now every job starts at
  once and the end-to-end suite runs on four runners side by side, each
  still one test at a time. `src/test/ciWorkflow.test.ts` keeps it that
  way. Measured on #335's own run: every shard done 9 minutes after the
  start (lint/unit 4.3 min, the slowest shard 4.8 min after it). A shard
  re-run (2/4 there) adds its own ~3 minutes.

## Done Oct 19 (#333, merged)

- **A watch on a listing's own page** (from the parent session's brief,
  Oct 19): a shul's page of davening times, or a mikvah's page of hours,
  tied to its listing on the Watches tab (a tick box when adding; group
  "Shul and mikvah pages"). Read every morning; only when the page's words
  change does the AI read it (sharing the menu watches' 3 reads a run),
  and what differs goes to the queue as "Their website (automated)", noted
  "From their website, changed <date>", with the page beside it. Agreeing
  never dates the listing (changed Oct 23: it does now); the same suggestion is never filed twice; a
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
  naming only the checks that ran that week, by what they check, never by
  source (Oct 23). No reading
  schedules beyond "every day" (Oct 18).
- **Search box** on the phone home is the category pages' blue-edged box.
- **Try asking keeps the minyan questions** (Oct 17). On a phone, up to six
  in one row that swipes sideways, running to the screen's edge so the last
  one shows cut off; a computer shows the three that fit.
- **What changed / "what's happening in Philly"** stays off the phone home
  until the activity log has real traffic.
