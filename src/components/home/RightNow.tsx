'use client'

import Link from 'next/link'
import type { DirectoryResource, ZmanimData } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import type { MinyanSchedule } from '@/lib/useMinyanSchedule'
import type { LatLng } from '@/lib/geo'
import { getCategoryColor } from '@/lib/categoryColor'
import { fixedViewSlug, routes } from '@/lib/routes'
import { shabbosMoment } from '@/lib/todayHome'
import { openNowRows, rightNowDay } from '@/lib/phoneHome'
import { ChevronRightIcon } from '@/components/icons'
import CategoryIcon from '@/components/CategoryIcon'
import { BeforeCandles, CandlesCard } from './TodayBlocks'
import FridayEruv from './FridayEruv'

// ── Right now, on the phone home (the user, Oct 17) ─────────────────────────
// The one part of the home that's different each time it's opened.
//   A weekday: what's open, in the first two categories that say their hours
//     (Food and Grocery on Philly's), each to its page with Open now on.
//     Not the next minyan: weekday minyanim don't drive this community (the
//     user, Oct 17); they're a tap away, on the Synagogues tile and search.
//   Friday or Erev Yom Tov: the candles card, with the eruv's status on it
//     (FridayEruv), and Before candles.
//   Shabbos or Yom Tov: the card alone, with the eruv as of candle lighting.
//     Nothing open, nothing to buy.
// Nothing at all when nothing's open (late at night). The candles card and
// Before candles are the held-back Today home's (TodayBlocks).

type Props = {
  listings: readonly DirectoryResource[] | null
  /** Every category, in the admin's order. */
  categories: readonly CategoryConfig[]
  communitySlug: string
  timezone: string
  /** The clock, null until the page has hydrated. */
  schedule: MinyanSchedule | null
  zmanim: ZmanimData | null
  /** Where distances are measured from (Before candles' stores). */
  from: LatLng
  /** The admin's Before candles items. */
  items: readonly string[]
  onOpenListing: (item: DirectoryResource) => void
}

export default function RightNow(props: Props) {
  const { listings, categories, communitySlug, timezone, schedule, zmanim } = props
  // Held open until the clock is known, so the tiles under it don't jump
  // down once it arrives.
  if (!schedule || !listings) {
    return <div aria-hidden="true" className="h-[124px] animate-pulse rounded-2xl bg-slate-100" />
  }
  const now = schedule.now
  const moment = shabbosMoment(zmanim, now, timezone)
  const kindLink = (kind: string) => {
    const c = categories.find((x) => x.kind === kind)
    return c ? routes.slug(communitySlug, fixedViewSlug(c.kind) ?? c.id) : null
  }
  const eruvHref = kindLink('eruv')
  const shulsHref = schedule.linkCategoryId ? `${routes.slug(communitySlug, schedule.linkCategoryId)}?davening=1` : null

  let body: React.ReactNode
  if (moment.kind === 'weekday') {
    const rows = openNowRows(listings, categories, new Date(now))
    if (rows.length === 0) return null
    body = (
      <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {rows.map((row) => (
          <li key={row.category.id} className="border-t border-slate-100 first:border-t-0">
            <Link href={`${routes.slug(communitySlug, row.category.id)}?openNow=1`} prefetch={false} className="flex items-center gap-3 px-3.5 py-3 hover:bg-slate-50">
              <CategoryIcon icon={row.category.icon} categoryId={row.category.id} color={getCategoryColor(categories as CategoryConfig[], row.category.id)} className="h-9 w-9 text-base" sizePx={36} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-slate-500">{row.category.pluralLabel}</span>
                <span className="block text-[16px] font-extrabold leading-snug text-ink">{row.open} open now</span>
                {row.parts.length > 0 && <span className="block truncate text-[13.5px] text-slate-600">{row.parts.join(' · ')}</span>}
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
            </Link>
          </li>
        ))}
      </ul>
    )
  } else {
    body = (
      <div className="space-y-3">
        <CandlesCard
          moment={moment}
          now={now}
          nowMinutes={schedule.nowMinutes}
          links={[
            ['Minyanim', shulsHref],
            ['Zmanim', kindLink('zmanim')],
          ]}
        >
          {eruvHref && <FridayEruv communitySlug={communitySlug} href={eruvHref} now={now} />}
        </CandlesCard>
        {moment.kind === 'erev' && (
          <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 empty:hidden">
            <BeforeCandles {...props} />
          </div>
        )}
      </div>
    )
  }

  const day = rightNowDay(now, timezone, zmanim)
  return (
    <section data-testid="right-now" data-moment={moment.kind} aria-labelledby="right-now-title">
      <h2 id="right-now-title" className="mb-2 text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-slate-500">
        Right now
        {day && <span className="font-semibold normal-case tracking-normal"> · {day}</span>}
      </h2>
      {body}
    </section>
  )
}
