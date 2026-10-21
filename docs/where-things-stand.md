# Where things stand

The running list of what's outstanding, kept in the repo so it survives a
change of Claude account (artifacts and Claude's own notes stay with the old
account). Update it in the same commit as the work that changes it.

Last updated: Oct 20, 2026.

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
   Adding the nine readable ones is Admin → Watches → Add a watch →
   "Shul’s times" (or "Hours" for a mikvah), pick the place, give the
   page. Needs the user's yes.
   Two more with calendars (dry run Oct 20, read a week at a time, would
   file if the page changed today): Rodeph Shalom's
   rodephshalom.org/calendar, "Times for Oct 18 – Oct 24: new, shacharis ·
   Thu Oct 22 · 8:10 AM" (its online morning minyan; its Friday and
   Shabbos times match, and go on as this week's schedule too). Leyv
   Ha-Ir's calendar page has nothing this week, so files nothing; dry run
   as of Thu Oct 22, next week's "kabbalas shabbos · Fri Oct 30 · 7:30 PM"
   goes on by itself (an events-only week, below). Leyv Ha-Ir has a watch
   on dev; Rodeph Shalom has none on dev or live.
   Two calendars the reader doesn't find yet: thelittleshul.org/calendar
   and mikvehisrael.org/calendar-B4BK6 (their pages' words are read
   instead).
1b. **Eruv status by email (6c):** migration 084 is run on both databases
   (the user, Oct 19). Northeast's address on live is still to set: a yes,
   once the branch is deployed. Elkins Park's sender is still unknown.
1c. **"Candle Lighting & Zmanim"** (decided Oct 20): the user renamed it
   on live Oct 20 (label and plural). Its description there is still
   empty; dev has "Candle lighting, Havdalah and daily zmanim", which
   category search reads ("havdalah" finds it). Until the three-line tiles are
   live, the phone home cuts the name to "Candle Lighting &…".

1d. **Migration 085 (`watch.last_check`)** keeps what a watch's last check
   read (Check now, below). Run on neither database: this environment has
   no SQL access, so it needs pasting into the SQL editor, dev first (no
   yes needed there), then live with a yes. Until then everything works,
   and a check's result shows only until the Watches tab is reloaded.

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
