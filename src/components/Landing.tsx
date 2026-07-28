'use client'

import { useEffect, useRef, useState } from 'react'
import { CardGrid, PlacesResults, cardMatches, searchListings, groupCardsIntoSections, resourceCards, useEntryCards, type CardDef } from '@/components/home/sections'
import HeroHeading from '@/components/home/HeroHeading'
import HomeMap from '@/components/home/HomeMap'
import ZmanimWidget from '@/components/home/ZmanimWidget'
import { GenericListingCard } from '@/components/resources/GenericListingCard'
import { needsDarkText } from '@/components/Collapsible'
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
  /** When set, clicking this item shows ITS full listing detail (a
   *  GenericListingCard) beside the list instead of calling `go()` — see
   *  GetConnectedAccordion's `detailItemId` state. */
  detail?: DirectoryResource
}
type GetConnectedCategory = { id: string; title: string; items: GetConnectedItem[] }

/** "Get Connected" — same width as the map above it (both sit in the same
 *  `max-w-6xl` container). Matches the MAP's own graphic language: each tab
 *  colored from the same `ACCENT_PALETTE` the map's category buttons cycle
 *  through — filled solid + white text when active, white + that color's
 *  own border/text when it isn't, exactly like a map key button toggling
 *  on — instead of one flat navy/gold scheme, which reads punchier (five
 *  distinct colors instead of one repeated pair) and ties the section back
 *  to the map visually. Square corners throughout, each tab flush against
 *  its neighbors (no gaps) so the row still reads as one continuous
 *  divided bar.
 *
 *  Each tab's dropdown renders directly under THAT tab and exactly as wide
 *  as it is — a real "drops down from the item you clicked" read, not one
 *  shared box that always starts at the row's left edge regardless of
 *  which tab (over on the right, say) actually opened it. It's positioned
 *  with a normal-flow CSS grid below the tab strip (`repeat(N, 1fr)`,
 *  matching the tab row's own equal division) rather than
 *  `position: absolute`, specifically so it takes up real space and grows
 *  the section — pushing the Zmanim block further down the page — instead
 *  of floating over whatever's below. Only one open at a time; clicking
 *  the same tab again closes it.
 *
 *  Some items don't navigate at all when clicked — a SECOND bordered box
 *  opens beside that tab's dropdown, in an adjacent grid column (not
 *  replacing the dropdown, so the list stays visible and clickable),
 *  showing either:
 *  - `embed` (Support/Volunteer's "Interest Form" entries): the real
 *    SupportWizard/VolunteerWizard, `variant="inline"`.
 *  - `detail` (Professional Networks/Social Opportunities/WhatsApp Groups'
 *    real listings): that listing's own GenericListingCard, same as its
 *    full directory page shows, instead of navigating there.
 *  Professional Networks (and Support & Volunteering) open their second
 *  box in the column to the RIGHT of the dropdown; Social Opportunities
 *  and WhatsApp Groups (the last/rightmost tab, where a right-side box
 *  would run off the grid's own edge) open it in the column to the LEFT
 *  instead — same box, same visual treatment, just anchored to whichever
 *  side actually has room. Switching tabs (or re-clicking the
 *  same one to close it) always resets both `embeddedFlow` and
 *  `detailItemId`, so neither can linger under a different tab. */
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

  const selectTab = (id: string) => {
    setActiveId((prev) => (prev === id ? null : id))
    setEmbeddedFlow(null)
    setDetailItemId(null)
  }

  return (
    <div className="w-full bg-[#fefefe]">
      <div className="flex" role="tablist">
        {categories.map((cat, i) => {
          const color = ACCENT_PALETTE[i % ACCENT_PALETTE.length]
          const isActive = cat.id === activeId
          // The palette's paler steps (pale aqua, light blue) wash out under
          // white text — `needsDarkText` (shared with the map's own contrast
          // logic, see Collapsible.tsx) checks actual luminance instead of
          // hardcoding which hex that is, so it keeps working automatically
          // if the palette's exact colors ever shift again.
          const activeTextClass = needsDarkText(color) ? 'text-[#0C3D57]' : 'text-white'
          return (
            <button
              key={cat.id}
              onClick={() => selectTab(cat.id)}
              role="tab"
              aria-selected={isActive}
              style={isActive ? { backgroundColor: color } : { color }}
              className={`flex-1 border-r border-b-2 border-slate-200 px-3 py-3.5 text-center text-xs font-bold transition-colors cursor-pointer last:border-r-0 sm:text-sm ${
                isActive ? activeTextClass : 'bg-white hover:brightness-95'
              }`}
            >
              {cat.title}
            </button>
          )
        })}
      </div>

      <div className="grid transition-[grid-template-rows] duration-300 ease-in-out" style={{ gridTemplateRows: active ? '1fr' : '0fr' }}>
        <div className="overflow-hidden">
          {active && (() => {
            // Both boxes anchor to the LEFT (second box before the list)
            // for Social Opportunities and WhatsApp Groups (the last/
            // rightmost tab, where a right-side box would run off the
            // grid's own edge); everywhere else the second box trails the
            // list on the right. Anchoring left shifts the whole pair's
            // grid-column span earlier instead of moving the list itself —
            // the list's OWN track never changes, only which side of it
            // the pair's shared box starts from. The second box gets TWO
            // tracks' worth of room (vs. the list's one, via the flex-[2]
            // below) so it can actually breathe instead of being squeezed
            // to exactly one tab's width.
            const anchorLeft = active.id === 'social' || active.id === 'whatsapp'
            const listTrack = activeIndex + 1
            const spanStart = anchorLeft ? listTrack - 2 : listTrack
            const spanEnd = spanStart + 3

            const listBox = (
              <div style={{ borderColor: activeColor }} className="min-w-0 flex-1 border border-t-0 bg-white shadow-lg">
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
                              if (item.embed) setEmbeddedFlow(item.embed)
                              else if (item.detail) setDetailItemId((prev) => (prev === item.id ? null : item.id))
                              else item.go()
                            }}
                            style={{ '--hover-color': activeColor } as React.CSSProperties}
                            className={`block w-full px-4 py-2.5 text-left text-sm font-medium transition-colors hover:bg-slate-50 hover:text-[var(--hover-color)] cursor-pointer ${
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
                            {item.icon && <span aria-hidden="true" className="mr-1.5">{item.icon}</span>}
                            {item.label}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-sm italic text-slate-400">Coming soon</p>
                )}
              </div>
            )

            // Always rendered (even while closed) so it can animate open —
            // `flex-[2]` (vs. the list's `flex-1`) gives it twice the
            // list's width, since the shared span above now reserves three
            // tracks total (one for the list, two for this), and the
            // grid-template-rows 0fr/1fr trick collapses/reveals its
            // HEIGHT only, so its WIDTH (and therefore the list's own
            // width) never jumps when it opens or closes.
            const secondBox = (
              <div
                style={{ gridTemplateRows: hasSecondBox ? '1fr' : '0fr' }}
                className="grid min-w-0 flex-[2] transition-[grid-template-rows] duration-300 ease-in-out"
              >
                <div className="overflow-hidden">
                  <div style={{ borderColor: activeColor }} className="border border-t-0 bg-white shadow-lg">
                    {embedItem ? (
                      embedItem.embed === 'support' ? (
                        <SupportWizard variant="inline" onClose={() => setEmbeddedFlow(null)} />
                      ) : (
                        <VolunteerWizard variant="inline" onClose={() => setEmbeddedFlow(null)} />
                      )
                    ) : detailItem?.detail && detailCategory ? (
                      <div className="p-3">
                        <GenericListingCard
                          item={detailItem.detail}
                          category={detailCategory}
                          upvotes={!!detailCategory.upvotesEnabled}
                          count={detailItem.detail.upvotes ?? 0}
                          expanded
                          dense
                          hideBorder
                          highlightColor={activeColor}
                          onVote={() => {}}
                          onTagClick={() => {}}
                          onFilterOpen={() => {}}
                          onFilterBool={() => {}}
                          onFilterSelect={() => {}}
                          onEdit={() => detailItem.go()}
                          onReport={() => detailItem.go()}
                          onExpandedChange={(next) => { if (!next) setDetailItemId(null) }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )

            return (
              <div className="grid" style={{ gridTemplateColumns: `repeat(${categories.length}, 1fr)` }}>
                {/* One shared flex row holding BOTH boxes, spanning the two
                    columns they together occupy — keeping them as flex
                    siblings of a single container (rather than two
                    independently-positioned grid items) is what makes them
                    share a flush top/bottom edge and a shared border
                    regardless of which side the second box is anchored to. */}
                <div style={{ gridColumn: `${spanStart} / ${spanEnd}` }} className="flex items-stretch">
                  {anchorLeft ? (
                    <>
                      {secondBox}
                      {listBox}
                    </>
                  ) : (
                    <>
                      {listBox}
                      {secondBox}
                    </>
                  )}
                </div>
              </div>
            )
          })()}
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
    <div className="absolute left-6 inset-y-0 flex items-center text-left">
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full text-[#fefefe] hover:bg-white/10 cursor-pointer"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
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
        {resources && (
          <nav className="min-h-0 flex-1 overflow-y-auto py-2">
            {resources.map((card) => (
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
        )}
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
  const zmanimSectionRef = useRef<HTMLDivElement>(null)
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
      {/* ── Condensed top bar — site name + tagline only now (the search box
              moved into its own "What are you looking for?" section right
              below). Used to also carry a Volunteer/Support/Young
              Professionals quick-links row here; removed as duplicative once
              the "Get Connected" section further down covered the same links
              with real lists under them. Desktop only: mobile keeps its
              existing compact top (with its own separate title/search in
              HeroHeading), untouched. Full-bleed band (same breakout as the
              sections below it) — see [[project_art_deco_home_redesign]].
              `sm:relative` anchors the hamburger menu (quick links to every
              category's full page) pinned to its top-left corner. ────────── */}
      <section className="hidden sm:block sm:relative sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#0C3D57] sm:px-6 sm:py-6 sm:text-center">
        <HamburgerMenu resources={resources} />
        <h1 className="text-3xl font-extrabold tracking-tight text-[#fefefe]">
          {settings.name}
        </h1>
        {/* Fixed copy per explicit request, not `settings.tagline` — this
                exact sentence replaces whatever the admin-configured tagline
                would otherwise show here. */}
        <p className="text-sm text-[#fefefe]">
          Community resources for residents, visitors, and hospital patients
        </p>
      </section>

      {/* ── "What are you looking for?" search section — its own band between
              the top bar and the map, centered. `settings.heroTitle`
              (defaults to "What are you looking for?") is now the search
              bar's own placeholder text instead of a separate heading above
              it — same admin-editable copy mobile's HeroHeading shows, so
              the two never drift apart. Full-bleed-outer + `mx-auto
              max-w-6xl px-6`-inner wrapper, same pattern as the map/Get
              Connected/Zmanim bands below. Same navy `#0C3D57` fill as the
              top bar directly above it (no border/seam between them), so
              the two read as one continuous band — the search pill itself
              is a solid white pill regardless, so it stays legible either
              way. ─────────────────────────────────────────────────────── */}
      {ui.search.landing && (
        <section className="hidden sm:block sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#0C3D57] sm:py-8">
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
                    className="min-w-0 flex-1 bg-transparent px-3 text-[15px] text-slate-900 placeholder:text-slate-500 focus:outline-none"
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

      {/* ── Mobile-only now: "What are you looking for?" heading + filter —
              desktop hides this whole band since its title was removed and
              its search box moved into the dedicated search section above. ─ */}
      <HeroHeading
        settings={settings}
        query={query}
        onQueryChange={setQuery}
      />

      {/* ── Desktop: "jump to" results — categories/Zmanim that match the search
              box's query but no longer have a tile of their own (they moved into
              the map list or the widget below), so this is how the search box
              still reaches them. ──────────────────────────────────────────── */}
      {hiddenFeatureMatches.length > 0 && (
        <div className="mt-6 hidden sm:flex flex-wrap gap-2">
          {hiddenFeatureMatches.map((card) => (
            <button
              key={card.id}
              onClick={() => (card.id === 'zmanim' ? jumpToZmanim() : jumpToMapCategory(card.id!))}
              className="inline-flex items-center gap-2 rounded-full border-2 border-[#3a86ff] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-[#3a86ff] hover:text-white cursor-pointer"
            >
              {card.icon && <span aria-hidden="true">{card.icon}</span>}
              {card.title}
              <span aria-hidden="true" className="text-slate-400">↓</span>
            </button>
          ))}
        </div>
      )}

      {/* ── The map — the real full map screen, right on the home screen. Its
              own category tabs (down the map's left edge) cover browsing by
              category directly on the map now, so there's no separate
              "Browse by Category" list beside it anymore — the map takes the
              full width. Desktop only: mobile now reaches the same map via
              its own tab bar entry, so it's dropped from this scroll to
              avoid showing it twice. ─────────────────────────────────────── */}
      {/* Full-bleed band (same `w-screen` + `margin-left: calc(50% - 50vw)`
              breakout as the hero above) — the map itself now runs edge-to-
              edge and fills the full viewport height too (`h-screen` inside
              ResourceMapView, gated on `embedded`), so this stretch of the
              page reads as a full-screen map while it's in view instead of
              a bordered card inset within the normal max-w-6xl column. ─── */}
      {hasMap && (
        <div ref={mapSectionRef} className="hidden sm:block scroll-mt-24 sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#fefefe]">
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

      {/* ── Get Connected — desktop only, full-bleed band between the map and
              the Zmanim widget (the slot the app's original "Get Connected"
              section held before it was replaced by the top-bar quick-links
              row — see the history comment on `quickLinksCards` above). One
              big navy panel with the five categories as tabs across the
              top instead of five separate white cards in a grid — click one
              to switch which list shows in the rectangle beneath it (see
              GetConnectedAccordion above). Each list is pulled from the
              real pages/flows those old quick-link buttons already opened
              (not new/duplicated content) — Professional Networks and
              Social Opportunities both draw from the same young-
              professional listings, just split by which read as networking
              vs. purely social (see SOCIAL_OPPORTUNITY_NAMES above).
              Separated from the map above (and Zmanim below) by a plain
              divider line rather than a border boxing the whole section in
              — same #fefefe fill throughout, so the line is the only thing
              marking the seam. ────────────────────────────────────────── */}
      <div className="hidden sm:block sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#fefefe] sm:py-8">
        <div className="sm:mx-auto sm:max-w-6xl sm:px-6">
          <div className="border-t border-slate-200 pt-8">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold tracking-tight text-[#0C3D57]">Get Connected</h2>
              <div className="mx-auto mt-2 h-1 w-16 rounded-full bg-[#3a86ff]" aria-hidden="true" />
            </div>
            <div className="mt-8">
              <GetConnectedAccordion categories={getConnectedCategories} categoryConfigs={categories} />
            </div>
          </div>
        </div>
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

      {/* ── Matching places (individual listings within the cards) ───────────── */}
      {placeHits.length > 0 && (
        <PlacesResults hits={placeHits} onOpen={openPlace} />
      )}

      {/* ── Zmanim widget — live candle-lighting/Havdalah times, replacing the
              plain Zmanim tile that used to sit in the grid above. Desktop
              only: mobile keeps its Zmanim tile in the combined grid. Same
              full-bleed white band treatment as the map section, separated
              from the Get Connected band above it by a plain divider line
              (same treatment as Get Connected's own top divider) rather than
              a border boxing it in — its content stays re-inset to the
              normal max-w-6xl column (like the hero/Get Connected bands),
              since a two-column list of zman times shouldn't stretch across
              the whole browser width the way the map benefits from. ────── */}
      <div ref={zmanimSectionRef} className="hidden sm:block scroll-mt-24 sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#fefefe] sm:py-10">
        <div className="sm:mx-auto sm:max-w-6xl sm:px-6">
          <div className="border-t border-slate-200 pt-10">
            <ZmanimWidget coords={coords} locationLabel="Your location" title={zmanimCategory?.pluralLabel} />
          </div>
        </div>
      </div>
    </main>
  )
}
