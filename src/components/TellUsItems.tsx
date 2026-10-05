'use client'

import { useId, useState } from 'react'
import type { ReadItem } from '@/lib/messageReader'
import { addedItemName, alreadyListed, itemSuggestions, type ItemMark } from '@/lib/itemMarks'
import { itemName } from '@/lib/itemNames'
import { PlusIcon } from '@/components/icons'

// A store's items in the "+ Add" box, as the listing shows them (agreed Oct
// 5): what the message said, marked new, each with its "Not always in
// stock" and Remove; "+ Add another item" right under it, for one more
// while they're here; and what the store already lists, folded to a line.
// Nothing here is sent until the box's Send, which works the change out
// again on the server (itemsChange).

export type CurrentItems = { always: string[]; sometimes: string[] }

const same = (a: string, b: string) => itemName(a).toLowerCase() === itemName(b).toLowerCase()

/** What the items change on the listing as it is: added or moved, and
 *  taken off. Shown as changing, and what makes the card sendable. */
export function changingItems(current: CurrentItems, items: ReadItem[]): ReadItem[] {
  const listed = [...current.always, ...current.sometimes]
  return items.filter((i) => {
    if (i.doubt || i.availability === 'announced') return false
    if (i.availability === 'stopped') return listed.some((n) => same(n, i.name))
    const always = current.always.some((n) => same(n, i.name))
    const sometimes = current.sometimes.some((n) => same(n, i.name))
    return i.availability === 'sometimes' ? !sometimes : !always && !(sometimes && i.availability === 'seen')
  })
}

export default function TellUsItems({
  current,
  items,
  held,
  onChange,
}: {
  current: CurrentItems
  items: ReadItem[]
  /** What was read but isn't changed, and why ("Chicken: already listed"). */
  held: string[]
  onChange: (items: ReadItem[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [all, setAll] = useState(false)
  const listed = [...current.always, ...current.sometimes]
  const changing = changingItems(current, items)
  const set = (name: string, patch: Partial<ReadItem> | null) =>
    onChange(patch ? items.map((i) => (i.name === name ? { ...i, ...patch } : i)) : items.filter((i) => i.name !== name))
  const rest = listed.filter((n) => !changing.some((i) => same(i.name, n)))

  return (
    <section className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 pt-2.5 pb-2" data-testid="tell-us-items">
      <h3 className="text-[15px] font-extrabold text-slate-900">Kosher items here · {rest.length + changing.filter((i) => i.availability !== 'stopped').length}</h3>
      <ul className="mt-1">
        {changing.map((i) =>
          i.availability === 'stopped' ? (
            <li key={i.name} className="-mx-1.5 mt-1 rounded-lg bg-red-50 px-1.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold text-slate-500 line-through">{i.name}</span>
                <span className="text-[12.5px] font-bold text-red-700">No longer here</span>
              </div>
              <button type="button" onClick={() => set(i.name, null)} className="mt-0.5 cursor-pointer text-[13px] font-bold text-primary">
                Keep it
              </button>
            </li>
          ) : (
            <li key={i.name} className="-mx-1.5 mt-1 rounded-lg bg-emerald-50 px-1.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-bold text-slate-900">{i.name}</span>
                <span className="text-[12.5px] font-bold text-emerald-700">New · seen today</span>
              </div>
              <p className="mt-0.5 text-[13px] text-slate-700">
                {i.availability === 'sometimes' ? 'Not always in stock' : 'Always in stock'}{' '}
                <button
                  type="button"
                  aria-label={`Change how often ${i.name} is in stock`}
                  onClick={() => set(i.name, { availability: i.availability === 'sometimes' ? 'always' : 'sometimes' })}
                  className="ml-1 cursor-pointer font-bold text-primary"
                >
                  Change
                </button>{' '}
                ·{' '}
                <button type="button" aria-label={`Remove ${i.name}`} onClick={() => set(i.name, null)} className="cursor-pointer font-bold text-primary">
                  Remove
                </button>
              </p>
            </li>
          ),
        )}
      </ul>
      {held.length > 0 && (
        <ul className="mt-1 text-[12.5px] text-slate-500">
          {held.map((h) => (
            <li key={h}>Not changed: {h}</li>
          ))}
        </ul>
      )}
      {adding ? (
        <AddAnother
          listed={listed}
          taken={items.map((i) => i.name)}
          onAdd={(item) => {
            onChange([...items.filter((i) => !same(i.name, item.name)), item])
            setAdding(false)
          }}
          onClose={() => setAdding(false)}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-1 flex min-h-11 w-full cursor-pointer items-center gap-2 border-t border-slate-200 text-left text-[15px] font-bold text-primary">
          <PlusIcon className="h-4 w-4" />
          Add another item
        </button>
      )}
      {rest.length > 0 && (
        <p className="border-t border-slate-200 pt-2 text-[13.5px] leading-snug text-slate-500">
          <b className="text-slate-700">Already listed · {rest.length}</b> {(all ? rest : rest.slice(0, 6)).join(', ')}
          {rest.length > 6 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="ml-1 cursor-pointer font-bold text-primary">
              {all ? 'Fewer' : `+${rest.length - 6} more`}
            </button>
          )}
        </p>
      )}
    </section>
  )
}

/** One more item: the guide's item names as it's typed (the listing's own
 *  "+ Add an item" box's suggestions), the store's own marked. */
function AddAnother({ listed, taken, onAdd, onClose }: { listed: string[]; taken: string[]; onAdd: (item: ReadItem) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const [sometimes, setSometimes] = useState(false)
  const inputId = useId()
  const name = text.trim().replace(/\s+/g, ' ')
  const marks: ItemMark[] = listed.map((n) => ({ name: n, key: '', sometimes: false, seenAt: null, goneAt: null }))
  const suggestions = itemSuggestions(name, marks, 4).filter((x) => !taken.some((t) => same(t, x.name)))
  const add = (what: string) => onAdd({ name: addedItemName(what), availability: sometimes ? 'sometimes' : 'always', doubt: null })
  const row = 'flex min-h-11 w-full cursor-pointer items-center border-t border-slate-100 px-3 text-left text-[15px] text-slate-900 first:border-t-0 hover:bg-slate-50 disabled:cursor-default disabled:text-slate-400'
  return (
    <div className="-mx-1 mt-1.5 rounded-xl border border-slate-300 bg-white px-2 pt-2.5 pb-2" data-testid="tell-us-add-item">
      <label htmlFor={inputId} className="text-[14px] font-bold text-slate-900">
        What else did you see?
      </label>
      <input
        id={inputId}
        autoFocus
        value={text}
        maxLength={60}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.length >= 2 && !alreadyListed(marks, name)) add(name)
          if (e.key === 'Escape') onClose()
        }}
        className="mt-1.5 h-11 w-full rounded-[10px] border-2 border-slate-300 px-3 text-base text-slate-900 outline-none focus:border-primary"
      />
      {name.length >= 2 && (
        <div className="mt-1.5 overflow-hidden rounded-[10px] border border-slate-200">
          {suggestions.map((x) => (
            <button key={x.name} type="button" disabled={!!x.listed} onClick={() => add(x.name)} className={row}>
              <span className="py-2">
                {x.name}
                {x.listed && <span className="block text-[12.5px]">Already listed here</span>}
              </span>
            </button>
          ))}
          {!suggestions.some((x) => same(x.name, name)) && !alreadyListed(marks, name) && (
            <button type="button" onClick={() => add(name)} className={`${row} bg-slate-50 text-[14.5px] text-slate-600`}>
              Add “{name}” as typed
            </button>
          )}
        </div>
      )}
      <label className="mt-2 flex min-h-10 cursor-pointer items-center gap-2.5 text-[14.5px] text-slate-900">
        <input type="checkbox" checked={sometimes} onChange={(e) => setSometimes(e.target.checked)} className="h-5 w-5 accent-primary" />
        Not always in stock
      </label>
      <button type="button" onClick={onClose} className="mt-0.5 cursor-pointer text-[14px] font-bold text-slate-500 hover:text-slate-700">
        Cancel
      </button>
    </div>
  )
}
