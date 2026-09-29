'use client'

import { useCallback } from 'react'
import { usePersistedState } from '@/lib/usePersistedState'
import type { RowLook } from './GenericListingCard'

// ── Cards or a flat list: trying both on the preview ────────────────────────
// Whether a category page's rows are each their own card (today's look) or
// rows of one flat list (the canvas's) is the last choice in step 2 of the
// redesign, made on a phone with real data rather than from a mockup. Until
// then this switch shows everywhere except the live site, which keeps the
// cards. Once the choice is made, the switch and the look not chosen go.

/** The live site never shows the switch, and so always has cards. */
export const ROW_LOOK_SWITCH = process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production'

const KEY = 'jpc:row-look'

/** The look chosen with the switch, remembered by this browser. */
export function useRowLook(): [RowLook, (look: RowLook) => void] {
  const [look, setLook] = usePersistedState<RowLook>(
    'cards',
    () => {
      try {
        return localStorage.getItem(KEY) === 'list' ? 'list' : 'cards'
      } catch {
        return 'cards'
      }
    },
    useCallback((value: RowLook) => {
      try {
        if (value === 'list') localStorage.setItem(KEY, 'list')
        else localStorage.removeItem(KEY)
      } catch {
        // Blocked storage: back to cards next visit.
      }
    }, []),
  )
  return [ROW_LOOK_SWITCH ? look : 'cards', setLook]
}

export default function RowLookSwitch({ look, onChange }: { look: RowLook; onChange: (look: RowLook) => void }) {
  if (!ROW_LOOK_SWITCH) return null
  const option = (value: RowLook, label: string) => (
    <button
      type="button"
      aria-pressed={look === value}
      onClick={() => onChange(value)}
      className={`h-8 cursor-pointer rounded-full px-3 text-[13px] font-semibold transition-colors ${
        look === value ? 'bg-white text-slate-900 shadow-sm' : 'text-white/80 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div
      role="group"
      aria-label="Row look, preview only"
      title="Preview only: the live site shows cards"
      className="fixed left-4 bottom-[calc(3.75rem+env(safe-area-inset-bottom)+1.5rem)] desktop:bottom-7 z-40 flex items-center gap-0.5 rounded-full bg-slate-800/90 p-1 shadow-lg"
    >
      {option('cards', 'Cards')}
      {option('list', 'List')}
    </div>
  )
}
