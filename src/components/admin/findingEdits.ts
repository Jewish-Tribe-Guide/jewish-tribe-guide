import { companionKeys, type CategoryConfig } from '@/lib/categories'
import { contactBoxName } from '@/lib/contactRead'
import { editorRows } from '@/lib/editorRows'
import { websiteKeyOf, type GooglePlace } from '@/lib/googleJob'
import { kosherBoxKeys } from '@/lib/kosherBox'
import { itemsField } from '@/lib/listingView'
import { minyanWriting } from '@/lib/minyanText'
import { schedulesKey } from '@/lib/schedules'
import { TIMES_PART_LABELS, type TimesPart } from '@/lib/timesParts'
import { withCommunity } from '@/lib/useCommunityData'
import type { Finding, FindingTimes } from '@/lib/watchFindings'
import type { DirectoryResource, ResourceSubmission } from '@/types'
import type { BoxEdit } from '@/components/resources/BoxEditSheet'

// ── Edit, on a finding: the listing's own box, filled in with it ────────────
// Each job page's Edit opens the box the finding changes, filled in with
// what was read, and saves straight to the listing. Built here once, so a
// place opened on its kind's page (OpenedPlace.tsx) opens the same box its
// job page does, right there (Oct 25).

/** The box to open, and where Save sends what the admin left in it. */
export type FindingEdit = {
  edit: Omit<BoxEdit, 'save'>
  send: { path: string; method: 'PATCH' | 'POST'; body: (payload: ResourceSubmission) => Record<string, unknown> }
}

export const FOOD_HOURS_KEY = 'hours'
const KOSHER_API = '/api/admin/watches/kosher'
const GOOGLE_API = '/api/admin/watches/google'

type Details = Record<string, unknown>
const detailsOf = (payload: ResourceSubmission) => (payload.details ?? {}) as Details
const pick = (d: Details, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, d[k] ?? null]))
/** The finding approved, with what the admin left in its box. */
const approve = (id: string, payload: (p: ResourceSubmission) => Record<string, unknown>): FindingEdit['send'] => ({
  path: `/api/admin/submissions/${id}`,
  method: 'PATCH',
  body: (p) => ({ status: 'approved', payload: payload(p) }),
})

type Valued = Finding & { values: Record<string, unknown> }

/** A food place's hours, from its website. */
export function foodHoursEdit(f: Valued, category: CategoryConfig): FindingEdit | null {
  const fields = category.detailFields.filter((x) => x.key === FOOD_HOURS_KEY)
  if (!fields.length) return null
  return { edit: { title: fields[0].label, fields, preset: f.values }, send: approve(f.id, (p) => ({ details: pick(detailsOf(p), [FOOD_HOURS_KEY]) })) }
}

/** A mikvah's section: its hours, its notes, or both. */
export function sectionEdit(f: Valued, category: CategoryConfig, s: { label: string; hours: string | null; notes: string | null }): FindingEdit | null {
  const keys = [s.hours, s.notes].filter((k): k is string => !!k)
  const fields = keys.flatMap((k) => category.detailFields.filter((x) => x.key === k))
  if (!fields.length) return null
  return { edit: { title: s.hours ? `${s.label} hours` : s.label, fields, preset: f.values }, send: approve(f.id, (p) => ({ details: pick(detailsOf(p), keys) })) }
}

/** The weeks a shul's finding sends out that the listing doesn't have:
 *  the ones its This week's schedule edits. */
export function postedWeeks(t: FindingTimes): string[] {
  return t.proposedSchedules.filter((s) => !t.currentSchedules.some((c) => JSON.stringify(c) === JSON.stringify(s))).map((s) => s.id)
}

/** One of a shul's three parts: its usual weekday or Shabbos times, or
 *  this week's. None for a week that sends out nothing new. */
export function timesEdit(f: Finding & { part: TimesPart; times: FindingTimes }, category: CategoryConfig): FindingEdit | null {
  const field = category.detailFields.find((x) => x.key === f.times.field.key)
  const weeks = f.part === 'week' ? postedWeeks(f.times) : []
  if (!field || (f.part === 'week' && !weeks.length)) return null
  const key = field.key
  const sk = schedulesKey(key)
  return {
    edit: {
      title: TIMES_PART_LABELS[f.part],
      fields: [field],
      minyanimBox: f.part === 'week' ? 'this_week' : f.part,
      writing: minyanWriting,
      weeks,
      preset: f.part === 'week' ? { [sk]: f.times.proposedSchedules } : { [key]: f.times.proposed },
    },
    send: approve(f.id, (p) => {
      const d = detailsOf(p)
      return { details: { [key]: d[key], [sk]: d[sk] } }
    }),
  }
}

/** One of a hospital's boxes, from Refuah. */
export function hospitalBoxEdit(f: Valued, item: DirectoryResource, category: CategoryConfig, box: { title: string; keys: readonly string[] }): FindingEdit | null {
  const row = editorRows(category, (item.details ?? {}) as Details).find((r) => r.id.startsWith('box:') && r.title === box.title)
  if (!row) return null
  return { edit: { title: box.title, fields: [], rows: [row.id], preset: f.values }, send: approve(f.id, (p) => ({ details: pick(detailsOf(p), box.keys) })) }
}

/** Its phone and email, from its website: the Phone or Contact box. */
export function contactEdit(f: Valued, item: DirectoryResource, category: CategoryConfig, contact: { name: string; fields: readonly { key: string }[] } | null): FindingEdit {
  const title = contact?.name ?? contactBoxName(Object.keys(f.values).map((k) => ({ label: k === 'phone' ? 'Phone' : k })))
  // Everything the box shows goes back, so an edit to its website or
  // email sticks too; the approval takes what the admin changed.
  const shown = editorRows(category, item as unknown as Details).find((r) => r.id === 'contact')?.fields.map((x) => x.key) ?? []
  const keys = [...new Set([...shown, ...(contact?.fields ?? []).map((x) => x.key)])].filter((k) => k !== 'phone')
  const sectioned = Object.keys(f.values).some((k) => category.detailFields.some((x) => x.key === k && x.audienceKey))
  return {
    edit: sectioned ? { title, fields: category.detailFields.filter((x) => x.key in f.values), preset: f.values } : { title, fields: [], rows: ['contact'], preset: f.values },
    // The contact box holds its address too: an edit to it goes with the
    // phone, as the admin left it.
    send: approve(f.id, (p) => ({ address: p.address ?? '', phone: p.phone ?? '', ...(p.geo ? { geo: p.geo } : {}), details: pick(detailsOf(p), keys) })),
  }
}

/** Its Kosher box, as a list would make it (`next`, kosherProposal). A
 *  removal can't be edited: the listing is saved as the admin left it,
 *  and the removal closes. */
export function kosherEdit(f: Finding, item: DirectoryResource, category: CategoryConfig, next: Record<string, unknown>): FindingEdit {
  const keys = new Set(kosherBoxKeys(category))
  // Every field the listing has now, the box's as edited: a finding
  // carries the listing as it was when read (withReviewEdits).
  const editable = category.detailFields.flatMap((x) => [x.key, ...companionKeys(x)])
  const own = item as unknown as Details
  return {
    edit: { title: 'Kosher', fields: [], rows: ['facts'], preset: Object.fromEntries([...keys].map((k) => [k, next[k] ?? null])) },
    send:
      f.operation === 'delete'
        ? { path: KOSHER_API, method: 'POST', body: (p) => ({ action: 'edit', id: f.id, details: pick(detailsOf(p), [...keys]) }) }
        : approve(f.id, (p) => {
            const d = detailsOf(p)
            return { name: item.name, address: item.address ?? '', phone: item.phone ?? '', details: Object.fromEntries(editable.map((k) => [k, keys.has(k) ? (d[k] ?? null) : (own[k] ?? null)])) }
          }),
  }
}

/** Its dishes, as a menu reading would make them. */
export function dishesEdit(resourceId: string, category: CategoryConfig, proposal: { always: readonly string[]; sometimes: readonly string[] }): FindingEdit | null {
  const field = itemsField(category)
  if (!field) return null
  return {
    edit: { title: field.label, fields: [], rows: ['items'], preset: { [field.key]: proposal.always, [`${field.key}_sometimes`]: proposal.sometimes } },
    send: {
      path: '/api/admin/main-dishes',
      method: 'POST',
      body: (p) => {
        const d = detailsOf(p)
        return { action: 'save', resourceId, always: d[field.key] ?? [], sometimes: d[`${field.key}_sometimes`] ?? [] }
      },
    },
  }
}

/** The fields Google keeps, with what Google has where it differs. */
export function googleEdit(place: GooglePlace, item: DirectoryResource, category: CategoryConfig): FindingEdit {
  const websiteKey = websiteKeyOf(category)
  const keys = new Set(['hours', ...(websiteKey ? [websiteKey] : [])])
  const rows = editorRows(category, item as unknown as Details)
    .filter((r) => r.id === 'name' || r.kind === 'contact' || r.fields.some((f) => keys.has(f.key)))
    .map((r) => r.id)
  const preset: Details = {}
  for (const r of place.compare?.rows ?? []) {
    if (!r.changed) continue
    const key = r.field === 'website' ? websiteKey : r.field
    if (key) preset[key] = r.raw
  }
  return {
    edit: { title: 'Fields', fields: [], rows, preset },
    send: {
      path: GOOGLE_API,
      method: 'POST',
      body: (p) => {
        const d = detailsOf(p)
        const value = (field: string) => (field === 'name' ? p.name : field === 'phone' ? (p.phone ?? '') : field === 'hours' ? (d.hours ?? null) : websiteKey ? (d[websiteKey] ?? null) : null)
        return { action: 'edit', id: place.id, values: Object.fromEntries(place.fields.map((f) => [f.field, value(f.field)])) }
      },
    },
  }
}

/** The sheet's edit, saving where the finding's edit says. `after`, with
 *  the response once it's in, before `onSaved`. */
export function withSave(fe: FindingEdit, { community, token, onSaved, after }: { community: string; token: string; onSaved: () => void; after?: (res: Response) => Promise<void> }): BoxEdit {
  return {
    ...fe.edit,
    save: {
      label: 'Save to the listing',
      via: async ({ payload }) => {
        const res = await fetch(withCommunity(fe.send.path, community), {
          method: fe.send.method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(fe.send.body(payload)),
        })
        if (res.ok && after) await after(res.clone())
        return res
      },
      onSaved,
    },
  }
}
