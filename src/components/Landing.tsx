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
// Groups) — `#C5E5E9`, the "Philly Jewish Guide" title's own pale cyan
// (was a near-white `#FBFBFD`/`#F6FAFB`, before a long lineage of other
// flat colors, see git history) — on request, extends the heading/padding
// bands' own color all the way through the tile grid area too, instead of
// stopping short at a different near-white fill right behind the buttons.
// Same color as the containing Get Connected section itself (heading +
// this tile grid) so the whole run reads as one continuous tinted band —
// the individual item cards (see GetConnectedAccordion) sit on top of it,
// each in their own column's accent color now instead of plain white. The
// map area above keeps its own separate `#F0F6F6` — this request was
// scoped to "What are you looking for" and "Get Connected" only.
const CATEGORY_FILL = '#C5E5E9'

// One accent color per Get Connected column (Support & Volunteering,
// Professional Networks, Social Opportunities, WhatsApp Groups, in that
// fixed order — see `getConnectedCategories` below), on request — each
// column's own header/item-border/arrow all pick up its color, so the
// four read as distinct at a glance instead of one uniform gray. All four
// sit in the same cool teal/blue/green/violet family as the sidebar's own
// `#C5E5E9`->`#8FC6CF` gradient (see the title `<section>` below) —
// `#2E7D8C` is that same teal, just darkened enough to work as TEXT (the
// pastel gradient itself doesn't clear 4.5:1 on a light background) — the
// other three are analogous/complementary hues at a matching darkness so
// none of the four reads louder than the others.
const GET_CONNECTED_ACCENTS = ['#2E7D8C', '#3B5F8A', '#3D8464', '#6B5490']

// Header-only darkened variants of the four accents above — needed once
// `CATEGORY_FILL` (the header/tile-grid background) became the saturated
// `#C5E5E9` pale cyan instead of a near-white fill, on request: at that
// point neither the 65%-opacity `accentSoft` (2.1-2.6:1) nor even the
// solid accents themselves (three of four still under 4.5:1 against
// `#C5E5E9`) held up as header TEXT anymore. Teal/green darkened further
// here to clear 4.5:1; blue/violet were already there and are repeated
// unchanged. Only the header text uses these — the item border/arrow
// still use `accentSoft` against the button's own near-white fill, which
// never changed and is unaffected.
const GET_CONNECTED_HEADER_ACCENTS = ['#276B78', '#3B5F8A', '#336E53', '#6B5490']

// `rgba(var(--accent-rgb), alpha)` needs "r, g, b" (see each item button's
// own `style` below) — Tailwind's arbitrary-value `bg-[rgba(...)]` classes
// can reference a CSS custom property directly, but only as a plain
// number list, not a hex string, hence this conversion.
function hexToRgbString(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

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
  focusItemId,
}: {
  categories: GetConnectedCategory[]
  categoryConfigs: CategoryConfig[] | null
  /** The home page's own top search bar query — matched item rows get a
   *  gold highlight (see `isMatch` below), the same accent color used to
   *  mark matching pins on the map, so a search result stands out
   *  wherever it already lives on the page. */
  searchQuery?: string
  /** Set (and immediately cleared by the caller) when a top-search-bar
   *  result whose item lives in this section is tapped — on request,
   *  expands that exact item's own panel in place instead of just
   *  scrolling here and leaving the visitor to find it themselves. */
  focusItemId?: string | null
}) {
  const [embeddedFlow, setEmbeddedFlow] = useState<'support' | 'volunteer' | null>(null)
  const [detailItemId, setDetailItemId] = useState<string | null>(null)
  const matchQuery = searchQuery?.trim().toLowerCase() ?? ''

  // Reacts to `focusItemId` changing by adjusting state DURING render
  // (React's own recommended pattern for "derive/reset state from a prop
  // change" — see react.dev/learn/you-might-not-need-an-effect) rather than
  // in a `useEffect`, which would call setState synchronously mid-effect
  // and trigger an extra cascading render.
  const [lastFocusItemId, setLastFocusItemId] = useState(focusItemId)
  if (focusItemId !== lastFocusItemId) {
    setLastFocusItemId(focusItemId)
    const item = focusItemId ? categories.flatMap((cat) => cat.items).find((it) => it.id === focusItemId) : undefined
    if (item?.embed) {
      setDetailItemId(null)
      setEmbeddedFlow(item.embed)
    } else if (item?.detail) {
      setEmbeddedFlow(null)
      setDetailItemId(item.id)
    }
  }

  return (
    <>
    {/* No more `divide-x`/`divide-black` column rule — border thickness
        across this whole redesign went to 0 on request, so that divider was
        already invisible; dropped the class entirely rather than keep a
        dead one. No `subgrid`/shared row-track list anymore either (was
        used to line item N up across all four columns) — dropped on
        request so each column's own height is fully independent: when one
        item's expand panel grows, ONLY that column gets taller, instead of
        subgrid forcing every column's same row index to grow together
        (blank space in the others, even though nothing in them changed).
        `items-start` on this grid keeps the shorter columns from
        stretching to match the tallest one — same "blank space trails at
        the bottom of a shorter column" look this section already had for
        categories with fewer items than others, now also covering "a
        column got taller because something in it expanded" the same way.
        The trade-off: item N no longer strictly aligns row-for-row across
        columns in the resting state the way subgrid guaranteed — a minor
        one, since every item button is normally the same uniform height
        anyway. */}
    <div className="grid w-full grid-cols-4 items-start" style={{ backgroundColor: CATEGORY_FILL }}>
      {categories.map((cat, catIndex) => {
        const embedItem = cat.items.find((it) => it.embed && it.embed === embeddedFlow)
        const detailItem = cat.items.find((it) => it.detail && it.id === detailItemId)
        const detailCategory = detailItem?.detail ? categoryConfigs?.find((c) => c.id === detailItem.detail!.category) : undefined
        const hasSecondBox = !!embedItem || !!(detailItem?.detail && detailCategory)
        // One fixed accent per column position (see GET_CONNECTED_ACCENTS'
        // own doc comment) — colors the header text, each item's left
        // border, and its arrow glyph below, on request.
        const accent = GET_CONNECTED_ACCENTS[catIndex % GET_CONNECTED_ACCENTS.length]
        const accentRgb = hexToRgbString(accent)
        // The border/arrow uses of `accent` (NOT the background tints
        // below, which are already very light) at 65% opacity instead of
        // solid, on request — a softer, more pastel read instead of the
        // fully-saturated hex. Sits on the item button's own near-white
        // fill, unaffected by `CATEGORY_FILL` below.
        const accentSoft = `rgba(${accentRgb}, 0.65)`
        // Header text specifically uses the darker, contrast-vetted
        // variant (see GET_CONNECTED_HEADER_ACCENTS' own doc comment) —
        // it sits directly on `CATEGORY_FILL`, unlike the border/arrow
        // above, so it needs its own solid, darker color to stay readable.
        const headerAccent = GET_CONNECTED_HEADER_ACCENTS[catIndex % GET_CONNECTED_HEADER_ACCENTS.length]

        return (
          <div key={cat.id} className="flex min-w-0 flex-col">
            {/* Same size as the item buttons below (`text-sm`) but bold +
                uppercase + tracking-wider so it still reads as a heading,
                and much smaller than the "Get Connected" heading above
                the whole group (`text-3xl`) — that gap stays unambiguous.
                `py-1.5` (was
                `py-3`, then `py-2`) — shorter again, part of shrinking the
                whole Get Connected + Zmanim run of sections next to the
                map. Forced two lines via `twoLineTitle` (see above). Now
                colored per-column (`accent`, see GET_CONNECTED_ACCENTS)
                instead of one shared `#2B3B3B` muted teal, on request — all
                four accents were picked/darkened to clear 4.5:1 against
                CATEGORY_FILL the same way that shared teal already did.
                `font-semibold` (600, was `font-medium`/500, briefly
                `font-bold`/700 before that) — bumped back up a step, on
                request: the 65%-opacity `accentSoft` reads too faint/washed
                on its own, so the extra weight does contrast work too. A
                text-shadow was tried alongside it but removed again on
                request — weight alone carries it. Color is
                `headerAccent` (a further-darkened variant, NOT the plain
                `accent`/`accentSoft` the border/arrow use below) — needed
                once `CATEGORY_FILL` became the saturated `#C5E5E9`; see
                `GET_CONNECTED_HEADER_ACCENTS`' own doc comment. */}
            <div className="px-3 py-1.5 text-center text-sm font-semibold uppercase tracking-wider" style={{ color: headerAccent }}>
              {twoLineTitle(cat.title).map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </div>
            {cat.items.length > 0 ? (
              // Plain block list now — was `contents` (invisible to layout,
              // so `<li>`s became direct subgrid children of the parent
              // above); no longer needed now that this column just stacks
              // its own items normally, independent of the other columns.
              <ul>
                {cat.items.map((item) => {
                  const isOpen = (item.embed && item.embed === embeddedFlow) || (item.detail && item.id === detailItemId)
                  const isMatch = matchQuery.length > 0 && item.label.toLowerCase().includes(matchQuery)
                  // Same "bold name + muted gray subtitle underneath" card
                  // recipe as the map's own search dropdown rows (see
                  // ResourceMapView.tsx's `mergedListRows` list) — on
                  // request, so this section reads as the same visual
                  // language instead of an older, separate "bordered pill"
                  // style. Only items backed by a real listing (`detail`,
                  // e.g. Professional Networks/Social Opportunities/
                  // WhatsApp Groups) have an address to show; the static
                  // Support/Volunteer "Interest Form" entries have nothing
                  // natural to put there, so they just render without one
                  // (same `subtitle && (...)` conditional the map list uses).
                  const subtitle = item.detail?.address
                  // Only meaningful when `isOpen` and `item.detail` — the
                  // category config the expand panel below needs to render
                  // this item's own GenericListingCard.
                  const itemDetailCategory = item.detail ? categoryConfigs?.find((c) => c.id === item.detail!.category) : undefined
                  return (
                    <li key={item.id} className="flex flex-col px-1.5 py-1">
                      <button
                        onClick={() => {
                          // Clears the OTHER piece of state first — `embeddedFlow`
                          // and `detailItemId` used to be independent, so clicking
                          // e.g. a `detail` item while an `embed` item was open
                          // left `embeddedFlow` still set too; `openItem`'s `.find()`
                          // would then match whichever type happened to come first
                          // in DOM order, not necessarily the one just clicked, so
                          // the old panel sometimes didn't go away. Clearing the
                          // other one here guarantees at most one is ever open,
                          // and it's always the one just clicked, on request.
                          if (item.embed) {
                            setDetailItemId(null)
                            setEmbeddedFlow((prev) => (prev === item.embed ? null : item.embed!))
                          } else if (item.detail) {
                            setEmbeddedFlow(null)
                            setDetailItemId((prev) => (prev === item.id ? null : item.id))
                          } else {
                            item.go()
                          }
                        }}
                        // Card treatment, on request ("read as cards rather
                        // than form fields"): `px-4` (16px, was `px-3`/
                        // 12px) for more internal breathing room. `py-2`
                        // (8px) — vertical padding specifically reverted
                        // back to its pre-this-pass height on request (was
                        // briefly `py-3.5`/14px). A `4px` left border in
                        // this column's own `accent` color (see
                        // `GET_CONNECTED_ACCENTS`) on every state instead of
                        // a uniform gray ring on all four sides. Resting
                        // fill is `#fefefe` (near-white, on request — was
                        // briefly this same accent at ~7% opacity), rising
                        // to ~15% of the accent on hover
                        // (`hover:bg-[rgba(var(--accent-rgb),0.15)]`) — a
                        // CSS custom property is how Tailwind's arbitrary
                        // `bg-[rgba(...)]` classes can reference a color
                        // that's only known at render time (this button's
                        // own per-column accent), the same technique
                        // `ResourceMapView.tsx`'s `--accent`-based checkbox
                        // accents already use elsewhere in this codebase.
                        // `hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]` (was
                        // `hover:shadow-lg`) — a lighter, more precise lift
                        // shadow, on request, paired with the existing
                        // `hover:-translate-y-0.5` for the actual motion.
                        // `shadow-[0_1px_3px_rgb(0,0,0,0.16)]` at rest is
                        // unchanged from before this pass. A search match
                        // keeps the same gold accent the map's matching pins
                        // do (see ResourceMap's `highlighted`) — the one
                        // functional (not decorative) color exception, still
                        // wins over the column accent since it's a shared
                        // system, not this section's own branding. "Open"
                        // similarly stays its own neutral state (wins over
                        // both), and the "every other item dims" treatment
                        // once something IS open also stays neutral gray —
                        // none of those three states are the "plain
                        // outlined rectangle" resting look this request was
                        // about, so all three are unchanged. `group` — lets
                        // the arrow glyph below react to hover on this
                        // whole button (see its own `group-hover` below),
                        // not just its own individual hover.
                        style={{ '--accent-rgb': accentRgb, borderLeftColor: accentSoft } as React.CSSProperties}
                        className={`group flex w-full flex-col items-stretch gap-0.5 rounded-lg border-l-4 px-4 py-2 text-left shadow-[0_1px_3px_rgb(0,0,0,0.16)] ring-1 transition-all duration-150 ease-out cursor-pointer hover:-translate-y-0.5 ${
                          isOpen
                            ? 'ring-2 ring-black bg-slate-100 text-[#2D3636] hover:shadow-lg'
                            : isMatch
                              ? 'ring-2 ring-[#ffc145] bg-amber-50 text-[#2D3636] hover:shadow-lg'
                              : // Once something in this list is open, every OTHER
                                // item dims — the same "one item stands out, the
                                // rest recede" read the two-item Support &
                                // Volunteering list already had by virtue of only
                                // having one alternative to compare against. Left
                                // as a muted gray on purpose (not black) — dimming
                                // is the whole point of this state.
                                hasSecondBox
                                ? 'ring-slate-900/5 bg-white text-slate-300 hover:text-slate-500 hover:shadow-lg'
                                : 'ring-slate-900/5 bg-[#fefefe] text-[#2D3636] hover:bg-[rgba(var(--accent-rgb),0.15)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
                        }`}
                      >
                        <span className="flex items-center">
                          {item.icon && <span aria-hidden="true" className="mr-1.5">{item.icon}</span>}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
                          {/* Small right-aligned arrow, on request — reinforces
                              that every one of these rows leads somewhere
                              (a wizard, a listing's detail, or a full page)
                              instead of just being static text. `shrink-0`
                              so it never gets squeezed by a long label. Now
                              spins instead of sliding, on request: points
                              right at rest, rotates to point DOWN on hover
                              (`group-hover:rotate-90`, the button's own
                              `group`, see above) — "you can open this" —
                              and to point UP once actually open (`isOpen`,
                              `-rotate-90`, wins over the hover state) —
                              "click to close." `stroke="currentColor"`
                              reads its color from `style` below, set to
                              this column's `accent` ONLY in the plain
                              resting state — left `undefined` (inheriting
                              the parent text color as before) for
                              isOpen/isMatch/dimmed, so the accent doesn't
                              fight those states' own neutral-gray/gold/
                              black meaning. */}
                          <svg
                            style={!isOpen && !isMatch && !hasSecondBox ? { color: accentSoft } : undefined}
                            className={`ml-1.5 h-3 w-3 shrink-0 opacity-60 transition-transform duration-150 ${isOpen ? '-rotate-90' : 'group-hover:rotate-90'}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.2}
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                        {subtitle && (
                          <span className={`truncate text-xs font-normal ${isOpen || isMatch ? 'text-slate-500' : hasSecondBox ? 'text-slate-300' : 'text-slate-400'}`}>
                            {subtitle}
                          </span>
                        )}
                      </button>
                      {/* Expand panel — populates right under THIS item,
                          inside its own column, in normal flow (was
                          `position: absolute` briefly) — now that this
                          column is no longer subgrid-locked to the others
                          (see the grid wrapper's own comment above), growing
                          it in-flow only makes THIS column taller; the other
                          three are completely unaffected, on request. That
                          also means the section around it grows to fit
                          naturally, no bounded `max-h`/scroll needed
                          anymore — on request, so a tall form or listing
                          card isn't awkwardly capped. `grid-template-rows`
                          `0fr`/`1fr` is a CSS-only smooth open/close
                          animation trick (animating `height: auto` directly
                          isn't possible) — safe to use in-flow again since
                          it no longer touches any shared subgrid track. */}
                      <div
                        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                      >
                        <div className="overflow-hidden">
                          <div className="mt-1.5 rounded-md border border-slate-200 bg-white">
                            {/* "Expand on new page" — on request, for BOTH
                                kinds of panel (was embed-only). `item.go()`
                                is the exact full-screen navigation every
                                non-embed/non-detail item already falls back
                                to on click; surfaced here as an explicit
                                escape hatch out of the inline version too. */}
                            {isOpen && (
                              <div className="flex justify-end border-b border-slate-100 px-3 py-1.5">
                                <button
                                  onClick={() => item.go()}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-[#2D3636] cursor-pointer"
                                >
                                  Expand on new page
                                  <span aria-hidden="true">↗</span>
                                </button>
                              </div>
                            )}
                            {isOpen && item.embed ? (
                              item.embed === 'support' ? (
                                <SupportWizard variant="inline" onClose={() => setEmbeddedFlow(null)} />
                              ) : (
                                <VolunteerWizard variant="inline" onClose={() => setEmbeddedFlow(null)} />
                              )
                            ) : isOpen && item.detail && itemDetailCategory ? (
                              <div className="p-3">
                                <GenericListingCard
                                  item={item.detail}
                                  category={itemDetailCategory}
                                  upvotes={!!itemDetailCategory.upvotesEnabled}
                                  count={item.detail.upvotes ?? 0}
                                  expanded
                                  dense
                                  hideBorder
                                  hideName
                                  highlightColor="#000000"
                                  linkAccentColor={accent}
                                  onVote={() => {}}
                                  onTagClick={() => {}}
                                  onFilterOpen={() => {}}
                                  onFilterBool={() => {}}
                                  onFilterSelect={() => {}}
                                  onEdit={() => item.go()}
                                  onReport={() => item.go()}
                                  onExpandedChange={(next) => { if (!next) setDetailItemId(null) }}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              // `slate-800` — darkened a few steps from an original
              // `slate-400` across this tile's fill changing colors several
              // times (see CATEGORY_FILL); clears ~11:1 against the
              // current `#C5E5E9` fill, comfortably past WCAG AA.
              <p className="px-4 py-2 text-sm italic text-slate-800">Coming soon</p>
            )}
          </div>
        )
      })}
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
 *  darkens AND reveals a "Browse Resources" label beside it (grown open
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
function HamburgerMenu({ resources, collapsed }: { resources: CardDef[] | null; collapsed?: boolean }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Closes the panel (not just hides the trigger) once the title column
  // collapses out from under it while dragging — on request ("that can
  // also disappear as the slide expands"). During render, not an effect
  // (React's own recommended pattern for "adjust state when a prop
  // changes" — see the matching comment on GetConnectedAccordion's
  // `focusItemId` handling above).
  const [lastCollapsed, setLastCollapsed] = useState(collapsed)
  if (collapsed !== lastCollapsed) {
    setLastCollapsed(collapsed)
    if (collapsed && open) setOpen(false)
  }

  return (
    <>
      {/* The trigger — a faint right-pointing arrow in this box's own
          top-left corner (not a hamburger icon, not out in the margin).
          Low-opacity until hovered, when it darkens and reveals the
          "Browse Resources." label beside it. Hidden entirely once
          `collapsed` (the title column dragged too narrow for it to sit
          in cleanly, see Landing's own `titleColWidth`) — on request,
          rather than just letting the section's `overflow-hidden` clip it
          part-way, which read as sticking out/getting cut off awkwardly
          instead of cleanly disappearing the way the title text does. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Browse resources"
        aria-expanded={open}
        className={`group absolute left-2 top-2 z-30 hidden items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-2.5 text-[#2D3636]/50 transition-colors cursor-pointer hover:bg-slate-100 hover:text-[#2D3636] ${collapsed ? '' : 'sm:flex'}`}
      >
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="pointer-events-none max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold uppercase tracking-widest opacity-0 transition-all duration-300 group-hover:max-w-[10rem] group-hover:opacity-100">
          Browse Resources
        </span>
      </button>

      {/* Neither the backdrop nor the panel itself renders at all once
          `collapsed` — on request: the panel's own header row ("Browse" +
          a close ✕) doesn't shrink below its own content's natural width,
          so on a badly narrowed title column it could render wider than
          the (nearly-zero-width) section actually meant to contain it —
          visibly spilling out over the map/search area beside it instead
          of staying clipped inside. `collapsed` already force-closes
          `open` above, which handles this for any panel that was ALREADY
          open before narrowing past the threshold; not rendering the
          nodes at all here is the belt-and-suspenders version, in case
          the panel could otherwise still flash open mid-narrow. */}
      {!collapsed && (
        <>
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
          <h2 className="text-lg font-semibold text-[#2D3636]">Browse</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#2D3636] hover:bg-slate-100 cursor-pointer"
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
                className="block w-full px-5 py-3 text-left text-sm font-medium text-[#2D3636] hover:bg-slate-50 cursor-pointer"
              >
                {card.title}
              </button>
            ))}
          </nav>
        )}
      </div>
        </>
      )}
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
  // Ported from the map's own search bar (`ResourceMapView`'s
  // `sortByDistance`/`listCollapsed`), on request — "Sort by distance"
  // re-orders `placeHits` below by `milesFromAddress` instead of relevance;
  // the collapse toggle tucks the results away without losing the query,
  // same as the map's own chevron does for its dropdown.
  const [sortByDistance, setSortByDistance] = useState(false)
  const [resultsCollapsed, setResultsCollapsed] = useState(false)
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
  // Set by `focusPlace` below when a top-search-bar result whose item lives
  // in Get Connected is tapped — `GetConnectedAccordion` watches this and
  // expands that exact item's own panel, on request.
  const [focusGetConnectedId, setFocusGetConnectedId] = useState<string | null>(null)
  // Draggable divider between the title column and the (search+map) column
  // — on request, so the title can be dragged toward the left edge to
  // shrink/hide it and give the map/search area more room, instead of
  // that column staying a permanently fixed width. The handle can drag it
  // anywhere from fully collapsed (`0`) up to this max width, never wider
  // — this is a "give room to the map" control, not a general
  // resize-wider one. `210` (was `230`, matching the column's original
  // fixed `14.4rem`) — narrowed slightly on request, to accommodate the
  // title's own font-size shrinking from 51px to 40px.
  const TITLE_COL_MAX_WIDTH = 210
  // How far left of the actual divider line the drag handle renders — on
  // request, so its circular hit target sits beside the line instead of
  // straddling/intersecting it. Purely a rendering offset (see the handle's
  // own `style={{ left: ... }}` below); doesn't affect the drag math itself,
  // which still tracks the real `titleColWidth`/divider position exactly.
  const TITLE_COL_HANDLE_OFFSET = 6
  const [titleColWidth, setTitleColWidth] = useState(TITLE_COL_MAX_WIDTH)
  const titleColDragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const handleTitleColDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    titleColDragRef.current = { startX: e.clientX, startWidth: titleColWidth }
    const onMove = (ev: MouseEvent) => {
      if (!titleColDragRef.current) return
      const delta = ev.clientX - titleColDragRef.current.startX
      setTitleColWidth(Math.min(TITLE_COL_MAX_WIDTH, Math.max(0, titleColDragRef.current.startWidth + delta)))
    }
    const onUp = () => {
      titleColDragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
  // True once there's no more room for the drag handle to sit to the LEFT
  // of the divider at its usual `TITLE_COL_HANDLE_OFFSET` without going
  // negative — past this point the handle flips to the right side of the
  // line and its arrow points right instead of left, on request (see the
  // handle's own doc comment further down for the full reasoning).
  const titleColHandleCollapsed = titleColWidth <= TITLE_COL_HANDLE_OFFSET
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
  const q = query.trim()
  const loading = !q && allCards === null
  const filtered = q && allCards ? allCards.filter((c) => cardMatches(c, q)) : allCards

  // Individual places that match the query by name + tags (e.g. a grocery store
  // with a "cheese" tag for "kosher cheese"). Only computed once the visitor types.
  // Sorted by distance instead of relevance when `sortByDistance` is on
  // (ported from the map's own search bar, on request) — `searchListings`
  // already stamps `milesFromAddress` per hit whenever `coords` is set, so
  // this is a pure re-sort, no extra distance computation needed. Hits with
  // no distance (no `coords` yet, or a category `searchListings` doesn't
  // stamp) sort to the end rather than jumbling in as `0 mi`.
  const rawPlaceHits = q && listings ? searchListings(listings, categories ?? [], q, coords) : []
  const placeHits = sortByDistance
    ? [...rawPlaceHits].sort((a, b) => (a.item.milesFromAddress ?? Infinity) - (b.item.milesFromAddress ?? Infinity))
    : rawPlaceHits
  // Same matches, as an id set — marks their pins on the map (see HomeMap/
  // ResourceMapView's `highlightedListingIds`) so a search result stands
  // out where it already lives on the page, not just in the separate
  // "Search results" list below.
  const highlightedListingIds = new Set(placeHits.map((h) => h.item.id))
  // Splits the same `placeHits` list into groups by where clicking one
  // actually lands (see `focusPlace` below), on request — mirrors its exact
  // three branches so the grouping headers below never drift out of sync
  // with what tapping a result really does. Most hits land in `mapHits`;
  // `otherHits` (falls through to `openPlace`'s full navigate) is rare in
  // practice — e.g. a category with listings but no Map/Get Connected
  // presence — but handled so nothing silently vanishes from either group.
  const mapHits = placeHits.filter((h) => onMapCardIds.has(h.item.category))
  const getConnectedHits = placeHits.filter((h) => h.item.category === 'whatsapp' || h.item.category === 'young-professional')
  const otherHits = placeHits.filter((h) => !onMapCardIds.has(h.item.category) && h.item.category !== 'whatsapp' && h.item.category !== 'young-professional')

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
  // one, same mechanism `ResourceMapView`'s own "jump to" results use) —
  // ALSO adds its category to `focusedCategoryIds` now (on request), since
  // `ResourceMapView`'s own detail panel only resolves `focusedItem` when
  // BOTH `focusedListingId` AND that category are set (see its own
  // `focusedItem` computation) — without this, the pin would pan into view
  // but never actually expand. Added, not swapped in (`toggleCategory`
  // would also reset `focusedListingId` right back to null, undoing the
  // line above it), so it doesn't clear whatever categories were already
  // isolated, same "only ever turn ON" rule `jumpToMapCategory` follows.
  // WhatsApp/young-professional listings (Get Connected's Professional
  // Networks/Social Opportunities/WhatsApp Groups columns) set
  // `focusGetConnectedId` instead — `GetConnectedAccordion` watches that
  // prop and opens the matching item's own panel itself. Anything else
  // falls back to `openPlace`'s full navigate.
  const focusPlace = (hit: (typeof placeHits)[number]) => {
    if (onMapCardIds.has(hit.item.category)) {
      setFocusedCategoryIds((prev) => (prev.has(hit.item.category) ? prev : new Set(prev).add(hit.item.category)))
      setFocusedListingId(hit.item.id)
      mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (hit.item.category === 'whatsapp' || hit.item.category === 'young-professional') {
      setFocusGetConnectedId(hit.item.id)
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
    // `sm:pt-[19px] sm:pb-8` extends that same fill along the top and
    // bottom too (the top row's own `mt-8` moved here so the two don't
    // stack into a double-size gap; the bottom used to have none at all,
    // since `<main>` itself has `sm:pb-0`). Top was `14`, halved to `7`,
    // then cut to about 2/3 of THAT (`28px` -> `~19px`) on request — bottom
    // stays as it was, this was about the top/side margins specifically,
    // not the whole shelf shifting.
    <div className="sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#2D3636] sm:pt-[19px] sm:pb-8">
    {/* `px-4 sm:px-6` is a FIXED margin now (not `max-w-6xl mx-auto`,
            which let the page's max width stay capped while all the
            extra viewport width just piled up into bigger and bigger
            side margins) — on request, so expanding/shrinking the
            browser window keeps this margin exactly the same size and
            lets the bordered sections themselves grow into the freed-up
            space instead. `sm:px-6` (was `sm:px-12`, half), then `sm:px-4`
            (about 2/3 of THAT — 24px -> 16px) — on request, the desktop
            margin read too thick. */}
    <main className="px-4 pb-24 sm:pb-0">
      {/* ── Top bar, SIDE BY SIDE with (search bar + map) (used to each be
              their own full-width stacked bands). Title column WIDTH is now
              draggable (`titleColWidth`, was a permanently fixed `14.4rem`)
              — on request, so the divider between it and the map can be
              dragged toward the left edge to shrink/hide the title and give
              the map/search area more room, all the way down to fully
              collapsed. `14.4rem` (`TITLE_COL_MAX_WIDTH` = 230px) is now
              just the drag range's own upper bound, restored on load. The
              search bar used to live in the title cell too; it's now its
              own band stacked ABOVE the map, spanning that same flexible
              column instead of the title's fixed one.
              The vertical line between the title and the (search+map)
              column — i.e. directly to the left of "What are you looking
              for" and the map beneath it — is the right column's own
              `sm:border-l-2` now (see its own doc comment; was
              `sm:divide-x-2` here on the wrapper, moved once the drag
              handle below became a 3rd DOM child and broke that utility's
              "every child but the first" assumption), colored `#E8E8E8`
              (a light neutral gray, was the dark charcoal `#2D3636` — the
              page's own outer margin background, unaffected, is still that
              same charcoal via the `sm:bg-[#2D3636]` wrapper above; only
              the borders themselves lightened) — the drag handle (below)
              renders right on top of that same line. Every border across
              the whole shelf (interior dividers and the outer frame alike)
              is a uniform 2px now, on request — while `sm:border-x-[2px]`/
              `sm:border-t-[2px]` on this wrapper frame the row's own outer
              edges at that same weight. Falls back to a single column (just
              the title) when there's no map (`hasMap` false) rather than
              leaving an empty second cell. `sm:rounded-t-2xl`+
              `sm:overflow-hidden` on the wrapper (not any piece
              individually) rounds the row's combined top corners as one
              shape — the same "curved edges belong to the group, not each
              piece" rule the rest of the page's borders follow (see Get
              Connected's matching bottom corners below). The gap holding
              it off the very top of the page now comes from the outer
              wrapper's own `sm:py-8` (see above), not a margin here.
              `border-x-[2px]`/`border-t-[2px]` at `#E8E8E8` (light
              gray) — every other section's own border below matches.
              This whole row is now nested one level deeper than before —
              a new `sm:relative` OUTER wrapper (below) that does NOT clip
              its own contents (unlike the `sm:overflow-hidden` grid div
              still directly below it, kept for the rounded-corner clip)
              holds the drag handle as its own sibling, out from under that
              clip — on request, the handle used to live INSIDE the
              `overflow-hidden` grid div and rendered at a position that
              went negative/near-zero once the title mostly collapsed,
              getting clipped away and becoming impossible to grab again
              for a second drag. ──────────────────────────────────────── */}
      <div className="hidden sm:relative sm:block">
      <div
        className={`sm:grid sm:overflow-hidden sm:rounded-t-2xl sm:border-x-[2px] sm:border-t-[2px] sm:border-[#E8E8E8] ${hasMap || ui.search.landing ? '' : 'sm:grid-cols-1'}`}
        style={hasMap || ui.search.landing ? { gridTemplateColumns: `${titleColWidth}px 1fr` } : undefined}
      >
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
        {/* Left-to-right near-white gradient, `#fefefe`->`#E6E6E6` — held
            flat at `#fefefe` through the first 65% (was transitioning
            evenly across the full width from 0%, on request — "more of
            the fefefe should show"), only actually gradating over the
            remaining stretch toward the right edge. (Was `#FBFBFD`->
            `#E5E5EA`, before that `#F5F5F7`->`#FBFBFD` — flipped and given
            more contrast between the two stops, on request, so the darker
            end lines up with the section's own right-edge inset shadow
            (`shadow-[inset_-6px ...]` below, which reads on that same
            right/interior-seam edge) instead of fighting it from the
            lighter end.) Before that:
            pale blue into soft teal, `#C5E5E9`->`#8FC6CF` — swapped with
            "What are you looking for?"/"Get Involved"'s own near-white
            gradient on request; those two now carry the blue/teal instead,
            see their own sections below. Before the blue/teal: flat
            `#ABE4ED`, before that flat `#C7F2D7`, before that flat
            `#FBFBFD`, before that flat `#fefefe`, before that a
            left-to-right white->cyan `linear-gradient`, before that flat
            `#fefefe`, before that a teal `linear-gradient`. */}
        {/* Found the actual "stops shrinking partway" bug via a real drag
            (Playwright), not just reasoning about it: this section's own
            `px-6`/`py-8` padding turned out to be a hard floor no CSS
            `min-width` can override — a border-box element apparently
            can't render narrower than its own padding sum (24px * 2 =
            48px here) in this browser, regardless of `min-width: 0`
            explicitly set (confirmed: forcing `min-width:0` directly had
            zero effect; forcing `padding:0` directly dropped it straight
            to the track's real 30px). So the section physically couldn't
            render narrower than 48px no matter how far `titleColWidth`
            (the grid TRACK) kept shrinking past that, and once the track
            dropped below 48px the section started overflowing past its
            own track boundary, bleeding into the search bar column beside
            it — exactly the "stops expanding, leaves a strip of blue"
            symptom. Fix: the padding moved OFF this grid-item section
            entirely (down onto the fixed-width inner wrapper below,
            which doesn't participate in grid track sizing) — this
            section itself now has zero padding of its own, so it has
            nothing preventing it from reaching a genuine 0. */}
        {/* `sm:justify-center` (was briefly `sm:justify-start` for the
            "premium panel" top-anchored look, reverted back on request —
            "center those vertically") — the Title/Tagline block now floats
            vertically centered again in whatever height the (much taller)
            map/search column beside it leaves free, same as before that
            experiment. */}
        <section className="sm:relative sm:flex sm:flex-col sm:justify-center sm:overflow-hidden sm:min-w-0 sm:bg-[linear-gradient(90deg,#fefefe_0%,#fefefe_65%,#E6E6E6_100%)] sm:shadow-[inset_-6px_0_6px_-6px_rgba(0,0,0,0.15)]">
          {/* `< 100` (was `< 60`) — the real constraint isn't just "does the
              trigger itself still fit," it's "does the drag handle's own
              position ever land inside the hamburger's hover-triggered
              footprint" (its collapsed icon alone reaches ~48px from the
              left edge; the handle sits at `titleColWidth - 16`). At the
              old `60` threshold the handle was still at `44` right as the
              hamburger became hidden — inside that footprint, not clear of
              it — so hovering the handle could still trigger the
              hamburger's OWN `group-hover` label reveal underneath/beside
              it (the "Browse Resources" snippet bug). `100` puts the
              handle at `84` by the time the hamburger hides, comfortably
              past its collapsed edge. */}
          {/* Zmanim dropped from this list specifically, on request — it
              already has its own always-visible section further down the
              page (see `zmanimSectionRef`), so a second entry here was
              redundant. `resources` itself stays untouched — the mobile
              grid (`allCards`, built from this same `resources`) still
              shows its Zmanim tile as before; only what's passed into the
              hamburger changes. */}
          <HamburgerMenu resources={resources?.filter((r) => r.id !== 'zmanim') ?? null} collapsed={titleColWidth < 100} />
          {/* "Premium panel" spacing structure, on request — Title -> Tagline
              (was Emblem -> Title -> Tagline; the emblem was removed again
              on request), left-justified (was briefly centered, reverted
              back on request), with generous padding above and below
              (`sm:pt-16`/`sm:pb-16`, was `sm:py-8` shared top/bottom) —
              the whole block sits vertically centered in the section
              again now (see the section's own doc comment above; that
              padding still gives the text itself room to breathe within
              the centered block, on top of whatever extra space centering
              adds around it). `(Optional) small nav` from the same brief
              is the
              existing HamburgerMenu trigger above (a corner icon,
              deliberately left outside this stack rather than duplicated
              into it — it already reads as exactly that "small nav" role
              tucked unobtrusively out of the
              way). Fixed-width (`TITLE_COL_MAX_WIDTH`, matching the
              section's original full width) — on request (separately from
              the spacing restructure), so dragging the resize handle
              narrower makes this whole block CLIP away (disappear)
              instead of reflowing/wrapping into the shrinking space.
              Without this, "Philly Jewish Guide"/the tagline would rewrap
              into more, shorter lines as the column narrowed ("condensing"
              instead of disappearing) — and since this section's own
              height is whatever its tallest content needs, that extra
              wrapped height would grow the WHOLE row (both columns share
              one height), shifting Get Connected/everything below it
              while dragging. Pinning this to a constant width means the
              text always wraps exactly the same way it does at full
              width — this section's natural height never changes while
              dragging, only how much of that fixed-size content is still
              visible past the shrinking `overflow-hidden` edge on the
              section above. `shrink-0` stops flexbox from compressing it
              back down on its own. */}
          <div className="shrink-0 flex flex-col items-start sm:px-6 sm:pt-16 sm:pb-16 sm:text-left" style={{ width: TITLE_COL_MAX_WIDTH }}>
            {/* No emblem anymore (was the site's brand mark, then briefly
                the admin-uploaded logo — both removed, on request) —
                straight to Title -> Tagline now. */}
            {/* Elms Sans (the whole site's font now, see layout.tsx's
                `elmsSans`) at Extrabold (800) for the title specifically,
                on request. `text-5xl` (48px, within the specified ~40-56px
                hero range). `[font-kerning:normal]` explicitly opts into
                kerning (glyph-pair spacing adjustments, e.g. tucking "o"
                closer under a "T") on request — most browsers already
                default to this, but it's not guaranteed across all of them
                without stating it. `[text-shadow:...]` — a soft dark drop
                shadow (4px blur, 15% opacity), on request, for a bit of
                lift/depth off the panel behind it; the same shadow is
                also on "Get Connected" and "What are you looking for?"
                now, on request, so all three headings match. */}
            <h1 className="mt-4 text-[40px] font-bold leading-[1.3] tracking-[-0.75px] text-[#2D3636] [font-kerning:normal] [text-shadow:0_2px_4px_rgba(0,0,0,0.15)]">
              {settings.name}
            </h1>
            {/* Fixed copy per explicit request, not `settings.tagline` — this
                    exact sentence replaces whatever the admin-configured tagline
                    would otherwise show here. `text-[#2D3636]/70` — slightly
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
            <p className="mt-3 text-sm leading-relaxed text-[#2D3636]/85">
              Community resources for residents, visitors, and hospital patients
            </p>
          </div>
        </section>

        {/* Right column — search bar band stacked above the map, both
                spanning the same 2/3-width column instead of the title's
                narrower one. `sm:flex sm:flex-col` just stacks the two.
                No hard border lines at the interior seams anymore — on
                request, every INTERIOR divider in the bento box (this
                column's own left edge against the title, the search/map
                seam below, and the map-row/Get-Connected seam further
                down) lost its border line, replaced with a soft `inset`
                `box-shadow` on whichever section owns that edge instead
                (see the title `<section>`/search `<section>`/Get
                Connected heading `<div>` themselves) — reads as a subtle
                shaded groove rather than a crisp rule. `inset` keeps the
                shadow INSIDE each element's own box, so it isn't clipped
                by that element's own `overflow-hidden` and doesn't spill
                onto its neighbor. Only the shape's true EXTERIOR edges
                (the grid wrapper's own border, and Get Connected's) keep
                a real border line. ──────────────────────────────────── */}
        <div className="sm:flex sm:flex-col">
          {/* ── Search bar — used to live in the title cell; now its own
                  band above the map. Placeholder/aria-label is a fixed
                  "Search website…" now (was `settings.heroTitle`, the
                  admin-editable copy — defaulting to "What are you looking
                  for?" — that mobile's HeroHeading still shows), on
                  request; the two no longer share this particular string.
                  No border on the pill anymore — just its own white fill/
                  shadow to read as a field. `sm:py-6` (was `sm:py-8`) — a
                  bit shorter, band still has room to breathe around the
                  pill. `#F5F5F7` fill (was `#91D7E6`, before that `#64D6E3`,
                  before that mustard yellow `#D4A017`, before that mustard
                  green `#BBC167`,
                  before that a soft cool cyan/mint top-to-bottom gradient),
                  on request, flat instead of a gradient — same color as
                  "Get Connected" below (see CATEGORY_FILL). ────────────── */}
          {ui.search.landing && (
            // Flat fill again (was a symmetric vertical gradient, darker at
            // both the top and bottom edges — removed back to flat on
            // request). Carries the "Philly Jewish Guide" title's own pale
            // cyan (`#C5E5E9`) — swapped with the title section's
            // near-white fill on request; see its own comment above.
            <section className="sm:bg-[#C5E5E9] sm:px-6 sm:py-6 sm:shadow-[inset_0_-6px_6px_-6px_rgba(0,0,0,0.15)]">
              {/* Section header, on request — matches "Get Connected"'s own
                  treatment (same weight/size/color) so the two read as
                  siblings; mobile keeps its own `settings.heroTitle` copy
                  via HeroHeading instead (usually this same "What are you
                  looking for?" text, but admin-editable there — this one's
                  a fixed string to match Get Connected/Zmanim, which aren't
                  editable either). */}
              <h2 className="mb-2 text-center text-[20px] font-semibold tracking-[-1px] text-[#2D3636] [text-shadow:0_2px_4px_rgba(0,0,0,0.15)]">
                What are you looking for?
              </h2>
              <div className="mx-auto w-full max-w-xl">
                {/* `border-slate-300` — the pill had no border at all
                    before, relying only on its shadow to read against this
                    section's own near-white `#FFFFFF` fill; too little
                    contrast for the pill itself to be visible. Icon/
                    placeholder/clear-button grays darkened a step too
                    (`slate-400` -> `slate-500`, hover `slate-600` ->
                    `slate-700`) for the same reason — text-[#2D3636] stays
                    untouched. */}
                <div className="flex items-center rounded-full border border-slate-300 bg-white pl-4 pr-1.5 py-1.5 shadow-[0_6px_20px_rgb(0,0,0,0.1)] transition-shadow focus-within:shadow-[0_6px_24px_rgb(0,0,0,0.16)]">
                  <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                  </svg>
                  <input
                    id="landing-search-input"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search website…"
                    aria-label="Search website…"
                    className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-[#2D3636] placeholder:text-slate-500 focus:outline-none"
                  />
                  {/* Collapses the results below without touching the query
                      — ported from the map's own search bar chevron, on
                      request. Only shown when there's actually a list to
                      collapse. */}
                  {placeHits.length > 0 && (
                    <button
                      onClick={() => setResultsCollapsed((v) => !v)}
                      aria-label={resultsCollapsed ? 'Show results' : 'Hide results'}
                      className="flex shrink-0 h-6 w-6 items-center justify-center text-slate-500 hover:text-slate-700 cursor-pointer"
                    >
                      <svg
                        className={`h-3.5 w-3.5 transition-transform duration-200 ${resultsCollapsed ? '-rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
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
                {/* "Sort by distance" toggle — ported from the map's own
                    search bar, on request. Re-sorts `placeHits` (see above)
                    by `milesFromAddress` instead of relevance. Without a
                    location set yet, this opens the header's location
                    picker first (`jpc:open-location`, the same event
                    LocationControl.tsx already listens for) rather than
                    silently no-op'ing — sorting by distance is meaningless
                    without one to measure from. */}
                {placeHits.length > 0 && !resultsCollapsed && (
                  <div className="mt-2 flex justify-center">
                    <button
                      onClick={() => {
                        if (!coords) document.dispatchEvent(new CustomEvent('jpc:open-location'))
                        setSortByDistance((v) => !v)
                      }}
                      className={`rounded-full border-2 px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                        sortByDistance ? 'border-[#df4c73] bg-[#df4c73] text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Sort by distance
                    </button>
                  </div>
                )}
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
                      room under the pill, so results don't crowd it. Split
                      into up to three labeled groups now (was one flat
                      list), on request — by where tapping a result actually
                      lands (the map, Get Connected, or a full directory
                      page), via `mapHits`/`getConnectedHits`/`otherHits`
                      (see their own doc comment above) — mirrors
                      `focusPlace`'s exact branches so a result never shows
                      up under a heading that doesn't match what clicking it
                      does. Each result is a small card now (bold name +
                      muted "category · distance" subtitle), not a
                      name-only pill — same "bold title + muted subtitle"
                      recipe the map's own search dropdown rows use (and
                      Get Connected's item cards adopted too), ported here
                      on request so distance/category actually show
                      somewhere, matching what "Sort by distance" above
                      needs to make sense of. Collapses away (no height,
                      not just hidden — `resultsCollapsed`) via the chevron
                      in the search pill, ported from the map's own list
                      toggle. ──────────────────────────────────────────── */}
              {placeHits.length > 0 && !resultsCollapsed && (
                <div className="mx-auto mt-3 w-full max-w-xl max-h-52 space-y-3 overflow-y-auto">
                  {[
                    { label: 'On the Map', hits: mapHits },
                    { label: 'In Get Connected', hits: getConnectedHits },
                    { label: 'More Results', hits: otherHits },
                  ]
                    .filter((group) => group.hits.length > 0)
                    .map((group) => (
                      <div key={group.label}>
                        {/* `slate-800` (was `slate-500`) — this label sits
                            directly on the section's own fill (`#F5F5F7`,
                            see the section below), not the white search
                            pill; `slate-500` only cleared 2:1 contrast
                            there. */}
                        <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-800">
                          {group.label}
                        </h2>
                        <div className="flex flex-wrap justify-center gap-2">
                          {group.hits.map((hit) => {
                            const subtitle = [
                              hit.categoryLabel,
                              hit.item.milesFromAddress != null ? `${hit.item.milesFromAddress.toFixed(1)} mi` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                            return (
                              <button
                                key={hit.item.id}
                                onClick={() => focusPlace(hit)}
                                className="flex w-36 flex-col items-start gap-0.5 rounded-xl px-2.5 py-1.5 text-left shadow-[0_4px_14px_rgb(0,0,0,0.06)] ring-1 ring-slate-900/5 bg-white transition-all duration-150 ease-out cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:ring-[#8FC6CF]"
                              >
                                <span className="min-w-0 w-full truncate text-xs font-semibold text-[#2D3636]">{hit.item.name}</span>
                                {subtitle && <span className="min-w-0 w-full truncate text-[11px] font-normal text-slate-400">{subtitle}</span>}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
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
      {/* ── Drag handle — a thin strip sitting just to the LEFT of the
              title/map divider (was centered directly on top of it, on
              request — the circle was intersecting the line rather than
              sitting clear of it). A sibling of the grid div above now,
              not nested inside it (see that div's own doc comment for
              why — its `overflow-hidden` was clipping this handle away
              once it got close to the edge, making it impossible to grab
              for a second drag once the title was mostly collapsed).
              Dragging it left/right resizes `titleColWidth` (clamped
              0..`TITLE_COL_MAX_WIDTH` in `handleTitleColDragStart`); a
              double-click snaps it back to the original full width, an
              escape hatch since dragging alone has no other way back once
              the title's collapsed to nothing. `TITLE_COL_HANDLE_OFFSET`
              (16px) shifts the whole handle's anchor point left of the
              actual line by roughly the grip's own half-width, so it reads
              as a control sitting beside the border rather than stamped
              on it — `Math.max(0, ...)` keeps that offset from ever
              pushing it to a negative (off-screen) position once
              `titleColWidth` drops below the offset itself, on request —
              it now stays pinned at the left edge, fully visible and
              grabbable, instead of continuing past 0 and out of view.
              Back to a chevron arrow (was a 3-dot grip bar for one pass, on
              request that it read less like a button — now reverted, on
              further request, to an arrow again) — but drawn as a small
              solid `#2D3636` tab sitting snug against the line (offset
              shrunk from `16` to `10`, roughly its own radius) so it reads
              as growing out of the border itself, not a separate floating
              control beside it. Points left and sits left of the line
              normally — the direction dragging this collapses the title
              toward — but flips to point right and hops to the RIGHT side
              of the line instead once the title's collapsed to (or near)
              nothing (`titleColHandleCollapsed`), same swap-sides logic as
              before. Restyled to match HamburgerMenu's own trigger arrow
              exactly, on request — a bare stroke chevron with no fill at
              rest (was a solid `#2D3636` circle, which read as "surrounded
              by black"), `/50` opacity darkening to full `#2D3636` with a
              faint `slate-100` circular background ONLY on hover, same as
              that trigger. `TITLE_COL_HANDLE_OFFSET` shrunk further (10 ->
              6) so it sits right up against the line instead of clearly
              floating beside it, on request ("more attached to the border
              boundary it's near"). Only rendered when there's actually a
              second column to negotiate space with. ───────────────────── */}
      {(hasMap || ui.search.landing) && (
        <div
          onMouseDown={handleTitleColDragStart}
          onDoubleClick={() => setTitleColWidth(TITLE_COL_MAX_WIDTH)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Drag to resize the title column"
          title="Drag to resize — double-click to reset"
          className="group absolute top-0 bottom-0 z-30 hidden w-3 -translate-x-1/2 cursor-col-resize items-center justify-center sm:flex"
          style={{ left: titleColHandleCollapsed ? titleColWidth + TITLE_COL_HANDLE_OFFSET : titleColWidth - TITLE_COL_HANDLE_OFFSET }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full text-[#2D3636]/50 transition-colors group-hover:bg-slate-100 group-hover:text-[#2D3636]">
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d={titleColHandleCollapsed ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'} />
            </svg>
          </span>
        </div>
      )}
      </div>

      {/* ── Mobile-only now: "What are you looking for?" heading + filter —
              desktop hides this whole band since its title was removed and
              its search box moved into the dedicated search section above. ─ */}
      <HeroHeading
        settings={settings}
        query={query}
        onQueryChange={setQuery}
      />

      {/* ── "Get Connected" heading — merged with the blank spacer band that
              used to sit above it as its own separate div (on request). No
              `border-t` anymore (was the seam against the map/title row
              above it) — dropped along with every other INTERIOR divider
              in the bento box, on request ("hide bento borders except for
              the exterior ones"); only `border-x` remains, continuing the
              shape's true exterior left/right edges. The gap from the map
              above down to the "Get Connected" text itself is unchanged
              though:
              `sm:pt-[52px]` reproduces the old spacer's `h-10` (40px) plus
              the heading's own `py-3` top padding (12px) as one number,
              instead of two stacked elements adding up to it. `sm:pb-3`
              keeps that same bottom padding on its own. Same light gray
              `border-x` (2px, `#E8E8E8` — was `#2D3636` charcoal, before
              that 1px bright cyan — continuing the shelf's frame, on
              request). `#F6FAFB` fill (was `#FBFBFD`/near-white, on
              request — "a very light background tint distinct from the
              pure white above/below") — matches CATEGORY_FILL below, so
              the heading and the four columns underneath read as one
              continuous tinted section.
              Bumped back up and past its original size so this heading
              reads clearly more prominent than the category tiles/item
              buttons under it (`text-sm`), on request. `text-[29px]
              font-bold tracking-[-1px]` (was `text-[26px] font-semibold
              tracking-[-0.75px]`) — a touch bigger, heavier, and tighter,
              on request ("make the headings feel a little richer"), same
              treatment as "What are you looking for?" above. ──────────── */}
      {/* Flat fill again (was a symmetric vertical gradient — removed back
          to flat on request). Carries the "Philly Jewish Guide" title's
          own pale cyan (`#C5E5E9`) — swapped with the title section's
          near-white fill on request; see its own comment above. */}
      <div className="hidden sm:block sm:border-x-[2px] sm:border-[#E8E8E8] sm:bg-[#C5E5E9] sm:px-6 sm:pt-[52px] sm:pb-3 sm:text-center sm:shadow-[inset_0_6px_6px_-6px_rgba(0,0,0,0.15)]">
        {/* `inline-block` so the border centers under the heading (the
            parent's `text-center` still centers it) instead of spanning the
            whole section — `px-10` extends the rule out past the text
            itself on both sides (was flush with the letters), on request.
            `#fefefe` (was `#E8E8E8` light gray), on request. */}
        <h2 className="inline-block border-b-[2px] border-[#fefefe] px-10 pb-2 text-[29px] font-semibold tracking-[-1px] text-[#2D3636] [text-shadow:0_2px_4px_rgba(0,0,0,0.15)]">
          Get Involved
        </h2>
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
              — those internal seams stay 0, only the shelf's own outer
              frame (below) is visible. `sm:pt-3` — a little buffer between
              the "Get Connected" heading above and the category tiles' own
              headers, on request (was flush/no-`py`, same as every other
              section, before this). ─────────────────────────────────────── */}
      {/* `sm:overflow-hidden sm:rounded-b-2xl` — this is now the box's last
          section (Zmanim moved out below, into the dark margin — see its
          own doc comment further down), so it closes the frame's bottom
          corners instead of Zmanim. `border-x-2`/`border-b-2` at
          `#E8E8E8` (light gray, 2px — was `#2D3636` charcoal, before that
          1px bright cyan, on request) closes the shelf's left/right/bottom
          outer frame here — `border-t` stays 0, the seam to the heading
          above. `#F6FAFB` fill (was `#FBFBFD`) matches the heading div
          above and CATEGORY_FILL in GetConnectedAccordion itself — see
          that div's own doc comment. `sm:pb-12` (was `sm:pb-6`, on
          request — "40-60px vertical" padding around the whole tinted
          section so it doesn't feel cramped) — buffer between the lowest
          button (or the shared detail panel, if one's open) and this
          section's own bottom border. */}
      {/* Flat fill again (was a symmetric vertical gradient — removed back
          to flat on request). Carries the "Philly Jewish Guide" title's
          own pale cyan (`#C5E5E9`) — swapped with the title section's
          near-white fill on request; see its own comment above. */}
      <div ref={getConnectedSectionRef} className="hidden sm:block sm:overflow-hidden scroll-mt-24 sm:rounded-b-2xl sm:border-x-[2px] sm:border-t-0 sm:border-b-[2px] sm:border-[#E8E8E8] sm:bg-[#C5E5E9] sm:pt-3 sm:pb-12">
        <GetConnectedAccordion categories={getConnectedCategories} categoryConfigs={categories} searchQuery={q} focusItemId={focusGetConnectedId} />
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

      {/* ── Zmanim widget — moved out of the bordered/rounded "shelf" box
              above (Get Connected is now that box's bottom section, see its
              own doc comment) and out here into the page's own dark
              `#2D3636` margin instead, on request — no card fill, no
              border, no rounded corners of its own, so it reads as a plain
              header band sitting directly in the margin rather than another
              boxed section. `ZmanimWidget` itself is restyled for this dark
              background (light text throughout, was dark text for the old
              light card — see ZmanimWidget.tsx), and its own title is
              smaller now (`text-xl`, was `text-3xl`) so it reads as a
              compact header label instead of a major section heading like
              "Get Connected" above it. `sm:pt-8` gives it breathing room
              below the box; `sm:pb-2` keeps it snug against the footer
              directly below (also `#2D3636` — see SiteFooter.tsx). ────── */}
      <div ref={zmanimSectionRef} className="hidden sm:block scroll-mt-24 sm:px-6 sm:pt-8 sm:pb-2">
        <ZmanimWidget coords={coords} locationLabel="Your location" title={zmanimCategory?.pluralLabel} />
      </div>
    </main>
    </div>
  )
}
