'use client'

import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { usePinned } from '@/lib/pinnedContext'
import { useAllListings } from '@/lib/useAllListings'
import { useCategories } from '@/lib/useCategories'
import { useHomeSections } from '@/lib/useHomeSections'
import { getCategoryColor } from '@/lib/categoryColor'
import { haversineMiles, milesText, type LatLng } from '@/lib/geo'
import { initialsOf, listingRowFacts, listingRowNote, type RowFact } from '@/lib/listingRow'
import { listingSlug } from '@/lib/listingSlug'
import { mapQueryString, routes } from '@/lib/routes'
import { ChevronRightIcon, ThumbtackIcon } from '@/components/icons'
import CategoryIcon from '@/components/CategoryIcon'
import SwipeRow, { SwipeRowGroup } from '@/components/SwipeRow'
import { NextMinyans, useNextMinyan } from '@/components/resources/nextMinyans'

// ── Pinned places, on the Today home and their own page (step 6) ─────────────
// A visitor's pins (pinned.ts: saved on this device, no account). Today shows
// the three pinned last and "All N" once there are more; the Pinned page
// shows every one, grouped by category in the admin's order, nearest first,
// each row the category page's own words: whether it's open, the next
// minyan. A pin whose listing is gone is skipped.

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

const TONE: Record<RowFact['tone'], string> = {
  open: 'font-semibold text-green-700',
  caution: 'font-semibold text-amber-700',
  opens: 'font-semibold text-amber-700',
  closed: 'font-semibold text-red-700',
  minyan: 'font-semibold text-ink',
  quiet: 'text-slate-500',
  plain: '',
}

const hasMinyanim = (c: CategoryConfig) => c.detailFields.some((f) => f.type === 'minyanim')
const milesFrom = (from: LatLng, item: DirectoryResource) => (item.geo ? haversineMiles(from, item.geo) : null)
const photoOf = (item: DirectoryResource) => (typeof item.photo === 'string' && item.photo.trim() ? item.photo : undefined)

/** The rows' shuls, so each can say its next minyan. */
function WithMinyans({ places, children }: { places: PinnedPlace[]; children: React.ReactNode }) {
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
          <Link href={routes.pinned(communitySlug)} prefetch={false} className="shrink-0 whitespace-nowrap text-[14px] font-bold text-primary hover:underline">
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

// ── The Pinned page ──────────────────────────────────────────────────────────

/** Every pin, grouped by category in the admin's order, nearest first. */
export function PinnedList({ communitySlug, from, now }: { communitySlug: string; from: LatLng; now: number | null }) {
  const places = usePinnedPlaces()
  const categories = useCategories()
  const { toggle, setFilterActive } = usePinned()
  const sections = useHomeSections()
  if (!places || !categories) return null
  const count = places.length
  // The admin's order: the home page sections' (the Browse list), then any
  // category no section holds.
  const sectionOrder = (sections ?? []).flatMap((sec) => sec.cardIds)
  const rank = (c: CategoryConfig) => {
    const i = sectionOrder.indexOf(c.id)
    return i === -1 ? sectionOrder.length + categories.indexOf(c) : i
  }
  const groups = [...categories]
    .sort((a, b) => rank(a) - rank(b))
    .map((category) => ({
      category,
      places: places.filter((p) => p.category.id === category.id).sort((a, b) => (milesFrom(from, a.item) ?? Infinity) - (milesFrom(from, b.item) ?? Infinity)),
    }))
    .filter((g) => g.places.length > 0)
  const onMap = places.some((p) => p.item.geo && p.category.hasAddress !== false)
  return (
    <div data-testid="pinned-page">
      <Link href={routes.home(communitySlug)} className="text-[15px] font-bold text-primary hover:underline">
        ‹ Today
      </Link>
      <div className="mt-2 desktop:flex desktop:items-end desktop:justify-between desktop:gap-6">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-ink desktop:text-[36px]">Pinned</h1>
          <p className="mt-0.5 text-[15px] text-slate-600 desktop:text-base">
            {count === 0 ? (
              'Nothing pinned yet. Pin a place from its listing and it shows here, with whether it’s open and its next minyan.'
            ) : (
              <>
                {count} {count === 1 ? 'place' : 'places'}, saved <span className="desktop:hidden">on this phone</span>
                <span className="hidden desktop:inline">in this browser</span> only.
              </>
            )}
          </p>
        </div>
        {onMap && (
          <Link
            href={`${routes.map(communitySlug)}${mapQueryString({ pinned: true })}`}
            onClick={() => setFilterActive(true)}
            className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-bold text-primary hover:bg-slate-50 desktop:mt-0"
          >
            See them on the map
          </Link>
        )}
      </div>
      <SwipeRowGroup>
        <div className="mt-2 desktop:space-y-4">
          {groups.map(({ category, places: inGroup }) => (
            <section key={category.id} data-testid={`pinned-group-${category.id}`} className="mt-6 desktop:mt-0 desktop:rounded-2xl desktop:border desktop:border-slate-200 desktop:bg-white desktop:px-5 desktop:py-4">
              <h2 className="flex items-center gap-2.5">
                <CategoryIcon icon={category.icon} categoryId={category.id} color={getCategoryColor(categories, category.id)} className="h-8 w-8 text-sm" sizePx={32} />
                <span className="text-[16px] font-extrabold text-ink">{category.pluralLabel}</span>
                <span className="text-[14px] text-slate-500">{inGroup.length}</span>
              </h2>
              <WithMinyans places={inGroup}>
                <div className="mt-1.5 desktop:grid desktop:grid-cols-2 desktop:gap-x-7">
                  {inGroup.map((p) => (
                    <PinnedRow key={p.item.id} place={p} communitySlug={communitySlug} from={from} now={now} onUnpin={() => toggle({ id: p.item.id, categoryId: p.category.id })} />
                  ))}
                </div>
              </WithMinyans>
            </section>
          ))}
        </div>
      </SwipeRowGroup>
    </div>
  )
}

/** The category page's row: name, its facts, its note, how far. Swipe to
 *  Unpin on a phone; the pin button on desktop, which has no swipe. */
function PinnedRow({ place, communitySlug, from, now, onUnpin }: { place: PinnedPlace; communitySlug: string; from: LatLng; now: number | null; onUnpin: () => void }) {
  const { item, category } = place
  const shul = useNextMinyan(item.id)
  const at = now === null ? null : new Date(now)
  const facts = listingRowFacts(item, category, at, { shul }).filter((f) => !f.ownLine)
  // Only what's out of the ordinary (a hechsher's caveat, the shul's own
  // note): the admin's notes are for the category's own page.
  const note = [listingRowNote(item, category, at, { shulNote: shul?.note })].find((n) => n?.kind === 'exception')
  const miles = category.hasAddress === false ? null : milesFrom(from, item)
  // A place the guide has no address for yet can't be on the map; a WhatsApp
  // group was never going to be, and saying so would be noise.
  const noAddress = category.hasAddress !== false && !item.geo
  return (
    <div className="border-t border-slate-100 first:border-t-0 desktop:[&:nth-child(2)]:border-t-0">
      <SwipeRow
        rowId={item.id}
        actions={[{ id: 'pin', label: 'Unpin', ariaLabel: `Unpin ${item.name}`, active: true, onSelect: onUnpin }]}
        className="bg-white"
        contentClassName="relative flex items-center gap-2 bg-white py-2.5 touch-pan-y"
      >
        <Link href={routes.listing(communitySlug, category.id, listingSlug(item))} prefetch={false} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15.5px] font-bold text-ink">{item.name}</span>
            {facts.length > 0 && (
              <span className="mt-0.5 block text-[13.5px] leading-snug text-slate-600">
                {facts.map((f, i) => (
                  <span key={i}>
                    {i > 0 && ' · '}
                    <span className={TONE[f.tone]}>{f.text}</span>
                  </span>
                ))}
              </span>
            )}
            {note && <span className={`mt-0.5 block text-[13px] ${note.tone === 'caution' ? 'text-amber-700' : 'text-slate-500'}`}>{note.text}</span>}
            {noAddress && <span className="mt-0.5 block text-[13px] text-slate-500">No address in the guide yet, so it isn’t on the map</span>}
          </span>
          {miles != null && <span className="shrink-0 text-[13px] font-semibold text-slate-500">{milesText(miles)}</span>}
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400 desktop:hidden" />
        </Link>
        <button
          type="button"
          onClick={onUnpin}
          aria-label={`Unpin ${item.name}`}
          title="Unpin"
          className="hidden h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 desktop:flex"
        >
          <ThumbtackIcon className="h-[18px] w-[18px]" />
        </button>
      </SwipeRow>
    </div>
  )
}
