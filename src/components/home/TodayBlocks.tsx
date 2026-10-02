'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { DirectoryResource, ZmanimData } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import type { AskResult } from '@/lib/askSearch'
import type { MinyanSchedule } from '@/lib/useMinyanSchedule'
import { CandleIcon, ChevronRightIcon, ClockIcon } from '@/components/icons'
import CategoryIcon from '@/components/CategoryIcon'
import { getCategoryColor } from '@/lib/categoryColor'
import { haversineMiles, milesText, type LatLng } from '@/lib/geo'
import { candlesToday, initialsOf, listingRowFacts, type RowFact } from '@/lib/listingRow'
import { formatStartsIn, nextMinyansAcross, type NextMinyanLine } from '@/lib/upcomingDavening'
import { routes } from '@/lib/routes'
import { beforeCandles, itemList, openNowTitle, shabbosMoment, shoppingTitle, type ShabbosMoment } from '@/lib/todayHome'
import type { TodayBlockId } from '@/lib/siteSettings'
import type { CardDef } from './sections'

// ── The Today home's blocks (step 6) ─────────────────────────────────────────
// Under the Ask box, what this moment calls for, two answers at most:
//   Friday or Erev Yom Tov: the candles card, Before candles, Next minyan.
//   Shabbos or Yom Tov: the card (havdalah), Next minyan. Nothing to buy and
//     nothing "open now": the places open then are certified for their food,
//     not for being open on Shabbos, and the home shouldn't suggest going.
//   Any other day: Next minyan, and the meal that's open now.
// Then the pinned places, then Browse. On a phone it's one column with a short
// row of categories at the end; on desktop the answers sit beside the full
// Browse list. Every answer is the site's own: the shuls' times, the stores'
// item lists and hours, the Food search.

type Props = {
  listings: readonly DirectoryResource[] | null
  categories: readonly CategoryConfig[]
  communitySlug: string
  timezone: string
  /** Where distances are measured from: the visitor's location, else the
   *  community's centre. */
  from: LatLng
  schedule: MinyanSchedule | null
  zmanim: ZmanimData | null
  /** The admin's Before candles items. */
  items: readonly string[]
  /** "Food open now", asked of the site's own search; null when not asked. */
  openNow: { question: string; result: AskResult } | null
  /** Every category card, in the admin's order. */
  cards: CardDef[] | null
  onOpenListing: (item: DirectoryResource) => void
  /** Hidden on a phone while a search is showing its answer. */
  searching: boolean
  /** The pinned places, when there are any (part 3). */
  pinned?: ReactNode
  /** The blocks the admin has turned off (SiteSettings.todayHidden). */
  hidden?: readonly TodayBlockId[]
}

export default function TodayBlocks(props: Props) {
  const { schedule, zmanim, timezone, categories, communitySlug, searching, hidden = [] } = props
  const on = (id: TodayBlockId) => !hidden.includes(id)
  const now = schedule?.now ?? null
  const moment: ShabbosMoment = now === null ? { kind: 'weekday' } : shabbosMoment(zmanim, now, timezone)
  const kindLink = (kind: string) => {
    const c = categories.find((x) => x.kind === kind)
    return c ? routes.slug(communitySlug, c.id) : null
  }
  const shulsHref = schedule?.linkCategoryId ? `${routes.slug(communitySlug, schedule.linkCategoryId)}?davening=1` : null

  const answers: ReactNode[] = []
  if (moment.kind !== 'weekday' && now !== null && on('candles')) {
    answers.push(
      <CandlesCard
        key="candles"
        moment={moment}
        now={now}
        nowMinutes={schedule!.nowMinutes}
        links={[
          ['Minyanim', shulsHref],
          ['Zmanim', kindLink('zmanim')],
          ...(moment.kind === 'erev' ? ([['Eruv', kindLink('eruv')]] as const) : []),
        ]}
      />,
    )
  }
  if (moment.kind === 'erev' && on('beforeCandles')) answers.push(<BeforeCandles key="shop" {...props} />)
  if (on('nextMinyan')) answers.push(<NextMinyan key="minyan" {...props} shulsHref={shulsHref} />)
  if (moment.kind === 'weekday' && props.openNow && on('openNow')) answers.push(<OpenNow key="open" {...props} openNow={props.openNow} />)

  return (
    <div data-testid="today-home" data-moment={moment.kind} className={`mt-6 desktop:mt-0 desktop:grid ${on('browse') ? 'desktop:grid-cols-[minmax(0,1fr)_340px]' : ''} desktop:items-start desktop:gap-6 ${searching ? 'hidden desktop:grid' : ''}`}>
      <div className="space-y-6 desktop:grid desktop:grid-cols-2 desktop:gap-5 desktop:space-y-0 desktop:[&>[data-wide]]:col-span-2">
        {answers}
        {/* Beside Next minyan on desktop; across the row on a Friday, where
            the two answers already fill it. Nothing until something's
            pinned. */}
        {props.pinned && on('pinned') && (
          <div data-wide={moment.kind === 'erev' || undefined} className="empty:hidden">
            {props.pinned}
          </div>
        )}
      </div>
      {on('browse') && (
        <>
          <BrowseRow {...props} />
          <BrowseList {...props} />
        </>
      )}
    </div>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────────

/** A block: a small uppercase title, a link on the right, its rows. A card of
 *  its own on desktop; on a phone the page is the card. */
function Block({ title, icon, more, children, testId, wide, last }: { title: string; icon?: ReactNode; more?: { label: string; href: string } | null; children: ReactNode; testId: string; wide?: boolean; last?: boolean }) {
  return (
    <section data-testid={testId} data-wide={wide || undefined} className={`${last ? 'desktop:order-last ' : ''}desktop:rounded-2xl desktop:border desktop:border-slate-200 desktop:bg-white desktop:px-5 desktop:py-4`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-slate-500">
          {icon}
          {title}
        </h2>
        {more && (
          <Link href={more.href} prefetch={false} className="shrink-0 whitespace-nowrap text-[14px] font-bold text-primary hover:underline">
            {more.label}
          </Link>
        )}
      </div>
      <div className="mt-1.5">{children}</div>
    </section>
  )
}

const TONE: Record<RowFact['tone'], string> = {
  open: 'font-semibold text-green-700',
  caution: 'font-semibold text-amber-700',
  opens: 'font-semibold text-amber-700',
  closed: 'font-semibold text-red-700',
  minyan: 'font-semibold text-ink',
  quiet: 'text-slate-500',
  plain: '',
}

/** A place, as a row: its photo (or initials), its name, a line about it. */
function PlaceRow({ item, category, categories, title, sub, right, onOpen }: { item: DirectoryResource; category: CategoryConfig; categories: readonly CategoryConfig[]; title: string; sub: ReactNode; right?: string | null; onOpen: () => void }) {
  const photo = typeof item.photo === 'string' && item.photo.trim() ? item.photo : undefined
  return (
    <button type="button" onClick={onOpen} className="flex w-full cursor-pointer items-center gap-3 border-t border-slate-100 py-2.5 text-left first:border-t-0 hover:bg-slate-50">
      <CategoryIcon icon={category.icon} categoryId={category.id} iconImageUrl={photo} initials={initialsOf(item.name)} shape="square" color={getCategoryColor([...categories], category.id)} className="h-11 w-11 text-lg" sizePx={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15.5px] font-bold text-ink">{title}</span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-slate-600">{sub}</span>
      </span>
      {right && <span className="shrink-0 text-[13px] font-semibold text-slate-500">{right}</span>}
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  )
}

function Facts({ facts }: { facts: RowFact[] }) {
  return (
    <>
      {facts.map((f, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          <span className={TONE[f.tone]}>{f.text}</span>
        </span>
      ))}
    </>
  )
}

const milesFrom = (from: LatLng, item: DirectoryResource) => (item.geo ? haversineMiles(from, item.geo) : null)

// ── The candles card ─────────────────────────────────────────────────────────

/** Friday: "Candles 6:12 PM, in 4 hr 42 min". Shabbos: "Havdalah 7:09 PM".
 *  The same dark card every week; the photo above never changes. */
function CandlesCard({ moment, now, nowMinutes, links }: { moment: Exclude<ShabbosMoment, { kind: 'weekday' }>; now: number; nowMinutes: number; links: readonly (readonly [string, string | null])[] }) {
  const big = moment.kind === 'erev' ? `Candles ${moment.candles.time}` : moment.ends ? `${moment.yomTov ? 'Yom Tov ends' : 'Havdalah'} ${endsLabel(moment.ends, now, nowMinutes)}` : moment.yomTov ? 'Yom Tov' : 'Shabbos'
  // From the instants themselves, so it's right wherever the device is.
  const until = (iso: string | undefined) => {
    if (!iso) return null
    const minutes = Math.round((Date.parse(iso) - now) / 60000)
    return minutes > 0 && minutes < 24 * 60 ? formatStartsIn(0, minutes, false) : null
  }
  const sub =
    moment.kind === 'erev'
      ? [until(moment.candles.iso), moment.ends ? `${moment.yomTov ? 'ends' : 'havdalah'} ${whenEnds(moment.ends)}` : null]
      : [until(moment.ends?.iso)?.replace(/^In/, moment.yomTov ? 'Yom Tov ends in' : 'Shabbos ends in') ?? null]
  return (
    <section data-testid="today-candles" data-wide className="relative overflow-hidden rounded-2xl bg-[#13243a] px-4 py-3.5 text-white desktop:px-6 desktop:py-5">
      <div aria-hidden="true" className="pointer-events-none absolute -right-9 -top-9 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(201,164,92,0.35),transparent_70%)]" />
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-300">
        <CandleIcon className="h-4 w-4 text-[#c9a45c]" />
        {moment.name ?? (moment.yomTov ? 'Yom Tov' : 'Shabbos')}
      </p>
      <p className="mt-0.5 text-[28px] font-extrabold tracking-tight">{big}</p>
      {sub.filter(Boolean).length > 0 && <p className="text-[13.5px] text-slate-300">{sub.filter(Boolean).join(' · ')}</p>}
      {links.some(([, href]) => href) && (
        <div className="mt-3 flex gap-2">
          {links.map(([label, href]) =>
            href ? (
              <Link key={label} href={href} prefetch={false} className="flex-1 rounded-lg bg-white/10 py-2 text-center text-[13.5px] font-bold text-white hover:bg-white/20 desktop:max-w-40">
                {label}
              </Link>
            ) : null,
          )}
        </div>
      )}
    </section>
  )
}

/** "Saturday 7:09 PM"; a Yom Tov's end comes dated: "Sun, Oct 4, 7:18 PM". */
function whenEnds(z: { label: string; time: string }): string {
  return `${z.label}${z.label.includes(',') ? ',' : ''} ${z.time}`
}

/** "7:09 PM" today; "Saturday 7:09 PM" on Friday night. */
function endsLabel(z: { label: string; time: string; iso?: string }, now: number, nowMinutes: number): string {
  if (!z.iso) return z.time
  const ms = Date.parse(z.iso) - now
  const minutesLeftToday = 24 * 60 - nowMinutes
  return ms / 60000 < minutesLeftToday ? z.time : whenEnds(z)
}

// ── Before candles ───────────────────────────────────────────────────────────

function BeforeCandles({ listings, categories, items, schedule, zmanim, from, communitySlug, onOpenListing }: Props) {
  if (!listings || !schedule || items.length === 0) return null
  const now = new Date(schedule.now)
  const { rows, missing } = beforeCandles(listings, categories, items, now, from)
  const storeKind = rows[0]?.category ?? categories.find((c) => c.detailFields.some((f) => f.type === 'tags' && f.showCountInHeader))
  if (!storeKind) return null
  // Tonight's candles, so a store that shuts first says "Until 4 PM, before
  // candles" (the category pages' own wording).
  const candlesAt = candlesToday(zmanim, now)
  return (
    <Block testId="today-before-candles" title="Before candles" more={{ label: 'Other stores ›', href: routes.slug(communitySlug, storeKind.id) }}>
      {rows.map((row) => {
        const status = listingRowFacts(row.store, row.category, now, { candlesAt }).find((f) => f.tone === 'open' || f.tone === 'caution')
        return (
          <PlaceRow
            key={row.store.id}
            item={row.store}
            category={row.category}
            categories={categories}
            title={shoppingTitle(row, items.length)}
            sub={
              <>
                {itemList(row.has)}
                {status && (
                  <>
                    {' · '}
                    <span className={TONE[status.tone]}>{status.text}</span>
                  </>
                )}
              </>
            }
            onOpen={() => onOpenListing(row.store)}
          />
        )
      })}
      {missing.length > 0 && <p className="mt-1.5 text-[13.5px] text-slate-600">No store open now lists {itemList(missing).toLowerCase()}.</p>}
    </Block>
  )
}

// ── Next minyan ──────────────────────────────────────────────────────────────

/** The next minyan anywhere, and the nearest shul's when that's another shul:
 *  the earliest is often miles away. */
function NextMinyan({ schedule, listings, from, onOpenListing, shulsHref }: Props & { shulsHref: string | null }) {
  if (schedule && schedule.shuls.length === 0) return null
  const byId = new Map((listings ?? []).map((l) => [l.id, l]))
  const milesOf = (id: string) => {
    const item = byId.get(id)
    return item ? milesFrom(from, item) : null
  }
  const lines = schedule
    ? nextMinyansAcross(schedule.shuls, { today: schedule.todayDayKeys, tomorrow: schedule.tomorrowDayKeys, nowMinutes: schedule.nowMinutes, season: schedule.season, anchors: schedule.anchors }, milesOf, Infinity)
    : null
  const first = lines?.[0]
  const nearest = lines?.reduce<NextMinyanLine | undefined>((best, l) => ((milesOf(l.shulId) ?? Infinity) < (best ? (milesOf(best.shulId) ?? Infinity) : Infinity) ? l : best), undefined)
  const shown = first ? [first, ...(nearest && nearest.shulId !== first.shulId ? [nearest] : lines!.slice(1, 2))] : []
  const said = (l: NextMinyanLine) => (l.label.endsWith(' tomorrow') ? `${l.label.slice(0, -9)}, tomorrow` : l.label)
  return (
    <section data-testid="today-next-minyan" className="rounded-2xl bg-primary/[0.07] px-4 py-3 desktop:px-5 desktop:py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.06em] text-slate-500">
          <ClockIcon className="h-3.5 w-3.5" />
          Next minyan
        </h2>
        {shulsHref && (
          <Link href={shulsHref} prefetch={false} className="shrink-0 whitespace-nowrap text-[14px] font-bold text-primary hover:underline">
            All by time ›
          </Link>
        )}
      </div>
      {lines === null ? (
        <div aria-hidden="true" className="mt-2 space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-slate-200" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-1.5 text-[14.5px] text-slate-600">Nothing listed for today or tomorrow.</p>
      ) : (
        <ul className="mt-1">
          {shown.map((line) => {
            const item = byId.get(line.shulId)
            const miles = milesOf(line.shulId)
            const nearestNote = line === nearest && line !== first && shown.length > 1 ? ', the nearest' : ''
            return (
              <li key={line.shulId}>
                <button
                  type="button"
                  onClick={() => item && onOpenListing(item)}
                  className="grid w-full cursor-pointer grid-cols-[72px_minmax(0,1fr)] gap-x-2 py-1 text-left hover:underline"
                >
                  <span className="text-[15.5px] font-extrabold text-ink">{line.time}</span>
                  <span className="text-[14.5px] text-slate-700">
                    {said(line)} · {line.shulName}
                    {miles != null && `, ${milesText(miles)}`}
                    {nearestNote}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ── Open now ─────────────────────────────────────────────────────────────────

function OpenNow({ openNow, categories, schedule, from, communitySlug, onOpenListing }: Props & { openNow: NonNullable<Props['openNow']> }) {
  const { result, question } = openNow
  if (!schedule || !result.categoryIds || result.hits.length === 0) return null
  const now = new Date(schedule.now)
  const hits = [...result.hits].sort((a, b) => (milesFrom(from, a.item) ?? Infinity) - (milesFrom(from, b.item) ?? Infinity)).slice(0, 3)
  return (
    <Block testId="today-open-now" wide last title={openNowTitle(schedule.nowMinutes)} more={{ label: `All ${result.hits.length} ›`, href: routes.ask(communitySlug, question) }}>
      <div className="desktop:grid desktop:grid-cols-3 desktop:gap-x-5 [&>*]:desktop:border-t-0">
        {hits.map((h) => {
          const facts = listingRowFacts(h.item, h.category, now)
          const status = facts.find((f) => f.tone === 'open' || f.tone === 'caution')
          const badges = facts.filter((f) => f.tone === 'plain' && !f.ownLine).slice(0, 2)
          const miles = milesFrom(from, h.item)
          return (
            <PlaceRow
              key={h.item.id}
              item={h.item}
              category={h.category}
              categories={categories}
              title={h.item.name}
              sub={<Facts facts={[...badges, ...(status ? [status] : [])]} />}
              right={miles != null ? milesText(miles) : null}
              onOpen={() => onOpenListing(h.item)}
            />
          )
        })}
      </div>
    </Block>
  )
}

// ── Browse ───────────────────────────────────────────────────────────────────

/** Phone: one short row of the admin's first six categories, scrolling;
 *  All goes to the Browse page, where every one is. */
function BrowseRow({ cards, categories, communitySlug }: Props) {
  if (!cards || cards.length === 0) return null
  return (
    <section data-testid="today-browse-row" className="mt-6 desktop:hidden">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-slate-500">Browse</h2>
        <Link href={routes.browse(communitySlug)} prefetch={false} className="text-[14px] font-bold text-primary">
          All ›
        </Link>
      </div>
      <div className="-mr-4 mt-2 flex gap-2 overflow-x-auto pr-4 [scrollbar-width:none]">
        {cards.slice(0, 6).map((card) => (
          <Link key={card.id ?? card.title} href={card.href} prefetch={false} className="flex w-[92px] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-1 pb-2 pt-2.5 text-center">
            <CategoryIcon icon={card.icon ?? ''} categoryId={card.id} color={getCategoryColor([...categories], card.id ?? '')} className="h-9 w-9 text-base" sizePx={36} />
            <span className="w-full truncate text-[13.5px] font-bold text-ink">{card.title}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** Desktop: every category, beside the answers. */
function BrowseList({ cards, categories, communitySlug }: Props) {
  if (!cards || cards.length === 0) return null
  return (
    <aside data-testid="today-browse" className="hidden rounded-2xl border border-slate-200 bg-white px-5 py-4 desktop:block">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-slate-500">Browse</h2>
        <Link href={routes.map(communitySlug)} prefetch={false} className="text-[14px] font-bold text-primary hover:underline">
          Map ›
        </Link>
      </div>
      <ul className="mt-1.5">
        {cards.map((card) => (
          <li key={card.id ?? card.title}>
            <Link href={card.href} prefetch={false} className="flex items-center gap-3 border-t border-slate-100 py-2 hover:bg-slate-50">
              <CategoryIcon icon={card.icon ?? ''} categoryId={card.id} color={getCategoryColor([...categories], card.id ?? '')} className="h-9 w-9 text-base" sizePx={36} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-ink">{card.title}</span>
                {card.count && <span className="block text-[13px] text-slate-500">{card.count}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
