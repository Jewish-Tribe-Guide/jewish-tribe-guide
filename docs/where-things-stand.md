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
   Oct 21: it ran there, but Insomnia came back as a cookie notice. Now
   "Read again" on Ben & Jerry's, Center City Pretzel, Insomnia and
   Diane's says why each fails (see "a menu that can't be read says why").
4. **Go through the menus read, after that** (the user, Oct 21): for each
   place read, what the reader got right and which dishes it missed.
   Dishes added by hand are now looked for on each read after (see
   "dishes added by hand are checked"), so "Read again" after adding
   them shows which the reader finds.

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
     link (`approve_menu_dishes`, migration 065). So most "menu links" are
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
     Dishes again); and the tab's row counts come from the same statuses.
   - **Waiting on the user:** should a read that agrees with the listing
     clear an older finding still waiting? Mekor Habracha's Oct 21 read
     agrees, but its Oct 20 finding still waits to Compare.
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
       evening time. Not fixed, for later:
       - Beth Zion-Beth Israel has 5 pages (two are High Holy Day
         pages), all reading the same calendar week.
       - The Rosenbach, a museum, has 5 pages read for shul times.
       - Rodeph Shalom's calendar page doesn't load.

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
