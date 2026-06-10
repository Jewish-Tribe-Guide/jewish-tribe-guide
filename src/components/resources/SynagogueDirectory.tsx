'use client'

import { useEffect, useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'
import SynagogueCard from '@/components/SynagogueCard'
import DaveningTimesModal from '@/components/synagogues/DaveningTimesModal'
import { isMinyanim } from '@/lib/davening'
import type { Minyan } from '@/lib/davening'
import UpButton from '@/components/UpButton'

type Props = {
  items: DirectoryResource[]
  /** Shown under the heading — hospital name (patient) or typed address (community). */
  anchorLabel?: string
  /** When set, the card with this id will mount expanded and scroll into view.
   *  Used to restore the card the user had open before navigating to a form. */
  reopenItemId?: string | null
  onUp: () => void
  onAdd: () => void
  onEdit: (item: DirectoryResource) => void
  onReport: (item: DirectoryResource) => void
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
  reopenItemId,
  onUp,
  onAdd,
  onEdit,
  onReport,
}: Props) {
  const [search, setSearch] = useState('')
  const [denomination, setDenomination] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  // Scroll the target card into view on mount (runs once, after items are ready).
  const reopenRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (reopenItemId && reopenRef.current) {
      reopenRef.current.scrollIntoView({ block: 'nearest' })
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

  return (
    <div>
      <UpButton label="All resources" onClick={onUp} />

      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Synagogues</h2>
          {anchorLabel && <p className="text-sm text-muted mt-0.5">{anchorLabel}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasMinyanim && (
            <button
              onClick={() => setModalOpen(true)}
              className="text-sm font-medium text-slate-600 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              🕐 All davening times
            </button>
          )}
          <button
            onClick={onAdd}
            className="text-sm font-medium text-primary border border-primary rounded-md px-3 py-1.5 hover:bg-primary hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            ➕ Add
          </button>
        </div>
      </div>

      {/* Controls: search + denomination filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Search synagogues…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {denominations.length > 1 && (
          <select
            value={denomination}
            onChange={(e) => setDenomination(e.target.value)}
            className="px-3 py-2 text-sm rounded-md border border-slate-300 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            <option value="">All Denominations</option>
            {denominations.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted text-sm">No synagogues found.</p>
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
      />
    </div>
  )
}
