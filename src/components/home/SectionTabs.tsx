'use client'

import { useEffect, useRef, useState } from 'react'
import type { CardSectionDef } from './sections'
import type { DirectoryResource } from '@/types'

// ── Desktop section tabs ──────────────────────────────────────────────────────
// One tab per admin-configured home section, each opening a mega-menu of that
// section's categories on hover or focus.
//
// The mega-menu isn't decoration: with the card grid moved off the home screen
// (see AllCategories), this bar is the primary way to reach a category on
// desktop, so every category has to be listed here — a bar of six bare labels
// would strand the other ~14 behind an extra page.
//
// Hover opens, but the menu is also fully keyboard-reachable: tabbing into a
// tab opens it, Escape closes it, and the links inside are ordinary buttons in
// the tab order. Pointer-only mega-menus are a classic way to lock keyboard
// users out of a site's whole navigation.

/** How long the menu stays open after the pointer leaves. Without this, the
 *  gap between a tab and its panel closes the menu mid-travel — the standard
 *  mega-menu papercut. */
const CLOSE_DELAY_MS = 120

export default function SectionTabs({
  sections,
  listings,
  onOpenCard,
  onOpenSection,
}: {
  sections: CardSectionDef[]
  /** Used for the per-category listing counts. Null while loading — counts are
   *  simply omitted until it arrives rather than flashing "0". */
  listings: DirectoryResource[] | null
  /** Open one category (runs the card's own `go`). */
  onOpenCard: (card: CardSectionDef['cards'][number]) => void
  /** Open the All Categories page scrolled to this section. */
  onOpenSection: (title: string) => void
}) {
  const [openTitle, setOpenTitle] = useState<string | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navRef = useRef<HTMLElement>(null)

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpenTitle(null), CLOSE_DELAY_MS)
  }
  useEffect(() => cancelClose, [])

  // Escape closes, and so does moving focus out of the bar entirely (tabbing
  // past the last link should leave the menu behind, not strand it open).
  useEffect(() => {
    if (!openTitle) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenTitle(null)
    }
    const onFocusIn = (e: FocusEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenTitle(null)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [openTitle])

  if (sections.length === 0) return null

  const counts = new Map<string, number>()
  for (const item of listings ?? []) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
  }

  return (
    <nav
      ref={navRef}
      aria-label="Categories"
      className="relative hidden border-b border-slate-200 sm:block"
      onMouseLeave={scheduleClose}
    >
      <ul className="mx-auto flex max-w-6xl items-stretch justify-center gap-1 px-4 sm:px-6">
        {sections.map((section) => {
          const open = openTitle === section.title
          return (
            <li key={section.title} className="relative">
              <button
                onClick={() => onOpenSection(section.title)}
                onMouseEnter={() => {
                  cancelClose()
                  setOpenTitle(section.title)
                }}
                onFocus={() => {
                  cancelClose()
                  setOpenTitle(section.title)
                }}
                aria-expanded={open}
                className={`cursor-pointer whitespace-nowrap border-b-2 px-3.5 py-3.5 text-sm font-medium transition-colors ${
                  open
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {section.title}
              </button>

              {/* ── Mega-menu ────────────────────────────────────────────────
                      Anchored to this tab and centered under it, but clamped
                      by max-width so an edge tab's panel doesn't run off the
                      viewport. Sits above the map (z-30) — the map's own
                      floating search bar is z-20 and would otherwise punch
                      through it. ─────────────────────────────────────────── */}
              {open && (
                <div
                  onMouseEnter={cancelClose}
                  className="absolute left-1/2 top-full z-30 w-max max-w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl"
                >
                  <ul className="grid grid-cols-2 gap-0.5">
                    {section.cards.map((card) => {
                      const count = card.id ? counts.get(card.id) : undefined
                      return (
                        <li key={card.id ?? card.title}>
                          <button
                            onClick={() => {
                              setOpenTitle(null)
                              onOpenCard(card)
                            }}
                            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50"
                          >
                            {card.icon && (
                              <span className="shrink-0 text-base leading-none" aria-hidden="true">
                                {card.icon}
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                              {card.title}
                            </span>
                            {count != null && count > 0 && (
                              <span className="shrink-0 text-xs tabular-nums text-slate-400">{count}</span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
