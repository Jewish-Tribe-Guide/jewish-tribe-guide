'use client'

import Link from 'next/link'
import type { DirectoryResource, ZmanimData } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import type { MinyanSchedule } from '@/lib/useMinyanSchedule'
import type { LatLng } from '@/lib/geo'
import { getCategoryTilePhoto } from '@/lib/categoryColor'
import { fixedViewSlug, routes } from '@/lib/routes'
import { shabbosMoment } from '@/lib/todayHome'
import { eruvSummary, openNowRow, rightNowChosen, rightNowDay } from '@/lib/phoneHome'
import { nextMinyan, nextMinyanHref } from '@/lib/nextMinyan'
import { clockTime } from '@/lib/upcomingDavening'
import { eruvView } from '@/lib/eruv'
import { useNearestEruv } from './YourEruv'
import { TilePhoto } from './sections'
import { HOME_LABEL } from './CategoryTiles'
import { CandlesCard } from './TodayBlocks'
import ShabbosShopping from './ShabbosShopping'
import FridayEruv from './FridayEruv'

// ── Right now, on the phone home (the user, Oct 17) ─────────────────────────
// The one part of the home that's different each time it's opened.
//   A weekday: the admin's two choices (board V1, Nov 15): what's open in a
//     category that says its hours, each to its page with Open now on; the
//     next minyan (V2); or the eruv. With no choice made, the first two
//     categories that say their hours (Food and Grocery on Philly's): Philly
//     left minyanim out (the user, Oct 17), another community may not.
//     Overnight, when its first place opens (V3), rather than nothing.
//   Friday or Erev Yom Tov: the candles card, with the eruv's status on it
//     (FridayEruv), and Shabbos shopping (board U3f, Nov 14).
//   Shabbos or Yom Tov: the card alone, with the eruv as of candle lighting.
//     Nothing open, nothing to buy.
// The candles card is the held-back Today home's (TodayBlocks).

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
  /** The admin's choice of categories (site settings), null for the
   *  ready-made pair. */
  choice?: readonly string[] | null
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
    // The admin's choice (board V1, Nov 15), or Food and Grocery's kind of
    // ready-made pair when there's none.
    const picks = rightNowChosen(categories, listings, props.choice ?? null)
    const at = new Date(now)
    const rows = picks.flatMap((pick) => {
      const { category } = pick
      const key = category.id
      if (pick.answer === 'eruv') return [<EruvRow key={key} category={category} communitySlug={communitySlug} now={now} wide={wide} categories={categories} />]
      if (pick.answer === 'minyan') {
        // Board V2: the next minyan anywhere, to all davening times on its day.
        const next = nextMinyan(schedule)
        const small = next ? [next.shul ? next.shul.name : `${next.shulCount} shuls`, ...(next.isTomorrow ? ['tomorrow'] : [])].join(' · ') : 'Every shul in the guide'
        return [
          <PhotoRow
            key={key}
            category={category}
            categories={categories}
            href={nextMinyanHref(communitySlug, category.id, next, schedule, timezone)}
            big={next ? `${next.label} ${clockTime(next.minutes)}` : 'Minyan times'}
            small={small}
            wide={wide}
          />,
        ]
      }
      const row = openNowRow(category, listings, at)
      if (!row) return []
      return [
        <PhotoRow
          key={key}
          category={category}
          categories={categories}
          // Overnight (board V3), the category itself: Open now would be an empty list.
          href={row.opens ? routes.slug(communitySlug, category.id) : `${routes.slug(communitySlug, category.id)}?openNow=1`}
          big={row.opens ? `Opens ${row.opens.at}` : `${row.open} open now`}
          small={row.opens ? `Nothing open now · first: ${row.opens.first}` : row.parts.join(' · ')}
          wide={wide}
        />,
      ]
    })
    if (rows.length === 0) return null
    // Board Q1 (Nov 14): each row its category's picture, full width, the
    // words in white over a dark fade, so the top of the phone home carries
    // the same colour as the tiles under it.
    body = <ul className={wide ? 'grid grid-cols-2 gap-5' : 'space-y-2'}>{rows}</ul>
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
    <section data-testid="right-now" data-moment={moment.kind} data-wide={wide || undefined} aria-labelledby="right-now-title">
      <h2 id="right-now-title" className={wide ? 'sr-only' : HOME_LABEL}>
        Right now
        {day && <span className="font-semibold normal-case tracking-normal"> · {day}</span>}
      </h2>
      {body}
    </section>
  )
}

/** One row: the category's picture under a dark fade, its name, the answer
 *  big, a line under it. A category with no picture: plain slate. */
function PhotoRow({ category, categories, href, big, small, wide }: { category: CategoryConfig; categories: readonly CategoryConfig[]; href: string; big: string; small: string; wide: boolean }) {
  const photo = getCategoryTilePhoto(categories as CategoryConfig[], category.id)
  return (
    <li>
      <Link
        href={href}
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
          <span className={`block font-semibold text-white/90 ${wide ? 'text-[15px]' : 'text-[13px]'}`}>{category.pluralLabel}</span>
          <span className={`block font-extrabold leading-tight ${wide ? 'text-[30px]' : 'text-[19px]'}`}>{big}</span>
          {small && <span className={`block truncate text-white/85 ${wide ? 'text-[14px]' : 'text-[12.5px]'}`}>{small}</span>}
        </span>
      </Link>
    </li>
  )
}

/** The eruv's row: the nearest (or only) eruv's status, or all of them
 *  counted, as the Friday card's eruv line says it (FridayEruv). */
function EruvRow({ category, categories, communitySlug, now, wide }: { category: CategoryConfig; categories: readonly CategoryConfig[]; communitySlug: string; now: number; wide: boolean }) {
  const { loaded, nearest } = useNearestEruv(communitySlug)
  const href = routes.slug(communitySlug, fixedViewSlug(category.kind) ?? category.id)
  const at = new Date(now)
  const one = loaded ? (nearest ?? (loaded.eruvim.length === 1 ? loaded.eruvim[0] : null)) : null
  let big = 'Eruv status'
  let small = ''
  let to = href
  if (loaded && one) {
    const view = eruvView(one, at, loaded.timezone, loaded.candles)
    big = view.label
    small = [one.name, view.checked?.split(' · ')[0]].filter(Boolean).join(' · ')
    to = `${href}?item=${encodeURIComponent(one.id)}`
  } else if (loaded) {
    const summary = eruvSummary(loaded.eruvim, at, loaded.timezone, loaded.candles)
    const texts = summary?.parts.map((p) => p.text) ?? []
    if (summary?.down) {
      big = summary.down
      small = texts.join(' · ')
    } else if (texts.length > 0) {
      big = texts[0]!
      small = texts.slice(1).join(' · ')
    }
  }
  return <PhotoRow category={category} categories={categories} href={to} big={big} small={small} wide={wide} />
}
