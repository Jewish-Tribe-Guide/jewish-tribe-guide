'use client'

import { useState } from 'react'

type Props = {
  /** Set when editing a pin that already has a name — governs the title and
   *  whether a Remove button shows at all (nothing to remove for a pin that
   *  hasn't been saved yet). */
  initialLabel?: string
  onSave: (label: string) => void
  onDelete?: () => void
  onCancel: () => void
}

/** Names (or renames/removes) a dropped pin — opened both right after a
 *  long-press drops a new one (see ResourceMap's contextmenu handling) and
 *  when tapping an already-placed one. Same full-screen overlay treatment as
 *  LiveLocationPrompt, for the same reason: a modal decision, not a popover
 *  hanging off a control that might not even be on screen right now (a pin
 *  can be tapped from anywhere on the map). */
export default function DroppedPinEditor({ initialLabel, onSave, onDelete, onCancel }: Props) {
  const [label, setLabel] = useState(initialLabel ?? '')
  const trimmed = label.trim()

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={initialLabel ? 'Edit pin' : 'Name this pin'}
      >
        <p className="text-sm font-semibold text-slate-900">{initialLabel ? 'Edit pin' : 'Name this pin'}</p>
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Where I parked"
          className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && trimmed) onSave(trimmed)
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="mt-4 flex gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 cursor-pointer"
            >
              Remove
            </button>
          )}
          <button onClick={onCancel} className="flex-1 rounded-lg py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 cursor-pointer">
            Cancel
          </button>
          <button
            onClick={() => trimmed && onSave(trimmed)}
            disabled={!trimmed}
            className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
