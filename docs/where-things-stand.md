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

95. **Kept current: what's left is "later, or not at all"** (agreed Nov
    25). An email from an unknown sender linked by its domain or postal
    address when exactly one place matches, otherwise To do with the guess
    picked; "confirm your subscription" emails to To do. Everything else
    in it is built (Nov 25–28); the record is in `docs/history.md`,
    "Kept current, on Add and the listing".
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
99. **Add, renamed and one box** (Nov 27): BUILT on claude/kept-current,
    not live yet ("Add, rethought" canvas U1c, D1b, V1b, V2b). The
    header's button opens the screen's own Add when it has one (a
    category, the eruv), else the site's (`src/lib/addHere.ts`).
    The search's dotted last row keeps its wording ("Add bagel · Not in
    the list? Add it to the guide"; the user, Nov 27). On a phone the
    floating button is a round blue button with a white "+" (U1c); on a
    computer it's gone, and an outlined "+ Add or update" sits in the header
    beside Set location, not on the Map (the user, Nov 27) (D1b, chosen over D1c and D1d; brings back Sep 22's header
    button, drops Oct 26's apricot); the sheet is titled "Add or update", search first, then a
    whole-text link, "Or tell us in your own words ›" (V1b). That opens
    "Tell us": one bordered box holding the words ("Type it, or paste it
    from WhatsApp or an email") and any photos (thumbnails with ✕), with
    "Add a photo" as a strip along its bottom edge (the phone's own
    menu); the site's wide Send alone below it, live once there's words
    or a photo (V2b). Replaces today's box.
100. **The site's own email address** (BUILT Nov 27, live Nov 28:
    the first test email was forwarded to the admins): one address per
    community, `<community>@phillyjewishguide.com`, a catch-all at
    Resend (it receives mail too, so no second service), which posts
    each email to `/api/inbound/email` within seconds instead of the
    Gmail script's hourly check. An eruv's email is read for up or
    down; a watched newsletter is read and filed, as the script's are;
    anything else from a person is forwarded to the community's admins
    with Reply-To the sender, so the admin's Reply answers them.
    Auto-replies and bounces are never forwarded; other machine mail (a list's "confirm your address", a receipt) is, since an admin may need it (Nov 28). Once set,
    `getCommunityEmail` gives this address when Settings has none
    saved, so it becomes the reply-to on every email the site sends
    visitors, and the site sends from it too (one address a visitor
    sees everywhere; sign-in links stay on `RESEND_FROM`). No "in."
    subdomain: the domain receives no other mail (the user, Nov 27). Eruv emails this way are believed on Resend's receiving
    server's word, `receive.forge.rmta.net` (`INBOUND_AUTH_SERVERS`,
    read off the first real email Nov 28), from the topmost
    Authentication-Results only (`topHeader`). The first forwards
    landed in Gmail's spam (a new sending domain; DKIM, SPF and DMARC
    are all in place): each admin adds the address to their contacts.
    The admin pages no longer ask for a Gmail once the address is set
    (Nov 28): Team and Community email show the address, the setup
    step is gone (nothing to set up), and Read now looks in Resend's received mail (14
    days, `receivedEmail.ts`) before the Gmail script. Each received email counts against Resend's send quota
    (Free: 100 a day, 3,000 a month), and Resend keeps it 30 days.

103. **Who hears what, the gaps** (found Nov 27 while mapping mail
    for 100). The first two are built (Nov 28): a "+ Add" post the AI
    couldn't file emails the admins (through "Something new to decide"),
    and marking it Done emails the visitor who asked. Left:
    - the To do screen's reject has no reason field, so the visitor's
      email can't say why;
    - a form response's Reply is a plain mailto link from the admin's
      own address (100's forwarding covers the visitor answering back,
      not the admin writing first).
    My recommendation: the reason field when rejects are common; leave
    Reply as it is.

### You do

102. Turn on the site's email address (100), in order (1-3 done
    Nov 27-28, Production only; 116-118 on live too):
    1. Resend › Domains: open `phillyjewishguide.com` (add it if the
       site sends from another domain, with the records Resend lists),
       turn on Receiving, and copy the MX record it shows into
       Namecheap's Advanced DNS (host `@`). The domain has no MX today,
       so no mail elsewhere is affected; from then on all mail to
       `@phillyjewishguide.com` goes to Resend (the user, Nov 27).
    2. Resend › Webhooks: add `https://<live site>/api/inbound/email`
       for `email.received`; put its signing secret in Vercel as
       `RESEND_WEBHOOK_SECRET`, and `INBOUND_EMAIL_DOMAIN` =
       `phillyjewishguide.com`; redeploy. From then on the site's
       emails come from `philly@phillyjewishguide.com` too. Also
       `RESEND_RECEIVING_API_KEY`: a full-access key (Resend › API
       Keys); the sending key can't read received mail (found Nov 27,
       the first test email).
    3. Send one email to `philly@phillyjewishguide.com` and tell me;
       I read the server name from it for `INBOUND_AUTH_SERVERS`.
    4. Move JCOR's groups.io list and each shul newsletter to the new
       address, one at a time, unsubscribing the Gmail (a list on both
       is read twice). Done Nov 28: JCOR, BZBI, Kol Tzedek. Left:
       Mekor, the Shtiebel, Society Hill (Constant Contact). Sons of
       Israel's watch is off. A sign-up's "confirm" email is forwarded
       to the admins (PR 471); before that, click it in Resend ›
       Receiving.
    5. Nothing to clear: the site's own address now wins over a saved
       one (Nov 28).
    6. Later: retire the Gmail script, after checking nothing else signs
       in with that Gmail.
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
