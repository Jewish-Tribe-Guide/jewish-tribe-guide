'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import LocationControl, { type LocationControls } from '@/components/home/LocationControl'
import CommunitySwitcher from '@/components/CommunitySwitcher'
import { StarOfDavid } from '@/components/icons'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { useActiveCommunity } from '@/lib/communityContext'
import { isOptimizableImage } from '@/lib/imageHosts'
import { nextHeaderVisible, useHeaderCollapsed } from '@/lib/headerVisibility'
import { useIsMobile } from '@/lib/useIsMobile'
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
}

export default function SiteHeader({ onGoHome, location, previewSettings }: Props) {
  const live = useSiteSettings()
  const settings = previewSettings ?? live
  const { community, communities, setCommunity } = useActiveCommunity()
  // The admin preview renders this header against a draft, not the live site —
  // a switcher there would change what the real visitor sees from inside a
  // preview, so it's suppressed by passing no communities.
  const switchable = previewSettings ? null : communities

  const collapsed = useHeaderCollapsed()
  const isMobile = useIsMobile()
  const [scrollVisible, setScrollVisible] = useState(true)

  // Hides the header while scrolling down — more room for what you're
  // reading — and brings it back the moment you scroll up, even slightly,
  // the same pattern most mobile browsers use for their own address bar.
  // Desktop keeps the header pinned; scrolling behaves differently there and
  // there's no cramped-screen problem to solve.
  useEffect(() => {
    // No listener needed on desktop — `visible` below ignores scrollVisible
    // there, so there's nothing for one to drive.
    if (!isMobile) return
    let lastY = window.scrollY

    // Deliberately no rAF/ticking-flag throttle here. That pattern schedules
    // the actual work on the next animation frame and guards re-entry with a
    // boolean that only that frame clears — and a frame can simply never
    // come (the tab going to the background mid-scroll, which a phone does
    // constantly: a notification pull-down, switching apps, the screen
    // locking). Then the flag is stuck true forever and every future scroll
    // event is silently ignored — the header dies hidden, or dies shown, and
    // nothing in the UI says why. The work here is a couple of comparisons
    // and a setState; it doesn't need deferring, and running it inline can't
    // get stuck.
    function onScroll() {
      const y = window.scrollY
      // `prevY` must be read into a const BEFORE `lastY` moves, and the
      // updater below must close over that const rather than over `lastY`
      // itself. React only sometimes runs a functional updater immediately —
      // it does when nothing else is queued for this fiber, and otherwise
      // defers it to render. A deferred updater reading `lastY` would read it
      // AFTER the reassignment below, i.e. compare `y` against itself: both
      // direction checks in nextHeaderVisible fail on equal values, so it
      // returns the current state and the header never moves.
      //
      // That's why this looked like it worked and then stopped — one slow
      // scroll with an empty queue evaluates eagerly and behaves; actual
      // scrolling queues updates, takes the deferred path, and the header
      // silently freezes wherever it was.
      const prevY = lastY
      lastY = y
      setScrollVisible((prev) => nextHeaderVisible(y, prevY, prev))
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isMobile])

  // On desktop `scrollVisible` just isn't consulted, rather than an effect
  // fighting to keep resetting it to true — one less thing that could race
  // the isMobile flip on a resize across the breakpoint.
  const scrollHideVisible = !isMobile || scrollVisible

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
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
        {/* On mobile the logo only hides while no location is set — that's when
            the wide "Set location" pill competes with the full title + tagline
            for the row, and dropping the mark frees the ~46px needed to keep
            the text full. Once a location is set the pill collapses to just its
            pin, so the logo comes back. Always shown from sm up. */}
        {(() => {
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
                // The logo is usually a Supabase upload, but it's a free text
                // field — a pasted URL from anywhere must not throw and take
                // the header down with it. See imageHosts.ts.
                unoptimized={!isOptimizableImage(settings.logoUrl)}
              />
            </span>
          ) : (
            <span className={`${location.address ? 'grid' : 'hidden'} sm:grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-white`}>
              <StarOfDavid className="h-5 w-5" />
            </span>
          )
          const title = (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[15px] font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
                {settings.name}
              </span>
              <span className="block truncate text-[11px] text-slate-500">
                {settings.tagline}
              </span>
            </span>
          )

          // One community: the header is exactly what it always was — the whole
          // mark-plus-title block is a single "go home" button.
          if (!switchable || switchable.length < 2) {
            return (
              <button
                onClick={onGoHome}
                className="flex min-w-0 flex-1 items-center gap-2.5 cursor-pointer group text-left"
              >
                {mark}
                {title}
              </button>
            )
          }

          // Several communities: the title becomes the switcher (it already
          // names where you are), so "go home" moves onto the mark beside it.
          // Split into two controls rather than one because a button can't
          // nest inside a button.
          return (
            <div className="flex min-w-0 flex-1 items-center gap-2.5 group">
              <button onClick={onGoHome} aria-label="Home" className="contents cursor-pointer">
                {mark}
              </button>
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

        <div className="ml-auto">
          <LocationControl controls={location} />
        </div>
      </div>
    </header>
  )
}
