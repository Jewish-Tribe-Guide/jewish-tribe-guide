# Where things stand

The running list of what's outstanding, kept in the repo so it survives a
change of Claude account (artifacts and Claude's own notes stay with the old
account). Update it in the same commit as the work that changes it. How
the user likes to work is in `docs/how-we-work.md`.

Last updated: Nov 25, 2026.

Finished work moved out on Nov 21: every "Done …" section is in
`docs/history.md`, in the order it was here. On Nov 22 the long sections
behind the open list followed it, so this file is the open list and what's
decided. Look there for why something
was built the way it was; this file is what's open.

## Where this is going (the user, Nov 23)

The goal is accuracy and trust: that is what makes the site work. As
Philly adopts it, the plan is to open it to other communities, and for
a new community's admin to start simply: paste in its shuls, grocery
stores, restaurants and the rest, and the site does everything else. The
admin needs only the To do page, plus any changes to how their site
looks. Weigh new work against that: does it keep facts right and
sourced, and does it work for a community neither of us knows, with no
hand-fixing by Claude or the site owner?

For now the focus is Philly (the user, Nov 23). One person from another
community is interested; theirs is the natural city for 86 when it
comes, not a reason to hurry it.

What stands between today and that, in order: the watches staying calm
(52), a shul watch whose behaviour is predictable on websites it has
never seen (82), then a rehearsal with a real second city (86).

## Everything open (thinned with the user, Nov 23)

On Nov 23 the user and Claude went through the list and kept only what
someone will act on. Everything else is in `docs/history.md` ("The open
list before thinning, Nov 23"), word for word with its number, so an
old number can still be looked up. When an item is done, move it to
`docs/history.md`; the rest keep their numbers.

### Dated checks

52. **Nov 28–29:** check that the shul weeks from Nov 29 on come from the
    new watch (every week now showing was posted before it reached
    live, and all end by Nov 28). No write expected; then close.
82. **After the Nov 28 check:** review the shul schedule and watch code
    as one piece (read → compare → propose) and cut what the Nov 19
    rules made unneeded (this also answers 31, "patches on patches?").
    No rewrite. GenericDirectory and ListingView get split the next time
    work lands in them, not as a project. Settled Nov 23 inside it: a
    shul's home page leaves a usual part (weekday or Shabbos) to another
    of its pages that gives it (`scheduleTakesPart`), and that page
    replaces what the home page has waiting. Sons of Israel's home page
    and Schedule of Tefillot had each filed the other's undoing. The
    review can fold this into the "one regular-schedule page" pick.
    The bar for it (Nov 23): behaviour that's predictable on a website
    it has never seen, even if it catches a little less, since every
    special case so far was learned from one Philly shul's site.
    Since Nov 24 the same words are read the same way (kept readings),
    a date-only line doesn't make a page new, and a week read mid-week
    is compared with the week we hold (`docs/history.md`, "Shul
    watches: the same page reads the same way"). Since Nov 25, five
    more general rules from that night's findings (`docs/history.md`,
    "Shul watches: what Nov 25 read wrong").
86. **After 82: rehearse a second city before inviting anyone.** Pick a
    real one (Teaneck, Baltimore), paste its real lists into a hidden
    community, and let it run two weeks with no hand-fixing. Count what
    lands in To do, what's wrong and what it costs. Things it will show:
    - sources that are Philly-only today (Keystone-K's and Mekor's
      lists, Refuah, the eruv) need to be something an admin chooses or
      adds, not code written for each city;
    - a new admin's first weeks are the noisiest, for the person least
      able to judge them, so start calm: read everything in once and
      confirm it as a batch, then only real changes;
    - the nightly AI reads for 30 shuls and 50 restaurants should be a
      known, small monthly cost before anyone is invited.
83. **About Nov 30:** Sentry's quota resets, so `sentry:check` should go
    green and real errors show again. Then two weeks of policy reports;
    if only known noise, switch the security policy to enforce (one
    word in `next.config.ts`, **mid-December**). Inline scripts stay
    allowed (a nonce would end prerendering).
90. **Monthly, next about Dec 24:** the health review (the user, Nov 24).
    `npm run health` (`scripts/code-health.mjs`), `npm run sentry:check`
    and the last Sundays speed email; compare with the numbers below and
    bring the user only what changed or got worse, with a recommendation.
    Then write the new numbers here. Nov 24 (after the hooks audit):
    139,238 app lines, 14 files over 800 lines (largest ListingView,
    1,552), 73 `as unknown as`, 26 `any`, 24 rules switched off (13 of
    them hooks), no TODOs, 102 files naming Philly-only sources, 4
    packages a major version behind (TypeScript 7 among them), no
    advisories.
81. **About Dec 6:** speed from real visitors again (Sentry, or Vercel
    Speed Insights with your sign-in), after two weeks on today's code.
    Last read: iPhone category pages slow to draw and tap, before the
    Nov 16 and Nov 22 fixes; home taps 400–456ms (target 200ms).
    And the Watches tab's admin reads (2.2s for the combined one before
    Nov 24's change; `docs/speed-targets.md`), against ≤ 1s. And CLS
    (0.19 before Nov 24's footer fix), against 0.1.

91. **When typescript-eslint supports TypeScript 7** (its issue 10940;
    TS 7.1 brings an API back): drop the `typescript` →
    `@typescript/typescript6` alias and make `typescript` 7. Until then
    `npm run typecheck` is TypeScript 7 (`@typescript/native`, ~4s) and
    lint and `next build`'s own check use 6 (~19s), as TypeScript's 7.0
    announcement recommends (Nov 24). Both run in CI.

### Building now

95. **Kept current, on Add and the listing** (agreed with the user Nov
    25, branch `claude/kept-current`, boards M1–M6 and N2–N4 on the
    design canvas). Watches stop being a chore the admin sets up and
    become something they can see and, rarely, change:
    - Stickers on rows: "Checked nightly" / "Checked weekly" (green),
      "Not checked" (grey), none where nothing can check the fact, and
      "Checking…" only while a read runs. Times found but not yet taken
      get no sticker; an email waited for is "Not checked".
    - An opened row keeps its sticker; inside its box, under a thin
      line, one small source line ("From Google", "From
      bethshalom.org/schedule · Change"). Where a source is needed, just
      a link to its field: "Add a page" (usual times; pages only), "Add
      a page or an email" (this week's schedule). Done saves it; an
      empty field changes nothing. An email reads "Sign up as … to get
      its emails", no Copy.
    - Picking a place from Google starts its website read straight away:
      times rows say "Checking…" with "Use a different page"; found
      times show with "Use these times"; nothing found is "Not checked"
      with Change. Add before it finishes sends the result to To do.
      Changing the website re-reads. No cancel. The screen after Add
      stays as it is.
    - Edit listing behaves the same. To do gets only what's broken or
      unclear. Watches moves into Reports.
    - Later, or not at all: an email from an unknown sender linked by
      its domain or postal address when exactly one place matches,
      otherwise To do with the guess picked; "confirm your
      subscription" emails to To do.
    - **Built Nov 25** (all pushed on the branch, no PR yet): stickers
      and the source line in the box (3d6e7d62); the field in the row,
      saved by Done, on Add and Edit listing (dc155bd1); the read on a
      Google pick, held for Use these times (b164d04c); Watches at the
      top of Reports (00a21438). A rejected reading ("Keep mine") needs
      nothing new: the page watch never files the same suggestion
      twice, approved or rejected (`filedBefore`, listingPageWatch.ts),
      so a kept value stands until the page says something else.
    - **Changed Nov 25, after the user's look at Kosher:** Remove is a
      small centred link under Done that names its row ("Remove
      Kosher"); a source field shows only once "Add a page" (or "Add an
      email", for a shul's second source) or Change is tapped; Kosher
      has no field at all, since the kept lists are matched by name
      every night, and a place on none says "Not found on Keystone-K or
      Mekor Habracha’s list · read last night" (the lists' last read).
      Then, from the user's look at usual Shabbos times: only this
      week's schedule offers the other kind of source, at the end of
      its line ("… · Change · Add an email"); usual times are pages
      only, so they no longer offer an email. An opened field closes on
      a click away while it's empty or unchanged, and on Escape. A
      field opened by Change takes its line's place while it's open; one
      opened by Add sits under its line.
    - **Read from is gone from Edit listing (Nov 25, the user's yes):**
      its two jobs no row had moved onto rows. A place Google hasn't
      matched says so on its name row, "Not found on Google · Find it
      on Google". A shul's this week's schedule, while no email reads
      it, ends with the guide's Gmail to sign up with (Copy), "The
      guide’s Gmail isn’t set up · Set it up", or "An email from … came
      in · Link it" when a sender is waiting. The eruv listing still
      has its Read from box until its rows are done.
    - **Then (Nov 25, the user's yes):** Remove is on every row that
      opens in place and has something, not only one just added: it
      empties the row, which goes under "Not on the listing yet"; the
      save sends it. Never on the name, the address or a field the
      category requires, and not on rows that open a screen of their
      own (times, dishes, people). It's the shared editor, so a
      visitor's Suggest an edit has it too, as a proposal. And a read
      that failed is "Not checked", not "Checked nightly": on Add (a
      page, Refuah, the guide's Gmail not answering) and after a Read
      now that failed on Edit listing.
    - **Nov 26 (the user's yes):** on Add, a website read that has
      nothing for a row gets one link, not "Change · Add an email" (they
      opened the same field): "No minyan times on its website · Add a
      page" (usual times), "· Add a page or an email" (this week's). The
      field opens under the line. A read that failed keeps Read now and
      Change.
    - **Nov 26, guided Add (boards U1–U4, the user's yes):** Add on
      Places opens "What are you adding?", a screen of the categories
      as rows with their glyphs (`?add=`); a tap goes on, with no menu
      and no Next. Find and the rows say what's added ("Add a
      synagogue", "Find the synagogue") when the category has a plural
      of its own, else "Add to Food" and "Find the place"
      (`addingWords.ts`). Each says "Step N of 3". Back steps through
      them (`&from=pick` says the first step's entry is underneath).
      The rows use the admin's own grey glyph squares, as Site's
      category list does, not the board's dark circles.
    - **Nov 26, actions on the right (the user's ask):** a row's source
      line keeps "Checked nightly · From its menu · Oct 20" on the left
      and puts Read now · Change on the right, as the M boards drew it.
      On a phone with no room the actions drop to their own line, still
      on the right.
    - **Nov 26, the line says the sticker's words (the user's yes):** an
      opened row's line reads "Checked nightly from Google · last Aug 28",
      the sticker's own words in plain text, so a newcomer sees the line
      is what the sticker is about. A row on its own screen (Main dishes)
      has its sticker on the title's line, at its right (not up on
      Back's line, Nov 26). Add's rows say the same words. The date is
      when that source was last read.
    - **Not built yet:** the "Sign up as … to get its emails" line under
      a typed email; refusing an email typed for usual times (pages
      only); the eruv listing still opens its Change screens; email
      linking and confirmation emails (the later step above).
- **Fixed Nov 26, the seed's About was a test's marker.** The committed
  seed's About body was "Mid-regeneration check … round 2", left by a
  cache run cut off before its `finally` and copied in by the backup the
  seed was made from; the seed check didn't know that marker. It now has
  About's live text (Nov 16, its Gmail made up), and `scripts/testWrites.mjs`
  lists what the write suites save: the seed builder refuses a backup
  holding one, the committed-seed check fails on one, a check fails if a
  suite writes one the list doesn't know, and the About tests stop on one
  rather than restoring it.
- **Nov 26, About laid out as Privacy (the user: "two things that are
  pretty similar type of pages looking different"; canvas "About like
  Privacy", boards A1 and B3).** One rule for both pages: the mission
  line, the first section open with its points as icon rows, the rest as
  boxes on a computer (with On this page beside them) and rows that open
  on a phone ("More about the guide"), then Ways to help as one box of
  rows. The pairs and card grids went (`aboutBlocks` deleted). The text
  now opens with What sets it apart, its points in the user's order (one
  community, every kind of Jew, every fact dated, anyone can fix), the
  first point's sentence leading with what it is. Seed, dev and live
  have the new text (live written Nov 26 with the user's go-ahead, old
  text backed up first) and showing since its cache was refreshed.
  Done.
- **Fixed Nov 26, every community screen logged "URL data outside of
  <Suspense>" in dev** (Next's instant-navigation check, not only About).
  The community layout and every screen read the community from the
  address first, on purpose (404 before anything is sent; a whole-screen
  boundary painted empty, then jumped, Nov 24), so each now says
  `instant = false`: nothing changes at runtime. About is the exception:
  its text is shared, so only its count reads the address, in a boundary
  of its own, and a navigation to About shows the page at once.
  `src/test/instantNavigation.test.ts` holds both (13 of 14 red before).

### You decide

28. The drawings for asking for location when it helps (the hospital
    location boards, branch `claude/eager-nash-317067`): look, or let go.
73. A phone that throws the page away in the background might ignore
    taps until it reloads: a gap noted Nov 16, never seen; every way of
    causing it in a browser worked fine (Nov 22). Only if you see it:
    which screen, how long away, installed or in Safari.
96. **Add, rethought** (Nov 26–27): BUILT Nov 27 as drawn, on
    `claude/kept-current` (`docs/add-rethink.md`, "Add, rethought"
    canvas R1, R2, R3b, R4, P6b). Every Add opens one Find the place
    list; the AI box is a row on it, says it's AI, and a read about one
    place we have opens its Edit listing. Left: counting it (the plan's
    step 1), the home page's nothing-found card (not drawn), and the
    forwarding phone number the user hopes will replace paste and
    camera. The AI read's speed: 97.
    Then BUILT Nov 27 (the user's OK, the dot chosen over a pop-up): a
    post or photo is sent as it is (S1b, S2: Send, then "Sent", no AI
    tag) and read afterwards at the "high" level into ordinary
    suggestions (`src/lib/messageFiling.ts`; S3b, today's card). What
    the read can't file (which of two places, a menu, a question, a
    failed read) waits on To do as "Posts to sort by hand", the post as
    sent with what was left, and Done (not drawn). A read that never
    finished is tried again when To do loads. "Your updates" on You
    lists what this phone sent (Live / Waiting / Not changed, S4c), and
    the dot on You lights when one goes live; S4b and S4d (the pop-up)
    are not built. Needs migration 118 first: 98. The menu and shul
    times boxes still read while the sender waits.
99. **Add, renamed and one box** (Nov 27): DRAWN, not built until the
    user OKs it ("Add, rethought" canvas U1, V1, V2). On a phone the
    floating button is a round "+" (U1; a computer keeps "Add or
    update"); the sheet is titled "Add or update", search first, then
    one small button, Just tell us (V1). That opens one box: "Say it in
    your own words, or paste it from WhatsApp or an email", an Add a
    photo button (the phone's own menu; each photo a thumbnail with ✕),
    and the site's wide Send, live once there's words or a photo (V2).
    Replaces today's box.
100. **The site's own email address** (proposed Nov 27, next after
    99): one address per community (`<community>@in.<domain>`, a
    catch-all, so a new community has one with nothing to create) that
    a mail service hands to the site within seconds, instead of the
    Gmail script checking hourly (an eruv email sat up to an hour,
    Nov 27). Mail from a watched list (eruv, shul newsletters) is read;
    anything else (a person's reply) is forwarded to the admins. It
    becomes the community email (reply-to) shown in onboarding and
    Settings, and the guide's Gmail can then go (check what else signs
    in with it first). Needs: the service (Cloudflare Email Routing
    if the domain's DNS is there), and subscribing the address to
    JCOR's groups.io list and each newsletter.

### You do

98. Run migration 118 on live (dev done Nov 27), BEFORE this
    branch (`claude/kept-current`) is deployed live:
    [`supabase/migrations/20240101000118_sent_message.sql`](../supabase/migrations/20240101000118_sent_message.sql)
    (adds `sent_message`: a post sent with the "+ Add" box, kept until
    it's read). Without it the box can't send a post.
97. Run migration 117 on live (dev done Nov 27):
    [`supabase/migrations/20240101000117_message_read_time.sql`](../supabase/migrations/20240101000117_message_read_time.sql)
    (adds `message_read_time`: how long each "+ Add" box read took, and
    at what thinking level; no post text). Until then the time isn't
    kept. The box reads at "low" since Nov 26 (the user's OK, after
    `scripts/compare-reader/messages.run.ts` on 42 real posts: slowest
    tenth 8.1s to 4.8s, read as well as the default).
94. Run migration 116, dev then live:
    [`supabase/migrations/20240101000116_community_email.sql`](../supabase/migrations/20240101000116_community_email.sql)
    (adds `community.contact_email`). Then save Philly's address on
    Settings › Team › Community email.
87. Settings, a few minutes each (the user will do them, Nov 24):
    - Sentry: turn on the quota emails, 80% and 100% (Settings →
      Account → Notifications → Quota);
    - Vercel: add `SENTRY_API_TOKEN` (the read-only one in
      `.env.local`) to the live deployment, for Sundays' speed email;
    - Supabase: check the live project's region is US East, near
      Vercel's `iad1`, or every admin read pays the distance;
    - Sentry: resolve JAVASCRIPT-NEXTJS-12 and -13, both from before
      fixes now live;
    - Main dishes: Read now on the three menus stopped since Nov 4;
    - try the phone home's "+ Add" hiding as you scroll, on a phone.
19. Mekor's list against ours: PLNT Burger Jenkintown (IKC?), and Nothing
    Bundt Cakes, Cherry-K there and Keystone-K here.
35. Magical Sweet Shop's hechsher: call 856-309-1100, or ask Mekor.
36. Elkins Park's eruv sender: ask 267-415-6760.
37. The Shtiebel's calendar: add southphiladelphiashtiebel.org/calendar
    as its page.
38. House of Kosher's menu link is still a PDF on live: set the catering
    menu (?).
39. Try the newsletter's Read now by email once.
43. PostHog: check Session Replay's project settings.
47. Refuah: ask them, and read their terms.
85. UES (made up, on dev only, 2 listings): delete it in the site
    owner's console (Communities). Harmless meanwhile; nothing relies
    on it.

### Waiting on others

79. Sons of Israel's newsletter has sent nothing.
80. Penn Presbyterian and Pennsylvania Hospital are empty on Refuah.

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
  eruvim. Never weekday minyanim on Philly's (Nov 15: an admin can choose
  the next minyan or the eruv instead, boards V1/V2).
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
- **Migration 067** runs only when Today is turned on (was item 55).
- **One contact email for every community** for now: there is one
  community, all phillyjewishguide (the user, Nov 23; a rebrand later).
