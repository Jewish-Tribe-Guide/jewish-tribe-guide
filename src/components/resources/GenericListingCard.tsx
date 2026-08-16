'use client'

import { useState } from 'react'
import type { DirectoryResource } from '@/types'
import { PHOTO_FIELD_KEY, resolveCapabilities, selectValues, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { getOpenStatus } from '@/lib/hours'
import { getCategoryColor } from '@/lib/categoryColor'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import CategoryIcon from '@/components/CategoryIcon'
import UpvoteButton from './UpvoteButton'
import FreshnessFooter from './FreshnessFooter'
import PlaceDetailBody from './PlaceDetailBody'
import ShareButton from './ShareButton'
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
  const community = useCommunitySlug()

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

  // text/textarea fields explicitly opted into the collapsed row — a short
  // note ("Sit-down glatt kosher steakhouse, under IKC supervision") that
  // says what the place actually is, without expanding the card first.
  // Deliberately single-line: `truncate` (not a multi-line clamp) so the
  // decision to keep this short lives in what gets typed, not in how long a
  // line the layout happens to allow — the same one-line limit applies at
  // every width, not just mobile's. `truncate` still applies even for a
  // `headerMaxLength`-capped field (guaranteed to already fit, so normally a
  // no-op) — cheap insurance against a value that predates the cap, or one
  // written some other way than the submission form.
  const headerTextFields = fields
    .filter((f) => (f.type === 'text' || f.type === 'textarea') && f.showInHeader)
    .map((f) => ({ f, text: (item[f.key] as string | undefined)?.trim() }))
    .filter((x): x is { f: CategoryField; text: string } => !!x.text)

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
        className={`w-full px-4 py-3 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer ${expanded ? 'rounded-t-lg' : 'rounded-lg'}`}
      >
        <div className="flex items-center gap-3">
          {/* Icon avatar — same glyph/image + tinted color as this category's
              map pin (see getCategoryColor), so a place reads as the same
              thing here and on the map. self-start (overriding the row's own
              items-center) keeps it pinned near the name's own line instead
              of drifting toward the middle of the block once a header text
              field makes it 3 lines instead of 2 — an avatar anchored to the
              title reads right at any height; a trailing chevron/distance
              centered against the whole block (below) still reads right too,
              since it's a short glance-able number, not a title. mt-0.5
              nudges it those last couple pixels: the name's own line-height
              leaves a little leading above the visible text, so even with
              matching box tops the glyph itself starts lower than the icon. */}
          <CategoryIcon
            icon={category.icon}
            iconImageUrl={
              (typeof item[PHOTO_FIELD_KEY] === 'string' && (item[PHOTO_FIELD_KEY] as string).trim()
                ? (item[PHOTO_FIELD_KEY] as string)
                : category.iconImageUrl) ?? undefined
            }
            color={color}
            className="h-10 w-10 text-xl self-start mt-0.5"
          />

          {/* Name + subtitle + an optional one-line "what this place is" note
              — badges get their own full-width row below (see badge row
              further down) so they don't have to compete with the distance/
              votes column for horizontal space and wrap early. */}
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
            {/* mt-2: enough gap that this reads as its own beat after the
                name+address fact, not a third bullet inside it — but no
                border/section treatment, which is reserved for the hairline
                before the badge row (a genuinely different mode: read text
                vs. scannable chips). */}
            {headerTextFields.map(({ f, text }) => (
              <p key={f.key} className="truncate text-sm text-slate-600 mt-2">{text}</p>
            ))}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {(upvotes || travel.length > 0) && (
              // Stacked on mobile to save horizontal space; side by side from sm
              // up, each in its own fixed-width column so every row's upvote
              // count lands in the same spot, and the distance column is
              // left-aligned so the 📍/🚗/🚶 glyphs all line up under each
              // other instead of drifting with how long the mileage text is.
              <div className="flex flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                {upvotes && (
                  <div className="sm:flex sm:w-10 sm:justify-end">
                    <UpvoteButton variant="inline" resourceId={item.id} count={count} onCountChange={onVote} />
                  </div>
                )}
                {travel.length > 0 && (
                  <div className="flex flex-col items-end gap-0.5 text-xs font-medium text-slate-600 whitespace-nowrap sm:items-start sm:w-14">
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

        {/* Badge row — the only chips that survive collapsed: Open and any
            badge tied to an actual filter control. Below the name/distance
            row (rather than wrapping inside the name column) so it gets the
            whole card's width to lay out in, instead of fighting the
            distance/votes column for space and wrapping early. The hairline
            still spans the full card, but on sm+ the chips themselves are
            indented to start under the name/address (sm:pl-[52px] = the 40px
            icon + 12px gap it sits next to above), not flush with the icon's
            own left edge — padding, not the icon's own width, so the divider
            above stays untouched. On mobile the chips sit flush left instead,
            since the narrower width makes the indent crowd them into wrapping. */}
        {(isOpen || headerBadges.length > 0) && (
          <div className="mt-2 pt-2 pl-0 sm:pl-[52px] border-t border-slate-100 flex flex-wrap items-center gap-1.5">
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
          </div>
        )}
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
    </div>
  )
}
