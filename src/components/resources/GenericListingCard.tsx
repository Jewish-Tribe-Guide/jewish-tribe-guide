'use client'

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { track } from '@vercel/analytics'
import type { DirectoryResource } from '@/types'
import { PHOTO_FIELD_KEY, resolveCapabilities, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { useNow } from '@/lib/useNow'
import { itemDateFor, itemDateText } from '@/lib/itemMarks'
import { isStale } from '@/lib/listingView'
import { community as communityConfig } from '@/community.config'
import { getCategoryColor } from '@/lib/categoryColor'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import CategoryIcon from '@/components/CategoryIcon'
import PinnedBadge from '@/components/PinnedBadge'
import UpvoteButton from './UpvoteButton'
import ListingDetailModal from './ListingDetailModal'
import MobileSheet from './MobileSheet'
import { useListingOnward } from './listingOnward'
import type { Onward } from './ListingView'
import Highlight from './Highlight'
import type { SearchFound } from '@/lib/askSearch'
import MapPlaceDetail from '@/components/map/MapPlaceDetail'
import { useListingActions, type ListingAction } from './useListingActions'
import SwipeRow, { type SwipeAction } from '@/components/SwipeRow'
import Chip from './Chip'
import { initialsOf, listingRowFacts, listingRowNote, type RowFactTone, type RowNote } from '@/lib/listingRow'
import { useNextMinyan } from './nextMinyans'
import { ui } from '@/lib/uiConfig'
import { useIsMobile } from '@/lib/useIsMobile'
import { usePinned } from '@/lib/pinnedContext'
import { countEvent } from '@/lib/countEvent'

/** Pin and Share are the two that belong to SCANNING a list — shortlisting
 *  as you read, sending one to someone. "Set as location" is deliberately
 *  not here: it re-sorts the entire directory, which is a deliberate act
 *  rather than something you do in passing, and two actions is the practical
 *  ceiling for a swipe on a phone. It lives in the fan below an opened
 *  listing instead.
 *
 *  A phone's swipe only. A desktop row used to show the two on hover, over
 *  its likes; hovering a row now lights its pin on the map beside the list,
 *  and an opened listing has both one click away. */
const CARD_ACTION_IDS: ListingAction['id'][] = ['pin', 'share']

// Colour only where it means something: see lib/listingRow.ts.
const FACT_TONE: Record<RowFactTone, string> = {
  open: 'font-medium text-green-700',
  caution: 'font-medium text-caution',
  closed: 'font-medium text-red-700',
  minyan: 'font-semibold text-ink',
  opens: 'font-medium text-slate-700',
  quiet: 'text-slate-500',
  plain: '',
}

const NOTE_TONE: Record<RowNote['tone'], string> = {
  caution: 'font-medium text-caution',
  quiet: 'text-slate-500',
  quote: 'text-slate-500',
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
  onVote: (count: number) => void
  /** When provided, clicking the listing's name navigates to that item's own
   *  category directory instead of expanding the card in place — used by
   *  cross-category lists (landing search) where "this row" and "its home
   *  page" are different places. Single-category directories leave this
   *  unset so a name click still just expands, matching every other tap on
   *  the row. */
  onNameClick?: () => void
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
  /** A category page's row (see listingRow.ts): where the place is, beside
   *  its name ("Goldie · Rittenhouse"), in place of the address line, and a
   *  third line only for an exception. Left unset (undefined), as the home
   *  search's mixed results do, the row keeps its address line. */
  place?: string | null
  /** A field the row's group heading already says, left off the row. */
  omitKey?: string | null
  /** Whether this category's rows say "Not confirmed by anyone yet" — see
   *  listingRowNote. */
  flagUnconfirmed?: boolean
  /** Tonight's candle lighting, on a Friday or erev Yom Tov — see
   *  listingRowFacts. */
  candlesAt?: number | null
  /** Likes to show beside the name, when the list is sorted by them: the
   *  order then needs its reason. Unset when sorted any other way, where a
   *  column of counts says nothing. */
  likes?: number
  /** How the row is framed: its own card (today's), or a row of one flat
   *  list, as the canvas draws it, where GenericDirectory draws the list's
   *  box and the lines between rows. Being tried on the preview. */
  look?: RowLook
  /** The page shows this listing itself (ListingColumn): in the list's
   *  column on desktop, or as the page on a phone that arrived from a link.
   *  The card then opens no dialog or sheet of its own. */
  inColumn?: boolean
}

export type RowLook = 'cards' | 'list'

export const GenericListingCard = forwardRef<GenericListingCardHandle, Props>(function GenericListingCard({
  item,
  category,
  upvotes,
  count,
  defaultExpanded,
  onVote,
  onEdit,
  showCategoryLabel = true,
  onNameClick,
  onNavigate,
  hasPrev,
  hasNext,
  found = null,
  onExpandedChange,
  place,
  omitKey = null,
  flagUnconfirmed = false,
  likes,
  candlesAt = null,
  look = 'cards',
  inColumn = false,
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

  // Pin/Share for the collapsed row, revealed by a swipe on mobile. A
  // shortcut: ListingActionsFan below an opened listing is where these are
  // reachable by every visitor, which is what makes it safe for the card's
  // own copies to be invisible until asked for.
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

  // A listing is "Open" if ANY of its hours fields say so — see getOpenStatus.
  // Against useNow rather than the render's own clock: open/closed is the
  // most time-sensitive thing on the row, and it ships inside HTML that can
  // be served from the CDN or the service worker's cache long after it was
  // built. Before the page has hydrated there's no time (see useNow), so no
  // Open badge and no opening or closing time yet.
  const clock = useNow()
  const now = clock === null ? null : new Date(clock)
  // The row's second line: open status, next minyan, distance, what kind of
  // place, how many items. See lib/listingRow.ts.
  const shul = useNextMinyan(item.id)
  const allFacts = listingRowFacts(item, category, now, { shul, omitKey, candlesAt })
  const facts = allFacts.filter((f) => !f.ownLine)
  // A restaurant's dishes, on their own line; not beside what a search
  // matched here, which names the dish asked for.
  const itemsLine = found?.items.length ? null : (allFacts.find((f) => f.ownLine)?.text ?? null)
  // A category page's row: see the `place` prop.
  const pageRow = place !== undefined
  const rowNote = listingRowNote(item, category, now, { flagUnconfirmed, shulNote: shul?.note })
  const note = rowNote && (pageRow || rowNote.kind === 'exception') ? rowNote : null
  // Upvotes live in the opened listing now (the sheet on a phone, the dialog
  // on desktop), not on every row: a column of "👍 0" said nothing while a
  // list was being scanned. Popularity still orders the list.
  const upvote = upvotes ? <UpvoteButton variant="recommend" name={item.name} resourceId={item.id} count={count} onCountChange={onVote} /> : null
  // The opened listing's last part: the places near it in this list, then
  // the whole list. Opening one closes this listing first.
  const onwardSource = useListingOnward()
  const onward: Onward | undefined = onwardSource
    ? {
        items: onwardSource.items,
        place: onwardSource.place,
        onOpen: (other) => {
          setExpanded(false)
          onExpandedChange?.(false)
          onwardSource.open(other.id)
        },
        seeAll: { label: onwardSource.allLabel, onClick: () => { setExpanded(false); onExpandedChange?.(false) } },
      }
    : undefined

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
  // The listing's own photo, for the row's picture.
  const ownPhoto =
    typeof item[PHOTO_FIELD_KEY] === 'string' && (item[PHOTO_FIELD_KEY] as string).trim() ? (item[PHOTO_FIELD_KEY] as string) : undefined

  // What a search matched here, named on the row (see `found`).
  const matchedChips = found?.items.length ? found.items : null
  const matchedFields = !matchedChips && found?.fields.length ? found.fields : null

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
    <div className={look === 'list' ? 'h-full bg-white' : 'h-full border border-slate-200 rounded-lg bg-white shadow-sm'}>
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
        // Mobile only (see CARD_ACTION_IDS).
        enabled={isMobile}
        className={look === 'list' ? undefined : 'rounded-lg'}
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
        contentClassName={`group/row relative h-full w-full ${look === 'list' ? '' : 'rounded-lg'} bg-white px-4 py-3 hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition-colors duration-200 ease-out`}
      >
        {/* relative: the positioning context for the absolutely-placed
            toggle below. */}
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
            <div className="flex items-baseline gap-2">
            <p className="min-w-0 flex-1 truncate font-semibold text-slate-900">
              {pageRow ? (
                <>
                  {item.name}
                  {place && <span className="font-normal text-[13.5px] text-slate-500"> · {place}</span>}
                </>
              ) : onNameClick ? (
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
            {!!likes && likes > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-slate-500" aria-label={`${likes} like${likes === 1 ? '' : 's'}`}>
                {/* The canvas's grey outline thumb, not the 👍 emoji: an
                    emoji's own colours shouted over the row's facts. */}
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]" data-testid="row-likes-icon">
                  <path d="M7 10v12" />
                  <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
                </svg>
                <span aria-hidden="true">{likes}</span>
              </span>
            )}
            </div>
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
            {itemsLine && (
              <p className="truncate text-[13.5px] text-slate-700" data-testid="row-items">
                {itemsLine}
              </p>
            )}
            {!pageRow && subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
            {note && (
              <p className={`truncate text-[13px] ${NOTE_TONE[note.tone]}`} title={note.title} data-testid="row-note">
                {note.tone === 'caution' && (
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 inline h-3.5 w-3.5 -translate-y-px">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                  </svg>
                )}
                {note.text}
              </p>
            )}
            {/* A short note an admin opted into the row ("Sit-down glatt
                kosher steakhouse"). Two lines at most. Left off phones for a
                no-address category (WhatsApp groups, Networking), where it
                was usually the longest thing on a card of otherwise just a
                name, and one tall card buried the list. line-clamp needs
                display:-webkit-box, which a `hidden desktop:block` on the
                same element would override, so the clamp sits one level in. */}
            {/* On a category page's row, the note is the third line above,
                and only when there's no exception to say instead. */}
            {!pageRow && headerTextFields.map(({ f, text }) => (
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
                {matchedChips?.map((m) => {
                  // When someone last saw it there (agreed Oct 1), once
                  // the page knows the time.
                  // A dish approved from its menu since: "on its menu Oct 2".
                  const date = clock === null ? null : itemDateFor(item, m.tag)
                  return (
                    <Chip key={m.tag} tone={m.sometimes || (date && isStale(date.at, clock)) ? 'amber' : 'slate'}>
                      {m.tag}
                      {m.sometimes ? ' · sometimes' : ''}
                      {date ? ` · ${itemDateText(date, clock, communityConfig.timezone)}` : ''}
                    </Chip>
                  )
                })}
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
      {isMobile && !inColumn && (
        <MobileSheet isOpen={expanded} onClose={close} title={item.name} draggable titleHidden>
          <MapPlaceDetail
            item={item}
            category={category}
            color={color}
            found={found}
            upvote={upvote}
            place={place ?? null}
            onward={onward}
          />
        </MobileSheet>
      )}

      {/* Desktop: a dialog, where nothing hosts the listing itself. A
          category page does: it opens in the list's column (ListingColumn). */}
      {!isMobile && !inColumn && (
        <ListingDetailModal
          isOpen={expanded}
          onClose={close}
          item={item}
          category={category}
          color={color}
          name={item.name}
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
