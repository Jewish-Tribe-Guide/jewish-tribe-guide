import { formatPhone } from './validation'
import type { CategoryConfig, CategoryField } from './categories'

// A listing's phone and email, checked against its own website (the user,
// Oct 21: "every field should have something checking it"). Drawn on the
// job pages as a box of its own: a food place's or a shul's Phone, a
// mikvah's Contact (Main dishes board 3, Mikvah hours board 1, Shul times'
// notes).
//
// Only what Google doesn't keep: a field Google keeps on that listing
// (`details.googleFields`, its sync) is Google's to check, and the website
// isn't read for it. The address is never checked. An email is never
// Google's.
//
// Read by code, not the AI: a phone number and an email address are
// patterns, and the page's own links (tel:, mailto:) say which they are.
// A value is only proposed when the page leaves no doubt which field it
// is: one of the listing's values no longer on the page, and one value on
// the page the listing doesn't have. A page with two numbers the listing
// doesn't know says nothing. A field with nothing in it is filled only when
// the listing has none of that kind at all.
//
// Pure: no database, no network.

/** The box's section, as a finding is filed (hoursSections.ts's
 *  SectionSource): its keys are the fields it changes. */
export const CONTACT_SECTION = 'contact'

export type ContactKind = 'phone' | 'email'

/** A field the website checks. `phone` is the listing's own number (a
 *  column, not a detail); the rest are details. */
export type ContactField = { key: string; label: string; kind: ContactKind }

type Listing = Record<string, unknown> & { phone?: string | null }

/** Whether Google keeps this field on this listing: its sync sets it only
 *  for a listing it matched (placeId) and only the fields it owns there. */
export function googleKeeps(listing: Listing, field: string): boolean {
  return typeof listing.placeId === 'string' && !!listing.placeId && Array.isArray(listing.googleFields) && listing.googleFields.includes(field)
}

const isEmail = (f: CategoryField) => (f.type === 'text' || f.type === 'url') && (f.key === 'e' || /\be-?mail\b/i.test(f.label))

/** The fields the website checks on this listing: its phone, unless Google
 *  keeps it, and every phone and email the listing shows (a section's only
 *  when it has that section). */
export function contactFields(category: Pick<CategoryConfig, 'hasPhone' | 'detailFields'>, listing: Listing): ContactField[] {
  const out: ContactField[] = []
  if (category.hasPhone !== false && !googleKeeps(listing, 'phone')) out.push({ key: 'phone', label: 'Phone', kind: 'phone' })
  for (const f of category.detailFields) {
    if (f.audienceKey && !listing[f.audienceKey]) continue
    if (f.type === 'tel') out.push({ key: f.key, label: f.label, kind: 'phone' })
    else if (isEmail(f)) out.push({ key: f.key, label: f.label, kind: 'email' })
  }
  return out
}

/** The box's name: "Phone" for a phone alone, "Contact" for more. */
export function contactBoxName(fields: readonly Pick<ContactField, 'label'>[]): string {
  return fields.length === 1 ? fields[0].label : 'Contact'
}

/** What a page gives: its phone numbers (ten digits each) and emails
 *  (lower case), each once. */
export type PageContacts = { phones: string[]; emails: string[] }

const PHONE = /(?:\+?1[\s.\-]*)?\(?\b(\d{3})\)?[\s.\-]*(\d{3})[\s.\-]*(\d{4})\b/g
const EMAIL = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi
/** A fax is a number, but not one to call. */
const FAX = /\bfax\b[^0-9\n]{0,12}$/i
/** An image's name looks like an address ("logo@2x.png"). */
const NOT_AN_EMAIL = /\.(png|jpe?g|gif|svg|webp)$/i

/** A phone number's ten digits, or null. */
export function phoneDigits(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let d = value.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  return d.length === 10 ? d : null
}

const emailOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim().toLowerCase().replace(/^mailto:/, '') : null)

/** The phones and emails on a page: in its words, and in its tel: and
 *  mailto: links (`html`), which a page often shows as "Call us". */
export function pageContacts(text: string, html = ''): PageContacts {
  const phones = new Set<string>()
  for (const m of text.matchAll(PHONE)) {
    if (FAX.test(text.slice(Math.max(0, m.index - 20), m.index))) continue
    phones.add(`${m[1]}${m[2]}${m[3]}`)
  }
  for (const m of html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) {
    const d = phoneDigits(decodeURIComponent(m[1]))
    if (d) phones.add(d)
  }
  const emails = new Set<string>()
  const add = (e: string) => {
    const v = e.toLowerCase().replace(/\.+$/, '')
    if (!NOT_AN_EMAIL.test(v)) emails.add(v)
  }
  for (const m of text.matchAll(EMAIL)) add(m[0])
  for (const m of html.matchAll(/href\s*=\s*["']mailto:([^"'?]+)/gi)) {
    const v = decodeURIComponent(m[1]).trim()
    if (EMAIL.test(v)) add(v)
    EMAIL.lastIndex = 0
  }
  return { phones: [...phones], emails: [...emails] }
}

/** A field's value as the listing shows it, said the guide's way. */
export function contactValue(field: Pick<ContactField, 'kind'>, value: unknown): string | null {
  if (field.kind === 'phone') {
    const d = phoneDigits(value)
    return d ? formatPhone(d) : typeof value === 'string' && value.trim() ? value.trim() : null
  }
  return emailOf(value)
}

/** The box as the listing has it, for a job page: its name, and each
 *  field the website checks with the listing's value. Null when the
 *  website checks nothing (Google keeps the phone, and no email). */
export function listedContact(category: Pick<CategoryConfig, 'hasPhone' | 'detailFields'>, listing: Listing): { name: string; fields: (ContactField & { value: string | null })[] } | null {
  const fields = contactFields(category, listing)
  if (!fields.length) return null
  return { name: contactBoxName(fields), fields: fields.map((f) => ({ ...f, value: contactValue(f, f.key === 'phone' ? listing.phone : listing[f.key]) })) }
}

/** What the page says of each field: the ones it gives as the listing has
 *  them (`same`), and the ones it would change (`changes`, the page's value
 *  said the guide's way). */
export type ContactReading = { same: string[]; changes: Record<string, string> }

/** Sets the page's phones and emails beside the listing's. */
export function readContacts(fields: readonly ContactField[], listing: Listing, page: PageContacts): ContactReading {
  const same: string[] = []
  const changes: Record<string, string> = {}
  const valueOf = (key: string) => (key === 'phone' ? listing.phone : listing[key])
  for (const kind of ['phone', 'email'] as const) {
    const norm = kind === 'phone' ? phoneDigits : emailOf
    const onPage = new Set(kind === 'phone' ? page.phones : page.emails)
    const checked = fields.filter((f) => f.kind === kind)
    if (!checked.length || !onPage.size) continue
    // Every value of this kind the listing has, checked here or not (a
    // phone Google keeps is still the listing's, not a new one).
    const known = new Set<string>()
    if (kind === 'phone') {
      const own = phoneDigits(listing.phone)
      if (own) known.add(own)
    }
    for (const [k, v] of Object.entries(listing)) {
      if (k === 'phone') continue
      const n = norm(v)
      if (n && (kind === 'phone' ? fields.some((f) => f.key === k) || /phone/i.test(k) : n.includes('@'))) known.add(n)
    }
    const unknown = [...onPage].filter((v) => !known.has(v))
    const filled = checked.filter((f) => norm(valueOf(f.key)))
    const missing = filled.filter((f) => !onPage.has(norm(valueOf(f.key))!))
    same.push(...filled.filter((f) => !missing.includes(f)).map((f) => f.key))
    if (unknown.length !== 1) continue
    const value = kind === 'phone' ? formatPhone(unknown[0]) : unknown[0]
    if (missing.length === 1) changes[missing[0].key] = value
    else if (!missing.length && !filled.length && !known.size && checked.length === 1) changes[checked[0].key] = value
  }
  return { same, changes }
}
