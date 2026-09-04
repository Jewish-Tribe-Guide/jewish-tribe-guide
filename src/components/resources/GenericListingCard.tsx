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
import UpvoteButton from './UpvoteButton'
import FreshnessFooter from './FreshnessFooter'
import PlaceDetailBody from './PlaceDetailBody'
import ListingDetailModal from './ListingDetailModal'
import ShareButton from './ShareButton'
import Chip from './Chip'
import { PencilIcon, FlagIcon } from '@/components/icons'
import { travelParts } from '@/lib/listingTravel'
import { ui } from '@/lib/uiConfig'
import { useIsMobile } from '@/lib/useIsMobile'

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
 *  measureContentHeight/setSpacerHeight are GenericDirectory's row-alignment
 *  pair — see its own alignRows doc for why this is a real per-row DOM
 *  measurement rather than a heuristic guess. */
export type GenericListingCardHandle = {
  open: () => void
  close: () => void
  /** Pixel height of everything above the badge row (icon, name, address,
   *  header text, upvote row) with this card's own spacer at 0 — null when
   *  there's no badge row to align in the first place (nothing to measure
   *  against). Callers must zero every card's spacer in the same pass
   *  before measuring any of them, or an earlier card's stale spacer value
   *  corrupts this reading. */
  measureContentHeight: () => number | null
  /** Sets (or clears, at 0) the invisible spacer directly above the badge
   *  row, so this card's badge row starts at the same height as its row's
   *  tallest card. */
  setSpacerHeight: (px: number) => void
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
  onReport: () => void
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
  onReport,
  showCategoryLabel = true,
  showDistanceSlot = false,
  onNameClick,
  onNavigate,
  hasPrev,
  hasNext,
}, ref) {
  const [expanded, setExpanded] = useState(!!defaultExpanded)
  // The card's own root (the clickable row) and the badge row itself — the
  // distance between them, measured live, is "everything above the
  // badges" GenericDirectory compares across a row's cards. spacerRef is
  // the invisible block directly above the badge row whose height that
  // comparison sets, so a shorter card's badge row starts at the same
  // height as its tallest row-mate's — see GenericListingCardHandle's own
  // doc for why this is a measurement, not a heuristic guess.
  const cardRootRef = useRef<HTMLDivElement>(null)
  const badgeRowRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => ({
    open: () => setExpanded(true),
    close: () => setExpanded(false),
    measureContentHeight: () => {
      if (!cardRootRef.current || !badgeRowRef.current) return null
      return badgeRowRef.current.getBoundingClientRect().top - cardRootRef.current.getBoundingClientRect().top
    },
    setSpacerHeight: (px: number) => {
      if (spacerRef.current) spacerRef.current.style.height = px > 0 ? `${px}px` : '0px'
    },
  }))
  const categories = useCategories()
  const community = useCommunitySlug()
  // Which UI opens on click: a single-column mobile list has room to push an
  // inline panel down; a multi-column desktop grid doesn't (expanding one
  // card among several in a row has no sensible place to put the panel), so
  // desktop opens the same content in ListingDetailModal instead. Same
  // `expanded` state either way — just where it renders. `useIsMobile`
  // starts `false` until mount (see its own SSR-safe note), so a listing
  // reopened via `defaultExpanded` can flash as "modal open" on a phone for
  // one tick before settling into the inline panel — accepted the same way
  // the other isMobile-gated layout branches in this app already are.
  const isMobile = useIsMobile()

  const fields = category.detailFields
  // Per-category capabilities layered under the global `ui.contributions` switches.
  const caps = resolveCapabilities(category.capabilities)
  const canEdit = ui.contributions.edit && caps.edit
  const canReport = ui.contributions.report && caps.report
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
  const headerTextIsMultiline = headerTextFields.some(({ f }) => f.type === 'textarea')
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
  const headerTextClampStyle = { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden' } as const
  // Whether the CATEGORY has this field at all, independent of whether THIS
  // item filled it in. In the desktop grid, cards in the same row stretch to
  // match the tallest one (see the card's own h-full comment) — but only the
  // outer box, not where each line of content falls inside it, so one card
  // having this line and its row-mate not having it still left their badge
  // rows starting at different heights, the divider above the badges landing
  // a whole line apart between neighbors. See the spacer below.
  const hasHeaderTextField = fields.some((f) => (f.type === 'text' || f.type === 'textarea') && f.showInHeader)

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
  // for the expanded panel), and a field's key/label/tagGroup are all
  // per-community admin text with nothing stable to match against — tagGroup
  // in particular is auto-derived from the label (see categoryEditorLogic.ts)
  // and drifts the moment someone edits it. showCountInHeader is the same
  // explicit opt-in shape as showInHeader (text/url fields), just for tags.
  const countHeaderField = fields.find((f) => f.type === 'tags' && f.showCountInHeader)
  const countHeaderCount = countHeaderField ? selectValues(item[countHeaderField.key]).length : 0
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
        <Chip tone="green" onClick={(e) => { e.stopPropagation(); onFilterOpen() }} title="Filter to places open now">
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
    // collapsed card. Corners stay clean because the header and expanded panel
    // round their own edges below. h-full: in the desktop grid (see
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
          The onClick below stays as a mouse/touch convenience — "click
          anywhere on the row" — but the actual accessible, keyboard-operable
          toggle is now the chevron <button> further down. It carries no
          onClick of its own; a native button's click (mouse or keyboard)
          bubbles right up to this handler, so there's exactly one place the
          toggle logic lives, not two copies to keep in sync. */}
      <div
        ref={cardRootRef}
        onClick={() => setExpanded((p) => {
          if (!p) track('listing_opened', { listing: item.name, category: category.id })
          return !p
        })}
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
        className={`h-full w-full px-4 py-3 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer ${expanded && isMobile ? 'rounded-t-lg' : 'rounded-lg'}`}
      >
        <div className="flex items-start gap-3">
          {/* Icon avatar — same glyph/image + tinted color as this category's
              map pin (see getCategoryColor), so a place reads as the same
              thing here and on the map. mt-0.5 nudges it those last couple
              pixels: the name's own line-height leaves a little leading
              above the visible text, so even with matching box tops the
              glyph itself starts lower than the icon. */}
          <CategoryIcon
            icon={category.icon}
            categoryId={category.id}
            iconImageUrl={iconImageUrl}
            color={color}
            className="h-10 w-10 text-xl self-start mt-0.5"
          />

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
                invisible, not omitted, when the category has this field but
                THIS listing left it blank — see hasHeaderTextField's own
                comment: reserves the same line so a shorter card's badge
                row still starts at the same height as its grid row-mates. */}
            {headerTextFields.length > 0 ? (
              headerTextFields.map(({ f, text }) =>
                f.type === 'textarea' ? (
                  <p key={f.key} className="hidden desktop:block text-sm text-slate-600 mt-2">
                    <span style={headerTextClampStyle}>{text}</span>
                  </p>
                ) : (
                  <p key={f.key} className="hidden desktop:block truncate text-sm text-slate-600 mt-2">{text}</p>
                ),
              )
            ) : hasHeaderTextField ? (
              // A single word never actually wraps to 3 lines on its own —
              // line-clamp only bounds overflow, it doesn't force a height —
              // so the multi-line case needs an explicit min-height to
              // reserve the same space a real 3-line description would.
              <p
                aria-hidden="true"
                className={`invisible hidden desktop:block text-sm text-slate-600 mt-2 ${headerTextIsMultiline ? 'min-h-[3.75rem]' : 'truncate'}`}
              >
                placeholder
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2 shrink-0">
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
            {/* The row's actual accessible toggle — see the row div's own
                comment above. No onClick: relies on the native click a
                button dispatches on mouse activation or Enter/Space
                bubbling up to the row's handler, which does the real work.
                Still present and still carries aria-expanded/aria-label on
                desktop even though its chevron doesn't render there —
                removing the button itself, not just its icon, would leave
                keyboard/screen-reader visitors with no way to open the
                dialog at all (the row can't be a button — see that same
                comment on why), and GenericListingCard.test.tsx queries this
                exact button by role. */}
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Hide' : 'Show'} details for ${item.name}`}
              // -m-2.5 p-2.5: the icon itself is 16px, well under the
              // 24px WCAG-recommended tap target — padding grows the real
              // hit area to ~36px without the negative margin's opposite
              // effect shifting anything in the row around it.
              className="-m-2.5 cursor-pointer p-2.5"
            >
              {/* Mobile only — a chevron that rotates open/closed reads
                  right for the inline accordion (see the isMobile branch
                  further down). Desktop opens a dialog instead, which a
                  rotating "this expands right here" arrow no longer
                  describes, and the whole card is already clickable with its
                  own hover state, so there's nothing left for it to point
                  at. */}
              <svg
                className={`desktop:hidden w-4 h-4 text-muted transition-transform duration-200 ${expanded && isMobile ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Upvote count + distance/travel — its own row, left-aligned under
            the icon (pl-[52px] = the 40px icon + 12px gap it sits next to
            above, same offset the badge row used to use), rather than a
            column squeezed in beside the name. That column used to sit
            inline with the name (see git history), which was fine while the
            card spanned the page's full width; once desktop cards became one
            of 2-3 grid columns (see GenericDirectory) the same column left
            the name only a third of a viewport-width's worth of room, and a
            longer business name wrapped to three or four lines fighting it
            for space. Its own row gives it the whole card width instead, so
            it never competes with the name at any card width, viewport-based
            breakpoint or not. Left-aligned under the address/description,
            not right-aligned against the card edge — a distance/upvote line
            reads as more of a fact about the place, alongside its address,
            than a stat pinned to the card's corner. */}
        {(upvotes || travel.length > 0 || showDistanceSlot) && (
          <div className="mt-1.5 flex justify-start pl-[52px]">
            {/* Stacked on mobile to save horizontal space; side by side from
                desktop up, close together with a thin "|" between — the
                upvote count and the distance are two short facts read as one
                line, not two columns needing their own aligned width. */}
            <div className="flex flex-col items-start gap-1 desktop:flex-row desktop:items-center desktop:gap-2">
              {upvotes && (
                <UpvoteButton variant="inline" resourceId={item.id} count={count} onCountChange={onVote} />
              )}
              {upvotes && (travel.length > 0 || showDistanceSlot) && (
                <span aria-hidden="true" className="hidden desktop:inline text-slate-300">|</span>
              )}
              {travel.length > 0 ? (
                <div className="flex flex-col items-start gap-0.5 text-xs font-medium text-slate-600 whitespace-nowrap">
                  {travel.map((t) => <span key={t}>{t}</span>)}
                </div>
              ) : showDistanceSlot ? (
                // Deliberately quiet — muted, not the amber of the header's
                // prompt. This is the column not yet filled in, repeated
                // down the list; it should read as a gap the visitor can
                // close, never as the site asking again.
                //
                // No underline. It first carried a dotted rule meaning "a
                // blank to fill in", and that failed the only test that
                // mattered: the person who designed this app looked at it
                // and asked what the stray line was. An affordance nobody
                // recognises is just an artifact, and an artifact is
                // something people learn to ignore. The repetition down the
                // rows is what does the work here, not the decoration.
                <button
                  type="button"
                  aria-label="Set your location to see distances"
                  onClick={(e) => {
                    // The row's own handler expands the card. This tap was
                    // for the picker, not for this listing's details.
                    e.stopPropagation()
                    document.dispatchEvent(new CustomEvent('jpc:open-location'))
                  }}
                  // -my-2 py-2: the label itself is 17px tall, under the
                  // 24px WCAG-recommended tap target. Padding grows the real
                  // hit area to ~33px; the negative margin cancels it out of
                  // the layout so the row's height doesn't shift. Same
                  // technique, and same reason, as the chevron above.
                  className="-my-2 flex items-center gap-1 whitespace-nowrap py-2 text-xs text-muted transition-colors hover:text-slate-600 cursor-pointer"
                >
                  <span aria-hidden="true">📍</span>
                  <span aria-hidden="true">—</span>
                </button>
              ) : null}
            </div>
          </div>
        )}

        {/* Mobile-only twin of the headerTextFields loop above — see the
            comment there. Indented to align under the name/address (same
            52px = icon + gap as above). */}
        {headerTextFields.map(({ f, text }) =>
          f.type === 'textarea' ? (
            <p key={f.key} className="desktop:hidden text-sm text-slate-600 mt-2 pl-[52px]">
              <span style={headerTextClampStyle}>{text}</span>
            </p>
          ) : (
            <p key={f.key} className="desktop:hidden truncate text-sm text-slate-600 mt-2 pl-[52px]">{text}</p>
          ),
        )}

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
            {/* Row-alignment spacer — height set imperatively by
                GenericDirectory (see setSpacerHeight), never by React state,
                so a measure/set pass doesn't itself trigger a re-render.
                0 height (and therefore invisible) until a taller row-mate
                exists. */}
            <div ref={spacerRef} aria-hidden="true" />
            <div ref={badgeRowRef} className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
              {badgeRow}
            </div>
          </>
        )}
      </div>

      {/* Mobile: inline accordion, pushing the rest of the list down — see
          the isMobile note above the state declaration. */}
      {isMobile && expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-3 bg-slate-50 rounded-b-lg">
          <PlaceDetailBody
            item={item}
            category={category}
            onTagClick={onTagClick}
            onFilterOpen={onFilterOpen}
            onFilterBool={onFilterBool}
            onFilterSelect={onFilterSelect}
            hideOpenStatus
            // headerBadges (the full set), not visibleHeaderBadges — a badge
            // countReplacesKey suppressed from the collapsed row shouldn't
            // reappear down here either. It was excluded from
            // visibleHeaderBadges specifically so the count could take its
            // spot, not because the badge stopped applying; showing it again
            // once expanded reintroduces the exact "says the same thing
            // twice" duplication the count was built to avoid, just one tap
            // later instead of never.
            hiddenBadgeKeys={headerBadges.map((f) => f.key)}
          />

          <div className="pt-2 border-t border-slate-200 space-y-2">
            <FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} />
            <div className="flex gap-3">
              <ShareButton path={routes.listing(community, category.id, listingSlug(item))} title={item.name} />
              {canEdit && (
                <button onClick={onEdit} className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors cursor-pointer"><PencilIcon className="h-3.5 w-3.5" /> Edit</button>
              )}
              {canReport && (
                <button onClick={onReport} className="inline-flex items-center gap-1 text-xs text-muted hover:text-red-600 transition-colors cursor-pointer"><FlagIcon className="h-3.5 w-3.5" /> Report</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Desktop: same content, centered dialog instead — see ListingDetailModal. */}
      {!isMobile && (
        <ListingDetailModal
          isOpen={expanded}
          onClose={() => setExpanded(false)}
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
          onEdit={onEdit}
          onReport={onReport}
          canEdit={canEdit}
          canReport={canReport}
          onNavigate={onNavigate}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      )}
    </div>
  )
})
