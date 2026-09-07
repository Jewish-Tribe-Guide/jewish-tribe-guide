'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { track } from '@vercel/analytics'
import { resourceCards, groupCardsIntoSections, useEntryCards } from '@/components/home/sections'
import FeedbackForm from '@/components/FeedbackForm'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { useCategories } from '@/lib/useCategories'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { useSiteNavigation } from '@/lib/useSiteNavigation'
import { useCommunitySlug } from '@/lib/communityContext'
import { useHomeSections } from '@/lib/useHomeSections'
import { routes } from '@/lib/routes'

/** How long a mega-menu stays open after the pointer leaves — same value and
 *  same reason as SectionTabs used to use: without it, the gap between the
 *  trigger word and its panel closes the menu mid-travel. */
const CLOSE_DELAY_MS = 120

type OpenPanel = 'categories' | 'more' | null

// ── Header nav: Categories, Map, More — desktop only. ───────────────────────
//
// Replaces SectionTabs, the full-width row of six-plus tabs that used to sit
// under the header. That row only ever mounted on the home screen (Landing.tsx
// was the only place that rendered it), so a visitor on a category page or the
// map had no category nav at all short of going home first — moving it here,
// into SiteChrome's own header (rendered on every screen), is a real expansion
// of where this nav reaches, not just a repackaging of what home already had.
//
// The six-plus named groups (Food and Hospitality, Jewish Institutions, …)
// don't disappear — they nest one level in, as columns inside a single
// "Categories" mega-menu, instead of each getting its own tab. That's a real
// trade, not a free win: someone who already knows which group holds what
// they want loses nothing, but someone who doesn't now scans group headers
// inside one open panel instead of reading them straight off the bar. What's
// gained is unconditional: the tab row is gone, permanently, on every screen,
// not just narrowed.
//
// "Map" is a plain link (hidden when the community has no Map pseudo-category,
// same gating Chrome already applies to the mobile tab bar). "More" is new —
// About, Send feedback, and Privacy, the same three destinations SiteFooter's
// desktop-only footer already offers, now reachable without scrolling to the
// bottom of a page that has one.
export default function HeaderNav() {
  const categories = useCategories()
  const homeSections = useHomeSections()
  const communitySlug = useCommunitySlug()
  const settings = useSiteSettings()
  const { navigate, openFlow } = useSiteNavigation()
  const entryCards = useEntryCards(openFlow)

  const [open, setOpen] = useState<OpenPanel>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navRef = useRef<HTMLElement>(null)

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(null), CLOSE_DELAY_MS)
  }
  useEffect(() => cancelClose, [])

  // Escape closes, and so does moving focus out of the nav entirely (tabbing
  // past the last link should leave a menu behind, not strand it open) — same
  // pattern SectionTabs used.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    const onFocusIn = (e: FocusEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [open])

  if (categories === null) return null

  const hasMap = categories.some((c) => c.kind === 'map')
  const resources = resourceCards(navigate, categories, communitySlug)
  const allCards = resources ? [...entryCards, ...resources] : []
  const sections = groupCardsIntoSections(allCards, homeSections ?? [])

  const openWith = (panel: OpenPanel) => {
    cancelClose()
    setOpen(panel)
  }

  return (
    <nav
      ref={navRef}
      aria-label="Site"
      className="hidden items-center gap-5 desktop:flex"
      onMouseLeave={scheduleClose}
    >
      {sections.length > 0 && (
        <div className="relative">
          <button
            // Unconditionally opens rather than toggling — a toggle here
            // fights onFocus/onMouseEnter, which a real pointer click fires
            // first: the menu is already open by the time this handler runs,
            // so a toggle would read that as "close it" and immediately undo
            // what focus/hover just did. Same reasoning, same fix, as
            // SectionTabs (this component's predecessor) always used.
            onClick={() => openWith('categories')}
            onMouseEnter={() => openWith('categories')}
            onFocus={() => openWith('categories')}
            aria-expanded={open === 'categories'}
            className={`flex cursor-pointer items-center gap-1 whitespace-nowrap text-sm font-semibold transition-colors ${
              open === 'categories' ? 'text-primary' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Categories
            <span aria-hidden="true" className="text-[10px]">
              {open === 'categories' ? '▴' : '▾'}
            </span>
          </button>

          {open === 'categories' && (
            <div
              onMouseEnter={cancelClose}
              className="absolute left-1/2 top-full z-30 mt-3 w-[min(90vw,900px)] max-h-[70vh] -translate-x-1/2 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-5 shadow-xl"
            >
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
                {sections.map((section) => (
                  <div key={section.title}>
                    <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                      {section.title}
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {section.cards.map((card) => (
                        <li key={card.id ?? card.title}>
                          <Link
                            href={card.href}
                            onClick={() => {
                              setOpen(null)
                              track('category_opened', { category: card.id ?? card.title, source: 'header-nav' })
                            }}
                            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
                          >
                            {card.icon && (
                              <CategoryGlyph categoryId={card.id} icon={card.icon} className="h-4 w-4 shrink-0" />
                            )}
                            <span className="min-w-0 truncate">{card.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {hasMap && (
        <Link href={routes.map(communitySlug)} className="whitespace-nowrap text-sm font-semibold text-slate-700 transition-colors hover:text-slate-900">
          Map
        </Link>
      )}

      <div className="relative">
        <button
          onClick={() => openWith('more')}
          onMouseEnter={() => openWith('more')}
          onFocus={() => openWith('more')}
          aria-expanded={open === 'more'}
          className={`flex cursor-pointer items-center gap-1 whitespace-nowrap text-sm font-semibold transition-colors ${
            open === 'more' ? 'text-primary' : 'text-slate-700 hover:text-slate-900'
          }`}
        >
          More
          <span aria-hidden="true" className="text-[10px]">
            {open === 'more' ? '▴' : '▾'}
          </span>
        </button>

        {open === 'more' && (
          <div
            onMouseEnter={cancelClose}
            className="absolute right-0 top-full z-30 mt-3 w-48 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl"
          >
            <Link href="/about" onClick={() => setOpen(null)} className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50">
              About
            </Link>
            {settings.feedbackEnabled && (
              <button
                onClick={() => {
                  setOpen(null)
                  setFeedbackOpen(true)
                }}
                className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
              >
                {settings.feedbackButtonLabel}
              </button>
            )}
            <Link href="/privacy" onClick={() => setOpen(null)} className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50">
              Privacy
            </Link>
          </div>
        )}
      </div>

      {feedbackOpen && (
        <FeedbackForm
          heading={settings.feedbackHeading}
          successMessage={settings.feedbackSuccessMessage}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
    </nav>
  )
}
