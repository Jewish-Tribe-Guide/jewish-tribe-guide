'use client'

import { useEffect, useRef } from 'react'
import { CardGrid, groupCardsIntoSections, resourceCards, useEntryCards } from '@/components/home/sections'
import UpButton from '@/components/UpButton'
import { useCategories } from '@/lib/useCategories'
import { useHomeSections } from '@/lib/useHomeSections'
import type { NavigateFn } from '@/types'
import type { Flow } from '@/types'

// ── The full category index ───────────────────────────────────────────────────
// Everything that used to sit below the map on the desktop home screen, moved
// to its own screen so the home screen can stay short (search → three featured
// cards → map → this week). Reached from the "Browse all categories" button or
// by clicking a section tab.
//
// Mobile never routes here — its home screen still renders this same grid
// inline (see Landing), since a phone has no tab bar to reach it from.

/** Stable DOM id for a section heading, so a tab click can scroll to it. */
export function sectionAnchorId(title: string): string {
  return `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

export default function AllCategories({
  onNavigate,
  onOpenFlow,
  onUp,
  scrollToSection,
}: {
  onNavigate: NavigateFn
  onOpenFlow: (kind: Flow['kind'], preselect?: string[]) => void
  onUp: () => void
  /** Section title to scroll to on arrival (set when a tab was clicked). */
  scrollToSection?: string | null
}) {
  const categories = useCategories()
  const homeSections = useHomeSections()
  const entryCards = useEntryCards(onOpenFlow)

  const resources = resourceCards(onNavigate, categories)
  const allCards = resources ? [...entryCards, ...resources] : null
  const sections = allCards ? groupCardsIntoSections(allCards, homeSections ?? []) : []

  // Scroll once, after the sections that hold the target actually exist —
  // categories load async, so scrolling on mount would find nothing. Tracked
  // with a ref rather than a dep so re-renders don't yank the page back after
  // the visitor has scrolled somewhere themselves.
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || !scrollToSection || sections.length === 0) return
    const el = document.getElementById(sectionAnchorId(scrollToSection))
    if (!el) return
    scrolled.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [scrollToSection, sections.length])

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <UpButton label="Home" onClick={onUp} />

      <h1 className="mb-8 text-3xl font-bold tracking-tight text-slate-900">All categories</h1>

      {allCards === null ? (
        <CardGrid cards={entryCards} loadingCount={6} />
      ) : (
        <div className="space-y-10">
          {sections.map((s) => (
            // scroll-mt clears the sticky site header so a scrolled-to heading
            // doesn't end up tucked underneath it.
            <div key={s.title} id={sectionAnchorId(s.title)} className="scroll-mt-24">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">{s.title}</h2>
              <CardGrid cards={s.cards} />
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
