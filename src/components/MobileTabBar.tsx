'use client'

import { useEffect, useState } from 'react'
import type { AppMode } from '@/types'
import { isBuiltInTabTarget, type MobileTabConfig } from '@/lib/siteSettings'
import { BookmarkIcon, GridIcon, HomeIcon, MapFoldIcon, MessageIcon, PulseIcon } from './icons'
import { CategoryGlyph, hasCategoryIcon } from '@/lib/categoryIcons'
import { useYouDot } from '@/lib/useYouDot'
import { YouDot } from './YouDot'
import { useCategoriesIfAny } from '@/lib/contentContext'
import { kindKeyById } from '@/lib/placeKinds'
import { backSpent, cameBack } from '@/lib/cameBack'

// The tab each category page was first opened from, so coming back to it
// (‹ on the Map tab, or the browser's Back) lights that tab again rather
// than the one just left (the user, Nov 16: Back from the Map tab to Food
// lit Map). Opening it anew from another tab still lights that tab.
const openedFrom = new Map<string, AppMode>()

/** Which app screens each built-in target counts as "current" for. Card tabs
 *  don't appear here — they're matched on the open category instead (see
 *  `activeTarget` in page.tsx). */
const BUILT_IN_MODES: Record<string, AppMode[]> = {
  categories: ['home', 'community-home', 'find'],
  map: ['map'],
  feedback: ['feedback'],
  browse: ['browse'],
  you: ['you'],
  changes: ['changes'],
}

const BUILT_IN_ICONS: Record<string, typeof GridIcon> = {
  categories: GridIcon,
  map: MapFoldIcon,
  feedback: MessageIcon,
  browse: GridIcon,
  // The Save mark itself, as Google Maps does: You is what's been saved.
  you: BookmarkIcon,
  changes: PulseIcon,
}

/** A built-in tab's line icon; with a Browse tab, the home tab is a house.
 *  Shared with the admin's list of tabs (MobileTabsEditor). */
export function builtInTabIcon(target: string, hasBrowse: boolean): typeof GridIcon | null {
  if (!isBuiltInTabTarget(target)) return null
  return target === 'categories' && hasBrowse ? HomeIcon : BUILT_IN_ICONS[target]
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
// The admin bar's grey, weight and solid white (BarNew15, Nov 1): the old
// light, see-through one went unnoticed.
//
// The bar is admin-configurable (labels, order, and which destinations are on
// it — see the Mobile tab in /admin). Its three original entries survive as
// the built-in targets below; anything else is a card id and opens that
// category/form exactly as tapping its home-screen tile would.
export default function MobileTabBar({ mode, tabs, onSelect, activeCardId, iconForTarget }: Props) {
  // With a Browse tab, the grid is Browse's, and the home tab is a house.
  const categories = useCategoriesIfAny()
  const hasBrowse = tabs.some((t) => t.target === 'browse')
  const youDot = useYouDot()
  // The tab whose screen the visitor was last on. A category page belongs to
  // no tab of its own, so the one it was reached from stays lit, as Spotify
  // does (the user, Nov 4): before, nothing was lit there. A first load onto
  // a category counts as reached from home.
  const [cameFrom, setCameFrom] = useState<AppMode>(mode === 'find' ? 'home' : mode)
  if (mode !== 'find' && mode !== cameFrom) setCameFrom(mode)
  const screenKey = mode === 'find' ? `find:${activeCardId ?? ''}` : mode
  const [lastKey, setLastKey] = useState(screenKey)
  if (lastKey !== screenKey) {
    setLastKey(screenKey)
    const before = mode === 'find' && cameBack() && activeCardId ? openedFrom.get(activeCardId) : undefined
    if (before && before !== cameFrom) setCameFrom(before)
  }
  useEffect(() => {
    // The router can show the category's mode a render before its id; the
    // Back only counts as spent once the page it landed on is known.
    if (mode === 'find' && !activeCardId) return
    backSpent()
    if (mode === 'find') openedFrom.set(activeCardId!, cameFrom)
  }, [mode, activeCardId, cameFrom])
  const ownTab = mode === 'find' && tabs.some((t) => t.target === activeCardId)
  return (
    <nav
      className="desktop:hidden fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      {tabs.map((tab) => {
        const builtIn = isBuiltInTabTarget(tab.target)
        // A card tab is active only when its own category is the one open —
        // otherwise every card tab would light up alongside Categories, which
        // shares the 'find' mode with them.
        const active = builtIn
          ? mode === 'find'
            ? !ownTab && BUILT_IN_MODES[tab.target].includes(cameFrom)
            : BUILT_IN_MODES[tab.target].includes(mode)
          : mode === 'find' && activeCardId === tab.target
        const Icon = builtInTabIcon(tab.target, hasBrowse)
        const emoji = builtIn ? undefined : iconForTarget?.(tab.target)
        // Only the emoji fallback needs the grayscale/opacity dimming trick
        // below — a hand-built line icon already takes `currentColor`, so
        // `text-primary`/`text-slate-600` (set on the button above) already
        // dims/tints it correctly, same as the built-in SVGs; grayscale-ing
        // an already-monochrome currentColor icon would just wash out its
        // active-state color for nothing.
        const hasLineIcon = !builtIn && hasCategoryIcon(kindKeyById(tab.target, categories))

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab)}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 cursor-pointer ${
              active ? 'text-primary' : 'text-slate-600'
            }`}
          >
            {Icon && tab.target === 'you' ? (
              <span className="relative">
                <Icon className="h-6 w-6" />
                {youDot && <YouDot className="-right-1 -top-0.5" />}
              </span>
            ) : Icon ? (
              <Icon className="h-6 w-6" />
            ) : hasLineIcon ? (
              <CategoryGlyph categoryId={tab.target} icon={emoji ?? ''} className="h-6 w-6" />
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
            <span className={`text-xs ${active ? 'font-bold' : 'font-semibold'}`}>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
