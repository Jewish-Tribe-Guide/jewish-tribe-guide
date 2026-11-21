'use client'
// The computer's search box and its dropdown (split out of ResourceMapView
// Nov 21, no behaviour change). The view mounts it in one place at a time,
// floating on the map over the sidebar's top edge; see its comment there.
import type { ReactNode, RefObject } from 'react'
import { ArrowLeftIcon } from '@/components/icons'
import { SearchSuggestions } from './mapViewParts'
import type { MapViewPoint } from './mapViewShared'

// ── Desktop search box + its autocomplete dropdown — shared between the
// two places it can render: floating directly on the map (the default
// browsing state, Google-Maps-style) or embedded at the top of the
// sidebar (once something's actually been searched/picked). Only one of
// these ever actually mounts at a time (the two call sites are mutually
// exclusive on desktopNarrowed/desktopSelected), so this still respects
// "only one desktop <input> in the DOM at once" — see the mobile input's
// own comment about why that matters. ─────────────────────────────────
export default function DesktopSearchForm({
  inputRef,
  placeOpen,
  onBack,
  backLabel,
  input,
  setInput,
  setSearchFocused,
  submitSearch,
  clearSearch,
  dropdownShown,
  showOpenNowSuggestion,
  selectOpenNow,
  searchSuggestions,
  selectSuggestion,
  nothing,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  /** A place is open in the sidebar: ← back instead of the magnifier, and no ×. */
  placeOpen: boolean
  onBack: () => void
  backLabel: string
  input: string
  setInput: (v: string) => void
  setSearchFocused: (focused: boolean) => void
  submitSearch: () => void
  clearSearch: () => void
  dropdownShown: boolean
  showOpenNowSuggestion: boolean
  selectOpenNow: () => void
  searchSuggestions: MapViewPoint[]
  selectSuggestion: (p: MapViewPoint) => void
  nothing: ReactNode
}) {
  return (
    <div className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submitSearch()
        }}
        // 48px tall, Google Maps' own search box (the user, Oct 15).
        className="flex h-12 items-center rounded-full border border-slate-300 bg-white px-4 shadow-sm focus-within:ring-2 focus-within:ring-primary"
      >
        {/* A place open in the sidebar: ← back to the results, where the
            magnifier sits (Oct 15, board "A", as Google Maps does). It sits
            on the panel it acts on, so it can't read as leaving the map —
            that's the ✕ in the corner — and replaces the "‹ Back to list"
            line that used to sit under the search. While editing, it's the
            editor's ‹ too, one step back at a time like Escape: out of an
            open row, then out of the edit, then to the results. */}
        {placeOpen ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="-ml-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
        ) : (
          <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
        )}
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          // "Open now" is offered once the box is clicked into
          // (showOpenNowSuggestion).
          placeholder="Search name, address…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setSearchFocused(false)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-3 text-[0.9375rem] text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        {/* Not while a place is open: ← is the way back then, and the
            corner ✕ (Close map) stays the only ✕ on screen. */}
        {input && !placeOpen && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            // hover:bg-slate-100/active:bg-slate-200 — already rounded-full
            // with nothing filling it; same state-layer treatment as every
            // other icon-only button in this pass. Two independent copies of
            // this search box exist (mobile/desktop each have their own —
            // see this file's own doc), both missing this the same way, so
            // this fix is applied to both rather than just the mobile one.
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200 cursor-pointer"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </form>

      {/* ── Autocomplete dropdown — same Google-Maps-style behavior as
              mobile's: matching places while typing, click one to jump
              straight to its card. ─────────────────────────────────────── */}
      {dropdownShown && (
        <SearchSuggestions
          className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lg"
          rowPadding="px-3"
          openNow={showOpenNowSuggestion}
          onOpenNow={selectOpenNow}
          places={searchSuggestions}
          onPick={selectSuggestion}
          nothing={nothing}
        />
      )}
    </div>
  )
}
