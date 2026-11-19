import type { ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { selectValues, type CategoryField } from '@/lib/categories'
import { formatPhone } from '@/lib/validation'
import { formatHoursSummary, hasAnyHours } from '@/lib/hours'
import { readContacts, webLink, type ContactEntry } from '@/lib/contacts'
import { GlobeIcon, MailIcon, PhoneIcon } from '@/components/icons'
import { Card, InBoxProvider } from './listingParts'

// Kept light (no data hooks), so the "+ Add" box can show a list as the
// listing will, without the listing's own cards coming with it.

/** What a field holds, as words: a pick-list's labels, a yes/no's label,
 *  the text. Empty when it holds nothing. */
export function fieldText(f: CategoryField, v: unknown): string {
  if (f.type === 'boolean') return v === true ? (f.filterLabel ?? f.label) : ''
  if (f.type === 'select') return selectValues(v).map((x) => f.options?.find((o) => o.value === x)?.label ?? x).join(', ')
  if (f.type === 'tel') return String(v ?? '').trim() ? formatPhone(String(v)) : ''
  if (f.type === 'tags') return selectValues(v).join(', ')
  if (f.type === 'hours') return hasAnyHours(v) || (typeof v === 'string' && v.trim()) ? formatHoursSummary(v) : ''
  if (v !== null && typeof v === 'object') return ''
  return String(v ?? '').trim()
}

// ── An admin's box: "Who to call", "Kosher food" (Oct 6) ────────────────────

export function hasValue(f: CategoryField, v: unknown): boolean {
  return f.type === 'contacts' ? readContacts(v).length > 0 : fieldText(f, v) !== ''
}

/** One entry of a list: where it's from, the name in bold, who under it,
 *  the note, then each phone, its email and its website on a row of its
 *  own, 44px tall (board A, Nov 19): side by side, a fingertip's tap
 *  reached the next number. */
function ContactLines({ entry }: { entry: ContactEntry }) {
  const rows = [
    ...(entry.phones ?? []).map((p) => ({ key: p, href: `tel:${p.replace(/\D/g, '')}`, text: formatPhone(p), icon: <PhoneIcon className="h-4 w-4 shrink-0" />, web: false, small: false })),
    ...(entry.email ? [{ key: 'email', href: `mailto:${entry.email}`, text: entry.email, icon: <MailIcon className="h-4 w-4 shrink-0" />, web: false, small: true }] : []),
    ...(entry.web ? [{ key: 'web', href: webLink(entry.web).href, text: webLink(entry.web).label, icon: <GlobeIcon className="h-4 w-4 shrink-0" />, web: true, small: true }] : []),
  ]
  return (
    <div className="py-2.5" data-testid="contact">
      {entry.from && <p className="text-[12.5px] font-bold text-muted">From {entry.from}</p>}
      <p className="text-[15px] font-bold leading-snug text-slate-900">{entry.name}</p>
      {entry.who && <p className="text-[14px] leading-snug text-slate-700">{entry.who}</p>}
      {entry.note && <p className="mt-0.5 text-[14px] leading-snug whitespace-pre-line text-slate-700">{entry.note}</p>}
      {rows.length > 0 && (
        <div className="mt-1 divide-y divide-slate-100">
          {rows.map((r) => (
            <a
              key={r.key}
              href={r.href}
              {...(r.web ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className={`flex min-h-11 items-center gap-2.5 break-all font-bold text-primary hover:underline ${r.small ? 'text-[14.5px]' : 'text-[15px]'}`}
            >
              {r.icon}
              {r.text}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/** A field in a box: a list's entries, one under another; anything else
 *  as the named card says it. */
export function BoxField({ field: f, item }: { field: CategoryField; item: DirectoryResource }) {
  if (f.type === 'contacts') {
    return (
      <div className="divide-y divide-slate-200">
        {readContacts(item[f.key]).map((e, i) => (
          <ContactLines key={`${e.name}:${i}`} entry={e} />
        ))}
      </div>
    )
  }
  const text = fieldText(f, item[f.key])
  if (f.type === 'url') {
    return (
      <a href={text} target="_blank" rel="noopener noreferrer" className="tap-44 block py-2 text-[15px] font-semibold text-primary hover:underline">
        {f.linkLabel ?? f.label}
      </a>
    )
  }
  if (f.type === 'tel') {
    return (
      <a href={`tel:${String(item[f.key]).replace(/\D/g, '')}`} className="tap-44 block py-2 text-[15px] font-bold text-primary hover:underline">
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
export function FieldsBox({
  item,
  title,
  fields,
  footer,
  onEdit,
  big,
}: {
  item: DirectoryResource
  title: string
  fields: readonly CategoryField[]
  footer?: ReactNode
  /** The box's Edit, where its footer doesn't carry one. */
  onEdit?: () => void
  /** A field that's a box of its own elsewhere (the davening times, a list
   *  of items, Delivery), drawn in this one as it is there (the user, Nov
   *  10: "Let's say same for now"). Null for any other. */
  big?: (f: CategoryField) => ReactNode | null
}) {
  const drawn = new Map(fields.flatMap((f) => {
    const node = big?.(f)
    return node ? [[f.key, node] as const] : []
  }))
  const filled = fields.filter((f) => drawn.has(f.key) || hasValue(f, item[f.key]))
  if (filled.length === 0) return null
  const count = (f: CategoryField) => (f.type === 'contacts' ? readContacts(item[f.key]).length : 0)
  const headed = fields.length > 1
  const heading = !headed && count(filled[0]) > 1 ? `${title} · ${count(filled[0])}` : title
  return (
    <Card title={heading} testId="listing-box" footer={footer} onEdit={onEdit}>
      {filled.map((f, i) => (
        <div key={f.key} className={headed && i > 0 ? 'mt-1 border-t border-slate-200' : ''}>
          {/* A box drawn in this one names itself (Card, inside one). */}
          {headed && !drawn.has(f.key) && (
            <p className="pt-2.5 text-[12px] font-extrabold uppercase tracking-wide text-muted">
              {f.label}
              {count(f) > 1 && ` · ${count(f)}`}
            </p>
          )}
          {drawn.has(f.key) ? <InBoxProvider value={{ title }}>{drawn.get(f.key)}</InBoxProvider> : <BoxField field={f} item={item} />}
        </div>
      ))}
    </Card>
  )
}
