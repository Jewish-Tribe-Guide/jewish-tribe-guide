'use client'

import { useEffect, useRef, useState } from 'react'
import { CardGrid, PlacesResults, cardMatches, searchListings, groupCardsIntoSections, resourceCards, useEntryCards, type CardDef } from '@/components/home/sections'
import HeroHeading from '@/components/home/HeroHeading'
import HomeMap from '@/components/home/HomeMap'
import ZmanimWidget from '@/components/home/ZmanimWidget'
import { GenericListingCard } from '@/components/resources/GenericListingCard'
import { HOSPITALS_ID, rankMapId } from '@/components/map/ResourceMapView'
import SupportWizard from '@/components/wizard/SupportWizard'
import VolunteerWizard from '@/components/wizard/VolunteerWizard'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import { useCategories } from '@/lib/useCategories'
import { useHomeSections } from '@/lib/useHomeSections'
import { useAllListings } from '@/lib/useAllListings'
import { useHospitals } from '@/lib/useHospitals'
import type { DirectoryResource, NavigateFn } from '@/types'
import type { Flow } from '@/app/page'
import { useSiteSettings } from '@/lib/useSiteSettings'
import type { CategoryConfig } from '@/lib/categories'
import { ui } from '@/lib/uiConfig'

type Props = {
  onNavigate: NavigateFn
  /** Opens a full-screen guided form (Support / Volunteer). */
  onOpenFlow: (kind: Flow['kind'], preselect?: string[]) => void
  /** The visitor's location (from the header pill) — lets "Search results" show
   *  distance, exactly like the category directory does. */
  coords: { lat: number; lng: number } | null
}

// Fixed display order for the map's "Browse by Category" list — the exact
// same order (and rank function) the map's own bottom key bar sorts by, so
// the two never drift apart. Medical/Eruv are singleton kinds without a
// stable, meaningful id to key on the same way listing categories are, so
// they're matched by kind instead (medical -> HOSPITALS_ID, same id the key
// bar and map pins use for hospitals).
function mapListRank(c: CategoryConfig): number {
  const key = c.kind === 'medical' ? HOSPITALS_ID : c.kind === 'eruv' ? 'eruv' : c.id
  return rankMapId(key)
}

type GetConnectedItem = {
  id: string
  label: string
  icon?: string
  go: () => void
  /** When set, clicking this item embeds that wizard inline beside the
   *  list instead of calling `go()` — see GetConnectedAccordion's
   *  `embeddedFlow` state. */
  embed?: 'support' | 'volunteer'
  /** When set, clicking this item shows ITS full listing detail (a
   *  GenericListingCard) beside the list instead of calling `go()` — see
   *  GetConnectedAccordion's `detailItemId` state. */
  detail?: DirectoryResource
}
type GetConnectedCategory = { id: string; title: string; items: GetConnectedItem[] }

// One shared tint for every Get Connected category tile (Support &
// Volunteering, Professional Networks, Social Opportunities, WhatsApp
// Groups) — `#F0F6F6`, same flat solid color as the containing Get
// Connected section and the other white bands around it (the map area,
// the two blank spacers). Was that same set of sections' gradient
// (`#F5FAFA` -> `#EAF2F2`, the search bar's own gradient) briefly, until
// flattened back to solid on request — the search bar itself keeps its
// gradient; this const's use here doesn't (title section carries its own
// `#8FC6CF`/gradient, and Zmanim keeps the earlier flat `#EAF2F2`).
const CATEGORY_FILL = '#F0F6F6'

/** "Get Connected" — same width as the map above it (both sit inside the
 *  same fluid-width `<main>`, see its own doc comment). The four
 *  categories are `grid-cols-4` (equal `fr` fractions), so they stay
 *  equal widths as that container grows/shrinks with the window rather
 *  than any one of them claiming a fixed share. No box/frame of its own,
 *  no divider lines between categories either (border thickness across
 *  this whole redesign went to 0 on request) — just the four categories
 *  sitting edge to edge. Every category shares the one `CATEGORY_FILL`
 *  tint now — text stays black throughout, since it's light enough to
 *  keep that legible.
 *
 *  Every category's list is shown at once, side by side as four tiles
 *  (`grid-cols-4`) — there's no tab-switching/accordion here (there used
 *  to be, gated on a single `activeId`; that's gone, so all lists are
 *  visible without the user needing to click anything first). Each
 *  category's own header is a static heading, not a button.
 *
 *  Item ROWS also line up across the four columns, not just the tiles'
 *  overall width — the outer grid defines a shared row-track list
 *  (`gridTemplateRows`, sized off whichever category has the most items)
 *  and each category opts into `subgrid` on that same axis, so item N in
 *  every column lands in the same row regardless of how many items its
 *  own list has (see `maxItems` below). Each item now reads as an actual
 *  button too — a bordered, rounded chip instead of a flat list row with
 *  just a left accent bar — so there's no ambiguity that these are
 *  clickable, and no `divide-y` lines needed between them anymore since
 *  each chip is already visually distinct on its own.
 *
 *  Some items don't navigate at all when clicked — a SECOND box opens
 *  directly under THAT item (not at the bottom of the whole list), pushing
 *  the rest of the list below it down rather than appearing disconnected
 *  from whichever button actually opened it. Shows either:
 *  - `embed` (Support/Volunteer's "Interest Form" entries): the real
 *    SupportWizard/VolunteerWizard, `variant="inline"`.
 *  - `detail` (Professional Networks/Social Opportunities/WhatsApp Groups'
 *    real listings): that listing's own GenericListingCard, same as its
 *    full directory page shows, instead of navigating there.
 *  `embeddedFlow`/`detailItemId` stay single top-level state (not one per
 *  item) since item ids are unique across every category's list, so at
 *  most one item's box can ever match and open at a time — clicking a
 *  different item (in this list or another category's) still just closes
 *  whichever other one was open, same as before. */

// Every Get Connected category title is two-plus words ("Support &
// Volunteering", "Professional Networks", …) — forced onto exactly two
// lines (rather than left to wrap naturally, which reflows to one line
// once the column's wide enough) by splitting the words roughly in half.
// `Math.ceil` puts the extra word on the first line for odd counts, e.g.
// "Support & Volunteering" -> "Support &" / "Volunteering", matching how
// it'd naturally break by hand.
function twoLineTitle(title: string): [string, string] {
  const words = title.split(' ')
  const mid = Math.ceil(words.length / 2)
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
}

function GetConnectedAccordion({
  categories,
  categoryConfigs,
  searchQuery,
}: {
  categories: GetConnectedCategory[]
  categoryConfigs: CategoryConfig[] | null
  /** The home page's own top search bar query — matched item rows get a
   *  gold highlight (see `isMatch` below), the same accent color used to
   *  mark matching pins on the map, so a search result stands out
   *  wherever it already lives on the page. */
  searchQuery?: string
}) {
  const [embeddedFlow, setEmbeddedFlow] = useState<'support' | 'volunteer' | null>(null)
  const [detailItemId, setDetailItemId] = useState<string | null>(null)
  const matchQuery = searchQuery?.trim().toLowerCase() ?? ''

  // The four categories share one row grid (via `subgrid` below) so item N
  // in every column lands on the same row regardless of which column has
  // more/fewer items — `maxItems` sizes that shared row track list. `+ 1`
  // for the header row. `Math.max(…, 1)` guards `repeat(0, auto)`, which
  // is invalid CSS, for the edge case where every category is empty.
  const maxItems = Math.max(1, ...categories.map((cat) => cat.items.length))

  // The currently-open item, found across ALL categories (not scoped to
  // one) — `embeddedFlow`/`detailItemId` are single top-level state, so at
  // most one item across the whole grid can ever match. Used by the ONE
  // shared detail panel below the grid (see its own comment) instead of
  // each item rendering its own.
  const allItems = categories.flatMap((cat) => cat.items)
  const openItem = allItems.find((it) => (it.embed && it.embed === embeddedFlow) || (it.detail && it.id === detailItemId))
  const openItemIsEmbed = !!openItem?.embed && openItem.embed === embeddedFlow
  const openItemIsDetail = !!openItem?.detail && openItem.id === detailItemId
  const openItemDetailCategory = openItemIsDetail && openItem?.detail ? categoryConfigs?.find((c) => c.id === openItem.detail!.category) : undefined
  const isSectionOpen = openItemIsEmbed || (openItemIsDetail && !!openItemDetailCategory)

  return (
    <>
    {/* No more `divide-x`/`divide-black` column rule — border thickness
        across this whole redesign went to 0 on request, so that divider was
        already invisible; dropped the class entirely rather than keep a
        dead one. `grid-template-rows` here is the shared row-track list
        every category's own `subgrid` below inherits from, which is what
        actually lines item N up across all four columns — a plain
        `grid-cols-4` (auto rows) wouldn't do that on its own, since each
        column's content would just stack independently of the others'. */}
    <div
      className="grid w-full grid-cols-4"
      style={{ backgroundColor: CATEGORY_FILL, gridTemplateRows: `auto repeat(${maxItems}, auto)` }}
    >
      {categories.map((cat) => {
        const embedItem = cat.items.find((it) => it.embed && it.embed === embeddedFlow)
        const detailItem = cat.items.find((it) => it.detail && it.id === detailItemId)
        const detailCategory = detailItem?.detail ? categoryConfigs?.find((c) => c.id === detailItem.detail!.category) : undefined
        const hasSecondBox = !!embedItem || !!(detailItem?.detail && detailCategory)

        return (
          // `[grid-row:1/-1]` + `[grid-template-rows:subgrid]` — this
          // column spans every row track the parent defined above and
          // shares that exact track list, rather than defining its own;
          // its own children (the header below, then each item) fall one
          // per row in DOM order, so they land in the same row positions
          // every other category's children do. `content-start` — packs
          // this column's rows against the TOP of its span explicitly
          // (rather than relying on the default, which read as bottom-
          // heavy once column heights started differing) so a category
          // with fewer items ends in blank space at the bottom, not the top.
          <div key={cat.id} className="grid min-w-0 content-start [grid-row:1/-1] [grid-template-rows:subgrid]">
            {/* Same size as the item buttons below (`text-sm`) but bold +
                uppercase + tracking-wider so it still reads as a heading,
                and much smaller than the "Get Connected" heading above
                the whole group (`text-3xl`) — that gap stays unambiguous.
                `py-1.5` (was
                `py-3`, then `py-2`) — shorter again, part of shrinking the
                whole Get Connected + Zmanim run of sections next to the
                map. Forced two lines via `twoLineTitle` (see above).
                `#4F6B6B` (was `#1C1B19`, the page's text-primary black) —
                a muted, desaturated brand teal instead, on request, so the
                page's color hierarchy reads as: black for the main
                headlines (h1/h2), teal for these category labels, neutral
                gray for plain body text. 5.76:1 contrast against this
                tile's white fill, comfortably past WCAG AA. `font-medium`
                (500, was `font-bold`/700) — matches the site-wide weight
                scale's "card titles/category labels" step now that
                hierarchy comes from weight alone, not a separate serif
                face. */}
            <div className="px-3 py-1.5 text-center text-sm font-medium uppercase tracking-wider text-[#4F6B6B]">
              {twoLineTitle(cat.title).map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </div>
            {cat.items.length > 0 ? (
              // `contents` — this `<ul>` still exists for real list
              // semantics, but is invisible to layout: its `<li>`s become
              // direct children of the `subgrid` div above, so each lands
              // in its own row alongside the header instead of all of
              // them stacking inside one shared row as a single unit.
              <ul className="contents">
                {cat.items.map((item) => {
                  const isOpen = (item.embed && item.embed === embeddedFlow) || (item.detail && item.id === detailItemId)
                  const isMatch = matchQuery.length > 0 && item.label.toLowerCase().includes(matchQuery)
                  // `flex flex-col` (no `justify-start` anymore) — the
                  // button below is `flex-1` now, growing to fill whatever
                  // height this row track actually is (shared across all 4
                  // columns via `subgrid`, so it's not always this item's
                  // own natural content height). Without that, a shorter
                  // item sitting in a row a taller sibling column
                  // stretched would leave blank space trailing INSIDE this
                  // li instead of being absorbed into the button itself —
                  // which made the gap before the next button look bigger
                  // some rows than others, instead of the constant `py-1`
                  // every row actually has.
                  return (
                    <li key={item.id} className="flex flex-col px-1.5 py-1">
                      <button
                        onClick={() => {
                          if (item.embed) setEmbeddedFlow((prev) => (prev === item.embed ? null : item.embed!))
                          else if (item.detail) setDetailItemId((prev) => (prev === item.id ? null : item.id))
                          else item.go()
                        }}
                        // A bordered, rounded chip (rather than a flat
                        // list row with a left accent bar) — reads
                        // unambiguously as a clickable button instead of
                        // plain text, no `divide-y` lines needed between
                        // rows to separate them anymore since each one is
                        // now its own visually distinct chip. A search
                        // match keeps the same gold accent the map's
                        // matching pins do (see ResourceMap's
                        // `highlighted`) — the one deliberate spot of
                        // color left, since it's a functional indicator
                        // shared with the rest of the page's
                        // search-highlight system, not decorative
                        // branding. One level below "open" (which still
                        // wins if a matched row is also the one expanded)
                        // but above the "every other item dims" treatment,
                        // so a match never dims out. `hover:-translate-y-0.5
                        // hover:shadow-md` on every state (even dimmed) —
                        // a lift, on top of whatever color change that
                        // state already gets, to make the "this is a
                        // button" affordance read even more clearly. Resting
                        // state's hover is brand-teal now (was gray
                        // `hover:border-black hover:bg-slate-50`) — border
                        // shifts to `#8FC6CF`, background tints to a very
                        // faint teal `#F4F8F8`, on request. `duration-150
                        // ease-out` — within the requested 150-200ms "ease"
                        // range. `transition-all` (was `transition-colors`)
                        // since transform/shadow need to animate now too,
                        // not just color. `flex-1 flex items-center` (was
                        // `block w-full`) — grows to fill this row's full
                        // height (see the `<li>` comment above) instead of
                        // just wrapping its own text, with its content
                        // centered vertically so it doesn't look stuck at
                        // the top of a now-taller box.
                        className={`flex flex-1 w-full items-center rounded-md border px-3 py-1.5 text-left text-sm font-medium shadow-sm transition-all duration-150 ease-out cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${
                          isOpen
                            ? 'border-black bg-slate-100 text-[#1C1B19]'
                            : isMatch
                              ? 'border-[#ffc145] bg-amber-50 text-[#1C1B19]'
                              : // Once something in this list is open, every OTHER
                                // item dims — the same "one item stands out, the
                                // rest recede" read the two-item Support &
                                // Volunteering list already had by virtue of only
                                // having one alternative to compare against. Left
                                // as a muted gray on purpose (not black) — dimming
                                // is the whole point of this state.
                                hasSecondBox
                                ? 'border-slate-200 bg-white text-slate-300 hover:text-slate-500'
                                : 'border-slate-300 bg-white text-[#1C1B19] hover:border-[#8FC6CF] hover:bg-[#F4F8F8]'
                        }`}
                      >
                        {item.icon && <span aria-hidden="true" className="mr-1.5">{item.icon}</span>}
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {/* Small right-aligned arrow, on request — reinforces
                            that every one of these rows leads somewhere
                            (a wizard, a listing's detail, or a full page)
                            instead of just being static text. `shrink-0`
                            so it never gets squeezed by a long label. */}
                        <svg
                          className="ml-1.5 h-3 w-3 shrink-0 opacity-60"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.2}
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-4 py-2 text-sm italic text-slate-400">Coming soon</p>
            )}
          </div>
        )
      })}
    </div>

    {/* ONE shared detail panel below the whole grid — not per-item/per-
        column anymore (that was `position: absolute`, which kept the
        other 3 columns from growing but floated the open panel over
        whatever sat below it in its own column, including spilling onto
        Zmanim once the whole Get Connected section's own height didn't
        account for it). This single panel, in normal flow, grows the
        WHOLE section instead — pushing Zmanim down, no overlap — while
        the 4-column grid above it still never changes shape, since
        nothing about the open item lives inside it anymore. `openItem`/
        `isSectionOpen` (see above) are found across ALL categories, not
        one — there's only ever one open item at a time regardless of
        which category it's in. */}
    <div
      style={{ gridTemplateRows: isSectionOpen ? '1fr' : '0fr' }}
      className="grid transition-[grid-template-rows] duration-300 ease-in-out"
    >
      <div className="overflow-hidden">
        <div className="mx-1.5 mt-1.5 rounded-md border border-slate-200 bg-white">
          {openItemIsEmbed ? (
            openItem!.embed === 'support' ? (
              <SupportWizard variant="inline" onClose={() => setEmbeddedFlow(null)} />
            ) : (
              <VolunteerWizard variant="inline" onClose={() => setEmbeddedFlow(null)} />
            )
          ) : openItemIsDetail && openItem?.detail && openItemDetailCategory ? (
            <div className="p-3">
              <GenericListingCard
                item={openItem.detail}
                category={openItemDetailCategory}
                upvotes={!!openItemDetailCategory.upvotesEnabled}
                count={openItem.detail.upvotes ?? 0}
                expanded
                dense
                hideBorder
                hideName
                highlightColor="#000000"
                onVote={() => {}}
                onTagClick={() => {}}
                onFilterOpen={() => {}}
                onFilterBool={() => {}}
                onFilterSelect={() => {}}
                onEdit={() => openItem.go()}
                onReport={() => openItem.go()}
                onExpandedChange={(next) => { if (!next) setDetailItemId(null) }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
    </>
  )
}

/** Left-edge browse menu (a faint arrow tab in the margin now, not a
 *  hamburger icon in the top bar — see below) — a quick-link list to
 *  every resource category's full directory page (Synagogues, Restaurants,
 *  Hospitals, Eruv, etc. — reuses the same `resources` the card grid below
 *  builds from, so it's never a second, drifting copy of that list). Exists
 *  because those "View full page" links used to live on the map's own
 *  category headings — once multiple categories selected there merge into
 *  one flat, ungrouped list (see ResourceMapView), there's no per-category
 *  heading left to click through from; this is the one place they're
 *  always reachable regardless of what's currently selected on the map.
 *  Opens as a panel that folds out WITHIN this box's own bounds now (not
 *  a full-height drawer sliding out from the browser edge) — the trigger
 *  and panel both position against the title section itself (which is
 *  `sm:relative sm:overflow-hidden`, see its call site), not the
 *  viewport, so the whole thing stays visually contained inside the
 *  "Philly Jewish Guide" box's own border rather than spilling into the
 *  margin outside it. The trigger is a faint right-pointing arrow tucked
 *  in the box's own top-left corner — low-opacity until hovered, when it
 *  darkens AND reveals a "Browse Resources." label beside it (grown open
 *  via `max-width`, not `display`, so the reveal actually animates
 *  instead of popping in) — completely invisible/inert otherwise; the
 *  menu itself only ever shows once that arrow is clicked. The panel
 *  (`absolute inset-0`) fills this same box exactly and slides in from
 *  its left edge via transform, clipped to the section's own rectangle
 *  by its `overflow-hidden` so it can't bleed outside those bounds. The
 *  backdrop is a transparent, full-page click-catcher (not a dimmed
 *  overlay) purely so clicking anywhere else on the page still closes
 *  it — visually dimming the whole page would fight with a reveal that's
 *  deliberately contained to one small box. */
function HamburgerMenu({ resources }: { resources: CardDef[] | null }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      {/* The trigger — a faint right-pointing arrow in this box's own
          top-left corner (not a hamburger icon, not out in the margin).
          Low-opacity until hovered, when it darkens and reveals the
          "Browse Resources." label beside it. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Browse resources"
        aria-expanded={open}
        className="group absolute left-2 top-2 z-30 hidden items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-2.5 text-[#1C1B19]/50 transition-colors cursor-pointer hover:bg-slate-100 hover:text-[#1C1B19] sm:flex"
      >
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="pointer-events-none max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold uppercase tracking-widest opacity-0 transition-all duration-300 group-hover:max-w-[10rem] group-hover:opacity-100">
          Browse Resources.
        </span>
      </button>

      {/* Transparent click-catcher — closes the menu on any click outside
          the box, without visually dimming the rest of the page (the
          panel itself doesn't cover the rest of the page, so darkening
          it would look mismatched). */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`}
      />

      {/* The panel — fills this box's own bounds exactly (`inset-0`) and
          slides in from ITS left edge, not the viewport's. Slides in/out
          via transform rather than mounting/unmounting so the motion
          actually reads as a slide instead of a snap. */}
      <div
        className={`absolute inset-0 z-50 flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-[#1C1B19]">Browse</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#1C1B19] hover:bg-slate-100 cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {resources && (
          <nav className="min-h-0 flex-1 overflow-y-auto py-2">
            {resources.map((card) => (
              <button
                key={card.id}
                onClick={() => {
                  card.go()
                  setOpen(false)
                }}
                className="block w-full px-5 py-3 text-left text-sm font-medium text-[#1C1B19] hover:bg-slate-50 cursor-pointer"
              >
                {card.title}
              </button>
            ))}
          </nav>
        )}
      </div>
    </>
  )
}

// The whole site is one screen: a filter box, then a grid of cards. Typing
// filters the grid live against each card's hidden keywords (so "shul" surfaces
// Synagogues), with no dropdown to click through.
export default function Landing({ onNavigate, onOpenFlow, coords }: Props) {
  const categories = useCategories()
  const homeSections = useHomeSections()
  const listings = useAllListings()
  const [query, setQuery] = useState('')
  const settings = useSiteSettings()
  const entryCards = useEntryCards(onOpenFlow)
  // The Map pseudo-category still gates whether the map shows at all —
  // experimenting with rendering it directly on the home screen (below)
  // instead of behind a button; still just as easy to turn back into a card
  // or a button later if this doesn't stick.
  const hasMap = !!categories?.some((c) => c.kind === 'map')
  const hospitals = useHospitals()

  // Shown as a "Browse by Category" list beside the map: Medical (hospital
  // pins) once there's at least one hospital, a listing category with at
  // least one geocoded point, or Eruv (which has no pins of its own — its row
  // just shows its static status info and doesn't affect the map, which is
  // fine). Expanding a row (or tapping a facility inside it) isolates and
  // zooms the map to match, via `focusedListingId` below — except Eruv, which
  // has nothing to isolate.
  const categoriesOnMap = (categories ?? [])
    .filter((c) =>
      c.kind === 'medical'
        ? (hospitals ?? []).length > 0
        : c.kind === 'eruv'
          ? true
          : c.kind === 'listing' && (listings ?? []).some((item) => item.category === c.id && item.geo?.lat != null && item.geo?.lng != null),
    )
    .sort((a, b) => mapListRank(a) - mapListRank(b))

  // Isolating a single facility or a whole category on the map — layered, not
  // exclusive: a facility can only be tapped from inside its (already
  // expanded/isolated) category row, so focusing one doesn't touch which
  // categories are isolated — collapsing one (or expanding another) does,
  // since whatever facility was showing is no longer visible either way.
  // ResourceMapView itself prioritizes the single facility over whichever
  // categories are isolated whenever both are set. Multiple categories can be
  // expanded — and isolated together on the map — at once.
  const [focusedListingId, setFocusedListingId] = useState<string | null>(null)
  const [focusedCategoryIds, setFocusedCategoryIds] = useState<Set<string>>(new Set())
  // The exact ids currently surviving each expanded category row's own
  // filters (search/open-now/kosher/etc.), keyed by that category's map id —
  // no entry yet until that row reports its first batch, in which case the
  // map falls back to the whole category meanwhile.
  const [categoryItemIdsByCategory, setCategoryItemIdsByCategory] = useState<Record<string, string[]>>({})
  // Toggles one category's membership in the isolated set (add if absent,
  // remove if present) — this is what expanding/collapsing a row calls.
  const toggleCategory = (id: string) => {
    setFocusedListingId(null)
    setFocusedCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setCategoryItemIdsByCategory((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  // Scroll targets for the search box's "jump to" results below — a category
  // match scrolls to the map and isolates that category's tab; a Zmanim
  // match scrolls to the widget at the bottom of the page; a Get Connected
  // match scrolls to that section (already showing every category's list at
  // once, so there's no tab to isolate the way the map has).
  const mapSectionRef = useRef<HTMLDivElement>(null)
  const zmanimSectionRef = useRef<HTMLDivElement>(null)
  const getConnectedSectionRef = useRef<HTMLDivElement>(null)
  // Mirrors ResourceMapView's own key — the Medical tab is keyed by
  // HOSPITALS_ID rather than the category's own db id, same as its pins.
  const mapIdForCategoryConfig = (c: CategoryConfig): string => (c.kind === 'medical' ? HOSPITALS_ID : c.id)
  const jumpToMapCategory = (cardId: string) => {
    const found = categoriesOnMap.find((c) => (c.kind === 'medical' ? 'medical' : c.kind === 'eruv' ? 'eruv' : c.id) === cardId)
    if (!found) return
    const mapId = mapIdForCategoryConfig(found)
    // Only turn it on — a "jump to" result shouldn't toggle an already-open
    // category back off.
    if (!focusedCategoryIds.has(mapId)) toggleCategory(mapId)
    mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const jumpToZmanim = () => {
    zmanimSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const jumpToGetConnected = () => {
    getConnectedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const resources = resourceCards(onNavigate, categories)
  // Order is no longer alphabetical — groupCardsIntoSections (below) sorts these
  // into the admin-configured labeled groups for the grid.
  const allCards = resources ? [...entryCards, ...resources] : null

  // Desktop only: any category already shown in the map + "Browse by
  // Category" list above is excluded from the "jump to" results below (it'd
  // just be a duplicate of what expanding that row already does). Mobile has
  // no map to be redundant with, so it keeps the original combined grid
  // (`allCards`/`filtered`/`sections`) untouched, Zmanim/Eruv tiles included.
  // resourceCards() gives 'medical'/'eruv' fixed ids (not the DB category
  // slug) for those two, so the id mapping below matches that.
  const onMapCardIds = new Set(
    categoriesOnMap.map((c) => (c.kind === 'medical' ? 'medical' : c.kind === 'eruv' ? 'eruv' : c.id)),
  )
  const zmanimCategory = categories?.find((c) => c.kind === 'zmanim')

  // ── "Get Connected" section data — each column's list is pulled straight
  //         from the real page/flow its old quick-link button opened, not
  //         duplicated content.
  // A single "Interest Form" entry — same support flow every individual need
  // (Meals / A ride / etc.) used to open, just without preselecting one. Ids
  // (and labels) distinct from `volunteeringItems` below since Support and
  // Volunteering now share one combined "Get Connected" tab — both used to
  // just say "Interest Form" when they were separate tabs, which would have
  // collided (same `id`, indistinguishable labels) once merged into one list.
  // `go` still opens the real full-screen wizard (used if this item ever
  // renders somewhere other than GetConnectedAccordion); `embed` is what
  // GetConnectedAccordion actually acts on, folding the SupportWizard open
  // inline instead of calling `go`.
  const supportItems: GetConnectedItem[] = [
    { id: 'support-interest-form', label: 'Support Interest Form', go: () => onOpenFlow('support'), embed: 'support' },
  ]
  // Same treatment as `supportItems` above — one "Interest Form" entry
  // instead of a separate link per way to help.
  const volunteeringItems: GetConnectedItem[] = [
    { id: 'volunteer-interest-form', label: 'Volunteer Interest Form', go: () => onOpenFlow('volunteer'), embed: 'volunteer' },
  ]
  // These four young-professional listings read more as social meetups than
  // professional networking, so they're split out into "Social Opportunities"
  // instead — same underlying category/page, just grouped differently here.
  const SOCIAL_OPPORTUNITY_NAMES = new Set(['Tribe 12', 'The Chevra', 'Spruce Street Minyan', 'Mem Global- Moishe House'])
  const youngProfessionalToItem = (item: DirectoryResource): GetConnectedItem => ({
    id: item.id,
    label: item.name,
    go: () => onNavigate('patient', 'find', { findView: 'young-professional', findItemId: item.id }),
    detail: item,
  })
  const youngProfessionalListings = (listings ?? []).filter((item) => item.category === 'young-professional')
  const professionalNetworkItems: GetConnectedItem[] = youngProfessionalListings
    .filter((item) => !SOCIAL_OPPORTUNITY_NAMES.has(item.name))
    .map(youngProfessionalToItem)
  const socialOpportunityItems: GetConnectedItem[] = youngProfessionalListings
    .filter((item) => SOCIAL_OPPORTUNITY_NAMES.has(item.name))
    .map(youngProfessionalToItem)
  // WhatsApp used to be its own standalone button above these columns —
  // now just another one of them, listing the real groups the same way
  // Professional Networks/Social Opportunities list real listings, with
  // `detail` so clicking one pops its GenericListingCard open beside the
  // list (see GetConnectedAccordion) instead of navigating away.
  const whatsappItems: GetConnectedItem[] = (listings ?? [])
    .filter((item) => item.category === 'whatsapp')
    .map((item) => ({
      id: item.id,
      label: item.name,
      go: () => onNavigate('patient', 'find', { findView: 'whatsapp', findItemId: item.id }),
      detail: item,
    }))
  const getConnectedCategories: GetConnectedCategory[] = [
    { id: 'support-volunteering', title: 'Support & Volunteering', items: [...supportItems, ...volunteeringItems] },
    { id: 'professional', title: 'Professional Networks', items: professionalNetworkItems },
    { id: 'social', title: 'Social Opportunities', items: socialOpportunityItems },
    { id: 'whatsapp', title: 'WhatsApp Groups', items: whatsappItems },
  ]
  // Stand-ins for the search box's "jump to" row below — Get Connected's
  // four categories aren't real `resources` cards (they were dropped as
  // duplicative once Get Connected covered the same links, see the
  // history comment on `quickLinksCards` above), so there's nothing in
  // `resources` a query like "volunteer" could match against. `gc:`-
  // prefixed ids keep them from ever colliding with a real category id.
  const getConnectedJumpCards: CardDef[] = [
    { id: 'gc:support-volunteering', title: 'Support & Volunteering', icon: '🤝', keywords: ['support', 'volunteer', 'volunteering'], go: () => {} },
    { id: 'gc:professional', title: 'Professional Networks', icon: '💼', keywords: ['professional', 'networking', 'network', 'career'], go: () => {} },
    { id: 'gc:social', title: 'Social Opportunities', icon: '🎉', keywords: ['social', 'meetup', 'young professional'], go: () => {} },
    { id: 'gc:whatsapp', title: 'WhatsApp Groups', icon: '💬', keywords: ['whatsapp', 'group chat'], go: () => {} },
  ]

  const q = query.trim()
  const loading = !q && allCards === null
  const filtered = q && allCards ? allCards.filter((c) => cardMatches(c, q)) : allCards

  // Individual places that match the query by name + tags (e.g. a grocery store
  // with a "cheese" tag for "kosher cheese"). Only computed once the visitor types.
  const placeHits = q && listings ? searchListings(listings, categories ?? [], q, coords) : []
  // Same matches, as an id set — marks their pins on the map (see HomeMap/
  // ResourceMapView's `highlightedListingIds`) so a search result stands
  // out where it already lives on the page, not just in the separate
  // "Search results" list below.
  const highlightedListingIds = new Set(placeHits.map((h) => h.item.id))

  // Desktop only: categories/Zmanim that used to be plain tiles (searchable via
  // resourceCards' own rich keywords, e.g. "shul" -> Synagogues) now live in the
  // map list or the widget below instead of the grid — so a match here surfaces
  // as a "jump to" result rather than a tile, using the exact same keywords.
  const hiddenFeatureMatches = q && resources
    ? resources.filter((card) => card.id != null && (onMapCardIds.has(card.id) || card.id === 'zmanim') && cardMatches(card, q))
    : []
  // Same idea, for Get Connected's four categories (see `getConnectedJumpCards`
  // above) — merged into one combined "jump to" row below rather than a
  // second, separate one.
  const getConnectedMatches = q ? getConnectedJumpCards.filter((card) => cardMatches(card, q)) : []
  const jumpMatches = [...hiddenFeatureMatches, ...getConnectedMatches]

  // Tapping a place opens its category directory, pre-filtered to the matched term
  // (so it survives that page's own search) with the place itself expanded.
  // Still used by the mobile results list (near Zmanim) and as the fallback
  // below for any category that isn't shown in place anywhere on this page.
  const openPlace = (hit: (typeof placeHits)[number]) =>
    onNavigate('patient', 'find', {
      findView: hit.item.category,
      findQuery: hit.term,
      findItemId: hit.item.id,
    })

  // Desktop top search bar's results tap handler — jumps to wherever this
  // place already lives ON this same page instead of navigating away to its
  // full directory (which `openPlace` above still does, for the mobile
  // results list). Map-plottable categories (grocery/restaurant/synagogue/
  // hotel/mikvah) focus that exact pin (`focusedListingId`, already wired
  // to HomeMap — overrides the normal filtered pin set to show just this
  // one, same mechanism `ResourceMapView`'s own "jump to" results use) and
  // scroll to the map; WhatsApp/young-professional listings (Get
  // Connected's Professional Networks/Social Opportunities/WhatsApp Groups
  // columns) scroll to Get Connected instead. Anything else falls back to
  // `openPlace`'s full navigate.
  const focusPlace = (hit: (typeof placeHits)[number]) => {
    if (onMapCardIds.has(hit.item.category)) {
      setFocusedListingId(hit.item.id)
      mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (hit.item.category === 'whatsapp' || hit.item.category === 'young-professional') {
      jumpToGetConnected()
    } else {
      openPlace(hit)
    }
  }

  // Capture searches that come up empty — the most actionable signal for what
  // content to add next. Only counts once data has loaded, so a slow load never
  // looks like a "miss".
  useLogSearchMiss({
    query,
    hasResults: (filtered?.length ?? 0) > 0 || placeHits.length > 0,
    ready: allCards !== null && listings !== null,
    source: 'Home',
  })

  // Sections only exist once loading is done and there's something to group;
  // while loading, a single flat grid of entry cards + skeletons stands in.
  const sections = filtered ? groupCardsIntoSections(filtered, homeSections ?? []) : []

  return (
    // Full-bleed outer wrapper, desktop only — exists purely to carry
    // `sm:bg-[#2D3636]` all the way out to the true page edges. `<main>`
    // below no longer caps out at `max-w-6xl` — it's fluid-width now
    // (fixed `px-12` margin on both sides, growing/shrinking with the
    // window instead of a capped column with the margin absorbing all
    // the extra space) — this wrapper's own fill just paints the space
    // around it, so the boundary area between the bordered sections and
    // the true edge of the page still reads as one continuous color no
    // matter how wide that margin ends up being.
    // `sm:pt-14 sm:pb-8` extends that same fill along the top and bottom
    // too (the top row's own `mt-8` moved here so the two don't stack into
    // a double-size gap; the bottom used to have none at all, since
    // `<main>` itself has `sm:pb-0`). Top bumped up from `8` to `14` on
    // request — pushes the title/map row a little further down the page;
    // bottom stays as it was, this wasn't about the whole shelf shifting,
    // just more room above it.
    <div className="sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#2D3636] sm:pt-14 sm:pb-8">
    {/* `px-4 sm:px-12` is a FIXED margin now (not `max-w-6xl mx-auto`,
            which let the page's max width stay capped while all the
            extra viewport width just piled up into bigger and bigger
            side margins) — on request, so expanding/shrinking the
            browser window keeps this margin exactly the same size and
            lets the bordered sections themselves grow into the freed-up
            space instead. */}
    <main className="px-4 sm:px-12 pb-24 sm:pb-0">
      {/* ── Top bar, SIDE BY SIDE with (search bar + map) (used to each be
              their own full-width stacked bands). Title column is now a
              FIXED `14.4rem` (was `1fr` in a `1fr_3fr]` proportional
              split; landed here via `24rem` — too wide — then `16rem`
              — matched the original proportional width — then trimmed
              to 0.9× that, `14.4rem`, on request) — it stays exactly
              that width as the window resizes, while the map's own
              `1fr` column absorbs 100% of whatever space expanding/
              shrinking the browser frees up or removes. Still narrow
              enough that "Philly Jewish Guide" wraps one word per line
              rather than fitting two on a row. The search bar used to
              live in the title cell too;
              it's now its own band stacked ABOVE the map, spanning that
              same flexible column instead of the title's fixed one.
              `sm:divide-x-0 sm:divide-[#8FC6CF]` draws the ONE shared
              vertical line between the title and the (search+map) column
              (not each side drawing its own — that would double up at
              the seam), while `sm:border-x-0`/`sm:border-t-0` on this
              wrapper frame the row's own outer edges, same muted-teal
              color/thickness as every other section. Falls back to a single
              column (just the title) when there's no map (`hasMap` false)
              rather than leaving an empty second cell.
              `sm:rounded-t-2xl`+`sm:overflow-hidden` on the wrapper (not
              any piece individually) rounds the row's combined top
              corners as one shape — the same "curved edges belong to the
              group, not each piece" rule the rest of the page's borders
              follow (see Zmanim's matching bottom corners below).
              The gap holding it off the very top of the page now comes
              from the outer wrapper's own `sm:py-8` (see above), not a
              margin here. `border-x-0`/`border-t-0` (0 width, back from a
              brief `1.5px` — undone on request) — the border color class
              (`#8FC6CF`, a muted brand teal) is harmless but invisible at
              0 width; every other section's own border below matches. ── */}
      <div className={`hidden sm:grid sm:overflow-hidden sm:rounded-t-2xl sm:border-x-0 sm:border-t-0 sm:border-[#8FC6CF] ${hasMap || ui.search.landing ? 'sm:grid-cols-[14.4rem_1fr] sm:divide-x-0 sm:divide-[#8FC6CF]' : 'sm:grid-cols-1'}`}>
        {/* Used to also carry a Volunteer/Support/Young Professionals
                quick-links row here; removed as duplicative once the "Get
                Connected" section further down covered the same links
                with real lists under them. `sm:relative sm:overflow-hidden`
                — HamburgerMenu's trigger sits inside this box now (not out
                in the margin), and its panel opens WITHIN these bounds
                (absolutely positioned + clipped to this section, not fixed
                to the viewport), so both need this as their containing
                block (see HamburgerMenu itself). Left-justified (was
                centered) — same
                `px-6`/`py-8` gap between the text and this cell's own
                border as before, just aligned to it instead of floating in
                the middle. `sm:flex sm:flex-col sm:justify-center` — this
                cell is usually much shorter than the (search bar + map)
                column beside it (they share ONE row height, stretched to
                the taller side), so its content centers vertically in
                that extra room instead of sitting flush at the top with a
                dead gap below. ─────────────────────────────────────────── */}
        {/* `bg-[linear-gradient(...)]` (was a flat `bg-[#8FC6CF]`) — `90deg`
            now (was a `135deg` diagonal, on request: left-to-right
            instead), and lightened overall — `#C5E5E9` into `#8FC6CF`
            (was the more saturated `#A9D8DF` -> `#5FA0AC`), still the same
            teal hue throughout. */}
        <section className="sm:relative sm:flex sm:flex-col sm:justify-center sm:overflow-hidden sm:bg-[linear-gradient(90deg,#C5E5E9_0%,#8FC6CF_100%)] sm:px-6 sm:py-8 sm:text-left">
          <HamburgerMenu resources={resources} />
          {/* Sans-serif (Figtree, the site's only face now — the serif
              headline face was removed entirely on request, weight is
              what carries hierarchy instead). `font-bold` (700, was
              `font-extrabold`/800) at `text-5xl` (48px, within the
              specified ~40-56px hero range). */}
          <h1 className="text-5xl font-bold tracking-tight text-[#1C1B19] [font-variant:small-caps]">
            {settings.name}
          </h1>
          {/* Fixed copy per explicit request, not `settings.tagline` — this
                  exact sentence replaces whatever the admin-configured tagline
                  would otherwise show here. `text-[#1C1B19]/70` — slightly
                  fainter than the h1 above it. `mt-3` — a bit of buffer
                  between the h1 and this line, on request (they used to
                  sit flush). `leading-relaxed` (1.625) for the gap
                  BETWEEN this paragraph's own wrapped rows — previously
                  tried matching the h1's own line-height RATIO exactly
                  (`leading-none`/`leading-[1.1111]`, tracking text-5xl/
                  text-4xl's default ratio as it changed), but a ratio
                  close to 1 on a small `text-sm` face barely moves the
                  actual pixel gap, so it read as no visible change at
                  all. This is a real, visibly looser gap between rows
                  instead. */}
          <p className="mt-3 text-sm leading-relaxed text-[#1C1B19]/70">
            Community resources for residents, visitors, and hospital patients
          </p>
        </section>

        {/* Right column — search bar band stacked above the map, both
                spanning the same 2/3-width column instead of the title's
                narrower one. `sm:flex sm:flex-col` just stacks the two;
                the search band's own `border-b-0` is the divider between
                them (map has no matching `border-t`, same "only one side
                draws the shared line" rule as everywhere else). ──────── */}
        <div className="sm:flex sm:flex-col">
          {/* ── "What are you looking for?" search bar — used to live in
                  the title cell; now its own band above the map.
                  `settings.heroTitle` (defaults to "What are you looking
                  for?") is back to being the search box's own placeholder
                  text (was a centered label above the pill, before that an
                  external label to its left — on request, moved back
                  inside the pill again). Same admin-editable copy mobile's
                  HeroHeading shows, so the two never drift apart. No
                  border on the pill anymore — just its own white fill/
                  shadow to read as a field. `sm:py-6` (was `sm:py-8`) — a
                  bit shorter, band still has room to breathe around the
                  pill. Background is a soft top-to-bottom gradient (was a
                  flat `#FFFFFF`, then a warm-tone version of this same
                  gradient, `#FAF9F6` -> `#F4F0E8`) — shifted to the cool
                  pale cyan/mint family instead, on request: `#F5FAFA`
                  easing into `#EAF2F2` at this section's bottom edge, so
                  the handoff into the map right below still reads as a
                  gentle transition instead of a hard border line. ────── */}
          {ui.search.landing && (
            <section className="sm:border-b-0 sm:border-[#8FC6CF] sm:bg-[linear-gradient(180deg,#F5FAFA_0%,#EAF2F2_100%)] sm:px-6 sm:py-6">
              <div className="mx-auto w-full max-w-xl">
                {/* `border-slate-300` — the pill had no border at all
                    before, relying only on its shadow to read against this
                    section's own near-white `#FFFFFF` fill; too little
                    contrast for the pill itself to be visible. Icon/
                    placeholder/clear-button grays darkened a step too
                    (`slate-400` -> `slate-500`, hover `slate-600` ->
                    `slate-700`) for the same reason — text-[#1C1B19] stays
                    untouched. */}
                <div className="flex items-center rounded-full border border-slate-300 bg-white pl-4 pr-1.5 py-1.5 shadow-[0_6px_20px_rgb(0,0,0,0.06)] transition-shadow focus-within:shadow-[0_6px_24px_rgb(0,0,0,0.12)]">
                  <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                  </svg>
                  <input
                    id="landing-search-input"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={settings.heroTitle}
                    aria-label={settings.heroTitle}
                    className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-[#1C1B19] placeholder:text-slate-500 focus:outline-none"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      aria-label="Clear filter"
                      className="shrink-0 rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* ── Desktop: matching listings populate directly under the
                      search bar itself now, in this same band, instead of
                      all the way down near Zmanim (where they used to land
                      back when the search box lived up in the title cell).
                      Just the name, as a horizontal row of pills (not the
                      full `PlacesResults` cards the mobile list further
                      down the page still uses — that one's unaffected,
                      `sm:hidden` now so the two never show twice) — they
                      wrap onto more rows as needed, and once there are
                      enough to stack up, the row scrolls (`max-h-28
                      overflow-y-auto`) instead of pushing the map down the
                      page indefinitely. `mt-6` gives this its own breathing
                      room under the pill, so results don't crowd it. Tapping
                      one jumps to wherever it already lives on this same
                      page (the map, or Get Connected) via `focusPlace`
                      instead of navigating away. ─────────────────────── */}
              {placeHits.length > 0 && (
                <div className="mx-auto mt-6 w-full max-w-xl">
                  <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Search results
                  </h2>
                  <div className="flex max-h-28 flex-wrap justify-center gap-2 overflow-y-auto">
                    {placeHits.map((hit) => (
                      <button
                        key={hit.item.id}
                        onClick={() => focusPlace(hit)}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-[#1C1B19] shadow-sm transition-colors hover:border-black hover:bg-slate-50 cursor-pointer"
                      >
                        {hit.item.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── The map — the real full map screen, right on the home screen.
                  Its own category tabs (down the map's left edge) cover
                  browsing by category directly on the map now, so there's no
                  separate "Browse by Category" list beside it anymore.
                  Desktop only: mobile now reaches the same map via its own
                  tab bar entry, so it's dropped from this scroll to avoid
                  showing it twice. The map itself additionally gets its own
                  rounded corners (see ResourceMapView's `embedded` styling)
                  so it doesn't square off flush with this cell's own edges
                  either. ──────────────────────────────────────────────── */}
          {hasMap && (
            <div ref={mapSectionRef} className="scroll-mt-24 sm:bg-[#F0F6F6]">
              <HomeMap
                onNavigate={onNavigate}
                coords={coords}
                focusedListingId={focusedListingId}
                onFocusListingChange={setFocusedListingId}
                focusedCategoryIds={focusedCategoryIds}
                onFocusCategoryChange={toggleCategory}
                categoryItemIdsByCategory={categoryItemIdsByCategory}
                highlightedListingIds={highlightedListingIds}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile-only now: "What are you looking for?" heading + filter —
              desktop hides this whole band since its title was removed and
              its search box moved into the dedicated search section above. ─ */}
      <HeroHeading
        settings={settings}
        query={query}
        onQueryChange={setQuery}
      />

      {/* ── Desktop: "jump to" results — categories/Zmanim/Get Connected
              entries that match the search box's query but no longer have a
              tile of their own (they moved into the map list, the Zmanim
              widget, or Get Connected instead), so this is how the search
              box still reaches them. Now sits BELOW the title/search + map
              row (used to sit between them, back when they were stacked
              instead of side by side). ───────────────────────────────── */}
      {jumpMatches.length > 0 && (
        <div className="mt-6 hidden sm:flex flex-wrap gap-2">
          {jumpMatches.map((card) => (
            <button
              key={card.id}
              onClick={() => {
                if (card.id === 'zmanim') jumpToZmanim()
                else if (card.id!.startsWith('gc:')) jumpToGetConnected()
                else jumpToMapCategory(card.id!)
              }}
              className="inline-flex items-center gap-2 rounded-full border-2 border-[#3a86ff] bg-white px-4 py-2 text-sm font-medium text-[#1C1B19] hover:bg-[#3a86ff] hover:text-white cursor-pointer"
            >
              {card.icon && <span aria-hidden="true">{card.icon}</span>}
              {card.title}
              <span aria-hidden="true" className="text-slate-400">↓</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Empty spacer — a small breathing-room band between the map/
              title row above and "Get Connected" below, on request. Same
              fluid-width shelf column as every other section (not a
              full-bleed break), `#FFFFFF` fill to match its neighbors so
              it reads as part of the same shelf rather than a gap in it. ── */}
      <div className="hidden sm:block sm:h-10 sm:border-x-0 sm:border-[#8FC6CF] sm:bg-[#F0F6F6]" />

      {/* ── "Get Connected" heading — used to be a plain, blank placeholder
              slot reserving room between the map and the actual Get
              Connected content below; now holds that heading instead
              (moved down from inside the Get Connected section itself),
              on request. Same black `border-x`/`border-t` as every other
              desktop section, but `#FFFFFF` fill — matching the search
              bar's own section background, tying the two together.
              `sm:py-3` (was `sm:py-6`, then `sm:py-4`) — shorter, part of
              shrinking the whole Get Connected + Zmanim run of sections so
              they read visibly shorter next to the map above them (see the
              category tile header's own shorter `py-1.5` below it, and
              Zmanim's own shorter padding/font sizes further down).
              `text-3xl` (was `text-2xl`, then `text-xl`) — bumped back up
              and past its original size so this heading reads clearly more
              prominent than the category tiles/item buttons under it
              (`text-sm`), on request. Sans-serif now (the separate serif
              headline face was removed entirely, weight carries hierarchy
              instead) — `font-semibold` (600, was `font-extrabold`/800),
              at `text-3xl` (30px, within the specified ~28-32px section-
              header range). ─────────────────────────────────────────── */}
      <div className="hidden sm:block sm:border-x-0 sm:border-t-0 sm:border-[#8FC6CF] sm:bg-[#F0F6F6] sm:px-6 sm:py-3 sm:text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-[#1C1B19] [font-variant:small-caps]">Get Connected</h2>
      </div>

      {/* ── Get Connected — desktop only, boxed band (same fluid-width
              `<main>` column every other desktop section uses, not a
              full-bleed `w-screen` breakout — the border is this
              section's own boundary, not a line out at the browser edge
              with a gap in
              between) between the map and
              the Zmanim widget (the slot the app's original "Get Connected"
              section held before it was replaced by the top-bar quick-links
              row — see the history comment on `quickLinksCards` above).
              `#FFFFFF` fill (used to be a solid navy panel, then a pale
              blue) — matching the search bar's own section background,
              same as the heading slot right above, and now the same as
              the four category tiles below too (see `CATEGORY_FILL`) — the
              whole band reads as one flat white surface. The four categories below
              (see GetConnectedAccordion) sit edge to edge with no box/
              frame, no divider lines, no top/bottom border of their own
              — border thickness across this whole redesign went to 0 on
              request. `sm:pt-3` — a little buffer between the "Get
              Connected" heading above and the category tiles' own headers,
              on request (was flush/no-`py`, same as every other section,
              before this). ────────────────────────────────────────────── */}
      <div ref={getConnectedSectionRef} className="hidden sm:block scroll-mt-24 sm:border-x-0 sm:border-t-0 sm:border-[#8FC6CF] sm:bg-[#F0F6F6] sm:pt-3">
        <GetConnectedAccordion categories={getConnectedCategories} categoryConfigs={categories} searchQuery={q} />
      </div>

      {/* ── Mobile: original combined grid, grouped into the admin's labeled
              sections — untouched, since mobile has no map to be redundant
              with. ──────────────────────────────────────────────────────── */}
      <section className="mt-12 space-y-10 sm:hidden">
        {q && (filtered?.length ?? 0) === 0 && placeHits.length === 0 && (
          <p className="text-center text-sm text-slate-500">
            Nothing matches “{q}”. Try a different word or clear the filter.
          </p>
        )}
        {loading ? (
          <CardGrid cards={entryCards} loadingCount={6} />
        ) : (
          sections.map((s) => (
            <div key={s.title}>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">{s.title}</h2>
              <CardGrid cards={s.cards} />
            </div>
          ))
        )}
      </section>

      {/* ── Matching places (individual listings within the cards) — mobile
              only now; desktop shows this same list right under its own
              search bar instead (see the search band above). ───────────── */}
      {placeHits.length > 0 && (
        <div className="sm:hidden">
          <PlacesResults hits={placeHits} onOpen={openPlace} />
        </div>
      )}

      {/* ── Empty spacer — a small breathing-room band between Get
              Connected above and Zmanim below, on request. Same treatment
              as the spacer above Get Connected's own heading. ────────── */}
      <div className="hidden sm:block sm:h-10 sm:border-x-0 sm:border-[#8FC6CF] sm:bg-[#F0F6F6]" />

      {/* ── Zmanim widget — live candle-lighting/Havdalah times, replacing the
              plain Zmanim tile that used to sit in the grid above. Desktop
              only: mobile keeps its Zmanim tile in the combined grid. Same
              boxed-within-fluid-`<main>` treatment as the map section
              (not a full-bleed `w-screen` breakout — the border is this
              section's own boundary, not a line out at the browser edge
              with a gap in between). Unlike every OTHER section, this one
              gets `sm:py-4` (was `sm:py-6`) on top of its existing
              `sm:px-6` — a buffer on all four sides between `ZmanimWidget`
              and this box's own
              border instead of sitting flush against it (which shrinks
              the widget's own effective width/height a little, same as
              padding always does to whatever it wraps — not a separate
              size change on the widget itself, which has no fixed
              dimensions of its own to begin with). `ZmanimWidget` assumes
              a light background (dark text, no card of its own), which
              matches this section's own `#EAF2F2` fill (the search bar
              and Get Connected sections above are `#FFFFFF` now instead —
              this one just needs A light background, not specifically
              that same one), so it doesn't
              need its own separate white card wrapper. THIS is the last
              section in the group, so it alone also closes the frame with
              its own `border-b` + `rounded-b-2xl` — the curved corners
              belong to the whole shelf unit's bottom edge, not to this
              section individually (see the matching `rounded-t-2xl` on
              the first one, the top bar, above). `sm:border-t-0` — back
              to 0 (was briefly a visible `2px` teal divider at the seam
              with Get Connected above, undone on request), matching every
              other section's border width. ─────────────────────────── */}
      <div ref={zmanimSectionRef} className="hidden sm:block scroll-mt-24 sm:overflow-hidden sm:rounded-b-2xl sm:border-x-0 sm:border-t-0 sm:border-b-0 sm:border-[#8FC6CF] sm:bg-[#EAF2F2] sm:px-6 sm:py-4">
        <ZmanimWidget coords={coords} locationLabel="Your location" title={zmanimCategory?.pluralLabel} />
      </div>
    </main>
    </div>
  )
}
