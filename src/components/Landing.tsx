'use client'

import { useEffect, useRef, useState } from 'react'
import { CardGrid, PlacesResults, cardMatches, searchListings, groupCardsIntoSections, resourceCards, useEntryCards, type CardDef } from '@/components/home/sections'
import HeroHeading from '@/components/home/HeroHeading'
import HomeMap from '@/components/home/HomeMap'
import ZmanimWidget from '@/components/home/ZmanimWidget'
import { GenericListingCard } from '@/components/resources/GenericListingCard'
import { readableTextOnWhite } from '@/components/Collapsible'
import { ACCENT_PALETTE, HOSPITALS_ID, rankMapId } from '@/components/map/ResourceMapView'
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
  /** The visitor's location (from the header pill) — lets "Places" results show
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
  /** When set, clicking this item reveals its full listing detail inline
   *  (description, fields, website link, everything — just without a
   *  repeated title) instead of calling `go()` — see GetConnectedAccordion's
   *  `detailItemId` state. */
  detail?: DirectoryResource
}
type GetConnectedCategory = { id: string; title: string; items: GetConnectedItem[] }

/** "Get Connected" — ONE solid-blue, fully rounded pill holding the category
 *  tabs (not a divided rectangular strip), centered on the screen rather
 *  than pinned to the top of it. The pill's own shape/size never changes —
 *  what moves is the whole {pill + list panel} GROUP's total height, and
 *  since the screen wrapping this component keeps it vertically centered
 *  (`sm:justify-center`, see the call site), the pill visually glides to a
 *  new position on screen every time the panel below it opens, closes, or
 *  grows to show an embedded form/detail card — "the bar moves around the
 *  screen" is really just a side effect of plain flexbox re-centering a
 *  group whose height keeps changing, animated smoothly because the panel's
 *  own reveal uses the grid-template-rows 0fr/1fr trick (so the browser has
 *  an actual height to transition, not an abrupt mount/unmount).
 *
 *  Clicking a tab reveals a SEPARATE floating panel below the pill (not
 *  nested inside the pill's own shape) listing that category's items —
 *  still tinted with that category's own `ACCENT_PALETTE` color for a
 *  border/hover accent, even though the pill itself is uniformly blue.
 *  Some items don't navigate at all when clicked — instead, right under
 *  THAT item (not the bottom of the whole list), either:
 *  - `embed` (Support/Volunteer's "Interest Form" entries): the real
 *    SupportWizard/VolunteerWizard, `variant="inline"`.
 *  - `detail` (Professional Networks/Social Opportunities/WhatsApp Groups'
 *    real listings): that listing's own GenericListingCard with its header
 *    hidden (`hideHeader`) — description, fields, tags, hours, website
 *    link, everything it normally shows, just without repeating the name
 *    the item's own label above already gives.
 *  Both kinds get the same open/closed chevron on the right of their own
 *  list button.
 *  Switching tabs (or re-clicking the same one to close it) always resets
 *  both `embeddedFlow` and `detailItemId`, so neither can linger under a
 *  different tab. */
function GetConnectedAccordion({
  categories,
  categoryConfigs,
}: {
  categories: GetConnectedCategory[]
  categoryConfigs: CategoryConfig[] | null
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [embeddedFlow, setEmbeddedFlow] = useState<'support' | 'volunteer' | null>(null)
  const [detailItemId, setDetailItemId] = useState<string | null>(null)
  const activeIndex = categories.findIndex((c) => c.id === activeId)
  const active = activeIndex >= 0 ? categories[activeIndex] : undefined
  const activeColor = activeIndex >= 0 ? ACCENT_PALETTE[activeIndex % ACCENT_PALETTE.length] : undefined
  const embedItem = active?.items.find((it) => it.embed && it.embed === embeddedFlow)
  const detailItem = active?.items.find((it) => it.detail && it.id === detailItemId)
  const detailCategory = detailItem?.detail ? categoryConfigs?.find((c) => c.id === detailItem.detail!.category) : undefined
  const hasSecondBox = !!embedItem || !!(detailItem?.detail && detailCategory)
  // Paler palette steps are too light to read as text on white — same fix
  // used everywhere else this palette gets used as a hover/accent text
  // color (see Collapsible.tsx).
  const readableActiveColor = readableTextOnWhite(activeColor ?? '#1d3557')

  const selectTab = (id: string) => {
    setActiveId((prev) => (prev === id ? null : id))
    setEmbeddedFlow(null)
    setDetailItemId(null)
  }

  // The pill and its panel share one shrink-wrapped column sized to the
  // WIDER of the two (the panel, since it's usually wider than the pill) —
  // `items-start`/`items-end` snaps both to that column's left/right edge,
  // which is the same thing as saying the panel's edge lines up with the
  // pill's edge, without needing to measure either element's actual pixel
  // width in JS. Support & Volunteering aligns left, WhatsApp Groups aligns
  // right (its own explicit request); everything else stays centered, the
  // original behavior.
  const panelAlign = active?.id === 'support-volunteering' ? 'items-start' : active?.id === 'whatsapp' ? 'items-end' : 'items-center'

  return (
    <div className="flex w-full justify-center">
      <div className={`flex flex-col ${panelAlign}`}>
      <div className="flex gap-1 rounded-full bg-white p-1.5 shadow-lg" role="tablist">
        {categories.map((cat) => {
          const isActive = cat.id === activeId
          return (
            <button
              key={cat.id}
              onClick={() => selectTab(cat.id)}
              role="tab"
              aria-selected={isActive}
              className={`rounded-full px-5 py-2.5 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer sm:text-sm ${
                // Active tab swaps to the inverse of the pill's own base
                // colors (fill instead of text) instead of just changing
                // text color, so clicking a tab visibly flips it.
                isActive ? 'bg-[#569DF0] text-white' : 'text-slate-600 hover:bg-[#569DF0]/10'
              }`}
            >
              {cat.title}
            </button>
          )
        })}
      </div>

      {/* The floating panel — a separate element from the pill above (its
          shape/size is untouched by this), revealed via the same
          grid-template-rows 0fr/1fr trick used elsewhere so its HEIGHT
          animates opening/closing instead of popping in. Its horizontal
          alignment relative to the pill (centered/left/right) comes from
          `panelAlign` on the shared wrapper above, not from anything set
          here. */}
      <div
        className="grid w-full max-w-md transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: active ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {active && (
            <div style={{ borderColor: activeColor }} className="mt-3 overflow-hidden rounded-2xl border-2 bg-white shadow-lg">
              {active.items.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {active.items.map((item) => {
                    const isOpenEmbed = item.embed && item.embed === embeddedFlow
                    const isOpenDetail = item.detail && item.id === detailItemId
                    const isOpen = isOpenEmbed || isOpenDetail
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => {
                            const embed = item.embed
                            if (embed) setEmbeddedFlow((prev) => (prev === embed ? null : embed))
                            else if (item.detail) setDetailItemId((prev) => (prev === item.id ? null : item.id))
                            else item.go()
                          }}
                          style={{ '--hover-color': readableActiveColor } as React.CSSProperties}
                          className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-medium transition-colors hover:bg-slate-50 hover:text-[var(--hover-color)] cursor-pointer ${
                            isOpen
                              ? 'bg-slate-50 text-[var(--hover-color)]'
                              : // Once something in this list is open, every OTHER
                                // item dims — the same "one item stands out, the
                                // rest recede" read the two-item Support &
                                // Volunteering list already had by virtue of only
                                // having one alternative to compare against.
                                hasSecondBox
                                ? 'text-slate-300 hover:text-slate-500'
                                : 'text-slate-700'
                          }`}
                        >
                          <span>
                            {item.icon && <span aria-hidden="true" className="mr-1.5">{item.icon}</span>}
                            {item.label}
                          </span>
                          {/* Every expandable item gets a chevron (both
                              `embed`, the wizards, and `detail`, the
                              listing-detail cards) — only plain `go()`
                              items (which just navigate) skip it. */}
                          {(item.embed || item.detail) && (
                            <svg
                              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2.5}
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                            </svg>
                          )}
                        </button>

                        {/* The embedded form / listing detail — right under
                            THIS item (not the bottom of the whole list),
                            via its own nested grid-rows reveal so it grows
                            open in place instead of popping in wherever the
                            list happens to end. */}
                        <div
                          className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                          style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                        >
                          <div className="overflow-hidden">
                            <div className="border-t border-slate-200">
                              {isOpenEmbed ? (
                                item.embed === 'support' ? (
                                  <SupportWizard variant="inline" onClose={() => setEmbeddedFlow(null)} />
                                ) : (
                                  <VolunteerWizard variant="inline" onClose={() => setEmbeddedFlow(null)} />
                                )
                              ) : isOpenDetail && item.detail && detailCategory ? (
                                <div className="p-3">
                                  {/* The item's own label (on the button
                                      above) already says its name — `hideHeader`
                                      skips GenericListingCard's own header
                                      row (which would just repeat it) while
                                      keeping the full expanded body:
                                      description, fields, tags, hours,
                                      website link, everything else it
                                      normally shows. */}
                                  <GenericListingCard
                                    item={item.detail}
                                    category={detailCategory}
                                    upvotes={!!detailCategory.upvotesEnabled}
                                    count={item.detail.upvotes ?? 0}
                                    expanded
                                    dense
                                    hideBorder
                                    hideHeader
                                    highlightColor={activeColor}
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
                <p className="px-4 py-3 text-sm italic text-slate-400">Coming soon</p>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

/** Top-left hamburger menu on the desktop top bar — a quick-link list to
 *  every resource category's full directory page (Synagogues, Restaurants,
 *  Hospitals, Eruv, etc. — reuses the same `resources` the card grid below
 *  builds from, so it's never a second, drifting copy of that list). Exists
 *  because those "View full page" links used to live on the map's own
 *  category headings — once multiple categories selected there merge into
 *  one flat, ungrouped list (see ResourceMapView), there's no per-category
 *  heading left to click through from; this is the one place they're
 *  always reachable regardless of what's currently selected on the map.
 *  Opens as a full-height slide-out panel down the left edge of the whole
 *  page (fixed positioning, so it isn't confined to the top bar it's
 *  triggered from) with a dimmed backdrop behind it, rather than a small
 *  popout anchored under the button. */
function HamburgerMenu({ resources, onNavigate }: { resources: CardDef[] | null; onNavigate: NavigateFn }) {
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
    <div className="absolute left-1.5 inset-y-0 z-30 flex items-center text-left">
      {/* An inward-pointing arrow tucked right at the page edge (subtle —
          low-opacity until hovered) reads as "there's more this way" rather
          than the standard hamburger glyph. The "Browse resources" label
          stays hidden until hover, then reveals sideways (`writing-mode:
          vertical-rl`) next to the arrow like a book-spine label, instead of
          permanently taking up horizontal space. Rendered once per screen
          (see call sites in the desktop storymap flow) rather than one
          fixed overlay, each vertically centered within its own screen. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Browse resources"
        aria-expanded={open}
        className="group flex items-center gap-1 rounded-full p-1.5 text-[#fefefe]/40 transition-colors hover:text-[#fefefe] cursor-pointer"
      >
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h12m0 0l-5-5m5 5l-5 5" />
        </svg>
        <span
          aria-hidden="true"
          style={{ writingMode: 'vertical-rl' }}
          className="pointer-events-none text-[10px] font-semibold uppercase tracking-widest opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        >
          Browse resources
        </span>
      </button>

      {/* Dimmed backdrop — click to close, fades with the panel instead of
          popping in/out so the panel reads as sliding out from behind it.
          NOTE: this and the panel below must NOT sit inside an ancestor
          with its own CSS transform — a transformed ancestor becomes the
          containing block for `position: fixed` descendants (per spec),
          which is exactly what confined this to the top bar's own band
          instead of the full page when centering the button above used
          `-translate-y-1/2` instead of `inset-y-0 flex items-center`. */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* The panel itself — full viewport height, ~1/6 of the page wide
          (with a floor so it stays readable on narrower desktop windows),
          slides in/out via transform rather than mounting/unmounting so the
          motion actually reads as a slide instead of a snap. */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-1/6 min-w-[260px] max-w-[85vw] flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Browse</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto py-2">
          {/* Curated addition, not part of the auto-generated category list
              below — opens the Synagogues directory with its existing "All
              Davening Times" modal (see GenericDirectory) already expanded,
              instead of a separate page of its own. */}
          <button
            onClick={() => {
              onNavigate('patient', 'find', { findView: 'synagogue', findOpenDavening: true })
              setOpen(false)
            }}
            className="block w-full px-5 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            All Davening Times
          </button>
          {resources && resources.map((card) => (
            <button
              key={card.id}
              onClick={() => {
                card.go()
                setOpen(false)
              }}
              className="block w-full px-5 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {card.title}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}

/** Top-right Zmanim menu on the desktop top bar — mirrors HamburgerMenu on
 *  the left exactly (same inward-pointing-arrow trigger, same full-height
 *  slide-out panel with a dimmed backdrop), just flipped to the right edge
 *  and holding the live Zmanim widget instead of the resource list. Used to
 *  be its own full-screen storymap section (screen 4); folded into this
 *  side panel instead so the desktop flow is three screens (Guide/search,
 *  Map, Get Connected) with Zmanim reachable from any of them rather than
 *  only at the very bottom. Also opens on the `jpc:open-zmanim` custom
 *  event (same pattern as SiteHeader's `jpc:open-location`), which is how
 *  the search box's "jump to Zmanim" result opens this from outside. */
function ZmanimMenu({ coords, title }: { coords: { lat: number; lng: number } | null; title?: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    const onOpenEvent = () => setOpen(true)
    document.addEventListener('jpc:open-zmanim', onOpenEvent)
    return () => document.removeEventListener('jpc:open-zmanim', onOpenEvent)
  }, [])

  return (
    <div className="absolute right-1.5 inset-y-0 z-30 flex items-center text-right">
      {/* Same subtle inward-pointing-arrow treatment as HamburgerMenu,
          mirrored: arrow points LEFT (into the page) since this sits on the
          right edge, and the label reveals to its left on hover instead of
          its right — DOM order is [label, icon] rather than
          HamburgerMenu's [icon, label] so the icon still ends up nearest
          the true page edge. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Zmanim"
        aria-expanded={open}
        className="group flex items-center gap-1 rounded-full p-1.5 text-[#fefefe]/40 transition-colors hover:text-[#fefefe] cursor-pointer"
      >
        <span
          aria-hidden="true"
          style={{ writingMode: 'vertical-rl' }}
          className="pointer-events-none text-[10px] font-semibold uppercase tracking-widest opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        >
          Zmanim
        </span>
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H8m0 0l5-5m-5 5l5 5" />
        </svg>
      </button>

      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* The panel — same motion as HamburgerMenu's, anchored to the RIGHT
          edge (`right-0`, and sliding via `translate-x-full` instead of
          `-translate-x-full`) instead of the left. ~1.5x HamburgerMenu's own
          width (`w-1/4`/`min-w-[390px]` vs. its `w-1/6`/`min-w-[260px]`) —
          Zmanim's own content (times in two columns) needs more breathing
          room than the resource-links list does. */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-1/4 min-w-[390px] max-w-[85vw] flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Zmanim</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ZmanimWidget coords={coords} locationLabel="Your location" title={title} />
        </div>
      </div>
    </div>
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
  // match scrolls to the widget at the bottom of the page.
  const mapSectionRef = useRef<HTMLDivElement>(null)

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
  // Zmanim lives in the right-edge slide-out panel now (ZmanimMenu), not its
  // own scroll-to screen — same custom-event pattern SiteHeader's mobile
  // location strip already uses (`jpc:open-location`) to open something
  // owned by a sibling component instead of threading state through props.
  const jumpToZmanim = () => {
    document.dispatchEvent(new Event('jpc:open-zmanim'))
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
  // `detail` so clicking one reveals its website link inline (see
  // GetConnectedAccordion) instead of navigating away.
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
  const placeHits = q && listings ? searchListings(listings, categories ?? [], q, coords) : []

  // Desktop only: categories/Zmanim that used to be plain tiles (searchable via
  // resourceCards' own rich keywords, e.g. "shul" -> Synagogues) now live in the
  // map list or the widget below instead of the grid — so a match here surfaces
  // as a "jump to" result rather than a tile, using the exact same keywords.
  const hiddenFeatureMatches = q && resources
    ? resources.filter((card) => card.id != null && (onMapCardIds.has(card.id) || card.id === 'zmanim') && cardMatches(card, q))
    : []

  // Tapping a place opens its category directory, pre-filtered to the matched term
  // (so it survives that page's own search) with the place itself expanded.
  const openPlace = (hit: (typeof placeHits)[number]) =>
    onNavigate('patient', 'find', {
      findView: hit.item.category,
      findQuery: hit.term,
      findItemId: hit.item.id,
    })

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
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 sm:pb-0">
      {/* ── Mobile-only now: "What are you looking for?" heading + filter —
              desktop hides this whole band since its title was removed and
              its search box moved into the dedicated search section below.
              Kept OUTSIDE the desktop storymap screens below (rather than
              nested inside one of them) since it has to actually render on
              mobile, where every one of those screens is `hidden`. ──────── */}
      <HeroHeading
        settings={settings}
        query={query}
        onQueryChange={setQuery}
      />

      {/* ── Desktop flow — Guide/search, Map, and Get Connected, one
              continuous scrolling page (no more scroll-snap "storymap"
              screens). Each band still gets its own full-bleed background,
              but sizes to its own content instead of forcing a full
              viewport height — only the map stays that large, since it
              genuinely benefits from the room the way a short search bar or
              a tab strip doesn't. Zmanim lives in the right-edge slide-out
              panel (ZmanimMenu), mirroring HamburgerMenu on the left. ───── */}

      {/* ── Guide/search — condensed top bar (site name + tagline) + "What
              are you looking for?" search bar + any "jump to" chips the
              search produces. `settings.heroTitle` (defaults to "What are
              you looking for?") is the search bar's own placeholder text —
              same admin-editable copy mobile's HeroHeading shows, so the two
              never drift apart. Used to also carry a Volunteer/Support/
              Young Professionals quick-links row; removed as duplicative
              once Get Connected further down covered the same links with
              real lists under them. Desktop only. ─────────────────────── */}
      <div className="hidden sm:block sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#508BEB]">
        {/* Full-bleed band (same breakout as the sections below it) — see
                [[project_art_deco_home_redesign]]. `sm:relative` anchors
                HamburgerMenu/ZmanimMenu, each vertically centered within
                this band along its own left/right edge — rendered again
                (not shared/fixed) on the map and Get Connected sections
                too, so they're reachable everywhere without needing one
                continuous page-wide overlay. ───────────────────────────── */}
        <section className="hidden sm:relative sm:block sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#508BEB] sm:px-6 sm:py-6 sm:text-center">
          <HamburgerMenu resources={resources} onNavigate={onNavigate} />
          <ZmanimMenu coords={coords} title={zmanimCategory?.pluralLabel} />
          {/* `font-variant: small-caps` (not `uppercase`, a text-transform
                  that would flatten every letter to the same size) — with
                  `settings.name` already in normal Title Case, this renders
                  each word's real capital first letter at full size and
                  lowercases the rest as smaller caps, instead of an
                  all-same-size uppercase run. */}
          <h1 className="text-6xl font-semibold tracking-widest text-[#fefefe] [font-variant:small-caps]">
            {settings.name}
          </h1>
        </section>

        {/* Same fill `#508BEB` as the top bar directly above it (no
                border/seam between them), so the two read as one continuous
                band — the search pill itself is a solid white pill
                regardless, so it stays legible either way. */}
        {ui.search.landing && (
          <section className="hidden sm:block sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#508BEB] sm:py-8">
            <div className="sm:mx-auto sm:max-w-6xl sm:px-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-full max-w-xl">
                  <div className="flex items-center rounded-full border border-slate-200 bg-white pl-5 pr-2 py-2 shadow-[0_6px_20px_rgb(0,0,0,0.06)] transition-shadow focus-within:shadow-[0_6px_24px_rgb(0,0,0,0.12)]">
                    <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                    </svg>
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={settings.heroTitle}
                      aria-label="Filter resources"
                      className="min-w-0 flex-1 bg-transparent px-3 text-[15px] text-slate-900 placeholder:text-slate-500 placeholder:font-semibold placeholder:tracking-widest focus:outline-none"
                    />
                    {query && (
                      <button
                        onClick={() => setQuery('')}
                        aria-label="Clear filter"
                        className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Desktop: "jump to" results — categories/Zmanim that match the
                search box's query but no longer have a tile of their own
                (they moved into the map list or the widget below), so this
                is how the search box still reaches them. ────────────────── */}
        {hiddenFeatureMatches.length > 0 && (
          <div className="mt-6 hidden sm:flex flex-wrap justify-center gap-2">
            {hiddenFeatureMatches.map((card) => (
              <button
                key={card.id}
                onClick={() => (card.id === 'zmanim' ? jumpToZmanim() : jumpToMapCategory(card.id!))}
                className="inline-flex items-center gap-2 rounded-full border-2 border-[#3a86ff] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-[#3a86ff] hover:text-white cursor-pointer"
              >
                {card.icon && <span aria-hidden="true">{card.icon}</span>}
                {card.title}
                {/* Zmanim opens the right-edge panel now, not a scroll — "↓"
                        would be misleading there, so it gets "→" instead. */}
                <span aria-hidden="true" className="text-slate-400">{card.id === 'zmanim' ? '→' : '↓'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── The map — the real full map, right on the home page. Its own
              category tabs (down the map's left edge) cover browsing by
              category directly on the map now, so there's no separate
              "Browse by Category" list beside it anymore — the map takes
              the full width. Desktop only: mobile now reaches the same map
              via its own tab bar entry, so it's dropped from this scroll to
              avoid showing it twice. Full-bleed band (same `w-screen` +
              `margin-left: calc(50% - 50vw)` breakout as the section above)
              — the map itself runs edge-to-edge and stays a full viewport
              tall (`h-screen` inside ResourceMapView, gated on `embedded`)
              even in the continuous-scroll layout, since it's the one area
              that genuinely benefits from that much room. `relative`
              anchors HamburgerMenu/ZmanimMenu. ───────────────────────────── */}
      {hasMap && (
        <div ref={mapSectionRef} className="hidden sm:block sm:relative sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#fefefe]">
          <HamburgerMenu resources={resources} onNavigate={onNavigate} />
          <ZmanimMenu coords={coords} title={zmanimCategory?.pluralLabel} />
          <HomeMap
            onNavigate={onNavigate}
            coords={coords}
            focusedListingId={focusedListingId}
            onFocusListingChange={setFocusedListingId}
            focusedCategoryIds={focusedCategoryIds}
            onFocusCategoryChange={toggleCategory}
            categoryItemIdsByCategory={categoryItemIdsByCategory}
          />
        </div>
      )}

      {/* ── Get Connected — desktop only, right after the map (the slot the
              app's original "Get Connected" section held before it was
              replaced by the top-bar quick-links row — see the history
              comment on `quickLinksCards` above). A single centered blue
              pill of category tabs (see GetConnectedAccordion above); each
              tab's own dropdown expands the section's height as needed
              instead of forcing a fixed one. Each list is pulled from the
              real pages/flows those old quick-link buttons already opened
              (not new/duplicated content) — Professional Networks and
              Social Opportunities both draw from the same young-
              professional listings, just split by which read as networking
              vs. purely social (see SOCIAL_OPPORTUNITY_NAMES above). ───── */}
      <div className="hidden sm:relative sm:flex sm:flex-col sm:items-center sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#508BEB] sm:py-16">
        <HamburgerMenu resources={resources} onNavigate={onNavigate} />
        <ZmanimMenu coords={coords} title={zmanimCategory?.pluralLabel} />
        <h2 className="mb-5 text-2xl font-extrabold tracking-tight text-white">Get Connected</h2>
        <GetConnectedAccordion categories={getConnectedCategories} categoryConfigs={categories} />
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

      {/* ── Matching places (individual listings within the cards) — shows on
              both mobile (right after its grid, as before) and desktop
              (after the whole four-screen storymap flow above, so an active
              search's results don't interrupt it). ─────────────────────── */}
      {placeHits.length > 0 && (
        <PlacesResults hits={placeHits} onOpen={openPlace} />
      )}
    </main>
  )
}
