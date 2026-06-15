'use client'

import { useState } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { isStructuredHours, hoursOpenNow } from '@/lib/hours'
import HoursDisplay from './HoursDisplay'
import UpvoteButton from './UpvoteButton'
import AddressPrompt from './AddressPrompt'
import UpButton from '@/components/UpButton'

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

export default function GenericDirectory({ category, items, anchorLabel, addressPrompt, reopenItemId, onUp, onAdd, onEdit, onReport }: Props) {
  const [search, setSearch] = useState('')
  const [boolFilters, setBoolFilters] = useState<Record<string, boolean>>({})
  const [selectFilters, setSelectFilters] = useState<Record<string, string>>({})
  const [openNow, setOpenNow] = useState(false)
  const [sortByPopular, setSortByPopular] = useState(false)
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})

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
  const matchesSearch = (item: DirectoryResource) => {
    if (!q) return true
    if (item.name.toLowerCase().includes(q)) return true
    for (const f of tagFields) {
      if (asTags(item[f.key]).some((t) => t.toLowerCase().includes(q))) return true
    }
    return false
  }

  const filtered = items
    .filter((item) => {
      if (!matchesSearch(item)) return false
      for (const f of filterableBooleans) {
        if (boolFilters[f.key] && !item[f.key]) return false
      }
      for (const f of filterableSelects) {
        const chosen = selectFilters[f.key]
        if (chosen && item[f.key] !== chosen) return false
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
      ? `Search ${category.pluralLabel.toLowerCase()} or kosher items (e.g. cheese)…`
      : 'Search…'

  return (
    <div>
      <UpButton label="All resources" onClick={onUp} />

      <div className="flex items-start justify-between gap-2 mb-4">
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
          className="text-sm font-medium text-primary border border-primary rounded-md px-3 py-1.5 hover:bg-primary hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          ➕ Add
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
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
          // Collect only the values that actually appear in the current item set.
          const presentValues = Array.from(new Set(items.map((item) => item[f.key] as string).filter(Boolean))).sort()
          if (presentValues.length < 2) return null
          return (
            <select
              key={f.key}
              value={selectFilters[f.key] ?? ''}
              onChange={(e) => setSelectFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
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
              'px-3 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap',
              openNow
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50',
            ].join(' ')}
          >
            🟢 Open now
          </button>
        )}
        {upvotes && (
          <div className="flex rounded-md border border-slate-300 overflow-hidden shrink-0">
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

      {q && tagFields.length > 0 && (
        <p className="text-xs text-muted mb-2">
          Showing places matching &ldquo;{search.trim()}&rdquo; &middot;{' '}
          <button onClick={() => setSearch('')} className="text-primary hover:underline cursor-pointer">
            clear
          </button>
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="text-muted text-sm">No results found.</p>
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
              onEdit={() => onEdit(item)}
              onReport={() => onReport(item)}
            />
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
  onEdit: () => void
  onReport: () => void
}) {
  const [expanded, setExpanded] = useState(!!defaultExpanded)

  const fields = category.detailFields
  const tagFields = fields.filter((f) => f.type === 'tags')
  const urlFields = fields.filter((f) => f.type === 'url')
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

  return (
    <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((p) => !p)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((p) => !p) } }}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer"
      >
        {/* Name + the badges/tags people scan by (tags are clickable searches). */}
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-slate-900 text-sm">{item.name}</span>
          {isOpen && (
            <span className="text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">Open</span>
          )}
          {signalBadges.map((f) => (
            <span key={f.key} className="text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-2 py-0.5">
              {f.type === 'select' ? String(item[f.key]) : (f.filterLabel ?? f.label)}
            </span>
          ))}
          {tags.map((t) => (
            <button
              key={t}
              onClick={(e) => { e.stopPropagation(); onTagClick(t) }}
              title={`Find places with ${t}`}
              className="text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 hover:bg-green-100 transition-colors cursor-pointer"
            >
              {t}
            </button>
          ))}
          </div>
          {item.googleDescription && (
            <p className="text-xs text-slate-500 leading-snug">{item.googleDescription as string}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {upvotes && <UpvoteButton variant="inline" resourceId={item.id} count={count} onCountChange={onVote} />}
          {travel && <span className="text-xs font-medium text-slate-600 whitespace-nowrap">{travel}</span>}
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
            <button onClick={onEdit} className="text-xs text-muted hover:text-primary transition-colors cursor-pointer">✏️ Edit</button>
            <button onClick={onReport} className="text-xs text-muted hover:text-red-600 transition-colors cursor-pointer">🗑️ Report</button>
          </div>
        </div>
      )}
    </div>
  )
}
