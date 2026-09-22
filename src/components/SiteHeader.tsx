'use client'

import { useState, type MouseEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import LocationControl, { type LocationControls } from '@/components/home/LocationControl'
import CommunitySwitcher from '@/components/CommunitySwitcher'
import ContributePicker from '@/components/home/ContributePicker'
import HeaderNav from '@/components/HeaderNav'
import { PlusIcon, StarOfDavid } from '@/components/icons'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { useActiveCommunity } from '@/lib/communityContext'
import { useHeaderCollapsed, useHeaderOverlaid, useScreenHeader, useScrollShowHide, useScrolledPastTop } from '@/lib/headerVisibility'
import { useIsMobile } from '@/lib/useIsMobile'
import { routes } from '@/lib/routes'
import { isModifiedClick } from '@/lib/isModifiedClick'
import { ui } from '@/lib/uiConfig'
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

  const [addOpen, setAddOpen] = useState(false)
  // The admin preview renders this header against a draft, not the live site —
  // a switcher there would change what the real visitor sees from inside a
  // preview, so it's suppressed by passing no communities.
  const switchable = previewSettings ? null : communities

  const collapsed = useHeaderCollapsed()
  const isMobile = useIsMobile()

  // "Add a place" — desktop only. `hideNav` is reused as the "isolated
  // preview, no site-wide affordances" signal CategoryPreview already
  // sends: that tool renders this header around one category detached from
  // the real routing/provider stack, and a real Add flow (a category picker
  // deep-linking into `?form=create`) has nowhere sane to land from inside
  // it. Mobile dropped this button entirely (not just restyled to an icon)
  // once every category page grew its own floating Add button
  // (GenericDirectory.tsx) that skips the picker and deep-links straight
  // into that category's own form — a strictly better flow for someone
  // already browsing a category than a generic picker would be. The
  // accepted cost: mobile has no general Add entry point outside a category
  // page any more (Home, Map) — someone starting from Home browses into a
  // category first (Browse Categories), the same first step the picker
  // would have made them take anyway, just via the category grid instead of
  // a search field.
  const showAdd = !hideNav && !isMobile && ui.contributions.add

  // Desktop-only: Landing opts the home screen into a transparent header
  // over its photo hero (useHeaderOverlay) until the page scrolls past the
  // hero, at which point the header goes solid the same way it always has
  // everywhere else. Neither hook does anything on mobile — see the
  // desktop-only classes below, and headerVisibility.tsx's own docs.
  const overlaid = useHeaderOverlaid()
  const scrolledPastTop = useScrolledPastTop()
  const transparent = overlaid && !scrolledPastTop && !collapsed

  // On mobile, a category/hospital/synagogue directory screen (the only
  // things that ever call useSetScreenHeader — see GenericDirectory) swaps
  // the static site name for its own "‹ {title}", the same pattern the cRc
  // Kosher app's own drill-down screens use. Desktop keeps the site name
  // instead — its persistent logo/nav is already a permanent way back to
  // Home, and the screen's own heading already says where you are, so this
  // only ever applies at mobile widths.
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
  // Mobile classes are byte-for-byte what they were before this — only the
  // `desktop:` utilities below change behavior, and only while `transparent`
  // is true (the home screen, unscrolled). Once scrolled, or on any other
  // screen, desktop gets the same solid white/border treatment it always
  // has, just spelled out under `desktop:` instead of falling through to
  // the shared `bg-white/90 backdrop-blur` mobile treatment.
  const className = collapsed
    ? 'invisible h-0 overflow-visible'
    : `sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200/80 pt-[env(safe-area-inset-top)] transition-transform transition-colors duration-300 ${
        scrollHideVisible ? 'translate-y-0' : '-translate-y-full'
      } ${
        transparent
          ? 'desktop:bg-transparent desktop:border-transparent desktop:backdrop-blur-none'
          : 'desktop:bg-white desktop:border-b desktop:border-slate-200/80'
      }`

  return (
    <header
      className={className}
      // Named so the browser's View Transition (SlugScreen/Landing's
      // directional slide, see navTransitions.ts) treats this header as its
      // own stable layer instead of sweeping it into the sliding content —
      // see globals.css's own `::view-transition-group(site-header)` rule,
      // which suppresses any animation on it. Without this, the header
      // would visibly slide/flash along with the content, breaking the one
      // fixed reference point a directional transition depends on.
      //
      // 'none' while collapsed — a *named* `view-transition-name` forces
      // Chromium to promote the element to its own top-layer-adjacent paint
      // layer permanently, not just during an active transition (confirmed
      // live: removing the name was the only thing that fixed it — z-index
      // on the header, or on descendants, made no difference at all, not
      // even z-index: 9999). That silently wins against EVERY normal
      // z-index in the document, including the mobile map's own fullscreen
      // `z-50` layer (ResourceMapView.tsx) sitting on top of this collapsed
      // (invisible, zero-height) header — so LocationControl's popover,
      // opened by the map's own pin button while collapsed (see that
      // component's own doc), rendered and even reported itself `open`,
      // just never actually paintable above the map. Nothing here needs the
      // name while collapsed anyway: there's no visible header content for
      // a slide transition to protect.
      style={{ viewTransitionName: collapsed ? 'none' : 'site-header' }}
    >
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 h-14 desktop:h-[60px] flex items-center gap-10">
        {showScreenHeader && screenHeader ? (
          <button
            onClick={screenHeader.onBack}
            className="flex min-w-0 shrink items-center gap-2.5 cursor-pointer group text-left"
          >
            {/* Same h-9 w-9 footprint and gap-2.5 as the logo mark below, so
                the title lands at the exact x-position it does on the home
                screen — a visitor's eye doesn't have to re-find it after a
                back-navigation. Circular chip (border + white fill + shadow),
                not a bare icon: mirrors LocationControl's own pill on the
                opposite side of this row, so the two ends of the header read
                as a matched pair rather than one polished control and one
                plain glyph — the same "circular back button" treatment apps
                like WhatsApp use. */}
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white shadow-sm">
              <svg
                className="h-5 w-5 text-primary"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </span>
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
              className="block relative h-9 w-9 shrink-0 overflow-hidden rounded-xl desktop:h-11 desktop:w-11"
              aria-hidden="true"
            >
              <Image
                src={settings.logoUrl}
                alt=""
                fill
                sizes="(min-width: 640px) 44px, 36px"
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
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-white desktop:h-11 desktop:w-11">
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
            <span className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-slate-900 group-hover:text-primary transition-colors desktop:font-serif desktop:text-2xl desktop:font-semibold desktop:text-ink">
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
          //
          // On mobile, though, this block only ever renders on the home
          // screen itself — every other screen swaps it for the back button
          // above (showScreenHeader) or the header collapses entirely (the
          // map) — so there's nowhere for "go home" to usefully go. Plain,
          // non-interactive text there instead of a link to the page you're
          // already on.
          if (!switchable || switchable.length < 2) {
            if (isMobile) {
              return (
                <span className="flex min-w-0 shrink items-center gap-2.5">
                  {mark}
                  {title}
                </span>
              )
            }
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

        <div className="ml-auto flex items-center gap-2">
          {/* Replaces CommunityStrip, a hero banner that only lived on the
              home screen and, in its own words, existed to fix mobile
              having "no way in at all" to add a listing (desktop's own way
              in was buried in a three-dot menu). That fixed discoverability
              once someone was already on the home screen; it did nothing
              for the actual complaint that prompted this — people not
              realizing the site is more than a static directory in the
              first place, on any screen. A real, persistent, always-visible
              control here does both jobs the banner tried to: it's on every
              screen (this header, not just the home hero), and unlike a
              bare icon, the "Add a place" label is itself the awareness
              signal — no separate explanatory sentence needed. "Suggest a
              correction" needed no equivalent move: it already has a real
              affordance (Edit/Report on every listing) and the footer
              already explains it (SiteFooter.tsx). */}
          {showAdd && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              aria-label="Add a place"
              className="shrink-0 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:bg-slate-50 cursor-pointer desktop:px-4 desktop:py-2"
            >
              <PlusIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-primary" />
              {/* Icon-only below sm — same reasoning LocationControl's own
                  pill uses for its tightest breakpoint, just applied one
                  step earlier since this is now a second pill sharing the
                  same row. The aria-label above carries the name either
                  way, so this hiding never touches the accessible name. */}
              <span className="hidden sm:inline">Add a place</span>
            </button>
          )}
          <LocationControl controls={location} />
        </div>
      </div>
      {addOpen && <ContributePicker onClose={() => setAddOpen(false)} />}
      {/* White diagonal shape behind the logo/nav, overlaid+unscrolled only,
          desktop only — the mockup's white panel on the left ending in a
          slanted edge, with the hero photo visible through the rest of the
          header strip. `aria-hidden`: purely decorative. A sibling of the
          content row above (both direct children of <header>, which is
          itself `position: sticky` and so the containing block this
          `absolute` shape sizes against — full header width, not the row's
          own max-w-6xl column), not nested inside it: e2e/header.spec.ts's
          Categories mega-menu test finds the content row by `header > div`,
          the first direct child of <header>, so this has to come SECOND in
          source order. `-z-10` (rather than earlier DOM order) is what
          keeps it painted behind the row's real content despite coming
          after it. */}
      {transparent && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 -z-10 hidden w-[58%] desktop:block bg-white/95"
          style={{ clipPath: 'polygon(0 0, 100% 0, 94% 100%, 0 100%)' }}
        />
      )}
    </header>
  )
}
