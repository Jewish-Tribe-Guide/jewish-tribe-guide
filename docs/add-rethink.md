# Add: the problem and the plan

Written Nov 26, 2026; the drawings settled Nov 27, and plan steps 2–7
built the same day (below, "What was built"). The drawings are on the "Add,
rethought" canvas (https://claude.ai/artifact/FkD8Lp8jbXC3JgZXsUgY6A):
R1, R2, R3b, R4 and P6b, with N1 (today) for comparison.

## What Add is for

The guide stays right only if the people who use it tell us what's
missing or wrong. Add is how a visitor does that: a place that isn't
listed, or a change to one that is.

## The problem

What's checked on the live site is marked *checked*; the rest is a
judgment or a worry, said as one.

1. **There are three ways to add, and people have to choose before they
   start.** Find it on Google, fill it in by hand, or paste a post for AI
   to read. Each is a different path, so the first thing asked of
   someone is which method, when what they're thinking is "Bagel Factory
   is missing" or "I have this flyer". Whichever comes first, someone is
   on the wrong one. Yet each exists for a reason: Google when you know
   the name and it's a business, by hand when it isn't on Google (a home
   minyan, a gemach), AI when you're holding a post, a flyer or a menu.
   What the person already has decides which fits.
2. **Add isn't where people look for it.** It's a floating "+ Add" in
   the bottom corner, over the list rather than part of it. When a
   search comes up empty, the moment someone most wants it, the card
   offers "Search the whole guide" and "Ask in a WhatsApp group", not
   Add. *Checked.*
3. **It opens on the AI box.** A blank box to describe what you saw,
   with the form ("Find the place") a small link at the foot. Most
   people adding a place know which place they mean, and for them
   Google is quicker and surer. *The layout is checked; "most people"
   is a judgment.*
4. **AI is hidden, then sprung.** The first screen doesn't say AI will
   read it; the result does. Someone who didn't expect AI may be put
   off. That cuts against the site's own rule of being plain about where
   things come from. *The wording is checked; how people take it is the
   user's worry, not tested.*
5. **The wait comes at the worst moment.** Reading takes a while, just
   after someone has decided to help. *Not measured.*
6. **Add and update are mixed.** The box says "Add or update a place",
   while a listing has its own Edit listing: two ways to do one thing.
   *Checked.*
7. **A long category hides both ends.** Food has over a hundred places.
   Someone scrolling it who doesn't find a place may give up without
   ever searching, and an Add at the end of a hundred rows is one almost
   nobody reaches.
8. **The person holding a poster has nowhere obvious to go.** They
   aren't searching or browsing. Their habit is to forward it, the way
   they'd send it to a WhatsApp group, not to open a site and look for a
   button.

## What we don't know

- How many open Add, which way they go, and how many send. We don't
  have good numbers today.
- Whether people miss the button, or see it and don't want it.
- How long an AI read takes was the third. From migration 117 (Nov 26)
  each read's time is kept (`message_read_time`), and
  `scripts/compare-reader/messages.run.ts` replays the posts people sent
  at each thinking level. On 42 posts the model call took 2.6s typically
  and 8.1s for the slowest tenth; at "low" 2.3s and 4.8s, reading as
  well. The box reads at low since then.

## What a fix has to do

1. **One way in; the method follows from what they give us.** A name
   searches; a post or a photo is read by AI; nothing found leads to
   filling it in. Nobody picks a method before starting.
2. **AI says so before it reads.** Never hidden, never a surprise.
3. **Add is where the need comes up**: after a search, not only on the
   floating button.
4. **Nobody has to check first whether the place is already here.**
   Every way in checks: a place we have opens to change it, one we
   don't opens to add it (the user, Nov 26: "is there a way that one
   way in can include edit?").
5. **One screen to learn.** Every way into Add lands on the same one.

## The plan (drawings agreed Nov 27)

1. **Count it.** Record when Add opens (and from where), which way it
   goes (a name, Google, by hand, AI), and whether it's sent. The AI
   read's time is already kept (above).
2. **Add after search results (R1).** At the end of a category's search
   results, a dashed row: "Add Bagel Factory · Not in the list? Add it
   to the guide". No chevron; the whole row is the tap. A search for
   something missing usually still finds other places, so the row is
   there whenever results are, not only when there are none.
3. **Add when nothing is found (R2).** Today's card, without "Search the
   whole guide" (they can go back and search), and a second button
   under "Ask in a WhatsApp group": "+ Add Bagel Factory".
4. **Find the place, one list (R3b).** Where R1, R2 and the floating
   "+ Add" all open, already searching for what was typed. One list:
   our places first, tagged "In the guide" (they open to change), then
   Google's, then "Fill in 'Bagel' yourself · not on Google" last. A
   Google place we have shows once, as ours. Under the list, "Or paste
   a post or a photo · AI reads it for you to check". Today these are
   separate (Google's dropdown, an "In the guide" list, a link under
   them) only because they come from two sources.
5. **The AI box, once chosen (R4).** Today's box, titled "Paste a post
   or a photo", with a "Read by AI" tag and "You check it before it's
   sent" before anything is typed. Back returns to Find the place.
6. **A read about a place we have opens its Edit listing (P6b)**, with
   what the post says filled in and those rows marked Changed, as any
   edit marks them, and Send counting them. A wrong read is fixed by
   tapping its row; the rest of the listing is there too. One line at
   the top: "Read by AI from your post. Tap a row to fix it." Replaces
   today's summary card and "Change something else about …". A new
   place goes to the add form, with what was read filled in.
7. **The floating "+ Add" stays**, as today, and opens Find the place
   (R3b) instead of the AI box.

What checks for a place already here, on each way in: R3b shows our
places first; a read is matched against every listing, and for a new
place it also lists ones with similar names ("is it one of these?");
"Fill it in yourself" is only reachable under our own matches. An admin
approves every new place, the last net.

## Considered and left

- **Add in a category's heading** ("112 places · Add one"). The user,
  Nov 26: not how the page looks today; Add in the header was turned
  down too. (Reversed for a computer Nov 27: D1b puts "+ Add or
  update" in the site header, outlined, beside Set location.)
- **The floating button as photo and text only** (P7: a "+" opening
  into "Take a picture" and "Type or paste"), and **a camera in the
  Find the place box** (P7b–d). Left Nov 27: every way in already
  checks, so the photo person is served by R3b's AI row and R4, and one
  screen behind every Add is easier to learn than a menu. If the AI
  row turns out to be missed, the camera can come back.
- **The search box taking a paste or a photo.** Left for now, for the
  same reason.
- **Forwarding a poster to the guide** (a WhatsApp number or an email
  address). The user, Nov 27: the paste and the camera will likely be
  replaced by a phone number, hopefully. So R3b's AI row and R4 are
  what serves the poster person until a number exists; once it does,
  they may go. The number is a cost and moderation decision (spam,
  unknown senders), not decided yet.

## Changes to earlier decisions

- **Oct 5:** "No 'AI or by hand' first screen: the box is the default;
  the form one small link away." Reversed: Add opens on Find the place,
  and AI is one row on it.
- **Oct 10:** "No word 'AI' on the first screen." Reversed: AI says so
  before it reads.
- **Oct 5:** "+ Add on every screen but the Map." Kept.

## What was built (Nov 27)

Steps 2–7, as drawn. Where it stops short of the drawings, or goes past
them:

- **P6b opens Edit listing only for a read that is one place's fields**:
  one listing, no notes, no "once or always?" question. A read about
  several places, items, times or a new place keeps today's result
  cards (and their "Change something else about …"). Its Send files the
  edit as a change to that listing, through `/api/message/send`
  (`targetId`), which refuses one that changes nothing.
- **The home page's nothing-found card has no Add**: R2 drew a
  category's, and from the home page there's no category to add to.
- **`?action=create` links** (the old deep link into the add form) still
  open the form directly.
- Step 1, **counting it**, isn't built.
- **Found on the way:** on a phone, the box drew the computer's dialog
  for its first frame, then the phone's sheet in its place. Once Find
  the place's field took the focus on opening, closing gave the focus
  back to nothing. The box now waits until it knows the screen, and
  `useDialogFocus` never gives the focus back to something that has
  left the page (`e2e/focus-and-announcements.spec.ts`, phone, failed
  3 of 3 before).

## A paste goes straight to the queue (BUILT Nov 27)

Built after the user's OK, with one change from the boards: no pop-up
(S4b, S4d). The user chose the dot on You instead: it lights when an
update this phone sent goes live, and "Your updates" (S4c) says which.

- The box opened for any update (from a page, the site's "+", Find the
  place, or a listing's "Update X") sends what was written and its
  photos to `/api/message/queue`, kept in `sent_message` (migration
  118), and shows "Sent". No AI tag, no read to check. The menu and
  shul-times boxes still read while the sender waits.
- `messageFiling.ts` reads it in `after()`, at the "high" thinking
  level, and files what it reads with the same filing the box's Send
  used (items, fields, new places, a shul's week). It never guesses
  between two places. What it can't file is left on the post, a line
  each, and shows on To do as "Posts to sort by hand" (not drawn:
  today's card look, the post first, then what was left, and Done).
  A read that fails is tried twice more, when To do loads.
- The phone keeps the ids each send answers with (`yourUpdates.ts`);
  `/api/updates` says where each stands. No account, same phone and
  browser only, so "Email me when it's on the site" stays.

### What was proposed (drawn Nov 27)

The user asked whether the sender should have to wait for the AI and
check its read, or just send, with the AI reading in the background and
the admin checking. Drawn as boards S1–S4 on the "Add, rethought" canvas
(https://claude.ai/artifact/FkD8Lp8jbXC3JgZXsUgY6A); not built until
the user OKs it.

- **S1:** the AI box keeps its look; its tag says someone checks it, and
  its button is Send. No read while the sender waits.
- **S2:** Sent, with the optional "email me when it's on the site". No
  list of what changes, since nothing is read yet.
- **S3:** the admin's queue card as today, the read done in the
  background at a higher thinking level, the original under it. When the
  read can't tell the place, the admin picks it.
- **S4 (later):** "Your update is live" the next time the sender opens
  the site on that phone.

Redrawn after the user's notes (same day), boards S1b, S3b, S4b, S4c:

- **S1b:** no AI tag in the box. The sender never sees a read, so the AI
  shows only where someone checks it.
- **S3b:** the admin's card is today's, unchanged: a "Read by AI" pill,
  the original one tab away. (S3's original-under-the-read is dropped.)
- **S4b:** "Your update is live" for anything sent (add, edit, paste).
  The phone keeps the ids `/api/submissions` and `/api/message/send`
  already return, and asks which are approved when the site opens. No
  account; not a push; same phone and browser only (Safari forgets a
  site after ~7 days unused unless installed), so S2's email stays. A
  rejection never pops up.
- **S4c:** a "Your updates" list on You (Live / Waiting / Not changed).

Edit listing and Fill it in yourself are unchanged: the person typed
those, so they still see the end result. If built, this changes:
"show the contributor the end result" (no longer for a paste or photo),
R4's "You check it before it's sent", and P6b (a paste no longer opens
Edit listing).

## Renamed, and one box (drawn Nov 27, U1c, D1b, V1b, V2b)

The user: change the name from Add, and maybe camera and paste as two
buttons. Drafts went through two paths (T1–T3; U2–U4c: Send a photo and
Send a message, each its own screen) and a first one-box draw (V1, V2)
before settling on:

- **U1c:** on a phone, a round button filled with the community's blue
  (`--color-primary`) and a white "+" (aria-label "Add or update"), the
  colour of every Send, so it reads as the main action (Gmail's Compose,
  Google Maps' +). Replaced U1b, an apricot button with a blue "+".
- **D1b:** on a computer, no floating button: an outlined "+ Add or
  update" (white, grey edge, blue words, as Set location) in the header, right side, beside Set location, on every screen
  with the header, the Map included (YouTube's Create, GitHub's +). It
  opens the same sheet as a centred dialog. Three earlier decisions change:
  the header button removed Sep 22 comes back, filled and renamed; the
  apricot add colour (Oct 26) goes; Oct 5's "no + on the Map" was about a
  button over the map, so the header one shows there. Outlined, not
  filled (D1 was filled): sites built on visitors' help keep their
  contribute action quieter than the main job (Yelp, Airbnb, Reddit), and
  here that job is finding, so search stays the loudest thing and filled
  blue stays for Send.
- **D1b chosen over D1c and D1d (Nov 27):** in D1b, Add and Set location
  are twin pills. D1c made location a status line ("Near Center City ▾")
  and D1d made Add blue words; the user kept D1b, to change if visitors
  find it confusing.
- **V1b:** the sheet titled "Add or update", search first; under it a
  whole-text link, **Or tell us in your own words ›**, quieter than a
  button so search stays the main way in. ("Have a flyer or a post?",
  "Paste", "Paste a message" and "Just tell us" were unclear or too
  loud.)
- **V2b:** "Tell us": one bordered box is the whole message, as Gmail's
  and Slack's are: the words ("Type it, or paste it from WhatsApp or an
  email", keyboard up), the photos inside the frame (thumbnails with ✕),
  and **Add a photo** as a quiet strip along its bottom edge, always in
  the same place (the phone's own menu: library, camera, file; several
  at once). Today's box already had that strip; V2's loose pill beside
  the thumbnails felt off. The site's usual wide **Send** sits alone
  below, live once there's words or a photo. Not a "+" beside Send: an
  icon alone doesn't say what it adds, and beside Send it's mis-tapped.

Why one box over two paths: one choice beside search instead of two,
a photo and words go together without picking a path first, and it's
nearest today's box. It costs a photo-only sender one more tap.

## Waiting on the user

- Counting Add (step 1): build it or not.
- The phone number for forwarding: which service, and when.
