# Where things stand

The running list of what's outstanding, kept in the repo so it survives a
change of Claude account (artifacts and Claude's own notes stay with the old
account). Update it in the same commit as the work that changes it. How
the user likes to work is in `docs/how-we-work.md`.

Last updated: Nov 22, 2026.

Finished work moved out on Nov 21: every "Done …" section is in
`docs/history.md`, in the order it was here. On Nov 22 the long sections
behind the open list followed it, so this file is the open list and what's
decided. Look there for why something
was built the way it was; this file is what's open.

## Everything open, in one list (Nov 21)

Every open item, gathered in one place and checked against live where
live could say (read only, Nov 21). The longer sections each item was
gathered from moved to `docs/history.md` on Nov 22 ("Detail behind the
open list"): search there for an item's words to find its background. "(?)" means it couldn't be checked from here and may already
be done. When an item is done, move it to `docs/history.md`; the rest
keep their numbers, so a number always means the same item.

Checked and done, so not listed: migrations 095–099 and 105–113 (live has
all but 067, parked with Today), Philly's live home rows and Right now,
the feedback wording, 077 and 082, Sababa (Not on Google since Oct 26),
Tasty Twisters, the Brodsky duplicate, the old shul items in the queue,
Jewish Medical Resources (not on live), PR 411, CI runs colliding.

### To talk about (the user flagged these from the health rating, Nov 22)

81. Page weight. Nov 22: the editing screens (Edit, Add, Update their
    times, Add a minyan, a schedule, the form wizards) load when opened,
    not with the page: a category page and a listing's page went from
    390-396 KB to 340-346 KB, the map from 352 to 331 KB; their ceiling
    is 380 now. Still above the ~300 KB rule of thumb: what's left is
    Next and React themselves (~190 KB) and the listing's own code; the
    next step would be measured, not guessed. Real visitors (Sentry's
    page-load timings, last 30 days, read Nov 22; few samples, about 20
    category page loads): on iPhones a category page's LCP was 4.4-6.4s,
    the listing rows being the last thing drawn (Nov 12, 18, 20), and
    tapping a row took 1-1.8s (Nov 12, 14). Both before fixes that
    should cover them: the first tap on a place (Nov 16) and a phone no
    longer drawing the computer layout first (PR 429, Nov 22; also the
    0.37 layout shift). Not covered yet: on iPhones a tap on the home
    took 400-456ms to answer (Nov 16-20; target 200ms). Next: read
    Vercel Speed Insights (needs your sign-in) or Sentry again about Dec
    6, after two weeks on today's code.
82. Complexity: watches, sources, schedules in parts, AI readers, several
    communities, sheets and screens with their own addresses, and long
    AGENTS.md sections on working around Next. It works and is tested,
    but it's expensive to change and takes a lot of context to pick up.
    Measured Nov 22: 138k lines of code (110k of tests). Shul schedules
    and watches are the biggest area: 10k lines in 46 files in `src/lib`
    alone. Then ask/search (5.3k), the AI readers (2.6k), submissions
    (2k). Most changed in 60 days: GenericDirectory (104 commits, 1,116
    lines), ListingView (78, 1,551), Landing (72), ResourceMapView (59),
    CategoryEditor (54). My recommendation: no rewrite. (a) After the
    Nov 28 shul check, review the shul schedule and watch code as one
    piece (read → compare → propose) and cut what the Nov 19 rules made
    unneeded. (b) Split GenericDirectory and ListingView the next time
    work lands in them, not as a project of its own. (c) Trim this file
    (2,400+ lines; you wanted that Nov 21): finished sections to
    `docs/history.md`. Your call which, if any.
83. Security hardening. Nov 22: the policy now allows what Google Maps
    really loads (its fonts, its legend, WebAssembly; JavaScript eval
    stays blocked). Every map visit broke it dozens of times, and by Nov
    13 that had used up Sentry's monthly quota, so Sentry has dropped
    every event since, real errors too, while `sentry:check` said ✓. It
    now says when Sentry is dropping events, and lists CSP reports.
    Sentry keeps dropping until the quota resets (about Nov 30). Then:
    watch the reports for two weeks; if only known noise (the admin's
    eval, browser extensions) comes in, switch the header to enforce,
    which is a one-word change in `next.config.ts`. Inline scripts stay
    allowed: closing that needs a per-request nonce, which would stop the
    pages being prerendered and cached. Not worth that for this site.

### You decide (a design or product call)

1. A phone version of "How it looks" (not drawn yet).
2. Copy dev's photos for Eruv, Hospitals, Childcare and Schools to live?
3. Can visitors reorder their saved places on You?
4. Separate the test database from dev's (it is also every preview's).
5. Phone home boards drawn, not built: N1, N3, O1–O3, P1/P1b; and
   "boxes and rows" (Flip C), parked until you pick.
6. The computer home's middle piece (neither option picked; W7l may
   have settled it) (?), and You and What changed as extra cells there.
7. The "Right now" label on the computer home: may come back.
9. A "Recent changes" box on each listing.
10. One contact email for every community?
11. On a phone, saved places and searches on You come off only by swipe.
12. Two home tiles use a Google thumbnail and an iStock photo (licence?).
13. The installed app's name and icon are Philly's for every community.
14. In Add/Edit, hours are broken out only from Contact (a fix proposed).
15. Held for a look with real people: showcase sections, search in the
    header, next minyan in rows, one map switch, side by side, Explore by
    Category showing every category instead of "More".
16. Boards drawn, not built: M2, M3, K1, K1b, G2 (G2 may be replaced by
    the built G3) (?). Do search lines keep their icons?
17. "+ Add" opening on Find the place (boards 1–4, 1b–3b); later, + Add
    by hand first with the AI as the option.
18. Held: boxes that fold in Fields, a box's trash can, big fields as
    rows in any box, "Within a walk", "Before it's opened", Mikvah
    sections.
19. Mekor's list against ours: PLNT Burger Jenkintown (IKC?), and Nothing
    Bundt Cakes, Cherry-K there and Keystone-K here.
20. Boards 14–15: a ready-made field, fixed or local.
22. Hospitals' Eruv field takes its choices from the Eruv page?
23. A "Kept up to date" box (recommended, not drawn).
24. UES Grocery's "Kosher" yes/no becomes Kosher Store?
26. The rest of the field-by-field review.
27. The "+" covers part of the third tile on the phone home.
28. The drawings for asking for location when it helps.
29. Admin drawing extras: a form's "On the site" switch, a campaign's
    own photo, Reports without two tiles, header items on/off and
    dragged (?).
30. A mikvah's section phones and emails: in Contact, or their sections?
31. Is the synagogue admin logic patches on patches? (The shul watch
    rewrite may have answered it.) (?)
32. For later: a week matching the usual times posted by the watch on
    its own; where a minyan that isn't a shul shows; the site writing a
    shared link's preview line itself.

### You do (only you can)

33. To do: 6 Mekor new places (Cinnaholic, Nothing Bundt Cakes, Magical
    Sweet Shop, Penn Hillel's Dining Commons, Kosher Corner at Temple,
    the Brodsky Center).
34. To do: 5 website changes found today (Mikveh Israel, the Shtiebel,
    Lower Merion, Sons of Israel twice).
35. Magical Sweet Shop's hechsher: call 856-309-1100, or ask Mekor.
36. Elkins Park's eruv sender: ask 267-415-6760.
37. The Shtiebel's calendar: add southphiladelphiashtiebel.org/calendar
    as its page.
38. House of Kosher's menu link is still a PDF on live: set the catering
    menu (?).
39. The newsletter Gmail script's link is saved on live (checked Nov 22).
    Left: try Read now by email once.
40. The next production build's log should say Node 24. (Turnstile
    and Upstash keys checked Nov 22: set.) (SENTRY_CRON_MONITORS is set: the
    monitor checked in from live on Nov 22.) The whole owner's list is
    in `docs/operations.md`.
41. Live backups: Supabase keeps 7 days (checked Nov 22). Left: run
    our own copy weekly (`docs/operations.md`); the last was Nov 21.
43. PostHog: check Session Replay's project settings.
45. On the preview: the listing's small map tile, the default-location
    map and picker, the menu reader's browser; then review the menu
    reads.
46. Pictures for the rest of the phone's category tiles (Networking's
    and Eruv Information's don't work as tiles).
47. Refuah: ask them, and read their terms.
48. Washington (hidden): only Synagogues is set up; Map, Candle Lighting
    and Eruv rows when it's readied, and an uptime check once visible.
49. Auto-fix on PRs from the new account; the nightly email seen in a
    real inbox (?).

### Needs your yes, because it writes to live

52. The shul watch's live data clean-up. Looked Nov 22 (read only): every
    week still showing was posted Nov 19–20, before the new watch reached
    live (PR 399, Nov 20 13:18 UTC), and all end by Nov 28; older weeks
    are past and no longer show. Recommended: no write. Check that the
    weeks for Nov 29 on come from the new watch, then close this.
55. Migration 067, only when Today is turned on.

### Mine to build or fix (nobody waiting)

62. Watches' days run on New York's clock (right for Philly and UES).
66. Done or settled Nov 22. Site's rows on a phone have their lines
    (board 21: what Home page holds, how many categories, which campaign
    is running). Stale: "Edit, then update" is gone (a change opens in
    the editor, its answers in a bar pinned over the tabs on a phone).
    Kept on purpose: a home-page card row's chevron (it opens in place,
    and a row that opens has one); "Stopped checking" and the unlinked
    senders (added beyond board 18b, both needed). Held for you: making a
    new newsletter key (not drawn; a new key stops the Gmail script until
    it's set up again).
71. Watch jobs agreed and not built (?): dishes split across menu pages,
    each kind's last 14 nights, no Read now on a Google-and-newsletter
    place, eruv status read more on Friday afternoons, a menu's monthly
    re-search (Look again may cover it), the per-category job switch,
    Mikvah photos and "Read it for", "also sent in by a visitor", a
    per-minyan view of a schedule change, Lower Merion's full calendar.
72. The intake wizard's problems, parked while forms are hidden.
73. A phone that drops the page in the background: taps do nothing
    until it reloads. Measured Nov 22 on a production build, phone-sized
    Chromium, tapping a home tile after each: frozen 30s and resumed,
    offline 10s and back, left and come Back, and a deploy in between
    (chunks not yet loaded gone, pages from another build). Every tap
    worked. So it doesn't reproduce in a browser; next is a real phone
    (which screen, how long away, installed or in Safari).
76. The moderation queue's "Bad Request" once; 25 old migrations that
    can't be told run; a slim search index for the home, later; log
    retention past ~50,000 rows a day.
77. Flakes to watch: category-editor's Delete question, admin-write's
    server stalls, offline.spec:109, category-open, todo-scroll, the
    phone prefetch budget, slow test-database spells.

### Waiting on others

78. 5 moderate npm audit findings, in Sentry's build plugin.
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
