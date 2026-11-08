'use client'

import { useRef, useState } from 'react'
import { slugifyFieldKey, TYPE_IS_FILTERABLE, type CategoryField, type FieldType } from '@/lib/categories'
import { fieldAbout, fieldRules } from '@/lib/fieldAbout'
import { KOSHER_CAVEAT } from '@/lib/kosherQuestions'
import { AdminBack, AdminBox, AdminField, AdminSwitch, AdminYesNo } from './AdminUI'
import DragList from './DragList'

// A field's own screen. A ready-made field's (canvas row "Each kind of
// field", Nov 7) reads like a shop listing: "What this is" first, then
// "What you can change", each option a switch at its setting, and "Remove
// from <page>"; its name, note and what it does are the same everywhere.
// One made here (board 13, Nov 5) is this page's to define: Basics (its
// name and the note under it on Add a place), its choices as rows, and the
// questions its kind asks, each a No / Yes. What the boards take off a
// community admin's screen (only for some places, an audience, a link's own
// box, a badge in place of another) keeps working, and a superadmin still
// has it under "More" (`more`).

const KIND: Record<FieldType, string> = {
  select: 'Choices',
  boolean: 'Yes or no',
  tags: 'A list of items',
  text: 'Text',
  textarea: 'Text',
  url: 'Link',
  tel: 'Phone',
  hours: 'Hours',
  image: 'Photo',
  minyanim: 'Davening times',
  contacts: 'Contacts',
  number: 'Number',
}

/** The kind a field is, as the boards name it ("Choices"). */
export const fieldKind = (type: FieldType) => KIND[type]

const input = 'w-full min-h-12 rounded-[10px] border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 placeholder:text-slate-400'
const row = 'flex min-h-[60px] items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0'

export default function FieldScreen({
  field: f,
  pageName,
  canRequire,
  onChange,
  onRemove,
  onBack,
  more,
  onKosherQuestions,
}: {
  field: CategoryField
  pageName: string
  /** Visitors can add or edit places, so "required" means something. */
  canRequire: boolean
  onChange: (patch: Partial<CategoryField>) => void
  onRemove: () => void
  onBack: () => void
  /** A superadmin's other settings. */
  more?: React.ReactNode
  /** Turns a hechsher's questions on or off, with the page's hidden fields. */
  onKosherQuestions?: (on: boolean) => void
}) {
  if (!f.madeHere) return <ReadyFieldScreen field={f} pageName={pageName} canRequire={canRequire} onChange={onChange} onRemove={onRemove} onBack={onBack} more={more} onKosherQuestions={onKosherQuestions} />
  return <OwnFieldScreen field={f} pageName={pageName} canRequire={canRequire} onChange={onChange} onRemove={onRemove} onBack={onBack} more={more} />
}

type ScreenProps = Parameters<typeof FieldScreen>[0]

/** The field's name and kind, as a screen's heading. */
export function FieldTitle({ field: f }: { field: CategoryField }) {
  return (
    <span className="inline-flex max-w-full items-center gap-3">
      <span className="truncate">{f.label || 'New field'}</span>
      <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-[3px] text-[13px] font-semibold text-slate-600">{fieldKind(f.type)}</span>
    </span>
  )
}

function More({ more }: { more?: React.ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false)
  if (!more) return null
  return (
    <div>
      <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} className="min-h-11 px-1 text-[15px] font-semibold text-primary hover:underline cursor-pointer">
        {moreOpen ? 'Less' : 'More'}
      </button>
      {moreOpen && more}
    </div>
  )
}

function RemoveFrom({ pageName, onRemove }: { pageName: string; onRemove: () => void }) {
  return (
    <button type="button" onClick={onRemove} className="self-start min-h-11 px-1 text-[15px] font-semibold text-red-700 hover:underline cursor-pointer">
      Remove from {pageName}
    </button>
  )
}

function ReadyFieldScreen({ field: f, pageName, canRequire, onChange, onRemove, onBack, more, onKosherQuestions }: ScreenProps) {
  return (
    <>
      <AdminBack back={{ label: pageName, onClick: onBack }} title={<FieldTitle field={f} />} />
      <WhatThisIs field={f} />
      <FieldChanges field={f} canRequire={canRequire} onChange={onChange} onKosherQuestions={onKosherQuestions} />
      <More more={more} />
      <RemoveFrom pageName={pageName} onRemove={onRemove} />
    </>
  )
}

const chip = 'rounded-full bg-slate-100 px-3 py-1 text-[14px] font-semibold text-slate-700'

/** The first box: what the field is, in a few sentences, and what it holds. */
export function WhatThisIs({ field }: { field: CategoryField }) {
  const { about, choices, comesWith } = fieldAbout(field)
  const list = (title: string, names?: string[]) =>
    names?.length ? (
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-500">{title}</span>
        <ul aria-label={title} className="m-0 p-0 list-none flex flex-wrap gap-1.5">
          {names.map((n) => (
            <li key={n} className={chip}>
              {n}
            </li>
          ))}
        </ul>
      </div>
    ) : null
  return (
    <AdminBox title="What this is">
      <div className="flex flex-col gap-3.5 p-4">
        <p className="m-0 text-[17px] leading-[1.55] text-slate-800">{about}</p>
        {list('Choices', choices)}
        {list('Comes with', comesWith)}
      </div>
    </AdminBox>
  )
}

const NEVER_REQUIRED: ReadonlySet<FieldType> = new Set(['image', 'tags', 'contacts', 'minyanim'])

const changeRow = 'flex min-h-[60px] items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0'

function Change({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className={changeRow}>
      <span className="flex flex-1 min-w-0 flex-col">
        <span className="text-[15px] font-semibold text-slate-900">{label}</span>
        <span className="text-[13px] text-slate-600">{hint}</span>
      </span>
      {children}
    </div>
  )
}

/** The second box: the few things a page sets on a ready-made field, each
 *  shown at its setting, so what you'd get is plain before you touch it.
 *  With `fixed`, nothing (a page's basics). */
export function FieldChanges({
  field: f,
  canRequire,
  onChange,
  fixed = false,
  onKosherQuestions,
}: {
  field: CategoryField
  canRequire: boolean
  onChange: (patch: Partial<CategoryField>) => void
  fixed?: boolean
  /** Added already: the page's hidden fields change with it. Before adding,
   *  the caveat alone, and adding brings its questions. */
  onKosherQuestions?: (on: boolean) => void
}) {
  const [adding, setAdding] = useState<string | null>(null)
  const options = f.options ?? []
  const own = options.filter((o) => o.own)
  const add = () => {
    const label = adding?.trim()
    setAdding(null)
    if (label && !options.some((o) => o.label.toLowerCase() === label.toLowerCase())) onChange({ options: [...options, { value: label, label, own: true }] })
  }
  // A photo, a list, contacts or davening times aren't a thing a place can't
  // do without. A yes or no can be required (the user, Nov 8): it starts
  // unanswered, so required means someone picks Yes or No.
  const required = !fixed && canRequire && !NEVER_REQUIRED.has(f.type)
  const filter = !fixed && TYPE_IS_FILTERABLE(f.type)
  const rules = fieldRules(f)
  const choices = !fixed && f.type === 'select' && !rules.choicesSet
  const kosher = !fixed && !!rules.asksEverythingKosher
  return (
    <AdminBox title="What you can change">
      {!required && !filter && !choices && !kosher && <p className="m-0 px-4 py-3 text-[15px] text-slate-600">Nothing. It works the same on every page.</p>}
      {required && (
        <Change label="Required" hint="A place can’t be added without it">
          <AdminSwitch checked={!!f.required} onChange={(on) => onChange({ required: on })} label="Required" />
        </Change>
      )}
      {filter && (
        <Change
          label={f.type === 'hours' ? '“Open now” in the filter' : 'In the filter'}
          hint={f.type === 'hours' ? 'Visitors can show only places open now' : 'Visitors can narrow the list by it'}
        >
          <AdminSwitch
            checked={!!f.filterable}
            // A choice in the filter shows at the top of a place, as a chip.
            onChange={(on) => onChange(on && (f.type === 'select' || f.type === 'boolean') ? { filterable: true, renderAs: 'badge' } : { filterable: on })}
            label={f.type === 'hours' ? 'Open now in the filter' : 'In the filter'}
          />
        </Change>
      )}
      {kosher && (
        <Change label="Everything here is kosher?" hint="Asks whether anything at a place isn’t kosher">
          <AdminSwitch
            checked={!!f.caveat}
            onChange={(on) => (onKosherQuestions ? onKosherQuestions(on) : onChange({ caveat: on ? { ...KOSHER_CAVEAT } : undefined }))}
            label="Everything here is kosher?"
          />
        </Change>
      )}
      {choices && (
        <>
          <Change label="Your own choices" hint="One your community uses that isn’t listed">
            <button
              type="button"
              onClick={() => setAdding('')}
              className="min-h-10 shrink-0 rounded-[10px] border border-slate-300 bg-white px-3.5 text-[14px] font-semibold text-primary hover:bg-slate-50 cursor-pointer"
            >
              + Add a choice
            </button>
          </Change>
          {own.map((o) => (
            <div key={o.value} className={changeRow}>
              <span className="flex-1 min-w-0 text-[15px] font-semibold text-slate-900">{o.label}</span>
              <button
                type="button"
                aria-label={`Remove ${o.label}`}
                onClick={() => onChange({ options: options.filter((x) => x.value !== o.value) })}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                ×
              </button>
            </div>
          ))}
          {adding !== null && (
            <div className={changeRow}>
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
        </>
      )}
    </AdminBox>
  )
}

function OwnFieldScreen({ field: f, pageName, canRequire, onChange, onRemove, onBack, more }: ScreenProps) {
  const [adding, setAdding] = useState<string | null>(null)
  // A new field's key follows its name until the name is left, then never
  // changes, so a rename never strands its answers (CategoryFieldEditor's
  // keyFrozenRef has the history).
  const keyFrozen = useRef(!!f.key)
  const choices = f.type === 'select' || (f.type === 'tags' && f.fixedVocabulary)
  const options = f.options ?? []
  const add = () => {
    const label = adding?.trim()
    setAdding(null)
    if (label && !options.some((o) => o.label.toLowerCase() === label.toLowerCase())) onChange({ options: [...options, { value: label, label }] })
  }
  const both = options.length >= 2 ? `Can a place be both ${options[0].label} and ${options[1].label}?` : 'Can a place have more than one?'
  // A choice in the filter shows at the top of a place, as a chip.
  const filter = (yes: boolean) => onChange(yes && (f.type === 'select' || f.type === 'boolean') ? { filterable: true, renderAs: 'badge' } : { filterable: yes })

  return (
    <>
      <AdminBack back={{ label: pageName, onClick: onBack }} title={<FieldTitle field={f} />} />
      <AdminBox title="Basics">
        <div className="flex flex-col gap-4 px-4 pb-4">
          <AdminField label="Name">
            <input
              value={f.label}
              onChange={(e) => onChange(keyFrozen.current ? { label: e.target.value } : { label: e.target.value, key: slugifyFieldKey(e.target.value) })}
              onBlur={() => (keyFrozen.current = true)}
              placeholder="New field"
              className={input}
            />
          </AdminField>
          {f.type !== 'image' && (
            <AdminField label="Note under it, on Add a place">
              <input
                value={f.help ?? f.placeholder ?? ''}
                onChange={(e) => onChange({ help: e.target.value || undefined, placeholder: undefined })}
                className={input}
              />
            </AdminField>
          )}
          {f.type === 'url' && (
            <AdminField label="What should the button say?">
              <input value={f.linkLabel ?? ''} onChange={(e) => onChange({ linkLabel: e.target.value || undefined })} placeholder="Open the link" className={input} />
            </AdminField>
          )}
        </div>
      </AdminBox>
      {choices && (
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
                <span className="flex-1 min-w-0 text-[15px] font-semibold text-slate-900">{o.label}</span>
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
      )}
      {(canRequire && f.type !== 'boolean' && f.type !== 'image') || TYPE_IS_FILTERABLE(f.type) || f.type === 'select' ? (
        <AdminBox title="Questions">
          {canRequire && f.type !== 'boolean' && f.type !== 'image' && (
            <AdminYesNo question="Is it a required field?" value={!!f.required} onChange={(yes) => onChange({ required: yes })} />
          )}
          {TYPE_IS_FILTERABLE(f.type) && (
            <AdminYesNo question={f.type === 'hours' ? 'Should “Open now” be part of the filter?' : 'Should it be part of the filter?'} value={!!f.filterable} onChange={filter} />
          )}
          {f.type === 'select' && <AdminYesNo question={both} value={!!f.multiSelect} onChange={(yes) => onChange({ multiSelect: yes })} />}
        </AdminBox>
      ) : null}
      <More more={more} />
      <RemoveFrom pageName={pageName} onRemove={onRemove} />
    </>
  )
}
