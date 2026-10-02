'use client'

import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { MAX_WALK_LISTS, WALK_LIST_MINUTES, walkGroupFields, walkListFromKey, walkListKey, walkListTargets, type WalkList } from '@/lib/walkList'
import { cardFieldChoices, listingPartsFromKey, listingPartsKey, type ListingParts } from '@/lib/listingParts'
import { inputClass } from './CategoryFormFields'

// ── The category editor's "On each listing" settings ────────────────────────
// The places within a walk (walkList.ts), and what an admin adds to each
// opened listing (listingParts.ts). Both edited as plain values and kept in
// the draft as strings, so the save only sends them when they changed (see
// useCategorySaveWorkflow).

const sectionClass = 'bg-white border border-slate-200 rounded-lg p-4'
const headClass = 'block text-sm font-semibold text-slate-800 mb-1'
const helpClass = 'block text-[11px] text-muted mt-1'

/** Other categories' places within a walk: several lists, each with how
 *  far and how it's grouped. */
export function WalkListsEditor({
  value,
  onChange,
  self,
  categories,
}: {
  value: string
  onChange: (key: string) => void
  self: Pick<CategoryConfig, 'id'>
  categories: readonly CategoryConfig[]
}) {
  const lists = walkListFromKey(value)
  const targets = walkListTargets(categories, self)
  if (targets.length === 0 && lists.length === 0) return null
  const put = (next: WalkList[]) => onChange(walkListKey(next))
  const unused = targets.filter((t) => !lists.some((l) => l.categoryId === t.id))

  return (
    <section className={sectionClass} data-testid="walk-lists-editor">
      <h3 className={headClass}>Places within a walk</h3>
      <ul className="space-y-2">
        {lists.map((walk, i) => {
          const target = categories.find((c) => c.id === walk.categoryId)
          const groupFields = target ? walkGroupFields(target) : []
          const update = (patch: Partial<WalkList>) => put(lists.map((l, j) => (j === i ? { ...l, ...patch } : l)))
          const name = target?.pluralLabel ?? walk.categoryId
          return (
            <li key={walk.categoryId} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                aria-label={`List ${i + 1}: which places`}
                value={walk.categoryId}
                onChange={(e) => update({ categoryId: e.target.value, groupBy: undefined })}
                className={`${inputClass} sm:flex-1`}
              >
                {!target && <option value={walk.categoryId}>{walk.categoryId}</option>}
                {targets
                  .filter((t) => t.id === walk.categoryId || !lists.some((l) => l.categoryId === t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.pluralLabel}
                    </option>
                  ))}
              </select>
              <select
                aria-label={`How far a walk for ${name}`}
                value={walk.maxMinutes}
                onChange={(e) => update({ maxMinutes: Number(e.target.value) })}
                className={`${inputClass} sm:w-40 sm:shrink-0`}
              >
                {WALK_LIST_MINUTES.map((m) => (
                  <option key={m} value={m}>
                    Within {m} minutes
                  </option>
                ))}
              </select>
              <select
                aria-label={`Group ${name} by`}
                value={walk.groupBy ?? ''}
                onChange={(e) => update({ groupBy: e.target.value || undefined })}
                className={`${inputClass} sm:w-48 sm:shrink-0`}
              >
                <option value="">Grouped by distance</option>
                {groupFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    Grouped by {f.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => put(lists.filter((_, j) => j !== i))} className="text-sm font-semibold text-red-700 hover:underline sm:shrink-0">
                Remove
              </button>
            </li>
          )
        })}
      </ul>
      {unused.length > 0 && lists.length < MAX_WALK_LISTS && (
        <button
          type="button"
          onClick={() => put([...lists, { categoryId: unused[0].id, maxMinutes: 30 }])}
          className="mt-2 text-sm font-semibold text-primary hover:underline"
        >
          + Add a list
        </button>
      )}
      <span className={helpClass}>
        On each of this category&rsquo;s listings, every place in the chosen category within that
        many minutes&rsquo; walk, nearest first, e.g. the synagogues near each hotel. Grouped by
        one of that category&rsquo;s choices, in its option order: the first option leads the
        list&rsquo;s answer (&ldquo;Nearest restaurant: &hellip;&rdquo;). Times are rough: a
        straight line at 25 minutes a mile, and the list says so.
      </span>
    </section>
  )
}

/** The named main card, the Shabbos card, and Set as location. */
export function ListingPartsEditor({
  value,
  onChange,
  fields,
  hasAddress,
}: {
  value: string
  onChange: (key: string) => void
  fields: readonly CategoryField[]
  hasAddress: boolean
}) {
  const parts = listingPartsFromKey(value)
  const choices = cardFieldChoices(fields).filter((f) => f.key)
  const put = (next: ListingParts) => onChange(listingPartsKey(next))
  const main = parts.main ?? null
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key])

  return (
    <section className={sectionClass} data-testid="listing-parts-editor">
      <h3 className={headClass}>On each listing</h3>

      <div className="mt-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={!!main}
            onChange={(e) => put({ ...parts, main: e.target.checked ? { title: '', fields: [] } : undefined })}
          />
          A card of its own first
        </label>
        <span className={helpClass}>
          Instead of what the listing holds (times, items, hours), it opens with this card, even
          before anyone has filled it in: e.g. &ldquo;Who to call first&rdquo; on a hospital, with
          a name, what they help with, and a phone that becomes a Call button.
        </span>
        {main && (
          <div className="mt-2 space-y-2 pl-6">
            <input
              aria-label="The card’s title"
              placeholder="Who to call first"
              value={main.title}
              onChange={(e) => put({ ...parts, main: { ...main, title: e.target.value } })}
              className={inputClass}
            />
            {(!main.title.trim() || main.fields.length === 0) && (
              <p className="text-[12px] font-semibold text-caution">Give it a title and tick at least one field, or it won&rsquo;t show.</p>
            )}
            <FieldTicks
              legend="Its fields"
              choices={choices}
              ticked={main.fields}
              onToggle={(key) => put({ ...parts, main: { ...main, fields: toggle(main.fields, key) } })}
            />
          </div>
        )}
      </div>

      <div className="mt-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" checked={!!parts.shabbos} onChange={(e) => put({ ...parts, shabbos: e.target.checked ? { fields: [] } : undefined })} />
          A &ldquo;This Shabbos&rdquo; card
        </label>
        <span className={helpClass}>
          Candle lighting, the nearest minyan, and the fields ticked below (an eruv, kosher food
          inside). First on the page on Friday and Erev Yom Tov until candle lighting; lower the
          rest of the week. A choice named after an eruv on the eruv page links to its weekly
          status.
        </span>
        {parts.shabbos && (
          <div className="mt-2 pl-6">
            <FieldTicks
              legend="Fields on the Shabbos card"
              choices={choices}
              ticked={parts.shabbos.fields}
              onToggle={(key) => put({ ...parts, shabbos: { fields: toggle(parts.shabbos!.fields, key) } })}
            />
          </div>
        )}
      </div>

      {hasAddress && (
        <div className="mt-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={!!parts.setLocation} onChange={(e) => put({ ...parts, setLocation: e.target.checked || undefined })} />
            &ldquo;Set as location&rdquo; among its buttons
          </label>
          <span className={helpClass}>
            For a place people stay at, like a hospital: one tap and every page measures from it.
            Every listing already offers it in its &hellip; menu.
          </span>
        </div>
      )}
    </section>
  )
}

function FieldTicks({
  legend,
  choices,
  ticked,
  onToggle,
}: {
  legend: string
  choices: readonly CategoryField[]
  ticked: readonly string[]
  onToggle: (key: string) => void
}) {
  if (choices.length === 0) return <p className="text-[12px] text-muted">Add the fields under Details first, then tick them here.</p>
  return (
    <fieldset>
      <legend className="text-[12px] font-semibold text-slate-600">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {choices.map((f) => (
          <label key={f.key} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={ticked.includes(f.key)} onChange={() => onToggle(f.key)} />
            {f.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
