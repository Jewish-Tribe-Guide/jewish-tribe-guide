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
import Highlight from './Highlight'
import type { SearchFound } from '@/lib/askSearch'
import MapPlaceDetail from '@/components/map/MapPlaceDetail'
import { useListingActions, type ListingAction } from './useListingActions'
import SwipeRow, { type SwipeAction } from '@/components/SwipeRow'
import Chip from './Chip'
import { initialsOf, listingRowFacts, type RowFactTone } from '@/lib/listingRow'
import { ui } from '@/lib/uiConfig'
import { useIsMobile } from '@/lib/useIsMobile'
import { usePinned } from '@/lib/pinnedContext'
import { countEvent } from '@/lib/countEvent'

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

// Colour only where it means something: see lib/listingRow.ts.
const FACT_TONE: Record<RowFactTone, string> = {
  open: 'font-medium text-green-700',
  caution: 'font-medium text-caution',
  closed: 'font-medium text-red-700',
  minyan: 'font-semibold text-ink',
  plain: '',
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
 *  other card's open/close. */
export type GenericListingCardHandle = {
  open: () => void
  close: () => void
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
  /** A shul's next minyan today or tomorrow ("Mincha 6:34 PM"), for the
   *  row's second line. Worked out once for the whole list by the directory
   *  (see useNextMinyans), so each row doesn't recompute every shul's times. */
  nextMinyan?: string | null
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
  /** What a search matched on this listing (see SearchFound). Its items
   *  show as chips on the collapsed card, so a search result says why it's
   *  there ("Wine", "Challah · sometimes") instead of only "6 kosher
   *  items"; with no item, the field it matched ("Hechsher: OU"). Opened,
   *  the listing names them at the top and marks them in its item list. */
  found?: SearchFound | null
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
  nextMinyan = null,
  onNameClick,
  onNavigate,
  hasPrev,
  hasNext,
  found = null,
  onExpandedChange,
}, ref) {
  const [expanded, setExpanded] = useState(!!defaultExpanded)
  const cardRootRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => ({
    open: () => {
      setExpanded(true)
      onExpandedChange?.(true)
    },
    close: () => {
      setExpanded(false)
      onExpandedChange?.(false)
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
  // Against useNow rather than the render's own clock: open/closed is the
  // most time-sensitive thing on the row, and it ships inside HTML that can
  // be served from the CDN or the service worker's cache long after it was
  // built.
  const now = new Date(useNow())
  const { isOpen, closing, closure } = getOpenStatus(item, hoursFields.map((f) => f.key), now)
  // The row's second line: open status, next minyan, distance, what kind of
  // place, how many items. See lib/listingRow.ts.
  const facts = listingRowFacts(item, category, now, { nextMinyan })
  // Upvotes live in the opened listing now (the sheet on a phone, the dialog
  // on desktop), not on every row: a column of "👍 0" said nothing while a
  // list was being scanned. Popularity still orders the list.
  const upvote = upvotes ? <UpvoteButton variant="inline" resourceId={item.id} count={count} onCountChange={onVote} /> : null

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
  const ownPhoto =
    typeof item[PHOTO_FIELD_KEY] === 'string' && (item[PHOTO_FIELD_KEY] as string).trim() ? (item[PHOTO_FIELD_KEY] as string) : undefined
  const iconImageUrl = ownPhoto ?? category.iconImageUrl ?? undefined

  // The chips that survive collapsed (Open/closure + filterable badges) — see
  // the badge row's own comment further down. Pulled into a variable, not
  // just inline JSX, because ListingDetailModal needs the identical row
  // restated in its own header on desktop (the card behind it is obscured by
  // the modal's backdrop), and computing it twice would be two places a
  // badge rule could drift out of sync.
  const matchedChips = found?.items.length ? found.items : null
  const matchedFields = !matchedChips && found?.fields.length ? found.fields : null
  const badgeRow = (isOpen || closure || visibleHeaderBadges.length > 0 || countHeaderCount > 0 || matchedChips || matchedFields) ? (
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
      {/* What a search matched here — see `found`. Not clickable: the
          card's own tap target opens the listing, which is where to go next. */}
      {matchedChips?.map((m) => (
        <Chip key={m.tag} tone={m.sometimes ? 'amber' : 'slate'}>
          {m.tag}
          {m.sometimes ? ' · sometimes' : ''}
        </Chip>
      ))}
      {matchedFields?.map((f) =>
        f.text ? (
          <span key={f.label} className="basis-full text-xs text-slate-600">
            <span className="text-muted">{f.label}: </span>
            <Highlight text={f.text} terms={found!.terms} />
          </span>
        ) : (
          <Chip key={f.label} tone="slate">
            <Highlight text={f.label} terms={found!.terms} />
          </Chip>
        ),
      )}
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
          if (next) {
            track('listing_opened', { listing: item.name, category: category.id })
            countEvent(community, 'listing_view', item.id)
          }
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
        {/* relative: the positioning context for the absolutely-placed
            toggle/hover-actions group below. */}
        <div className="relative">
        <div className="flex items-start gap-3">
          {/* The place's own photo, or its initials in a rounded square in
              its category's colour. Not the category's icon: down a list of
              one category that's the same picture on every row, and tells
              the places apart not at all. The opened listing and the map
              keep the category's icon, where it says what kind of place
              this is. */}
          <span className="relative shrink-0 mt-0.5">
            <CategoryIcon
              icon={category.icon}
              categoryId={category.id}
              iconImageUrl={ownPhoto}
              initials={initialsOf(item.name)}
              shape="square"
              color={color}
              className="h-10 w-10 text-xl"
            />
            {pinned && <PinnedBadge />}
          </span>

          {/* Name, then the facts line, then where it is. One line each:
              a long name or address truncates rather than making one row
              twice as tall as the rest. */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">
              {onNameClick ? (
                // A span, not the whole <p>, carries the click/hover — the <p>
                // is block-level and stretches to fill the row, which would
                // make clicking empty space to the right of a short name (e.g.
                // "Giant") count as clicking the name.
                <span
                  className="cursor-pointer hover:underline hover:text-primary transition-colors"
                  onClick={(e) => { e.stopPropagation(); onNameClick() }}
                >
                  {item.name}
                </span>
              ) : (
                item.name
              )}
            </p>
            {facts.length > 0 && (
              <p className="truncate text-[13.5px] text-slate-600" data-testid="row-facts">
                {facts.map((fact, i) => (
                  <span key={`${fact.text}:${i}`}>
                    {i > 0 && <span aria-hidden="true" className="px-1 text-slate-400">·</span>}
                    <span className={FACT_TONE[fact.tone]} title={fact.title}>
                      {fact.text}
                    </span>
                  </span>
                ))}
              </p>
            )}
            {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
            {/* A short note an admin opted into the row ("Sit-down glatt
                kosher steakhouse"). Two lines at most. Left off phones for a
                no-address category (WhatsApp groups, Networking), where it
                was usually the longest thing on a card of otherwise just a
                name, and one tall card buried the list. line-clamp needs
                display:-webkit-box, which a `hidden desktop:block` on the
                same element would override, so the clamp sits one level in. */}
            {headerTextFields.map(({ f, text }) => (
              <p
                key={f.key}
                className={`mt-1 text-sm text-slate-600 ${category.hasAddress === false ? 'hidden desktop:block' : ''}`}
              >
                <span style={f.type === 'textarea' ? headerTextClampStyle : { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {text}
                </span>
              </p>
            ))}
            {/* What a search matched here — see `found`. Chips, unlike the
                facts line: they answer "why is this here", and a list of
                items reads better as items. Not clickable: the row opens
                the listing, which is where to go next. */}
            {(matchedChips || matchedFields) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {matchedChips?.map((m) => (
                  <Chip key={m.tag} tone={m.sometimes ? 'amber' : 'slate'}>
                    {m.tag}
                    {m.sometimes ? ' · sometimes' : ''}
                  </Chip>
                ))}
                {matchedFields?.map((f) =>
                  f.text ? (
                    <span key={f.label} className="basis-full text-xs text-slate-600">
                      <span className="text-muted">{f.label}: </span>
                      <Highlight text={f.text} terms={found!.terms} />
                    </span>
                  ) : (
                    <Chip key={f.label} tone="slate">
                      <Highlight text={f.label} terms={found!.terms} />
                    </Chip>
                  ),
                )}
              </div>
            )}
          </div>

          {/* A showInHeader url field ("Join group"), reachable without
              opening the listing. */}
          {headerUrlFields.length > 0 && (
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
          )}
        </div>

        {/* Pin / Share / "I'm here" and the toggle — absolutely positioned
            against the relative wrapper above (which spans the name, the
            facts line and the address) rather than sitting inline in the
            row above,
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

        </div>
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
            found={found}
            upvote={upvote}
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
          found={found}
          upvote={upvote}
        />
      )}
    </div>
  )
})
