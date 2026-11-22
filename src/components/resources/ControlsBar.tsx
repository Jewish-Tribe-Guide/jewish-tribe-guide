import type { ReactNode, RefObject } from 'react'

// A category page's search and list heading, in the bar that docks under
// the header on a computer (moved out of GenericDirectory whole).
export default function ControlsBar({
  sentinelRef,
  barRef,
  hidden,
  phoneHidden = false,
  headingInToolbar,
  heroOverlap,
  controlsStuck,
  hasMapColumn,
  controlsVisible,
  children,
}: {
  sentinelRef: RefObject<HTMLDivElement | null>
  barRef: RefObject<HTMLDivElement | null>
  hidden: boolean
  /** Hidden on a phone by CSS: before the page has measured the screen. */
  phoneHidden?: boolean
  headingInToolbar: boolean
  heroOverlap: boolean
  controlsStuck: boolean
  hasMapColumn: boolean
  controlsVisible: boolean
  children: ReactNode
}) {
  return (
    <>
      {/* Controls — sticky from lg up so search/filters/sort stay reachable
          on a long list instead of scrolling away above the fold. `top-14`
          matches SiteHeader's own fixed `h-14` (see that component) — on
          desktop SiteHeader itself stays pinned (no scroll-hide there), so
          this can sit at a fixed offset rather than measuring it. This bar
          gets its own scroll-hide instead (controlsVisible), so "always
          reachable" doesn't also mean "permanently glued to the top of the
          screen" while you're just reading down the list.
          Not gated on the `desktop:` custom variant (640px) — that's wide
          enough to fit the sticky bar but too narrow for it to be worth the
          fixed screen real estate it costs; `lg:` (1024px) is where a phone
          landscape or small tablet stops paying more than it gets back.
          The sentinel above it is a 1px scroll marker, not truly zero-height
          — an actual zero-area target can report `isIntersecting` as
          unreliably always-false in some browsers, since there's no overlap
          area to compute a ratio from. See controlsStuck's own doc for what
          it's for. Plain `h-px`, not `lg:h-px`: the observer that reads it
          is created unconditionally regardless of viewport width, so a
          zero-height sentinel on mobile could already latch in a wrong
          `isIntersecting` reading there — invisible at the time, since
          `controlsStuck`'s only visible effects are `lg:`-gated, but the
          bad reading doesn't self-correct just because the viewport later
          crosses into `lg:` (by rotating a device, or resizing a browser
          window past it). The docked white background then shows up on an
          unscrolled desktop page, sourced from a mobile-era reading that
          was already wrong before desktop-only styling ever had a chance
          to reveal it. */}
      <div ref={sentinelRef} aria-hidden className="h-px" />
      <div
        ref={barRef}
        hidden={hidden}
        // The "docked" look (white background, the padding it needs, the
        // negative margin that pulls it flush against the header above, the
        // shadow, and the hide-on-scroll transform) only ever applies once
        // `controlsStuck` says the bar has actually engaged its sticky
        // position. Applying `lg:-mt-3`/`lg:bg-white` unconditionally used to
        // pull this bar's own solid background up 12px REGARDLESS of scroll
        // position — while still sitting in normal flow, that overlapped
        // whatever sat directly above it (DirectoryHeader's title row),
        // clipping its bottom few pixels even on a page load with no
        // scrolling at all. The hide-on-scroll transform had the same bug in
        // reverse: applied unconditionally, it reacted to ANY downward
        // scroll on the page, so the bar slid away while a visitor was still
        // scrolling through content well above it — before it had ever
        // become sticky, let alone been scrolled past.
        //
        // lg:border-x once docked: the bar's white is only a few shades off
        // the page's own grey background, and the shadow above only reads
        // on its bottom edge — with nothing marking the left/right edges,
        // the two near-whites just ran together there. A thin border gives
        // it the same framing the full-bleed results panel below already
        // has (border-slate-200).
        //
        // lg:px-4 once docked, too: the search input and filter pills have
        // no horizontal padding of their own — un-docked, they just line up
        // flush with the grid below, which is fine there. But the moment
        // this box gets its own visible edges (the border above), that same
        // zero-padding reads as the search box and pills touching the frame
        // directly, with no breathing room. The inset only appears once
        // docked, same as the border/shadow/background it's paired with.
        //
        // lg:transition-all, not lg:transition-transform: the hide-on-scroll
        // slide is the only thing that was ever animated — background,
        // padding, margin, border and shadow all popped in/out the instant
        // `controlsStuck` flipped, no transition at all. That's a smooth
        // slide with several other properties snapping on top of it in the
        // same frame, which reads as a stutter right at the moment it docks
        // rather than one clean motion. transition-all covers all of it with
        // the same duration, so it settles together.
        // Not sticky where the map sits beside the list: the map stays in
        // view instead, and the list's heading moves to the top of its
        // column (see hasMapColumn).
        // No margin under it when the list's heading is its last line (the
        // categories with no map): the heading's own padding is the space
        // above the list, as it is where the heading tops the list column.
        // A margin as well left a gap there and nowhere else (Oct 20).
        className={`${phoneHidden ? 'phone:hidden ' : ''}${headingInToolbar ? (heroOverlap && controlsStuck ? 'lg:mb-[48px]' : '') : 'mb-4'} space-y-2 ${hasMapColumn ? '' : 'lg:sticky lg:top-14 lg:z-30 lg:transition-all lg:duration-300'} ${
          hasMapColumn
            ? ''
            : controlsStuck
            ? `lg:border-x lg:border-slate-200 lg:bg-white lg:px-4 lg:pt-3 lg:pb-3 lg:-mt-3 lg:shadow-[0_6px_12px_-8px_rgba(15,23,42,0.35)] ${controlsVisible ? 'lg:translate-y-0' : 'lg:-translate-y-full'}`
            : 'lg:translate-y-0'
        }`}
      >
        {children}
      </div>
    </>
  )
}
