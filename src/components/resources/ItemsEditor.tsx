'use client'

import { useState } from 'react'
import { selectValues, type CategoryField } from '@/lib/categories'
import { itemWording } from '@/lib/itemMarks'
import { ChevronRightIcon } from '@/components/icons'

// ── A listing's dishes or kosher items, in the whole-listing editor ─────────
// (agreed Oct 11, canvas boards "Main dishes" and "Kosher items"). This
// place's own items only, in the listing's two groups, always and not
// always; tap one for Always, Not always, or Remove, right there. Add is at
// the top, so a long list doesn't push it out of reach. A removed one stays,
// crossed out, with Keep, until the edit is sent.

type Mark = 'always' | 'sometimes'

export default function ItemsEditor({
  field,
  original,
  always,
  sometimes,
  onChange,
}: {
  field: CategoryField
  /** What the listing has now, for the crossed-out ones and Keep. */
  original: { always: string[]; sometimes: string[] }
  always: string[]
  sometimes: string[]
  onChange: (next: { always: string[]; sometimes: string[] }) => void
}) {
  const words = itemWording(field)
  const [text, setText] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const has = (name: string) => [...always, ...sometimes].some((x) => x.toLowerCase() === name.toLowerCase())
  const removed = [...original.always, ...original.sometimes].filter((x) => !has(x))

  function add() {
    const name = text.trim()
    setText('')
    if (!name || has(name)) return
    onChange({ always: [...always, name], sometimes })
  }
  function mark(name: string, to: Mark | 'remove') {
    const a = always.filter((x) => x !== name)
    const s = sometimes.filter((x) => x !== name)
    if (to === 'always') a.push(name)
    if (to === 'sometimes') s.push(name)
    onChange({ always: a, sometimes: s })
    setOpen(null)
  }
  function keep(name: string) {
    if (original.sometimes.includes(name)) onChange({ always, sometimes: [...sometimes, name] })
    else onChange({ always: [...always, name], sometimes })
  }

  const isDish = words.noun === 'dish'
  const groups: { label: string | null; mark: Mark; names: string[] }[] =
    sometimes.length > 0
      ? [
          { label: isDish ? 'Always on the menu' : 'Always in stock', mark: 'always', names: always },
          { label: words.sometimesBox, mark: 'sometimes', names: sometimes },
        ]
      : [{ label: null, mark: 'always', names: always }]

  return (
    <div className="space-y-4" data-testid="items-editor">
      <div className="flex gap-2">
        <input
          aria-label={words.add}
          placeholder={words.add}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          className="h-11.5 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-[15.5px] text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none"
        />
        <button type="button" onClick={add} className="h-11.5 shrink-0 cursor-pointer rounded-xl border border-slate-300 bg-white px-4.5 text-[15px] font-bold text-primary hover:bg-slate-50">
          Add
        </button>
      </div>
      {groups.map((g) => (
        <div key={g.mark}>
          {g.label && <p className="pb-0.5 text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-muted">{g.label}</p>}
          <ul className="divide-y divide-slate-200/70">
            {g.names.map((name) =>
              open === name ? (
                <li key={name} className="-mx-2.5 my-1 rounded-xl border border-slate-300 bg-white px-2.5 pb-2.5">
                  <button type="button" onClick={() => setOpen(null)} aria-expanded className="flex min-h-11 w-full cursor-pointer items-center text-left text-[15.5px] font-bold text-slate-900">
                    <span className="flex-1">{name}</span>
                    <ChevronRightIcon className="h-4 w-4 -rotate-90 text-muted" />
                  </button>
                  <div className="flex gap-1 rounded-xl bg-slate-100 p-[3px]" role="group" aria-label={name}>
                    {(
                      [
                        ['always', 'Always'],
                        ['sometimes', 'Not always'],
                        ['remove', 'Remove'],
                      ] as const
                    ).map(([to, label]) => {
                      const on = to === g.mark
                      return (
                        <button
                          key={to}
                          type="button"
                          aria-pressed={on}
                          onClick={() => mark(name, to)}
                          className={`h-10 flex-1 cursor-pointer rounded-[10px] text-[14.5px] font-bold ${on ? 'bg-white text-slate-900 shadow-sm' : to === 'remove' ? 'text-red-700' : 'text-muted'}`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </li>
              ) : (
                <li key={name}>
                  <button type="button" onClick={() => setOpen(name)} aria-expanded={false} className="flex min-h-11.5 w-full cursor-pointer items-center text-left text-[15.5px] text-slate-900">
                    <span className="flex-1">{name}</span>
                    <ChevronRightIcon className="h-4 w-4 rotate-90 text-slate-400" />
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
      {removed.length > 0 && (
        <ul className="divide-y divide-slate-200/70">
          {removed.map((name) => (
            <li key={name} className="flex min-h-11.5 items-center">
              <span className="flex-1 text-[15.5px] text-slate-400 line-through">{name}</span>
              <button type="button" onClick={() => keep(name)} className="cursor-pointer text-[14.5px] font-bold text-primary">
                Keep
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A tags field's two lists, as they're stored. */
export function itemLists(details: Record<string, unknown>, key: string) {
  return { always: selectValues(details[key]), sometimes: selectValues(details[`${key}_sometimes`]) }
}
