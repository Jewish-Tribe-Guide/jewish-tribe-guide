'use client'

import Image, { getImageProps } from 'next/image'
import { preload } from 'react-dom'
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { ui } from '@/lib/uiConfig'
import type { SiteSettings } from '@/lib/siteSettings'
import { isOptimizableImage } from '@/lib/imageHosts'
import SearchBox from './SearchBox'
import SearchPrompts from './SearchPrompts'

/** The `desktop:` variant's own media query (see globals.css) — the hero band is
 *  `hidden` outside it. Kept in sync by hand; it's a link `media` attribute, so
 *  it can't reference the Tailwind variant. */
const DESKTOP_MEDIA = '(min-width: 640px) and (min-height: 640px)'

type Props = {
  settings: Pick<
    SiteSettings,
    'heroTitle' | 'mission' | 'desktopHeroHeadline' | 'desktopHeroSubhead' | 'desktopHeroImage' | 'searchPlaceholder'
  >
  query: string
  onQueryChange: (query: string) => void
  /** Enter in the search box: the page goes where the first line says
   *  (see searchLands.ts). */
  onSearchSubmit?: () => void
  /** Admin-preview only: renders the search box inert (nothing to filter in a
   *  preview) instead of driving Landing's card grid. */
  interactive?: boolean
  /** Where the search could go (SearchLines), or that nothing was found:
   *  under the box while something is typed, over the page on desktop,
   *  in the page's flow on a phone. Built by Landing. */
  searchPanel?: ReactNode
  /** Whether the visitor has closed the results (a tap or click away, or
   *  Escape) with their words still in the box, for a caller that changes
   *  the page around them (Landing's phone home dims its tiles while they
   *  show). Kept here when not given. */
  searchDismissed?: boolean
  onSearchDismissedChange?: (dismissed: boolean) => void
  /** Questions to tap under the empty box, each known to go somewhere
   *  right now (see searchPrompts.ts). Tapped, the page goes there, as on
   *  Enter. */
  searchPrompts?: string[]
  onPickPrompt?: (prompt: string) => void
  /** The Today home (SiteSettings.homeStyle): the day as a small line over
   *  the title ("Tuesday, Oct 6 · 25 Tishrei · sunset 6:35 PM"), the Ask box
   *  the biggest thing after it, and nothing else in the hero. Null until
   *  the page knows what day it is. Undefined for the classic home. */
  today?: { dayLine: string | null }
  /** The phone's top line, who keeps the guide right (TrustBand). The
   *  classic home only. */
  trust?: ReactNode
}

// The home screen's heading, mission, and the filter box + "View Map" button
// — its own component so the admin Site preview can render the exact same
// markup the live home screen does, fed by a draft instead of the saved
// settings.
//
// Desktop gets a full-bleed photo band instead of mobile's plain block —
// mobile has to stay practical in a narrow, scroll-cost-sensitive space, so
// it leads with who keeps the guide right (TrustBand) and the search box
// directly under it (Oct 17; it used to lead with `heroTitle` and the
// mission, which a returning visitor reads past every time). The site's
// actual name is already one small line in the sticky header above it.
//
// Desktop used to lead with `settings.name` here too, on the reasoning that
// nowhere else on that layout said who this is at any size. That stopped
// being true once the header's own tagline line was dropped (see
// SiteHeader's own doc) — SiteHeader already names the site, right above
// this section, so this band's job became saying what it's FOR instead:
// `settings.desktopHeroHeadline`/`desktopHeroSubhead` — admin-editable,
// separate from mobile's `heroTitle`/`mission` (see the Desktop tab's Hero
// card) since the two read differently even though they're describing the
// same site — `settings.name` still isn't dead, it's the header, the
// footer, and the browser tab, just never repeated here.
//
// Desktop centres the headline, the search and what to try over the photo,
// dimmed (Nov 11, board C). Search is the only box on desktop; typing opens
// its results right under it, over the page (the user's own pain point: an
// answer in a card far below reads as disconnected from the box).
//
// Expressed as two parallel layouts behind `desktop:`/`hidden` classes
// rather than an isMobile branch: isMobile starts false on every render
// (SSR-safe), so branching here would flash the desktop layout on a phone
// for one frame (the same reasoning as Landing's own inlineGridClass).
//
// The photo is settings.desktopHeroImage when the admin has set one
// (Desktop tab's Hero card), a plain gradient otherwise.
export default function HeroHeading({
  settings,
  query,
  onQueryChange,
  onSearchSubmit,
  interactive = true,
  searchPanel = null,
  searchDismissed,
  onSearchDismissedChange,
  searchPrompts = [],
  onPickPrompt,
  today,
  trust = null,
}: Props) {
  const { desktopHeroHeadline: headline, desktopHeroImage: heroImage } = settings

  // Start fetching the hero photo from <head> — but only where it will be
  // shown. The <img> below is deliberately lazy (a lazy image in a display:none
  // box is skipped, so phones never download a photo they can't see), and a
  // lazy image only starts once layout has run. On desktop, where this is the
  // largest element on the page, that's a late start; this restores the early
  // one, gated by `media` so it costs a phone nothing. The srcset/sizes come
  // from getImageProps so the browser picks the same candidate the <img> will
  // and reuses the preloaded bytes instead of fetching twice.
  if (heroImage) {
    const { props } = getImageProps({
      src: heroImage.url,
      alt: '',
      fill: true,
      sizes: '100vw',
      unoptimized: !isOptimizableImage(heroImage.url),
    })
    preload(props.src, {
      as: 'image',
      imageSrcSet: props.srcSet,
      imageSizes: props.sizes,
      media: DESKTOP_MEDIA,
      fetchPriority: 'high',
    })
  }

  // The dropdown's own open/closed state — derived from `query` (open the
  // moment there's something to show), except for `dismissed`, which
  // Escape/an outside click/"See all" set to override that back closed
  // until the visitor types again. Not just "has focus": clicking a result
  // blurs the input on the way to navigating, and closing the panel at that
  // exact moment would race the click.
  // The phone's results close the same way (the user, Oct 20: once they
  // showed, only the box's ✕ put the home back).
  const [ownDismissed, setOwnDismissed] = useState(false)
  const dismissed = searchDismissed ?? ownDismissed
  const setDismissed = (next: boolean) => {
    setOwnDismissed(next)
    if (next !== dismissed) onSearchDismissedChange?.(next)
  }
  const trimmedQuery = query.trim()
  const dropdownOpen = trimmedQuery.length > 0 && !dismissed && searchPanel != null
  const searchShellRef = useRef<HTMLDivElement>(null)
  // The phone's box and its results, in the page's flow.
  const phoneShellRef = useRef<HTMLDivElement>(null)

  const dismiss = useEffectEvent(() => setDismissed(true))
  useEffect(() => {
    if (!dropdownOpen) return
    function onPointerDown(e: MouseEvent) {
      // A click in a dialog open over the page (the "Share your live
      // location?" prompt) is an answer to the dialog, not a click away from
      // the results. It used to close them: a shared answer
      // (/philly/ask/…) opened, the visitor tapped "Not now", and the answer
      // was gone.
      if (document.querySelector('[aria-modal="true"]')) return
      const target = e.target as Node
      if ([searchShellRef, phoneShellRef].some((r) => r.current?.contains(target))) return
      dismiss()
      // The tap that closes the results does only that. It used to go on to
      // whatever was under it: search "hospital", tap away, and Grocery
      // opened. The click follows this tap's mouseup; nothing else is eaten.
      document.addEventListener('click', swallow, true)
      document.addEventListener('mouseup', () => setTimeout(() => document.removeEventListener('click', swallow, true)), { once: true, capture: true })
    }
    function swallow(e: MouseEvent) {
      e.preventDefault()
      e.stopPropagation()
      document.removeEventListener('click', swallow, true)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [dropdownOpen])

  function handleQueryChange(next: string) {
    setDismissed(false)
    onQueryChange(next)
  }
  // Only under an empty box: once something's typed, where it goes is the point.
  const prompts = interactive && !trimmedQuery ? searchPrompts : []
  const pickPrompt = (p: string) => onPickPrompt?.(p)
  // On a phone, right under the box, in the page's flow.
  const phonePanel = dropdownOpen ? <div className="mt-2 text-left">{searchPanel}</div> : null
  const reopen = () => setDismissed(false)

  return (
    <>
      {/* Mobile, Today: the day, the title, the Ask box; no mission. Left
          aligned, so the blocks under it read as one column. */}
      {today && (
        <section className="pt-5 desktop:hidden" data-testid="today-hero">
          {/* Held open while the day isn't known yet, so the title doesn't
              jump down when it arrives. */}
          <p className="min-h-5 text-[13.5px] font-semibold text-slate-500">{today.dayLine}</p>
          <h1 className="mt-0.5 text-[26px] font-extrabold leading-tight tracking-tight text-ink">{settings.heroTitle}</h1>
          {ui.search.landing && (
            <div ref={phoneShellRef} className="mt-3">
              <SearchBox query={query} onQueryChange={handleQueryChange} onSubmit={onSearchSubmit} interactive={interactive} placeholder={settings.searchPlaceholder} onFocus={reopen} />
              {phonePanel}
              <SearchPrompts prompts={prompts} onPick={pickPrompt} className="mt-2.5" oneLine />
            </div>
          )}
        </section>
      )}

      {/* Mobile: who keeps the guide right (TrustBand), then the search
          and what to try. No headline and no mission (the user, Oct 17):
          the header already names the guide, and a returning visitor came
          to find something, not to be told what this is. The big line stays
          as the page's heading for screen readers and search engines (the
          admin's separate Title for it went, Nov 4). */}
      {!today && (
      <section className="pt-4 desktop:hidden" data-testid="phone-hero" data-spot="top">
        <h1 className="sr-only">{headline || settings.heroTitle}</h1>
        {trust}
        {ui.search.landing && (
          <div ref={phoneShellRef} className={trust ? 'mt-3' : undefined}>
            <SearchBox query={query} onQueryChange={handleQueryChange} onSubmit={onSearchSubmit} interactive={interactive} placeholder={settings.searchPlaceholder} onFocus={reopen} look="box" />
            {phonePanel}
            <SearchPrompts prompts={prompts} onPick={pickPrompt} className="mt-2.5" oneLine />
          </div>
        )}
      </section>
      )}

      {/* Desktop: the headline, the big search and what to try, centred
          over the photo, dimmed (board C on the desk canvas, the user, Nov
          11: "much calmer and more directs my attention"). Under the header,
          not behind it: the header stays white, as the board drew it.
          Browse Categories and View Map went with it: the header has
          Categories and Map, and the grid is just below.

          A full-bleed band: `w-screen left-1/2 -translate-x-1/2` breaks out
          of <main>'s column (the pattern ResourceMapView uses; globals.css
          backstops it). No overflow property: `overflow-x: hidden` alone
          turns `overflow-y` into `auto` and clips the search's results as
          they spill over the page (it has, once). The photo has its own
          clipping box. `z-30` puts the results over the page's next
          sections and keeps them under the sticky header's z-40. */}
      <section data-spot="top" data-testid="desktop-hero" className="hidden desktop:block relative z-30 left-1/2 isolate w-screen -translate-x-1/2 bg-slate-800">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          {heroImage ? (
            // Decoration: the big line over it says what the page is, so
            // the photo has an empty alt and a screen reader passes it by.
            <Image
              src={heroImage.url}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              // Above the fold, so it should win the bandwidth race, but not
              // `priority`: a preload has no media condition, and this band
              // is `hidden` on a phone (the <head> preload above carries
              // one). Lazy by default, so a phone never fetches it.
              fetchPriority="high"
              unoptimized={!isOptimizableImage(heroImage.url)}
            />
          ) : (
            // No photo set yet: a plain gradient, so a new community never
            // renders broken.
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-slate-500 to-primary-dark" />
          )}
          {/* Dims the photo so white type reads anywhere on it. */}
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.55),rgba(15,23,42,0.7))]" />
        </div>
        <div className="mx-auto flex min-h-[360px] max-w-[720px] flex-col items-center px-4 pt-[72px] pb-14 text-center">
          {today && <p className="mb-2 min-h-6 text-[16px] font-semibold text-white/80">{today.dayLine}</p>}
          <h1 className="text-[40px] font-extrabold leading-tight tracking-tight text-white text-balance">{headline}</h1>
          {ui.search.landing && (
            <div ref={searchShellRef} className="relative mt-6 w-full text-left">
              <SearchBox
                query={query}
                onQueryChange={handleQueryChange}
                onSubmit={onSearchSubmit}
                interactive={interactive}
                placeholder={settings.searchPlaceholder}
                onFocus={reopen}
                className="pl-6 pr-2.5 py-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.3)]"
              />
              {/* Over the page, right under the box (canvas board 8b). */}
              {dropdownOpen && <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20">{searchPanel}</div>}
              <SearchPrompts prompts={prompts} onPick={pickPrompt} className="mt-4 justify-center" onDark />
            </div>
          )}
        </div>
      </section>
    </>
  )
}
