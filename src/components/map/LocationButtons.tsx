'use client'
// ResourceMapView's location buttons on the map (split out Nov 21, no
// behaviour change): the computer's live-tracking toggle and the phone's
// recenter button. Each mounts only where ui.map.liveTracking is on.
import type { RefObject } from 'react'
import type { LatLng } from '@/lib/googleMapsLinks'

/* ── Live-tracking toggle (desktop only) — a map control, not a
        sidebar row, same as Google Maps' own "my location" button.
        Bottom-left so it never collides with the re-center pill
        ResourceMap draws bottom-right once a location is set. ── */
export function DesktopTrackingButton({ tracking, onClick }: { tracking: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={tracking ? 'Stop tracking my location' : 'Track my location'}
      aria-pressed={tracking}
      className={`absolute bottom-3 left-3 z-10 hidden h-10 w-10 items-center justify-center rounded-full shadow-md ring-1 cursor-pointer desktop:flex ${
        tracking
          ? 'bg-blue-600 text-white ring-blue-600 hover:bg-blue-700'
          : 'bg-white text-slate-600 ring-slate-900/10 hover:bg-slate-50'
      }`}
    >
      {/* The phone's location button's arrow, not an emoji. */}
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2 19 21 12 17 5 21z" />
      </svg>
    </button>
  )
}

/* Mobile-only recenter FAB — Google-Maps/Too-Good-To-Go-style
    navigation-arrow button, bottom-right. Same job as
    ResourceMap's desktop Re-center/Following pill — pan back to
    whatever anchor is set, address or live GPS, it doesn't
    care which — just icon-only and living in the corner that
    pill can't use on mobile (MobileNearbySheet owns bottom-left
    there). It used to branch on `tracking` instead of
    `activeLocation`, so a visitor who'd typed an address (no
    GPS involved) got a permission prompt instead of a pan back
    to their own address. Starting GPS itself isn't this
    button's job at all — that's the "set/change location" pin
    next to the search bar (above), same as how desktop keeps
    its GPS toggle (bottom-left) separate from its recenter pill
    (bottom-right). No anchor yet → open that same picker
    instead of assuming GPS. */
export function MobileRecenterButton({
  activeLocation,
  follow,
  setFollow,
  locationButtonRef,
}: {
  activeLocation: LatLng | null
  follow: boolean
  setFollow: (follow: boolean) => void
  locationButtonRef: RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      onClick={() => {
        if (!activeLocation) {
          document.dispatchEvent(
            new CustomEvent('jpc:toggle-location', { detail: { anchor: locationButtonRef.current } }),
          )
          return
        }
        setFollow(true)
      }}
      aria-label={!activeLocation ? 'Set your location' : follow ? 'Following your location' : 'Recenter'}
      // active:bg-* — press feedback for a mobile-only FAB that
      // otherwise gave zero visual acknowledgment of a tap before
      // the map itself started panning a moment later. One step
      // darker than each resting background (blue-700 is this
      // codebase's own established hover/press step for
      // bg-blue-600 — see e.g. ResourceMap.tsx's own recenter
      // pill), so which one applies has to follow the same
      // `activeLocation && follow` branch the resting color does.
      className={`absolute bottom-[4.75rem] right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full shadow-md ring-1 ring-slate-900/10 cursor-pointer transition-colors desktop:hidden ${
        activeLocation && follow ? 'bg-blue-600 text-white active:bg-blue-700' : 'bg-white text-blue-600 active:bg-slate-100'
      }`}
    >
      <svg
        className={`h-5 w-5 ${activeLocation ? '' : 'opacity-40'}`}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 2 19 21 12 17 5 21z" />
      </svg>
    </button>
  )
}
