'use client'

import type { AppMode } from '@/types'
import { GridIcon, MapFoldIcon, MessageIcon } from './icons'

export type MobileTab = 'categories' | 'map' | 'feedback'

const TABS: { key: MobileTab; label: string; icon: typeof GridIcon; modes: AppMode[] }[] = [
  { key: 'categories', label: 'Categories', icon: GridIcon, modes: ['home', 'community-home', 'find'] },
  { key: 'map', label: 'Map', icon: MapFoldIcon, modes: ['map'] },
  { key: 'feedback', label: 'Feedback', icon: MessageIcon, modes: ['feedback'] },
]

type Props = {
  /** Current screen — decides which tab reads as active. */
  mode: AppMode
  onSelect: (tab: MobileTab) => void
  /** Hide the Map tab entirely when no Map category is configured for this site. */
  showMapTab: boolean
  /** Hide the Feedback tab when the site has feedback turned off. */
  showFeedbackTab: boolean
}

// Fixed bottom tab bar, mobile only — the phone-width equivalent of the
// desktop SiteHeader/SiteFooter chrome. Always visible (even over wizard
// overlays) so the visitor never loses their way back to the other tabs.
export default function MobileTabBar({ mode, onSelect, showMapTab, showFeedbackTab }: Props) {
  const tabs = TABS.filter((t) => (t.key === 'map' ? showMapTab : t.key === 'feedback' ? showFeedbackTab : true))

  return (
    <nav
      className="sm:hidden fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200/80 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      {tabs.map(({ key, label, icon: Icon, modes }) => {
        const active = modes.includes(mode)
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 cursor-pointer ${
              active ? 'text-primary' : 'text-slate-400'
            }`}
          >
            <Icon className="h-6 w-6" />
            <span className="text-[11px] font-medium">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
