'use client'

import Image from 'next/image'
import { ui } from '@/lib/uiConfig'
import type { SiteSettings } from '@/lib/siteSettings'
import { isOptimizableImage } from '@/lib/imageHosts'
import { GridIcon, MapFoldIcon, SkylineIcon } from '@/components/icons'
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
// Search sits inside the band, overlaid on the photo alongside Browse
// Categories/View Map — this is now the ONLY search box on desktop.
// It used to have a second copy in SearchSection, a standalone headed card
// below the hero, on the reasoning that search deserved billing as a peer
// of the category grid rather than a hero accessory; SearchSection is gone
// (the user's own call, reviewing the built page — a second input for the
// same `query` state read as redundant once both were on screen at once).
// The "Browse everything" card (Landing.tsx) still reads/writes the same
// `query` state this band does, so typing here still narrows/surfaces its
// results — it just doesn't have an input of its own any more.
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
//
// Desktop mockup match (docs/desktop-mockup-plan.md, Phase 3): serif
// headline and a faint skyline silhouette low in the band. The mockup's own
// "People · Places · Community" tagline and the short quote over the
// photo's right side (naming the community by its own `community.config`
// region) were both cut after review — the user's own call, not a mockup
// deviation. The Browse Categories button carries a small grid icon and
// View Map an outline folded-map glyph, replacing the raw admin-set emoji
// this used to render directly next to the label.
export default function HeroHeading({
  settings,
  query,
  onQueryChange,
  interactive = true,
  mapIcon,
  onViewMap,
  onBrowseCategories,
}: Props) {
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

      {/* Desktop — a full-bleed band, edge to edge under the header rather
          than a rounded card inside the page's usual max-w-6xl column.
          `w-screen` + `left-1/2` + `-translate-x-1/2` is the same full-
          bleed-inside-a-centered-container technique ResourceMapView
          already uses for the mobile map band (see that component's own
          doc, and the backstop rule in globals.css that this pattern is
          the one sanctioned exception to) — it breaks the section out of
          `<main>`'s `max-w-6xl mx-auto px-4 sm:px-6`, which nothing else on
          this page needs to do. The inner content wrapper below re-applies
          that same max-w-6xl/px-4 so the headline/search/buttons still line
          up with the header logo and every section beneath this one.
          desktopHeroHeadline/Subhead are the headline, not the site name —
          see the component doc for why (the header beside it already names
          the site).
          The photo itself is NOT full-bleed any more — it's confined to a
          `w-[58%]` box anchored to the right edge, matching a reference
          image the user supplied: solid `bg-cream` (the section's own
          background) on the left where the headline/search/buttons sit,
          photo only on the right. A full-bleed photo washed to fake a
          plain left side (the previous design) computed object-cover's
          crop against the ENTIRE band's width — a very short/wide shape —
          and cropped away most of a normal photo's height regardless of
          where the wash made it look plain; see the photo box's own
          comment below for why confining the box itself is what actually
          fixes that, not just where the fade happens. */}
      <section className="hidden desktop:block relative left-1/2 isolate min-h-[435px] w-screen -translate-x-1/2 overflow-hidden bg-cream desktop:-mt-[60px]">
        {/* The photo lives in its OWN right-anchored box — NOT the full
            w-screen band (that was the earlier design: one full-bleed photo
            with a wash faked over the left side to look plain). The user
            flagged that version as "zoomed in": object-cover was computing
            its crop against the full band's width, an extremely short/wide
            shape (easily 3.5:1), so almost all of a normal-aspect photo's
            height got cropped away no matter where the wash made it LOOK
            plain. A photo confined to `w-[58%]` computes its crop against a
            far less extreme shape (~1.9:1 at typical desktop widths), so
            object-cover keeps far more of the original scene — the "whole
            picture" look the reference image has. The left ~42% is now a
            genuinely flat `bg-cream` (the section's own background, set
            above) with no photo pixels under it at all, matching that
            reference exactly instead of approximating it with a gradient. */}
        <div className="absolute inset-y-0 right-0 -z-10 w-[58%]">
          {heroImage ? (
            // A real photo: it has content to describe, so it's a genuine
            // `alt`, not aria-hidden — the opposite of the placeholder below.
            <Image
              src={heroImage.url}
              alt={heroImage.alt}
              fill
              sizes="58vw"
              // object-top, not object-cover's default (center): even
              // confined to this narrower box, the shape is still wider
              // than a typical photo's own aspect ratio, so SOME cropping
              // still happens — object-top keeps sky/rooftops in frame
              // (what a street photo's "whole scene" reads as) instead of a
              // center crop landing mid-building/street level.
              className="object-cover object-top"
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
              className="absolute inset-0 bg-gradient-to-br from-amber-200/60 via-amber-300/40 to-amber-700/40"
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-15">
                <svg width="130" height="130" viewBox="0 0 100 100" fill="none" stroke="white" strokeWidth="2.5">
                  <polygon points="50,6 61,35 92,35 67,54 77,84 50,65 23,84 33,54 8,35 39,35" />
                </svg>
              </div>
            </div>
          )}
          {/* A short soft fade at the photo box's OWN left edge, not a wash
              spanning most of the band any more — the flat bg-cream to its
              left already does the "plain on the left" job, so this only
              needs to soften the seam between the two rather than fake an
              entire plain region out of a still-visible photo. */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(to_right,var(--color-cream)_0%,transparent_100%)]"
          />
        </div>
        {/* Faint skyline, low and behind the text column — purely
            decorative (aria-hidden), `-z-10` inside this section's own
            `isolate` so it never competes with the wash/photo layers
            above. */}
        <SkylineIcon className="pointer-events-none absolute bottom-0 left-0 -z-10 h-auto w-[360px] text-slate-400 opacity-15" />
        <div className="mx-auto flex min-h-[435px] max-w-6xl flex-col justify-center px-4 pt-[calc(3.5rem+60px)] pb-14 sm:px-6">
          <h1 className="max-w-2xl font-serif text-[64px] font-bold leading-[1.02] tracking-tight text-ink text-balance">
            {headline}
          </h1>
          {subhead && (
            <p className="mt-3 max-w-[46ch] text-lg text-slate-600">
              {subhead}
            </p>
          )}
          {ui.search.landing && (
            <div className="mt-8 max-w-[585px]">
              <SearchBox
                query={query}
                onQueryChange={onQueryChange}
                interactive={interactive}
                placeholder={settings.searchPlaceholder}
                className="pl-6 pr-2.5 py-3"
              />
            </div>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={onBrowseCategories}
              className="inline-flex items-center gap-2 rounded-full bg-brand-teal px-6 py-3 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-teal-dark cursor-pointer"
            >
              <GridIcon className="h-[18px] w-[18px]" />
              Browse Categories
            </button>
            {mapIcon != null && (
              <button
                onClick={onViewMap}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-[15px] font-medium text-ink shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
              >
                <MapFoldIcon className="h-[18px] w-[18px]" />
                View Map
              </button>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
