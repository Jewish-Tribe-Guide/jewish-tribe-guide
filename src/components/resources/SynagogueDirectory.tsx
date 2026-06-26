'use client'

import { useEffect, useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'
import SynagogueCard from '@/components/SynagogueCard'
import DaveningTimesModal from '@/components/synagogues/DaveningTimesModal'
import DenominationFilter from '@/components/synagogues/DenominationFilter'
import { isMinyanim } from '@/lib/davening'
import type { Minyan } from '@/lib/davening'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import DirectoryHeader from './DirectoryHeader'
import UpButton from '@/components/UpButton'
import { ClockIcon, PlusIcon } from '@/components/icons'

type Props = {
  items: DirectoryResource[]
  /** Shown under the heading — hospital name (patient) or typed address (community). */
  anchorLabel?: string
  /** When true and no anchorLabel, prompt the visitor to set their location. */
  addressPrompt?: boolean
  /** When set, the card with this id will mount expanded and scroll into view.
   *  Used to restore the card the user had open before navigating to a form. */
  reopenItemId?: string | null
  onUp: () => void
  onAdd: () => void
  onEdit: (item: DirectoryResource) => void
  onReport: (item: DirectoryResource) => void
  /** Navigate to the map screen pre-filtered to synagogues. */
  onViewMap?: () => void
}

// Sort by closest first. Drive time takes priority in hospital mode; address
// mode uses the same field once ResourceLoader populates driveMinutes via /api/travel.
function travelCompare(a: DirectoryResource, b: DirectoryResource): number {
  if (a.milesFromAddress != null || b.milesFromAddress != null) {
    return (a.milesFromAddress ?? Number.POSITIVE_INFINITY) - (b.milesFromAddress ?? Number.POSITIVE_INFINITY)
  }
  const drive = (a.driveMinutes ?? Number.POSITIVE_INFINITY) - (b.driveMinutes ?? Number.POSITIVE_INFINITY)
  if (drive !== 0) return drive
  return (a.walkMinutes ?? Number.POSITIVE_INFINITY) - (b.walkMinutes ?? Number.POSITIVE_INFINITY)
}

// Collapsible-card list for the synagogue category — preserves the original
// rich UI (denomination, davening times, contact, WhatsApp) while routing
// through the standard DB add/edit/report pipeline.
export default function SynagogueDirectory({
  items,
  anchorLabel,
  addressPrompt,
  reopenItemId,
  onUp,
  onAdd,
  onEdit,
  onReport,
  onViewMap,
}: Props) {
  const [search, setSearch] = useState('')
  const [denomination, setDenomination] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  // Scroll the target card into view on mount (runs once, after items are ready).
  const reopenRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (reopenItemId && reopenRef.current) {
      const headerH = (document.querySelector('header')?.getBoundingClientRect().height ?? 64) + 12
      const top = reopenRef.current.getBoundingClientRect().top + window.scrollY - headerH
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — only fire on mount

  // Collect unique denominations from the loaded items for the filter dropdown.
  const denominations = Array.from(
    new Set(items.map((s) => s.denomination as string).filter(Boolean)),
  ).sort()

  // Only show "All davening times" when at least one shul has structured minyanim.
  const hasMinyanim = items.some(
    (item) => isMinyanim(item.minyanim) && (item.minyanim as Minyan[]).length > 0,
  )

  const q = search.trim().toLowerCase()
  const filtered = items
    .filter((item) => {
      if (q && !item.name.toLowerCase().includes(q) && !(item.address ?? '').toLowerCase().includes(q)) {
        return false
      }
      if (denomination && item.denomination !== denomination) return false
      return true
    })
    .sort(travelCompare)

  // Log searches matching no synagogue — by the search text alone, so the
  // denomination filter doesn't register as a content gap.
  useLogSearchMiss({
    query: search,
    hasResults: items.some(
      (item) =>
        item.name.toLowerCase().includes(q) || (item.address ?? '').toLowerCase().includes(q),
    ),
    ready: true,
    source: 'Synagogues',
  })

  return (
    <div>
      <UpButton label="All resources" onClick={onUp} />

      <DirectoryHeader
        title="Synagogues"
        count={items.length}
        anchorLabel={anchorLabel}
        addressPrompt={addressPrompt}
        actions={
          <>
            {onViewMap && (
              <button
                onClick={onViewMap}
                /* Desktop only — on mobile Map moves into the filter row below. */
                className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-slate-600 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                🗺️ Map
              </button>
            )}
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary border border-primary rounded-md px-3 py-1.5 hover:bg-primary hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <PlusIcon className="h-4 w-4" /> Add
            </button>
          </>
        }
      />

      {/* Controls: search + denomination filter */}
      <div className="mb-4 space-y-2">
        <input
          type="text"
          placeholder="Search synagogues…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {(denominations.length > 1 || hasMinyanim || onViewMap) && (
          <div className="relative z-20 flex items-center gap-1.5 sm:gap-2 flex-nowrap sm:flex-wrap pb-1 sm:pb-0">
            {denominations.length > 1 && (
              <DenominationFilter
                value={denomination}
                options={denominations}
                onChange={setDenomination}
              />
            )}
            {/* Map — mobile only here (after denomination); on desktop it lives in the header. */}
            {onViewMap && (
              <button
                onClick={onViewMap}
                className="sm:hidden shrink-0 inline-flex items-center gap-1 text-sm font-medium text-slate-600 border border-slate-300 rounded-md px-2.5 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                🗺️ Map
              </button>
            )}
            {hasMinyanim && (
              // Sits at the right end of the toolbar (mirrors the sort control on
              // other directories) — it's an action, not a filter. Label drops to
              // "Davening" on mobile so Map + denomination + this all fit one line.
              <button
                onClick={() => setModalOpen(true)}
                className="ml-auto shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-md px-2.5 sm:px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <ClockIcon className="h-4 w-4" />
                <span className="sm:hidden">Davening</span>
                <span className="hidden sm:inline">All davening times</span>
              </button>
            )}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted">
            {search.trim() !== '' || denomination !== ''
              ? 'No synagogues match your search.'
              : 'No synagogues listed yet.'}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {(search.trim() !== '' || denomination !== '') && (
              <button
                onClick={() => { setSearch(''); setDenomination('') }}
                className="text-sm font-medium text-slate-600 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Clear search &amp; filters
              </button>
            )}
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary border border-primary rounded-md px-3 py-1.5 hover:bg-primary hover:text-white transition-colors cursor-pointer"
            >
              <PlusIcon className="h-4 w-4" /> Add synagogue
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const isTarget = item.id === reopenItemId
            return (
              <div key={item.id} ref={isTarget ? reopenRef : undefined}>
                <SynagogueCard
                  item={item}
                  defaultExpanded={isTarget}
                  onEdit={() => onEdit(item)}
                  onReport={() => onReport(item)}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* All-davening-times modal */}
      <DaveningTimesModal
        items={items}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialDenomination={denomination}
      />
    </div>
  )
}
