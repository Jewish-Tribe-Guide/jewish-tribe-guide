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
import { HOME_CARD_OUTLINE, LIFT_ON_HOVER, SIGN_OFF_BUTTON, SIGN_OFF_EYEBROW, SIGN_OFF_HEADING, SIGN_OFF_LINE } from './AnswerCard'
import { usePreviewDay } from '@/lib/contentContext'
import { previewNow } from '@/lib/previewDay'
import { dayAndMinutesInTimezone } from '@/lib/hours'
import ShabbosShopping from './ShabbosShopping'
import FridayEruv from './FridayEruv'
import { useHydrated } from '@/lib/useHydrated'

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
  /** The zmanim are still on their way: which kind of day it is isn't
   *  known yet, so nothing is guessed (tracker 104). */
  zmanimLoading?: boolean
}

/**
 * Run before the page paints, beside the placeholder (`script` is its
 * sibling): on a Friday before 4pm where the community is, the placeholder
 * takes Friday's height. The page is built ahead of time, so only the
 * browser knows the day; without this, the tiles dropped about 260px once
 * the candles card came. After 4pm it stays a weekday's: candle lighting
 * can be any time from about then, and Shabbos's card is about a weekday's.
 * Erev Yom Tov isn't guessed.
 */
export function placeholderDayScript(timezone: string): string {
  return `(function(s,tz){try{var p=new Intl.DateTimeFormat('en-US',{timeZone:tz,weekday:'short',hour:'numeric',hourCycle:'h23'}).formatToParts(new Date()),d='',h=0;for(var i=0;i<p.length;i++){if(p[i].type==='weekday')d=p[i].value;if(p[i].type==='hour')h=+p[i].value}if(d==='Fri'&&h<16)s.previousElementSibling.setAttribute('data-day','erev')}catch(e){}})(document.currentScript,${JSON.stringify(timezone).replace(/</g, '\\u003c')})`
}

/** Held open until the day is known, so the tiles under it don't jump. Its
 *  script is in the page as built, and in the render that hydrates it; a
 *  placeholder drawn later in the browser has no use for one (React
 *  doesn't run it). */
function Placeholder({ timezone }: { timezone: string }) {
  const hydrated = useHydrated()
  return (
    <>
      <div
        aria-hidden="true"
        data-testid="right-now-placeholder"
        // The script adds data-day before React hydrates it.
        suppressHydrationWarning
        // A weekday's rows; Friday's candles card with Shabbos shopping
        // under it (measured on a phone, tracker 104).
        className="h-[176px] animate-pulse rounded-2xl bg-slate-100 data-[day=erev]:h-[437px]"
      />
      {!hydrated && <script dangerouslySetInnerHTML={{ __html: placeholderDayScript(timezone) }} />}
    </>
  )
}

export default function RightNow(props: Props) {
  const { listings, categories, communitySlug, timezone, schedule, zmanim, wide = false } = props
  // In the admin's preview, the day asked for (previewDay.ts); null elsewhere.
  const previewDay = usePreviewDay()
  // Held open until the clock and the kind of day are known, so the tiles
  // under it don't jump once they arrive.
  if (!schedule || !listings || props.zmanimLoading) return <Placeholder timezone={timezone} />
  const now = previewNow(previewDay, zmanim, schedule.now, timezone)
  const nowMinutes = now === schedule.now ? schedule.nowMinutes : dayAndMinutesInTimezone(now, timezone).minutes
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
            button="See all times"
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
          button={row.opens ? `See ${category.pluralLabel}` : 'See what’s open'}
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
          nowMinutes={nowMinutes}
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
 *  big, a line under it. A category with no picture: plain slate. On the
 *  computer, a plain white card instead, drawn like the sign-off cards at
 *  the bottom of the page (board W8, the user, Nov 15: the photo band
 *  repeated "more of the same pictures when we just passed a row or two of
 *  pictures"): the category as a small grey label, the answer big, one
 *  line, and a blue button. The whole card opens it; the button is drawn,
 *  not a second control inside the link. */
function PhotoRow({ category, categories, href, big, small, button, wide }: { category: CategoryConfig; categories: readonly CategoryConfig[]; href: string; big: string; small: string; button: string; wide: boolean }) {
  if (wide) {
    return (
      <li>
        <Link
          href={href}
          prefetch={false}
          data-testid="right-now-row"
          className={`group flex h-full items-center gap-5 rounded-2xl bg-white px-7 py-6 ${HOME_CARD_OUTLINE} ${LIFT_ON_HOVER}`}
        >
          <span className="min-w-0 flex-1">
            <span className={`block ${SIGN_OFF_EYEBROW}`}>{category.pluralLabel}</span>
            <span className={`block ${SIGN_OFF_HEADING}`}>{big}</span>
            {small && <span className={`block truncate ${SIGN_OFF_LINE}`}>{small}</span>}
          </span>
          <span aria-hidden="true" data-testid="right-now-button" className={`${SIGN_OFF_BUTTON} group-hover:bg-primary-dark`}>
            {button}
          </span>
        </Link>
      </li>
    )
  }
  const photo = getCategoryTilePhoto(categories as CategoryConfig[], category.id)
  return (
    <li>
      <Link
        href={href}
        prefetch={false}
        data-testid="right-now-row"
        className="relative flex h-[84px] items-center gap-3 overflow-hidden rounded-2xl bg-slate-700 px-4 text-white"
      >
        {photo && (
          <span aria-hidden="true" data-testid="right-now-photo" className="absolute inset-0">
            <TilePhoto src={photo} px={400} sizes="100vw" />
          </span>
        )}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-slate-900/85 via-slate-900/65 to-slate-900/25" />
        <span className="relative min-w-0 flex-1">
          <span className="block text-[0.8125rem] font-semibold text-white/90">{category.pluralLabel}</span>
          <span className="block text-[1.1875rem] font-extrabold leading-tight">{big}</span>
          {small && <span className="block truncate text-[0.78125rem] text-white/85">{small}</span>}
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
  return <PhotoRow category={category} categories={categories} href={to} big={big} small={small} button="See the eruv" wide={wide} />
}
