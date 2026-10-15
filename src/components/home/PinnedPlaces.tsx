'use client'

import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { usePinned } from '@/lib/pinnedContext'
import { useCommunitySlug } from '@/lib/communityContext'
import { useEruvStatuses } from '@/lib/useEruvStatuses'
import { eruvView, type Eruv, type EruvView } from '@/lib/eruv'
import { TONE_WORDS } from '@/lib/eruvTone'
import { useAllListings } from '@/lib/useAllListings'
import { useCategories } from '@/lib/useCategories'
import { getCategoryColor } from '@/lib/categoryColor'
import { haversineMiles, milesText, type LatLng } from '@/lib/geo'
import { initialsOf, listingRowFacts, type RowFact } from '@/lib/listingRow'
import { listingSlug } from '@/lib/listingSlug'
import { routes } from '@/lib/routes'
import { ChevronRightIcon } from '@/components/icons'
import CategoryIcon from '@/components/CategoryIcon'
import { NextMinyans, useNextMinyan } from '@/components/resources/nextMinyans'

// ── Pinned places, on the Today home and their own page (step 6) ─────────────
// A visitor's pins (pinned.ts: saved on this device, no account). Today shows
// the three pinned last and "All N" once there are more, which opens You
// (the Pinned page was replaced by it, Oct 14). A pin whose listing is gone
// is skipped. An eruv can be saved too (Oct 15): it isn't a listing but a
// row of its own table, so its pin is found among the eruvim (/api/eruv),
// with its status this week.

export type PinnedPlace =
  | { kind: 'listing'; id: string; item: DirectoryResource; category: CategoryConfig }
  | { kind: 'eruv'; id: string; eruv: Eruv; category: CategoryConfig; timezone: string; candles: number | null }

/** The pinned places that still exist, the most recently pinned first. Null
 *  until the listings are here, and the eruvim if one is saved. */
export function usePinnedPlaces(): PinnedPlace[] | null {
  const { pinned } = usePinned()
  const listings = useAllListings()
  const categories = useCategories()
  const slug = useCommunitySlug()
  const eruvPage = categories?.find((c) => c.kind === 'eruv') ?? null
  const eruvStatuses = useEruvStatuses(slug, !!eruvPage && pinned.some((p) => p.categoryId === eruvPage.id))
  if (!listings || !categories) return null
  const byId = new Map(listings.map((l) => [l.id, l]))
  const byCategory = new Map(categories.map((c) => [c.id, c]))
  const eruvPins = eruvPage ? pinned.filter((p) => p.categoryId === eruvPage.id && !byId.has(p.id)) : []
  if (eruvPins.length > 0 && !eruvStatuses) return null
  const eruvim = eruvStatuses?.available ? eruvStatuses : null
  return [...pinned].reverse().flatMap((p): PinnedPlace[] => {
    const item = byId.get(p.id)
    const category = item && byCategory.get(item.category)
    if (item && category) return [{ kind: 'listing', id: item.id, item, category }]
    const eruv = eruvPage && p.categoryId === eruvPage.id ? eruvim?.eruvim.find((e) => e.id === p.id) : undefined
    return eruv && eruvPage && eruvim ? [{ kind: 'eruv', id: eruv.id, eruv, category: eruvPage, timezone: eruvim.timezone, candles: eruvim.candles }] : []
  })
}

/** Where a saved place opens: a listing's page, or the eruv open on the
 *  Eruv page. */
export const placeHref = (communitySlug: string, p: PinnedPlace) =>
  p.kind === 'eruv' ? routes.eruv(communitySlug, p.eruv.id) : routes.listing(communitySlug, p.category.id, listingSlug(p.item))

export const placeName = (p: PinnedPlace) => (p.kind === 'eruv' ? p.eruv.name : p.item.name)

/** A saved eruv's status now: "Up for this Shabbos", and when it was checked. */
export const eruvPlaceView = (p: Extract<PinnedPlace, { kind: 'eruv' }>, now: number | null): EruvView | null =>
  now === null ? null : eruvView(p.eruv, new Date(now), p.timezone, p.candles)

/** A saved place's picture: a listing's photo or its category's icon; an
 *  eruv's initials, as on its listing. */
export function PlaceIcon({ place, color }: { place: PinnedPlace; color: string }) {
  const { category } = place
  return place.kind === 'eruv' ? (
    <CategoryIcon icon="" initials={initialsOf(place.eruv.name)} shape="square" color={color} className="h-11 w-11 text-lg" sizePx={44} />
  ) : (
    <CategoryIcon icon={category.icon} categoryId={category.id} iconImageUrl={photoOf(place.item)} initials={initialsOf(place.item.name)} shape="square" color={color} className="h-11 w-11 text-lg" sizePx={44} />
  )
}


export const TONE: Record<RowFact['tone'], string> = {
  open: 'font-semibold text-green-700',
  caution: 'font-semibold text-amber-700',
  opens: 'font-semibold text-amber-700',
  closed: 'font-semibold text-red-700',
  minyan: 'font-semibold text-ink',
  quiet: 'text-slate-500',
  plain: '',
}

export const hasMinyanim = (c: CategoryConfig) => c.detailFields.some((f) => f.type === 'minyanim')
export const milesFrom = (from: LatLng, item: DirectoryResource) => (item.geo ? haversineMiles(from, item.geo) : null)
export const photoOf = (item: DirectoryResource) => (typeof item.photo === 'string' && item.photo.trim() ? item.photo : undefined)

/** The rows' shuls, so each can say its next minyan. */
export function WithMinyans({ places, children }: { places: PinnedPlace[]; children: React.ReactNode }) {
  const shuls = places.flatMap((p) => (p.kind === 'listing' && hasMinyanim(p.category) ? [p.item] : []))
  return (
    <NextMinyans enabled={shuls.length > 0} items={shuls}>
      {children}
    </NextMinyans>
  )
}

// ── On Today ─────────────────────────────────────────────────────────────────

const ON_TODAY = 3

/** The three pinned last, each with its kind of place and what it's doing
 *  now ("Grocery · Open until 9 PM", "Synagogue · Shabbos only"). Nothing at
 *  all until something is pinned. */
export function PinnedBlock({ communitySlug, from, now }: { communitySlug: string; from: LatLng; now: number | null }) {
  const places = usePinnedPlaces()
  if (!places || places.length === 0) return null
  const shown = places.slice(0, ON_TODAY)
  return (
    <section data-testid="today-pinned" className="desktop:rounded-2xl desktop:border desktop:border-slate-200 desktop:bg-white desktop:px-5 desktop:py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-slate-500">Pinned</h2>
        {places.length > ON_TODAY && (
          <Link href={routes.you(communitySlug)} prefetch={false} className="shrink-0 whitespace-nowrap text-[14px] font-bold text-primary hover:underline">
            All {places.length} ›
          </Link>
        )}
      </div>
      <WithMinyans places={shown}>
        <div className="mt-1.5">
          {shown.map((p) => (
            <TodayPinnedRow key={p.id} place={p} communitySlug={communitySlug} from={from} now={now} />
          ))}
        </div>
      </WithMinyans>
    </section>
  )
}

function TodayPinnedRow({ place, communitySlug, from, now }: { place: PinnedPlace; communitySlug: string; from: LatLng; now: number | null }) {
  const { category } = place
  const categories = useCategories()
  const shul = useNextMinyan(place.id)
  // A shul's davening, or whether a place is open; not "No hours listed",
  // which on Today would be a line saying nothing. An eruv's, whether it's up.
  const eruv = place.kind === 'eruv' ? eruvPlaceView(place, now) : null
  const status =
    place.kind === 'eruv'
      ? eruv && { text: eruv.label, className: `font-semibold ${TONE_WORDS[eruv.tone]}` }
      : hasMinyanim(category)
        ? shul && { text: shul.text, className: TONE[shul.tone] }
        : now !== null
          ? ((f) => f && { text: f.text, className: TONE[f.tone] })(listingRowFacts(place.item, category, new Date(now)).find((f) => ['open', 'caution', 'closed', 'opens'].includes(f.tone)))
          : null
  const miles = place.kind === 'listing' ? milesFrom(from, place.item) : null
  return (
    <Link href={placeHref(communitySlug, place)} prefetch={false} className="flex items-center gap-3 border-t border-slate-100 py-2.5 first:border-t-0 hover:bg-slate-50">
      <PlaceIcon place={place} color={getCategoryColor(categories, category.id)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15.5px] font-bold text-ink">{placeName(place)}</span>
        <span className="mt-0.5 block text-[13.5px] text-slate-600">
          {/* "Eruv", as its listing says: the page's name is the page's. */}
          {place.kind === 'eruv' ? 'Eruv' : category.label}
          {status && (
            <>
              {' · '}
              <span className={status.className} data-tone={eruv?.tone}>
                {status.text}
              </span>
            </>
          )}
        </span>
      </span>
      {miles != null && <span className="shrink-0 text-[13px] font-semibold text-slate-500">{milesText(miles)}</span>}
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
    </Link>
  )
}
