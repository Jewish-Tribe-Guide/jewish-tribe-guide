# Where things stand

The running list of what's outstanding, kept in the repo so it survives a
change of Claude account (artifacts and Claude's own notes stay with the old
account). Update it in the same commit as the work that changes it. How
the user likes to work is in `docs/how-we-work.md`.

Last updated: Nov 21, 2026.

Finished work moved out on Nov 21: every "Done …" section is in
`docs/history.md`, in the order it was here. Look there for why something
was built the way it was; this file is what's open.

## Everything open, in one list (Nov 21)

Every open item in this file, gathered in one place and checked against
live where live could say (read only, Nov 21). The sections below hold
the detail. "(?)" means it couldn't be checked from here and may already
be done. Cross an item off here when it's done.

Checked and done, so not listed: migrations 095–099 and 105–113 (live has
all but 067, parked with Today), Philly's live home rows and Right now,
the feedback wording, 077 and 082, Sababa (Not on Google since Oct 26),
Tasty Twisters, the Brodsky duplicate, the old shul items in the queue,
Jewish Medical Resources (not on live), PR 411, CI runs colliding.

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
8. Decided Nov 22: What changed is an activity feed, every change in
    order (the user: "I like my way"). Already built that way.
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
21. Done: "Can visitors upvote places?" is built (a page's Questions in
    the admin; checked Nov 22).
22. Hospitals' Eruv field takes its choices from the Eruv page?
23. A "Kept up to date" box (recommended, not drawn).
24. UES Grocery's "Kosher" yes/no becomes Kosher Store?
25. Hotels' "What makes it Shabbat friendly?" (the user's yes, Nov 22):
    on dev, asked after a Yes, shown under it in the Shabbos friendly
    box. Live needs your yes (dry run ready).
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
40. Vercel Production: check the Turnstile and Upstash keys; set
    SENTRY_CRON_MONITORS=nightly-email and redeploy; the next build's
    log should say Node 24.
41. Live backups: check Database → Backups, and run the first live copy.
42. Done: 103 is on live (the site's public key reads nothing, Nov 22).
    104 can't be seen without a write; 105–113 ran after it.
43. PostHog: check Session Replay's project settings.
44. The first live morning after a deploy: each community's run shows
    in its own tab, and Vercel's log has no "run didn't start".
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

50. The Denomination/Nusach change (dry run ready).
51. Done: live has About and Privacy's new text (since Nov 16).
52. The shul watch's live data clean-up (look again first).
53. Drop the old admin columns (tagline and the rest are still on live).
54. Done: live has the hospital fields (same as dev) and 7 Refuah
    watches (checked Nov 22).
55. Migration 067, only when Today is turned on.

### Mine to build or fix (nobody waiting)

56. Done: Partial Prefetching is live (PR 427, deployed Nov 22). Live
    answers 404 for a made-up category, listing, community and a shared
    question in a community that doesn't exist.
57. Checked Nov 22, not reproduced: a search (`?q=pizza`) stayed in the
    address through a refresh on coming back to the tab, opening a
    listing and Back, and Activity and Back. Left as is.
58. Checked Nov 22, not reproduced: the one failure (1 in 34 runs of
    editor-screens) didn't come back in 55 more. A lead only.
59. Stale (checked Nov 22): closing a listing opened from its own link
    tells Next's router the category's address (Nov 17, 14d8c056), and
    src/test/replaceStateMark.test.ts fails on a call that doesn't.
60. Stale (checked Nov 22): the Add a listing picker closes on Escape
    (Nov 16, 01caf0e7, with a test); so does the header's Categories menu
    (tried on dev).
61. Done Nov 22: the sheets' "Drag to resize" handles and the Nearby
    sheet's work from a keyboard: Tab reaches them, Enter or Space does
    what a tap does, the arrows open and lower them (tried on dev's Map
    at phone size).
62. Watches' days run on New York's clock (right for Philly and UES).
63. Dropped Nov 22: on a Sunday that's Yom Tov, "last Shabbos" is still
    true, and those keeping Yom Tov aren't on the site that day.
64. Stale (checked Nov 22): a new place opens its own screen (board
    L3NewPlace, built Nov 2), its hours under "Not on the listing yet",
    not every day "Closed".
65. Done Nov 22. A new community's admin opens straight to its To do
    (walked on dev with a made-up community, since deleted; fixed by the
    Nov 16 and 18 community-list expiry); the preview map opens on the
    community's own centre (Nov 19, 60f1796b); and the nav's count now
    follows a save anywhere in the admin: any admin write reads the setup
    again (one small request, `onAdminWrite` in adminApi.ts).
66. Done or settled Nov 22. Site's rows on a phone have their lines
    (board 21: what Home page holds, how many categories, which campaign
    is running). Stale: "Edit, then update" is gone (a change opens in
    the editor, its answers in a bar pinned over the tabs on a phone).
    Kept on purpose: a home-page card row's chevron (it opens in place,
    and a row that opens has one); "Stopped checking" and the unlinked
    senders (added beyond board 18b, both needed). Held for you: making a
    new newsletter key (not drawn; a new key stops the Gmail script until
    it's set up again).
67. Done Nov 22: the starter Food page has today's Store Type; a partner
    (a certificate's link) isn't a row of its own in a page's field list,
    and moves with its field.
    Found on the way, fixed: the admin's Home page preview (the site in
    a frame) broke the report-only security policy on every opening;
    `frame-src` now allows the site itself.
68. Done Nov 22: the kosher watch, the hospital watches, the question
    reader, "Ask"'s food/shul/hospital words and the map's pins go by a
    page's kind, not its address, so a community whose Food page is
    /eats or whose hospitals are /medical gets them too. Left on
    addresses on purpose: the Mekor and Keystone runners (Philly's own
    lists), and a new place the kosher watch finds still goes on
    /restaurant.
69. Stale (checked Nov 22): two posts covering one week was an Oct 31
    note, fixed Nov 10 (e881f48c): a box's Edit, To do's included, opens
    every post it shows a time from, and Edit listing's week row lists
    them all and saves them into one.
70. Done Nov 22: Read now tried on a computer (1280 wide, dev): Mekor's
    Usual weekday times, "Reading its website…", then "just now" with
    nothing changed. It sits on the row's source line, as on a phone; no
    drawing of its own needed.
71. Watch jobs agreed and not built (?): dishes split across menu pages,
    each kind's last 14 nights, no Read now on a Google-and-newsletter
    place, eruv status read more on Friday afternoons, a menu's monthly
    re-search (Look again may cover it), the per-category job switch,
    Mikvah photos and "Read it for", "also sent in by a visitor", a
    per-minyan view of a schedule change, Lower Merion's full calendar.
72. The intake wizard's problems, parked while forms are hidden.
73. A phone that drops the page in the background: taps do nothing
    until it reloads (not measured).
74. Done Nov 22: one Places load makes one jobs read (two before, its
    list's and the nav's To do count's). The same jobs asked for while a
    read of them is under way share it, until a save in the community.
75. Done Nov 22: dev had six leftover test listings (five in Philly, from
    before the write suites moved to their own community on Nov 20, and
    one under a hidden category a cancelled run left); all deleted, with
    that category. Today's suite deletes its listings with the category
    it seeds.
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

## The branch

The redesign was merged into `main` on Oct 17 at 7:24 PM (#322, at
7d5fead6) and is live. Work since is on `redesign/oct18-fixes`, which goes to
`main` a PR at a time. The last, #379 (the Category pages redesign, Nov 5–9),
merged Nov 9 at 2:38 PM (ffb6ca63), so as of Nov 9 the branch holds nothing
`main` doesn't. Keep building on it, and merge `origin/main` into it before
the next PR.

**Moved to a new Claude account on Nov 9.** What didn't come along:

- **The drawings.** Every canvas and artifact linked in this file
  (claude.ai/artifact/…) belongs to the old account. The new one can open
  them only if the old account shares them. The decisions they settled are
  written here, so the text is what to go by. The latest is the Category
  pages canvas, ThgexAyY2q6o6YDxg21RBM.
- **Auto-fix on PRs.** The app's PR watcher was switched on per session.
  Turn it on again for the next PR from the new account.

Small open items from Nov 9:

- "How it looks" isn't built for the phone (nothing sits beside a field
  there).
- The Denomination/Nusach script is still a dry run (see "Waiting for a yes
  to change the live site").

**Nov 16, the user's notes after the release:**

- Fixed: coming back to the app re-rendered the whole page on nearly every
  return, and a tap made then waited for it. Live, the server's content
  fingerprint flipped between two values (instances with different cached
  copies) and pages cached hours earlier carried a third, so it never
  matched. Fixed at the source: the answer is one stored stamp
  (`content_stamp`, migration 100, `src/lib/contentStamp.ts`) that every
  admin save, approval and nightly job moves on and every server reads
  fresh. A page still behind after a refresh gets at most two tries per
  change, and the refresh waits until the visitor has been still 1.5s
  (RefreshContentOnReturn). Migration 100 is run on dev and live (the
  user, Nov 16). Visitors' one-tap confirmations don't move the
  stamp (they only change "checked" dates). Not covered: a
  phone that throws the page away in the background reloads it, and taps
  do nothing until it has loaded; not measured.
- Food's band photo and Mike's Chicken's photo pointed at dev's storage on
  live; copied to production's (the user's yes, Nov 16). Live has no eruv
  photo pointing at dev. Dev alone has photos for Eruv, Hospitals,
  Childcare and Schools (iStock links) and Hotels; not copied.
- Open question, not a decision: should a visitor order their You page?
- Fixed Nov 16 (PR 389's CI, then 4 of 10 locally, on main too): in the
  admin, a category page's editor started over whenever its list arrived
  with ANY page changed, so a screen just opened (Add a field) closed
  itself while another admin, or another test, changed some other page.
  Now only a change to the open page starts it over. editor-screens went
  from 8 failures in 20 to 1 in 34. That 1 is still open, as a lead:
  "See the whole page" showed the preview but the address stayed at
  `?field=hours` (no trace; it didn't come back in 25 more runs).
- CI, Nov 16 (PR 389): e2e's listing-detail Back test picked
  `cache-roundtrip-seed` and its address went back to the listing after
  the click, while the cache job (a separate CI job, same test project)
  was renaming that fixture. 21/21 locally on a real category. The e2e
  pickers in helpers.ts now skip other suites' fixtures
  (now changedByTests). A lead, not proven: closing a listing opened
  from its own link changes the address with history.replaceState,
  which a later Next update can overwrite (AGENTS.md's rule).
- Done Nov 16 (the user: "Yes, fix it here"): the suites that share the
  test project no longer pick each other's rows. `e2e/suiteRows.ts`
  lists every existing row each suite changes (cache: its seed category,
  the About page, Philly's site settings; admin-write: `e2e-…` pages,
  Privacy, Philly's team list, a watch job). `categories()` in the e2e
  helpers skips them, and so do the eight pickers that read the list
  themselves. `src/test/suiteRows.test.ts` fails on a write to a row its
  suite hasn't claimed, a row two suites claim, or a pick that doesn't
  skip them (8 picks flagged against the old code). Still open: two CI
  runs from different branches at once each run the same suite, and
  rename the same fixture over each other. Not seen yet; one branch at a
  time is the usual case.
- Admin saves were slow, not the tests (Nov 16, the user: "if we just
  keep relaxing rules what are we even testing"). The 15s waits put in
  that morning are gone again; the tests are back on expect's 5s.
  - Nov 17, not reproduced: `places.spec.ts:77` and
    `read-questions.spec.ts:80` failed together in run 43994304148. The
    runner's own direct Supabase calls in the test hooks took 2–3.8s in
    that 40s window, against 100–450ms elsewhere in the same run. So the
    test database was slow, not the app. The test project is also dev's
    and every preview's database; separating them is the user's call.
  - Open, not reproduced: `category-editor.spec.ts:116`, the Delete
    question vanished 6s after it was asked (run 43937547841), with the
    editor still open. 0 of 18 locally (4× CPU slowdown, and beside the
    community tests on two workers). Ruled out: the clone writing to the
    source, cached reads, sort-order renumbering, triggers. The trace from
    the next failure (retained since cc591c7a) should name what remounted.
  - Moderation's 15s waits (from Nov 3) are the approve request itself,
    about ten database round trips in a row; left as they are.
  - Open: CI at 76ee5be9 (Nov 16 evening) failed two admin-write tests on
    a server stall over 5s: Places stuck on Loading… (its read is 0.4s
    locally) and a Dismiss still busy (one database delete). Nothing else
    used the test database then, and the walk-routes job skips in CI (no
    key). Cause not found; the waits were not raised. Failures now keep a
    trace with every request's timing (`trace: retain-on-failure` in
    playwright.admin-write.config.ts; it was a final snapshot only), so the
    next one names the request that hung. Read that before guessing.
  - Seen in that trace check: one Places load makes two combined jobs
    reads. Not looked into.
- One e2e flake seen once (Nov 16), 0 of 10 on a repeat:
  `offline.spec.ts:109` desktop, `locator('main')` found two `<main>`s,
  one with React's `vt-update` (the server copy, mid view transition).
  Same family as `server-rendering.spec.ts:127`. Not chased.

**Nov 16, later: the map from a category on a phone (the user: "Yes,
build it"; canvas 6wPoB3zuQiwGfWu3QUKcpH, rows D, G and the built row H):**

- Built Nov 17, for the user to try on the preview: the listing's map
  tile (B1). A phone's listing (its sheet on a category page, and its own
  page) has a small Google map, 120px tall, at the top of the address box,
  "On Food's map"; a tap opens the Map tab on the place, ‹ back to the
  listing. The user switched on the Maps Static API for the site's key
  (Nov 17). One picture a view, fetched when it scrolls into sight, at the
  tile's own width; none where Google refuses it (CI's localhost), so the
  e2e suites can't see it (unit-tested). **One change from the board:** the
  pill is top left, not bottom left, because Google's logo and credit sit
  along the bottom and must stay visible. Not on a computer (the map is
  beside the list there), nor in the map's own sheet.
- Found Nov 17, not fixed: `FindResourcesConnected`'s `replace` sync (the
  search box, Open now, filters, `?item=`) writes the address the same
  way, so Next never learns those either: by the same mechanism a refresh
  (coming back to the app) should drop them from the address. Read from
  Next's code, not yet seen in a browser. Left alone for now: telling
  the router re-renders everything reading `useSearchParams`, the cascade
  that sync was written to avoid.

**Nov 14, on this branch (appearance, held for its own PR):** the header
Categories menu and the Add a listing picker list categories by name only,
with no icons. The computer home's Suggest a listing card lifts on hover
like the other cards, and a click anywhere on it opens the picker.
(The picker has no Escape-to-close; small, not done.)

Board Q1 (Nov 14, built): on the phone home, Right now's rows are photo
rows, the category's picture filling the row with the words white over a
dark fade, and no chevron (the user, Nov 14). The phone's Try asking row
shows only while the search box has focus; tapping a chip keeps the box
focused. The computer keeps Try asking under its box as before. Still
drawn only: N1, N3, O1–O3, P1/P1b.

**Drawn Nov 18, parked by the user the same day** ("maybe it's fine the
way it is now idk" → "Park it for now"; today's home stays). If it comes
back, my recommendation was Flip C plain (the weekday board with small
square pictures); the full-pictures board got an "uch". (Canvas
https://claude.ai/artifact/AR8hb7s66iPhAdqsqhbQsU, "Phone home: boxes and
rows"): the user asked whether Right now should be a box and the
categories rows ("these bunched up boxes and pictures"). Three boards:
Today as built; Flip A, Right now as one white box of lines (the same
words as Q1, no photo, chevrons) and the categories as one white box of
rows with a 40px picture each; Flip B, the same rows with Right now as
one box split in two halves. Would undo Q1, R3 and Oct 17's tiles. Rows
come out about 70px longer than tiles. Then Flip C, the user's own
("truly reversing the way it is today"), a weekday and a Friday: Right
now as two separate boxes side by side, each category its own row 8px
apart, pictures held as small squares for a later round. On Friday the
two boxes are Shabbos (candles) and Shabbos shopping, white; the eruv
line becomes its own row under them; the cards' Minyanim/Zmanim and item
buttons are dropped (each box one tap). The user OK'd Flip C's layout
("Yes, no coding yet"), then asked for pictures: "Flip C: full
pictures" draws the weekday with every Right now box and category row a
full photo, white words over a dark fade. Not built until the user picks.

Boards U1 + U3f/U3g (Nov 14, canvas
https://claude.ai/artifact/1L9Ep2cBxk84xQ2BePNbzL, built Nov 15): the
computer home has Right now under Explore by Category, the same answers as
the phone, two photo rows side by side on a weekday; on Friday the candles
card and **Shabbos shopping** side by side (stacked on the phone). Shabbos
shopping replaces Before candles: the grocery picture, how many stores open
now have any of the admin's items, the closest, and a button per item
(Challah, Wine, Chicken) opening Grocery with Has and Open now on. Left off
the board: "· until candles" (a store can close before candles). No "Right
now" label on the computer (the user, Nov 15: "let's actually take off the
right now label"; may come back, they'll see); the phone keeps it and says
"Saturday" after havdalah instead of "Shabbos".
  - Right now is a card kind (`rightNow`) in Home page › cards. Next
    minyan and Jewish Times stay as cards an admin can add (the user: other
    communities may want them). A community with no card rows gets Right
    now by default instead of those two.
  - Migration 097 (allows `rightNow`): run on dev Nov 15, **not on prod**.
  - **Waiting on the user:** add Right now to Philly's cards and take off
    Next minyan / Jewish Times, on dev in the admin; on prod after 097,
    each with a yes.

Boards V1/V2/V3 (Nov 15, same canvas; the user: "yes, but I'm worried
about that admin cage getting cluttered"): an admin chooses what Right now
answers on a weekday, two at most, from the categories that can say
something about now: places with hours ("25 open now"), the minyan page
(the next minyan, to that day's davening times), the eruv (up or down).
With no choice made it's the first two categories with hours, as before
(Food and Grocery on Philly's). Built on the site Nov 15:
  - **The choice** is `site_settings.right_now_categories` (migration
    **098, not run anywhere**). Before 098 a save that changes it says
    it isn't set up; every other save still works.
  - **Computer home: anchors, drawn only, paused Nov 15 (the user's
    call to come back to it).** The problem: "too many fragmented pieces
    and not enough anchors". Liked but not yet approved to build: Explore
    on a white band from edge to edge, and the map as a band edge to edge
    too (W7c/W7d on the desk canvas 1L9Ep2cBxk84xQ2BePNbzL; the user: "we
    really nailed the category and map going full screen"), with Right
    now back under Explore, today's order, so no section-order write
    on live. Not settled: the middle piece between the bands, Right now.
    Drawn: W7e (one bar split in two), W7f (one box cut in four, pictures
    on a diagonal), W7g/W7h (a faint blue tray with a lead like the trust
    band's and raised white cells, two or three). The user picked
    neither ("not sure we've hit the middle pieces"). Also raised: You and
    What changed as extra cells only when they have something to say,
    not as sections (my view; nothing decided). Earlier boards in the
    row (W2b, W4-W4c, W5a/b, W6a/b, W7, W7b) are older options; the
    W7c-W7h boards use today's pictures and map from the dev site.
    Later Nov 15: someone the user showed it to liked Explore in two
    rows, so W7i/W7j redraw W7d with the tiles seven across (Philly's
    13 in two rows), the map at 540px (W7i) and at 420px (W7j, my pick,
    so the two bands weigh about the same). The user's worry: a shorter
    map leaves Suggest and Stay in the Loop under it too close to its
    size. W7k (drawn): W7j with those two quieter, about 135px instead
    of ~260 (21px headings, a small button, Stay in the Loop white
    instead of solid blue, the same words). The user: not seven across,
    five across with the All categories tile, so W7l (drawn) is W7k with
    two rows of five, the first nine and All categories last (the built
    tiles show 14 and the tile, in three rows). W7m (drawn): W7l for
    someone with saved places, three white cards across the top with
    what each is doing now and You's blue dot on one that changed;
    nothing saved, W7l. The user, Nov 15: the phone isn't much of a
    landing page and its tabs are what people use, so the phone home
    stays and its You tab gets the dot (PhoneYouDot). The user dropped
    W7m's Saved row ("if it's going to be this small... we don't need
    it at all"). **W7l and the You dot BUILT Nov 15**: Explore two rows
    of five with All categories on a white band edge to edge, Open now
    under it as it was (asked; left), the map a 420px band edge to edge,
    Suggest and Stay in the Loop small and white; a blue dot on the
    phone's You tab and the header's You link when a saved place changed
    since You was last opened (`/api/changes`, `useYouDot`). Dev's home
    rows were swapped so Explore comes before Open now. **Live needs
    the user's OK when it ships**: production's home rows are still the
    old order (browse, davening, listings, ... no Right now), so they
    want setting to browse, rightNow, map, suggest, subscribe. Dev's
    change log is all test-suite churn (its newest 400 rows are on test
    listings), so the dot never lights on the preview without a real
    edit to a saved place; production's log is real.
  - **What changed is live** (Nov 21; the code switch is gone). It shows
    wherever an admin adds it: Site › Home page › Phone › Tabs › Add a
    tab › What changed, or a header link on the Computer side. Its page
    (`/<community>/changes`) answers only while a tab or link has it
    (`changesLinked`). On live, Philly links it (checked Nov 22). The
    admin's own What changed screen (hiding a change) opens from a row
    on Reports. The user's view (Nov 15): an activity feed is the first
    thing after testers' feedback; my view was to lead with new places,
    closures, hechsher and minyan changes and fold small edits into one
    line. **Decided Nov 22: the feed** (the user: "I like my way"). The
    page already is one: every change, newest first, by day, with each
    night's run among them.
  - **What changed reads past deleted listings (Nov 15).** The log read
    took the newest 400 rows and the page then dropped any whose listing
    was gone; on dev the write suites' fixtures (4,307 rows in two weeks)
    filled all 400, so the page was always empty there. It now reads only
    rows on listings the community has. Dev has the 16-row seed
    (`scripts/seed-dev-activity.mjs --apply`, dated from today; `--remove`
    takes it off), so the preview's What changed shows something. Dev
    still has a leftover write-suite listing, "E2E Admin Write 6eabdb10-…",
    which shows there as new.
  - **W11 BUILT Nov 15** (the user: What changed and You should "look a
    little less boring"; canvas v90, row "What changed and You"; "leave
    out search and filter and if we need it we can add it"). On a
    computer, What changed, You, About and Privacy have the category
    pages' photo header (`PhotoHeader`, the community's home photo) with
    the title on it.
    - **Not drawn, not built:** a "Recent changes" box on each listing
      (raised Nov 15, undecided).
  - **About and Privacy, rewritten and redrawn (Nov 15)**, from the
    review page "About and Privacy" (artifact 8XRGFGqR1HXc9MWeJajwwj, v6:
    About v2 and Privacy and terms, both approved: "let's build this").
    BUILT. This replaces the "white box per section" pass and its two
    pending content changes (`promote-page-headings.mjs` is no longer
    needed: the new text has real headings).
    - **On the dev database for the preview.** Live still has the old
      text, which renders as a lead with no sections (readable, plain).
      **Writing the new text to live needs the user's go-ahead, after this
      deploys.**
    - **PostHog replays are mentioned** (the user, Nov 15, after asking
      whether sites usually say so): "and recordings of some visits, with
      anything typed hidden". The code records whenever Session Replay is
      on in PostHog's project settings (`src/instrumentation-client.ts`)
      and leaves PostHog's default of hiding typed input
      (`src/lib/deferredPostHog.ts`); the project settings themselves
      were not checked.
    - **Open question for the user:** is one contact email right for
      every community (the page rows are shared by all communities, and
      the email is Philly's)?
  - **Feedback, redrawn (Nov 15)**, from the same review page (v7, board
    Feedback; the user: "Yes, build it"). BUILT.
    - The computer page's "Rather email?" card gives the address About's
      text gives (one shared row, so Philly's for every community), and
      is left out when there is none. No per-community contact setting
      was added; same open question as above.
    - The heading and thank-you words stay admin-editable; the drawn words
      ("Feedback", "We read every note. If you left an email, we'll write
      back.") are the new defaults. Migration 099 changes the column
      defaults and any row still holding the old words. **Dev rows
      updated (Nov 16); 099's column defaults not run on dev; nothing run
      on live — live still says "Send feedback" until 099 runs there,
      which needs the user's go-ahead.**
  - **Fixed Nov 16: a new community's site could 404 at first** (CI on
    PR 387). Creating one marked the community list stale, so the first
    load of its address could read the old list. It's now expired outright
    on create. Same CI run: two admin-write tests waited too little on a
    slow runner, and RightNow's tests assumed the machine was in
    Philadelphia. **Not fixed, seen in that log:** the test project's
    moderation queue read failed once with "Failed to load current rows:
    Bad Request" (`submissionStore.ts`); the suite still passed, cause
    not looked into (the test project has no pending suggestion pointing
    at a place, so it isn't leftover data).
  - **Fixed Nov 15: the admin's campaign and banner photo on a phone**
    (the user: "don't seem to appear great on mobile"). The campaign's
    Ends date ran ~4px off its card, and the banner preview lived only
    in the computer's side column, so a phone saw a thumbnail and the
    word "Photo"; it now shows the banner as it will look under the
    dates. A category's banner photo (280px wide) kept Upload, Paste and
    URL beside it, off the card's edge, and the page moved sideways; the
    row now wraps them under the picture when there's no room.
    `e2e-admin-write/phone-photos.spec.ts`, 2 of 2 red on the old code.
    In the full admin-write run `category-open.spec.ts` failed once (it
    fetched `cat:cache-roundtrip-seed`, a category another test makes);
    it passed twice alone. Watch for it again.

## The health sweep (Nov 20; fix-first 1-8 merged in PR 403, Soon built in PRs 404–411, Later not started)

### Report: the Soon list (Nov 20, an unattended run)

Found and not fixed:

- admin-write `main-dishes` "Use this" (local, full suite, Nov 21): fixed
  Nov 21. The place screen's one jobs read took over expect's 5s and each
  retry reloaded it away; the load now gets 15s (red on the old test with
  that read slowed 8s).
- e2e `listing-detail.spec.ts:537`: fixed Nov 21. A test race: it pressed
  the browser's Back as soon as Request removal showed, before the
  router had written its address, so Back left the listing. It now waits
  for the address (4 of 4 red on the old test with router requests slowed).
- e2e `search-reader.spec.ts:102` on the map (mobile, full suite, Nov 21):
  fixed Nov 21. Its "nothing read at 1.5s" check ran late on a loaded
  machine and caught the 2.5s pause's rightful read. Reads are timed now
  (red 4/4 with the pause cut to 1s).
- 25 of 104 older migrations can't be told run or not from what they
  made (a policy, an index, a data fix).
- 5 moderate `npm audit` findings, all `glob`/`minimatch` in Sentry's
  build plugin, build time only; they wait on Sentry.
- The readers that find a time inside running text (hours, calendar
  titles, the shul page and schedule readers, ask) weren't merged with
  the clock reader: they answer a different question.
- Watches' days are on New York's clock in three files: right for Philly
  and UES only.
- Rebuilding a fresh project from the migrations folder, and a restore
  drill: **done Nov 21** (`docs/backups.md`, "The drill"). All 104
  migrations rebuilt it; `scripts/restore.mjs` put the first live copy
  back, every count exact; the site ran on it. Files and sign-in weren't
  tried (no Storage or Auth in the drill). **For the user:** run 107
  (drops live's leftover `site_settings.map_zoom_radius_miles`), dev
  then live.

For the user:

1. **Turnstile and Upstash keys on Vercel's Production.** PR 404 (merged)
   makes a missing key refuse on live: contributions and the AI readers
   stop. Sentry shows nothing unresolved, and a refusal would be
   reported there, so they're probably set. Worth a look.
2. Run migrations 103, 104 and 105: dev, then live. 067 (Today's
   settings) waits on live until Today comes back (decided Nov 21).
3. Run migration 106 (drops the unused `site_settings.contribution_note`):
   dev, then live.
5. Check Database → Backups on live, and run the first live copy
   (`npm run backup -- --prod`, read-only).
6. Sentry cron monitors: the plan has one (checked Nov 21), so set
   `SENTRY_CRON_MONITORS=nightly-email` in Vercel's Production and
   redeploy. The nightly email already tells of the other jobs.
7. The next production build's log should say Node 24.
7b. ✓ An outside uptime check (set up Nov 21): nothing said if the whole
   site was down. UptimeRobot (free plan), signed in with the Jewish Tribe
   Guide GitHub account, watches `https://phillyjewishguide.com/philly`
   every 5 minutes and emails the Jewish Tribe Guide Gmail. Philly
   only: Washington is hidden, so it answers 404 to a monitor. **When a
   community is made visible, add one for `/<slug>` the same way.**
8. A design call: on a phone, You's saved places and searches can only
   be removed by a swipe.
9. Merging 411 brings in 405–410 too. 407's and 410's red runs predate
   the preview test's fix; 411 carries it.

- Live is missing migration 067; dev has everything but 105.

The user (Nov 20): use the lull to check the site is "actually being
built/run the right way". Six read-only reviewers (dead code and
structure, security, database, running the site, accessibility and
robustness, dependencies), each finding checked before it went on the
list. Marked **checked** where I confirmed it myself; the rest are read
from code by a reviewer. The user's order (Nov 20): fix-first 1-8 as
listed. All eight built (PR 403), then the Soon list (the report above).
Later waits for the user to pick.

Fix first:

1. **The public key reads every community's admin emails and preview
   tokens** (checked on the test project: all four communities, hidden
   ones included). Migration 027's `public reads communities` policy is
   `using (true)` and later columns joined it. **Built Nov 20**: migration
   103 drops all twelve public policies (nothing in the site reads with
   the anon key; it only signs admins in), which also closes hidden
   communities' listings and the anon subscriber insert (an earlier
   "refused" test of that was wrong: it asked for the row back, which
   needs a read policy). `noPublicPolicies.test.ts`, red 1/1 without 103.
   **To run: dev, then live (the user).**
3. **No backups or restore procedure** in the repo; the plan's backups
   and PITR need the user to check in Supabase. Photos in Storage too.
   **Built Nov 20**: `docs/backups.md` (the two copies, what to check,
   how to get things back) and `npm run backup -- --prod`, a read-only
   copy of every table and stored file (tried on dev: 29 tables, 152
   files, ~2 min). `backups/` is in `.gitignore` now. **For the user:**
   check Database → Backups on live (plan, how far back, PITR) and say
   what's there; run the first live copy. No restore has been tried.
4. **A broken alert path is silent**: the nightly email is the only
   alert and runs on what it watches; caught errors (AI reads, after()
   work) never reach Sentry. Fix: an outside heartbeat per cron, and one
   `reportError()`. **Built Nov 20**: every caught error in `src/app/api`
   (180 places, after() work included) goes through `reportServerError`
   (`src/lib/serverError.ts`): logged as before and sent to Sentry, one
   issue per place. A job that throws or says it failed is reported too,
   and the nightly email counts a send that failed as a failed run (it was
   a warning). The heartbeat is Sentry's cron monitors
   (`src/lib/cronHeartbeat.ts`), one per job, **off until the user sets
   `SENTRY_CRON_MONITORS`** in Vercel's production settings. The plan
   has one monitor (Nov 21), so the setting now names jobs too
   (`on` is all of them): `nightly-email` is the one to watch, since
   that email already tells of any other job that failed or didn't run. Red
   3/3 against the old code (the route guard, the job report, the email).
6. **`community_id` still defaults to 'philly'** on 9 tables; 027 says
   to drop it once a second community exists (checked). **Built Nov 20**:
   migration 104 drops it. Every insert in the site already named its
   community; the setup, seed and import scripts didn't, and now all go
   through `scripts/seedCommunity.mjs` (`COMMUNITY=<slug>`, default the
   config's). Also fixed on the way: their upserts keyed on `id` alone
   (already failing against the composite keys), and `FORCE=1 npm run
   seed` deleted every community's listings, now only its own. The form
   round-trip's test form names Philly. `noDefaultCommunity.test.ts`, red
   3/3 against the old code. **To run: dev, then live (the user), after
   this deploys.**

Soon:

- Migrations: nothing records which ran where; `contribution_note`
  drift; 16 "table missing" fallbacks hide a missed one; a fresh project
  can't be rebuilt from the folder (no grants since 056 was removed).
  **Built Nov 20, the code side** (`claude/health-migrations`):
  - Read Nov 20: dev, everything seen except 105. **Live: 067
    (`today_home`) not run**, its three `site_settings` columns missing.
    Harmless while Today is parked (the read is `select *`, and only a
    save of Today's settings needs them, which says so), but it is the
    one older migration live doesn't have.
  - **For the user:** run 105, dev then live.
  - **Decided Nov 21:** 067 waits on live until Today comes back. Run
    it on live in the same change that turns Today on in
    `src/lib/features.ts`, before that deploys.
  - `site_settings.contribution_note` was still there on dev and live
    (read Nov 20): migration 033 was deleted with the feature (Aug 27),
    but nothing dropped the column. Migration 106 drops it (written
    Nov 21; nothing reads it). **For the user:** run 106, dev then live. Rebuilding a fresh project from the folder (grants, and the
    restore drill) is untouched.
- Focus in dialogs and sheets, drag handles keyboard can't use, search
  results silent to screen readers, swipe-only actions. **Built Nov 20,
  the first two of four** (`claude/health-a11y`):
  - Done Nov 22 (item 61): the sheet's "Drag to resize" handle and the
    Nearby sheet's take Tab, Enter or Space, and the arrows, as the
    category split and the map sidebar's handles already did.
  - **For the user:** on a phone, You's saved places and searches are
    removed only by a swipe (the bookmark is computer-only, on purpose by
    its comment). Each can still be unsaved where it was saved (a place's
    listing, the save beside a search's box on its page), but not from
    You's list without the swipe. Whether a phone gets a visible remove
    there is a design call. Every other swipe (category rows, the map
    list) is a shortcut to actions the opened listing also has.
- Spend: no site-wide cap on the AI photo readers; Turnstile and rate
  limits fail open when their keys are missing. **Built Nov 20**: the
  two photo readers share a day of 300 reads (`PHOTO_READS_A_DAY` in
  `rateLimit.ts`), and past it answer as reading off, so the box offers
  typing. On the live site only (`VERCEL_ENV=production`), a missing
  `TURNSTILE_SECRET_KEY` refuses every check, and missing Upstash keys
  make the shared ceilings (this one and the question reader's) refuse;
  per-visitor limits keep counting in memory. Each is reported to Sentry.
  Local, previews and tests are unchanged. Red 6/6 against the old code.
  **Needs the user**: confirm both keys are set on Vercel's Production
  before this merges, or contributions and the readers stop on live.
- Dependabot's one group can't pass CI (container tag) and has blocked
  updates since September; Playwright held at 1.63 for production's
  Chromium (PR 402); `npm audit fix` is free; Node declared four ways.
  **Built Nov 20** (`claude/health-deps`):
  - `npm audit fix`, no `--force`, lock file only: Sentry 10.75 → 10.78
    (the critical one, a tunnel-route bypass), undici, zod,
    typescript-eslint, dompurify. 15 findings down to 5 moderate. All 5 are
    `glob`/`minimatch` inside Sentry's build plugin, used at build time
    only, and they wait on Sentry moving its pin.
  - Node: `.nvmrc` (24) is the one place now. `engines` was `>=20.9.0`,
    which lets Vercel take the newest major it has; it's `24.x`, so live
    runs what CI tests. CI's two `setup-node`s read `.nvmrc`, and
    `@types/node` went from 26 to 24. `versionsAgree.test.ts`, red 7/8
    against the old files. **For the user:** the next production build's
    log should say Node 24. Live's Node couldn't be read from here: the
    Vercel token can't open the project, and Sentry had no recent server
    events. This Mac runs Node 26; `nvm use` picks up `.nvmrc`.
- Two time parsers disagree ("8am" is Infinity in `parseTimeToMinutes`,
  checked); date helpers copied 8–9 times; `partDates` twice. **Built
  Nov 20** (`claude/health-cleanup`):
  - Not merged, on purpose: the parsers that find a time *inside* running
    text (hours, calendar titles, the shul page and schedule readers,
    ask). They answer a different question. `nightKinds.ts`,
    `watchJobList.ts` and `openedPlaceBoxes.ts` still hard-code New
    York's clock for the Watches page's days: right for Philly and UES,
    wrong for a community in another time zone.

Later or bigger:
~~foreign keys~~ (written Nov 21, below); ~~`details`
holding app state~~ (done Nov 21, below); ~~an old-iOS floor
decision~~ (below); ~~the parked Today
features~~ (stay parked, the user Nov 21); ~~`/inbox` per community~~
(left as it is, below); ~~this file's size~~ (finished work moved to
`docs/history.md` Nov 21, 8,039 lines to about 2,200); Partial
Prefetching before Next 17 (tried Nov 21, below; not on).

The user's calls on this list, Nov 21: Today stays parked, not deleted.
`/inbox` stays as it is: it's for forms, there are none yet, and forms
will get something better than `/inbox` when they come. What changed
is on the live site, as the user said: an admin's tab or header link to
it (`changesLinked`, Nov 15) turns the page on. The code switch
`features.whatChanged` is gone (the user, Nov 21): it had kept the
admin's What changed screen out of the console, so an entry couldn't be
hidden from a page visitors saw. That screen now opens from a row on
Reports (Reports stays one page), and the category list's foot has no
What changed link; where it shows is the admin's tabs and header.

Oldest iPhone (left to me, Nov 21): **iOS 16.4, so the iPhone 8 and X
(2017) and every one since.** That's what Next 16 builds for (Safari
16.4), and the site already holds to it: `browserSupport.test.ts` fails on
a JavaScript built-in past 16.4, and the three newer browser APIs in use
(`requestIdleCallback`, `checkVisibility`, `scrollbar-gutter`) each fall
back where they're missing. Going lower (iOS 15, the iPhone 7 and older)
would mean overriding Next's targets, more code rewritten for old phones
on every visitor's download (the home's JS budget is 400 KB), and React
and Next aren't tested there. Revisit only if analytics show real visits
from iOS 15 or older.

Partial Prefetching (live Nov 22, PR 427):
`partialPrefetching: true` sends an address that wasn't prerendered its
App Shell at once, before the page knows the address is real. That broke
two things: a made-up address answered 200, not 404 (7 e2e tests), and a
community made after the build bailed out of its prerender
(`NEXT_STATIC_GEN_BAILOUT`) or, read inside a boundary, had its stream cut
off (React #412). `ensureStatic = 'navigation'` on both community
layouts fixes both: such an address renders whole on its first request,
so `notFound()` runs before anything is sent. It needs
`generateStaticParams` on every screen with an id in its address, so the
admin's seven are each a server `page.tsx` and a client `Screen.tsx`.
`partialPrefetching.test.ts` fails if either layout loses the line.
(The proxy's list of real addresses, built and reverted first, commit
55ae2dc6, isn't needed.)

The gain is small today: a production build sends the same prefetches
either way (phone 3 requests, 225 KB, all the Map; computer 70 KB, What
changed), since the category tiles and most links have `prefetch={false}`,
and a category arrives on the click in about 0.4s with the flag on or
off. It is done for Next 17, which turns it on for everyone.

Foreign keys (Nov 21, `claude/foreign-keys`): migration 113 **run on
dev and live Nov 21** (the user). Every table's `community_id` points at
`community` (deleting a community deletes its rows), a listing's category
must exist (a category with listings can't be deleted; `delete_category`
takes them first), and a listing's menu readings and watches, a form's
responses and a category's banners and taught words go with it. History
keeps no key on purpose: `activity`'s ids and `submission.target_id`
outlive a deleted listing (live has 111 such approved removals).
`anchor_id` holds 'all'/'community' too, so it has none. Each key is added
NOT VALID and then checked against the rows already there; where old rows
break it (dev has test leftovers: 13 categories of deleted communities, 5
listings in gone categories, 50 menu readings of gone listings), it's
skipped with a notice and still holds for new rows. Surveyed (read only)
Nov 21: live clean. Checked on local Postgres 17: runs twice clean; a
listing in a missing category, a row for a missing community and deleting
a category with listings are refused; `delete_category`, `delete_form`,
`delete_community` and a direct community delete all leave nothing
behind.

Log retention, measured on live Nov 21 (read only): activity 447 rows,
daily_count 709, job_run 142, question_reading 53, submission 1,385,
night_note 0. job_run and night_note already prune themselves
(`KEEP_DAYS`). Nothing else needs a limit yet: at this size every read
is milliseconds. Revisit when daily_count passes ~50,000 rows (the
Missed searches tab reads all of a community's search misses, every day
ever) — then read the last year only, rather than deleting anything.

## `details` holding the site's own state: started Nov 21 (the user's yes)

**Changed again while building (Nov 21), to fewer steps and no change to
any reader.** `details` keeps a copy of the site's keys for good, kept by
the trigger, so nothing that reads a listing changes, and the copy can't
go stale. What changes is who may write those keys:

1. **Built**: migration 110 adds `state` and a trigger that copies the
   site's keys (`SITE_STATE_KEYS`, `syncFields.ts`; `site_state_keys()` in
   the migration, held together by `resourceState.test.ts`) from every
   write of `details`, and copies every row once.
2. **Built**: migration 111 adds `patch_resource_details`, which changes
   only the keys it's given (and an approved edit's columns) in one
   statement, with an optional "only if still" guard. It and the SQL
   functions that already write the site's keys (confirm, unconfirm, item
   marks, approved dishes) turn on `jpc.writes_site_state` around their
   update (re-created in 111 from their latest migration, the flag lines
   the only change). The first version attached the setting to each
   function instead (`alter function … set`), which Supabase's SQL editor
   refuses ("permission denied to set parameter"), so it rolled back on dev
   and live on Nov 21; `resourceState.test.ts` now fails on that, and on
   an update of a listing in a function without the flag around it. Every site
   writer of a listing's details goes through `patchListing`
   (`listingPatch.ts`): Google's job, the nightly sync, menu links and
   dishes, source dates, a category's field clean-ups, and approving an
   edit. So a save landing between a job's read and its write is no
   longer wiped. Where 111 hasn't run, `patchListing` writes the whole
   `details` as before. `siteStateWriters.test.ts` fails on a new whole
   write. **111 (fixed) needs running on dev and live** (dev is also the
   test project; 109 and 110 ran on both Nov 21).
3. **Run on dev and live Nov 21**: migration 112 turns the trigger round. A write not
   marked as a site writer keeps the listing's `state`, and its `details`
   gets the site's keys from it, so an approved week-old edit, an admin's
   save or a script can no longer wipe or roll back a confirmation, an
   item date or Google's record. A write that sets `state` itself keeps it.
   Checked on a fresh Postgres 17: a stale whole write, the patch,
   `confirm_resource`, an unrelated update, an explicit `state`.
   After it ran, the scripts caught up the same day: the seven in
   `scripts/` that write a listing's details and name a site key
   (`backfill-place-ids`, `backfill-verified-directions`,
   `migrate-mismatched-placeids`, `sync-google-hours`,
   `reconcile-google-provenance`, `migrate-davening`, and
   `merge-food-categories` while there) write through
   `scripts/patchListing.mjs`, and `run-test-project-server.mjs`'s fixture
   upserts send `state: {}` so they keep resetting a listing's
   confirmations. `siteStateWriters.test.ts` covers `scripts/` too.

The earlier order, kept for the record: reads merging `{...details,
...state}`, every writer writing `state`, then removing the keys from
`details`. Dropped because each reader would have changed for no gain
once only the site's writers can touch the keys.

The plan as first written:

A listing's `details` jsonb holds what people wrote (hours, notes, the
fields an admin set up) and, beside it, about 26 keys the site keeps for
itself: Google sync state (`googleSyncedAt`, `googleKept`, `notOnGoogle`,
`businessStatus*`, `lastSyncError`, …), confirmations
(`confirmedAt/From/By`, `sectionConfirmed`, `sectionFrom`), item marks
(`itemSeen`, `itemGone`, `itemMenu`), `googleFields`, `verifiedPlaceId`,
`legacyId` (`SYNC_INTERNAL_FIELDS` and `DIFF_ONLY_HIDDEN_FIELDS`,
`syncFields.ts`). Measured: 53 source files name them, and 10 SQL
functions write them in place (057, item marks, 065, the five
section-confirm migrations, 091's visitor confirm).

Why it matters: every write of a whole `details` has to carry those keys
through, or it wipes them. That is how save-survey item 2 could erase a
listing's Google state and confirmations, and why `prepareSubmission`,
the moderation diff and the editor each keep their own list of keys to
strip, hide or keep.

The move, in steps that each ship alone and leave the site working:

1. Migration: `resource.state jsonb not null default '{}'`, and a
   backfill copying the 26 keys into it (`details` untouched).
2. Reads: one `listingFromRow` merges `{...details, ...state}`, so every
   screen and test reading `item.confirmedAt` keeps working unchanged.
3. Writes, one writer at a time: the Google sync, the confirm and
   item-mark SQL functions (new versions writing `state`), the menu
   reader. Each writes `state` and still mirrors to `details` until 5.
4. Submissions and approvals stop carrying site keys at all: a payload's
   `details` is people's words only, and the strip/hide lists shrink to
   nothing. Approval writes `details` whole without reading it first.
5. A second migration removes the 26 keys from `details`.

Decision for the user before starting: whether it's worth it now. It
removes a class of bug (a whole-`details` write wiping the site's
state) that today is guarded case by case, and it touches most of the
listing code; roughly a week of steps, each needing a migration run on
dev then live at the right moment (step 1 before 3's deploy, 5 only
after 4 is live).

## The speed and scale sweep (Nov 20, on `claude/bands-and-search`)

Measured and dropped: leaving admin-only data out of the listings sent
with each page. The home is 90 KB compressed, and the admin-only keys are
about 5% of it; the bulk is schedules and hours. A slim index for the
home's search would be the real saving, later.

- **A morning watches run per community** (Nov 20, the user: "if that's
  something we could do now"). `/api/cron/watches` starts a call per
  community (`?community=slug`), each answered at once and run in
  `after()` with its own 300s; the run lives in `src/lib/watchesRun.ts`.
  Each run is saved under its community (`job_run.community_id`,
  migration 101, run on dev and live by the user Nov 20). The Watches
  tab, look-again, main dishes, the nightly email and Activity read
  their community's runs and the whole site's.
  To check on the first live morning after deploy: each community's run
  shows in its own tab, and Vercel's log has no "run didn't start" (the
  call reaches the site through its own address; a 401 or a Vercel
  protection page there would show as that). Two communities' runs can
  each read a site they share at the same moment; within one run, never.

Flakes seen this batch, to watch: `category-open.spec.ts` (a click asked
the server once, the re-run passed), the mobile prefetch budget (once).
`todo-scroll.spec.ts` has passed every run since its fix.
The test database was slow once since step 2 (run 44798511406, Nov 20,
19:05): integration's `rejecting a create submission…` timed out at 25s,
and cache-roundtrip's /about race test waited past 15s for a HIT, in the
same minute; both re-ran green. Integration takes 40–175s across the day
on old code too, so one slow run says nothing yet. But every suite now
hits the one test project at once, so watch for it: if it repeats, size
those waits to the database's slow spells, or separate the test project
from dev's (the user's call, see Nov 17 above). Not retries.

For the user: two home tiles link straight to a Google image thumbnail
and an iStock photo (Mikvah's is the iStock one, on live). Either can vanish,
and an iStock photo may need a licence. Left as they are.
Left as they are, on purpose: the inbox link is Philly's (one inbox, by
design), and notifications for a community with no admins go to the
site's own address.

## The admin review (Nov 18, on `redesign/suite-rows`)

- Mekor watch: one place on Google is filed once. The Brodsky Center was
  filed twice on Nov 4 (two names on Mekor's list, one Google place).
  The user rejected the longer-named copy Nov 18; checked on live Nov 21,
  read only: one copy waits, and nothing came back. 6 Mekor new places
  wait (Cinnaholic, Nothing Bundt Cakes, Magical Sweet Shop, Penn Hillel's
  Dining Commons, Temple's Kosher Corner, the Brodsky Center).

Still open:

- **Shul watches, to be rewritten rather than patched** (the user, Nov
  19: "I don't want patches anymore"). The plan:
  `docs/shul-watch-rebuild.md`. Nov 19: the nightly run is switched to
  the new rule on `claude/next-round` (PR 399); still to do there: the
  live data cleanup (look again in a week or two; any live write needs
  the user's yes). The listing's four boxes are BUILT Nov 20 on
  `claude/shul-listing`, stacked on PR 399; the changes it makes to
  earlier decisions (no waiting box, a row a day; candle
  lighting and havdalah left out though the board drew them, Nov 20) are listed in the plan's "The listing". Decided Nov 20: once a newsletter gives a week,
  it wins that part; a website change later that week files nothing ("No,
  newsletter wins"). Decided Nov 20 too: a calendar or newsletter week
  that matches the usual times still goes to To do, marked "The same as
  their usual times"; if those prove accurate, it may become the first
  thing the watch posts on its own. Kol Tzedek's and the Shtiebel's newsletters stay
  watched as a backup. What follows is the history. A dated week is still compared
  with and filled from the usual times (`keepUncovered`, `dropListed`,
  `compareTimes` on weeks), because a week replaces its day and the
  reader takes one highlighted time as a week. Decided Nov 19: we post
  schedules, not highlights (see `docs/how-we-work.md`). A week only from
  a whole-week source (calendar or newsletter); a highlighted time is
  ignored (Mekor's homepage "Fri 4:25" box); usual times are compared
  only with the shul's regular-schedule page. Found the same day: Lower
  Merion's full calendar (lowermerionsynagogue.org/calendar, every
  minyan every day) is never read; the watch reads its homepage. Mekor's
  site has no calendar, so its week is the newsletter's. Approvals (about
  40 a week for 14 shuls) left alone for now, to see if this brings
  them down. Newsletters read Nov 19 (a month of each, in the guide's
  Gmail): Society Hill, BZBI, Mekor and Kol Tzedek give the week; the
  Shtiebel's gives Shabbos only, which is taken (decided: Shabbos and
  weekdays are separate parts, and a source changes only what it covers); Sons of Israel
  has sent nothing. Details in the plan.
  **The shul listing is approved** (Nov 19, boards 5e–7e on canvas
  KYnj9bnY5aY5qg7bp6ty5M: "ok so this is what I want"): four boxes,
  This week (weekday grid) / This Shabbos / Usual weekday times / Usual
  Shabbos times, each part shown once, the other folded; Shabbos first
  after the last weekday minyan. The watch rebuild goes first (the user,
  Nov 19: "watch first"), then the listing. Spec in the plan's "The
  listing". Short sources decided Nov 19: less than a whole part is
  looked at only when nothing whole covers that part that week; then
  one matching every usual minyan is taken, and anything extra,
  different or missing goes to the admin. Each admin
  answer is kept so the watch can learn to propose it ("Admins are
  really just there to validate, not to answer"). Also agreed Nov 19:
  board 4's one-time setup is dropped; the watch picks one source per
  part (calendar, newsletter, schedule page, then anything else) and the
  admin checks it; and seven cases from live To do items go in as
  tests (plan, "Cases from live"). Dry run done Nov 19 (plan, "Dry
  run"): four wiring faults found and fixed. The user handed the rest to
  Claude (Nov 19, "take it from here"): newsletter before calendar, and a
  short source matching the usual times files nothing. Switch being built;
  live data cleanup still needs the user's yes.

## The public site review (Nov 18, on `claude/public-review-46a065`)

Left out on purpose:

- Forms are hidden (Oct 31), so the intake wizard's findings wait until
  they come back: answers to questions a branch hid are still sent, a form
  ending on a single-choice question has no Submit, a failed Turnstile
  says "refresh" and loses the answers, the steps are raw `pushState`, the
  "✅" and section emoji, and Support/Volunteer as the generic wizard.
- The parked Today home stays parked (the user, Nov 18).

Done:

- Speed and phones (items 35–41):
  - `/` redirects with 307, not 308: it follows a remembered community,
    and a browser keeps a permanent redirect after the visitor switches.
    **Your call:** the installed app's name and icon are Philly's for
    every community (`manifest.ts`).
- Tidying (items 33, 42–44, 47):
  - A community's own admins set its default location (Nov 19), the
    place a visitor is taken to be until they set their own: Settings ›
    Default location, one place picker labelled "Until a visitor sets
    their own location, we use", a small map of it, its time zone, Save.
    It starts as the city picked when the community was made. Only a
    place picked from the list saves; the time zone follows the place
    (`tz-lookup`); the community's name and region don't change. The
    picked place's name is kept in `map_center` (`label`), so no
    migration. `PUT /api/admin/default-location`, any of the community's
    admins, then `revalidatePublicContent`. Checked locally on the test
    project: the home's zmanim moved to the new spot, and the row was put
    back. Not seen locally: the map and the picker's suggestions (Google
    refuses the key on localhost) — check them on the Vercel preview.

## Open from the boxes and fields work (Nov 10)

The user's answers on Nov 10, evening, and what was done with them:

- **The listing is back to how it was before round 3** (the user: "I like
  it the way it was before. The only thing we were thinking of changing is
  just grouping fields together. Experience shouldn't change."). The
  hechsher under the name, the amber "What isn't kosher" box after the
  buttons, Delivery's own box and the Certification button are all back.
  Only the admin's grouping (a hechsher's caveat, note and certificate as
  parts of it; Delivery's WhatsApp link as a part of Delivery) stays.
  - **Every box takes every field** (the user: "Yes, anything takes
    anything"; then "I can not for the life of me understand why we're
    still having existing boxes not being editable and those add a fields
    not showing every field"). BUILT Nov 10:
    - **Editing follows the listing; admins arrange it** (the user: "an
      admin should have customization power to organize the website how
      it works for them", with simplicity for visitors first; 8bdf3495).
      The rule, whole: the add/edit screen follows the listing's boxes
      (their order, their names, where each field sits, the address and
      phone included), and anything that is a screen of its own gets its
      own section right where its box is: davening (as usual weekday,
      usual Shabbos, this week, next week), an item list (Main dishes),
      a list of people to call, and hours (Oct 11). Also not a box: the
      top keeps name and photo first, then the kind and the kosher row,
      as the listing's top does (the amber "What isn't kosher" box is
      edited in that kosher row); adding, sections still empty wait under
      "Not on the listing yet". A hospital's Shabbos section is named
      "This Shabbos", as its box is. Not yet true in the code: hours are
      broken out only from Contact; in an admin's own box they're edited
      inside that box's section (proposed fix, waiting on the user).
- **Computer home: the hero centred** (BUILT Nov 11, the user's yes to
  board C on the desk canvas: "much calmer and more directs my attention").
  The headline, the big search and what to try are centred over the photo,
  now full width and dimmed; white type. Named changes: Browse Categories
  and View Map are gone from the hero (the header has Categories and Map),
  and the header no longer goes see-through over the hero (dark header
  text can't sit on a dimmed photo; the board draws it white). No line
  under the headline (the user, Nov 11), and the admin's "Line under it"
  field is gone (the stored value is left, unused). Everything below the hero is unchanged, and the
  phone home is untouched. Held off for a look with real people: the
  showcase sections, search in the header.
- **Open from Nov 11's home review** (the user's notes on the built hero):
  - Explore by Category showing every category instead of "More": held,
    to ask visitors.
  - Explore by Category as photo tiles (board H1 on the desk canvas, the
    user: "soooo much better. let's do it"): BUILT Nov 11. Five across, the
    name under each photo, no counts; the first nine and an "All
    categories" tile (was "More"), which expands to every tile. A tile's
    photo is the category's own picture, else its wide card photo, else its
    line icon on grey, else its initial (never its emoji). Changes to
    earlier decisions: the 64px circles with listing counts are gone on the
    computer. Fixed with it: the eruv card never found Philly's eruv
    category's picture (its id is `eruv-information`; the card is always
    `eruv`), and the trust band's point text ignored its two-line clamp.
    Open: the phone's category tiles still mix photos and tinted icons;
    H1 didn't cover them. Networking's and Eruv Information's pictures
    don't work as tiles (generic tech art; a blurry thumbnail).
  - **"Everything on one map" card** (board G3, the user, Nov 11: "let's
    build this and let's have it in the admin too with room for
    adding/changing the photo"): BUILT Nov 11. A wide card, a row of its
    own like Categories: a photo on the left, "One map / Everything on one
    map", the community's five biggest categories by name, and "Open the
    map"; the whole card links to the map. No map is drawn in it (the
    drawn one in G "looks very fake"). Its photo is set in Site → Home page,
    under "Cards under the search", while the card is in that list ("Map
    card photo"); with none it shows the plain map glyph. It is the old
    'map' card kind come back, offered again in "+ Add", and the default
    for a community with no cards saved, after Categories. Computer only.
    Named changes: the map card was retired (it embedded the map); it is
    back as a link. City Hall moves from the hero to this card, and the
    hero gets a photo of the community, still to find (the user's call,
    in the admin). Needs **migration 095** (`site_settings.desktop_map_image`)
    to save a photo: not run on dev, test or live yet. Without it the card
    still shows (glyph), every other setting still saves, and choosing a
    photo says it isn't set up. **On live, Philly already has an old 'map'
    row** (after Suggest a Listing, before Stay in the Loop), so the card
    appears there once this deploys; move it in the admin. Fixed on the
    way (found on dev): the card moved by keyboard could land inside a row
    of two and be squeezed to a third of the width; it now passes rows.
  - **Computer home, one thing at a time** (board G5b on the desk canvas,
    the user, Nov 11: "Let's first build out the drawing with no
    picture"): BUILT Nov 11. Top to bottom: the photo, the trust strip
    (no chevron, lifts on hover), Explore by Category in three rows of
    five (14 tiles and "All categories"), two white answer cards side by
    side ("Next minyan / Maariv 7 PM / the shul · distance" and "This
    Shabbos / Candles 4:28 PM / Friday · Havdalah Saturday 5:28 PM", each
    one link, no chevron, lifting on hover), the map card 540px tall, a
    plain "Know a place we're missing?" card with "Suggest a listing", and
    a navy "Stay in the Loop" box (email and Sign up only: every category,
    new places and closures). Named changes: the minyan and Shabbat cards
    lose their photos, headings and buttons ("View Times", Minyanim / All
    zmanim / Eruv); the Shabbat card is white, not night ink; Suggest
    loses its photo; Stay in the Loop loses its category picker and
    switches on the home page (they stay on the manage page every email
    links to); the "Jewish Times card heading" setting is removed (no
    migration; the column is no longer read). The default order for a
    community with no cards saved is the G5b order; **Philly's live order
    is the admin's** (Categories, Davening + Suggest, Map, Shabbat, Stay in
    the Loop), so it needs moving in the live admin to match (dev is
    moved). Differs from the board: "This Shabbos" (the site's word) not
    "This Shabbat"; a small source line under the Shabbat time (Hebrew
    date, place, Hebcal.com), kept for visible trust. Fixed on the way:
    the minyan card linked to (and drew the glyph of) the first category
    with a minyan field, Food on dev, instead of the shuls page the
    schedule reads. The map card's picture came after (below).
  - **Map card picture: an OpenStreetMap street map** (the user, Nov 11:
    "OSM, farther out", picked over a close-in Center City view and over
    Google's Static Maps). BUILT Nov 11. `scripts/map-card-picture.mjs
    <slug>` makes one saved picture from the community's map centre,
    framed about as wide as the map page opens, centre 70% across (right
    of the words), and sets it as the card's photo with the credit
    OpenStreetMap asks for; the card shows "© OpenStreetMap contributors"
    small in the corner. An admin's own photo replaces both. It differs
    from the Google map page in colour (pink and orange main roads, more
    green), not framing; the user accepted that. The picture fades to the
    card's ground under the words (180 KB on the home before, over the
    150 KB image budget; 110 KB after), and waits until the screen
    measures as a computer: fixed on the way, phones were downloading
    the card's picture, any picture, though the card is computer-only
    (since G3; unseen until a picture was set). **Dev has it. Live needs
    migration 095 first, then the script with `--prod --apply`: both need
    the user's go-ahead.**
  - **Phone home as board K1c, computer footer as K2** (the user, Nov 11:
    "I like it" to K1c; K2 "I like the footer for desktop"). BUILT Nov 11:
    - The tiles sit in one white box under a small "EXPLORE BY CATEGORY"
      label, the same label and box as Right now's, so the home reads
      label, box, label, box.
      Changed Nov 12 (board M1, the user: "Build M1"): the white box
      round the tiles is gone. The photo tiles are cards themselves, so
      it read as a box in a box. The tiles sit on the grey page under
      their label, as wide as Right now's card, which keeps its box.
      Drawn, not built: M2 (white page) and M3 (white page, Right now as
      bare rows).
    - No icons on the phone home ("It feels childish"): a Right now row
      shows its category's picture, the same as its tile, and none when it
      has no picture; a tile with no picture is its tint and its name.
      Changes this morning's "small badges stay icons" for these two spots.
      The search lines keep their icons; not asked yet.
    - Drawn, not built: K1 (names at the bottom in the box) and K1b (K1c
      with icons and the heading inside the box).
  - The big map: G2 on the canvas, a card in words only (map glyph, "ONE
    MAP", "Everything on one map", one line, "Open the map"), the whole
    card tappable, under the categories. The user didn't want a drawn
    map. Not built: waiting on the user's go-ahead.
  - A category's own picture ("Or use a picture instead") now shows on
    every home badge of it: computer tiles, search rows, phone tiles,
    Browse, Right now, the Add picker. It used to show only in the search
    dropdown, so Food's new picture never appeared. BUILT. Change to an
    earlier decision: the search rows had dropped photos because the wide
    home-screen photo turns to mush at 32px; this is the separate picture
    chosen for the icon spot. Open: pictures for the other categories
    (Food is the only one so far, so it stands out among icons).
- **"Synagogue | Minyan" (first "By synagogue | By time") replaces the green Minyanim card** (BUILT
  Nov 11, the user's yes to D1/D2 on the desk canvas, "Plain switch, as
  drawn"). The list's heading is a two-part switch on phone and computer;
  By time is the Minyanim view at `?davening=1`, a history step as before.
  The page title stays the category's name in both (it used to turn into
  "Minyanim by time"). No count beside it in the view (the user, Nov 11:
  "we don't need to say how many minyanim left today"). The days are small
  pills across the top of the white box, as board D1 drew them (the user,
  Nov 11); a Yom Tov keeps its name on the pill, a plain date is only its
  hover title (changes the two-line day + date tabs). No number in the
  switch either (the user's yes, Nov 11: "By synagogue instead of the
  number"), so the list no longer says how many places it holds. Named change: on Oct 6 the user
  dropped a toggle because "if we need a sign the toggle isn't
  noticeable"; reminded of that, they still chose plain. Held off for a
  look with real people: next minyan in rows, one map switch, side by side.
  Renamed later on Nov 11 to "Synagogue | Minyan", no "By" (the user:
  "take out 'by' and replace time with minyan"). Then as tall as Filters
  beside it, 40px (was 34px; the user: "Yes, match it").
- **To do's week box marks only what changed** (Nov 11, the user on the
  Shtiebel item). A week read again comes with every minyan under a new id,
  and the box matched the site's by id, so all of them said "New". It now
  pairs by id, else by day, tefillah and time (`pairWithListing`, also in
  the change count): an unchanged minyan has no mark, and a note-only
  change says Changed with the old note crossed out under the new one, the
  way a changed time shows what it was. Two admin-write flakes seen while
  running it, each green alone: todo-scroll's resize line and
  category-open's no-request check. todo-scroll's "keeps the row you
  clicked" failed once more on Nov 19 (562px off), green 3 of 3 alone,
  and again Nov 20 under the full run ("the list came back somewhere
  else"), green 4 of 4 alone. Third time: worth a look of its own.
- **A shul's week read again with its notes only reworded files nothing**
  (fixed Nov 11, South Philadelphia Shtiebel). Its calendar is read twice
  a week, and the AI wrote "until 8:00 AM" one time and "until 8:00 AM;
  coffee and learning" the next, at the same times, so the queue held a
  change the same as the site. A note that only drops or rewords words
  the listing's note has now keeps the listing's (`keepListedNotes`); a
  new word still goes to the queue. The Nov 11 Shtiebel item in the live
  queue predates this and is the user's to reject.
- **One nightly email instead of one from every watch** (built Nov 12,
  as drawn in N7-N9 of canvas S7uB4KuZQtdF6bJywzUZBd). After the last
  job (`/api/cron/nightly-email`, 9:45 UTC), each community's admins get
  "Philly Jewish Guide · Nightly watches: 5 to check": the night, a
  sentence put together by code from the counts, Waiting for you (a row
  a place, opening it in To do, "Also in To do: N from earlier nights and
  N from people", Open To do), Stopped working in red (a watch's place in
  Watches, or the Watches tab for a job), Changed on its own (Google).
  None on a night with nothing at all. Waiting for you is read from the
  queue at send time; a watch that broke from its `failingSince`; a job
  from its runs; Google from `night_note` (migration 096). Gone: the
  emails each website, newsletter, Keystone-K, Mekor, Refuah and eruv
  website watch sent, the watch broke / working again emails, the job
  broke / working again emails, Google's status digest from the nightly
  sync and its immediate "permanently closed" email (now a row). Kept as
  they were: a person's submission emails, the eruv-map line alert, and
  the status email after an admin's own Google refresh. Not in the email,
  on purpose: the times themselves, and "working again". With nothing
  waiting but something broken, the subject says "1 stopped working".
  Phone, computer and quiet renders checked against N7-N9. Migration
  096 is on live too (checked Nov 19). Not seen in a real inbox yet: the
  first one goes out the night after this reaches the live site.
- **A line turned down in a shul's week isn't filed again** (fixed Nov 12,
  prod queue). A read week is filed whole, so a line the admin rejected
  came back whenever anything else in that week changed: Kol Tzedek's Bar
  Mitzvah note (rejected 3 times, back as #1347), TBZBI's Sat 9:30 and
  Zoom links (twice, back as #1352), Rodeph Shalom's Thursday note
  (twice, back as #1351). Each day's tefillah is now weighed on its own
  (`leaveOutTurnedDown`): one the page gives exactly as a turned-down
  suggestion of this watch gave it, with no approval for that week since,
  stays as the listing has it and leaves the note. The page giving that
  day something else still files, and so does the rest of the week. The
  items already waiting in the live queue predate this and are the
  user's to decide.
- **+ Add opening on Find the place, with AI a tap away: drawn, waiting
  on the user** (Nov 10, canvas
  https://claude.ai/artifact/5PNWucNyGPpCgnVRs6Rw9H, boards 1-4). The user
  asked whether the box should start with AI; the recommendation was no.
  The boards: the box opens on today's Find the place search, titled "Add
  or update a place", with one row under it, "Paste a post or photo",
  which opens today's reader (its own step, back chevron, "See what
  changes"). "Not on Google? Fill it in yourself" shows only once
  something is typed. The Eruv page's box is unchanged. Not built.
  The user found that "a lot going on" (Nov 10: "I liek to stick to one
  thing at a time that any customer is seeing"), so boards 1b-3b redraw
  it as one box: the search with a camera button inside it, one list
  while typing (the guide's places first, a Google place the guide has
  shown once, "Not listed? Fill it in yourself" as its last row), and a
  pasted post turning the same box into the reader with "See what
  changes". Both rows wait on the user.
- **Later (the user, Nov 16): + Add might start by hand, with AI as the
  option**, the opposite of today. Not now ("that's for later"); nothing
  drawn or built.
- **Mekor's Shabbos 9:15 PM couldn't be found to change.** This Shabbos's
  times came from two posts, a person's "Nov 8 – Nov 13" and the website's
  "Nov 14", and Edit opened only the first. Now Edit opens every post the
  box shows a time from, and Edit listing's "This week's schedule" lists
  them all and saves them into one.
  - **The live times are fixed** (the user's yes, Nov 10): Sat Nov 14
    Shacharis 9:15 PM → 9:15 AM, Fri Nov 13 Mincha 7:00 PM → 4:30 PM.
    Backup of the row before: the session scratchpad's
    `mekor-prod-backup-nov10.json`. Mekor's own site says "9:15PM", so the
    website watch may file it again: reject it on To do.
  - Dev's Mekor holds the live times (copied to reproduce it).
- Still held or open from before: boxes fold in Fields (held), a box's
  trash can on no board (held), big fields as rows inside any box, "Within
  a walk" and "Before it's opened" on no board, Mikvah sections not drawn,
  "How it looks" on a phone not built.

## Waiting for a yes to change the live site

The rule (AGENTS.md): nothing is written to the live database without a yes
for that exact change, in the same conversation. Show the dry run first.

1. ~~Philly Synagogues' "Minyan" field and rename~~ Dropped (Nov 19, the
   user: "that just feels like an extra question"). No listing asks for
   missing weekday or Shabbos times any more, shul or not, so nothing has
   to say which places are shuls; the `minyanOnly` field setting is gone.
   Later, if a minyan that isn't a shul ever comes in: where it shows (the
   user could hear it not being on the Synagogues tab at all).

1b. **Eruv status by email (6c):** migration 084 is run on both databases
   (the user, Oct 19). Northeast's address is set on live and its emails
   arrive (checked Nov 19: one kept that morning). Elkins Park's sender is still unknown.
1c. **"Candle Lighting & Zmanim"** (decided Oct 20): the user renamed it
   on live Oct 20 (label and plural). Its description there is empty,
   and nothing waits on it (Nov 19): search finds the page by its built-in
   words ("havdalah" included), the admin has no description field, and
   the only thing it fills is a shared link's preview line. Idea for later,
   not now (the user): the site writes that line itself from what the page
   is, and stops storing a description. Until the three-line tiles are
   live, the phone home cuts the name to "Candle Lighting &…".

## For the user or the community

2. **Every live place has a date** (checked Oct 17, 11 PM: 155 of 155).
   80 were stamped confirmed on Oct 17 with the user's yes (`confirmedAt`
   2026-10-18T00:00Z, backup in that session's scratchpad); the last
   undated one, The Brazillian BBQ (spelled so on live, off Keystone-K's
   list), was confirmed by someone that evening. The trust line now says
   "every listing dated" once the live cache refreshes (any admin save).
   Shtetl, Rita's, New York Bagel Bakery and Sababa Falafel (checked on
   live Nov 19): Shtetl is archived. Google says three of the four live
   Rita's and New York Bagel Bakery are closed temporarily (Rita's is
   seasonal). Sababa Falafel is marked Not on Google (since Oct 26,
   checked on live Nov 21): nothing to do.
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
   - Fixed Nov 19 (`claude/next-round`, not live until it deploys):
     branches that share a menu page share one watch, on the first
     branch, and an unchanged menu was read again only for that branch's
     dishes, so a dish added by hand to another branch alone was never
     looked for (Dottie's (4), Rita's (4), PLNT Burger, Playa Bowls, LUHV,
     Insomnia on live). Now every branch's unlooked-for dishes are looked
     for, each by its own reading (or the first branch's, if it has
     none). A dish any branch lists is asked about and isn't proposed as
     new to the others; one the menu lacks waits on the branch that lists
     it, and isn't looked for again.
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
   - **"Seen today" on a menu never read** (Charlie was a sinner., Oct
     27): an unchanged page dated again every dish already dated, and 17
     live places had dates from the Oct 17–18 reads but no reading. So
     their dishes said "seen" each morning the page (Charlie's home page)
     didn't change, while the Menus line said never read. An unchanged
     page now dates only after a kept reading found dishes on it. Their
     dates stop moving; the morning first read reads them.
   - Mike's, Bar Bombón and Mama's need a browser to draw their menu,
     1 a night. Tasty Twisters isn't stuck (checked on live Nov 21, read
     only): its watch dates all six dishes each morning (07:02 that day);
     Oct 22 is its menu's last AI read, which rightly stays while the page
     doesn't change.

## Getting the branch live

4. **Migration 083 (`confirmed_by_visitor`) is run on both databases**
   (the user, Oct 18): a visitor's Yes on a whole listing says "Confirmed
   by community".
   077 and 082 are on live too (checked Nov 21 with the user's OK, by
   writes that keep nothing): an eruv suggestion got past the type rule
   to the community key, and confirm_section took 'contact' and answered
   from its cooldown without writing. 067's
   columns (Today) are missing too, harmless while Today is held back.
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
   one (the secret and trigger stay); Northeast's address on live is set
   (checked Nov 19). The script talks to the live site, so the preview can't receive
   a real email.
   **Open: Elkins Park.** No sender yet: how YIEP announces its status
   isn't known (ask 267-415-6760, yiep.org, whether there's an email
   list). Once the user sends its sender address, it's Add a watch → Eruv
   status on the Watches tab, no code: dev first, then live with a yes. Until then it
   shows "No status online".

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

## Up next: Site → Category pages, organised and cleaned up

**Built Nov 9: a field, how it looks** (canvas boards 33c and 34, row "A
field, how it looks"; the user, Nov 9: "build it, but with 33c"). Beside
an opened field, and beside a field looked at in Add a field, in place of
the Page / A listing / Adding preview (FieldLooks.tsx, fieldLooks.ts): In
the list, In Filters (only while it's in the filter), On the listing and
When adding, on a made-up place that answers every field by its type, the
field outlined in blue and its neighbours faded. A field off the row says
so, with Show it on a row (the card's picker for its line; Back returns to
the field). See the whole page opens the full preview, on Page. The page's
own screen keeps the Page / A listing / Adding preview. Not as drawn, from
the site's own rules: the listing's facts are a line ("Meat · IKC"), not
pills; Delivery Details is in its Delivery box, and Hours in Contact; the
row before the field when adding follows the add form's order (Type comes
before Food Type). The add form's picked choice is now the filter's filled
blue with a tick (ListingEditor's ChoiceButtons, the user's OK, Nov 9), on
the site's own add form too. Hours, minyanim, contacts and a photo show their answer as
a line when adding, not their full editor. Phone not built (nothing beside
a field there).

The user, Nov 4, after Home page became one screen: Category pages is next,
"organized better and just cleaned up in general". **Seventh draw Nov 5,
waiting on the user** (canvas https://claude.ai/artifact/ThgexAyY2q6o6YDxg21RBM,
cleared Nov 5 to the screens going ahead: 1-6 a category page, 7-16
adding a field, 17-19 a listing's boxes, 20-23 a place before it's opened; earlier drafts and the field map are off the canvas;
reviewed Nov 5 at the user's ask: the Denomination board shows the one
list as one choice, Nusach is on Synagogues and in the ready-made list,
the page's "Kind" tag is gone (a copied page brings its kind, one made
from scratch is Plain), and the question says "recommend", the word
visitors see). Board 16, Nov 5: "Remove this field" opens its own step
when places have filled it in ("Remove Kosher Certification from Food?",
71 places lose their answer, the filter loses it; Remove it / Keep it).
Today the same removal waits for Save and an amber warning, then wipes the
answers. With no answers, the field just goes.
Boards 17-18, Nov 5 (the user: dragging fields, but a listing has boxes;
then: make it work like the header editor's tabs and headings). Fields
is a list of the opened listing's boxes, in the order a visitor sees
them, drawn on Hospitals: Top (Photo), Who to call, Kosher food, A place
to stay, This Shabbos, Rides, Also, Contact (Address, Phone, Hours,
Website, Refuah Link). Each is a row with its fields as its line; a tap
opens it in place, its fields as inner rows, then "+ Add a field" with
the boxed trash can right beside it (as the header editor's RowActions
does); its name is text until tapped, then edits in place, like a
heading's. Board 19: "+ Add a box" lands an open "New box" before
Contact, its name selected to type over, "Nothing in it yet", "+ Add a
field" and the trash. Top and Contact stay first and
last, with no handle or trash, like Categories' "Other". "+ Add a box"
at the foot. Dragging is within one list only, as in the header editor:
a field moves to another box by dragging it onto that box's row (board
18; the user, Nov 5: a field goes in the box it was added from, so no
field screen has a Box list). The preview's "A listing" shows the
same boxes. Within a walk (Food, Synagogues, Hotels, Mikvah, 30 min) is
its own box below Fields, since those aren't fields. Boards 4 (Food) and
6 (Synagogues) redrawn the same way, Nov 5, Top open on each. Food: Top
(Photo, Short Description, Food Type, Store Type, Kosher Certification,
its URL as the Certification button), Delivery, What isn't kosher, Main
dishes, then Contact (Address, Phone, Hours, Website) and About
(Description). Synagogues: Top (Photo, Denomination, Nusach), Davening
times, Contact (Address, Phone, Website). A fixed box (Top, Contact,
About) opens to its fields and "+ Add a field", with no handle, rename or
trash. Neither page has saved listing parts live today, so these are the
order the listing already shows.
Board 20, Nov 5 (the user: a section for how the card looks before it's
opened, built from the fields already added). "The card" sits between
Fields and Questions, drawn on Food: First line (Photo, Name · where it
is, recommends), Second line (Open or opens at and Distance, both
automatic, then Food Type, Kosher Certification, Store Type, each with a
handle and a trash can, "+ Show a field"), Third line, the first that
applies (Not everything here is kosher, Not confirmed by anyone yet, both
automatic, then Short Description). The preview's Page tab shows two
cards. Boards 4 and 6 have the section with its lines closed, and their
fields lost "In the list" (Filter stays). Today the card is set on each
field (listingRow.ts): a choice shows only as a badge that's also a
filter, Short Description by "in the header", order by field order;
building this separates "on the card" from "a filter". A restaurant's
dishes stay off the card (the user, Oct 10); a store's items line would
be its own line when a page has one. Then (the user: what does First
line do, and make clear it's the listing before it's opened): the section
is "Before it's opened", with a sample card at its top (on boards 4, 6
and 20); First line opens like the others to Photo (trash: initials
instead), Name, Where it is, Upvotes, all but Photo automatic, and no
"+ Show a field" (the line is full). The user, Nov 5: people know
"upvote", not "recommend", so the admin boards say "Can visitors upvote
places?" and "Upvotes". The visitors' button says Upvote too (the user
changed their mind, Nov 5): its label and hover were "Recommend Goldie,
12 recommend it" / "Recommend", now "Upvote Goldie, 12 upvotes" /
"Upvote this place", like the inline button (UpvoteButton.tsx). On
screen it was only ever a thumb and a count. Boards 20-23, Nov 5 (the
user: what happens when you click First line, Second line): each line
opened on its own board with its part of the sample card lit; Third
line's "+ Show a field" picks from the page's fields (board 23). Same
day, four boards brought in line: Make your own page (3) starts with Top
and Contact, "Nothing in it yet", and Before it's opened (First line
Name, Third line Not confirmed by anyone yet); Food's listing preview (5)
follows the boxes' order; the field screens (13-15) lost "Show it before
a place is opened?" and gained a Box list (Top ticked), and board 18's
list has Top and Contact too. Then (the user) the Box lists came off
every field screen, and taking a field off a card line is an x, not a
trash can. On the phone the page opens folded (board 6b): Basics, Fields,
Before it's opened and Questions are rows with what's in them; the
computer keeps them open beside the preview. The user's rule, Nov 5: admins
shouldn't reinvent the wheel, and visitors shouldn't see different things
between communities, so ready-made comes first everywhere. The user: design it as it should be, not as the settings are
today. Read on live Nov 5: Add, Correct, Take off and Search bar are on for
all 16 pages; Map is off only on the three with no address (WhatsApp,
Networking, Cemetery); no page sets Groups. On the drawing:

- The list is rows: line glyph, name, places count, "Hidden" when off,
  chevron; "+ New category page" beside the heading. Candle Lighting &
  Zmanim is back in the list as a row, like Eruv.
- "+ New category page" opens **What kind of places?** as its own screen:
  a search box, then one scrolling list of every listing page live today
  (Cemetery, Childcare, Food, Grocery, Hospitals, Hotels, Mikvah,
  Networking, Schools, Synagogues, WhatsApp Groups), each with its real
  fields as the line; one the community already has says "Already a
  page". "+ Make your own page" sits under the list. Either opens the
  page's screen, filled or empty ("Don't make this page" until it's
  saved). Today only six kinds have templates and live `place_kind` is
  unset on every page, so building this means copying a page's fields.
- Three sections on every page, and on every field: **Basics** (a
  page's icon, name, banner; a field's name), the details (a page's
  **Fields**, renamed from "Each place" Nov 5; a field's choices), and **Questions**, each a No / Yes. The
  user's idea, Nov 5.
- A page's Questions: "Can visitors upvote places?" (the round thumbs-up
  with a count on each place; it also adds a "Most upvoted" sort and
  answers "best ..." searches) and "A link for places not listed here?"
  (Hospitals → Refuah, Mikvah → mikvah.org).
- Gone from the page: Search bar (always on), Add / Correct / Take off
  (the "+ Add" box is site-wide; always on), the Map switch (a page is
  on the map when its places have an address), Groups, web address (set
  from the name when the page is made), link-preview words.
- Each place: every field is the same row, the five ready-made ones
  (Address, Phone, Hours, Website, Photo) included: drag to reorder, tap
  to open, Remove inside (the user, Nov 5: they shouldn't look
  different). Each row says where it shows:
  "Filter · in the list", "In the list", "When a place is opened".
  Today only Address and Phone are switches (`has_address`,
  `has_phone`); Hours, Website and Photo are ordinary fields (live: no
  Hours on Synagogues, Hotels, Cemetery; no Website on WhatsApp).
- "+ Add a field" is the same shape: a search box plus one page menu
  ("All pages", or one page: Hospitals shows only the fields Hospitals
  has), then one scrolling list of every field live on any page, once
  each, alphabetical, each with the pages it's on and its choices or
  kind. Each row opens the field first (board 11): the pages it's on, and
  how it looks in the list, in the filter and on Add a place, then one
  button, "Add to <page>". No "+ Add" on the rows. Kosher Certification
  brings "Everything here is kosher" with it. "+ Make your own field"
  sits under the list, then "What kind of field?" (Choices, Yes or no, A
  list of items, Text, Link), then the field's screen. When nothing
  matches, the list says so and offers "Make your own: <what was typed>".
- Drawn Nov 5 (boards 14, 15), waiting on the user: a ready-made field
  is one shared definition. Opened after adding, it says "Ready-made"
  beside its name, and nothing more (the user, Nov 5: no "same
  everywhere" or "Philly's own" labels; the choices box shows which by
  having + Add and × or not); name, note and questions show as answers,
  not inputs; "Remove this field" stays. Its choices are one of
  two, decided per field by the ready-made definition, never split
  inside one field (the user, Nov 5: a split by choice felt wrong;
  hechshers are local, but Kosher Store's choices are what every admin
  wants kept):
  - **Each community's own** (board 14, Kosher Certification): the whole
    list is the community's, drag, ×, "+ Add a choice", and the Other
    switch. Live, only Kosher Certification and Hospitals' Eruv are like
    this.
  - **Same everywhere** (board 15, Kosher Store: Kosher Store, Kosher
    Items, Other): a plain list, nothing to change. Every other live
    choice field: Food Type, Store Type, Denomination, Services,
    Cemetery's Type.
  - Denomination gets one list (agreed Nov 5). Four differ today: Philly
    Synagogues (Orthodox (Ashkenazi), Other, one choice), Philly Schools
    (Orthodox, no Other, several, key `d`), Washington Synagogues and the
    template (Orthodox, Other, no Non-Denominational, several).
    One field on every page, since it's the same question everywhere. The
    user, Nov 5: for shuls, Ashkenazi/Sephardic is really nusach, and
    schools don't have one. Recommended:
    - Denomination, every page: Orthodox, Conservative, Reform,
      Reconstructionist, Non-Denominational, Other; one choice.
    - Nusach, a ready-made field only Synagogues use: Ashkenaz, Sefard,
      Ari (Chabad), Sephardi (Edot HaMizrach), Other; may be left empty.
    Live, Philly's 8 "Orthodox (Ashkenazi)" shuls (7 shown, Vilna
    archived) and Mikveh Israel's "Orthodox (Sephardic)" become Orthodox.
    Mikveh Israel's Nusach becomes Sephardi, from its own value. The 8
    get no Nusach: "Ashkenazi" there isn't a nusach, and both Chabads
    are among them. The schools' key `d` becomes `denomination`. A saved
    search filtered on either old value would stop matching.
    Dry run ready Nov 5 (`scripts/denomination-nusach.mjs`): live is 17
    rows, 3 pages (Philly Synagogues, Philly Schools, Washington
    Synagogues), 13 places, and the pending edit #1315 (South Philadelphia
    Shtiebel, which carries "Orthodox (Ashkenazi)"). Template and seed match
    already. Waiting on: the user's go-ahead for `--prod --apply`, then a
    revalidate.
  The ready ones ask nothing, so "required" goes for them: live, only
  Networking's Website is required among the five.
- Each kind of field asks only its own questions (was a map board,
  now just this list): required (not Photo; Yes or no can be since Nov 8,
  meaning someone has to pick Yes or No), part of the filter (Choices, Yes or no, Hours as "Open
  now"), show before opened (Choices, Yes or no, a list's count, Text's
  line, Link's button; Hours, Address, Photo always show), both X and Y
  and the "Other" row (Choices only), note under it (all but Photo),
  button words (Link). A field's screen shows only its kind's questions.
- Notes under a field, live: Store Type ("Pick Scheduled Deliveries
  if ..."), Delivery Details (an example), Grocery's Kosher Store and
  Kosher items available. Grey words inside the box instead: WhatsApp
  Description, "What isn't kosher?", Hotel Notes. One "Note under it"
  replaces both.
- A field's Questions, in the user's words (Nov 5): "Is it a required
  field?", "Should it be part of the filter?", "Show it before a place is
  opened?", and for choices "Can a place be both Meat and Dairy?" (built
  from its first two choices).
- "Other" is a row at the end of the choices with a switch ("A box to
  type in"), not a question. The hint is "Note under it, on Add a place"
  in Basics, shown in the Adding preview.
- Off the community admin's field screen: "Only for some places" (live:
  Food's two delivery fields and "What isn't kosher?"; they keep working,
  superadmin sets it).
- Not a field question any more: "a place can note exceptions". Used
  once, on Food's kosher certificate ("Everything here is kosher" plus
  "What isn't kosher?", the chip turns amber); it's set by the Food kind.
- Make your own kinds: Choices, Yes or no, A list of items, Text, Link.
  Short and long text are one; Number (unused) is gone; Phone and Hours
  are ready-made (a second set, like the Mikvah's Women's Hours, comes
  with the kind); Davening times and Contacts come with the Shuls and
  Hospitals kinds.
- The question card is chosen by the site; the four listing options are
  set by the kind (superadmin can adjust).
- Preview has Page · A listing · Adding. On a phone, Preview is the
  full-width round button, as on Home page.
- Not decided: whether "Can visitors upvote places?" stays as asked, or
  the button is renamed on the site so admin and visitor use one word.

**Building, the user's go-ahead Nov 5** ("Yes, start building"), in five
steps, each tested and pushed: 1 the list and a page's layout, 2
ready-made pages and fields first, 3 fields in boxes (Address and Phone
become rows, drag between boxes, ListingParts goes), 4 Before it's
opened (built without a DB change, on the fields themselves), 5
removing a filled-in field. The Denomination/Nusach prod change comes
after the deploy, dry run first, and needs its own go-ahead.

- Not on the drawing, in step 2: a ready-made field is copied as it is,
  choices included, until boards 14-15 (shared or local choices) are
  decided. A new page's icon is its emoji until it has a line glyph.
  Test pages in the shared dev/test project show in the list on dev.
- Not on the drawing, in the field screen: a superadmin also gets "More",
  the old form as it was (only for some places, an audience, a link's own
  box, a badge in place of another, What isn't kosher, the order), so
  nothing a saved field uses is lost; it repeats Name and the choices. A
  community admin can't reach those settings now. Kept that way (the
  user, Nov 5: "Keep under More"). The Adding preview
  doesn't outline the field being edited. Boards 14-15 (a ready-made
  field, fixed or local) are still waiting on the user, so no
  "Ready-made" pill yet.
- Done Nov 7, from the user's notes on the review page: a choice called
  just "Other" is left out wherever typed-in Other is on (the Add form and
  the field screen), so Denomination says Other once. A place that picked it
  keeps it, as typed-in text. The stored choice is still in the data; taking
  it out of live data needs the user's go-ahead, and nothing needs it.
  Kosher Certification's screen now says it comes with "Everything here is
  kosher?" and "What isn't kosher". Those two Food fields were never hidden
  from visitors (the listing's What isn't kosher box). They're the
  hechsher's own questions and come with it when it's added.
- The user's field-by-field review (started Nov 8) on the review page
  (artifact TdzYKX4Y3tRFEhFpEjUspn, 47 fields on dev, 34 only described by
  their kind). Per-field rules live in `fieldRules` (src/lib/fieldAbout.ts).
  Done so far, BUILT Nov 8:
  - Open: Hospitals' Eruv is a plain choice field with the eruv names typed
    in by hand ("University City Eruv", "Center City Eruv", "Not inside an
    eruv"), shown in the hospital's This Shabbos box. The user asked whether
    it should take its choices from the Eruv page. Recommended: yes, the
    choices are the community's eruvim plus "Not inside an eruv", and the
    listing links to that eruv. Not built; waiting on the user.
  - "Type" (Restaurant / Bakery & Cafe / Ice Cream) was an old copy of
    Store Type (same key, `foodType`) from the starter Food page
    (src/data/categories.js, categoryTemplates.ts). Only dev's Riverton test
    page had it, nothing filled in. Removed there Nov 8 (dev only). Live's
    Cemetery has a different "Type" (Cemetery / Funeral Home), all 5 places
    use it: it stays. The starter Food page carried the old Type until Nov 22;
    it has today's Store Type now.
  - BUILT Nov 9 (the user: "I like your recommendations in general"):
    - Each ready-made field's "What this is" lists "Kept up to date by",
      each source saying what a place needs for it (reworded Nov 9 after
      the user asked "how do I enable that?"): "Google, for places found on
      Google", "The place's website, once its page is added in Places",
      "The shul's emails, once they're signed up for in Places", "Its
      menu, once its menu link is added in Places", "Refuah, for hospitals
      on Refuah", the three kosher lists by name, and "A weekly check that
      the link still works". Fields nothing watches say nothing. The jobs
      are on for every community unless turned off on Watches.
      Recommended, not drawn (the user chose a reword for now): a "Kept up
      to date" box with, per source, whether it's on here, how many places
      it covers, and a link to fix what's missing.
    - Partners (src/lib/fieldPartners.ts): Kosher Certification URL comes
      with Kosher Certification, Delivery WhatsApp Group with Delivery
      Details. Each has a switch on its field's screen ("Link to the
      certificate", "WhatsApp group"); on puts it right after its field,
      off takes it off (Save still asks if places lose an answer). On the
      Add list a partner isn't its own row; it comes with its field unless
      switched off. The page's own field list shows it with its field,
      not as a row of its own (Nov 22).
  - Answered, not built (the user's questions, Nov 9):
    - UES Grocery's "Kosher" yes or no (dev only) says less than Kosher
      Store (fully kosher, or some kosher items). Recommended: replace it
      with Kosher Store.
    - Shabbat friendly (Hotel): a "What makes it Shabbat friendly?" note
      that comes with a Yes, like the kosher questions (the user's yes,
      Nov 22). On dev: `shabbatFriendlyNote`, a textarea with showIf on
      `shabbatFriendly`, in the Shabbos friendly box after it; the listing
      shows it under the tick with no label. Live waits on a yes. Found
      building it: the box's Edit sheet asked a showIf question whatever
      the answer (fixed, BoxEditSheet). The admin can't add such a
      question to a field itself; only the kosher-style exceptions pair.
  - The rest of the fields: the user's, later.

## Small open decisions

7. The "+" button covers part of the third tile in a row on the phone home.
9. To look at some time (flagged Nov 20): the drawing session "Draw:
   asking for location when it helps" (branch `claude/eager-nash-317067`,
   started from the public site review) is waiting on the user's look at
   its boards. Nothing built until a board is approved.

## Planned: the admin redesign (started Oct 28, brief agreed Oct 28)

The user wants the whole admin console redesigned so a new community's
admin finds it clear. The minimum: it looks good, it's organized, and every
field is accurate and works. Lighter than the public site's process: a
brief, one round of drawings, then the build in pieces.

4. **Drawings: ALL DRAWN Oct 28, waiting on the user.**
   https://claude.ai/artifact/9yEZYDSSXt88jyu38tFvWm, 21 boards: To do
   (desktop, and phone with a search opened), deciding a change (The Kosher
   Grill's hours), deciding a new place (Kosher Experience - Marlton Tpke),
   Places, a category page (Food, and 6b with the Computer/Phone switch),
   the home page, a new community's first visit with the setup checklist,
   Reports, Settings · Team, Site on a phone, Header and menus, a form
   opened, a new campaign, a field opened (Kosher certification), About and
   Privacy, and adding a place (from the search "trader joe's").
   One change from the brief on purpose: To do groups by what you decide
   (New places, Changes), not by who sent it, so suggestions and watch
   findings sit together.
   Changed Oct 29 (the user: there will be too many searches for an admin
   to keep up with): Searches nobody found is no longer a group beside New
   places. It is a row at the bottom of To do, with Watches and Responses
   ("37 different searches"), that opens in place, and it isn't counted in
   "N to decide" or the nav's number. The full list is still under Reports.
   Also Oct 29: every list cut short ("18 more", a form's questions,
   Places' "Show all") now has "Show fewer" to fold it back.
   What the drawings add that the site can't do today:
   - Forms get a real "On the site" switch. Support and Volunteer are
     still tied to a code flag. Both are live (tiles in the category list)
     but production holds no responses to either.
   - Oct 28 revision (boards 12b, 13b, 13c, beside the old 12 and 13):
     Feedback moves from Header and menus to Forms. Forms is a short list
     (Feedback, Patient & Family Support, Volunteer for Patients), each
     opening to its wording and an on/off switch. No new-form builder.
   - A campaign picks its own photo. The desktop banner always shows the
     sukkah photo.
   - Reports drops the approval-rate and time-to-approval tiles. It shows
     views by day, most viewed places, and what was taken and left.
   - Header items and phone tabs get an on/off switch and drag order.
   `category.kind` already exists (listing, map, eruv, zmanim, medical), so
   the agreed kinds extend it rather than adding a column.
5. **Build, step 0 (clean-up): BUILT Oct 29** on `redesign/oct18-fixes`.
   Gone from the admin and the code: the tagline (site and new-community),
   the Browse, Davening and Map card headings, the width toggle on the two
   cards that always share a row, the card text colour (categories and
   forms), a form's card photo, the dead photo home tile, the "group at the
   top of the form" checkbox, a tags field's "only when opened", and Read
   questions' approve (old approvals still answer; prod has 2). Developer
   text ("migration 0xx", "Supabase", model names) is now plain words.
   `src/lib/settingsReaders.test.ts` fails on any setting nothing on the
   site reads. The database columns are still there: dropping them needs
   the user's yes on production (site_settings tagline and desktop_browse,
   desktop_davening and desktop_map eyebrow/heading; card_text_color on
   category and form; card_image_url on form).
7. **Build, step 2 (To do): BUILT Oct 29.** One list, grouped by what you
   decide (boards 1 and 2): New places, Changes (edits, removals, new
   categories, eruv fixes, each saying what it changes), Searches nobody
   found, and new Responses. Four rows a box, the rest behind "N more"; on
   a phone New places, Changes and Responses fold to one row each. The two
   search lists are one: a missed search brings the AI's suggested words
   along, and a reading with a word to teach and no search of its own is a
   row too. A search opens in place to Add a place, Dismiss, or Teach.
   Read questions is gone (`/admin/questions` goes to Searches, which now
   holds Taught words). A suggestion opens to be decided, with "‹ To do",
   "1 of 13" and Next; a removal, new category or eruv fix opens to its
   card. The nav counts the same list (`src/lib/todo.ts`, one store in
   `useTodo.ts`), in the sidebar and as "To do · N" on a phone. Watches
   says how many pages are read and when they last ran.
   Not as drawn: a Responses row (when none are new) sits under Watches,
   since To do has no tabs and that page holds the handled responses. (A
   Searches row sat there too until Oct 29; every search nobody found now
   opens from Reports, under it like History, with "‹ Reports".)
   **Drifted from the drawing, fixed Oct 29:** what a watch found (new
   places off the kosher lists, a shul newsletter's changes, a website's
   hours) is drawn in To do's New places and Changes, and the brief agreed
   they sit with people's suggestions. The build left them out (the
   queue's read dropped them, so they waited only on Watches' pages), and
   the count did too: live had 16 waiting that To do didn't show. Now
   they're in New places and Changes, counted, and open to be decided
   like anything else ("1 of 22", "from Mekor Habracha's list"). They
   still wait on their kind's page on Watches too, with Compare.
   Small, seen on the way: on a new place with no hours, the deciding
   screen draws every day as "Closed". Approving it unedited saves no
   hours (only what's edited is sent), but it reads as if it says closed. The opened
   suggestion's wording (boards 3 and 4: "Update the listing", "Edit, then
   update", "Leave it") is still the old card's; its heading still says
   To do.
10. **Build, step 4b (a category's page, around kinds): BUILT Oct 29.**
   Making a category starts with "What kind of places?": Shuls, Food,
   Groceries, Mikvahs, Hotels, Hospitals or Plain. A kind brings its
   template's name, fields and look; Plain starts empty. The icon, the
   hidden search words and the link-preview type follow the kind
   (`placeKinds.ts`), and every category saved before this takes its kind
   from its address, so nothing changes for Philly. A category's page
   (board 6b): its name, how many places (opens Places narrowed to it), an
   "On the site" switch, its kind, Name and look, What each place shows as
   rows that open a field's own screen, Map, and the "Not listed here?"
   line, with the page itself beside on a computer (click it to try it full
   size). One Save bar; after a save it says "Saved.".
   Migration 088 (`category.place_kind`) is run on dev and live (Oct 29).
   Not as drawn: a field's own screen still has the old field settings
   inside (not The answer / Where it shows with switches); Icon, Banner
   photo and Pin colour open the old pickers under "Change"; "Every place
   has" (address, phone, hours, website, photo) is kept as checkboxes;
   The list, Places within a walk, On each listing and What visitors can
   do are kept below, not drawn; the web address can still be changed.
   A kind can't be changed after it's made, as drawn.
   Still going by address, not kind: the kosher watch, the hospital
   watches and question reader, and the map's pins.
13. **Build, step 6 (Setup): BUILT Oct 29.**
   To do starts with "Set up your guide · N of 4 done" and a bar: Name and
   logo, A second admin, Your first category (made, with a place on the
   site), The home page's words. Each row opens the screen that does it and
   ticks itself from what's saved. It goes away for good once all four are
   done, and the nav's count includes the ones left.
   The home page's words count only once they differ from the starting
   words (saving the name and logo writes the starting words too).
   Walked through on dev with a pretend hidden community, "Riverton Jewish
   Guide" (`/riverton`, dev only, safe to delete from Communities). It got
   every step done but the kosher lists from the checklist alone. Fixed on the way:
   - A hidden community's own admin saw "Not found." in every Site preview
     and on "View the site". Its admin now gets the preview pass when it
     opens.
   - Picking a plain address in Add a place replaced the typed name with
     the street's ("Cedar Lane").
   - The browser tab said the first community's name on every community's
     admin. It now says "Admin · <name>".
   - Phone boxes showed a Philadelphia number as the example. Now
     (555) 555-0100.
   - Making a category with a kind, before migration 088, showed a raw
     database error. It now says to use the kind's own name as the web
     address (088 has since been run on both, so this no longer happens).
   **Kosher lists to watch: dropped for now (your call, Oct 29).** A new
   community couldn't finish it: only Keystone-K and Mekor lists can be
   read, and Watches has no way to add one. It comes back if "add a kosher
   agency's list" is ever built (each agency's list needs its own reader).
   The three small leftovers (a new community's admin saying "Not found."
   once, the preview map on Philadelphia, the nav count) are done: item 65.
   Not as drawn: the kosher lists step (above).
14. **Newsletters set up from the console: BUILT Oct 29** (drawings 18
   and 18b). Watches → Newsletters (the Newsletters line on What's tracked
   opens it) hands out the Gmail script with the site, the community and
   that community's own key already in it: make a Gmail, Copy the script,
   open script.google.com, Run install. Once it runs, the page says
   "Checking <gmail> every hour · Last checked …" (or "Stopped checking"
   after 3 hours quiet), with Set up again. Newsletters are listed there
   with their shul and when the last one came in; "+ Add a newsletter"
   takes the shul and its email. A sender with no shul is linked (or
   skipped, Not a shul) here now, not on What's tracked.
   Each community's key is in `newsletter_setup` (migration 090, run on
   dev and live; checked Nov 1). Without it the page says
   newsletters can't be set up yet, and everything else works as before.
   `NEWSLETTER_SECRET` still works for every community, so Philly's script
   carries on unchanged; a community's own key works for it alone.
   Beyond the drawing, kept: the unlinked-sender row and the "Stopped
   checking" line. Not built: making a new key (if one leaks, delete the row and open the
   page again).
15. **The admin on a phone: BUILT Oct 29** (boards 19 to 21c, drawn after
   the user's phone notes: "more phone oriented… the back chevron", "editing
   minyan times looks like the old version", "Setting icon looks like
   brightness", "Why does site need to open on computer?").
   - Settings is a gear (19).
   - A screen one level down (Watches → a kind, Newsletters, a category,
     a form, a campaign, History, Searches nobody found, an opened To do
     item, a Site screen) has a bar with a back chevron and its name on a
     phone, and "‹ Up one level" over one heading on a computer (19b, 19c).
     The frame's own heading steps aside for a screen that heads itself
     (`AdminBack`, `AdminOwnHead`).
   - A change in To do opens what the listing says now beside what it
     would show, the changed lines marked; a shul's times as the listing
     lists them, by the box they changed in. Under it, where it came from
     and the original, then Update the listing, Edit, then update, and
     Leave it (asks why, for whoever sent it), pinned over the tabs on a
     phone (20, `ChangeReview.tsx`). Edit, then update opens only the
     rows the change touches in the site's own editor, from what was sent:
     a shul's times in the minyan editor (20b, 20c).
   - Site works on a phone: the Site tab opens a list of its screens
     (`/admin/site`; its old redirect to Home page is gone), each with the
     chevron back to it. A category's page and a form's have a Preview
     button where the page beside doesn't fit, and "On the site" with the
     place count over it (21b). The home page's cards move with up and
     down on each row (21c), and Preview opens the page full size with
     what isn't saved. Save bars sit over the phone's tabs.
   Not as drawn: a home-page card row keeps its open chevron (it opens in
   place). Site's rows got their lines Nov 22; "Edit, then update" was
   folded into the change's own editor screen (Nov 2).
   Not drawn, fixed in passing: the Category pages list's buttons go under
   the name on a phone (it was squeezed to one word a line); its look is
   otherwise the old cards.
   **Gone from a change, decided Oct 29 (the user: "leave it out"):** the
   old review's "Keep … as it was" per field and "Change another field".
   Edit, then update covers both by hand. A new place still opens the old review (board 4
   not built).

## Building: the Watches tab by kind of place (drawings settled Oct 24)

Canvas: https://claude.ai/artifact/VBDTZ5Zm7wR1R6FVQaKaMS. Every revision
is a new board beside the old one. Only the latest board for each screen,
nothing superseded: https://claude.ai/artifact/NDNpGaksvhsFk5beuX5ZWA
("Watches: what we're settling on"); a new settled board goes on both.

**Building in five pieces** (agreed Oct 24, on `redesign/oct18-fixes`):

2. **Up to date, opened in boxes: BUILT Oct 25.** An up-to-date row opens
   under itself on a computer, on its own screen on a phone, as drawn
   (FinalShuls3, FinalPhoneShul3, FinalAddSource3, FinalFoodMenus3). A
   box per part a source keeps, each footed "Same as <source> · read
   <day> · Change":
   Not done, on purpose:
   - Dishes come in one list: a menu reading keeps one page, so the
     drawing's heading per menu page needs the reader to keep its pages.
3. **Not checked, opened by what's wrong: BUILT Oct 25.** A not-checked
   row opens in place too, as drawn (FinalFood3, FinalPhonePlace3,
   FinalStopped2, EruvNotChecked): its pill, then a group per problem,
   lit, each "<page> · <what's wrong>", the fields it leaves unchecked,
   and its own button. Then "N more checked", a line each (what, the
   listing's value, its source and when, Change), and Open its listing.
   Not done, on purpose:
   - The pills are piece 1's ("Google stopped answering Oct 17"), not a
     count of the fields in the groups.
4. **Waiting for you by source, in the agreed order: BUILT Oct 25.**
   - **4b, a waiting place opened in place: BUILT Oct 25**
     (`waitingGroups.ts`). A group per source, "From
     mekorhabracha.org/davening · Oct 25", what it would change lit with
     "Was …", its own buttons, then "3 more up to date" and Open its
     listing. Each group decides what its job page would, by the same
     calls:
     Not done, on purpose:
     - A waiting place with nothing a group can show (a page that
       differs, nothing filed from it yet) has Read it again, to file
       what it says. It linked to its job page until Oct 26. None seen on
       the test site.

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
  `postedBy` in schedules.ts), unless the website's page changed after
  that week was posted: then a time it gives corrects the week's
  (`correctOlderWeeks`, the user, Nov 11). An agreeing website read confirms and
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

3. Shul times. **Built Oct 22** (compared with its drawing on dev, computer
   and phone, with the shul's updates stubbed in the browser; dev's own
   are older, unsplit filings):
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
4. Mikvah hours. **Built Oct 22** (compared with its drawing on dev,
   computer and phone; Lower Merion's update stubbed in the browser, Moishe
   Zvi's two from a real read on dev):
   - **Waiting on the user:** a mikvah's section phones and emails
     (Women's Phone, Men's Phone…) are checked in its Contact box, not in
     the Women's / Men's boxes. The drawing doesn't say which; tell me if
     they belong in their sections.
8. Watches tab tidy-up. **Built Oct 22** (the user's go-ahead):
   - Shul times: the South Philadelphia Shtiebel's calendar is read from
     its "Add our Calendar" link (`calendar/u/0?cid=…`); its embed is drawn
     by a script. It still needs its page: Add a page,
     southphiladelphiashtiebel.org/calendar.
   - Main dishes: menus read better (the user, Oct 22). A menu page's
     pictures that say they're the menu are read beside words that name
     dishes, and add what only they name (LUHV: four products in words, its
     menus as pictures). A holiday's menu link comes after the everyday
     one (House of Kosher's Thanksgiving PDF came first). House of Kosher's
     menu link is still the Thanksgiving PDF: set it to the catering menu.

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
   - **Not done yet:** the monthly re-search, and searching again when a
     page still opens but no longer has the menu. Both need somewhere to
     keep when a place was last searched. Watching the page that links to
     a PDF (a "menu-fall-2026.pdf" renamed each season) is also not done.
2. **Hospitals:** BUILT Oct 21 on `redesign/oct18-fixes`. What it does
   and doesn't do yet:
   - **Not done yet:** the per-category job switch isn't built.
     (Differences wait on the page with Compare since step 6.)
     "Off" here is the hospitals' own (a paused watch, or a "not on
     Refuah" marker watch).
3. **Mikvahs:** one dry run first (read each website once, save nothing,
   count how many it reads right), then connected.
   - **Not done yet:** no "Add photos"; no "Read it for" per page
     (every page is read for all the named hours); "What the reader did"
     isn't shown for a page added by hand; there's no monthly re-search
     (it's every morning, cheap since it's fetches only).
4. **Shuls:** the same dry run. Its count decides how far this goes for
   shuls, or whether newsletters are the real source.
   - **The newsletter stays the source** for the three shuls whose
     websites turn the reader away (Lower Merion Synagogue, Sons of
     Israel 406, Chabad of the Main Line 403) and for the Orthodox shuls
     whose times move each week.
5. **Eruv and Kosher certification** move onto job pages. **BUILT Oct 21
   (not merged).** The Watches tab stays, under that name: it is the page
   of job rows, and the one-off watches below them.
   - **Elkins Park stays "No source":** its website in the guide
     (yiep.org/eruv-map) answers 404. Its website or status page is the
     user's to give.
6. **Findings on the job pages: BUILT Oct 21** (the user: "let's do step
   6"; on `redesign/oct18-fixes`, not merged). What a watch finds waits on
   the job page that reads the place (Mikvah hours, Shul times, Hospitals,
   Kosher certification), on its row, beside what the listing says, not in
   the moderation queue. "The queue keeps what people send in."
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
       Of the 27 pages on dev, 16 are now stopped (3 had been stopped by
       hand already) and 11 are still read. Production has no found
       pages yet, so nothing there changes. The Rosenbach is archived on production; dev's copy is
       stale and still approved. The morning search takes away found pages
       it no longer finds, so it would have dropped them anyway.
       Open: the Shtiebel now has no page. Its home and calendar pages
       show no times the reader can see (production also reads its
       newsletter).
       The page is still stopped on dev. "Read it again" on the Shul times
       page starts it again. Production has no found pages, so to use this
       there, give the page by hand.

## Building: admin for a newcomer, and watches that work (started Oct 31, on `redesign/oct18-fixes`)

The user's 21-point braindump, agreed Oct 31. Goal for the week: admin simple
and fully usable for a newcomer, and watches that work. Order: the week rule;
back buttons and false "none" changes; the one-list change view; draw Watches
and Places, then build them; category switches, home wording, hiding forms.

**One rule for a week: it holds dated rows only, never a usual time.**

- Done: editing a week goes by its dates. The row shows only the times dated
  in that guide week, so a post running across two weeks (Mekor's Oct 23 – 31)
  no longer shows Oct 24's 9:15 as this Saturday's, and a time set there goes on
  that one date. Nothing posted opens empty: this replaces the Oct 23 drawing's
  "starts from the usual times". Admins now have the row in Places and in "Edit,
  then update", plus "Next week's schedule". Not changed: when two posts cover a
  week the row edits the one that wins, though the listing can show days from
  the other, and the To do board's week Edit (`BoxEditSheet`) still edits a post
  whole.
- Not confirmed: why Mekor's 9:15 on Oct 31 was never filed. With the fix, a
  read 9:15 on that date is posted (tested). There's no AI key in `.env.local`
  to replay the real read, so if it happens again, the reader dropped it.

**One list for a change.** Done: "On the site now" and "Would show" are gone from
`ChangeReview`. A change is one list, new highlighted and old crossed out. A
dated schedule goes day by day, only the days that differ, as the listing would
pick them (`changeLines.ts`). A new place still uses the old review.

**Built Nov 1 (the rest of the newcomer batch):**

- Jewish Medical Resources is gone from admin and isn't cloned. Its public code
  stays, unreachable; Philly's row stays hidden. Deleting that row needs a yes.

**To do for the user:** Washington has no Map, Candle Lighting or Eruv rows, so
after this deploys its switches show off. Flip them in its Category pages.

**Read now for email, built (the *14 boards).** The Gmail script can be deployed as
a web app: two more setup steps (Deploy it, Paste its link), the link tried at once
and kept only if it answers with this community's key. An email line says Read now
and looks in the Gmail for that address's latest email within the script's 14 days.
The result fills the rows, or says no email yet with the sign-up line, or that the
email had no times. If the Gmail doesn't answer, the hourly check still looks. Add
listing looks too, filing what it finds as the hourly run would. The Newsletters
page is now called Shul emails. Migration 091 is run on dev and live (the user; checked Nov 1, no link saved on
either yet). **Next, in this order:** merge this branch, so the live Shul emails page
has the steps; then the user re-pastes Philly's script from that page, deploys it as
a web app and pastes its link. Saving the link writes `web_app_url` on Philly's
`newsletter_setup` row and nothing else. Until then Read now for email stays off and
says "The guide's Gmail isn't set up".

**Untried:** Read now by email, until the user re-pastes Philly's Gmail script,
deploys it as a web app and pastes its link. Read now was never drawn on a computer;
it's the same code at the wider width, and I only tried it on a phone.

**To do's look is next, not built.** Canvas "To do screens"
(https://claude.ai/artifact/EmkcJDi4XaA9rPgXTMFhsH) shows what each kind of item looks
like today, from dev's 66 items: no proposal on it yet. Next is one layout, drawn and
tried on the worst examples before any code. None waiting on dev, so not on the
canvas: visitor edits and new places, removals, eruv fixes, new categories, searches
and questions, Refuah and kosher findings.

**After this, once the user follows up, not before:** step back and assess
whether the synagogue admin logic is patches on patches and can be rewritten
simpler ("it really shouldn't be that complicated").

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
