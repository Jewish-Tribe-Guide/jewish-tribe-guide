'use client'

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { track } from '@vercel/analytics'
import type { DirectoryResource } from '@/types'
import { PHOTO_FIELD_KEY, resolveCapabilities, selectValues, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { getOpenStatus, CLOSURE_LABELS } from '@/lib/hours'
import { useNow } from '@/lib/useNow'
import { getCategoryColor } from '@/lib/categoryColor'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import CategoryIcon from '@/components/CategoryIcon'
import PinnedBadge from '@/components/PinnedBadge'
import { CheckIcon, ExternalIcon, PinIcon, ThumbtackIcon } from '@/components/icons'
import UpvoteButton from './UpvoteButton'
import ListingDetailModal from './ListingDetailModal'
import MobileSheet from './MobileSheet'
import MapPlaceDetail from '@/components/map/MapPlaceDetail'
import { useListingActions, type ListingAction } from './useListingActions'
import SwipeRow, { type SwipeAction } from '@/components/SwipeRow'
import Chip from './Chip'
import { travelParts } from '@/lib/listingTravel'
import { ui } from '@/lib/uiConfig'
import { useIsMobile } from '@/lib/useIsMobile'
import { usePinned } from '@/lib/pinnedContext'

/** Pin and Share are the two that belong to SCANNING a list — shortlisting
 *  as you read, sending one to someone. "Set as location" is deliberately
 *  not here: it re-sorts the entire directory, which is a deliberate act
 *  rather than something you do in passing, and two actions is the practical
 *  ceiling for a swipe on a phone. It lives in the fan below an opened
 *  listing instead. */
const CARD_ACTION_IDS: ListingAction['id'][] = ['pin', 'share']

function CardActionIcon({ action }: { action: ListingAction }) {
  const cls = 'h-4 w-4 shrink-0'
  // Always the outline thumbtack, never ThumbtackIcon's filled variant.
  // Filled renders the literal 📌 glyph, and PinnedBadge already puts one of
  // those on this very card's avatar when a listing is pinned — two on one
  // card is redundant to look at and genuinely ambiguous to query. The state
  // still reaches everyone: the label these buttons carry is "Pin" or
  // "Pinned" straight from useListingActions.
  if (action.id === 'pin') return <ThumbtackIcon className={cls} />
  if (action.id === 'share') return action.active ? <CheckIcon className={cls} /> : <ExternalIcon className={cls} />
  return <PinIcon className={cls} />
}

// ── Card field helpers ──────────────────────────────────────────────────────────

// Trim a full mailing address down to "street, city" for the quiet card subtitle
// (drops state, zip, and country). The full address still shows when expanded.
function shortAddress(addr: string): string {
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length <= 2 ? parts.join(', ') : `${parts[0]}, ${parts[1]}`
}

/** Imperative handle for opening/closing this card's detail from OUTSIDE it —
 *  specifically GenericDirectory's arrow-key next/prev (see ListingDetailModal's
 *  onNavigate), which needs to close THIS card and open a SIBLING one it has
 *  no other way to reach: `expanded` is local state, and there's no shared
 *  "currently open" state to lift without every card re-rendering on every
 *  other card's open/close.
 *
 *  The measure-and-set spacer-height pairs are GenericDirectory's row-alignment
 *  mechanism — see its own alignRows doc for why this is a real per-row DOM
 *  measurement, not a heuristic guess. Two independent SEGMENTS, not one
 *  shared spacer: segment 1 is "icon/name/address/header text" (the part
 *  that actually varies — a long name, a filled-in vs. blank header field),
 *  segment 2 is "the upvote/distance row's own content" (normally the same
 *  height everywhere, but travel text can still wrap for one listing and
 *  not its row-mates). Aligning them separately is what makes the
 *  popularity/distance LINE itself land at the same height across a row —
 *  not just the badges below it — with the actual padding falling as a
 *  real gap between the address block and that line, not a single lump
 *  shoved in at the very bottom right before the badges. */
export type GenericListingCardHandle = {
  open: () => void
  close: () => void
  /** Segment 1: pixel height from the card root to the upvote/distance
   *  row, with both this card's own spacers at 0 — null when there's no
   *  upvote/distance row to align to (falls back to measuring straight to
   *  the badge row instead, via measureBadgeGap). */
  measureUpvoteRowOffset: () => number | null
  /** Segment 2: pixel height from the upvote/distance row's own bottom (or
   *  the card root, when there's no upvote/distance row) to the badge row,
   *  with both spacers at 0 — null when there's no badge row. */
  measureBadgeGap: () => number | null
  /** Sets (or clears, at 0) the spacer directly above the upvote/distance
   *  row. */
  setUpvoteSpacerHeight: (px: number) => void
  /** Sets (or clears, at 0) the spacer directly above the badge row. */
  setBadgeSpacerHeight: (px: number) => void
}

type Props = {
  item: DirectoryResource
  category: CategoryConfig
  upvotes: boolean
  count: number
  defaultExpanded?: boolean
  /** Show "Category · address" as the subtitle instead of just the address —
   *  useful in a mixed-category list (e.g. search results) but redundant on a
   *  single-category directory page, which already says the category once in
   *  its header. Defaults on. */
  showCategoryLabel?: boolean
  /** Hold the distance column open with a tappable placeholder when this
   *  listing has no distance to show.
   *
   *  The column used to render only when there WAS a distance, so with no
   *  location set it wasn't empty — it was absent, and every card looked
   *  complete. Nothing in the list hinted that distances existed, which is
   *  why the feature went unnoticed: the only clue was a single pill at the
   *  top of the directory, easily read as the first-load location popup the
   *  visitor had already dismissed.
   *
   *  Set by the directory, which knows a location is unset AND that this
   *  category is distance-based (`addressPrompt` — see ResourceLoader).
   *  Off by default: cross-category lists like the landing search render this
   *  same card with no directory around them. */
  showDistanceSlot?: boolean
  onVote: (count: number) => void
  onTagClick: (tag: string) => void
  /** When provided, clicking the listing's name navigates to that item's own
   *  category directory instead of expanding the card in place — used by
   *  cross-category lists (landing search) where "this row" and "its home
   *  page" are different places. Single-category directories leave this
   *  unset so a name click still just expands, matching every other tap on
   *  the row. */
  onNameClick?: () => void
  /** Click the "Open" badge → turn on the "Open now" filter. */
  onFilterOpen: () => void
  /** Click a boolean badge (e.g. "Kosher") → enable that boolean filter. */
  onFilterBool: (key: string) => void
  /** Click a select badge (e.g. cert "IKC", type "Restaurant") → add/remove it
   *  from that field's filter (the filter always allows more than one value
   *  chosen at once, regardless of the field's own `multiSelect` setting). */
  onFilterSelect: (key: string, value: string) => void
  onEdit: () => void
  /** Fired synchronously alongside every `setExpanded` call (the row's own
   *  toggle, ListingDetailModal's onClose, and the imperative open()/
   *  close() below) — lets GenericDirectory keep `?item=<id>` in sync with
   *  whichever card is actually open. Deliberately NOT a `useEffect`
   *  watching `expanded`: `navigateFromCard`'s close-then-open pair runs on
   *  two different card instances in the same commit, and passive effects
   *  fire in tree order, not call order — a card later in the list would
   *  have its "closed" effect run AFTER an earlier card's "opened" effect,
   *  clobbering the URL back to the wrong value. Calling this directly at
   *  each call site preserves the actual close-then-open sequence instead. */
  onExpandedChange?: (expanded: boolean) => void
  /** Desktop only (see ListingDetailModal's own doc comment) — arrow-key
   *  next/prev while this card's dialog is open. Wired by GenericDirectory,
   *  which is the only thing that knows the current filtered/sorted order
   *  and every sibling card's GenericListingCardHandle. */
  onNavigate?: (direction: 1 | -1) => void
  /** Whether onNavigate actually has somewhere to go — see
   *  ListingDetailModal's own doc comment on why this draws a dimmed,
   *  inert arrow at either end instead of no arrow at all. */
  hasPrev?: boolean
  hasNext?: boolean
}

export const GenericListingCard = forwardRef<GenericListingCardHandle, Props>(function GenericListingCard({
  item,
  category,
  upvotes,
  count,
  defaultExpanded,
  onVote,
  onTagClick,
  onFilterOpen,
  onFilterBool,
  onFilterSelect,
  onEdit,
  showCategoryLabel = true,
  showDistanceSlot = false,
  onNameClick,
  onNavigate,
  hasPrev,
  hasNext,
  onExpandedChange,
}, ref) {
  const [expanded, setExpanded] = useState(!!defaultExpanded)
  // Two independent alignment segments — see GenericListingCardHandle's own
  // doc for why this is two spacers, not one. cardRootRef anchors segment
  // 1 (icon/name/address/header text, ending at the upvote row); the
  // upvote row's own bottom anchors segment 2 (its own content, ending at
  // the badge row).
  const cardRootRef = useRef<HTMLDivElement>(null)
  const upvoteRowRef = useRef<HTMLDivElement>(null)
  const badgeRowRef = useRef<HTMLDivElement>(null)
  const upvoteSpacerRef = useRef<HTMLDivElement>(null)
  const badgeSpacerRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => ({
    open: () => {
      setExpanded(true)
      onExpandedChange?.(true)
    },
    close: () => {
      setExpanded(false)
      onExpandedChange?.(false)
    },
    measureUpvoteRowOffset: () => {
      if (!cardRootRef.current || !upvoteRowRef.current) return null
      return upvoteRowRef.current.getBoundingClientRect().top - cardRootRef.current.getBoundingClientRect().top
    },
    measureBadgeGap: () => {
      if (!badgeRowRef.current) return null
      const from = upvoteRowRef.current ?? cardRootRef.current
      if (!from) return null
      const fromBottom = upvoteRowRef.current
        ? upvoteRowRef.current.getBoundingClientRect().bottom
        : from.getBoundingClientRect().top
      return badgeRowRef.current.getBoundingClientRect().top - fromBottom
    },
    setUpvoteSpacerHeight: (px: number) => {
      if (upvoteSpacerRef.current) upvoteSpacerRef.current.style.height = px > 0 ? `${px}px` : '0px'
    },
    setBadgeSpacerHeight: (px: number) => {
      if (badgeSpacerRef.current) badgeSpacerRef.current.style.height = px > 0 ? `${px}px` : '0px'
    },
  }))
  const categories = useCategories()
  const community = useCommunitySlug()
  // Which UI opens on click: a sheet on a phone (MobileSheet, like Add and
  // Edit), a centered dialog on desktop (ListingDetailModal). Same
  // `expanded` state either way — just where it renders. `useIsMobile`
  // starts `false` until mount (see its own SSR-safe note), so a listing
  // reopened via `defaultExpanded` can flash as "modal open" on a phone for
  // one tick before settling into the sheet — accepted the same way the
  // other isMobile-gated layout branches in this app already are.
  const isMobile = useIsMobile()
  // The Share path the card's own actions (and the edit bar's fan) need.
  const listingPath = routes.listing(community, category.id, listingSlug(item))
  const { isPinned } = usePinned()
  const pinned = isPinned(item.id)

  // Pin/Share for the collapsed row: revealed by a swipe on mobile, by
  // hovering the row on desktop. Both are shortcuts — ListingActionsFan
  // below an opened listing is where these are reachable by every visitor,
  // which is what makes it safe for the card's own copies to be invisible
  // until asked for.
  const cardActions = useListingActions(item, category, listingPath).filter((a) =>
    CARD_ACTION_IDS.includes(a.id),
  )
  // The mobile swipe is SwipeRow, the same one the map's nearby list uses,
  // so the gesture and the circles it reveals are identical on both. Worded
  // the way that swipe always has been: "Unpin" says what the tap will do,
  // where the fan's "Pinned" (a menu item, whose label is its only state
  // cue) says what's true now.
  const rowSwipeActions: SwipeAction[] = cardActions.map((a) => {
    const label = a.id === 'pin' ? (a.active ? 'Unpin' : 'Pin') : a.label
    return { id: a.id as SwipeAction['id'], label, ariaLabel: `${label} ${item.name}`, active: a.active, onSelect: a.onSelect }
  })

  const fields = category.detailFields
  // Per-category capabilities layered under the global `ui.contributions` switches.
  const caps = resolveCapabilities(category.capabilities)
  const canEdit = ui.contributions.edit && caps.edit
  const hoursFields = fields.filter((f) => f.type === 'hours')
  const badgeFields = fields.filter((f) => {
    if (f.type === 'tags' || f.type === 'url' || f.type === 'hours' || f.type === 'minyanim' || f.type === 'image') return false
    return (f.renderAs ?? (f.type === 'boolean' ? 'badge' : 'row')) === 'badge'
  })

  // A listing is "Open" if ANY of its hours fields say so — see getOpenStatus.
  // Against useNow rather than the render's own clock: this badge is the most
  // time-sensitive thing on the card, and it ships inside HTML that can be
  // served from the CDN or the service worker's cache long after it was built.
  const { isOpen, closing, closure } = getOpenStatus(item, hoursFields.map((f) => f.key), new Date(useNow()))
  const travel = travelParts(item)
  const hasUpvoteRow = upvotes || travel.length > 0 || showDistanceSlot

  // Its own full-width row under the icon (see that row's own comment on
  // why), shared by mobile and desktop alike — a column squeezed into the
  // collapsed row's corner is what this used to be on mobile, which crowded
  // that corner out once a kebab menu needed the same spot (see this
  // function's git history and GenericListingCard's own corner comment).
  const renderUpvoteDistanceContent = () => (
    <>
      {upvotes && <UpvoteButton variant="inline" resourceId={item.id} count={count} onCountChange={onVote} />}
      {upvotes && (travel.length > 0 || showDistanceSlot) && (
        <span aria-hidden="true" className="text-slate-300">|</span>
      )}
      {travel.length > 0 ? (
        // A straight-line distance is measured FROM the visitor's typed
        // location (see listingTravel.ts), so there's a real action here:
        // reopen the same picker the empty-state button below opens, to
        // correct or update it. Same chip treatment as the upvote button
        // beside it — the row used to be one clickable pill next to one
        // plain-text fact, which read as lopsided; making both chips means
        // the whole row reads as "these are controls", which is also what
        // makes the empty-state chip below read as clickable on sight
        // rather than needing its own explaining.
        <button
          type="button"
          aria-label="Change your location"
          onClick={(e) => {
            e.stopPropagation()
            document.dispatchEvent(new CustomEvent('jpc:open-location'))
          }}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 cursor-pointer"
        >
          <PinIcon className="h-3 w-3 text-primary" />
          {travel[0].text}
        </button>
      ) : showDistanceSlot ? (
        // Same chip as the resolved-distance case above (see its own
        // comment) — this used to be plain muted text with no background,
        // deliberately restrained to avoid reading as "another badge" —
        // but that meant it was the ONLY thing in the row not styled like a
        // control, which undercut exactly the "tap this" signal it needed
        // most. Matching the row's other chips instead teaches "everything
        // here is tappable" once, rather than needing this one element to
        // carry that message alone.
        <button
          type="button"
          aria-label="Set your location to see distances"
          onClick={(e) => {
            // The row's own handler expands the card. This tap was for the
            // picker, not for this listing's details.
            e.stopPropagation()
            document.dispatchEvent(new CustomEvent('jpc:open-location'))
          }}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 cursor-pointer"
        >
          <PinIcon className="h-3 w-3" />
          Distance
        </button>
      ) : null}
    </>
  )

  // url fields explicitly opted into the collapsed row (showInHeader) — a
  // quick way to reach something like a WhatsApp "Join group" link without
  // expanding the card first. Unchecked (the default) leaves a url field
  // exactly where it's always been: an action button inside PlaceDetailBody,
  // reachable only once expanded.
  const headerUrlFields = fields
    .filter((f) => f.type === 'url' && f.showInHeader)
    .map((f) => ({ f, href: item[f.key] as string | undefined }))
    .filter((x): x is { f: CategoryField; href: string } => !!x.href)

  // text/textarea fields explicitly opted into the collapsed row — a short
  // note ("Sit-down glatt kosher steakhouse, under IKC supervision") that
  // says what the place actually is, without expanding the card first.
  //
  // `text` stays single-line (`truncate`): the same one-line limit applies
  // at every width, so the decision to keep it short lives in what gets
  // typed, not in how long a line the layout happens to allow — and it's
  // normally already guaranteed to fit by `headerMaxLength` anyway (this
  // just insures against a value that predates the cap, or one written some
  // other way than the submission form).
  //
  // `textarea` clamps to a few lines instead (`headerTextClampStyle` below) — a
  // real free-form description (Networking's listings are just a name and
  // a website otherwise, with nothing else to fill the card) has no
  // sensible one-line-or-nothing shape the way a short tagline does, and
  // forcing one would cut it off after a handful of words. line-clamp's own
  // ellipsis is the "…" that invites opening the card for the rest, not a
  // separate affordance drawn on top of it.
  const headerTextFields = fields
    .filter((f) => (f.type === 'text' || f.type === 'textarea') && f.showInHeader)
    .map((f) => ({ f, text: (item[f.key] as string | undefined)?.trim() }))
    .filter((x): x is { f: CategoryField; text: string } => !!x.text)
  // Not a `line-clamp-3` className on the same element as `hidden
  // desktop:block` — line-clamp needs `display: -webkit-box` to do
  // anything at all (confirmed live: every -webkit-line-clamp/box-orient/
  // overflow property was present in computed style, but `display` came
  // out `block`, and line-clamp is a silent no-op — the full text just
  // rendered — without that specific display value), and `block` is what
  // wins the cascade when both are plain utility classes on one element.
  // Kept as inline style on an INNER element below instead, one level
  // removed from the classes doing responsive show/hide, so the two
  // display values are never fighting over the same element to begin with.
  const headerTextClampStyle = { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' } as const

  // Collapsed-row signal badges — only the ones tied to a real filter control
  // (boolean/select fields marked `filterable`). Everything else (cert
  // badges without a filter, all tags) only shows once expanded, inside
  // PlaceDetailBody.
  const headerBadges = badgeFields.filter((f) => {
    if (!f.filterable) return false
    return f.type === 'boolean' ? !!item[f.key] : selectValues(item[f.key]).length > 0
  })
  const caveatNote = (f: CategoryField): string | null => {
    if (!f.caveat || !item[f.caveat.flagField]) return null
    return String(item[f.caveat.noteField] ?? '').trim()
  }

  // "N {items}" on the collapsed card for a tags field an admin has opted in
  // via showCountInHeader — a grocery category's "which kosher items does
  // this place carry" is the motivating case, but this isn't hardcoded to
  // kosher: tags fields are excluded from badgeFields entirely (they're meant
  // for the opened listing), and a field's key/label/tagGroup are all
  // per-community admin text with nothing stable to match against — tagGroup
  // in particular is auto-derived from the label (see categoryEditorLogic.ts)
  // and drifts the moment someone edits it. showCountInHeader is the same
  // explicit opt-in shape as showInHeader (text/url fields), just for tags.
  const countHeaderField = fields.find((f) => f.type === 'tags' && f.showCountInHeader)
  // Tags fields store two arrays — the plain key ("always") and a
  // `_sometimes` companion (see TagsInput's green/amber toggle) — and both
  // are real, user-authored items (PlaceDetailBody shows "sometimes" tags in
  // their own section rather than hiding them). Missing the companion here
  // undercounted any listing with sometimes-kosher items.
  const countHeaderCount = countHeaderField
    ? selectValues(item[countHeaderField.key]).length +
      selectValues(item[countHeaderField.key + '_sometimes']).length
    : 0
  // An admin-chosen field (countReplacesKey — see its own doc) whose badge
  // would otherwise repeat the same fact the count already says, e.g. a
  // "Kosher Items" store-type badge next to a "12 kosher items" count.
  // Suppressed from the generic badge loop below only when there's an actual
  // count to replace it with; a listing that qualifies but has no items
  // typed in yet still gets that other badge as before.
  const suppressedBadgeKey = countHeaderCount > 0 ? countHeaderField?.countReplacesKey : undefined
  const visibleHeaderBadges = suppressedBadgeKey
    ? headerBadges.filter((f) => f.key !== suppressedBadgeKey)
    : headerBadges

  const showAddress = category.hasAddress !== false && !!item.address
  const subtitleParts = [showCategoryLabel ? category.label : null, showAddress ? shortAddress(item.address!) : null].filter(Boolean)
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : (item.googleDescription as string | undefined) || null

  const color = getCategoryColor(categories, category.id)
  // Closes whichever surface the listing is open in: the sheet on a phone,
  // the dialog on desktop.
  const close = () => {
    setExpanded(false)
    onExpandedChange?.(false)
  }
  // Shared with ListingDetailModal's own header avatar on desktop — computed
  // once here rather than duplicated, since it's the same "which photo (if
  // any) represents this listing" decision either way.
  const iconImageUrl =
    (typeof item[PHOTO_FIELD_KEY] === 'string' && (item[PHOTO_FIELD_KEY] as string).trim()
      ? (item[PHOTO_FIELD_KEY] as string)
      : category.iconImageUrl) ?? undefined

  // The chips that survive collapsed (Open/closure + filterable badges) — see
  // the badge row's own comment further down. Pulled into a variable, not
  // just inline JSX, because ListingDetailModal needs the identical row
  // restated in its own header on desktop (the card behind it is obscured by
  // the modal's backdrop), and computing it twice would be two places a
  // badge rule could drift out of sync.
  const badgeRow = (isOpen || closure || visibleHeaderBadges.length > 0 || countHeaderCount > 0) ? (
    <>
      {/* Closure outranks everything: it used to appear only once the card
          was expanded, so a temporarily-closed shop was indistinguishable
          from an open one in a directory list — worse, its saved hours still
          earned it a green "Open" chip. Not a filter chip like the others;
          there is nothing useful to filter to here. */}
      {closure && (
        <Chip tone={closure === 'permanent' ? 'red' : 'amber'}>{CLOSURE_LABELS[closure]}</Chip>
      )}
      {isOpen && (closing?.closesSoon ? (
        <span className="relative group/tip">
          <Chip tone="greenSolid" onClick={(e) => { e.stopPropagation(); onFilterOpen() }}>
            Closes Soon
          </Chip>
          <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-max max-w-[220px] whitespace-normal rounded bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 hidden sm:block z-10">
            Closes at {closing.closeLabel}
          </span>
        </span>
      ) : (
        <Chip tone="green" onClick={(e) => { e.stopPropagation(); onFilterOpen() }} title="Filter to listings open now">
          Open
        </Chip>
      ))}
      {countHeaderCount > 0 && countHeaderField && (() => {
        // countLabel is meant to be a clean singular noun ("kosher item"),
        // but the fallback — a field's own `label`, just lowercased — is
        // often already phrased as a plural ("Kosher Items available").
        // Blindly appending "s" to that doubled up ("kosher itemss"); only
        // add it when the noun doesn't already end in one, which covers the
        // fallback case without needing real pluralization logic this app
        // has no other use for.
        const noun = countHeaderField.countLabel ?? countHeaderField.label.toLowerCase()
        const plural = countHeaderCount === 1 || noun.endsWith('s') ? noun : `${noun}s`
        return (
          // Not clickable — unlike the other badges here, which each map to
          // one filter control, the field this one might be replacing
          // (countReplacesKey) can be boolean or select depending on the
          // category, and there's no single filter action that's correct
          // for both. Purely informational: it's the "there's more here"
          // signal that pulls a shopper into expanding the card. Slate, not
          // a color already carrying meaning elsewhere on this card (green
          // means "open"/a positive filter state) — this badge is a fact,
          // not a status.
          <Chip tone="slate" title={`See which ${plural} this place has`}>
            {/* A slate chip is deliberately quiet — it shouldn't shout the
                way "Open" does — but that risked reading as just another
                static fact next to Restaurant/Parve instead of an invitation
                to expand. Bolding only the number (not recoloring the whole
                chip) borrows the same "128 reviews" convention other
                directory apps use for exactly this signal, without undoing
                the color choice that was made deliberately. */}
            <span className="font-semibold">{countHeaderCount}</span> {plural}
          </Chip>
        )
      })()}
      {visibleHeaderBadges.flatMap((f) => {
        const values = f.type === 'select' ? selectValues(item[f.key]) : [f.filterLabel ?? f.label]
        // Resolve each stored value to the option's CURRENT label — a
        // renamed option's label should show up on cards immediately,
        // without needing every listing that had it selected re-saved.
        // Falls back to the raw value for anything renamed via
        // resourceStore's applyFieldOptionRenames (which stores the new
        // value directly) or a value with no matching option at all.
        const labelFor = (v: string) => f.options?.find((opt) => opt.value === v)?.label ?? v
        const note = caveatNote(f)
        const amber = note !== null
        return values.map((value) => {
          const text = labelFor(value)
          const btn = (
            <Chip
              tone={amber ? 'amber' : 'slate'}
              onClick={(e) => {
                e.stopPropagation()
                if (f.type === 'boolean') onFilterBool(f.key)
                else onFilterSelect(f.key, value)
              }}
              title={amber ? undefined : `Filter by ${text}`}
            >
              {text}
            </Chip>
          )
          if (!amber) return <span key={`${f.key}:${value}`}>{btn}</span>
          return (
            <span key={`${f.key}:${value}`} className="relative group/tip">
              {btn}
              <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-max max-w-[220px] whitespace-normal rounded bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 hidden sm:block z-10">
                {note || 'Not everything here is kosher — please verify.'}
              </span>
            </span>
          )
        })
      })}
    </>
  ) : null

  return (
    // No `overflow-hidden`: it would clip the cert badge's hover tooltip on a
    // collapsed card. Corners stay clean because the row rounds its own
    // edges below. h-full: in the desktop grid (see
    // GenericDirectory) the wrapper div around each card is the actual grid
    // item, and a CSS grid row already stretches that wrapper to match its
    // tallest neighbor — but a plain block child doesn't inherit that height
    // on its own, so without this the wrapper was the right height and the
    // visible bordered card inside it wasn't, leaving cards in the same row
    // looking mismatched even though their invisible containers matched. A
    // no-op everywhere the card isn't a stretched grid item (mobile's single
    // column, the admin category preview).
    <div className="h-full border border-slate-200 rounded-lg bg-white shadow-sm">
      {/* Not role="button"/tabIndex any more — the row also contains real
          interactive children (UpvoteButton, an external-link <a>, the
          Open/badge Chips), and an ARIA button role can't legally contain
          other interactive controls (axe's nested-interactive rule: a
          screen reader can't reliably operate one nested inside another).
          The onContentClick below stays as a mouse/touch convenience — "click
          anywhere on the row" — but the actual accessible, keyboard-operable
          toggle is now the chevron <button> further down. It carries no
          onClick of its own; a native button's click (mouse or keyboard)
          bubbles right up to this handler, so there's exactly one place the
          toggle logic lives, not two copies to keep in sync. */}
      <SwipeRow
        rowId={item.id}
        actions={rowSwipeActions}
        // Mobile only: desktop reveals the same two actions by hovering the
        // row instead (see the hover-reveal in the corner below).
        enabled={isMobile}
        className="rounded-lg"
        contentRef={cardRootRef}
        // SwipeRow keeps this from firing for the click a swipe ends with,
        // and for a tap on a row whose actions are showing — that tap puts
        // them away instead of expanding the card.
        onContentClick={() => {
          // The side effects deliberately sit OUTSIDE the state update, not
          // inside an updater function. A `setExpanded((p) => { …effects…;
          // return !p })` reads like the safe way to toggle, but React calls
          // an updater during the render pass and may call it more than once
          // (StrictMode does so on purpose) — so `track` could double-count,
          // and a parent that does any state of its own in onExpandedChange
          // gets "Cannot update a component while rendering a different
          // component" (GenericDirectory does exactly that now, to hide its
          // floating Add button while this card's dialog covers it).
          // Reading `expanded` straight from the closure is correct here
          // because this is an event handler: it runs after the last commit,
          // so the value is current.
          const next = !expanded
          setExpanded(next)
          if (next) track('listing_opened', { listing: item.name, category: category.id })
          onExpandedChange?.(next)
        }}
        // h-full: on desktop this row is the ENTIRE visible card (the outer
        // wrapper's own h-full — see its comment — only stretches the
        // invisible container to match the grid row; this inner div is what
        // actually paints the border-to-border clickable/hoverable surface).
        // Without it, a card whose content is shorter than its tallest
        // row-mate — even with the invisible headerTextField placeholder
        // below reserving a line for the description — left a dead strip at
        // the bottom of the card: inside the visible border, past where this
        // div's own content ended, unclickable and with no hover state,
        // which is exactly what read as "the whole card isn't clickable."
        // group/row drives the desktop hover-reveal in the corner — named
        // rather than bare `group` because the card already nests groups of
        // its own (group/tip on the cert badges).
        // relative + bg-white so this row paints OVER the swipe actions
        // behind it; without an opaque background they'd show through.
        contentClassName="group/row relative h-full w-full rounded-lg bg-white px-4 py-3 hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition-colors duration-200 ease-out"
      >
        {/* items-center, not items-start, on mobile: the row's only ever
            2 lines there (name + subtitle — headerTextFields below is
            `hidden desktop:block`, so the 3-line case items-start exists for
            never reaches mobile at all), and centering is what makes the
            trailing upvote/distance/chevron column read as lined up against
            the name+address block instead of pinned to its top corner (this
            exact "ours looks higher than it should" complaint already
            happened once — see fb8113f, reverted by a later desktop-grid fix
            that reapplied items-start unconditionally). desktop:items-start
            is for the desktop grid instead: a header text field DOES render
            there, occasionally making this block 3 lines instead of 2, and
            without items-start the icon (and the trailing column) drift
            toward the middle of that taller block instead of staying
            anchored near the name's own line. */}
        {/* relative: the positioning context for the absolutely-
            placed kebab/toggle group further down, and the reserved space
            that keeps this row's name text (and the description/upvote
            rows below, though neither actually gets close to the edge in
            practice) from running underneath it. Wraps this row through
            the upvote/distance row — everything above the badge divider —
            which is the actual "centered against the whole card" the
            kebab is centered against; see that group's own comment for why
            this wrapper's exact extent is what it is. */}
        <div className="relative">
        <div className="flex items-center desktop:items-start gap-3">
          {/* Icon avatar — same glyph/image + tinted color as this category's
              map pin (see getCategoryColor), so a place reads as the same
              thing here and on the map. self-start (overriding the row's own
              items-center on mobile, and reinforcing its own items-start on
              desktop) keeps it pinned near the name's own line regardless of
              how tall the block next to it gets — an avatar anchored to the
              title reads right at any height. mt-0.5 nudges it those last
              couple pixels: the name's own line-height leaves a little
              leading above the visible text, so even with matching box tops
              the glyph itself starts lower than the icon. */}
          {/* self-start/mt-0.5 moved to this wrapper (was on CategoryIcon
              itself) so the badge below can anchor to the same box without
              disturbing the icon's own position in the row — see the
              comment above for what those two classes are actually doing. */}
          <span className="relative shrink-0 self-start mt-0.5">
            <CategoryIcon
              icon={category.icon}
              categoryId={category.id}
              iconImageUrl={iconImageUrl}
              color={color}
              className="h-10 w-10 text-xl"
            />
            {pinned && <PinnedBadge />}
          </span>

          {/* Name + subtitle + an optional one-line "what this place is" note
              — badges get their own full-width row below (see badge row
              further down) so they don't have to compete with the name for
              horizontal space and wrap early. line-clamp-2, not `truncate`:
              a directory card is narrower than the full page width once it's
              one of several columns in the desktop grid (see GenericDirectory),
              and a business name routinely needs a second line at that width —
              clamping bounds it instead of letting it run to three or four and
              throwing every card in the row wildly out of proportion with its
              neighbors. */}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 line-clamp-2">
              {onNameClick ? (
                // A span, not the whole <p>, carries the click/hover — the <p>
                // is block-level and stretches to fill the row, which would
                // make clicking empty space to the right of a short name (e.g.
                // "Giant") count as clicking the name. The span sizes to just
                // the text itself.
                <span
                  className="cursor-pointer hover:underline hover:text-blue-600 transition-colors"
                  onClick={(e) => { e.stopPropagation(); onNameClick() }}
                >
                  {item.name}
                </span>
              ) : (
                item.name
              )}
            </p>
            {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
            {/* mt-2: enough gap that this reads as its own beat after the
                name+address fact, not a third bullet inside it — but no
                border/section treatment, which is reserved for the hairline
                before the badge row (a genuinely different mode: read text
                vs. scannable chips). Hidden on mobile: on a narrow card this
                can run to 2-3 lines. The desktop:hidden twin further down
                renders it instead, outside this row.
                No invisible placeholder any more when this listing left the
                field blank — that used to reserve a category-wide guessed
                height (see git history), which meant EVERY card in a
                category paid for it the moment ANY listing had this field
                filled in, whether or not that card's own row-mates did.
                GenericDirectory's row-alignment pass (see its own alignRows
                doc) now measures actual rendered height per row and pads
                only the cards that fall short of their row's tallest
                natural card — a blank field here just means less natural
                height, exactly like a short name does, and the same real
                measurement handles both instead of two different
                mechanisms guessing at the same problem. */}
            {headerTextFields.map(({ f, text }) =>
              f.type === 'textarea' ? (
                <p key={f.key} className="hidden desktop:block text-sm text-slate-600 mt-2">
                  <span style={headerTextClampStyle}>{text}</span>
                </p>
              ) : (
                <p key={f.key} className="hidden desktop:block truncate text-sm text-slate-600 mt-2">{text}</p>
              ),
            )}
          </div>

          {/* URL chips only now — the kebab/toggle used to live here too,
              but centering THEM against just this row wasn't actually what
              "centered" meant: this row is only the icon/name/address block,
              a fraction of the card's real height once the description twin
              and upvote/distance row below are counted too. They've moved
              to the absolutely-positioned group after this row instead,
              centered against the FULL pre-badge-divider block — see that
              group's own comment. self-center here still applies (still a
              trailing element, same Material Design reasoning), independent
              of the avatar's own top-anchoring above. */}
          <div className="flex items-center gap-2 shrink-0 self-center">
            {headerUrlFields.map(({ f, href }) => (
              <a
                key={f.key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex shrink-0 items-center rounded-full border border-primary px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-white transition-colors whitespace-nowrap"
              >
                {f.linkLabel ?? f.label}
              </a>
            ))}
          </div>
        </div>

        {/* Pin / Share / "I'm here" and the toggle — absolutely positioned
            against the relative wrapper above (which spans this row
            through the upvote/distance row below, stopping short of the
            badge divider) rather than sitting inline in the row above,
            specifically so "centered" means centered against the CARD'S
            real header height, not just this one row's — a short card
            (name + address, no description, no upvote stat) made the two
            answers look the same, which is what hid this: a longer card (a
            header text field, an upvote/distance row) revealed the kebab
            sitting near the TOP of a much taller block instead of its
            middle. right-1 (4px) pulls it in from that wrapper's own right
            edge rather than sitting flush against it — a bare right-0
            inherited the card's own 16px edge padding as its only
            breathing room, which reads as pinned to the corner with
            nothing else there to anchor it; a small deliberate gap beyond
            that (Spotify's own overflow-menu spacing, not Material's wider
            8px — that read as adrift from the corner rather than anchored
            to it) is what makes it read as placed on purpose. top-1/2
            -translate-y-1/2 is the actual vertical centering. The
            wrapper's pr-8 reserve is gone along with the kebab that needed
            it. What's left in this corner is the invisible toggle and, on
            desktop only, two action buttons that aren't painted until the
            row is hovered — neither is anything for the name to collide
            with, so the name gets those 32px back (measured 346px -> 378px
            on a real card at phone width).
            Same negative-margin tap-target-growing trick and gap-5 spacing
            both controls already used inline here — see each one's own
            className for why. */}
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-5">
          {/* The row's actual accessible toggle — see the row div's own
              comment above. No onClick: relies on the native click a button
              dispatches on mouse activation or Enter/Space bubbling up to
              the row's handler, which does the real work. Still present and
              still carries aria-expanded/aria-label on desktop even though
              its chevron doesn't render there — removing the button itself,
              not just its icon, would leave keyboard/screen-reader visitors
              with no way to open the dialog at all (the row can't be a
              button — see that same comment on why), and
              GenericListingCard.test.tsx queries this exact button by
              role.
              Rendered BEFORE the kebab (not after, as it was when this
              carried a visible chevron meant to be the rightmost,
              corner-anchored element) — invisible now, so nothing about it
              needs to sit at the true trailing edge any more. With it
              first, the kebab (the one thing here actually meant to be
              seen) is the rightmost child, right-1 measures distance to
              IT rather than to an invisible spacer past it, and gap-5 lands
              between the two exactly where it did before. Confirmed live:
              swapping this order alone closed a ~36px gap between where the
              group's own edge sat and where the visible dots actually
              were — the earlier bug this comment is here to prevent
              reintroducing. */}
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Hide' : 'Show'} details for ${item.name}`}
            // -m-2.5 p-2.5: kept at the same footprint the visible chevron
            // used to occupy (16px content + padding = ~36px tap target),
            // even though nothing renders inside any more — see the
            // invisible spacer below for why, and why this button stays in
            // the DOM at all despite having no icon on either breakpoint
            // now.
            // Deliberately NOT pointer-events-none, which was tried here
            // once pr-8 came off, on the reasoning that a click landing on
            // an invisible spacer should fall through to the name beneath
            // it. It costs more than it sounds like: with pointer events
            // off, hit-testing at this button's own centre returns the
            // absolutely-positioned group around it instead, so the button
            // stops being clickable as itself — five e2e tests that open a
            // listing by clicking `Show details for ...` failed on exactly
            // that, on both viewports. Nothing was gained either way: this
            // button has no onClick, so a click here has always just
            // bubbled to the row's handler, and the name underneath is
            // plain text with nothing of its own to receive.
            className="-m-2.5 cursor-pointer p-2.5"
          >
            {/* No visible chevron on either breakpoint any more — this row
                is already the tap target (the row div's own onClick above),
                so a rotating arrow was always a redundant echo of state the
                reveal itself already shows. Desktop already worked this way
                (opens a modal, which needs no icon pointing at it, plus a
                hover state this button never had anyway).
                Mobile is different — no hover to hint at it, and removing
                the chevron there needed a real substitute, not just
                deleting the affordance: the listing sheet slides up from
                the bottom on the tap, so the motion itself teaches "tapping
                this row does something" the moment it happens.
                The button itself stays — <button> is the actual accessible
                toggle a keyboard/screen-reader visitor needs
                (aria-expanded/aria-label above), it just no longer draws
                anything. The empty spacer below only keeps its footprint
                (and this row's layout) identical to before, not for any
                visual purpose. */}
            <span className="block h-4 w-4" aria-hidden="true" />
          </button>
          {/* Desktop's replacement for the kebab that used to sit here,
              revealed on row hover. Deliberately a POINTER-ONLY shortcut:
              aria-hidden and tabIndex={-1}, exactly like the mobile swipe is
              a touch-only one. Both have the same real route behind them —
              the fan below an opened listing — which is what makes it
              legitimate for either to be unreachable on its own.
              The first version of this did the opposite: focusable, revealed
              on focus-within, on the theory that keyboard parity was the
              accessible choice. In a directory it is the reverse. `opacity-0`
              removes nothing from the tab order or the accessibility tree, so
              a twenty-card list grew forty extra tab stops and forty
              announcements of controls nobody can see — measured on a real
              page, not theorised. Declining to duplicate a control is not the
              same as denying access to it.
              Desktop only: mobile has no hover to reveal anything with. */}
          {!isMobile && cardActions.length > 0 && (
            <span aria-hidden="true" className="hidden desktop:flex items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100">
              {cardActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    action.onSelect()
                  }}
                  aria-label={`${action.label} ${item.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                >
                  <CardActionIcon action={action} />
                </button>
              ))}
            </span>
          )}
        </div>

        {/* Mobile-only twin of the headerTextFields loop above — see the
            comment there. Indented to align under the name/address (same
            52px = icon + gap as above). Rendered before the upvote/distance
            row below, matching desktop's own order (its version of this
            text sits inside the name column, above where that row starts) —
            this used to come after on mobile, which read as popularity/
            distance outranking the description instead of following it.

            Skipped entirely for a no-address category (WhatsApp Groups,
            Networking): on mobile the card is already just a name plus a
            couple badges, and this free-form field is usually the longest
            thing on it — showing a multi-line preview here made every card
            in those categories dominate the list instead of letting a
            visitor scan names quickly, worse than the same field being one
            of several facts on a card that already has an address. Desktop's
            twin above is untouched — the grid has room, and a 2-3-column
            layout doesn't have the same "one tall card buries the rest of
            the list" problem a single mobile column does. */}
        {category.hasAddress !== false && headerTextFields.map(({ f, text }) =>
          f.type === 'textarea' ? (
            <p key={f.key} className="desktop:hidden text-sm text-slate-600 mt-2 pl-[52px]">
              <span style={headerTextClampStyle}>{text}</span>
            </p>
          ) : (
            <p key={f.key} className="desktop:hidden truncate text-sm text-slate-600 mt-2 pl-[52px]">{text}</p>
          ),
        )}

        {/* Upvote count + distance/travel — its own row left-aligned under
            the icon (pl-[52px] = the 40px icon + 12px gap it sits next to
            above), rather than a column squeezed in beside the name. A
            column squeezed in beside the name is exactly what this used to
            be on desktop (see git history) — fine while the card spanned the
            page's full width, but once desktop cards became one of 2-3 grid
            columns (see GenericDirectory) that same column left the name
            only a third of a viewport-width's worth of room, and a longer
            business name wrapped to three or four lines fighting it for
            space. Its own row gives it the whole card width instead, so it
            never competes with the name. Left-aligned under the address/
            description, not right-aligned against the card edge — a
            distance/upvote line reads as more of a fact about the place,
            alongside its address, than a stat pinned to the card's corner.
            Mobile used to get its own top-right corner instead, stacked
            above the chevron — moved down to this same row once that corner
            needed to fit a kebab menu too (since removed — its actions are
            in the edit bar's overflow now); mobile has no grid to squeeze
            columns in, so there was never anything here to protect the name
            from either way. */}
        {hasUpvoteRow && (
          <>
            {/* Segment-1 spacer — see GenericListingCardHandle's own doc.
                Real gap here, between the address/header-text block above
                and this row, so the popularity/distance LINE itself lands
                at the same height across a row of cards — not just the
                badges further down. */}
            <div ref={upvoteSpacerRef} aria-hidden="true" />
            <div ref={upvoteRowRef} className="flex mt-1.5 justify-start pl-[52px]">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                {renderUpvoteDistanceContent()}
              </div>
            </div>
          </>
        )}
        </div>

        {/* Badge row — the only chips that survive collapsed: Open and any
            badge tied to an actual filter control. Below the name row
            (rather than wrapping inside the name column) so it gets the
            whole card's width to lay out in. Flush left, same as the name —
            it used to be indented to align under the name text rather than
            the icon, but that reads as a stray, unexplained gap once the
            card is narrower than the full page width (see the comment on
            the upvote/distance row above for why "narrower than the full
            page width" is now the normal case on desktop, not just mobile). */}
        {badgeRow && (
          <>
            {/* Segment-2 spacer — usually 0 in practice, since the upvote
                row's own content is nearly always the same height across a
                category; catches the rare case (e.g. travel text wrapping
                to 2 lines for one listing) segment 1 alone wouldn't. Height
                set imperatively by GenericDirectory (see
                setBadgeSpacerHeight), never by React state, so a measure/
                set pass doesn't itself trigger a re-render. */}
            <div ref={badgeSpacerRef} aria-hidden="true" />
            <div ref={badgeRowRef} className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
              {badgeRow}
            </div>
          </>
        )}
      </SwipeRow>

      {/* Mobile: the listing opens in a sheet, the same one Add and Edit
          use (MobileSheet), holding the same listing view the map's sheet
          shows (MapPlaceDetail). It used to expand inline, pushing the list
          down, with its own copy of that view; now a listing reads the same
          wherever it's opened, and "Suggest an edit" is the last thing in
          it, as it was at the foot of the dropdown.
          Like Add and Edit: it's only there once tapped, opens at half,
          pulls to full, and closes by dragging down, tapping the dimmed
          list, or Escape. No title row: the listing's name, at the top of
          its own view, is the title, and names the dialog for a screen
          reader. No "Back to list" either — the list is the page behind.
          Always mounted on mobile rather than `expanded &&`, so the sheet
          stays on screen long enough to animate closed. */}
      {isMobile && (
        <MobileSheet isOpen={expanded} onClose={close} title={item.name} draggable titleHidden>
          <MapPlaceDetail
            item={item}
            category={category}
            color={color}
            // A filter tap narrows the list behind the sheet, so the sheet
            // gets out of the way first rather than filtering out of sight.
            filters={{
              onTagClick: (tag) => { close(); onTagClick(tag) },
              onFilterOpen: () => { close(); onFilterOpen() },
              onFilterBool: (key) => { close(); onFilterBool(key) },
              onFilterSelect: (key, value) => { close(); onFilterSelect(key, value) },
            }}
          />
        </MobileSheet>
      )}

      {/* Desktop: same content, centered dialog instead — see ListingDetailModal. */}
      {!isMobile && (
        <ListingDetailModal
          isOpen={expanded}
          onClose={close}
          item={item}
          category={category}
          color={color}
          iconImageUrl={iconImageUrl}
          name={item.name}
          subtitle={subtitle}
          badgeRow={badgeRow}
          headerBadgeKeys={headerBadges.map((f) => f.key)}
          headerUrlFields={headerUrlFields}
          onTagClick={onTagClick}
          onFilterOpen={onFilterOpen}
          onFilterBool={onFilterBool}
          onFilterSelect={onFilterSelect}
          canEdit={canEdit}
          onNavigate={onNavigate}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      )}
    </div>
  )
})
