# Desktop home page: match the mockup

Implementation brief. Written 2026-09-14 against branch `feat/desktop-hero-photo-band`.

**The mockup image is `docs/desktop-mockup.jpg`.** Open it before every phase and
compare against it. If that file is missing, stop and ask the user for it —
do not build from this text alone.

The goal is to make the **desktop** home page (`/philly` at ≥640px wide and
≥640px tall) look like the mockup. The user wants an exact match first; they
will ask for adjustments afterwards. Where this brief and the mockup disagree,
the **decisions** section below wins, then this brief, then the mockup.

---

## Read this first — rules that cause the most mistakes here

1. **Read `AGENTS.md` in full before starting.** It is binding. The parts that
   matter most for this work are repeated below, but not all of them.
2. **Desktop only. Mobile must not change.** Every visual change goes behind
   the `desktop:` variant (defined in `src/app/globals.css` — it is
   `min-width: 640px AND min-height: 640px`, *not* Tailwind's `sm:`). Do not use
   `isMobile` branches for layout — see the comment at the bottom of
   `HeroHeading.tsx` for why (it flashes the wrong layout on first paint). The
   only existing `isMobile` checks in `Landing.tsx` are for skipping data
   fetches; leave them as they are.
3. **No database writes, anywhere.** No migrations, no Supabase client writes,
   no admin-console saves against any project. Nothing in this brief needs one.
   In particular: **do not remove the Map card from the admin's card list** —
   the user will do that themselves later. Leave the map card's code intact.
4. **No new admin settings.** All new copy is hardcoded for now (user's
   decision). Do not add fields to `siteSettings.ts`, `siteSettingsStore.ts`,
   the admin API, or any admin editor.
5. **No real photos, no downloads.** Every new photo slot is a CSS placeholder
   (gradient + faint icon, `aria-hidden="true"`), the same pattern as the
   existing hero fallback in `HeroHeading.tsx`. Do not download stock images,
   add files to `public/`, or add remote image hosts to `next.config.ts`.
6. **Don't add an "Events" nav link.** The mockup shows one; the user said no.
7. **Don't touch `HeaderNav.tsx`'s structure** (Categories / Map / More stay).
8. **Never `git stash`.** To prove a test goes red, copy the file aside, break
   it, run the test, copy it back. (`AGENTS.md` explains the incident.)
9. **Don't start a second dev server.** One is usually already running on
   `http://localhost:3000`. Check with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/philly` first.
10. **Commit at the end of each phase** (the user wants finished work committed
    without being asked). **Do not push.** End each commit message with the
    attribution line your environment specifies.
11. **Every behaviour change gets a test in the same commit, and you confirm it
    fails against the old code first.** Pure restyling doesn't need a new test,
    but existing tests that assert old behaviour must be updated deliberately,
    not deleted to get green.
12. **Keep the surrounding comment style.** This codebase writes long "why"
    comments. When you change a component, update its doc comment so it no
    longer describes the old design. Stale comments here have misled later
    sessions.

---

## Decisions already made by the user (don't re-ask)

| Topic | Decision |
|---|---|
| Map card on home | Not shown. **Handled later by the user in the admin, not in code.** Leave code as is. |
| Stay in the Loop + Shabbat & Holiday Times | Keep, positioned under the new three-card row (already true once the map row is removed in admin — no code needed). |
| "Events" nav link | Don't add. |
| Category tiles | Show any 8 (the first 8 in the existing order). |
| "Browse all categories →" | Expands the tile area in place to show every category (toggle; same idea as today's "Show more"). |
| Edit / Report on home | Remove from the home page entirely. |
| "Learn More" | Links to `/about`. |
| Header | Transparent over the hero on the home page; solid white once the page is scrolled. |
| New copy | Hardcoded, not admin-editable. |
| Photos | Placeholders. |
| Serif font | Follow the mockup: headings in a serif (see Phase 1). Site name in the header is serif on every page. |
| Uncommitted hero diff | Commit it first (Phase 0). |

---

## Visual spec (measured from the 1448px-wide mockup)

Use these as targets; the mockup image is the final reference.

**Colours** (add as tokens in `globals.css` `@theme`, next to the existing
`--color-sage-*` tokens):
- Page background (cream): `#f7f5ef`
- Heading ink (deep navy): `#13243a`
- Brand teal (Browse Categories button, "Browse all categories" link hover): `#1f5b5a`, hover `#184a49`
- Eyebrow rust (GET STARTED, TODAY IN PHILLY, …): existing `text-amber-700` is close enough — keep it.
- Gold rule (short underline under the hero quote and the closing-strip line): `#c9a45c`
- Banner stays on the existing `sage` tokens.

**Type**
- Serif: **Source Serif 4** via `next/font/google`, weights 400/600/700, exposed
  as a CSS variable (`--font-source-serif`) and a Tailwind `font-serif` utility.
- Hero headline: serif, bold, ~64px (`text-[64px]`), `leading-[1.02]`, navy, tight tracking.
- Hero subhead: sans, 18px, slate-600.
- Card titles (What are you looking for?, Upcoming Davening, …) and the banner
  title: serif, semibold, ~24px (cards in the three-card row ~22px).
- Eyebrows: unchanged — sans, 11–12px, uppercase, `tracking-wide`, amber-700.
- Header site name: serif, ~24px, navy.

**Layout**
- Content column stays `max-w-6xl` (matches today).
- Vertical gap between the big blocks below the hero: ~20px (mockup is much
  tighter than today's `my-12`). Use `my-5` for home card rows on desktop only.
- Cards: white, `rounded-2xl`, 1px `border-slate-200/70`, very soft shadow (`shadow-[0_1px_2px_rgba(15,23,42,0.04)]`).

---

## Phase 0 — Commit the existing hero work

The working tree has uncommitted changes to `src/components/Landing.tsx` and
`src/components/home/HeroHeading.tsx` (full-bleed photo hero with search +
Browse Categories / View Map buttons).

1. `git diff` and read both changes so you understand the starting point.
2. `npx tsc --noEmit`, `npx eslint src/components/Landing.tsx src/components/home/HeroHeading.tsx`,
   `npx vitest run src/components/home/HeroHeading.test.tsx src/components/Landing.test.tsx`.
3. If something fails, fix only what's needed for these changes to pass. If a
   failure is unrelated or unclear, stop and report it.
4. Commit: "Put search and Browse/View Map buttons in a full-bleed desktop photo hero".

---

## Phase 1 — Font and colour tokens

**Files:** `src/app/layout.tsx`, `src/app/globals.css`

1. In `layout.tsx`, next to `const figtree = Figtree(...)`, add
   `Source_Serif_4({ subsets: ['latin'], weight: ['400','600','700'], variable: '--font-source-serif' })`
   and add its `.variable` class to `<html>` (or `<body>`, whichever already
   carries `figtree.className`). Figtree stays the default body font.
2. In `globals.css`'s `@theme` block, add `--font-serif: var(--font-source-serif), Georgia, serif;`
   (check how Tailwind v4 in this repo expects font tokens — look at how
   existing tokens are declared in that file and follow it exactly) and the
   colour tokens from the visual spec (`--color-brand-teal`, `--color-brand-teal-dark`,
   `--color-ink`, `--color-cream`, `--color-gold`).
3. Page background: `<body>` in `layout.tsx` uses `bg-surface`, which is
   `--color-surface: #f1f5f9` in `globals.css` and is shared by mobile. **Don't
   change that token.** Instead add `desktop:bg-cream` to the `<body>` class
   list so only desktop gets the cream ground. Check that the header's white
   and the cards still read as separate from the new ground.
4. Verify: `npm test` passes; load `/philly` desktop and mobile — mobile looks
   identical to before.
5. Commit.

---

## Phase 2 — Header: transparent over the hero, solid on scroll

**Files:** `src/lib/headerVisibility.tsx`, `src/components/SiteHeader.tsx`,
`src/components/home/LocationControl.tsx` (pill styling only),
`src/components/Landing.tsx`, `src/components/home/HeroHeading.tsx`,
tests: `src/lib/headerVisibility.test.ts`, `src/components/SiteHeader.test.tsx`

### Why it's built this way (don't deviate)
`SiteHeader` must **not** read the URL (`usePathname`) to know it's on the home
page — the top of `headerVisibility.tsx` explains that this would force a
Suspense boundary and delay the header on every page. Instead the home screen
opts in through context, exactly like the mobile map already does with
`useCollapseHeader`.

### Steps
1. In `headerVisibility.tsx`, add a small context + two hooks, modelled on
   `HeaderCollapseProvider` / `useCollapseHeader` / `useHeaderCollapsed`:
   - `useHeaderOverlay(active: boolean): void` — called by a screen; sets the
     flag while mounted, clears it on unmount.
   - `useHeaderOverlaid(): boolean` — read by `SiteHeader`.
   - **Must not throw when no provider is present** (return `false`): 
     `CategoryPreview.tsx` renders `SiteHeader` inside its own provider tree
     and must keep working. Either add the new state to the existing
     `HeaderCollapseProvider` (preferred — no new provider to wire in
     `SiteChrome.tsx` or `CategoryPreview.tsx`) or make the hook tolerant.
   - Add `useScrolledPastTop(threshold = 8): boolean` — a passive scroll
     listener returning `window.scrollY > threshold`; initial value `false`
     (SSR-safe).
2. In `Landing.tsx`, call `useHeaderOverlay(true)`.
3. In `SiteHeader.tsx`, when `overlaid && !scrolled` (and not `collapsed`),
   use **desktop-only** transparent classes: `desktop:bg-transparent
   desktop:border-transparent desktop:backdrop-blur-none`. Otherwise keep
   today's classes, but make the desktop scrolled state solid white
   (`desktop:bg-white`, keep the bottom border). Add `transition-colors`.
   Mobile classes must be byte-for-byte what they are today.
4. The white diagonal shape behind the logo/nav (mockup: white on the left,
   ending in a slanted edge around 55% of the width, photo visible to the
   right). Render it only in the overlaid, unscrolled state, desktop only: an
   `aria-hidden` absolutely-positioned div behind the header row,
   `inset-y-0 left-0 w-[58%] bg-white/95`, with
   `clip-path: polygon(0 0, 100% 0, 94% 100%, 0 100%)`.
5. Logo mark: `h-9 w-9` → `desktop:h-11 desktop:w-11`. Site name: add
   `desktop:font-serif desktop:text-2xl desktop:font-semibold desktop:text-[--color-ink]`
   (use whatever token syntax Phase 1 set up). Header row height
   `h-14` → `desktop:h-[60px]`.
6. "Set location" pill (`LocationControl.tsx`): desktop only — white
   background, `shadow-sm`, `border-slate-200`, `px-4 py-2`. Don't change its
   behaviour.
7. In `HeroHeading.tsx`'s desktop `<section>`, pull the hero up under the
   sticky header: add `desktop:-mt-[60px]` to the section and add 60px to the
   inner content's top padding so the headline doesn't move up under the nav.
8. **Tests (red first):**
   - `headerVisibility.test.ts`: `useScrolledPastTop` returns false at 0 and
     true after a scroll event past the threshold; `useHeaderOverlaid` is false
     with no caller, true while a component calling `useHeaderOverlay(true)`
     is mounted, false after it unmounts.
   - `SiteHeader.test.tsx`: overlaid + unscrolled → header has
     `desktop:bg-transparent`; overlaid + scrolled → does not; not overlaid →
     does not. Also: mobile classes unchanged (assert the existing
     `bg-white/90` class is still present in every state).
   - Break each on purpose, see red, restore.
9. Verify in the browser at 1448×1090: at top the photo shows through the
   right side of the header; scroll 20px → header is solid white. Open a
   category page → header is solid white immediately. Resize to 390×844 →
   header identical to before.
10. Run `npm run test:e2e` (this touches page shells). Commit.

---

## Phase 3 — Hero details

**Files:** `src/components/home/HeroHeading.tsx`, `src/components/icons.tsx`,
test: `src/components/home/HeroHeading.test.tsx`

Desktop section only. Don't touch the mobile `<section>` above it.

1. Headline `<h1>`: `font-serif font-bold text-[64px] leading-[1.02] tracking-tight` in ink colour. (The lowercase "guide" is admin content — don't hardcode the headline.)
2. Subhead: `mt-3 text-lg text-slate-600`.
3. Search box wrapper: `max-w-md` → `max-w-[585px]`; box ~48px tall with a
   soft shadow. If `SearchBox` doesn't accept a size/className prop, add an
   optional `className` passthrough rather than forking the component.
4. Buttons (`mt-6 gap-3`):
   - Browse Categories: `bg-brand-teal hover:bg-brand-teal-dark text-white rounded-full px-6 py-3 text-[15px] font-semibold`, with a 2×2 grid icon (new `GridIcon` in `icons.tsx`, 18px, stroke `currentColor`) before the label.
   - View Map: white, `border-slate-300`, `rounded-full px-6 py-3`, ink text. Replace the emoji `{mapIcon}` with a new outline `MapIcon` (folded-map glyph) from `icons.tsx`. Keep the `mapIcon != null` gate — it's what hides the button when there's no Map category.
   - **View Map's click must still work once the map card is removed.** Today
     `Landing.tsx` passes `onViewMap={() => mapBandRef.current?.scrollIntoView(...)}`,
     which silently does nothing when the map card isn't rendered. Change it to:
     scroll to the band if `mapBandRef.current` exists, otherwise navigate to
     the full map page (`onNavigate(null, 'map')` — check how `SiteChrome.tsx`
     navigates to the map and use the same call). Test both branches in
     `Landing.test.tsx`, red first.
5. Tagline under the buttons: `mt-6 text-[11px] font-medium uppercase tracking-[0.35em] text-slate-500`, text `People · Places · Community` (use real `·` characters with spaces).
6. Faint skyline: new `SkylineIcon` in `icons.tsx` — a simple single-colour
   silhouette SVG (rooftops, a City-Hall-like tower). Render `aria-hidden`,
   absolutely positioned bottom-left of the hero content area, ~360px wide,
   `text-slate-400 opacity-15`, behind the text (`-z-10` inside the section's
   `isolate`).
7. Quote top-right over the photo: absolutely positioned inside the inner
   `max-w-6xl` wrapper, `right-6 top-[96px]`, `max-w-[190px]`, serif 20px,
   ink colour, `leading-snug`, text
   ``A stronger Jewish {community.region} together.`` (import `community` from
   `@/community.config`, as `Landing.tsx` already does — don't hardcode
   "Philadelphia"; this app hosts several communities). Under it a
   `mt-3 h-0.5 w-7 bg-gold` rule. Hide it below `lg` widths so it can't
   collide with the headline (`hidden lg:block`).
8. Height: `min-h-[520px]` → `min-h-[435px]` on both the section and the inner
   wrapper (the inner one includes the 60px added in Phase 2).
9. White wash: soften so the photo starts showing at ~38% width —
   `linear-gradient(to_right, white 0%, rgba(255,255,255,0.92) 30%, transparent 58%)`.
   Compare against the mockup and adjust the stops by eye.
10. Update the component's doc comment to describe the new design.
11. **Tests:** update `HeroHeading.test.tsx` for any assertions on changed
    markup. Add: the tagline renders on desktop; the quote uses
    `community.region`; View Map no longer renders the emoji icon string.
    Red first.
12. Verify visually against the mockup. Commit.

---

## Phase 4 — Sukkah campaign banner, horizontal layout

**Files:** `src/components/home/CampaignBannerCard.tsx`, `src/components/icons.tsx`

Mobile markup/classes must stay as they are. The cleanest way: keep the current
JSX for mobile wrapped in `desktop:hidden`, and add a separate desktop block
`hidden desktop:flex`. Both render from the same `banner`/`primary`/`secondary`
values — don't duplicate the logic, only the markup.

Desktop block, left to right, `items-center`, ~120px tall, `rounded-2xl
border border-sage-200 bg-sage-50 overflow-hidden relative`:
1. **Photo placeholder**, left, `w-[24%] self-stretch`: a warm gradient
   (`from-amber-200 via-sage-200 to-sage-50`) with a faint sukkah/leaf glyph,
   masked to fade into the banner on its right edge
   (`[mask-image:linear-gradient(to_right,black_60%,transparent)]`), `aria-hidden`.
2. **Text**, `flex-1 px-6`: eyebrow "Happening now" (unchanged style, sage-700),
   title in serif ~24px semibold ink, subtitle 15px stone-600.
3. **Buttons**, right, `pr-16 gap-3`: primary (sage-600 filled, `rounded-lg`,
   with a new `PinIcon` before "Map View" when the primary is the map button),
   secondary white outline.
4. **Leaf decoration**: `aria-hidden` faint leaf SVG, absolutely positioned
   right edge, `opacity-10`, behind the buttons.
5. **No** left colour rail on desktop (keep it on mobile).
6. Dismiss ✕ stays top-right.

Tests: `e2e-admin-write/campaign-banner.spec.ts` covers the admin side of
banners (create/save), not this public card's markup, so it should be
unaffected — but it's the suite `AGENTS.md` maps to this area, so still run
`npm run test:admin-write` (needs `TEST_SUPABASE_*`; if you can't run it, say
so explicitly). Search `e2e/` and `src/**/*.test.tsx` for "Happening now",
"Map View" and "Browse Listings": any locator that now matches both the mobile
and desktop copies must be scoped to the visible one. Add a unit test that the
desktop block has no left colour rail and the mobile block still does. Commit.

---

## Phase 5 — "What are you looking for?" card: 8 tiles

**Files:** `src/components/Landing.tsx` (the `kind === 'browse'` branch),
`src/components/home/sections.tsx`, `src/components/home/SearchSection.tsx`,
`src/components/CategoryIcon.tsx` (only if a larger size needs support),
tests: `src/components/Landing.test.tsx`, `src/components/home/CompactCard.test.tsx`, `e2e/home.spec.ts`

1. **Header row** of the card: left = eyebrow + serif title (existing
   `settings.desktopBrowseEyebrow` / `desktopBrowseHeading`); right =
   `SearchSection` (compact, ~440px wide) then a "Browse all categories →"
   text button (13px semibold ink, arrow icon). `flex items-end justify-between gap-6`.
   `SearchSection` must remain mounted in one stable place — see the long
   comment in the browse branch about focus being dropped if it remounts when
   `q` changes. Its `results` slot still renders below the header row, full
   card width, when there's a query.
2. **Tiles**: new `CategoryTileRow` export in `sections.tsx` (keep
   `CompactCardGrid` — it's still used for desktop search results).
   - `grid grid-cols-4 lg:grid-cols-8 gap-3`.
   - Each tile is a `Link` (same `href`, same `onCardClick` tracking as
     `CompactCard`, including the `ViewTransition name={category-badge-${id}}`
     wrapper): `rounded-xl border border-slate-200/80 bg-white py-5 px-2
     flex flex-col items-center text-center hover:border-slate-300 hover:shadow-sm`.
   - Icon: `CategoryIcon` at 56px (`h-14 w-14`) using the same
     `getCategoryColor` tint. Then name (14px medium ink, `mt-3`, truncate),
     then count (13px slate-500).
   - Collapsed: first 8 cards. Expanded: all cards (grid keeps wrapping).
3. "Browse all categories →" toggles expanded/collapsed. Label when expanded:
   "Show fewer categories". `aria-expanded` on the button. Hide the button if
   there are 8 or fewer cards.
4. Remove the old "Show more" usage from the browse card (the desktop search
   results still use `CompactCardGrid`; leave that component's own Show more
   logic alone).
5. Tracking: tiles keep `track('category_opened', { …, source: 'grid' })`.
6. **Tests (red first):**
   - `Landing.test.tsx`: with >8 cards, exactly 8 tile links show; clicking
     "Browse all categories" shows all and sets `aria-expanded="true"`;
     clicking again collapses; button absent with ≤8 cards; tile click still
     tracks `source: 'grid'`. Update the existing browse tests that assert the
     old compact-row design ("rows have no border/background at rest…") —
     that design is intentionally gone for this card.
   - `e2e/home.spec.ts`: the test "collapses past four rows … and 'Show more'
     reveals the rest" asserts the old behaviour. Rewrite it for the new
     8-then-all behaviour, deriving the expected count from the real
     categories via `e2e/helpers.ts` (never hardcode category names).
7. Run `npm run test:e2e`. Commit.

---

## Phase 6 — The row of three cards

**Files:** `src/components/Landing.tsx`, `src/components/home/DaveningTimesCard.tsx`,
`src/lib/upcomingDavening.ts`, `src/components/home/UpdateListingsCard.tsx`,
new `src/components/home/SuggestListingCard.tsx`, `src/components/icons.tsx`;
delete `src/components/home/EditReportPicker.tsx` + its test;
tests: `Landing.test.tsx`, `DaveningTimesCard.test.tsx`, `UpdateListingsCard.test.tsx`,
`src/lib/upcomingDavening.test.ts` (or wherever that module is tested), new `SuggestListingCard.test.tsx`, `e2e/home.spec.ts`

### 6a. Row placement in `Landing.tsx` (no database change)
Card widths in the database only allow `'full' | 'half'`, and card kinds are
fixed by a DB constraint, so **don't** add a `'third'` width or a `'suggest'`
kind. Instead, in the row-building walk:
- When the walk reaches the first of `davening` / `listings`, render one
  **community row** there containing, in order: Davening (if it rendered),
  Update Listings (if configured and rendered), Suggest a Listing (always,
  when the row renders). Skip the other of the two when the walk reaches it.
- Grid: `grid gap-5 min-[900px]:grid-cols-3` when 3 cards, `min-[740px]:grid-cols-2` when 2, single column for 1.
- Their `width` values are ignored for this row. Leave the existing half-pair
  logic intact for every other card (Subscribe + Jewish Times still pair).
- Update the big comment above `cardKindContent` to describe this.
- Tests: row renders 3 cards in order when both kinds are configured;
  renders 2 (Listings + Suggest) when Davening is gated off; Subscribe and
  Jewish Times still pair as before; the existing "pairs two adjacent
  half-width cards" tests still pass or are updated to use kinds other than
  davening/listings.

### 6b. Upcoming Davening (compact)
1. `upcomingDavening.ts`: add `minutes: number` (minutes since local midnight
   of the day it falls on) to `UpcomingDavening`, filled wherever `time` is.
   Unit-test it, red first.
2. New pure helper (same file or `src/lib/`): `formatStartsIn(nowMinutes, target, isTomorrow)` →
   `"In 12 min"`, `"In 1 hr 12 min"`, `"In 2 hr"`; for tomorrow add 1440.
   Unit-test edge cases (0 min → "Now", exactly 60, >24h not possible).
3. Card layout: header row = eyebrow + serif title (left), "View all times →"
   link (right, 12px semibold ink, same `seeAllHref`). Remove the amber pill
   button and the "N mi" chip.
4. Body: one row, `rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 flex items-center gap-3`:
   sun icon (new `SunIcon`, amber-500, 24px) · column (label 14px semibold ink;
   shul name or "at N nearby shuls" 12px slate-500) · right-aligned column
   (time 14px semibold ink tabular-nums; "In 1 hr 12 min" 12px slate-500;
   append "tmrw" treatment only via the helper).
5. "No davening times posted yet." empty state stays.
6. Keep the card's container classes consistent with the spec's card style; `p-6`.
7. Update `DaveningTimesCard.test.tsx` for the new markup; add a countdown
   assertion using `vi.useFakeTimers()` (the card reads the clock).

### 6c. Kept by the Community
1. Remove Add/Edit/Report buttons, the `ContributeButton` helper,
   `ContributePicker`/`EditReportPicker` usage from this card.
2. Layout: eyebrow + serif title (left), people icon (new `PeopleIcon`, teal,
   32px outline) top-right. Body text (hardcoded, 14px slate-600):
   ``A living guide, built and updated by the people who call {community.region} home.``
3. One button: `next/link` to `/about` — white, `border-slate-300`,
   `rounded-lg px-4 py-2 text-sm font-semibold`, small people/handshake icon, label "Learn More".
4. Keep the "Send a note →" feedback line? **The mockup doesn't show it —
   remove it from this card.** Feedback is still reachable from the header's
   More menu and the footer.
5. `EditReportPicker.tsx` is now unused: confirm with
   `grep -rn EditReportPicker src e2e e2e-*` then delete it and its test.
   `ContributePicker.tsx` stays (Suggest card uses it).
6. Rewrite `UpdateListingsCard.test.tsx`: renders eyebrow/heading; "Learn
   More" links to `/about`; no Add/Edit/Report buttons. Delete the
   container-query label tests (the buttons they test are gone).
7. `e2e/home.spec.ts` has two tests about the Add/Edit/Report labels
   ("whichever label the container query picks…", "never shows the long
   labels wrapped…"). Remove them — the UI they test no longer exists — and
   say so in the commit message.

### 6d. Suggest a Listing (new)
1. `SuggestListingCard.tsx`, `'use client'`. Fixed copy: eyebrow "Get involved",
   title "Suggest a Listing", body "Help keep our community guide accurate and useful.",
   button "Submit a Listing" (pencil icon, white outline, `rounded-lg`).
2. Button opens `<ContributePicker onClose={…} />` (same state pattern the old
   card used for `'create'`).
3. Right ~42% of the card: photo placeholder, `absolute inset-y-0 right-0`,
   warm brick gradient (`from-orange-200 via-orange-300 to-amber-700/60`),
   faded on its left edge with a mask like the banner, `aria-hidden`.
   Text column gets `max-w-[58%]` so it never overlaps the placeholder.
4. Test: renders copy; clicking the button opens the picker (assert on a
   picker heading/role — read `ContributePicker.test.tsx` for what it renders).

Run `npm test`, `npm run test:e2e`. Commit (one commit per sub-step is fine).

---

## Phase 7 — Closing strip

**Files:** new `src/components/home/ClosingStrip.tsx`, `src/components/Landing.tsx`, `src/components/icons.tsx`

1. Rendered at the very end of the desktop card walk in `Landing.tsx`,
   `hidden desktop:flex`. No card background — it sits on the page ground.
   `mt-8 mb-4 items-center gap-8`.
2. Left: `SkylineIcon` as line art (stroke only, slate-600, ~120×56).
3. Middle (`flex-1`): serif 18px ink heading
   ``A more connected {community.region}``; 13px slate-500 body, `max-w-[460px]`:
   ``Whether you're a lifelong local, new to the city, or just visiting — the {settings.name} helps you find what you need and feel at home.``
4. Divider: `self-stretch w-px bg-slate-200`.
5. Right: serif 15px ink, two lines "Same people." / "A stronger community.",
   then `mt-2 h-0.5 w-7 bg-gold`.
6. Small render test (copy uses region + settings name). Commit.

---

## Phase 8 — Final verification and report

1. `npx tsc --noEmit` and `npx eslint .`
2. `npm test`
3. `npm run test:e2e`
4. `npm run test:admin-write` (Phases 4 touched the banner; `AGENTS.md` table)
5. `npm run sentry:check` — report anything it lists.
6. Screenshot `/philly` at 1448×1090, top of page and scrolled, and put them
   side by side with `docs/desktop-mockup.jpg`. List every remaining visible
   difference honestly (expected ones: the map card still shows until the
   user removes it in admin; placeholder photos; "Guide" capitalisation is
   admin content).
7. Screenshot `/philly` at 390×844 and confirm mobile is unchanged vs. `main`.
8. Report to the user:
   - what was built, per phase, with commit hashes;
   - tests added (and how many failed against the old code), tests removed and why;
   - anything you couldn't run;
   - **follow-ups for the user**: remove the Map card in the admin's Home screen
     cards list (dev and production — the user does this, not you); the
     Davening/Update Listings width controls in the admin no longer affect
     layout; the admin's hero headline text needs "guide" lowercased to
     match the mockup.
   - Do not push.
