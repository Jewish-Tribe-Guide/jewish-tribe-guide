// Flattening and diffing a SUBMISSION against the listing it proposes to
// change, shared by everything that has to show a
// moderator what an edit actually proposes.
//
// Extracted from SubmissionCard so the notification emails can render the same
// before/after the moderation queue does. They used to disagree: the queue
// diffed against the current listing, while the email listed the proposed
// values alone — so an edit that changed one phone number arrived as a full
// copy of the listing with nothing marking the change, and the only way to
// learn what was being suggested was to open the console.
//
// One implementation on purpose. A second, subtly different formatter is how
// the queue's own summary bug happened in the first place (see
// formatMinyanimSummary), and an email that formats a field differently from
// the card is the same failure wearing a different hat.
//
// Distinct from lib/listingDiff.ts, which answers a different question — did
// this edit change anything at all, used to reject a no-op submission before
// it reaches the queue. This one is about SHOWING a human what changed.

import type { ResourceRow, ResourceSubmission } from '@/types'
import { isStructuredHours, formatHoursSummary } from '@/lib/hours'
import { isMinyanim, formatMinyanimSummary } from '@/lib/davening'
import type { CategoryField } from '@/lib/categories'
import { SYNC_INTERNAL_FIELDS, DIFF_ONLY_HIDDEN_FIELDS, SHOWN_WHEN_CONFIGURED } from '@/lib/syncFields'

// A select/tags field stores raw option *values*, which don't always match
// what the admin typed as the option's label (e.g. renamed since). Resolve
// through the field's own `options` so the queue reads the same text the
// submission form and card show, not whatever happens to be in the JSON.
export function resolveOptionLabel(field: CategoryField | undefined, value: unknown): string {
  const raw = String(value)
  const label = field?.options?.find((o) => o.value === raw)?.label
  return label ?? raw
}

export function fmt(value: unknown, field?: CategoryField): string {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  // Keyed on the configured type where there is one, with shape-detection only
  // as the fallback for the raw-leftover loop below (a renamed or removed field
  // arrives with no CategoryField to consult). isStructuredHours is a loose
  // check — any non-array object satisfies it — so without the type check a
  // future object-valued field type would be quietly rendered as if it were
  // opening hours.
  const structured = !field
  if (field?.type === 'hours' || (structured && isStructuredHours(value))) {
    return formatHoursSummary(value)
  }
  // One line per minyan, not a count. See formatMinyanimSummary: the summary
  // this replaced collapsed every minyan to a count plus the distinct tefillos,
  // so an edit that changed a time, a day, a note or the season rendered an
  // identical string and the diff below reported the field as unchanged.
  if (field?.type === 'minyanim' || (structured && isMinyanim(value) && value.length > 0)) {
    return isMinyanim(value) ? formatMinyanimSummary(value) : String(value)
  }

  if (Array.isArray(value)) return value.map((v) => resolveOptionLabel(field, v)).join(', ') || '—'
  if (field?.type === 'select') return resolveOptionLabel(field, value)

  const text = String(value)
  // Last resort. A moderator seeing "[object Object]" learns nothing about
  // what is being proposed, which is the one thing this whole card exists to
  // show — so fall back to the raw JSON, which is at least readable and
  // diffable. Reaching this means a new field type needs a branch above;
  // SubmissionCard.test.tsx fails on it rather than letting it ship.
  return text === '[object Object]' ? JSON.stringify(value) : text
}

// Derived from lib/syncFields.ts rather than hand-listed here. This set used
// to be its own copy and fell behind: it knew `businessStatus` but not
// `businessStatusBefore` or `businessStatusChangedAt`, so a moderator
// reviewing a davening-times edit was shown
// "businessStatusBefore UNKNOWN → —" as though the submitter had proposed it.
//
// googleDescription is deliberately excluded from the always-skip set: some
// categories configure it as a real, human-editable "Description" field, and
// there it is content worth seeing. It is skipped only in the raw-leftover
// loop below, for categories that never configured it — there it is nothing
// but the sync's own fallback card subtitle.
const SKIP = new Set<string>([
  ...SYNC_INTERNAL_FIELDS.filter((k) => k !== SHOWN_WHEN_CONFIGURED),
  ...DIFF_ONLY_HIDDEN_FIELDS,
])

const SKIP_WHEN_UNCONFIGURED = new Set<string>([SHOWN_WHEN_CONFIGURED])

export type FlatField = { key: string; label: string; value: string }

// Flattens a listing (current ResourceRow or proposed payload) into ordered
// label/value rows for display and diffing. Walks the category's own
// `detailFields` first (so rows appear in the same order as the submission
// form/card, under their real admin-configured label) then appends anything
// left in `details` that isn't a currently-configured field — a renamed or
// removed field, or a category the moderation queue hasn't loaded yet —
// under its raw key, so a value is never silently dropped just because the
// lookup missed it. New fields need no code change here: they're just
// another entry in `fields` the next time a category gains one.
export function flatListing(src: ResourceRow | ResourceSubmission | undefined, fields: CategoryField[] | undefined): FlatField[] {
  if (!src) return []
  const details = (src.details ?? {}) as Record<string, unknown>
  const out: FlatField[] = [
    { key: 'name', label: 'Name', value: fmt(src.name) },
    { key: 'address', label: 'Address', value: fmt(src.address) },
    { key: 'phone', label: 'Phone', value: fmt(src.phone) },
  ]
  const seen = new Set<string>()
  for (const f of fields ?? []) {
    if (SKIP.has(f.key) || !(f.key in details)) continue
    seen.add(f.key)
    out.push({ key: f.key, label: f.label, value: fmt(details[f.key], f) })
  }
  for (const [k, v] of Object.entries(details)) {
    if (SKIP.has(k) || SKIP_WHEN_UNCONFIGURED.has(k) || seen.has(k)) continue
    out.push({ key: k, label: k, value: fmt(v) })
  }
  return out
}

/** One field's before/after, as the queue and the emails both render it. */
export type FieldDiff = { key: string; label: string; before: string; after: string; changed: boolean }

/**
 * Pairs the current listing against what a submission proposes, in the order
 * a reader should see them.
 *
 * `proposed`'s order first (the category's own field order, and what someone
 * approving mostly cares about), then any key only the current listing had —
 * a field the edit cleared out entirely rather than changed, which is still a
 * change and must not vanish from the list.
 *
 * `current` omitted (a create) yields every field as changed against "—",
 * which is the honest reading: all of it is new.
 */
export function diffListing(
  current: ResourceRow | null | undefined,
  proposed: ResourceSubmission,
  fields: CategoryField[] | undefined,
): FieldDiff[] {
  const before = flatListing(current ?? undefined, fields)
  const after = flatListing(proposed, fields)
  const beforeByKey = new Map(before.map((r) => [r.key, r]))
  const afterByKey = new Map(after.map((r) => [r.key, r]))
  const orderedKeys = [...after.map((r) => r.key), ...before.map((r) => r.key).filter((k) => !afterByKey.has(k))]

  return orderedKeys.map((key) => {
    const beforeValue = beforeByKey.get(key)?.value ?? '—'
    const afterValue = afterByKey.get(key)?.value ?? '—'
    return {
      key,
      label: afterByKey.get(key)?.label ?? beforeByKey.get(key)?.label ?? key,
      before: beforeValue,
      after: afterValue,
      changed: beforeValue !== afterValue,
    }
  })
}

/** One line of a multi-line field's before/after. */
export type LineDiff = { text: string; kind: 'same' | 'removed' | 'added' }

/**
 * Line-level diff for the multi-line fields — minyanim and hours summaries.
 *
 * Comparing those as single strings is technically a diff and practically
 * useless: a shul with ten minyanim who corrects one time gets all ten struck
 * through in red and all ten repeated in green, and the moderator has to read
 * twenty lines to find the one word that moved. That is the same "approving
 * blind" problem the whole-field diff was built to solve, one level down.
 *
 * Matching is by exact line, not by position: minyanim are sorted by tefillah
 * then time, so an edit that moves a minyan earlier shifts every line after it
 * and a positional pairing would report the whole tail as changed.
 *
 * A removed line is emitted immediately before the added line that took its
 * place, so the common case — one line edited — reads as one red line above
 * one green line, in position. Leftovers (a genuine deletion, with nothing
 * added to pair it with) are appended at the end rather than dropped.
 */
export function diffLines(before: string, after: string): LineDiff[] {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')

  const remaining = new Map<string, number>()
  for (const line of beforeLines) remaining.set(line, (remaining.get(line) ?? 0) + 1)

  // Which before-lines survive into `after` — the rest are candidates to pair
  // with an added line, in their original order.
  const surviving = new Map(remaining)
  const added: boolean[] = afterLines.map((line) => {
    const left = surviving.get(line) ?? 0
    if (left > 0) {
      surviving.set(line, left - 1)
      return false
    }
    return true
  })
  const unpaired = beforeLines.filter((line) => {
    const left = remaining.get(line) ?? 0
    if (left > 0 && !afterLines.includes(line)) return true
    return false
  })

  const out: LineDiff[] = []
  let nextRemoved = 0
  afterLines.forEach((line, i) => {
    if (added[i] && nextRemoved < unpaired.length) {
      out.push({ text: unpaired[nextRemoved++], kind: 'removed' })
    }
    out.push({ text: line, kind: added[i] ? 'added' : 'same' })
  })
  for (; nextRemoved < unpaired.length; nextRemoved++) {
    out.push({ text: unpaired[nextRemoved], kind: 'removed' })
  }
  return out
}

/** Whether a field's change is worth showing line by line rather than as one
 *  before → after pair: both sides are multi-line, so most of it is context
 *  the reader already agrees with. */
export function isMultiline(before: string, after: string): boolean {
  return before.includes('\n') || after.includes('\n')
}
