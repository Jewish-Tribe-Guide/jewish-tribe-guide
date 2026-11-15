'use client'

import Link from 'next/link'
import type { DirectoryResource, ZmanimData } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import type { MinyanSchedule } from '@/lib/useMinyanSchedule'
import type { LatLng } from '@/lib/geo'
import { getCategoryTilePhoto } from '@/lib/categoryColor'
import { fixedViewSlug, routes } from '@/lib/routes'
import { shabbosMoment } from '@/lib/todayHome'
import { openNowRows, rightNowDay } from '@/lib/phoneHome'
import { TilePhoto } from './sections'
import { HOME_LABEL } from './CategoryTiles'
import { CandlesCard } from './TodayBlocks'
import ShabbosShopping from './ShabbosShopping'
import FridayEruv from './FridayEruv'

// ── Right now, on the phone home (the user, Oct 17) ─────────────────────────
// The one part of the home that's different each time it's opened.
//   A weekday: what's open, in the first two categories that say their hours
//     (Food and Grocery on Philly's), each to its page with Open now on.
//     Not the next minyan: weekday minyanim don't drive this community (the
//     user, Oct 17); they're a tap away, on the Synagogues tile and search.
//   Friday or Erev Yom Tov: the candles card, with the eruv's status on it
//     (FridayEruv), and Shabbos shopping (board U3f, Nov 14).
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
  /** The computer home's card (board U1, Nov 14): the same answers side by
   *  side, bigger, under Explore. */
  wide?: boolean
}

export default function RightNow(props: Props) {
  const { listings, categories, communitySlug, timezone, schedule, zmanim, wide = false } = props
  // Held open until the clock is known, so the tiles under it don't jump
  // down once it arrives.
  if (!schedule || !listings) {
    return <div aria-hidden="true" className="h-[176px] animate-pulse rounded-2xl bg-slate-100" />
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
      // Board Q1 (Nov 14): each row its category's picture, full width,
      // the words in white over a dark fade, so the top of the phone home
      // carries the same colour as the tiles under it. A category with no
      // picture: the same row on plain slate.
      <ul className={wide ? 'grid grid-cols-2 gap-5' : 'space-y-2'}>
        {rows.map((row) => {
          const photo = getCategoryTilePhoto(categories as CategoryConfig[], row.category.id)
          return (
            <li key={row.category.id}>
              <Link
                href={`${routes.slug(communitySlug, row.category.id)}?openNow=1`}
                prefetch={false}
                data-testid="right-now-row"
                className={`relative flex items-center gap-3 overflow-hidden rounded-2xl bg-slate-700 text-white ${wide ? 'h-[132px] px-7' : 'h-[84px] px-4'}`}
              >
                {photo && (
                  <span aria-hidden="true" data-testid="right-now-photo" className="absolute inset-0">
                    <TilePhoto src={photo} px={400} sizes="100vw" />
                  </span>
                )}
                <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-slate-900/85 via-slate-900/65 to-slate-900/25" />
                <span className="relative min-w-0 flex-1">
                  <span className={`block font-semibold text-white/90 ${wide ? 'text-[15px]' : 'text-[13px]'}`}>{row.category.pluralLabel}</span>
                  <span className={`block font-extrabold leading-tight ${wide ? 'text-[30px]' : 'text-[19px]'}`}>{row.open} open now</span>
                  {row.parts.length > 0 && <span className={`block truncate text-white/85 ${wide ? 'text-[14px]' : 'text-[12.5px]'}`}>{row.parts.join(' · ')}</span>}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    )
  } else {
    // Friday (board U3f, Nov 14): the candles card, and Shabbos shopping
    // beside it on the computer, under it on the phone.
    body = (
      <div className={wide && moment.kind === 'erev' ? 'grid grid-cols-2 gap-5' : 'space-y-3'}>
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
          <ShabbosShopping listings={listings} categories={categories} items={props.items} now={now} from={props.from} communitySlug={communitySlug} />
        )}
      </div>
    )
  }

  const day = rightNowDay(now, timezone, moment.kind === 'shabbos')
  // No label on the computer home (the user, Nov 15: "let's actually take
  // off the right now label"); a screen reader still hears it.
  return (
    <section data-testid="right-now" data-moment={moment.kind} aria-labelledby="right-now-title">
      <h2 id="right-now-title" className={wide ? 'sr-only' : HOME_LABEL}>
        Right now
        {day && <span className="font-semibold normal-case tracking-normal"> · {day}</span>}
      </h2>
      {body}
    </section>
  )
}
