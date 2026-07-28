'use client'

import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { selectValues, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { getOpenStatus } from '@/lib/hours'
import HoursDisplay from './HoursDisplay'
import DaveningTimes, { hasDaveningTimes } from './DaveningTimes'
import Chip from './Chip'
import { businessUrl } from '@/lib/googleMapsLinks'
import { PinIcon, PhoneIcon, ClockIcon, DirectionsIcon, ExternalIcon } from '@/components/icons'

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
      onClick={(e) => e.stopPropagation()}
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
export default function PlaceDetailBody({ item, category, onTagClick, onFilterOpen, onFilterBool, onFilterSelect }: Props) {
  const fields = category.detailFields
  const tagFields = fields.filter((f) => f.type === 'tags')
  const urlFields = fields.filter((f) => f.type === 'url')
  const hoursFields = fields.filter((f) => f.type === 'hours')
  const minyanimField = fields.find((f) => f.type === 'minyanim')
  const special = (f: CategoryField) => f.type === 'tags' || f.type === 'url' || f.type === 'hours' || f.type === 'minyanim'
  const badgeFields = fields.filter((f) => !special(f) && placement(f) === 'badge')
  const rowFields = fields.filter((f) => !special(f) && placement(f) === 'row')

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

  const caveatNote = (f: CategoryField): string | null => {
    if (!f.caveat || !item[f.caveat.flagField]) return null
    return String(item[f.caveat.noteField] ?? '').trim()
  }

  const showAddress = category.hasAddress !== false && !!item.address
  const showPhone = category.hasPhone !== false && !!item.phone
  const website = urlFields.map((f) => display(item[f.key])).find(Boolean)

  return (
    <div className="space-y-4">
      {/* ── Status + signal badges ───────────────────────────────────────── */}
      {(isOpen || signalBadges.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {isOpen && (closing?.closesSoon ? (
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
          {signalBadges.flatMap((f) => {
            const texts = f.type === 'select' ? selectValues(item[f.key]) : [f.filterLabel ?? f.label]
            const note = caveatNote(f)
            const amber = note !== null
            return texts.map((text) => {
              const onClick =
                f.filterable && f.type === 'boolean' && onFilterBool
                  ? (e: MouseEvent) => { e.stopPropagation(); onFilterBool(f.key) }
                  : f.filterable && f.type === 'select' && onFilterSelect
                  ? (e: MouseEvent) => { e.stopPropagation(); onFilterSelect(f.key, text) }
                  : onTagClick
                  ? (e: MouseEvent) => { e.stopPropagation(); onTagClick(text) }
                  : undefined
              const btn = (
                <Chip tone={amber ? 'amber' : 'slate'} onClick={onClick} title={amber ? undefined : (onClick ? `Filter by ${text}` : undefined)}>
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

      {/* ── Quick actions: Directions / Call / Website ───────────────────── */}
      {(showAddress || showPhone || website) && (
        <div className="flex gap-6 border-y border-slate-100 py-3">
          {showAddress && (
            <ActionButton
              href={businessUrl(item.name, item.address!, item.placeId as string | undefined)}
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
          {website && (
            <ActionButton href={website} icon={<ExternalIcon className="h-5 w-5" />} label="Website" />
          )}
        </div>
      )}

      {/* ── Address / phone / davening / hours ───────────────────────────── */}
      <div className="space-y-3">
        {showAddress && (
          <div className="flex items-start gap-3">
            <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-sm text-slate-800">{item.address}</p>
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

        {showDavening && (
          <div>
            <p className="text-xs text-muted mb-1">Davening Times</p>
            <DaveningTimes minyanim={minyanimValue} legacyText={legacyDavening} />
          </div>
        )}

        {hoursFields.map((f, i) => {
          const val = item[f.key]
          if (val === undefined && !(i === 0 && item.businessStatus)) return null
          return (
            <div key={f.key} className="flex items-start gap-3">
              <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                {hoursFields.length > 1 && <p className="text-xs text-muted mb-0.5">{f.label}</p>}
                <HoursDisplay
                  value={val}
                  businessStatus={i === 0 ? item.businessStatus : undefined}
                  syncedAt={i === 0 ? item.googleSyncedAt : undefined}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Tags ──────────────────────────────────────────────────────────── */}
      {(tags.length > 0 || tagsSometimes.length > 0) && (
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
            <p className="text-[11px] text-amber-700 sm:hidden">~ = not always in stock — call ahead</p>
          )}
          <hr className="border-slate-200" />
        </div>
      )}

      {/* ── Other detail fields ──────────────────────────────────────────── */}
      {detailBadges.some((f) => (f.type === 'boolean' ? item[f.key] : display(item[f.key]))) && (
        <div className="flex flex-wrap gap-1.5">
          {detailBadges.map((f) => {
            const v = item[f.key]
            if (f.type === 'boolean' ? !v : !display(v)) return null
            const text = f.type === 'boolean' ? f.label : `${f.label}: ${display(v)}`
            return <Chip key={f.key} tone="slate" size="expanded">{text}</Chip>
          })}
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

      {/* Consecutive buttons sit stacked (each own line) by default; a field
          with `inlineButton` on joins the previous button's line instead —
          see CategoryField.inlineButton. */}
      {(() => {
        const groups: CategoryField[][] = []
        for (const f of urlFields) {
          if (f.inlineButton && groups.length > 0) groups[groups.length - 1].push(f)
          else groups.push([f])
        }
        const linkClass = "w-fit text-xs font-medium text-primary border border-primary rounded px-2 py-1 hover:bg-primary hover:text-white transition-colors"
        return groups.map((group) => {
          const links = group
            .map((f) => ({ f, href: display(item[f.key]) }))
            .filter((x): x is { f: CategoryField; href: string } => !!x.href)
          if (links.length === 0) return null
          if (links.length === 1) {
            const { f, href } = links[0]
            return (
              <a key={f.key} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={`block ${linkClass}`}>
                {f.linkLabel ?? f.label}
              </a>
            )
          }
          return (
            <div key={group.map((f) => f.key).join('+')} className="flex flex-wrap gap-2">
              {links.map(({ f, href }) => (
                <a key={f.key} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={linkClass}>
                  {f.linkLabel ?? f.label}
                </a>
              ))}
            </div>
          )
        })
      })()}

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
    </div>
  )
}
