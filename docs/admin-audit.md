# Admin console audit (Oct 28)

Every field and control in the admin console, traced to where the public site
uses it. Read-only: nothing was changed. This is the starting point for the
admin redesign (see `docs/where-things-stand.md`, "Planned: the admin
redesign"). Line numbers are as of commit `08e7ee81`.

**Verdicts used below**

- **Dead:** an admin can edit it, but the site shows it nowhere.
- **Hidden in practice:** it reaches the site, but somewhere almost no one
  sees it.
- **Mislabelled:** it works, but its label or help text says it does
  something else.
- **Parked:** shown only while a switch in `src/lib/features.ts` is on
  (Today home, What changed). Not dead; held back.

## The short version

- **About 20 settings do nothing on the site.** Most are left over from home
  page and category page designs that were replaced. Production still holds
  values for all of them (for example "Explore the Map" and "Upcoming
  Davening"), so they look real in the admin.
- **About 25 more are mislabelled.** Most of their help text describes old
  layouts: a "collapsed card", a "footer blurb", a home card with a photo.
- **Seven clear bugs**, listed below; six were fixed the same day, and
  one turned out to be deliberate.
- **The same work is split across screens.** Both search tabs list searches
  that found nothing. The queue and Watches decide the same suggestions in
  different words. Listings get archived in two places. Each eruv has
  settings in two places. Admins are listed in two rosters.
- **For a new community, a category's behaviour depends on its URL slug, not
  its settings.** Shul times, menus, hospital data, icons and some search
  words only work for categories named `synagogue`, `restaurant`,
  `hospital` and so on. Nothing in the admin says so.
- **Text written for developers is shown to admins:** "needs database
  migration 086", `SUPERADMIN_EMAILS`, raw AI model ids. Every tab's header
  also says "Resource Moderation / Review and approve submitted resources",
  even on Team and Metrics.

## Clear bugs (fixed Oct 28, except 4)

| # | What happened | Where | Now |
|---|---|---|---|
| 1 | The hero photo couldn't be cleared. Saving with no photo fell back to City Hall from `community.config.ts`, for **every** community. | `siteSettingsStore.ts` | Fixed. A cleared photo stays cleared, and only the bootstrap community gets the photo from code before its first save. |
| 2 | Removing every top-nav item made the four defaults reappear on screen, then Save failed with "needs at least one item". | `SiteSettingsEditor.tsx` | Fixed. The list goes empty and the warning shows. |
| 3 | The dead Browse, Davening and Map heading fields were required, so blanking one blocked the whole Save. | `api/admin/site-settings/route.ts` | Fixed. They are no longer required. The fields themselves go in the redesign. |
| 4 | Removing both the Davening Times and Update Listings cards also removes "Suggest a Listing". | `Landing.tsx:787` | **Not a bug.** It's deliberate and tested (`b5dda46f`). The real problem is that the admin never shows the card, which is a redesign question. |
| 5 | `/<c>/admin/dishes` redirected to a page that no longer exists (404). | `next.config.ts` | Fixed. It goes to the Watches tab, and a test fails on any admin redirect to a missing page. |
| 6 | The opened review showed Approve on a new place with no address, and approving failed. | `SubmissionReview.tsx` | Fixed. Approve appears once an address is typed or picked. |
| 7 | The audit said one failed job blanked Watches. In fact only the two the rows are built from (categories, Google's places) do, and the tab says so. The real bug was the reverse: any other job failing left its findings out of the counts with nothing said. | `WatchKinds.tsx` | Fixed. The tab and each kind page say "Not loaded: Dishes · …". |

Smaller problems:

- The reject reason goes in the email but isn't saved, so History can't show
  why something was rejected.
- The Metrics "Pending" tile counts watch findings that the queue hides, so
  the two numbers disagree.
- `/philly/inbox` shows every community's support and volunteer responses.
- A required multi-select inside "only show when" isn't checked by the
  server.
- The queue's empty state uses an emoji.

## Look tabs (Site, Desktop, Mobile)

### Dead (removed Oct 29, the redesign's step 0)

| Admin field | Why |
|---|---|
| Site → Branding → Tagline | Its only place on the site, under the header name, was removed. |
| Desktop → Categories and Search card → Eyebrow, Heading | The site hard-codes "Explore by Category" (`Landing.tsx:672`). |
| Desktop → Davening Times card → Eyebrow, Heading | The site hard-codes "Upcoming" / "Davening Times" (`DaveningTimesCard.tsx:134`). |
| Desktop → Davening Times / Update Listings → Full or half width | Ignored: these two cards always share one row (`Landing.tsx:767-800`). |
| (no field) Map eyebrow and heading | Stored, loaded and required on save, but no field edits them and nothing shows them. |

### Hidden in practice

| Admin field | Where it actually shows |
|---|---|
| Mobile → Home screen heading | Screen readers only, on every device (`HeroHeading.tsx:268`). |
| Mobile → Subhead (the mission) | Link previews and search results only, on any device. Not on a phone screen, and not the footer, as the help says. |
| Site → Home page sections → titles and order | Desktop Categories menu and `/browse` only. The phone home has flat tiles sorted by listing count. |
| Site → Feedback → Button label | Desktop footer only. |
| Site → Logo | Each community's header. The favicon and home-screen icon always use Philly's. |

### Parked, or live but not editable

- **Home page style** and **On the Today home:** parked (Today home is off).
- **Before candles looks for:** its field is hidden with the Today home, but
  the phone home's "Right now" still uses it every Friday and Erev Yom Tov.
  Live, with nowhere to edit it.

### Mislabelled

- The Site and Mobile intros each name the wrong tab for the tagline and the
  mission.
- "Home page sections" says they are the phone home's card grid. They
  aren't, any more.
- The footnote says these settings set the home-screen app name. That comes
  from code (`layout.tsx:37`).
- The Feedback section says it shows "in the footer". The footer is desktop
  only.
- The mobile tabs help says each tab uses its emoji. Built-in categories use
  the line glyphs; forms get "•".
- "Categories and Search" is called "the always-first search box". The card
  has no search box and can be moved.
- The campaign banner on desktop always shows a sukkah photo, whatever the
  campaign. The admin doesn't say so.

### Working

Top nav bar, hero headline, subhead and photo alt, the Update Listings,
Email Signup and Jewish Times cards' headings, card order, mobile tabs,
feedback on/off and its heading and thanks message, search placeholder,
site name, campaigns, and the About and Privacy pages.

## Categories

### Dead (removed Oct 29, except category order, which has no field)

| Admin setting | Why |
|---|---|
| Card background → text colour (categories and forms) | Nothing public reads it. |
| Card background → photo (forms) | The photo home tile isn't on the site any more. Only the admin preview draws it. |
| Field → "Group with Address / Name / Phone at the top of the form" | That form layout was deleted. |
| Category order (`sort_order`, no field) | Categories are always alphabetical. |
| Read questions → approve | The API still takes it, but approval does nothing on the site. The nav still calls the tab "approvable as rules". |

### Works partly, or mislabelled

| Setting | What it actually does |
|---|---|
| Card background → photo | Shown only as the desktop banner when there's no banner image. The help says it replaces the home card's icon. |
| Description | Says "not shown to visitors". It's the text in link previews. |
| "Map button" | There's no Map button. It controls the desktop map beside the list, and whether the category is on the site map. It can't be turned off when there's no Map category. |
| Icon | Only editable when Map is on, and labelled as a map marker. It's also the home tile, header menu and banner icon. 15 built-in categories show a line glyph instead. |
| External link | Says "a button next to Map/Add". It's a "Not listed here?" line under the list. |
| Field → flag exceptions | Says "the badge shows amber". It's a note line now. |
| Field → also show on the collapsed card | Rows show only the first such field, as the third line, and only when there's no exception note. |
| Field → limit to one line | Also makes the field the opened listing's tagline. Not said. |
| Field → show the items on the row / count word | Lists item names, not a count. A count word ending in "dish" quietly switches on food behaviour. |
| Field → only show when this filter is on | The help says cards hide the other audiences' details. Nothing does that. |
| Field → only from Rosh Hashanah to Sukkos | Works only inside the Shabbos box. Anywhere else the field shows all year. |
| Field → required "when adding" | The server also requires it on every edit. |
| Field → Badge or Row | Badge always also means "is a filter". A badge that isn't a filter can't be made. |

Many per-field help texts still describe the old "collapsed card / expanded
panel" listing (`CategoryFieldEditor.tsx:257, 347, 352, 380, 465, 516, 534`).

### Used by the site, but no way to edit

These field settings are read by the site but have no control in the
editor: the filter label (used heavily), hide label, placeholder, show
inverted, and fixed vocabulary.

### Decided by name, not by a setting

A new community has to use exactly these slugs or names to get the behaviour:

- **Icons:** 15 slugs get the site's line glyph (`categoryIcons.tsx`).
- **Search words:** `synagogue`, `mikvah`, `grocery`, `restaurant`, `hotel`,
  `whatsapp`, plus `eruv` and `zmanim` by id (`cardSearch.ts`).
- **Watch jobs:** menus and kosher lists work only for `restaurant` and
  `grocery`; Refuah only for `hospital`.
- **Website:** a field must be labelled "website" for Google, link checks
  and menus to find it. Renaming it breaks them silently.
- **Food behaviour:** switched on by a count word ending in "dish".

### Why the editor feels janky

- One long page with eight or more sections and no sub-navigation.
- Settings sit in odd places: the description is under "What this category
  shows", and the icon appears only when Map is on.
- Half the sections exist only after the first save. Templates exist only
  before it.
- The Hours, Website and Photo checkboxes hide real fields, and Photo turns
  itself on.
- Rules nobody sees: a badge is always a filter, hours are always
  filterable.
- Three ways to save: the category's one Save with confirmation steps, a
  Save per eruv, and Draft / Publish for forms.
- Listing categories, built-in screens (Map, Zmanim, Eruv, Medical) and
  forms share one alphabetical list. Each opens a different editor.
- The preview's "home card" is a photo tile the site no longer draws.

## Everything else

### What each screen is, and how you reach it

| Screen | Reached from | State |
|---|---|---|
| Moderation queue | To do (the console's home) | Live |
| Watches, and a page per kind of place | To do | Live |
| Read questions | To do | Live, but its "approve" is dead |
| Responses | To do | Live. Support and volunteer responses go to `/philly/inbox`. |
| Archived | Listings | Live |
| Metrics | Insights | Live |
| History (approved, rejected) | **Only** the Metrics tiles | Live |
| Missed searches | Insights | Live |
| What changed | Insights | Parked |
| Team | Settings | Live. Can add people; can't remove them. |
| Communities | Settings (site owner) | Live, the same screen as `/admin` |
| `/admin` (site owner) | Typing the URL. No community console links to it. | Live |
| `/admin/pages` (About, Privacy) | **Only** the site owner's nav | Live |
| `/philly/inbox` | **Only** a link on Responses | Live, with its own sign-in and look |

API actions nothing calls: "off" for the hours and hospitals watches,
"stop" for dishes, and approve / unapprove for read questions.

### The same thing in two places

- **Searches that found nothing:** Missed searches (add a listing) and Read
  questions (teach a word) are fed by the same searches but kept in separate
  stores. Only Missed searches re-checks each search against today's search.
- **Deciding a suggestion:** the queue and a Watches place page act on the
  same rows. One says "Approve / Reject". The other says "Accept / Keep as
  is / Add as new / Don't add / Remove the listing / Keep it / Keep closed /
  Show as open".
- **History** mixes queue decisions and Watches decisions. Metrics calls
  them all "the moderation queue".
- **Archiving:** the Archived tab says listings arrive "via an approved
  report", but Watches archives too, and can bring a listing back.
- **Eruv settings:** status source and map are on both the Eruv category's
  Edit and the Watches page.
- **Admins:** Team can add people and set their emails. Communities can
  remove people, and shows the email settings read-only.

### Text a new admin shouldn't see

- **Migration numbers:**
  - `NightlyRuns.tsx:164` (086)
  - `MissedSearches.tsx:207` (058)
  - `ReadQuestions.tsx:171, 218` (062, 063)
  - The dishes, hospitals and hours watch APIs (065, 070)
- **Environment names:**
  - "falls back to the superadmin list (SUPERADMIN_EMAILS)"
    (`CommunityManager.tsx:967`)
  - "isn't available in production" (`CommunityManager.tsx:742`)
- **Raw AI model ids:** "Read by {model}" (`ReadQuestions.tsx:76`).
- **Raw path:** the link to `/philly/inbox` shows its path as the link text,
  in every community's console.

### Looks and behaves differently screen to screen

- **Four different looks:**
  - Queue and Archived use cards with small green and red buttons.
  - Watches uses its own boxes and chevron rows.
  - The two search tabs use collapsible sections.
  - Team is a plain email list.
- **Empty states and loading text** are worded differently on every tab.
- **Saving:** Team saves the moment you tick a box. Most other screens have
  a Save button.
- **No confirmation** before removing a listing from Watches, or before
  "Forget", "Unteach" and "Stop". Deleting forever and deleting a community
  do ask.

## What this means for the redesign

1. **Delete the dead settings before drawing anything**, so nothing is drawn
   around them. Add a unit test that fails on any setting nothing on the
   site reads, the way `cacheTags.test.ts` guards cache tags.
2. **Each setting sits beside the screen it changes**, labelled by what a
   visitor sees. Most of the mislabelling comes from settings being sorted
   by device and by old layout.
3. **One place for each job:** one list of searches that found nothing; one
   way to decide a suggestion, with one set of words; one roster of admins;
   one place for each eruv's settings.
4. **Make name-based behaviour visible.** Either the editor says "this is
   the Shuls kind" (a kind chosen when the category is made), or the
   hard-coded slugs become settings. Without this, a new community's
   categories quietly miss features.
5. **Write for the admin:** no migration numbers, no environment names, a
   real heading on every screen.
