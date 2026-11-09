'use client'

import { useState } from 'react'
import type { CategoryField } from '@/lib/categories'
import { AdminBox, AdminSwitch } from './AdminUI'
import DragList from './DragList'

// A field's choices, when they're the page's to change (the user, Nov 9:
// "if you can edit then you can fully edit"): rename one where it is,
// remove it, drag it, add one, and Other for a choice field. A rename
// changes only what the choice says. Places keep the stored value, and
// everything that shows a choice looks its words up, so their answers
// follow it with nothing to move, and a watch that writes the value still
// matches. Used by a field made here and by a ready-made field whose
// choices are the community's (fieldRules' choicesEditable).

const input = 'w-full min-h-12 rounded-[10px] border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 placeholder:text-slate-400'
const row = 'flex min-h-[60px] items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0'
type Option = NonNullable<CategoryField['options']>[number]

const taken = (options: readonly Option[], label: string, except?: string) =>
  options.some((o) => o.value !== except && o.label.trim().toLowerCase() === label.toLowerCase())

/** One choice's words, typed over in place. Left empty or the same as
 *  another choice, it goes back to what it said. */
function ChoiceName({ option, options, onRename }: { option: Option; options: readonly Option[]; onRename: (label: string) => void }) {
  const [text, setText] = useState(option.label)
  const commit = () => {
    const label = text.trim()
    if (!label || label === option.label || taken(options, label, option.value)) setText(option.label)
    else onRename(label)
  }
  return (
    <input
      value={text}
      aria-label={`Rename ${option.label}`}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setText(option.label)
      }}
      className="flex-1 min-w-0 min-h-10 rounded-lg border border-transparent bg-transparent px-2 -mx-2 text-[15px] font-semibold text-slate-900 hover:border-slate-200 focus:border-slate-300 focus:bg-white"
    />
  )
}

export default function ChoiceList({
  field: f,
  onChange,
  markOwn = false,
}: {
  field: CategoryField
  onChange: (patch: Partial<CategoryField>) => void
  /** A ready-made field: a choice added here stays this page's, and other
   *  pages don't get it with the field (readyCopy). */
  markOwn?: boolean
}) {
  const [adding, setAdding] = useState<string | null>(null)
  const options = f.options ?? []
  const add = () => {
    const label = adding?.trim()
    setAdding(null)
    if (label && !taken(options, label)) onChange({ options: [...options, { value: label, label, ...(markOwn && { own: true }) }] })
  }
  const rename = (value: string, label: string) => onChange({ options: options.map((o) => (o.value === value ? { ...o, label } : o)) })

  return (
    <AdminBox
      title="Choices"
      action={
        <button
          type="button"
          onClick={() => setAdding('')}
          className="min-h-10 shrink-0 rounded-[10px] border border-slate-300 bg-white px-3.5 text-[14px] font-semibold text-primary hover:bg-slate-50 cursor-pointer"
        >
          + Add a choice
        </button>
      }
    >
      <DragList items={options} keyOf={(o) => o.value} nameOf={(o) => o.label} onReorder={(next) => onChange({ options: next })}>
        {(o, r) => (
          <div className={row}>
            {r.handle}
            <ChoiceName option={o} options={options} onRename={(label) => rename(o.value, label)} />
            <button
              type="button"
              aria-label={`Remove ${o.label}`}
              onClick={() => onChange({ options: options.filter((x) => x.value !== o.value) })}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}
      </DragList>
      {adding !== null && (
        <div className={row}>
          <input
            autoFocus
            aria-label="New choice"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
              if (e.key === 'Escape') setAdding(null)
            }}
            className={input}
          />
        </div>
      )}
      {f.type === 'select' && (
        <div className={`${row} border-t border-slate-200`}>
          <span className="flex flex-1 min-w-0 flex-col">
            <span className="text-[15px] font-semibold text-slate-900">Other</span>
            <span className="text-[13px] text-slate-600">A box to type in</span>
          </span>
          <AdminSwitch checked={!!f.allowOther} onChange={(on) => onChange({ allowOther: on })} label="Other, a box to type in" />
        </div>
      )}
    </AdminBox>
  )
}
