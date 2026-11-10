import type { ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { fieldIsVisible, selectValues, type CategoryField } from '@/lib/categories'
import { formatPhone } from '@/lib/validation'
import { formatHoursSummary, hasAnyHours } from '@/lib/hours'
import { readContacts, webLink, type ContactEntry } from '@/lib/contacts'
import { partsOf } from '@/lib/fieldParts'
import { caveatTitle, isCertificateLink, siteName } from '@/lib/listingView'
import { CertificateIcon, GlobeIcon, JoinIcon, PhoneIcon } from '@/components/icons'
import { Card } from './listingParts'

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

// ── A field with parts, in whatever box it's in (the user, Nov 10) ─────────
// A hechsher: which, what isn't kosher when not everything is, and its
// certificate. Delivery: what it says, and the group to join (fieldParts.ts).

export const isWhatsAppLink = (href: string) => /^https?:\/\/(chat\.)?whatsapp\.com\//i.test(href)

/** A link's wide button's words: "Join the group" for a WhatsApp group
 *  (`group`: any link on a WhatsApp page is one), "Visit tribe12.org" for a
 *  website, otherwise what the admin called it. */
export function joinText(field: CategoryField, href: string, group = false): string {
  const label = field.linkLabel ?? field.label
  if ((group || isWhatsAppLink(href)) && /^join/i.test(label)) return 'Join the group'
  if (/website/i.test(label)) {
    const site = siteName(href)
    return site ? `Visit ${site}` : label
  }
  return label
}

const said = (item: DirectoryResource, f: CategoryField | undefined) => (f ? String(item[f.key] ?? '').trim() : '')

const visible = (f: CategoryField, item: DirectoryResource) => fieldIsVisible(f, item as unknown as Record<string, unknown>)

/** Whether a field, or any of its parts, has anything to show: none while
 *  it isn't asked (Delivery on a place that doesn't deliver). */
export function fieldOrPartsFilled(f: CategoryField, item: DirectoryResource, fields: readonly CategoryField[]): boolean {
  if (!visible(f, item)) return false
  if (hasValue(f, item[f.key])) return true
  if (f.caveat) return !!item[f.caveat.flagField] || partsOf(f, fields).some((p) => isCertificateLink(p) && said(item, p))
  return partsOf(f, fields).some((p) => said(item, p))
}

/** The field and its parts, as the listing says them. */
export function FieldWithParts({ field: f, item, fields, onAction }: { field: CategoryField; item: DirectoryResource; fields: readonly CategoryField[]; onAction?: (label: string) => void }) {
  const parts = partsOf(f, fields)
  const text = fieldText(f, item[f.key])
  if (f.caveat) {
    const partial = !!item[f.caveat.flagField]
    const note = String(item[f.caveat.noteField] ?? '').trim()
    const cert = parts.find((p) => isCertificateLink(p) && said(item, p))
    return (
      <div className="space-y-2.5 py-2" data-testid="listing-hechsher">
        {text && <p className="text-[15px] font-semibold leading-snug text-slate-900">{text}</p>}
        {partial && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5" data-testid="listing-caveat-box">
            <p className="text-[13px] font-extrabold text-caution">{caveatTitle(fields)}</p>
            <p className="mt-0.5 whitespace-pre-line text-[15px] leading-snug text-slate-800" data-testid="listing-caveat-note">{note || 'Not everything here is kosher.'}</p>
          </div>
        )}
        {cert && (
          <a
            href={said(item, cert)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onAction?.(cert.linkLabel ?? cert.label)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 px-4 text-[14.5px] font-semibold text-primary hover:bg-slate-50"
          >
            <CertificateIcon className="h-4.5 w-4.5" />
            {cert.linkLabel ?? cert.label}
          </a>
        )}
      </div>
    )
  }
  const link = parts.find((p) => visible(p, item) && said(item, p))
  const href = link ? said(item, link) : ''
  return (
    <div className="py-2" data-testid="listing-with-link">
      {text && <p className="whitespace-pre-line text-[15.5px] leading-snug text-slate-800">{text}</p>}
      {link && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onAction?.(link.linkLabel ?? link.label)}
          data-testid="listing-join"
          className={`mt-3 mb-1 flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-[15.5px] font-bold text-white transition-colors sm:max-w-sm ${
            isWhatsAppLink(href) ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-primary hover:bg-primary-dark'
          }`}
        >
          {isWhatsAppLink(href) ? <JoinIcon className="h-5 w-5" /> : <GlobeIcon className="h-5 w-5" />}
          {joinText(link, href)}
        </a>
      )}
    </div>
  )
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
function BoxField({ field: f, item, fields }: { field: CategoryField; item: DirectoryResource; fields?: readonly CategoryField[] }) {
  if (fields && partsOf(f, fields).length > 0) return <FieldWithParts field={f} item={item} fields={fields} />
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
export function FieldsBox({
  item,
  title,
  fields,
  footer,
  onEdit,
  allFields,
}: {
  item: DirectoryResource
  title: string
  fields: readonly CategoryField[]
  /** The page's fields, for a field's parts (a hechsher's, Delivery's). */
  allFields?: readonly CategoryField[]
  footer?: ReactNode
  /** The box's Edit, where its footer doesn't carry one. */
  onEdit?: () => void
}) {
  const filled = fields.filter((f) => (allFields ? fieldOrPartsFilled(f, item, allFields) : visible(f, item) && hasValue(f, item[f.key])))
  if (filled.length === 0) return null
  const count = (f: CategoryField) => (f.type === 'contacts' ? readContacts(item[f.key]).length : 0)
  const headed = fields.length > 1
  const heading = !headed && count(filled[0]) > 1 ? `${title} · ${count(filled[0])}` : title
  return (
    <Card title={heading} testId="listing-box" footer={footer} onEdit={onEdit}>
      {filled.map((f, i) => (
        <div key={f.key} className={headed && i > 0 ? 'mt-1 border-t border-slate-200' : ''}>
          {headed && (
            <p className="pt-2.5 text-[12px] font-extrabold uppercase tracking-wide text-muted">
              {f.label}
              {count(f) > 1 && ` · ${count(f)}`}
            </p>
          )}
          <BoxField field={f} item={item} fields={allFields} />
        </div>
      ))}
    </Card>
  )
}
