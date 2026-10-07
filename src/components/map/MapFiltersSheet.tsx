'use client'

import { useIsMobile } from '@/lib/useIsMobile'
import { orderForPicking } from '@/lib/listGroups'
import { CategoryGlyph } from '@/lib/categoryIcons'
import MobileSheet from '@/components/resources/MobileSheet'
import { FilterChip, FiltersDialog, SwitchRow, type FilterSelect } from '@/components/resources/FiltersSheet'

// ── The Map page's Filters (agreed Sep 30) ───────────────────────────────────
// The category pages' own sheet (FiltersSheet), with a section for each
// category the map is showing: its Open now where it keeps hours, its
// yes/no switches, its pick-lists, in the category's own order. Above them,
// one Open now for everything showing that keeps hours, when two or more
// do: on turns each one on, off turns them all off, and it reads as on
// only when all of them are (see mapFilters.ts).
//
// A sheet from the bottom on a phone, a dialog on a wider screen, as on a
// category page. The map updates as each is switched; "Show N places" just
// closes.

export type MapFilterSection = {
  id: string
  label: string
  icon?: string
  color: string
  /** "5 of 73", or "all 14" while nothing narrows it. */
  note: string
  /** Where the category keeps hours. */
  openNow: boolean | null
  booleans: { key: string; label: string; on: boolean }[]
  selects: FilterSelect[]
}

type Props = {
  isOpen: boolean
  onClose: () => void
  top: { shown: boolean; on: boolean; note: string | null }
  onTopOpenNow: () => void
  sections: MapFilterSection[]
  onOpenNow: (categoryId: string) => void
  onBoolean: (categoryId: string, key: string) => void
  onSelect: (categoryId: string, key: string, value: string) => void
  onClearAll: () => void
  anyOn: boolean
  /** How many places the map shows with these filters. */
  count: number
}

export default function MapFiltersSheet(props: Props) {
  const isMobile = useIsMobile()
  const body = <Body {...props} />
  return isMobile ? (
    <MobileSheet isOpen={props.isOpen} onClose={props.onClose} title="Filters" draggable>
      {body}
    </MobileSheet>
  ) : (
    <FiltersDialog isOpen={props.isOpen} onClose={props.onClose} wide>
      {body}
    </FiltersDialog>
  )
}

function Body({ top, onTopOpenNow, sections, onOpenNow, onBoolean, onSelect, onClearAll, anyOn, onClose, count }: Props) {
  return (
    <div className="space-y-4" data-testid="map-filters">
      {/* Always takes its line, as on a category page's sheet: appearing on
          the first tap would push every switch below it down. */}
      <div className={`-mt-1 flex justify-end ${anyOn ? '' : 'invisible'}`}>
        <button type="button" onClick={onClearAll} className="cursor-pointer text-sm font-bold text-primary hover:underline">
          Clear all
        </button>
      </div>
      {top.shown && (
        <div data-testid="map-filters-open-all">
          <SwitchRow label="Open now" on={top.on} onToggle={onTopOpenNow} />
          {top.note && <p className="-mt-0.5 text-[13px] text-muted">{top.note}</p>}
        </div>
      )}
      {sections.length === 0 && <p className="text-[15px] text-muted">Nothing showing has filters. Turn on a category above.</p>}
      {sections.map((s) => (
        <section key={s.id} aria-label={s.label} className="space-y-3 border-t border-slate-200 pt-4" data-testid={`map-filters-${s.id}`}>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: s.color }} aria-hidden="true">
              {s.icon && <CategoryGlyph categoryId={s.id} icon={s.icon} className="h-4 w-4" />}
            </span>
            <h3 className="text-[17px] font-extrabold text-ink">{s.label}</h3>
            <span className="ml-auto text-[13px] text-muted">{s.note}</span>
          </div>
          {s.openNow !== null && <SwitchRow label="Open now" on={s.openNow} onToggle={() => onOpenNow(s.id)} />}
          {s.booleans.map((b) => (
            <SwitchRow key={b.key} label={b.label} on={b.on} onToggle={() => onBoolean(s.id, b.key)} />
          ))}
          {s.selects.map((sel) => (
            <fieldset key={sel.key} className="space-y-2">
              <legend className="mb-2 text-[13px] font-bold text-slate-500">{sel.label}</legend>
              <div className="flex flex-wrap gap-2">
                {orderForPicking(sel.values).map((v) => (
                  <FilterChip key={v} label={v} on={sel.chosen.includes(v)} onToggle={() => onSelect(s.id, sel.key, v)} />
                ))}
              </div>
            </fieldset>
          ))}
        </section>
      ))}
      <button
        type="button"
        onClick={onClose}
        className="h-12 w-full cursor-pointer rounded-xl bg-primary text-[15.5px] font-bold text-white transition-transform active:scale-[0.99]"
      >
        Show {count} place{count === 1 ? '' : 's'}
      </button>
    </div>
  )
}
