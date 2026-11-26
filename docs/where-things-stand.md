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
      a field there: "A page’s link" (usual times; pages only), "A
      page’s link or an email" (this week's schedule). Done saves it; an
      empty field changes nothing. An email reads "Sign up as … to get
      its emails", no Copy.
    - Picking a place from Google starts its website read straight away:
      times rows say "Checking…" with "Use a different page"; found
      times show with "Use these times"; nothing found is "Not checked"
      with the field. Add before it finishes sends the result to To do.
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
    - **Not built yet:** the "Sign up as … to get its emails" line under
      a typed email; refusing an email typed for usual times (pages
      only); the eruv listing still opens its Change screens; email
      linking and confirmation emails (the later step above).

### You decide

28. The drawings for asking for location when it helps (the hospital
    location boards, branch `claude/eager-nash-317067`): look, or let go.
73. A phone that throws the page away in the background might ignore
    taps until it reloads: a gap noted Nov 16, never seen; every way of
    causing it in a browser worked fine (Nov 22). Only if you see it:
    which screen, how long away, installed or in Safari.

### You do

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
