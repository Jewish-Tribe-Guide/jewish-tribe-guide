'use client'

import { useEffect, useState } from 'react'
import type { CategoryField } from '@/lib/categories'
import { readContacts, type ContactEntry } from '@/lib/contacts'
import { formatPhone } from '@/lib/validation'
import { ChevronRightIcon, PlusIcon } from '@/components/icons'

// ── A list of people, in the whole-listing editor ───────────────────────────
// (agreed Oct 11, canvas boards "Who to call" and "One person"). One row per
// person, as the minyan list has one per minyan; tap one for its own screen
// (name, phone, email, a note) with Remove at its foot, or Add a person.
// Who and Website show only on an entry that already has them: nobody had
// filled them in, and six boxes a person made the hospital the longest
// screen on the site.

const input = 'h-11.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15.5px] text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none'

export default function ContactsEditor({
  field,
  value,
  onChange,
  onStep,
  place,
}: {
  field: CategoryField
  value: unknown
  onChange: (v: ContactEntry[]) => void
  /** A person opened: their name and the way back, for the sheet's header. */
  onStep: (step: { title: string; back: () => void } | null) => void
  place: string
}) {
  const entries = readContacts(value)
  const [open, setOpen] = useState<number | 'new' | null>(null)
  const title = open === null ? null : open === 'new' ? 'Add a person' : entries[open]?.name || 'A person'
  useEffect(() => {
    onStep(title ? { title, back: () => setOpen(null) } : null)
  }, [title, onStep])
  useEffect(() => () => onStep(null), [onStep])

  if (open !== null) {
    const start: ContactEntry = open === 'new' ? { name: '' } : entries[open]
    return (
      <Person
        key={String(open)}
        start={start}
        under={`${field.label} · ${place}`}
        onDone={(entry) => {
          if (entry.name.trim()) onChange(open === 'new' ? [...entries, entry] : entries.map((e, i) => (i === open ? entry : e)))
          setOpen(null)
        }}
        onRemove={
          open === 'new'
            ? undefined
            : () => {
                onChange(entries.filter((_, i) => i !== open))
                setOpen(null)
              }
        }
      />
    )
  }

  return (
    <div data-testid={`contacts-${field.key}`}>
      <p className="pb-0.5 text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-muted">{field.label}</p>
      <ul className="divide-y divide-slate-200/70">
        {entries.map((e, i) => (
          <li key={`${e.name}:${i}`}>
            <button type="button" onClick={() => setOpen(i)} className="flex min-h-13 w-full cursor-pointer items-center gap-2.5 py-2 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-[15.5px] font-bold text-slate-900">{e.name}</span>
                {(e.phones?.length || e.email) && (
                  <span className="mt-0.5 block truncate text-[13.5px] text-muted">{[...(e.phones ?? []).map(formatPhone), e.email].filter(Boolean).join(' · ')}</span>
                )}
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setOpen('new')}
        className="mt-2 flex h-11.5 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-300 bg-white text-[15px] font-bold text-primary hover:bg-slate-50"
      >
        <PlusIcon className="h-4 w-4" />
        Add a person
      </button>
    </div>
  )
}

function Person({ start, under, onDone, onRemove }: { start: ContactEntry; under: string; onDone: (e: ContactEntry) => void; onRemove?: () => void }) {
  const [entry, setEntry] = useState<ContactEntry>(start)
  const [phones, setPhones] = useState((start.phones ?? []).join(', '))
  const set = (p: Partial<ContactEntry>) => setEntry((e) => ({ ...e, ...p }))
  const done = () => {
    const list = phones.split(/[,;]/).map((p) => p.trim()).filter(Boolean)
    const clean: ContactEntry = { ...entry, name: entry.name.trim() }
    if (list.length > 0) clean.phones = list
    else delete clean.phones
    for (const k of ['who', 'email', 'web', 'note'] as const) {
      if (!clean[k]?.trim()) delete clean[k]
    }
    onDone(clean)
  }
  const line = (label: string, value: string, change: (v: string) => void, props: { type?: string; placeholder?: string } = {}) => (
    <label className="block space-y-1.5">
      <span className="block text-[14px] font-bold text-slate-700">{label}</span>
      <input value={value} onChange={(e) => change(e.target.value)} className={input} {...props} />
    </label>
  )
  return (
    <div className="space-y-4" data-testid="contact-one">
      <p className="-mt-1 text-[14px] text-muted">{under}</p>
      {line('Name', entry.name, (v) => set({ name: v }))}
      {start.who && line('Who', entry.who ?? '', (v) => set({ who: v }))}
      {line('Phone', phones, setPhones, { type: 'tel' })}
      {line('Email', entry.email ?? '', (v) => set({ email: v }), { type: 'email' })}
      {start.web && line('Website', entry.web ?? '', (v) => set({ web: v }))}
      {line('Note (optional)', entry.note ?? '', (v) => set({ note: v }), { placeholder: 'Call to arrange' })}
      <button type="button" onClick={done} className="h-12 w-full cursor-pointer rounded-full bg-primary text-[16px] font-bold text-white">
        Done
      </button>
      {onRemove && (
        <p className="text-center">
          <button type="button" onClick={onRemove} className="min-h-11 cursor-pointer text-[15px] font-bold text-red-700">
            Remove this person
          </button>
        </p>
      )}
    </div>
  )
}
