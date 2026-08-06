'use client'

import type { AppMode } from '@/types'
import { isBuiltInTabTarget, type MobileTabConfig } from '@/lib/siteSettings'
import { GridIcon, MapFoldIcon, MessageIcon } from './icons'

/** Which app screens each built-in target counts as "current" for. Card tabs
 *  don't appear here — they're matched on the open category instead (see
 *  `activeTarget` in page.tsx). */
const BUILT_IN_MODES: Record<string, AppMode[]> = {
  categories: ['home', 'community-home', 'find'],
  map: ['map'],
  feedback: ['feedback'],
}

const BUILT_IN_ICONS: Record<string, typeof GridIcon> = {
  categories: GridIcon,
  map: MapFoldIcon,
  feedback: MessageIcon,
}

type Props = {
  /** Current screen — decides which tab reads as active. */
  mode: AppMode
  /** The configured bar, already filtered for visibility by the caller. */
  tabs: MobileTabConfig[]
  onSelect: (tab: MobileTabConfig) => void
  /** The card id currently open, when the visitor is inside a category — lets
   *  a card tab (e.g. "Shuls") read as active while its directory is open,
   *  the same way the built-in tabs do for their screens. Null anywhere else. */
  activeCardId?: string | null
  /** Emoji per card target, from the category/form the tab points at. Card
   *  tabs have no hand-drawn SVG the way the three built-in screens do. */
  iconForTarget?: (target: string) => string | undefined
}

// Fixed bottom tab bar, mobile only — the phone-width equivalent of the
// desktop SiteHeader/SiteFooter chrome. Always visible (even over wizard
// overlays) so the visitor never loses their way back to the other tabs.
//
// The bar is admin-configurable (labels, order, and which destinations are on
// it — see the Mobile tab in /admin). Its three original entries survive as
// the built-in targets below; anything else is a card id and opens that
// category/form exactly as tapping its home-screen tile would.
export default function MobileTabBar({ mode, tabs, onSelect, activeCardId, iconForTarget }: Props) {
  return (
    <nav
      className="sm:hidden fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200/80 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      {tabs.map((tab) => {
        const builtIn = isBuiltInTabTarget(tab.target)
        // A card tab is active only when its own category is the one open —
        // otherwise every card tab would light up alongside Categories, which
        // shares the 'find' mode with them.
        const active = builtIn
          ? BUILT_IN_MODES[tab.target].includes(mode) && (tab.target !== 'categories' || !activeCardId)
          : mode === 'find' && activeCardId === tab.target
        const Icon = builtIn ? BUILT_IN_ICONS[tab.target] : null
        const emoji = builtIn ? undefined : iconForTarget?.(tab.target)

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab)}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 cursor-pointer ${
              active ? 'text-primary' : 'text-slate-400'
            }`}
          >
            {Icon ? (
              <Icon className="h-6 w-6" />
            ) : (
              // Sized and centered to occupy the same 24px box the SVGs do, so
              // a mixed bar keeps one baseline. Dimmed to match when inactive,
              // since an emoji carries its own color and would otherwise read
              // as permanently selected.
              <span
                className={`flex h-6 w-6 items-center justify-center text-[19px] leading-none ${
                  active ? '' : 'opacity-45 grayscale'
                }`}
                aria-hidden="true"
              >
                {emoji ?? '•'}
              </span>
            )}
            <span className="text-[11px] font-medium">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
