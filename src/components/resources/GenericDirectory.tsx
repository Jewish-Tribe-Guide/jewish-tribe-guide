'use client'

import { useState } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { isStructuredHours, hoursOpenNow } from '@/lib/hours'
import HoursDisplay from './HoursDisplay'
import UpvoteButton from './UpvoteButton'

type Props = {
  category: CategoryConfig
  items: DirectoryResource[]
  /** Shown under the category title — hospital name for patients, typed address
   *  for community. Mirrors the subtitle pattern in About Your Hospital. */
  anchorLabel?: string
  onBack: () => void
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

export default function GenericDirectory({ category, items, anchorLabel, onBack, onAdd, onEdit, onReport }: Props) {
  const [search, setSearch] = useState('')
  const [boolFilters, setBoolFilters] = useState<Record<string, boolean>>({})
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
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">{category.pluralLabel}</h2>
          {anchorLabel && <p className="text-sm text-muted mt-0.5">{anchorLabel}</p>}
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
          {filtered.map((item) => {
            // Compute hours status once per card — drives both the Open badge and
            // the today-hours line. Only show badge when structured hours are present.
            const hoursVal = hoursFields[0] ? item[hoursFields[0].key] : undefined
            const openStatus = hoursVal !== undefined ? hoursOpenNow(hoursVal) : null

            return (
              <div key={item.id} className="bg-white border border-slate-200 rounded-lg shadow-sm px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 text-sm">{item.name}</p>
                      {badgeFields.map((f) => {
                        const v = item[f.key]
                        if (f.type === 'boolean' ? !v : !display(v)) return null
                        const text = f.type === 'boolean' ? f.label : `${f.label}: ${display(v)}`
                        return (
                          <span key={f.key} className="text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-2 py-0.5">
                            {text}
                          </span>
                        )
                      })}
                      {/* Green Open badge — only when the place is currently open */}
                      {openStatus === true && isStructuredHours(hoursVal) && (
                        <span className="text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                          Open
                        </span>
                      )}
                    </div>
                    {item.address && <p className="text-xs text-muted mt-0.5">{item.address}</p>}
                    {item.phone && (
                      <a href={`tel:${item.phone.replace(/\D/g, '')}`} className="text-xs text-primary hover:underline">
                        {item.phone}
                      </a>
                    )}
                    {rowFields.map((f) => {
                      const v = display(item[f.key])
                      if (!v) return null
                      return (
                        <p key={f.key} className="text-xs text-slate-600 mt-1">
                          {!f.hideLabel && <span className="text-muted">{f.label}: </span>}
                          {v}
                        </p>
                      )
                    })}
                    {/* Hours — today's line by default, expandable to the full week.
                        Legacy text strings render as-is. */}
                    {hoursVal !== undefined && <HoursDisplay value={hoursVal} />}
                    {/* Tag badges (clickable → search that item) */}
                    {tagFields.flatMap((f) => asTags(item[f.key])).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {tagFields.flatMap((f) => asTags(item[f.key])).map((t) => (
                          <button
                            key={t}
                            onClick={() => setSearch(t)}
                            title={`Find places with ${t}`}
                            className="text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 hover:bg-green-100 transition-colors cursor-pointer"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {upvotes && (
                      <UpvoteButton
                        resourceId={item.id}
                        count={item.upvotes ?? 0}
                        onCountChange={(c) => setVoteCounts((prev) => ({ ...prev, [item.id]: c }))}
                      />
                    )}
                    {travelLabel(item) && (
                      <span className="text-xs font-medium text-slate-600 whitespace-nowrap">{travelLabel(item)}</span>
                    )}
                    {item.address && (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(item.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-primary border border-primary rounded px-2 py-1 hover:bg-primary hover:text-white transition-colors whitespace-nowrap"
                      >
                        Directions
                      </a>
                    )}
                    {urlFields.map((f) => {
                      const href = display(item[f.key])
                      if (!href) return null
                      return (
                        <a
                          key={f.key}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-primary border border-primary rounded px-2 py-1 hover:bg-primary hover:text-white transition-colors whitespace-nowrap"
                        >
                          {f.linkLabel ?? f.label}
                        </a>
                      )
                    })}
                  </div>
                </div>
                <div className="flex gap-3 mt-2 pt-2 border-t border-slate-100">
                  <button onClick={() => onEdit(item)} className="text-xs text-muted hover:text-primary transition-colors cursor-pointer">
                    ✏️ Edit
                  </button>
                  <button onClick={() => onReport(item)} className="text-xs text-muted hover:text-red-600 transition-colors cursor-pointer">
                    🗑️ Report
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
