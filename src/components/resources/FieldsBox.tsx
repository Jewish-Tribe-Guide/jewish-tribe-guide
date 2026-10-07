import type { ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { selectValues, type CategoryField } from '@/lib/categories'
import { formatPhone } from '@/lib/validation'
import { readContacts, webLink, type ContactEntry } from '@/lib/contacts'
import { PhoneIcon } from '@/components/icons'
import { Card } from './listingParts'

// Kept light (no data hooks), so the "+ Add" box can show a list as the
// listing will, without the listing's own cards coming with it.

/** What a field holds, as words: a pick-list's labels, a yes/no's label,
 *  the text. Empty when it holds nothing. */
export function fieldText(f: CategoryField, v: unknown): string {
  if (f.type === 'boolean') return v === true ? (f.filterLabel ?? f.label) : ''
  if (f.type === 'select') return selectValues(v).map((x) => f.options?.find((o) => o.value === x)?.label ?? x).join(', ')
  if (f.type === 'tel') return String(v ?? '').trim() ? formatPhone(String(v)) : ''
  return String(v ?? '').trim()
}

// ── An admin's box: "Who to call", "Kosher food" (Oct 6) ────────────────────

function hasValue(f: CategoryField, v: unknown): boolean {
  return f.type === 'contacts' ? readContacts(v).length > 0 : fieldText(f, v) !== ''
}

/** One entry of a list: where it's from, the name in bold, who under it,
 *  the note, then its phones to tap, and its email and website, small. */
function ContactLines({ entry }: { entry: ContactEntry }) {
  return (
    <div className="py-2.5" data-testid="contact">
      {entry.from && <p className="text-[12.5px] font-bold text-muted">From {entry.from}</p>}
      <p className="text-[15px] font-bold leading-snug text-slate-900">{entry.name}</p>
      {entry.who && <p className="text-[14px] leading-snug text-slate-700">{entry.who}</p>}
      {entry.note && <p className="mt-0.5 text-[14px] leading-snug whitespace-pre-line text-slate-700">{entry.note}</p>}
      {entry.phones && (
        <p className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1">
          {entry.phones.map((p) => (
            <a key={p} href={`tel:${p.replace(/\D/g, '')}`} className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-primary hover:underline">
              <PhoneIcon className="h-3.5 w-3.5" />
              {formatPhone(p)}
            </a>
          ))}
        </p>
      )}
      {entry.email && (
        <p className="mt-0.5 text-[13.5px]">
          <a href={`mailto:${entry.email}`} className="break-all text-primary hover:underline">
            {entry.email}
          </a>
        </p>
      )}
      {entry.web && (
        <p className="mt-0.5 text-[13.5px]">
          <a href={webLink(entry.web).href} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
            {webLink(entry.web).label}
          </a>
        </p>
      )}
    </div>
  )
}

/** A field in a box: a list's entries, one under another; anything else
 *  as the named card says it. */
function BoxField({ field: f, item }: { field: CategoryField; item: DirectoryResource }) {
  if (f.type === 'contacts') {
    return (
      <div className="divide-y divide-slate-100">
        {readContacts(item[f.key]).map((e, i) => (
          <ContactLines key={`${e.name}:${i}`} entry={e} />
        ))}
      </div>
    )
  }
  const text = fieldText(f, item[f.key])
  if (f.type === 'url') {
    return (
      <a href={text} target="_blank" rel="noopener noreferrer" className="block py-2 text-[15px] font-semibold text-primary hover:underline">
        {f.linkLabel ?? f.label}
      </a>
    )
  }
  if (f.type === 'tel') {
    return (
      <a href={`tel:${String(item[f.key]).replace(/\D/g, '')}`} className="block py-2 text-[15px] font-bold text-primary hover:underline">
        {text}
      </a>
    )
  }
  return <p className="py-2 text-[15px] leading-snug whitespace-pre-line text-slate-700">{text}</p>
}

/** A box the admin named, of the fields they put in it, in their order.
 *  Nothing when none of them holds anything. Two or more fields each go
 *  under their own small heading ("PANTRY", "FOOD PACKAGES"); a count
 *  beside a name when a list has more than one ("Who to call · 4"). */
export function FieldsBox({ item, title, fields, footer }: { item: DirectoryResource; title: string; fields: readonly CategoryField[]; footer?: ReactNode }) {
  const filled = fields.filter((f) => hasValue(f, item[f.key]))
  if (filled.length === 0) return null
  const count = (f: CategoryField) => (f.type === 'contacts' ? readContacts(item[f.key]).length : 0)
  const headed = fields.length > 1
  const heading = !headed && count(filled[0]) > 1 ? `${title} · ${count(filled[0])}` : title
  return (
    <Card title={heading} testId="listing-box" footer={footer}>
      {filled.map((f, i) => (
        <div key={f.key} className={headed && i > 0 ? 'mt-1 border-t border-slate-200' : ''}>
          {headed && (
            <p className="pt-2.5 text-[12px] font-extrabold uppercase tracking-wide text-muted">
              {f.label}
              {count(f) > 1 && ` · ${count(f)}`}
            </p>
          )}
          <BoxField field={f} item={item} />
        </div>
      ))}
    </Card>
  )
}
