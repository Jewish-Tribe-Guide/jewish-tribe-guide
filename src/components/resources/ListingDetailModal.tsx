'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import CategoryIcon from '@/components/CategoryIcon'
import PlaceDetailBody from './PlaceDetailBody'
import FreshnessFooter from './FreshnessFooter'
import ShareButton from './ShareButton'
import { PencilIcon, FlagIcon } from '@/components/icons'

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
   *  sits under its backdrop blur. See that component's `badgeRow` comment
   *  for why this is passed rather than recomputed. */
  badgeRow: ReactNode
  headerBadgeKeys: string[]
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
  onTagClick,
  onFilterOpen,
  onFilterBool,
  onFilterSelect,
  onEdit,
  onReport,
  canEdit,
  canReport,
  onNavigate,
}: Props) {
  const community = useCommunitySlug()

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        // max-w-xl (576px) — between the original max-w-lg (512px, read as
        // cramped once the page around it had real room to spare) and a
        // later max-w-2xl (672px, tried as the fix for that and felt too
        // wide/short the other way). Content here is single-column
        // throughout (see PlaceDetailBody) — nothing depends on the wider
        // measure, so this only affects how the action-button row and badge
        // chips wrap, not the layout structure.
        className="flex flex-col w-full max-w-xl max-h-[85vh] bg-white border border-slate-200 rounded-xl shadow-xl"
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
              <h2 className="font-semibold text-slate-900 text-lg">{name}</h2>
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
            // This modal replaces GenericListingCard's collapsed row
            // entirely (the card behind it is hidden under the backdrop),
            // so a showInHeader url field (e.g. Networking's Website link)
            // has nowhere else left to show — see the prop's own comment.
            includeHeaderUrlFields
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
