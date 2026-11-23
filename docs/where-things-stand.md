# Where things stand

The running list of what's outstanding, kept in the repo so it survives a
change of Claude account (artifacts and Claude's own notes stay with the old
account). Update it in the same commit as the work that changes it. How
the user likes to work is in `docs/how-we-work.md`.

Last updated: Nov 23, 2026.

Finished work moved out on Nov 21: every "Done …" section is in
`docs/history.md`, in the order it was here. On Nov 22 the long sections
behind the open list followed it, so this file is the open list and what's
decided. Look there for why something
was built the way it was; this file is what's open.

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
83. **About Nov 30:** Sentry's quota resets, so `sentry:check` should go
    green and real errors show again. Then two weeks of policy reports;
    if only known noise, switch the security policy to enforce (one
    word in `next.config.ts`, **mid-December**). Inline scripts stay
    allowed (a nonce would end prerendering).
81. **About Dec 6:** speed from real visitors again (Sentry, or Vercel
    Speed Insights with your sign-in), after two weeks on today's code.
    Last read: iPhone category pages slow to draw and tap, before the
    Nov 16 and Nov 22 fixes; home taps 400–456ms (target 200ms).
4.  **When traffic grows:** a test database of its own, apart from dev's
    (the user, Nov 22: waiting is fine until then).

### You decide

2.  Copy dev's photos for Eruv, Hospitals, Childcare and Schools (iStock
    links) to live? Live's tiles for those have none of their own.
28. The drawings for asking for location when it helps (the hospital
    location boards, branch `claude/eager-nash-317067`): look, or let go.
73. A phone that throws the page away in the background might ignore
    taps until it reloads: a gap noted Nov 16, never seen; every way of
    causing it in a browser worked fine (Nov 22). Only if you see it:
    which screen, how long away, installed or in Safari.

### You do

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

### Mine to fix

27. The "+" covers part of the third tile in a row on the phone home.

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
