'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import CategoryIcon from '@/components/CategoryIcon'
import PlaceDetailBody from './PlaceDetailBody'
import FreshnessFooter from './FreshnessFooter'
import ShareButton from './ShareButton'
import { PencilIcon, FlagIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

type Props = {
  isOpen: boolean
  onClose: () => void
  item: DirectoryResource
  category: CategoryConfig
  color: string
  iconImageUrl?: string
  name: string
  subtitle: string | null
  /** The card's own Open/closure/filterable-badge row, already built by
   *  GenericListingCard — restated here since the card behind this dialog
   *  sits under its dim backdrop. See that component's `badgeRow` comment
   *  for why this is passed rather than recomputed. */
  badgeRow: ReactNode
  headerBadgeKeys: string[]
  /** A showInHeader url field (e.g. "Join group") — same pill, same spot
   *  next to the name, as GenericListingCard's own collapsed row. See the
   *  render site's own comment for why this moved here instead of staying
   *  in the actions row below. */
  headerUrlFields: { f: CategoryField; href: string }[]
  onTagClick: (tag: string) => void
  onFilterOpen: () => void
  onFilterBool: (key: string) => void
  onFilterSelect: (key: string, value: string) => void
  onEdit: () => void
  onReport: () => void
  canEdit: boolean
  canReport: boolean
  /** Left/Right arrow while this dialog is focused moves to the previous/
   *  next card in whatever order is currently on screen — the lightbox
   *  pattern (Google Photos, Gmail's message view). Omitted where there's
   *  no well-defined "next" (none today — GenericListingCard always passes
   *  one — but kept optional so a future caller isn't forced to). Up/Down
   *  are deliberately left alone: the desktop grid has neighbors in those
   *  directions too, but "next" reading a multi-column grid top-to-bottom,
   *  left-to-right is the one order a visitor actually recognizes as
   *  "what I was just scrolling past," and that's what the arrows follow. */
  onNavigate?: (direction: 1 | -1) => void
  /** Whether there's actually a previous/next card to move to — draws the
   *  arrow buttons below dimmed and inert at either end, rather than a
   *  clickable-looking arrow that visibly does nothing when tapped. Only
   *  meaningful together with onNavigate; ignored otherwise. */
  hasPrev?: boolean
  hasNext?: boolean
}

/** Desktop's counterpart to the card's inline expand. A multi-column grid has
 *  nowhere sensible to push an expanding card's panel — it would have to
 *  either span every column in its row or overlap its neighbors — so desktop
 *  opens the same PlaceDetailBody content in a centered dialog instead. See
 *  GenericListingCard's `isMobile` branch for the split.
 *
 *  Follows DaveningTimesModal's own conventions: backdrop click and Escape
 *  both close it, body scroll locks while open. */
export default function ListingDetailModal({
  isOpen,
  onClose,
  item,
  category,
  color,
  iconImageUrl,
  name,
  subtitle,
  badgeRow,
  headerBadgeKeys,
  headerUrlFields,
  onTagClick,
  onFilterOpen,
  onFilterBool,
  onFilterSelect,
  onEdit,
  onReport,
  canEdit,
  canReport,
  onNavigate,
  hasPrev,
  hasNext,
}: Props) {
  const community = useCommunitySlug()

  // Reference-counted, not a plain `document.body.style.overflow = isOpen ?
  // 'hidden' : ''` — GenericDirectory can mount dozens of these (one per
  // card), and arrow-key next/prev closes one and opens another in the same
  // commit. Two instances both writing that one global property in the same
  // tick raced, and whichever happened to run last could leave the page
  // scrollable while a dialog was still open — see the hook's own comment.
  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // Guards against a text input inside the dialog someday capturing the
      // arrow keys for cursor movement instead of navigation — nothing here
      // currently has one, but a global keydown listener shouldn't assume
      // that stays true.
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (e.key === 'ArrowLeft') onNavigate?.(-1)
      else if (e.key === 'ArrowRight') onNavigate?.(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose, onNavigate])

  if (!isOpen) return null

  // Visible only when there's actually somewhere for them to go — see
  // onNavigate's own comment on why a dimmed, inert arrow beats hiding it
  // outright (a missing button at one end while browsing reads as a glitch;
  // a visibly-disabled one reads as "you've reached the end").
  const showNav = !!onNavigate

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      {/* Lightbox-style arrows, fixed to the viewport rather than anchored to
          the dialog card itself — keeps them in the same reachable spot
          however wide or narrow the card ends up (see its own width
          comment), the same way Google Photos' don't move with the image. */}
      {showNav && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigate!(-1) }}
          disabled={!hasPrev}
          aria-label="Previous listing"
          className="fixed left-4 top-1/2 z-50 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-600 shadow-lg ring-1 ring-slate-900/10 transition-opacity hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer disabled:cursor-default"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
      )}
      {showNav && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigate!(1) }}
          disabled={!hasNext}
          aria-label="Next listing"
          className="fixed right-4 top-1/2 z-50 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-600 shadow-lg ring-1 ring-slate-900/10 transition-opacity hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer disabled:cursor-default"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      )}
      <div
        // max-w-md (448px) — this went 512 (cramped, page had room to
        // spare) → 672 (fixed that, but read too wide/short the other way)
        // → 576 → here. The narrower widths above all sized the dialog for
        // its widest-content listing; a sparse one (an address, a phone, no
        // description) then rendered short *and* wide at that same fixed
        // width — proportioned like a business card lying on its side, not
        // like a focused dialog. 448px is narrow enough that even a sparse
        // listing reads as a normal vertical card shape, and was checked
        // against the busiest real case (4 action buttons + a cert badge)
        // to confirm nothing wraps awkwardly at this width.
        className="flex flex-col w-full max-w-md max-h-[85vh] bg-white border border-slate-200 rounded-xl shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={name}
      >
        {/* Badges live inside this same block, under the subtitle — not as
            their own section below a divider. They're facts about this
            place (Open, Restaurant, kosher cert), the same category of
            information as the name and address right above them; putting a
            hard rule between "who this is" and "what it is" read as if the
            badges belonged with the action icons below instead. The divider
            now marks the real boundary: identity above it, actions below. */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-slate-200 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <CategoryIcon
              icon={category.icon}
              categoryId={category.id}
              iconImageUrl={iconImageUrl}
              color={color}
              className="h-10 w-10 text-xl shrink-0"
            />
            <div className="min-w-0">
              {/* Two columns, not one wrapping flex row — matching the
                  collapsed card behind this dialog exactly (see that
                  component's own headerUrlFields comment): the name gets its
                  own flexible column and wraps onto a second line there if
                  it needs to, while the pill stays put in a fixed column at
                  the right, instead of the two crowding onto the same line
                  and the pill getting pushed wherever there happened to be
                  room. Was rendered as one of the actions-row icon buttons
                  below instead (Directions/Call style) via
                  includeHeaderUrlFields; moved back to sit with the name
                  specifically because that row was the one place this
                  dialog didn't otherwise match the card it opened from, and
                  PlaceDetailBody's own default (excluding a showInHeader
                  field from that row) already assumes there's a header spot
                  like this one showing it instead. */}
              <div className="flex items-start gap-2">
                <h2 className="min-w-0 flex-1 font-semibold text-slate-900 text-lg">{name}</h2>
                {headerUrlFields.length > 0 && (
                  <div className="flex shrink-0 items-center gap-2">
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
              {subtitle && <p className="text-sm text-muted truncate">{subtitle}</p>}
              {badgeRow && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {badgeRow}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-muted hover:text-slate-700 transition-colors cursor-pointer p-1 rounded"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <PlaceDetailBody
            item={item}
            category={category}
            onTagClick={onTagClick}
            onFilterOpen={onFilterOpen}
            onFilterBool={onFilterBool}
            onFilterSelect={onFilterSelect}
            hideOpenStatus
            hiddenBadgeKeys={headerBadgeKeys}
            // Not includeHeaderUrlFields here — that field now has a home in
            // this dialog's own header, next to the name (see above), the
            // same reason PlaceDetailBody's default excludes it from this
            // row for GenericListingCard's mobile accordion too.
          />

          <div className="pt-3 border-t border-slate-200 space-y-2.5">
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
      </div>
    </div>
  )
}
