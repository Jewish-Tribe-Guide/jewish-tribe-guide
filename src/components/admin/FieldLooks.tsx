'use client'

import { useState, type ReactNode } from 'react'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { initialsOf } from '@/lib/listingRow'
import { answerText, askedBefore, filterLook, listingLook, madeUpPlace, rowLook, sampleAnswer, type Part } from '@/lib/fieldLooks'
import { FilterChip, SwitchRow } from '@/components/resources/FiltersSheet'
import { DetailFieldInput } from '@/components/resources/DetailFieldInput'
import { ChoiceButtons, asButtons } from '@/components/resources/ListingEditor'

// ── How it looks, beside a field (boards 33c and 34, Nov 9) ─────────────────
// The open field where a visitor meets it, on a made-up place: in the list,
// in Filters while it's in the filter, on the listing, and when adding.
// What's around it is faded and the field is outlined in blue, so the
// field is the one thing to look at. The filter and the add form are the
// site's own controls; the row and listing are drawn from the same rules
// the site draws them by (fieldLooks.ts). The whole click-around page is
// one link away.

const OUTLINE = 'rounded-md outline outline-2 outline-primary bg-blue-50'

export default function FieldLooks({
  category,
  field,
  placeName,
  canAdd,
  onShowOnRow,
  onWholePage,
}: {
  /** The page with the field on it (previewFocus.ts). */
  category: CategoryConfig
  field: CategoryField
  /** "A restaurant" (sampleName). */
  placeName: string
  /** Whether visitors add places here: no "When adding" otherwise. */
  canAdd: boolean
  /** The card's picker for the line it could go on (boards 20-23). */
  onShowOnRow?: (line: 'second' | 'third') => void
  onWholePage: () => void
}) {
  const item = madeUpPlace(category, placeName)
  const row = rowLook(category, field, item)
  const filter = filterLook(category, field)
  const listing = listingLook(category, field, item)
  return (
    <aside aria-label="How it looks" className="shrink-0 sticky top-8 self-start flex w-[340px] flex-col gap-3">
      <div>
        <h2 className="m-0 text-base font-bold text-slate-900">How it looks</h2>
        <p className="m-0 text-[13px] text-slate-500">On a made-up place</p>
      </div>

      <Panel title="In the list">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-2.5 py-2">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-900">
            {initialsOf(item.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">{item.name}</span>
            {row.facts.length > 0 && (
              <span className="block text-[13px] text-slate-500">
                <Parts parts={row.facts} />
              </span>
            )}
            {row.own.map((p, i) => (
              <span key={i} className="block truncate text-[13px] text-slate-500">
                <Parts parts={[p]} />
              </span>
            ))}
          </span>
        </div>
        {!row.onRow && (
          <p className="m-0 mt-2.5 text-sm text-slate-700">
            Not shown in the list.
            {row.canGoOn && onShowOnRow && (
              <>
                {' '}
                <button type="button" onClick={() => onShowOnRow(row.canGoOn!)} className="cursor-pointer font-bold text-primary hover:underline">
                  Show it on a row
                </button>
              </>
            )}
          </p>
        )}
      </Panel>

      {filter && (
        <Panel title="In Filters">
          <div className="mb-2 flex items-center justify-between text-slate-400">
            <span className="text-lg font-extrabold">Filters</span>
            <span aria-hidden="true">×</span>
          </div>
          <div className={`${OUTLINE} p-2.5`}>
            {filter.kind === 'switch' ? <FilterSwitch label={filter.label} /> : <FilterChips legend={filter.legend} values={filter.values} />}
          </div>
        </Panel>
      )}

      <Panel title="On the listing">
        <p className="m-0 text-lg font-extrabold text-slate-400">{item.name}</p>
        {listing.at === 'kind' && (
          <p className="m-0 mt-1 text-[14.5px] text-slate-400">
            <Parts parts={[...listing.parts, { text: '0.4 mi', mine: false }]} />
          </p>
        )}
        {listing.at === 'facts' && (
          <p className="m-0 mt-1 text-[14.5px] font-bold text-slate-400">
            <Parts parts={listing.parts} strong />
          </p>
        )}
        {listing.at === 'tagline' && <p className={`${OUTLINE} m-0 mt-2 px-1.5 py-1 text-[15px] text-slate-800`}>{listing.text}</p>}
        {listing.at === 'box' && (
          <>
            <div className={`${OUTLINE} mt-2 px-3 py-2.5`}>
              <p className="m-0 text-[15px] font-bold text-ink">{listing.title}</p>
              {listing.label && <p className="m-0 mt-1 text-[13px] font-semibold text-slate-500">{listing.label}</p>}
              <p className="m-0 mt-1 text-sm text-slate-800">{listing.text || 'A photo'}</p>
            </div>
            {listing.others.length > 0 && (
              <p className="m-0 mt-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-400">{listing.others.join(' · ')}</p>
            )}
          </>
        )}
        {listing.at === 'none' && <p className="m-0 mt-2 text-sm text-slate-700">Not shown on the listing.</p>}
      </Panel>

      {canAdd && <Adding category={category} field={field} item={item} />}

      <button type="button" onClick={onWholePage} className="self-start cursor-pointer text-[15px] font-bold text-primary hover:underline">
        See the whole page
      </button>
    </aside>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-[10px] border border-slate-200 bg-white p-3.5">
      <h3 className="m-0 mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  )
}

/** A line of parts, " · " between, the field's own outlined and the rest
 *  faded. */
function Parts({ parts, strong = false }: { parts: Part[]; strong?: boolean }) {
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="text-slate-400"> · </span>}
          {p.mine ? (
            <mark data-mine="" className={`${OUTLINE} px-1 ${strong ? 'font-bold' : ''} text-slate-800`}>
              {p.text}
            </mark>
          ) : (
            <span className="text-slate-400">{p.text}</span>
          )}
        </span>
      ))}
    </>
  )
}

function FilterSwitch({ label }: { label: string }) {
  const [on, setOn] = useState(true)
  return <SwitchRow label={label} on={on} onToggle={() => setOn((o) => !o)} />
}

function FilterChips({ legend, values }: { legend: string; values: { text: string; count?: number }[] }) {
  const [chosen, setChosen] = useState<string[]>(values.slice(0, 1).map((v) => v.text))
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-[13px] font-bold text-slate-500">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <FilterChip
            key={v.text}
            label={v.text}
            count={v.count}
            on={chosen.includes(v.text)}
            onToggle={() => setChosen((c) => (c.includes(v.text) ? c.filter((x) => x !== v.text) : [...c, v.text]))}
          />
        ))}
      </div>
    </fieldset>
  )
}

/** The row asked before it, faded, then the field's own input, the add
 *  form's own control, answered with the made-up place's answer. Typing
 *  in it changes nothing anywhere. */
function Adding({ category, field, item }: { category: CategoryConfig; field: CategoryField; item: ReturnType<typeof madeUpPlace> }) {
  const [value, setValue] = useState<unknown>(() => sampleAnswer(field))
  const before = askedBefore(category, field, item)
  // Hours, minyanim, contacts and a photo are a screen of their own when
  // adding; here, what they'd say.
  const big = field.type === 'hours' || field.type === 'minyanim' || field.type === 'contacts' || field.type === 'image'
  return (
    <Panel title="When adding">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400">
        <span className="font-semibold">{before.label}</span>
        <span className="truncate">{before.text || 'Add'}</span>
      </div>
      <div className={`${OUTLINE} mt-2 p-2.5`}>
        {big ? (
          <>
            <p className="m-0 text-sm font-medium text-slate-700">{field.label}</p>
            <p className="m-0 mt-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">{answerText(field, value) || 'Add a photo'}</p>
          </>
        ) : asButtons(field) ? (
          <ChoiceButtons field={field} value={value} onChange={setValue} />
        ) : (
          <DetailFieldInput field={field} value={value} onChange={setValue} />
        )}
      </div>
    </Panel>
  )
}
