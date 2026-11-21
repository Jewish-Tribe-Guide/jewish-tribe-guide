'use client'
// The phone's search over the map (split out of ResourceMapView Nov 21, no
// behaviour change): ‹ back, the search box, Set location, then the category
// chips or the box's suggestions. The view's comment above where it mounts
// it says why it floats on the map.
import type { ReactNode, RefObject } from 'react'
import { PinIcon } from '@/components/icons'
import type { LatLng } from '@/lib/googleMapsLinks'
import type { MobileNearbySheetHandle } from './MobileNearbySheet'
import type { ResourceMapViewProps } from './mapViewShared'

/* ── Floating search + filters (mobile) — laid directly over the
        map, Google-Maps-style, instead of pushing it down. Category
        chips sit right under the search bar as their own
        always-visible scroll row, same as Google Maps — no
        separate "Filters" button/sheet. ───────────────────────── */
export default function MobileMapSearch({
  overlayRef,
  backTo,
  inputRef,
  input,
  setInput,
  setSearchFocused,
  submitSearch,
  clearSearch,
  nearbySheetRef,
  locationButtonRef,
  activeLocation,
  tracking,
  hasOptions,
  dropdownShown,
  chips,
  suggestions,
}: {
  overlayRef: (el: HTMLDivElement | null) => void
  backTo: ResourceMapViewProps['backTo']
  inputRef: RefObject<HTMLInputElement | null>
  input: string
  setInput: (v: string) => void
  setSearchFocused: (focused: boolean) => void
  submitSearch: () => void
  clearSearch: () => void
  nearbySheetRef: RefObject<MobileNearbySheetHandle | null>
  locationButtonRef: RefObject<HTMLButtonElement | null>
  activeLocation: LatLng | null
  tracking: boolean
  hasOptions: boolean
  dropdownShown: boolean
  /** The category chips, shown while the dropdown isn't. */
  chips: ReactNode
  /** The box's dropdown, shown while it's open. */
  suggestions: ReactNode
}) {
  return (
    <div
      ref={overlayRef}
      className="absolute inset-x-0 top-0 z-10 px-3 pb-2 desktop:hidden"
      style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
    >
      <div className="flex items-center gap-2">
        {backTo && (
          <button
            type="button"
            onClick={backTo.onBack}
            aria-label={backTo.label}
            data-testid="map-back"
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-ink shadow-lg"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        {/* A real <form> is the one reliable way to catch a mobile
            keyboard's "Search" action key across browsers — it
            guarantees submission the same way pressing Enter on a
            desktop keyboard does, rather than depending on that
            key reliably dispatching a keydown 'Enter'. */}
        <form
          onSubmit={(e) => { e.preventDefault(); submitSearch() }}
          className="flex flex-1 items-center rounded-full bg-white px-3.5 py-2.5 shadow-lg"
        >
          <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Search name, address, 'open now'…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => {
              setSearchFocused(true)
              // Drop the sheet out of the way while actively
              // searching — at half or full it sits over the
              // search box/dropdown. Keeps any selected place
              // (lower, not collapse), so dismissing the keyboard
              // brings it right back to where it was.
              nearbySheetRef.current?.lower()
            }}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchFocused(false)
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {input && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              // See the desktop copy of this same search box's
              // own doc above (hover:bg-slate-100/active:bg-slate-200)
              // for why this needed the fill, not just the color.
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </form>

        {/* ── Set/change location — Too-Good-To-Go-style: a
                round icon button riding right alongside the
                search bar (which shrinks to make room) instead
                of its own standing FAB down in the bottom-right
                corner. Styled to match the header's own
                LocationControl pill (same border/shadow/PinIcon,
                same tracking-dot swap) rather than a bespoke
                look, just collapsed to icon-only — there's no
                room for the pill's label in this row. Opens the
                same header popover as DistanceNote, via the
                TOGGLING 'jpc:toggle-location' event rather than
                DistanceNote's plain "open" one — this is a
                standing button a visitor can tap again while the
                popover is already up, and a second tap should
                close it, not re-open what's already open —
                rather than jumping straight into requesting GPS:
                a visitor who'd rather type an address gets that
                choice instead of a permission prompt they didn't
                ask for. The bottom-right corner it used to own is
                now the live-location FAB's (below). Passes its
                own DOM node along on the event so the popover can
                anchor (drop down) directly under IT, the same as
                the header pill's own popover does elsewhere,
                instead of floating as a detached bottom sheet. ── */}
        <button
          ref={locationButtonRef}
          type="button"
          onClick={() =>
            document.dispatchEvent(
              new CustomEvent('jpc:toggle-location', { detail: { anchor: locationButtonRef.current } }),
            )
          }
          aria-label={activeLocation ? 'Change your location' : 'Set your location'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:bg-slate-50 cursor-pointer"
        >
          {tracking ? (
            <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
              <span className="inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
          ) : (
            <PinIcon filled={!!activeLocation} className="h-4 w-4 text-primary" />
          )}
        </button>
      </div>

      {/* ── Category filter chips — Google-Maps-style: a always-
              visible horizontal-scroll row of pill toggles right
              under the search bar, floating directly on the map
              (no separate "Filters" button/sheet). Ducks out of the
              way while the autocomplete dropdown below is showing,
              same as Google Maps swapping chips for suggestions. ── */}
      {hasOptions && !dropdownShown && (
        <div className="mt-2">
          {chips}
        </div>
      )}

      {/* ── Autocomplete dropdown — Google-Maps-style: matching
              places while typing, tap one to jump straight to its
              card instead of just narrowing the list. ─────────── */}
      {dropdownShown && suggestions}
    </div>
  )
}
