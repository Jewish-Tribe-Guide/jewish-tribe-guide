'use client'

import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { searchAsk, type AskResult } from '@/lib/askSearch'
import { answerFor } from '@/lib/askAnswer'
import { answersWell, pickPrompts } from '@/lib/searchPrompts'
import { categoryExamples } from '@/lib/categoryExamples'
import { neighborhoodsFor } from '@/lib/places'
import { listMinyanim } from '@/lib/upcomingDavening'
import { useMinyanSchedule, type MinyanSchedule } from '@/lib/useMinyanSchedule'
import { useNow } from '@/lib/useNow'
import { useCategories } from '@/lib/useCategories'
import { useOptionalLocation } from '@/lib/locationContext'
import { useActiveCommunity, useOptionalCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import AskAnswer from '@/components/home/AskAnswer'
import ReadAs from '@/components/home/ReadAs'
import type { ReadingChip, ReadingOffer } from '@/lib/readingSearch'

// ── A category page's search: asking comes first ─────────────────────────────
// The one search box on the page, limited to this category and saying so
// ("in Food ×"), with a few example searches under it that answer well
// (see categoryExamples), and once something is typed, one sentence answering
// it (see askAnswer.ts) above the list. The answer only ever follows a
// search: a sentence directly under the box reads as "here's the answer to
// what you asked", so nothing sits there unasked.
//
// Arranging the list (Filters, Sort) lives in the list's own heading, not
// here: above the list is for asking.

type Props = {
  category: CategoryConfig
  items: readonly DirectoryResource[]
  search: string
  onSearch: (text: string) => void
  /** Whether this category's listings carry minyan times: only then does the
   *  page work out the minyan schedule (it fetches sunset times, which a food
   *  or grocery page has no use for). */
  hasMinyanim: boolean
  /** The question reader's side (see GenericDirectory): whether it's
   *  reading, how it read, and once read, the result that answers. */
  readAs?: {
    reading: boolean
    chips: ReadingChip[]
    onRemove: (chip: ReadingChip) => void
    offers: ReadingOffer[]
    onPick: (offer: ReadingOffer) => void
    onSubmit: () => void
    result: AskResult | null
  }
}

export default function CategoryAsk(props: Props) {
  return props.hasMinyanim ? <WithSchedule {...props} /> : <Ask {...props} schedule={null} />
}

function WithSchedule(props: Props) {
  const schedule = useMinyanSchedule(null, props.items)
  return <Ask {...props} schedule={schedule} />
}

function Ask({ category, items, search, onSearch, schedule, readAs }: Props & { schedule: MinyanSchedule | null }) {
  const now = useNow()
  const categories = useCategories() ?? [category]
  const communitySlug = useOptionalCommunitySlug()
  const { community } = useActiveCommunity()
  const coords = useOptionalLocation()?.coords ?? null
  const places = neighborhoodsFor(communitySlug)

  // One search, answered. Distances in the sentence are measured from the
  // visitor's location, or from the community's centre like the rows' own
  // (the line under the box says so) — except for "within 3 miles", which
  // means nothing measured from anywhere but where the visitor is.
  //
  // Not before the page has hydrated, when there's no time yet (see useNow):
  // every answer says what's open, so none is given, and an example asking
  // when something is ("open now", "next mincha") isn't offered yet. The
  // rest are picked by what they find, which the time doesn't change.
  const ask = (text: string) => {
    const result = searchAsk(items, [category], text, { categoryId: category.id, coords, now: new Date(now ?? 0), places })
    const answer = answerFor(result, {
      coords: coords ?? (result.query.within ? null : community.mapCenter),
      schedule:
        result.query.minyan && schedule
          ? {
              ...listMinyanim(schedule.shuls, {
                today: schedule.todayDayKeys,
                tomorrow: [schedule.tomorrowKey],
                season: schedule.season,
                anchors: schedule.anchors,
              }),
              nowMinutes: schedule.nowMinutes,
            }
          : null,
    })
    return { result, answer }
  }

  const asksWhen = (r: AskResult) => r.query.openNow || r.query.openToday || r.query.openAt !== null || r.query.minyan !== null
  const q = search.trim()
  // Read by the reader, its result answers (see readingSearch.ts).
  const answer = q && now !== null ? (readAs?.result ? answerFor(readAs.result, { coords: coords ?? community.mapCenter }) : ask(q).answer) : null
  const examples = q
    ? []
    : pickPrompts(
        categoryExamples(category, items, categories, places),
        (p) => {
          const tried = ask(p)
          return (now !== null || !asksWhen(tried.result)) && answersWell(tried.answer, tried.result.hits.length)
        },
        5,
      )

  const plural = category.pluralLabel.toLowerCase()
  const placeholder = category.detailFields.some((f) => f.type === 'minyanim')
    ? `Ask about ${plural} or minyanim`
    : category.detailFields.some((f) => f.type === 'tags')
      ? 'Ask for any item or store'
      : `Ask anything about ${plural}`

  return (
    <div className="space-y-3">
      <label className="flex h-12 items-center gap-2 rounded-xl border-[1.5px] border-primary bg-white pl-3 pr-1.5 shadow-sm focus-within:ring-2 focus-within:ring-primary/30">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-5 w-5 shrink-0 text-primary">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        {/* The search is this category's, and says so. Its ✕ asks the whole
            guide instead, with whatever has been typed. */}
        <span className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-primary/10 pl-2.5 pr-1 text-[13px] font-semibold text-primary">
          in {category.pluralLabel}
          <Link
            href={q && communitySlug ? routes.ask(communitySlug, q) : routes.home(communitySlug ?? '')}
            aria-label={`Search everything, not just ${category.pluralLabel}`}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-primary/15"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-3.5 w-3.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </Link>
        </span>
        <input
          type="search"
          aria-label={`Search ${category.pluralLabel}`}
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') readAs?.onSubmit()
          }}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[15.5px] text-ink placeholder:text-slate-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch('')}
            aria-label="Clear search"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-600 active:text-slate-800"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-4 w-4">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </label>

      {examples.length > 0 && (
        // Example searches, grey and borderless with a magnifier, so they
        // read as searches to try rather than switches that stay on. A tap
        // types the words into the box. One line that scrolls sideways.
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 desktop:mx-0 desktop:px-0" style={{ scrollbarWidth: 'none' }} data-testid="category-examples">
          <span className="shrink-0 text-[13px] font-semibold text-slate-500">Try</span>
          {examples.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onSearch(e)}
              className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 pl-2.5 pr-3 text-[14px] font-medium text-ink transition-colors hover:bg-slate-200"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-3.5 w-3.5 text-slate-500">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              {e}
            </button>
          ))}
        </div>
      )}

      {q && readAs && <ReadAs reading={readAs.reading} chips={readAs.chips} onRemove={readAs.onRemove} offers={readAs.offers} onPick={readAs.onPick} />}
      {answer && <AskAnswer answer={answer} />}
    </div>
  )
}
