'use client'
// ResourceMapView's category chips and the phone's full-screen picker
// (split out Nov 21, no behaviour change): what a chip, All, Saved or a
// picker checkbox does to the selection. Called where the block it came
// from sat, so the view's effects run in the same order.
import { track } from '@vercel/analytics'
import { useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { FilterOption } from './CategoryFilter'
import type { MobileNearbySheetHandle } from './MobileNearbySheet'

export function useMapCategories({
  options,
  setSelected,
  effectiveSelected,
  pinnedSelected,
  setPinnedSelected,
  eruvimOn,
  mappablePinnedCount,
  setSidebarCollapsed,
  isMobile,
  nearbySheetRef,
}: {
  options: FilterOption[]
  setSelected: Dispatch<SetStateAction<Set<string> | null>>
  effectiveSelected: Set<string>
  pinnedSelected: boolean
  setPinnedSelected: (on: boolean) => void
  eruvimOn: boolean
  mappablePinnedCount: number
  setSidebarCollapsed: (collapsed: boolean) => void
  isMobile: boolean
  nearbySheetRef: RefObject<MobileNearbySheetHandle | null>
}) {
  // Mobile only — the quick chip row over the map shows a handful of
  // categories plus a trailing "More" chip; tapping it opens this full-screen
  // picker with every category, Google-Maps-style.
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  // The picker's own working copy of the selection — edited freely by its
  // checkboxes/Show all, never touching the real `selected` until Apply.
  // Without this, every checkbox tap live-filtered the map behind the sheet,
  // and Back had no "previous state" left to return to since there was
  // nothing else it could have meant except "close" (see closeCategoriesPicker,
  // which discards this and touches nothing). Only category selection is
  // drafted this way — the per-category bool/select field filters
  // (boolFields/selectFilters below) stay live, same as before.
  const [draftSelected, setDraftSelected] = useState<Set<string>>(new Set())
  // Bumped every time the full-screen picker above closes (Back or Apply) —
  // handed to the compact row as CategoryFilter's `resortToken`, the only
  // signal (besides first mount) that should reorder it: selected categories
  // to the front, unselected after, both highest-to-lowest. An ordinary tap
  // on a chip already in that row must never reorder it — only having been
  // off-screen, on the picker, resets what's worth remembering.
  const [categoryResortToken, setCategoryResortToken] = useState(0)
  // Back: discard the draft, apply nothing. (openCategoriesPicker/
  // applyCategoriesPicker live further down, after `effectiveSelected` is
  // declared — they read it, and defining them up here, ahead of that
  // useMemo, is exactly what broke React Compiler's ability to preserve it.)
  const closeCategoriesPicker = () => {
    setCategoriesOpen(false)
    setCategoryResortToken((n) => n + 1)
  }

  // Whether every category is on: everything shows, saved places with the
  // rest, so the Saved chip doesn't count. Mirrors CategoryFilter's own
  // `allOn` (the "All" chip's lit state). It used to need Saved on too, so
  // with any place saved the map opened with every category lit and All
  // not (the user, Oct 23).
  const allChipsOn = effectiveSelected.size === options.length
  // The full-screen category picker (mobile "More") lets a visitor uncheck
  // every box while browsing its own draft (draftSelected) — see
  // toggleCategoryCheckbox — but leaving with nothing checked would filter
  // the map down to nothing shown. Gates Apply there instead of
  // auto-reverting mid-edit; Pinned rides along as an escape hatch exactly
  // like it does for the compact row, since the picker itself has no Pinned
  // checkbox of its own to turn off.
  const draftNoneSelected = draftSelected.size === 0 && !pinnedSelected && !eruvimOn
  const draftAllOn = draftSelected.size === options.length
  // Opens the picker with a fresh snapshot of what's live right now — so
  // Back (which touches nothing, see closeCategoriesPicker above) truly
  // restores "the way it was before you entered the page", not whatever
  // was left over from a previous visit.
  const openCategoriesPicker = () => {
    setDraftSelected(new Set(effectiveSelected))
    setCategoriesOpen(true)
  }
  // Apply: commit the draft as the real selection, then close the same way
  // Back does.
  const applyCategoriesPicker = () => {
    setSelected(draftSelected)
    setSidebarCollapsed(false)
    closeCategoriesPicker()
  }

  const toggle = (id: string) => {
    // Starting from "everything shown", a tap on a single chip should narrow
    // straight down to just that category — same as Google Maps' filter
    // chips — rather than requiring an unclick-everything-else step first.
    // Once you've narrowed down, further taps add/remove from that subset
    // as before. A category's own stored filters ride along either way — a
    // filter stays put across an off/on cycle, so it's there again when the
    // category comes back.
    setSidebarCollapsed(false)

    // Picking a category on mobile brings the nearby sheet up to half, the way
    // the Google Maps app does — the results are the point of the tap, and
    // leaving them behind a collapsed handle makes the chip look like it did
    // nothing. Only when the tap SELECTS a category: switching one off is a
    // narrowing gesture, and shoving the sheet up over the map for it would be
    // the opposite of what was asked. `raise` leaves an already-expanded sheet
    // alone, so it can't shrink a list someone deliberately opened.
    const raiseSheet = () => {
      if (isMobile) nearbySheetRef.current?.raise()
    }

    if (allChipsOn) {
      // Narrowing to just this one category also switches Pinned off — same
      // "everything else unclicks" promise the Pinned chip's own tap makes
      // in the other direction (see togglePinnedSelected).
      setSelected(new Set([id]))
      setPinnedSelected(false)
      raiseSheet()
      track('category_filter_selected', { category: id, source: 'chip' })
      return
    }
    const next = new Set(effectiveSelected)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
      raiseSheet()
      // Only on select, not deselect — mirrors listing_opened's "the
      // interesting event is choosing something" convention elsewhere.
      track('category_filter_selected', { category: id, source: 'chip' })
    }
    // Unclicking the last remaining chip goes back to showing everything,
    // same as Google Maps/Too Good To Go's filter rows — there's no
    // "nothing shown" state a chip tap can land you in, so a separate
    // Hide-all shortcut has nothing left to do. The eruv lines count as
    // something shown: with them on, the last category off leaves them.
    if (next.size === 0 && !pinnedSelected && !eruvimOn) {
      showAll()
      return
    }
    setSelected(next)
  }
  // Every category on, and Saved off: All already shows every saved place.
  // It used to turn Saved on too, so the address said `pinned=1` and,
  // opened again, showed only the saved places (the user, Oct 23).
  const showAllPlaces = () => {
    // Re-tapping "All" while it's already the active filter used to still
    // build a brand-new Set — a fresh reference flows through
    // effectiveSelected → visiblePoints → ResourceMap's `points` prop, which
    // reruns that component's fit-bounds effect and visibly re-zooms the
    // map for no actual change in what's shown.
    if (allChipsOn) return
    setSelected(new Set(options.map((o) => o.id)))
    setPinnedSelected(false)
    setSidebarCollapsed(false)
  }
  // The All chip: every place. It never touches the eruv lines. With the
  // lines on, a lit All goes off like any other chip, leaving the lines
  // alone; with them off it stays lit, since the map is never empty (the
  // user, Oct 15).
  const showAll = () => {
    if (!allChipsOn) return showAllPlaces()
    if (!eruvimOn) return
    setSelected(new Set())
    setPinnedSelected(false)
    setSidebarCollapsed(false)
  }
  // If Pinned was the ONLY thing narrowing the map (no categories checked —
  // see togglePinnedSelected's own "narrow to just this one" branch) and the
  // visitor unpins their last listing — possibly from somewhere else in the
  // app entirely, not a tap on this screen's own chips — there's nothing
  // left for that state to show. Revert to everything, same "never leave
  // nothing shown" promise toggle/togglePinnedSelected/toggleCategoryCheckbox
  // already keep for an on-screen tap; this covers the one way the same
  // "nothing selected" state can be reached from OUTSIDE a chip tap.
  useEffect(() => {
    // With the eruv lines on, they're left showing on their own.
    if (pinnedSelected && mappablePinnedCount === 0 && effectiveSelected.size === 0) {
      if (eruvimOn) setPinnedSelected(false)
      else showAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappablePinnedCount, pinnedSelected, effectiveSelected.size])
  // Same "surface the results" side effects toggling a category chip gets
  // (raise the mobile sheet, drop the desktop sidebar's collapse) — without
  // them, turning Pinned on looked like it did nothing when nothing else
  // had already narrowed the map.
  const togglePinnedSelected = () => {
    // Same "narrow to just this one" behavior toggle() gives every category
    // chip when everything's on — Pinned is just another chip in the row
    // (see CategoryFilter's pinnedChip prop), so it has to unclick
    // everything else the same way tapping a category chip would.
    if (allChipsOn) {
      setSelected(new Set())
      setPinnedSelected(true)
      setSidebarCollapsed(false)
      if (isMobile) nearbySheetRef.current?.raise()
      return
    }
    const next = !pinnedSelected
    // Same revert-to-all as unclicking the last category chip — turning
    // Pinned off shouldn't be able to leave the row with nothing on.
    if (!next && effectiveSelected.size === 0 && !eruvimOn) {
      showAll()
      return
    }
    setPinnedSelected(next)
    if (next) {
      setSidebarCollapsed(false)
      if (isMobile) nearbySheetRef.current?.raise()
    }
  }
  // A plain, unconditional on/off toggle — unlike `toggle` above, this never
  // "narrows to just this one" when everything's currently shown. That smart
  // behavior makes sense for the compact chip row (each chip reads as its own
  // tap target, not literally a checkbox), but a real <input type="checkbox">
  // in the picker needs to mean exactly what it shows: checked ⇄ unchecked,
  // full stop — nothing else is defensible for an actual checkbox control.
  //
  // Unlike the chip row's `toggle`, this deliberately does NOT auto-revert to
  // "show all" when the last box is unchecked — the picker is a full screen
  // with its own Apply button, so a visitor un-checking everything is mid-edit,
  // not asking to see nothing. The "nothing shown" guard lives at Apply time
  // instead (see draftNoneSelected / the Apply button below), which also lets
  // the picker show an explicit "select at least one" note rather than
  // silently snapping every box back on. Edits draftSelected, not the real
  // selection — see openCategoriesPicker/applyCategoriesPicker.
  const toggleCategoryCheckbox = (id: string) => {
    setDraftSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        track('category_filter_selected', { category: id, source: 'checkbox' })
      }
      return next
    })
  }
  // The picker's own "Show all" — a toggle, not a one-way reset like the
  // compact row's version (`showAll` above): with the draft able to sit at
  // zero while browsing, re-tapping "Show all" from an already-all-checked
  // draft should clear it back to zero rather than being a no-op, so it
  // works as both directions of the same shortcut.
  const toggleDraftShowAll = () => {
    setDraftSelected(draftAllOn ? new Set() : new Set(options.map((o) => o.id)))
  }

  return {
    categoriesOpen,
    draftSelected,
    categoryResortToken,
    closeCategoriesPicker,
    allChipsOn,
    draftNoneSelected,
    draftAllOn,
    openCategoriesPicker,
    applyCategoriesPicker,
    toggle,
    showAllPlaces,
    showAll,
    togglePinnedSelected,
    toggleCategoryCheckbox,
    toggleDraftShowAll,
  }
}
