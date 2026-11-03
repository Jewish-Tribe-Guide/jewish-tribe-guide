import type { EnrichedSubmission, ResourceSubmission } from '@/types'
import { companionKeys, type CategoryConfig } from '@/lib/categories'
import { diffListing, type FieldDiff } from '@/lib/submissionDiff'
import { editorRows, type EditorRow } from '@/lib/editorRows'
import { boxChangeCount, minyanimForBox } from '@/lib/minyanimBox'
import { isMinyanim, type Minyan } from '@/lib/davening'
import { readSchedules, schedulesKey } from '@/lib/schedules'
import { weekDiffers, type EditWeek } from '@/lib/thisWeekEdit'
import { onListingNow } from '@/lib/editedFields'
import { approvingPart, type ReviewPart } from '@/lib/reviewParts'
import { fieldKeyFor } from './SubmissionReview'

// A change as the site's own editor opens it: what it would make the
// listing (one part of it, when it's answered a part at a time), what that
// differs in, the editor's rows it touches, and what goes in them. Shared
// by a change on To do (TodoChange.tsx) and Read now's (ChangeReview.tsx).

export type ChangeEdit = {
  /** The change as the open part alone would make it. */
  sent: ResourceSubmission
  changed: FieldDiff[]
  /** Its editor rows: a shul's times by the box they changed in. */
  rows: EditorRow[] | null
  /** What it proposes, typed into the editor as it opens. */
  preset: Record<string, unknown>
  /** The fields it changes, by key. */
  keys: string[]
}

export function changeEdit(s: EnrichedSubmission, category: CategoryConfig, part: ReviewPart | undefined, weeks: { week: EditWeek; next: EditWeek } | null): ChangeEdit {
  const fields = category.detailFields
  const whole = s.payload as unknown as ResourceSubmission
  const sent = part && s.current ? onListingNow(approvingPart(whole, s.current, part, fields), s.current, fields) : whole
  const changed = diffListing(s.current, sent, fields).filter((r) => r.changed)
  const changedKeys = [...new Set(changed.map((r) => fieldKeyFor(r.key, fields)).filter((k): k is string => !!k))]
  const before = (s.current?.details ?? {}) as Record<string, unknown>
  const rows = editorRows(category, sent.details, { week: weeks?.week, nextWeek: weeks?.next }).filter((r) => {
    if (r.kind === 'name' && changedKeys.includes('name')) return true
    if (r.id === 'contact' && (changedKeys.includes('address') || changedKeys.includes('phone'))) return true
    if (!r.fields.some((f) => changedKeys.includes(f.key))) return false
    if (r.kind !== 'minyans' || !r.box) return true
    const key = r.fields[0].key
    if (r.week) return weekDiffers(readSchedules(before[schedulesKey(key)]), readSchedules(sent.details[schedulesKey(key)]), r.week)
    const was = isMinyanim(before[key]) ? (before[key] as Minyan[]) : []
    const now = isMinyanim(sent.details[key]) ? (sent.details[key] as Minyan[]) : []
    return boxChangeCount(minyanimForBox(was, r.box), minyanimForBox(now, r.box)) > 0
  })
  const preset: Record<string, unknown> = {}
  for (const k of changedKeys) {
    if (k === 'name' || k === 'address' || k === 'phone') {
      preset[k] = sent[k] ?? ''
      continue
    }
    const f = fields.find((x) => x.key === k)
    for (const key of [k, ...(f ? companionKeys(f) : []), ...(f?.type === 'minyanim' ? [schedulesKey(k)] : [])]) {
      if (key in sent.details) preset[key] = sent.details[key]
    }
  }
  return { sent, changed, rows: rows.length > 0 ? rows : null, preset, keys: changedKeys }
}
