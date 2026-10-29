import type { EnrichedSubmission, CategorySubmissionPayload, ResourceSubmission } from '@/types'
import type { CategoryConfig } from './categories'
import type { ClassifiedMiss } from './missedSearches'
import { askWordKey } from './askWords'
import type { InboxResponse } from './inbox'
import { diffListing } from './submissionDiff'
import { submissionSource } from './submissionSource'

// To do, the console's front page (the admin redesign's step 2, boards 1
// and 2): everything waiting on a decision in one list. New places and
// changes from the queue, and new responses; searches that found nothing
// (the missed searches and the AI's read questions, one list) sit at the
// bottom, uncounted. The page and the nav's count both count with
// todoCount, so the two can't disagree.

/** A word the AI suggests teaching the search, from its reading. */
export type TodoWord = { word: string; categoryId: string; field?: string; value?: string; label: string }

/** A search that found nothing, with any words its reading suggests. */
export type TodoSearch = ClassifiedMiss & { words: TodoWord[]; readingKey?: string }

/** A response nobody has handled yet: the form it came in on, its first
 *  words, and when. */
export type TodoResponse = { id: string; title: string; line: string; createdAt: string }

/** A new listing, as opposed to a change to one, a removal, an eruv fix
 *  or a new category. */
export function isNewPlace(s: Pick<EnrichedSubmission, 'operation' | 'target_type'>): boolean {
  return s.operation === 'create' && s.target_type === 'listing'
}

export function splitSubmissions(submissions: EnrichedSubmission[]): { newPlaces: EnrichedSubmission[]; changes: EnrichedSubmission[] } {
  return {
    newPlaces: submissions.filter(isNewPlace),
    changes: submissions.filter((s) => !isNewPlace(s)),
  }
}

/** A question the AI read, with the words it suggests teaching. */
export type TodoReading = { key: string; question: string; proposals: TodoWord[]; hits: number; lastUsedAt: string }

/** The searches still waiting: nothing found, or only something close,
 *  and not dismissed. A reading of the same words brings its suggested
 *  words along, so the two lists are one. A reading with words to teach
 *  and no search of its own is a row too; dismissing it forgets the
 *  reading (`readingKey`). */
export function openSearches(searches: ClassifiedMiss[], readings: TodoReading[]): TodoSearch[] {
  const words = new Map(readings.map((r) => [askWordKey(r.question), r.proposals]))
  const known = new Set(searches.map((s) => askWordKey(s.term)))
  const open: TodoSearch[] = searches
    .filter((s) => !s.dismissedAt && s.verdict.kind !== 'found')
    .map((s) => ({ ...s, words: words.get(askWordKey(s.term)) ?? [] }))
  const readOnly: TodoSearch[] = readings
    .filter((r) => r.proposals.length > 0 && !known.has(askWordKey(r.question)))
    .map((r) => ({
      term: r.question,
      count: r.hits,
      lastDay: r.lastUsedAt.slice(0, 10),
      dismissedAt: null,
      askedCategory: r.proposals[0].categoryId,
      verdict: { kind: 'missing' },
      words: r.proposals,
      readingKey: r.key,
    }))
  return [...open, ...readOnly].sort((a, b) => b.count - a.count)
}

/** Whether a search can be taught as one word for a category: the search
 *  takes words of up to three. */
export function teachable(term: string): boolean {
  const key = askWordKey(term)
  return key.length > 0 && key.length <= 60 && key.split(' ').length <= 3
}

/** What's waiting on a decision. Not searches nobody found: there are too
 *  many to keep up with, so they're there when there's time. */
export function todoCount(t: { submissions: unknown[]; responses: unknown[] }): number {
  return t.submissions.length + t.responses.length
}

/** A suggestion's name, as its row shows it. */
export function submissionName(s: EnrichedSubmission): string {
  if (s.target_type === 'category') return (s.payload as CategorySubmissionPayload).label
  return (s.payload as Partial<ResourceSubmission>).name || s.current?.name || s.currentEruv?.name || 'A listing'
}

/** What a change is to, in a few words: "Hours", "Hours, Phone and 2
 *  more", "Remove it". */
export function changeWhat(s: EnrichedSubmission, category: CategoryConfig | undefined): string {
  if (s.target_type === 'category') return 'New category'
  if (s.target_type === 'eruv') return 'Eruv'
  if (s.operation === 'delete') return 'Remove it'
  if (s.operation === 'create') return 'New place'
  const labels = [
    ...new Set(
      diffListing(s.current, s.payload as unknown as ResourceSubmission, category?.detailFields)
        .filter((r) => r.changed)
        .map((r) => r.label),
    ),
  ]
  if (labels.length === 0) return 'Edit'
  if (labels.length <= 2) return labels.join(', ')
  return `${labels.slice(0, 2).join(', ')} and ${labels.length - 2} more`
}

/** The Watches row's line: how many pages are read, and when they last
 *  were. "115 pages read each night · last run 4:00 AM". */
export function watchesLine(watches: { active: boolean; lastRunAt: string | null }[]): string {
  const active = watches.filter((w) => w.active)
  const pages = `${active.length} ${active.length === 1 ? 'page' : 'pages'} read each night`
  const last = active.map((w) => w.lastRunAt).filter((t): t is string => !!t).sort().at(-1)
  if (!last) return pages
  return `${pages} · last run ${new Date(last).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

export function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The line under a suggestion's name: what it changes (changes only),
 *  where it came from, and when. "Hours · their website · Oct 25". */
export function submissionLine(s: EnrichedSubmission, category: CategoryConfig | undefined): string {
  const parts = isNewPlace(s) ? [] : [changeWhat(s, category)]
  parts.push(submissionSource(s).from, shortDay(s.created_at))
  return parts.join(' · ')
}

/** A response as To do lists it: its form's title ("Feedback" for
 *  Feedback), the first thing written in it, cut short, and when. */
export function responseSummary(r: InboxResponse, formTitles: Map<string, string>): TodoResponse {
  const title = (r.formId && formTitles.get(r.formId)) || r.requestType
  const first = Object.values(r.data).find((v): v is string => typeof v === 'string' && v.trim() !== '')?.trim() ?? ''
  const line = first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first
  return { id: r.id, title, line, createdAt: r.createdAt }
}
