'use client'

import { useState } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { isStructuredHours, hoursOpenNow, hoursClosing } from '@/lib/hours'
import HoursDisplay from './HoursDisplay'
import UpvoteButton from './UpvoteButton'
import FreshnessFooter from './FreshnessFooter'
import Chip from './Chip'
import { PencilIcon, FlagIcon } from '@/components/icons'
import { useIsMobile } from '@/lib/useIsMobile'
import { businessUrl } from '@/lib/googleMapsLinks'
import { travelParts } from '@/lib/listingTravel'

// ── Card field helpers ──────────────────────────────────────────────────────────

function placement(field: CategoryField): 'badge' | 'row' | 'hidden' {
  return field.renderAs ?? (field.type === 'boolean' ? 'badge' : 'row')
}

function display(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  // Objects (e.g. structured hours) are handled specially elsewhere; skip them here.
  if (typeof value === 'object') return ''
  return String(value)
}

function asTags(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : []
}

// Trim a full mailing address down to "street, city" for the quiet card subtitle
// (drops state, zip, and country). The full address still shows when expanded.
function shortAddress(addr: string): string {
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length <= 2 ? parts.join(', ') : `${parts[0]}, ${parts[1]}`
}

// ── Collapsible listing card ────────────────────────────────────────────────────
// Mirrors the synagogue card: collapsed shows only what people decide by (name,
// the key yes/no badges, "Open", distance); the rest waits behind a tap.
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
}: {
  item: DirectoryResource
  category: CategoryConfig
  upvotes: boolean
  count: number
  defaultExpanded?: boolean
  onVote: (count: number) => void
  onTagClick: (tag: string) => void
  /** Click the "Open" badge → turn on the "Open now" filter. */
  onFilterOpen: () => void
  /** Click a boolean badge (e.g. "Kosher") → enable that boolean filter. */
  onFilterBool: (key: string) => void
  /** Click a select badge (e.g. cert "IKC", type "Restaurant") → select it in
   *  that field's filter. `multi` adds to the set; otherwise it replaces. */
  onFilterSelect: (key: string, value: string, multi: boolean) => void
  onEdit: () => void
  onReport: () => void
}) {
  const [expanded, setExpanded] = useState(!!defaultExpanded)
  const isMobile = useIsMobile()

  const fields = category.detailFields
  const tagFields = fields.filter((f) => f.type === 'tags')
  const urlFields = fields.filter((f) => f.type === 'url' && !f.showInHeader)
  const headerUrlFields = fields.filter((f) => f.type === 'url' && f.showInHeader)
  const hoursFields = fields.filter((f) => f.type === 'hours')
  const special = (f: CategoryField) => f.type === 'tags' || f.type === 'url' || f.type === 'hours'
  const badgeFields = fields.filter((f) => !special(f) && placement(f) === 'badge')
  const rowFields = fields.filter((f) => !special(f) && placement(f) === 'row')

  const hoursVal = hoursFields[0] ? item[hoursFields[0].key] : undefined
  const isOpen = hoursVal !== undefined && hoursOpenNow(hoursVal) === true && isStructuredHours(hoursVal)
  // Within the last hour before closing, the "Open" chip reads "Closes soon"
  // (still green — the place is usable now) with the exact close time on hover.
  const closing = isOpen ? hoursClosing(hoursVal) : null
  const travel = travelParts(item)
  const tags = tagFields.flatMap((f) => asTags(item[f.key]))
  const tagsSometimes = tagFields.flatMap((f) => asTags(item[f.key + '_sometimes']))
  // On mobile the name line gets crowded, so cap the tag chips shown collapsed
  // and surface the rest behind a "+N" chip that expands the card (the full list
  // renders in the detail panel below). Desktop shows them all inline.
  const MOBILE_TAG_LIMIT = 3
  const allTags = [...tags, ...tagsSometimes]
  const capTags = isMobile && allTags.length > MOBILE_TAG_LIMIT + 1
  const headerTags = capTags ? tags.slice(0, MOBILE_TAG_LIMIT) : tags
  const headerTagsSometimes = capTags ? tagsSometimes.slice(0, Math.max(0, MOBILE_TAG_LIMIT - headerTags.length)) : tagsSometimes
  const hiddenTagCount = allTags.length - headerTags.length - headerTagsSometimes.length

  // Collapsed signals: boolean true-badges + select badges (e.g. kosher cert).
  // Unset booleans and unset selects go in the detail panel.
  const signalBadges = badgeFields.filter((f) =>
    f.type === 'boolean' ? !!item[f.key] : f.type === 'select' ? !!item[f.key] : false,
  )
  const detailBadges = badgeFields.filter((f) => !signalBadges.includes(f))

  // The per-listing caveat note for a badge field flagged not-fully-kosher
  // (e.g. a hechsher that doesn't cover the whole menu). Returns the authored
  // note ('' if flagged but none typed), or null when the caveat doesn't apply.
  const caveatNote = (f: CategoryField): string | null => {
    if (!f.caveat || !item[f.caveat.flagField]) return null
    return String(item[f.caveat.noteField] ?? '').trim()
  }

  // A quiet second line under the name — mirrors the synagogue card's denomination
  // subtitle. The address gives "where is this" context without expanding; items
  // with no address (e.g. community groups) fall back to a short Google blurb.
  const subtitle = item.address
    ? shortAddress(item.address)
    : (item.googleDescription as string | undefined) || null

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
        className={`w-full flex items-center justify-between gap-3 px-4 py-4 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer ${expanded ? 'rounded-t-lg' : 'rounded-lg'}`}
      >
        {/* Name + the badges/tags people scan by (tags are clickable searches).
            On mobile the name sits on its own line with the chips on a row below
            so it never gets crowded; on desktop they share a line. */}
        <div className="min-w-0 flex flex-col gap-1">
          <div className="flex flex-col gap-y-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1">
          {/* On mobile the upvote flows inline right after the name text, so it
              follows the last word even when the name wraps to two lines. On desktop
              it's hidden here and appears in the right-side cluster instead. */}
          <span className="min-w-0 font-semibold text-slate-900">
            {item.name}
            {upvotes && (
              <span className="sm:hidden inline-flex align-middle relative -top-0.5 ml-2">
                <UpvoteButton variant="inline" resourceId={item.id} count={count} onCountChange={onVote} />
              </span>
            )}
          </span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:gap-y-1">
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
          {signalBadges.map((f) => {
            const text = f.type === 'select' ? String(item[f.key]) : (f.filterLabel ?? f.label)
            const note = caveatNote(f)
            const amber = note !== null
            // A badge "has a designated filter" when its field is filterable; then
            // clicking it drives that control. Otherwise it falls back to search.
            const btn = (
              <Chip
                tone={amber ? 'amber' : 'slate'}
                onClick={(e) => {
                  e.stopPropagation()
                  if (f.filterable && f.type === 'boolean') onFilterBool(f.key)
                  else if (f.filterable && f.type === 'select') onFilterSelect(f.key, String(item[f.key]), !!f.multiSelect)
                  else onTagClick(text)
                }}
                title={amber ? undefined : `Filter by ${text}`}
              >
                {text}
              </Chip>
            )
            // Not-fully-kosher cert → amber badge with the per-listing note on hover.
            if (!amber) return <span key={f.key}>{btn}</span>
            return (
              <span key={f.key} className="relative group/tip">
                {btn}
                <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-max max-w-[220px] whitespace-normal rounded bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 hidden sm:block z-10">
                  {note || 'Not everything here is kosher — please verify.'}
                </span>
              </span>
            )
          })}
          {headerTags.map((t) => (
            <Chip key={t} tone="slate" onClick={(e) => { e.stopPropagation(); onTagClick(t) }} title={`Find places with ${t}`}>
              {t}
            </Chip>
          ))}
          {headerTagsSometimes.map((t) => (
            <span key={`sometimes:${t}`} className="relative group/tip">
              <Chip tone="amber" onClick={(e) => { e.stopPropagation(); onTagClick(t) }}>
                ~{t}
              </Chip>
              <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[11px] leading-none text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 hidden sm:block z-10">
                not always in stock
              </span>
            </span>
          ))}
          {hiddenTagCount > 0 && (
            <Chip tone="slateMuted" onClick={(e) => { e.stopPropagation(); setExpanded(true) }} title="Show all tags">
              +{hiddenTagCount}
            </Chip>
          )}
          </div>
          </div>
          {subtitle && (
            // Hidden on mobile to keep collapsed cards uncluttered — distance shows
            // on the right once a location is set, and the full address is one tap
            // away in the expanded panel. Still shown on desktop where there's room.
            <p className="hidden sm:block text-sm text-muted truncate">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {upvotes && (
            <span className="hidden sm:block">
              <UpvoteButton variant="inline" resourceId={item.id} count={count} onCountChange={onVote} />
            </span>
          )}
          {travel.length > 0 && (
            <div className="flex flex-col items-end gap-0.5 text-xs font-medium text-slate-600 whitespace-nowrap">
              {travel.map((t) => <span key={t}>{t}</span>)}
            </div>
          )}
          {headerUrlFields.map((f) => {
            const href = display(item[f.key])
            if (!href) return null
            return (
              <a
                key={f.key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-medium text-primary border border-primary rounded px-2 py-1.5 sm:py-1 hover:bg-primary hover:text-white transition-colors whitespace-nowrap"
              >
                {f.linkLabel ?? f.label}
              </a>
            )
          })}
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
          {/* Full tag list — only when the collapsed header capped it (mobile). */}
          {capTags && allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Chip key={t} tone="slate" size="expanded" onClick={(e) => { e.stopPropagation(); onTagClick(t) }} title={`Find places with ${t}`}>
                  {t}
                </Chip>
              ))}
              {tagsSometimes.map((t) => (
                <span key={`sometimes:${t}`} className="relative group/tip">
                  <Chip tone="amber" size="expanded" onClick={(e) => { e.stopPropagation(); onTagClick(t) }}>
                    ~{t}
                  </Chip>
                  <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[11px] leading-none text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 hidden sm:block z-10">
                    not always in stock
                  </span>
                </span>
              ))}
            </div>
          )}
          {tagsSometimes.length > 0 && (
            <p className="text-[11px] text-muted sm:hidden">~ = not always in stock — call ahead</p>
          )}
          {detailBadges.some((f) => (f.type === 'boolean' ? item[f.key] : display(item[f.key]))) && (
            <div className="flex flex-wrap gap-1.5">
              {detailBadges.map((f) => {
                const v = item[f.key]
                if (f.type === 'boolean' ? !v : !display(v)) return null
                const text = f.type === 'boolean' ? f.label : `${f.label}: ${display(v)}`
                return (
                  <Chip key={f.key} tone="slate" size="expanded">{text}</Chip>
                )
              })}
            </div>
          )}

          {item.address && (
            <div>
              <p className="text-sm text-slate-800">{item.address}</p>
              <a
                href={businessUrl(item.name, item.address, item.placeId as string | undefined)}
                target="_blank" rel="noopener noreferrer"
                className="inline-block mt-1 text-xs font-medium text-primary hover:underline"
              >
                Get directions →
              </a>
            </div>
          )}

          {item.phone && (
            <div>
              <a href={`tel:${item.phone.replace(/\D/g, '')}`} className="text-sm text-primary hover:underline">
                {item.phone}
              </a>
              {item.placeId && !hoursVal && (
                <span className="ml-2 text-[10px] font-medium text-slate-400 border border-slate-200 rounded px-1 py-0.5 leading-none align-middle">via Google</span>
              )}
            </div>
          )}

          {rowFields.map((f) => {
            const v = display(item[f.key])
            if (!v) return null
            return (
              <p key={f.key} className="text-sm text-slate-700">
                {!f.hideLabel && <span className="text-muted">{f.label}: </span>}
                {v}
              </p>
            )
          })}

          {(hoursVal !== undefined || item.businessStatus) && (
            <HoursDisplay value={hoursVal} businessStatus={item.businessStatus} syncedAt={item.googleSyncedAt} />
          )}

          {urlFields.map((f) => {
            const href = display(item[f.key])
            if (!href) return null
            return (
              <a
                key={f.key}
                href={href}
                target="_blank" rel="noopener noreferrer"
                className="inline-block text-xs font-medium text-primary border border-primary rounded px-2 py-1 hover:bg-primary hover:text-white transition-colors"
              >
                {f.linkLabel ?? f.label}
              </a>
            )
          })}

          {/* Not-fully-kosher caveat note — placed under the menu/details so it
              reads in context; the amber cert badge above is the at-a-glance flag. */}
          {signalBadges.map((f) => {
            const note = caveatNote(f)
            if (note === null) return null
            return (
              <p key={`caveat:${f.key}`} className="text-[12px] leading-snug text-amber-700">
                {note || 'Not everything here is kosher — please verify.'}
              </p>
            )
          })}

          <div className="pt-2 border-t border-slate-200 space-y-2">
            <FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} />
            <div className="flex gap-3">
              <button onClick={onEdit} className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors cursor-pointer"><PencilIcon className="h-3.5 w-3.5" /> Edit</button>
              <button onClick={onReport} className="inline-flex items-center gap-1 text-xs text-muted hover:text-red-600 transition-colors cursor-pointer"><FlagIcon className="h-3.5 w-3.5" /> Report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
