'use client'

import Link from 'next/link'
import ChangeRow from '@/components/changes/ChangeRow'
import { useActiveCommunity, useCommunityTimezone } from '@/lib/communityContext'
import { useChangeLog } from '@/lib/changesContext'
import { useCategories } from '@/lib/useCategories'
import { useNow } from '@/lib/useNow'
import { routes } from '@/lib/routes'
import { CHANGES_PAGE_DAYS, THIS_WEEK_DAYS, changeDay, changeTime, changesWithin, whatChanged, type Change } from '@/lib/whatChanged'

/** The What changed page's client half: the changes by day, in the
 *  community's time, against the visitor's clock (so the days are right
 *  however long the page was cached). */
export default function ChangesScreen({ failed }: { failed: boolean }) {
  const { community } = useActiveCommunity()
  const timezone = useCommunityTimezone()
  const categories = useCategories() ?? []
  const rows = useChangeLog()
  const now = useNow()

  const changes = rows && now !== null ? changesWithin(whatChanged(rows, timezone), now, CHANGES_PAGE_DAYS) : null
  const week = changes && now !== null ? changesWithin(changes, now, THIS_WEEK_DAYS).length : 0
  const days: { day: string; changes: Change[] }[] = []
  for (const change of changes ?? []) {
    const day = changeDay(change.at, now!, timezone)
    if (days.at(-1)?.day === day) days.at(-1)!.changes.push(change)
    else days.push({ day, changes: [change] })
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-5 sm:px-6 desktop:pb-12 desktop:pt-8 animate-[fadeIn_180ms_ease-out]">
      <div data-testid="changes-page">
        <Link href={routes.home(community.slug)} className="text-[15px] font-bold text-primary hover:underline">
          ‹ Today
        </Link>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-tight text-ink desktop:text-[36px]">What changed</h1>
        <p className="mt-0.5 text-[15px] leading-snug text-slate-600 desktop:text-base">
          {failed
            ? 'The changes couldn’t be loaded just now. Try again in a minute.'
            : changes === null
              ? ' '
              : changes.length === 0
                ? `Nothing’s changed in the last ${CHANGES_PAGE_DAYS} days.`
                : `${week} ${week === 1 ? 'change' : 'changes'} in the last ${THIS_WEEK_DAYS} days: places added, edited or taken out, each someone in the community’s edit, approved, or an update from Google.`}
        </p>
        {changes === null && !failed && (
          <div aria-hidden="true" className="mt-6 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        )}
        {days.map(({ day, changes: onDay }) => (
          <section key={day} data-testid="changes-day" className="mt-5 desktop:rounded-2xl desktop:border desktop:border-slate-200 desktop:bg-white desktop:px-5 desktop:pb-2 desktop:pt-4">
            <h2 className="text-[13px] font-extrabold uppercase tracking-[0.05em] text-slate-500">{day}</h2>
            <ul className="mt-1">
              {onDay.map((change) => (
                <ChangeRow key={change.id} change={change} categories={categories} communitySlug={community.slug} when={changeTime(change.at, timezone)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}
