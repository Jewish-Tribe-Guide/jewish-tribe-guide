'use client'
// ResourceMapView's chips and round buttons (split out Nov 21, no behaviour
// change): the campaign's chip, Saved, Filters and the Eruv lines button.
// Each was a node the view built inline; the comments on why each looks as
// it does stay with the view, where it decides when to show them.
import { CHIP_GLYPH, CHIP_SIZE, type FilterOption } from './CategoryFilter'
import { BookmarkIcon, SlidersIcon } from '@/components/icons'
import { CategoryGlyph } from '@/lib/categoryIcons'

export function CampaignChip({
  campaignOption,
  campaignHighlighted,
  effectiveSelected,
  toggle,
}: {
  campaignOption: FilterOption
  campaignHighlighted: boolean
  effectiveSelected: Set<string>
  toggle: (id: string) => void
}) {
  return (
    <div
      data-testid="campaign-chip"
      className={`relative flex shrink-0 items-stretch rounded-full text-sm font-semibold transition-colors ${
        campaignHighlighted ? 'text-white' : 'bg-gradient-to-r from-amber-50 to-amber-100 text-amber-900'
      }`}
      style={campaignHighlighted ? { backgroundColor: campaignOption.color } : { boxShadow: 'inset 0 0 0 1.5px rgba(180,130,20,0.35)' }}
    >
      <button
        onClick={() => toggle(campaignOption.id)}
        aria-pressed={effectiveSelected.has(campaignOption.id)}
        className={`flex items-center gap-1 ${CHIP_SIZE} rounded-full cursor-pointer ${campaignHighlighted ? '' : 'hover:from-amber-100 hover:to-amber-200'}`}
      >
        <CategoryGlyph categoryId={campaignOption.id} className={`${CHIP_GLYPH} shrink-0`} />
        <span>{campaignOption.label}</span>
      </button>
    </div>
  )
}

// A standalone toggle, not one of CategoryFilter's own chips — it narrows
// ACROSS categories rather than toggling one, so it doesn't belong to
// that component's select/all/none model. Rendered by CategoryFilter
// itself, right after the "All" chip and before the real category
// chips — it's the most important shortlist, not just another category.
// Hidden until there's at least one pin: an always-visible "Pinned 0"
// that narrows the map to nothing isn't a useful default state for a
// feature nobody's touched yet.
// Display only, same reasoning as CategoryFilter's own chips — while
// "All" is on, Pinned is technically part of the selection too, but
// coloring it in adds nothing the map (showing everything already) hasn't
// already said. The real toggle state (aria-pressed, the click handler)
// stays keyed on `pinnedSelected` itself.
// "Saved" (Pin until Oct 14, canvas page "you", board YouMap): right after
// All, which includes it (the user, Oct 23) — the visitor's own places,
// not one more category.
export function PinnedChip({
  pinnedHighlighted,
  pinnedSelected,
  togglePinnedSelected,
  mappablePinnedCount,
}: {
  pinnedHighlighted: boolean
  pinnedSelected: boolean
  togglePinnedSelected: () => void
  mappablePinnedCount: number
}) {
  return (
    <div
      className={`relative flex shrink-0 items-stretch rounded-full border text-sm font-semibold transition-colors ${
        pinnedHighlighted ? 'border-transparent text-white' : 'border-slate-300 bg-white text-[#2563eb]'
      }`}
      // The same blue as the bookmark badge on a saved place's marker (see
      // ResourceMap's buildPin).
      style={pinnedHighlighted ? { backgroundColor: '#2563eb' } : undefined}
    >
      <button
        onClick={togglePinnedSelected}
        aria-pressed={pinnedSelected}
        className={`flex items-center gap-1 ${CHIP_SIZE} rounded-full cursor-pointer ${pinnedHighlighted ? '' : 'hover:bg-slate-50'}`}
      >
        <BookmarkIcon filled={pinnedHighlighted} className={CHIP_GLYPH} />
        <span>Saved</span>
        <span className={pinnedHighlighted ? 'text-white/80' : ''}>{mappablePinnedCount}</span>
      </button>
    </div>
  )
}

export function FiltersButton({ filtersOn, setFiltersOpen }: { filtersOn: number; setFiltersOpen: (open: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => setFiltersOpen(true)}
      aria-label={filtersOn > 0 ? `Filters, ${filtersOn} on` : 'Filters'}
      data-testid="map-filters-button"
      className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-primary ${CHIP_SIZE} font-bold shadow-sm transition-colors ${
        filtersOn > 0 ? 'bg-primary text-white hover:bg-primary-dark' : 'bg-white text-primary hover:bg-primary/5 active:bg-primary/10'
      }`}
    >
      <SlidersIcon className="h-4 w-4" />
      Filters
      {filtersOn > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[0.6875rem] text-primary">{filtersOn}</span>}
    </button>
  )
}

// The Eruv button: bottom-right on the map, above the live-location
// button on a phone and above zoom on a computer, so every chip in the row
// is a place filter (the user, Oct 15). There once there's a line to draw.
// Off, white with the eruv's icon in its colour; on, filled.
export function EruvButton({
  tapEruvButton,
  eruvimOn,
  eruvColor,
  eruvIcon,
}: {
  tapEruvButton: () => void
  eruvimOn: boolean
  eruvColor: string
  eruvIcon: string
}) {
  return (
    <button
      type="button"
      onClick={tapEruvButton}
      aria-pressed={eruvimOn}
      aria-label="Eruv lines"
      title="Eruv lines"
      data-testid="map-eruv-button"
      className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full shadow-md ring-1 ring-slate-900/10 transition-colors desktop:h-10 desktop:w-10 ${
        eruvimOn ? 'text-white' : 'bg-white hover:bg-slate-50 active:bg-slate-100'
      }`}
      style={eruvimOn ? { backgroundColor: eruvColor } : { color: eruvColor }}
    >
      <CategoryGlyph categoryId="eruv" icon={eruvIcon} className="h-6 w-6 desktop:h-5 desktop:w-5" />
    </button>
  )
}
