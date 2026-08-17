'use client'

import { Fragment, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { track } from '@vercel/analytics'
import type { DirectoryResource } from '@/types'
import { selectValues, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { getOpenStatus, syncedLabel } from '@/lib/hours'
import HoursDisplay from './HoursDisplay'
import DaveningTimes, { hasDaveningTimes } from './DaveningTimes'
import Chip from './Chip'
import SetLocationButton from './SetLocationButton'
import { directionsUrl, destinationQuery } from '@/lib/googleMapsLinks'
import { formatPhone } from '@/lib/validation'
import { useOptionalLocation } from '@/lib/locationContext'
import { PinIcon, PhoneIcon, ClockIcon, DirectionsIcon, ExternalIcon, GlobeIcon } from '@/components/icons'

// ── Field helpers ────────────────────────────────────────────────────────────

function placement(field: CategoryField): 'badge' | 'row' | 'hidden' {
  return field.renderAs ?? (field.type === 'boolean' ? 'badge' : 'row')
}

function display(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return ''
  return String(value)
}

function asTags(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : []
}

/** A round icon button with a label underneath — the Directions/Call/Website
 *  action row, styled after Google Maps' place-card action buttons. */
function ActionButton({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.stopPropagation()
        track('listing_action', { action: label })
      }}
      className="flex flex-col items-center gap-1 text-primary"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 hover:bg-primary/15 transition-colors">
        {icon}
      </span>
      <span className="text-xs font-medium">{label}</span>
    </a>
  )
}

// Clips a flex-wrap row of chips to `maxRows` (measured, not counted — chip
// width varies with text length so a fixed item count wraps unpredictably),
// with a "+N more" toggle below it that reveals the rest.
function ClampedChipRow({ maxRows = 2, children }: { maxRows?: number; children: ReactNode[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [maxHeight, setMaxHeight] = useState<number | null>(null)
  const [hiddenCount, setHiddenCount] = useState(0)
  const [expanded, setExpanded] = useState(false)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    function measure() {
      if (!el) return
      const items = Array.from(el.children) as HTMLElement[]
      if (items.length === 0) {
        setMaxHeight(null)
        setHiddenCount(0)
        return
      }
      const containerTop = el.getBoundingClientRect().top
      const tops = items.map((c) => Math.round(c.getBoundingClientRect().top - containerTop))
      const rowTops = Array.from(new Set(tops)).sort((a, b) => a - b)
      if (rowTops.length <= maxRows) {
        setMaxHeight(null)
        setHiddenCount(0)
        return
      }
      const cutoffTop = rowTops[maxRows]
      const visibleCount = tops.filter((t) => t < cutoffTop).length
      const lastVisible = items[visibleCount - 1]
      setMaxHeight(Math.round(lastVisible.getBoundingClientRect().bottom - el.getBoundingClientRect().top))
      setHiddenCount(items.length - visibleCount)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children, maxRows])

  return (
    <div>
      <div
        ref={containerRef}
        className="flex flex-wrap gap-1.5"
        style={!expanded && maxHeight != null ? { maxHeight, overflow: 'hidden' } : undefined}
      >
        {children}
      </div>
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(true) }}
          className="mt-1 text-xs font-medium text-primary hover:underline cursor-pointer"
        >
          +{hiddenCount} more
        </button>
      )}
    </div>
  )
}

type Props = {
  item: DirectoryResource
  category: CategoryConfig
  /** Omit any of these to render that content read-only (no onClick) — the
   *  map's place-detail popup has no filters/search of its own, so it passes
   *  none of them; the category directory's card passes all four. */
  onTagClick?: (tag: string) => void
  onFilterOpen?: () => void
  onFilterBool?: (key: string) => void
  onFilterSelect?: (key: string, value: string) => void
  /** Skip the "Open"/"Closes Soon" chip — the caller already shows it
   *  somewhere the visitor can always see (e.g. the card's collapsed
   *  header), so repeating it here would just be noise. */
  hideOpenStatus?: boolean
  /** Signal-badge field keys to skip in the status row for the same reason —
   *  they're the ones already showing in the caller's own header. */
  hiddenBadgeKeys?: string[]
}

/**
 * The full place-detail content — status/signal badges, quick actions
 * (Directions/Call/Website), address/phone/hours/davening, tags, other detail
 * fields, and caveat notes. Shared by the map's place-detail popup
 * (`MapPlaceDetail`) and the category directory's expanded listing card
 * (`GenericListingCard`) so a place looks and behaves identically no matter
 * where it's opened from. Callers add their own header and any
 * caller-specific extras (e.g. the card's Edit/Report footer) around this.
 */
export default function PlaceDetailBody({ item, category, onTagClick, onFilterOpen, onFilterBool, onFilterSelect, hideOpenStatus, hiddenBadgeKeys = [] }: Props) {
  // null outside a LocationProvider (the admin's category preview) — see
  // useOptionalLocation's own doc comment.
  const location = useOptionalLocation()
  const directionsOrigin = location?.directionsOrigin ?? null
  const fields = category.detailFields
  const tagFields = fields.filter((f) => f.type === 'tags')
  // A url field already shown up top on the collapsed card (showInHeader —
  // see GenericListingCard) doesn't also get an expanded action button here;
  // one link, one place, not both.
  const urlFields = fields.filter((f) => f.type === 'url' && !f.showInHeader)
  const hoursFields = fields.filter((f) => f.type === 'hours')
  const minyanimField = fields.find((f) => f.type === 'minyanim')
  // 'image' (the per-listing Photo field — see PHOTO_FIELD_KEY) is excluded
  // for the same reason as the others: it isn't consumed generically here at
  // all, only by the icon/avatar renderers (CategoryIcon's callers).
  const special = (f: CategoryField) =>
    f.type === 'tags' || f.type === 'url' || f.type === 'hours' || f.type === 'minyanim' || f.type === 'image'
  const badgeFields = fields.filter((f) => !special(f) && placement(f) === 'badge')
  // A text/textarea field marked showInHeader normally still gets its row
  // here too — the header only shows a truncated one-line preview (see
  // GenericListingCard's headerTextFields), so excluding it here would make
  // a long note genuinely unreachable: expanding the card is supposed to
  // reveal MORE, and it wouldn't. The one exception is headerMaxLength: a
  // `type: 'text'` field with a character limit is guaranteed to already fit
  // the header in full (the submission form enforces it — see ListingForm),
  // so there's no fuller version to reveal, and repeating it here would just
  // be the same short line twice.
  const rowFields = fields.filter((f) => !special(f) && placement(f) === 'row' && !(f.showInHeader && f.headerMaxLength != null))

  const minyanimValue = minyanimField ? item[minyanimField.key] : undefined
  const legacyDavening = item.davening as string | undefined
  const showDavening = hasDaveningTimes(minyanimValue, legacyDavening)

  const { isOpen, closing } = getOpenStatus(item, hoursFields.map((f) => f.key))
  const anyHoursVal = hoursFields.some((f) => item[f.key] !== undefined)

  // Every tags field's chosen values, primary and expanded-only alike — they
  // all render together here, in the one place tags show once a listing is
  // open. (Only the *filterable* signal badges below get a second, quieter
  // appearance in the card's collapsed header — tags never do.)
  const tags = tagFields.flatMap((f) => asTags(item[f.key]))
  const tagsSometimes = tagFields.flatMap((f) => asTags(item[f.key + '_sometimes']))

  const signalBadges = badgeFields.filter((f) =>
    f.type === 'boolean' ? !!item[f.key] : f.type === 'select' ? selectValues(item[f.key]).length > 0 : false,
  )
  const detailBadges = badgeFields.filter((f) => !signalBadges.includes(f))
  // The subset of signal badges actually shown in this status row — excludes
  // whichever ones the caller says it already shows elsewhere (see
  // `hiddenBadgeKeys`), so a filterable badge doesn't appear twice.
  const visibleSignalBadges = signalBadges.filter((f) => !hiddenBadgeKeys.includes(f.key))

  const caveatNote = (f: CategoryField): string | null => {
    if (!f.caveat || !item[f.caveat.flagField]) return null
    return String(item[f.caveat.noteField] ?? '').trim()
  }

  const showAddress = category.hasAddress !== false && !!item.address
  const showPhone = category.hasPhone !== false && !!item.phone
  // Facts about the LISTING itself (from its Google placeId), not about any
  // one hours field — a category with no hours field at all (Synagogues,
  // some Schools) still gets its address/phone/status refreshed by the sync
  // job (see sync-hours/route.ts), so these show regardless of whether
  // hoursFields is empty. Used to live inside HoursDisplay, which meant they
  // never appeared for exactly the listings without hours to show.
  const closedBadge =
    item.businessStatus === 'CLOSED_PERMANENTLY'
      ? { text: 'Permanently closed', cls: 'bg-red-50 text-red-700 border-red-200' }
      : item.businessStatus === 'CLOSED_TEMPORARILY'
        ? { text: 'Temporarily closed', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
        : null
  const syncedNote = syncedLabel(item.googleSyncedAt)
  const urlButtons = urlFields
    .map((f) => ({ f, href: display(item[f.key]) }))
    .filter((x): x is { f: CategoryField; href: string } => !!x.href)
  const showOpenChip = isOpen && !hideOpenStatus
  const visibleRowFields = rowFields.filter((f) => display(item[f.key]))
  const caveatNotes = signalBadges
    .map((f) => ({ f, note: caveatNote(f) }))
    .filter((x): x is { f: CategoryField; note: string } => x.note !== null)

  // ── Status + signal badges ─────────────────────────────────────────────
  const statusSection = (showOpenChip || visibleSignalBadges.length > 0) && (
    <div className="flex flex-wrap gap-1.5">
      {showOpenChip && (closing?.closesSoon ? (
        <span className="relative group/tip">
          <Chip tone="greenSolid" onClick={onFilterOpen && ((e) => { e.stopPropagation(); onFilterOpen() })}>
            Closes Soon
          </Chip>
          <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-max max-w-[220px] whitespace-normal rounded bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 hidden sm:block z-10">
            Closes at {closing.closeLabel}
          </span>
        </span>
      ) : (
        <Chip
          tone="green"
          onClick={onFilterOpen && ((e) => { e.stopPropagation(); onFilterOpen() })}
          title={onFilterOpen ? 'Filter to places open now' : undefined}
        >
          Open
        </Chip>
      ))}
      {visibleSignalBadges.flatMap((f) => {
        const values = f.type === 'select' ? selectValues(item[f.key]) : [f.filterLabel ?? f.label]
        // Resolve to the option's CURRENT label — see the matching comment in
        // GenericListingCard.tsx for why this can't just display the raw
        // stored value.
        const labelFor = (v: string) => f.options?.find((opt) => opt.value === v)?.label ?? v
        const note = caveatNote(f)
        const amber = note !== null
        return values.map((value) => {
          const text = labelFor(value)
          const onClick =
            f.filterable && f.type === 'boolean' && onFilterBool
              ? (e: MouseEvent) => { e.stopPropagation(); onFilterBool(f.key) }
              : f.filterable && f.type === 'select' && onFilterSelect
              ? (e: MouseEvent) => { e.stopPropagation(); onFilterSelect(f.key, value) }
              : onTagClick
              ? (e: MouseEvent) => { e.stopPropagation(); onTagClick(value) }
              : undefined
          const btn = (
            <Chip tone={amber ? 'amber' : 'slate'} onClick={onClick} title={amber ? undefined : (onClick ? `Filter by ${text}` : undefined)}>
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
  )

  // ── Quick actions: Directions / Call / every url field ─────────────────
  const actionsSection = (showAddress || showPhone || urlButtons.length > 0) && (
    <div className="flex flex-wrap gap-x-6 gap-y-4">
      {showAddress && (
        <ActionButton
          href={directionsUrl(
            destinationQuery(item.name, item.address, { alwaysIncludeName: !!item.verifiedPlaceId }),
            { origin: directionsOrigin, placeId: (item.placeId ?? item.verifiedPlaceId) as string | undefined },
          )}
          icon={<DirectionsIcon className="h-5 w-5" />}
          label="Directions"
        />
      )}
      {showPhone && (
        <ActionButton
          href={`tel:${item.phone!.replace(/\D/g, '')}`}
          icon={<PhoneIcon className="h-5 w-5" />}
          label="Call"
        />
      )}
      {urlButtons.map(({ f, href }) => (
        <ActionButton
          key={f.key}
          href={href}
          icon={
            f.label.trim().toLowerCase() === 'website' ? (
              <GlobeIcon className="h-5 w-5" />
            ) : (
              <ExternalIcon className="h-5 w-5" />
            )
          }
          label={f.linkLabel ?? f.label}
        />
      ))}
    </div>
  )

  // ── Address / phone ──────────────────────────────────────────────────────
  const addressSection = (showAddress || showPhone || hoursFields.length > 0 || closedBadge || syncedNote) && (
    <div className="space-y-3">
      {closedBadge && (
        <span className={`inline-block text-xs font-medium border rounded-full px-2 py-0.5 ${closedBadge.cls}`}>
          {closedBadge.text}
        </span>
      )}

      {showAddress && (
        // min-w-0 but deliberately NOT flex-1: the address sizes to its own
        // text, so the button sits immediately after it and reads as being
        // about the address. flex-1 made the address fill the row, which on a
        // wide desktop card pushed the button to the far right edge — far
        // enough away that it looked like an unrelated control.
        //
        // Mobile is unchanged by that: there the address wants more room than
        // the row has, so it shrinks (min-w-0 is what permits it) and wraps to
        // two lines with the button riding the top of them, rather than
        // truncating or being pushed onto a line of its own.
        <div className="flex items-start gap-3">
          <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="min-w-0 text-sm text-slate-800">{item.address}</p>
          <SetLocationButton item={item} category={category} />
        </div>
      )}

      {showPhone && (
        <div className="flex items-center gap-3">
          <PhoneIcon className="h-4 w-4 shrink-0 text-slate-400" />
          <a href={`tel:${item.phone!.replace(/\D/g, '')}`} onClick={(e) => e.stopPropagation()} className="text-sm text-primary hover:underline">
            {item.phone}
          </a>
          {item.placeId && !anyHoursVal && (
            <span className="text-[10px] font-medium text-slate-400 border border-slate-200 rounded px-1 py-0.5 leading-none">
              via Google
            </span>
          )}
        </div>
      )}

      {hoursFields.map((f) => {
        const val = item[f.key]
        if (val === undefined) return null
        return (
          <div key={f.key} className="flex items-start gap-3">
            <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              {hoursFields.length > 1 && <p className="text-xs text-muted mb-0.5">{f.label}</p>}
              <HoursDisplay value={val} />
            </div>
          </div>
        )
      })}

      {syncedNote && <p className="text-[11px] text-muted">{syncedNote}</p>}
    </div>
  )

  // ── Davening ──────────────────────────────────────────────────────────────
  // Its own section (not folded into addressSection above) so the divider
  // logic below only draws a line between address/phone/hours and davening
  // when both actually have content — never a line before an empty side.
  const daveningSection = showDavening && (
    <div>
      <p className="text-xs text-muted mb-1">Davening Times</p>
      <DaveningTimes minyanim={minyanimValue} legacyText={legacyDavening} geo={item.geo} />
    </div>
  )

  // ── Tags ──────────────────────────────────────────────────────────────
  const tagsSection = (tags.length > 0 || tagsSometimes.length > 0) && (
    <div className="space-y-2">
      <ClampedChipRow>
        {[
          ...tags.map((t) => (
            <Chip key={t} tone="slate" size="expanded" onClick={onTagClick && ((e) => { e.stopPropagation(); onTagClick(t) })} title={onTagClick ? `Find places with ${t}` : undefined}>
              {t}
            </Chip>
          )),
          ...tagsSometimes.map((t) => (
            <span key={`sometimes:${t}`} className="relative group/tip">
              <Chip tone="amber" size="expanded" onClick={onTagClick && ((e) => { e.stopPropagation(); onTagClick(t) })}>
                ~{t}
              </Chip>
              <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[11px] leading-none text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 hidden sm:block z-10">
                not always in stock
              </span>
            </span>
          )),
        ]}
      </ClampedChipRow>
      {tagsSometimes.length > 0 && (
        <p className="text-[11px] text-amber-700 sm:hidden">~not always in stock — call ahead</p>
      )}
    </div>
  )

  // ── Other detail fields ─────────────────────────────────────────────────
  const detailBadgesSection = detailBadges.some((f) => (f.type === 'boolean' ? item[f.key] : display(item[f.key]))) && (
    <div className="flex flex-wrap gap-1.5">
      {detailBadges.map((f) => {
        const v = item[f.key]
        if (f.type === 'boolean' ? !v : !display(v)) return null
        // Select values resolve to their option's CURRENT label — see the
        // matching comment in GenericListingCard.tsx.
        const shown =
          f.type === 'select'
            ? selectValues(v)
                .map((val) => f.options?.find((opt) => opt.value === val)?.label ?? val)
                .join(', ')
            : display(v)
        const text = f.type === 'boolean' ? f.label : `${f.label}: ${shown}`
        return <Chip key={f.key} tone="slate" size="expanded">{text}</Chip>
      })}
    </div>
  )

  const rowFieldsSection = visibleRowFields.length > 0 && (
    <div className="space-y-1">
      {visibleRowFields.map((f) => (
        <p key={f.key} className="text-sm text-slate-700">
          {!f.hideLabel && <span className="text-muted">{f.label}: </span>}
          {f.type === 'tel' ? (
            // Same treatment as the main Phone field — a tappable tel: link,
            // reformatted defensively in case the stored value predates
            // formatPhone being applied to fields other than the built-in one.
            <a
              href={`tel:${display(item[f.key]).replace(/\D/g, '')}`}
              onClick={(e) => e.stopPropagation()}
              className="text-primary hover:underline"
            >
              {formatPhone(display(item[f.key]))}
            </a>
          ) : (
            display(item[f.key])
          )}
        </p>
      ))}
    </div>
  )

  // Not-fully-kosher caveat notes — placed under the menu/details so they
  // read in context; the amber cert badge above is the at-a-glance flag.
  const caveatSection = caveatNotes.length > 0 && (
    <div className="space-y-1">
      {caveatNotes.map(({ f, note }) => (
        <p key={`caveat:${f.key}`} className="text-[12px] leading-snug text-amber-700">
          {note || 'Not everything here is kosher — please verify.'}
        </p>
      ))}
    </div>
  )

  // Rendered with a divider between any two consecutive sections that both
  // have content — never before the first or after the last — so a section
  // only ever gets a separating line when there's actually something on
  // both sides of it to separate.
  const sections = [statusSection, actionsSection, addressSection, daveningSection, detailBadgesSection, rowFieldsSection, tagsSection, caveatSection]
    .filter((s): s is Exclude<typeof s, false> => s !== false)

  return (
    <div className="space-y-4">
      {sections.map((section, i) => (
        <Fragment key={i}>
          {i > 0 && <hr className="border-slate-200" />}
          {section}
        </Fragment>
      ))}
    </div>
  )
}
