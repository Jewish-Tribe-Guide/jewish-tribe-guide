'use client'

import type { MouseEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import LocationControl, { type LocationControls } from '@/components/home/LocationControl'
import CommunitySwitcher from '@/components/CommunitySwitcher'
import HeaderNav from '@/components/HeaderNav'
import { StarOfDavid } from '@/components/icons'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { useActiveCommunity } from '@/lib/communityContext'
import { useHeaderCollapsed, useScreenHeader, useScrollShowHide } from '@/lib/headerVisibility'
import { useIsMobile } from '@/lib/useIsMobile'
import { routes } from '@/lib/routes'
import { isModifiedClick } from '@/lib/isModifiedClick'
import type { SiteSettings } from '@/lib/siteSettings'

type Props = {
  /** Called when the visitor clicks the site title — takes them back to the
   *  Landing page. */
  onGoHome: () => void
  /** Address anchor for proximity sorting (top-right pill). */
  location: LocationControls
  /** Admin-preview only: render with these settings instead of the live,
   *  fetched ones — used by the Site tab's Preview button. */
  previewSettings?: SiteSettings
  /** Admin category preview only (CategoryPreview.tsx) — that tool renders
   *  this header around one isolated category screen, and always has since
   *  before HeaderNav existed (SectionTabs, its predecessor, never mounted
   *  there either — it only ever lived on the home screen). A full
   *  Categories/Map/More nav navigating out of that isolated preview isn't
   *  something that tool ever offered, so this keeps it that way rather than
   *  silently gaining site-wide nav chrome it wasn't designed around. */
  hideNav?: boolean
}

export default function SiteHeader({ onGoHome, location, previewSettings, hideNav }: Props) {
  const live = useSiteSettings()
  const settings = previewSettings ?? live
  const { community, communities, setCommunity } = useActiveCommunity()
  // The admin preview renders this header against a draft, not the live site —
  // a switcher there would change what the real visitor sees from inside a
  // preview, so it's suppressed by passing no communities.
  const switchable = previewSettings ? null : communities

  const collapsed = useHeaderCollapsed()
  const isMobile = useIsMobile()

  // On mobile, a category/hospital/synagogue directory screen (the only
  // things that ever call useSetScreenHeader — see GenericDirectory) swaps
  // the static site name for its own "‹ {title}", the same pattern the cRc
  // Kosher app's own drill-down screens use. Desktop keeps the site name and
  // relies on Breadcrumb ("{upLabel} / {title}") instead — there's already
  // room there for both, so this only ever applies at mobile widths.
  const screenHeader = useScreenHeader()
  const showScreenHeader = isMobile && !!screenHeader

  // Hides the header while scrolling down — more room for what you're
  // reading — and brings it back the moment you scroll up, even slightly,
  // the same pattern most mobile browsers use for their own address bar.
  // Desktop keeps the header pinned; scrolling behaves differently there and
  // there's no cramped-screen problem to solve. See useScrollShowHide's own
  // doc for the scroll-anchor mechanism this shares with the category
  // directory's sticky filter bar (GenericDirectory.tsx).
  const scrollHideVisible = useScrollShowHide(isMobile)

  // `collapsed` (a whole screen, like the mobile map, saying "get out of the
  // way for as long as I'm mounted") is `invisible h-0`, not `hidden`
  // (display: none) and not just translated off-screen.
  //
  // `position: sticky` still occupies its normal box in the document flow
  // even when transformed away — transforms are paint-only, they don't
  // affect layout — so a translated-but-still-`sticky` header left a
  // header-height gap of empty space at the top of the screen it was
  // supposedly out of, and the map rendered starting below that gap rather
  // than filling it. `h-0` closes that gap.
  //
  // `display: none` also closes it, and was the first thing tried — but it
  // removes the header's entire subtree from rendering, and that subtree is
  // where LocationControl's popover lives. The mobile map's pin FAB opens
  // that exact popover (see ResourceMapView) while the header is collapsed,
  // and with `hidden` there was nothing left mounted to open — confirmed
  // live: the popover's own text was still in the DOM, genuinely present,
  // just not painted anywhere. `invisible` (visibility: hidden) hides the
  // header's own content the same way, but — unlike display — a descendant
  // can opt back in with its own `visible`, which is exactly what the
  // popover does (see its wrapper in LocationControl.tsx), so it can still
  // render while everything else in the collapsed header stays gone.
  const className = collapsed
    ? 'invisible h-0 overflow-visible'
    : `sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200/80 pt-[env(safe-area-inset-top)] transition-transform duration-300 ${
        scrollHideVisible ? 'translate-y-0' : '-translate-y-full'
      }`

  return (
    <header
      className={className}
    >
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-10">
        {/* On mobile the logo only hides while no location is set — that's when
            the wide "Set location" pill competes with the name for the row,
            and dropping the mark frees the ~46px needed to keep the text
            full. Once a location is set the pill collapses to just its pin,
            so the logo comes back. Always shown from sm up. */}
        {showScreenHeader && screenHeader ? (
          <button
            onClick={screenHeader.onBack}
            className="flex min-w-0 shrink items-center gap-2 cursor-pointer group text-left"
          >
            <svg
              className="h-5 w-5 shrink-0 text-primary"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-slate-900">
              {screenHeader.title}
            </span>
          </button>
        ) : (() => {
          const mark = settings.logoUrl?.trim() ? (
            // next/image rather than a CSS background. Beyond the resizing and
            // format negotiation, this also closes a small hole: the URL used
            // to be interpolated straight into a style string, so an admin
            // logo URL containing a ")" broke the rule, and the value was
            // never escaped. Here it's an attribute, handled by React.
            <span
              className={`${location.address ? 'block' : 'hidden'} sm:block relative h-9 w-9 shrink-0 overflow-hidden rounded-xl`}
              aria-hidden="true"
            >
              <Image
                src={settings.logoUrl}
                alt=""
                fill
                sizes="36px"
                className="object-cover"
                // Always unoptimized, unlike the card photos.
                //
                // Two reasons, one of which has already bitten. It renders at
                // 36px from a file measured in kilobytes, so the optimizer
                // saves close to nothing on it — and routing it through a
                // metered service means the site's own logo is the thing that
                // breaks when the month's Image Optimization quota runs out.
                // That is exactly what happened: uploading a new logo put a
                // fresh URL in front of an exhausted optimizer, /_next/image
                // returned 402, and the header rendered a broken-image icon
                // while every already-cached listing photo carried on fine.
                //
                // A broken logo is a worse failure than an unresized one, and
                // this is a single small asset on every page rather than a
                // grid of photos, so it opts out permanently. The card photos
                // still go through the optimizer (see imageHosts.ts, and the
                // NEXT_PUBLIC_IMAGES_UNOPTIMIZED switch for when quota is the
                // problem across the board).
                unoptimized
              />
            </span>
          ) : (
            <span className={`${location.address ? 'grid' : 'hidden'} sm:grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-white`}>
              <StarOfDavid className="h-5 w-5" />
            </span>
          )
          // Tagline used to render as a second line here — dropped along
          // with the header's own extra height (h-16 → h-14 below): it said
          // roughly the same thing the hero's mission line says a few
          // pixels of scroll later ("Guide for residents, visitors, and
          // patients" next to the hero's own mission sentence), so the
          // header carried the message twice before a visitor had read
          // either in full.
          //
          // This WAS tagline's only render site — its own type doc in
          // siteSettings.ts says exactly that ("Shown under the site name in
          // the header"). Left admin-editable rather than removed (still
          // shows in the Site tab, still round-trips to the database) since
          // deleting a field is a bigger, separate decision than deciding
          // not to render it — but as of this change it has no surface
          // anywhere on the live site. Worth knowing before spending more
          // time writing good taglines into a field nothing shows.
          const title = (
            <span className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
              {settings.name}
            </span>
          )

          // A real <Link>, not a <button onClick> — is what makes cmd/ctrl/
          // middle-click "open in new tab" work, which a click handler alone
          // never supports regardless of what it navigates to. Still calls
          // onGoHome() on a plain click rather than leaving it to Link's own
          // href-driven navigation: goHome (useSiteNavigation) also resets
          // Landing's local search/scroll state when the visitor is already
          // home — a real behavior beyond the URL change that Link's default
          // click handling doesn't know to do. preventDefault only for a
          // plain click, so a modified one still falls through to the
          // browser's native new-tab/new-window handling on the underlying
          // <a> untouched.
          const goHomeClick = (e: MouseEvent) => {
            if (isModifiedClick(e)) return
            e.preventDefault()
            onGoHome()
          }

          // One community: the header is exactly what it always was — the whole
          // mark-plus-title block is a single "go home" link.
          if (!switchable || switchable.length < 2) {
            return (
              <Link
                href={routes.home(community.slug)}
                onClick={goHomeClick}
                className="flex min-w-0 shrink items-center gap-2.5 cursor-pointer group text-left"
              >
                {mark}
                {title}
              </Link>
            )
          }

          // Several communities: the title becomes the switcher (it already
          // names where you are), so "go home" moves onto the mark beside it.
          // Split into two controls rather than one because a button can't
          // nest inside a button.
          return (
            <div className="flex min-w-0 shrink items-center gap-2.5 group">
              <Link href={routes.home(community.slug)} onClick={goHomeClick} aria-label="Home" className="contents cursor-pointer">
                {mark}
              </Link>
              <CommunitySwitcher
                communities={switchable}
                activeSlug={community?.slug ?? null}
                onSelect={setCommunity}
              >
                {title}
              </CommunitySwitcher>
            </div>
          )
        })()}

        {/* Categories/Map/More — see HeaderNav's own doc for why this
            replaces the old full-width tab row rather than sitting beside
            it, and `hideNav`'s own doc for the one caller that opts out. */}
        {!hideNav && <HeaderNav />}

        <div className="ml-auto">
          <LocationControl controls={location} compact={showScreenHeader} />
        </div>
      </div>
    </header>
  )
}
