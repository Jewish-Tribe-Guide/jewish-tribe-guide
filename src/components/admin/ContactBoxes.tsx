'use client'

import { useState } from 'react'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { CONTACT_SECTION, contactBoxName, type ContactField } from '@/lib/contactRead'
import type { Watch } from '@/lib/watches'
import { samePage } from '@/lib/hoursJob'
import type { Finding } from '@/lib/watchFindings'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import BoxEditSheet, { type BoxEdit } from '@/components/resources/BoxEditSheet'
import { contactEdit, withSave } from './findingEdits'
import type { Decision } from './FindingCompare'
import { day, shortUrl } from './JobPage'
import { Box, BoxActions, BoxRow, BoxRows, SourceLine, type Tone } from './JobBoxes'

// ── A listing's phone and email, from its own website (Oct 22) ─────────────
// The Phone or Contact box on a job page: Main dishes board 3 (a food
// place's Phone), Mikvah hours board 1 (a mikvah's Contact), Shul times'
// notes (a shul's Phone, under its times). Only what Google doesn't keep
// (contactRead.ts). An update first and open, as every job page's: each
// field the listing shows, a changed one beside what it was, a new one
// highlighted, then Use this / Edit / Keep the listing and the page it's
// from. A page that gives the listing's own is a closed "Same" box.

/** The box as the listing has it (contactRead.ts's listedContact). */
export type ListedContact = { name: string; fields: (ContactField & { value: string | null })[] }
type ContactFinding = Finding & { values: Record<string, unknown> }

export const isContactFinding = (f: Finding): f is ContactFinding => f.operation === 'update' && f.section === CONTACT_SECTION && !!f.values

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const doneText = (d: Decision) => `${d === 'approved' ? 'Used' : 'Kept'} ${day(new Date().toISOString())}`

/** The rows of an update: each field the listing shows or the page gives,
 *  marked new or changed, with what it was. */
export function contactRows(contact: ListedContact | null, values: Record<string, unknown>) {
  const fields = contact?.fields ?? []
  const extra = Object.keys(values)
    .filter((k) => !fields.some((f) => f.key === k))
    .map((k) => ({ key: k, label: k === 'phone' ? 'Phone' : k, kind: 'phone' as const, value: null }))
  return [...fields, ...extra].flatMap((f) => {
    const next = f.key in values ? str(values[f.key]) : f.value
    if (!next && !f.value) return []
    const mark = next === f.value ? ('same' as const) : f.value ? ('changed' as const) : ('new' as const)
    return [{ key: f.key, label: f.label, value: next ?? '', mark, was: mark === 'changed' ? f.value : null }]
  })
}

/** An update's pill: "New" when all it gives is new, else how many change. */
export function contactPill(rows: ReturnType<typeof contactRows>): string {
  const lit = rows.filter((r) => r.mark !== 'same')
  if (lit.length && lit.every((r) => r.mark === 'new')) return 'New'
  return `${lit.length} change${lit.length === 1 ? '' : 's'}`
}

/** Whether a page's last read gave a phone or email the box checks: Reads
 *  names it for the box too ("Women’s · Contact"). */
export const givesContact = (w: Watch) => !!w.lastCheck?.contact && w.lastCheck.contact.same.length + w.lastCheck.contact.changes.length > 0

/** The page that gave the listing's own phone or email last, and which. */
function sameAs(pages: readonly Watch[], contact: ListedContact | null) {
  for (const w of pages) {
    const same = (w.lastCheck?.contact?.same ?? []).filter((k) => contact?.fields.some((f) => f.key === k && f.value))
    if (same.length) return { page: w, same }
  }
  return null
}

export default function ContactBoxes({
  placeId,
  contact,
  findings,
  pages,
  settled,
  busy,
  token,
  community,
  itemUrl,
  sameTone = 'green',
  show = 'all',
  onDecided,
}: {
  placeId: string
  contact: ListedContact | null
  /** The place's findings; only its contact ones are shown here. */
  findings: readonly Finding[]
  /** Its website's pages the daily run reads. */
  pages: readonly Watch[]
  settled: ReadonlyMap<string, Decision>
  busy: boolean
  token: string
  community: string
  /** The job's route, where `?item=` gives the listing and its category. */
  itemUrl: string
  /** Main dishes draws its Same boxes grey, the others green. */
  sameTone?: Tone
  /** Its updates, its Same box, or both: a page that puts every update
   *  above every Same box draws it twice (Main dishes board 3). */
  show?: 'all' | 'updates' | 'same'
  onDecided: (f: Finding, d: Decision) => void
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ item: DirectoryResource; category: CategoryConfig; edit: BoxEdit } | null>(null)
  const all = findings.filter(isContactFinding)
  const own = show === 'same' ? [] : all
  const headers = { Authorization: `Bearer ${token}` }
  const name = (f: ContactFinding) => contact?.name ?? contactBoxName(Object.keys(f.values).map((k) => ({ label: k === 'phone' ? 'Phone' : k })))
  const readAt = (url?: string) => (url ? pages.find((w) => samePage(w.url, url))?.lastCheck?.at : undefined)

  async function decide(f: Finding, body: Record<string, unknown>, d: Decision) {
    setError(null)
    setSaving(f.id)
    try {
      await fetchJson(withCommunity(`/api/admin/submissions/${f.id}`, community), { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'Could not save that.')
      onDecided(f, d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setSaving(null)
    }
  }

  /** Edit: the listing's own contact box, filled in with the website's
   *  phone or email, saved straight to the listing. A section's phone or
   *  email (a mikvah's women's) is its own field, edited alone. */
  async function edit(f: ContactFinding) {
    setError(null)
    try {
      const { item, category } = await fetchJson<{ item: DirectoryResource; category: CategoryConfig }>(withCommunity(`${itemUrl}${itemUrl.includes('?') ? '&' : '?'}item=${placeId}`, community), { headers }, 'Could not open its contact details.')
      setEditing({ item, category, edit: withSave(contactEdit(f, item, category, contact), { community, token, onSaved: () => (setEditing(null), onDecided(f, 'approved')) }) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open its contact details.')
    }
  }

  const same = show === 'updates' || all.some((f) => !settled.has(f.id)) ? null : sameAs(pages, contact)
  return (
    <>
      {own.map((f) => {
        const decided = settled.get(f.id)
        const rows = contactRows(contact, f.values)
        return (
          <Box key={decided ? `${f.id}-done` : f.id} name={name(f)} pill={decided ? { text: doneText(decided), tone: 'grey' } : { text: contactPill(rows), tone: 'amber' }} defaultOpen={!decided} testId="job-box">
            <BoxRows>
              {rows.map((r) => (
                <BoxRow key={r.key} name={r.label} right={r.value} mark={r.mark} was={r.was} />
              ))}
            </BoxRows>
            {!decided && <BoxActions busy={busy || saving === f.id} onUse={() => void decide(f, { status: 'approved' }, 'approved')} onEdit={() => void edit(f)} onKeep={() => void decide(f, { status: 'rejected' }, 'rejected')} />}
            <SourceLine url={f.page} what={f.page ? shortUrl(f.page) : 'their website'} at={readAt(f.page) ?? f.at} />
          </Box>
        )
      })}
      {same && contact && (
        <Box name={contact.name} pill={{ text: 'Same', tone: sameTone }}>
          <BoxRows>
            {contact.fields
              .filter((x) => same.same.includes(x.key))
              .map((x) => (
                <BoxRow key={x.key} name={x.label} right={x.value} />
              ))}
          </BoxRows>
          <SourceLine lead="Same as" url={same.page.url} at={same.page.lastCheck?.at} />
        </Box>
      )}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {editing && <BoxEditSheet item={editing.item} category={editing.category} edit={editing.edit} onClose={() => setEditing(null)} />}
    </>
  )
}
