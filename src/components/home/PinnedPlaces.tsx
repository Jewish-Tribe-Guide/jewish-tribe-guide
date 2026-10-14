'use client'

import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { usePinned } from '@/lib/pinnedContext'
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
// is skipped.

export type PinnedPlace = { item: DirectoryResource; category: CategoryConfig }

/** The pinned places that still exist, the most recently pinned first. Null
 *  until the listings are here. */
export function usePinnedPlaces(): PinnedPlace[] | null {
  const { pinned } = usePinned()
  const listings = useAllListings()
  const categories = useCategories()
  if (!listings || !categories) return null
  const byId = new Map(listings.map((l) => [l.id, l]))
  const byCategory = new Map(categories.map((c) => [c.id, c]))
  return [...pinned].reverse().flatMap((p) => {
    const item = byId.get(p.id)
    const category = item && byCategory.get(item.category)
    return item && category ? [{ item, category }] : []
  })
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
  const shuls = places.filter((p) => hasMinyanim(p.category)).map((p) => p.item)
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
            <TodayPinnedRow key={p.item.id} place={p} communitySlug={communitySlug} from={from} now={now} />
          ))}
        </div>
      </WithMinyans>
    </section>
  )
}

function TodayPinnedRow({ place, communitySlug, from, now }: { place: PinnedPlace; communitySlug: string; from: LatLng; now: number | null }) {
  const { item, category } = place
  const categories = useCategories()
  const shul = useNextMinyan(item.id)
  // A shul's davening, or whether a place is open; not "No hours listed",
  // which on Today would be a line saying nothing.
  const status = hasMinyanim(category)
    ? shul && { text: shul.text, tone: shul.tone }
    : now !== null
      ? listingRowFacts(item, category, new Date(now)).find((f) => ['open', 'caution', 'closed', 'opens'].includes(f.tone))
      : null
  const miles = milesFrom(from, item)
  return (
    <Link href={routes.listing(communitySlug, category.id, listingSlug(item))} prefetch={false} className="flex items-center gap-3 border-t border-slate-100 py-2.5 first:border-t-0 hover:bg-slate-50">
      <CategoryIcon icon={category.icon} categoryId={category.id} iconImageUrl={photoOf(item)} initials={initialsOf(item.name)} shape="square" color={getCategoryColor(categories, category.id)} className="h-11 w-11 text-lg" sizePx={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15.5px] font-bold text-ink">{item.name}</span>
        <span className="mt-0.5 block text-[13.5px] text-slate-600">
          {category.label}
          {status && (
            <>
              {' · '}
              <span className={TONE[status.tone]}>{status.text}</span>
            </>
          )}
        </span>
      </span>
      {miles != null && <span className="shrink-0 text-[13px] font-semibold text-slate-500">{milesText(miles)}</span>}
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
    </Link>
  )
}
