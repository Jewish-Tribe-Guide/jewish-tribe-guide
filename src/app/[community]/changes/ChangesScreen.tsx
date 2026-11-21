'use client'

import { useSetTabHeader } from '@/lib/headerVisibility'
import { useTabLabel } from '@/lib/useTabLabel'
import Link from 'next/link'
import ChangeRow from '@/components/changes/ChangeRow'
import { useActiveCommunity, useCommunityTimezone } from '@/lib/communityContext'
import { useChangeLog } from '@/lib/changesContext'
import { useCategories } from '@/lib/useCategories'
import { useNow } from '@/lib/useNow'
import { routes } from '@/lib/routes'
import { CHANGES_PAGE_DAYS, changeDay, changeTime, changesWithin, whatChanged, type Change } from '@/lib/whatChanged'
import { TAB_BAR_CLEARANCE } from '@/lib/tabBarClearance'
import { features } from '@/lib/features'
import PhotoHeader from '@/components/PhotoHeader'
import ValidatedRow from '@/components/changes/ValidatedRow'
import type { NightRow } from '@/lib/validatedNights'

type Item = { at: string; change: Change } | { at: string; night: NightRow }
import SuggestListingCard from '@/components/home/SuggestListingCard'

/** The What changed page's client half: the changes by day, in the
 *  community's time, against the visitor's clock (so the days are right
 *  however long the page was cached). */
export default function ChangesScreen({ failed, nights = [] }: { failed: boolean; nights?: readonly NightRow[] }) {
  // A phone's header says which tab this is (the user, Nov 16).
  useSetTabHeader(useTabLabel('changes', 'What changed'))
  const { community } = useActiveCommunity()
  const timezone = useCommunityTimezone()
  const categories = useCategories() ?? []
  const rows = useChangeLog()
  const now = useNow()

  const changes = rows && now !== null ? changesWithin(whatChanged(rows, timezone), now, CHANGES_PAGE_DAYS) : null
  // Each night is a row of its own under its day, at the time it ran,
  // among the changes (the user, Nov 17: "part of the activity things just
  // at the time that it happened").
  const since = now === null ? 0 : now - CHANGES_PAGE_DAYS * 86_400_000
  const items: Item[] = changes === null ? [] : [
    ...changes.map((change) => ({ at: change.at, change })),
    ...nights.filter((n) => Date.parse(n.at) >= since && Date.parse(n.at) <= now!).map((night) => ({ at: night.at, night })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  const days: { day: string; items: Item[] }[] = []
  for (const item of items) {
    const day = changeDay(item.at, now!, timezone)
    if (days.at(-1)?.day === day) days.at(-1)!.items.push(item)
    else days.push({ day, items: [item] })
  }

  // The count is of what the page lists, the last 30 days (board W11: "This
  // week" counted 7 days of a 30-day page).
  const total = changes?.length ?? 0
  const count = changes && total > 0 ? `${total} ${total === 1 ? 'change' : 'changes'} in the last ${CHANGES_PAGE_DAYS} days` : null
  const message = failed
    ? 'The changes couldn’t be loaded just now. Try again in a minute.'
    : changes !== null && changes.length === 0
      ? `Nothing’s changed in the last ${CHANGES_PAGE_DAYS} days.`
      : null

  return (
    <main className={`mx-auto w-full max-w-3xl flex-1 px-4 ${TAB_BAR_CLEARANCE} pt-5 sm:px-6 desktop:pb-12 desktop:pt-8 animate-[fadeIn_180ms_ease-out]`}>
      {/* Board W11 (the user, Nov 15): a computer's top is the category
          pages' photo, the count over the title on it. A phone's is the
          title and the count under it. */}
      <PhotoHeader eyebrow={count} title="What changed">
        <div data-testid="changes-page">
          {/* Back to the Today home it was made for; opened from a tab while
              Today is held back, it's a tab screen like You, with no way back. */}
          {features.todayHome && (
            <Link href={routes.home(community.slug)} className="mb-2 block text-[0.9375rem] font-bold text-primary hover:underline">
              ‹ Today
            </Link>
          )}
          <div className="desktop:hidden">
            {/* A phone's title is the header's (useSetTabHeader, the user,
                Nov 16); this h1 is for a screen reader. */}
            <h1 className="sr-only">What changed</h1>
            <p data-testid="changes-count" className="mt-0.5 min-h-[1.375em] text-[0.9375rem] leading-snug text-slate-600">
              {count}
            </p>
          </div>
          {message && <p className="text-[0.9375rem] leading-snug text-slate-600 desktop:text-base">{message}</p>}
          {changes === null && !failed && (
            <div aria-hidden="true" className="mt-6 space-y-3 desktop:mt-0">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          )}
          {days.length > 0 && (
            // A computer: one white box with the days in it, and Suggest a
            // listing beside it. A phone: each day's heading on the grey, its
            // changes in a white box under it.
            <div className="desktop:grid desktop:grid-cols-[minmax(0,1fr)_340px] desktop:items-start desktop:gap-8">
              <div data-testid="changes-box" className="desktop:rounded-2xl desktop:border desktop:border-slate-200 desktop:bg-white desktop:px-6 desktop:pb-2 desktop:pt-1">
                {days.map(({ day, items: onDay }, i) => (
                  <section key={day} data-testid="changes-day" className={`mt-5 desktop:mt-0 desktop:pt-4 ${i > 0 ? 'desktop:mt-2' : ''}`}>
                    <h2 className="text-[0.8125rem] font-extrabold uppercase tracking-[0.05em] text-slate-500">{day}</h2>
                    <ul className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 [&>li:first-child>div]:border-t-0 desktop:mt-1 desktop:rounded-none desktop:border-0 desktop:bg-transparent desktop:px-0 desktop:[&>li:first-child>div]:border-t">
                      {onDay.map((item) =>
                        'night' in item ? (
                          <ValidatedRow key={`night-${item.night.key}`} night={item.night} communitySlug={community.slug} when={changeTime(item.at, timezone)} />
                        ) : (
                          <ChangeRow key={item.change.id} change={item.change} categories={categories} communitySlug={community.slug} when={changeTime(item.at, timezone)} />
                        ),
                      )}
                    </ul>
                  </section>
                ))}
              </div>
              <aside data-testid="changes-suggest" className="sticky top-24 hidden desktop:block">
                <SuggestListingCard line={false} />
              </aside>
            </div>
          )}
        </div>
      </PhotoHeader>
    </main>
  )
}
