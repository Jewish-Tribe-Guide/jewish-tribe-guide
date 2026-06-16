'use client'

import { useEffect, useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { isStructuredHours, hoursOpenNow } from '@/lib/hours'
import HoursDisplay from './HoursDisplay'
import UpvoteButton from './UpvoteButton'
import AddressPrompt from './AddressPrompt'
import UpButton from '@/components/UpButton'
import { PencilIcon, FlagIcon, PlusIcon } from '@/components/icons'
import { useIsMobile } from '@/lib/useIsMobile'

type Props = {
  category: CategoryConfig
  items: DirectoryResource[]
  /** Shown under the category title — hospital name for patients, typed address
   *  for community. Mirrors the subtitle pattern in About Your Hospital. */
  anchorLabel?: string
  /** When true and no anchorLabel, prompt the visitor to set their location. */
  addressPrompt?: boolean
  /** A listing to mount already expanded (restored after returning from a form). */
  reopenItemId?: string | null
  /** Seed the search box (e.g. "cheese" from a landing "Places" result). */
  initialSearch?: string
  onUp: () => void
  onAdd: () => void
  onEdit: (item: DirectoryResource) => void
  onReport: (item: DirectoryResource) => void
}

// ── Generic card helpers ───────────────────────────────────────────────────────

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

function travelLabel(item: DirectoryResource): string | null {
  if (item.milesFromAddress != null) return `📍 ${item.milesFromAddress} mi`
  const parts: string[] = []
  if (item.driveMinutes != null) parts.push(`🚗 ${item.driveMinutes} min`)
  if (item.walkMinutes != null) parts.push(`🚶 ${item.walkMinutes} min`)
  return parts.length > 0 ? parts.join(' · ') : null
}

function travelCompare(a: DirectoryResource, b: DirectoryResource): number {
  if (a.milesFromAddress != null || b.milesFromAddress != null) {
    return (a.milesFromAddress ?? Infinity) - (b.milesFromAddress ?? Infinity)
  }
  const drive = (a.driveMinutes ?? Infinity) - (b.driveMinutes ?? Infinity)
  if (drive !== 0) return drive
  return (a.walkMinutes ?? Infinity) - (b.walkMinutes ?? Infinity)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GenericDirectory({ category, items, anchorLabel, addressPrompt, reopenItemId, initialSearch, onUp, onAdd, onEdit, onReport }: Props) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [boolFilters, setBoolFilters] = useState<Record<string, boolean>>({})
  // Multi-select: each key maps to the set of chosen values (empty = no filter).
  const [selectFilters, setSelectFilters] = useState<Record<string, string[]>>({})
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [openNow, setOpenNow] = useState(false)
  const [sortByPopular, setSortByPopular] = useState(false)
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})
  const isMobile = useIsMobile()

  const fields = category.detailFields
  const tagFields = fields.filter((f) => f.type === 'tags')
  const urlFields = fields.filter((f) => f.type === 'url')
  const hoursFields = fields.filter((f) => f.type === 'hours')
  const hasFilterableHours = hoursFields.some((f) => f.filterable)
  const special = (f: CategoryField) => f.type === 'tags' || f.type === 'url' || f.type === 'hours'
  const badgeFields = fields.filter((f) => !special(f) && placement(f) === 'badge')
  const rowFields = fields.filter((f) => !special(f) && placement(f) === 'row')
  const filterableBooleans = fields.filter((f) => f.filterable && f.type === 'boolean')
  const filterableSelects = fields.filter((f) => f.filterable && f.type === 'select')

  const upvotes = !!category.upvotesEnabled
  const liveCount = (item: DirectoryResource) => voteCounts[item.id] ?? item.upvotes ?? 0

  const q = search.trim().toLowerCase()
  const tokens = q.split(/\s+/).filter(Boolean)
  // Every word must appear in the name or a tag (AND across words) — mirrors the
  // landing search, so a place tapped there ("kosher cheese") survives this filter.
  const matchesSearch = (item: DirectoryResource) => {
    if (tokens.length === 0) return true
    const hay = [
      item.name,
      ...tagFields.flatMap((f) => asTags(item[f.key])),
    ].join(' ').toLowerCase()
    return tokens.every((t) => hay.includes(t))
  }

  const filtered = items
    .filter((item) => {
      if (!matchesSearch(item)) return false
      for (const f of filterableBooleans) {
        if (boolFilters[f.key] && !item[f.key]) return false
      }
      for (const f of filterableSelects) {
        const chosen = selectFilters[f.key]
        if (chosen?.length && !chosen.includes(item[f.key] as string)) return false
      }
      if (openNow && hasFilterableHours) {
        // Item must be open right now according to at least one filterable hours field.
        const isOpen = hoursFields
          .filter((f) => f.filterable)
          .some((f) => hoursOpenNow(item[f.key]) === true)
        if (!isOpen) return false
      }
      return true
    })
    .sort((a, b) =>
      upvotes && sortByPopular
        ? liveCount(b) - liveCount(a) || travelCompare(a, b)
        : travelCompare(a, b),
    )

  const searchPlaceholder =
    tagFields.length > 0
      ? isMobile
        ? `Search ${category.pluralLabel.toLowerCase()} or items…`
        : `Search ${category.pluralLabel.toLowerCase()} or kosher items (e.g. cheese)…`
      : 'Search…'

  // The toolbar row (filters + sort) only renders when there's something in it;
  // a select needs ≥2 distinct values before it's worth showing.
  const hasRenderedSelects = filterableSelects.some(
    (f) => new Set(items.map((item) => item[f.key] as string).filter(Boolean)).size >= 2,
  )
  const hasFilterRow =
    filterableBooleans.length > 0 || hasRenderedSelects || hasFilterableHours || !!upvotes

  const hasActiveFilters =
    search.trim() !== '' ||
    Object.values(boolFilters).some(Boolean) ||
    Object.values(selectFilters).some((v) => v.length > 0) ||
    openNow
  const clearAll = () => {
    setSearch('')
    setBoolFilters({})
    setSelectFilters({})
    setOpenNow(false)
  }

  return (
    <div>
      <UpButton label="All resources" onClick={onUp} />

      <div className="flex items-end justify-between gap-2 mb-2">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">{category.pluralLabel}</h2>
          {anchorLabel ? (
            <p className="text-sm text-muted mt-0.5">{anchorLabel}</p>
          ) : addressPrompt ? (
            <AddressPrompt />
          ) : null}
        </div>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary border border-primary rounded-md px-3 py-1.5 hover:bg-primary hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <PlusIcon className="h-4 w-4" /> Add
        </button>
      </div>

      {/* Controls */}
      <div className="mb-4 space-y-2">
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {q && tagFields.length > 0 && (
          <p className="text-xs text-muted">
            Showing places matching &ldquo;{search.trim()}&rdquo; &middot;{' '}
            <button onClick={() => setSearch('')} className="text-primary hover:underline cursor-pointer">
              clear
            </button>
          </p>
        )}
        {hasFilterRow && (
        <div className="flex flex-wrap items-center gap-2">
        {filterableBooleans.map((f) => {
          const active = !!boolFilters[f.key]
          return (
            <button
              key={f.key}
              onClick={() => setBoolFilters((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
              className={[
                'px-3 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap',
                active ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50',
              ].join(' ')}
            >
              {f.filterLabel ?? f.label}
            </button>
          )
        })}
        {filterableSelects.map((f) => {
          const presentValues = Array.from(new Set(items.map((item) => item[f.key] as string).filter(Boolean))).sort()
          if (presentValues.length < 2) return null
          const chosen = selectFilters[f.key] ?? []
          const toggle = (v: string) =>
            setSelectFilters((prev) => {
              const cur = prev[f.key] ?? []
              return { ...prev, [f.key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }
            })
          if (f.multiSelect) {
            const isOpen = openDropdown === f.key
            const label = chosen.length === 0
              ? `All ${f.filterLabel ?? f.label}s`
              : chosen.length === 1
              ? chosen[0]
              : `${chosen.length} selected`
            return (
              <CheckboxDropdown
                key={f.key}
                label={label}
                active={chosen.length > 0}
                isOpen={isOpen}
                onToggleOpen={() => setOpenDropdown(isOpen ? null : f.key)}
                onClose={() => setOpenDropdown(null)}
                values={presentValues}
                chosen={chosen}
                onToggle={toggle}
              />
            )
          }
          // Default: single-select dropdown.
          return (
            <select
              key={f.key}
              value={chosen[0] ?? ''}
              onChange={(e) =>
                setSelectFilters((prev) => ({ ...prev, [f.key]: e.target.value ? [e.target.value] : [] }))
              }
              className="rounded-md border border-slate-300 px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
            >
              <option value="">All {f.filterLabel ?? f.label}s</option>
              {presentValues.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          )
        })}
        {/* Open Now toggle — only shown for categories that have a filterable hours field */}
        {hasFilterableHours && (
          <button
            onClick={() => setOpenNow((v) => !v)}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap',
              openNow
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50',
            ].join(' ')}
          >
            <span className={['inline-block h-2 w-2 rounded-full', openNow ? 'bg-white' : 'bg-green-500'].join(' ')} aria-hidden="true" />
            Open now
          </button>
        )}
        {upvotes && (
          // Sort control — not a filter, so push it to the right end of the row.
          <div className="ml-auto flex rounded-md border border-slate-300 overflow-hidden shrink-0">
            {[
              { v: false, label: 'Closest' },
              { v: true, label: '▲ Popular' },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => setSortByPopular(opt.v)}
                className={[
                  'px-3 py-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                  sortByPopular === opt.v ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted">
            {hasActiveFilters
              ? `No ${category.pluralLabel.toLowerCase()} match your search.`
              : `No ${category.pluralLabel.toLowerCase()} listed yet.`}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={clearAll}
                className="text-sm font-medium text-slate-600 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Clear search &amp; filters
              </button>
            )}
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary border border-primary rounded-md px-3 py-1.5 hover:bg-primary hover:text-white transition-colors cursor-pointer"
            >
              <PlusIcon className="h-4 w-4" /> Add {category.label.toLowerCase()}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <GenericListingCard
              key={item.id}
              item={item}
              category={category}
              upvotes={upvotes}
              count={liveCount(item)}
              defaultExpanded={item.id === reopenItemId}
              onVote={(c) => setVoteCounts((prev) => ({ ...prev, [item.id]: c }))}
              onTagClick={setSearch}
              onFilterOpen={() => setOpenNow((v) => !v)}
              onFilterBool={(key) => setBoolFilters((prev) => ({ ...prev, [key]: !prev[key] }))}
              onFilterSelect={(key, value, multi) =>
                setSelectFilters((prev) => {
                  const cur = prev[key] ?? []
                  // Single-select: toggle between [value] and cleared. Multi-select:
                  // add/remove this value from the set. Clicking the badge again undoes it.
                  if (!multi) return { ...prev, [key]: cur.includes(value) ? [] : [value] }
                  return { ...prev, [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] }
                })
              }
              onEdit={() => onEdit(item)}
              onReport={() => onReport(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Checkbox dropdown filter ───────────────────────────────────────────────────

function CheckboxDropdown({
  label, active, isOpen, onToggleOpen, onClose, values, chosen, onToggle,
}: {
  label: string
  active: boolean
  isOpen: boolean
  onToggleOpen: () => void
  onClose: () => void
  values: string[]
  chosen: string[]
  onToggle: (v: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggleOpen}
        className={[
          'flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm cursor-pointer whitespace-nowrap transition-colors',
          active
            ? 'border-primary bg-primary/5 text-primary font-medium'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        ].join(' ')}
      >
        {label}
        <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-20 min-w-[160px] rounded-md border border-slate-200 bg-white shadow-lg py-1">
          {values.map((v) => (
            <label key={v} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={chosen.includes(v)}
                onChange={() => onToggle(v)}
                className="accent-primary h-3.5 w-3.5 cursor-pointer"
              />
              {v}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Collapsible listing card ────────────────────────────────────────────────────
// Mirrors the synagogue card: collapsed shows only what people decide by (name,
// the key yes/no badges, "Open", distance); the rest waits behind a tap.
function GenericListingCard({
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
  const travel = travelLabel(item)
  const tags = tagFields.flatMap((f) => asTags(item[f.key]))

  // Collapsed signals: boolean true-badges + select badges (e.g. kosher cert).
  // Unset booleans and unset selects go in the detail panel.
  const signalBadges = badgeFields.filter((f) =>
    f.type === 'boolean' ? !!item[f.key] : f.type === 'select' ? !!item[f.key] : false,
  )
  const detailBadges = badgeFields.filter((f) => !signalBadges.includes(f))

  // A quiet second line under the name — mirrors the synagogue card's denomination
  // subtitle. The address gives "where is this" context without expanding; items
  // with no address (e.g. community groups) fall back to a short Google blurb.
  const subtitle = item.address
    ? shortAddress(item.address)
    : (item.googleDescription as string | undefined) || null

  return (
    <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((p) => !p)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((p) => !p) } }}
        className="w-full flex items-center justify-between gap-3 px-4 py-4 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
      >
        {/* Name + the badges/tags people scan by (tags are clickable searches). */}
        <div className="min-w-0 flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:gap-y-1">
          <span className="font-semibold text-slate-900">{item.name}</span>
          {isOpen && (
            <button
              onClick={(e) => { e.stopPropagation(); onFilterOpen() }}
              title="Filter to places open now"
              className="text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-1 sm:py-0.5 hover:bg-green-100 active:bg-green-200 transition-colors cursor-pointer"
            >
              Open
            </button>
          )}
          {signalBadges.map((f) => {
            const text = f.type === 'select' ? String(item[f.key]) : (f.filterLabel ?? f.label)
            return (
              <button
                key={f.key}
                // A badge "has a designated filter" when its field is filterable; then
                // clicking it drives that control. Otherwise it falls back to search.
                onClick={(e) => {
                  e.stopPropagation()
                  if (f.filterable && f.type === 'boolean') onFilterBool(f.key)
                  else if (f.filterable && f.type === 'select') onFilterSelect(f.key, String(item[f.key]), !!f.multiSelect)
                  else onTagClick(text)
                }}
                title={`Filter by ${text}`}
                className="text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-2 py-1 sm:py-0.5 hover:bg-slate-200 active:bg-slate-300 transition-colors cursor-pointer"
              >
                {text}
              </button>
            )
          })}
          {tags.map((t) => (
            <button
              key={t}
              onClick={(e) => { e.stopPropagation(); onTagClick(t) }}
              title={`Find places with ${t}`}
              className="text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-2 py-1 sm:py-0.5 hover:bg-slate-200 active:bg-slate-300 transition-colors cursor-pointer"
            >
              {t}
            </button>
          ))}
          </div>
          {subtitle && (
            <p className="text-sm text-muted truncate">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {upvotes && <UpvoteButton variant="inline" resourceId={item.id} count={count} onCountChange={onVote} />}
          {travel && <span className="text-xs font-medium text-slate-600 whitespace-nowrap">{travel}</span>}
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
        <div className="border-t border-slate-100 px-4 py-4 space-y-3 bg-slate-50">
          {detailBadges.some((f) => (f.type === 'boolean' ? item[f.key] : display(item[f.key]))) && (
            <div className="flex flex-wrap gap-1.5">
              {detailBadges.map((f) => {
                const v = item[f.key]
                if (f.type === 'boolean' ? !v : !display(v)) return null
                const text = f.type === 'boolean' ? f.label : `${f.label}: ${display(v)}`
                return (
                  <span key={f.key} className="text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-2 py-0.5">{text}</span>
                )
              })}
            </div>
          )}

          {item.address && (
            <div>
              <p className="text-sm text-slate-800">{item.address}</p>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(item.address)}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-block mt-1 text-xs font-medium text-primary hover:underline"
              >
                Get directions →
              </a>
            </div>
          )}

          {item.phone && (
            <a href={`tel:${item.phone.replace(/\D/g, '')}`} className="block text-sm text-primary hover:underline">
              {item.phone}
            </a>
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

          <div className="flex gap-3 pt-2 border-t border-slate-200">
            <button onClick={onEdit} className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors cursor-pointer"><PencilIcon className="h-3.5 w-3.5" /> Edit</button>
            <button onClick={onReport} className="inline-flex items-center gap-1 text-xs text-muted hover:text-red-600 transition-colors cursor-pointer"><FlagIcon className="h-3.5 w-3.5" /> Report</button>
          </div>
        </div>
      )}
    </div>
  )
}
