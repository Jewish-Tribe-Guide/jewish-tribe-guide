# History

Finished work, moved out of `docs/where-things-stand.md` on Nov 21, 2026,
in the order it was there (newest first, mostly). What's still open is in
that file.

## Done Nov 9: the Eruv page is a category page, eruvs are only in Places

The user, Nov 9: "a lot that doesn't need to be controlled by the admin."
The Eruv page held a second, older editor for every eruv (the Eruvim tab
moved there Oct 22), which Places had repeated since Nov 1.

- **Admin → Site → Category pages → Eruv** is laid out as every category
  page is (the user: "the same formatting as other category pages"): On the
  site with "5 places" (opening them in Places), Basics as icon + name +
  banner row (folded on a phone), the page beside it on a computer and
  Preview on a phone, the save bar (Undo · Save) at the bottom instead of its
  own Save/Cancel/Preview buttons, and Delete. Its Fields came later the
  same day (next section); its preview is the Page tab only. Its Preview
  has an address (`?preview=1`) through Next's router; it was a
  `history.pushState` entry before.
- **Places → an eruv → Map** holds what only an eruv has: its map drawn
  small, "Parts shown" (ticked is shown; marker names only while its markers
  show) and "Its markers". Saved with Update the listing.
- **Line colour is no longer an admin's.** A line too pale to see (contrast
  with white under 2, as Northeast's own `#ccffff`) is drawn in the default
  dark red, on the site and in the admin (`readableLines`, eruvLine.ts). Live
  values checked first: Northeast was the only eruv with a colour set, and it
  was that same dark red, so nothing visible changes. `line_color` is no
  longer read; the column is still there.
- **Order is gone.** Eruvim list by name everywhere, so the public order goes
  from Center City, University City, Lower Merion, Northeast, Elkins Park to
  Center City, Elkins Park, Lower Merion, Northeast, University City.
  `sort_order` is no longer read; the column is still there.
- The Eruvs job page's "+ Add an eruv" opens Add a place in Places.
- Kept on purpose (checked against live data): Center City leaves out ten
  border lines, Elkins Park its driving directions; Elkins Park and
  Northeast hide their markers (shuls), Lower Merion shows its crossings and
  reroutes.

## Done Nov 9: the Eruv page has Fields and boxes

The user, Nov 9: "keep what we have but just have it on that category page
that way someone can change it if they want. And an admin starting a new
community can add or change things as they apply. I don't think we need to
invent any questions or other things." (`src/lib/eruvFields.ts`)

- **Admin → Category pages → Eruv → Fields** starts with the four rows an
  eruv always had: Where it goes in its own box, then Website, Hotline and
  Email alerts in Contact. The name and status always come first and
  can't be moved or removed; since Nov 10 (no Top) they have no row. The four
  are ready-made (name locked), so they can be taken off, moved, or put
  back from + Add a field. Nothing visible changes until an admin does.
- **+ Add a field** offers those four, fields other communities made on
  their Eruv pages, and (the user, Nov 9: existing fields should show as
  options) every listing page's field an eruv can hold: text, a link, a
  phone, yes or no, choices. Not one tied to a listing's own boxes (a
  hechsher's caveat, a link's own box and its words, an audience's, a
  field that comes with another), and no photo, hours or website. The
  Which page menu has Eruv first. Make your own takes Choices, Yes or no,
  Text and Link. A field made or added there is kept on each eruv in a new
  `details` column (migration 094).
- **The preview** has Page · A listing · Editing, as other pages have Page
  · A listing · Adding: A listing opens the eruv holding the most of the
  page's fields, Editing its Edit listing. Beside a field, A listing and Editing only:
  a field isn't on the list of eruvim. These are the real eruv screens, not
  the drawn How it looks tabs a listing page's field has, so the field
  isn't outlined in them.
- **Places' Add a place for an eruv** has a row for each field made on the
  Eruv page, after its own rows, and adds what they hold with it (the
  user, Nov 9). Found on the way: typing the first letter in an empty row
  there (Hotline, say) moved it up to the filled rows and dropped the rest
  of what was typed; an open row now stays where it was opened.
- **Visitors can suggest a new eruv** (the user, Nov 9: "why can't a user
  add an eruv?"). It is in the regular + Add box, as every category is
  (then: "why didn't you just make an add an eruv as an option within the
  regular add button"): the Eruv page's + opens the box, whose "Fill it in
  yourself" goes straight to Add an eruv, and the site-wide box's "What kind
  of place?" lists the Eruv page when it takes additions. Add an eruv is a
  name, the page's rows, and
  where its status is posted (a page or an email address) and its map, if
  they know. It goes to the queue as a New place in To do, the card and
  the admin email listing what it gives. Approving adds it and reads its
  status page (or kept email) and map at once, not on Friday. It is
  refused when the name is already listed (hidden eruvim too), and where
  the community or the Eruv page takes no additions. On the live site it
  needs migration 077, the same as Suggest an edit (item 4 below). The
  Eruv page's admin preview still has Page · A listing · Editing, no
  Adding.
- **+ Add a field adds to the box it was clicked under** (the user, Nov 9:
  "I'll click add a field under a specific box and it gets added under a
  different box"). A field's box follows from its kind, so Contact's +
  used to offer a Text that landed in About. Now each box's picker is
  "Add a field to <box>" and lists only what lands there, then "In a box
  of their own" (contact lists, davening times, a lead link's box). Make
  your own offers only the kinds that land there; a Choices or Yes-or-no
  made from Top is a filter badge, so it stays in Top. The box is in the
  address (`in=`), so a reload keeps it. Changing a ready-made field's
  settings before adding it (turning In the filter on, say) can still
  move it, as it would after adding.
- **Any field goes in any box but Top** (the user, Nov 10: "I don't
  understand why all fields can't just go anywhere"). Contact, About and
  the admin's boxes take any field that isn't the header's: a long text in
  Contact, a phone or a link in About, hours in "Who to call". Saved as
  `listingParts.contact` / `.about` (fields put there by name); the
  listing, the admin preview and the place editor's rows draw them there.
  Top keeps its rule (photo, short line, filters). Fields that are a box
  themselves (davening times, a list of contacts or items, a lead link's
  box) are added from "+ Add a box", which now lists them first and offers
  "Make an empty box" second; "In a box of their own" is gone from each
  box's picker. Not changed: the page's own address, phone, hours and
  website are still added from Contact (they can be dragged after), and a
  mikvah section's fields come with their section (+ Add audience group).
- **"Under the name" on a field's own screen** (the user, Nov 10, board
  D2 of canvas Y4Cn6WNqe54xHQpYGY6dPH: keep today's field screens, no Box
  menu). A ready-made Choices, Yes-or-no or short-text field gets an
  "Under the name" switch in What you can change ("Shows on its row in
  the list"); a field you made gets "Show it under the name?" Yes / No.
  It sets the field's second line (`onCard`) or third line
  (`showInHeader`), whichever it is. How it looks switches to List when
  it changes. Not on the Eruv page, which has no rows.
- **Every box moves, any box comes off, + Add a box adds in place** (the
  user, Nov 10, boards A and B: "Can't we just have boxes and fields and
  an admin can arrange how they want?"; "Yes, build it" to removing a box
  taking its fields). Every box but Top and "Not on the listing" has a
  handle and goes anywhere between them, Contact and About included; the
  order is saved as `listingParts.order` and the listing draws its boxes
  in it (a box it doesn't name follows the one it usually follows; the
  Shabbos card still leads on a Friday). Every box has a trash can: its
  fields come off the page with it, Contact's address and phone too, and
  Save asks before clearing answers, as for any field. "+ Add a box" adds
  an empty box at the end, open, its name ready to type, with no screen
  in between; a field that is a box itself (davening times, a list of
  contacts) is offered by any box's "+ Add a field" and lands as a box of
  its own. Not built yet: big fields as rows inside any box (board A's
  Menu holding Main dishes). A listing's own sections that it draws as one (a mikvah's
  audience sections, the main thing) still render together, where the
  first of them is.
- **A field stays where it's put; a field with parts is one field**
  (the user, Nov 10, round 3 boards E1b, E2, E3b, canvas
  Y4Cn6WNqe54xHQpYGY6dPH; "let's build"). Built: no hidden rules move a
  field. Hechsher and Delivery Details are one field each: the hechsher's
  "Everything here is kosher?", what isn't, and its certificate link, and
  Delivery's WhatsApp group, are parts (`src/lib/fieldParts.ts`), never
  rows, and go wherever the field goes, in the admin list, the editor, the
  listing and How it looks. The "What isn't kosher" and "Delivery" boxes
  are gone; an unboxed hechsher sits in Contact, Delivery Details in
  About. The listing draws the hechsher with its amber note and
  Certificate button in whatever box holds it (Certificate is no longer
  in the action row), and no caveat line under the header. Times and
  items now outrank admin boxes as a listing's main thing, and box fields
  respect show-if. Food on dev was converted to boxes Kosher (hechsher,
  Food Type) and Delivery. **Food on the live site needs the same
  conversion, after this deploys** (dry run shown; needs the user's
  go-ahead, then revalidate). Still held, the user's call: boxes fold in
  the built Fields (one open at a time) while the boards draw them open,
  and no board shows a box's trash can.
- **No Top** (the user, Nov 10, board A; "Yes, build it"). Fields lists
  only boxes and fields. A field's own Under the name switch puts it under
  the name, and a listing (an eruv's too) shows it only there, not again
  in its box (its row in admin says "Under the name").
  The photo goes with the name and isn't listed (its switch is in "Before
  it's opened"). (Round 3 replaced how the hechsher is placed: see above.) A filter or
  short line that used to be Top's lands in Contact, and any box offers
  it. Not drawn on board 1b and still on the page: "Within a walk" and
  "Before it's opened".
- **A category page in admin opens without waiting on the list again**
  (the user, Nov 9: "Most noticable is lcikcing on a category page in
  admin"). Each Category pages screen is its own address, so every open
  fetched the list of pages before showing anything, and opened from its
  address the page then fetched its places after that. The list is kept
  between screens and refreshed behind it (a page changed in another tab
  starts again from the fresh copy), and a page opened from its address
  asks for its places beside the list. Locally a click from the list shows
  the page in 175ms, before the list's refresh comes back. Measured on
  the live site Nov 9: Supabase answers in about 0.1s; a preview
  deployment's API calls took 0.8–1.2s each, uncached.
  Still slow on the preview after that (the user, Nov 9): each page's
  address is rendered on Vercel's server the first time anyone opens it
  after a deploy (Synagogues 0.93s, Mikvah 0.66s, then 0.10s), and the
  click waited for it. The list now loads every row's address behind it
  (`router.prefetch`), and a page loads the list's, so the click asks the
  server for nothing (`e2e-admin-write/category-open.spec.ts`).
- **An admin's field is filled in** in Places (a row of its own after
  Website, saved with Update the listing) and by anyone through Suggest an
  edit, which goes to the queue; the queue and the admin email show it
  before and after, named as the page named it when it was sent. Use this
  takes it only when it's ticked.
- **The opened eruv** follows the page: its boxes, a field taken off the
  page isn't shown or offered in Suggest an edit, and a field set to show
  in the header goes after "Eruv" under the name. The Eruv page's list of
  eruvs is unchanged.
- **Not added, on purpose:** Questions, Within a walk, Before it's opened
  and audiences; an eruv has none today.
- Found on the way: the editor added a Photo field to every page it opened,
  the Eruv page included, which would have put a photo picker into eruv
  Suggest an edit. The Eruv page no longer gets one.
- Known edge: an Eruv page with every field and box taken off shows the
  four rows again (there's no way to tell it from a page never saved).
- A Text field lands in About, as long text does on every page. A
  listing's About is its description, with no heading; an eruv has none,
  so on an eruv a lone field there is headed by its own name ("Certified
  by"), and several are each named under About. Found on dev after 094.
- Opening "What kind of field?" from a pasted address, straight after
  another admin screen, and picking a kind goes Back to that screen and
  drops the draft. A reload there works. Every category page does this.
- **Migration 094 (`eruv.details`) is on dev (Nov 9), not live.** Checked
  on dev: a "Certified by" field made on the Eruv page, filled in from
  Places, saved to `details`, shown on the opened eruv and in Edit
  listing; then put back. Live needs a yes (see "Waiting for a yes").

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

## Done Nov 5 (on `redesign/oct18-fixes`)

- **Contact box** is dated by the website that checked the phone (5e2fbe3d).
- **A shul's week keeps its own notes.** A dated time never takes the note
  of the usual time it lines up with (Kol Tzedek's online-only Nov 13 came
  out "hybrid, tea and cookies"). A change to a note alone is one line:
  "Note added", "Note changed", "Note taken off".
- **The reader takes a minyan's links from the page.** It now sees the
  address behind a WhatsApp, GroupMe, sign-up form or Zoom button, on a
  shul's page and in a newsletter, and keeps one only if it's written there.
  Pages with such a button change fingerprint, so they're read again once.
- **No borrowing (the user, Nov 5).** A week's minyan never takes the usual
  minyan's sign-up group or join link: not in the reader, not in To do, not
  on the public site. A week without its own link shows none. A sign-up
  minyan with no group of its own is still marked sign-up, for an admin to
  give the group.
  - Why the links weren't found (checked on live, Nov 5): they are on the
    shul's site, just not on the page the week comes from. Mikveh Israel's
    two WhatsApp groups are on its home page, and its week is from its
    calendar. Mekor's group is on its davening page (the usual times).
    Rodeph Shalom's Zoom is on its calendar and was already read. BZBI's
    week's Zoom isn't on its worship page.
  - Weeks already posted on the live site may still carry a copied group or
    link. Cleaning them is a live write: needs the user's yes.
- **The reader keeps "Online only" and "Hybrid".** When a dated service's
  own line says so ("Online-Only Friday Night Kabbalat Shabbat Services"),
  its note does too. Kol Tzedek's Nov 13 and 14 had lost both.
- **Five live shul suggestions to file again** once this is live (Leyv
  Ha-Ir, South Philadelphia Shtiebel, BZBI, Kol Tzedek, Rodeph Shalom). Re-run the dry run first; writing needs the user's yes.
- **Admin Home on an iPhone jumped back to the top** while scrolling fast,
  with Phone picked (the user, Nov 5, live and preview). Fixed, and checked
  by the user on the iPhone. An on-screen log on a debug preview showed the
  cause: the short page was pulled past its bottom, the browser bar's height
  flickered a pixel during the bounce, and that resize dropped the scroll to
  0. No touch, click or script was involved. Admin pages no longer bounce past
  their ends (`overscroll-behavior-y: none`, admin only). The user finds it "a
  little stark", but it works. Pull-to-refresh in the admin probably goes with
  it. The hidden preview no longer loading on a phone (f6b64619) was not the
  cause, but stays.
- **Tapping away from a menu on a phone** (Show, Category, Sort): the tap
  only closes it. The click is swallowed until it comes, up to 0.6s after
  the finger lifts (`swallowClick.ts`); on an iPhone it comes later than the
  next tick, when the old swallow had already ended. That's a guess jsdom
  can't check: try it on the commit's preview. The home search's results
  (`HeroHeading.tsx`) still do it the old way.
- **Settings has no lone Team tab.** An area's tab row shows only with two
  tabs or more; the site owner still gets Team and Communities.
- **Citizens Bank Park's page check lost its Contact line.** The page is its
  website and its menu, read on one watch. On a night the page hadn't
  changed, the menu's check was saved as the watch's, so the page's own
  (its Contact line, what it last compared) was gone. The watch now keeps
  the page's check only (`sharedPageWatch.ts`); the menu's read is kept on
  the listing. The live watch holds the menu's check today, so the first
  nightly run after this deploys reads the page once with the AI and the
  Contact line comes back. Nothing to write on live.
- **Waiting for a yes:** the five shul suggestions waiting on live were
  filed before the note fix and carry usual-time notes. Refiling them is a
  live write.

## Done Nov 4, later: Site's Home page is one screen (on `redesign/oct18-fixes`)

Drawn first (artifact 2sssenojcQzzeHtHAT8gnp), built as drawn:
- **Home page** and **Header and menus** are one tab, Home page. A
  Computer / Phone switch at the top picks which version's boxes show and
  which the preview beside them shows; it runs full width on a phone, like
  the Preview button. Computer: Name and logo, Header, Top of the page,
  Search box, Cards under the search. Phone: Name and logo, Search box,
  Today home (while held back, not shown), Tabs. Boxes on both say "Also
  on a phone" / "Also on a computer". `/admin/menus` lands on Home page.
- **Not as drawn:** the drawing's "Header links" / "+ Add a link" is
  "Header" / "+ Add a tab", since header items are tabs holding links or
  headings (decided earlier Nov 4).
- **Line under it** wraps (a textarea).
- **The logo and the photo upload as a listing's photo does:** no hint under
  the buttons, and the image's address behind a "Paste URL" button instead
  of always showing.
- **The photo has no description to fill in**; it's decoration (empty alt).
  Replaces note 24 below.
- **"When the link is shared" is gone.** A shared link's description is the
  big line and the line under it (`shareDescription`), on every page that
  used the old description. Its Title was never shown anywhere a visitor
  could see (the shared title is the site's name). The phone's hidden page
  heading is the big line too.
- **Fix:** Watches' "N things need fixing" and "Broken checks" opened To do
  on All. A link from another admin page sets its address only after To do
  first renders, so `?show=broken` was missed, then stripped. It's read again
  after that first render now.
- **Cards under the search:** a card held over a box it can't join turns
  that box red with the reason under it: "Full: 3 cards at most", or
  "Categories has a row of its own" (Categories in or out of a box). A full
  box is still dimmed from the moment a card is lifted.
- **The preview beside:** on a computer it's as tall as the page, all of it
  (about 460px for Philly's home page, down to the footer), rather than one
  1,100px screen. The phone stays one screen, since the whole phone page
  would run past the window. Clicking either opens it full size, as
  Category pages' preview already did.
- **Fix:** the full-size preview had no history entry, so browser Back left
  the page and Forward after "Back to editor" did nothing. It has one now,
  as Category pages' and Forms' previews do.

## Done Nov 4: the bugs and small tweaks from the user's 33 notes (on `redesign/oct18-fixes`)

The user sent 33 notes on Nov 4, mostly about the admin screens, and said
"bugs first". Each fix has a test that failed against the old code.

- **13, the console "randomly reloads":** a renewed sign-in redrew the
  whole console. Now only a different person signing in re-checks access.
- **33, tapping away from a menu:** it closes the menu and does nothing
  else (it used to also hit what was under it).
- **17, a menu that failed showing a check on Watches:** a job with only
  last night's trouble says it in amber, with no mark.
- **12 and 29, Elkins Park eruv:** a website that doesn't open is "Website
  didn't load", in To do's Broken checks with Read it again and Stop
  reading it, not "No status". Look again counts a website that didn't open
  as a failed try ("1 try stopped with an error"), not "nothing found".
- **4, Chabad of Main Line in Broken checks:** a shul whose pages were all
  stopped leaves To do and shows as Not checked (stopped reading).
- **10, Forward:** Forward onto a screen that was closed steps straight back
  (it can't reopen it). To do's editors now add a history step per open
  row, as Places' editor does, so Back closes the row, not the place.
- **6, menus that "randomly" read:** dishes read from a picture say "from a
  picture" in To do's Main dishes box. The four menu links given on Nov 4
  that never finished (Insomnia twice, Shlomo's, Center City Pretzel) ran
  out of the route's 60s; it has 300s now. On the live site they say "Its
  read didn't finish. Read it again." Once this is deployed, Read it again
  on each.

Then "the small tweaks", each with a test that failed against the old code:

- **11, the Category menu:** on Places and To do it lists only categories
  with something under the other menus and the search, with counts
  ("Food (1)").
- **14 and 15, Watches:** "+ Add a watch" is a button at the top right,
  always; the Not checked box is gone (it's on Places).
- **16, broken checks on Watches:** a place's broken check is To do's. The
  Watches sentence counts them and opens To do on Broken checks, and Needs
  fixing has a "Broken checks" row beside a whole job failing.
- **30 and 3, To do:** opens newest first; when the last thing on a place
  is done, the list says "<place>: nothing left to do".
- **31:** tapping To do while on the list starts it over (filters, search,
  sort).
- **32, phone bar:** the tab you came from stays lit on a category page, as
  Spotify does (Home, You or Browse). A first load onto a category lights
  Home; a category with its own tab lights only that.
- **24:** the home photo's alt field is "Photo description, for screen
  readers".

### The menu reader, from the same notes (Nov 4)

- **5, typing dishes in by hand on To do:** "Save these dishes" once
  something is typed, saved as the menu's dishes, so the place leaves To do.
- **1, Nothing Bundt Cakes:** a menu's reading on To do has Edit, Read it
  again and Change (a new menu link, read in the background), as Places has.
  Its bad reading came from /find-a-bakery/, taken before Oct 22's fix.
- **8:**
  - Branches sharing one menu watch (Rita's, Dottie's, PLNT, Playa Bowls,
    Insomnia) count as checked.
  - A menu whose reading failed is "Not checked: menu (can't be read)" on
    Places, until dishes are given by hand.
  - To do's and the opened place's answer for a menu that can't be read is
    "Stop reading it" (saved as no menu is, noted "Can't be read"), not "No
    menu online".
- **2 and 9, one page that is both a place's website and its menu:** the
  guide keeps one watch per page, so only one reader ever ran. The run now
  reads both on that one watch, each with its own fingerprint
  (`sharedPageWatch.ts`); the hours sync takes a place's own menu watch on
  its website over as its website watch. No migration. On live this
  affects the Brazilian BBQ and the Citizens Bank Park Kosher Grill (menu
  now read) and Zevi's Bakery and the Xfinity Kosher Grill (hours and phone
  now read), from the first nightly run after this deploys.
  - Not built: Zevi's hours are pickup windows on /ordering, not its home
    page. Reading them needs /ordering given as a page (Add a source), and
    the reader putting pickup windows in a note.
  - Trade-off: stopping such a page's website reads stops its menu read too
    (one watch).
- **21, Ben & Jerry's:** nothing to build. Our run started from /upenn,
  whose menu link goes to an ordering site.
- **7, KCL:** built (`kclWatch.ts`, `kclRun.ts`). A website watch on
  kclkashrus.org's home page finds the list PDF it links ("See Complete
  Listing"; the file's address changes each edition) and reads its names
  with `unpdf` (pinned 1.9.1). A place that says KCL and is on the list,
  by the same name or one starting the other (at least 6 letters, one
  match only), is on "KCL's list": its Kosher row says KCL and its
  hechsher is dated, so it's off Not checked. Nothing is filed, since the
  list has no addresses. A name on the list never counts for a place that
  doesn't already say KCL. On dev: 207 names, all 4 KCL places matched.
  The Kosher box used to name every non-Keystone list "Mekor Habracha's
  list"; it now uses each list's own name, and "On neither list" became
  "Not on a kosher list".
  - Live: merged in PR 375 and deployed; the watch was added on live Nov 4
    with the user's yes (kind `website`, `https://www.kclkashrus.org/`,
    "KCL's list"). Its first read is the next nightly run.
  - Fixed Nov 4 (the user: "I don't see the KCL check in watches"): three
    copies of "is this a kosher list" named only Keystone-K and Mekor, so
    KCL's watch went under Other on Watches, ran with the plain websites
    and was counted as one. Now one test (`kosherListWatch.ts`) for all
    three; the Watches row reads "Keystone-K, Mekor Habracha and KCL".
  - Not done: Add's "Read now" lookup (`kosherLookup`) still only checks
    Keystone-K and Mekor.

Built Nov 4, from the user's picks:
- **22:** the site's name and logo are on Site → Header and menus, in a
  "Name and logo" box first. Settings is Team (and Communities for the
  site owner); the old Settings → Community address goes to Header and
  menus (10298b7a).
- **23:** the Eruv category has Delete. Its confirm says how many eruvim
  and website watches go with it, and deleting removes all of them. The
  Eruv stays on the list, hidden, to start again. This reverses the Nov 3
  Hidden only rule (e2de0cf9).
- **18/19:** Look again is one list, like To do and Places: a name search,
  a Kind menu with counts, and Still trying / Stopped trying. Each row
  names its kind while all kinds show. Watches is unchanged (4e65f1fd).
- **To do's Sort starts on Newest first unlit:** Newest first is now the
  menu's first choice, so the start isn't shown as narrowed (blue).
- **25-28, reordering:** built as drawn (KdHT8Tci1ufXSXobnnSfEm v4). All
  four lists (Cards under the search, Groups on the Browse page, Top of
  the page, Tabs on a phone) are one kind of row (`DragList.tsx`): a
  handle to drag, press and hold on a phone, arrow keys on the handle, and
  a tap opens the row. The arrows are gone. Groups and Top of the page are
  rows that open, with their cards or links as inner rows with an ×.
  Every "Remove" and "Delete" here is "Take it off".
  - Not in the drawing: a dropdown's links also open (Name, Opens), so
    they can still be renamed. Groups keep the "In More, at the end" line.
  - Only checked in Chrome, including a simulated touch. Not tried on a
    real phone yet.

- **Top of the page: tabs, links and headings:** built as drawn
  (KdHT8Tci1ufXSXobnnSfEm v15). Links and dropdowns are one thing, a tab
  (`navTabs.ts`): one link in it shows as a link, two as a dropdown.
  - What goes in first decides: "+ Add a tab" adds an empty "New tab", its
    name selected, with "+ Add a link" and "+ Add a heading". With links in
    it, only links; with headings, only headings, and links go inside
    each. Nothing goes deeper (the save route refuses it). An empty tab or
    heading says "Nothing in it yet" in its row and isn't on the site.
  - An open row edits its name in place, a trash can beside its chevron.
    The same row now on Tabs on a phone and Cards under the search (the
    user, Nov 4): no Name box, no Take it off button.
  - The groups are Categories' headings, and the "Groups on the Browse
    page" box is gone from the Home page (`HomeSectionManager` deleted).
    The leftover group is "Other" (was "More"), the last row, with no
    handle or trash; new categories land there.
  - Taking off a card or a Categories heading still asks once ("Its links
    move to Other"); a tab, heading or link goes at once.
  - The user's notes, Nov 4, same day: an open row drops its line (what it
    summed up shows under it); its name reads as text until tapped, then
    edits in a box; a tap anywhere else in the row closes it; the trash
    can is boxed, beside the name. Links don't open (as drawn): a name and
    an ×, named as the site calls it ("You", not "You (saved places and
    searches)"), with "Opens …" only for an older link named otherwise.
  - Later notes, Nov 4: typing a name, a press elsewhere only finishes the
    typing (no row opens or closes on that press); the trash can sits at
    the bottom of an open row, right after its Adds (not off at the far
    end), on all three lists; phone tabs don't ask where they go once
    added (take it off and add another) and have no count by their title;
    Stay in the Loop no longer lists or counts its subscribers (the user:
    "Don't say how many people signed up"). That list was the admin's only
    way to see or remove one (`SubscriberManager` deleted with its tests
    and its e2e spec); `/api/admin/subscribers` stays, unused for now.
  - A phone tab opens like a tab on a computer (the user: "Why would this
    work differently than the You tab"): its link inside, a name and an ×.
    The × empties it ("Nothing in it yet"), then "+ Add a link" sits by the
    trash can. An empty phone tab saves and isn't on the bar; a bar where
    no tab opens anything is refused.
  - Only checked in Chrome (computer and phone width). Not on a real phone.

  - The Categories card is named "Categories" in the admin (was
    "Categories and Search"; it has had no search of its own for a while).

Still open:
- **Home card rows: built, not live (artifact 8HpeQANzsQyGbyHVPsXrc5).**
  Every card is a real card, Suggest a Listing included. Cards in one box
  share a row on the computer home, up to three; Categories is always
  alone. Each card is a handle, its name and an ×; nothing opens, and the
  width and word fields are gone (the site still reads the saved words).
  Dragged up and down; the arrow keys step through the same places.
  - 093 is on the test project (dev), and the suites pass against it. Its
    first version wrote Suggest a Listing's `card_ids` as `'{}'` (jsonb's
    empty object), which broke every page build; the file now writes `'[]'`
    and a rerun repairs it, and the store reads a non-array as no cards.
  - 093 (the corrected file) is on prod too: checked Nov 4, `shares_row`
    is there and Suggest a Listing's `card_ids` is `[]`. Nothing to run
    before this deploys.
  - Taking a card out of a box and letting it go anywhere between two boxes
    gives it a row of its own (the user found that spot hard to hit): the
    drop lines are measured from where the rows sat when the drag began,
    and the gap between boxes is 12px.
- **20, asking visitors about something seen today: built (Nov 4).** The
  rule: a visitor is never asked about what a person or a watch checked in
  the last week, so questions go to what nothing else checks. A listing's
  Quick question counted only a visitor's "still here", not the nightly menu
  read, so a dish read that morning was asked about over "Last seen today."
  (`pickItemToAsk`). The list's "Been there lately?" asks about no place an
  outside source dated (`confirmedFrom`) either; box and item dates already
  counted.

## Done Nov 2: To do is one row per place, each place as drawn (on `redesign/oct18-fixes`)

The rest of the "one tap per place" boards (canvas RHnm5WvGCsVa86Dam8rtmL,
v26). Each place is one row: its name, the oldest waiting thing's date, and a
grey line of what's waiting ("Usual weekday times · Website didn't load"). A
new place, a new category and each piece of feedback get a row of their own.
Above the list are a search ("Find a place by name"), Show (pick any of
Changes, New places, Broken checks, Feedback; that choice also decides which
thing a place opens on) and Sort (Oldest first, Newest first, Name).

A tap opens the place. Switches across the top name everything waiting
there, and each answered one is ticked. Answering moves to the next thing.
When a place is done, a phone goes back to the list and a computer opens
the next place. On a computer the list stays beside the open place, and the
up/down arrows step through places. The "N of M" counter and the nav's
number both count places (`todoPlaceCount`). An open edit survives
switching between things. Leaving the place with one unanswered asks
first. With nothing left, To do says "Nothing to do / Every place was read
this morning".

Feedback opens with everything they wrote. **Done** marks it handled
(`status: 'handled'` through `PATCH /api/admin/responses/[id]`). **Reply**
opens an email to them, and shows only when they left an email. Checked on
dev: Done took the row off To do and the nav went from 64 to 63; the row
was then put back.

**The place screens are rebuilt as drawn (Nov 2).** Each was put beside its
board, on a phone and a computer:
- The menus read "All" and "Oldest first", and the filter has a tick box
  and a count per option (K1Sort, H2Open).
- Every row is dated (N1List, P1Every; the line stays grey, brown is only on
  a place's source card). A broken check by when it started failing
  (`troubleSince` in `todoWaiting.ts`), Google not found by when Google last
  looked, a job's reading by the day its line ended with.
- The frame (`PlaceFrame.tsx`, M2First, N6Desk): "Category · See the
  listing" and "N of M" under the name; the source as a folded card; the
  buttons pinned at the bottom.
- Broken checks fixed in place (`TodoBroken.tsx`; R3Site, R2Menu,
  R6Menu/R6Give/R6After, R2Google, G2Stopped): the field in its editor, the
  failure in the folded source ("didn't load since Oct 22"), and Read it
  again / Stop reading it, Give its menu / No menu online, Find it on Google
  / Not on Google. Not a link to the place.
- Changes in the listing's own editor (`TodoChange.tsx`; M2First, R1Women,
  R5Link, E1Times, E2Dishes): yellow, "Changed" or "New" pills and "Was
  6:45 AM"; buttons that name the change and follow an edit ("Change to
  6:40 AM / Keep 6:45 AM"); who sent it in the folded source.
- A new place as the whole listing editor, its fields filled in and
  "Not on the listing yet" beside the empty ones (`TodoNewPlace.tsx`,
  L3NewPlace). Add to the guide sends it as sent, or with the admin's fixes
  over it (its Google match kept); Leave it rejects it.
- A job's reading decided on the place (`TodoReading.tsx`; L4Eruv, R4Back,
  E2Dishes): a closure, Google's change, a menu's new dishes, an archived
  place coming back. Each changed thing its own yellow card with "Was …";
  a menu only its new and going dishes, "Add the 2 dishes / Don't add
  them". Its answers are the place screen's own (`waitingAnswers.ts`).
- Feedback (L5Feedback): the first line large and quoted, "name · email ·
  time" under it, Done pinned, Reply beside it when they left an email.
- Places no longer has "Check broken" in Checked by; an old
  `?checked=broken` link shows every place.
- A change's or a new place's unsaved edit asks before you leave.

Not as drawn, on purpose or not yet:
- L3NewPlace's red "Not on Keystone-K's page" row note isn't built.
- R4Back's editable Kosher select and "2 disagree" pill: a reading's
  changes are shown as lines, not editable fields. E2Dishes' "Add a dish"
  box isn't on a menu reading either.
- L5Feedback's grey line starts with the form's name; the header already
  says it, so the line starts with the person's name ("No name given").
- E1Times: the visitor's 6:40 is in the folded source, not beside the time.
- Field labels are the general editor's, not the boards' shorter ones.
- No "Leave it, and why". No chevrons on R2Google's rows. Cancel shows on a
  computer only.

Fixed after the user's Nov 2 notes (same branch):
- Opening a place keeps your spot: on a computer the list moves into its
  column with the row you clicked where it was on screen, and closing it
  (To do in the sidebar, Back, the screen's own back) brings the list back
  with that row where you left it; a phone returns to where you'd scrolled.
  It used to jump the page to the top. `todo-scroll.spec.ts`.
- Read it again's new reading opens next (Rita's menu): what an answer
  brings opens before the next thing in line (`shownThing`).
- Google stopped answering: "Use its website instead" when the listing has
  a website (it reads the site at once, which then keeps Google's fields),
  else "Stop using Google".
- "Not used" in a reading's original is rose, not the amber of a change.
- The menus' text starts 12px in, near the search box and rows (was 8px).
- Giving a menu link answers at once (0.7s on dev, was the whole read): the
  link is saved, the place's reading says "reading", and the menu is read
  after the reply (`after()` in the main-dishes route, `background: true`
  from Change / Give its menu page). Meanwhile To do shows no "can't be
  read" for it, the Dishes box says "reading it now", and To do and Places
  ask for the food places again every 6s until the reading lands (about
  40s for Chalavita on dev). Kept as a failed reading with a note, as "No
  menu" is, so no migration; a read that never finishes says so after two
  minutes. Add a place and Start reading still wait for the read. Not
  checked on a phone or on a Vercel preview, where `after()` runs inside
  the route's 60s.

- An X beside the open place's up and down (computer), and Esc, close it:
  the list goes back to full width with your row where it was. Esc typed
  into a box, or with a menu or dialog open, stays theirs.
  `todo-scroll.spec.ts`.
- Google's card shows "Short Description" only when Google gave the place
  one (most small places have none, so it read "Not on the listing").
- The line between To do's list and the open place drags (computer), so
  you set how much room To do takes; the browser keeps it. The list stays
  at least 300px and the place at least 480px; double-click the line, or
  Enter on it, for the usual 380px; arrow keys move it. `useTodoSplit.ts`,
  `todo-scroll.spec.ts`.
- To do has a Category menu, as Places does, between Show and Sort. It
  lists only the categories something waits in, with counts (dev: Food 43,
  Synagogues 10, Mikvah 2, Grocery 1, the cache test's 1, adding to 57).
  A job's finding takes its place's category; feedback and a new category
  have none and show only under All categories. The up and down arrows
  stay inside the category. `todoPlaces.ts`, `TodoList.tsx`.
- A row whose only line is a job's reading with no day in it ("Its menu
  has a change", "Google has a change") is dated by when it was read, so it
  sorts with the rest instead of sinking to the foot of To do (Rita's South
  St on dev: Nov 3, was undated at 54 of 57). Each waiting group carries the
  time beside its "Oct 17" (`waitingGroups.ts`).

## Done Nov 3: Look again (PR 373, live; 092 on dev and live)

Drawn Oct 27 (canvas XSuFCMdLQmBYNJqfWaEM3A). A nightly job, 4 AM, that
tries again what the other jobs couldn't find: an eruv with a website but
no status page or email (Elkins Park on dev), a menu reading that failed (11
on dev; "no menu online" is an answer, not tried), a place Google has no
match for. Each is tried a month after its last try, at most five a night,
never-tried first. A kind whose own job is turned off isn't tried.

- **Its page** (Watches → Look again): a group per kind, each row its
  name, why in a few words and when ("Oct 22 · next Nov 21"); a row opens
  with its last try in full, Read it now and Stop trying, and Open its
  listing. Stopped trying sits at the foot. Groups (WhatsApp,
  young-professional) are left out of Google, and it says how many.
- **What it finds waits on To do, never set on its own**: an eruv's page
  as "Status page found" (Use this page / Not this page), a place as
  "Found on Google" (Use this place / Not this place), which replaces that
  place's "Google not found". A page or place turned down is never offered
  again. A menu read again is a reading like any other, in To do as usual.
- Watches tab: a Look again row; a failed or late run goes under Needs
  fixing.

Checked on dev with real rows (092 run there Nov 3): the page against the
Main and Phone boards, a find in To do against the Found board. Read it now
found Leyv Ha-Ir on Google; Use this place matched it (phone and website
filled) and it left To do and Look again. Elkins Park and The Kosher Grill
found nothing. Fixed on the way: a found row said "Not found on Google";
"Left out: 10 groups" now opens to name them; the phone has no subline and
an opened row drops its repeated line, as drawn. Left as is: the subline
sits under the title on a computer, not beside it.

## Done Nov 3: To do is what to act on, Places is how things stand (on `redesign/oct18-fixes`)

The user's idea from Nov 2, agreed Nov 3. To do already filtered by what to
act on (Changes, New places, Broken checks, Feedback), and Places lost
"Check broken" on Nov 2. What was left:

- Places' "Not watched" is now **Not checked** (the Checked by menu, each
  row's line, and the Watches page's box). Old `?checked=not-watched`
  links still work.
- Each field says why it isn't checked, when it was stopped or can't be:
  "Not checked: menu (no menu online)", "phone (not on Google)", "minyan
  times (stopped reading)", "hospital contacts (not on Refuah)", "(its job
  is off)". A field nothing was ever set up for says nothing more.
- **No menu online now counts.** It left To do and was on no Places filter
  (Ben & Jerry's, Nov 2). On dev: Miss Rachel's Pantry, Savvati Gourmet,
  Stephen's Cafe, The Brazilian BBQ. `fieldCoverage.ts`.

A place still waiting in To do as "Google not found" (Chalavita, The Kosher
Grill on dev) shows under Not checked with no reason; it isn't settled yet.
Not built: a listing in Places saying "a check is broken" with a link to To
do (the idea allowed it, didn't need it).

## Done Nov 3: a list's new place fills from Google (on `redesign/oct18-fixes`)

The user's "for later" from Nov 2, approved. Keystone-K's and Mekor
Habracha's watches already asked Google whether a new place is open, then
dropped Google's answer of which place it is. Now they keep its place id
when Google's name for it is the list's (`namesOverlap`, the same rule as
everywhere else; a "Wawa" for "Sababa Falafel" is not kept). Approving
the new place then fills its phone, hours and website from Google at once,
as an admin's own add does.

The new places already waiting (about 20 on dev, from Oct 17-22) were
filed without one. Approving one of those looks Google up as it's approved
(`withListsPlaceId` in `submissionStore.ts`), by the same rule, so no
rows needed rewriting. A visitor's add is never looked up: it carries the
place they picked.

## Done Nov 2: a change is answered a part at a time (on `redesign/oct18-fixes`)

From the "one tap per place" boards (canvas RHnm5WvGCsVa86Dam8rtmL). A
change with more than one part shows switches at the top, one per part:
for a shul, its usual weekday times and its usual Shabbos times each; else
a field each. Update puts only that part on the listing (an approved copy
of the change carries it, `decidePart` in `submissionStore.ts`), Leave it
takes it out of the change, and the next part opens. The last part left is
the change decided whole, with its email as before; no email goes for a
part, and none for a rejection after a part went on. Checked on dev on
B'nai Abraham Chabad: Shabbos updated alone, phone left, weekday updated
last.

## Done Nov 2: our own browser failing isn't a place's broken check (on `redesign/oct18-fixes`)

Dev's runner has no browser for drawing pages, so two places showed "Main
dishes didn't load" when their sites were fine. A browser that won't start
is now said as ours (`no_browser`), and the nightly menu run leaves that
menu unread, as it does one it had no time to draw, rather than failing the
place. Failures recorded before this are not counted as "didn't load"
either. The dev runner still has no browser; that's its own fix, later.

## Done Nov 2: a trackpad swipe back goes back one screen (on `redesign/oct18-fixes`)

Found by the user: "we go into new screens and then I use the trackpad to go
back and it goes back two screens". The screens opened inside a page (an
editor's open row, a minyan inside it, a change's Edit, an eruv's row, a
place's "found on their website") were state only, so the browser's Back
skipped them and left the page. Each is now an entry in the history
(`useHistoryDepth.ts`): a swipe closes it, the screen's own Back takes the
entry off with it, and leaving Places by its Back steps over any left open.
Checked on dev: Places → a place → Main dishes, two swipes back to Places;
To do → a change → Edit, two swipes back to To do.

## Done Nov 2: approving a second edit no longer undoes the first (on `redesign/oct18-fixes`)

Found by the user. An edit carries the whole listing as its sender saw it,
and approving it wrote all of it. So when two people edited one place (one
the phone, one the hours) and both were approved, the second put the old
phone back, with nothing to show it had. Now an edit records, when it's
filed, which fields it changes against the listing as it is then
(`editedFields.ts`), and approving it puts only those on the listing as it
is now. The queue reads pending edits the same way, so the second edit
shows only the hours, not the phone going back. The website reader's times
and hours, read a part at a time, already worked like this.

Left as they were: an edit filed before this has no record of its fields
and is still approved whole. And someone who opens a listing, then sends
an edit after another was approved in between, still has the in-between
change counted as theirs. The window is minutes, not days. Closing it would
mean the editor sending what it loaded, too.

## Done Oct 29: deleting a community clears all of it, and works on the live site (on `redesign/oct18-fixes`)

Deleting a community (Settings gear → Communities, superadmins only) swept
the 9 tables it had when the delete was written, and none of the 12 added
since. A deleted community's watches kept being checked every night, its
subscribers' emails stayed, and a new community given the same short name
would have inherited its counts, searches, eruvin and newsletter key. Now
every table with a `community_id` is cleared (`COMMUNITY_SCOPED_TABLES`, 21),
a table whose migration hasn't run is skipped, and
`communityScopedTables.test.ts` reads the migrations and fails if a new
table is missed.

The user asked for delete on the live site too: it was refused there
outright. Now it works there, still superadmin only, still retyping the
short name, still never the default community or the last one. Uploaded
photos in storage are still left behind.

## Done Oct 28, evening: the queue's address fills the rest from Google (on `redesign/oct18-fixes`)

The user: picking an address while fixing a suggestion in the moderation
queue didn't fill the other rows "like it normally does". It never had: the
queue's form (SubmissionReview, Oct 5) had its own address box, wired for the
address and map point only. Now a picked place fills the name, phone, hours
and website, and a description where there's none, as Add and Edit listing
do (`placeSeed`); each row it fills opens (PR 367).

Then, the same evening: FINE WINE & GOOD SPIRITS, approved that way, went
live with no Google place, since the queue sent only the values. Its
submitter had picked the street address, so approval kept that place only
for Directions (verifiedPlaceId), Google owned no rows, and the nightly sync
skips it. Now the queue's pick sends its place too, with what Google filled
and its status, and approval takes them (reviewEdits.ts: only with the fill
record, so a bare place id still isn't a pick). The listing is linked,
Google owns the rows it filled, and the sync right after approval runs.

## Done Oct 28, later: every dish a read found gets its date (on `redesign/oct18-fixes`)

The user, Oct 28: HipCityVeg, Dottie's Donuts, Center City Pretzel and Playa
Bowls weren't "seen today" a day after Sweet Box's fix.

- **A read with a question still dates what it agrees on.** Every listed
  dish a read finds is dated from it, whatever else waits; one it finds
  missing isn't. Before, a single doubtful dish (Dottie's "Donuts",
  HipCity's "Philly Cheesesteak") held back every date, and skipping it
  dated nothing.
- **An unchanged menu dates what its last reading found**, not only dishes
  dated before. A dish people added, once found, is never looked for
  again, so it never got a date (Dottie's flavours).
- **Branches sharing a menu link share its dates.** One watch per link
  dated only its own listing: Playa Bowls' Penn branch, three Rita's, a
  Dottie's, a PLNT Burger and a LUHV. Each by its own names for the dishes.
- **Not read last night is Not checked**, on the Food page, saying why
  ("Not read last night · ran out of reads"), not Up to date, and not
  "didn't load" after two nights. What's tracked says "ran out of reads"
  for a run that had time but no reads left; "ran out of time" only when
  it ran out of time.
- **Why four menus missed two nights** (A La Karte, Espresso, Mike's,
  Gelbstein's): menus get about 11 AI reads a night (8 their own, 3
  shared), oldest waiting first. Oct 28's first five (Goldie, Nanas, Sweet
  Trading, Dottie's, Nothing Bundt Cakes) had waited longer and used them
  all. Mike's also needs the one browser draw a night. Nothing Bundt Cakes'
  page changes every night, so it takes a read every night.
- Open: a menu read from the kind page (Read it now) doesn't move its
  watch's fingerprint, so the nightly run reads it again as changed (the
  four above, read on Oct 28).
- Done (Oct 28, with the user's yes): Dottie's /shop listing (f52e1951)
  had a pictures-only reading ("Donuts"), so its flavours were never
  looked for. Its menu link is now https://www.dotties.com/, as its other
  three, which makes it a branch of that watch.
- Open: Center City Pretzel's first menu read timed out ("took too long to
  read"), so it has no reading and no watch.

## Done Oct 28: times and dishes in boxes again; a dish by another name isn't new (on `redesign/oct18-fixes`)

The user, Oct 28: "the way we displayed minyan times before we changed was
normal and good", "Why are we displaying some things side to side … weren't
dishes top down before", "didn't the reader used to say the words it got
their suggestion from?"

- **Waiting on a kind's page, a shul's times and a menu's dishes are the
  listing's box again**, as the job pages drew them before Oct 26: a row
  each, top down, the time on the right, what changes highlighted, the old
  time struck under the new one. What comes off is crossed out ("Taken off"
  is gone). Usual times show every minyan ("Unchanged: 6 minyanim" is
  gone). A week is by day, "New" beside one the listing hasn't got.
- **Each dish has the menu's words under it**, and "these words don't
  name it" when they don't. Every other field still reads as label and
  value.
- **A dish the listing has by another name isn't new**: spelled another way
  ("Philly Cheesesteak" is HipCity's "Philly Cheese Steak") or a kind of
  one it has (Goldie's "Hummus" beside its Hummus Platter, Dottie's "Donuts"
  beside its flavours). Checked on reading (`tidyMenuReading`), on filing
  (`newDishes`) and on showing (`dishProposal`), so Goldie's, Dottie's and
  HipCity's waiting readings change nothing now. The reader is also told
  so. More than a listed one is still new ("Pizza Bagels" beside "Pizza").
- **A new dish whose words don't name it is dropped**, not offered flagged
  (the user, Oct 28: "drop a dish whose quote doesn't name it"). Dottie's
  "Donuts" from "chocolate, vanilla, vanilla sprinkles" is one. A listed
  dish found that way is still kept, marked "these words don't name it".
- Open: Gelbstein's "couldn't read" isn't explained. Its last stored read is
  fine (all five dishes found). Note: its store is the Lakewood, NJ bakery.

## Done Oct 28: this week's schedule compares this week (on `redesign/oct18-fixes`)

The user, Oct 28: "Never fill this week's schedule with usual times …
This week compares this week. Usual compares usual." Lower Merion's
Wednesday read put the usual "10 min before sunset" on Tuesday and took
off its 9 PM Late Ma'ariv. Mikveh Israel's "Shabbat Vayera" came back as
a new week, holding the two times its calendar's week already had.

- **A week read off a shul's website or newsletter holds only what it
  gives.** A usual minyan it doesn't mention isn't put in it (that was
  added Oct 21 with the Mikveh Israel dated-times fix, not asked for). A
  day it gives nothing for shows the usual times, as usual times, not as
  this week's. What that costs: a page that gives Shabbos morning and not
  Shabbos Mincha shows only the morning that day.
- **It's compared with the listing's copy of that week, day by day**
  (`mergeReadWeek`, `scheduleUpdate.ts`), never with the usual times. A
  day before today is left as the listing has it: Lower Merion's page
  shows only the days ahead, so its words change every night and it's
  read every night. A day the read doesn't give keeps what the listing's
  week has, unless the calendar is the shul's whole week.
- **Nothing ahead changed, nothing filed.** A time the listing's week
  has that day, the same time under another name ("other" for
  Mincha/Maariv) or without a note the read left out ("Late"), is the
  listing's.
- **One week per week.** A week from the same place over the same days
  is that week, whatever the page calls it, so "Shabbat Vayera" goes into
  "Times for Oct 25 – Oct 31".
- **The admin's note compares with the listing's week too**: "Times for
  Oct 25 – Oct 31: mincha maariv · Wed Oct 28 · 6:00 PM, was 5:50 PM", not
  "usually 10 min before sunset".
- A person's paste or "+ Add" week is posted as they left it: they see
  every row it keeps, and can take one off.
- Live after the next deploy. Lower Merion's and Mikveh Israel's pending
  findings were read the old way: Reject them.

## Done Oct 27, at the end: the AI is off the live search (on `redesign/oct18-fixes`)

The user, after "trader joes" on Synagogues found nothing, then the AI's
reading ("near Trader Joe's") showed every shul: "feels weird to search,
get an answer, then see reading question, then get a different answer."
On the live site the reader had read 41 questions, 23 into nothing, about
15 of them half-typed words (it read after a one-second pause).

- **The home, category pages and the map never wait for the AI or use its
  reading.** No "Reading your question…", no "Read as" on the map.
- **A search that finds nothing is read in the background** on Enter, or
  once the typing stops for 2.5 seconds (`useLearnAfterPause`; the user:
  "I don't think most people click enter"), for the admin's Read questions
  tab. Words that find something aren't read; a shared link isn't read.
- **Read questions** has no Approve any more (a reading never answers),
  one list, and Teach, which is how the search learns.
- **Nothing found says so as it's typed, on the home and the map**, with
  the WhatsApp button, as a category page does. Not only on Enter (the
  user: "I don't think most people click enter"). The map shows it under
  the box while typing and in the list once searched, instead of "Turn on
  a category above". "Nothing" means nothing anywhere in the guide, places
  the map can't plot included.
- **The "+ Add" box on a phone** (the user, Oct 27): it opens tall enough
  to show "Fill it in yourself" (it sat under the screen's edge at half
  height), never shorter than half, and slides and fades away when closed,
  as a listing does, instead of vanishing with its dimmed backdrop in one
  frame (`MobileSheet`'s `fit`; the box stays mounted once opened).
- **Next, agreed in principle, not built:** typo matching for names
  ("Beth sholom", "bros medresh"), most of what was asked.

## Done Oct 27, last: a week waiting for you is shown whole (on `redesign/oct18-fixes`)

- **A week the listing hasn't got is shown whole, all of it new**, by day,
  under "New week · N minyanim". It is not compared with the usual times
  any more (the user: "This is a different schedule").
- **A week the listing has is shown whole too**, by day, with only what
  changes highlighted: "Was 6:45 AM", "New", "Taken off".
- **A note read off a website ends at a whole sentence**, not cut at 120
  letters ("…Shabbat Mincha at SOI. For"). Applies from the next read.
- **Three listings the user checked on live:**
  - Rodeph Shalom's whole week read "Oct 29", its one weekday minyan.
    This week's box is dated Sunday to Friday ("Oct 25–30") whenever a
    week the shul posted gives its weekdays, whatever days have a minyan.
  - BZBI's pasted week runs Oct 23–29, so it has no Friday. The user: a
    day the week doesn't have gets no minyan, never the usual times put
    in. (Built that way first, then taken back the same day.)
  - Shtiebel's week, approved from its website, didn't say who gave it. It
    says "confirmed by" the shul now.
- **No candle lighting on shul listings** (the user, Oct 27): it's the
  city's time, not the shul's, and the home page has it. This Shabbos no
  longer starts with it, and a Friday with nothing else on it (Kol
  Tzedek's) is gone. A minyan "at candle lighting" still shows its time.
- **Every filter choice counts** (the user, Oct 27): the Filters button
  counts each choice ticked, so Meat and Dairy are two, like Challah and
  Wine under Has, and Mincha and Maariv are two. The map already did.
- **Waiting on the user:** whether a shul whose newsletter is watched
  shows "Not on the guide yet" until this week's comes. Society Hill's
  hasn't come yet. Its site gives only the usual times, which agree.

## Done Oct 27, later: Waiting for you says what it changes (on `redesign/oct18-fixes`)

- **Two mikvahs no longer wait with nothing to decide.** Ohel Leah's and
  Lower Merion Community Mikvah's pages were read again only to compare
  (Oct 27), and each gave part of the notes the listing has whole. Such a
  read never files anything, so it now counts as dealt with.
- **The menu read can't hang the whole run.** On Oct 27 Center City Pretzel
  Co.'s menu never came back, the run was stopped at its five minutes, and
  the 16 places after it waited. Now each read gets 90 seconds (less when
  the run is nearly out of time). A read that takes longer is kept as not
  read, saying "Its menu took too long to read", and the run moves on. 17
  menus were unread on live that morning; they go through on the next runs.
- **The Links job says when.** Until its first run it shows its first check
  ("Nov 1, 4:00 AM · first check Sunday"), and it says "every Sunday
  morning". Each job's schedule now matches vercel.json, which a test checks.
- **Shul times name their part** in each group: "Usual weekday times",
  "This week's schedule, Oct 25 – Oct 31".
- **A week is compared with the listing's own copy of it:** each minyan
  new, changed or taken off, then "Unchanged: N minyanim". A week the
  listing hasn't got reads "New week, 24 minyanim", then only the ones that
  differ from usual ("Usually 15 min before sunset"). Usual times also say
  how many stay the same.
- **A part's finding is only its part.** Lower Merion's week came with the
  hours the listing had when it was read, so it showed as one big line.
  Now it shows the times alone. Approving it keeps every other detail the
  listing has now, including any added since the read.
- **This week's minyanim keep their usual sign-up group and join link.**
  Mikveh Israel's week, read off its calendar, lost their WhatsApp groups.
  Its waiting week fills in on its next read.
- **A menu's new dishes come with what's already listed** ("Already
  listed: Shawarma, Laffa", or "None").

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
  deeper apricot edge (`#f59e5a`), 1px on the phone and 1.5px on desktop**,
  on every screen that has it: the site's own and each category page's.
  Drawn as boards N (phone) and O (desktop) on the canvas
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

(Superseded Nov 9: the Eruv page no longer lists eruvim; see "Done Nov 9:
the Eruv page is a category page".)

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
  website's times off its days. Changed Nov 11: the newer one wins a day
  (see "A website that changed after the newsletter corrects it").
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
