'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { DEFAULT_DESKTOP_NAV_ITEMS, type DesktopNavItem } from '@/lib/siteSettings'

/** How long a mega-menu stays open after the pointer leaves — same value and
 *  same reason as SectionTabs used to use: without it, the gap between the
 *  trigger word and its panel closes the menu mid-travel. */
const CLOSE_DELAY_MS = 120

// Keyed by the open item's own id (not a fixed union) now that the nav's
// items are data — any 'categories-menu' or 'more-menu' item can be open,
// whatever id it happens to have.
type OpenPanel = string | null

/** Resolves a 'link' item's target to a real href, or null for 'feedback'
 *  (an action, not a page) or a target this community doesn't have (e.g.
 *  'map' with no Map category, or a category that's since been deleted). */
function resolveHref(target: string, hrefById: Map<string, string>, communitySlug: string, hasMap: boolean): string | null {
  if (target === 'map') return hasMap ? routes.map(communitySlug) : null
  if (target === 'about') return '/about'
  if (target === 'privacy') return '/privacy'
  if (target === 'feedback') return null
  return hrefById.get(target) ?? null
}

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
// The top-level structure (Categories / Map / More by default, plus the More
// panel's own About/Feedback/Privacy contents) is admin-editable now —
// settings.desktopNavItems (Desktop tab's Top Nav bar editor), falling back
// to DEFAULT_DESKTOP_NAV_ITEMS (today's fixed structure) when unconfigured.
// "Map" (built-in or admin-added) stays hidden when the community has no Map
// pseudo-category, same gating Chrome already applies to the mobile tab bar.
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
  const categoriesWrapRef = useRef<HTMLDivElement>(null)
  // The panel spans the header's own content row — the same left/right
  // edges as the logo-to-location-pill line above it — rather than being
  // anchored to the "Categories" trigger's own (much narrower) footprint.
  // That trigger sits well left of center in this nav's layout, so a panel
  // merely flush with it, sized to its own content, reads as randomly
  // placed: mostly empty space to its left, an arbitrary edge partway
  // across the screen to its right, connected to nothing wider than an
  // 80px-wide word. A full-width mega-menu — spanning the same bounds as
  // the header bar it drops from — is the standard resolution for exactly
  // this shape of menu (many columns, a narrow trigger): it reads as the
  // header itself expanding downward, not as a card floating near one word
  // in it. `left`/`width` are measured off the trigger's own containing
  // block (`categoriesWrapRef`, which `left`'s offset is relative to) and
  // the header content row (`navRef.current.parentElement` — see
  // SiteHeader.tsx, HeaderNav's `<nav>` is always a direct child of that
  // row), not assumed from a breakpoint — the same "real DOM, not a guessed
  // viewport width" approach GenericDirectory's own alignRows uses.
  const [categoriesOffset, setCategoriesOffset] = useState(0)
  const [categoriesWidth, setCategoriesWidth] = useState(0)

  useLayoutEffect(() => {
    if (open !== 'categories') return
    function reposition() {
      const wrap = categoriesWrapRef.current
      const container = navRef.current?.parentElement
      if (!wrap || !container) return
      const wrapLeft = wrap.getBoundingClientRect().left
      const containerRect = container.getBoundingClientRect()
      setCategoriesOffset(containerRect.left - wrapLeft)
      setCategoriesWidth(containerRect.width)
    }
    reposition()
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [open])

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
  const hrefById = new Map(allCards.map((c) => [c.id ?? c.title, c.href]))

  const navItems = settings.desktopNavItems.length > 0 ? settings.desktopNavItems : DEFAULT_DESKTOP_NAV_ITEMS

  const openWith = (panel: OpenPanel) => {
    cancelClose()
    setOpen(panel)
  }

  function linkAction(item: DesktopNavItem, onNavigate?: () => void) {
    const href = resolveHref(item.target!, hrefById, communitySlug, hasMap)
    if (item.target === 'feedback') {
      if (!settings.feedbackEnabled) return null
      return (
        <button
          key={item.id}
          onClick={() => {
            onNavigate?.()
            setFeedbackOpen(true)
          }}
          className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
        >
          {item.label}
        </button>
      )
    }
    if (!href) return null
    return (
      <Link
        key={item.id}
        href={href}
        onClick={onNavigate}
        className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
      >
        {item.label}
      </Link>
    )
  }

  return (
    <nav
      ref={navRef}
      aria-label="Site"
      className="hidden items-center gap-8 desktop:flex"
      onMouseLeave={scheduleClose}
    >
      {navItems.map((item) => {
        if (item.kind === 'categories-menu') {
          if (sections.length === 0) return null
          return (
            <div key={item.id} className="relative" ref={categoriesWrapRef}>
              <button
                // Unconditionally opens rather than toggling — a toggle here
                // fights onFocus/onMouseEnter, which a real pointer click fires
                // first: the menu is already open by the time this handler
                // runs, so a toggle would read that as "close it" and
                // immediately undo what focus/hover just did. Same reasoning,
                // same fix, as SectionTabs (this component's predecessor)
                // always used.
                onClick={() => openWith(item.id)}
                onMouseEnter={() => openWith(item.id)}
                onFocus={() => openWith(item.id)}
                aria-expanded={open === item.id}
                className={`flex cursor-pointer items-center gap-1 whitespace-nowrap text-sm font-semibold transition-colors ${
                  open === item.id ? 'text-primary' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                {item.label}
                <span aria-hidden="true" className="text-[10px]">
                  {open === item.id ? '▴' : '▾'}
                </span>
              </button>

              {open === item.id && (
                <div
                  onMouseEnter={cancelClose}
                  // `left`/`width` (see the state's own doc above) span the
                  // header's content row, not this trigger's own footprint.
                  className="absolute top-full z-30 mt-3 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-100 bg-white p-5 shadow-xl"
                  style={{ left: categoriesOffset, width: categoriesWidth }}
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
          )
        }

        if (item.kind === 'link') {
          if (item.target === 'map' && !hasMap) return null
          if (item.target === 'feedback' && !settings.feedbackEnabled) return null
          const href = resolveHref(item.target!, hrefById, communitySlug, hasMap)
          if (item.target === 'feedback') {
            return (
              <button
                key={item.id}
                onClick={() => setFeedbackOpen(true)}
                className="whitespace-nowrap text-sm font-semibold text-slate-700 transition-colors hover:text-slate-900 cursor-pointer"
              >
                {item.label}
              </button>
            )
          }
          if (!href) return null
          return (
            <Link
              key={item.id}
              href={href}
              className="whitespace-nowrap text-sm font-semibold text-slate-700 transition-colors hover:text-slate-900"
            >
              {item.label}
            </Link>
          )
        }

        // 'more-menu' — a small nested dropdown of its own 'link' items
        // (About/Feedback/Privacy by default).
        const subItems = (item.items ?? []).flatMap((sub) => linkAction(sub, () => setOpen(null)) ?? [])
        if (subItems.length === 0) return null
        return (
          <div key={item.id} className="relative">
            <button
              onClick={() => openWith(item.id)}
              onMouseEnter={() => openWith(item.id)}
              onFocus={() => openWith(item.id)}
              aria-expanded={open === item.id}
              className={`flex cursor-pointer items-center gap-1 whitespace-nowrap text-sm font-semibold transition-colors ${
                open === item.id ? 'text-primary' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              {item.label}
              <span aria-hidden="true" className="text-[10px]">
                {open === item.id ? '▴' : '▾'}
              </span>
            </button>

            {open === item.id && (
              <div
                onMouseEnter={cancelClose}
                // left-0, not right-0: this trigger sits well clear of the
                // viewport's right edge in this nav's layout (unlike a
                // right-aligned nav bar, where right-anchoring exists to
                // avoid overflow), so right-anchoring it here only pulled
                // the panel's left edge back near wherever the OTHER menu
                // happens to start — the two looked like they opened from
                // the same spot instead of each hanging from its own tab.
                className="absolute left-0 top-full z-30 mt-3 w-48 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl"
              >
                {subItems}
              </div>
            )}
          </div>
        )
      })}

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
