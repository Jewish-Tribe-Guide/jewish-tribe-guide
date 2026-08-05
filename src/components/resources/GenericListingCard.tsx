'use client'

import { useState } from 'react'
import type { DirectoryResource } from '@/types'
import { resolveCapabilities, selectValues, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { getOpenStatus } from '@/lib/hours'
import { getCategoryColor } from '@/lib/categoryColor'
import { useCategories } from '@/lib/useCategories'
import UpvoteButton from './UpvoteButton'
import FreshnessFooter from './FreshnessFooter'
import PlaceDetailBody from './PlaceDetailBody'
import Chip from './Chip'
import { PencilIcon, FlagIcon } from '@/components/icons'
import { travelParts } from '@/lib/listingTravel'
import { ui } from '@/lib/uiConfig'

// ── Card field helpers ──────────────────────────────────────────────────────────

// Trim a full mailing address down to "street, city" for the quiet card subtitle
// (drops state, zip, and country). The full address still shows when expanded.
function shortAddress(addr: string): string {
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length <= 2 ? parts.join(', ') : `${parts[0]}, ${parts[1]}`
}

// ── Collapsible listing card ────────────────────────────────────────────────────
// Collapsed row is styled after the map's NearbyList row (icon avatar, name,
// "category · address" subtitle, distance) so a place looks the same whether
// you found it here or on the map. The only chips that still show collapsed
// are ones tied to an actual filter control (Open, filterable badges) — every
// other badge/tag waits behind the expand, in PlaceDetailBody, same as
// MapPlaceDetail's full detail view.
export function GenericListingCard({
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
  onNameClick,
}: {
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
}) {
  const [expanded, setExpanded] = useState(!!defaultExpanded)
  const categories = useCategories()

  const fields = category.detailFields
  // Per-category capabilities layered under the global `ui.contributions` switches.
  const caps = resolveCapabilities(category.capabilities)
  const canEdit = ui.contributions.edit && caps.edit
  const canReport = ui.contributions.report && caps.report
  const hoursFields = fields.filter((f) => f.type === 'hours')
  const badgeFields = fields.filter((f) => {
    if (f.type === 'tags' || f.type === 'url' || f.type === 'hours' || f.type === 'minyanim') return false
    return (f.renderAs ?? (f.type === 'boolean' ? 'badge' : 'row')) === 'badge'
  })

  // A listing is "Open" if ANY of its hours fields say so — see getOpenStatus.
  const { isOpen, closing } = getOpenStatus(item, hoursFields.map((f) => f.key))
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

  const showAddress = category.hasAddress !== false && !!item.address
  const subtitleParts = [showCategoryLabel ? category.label : null, showAddress ? shortAddress(item.address!) : null].filter(Boolean)
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : (item.googleDescription as string | undefined) || null

  const color = getCategoryColor(categories, category.id)

  return (
    // No `overflow-hidden`: it would clip the cert badge's hover tooltip on a
    // collapsed card. Corners stay clean because the header and expanded panel
    // round their own edges below.
    <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((p) => !p)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((p) => !p) } }}
        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer ${expanded ? 'rounded-t-lg' : 'rounded-lg'}`}
      >
        {/* Icon avatar — same glyph + tinted color as this category's map pin
            (see getCategoryColor), so a place reads as the same thing here
            and on the map. */}
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
          style={{ backgroundColor: color + '22' }}
          aria-hidden="true"
        >
          {category.icon}
        </span>

        {/* Name + subtitle + the only chips that survive collapsed: Open and
            any badge tied to an actual filter control. */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
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
          {(isOpen || headerBadges.length > 0) && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
              {headerBadges.flatMap((f) => {
                const texts = f.type === 'select' ? selectValues(item[f.key]) : [f.filterLabel ?? f.label]
                const note = caveatNote(f)
                const amber = note !== null
                return texts.map((text) => {
                  const btn = (
                    <Chip
                      tone={amber ? 'amber' : 'slate'}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (f.type === 'boolean') onFilterBool(f.key)
                        else onFilterSelect(f.key, text)
                      }}
                      title={amber ? undefined : `Filter by ${text}`}
                    >
                      {text}
                    </Chip>
                  )
                  if (!amber) return <span key={`${f.key}:${text}`}>{btn}</span>
                  return (
                    <span key={`${f.key}:${text}`} className="relative group/tip">
                      {btn}
                      <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-max max-w-[220px] whitespace-normal rounded bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 hidden sm:block z-10">
                        {note || 'Not everything here is kosher — please verify.'}
                      </span>
                    </span>
                  )
                })
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {(upvotes || travel.length > 0) && (
            // Stacked on mobile to save horizontal space; side by side from sm
            // up, each in its own fixed-width column so every row's upvote
            // count lands in the same spot (lining up under the directory's
            // Popular/Distance sort toggle above) instead of drifting with
            // how long the distance text happens to be.
            <div className="flex flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-4">
              {upvotes && (
                <div className="sm:flex sm:w-10 sm:justify-end">
                  <UpvoteButton variant="inline" resourceId={item.id} count={count} onCountChange={onVote} />
                </div>
              )}
              {travel.length > 0 && (
                <div className="flex flex-col items-end gap-0.5 text-xs font-medium text-slate-600 whitespace-nowrap sm:w-14">
                  {travel.map((t) => <span key={t}>{t}</span>)}
                </div>
              )}
            </div>
          )}
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
          <svg
            className={`w-4 h-4 text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-3 bg-slate-50 rounded-b-lg">
          <PlaceDetailBody
            item={item}
            category={category}
            onTagClick={onTagClick}
            onFilterOpen={onFilterOpen}
            onFilterBool={onFilterBool}
            onFilterSelect={onFilterSelect}
            hideOpenStatus
            hiddenBadgeKeys={headerBadges.map((f) => f.key)}
          />

          <div className="pt-2 border-t border-slate-200 space-y-2">
            <FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} />
            {(canEdit || canReport) && (
              <div className="flex gap-3">
                {canEdit && (
                  <button onClick={onEdit} className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors cursor-pointer"><PencilIcon className="h-3.5 w-3.5" /> Edit</button>
                )}
                {canReport && (
                  <button onClick={onReport} className="inline-flex items-center gap-1 text-xs text-muted hover:text-red-600 transition-colors cursor-pointer"><FlagIcon className="h-3.5 w-3.5" /> Report</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
