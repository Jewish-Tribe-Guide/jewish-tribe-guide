'use client'

import type { ReactNode } from 'react'
import type { CategoryField } from '@/lib/categories'
import { MAX_CONTACTS, type ContactEntry } from '@/lib/contacts'
import { PlusIcon } from '@/components/icons'

// ── A list of contacts, edited (contacts.ts) ────────────────────────────────
// Each entry a small box of its few fields, a Remove on each, "+ Add an
// entry" under them. Kept as typed while it's edited (a phone list half
// written, "215-805-8668, "); readContacts tidies it wherever it's read, so
// nothing half-typed is ever shown on a listing.

type Draft = Omit<ContactEntry, 'phones'> & { phones?: string[] }

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary'

function draftsOf(v: unknown): Draft[] {
  if (!Array.isArray(v)) return []
  return v.filter((e): e is Draft => !!e && typeof e === 'object' && !Array.isArray(e)).map((e) => ({ ...e, name: typeof e.name === 'string' ? e.name : '' }))
}

/** The list's entries, each editable in place. "Add another", not "Add a
 *  liaison": the list's name is the admin's, and rarely a noun that takes
 *  "a". */
export default function ContactsInput({ field, label, value, onChange }: { field: CategoryField; label?: string; value: unknown; onChange: (v: unknown) => void }) {
  const entries = draftsOf(value)
  const set = (i: number, patch: Partial<Draft>) => onChange(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  const id = (i: number, part: string) => `contact-${field.key}-${i}-${part}`
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium text-slate-700">{label ?? field.label}</legend>
      {field.help && <p className="mb-1.5 text-xs text-muted">{field.help}</p>}
      <div className="space-y-2.5">
        {entries.map((e, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5" data-testid="contact-entry">
            <div className="flex items-center gap-2">
              <label htmlFor={id(i, 'name')} className="sr-only">
                Name
              </label>
              <input id={id(i, 'name')} value={e.name} onChange={(ev) => set(i, { name: ev.target.value })} placeholder="Name, or where (“1st floor, Pavilion Building”)" className={`${inputClass} font-semibold`} />
              <button
                type="button"
                onClick={() => onChange(entries.filter((_, j) => j !== i))}
                aria-label={`Remove ${e.name || 'this entry'}`}
                className="shrink-0 cursor-pointer px-1.5 text-sm font-semibold text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
            {field.entryFrom && (
              <Small label="From where" htmlFor={id(i, 'from')}>
                <input id={id(i, 'from')} value={e.from ?? ''} onChange={(ev) => set(i, { from: ev.target.value })} placeholder="Monsey" className={inputClass} />
              </Small>
            )}
            <Small label="Who" htmlFor={id(i, 'who')}>
              <input id={id(i, 'who')} value={e.who ?? ''} onChange={(ev) => set(i, { who: ev.target.value })} placeholder="A person, or the organisation" className={inputClass} />
            </Small>
            <Small label="Phones" htmlFor={id(i, 'phones')}>
              <input
                id={id(i, 'phones')}
                type="tel"
                value={(e.phones ?? []).join(',')}
                // Split as typed, nothing dropped, so a comma just typed
                // stays put; readContacts tidies the spaces and blanks.
                onChange={(ev) => set(i, { phones: ev.target.value ? ev.target.value.split(',') : undefined })}
                placeholder="(215) 555-0100, a comma between"
                className={inputClass}
              />
            </Small>
            <Small label="Email" htmlFor={id(i, 'email')}>
              <input id={id(i, 'email')} type="email" value={e.email ?? ''} onChange={(ev) => set(i, { email: ev.target.value })} className={inputClass} />
            </Small>
            <Small label="Website" htmlFor={id(i, 'web')}>
              <input id={id(i, 'web')} value={e.web ?? ''} onChange={(ev) => set(i, { web: ev.target.value })} placeholder="example.org" className={inputClass} />
            </Small>
            <Small label="Note" htmlFor={id(i, 'note')}>
              <textarea id={id(i, 'note')} value={e.note ?? ''} onChange={(ev) => set(i, { note: ev.target.value })} rows={2} placeholder="Call to arrange." className={inputClass} />
            </Small>
          </div>
        ))}
      </div>
      {entries.length < MAX_CONTACTS && (
        <button
          type="button"
          onClick={() => onChange([...entries, { name: '' }])}
          className="mt-2 flex min-h-10 cursor-pointer items-center gap-1.5 text-sm font-bold text-primary hover:underline"
        >
          <PlusIcon className="h-4 w-4" />
          {entries.length ? 'Add another' : 'Add one'}
        </button>
      )}
    </fieldset>
  )
}

function Small({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <label htmlFor={htmlFor} className="text-xs text-muted">
        {label}
      </label>
      {children}
    </div>
  )
}
