'use client'

import Image from 'next/image'
import { useIsMobile } from '@/lib/useIsMobile'
import { ui } from '@/lib/uiConfig'
import type { SiteSettings } from '@/lib/siteSettings'
import { isOptimizableImage } from '@/lib/imageHosts'
import SearchBox from './SearchBox'

type Props = {
  settings: Pick<
    SiteSettings,
    'heroTitle' | 'mission' | 'desktopHeroHeadline' | 'desktopHeroSubhead' | 'desktopHeroImage' | 'searchPlaceholder'
  >
  query: string
  onQueryChange: (query: string) => void
  /** Admin-preview only: renders the search box inert (nothing to filter in a
   *  preview) instead of driving Landing's card grid. */
  interactive?: boolean
  /** The Map pseudo-category's icon — shows the "View Map" button below the
   *  search box (mobile) or beside Browse Categories (desktop) when set.
   *  Null/undefined (no Map category configured) hides it entirely. */
  mapIcon?: string | null
  /** Preview mode has nothing to navigate to, so it's left undefined there —
   *  the button still renders (for visual fidelity) but doesn't do anything. */
  onViewMap?: () => void
  /** Desktop only — scrolls to the "Browse everything" card below. Always
   *  rendered (unlike the Map button, which is conditional on a Map category
   *  existing): every community has categories to browse. Preview mode
   *  leaves this undefined the same way it leaves onViewMap undefined — the
   *  button still renders, it just doesn't do anything. */
  onBrowseCategories?: () => void
}

// The home screen's heading, mission, and the filter box + "View Map" button
// — its own component so the admin Site preview can render the exact same
// markup the live home screen does, fed by a draft instead of the saved
// settings.
//
// Desktop gets a full-bleed photo band instead of mobile's plain centered
// block — mobile has to stay practical in a narrow, scroll-cost-sensitive
// space, so it leads with `heroTitle` (the practical "what are you looking
// for" prompt) the same way it always has, with the search box directly
// under it; the site's actual name is already one small line in the sticky
// header above it, and repeating it large would just spend mobile's scarcer
// vertical space restating something already on screen.
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
// Search sits inside the band again, overlaid on the photo alongside Browse
// Categories/View Map — a deliberate reversal of the previous design, which
// pulled search out into SearchSection (its own headed card below) on the
// reasoning that it deserved billing as a peer of the category grid rather
// than a hero accessory. SearchSection is untouched and still renders
// further down (Landing's "Browse everything" card, same `query` state) —
// this band's copy is a second, above-the-fold entry point, not a
// replacement.
//
// Expressed as two parallel layouts behind `desktop:`/`hidden` classes
// rather than an isMobile branch: isMobile starts false on every render
// (SSR-safe), so branching here would flash the desktop layout on a phone
// for one frame — the same reasoning as Landing's own inlineGridClass.
//
// The photo shows settings.desktopHeroImage when the admin has set one
// (Desktop tab's Hero card), and falls back to the original CSS gradient +
// watermark star otherwise, so a fresh community with no photo yet never
// renders broken.
export default function HeroHeading({
  settings,
  query,
  onQueryChange,
  interactive = true,
  mapIcon,
  onViewMap,
  onBrowseCategories,
}: Props) {
  const isMobile = useIsMobile()
  const { desktopHeroHeadline: headline, desktopHeroSubhead: subhead, desktopHeroImage: heroImage } = settings

  const viewMapButton = mapIcon != null && (
    <button
      onClick={onViewMap}
      className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
    >
      <span aria-hidden="true">{mapIcon}</span>
      View Map
    </button>
  )

  return (
    <>
      {/* Mobile — unchanged plain centered block. */}
      <section className="pt-12 sm:pt-16 text-center desktop:hidden">
        <h1 className="text-3xl sm:text-[40px] font-bold tracking-tight text-slate-900 leading-tight">
          {settings.heroTitle}
        </h1>
        <p className="mt-3 max-w-2xl mx-auto text-[15px] sm:text-base text-slate-500">
          {settings.mission}
        </p>
        {ui.search.landing && (
          <div className="mt-8 max-w-xl mx-auto">
            <SearchBox query={query} onQueryChange={onQueryChange} interactive={interactive} placeholder={settings.searchPlaceholder} />
          </div>
        )}
        {viewMapButton}
      </section>

      {/* Desktop — a full-bleed photo band, edge to edge under the header
          rather than a rounded card inside the page's usual max-w-6xl
          column. `w-screen` + `left-1/2` + `-translate-x-1/2` is the same
          full-bleed-inside-a-centered-container technique ResourceMapView
          already uses for the mobile map band (see that component's own
          doc, and the backstop rule in globals.css that this pattern is
          the one sanctioned exception to) — it breaks the section out of
          `<main>`'s `max-w-6xl mx-auto px-4 sm:px-6`, which nothing else on
          this page needs to do. The inner content wrapper below re-applies
          that same max-w-6xl/px-4 so the headline/search/buttons still line
          up with the header logo and every section beneath this one — only
          the photo itself actually reaches the viewport edges.
          desktopHeroHeadline/Subhead are the headline, not the site name —
          see the component doc for why (the header beside it already names
          the site). Search + the two buttons sit over the photo's left
          side, on a light wash gradient that keeps dark text legible while
          leaving the photo's right side uncovered. */}
      <section className="hidden desktop:block relative left-1/2 isolate min-h-[520px] w-screen -translate-x-1/2 overflow-hidden desktop:-mt-[60px]">
        {heroImage ? (
          // A real photo: it has content to describe, so it's a genuine
          // `alt`, not aria-hidden — the opposite of the placeholder below.
          <Image
            src={heroImage.url}
            alt={heroImage.alt}
            fill
            // The band is genuinely full-viewport-width now (see the
            // section's own w-screen doc above), not the old two-column
            // panel's ~40vw — 100vw is the real rendered width at every
            // desktop size, not just >=1024px.
            sizes="100vw"
            className="absolute inset-0 -z-10 object-cover"
            // Above the fold on every desktop load — worth the priority
            // fetch the same way a hero image normally is.
            priority
            unoptimized={!isOptimizableImage(heroImage.url)}
          />
        ) : (
          // A CSS pattern stand-in, not a real photo. aria-hidden, not
          // role="img": there's no real image content here to describe —
          // role="img" with no name is exactly the axe violation
          // ("role=img elements must have alternative text") that shipped
          // here once already.
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-br from-amber-200/60 via-amber-300/40 to-amber-700/40"
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-15">
              <svg width="130" height="130" viewBox="0 0 100 100" fill="none" stroke="white" strokeWidth="2.5">
                <polygon points="50,6 61,35 92,35 67,54 77,84 50,65 23,84 33,54 8,35 39,35" />
              </svg>
            </div>
          </div>
        )}
        {/* Light wash, not a dark scrim — the headline/search sit in dark
            text (matching the rest of the page) rather than white-on-photo,
            so this reads as one more content band instead of a poster.
            White, not amber — a tinted wash read as a solid block of color
            with a hard edge into the photo; white lets the photo's own
            tones show faintly through even under the text, which is what
            keeps this looking like one photo rather than a color panel
            butted up against one.
            Explicit stops, not Tailwind's default 0/50/100 spread — the
            default put a trace of white wash across the ENTIRE band,
            fading out only in the last few pixels at the right edge, so the
            photo never actually reached full, untinted saturation anywhere.
            Solid through 45% (covering the text column below, which is
            never wider than that) and fully resolved to transparent by 68%
            leaves a genuinely clean, fully uncovered right side of the
            photo, matching the mockup this was built from — a deliberately
            heavier/wider wash than an earlier pass here, which faded out
            gradually starting right at the left edge and left even the
            headline sitting on partially-faded photo instead of a solid
            band. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,white_0%,white_45%,transparent_68%)]"
        />
        <div className="mx-auto flex min-h-[520px] max-w-6xl flex-col justify-center px-4 pt-[calc(3.5rem+60px)] pb-14 sm:px-6">
          <h1 className="max-w-2xl text-6xl font-bold leading-[1.05] text-slate-900 text-balance">
            {headline}
          </h1>
          {subhead && (
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-slate-600">
              {subhead}
            </p>
          )}
          {ui.search.landing && (
            <div className="mt-8 max-w-md">
              <SearchBox query={query} onQueryChange={onQueryChange} interactive={interactive} placeholder={settings.searchPlaceholder} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={onBrowseCategories}
              // sage, not the site's usual amber accent — matches the
              // Sukkah banner's own desktop "Map View" button (see
              // CampaignBannerCard), the one place this palette already
              // exists in the app, rather than introducing a second green.
              className="inline-flex items-center gap-2 rounded-full bg-sage-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sage-700 cursor-pointer"
            >
              Browse Categories
            </button>
            {mapIcon != null && (
              <button
                onClick={onViewMap}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
              >
                <span aria-hidden="true">{mapIcon}</span>
                View Map
              </button>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
