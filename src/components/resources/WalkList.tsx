'use client'

import Link from 'next/link'
import { useContext, useEffect, useId, useState } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { useNow } from '@/lib/useNow'
import { listingRowNote } from '@/lib/listingRow'
import { kindField, listingFacts, listingKind } from '@/lib/listingView'
import { neighborhoodsFor, placeName, townsFrom } from '@/lib/places'
import { listingSlug } from '@/lib/listingSlug'
import { routes } from '@/lib/routes'
import {
  nearestBeyond,
  walkAnswer,
  walkDistanceText,
  walkGroupFields,
  walkGroups,
  type WalkList as WalkListSetting,
  type WalkRow,
} from '@/lib/walkList'
import type { LatLng } from '@/lib/geo'
import { NextMinyans, NextMinyansContext, useNextMinyan } from './nextMinyans'

// ── Other categories' places within a walk: a hotel's shuls, a hospital's
// food, shuls, hotels and mikvah ─────────────────────────────────────────────
// See walkList.ts. The other categories' places aren't on this page, so they
// load when a listing that lists them first opens, once per tab: opening the
// next hotel reuses them.

/** Kept this long, then loaded again: a tab left open for days still sees
 *  a new shul. */
const FRESH_MS = 10 * 60 * 1000
const loaded = new Map<string, { at: number; places: Promise<DirectoryResource[]> }>()

function loadPlaces(community: string, categoryId: string): Promise<DirectoryResource[]> {
  const key = `${community}:${categoryId}`
  const hit = loaded.get(key)
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.places
  const places = fetch(withCommunity(`/api/resources?category=${encodeURIComponent(categoryId)}`, community)).then(async (res) => {
    const body = await res.json()
    if (!res.ok || !body.ok) throw new Error('Could not load places')
    return body.resources as DirectoryResource[]
  })
  // A failure is tried again next time, not remembered.
  places.catch(() => loaded.delete(key))
  loaded.set(key, { at: Date.now(), places })
  return places
}

/** For tests: forget what's been loaded. */
export function forgetLoadedPlaces() {
  loaded.clear()
}

/** Each category's places, by id: null while loading, 'failed' when they
 *  couldn't load. */
export function usePlaces(categoryIds: readonly string[]): Record<string, DirectoryResource[] | 'failed' | null> {
  const community = useCommunitySlug()
  const ids = categoryIds.join('|')
  const [state, setState] = useState<{ key: string; places: Record<string, DirectoryResource[] | 'failed'> }>({ key: '', places: {} })
  const key = `${community}:${ids}`

  useEffect(() => {
    let cancelled = false
    for (const id of ids ? ids.split('|') : []) {
      loadPlaces(community, id).then(
        (places) => !cancelled && setState((s) => ({ key, places: { ...(s.key === key ? s.places : {}), [id]: places } })),
        () => !cancelled && setState((s) => ({ key, places: { ...(s.key === key ? s.places : {}), [id]: 'failed' } })),
      )
    }
    return () => {
      cancelled = true
    }
  }, [community, ids, key])

  const have = state.key === key ? state.places : {}
  return Object.fromEntries(categoryIds.map((id) => [id, have[id] ?? null]))
}

const isShuls = (c: CategoryConfig) => c.detailFields.some((f) => f.type === 'minyanim')

type Props = {
  lists: readonly WalkListSetting[]
  /** Where the listing the walk starts from is. */
  from: LatLng
  /** What it is, in the footnote: "from the hotel". */
  fromLabel: string
}

export default function WalkLists({ lists, from, fromLabel }: Props) {
  const categories = useCategories()
  const shown = lists.flatMap((walk) => {
    const target = categories.find((c) => c.id === walk.categoryId)
    return target ? [{ walk, target }] : []
  })
  const places = usePlaces(shown.map((s) => s.target.id))
  if (shown.length === 0) return null

  // Every list loaded and nothing on any of them: said once, rather than
  // one empty card after another.
  const all = shown.map(({ walk, target }) => ({ walk, target, places: places[target.id] }))
  if (all.length > 1 && all.every((x) => Array.isArray(x.places) && walkGroups(from, x.places, x.walk.maxMinutes).length === 0)) {
    return <NothingNear lists={all as { walk: WalkListSetting; target: CategoryConfig; places: DirectoryResource[] }[]} from={from} />
  }

  return (
    <>
      {shown.map(({ walk, target }) => (
        <WalkList key={target.id} walk={walk} target={target} places={places[target.id]} from={from} fromLabel={fromLabel} />
      ))}
    </>
  )
}

function WalkList({
  walk,
  target,
  places,
  from,
  fromLabel,
}: {
  walk: WalkListSetting
  target: CategoryConfig
  places: DirectoryResource[] | 'failed' | null
  from: LatLng
  fromLabel: string
}) {
  const headingId = useId()
  const noun = target.pluralLabel || target.label
  const shuls = isShuls(target)

  let body
  if (places === null) {
    body = (
      <div aria-hidden="true" className="mt-3 space-y-2">
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
      </div>
    )
  } else if (places === 'failed') {
    body = <p className="mt-2 text-sm text-slate-600">The {noun.toLowerCase()} nearby couldn’t load.</p>
  } else {
    body = (
      <NextMinyans enabled={shuls} items={places}>
        <ListBody walk={walk} target={target} places={places} from={from} fromLabel={fromLabel} />
      </NextMinyans>
    )
  }

  return (
    <>
      <hr className="border-slate-200" />
      <section data-testid="walk-list" aria-labelledby={headingId}>
        <div className="flex items-center gap-2">
          <WalkIcon />
          <h3 id={headingId} className="text-base font-extrabold text-slate-900">
            {noun} within a walk
          </h3>
        </div>
        {body}
      </section>
    </>
  )
}

function ListBody({
  walk,
  target,
  places,
  from,
  fromLabel,
}: {
  walk: WalkListSetting
  target: CategoryConfig
  places: DirectoryResource[]
  from: LatLng
  fromLabel: string
}) {
  const community = useCommunitySlug()
  const minyans = useContext(NextMinyansContext)
  const noun = (target.pluralLabel || target.label).toLowerCase()
  const field = walk.groupBy ? (walkGroupFields(target).find((f) => f.key === walk.groupBy) ?? null) : null
  const groups = walkGroups(from, places, walk.maxMinutes, field)
  const shuls = isShuls(target)
  const hoods = neighborhoodsFor(community)
  const towns = townsFrom(places)

  // A shul list answers with the nearest minyan; a list by a pick-list, with
  // the nearest of its first kind (walkAnswer).
  const rows = groups.flatMap((g) => g.rows)
  const minyan = shuls ? rows.find((r) => minyans[r.item.id]?.tone === 'minyan') : undefined
  const answer = minyan
    ? `Nearest minyan: ${minyan.item.name}, ${minyan.minutes} min · ${minyans[minyan.item.id].text}.`
    : walkAnswer(groups, field)

  if (groups.length === 0) {
    const nearest = nearestBeyond(from, places, walk.maxMinutes)
    return (
      <p className="mt-2 text-sm leading-snug text-slate-700">
        No {noun} listed within a {walk.maxMinutes}-minute walk.
        {nearest && (
          <>
            {' '}
            Nearest:{' '}
            <Link href={routes.listing(community, target.id, listingSlug(nearest.item))} className="font-semibold text-primary hover:underline">
              {nearest.item.name}
            </Link>
            , {walkDistanceText(nearest)}.
          </>
        )}
      </p>
    )
  }

  return (
    <>
      {answer && (
        <p className="mt-2.5 rounded-lg bg-primary/[0.07] px-3 py-2 text-[14.5px] font-semibold leading-snug text-slate-900" data-testid="walk-answer">
          {answer}
        </p>
      )}
      {groups.map((g) => (
        <div key={g.label}>
          <h4 className="mt-3 mb-0.5 text-[12px] font-bold uppercase tracking-wide text-slate-500">
            {g.label} · {g.rows.length}
          </h4>
          <ul>
            {g.rows.map((row) => (
              <Row key={row.item.id} row={row} target={target} field={field} place={placeName(row.item, hoods, towns)} />
            ))}
          </ul>
        </div>
      ))}
      <p className="mt-2.5 text-[12.5px] leading-snug text-slate-500">
        Rough walking times from the {fromLabel.toLowerCase()}, in a straight line at 25 minutes a mile; streets make most walks longer.{' '}
        {shuls ? 'Tap one for its Shabbos times.' : 'Tap one to open it.'}
      </p>
    </>
  )
}

/** One place: how far, its name, and what its own list's row says about it:
 *  its kind and facts ("Parve · IKC"), less what the list is grouped by;
 *  a shul's next minyan; a caveat ("Not everything here is kosher"); or,
 *  with nothing to say, where it is. */
function Row({ row, target, field, place }: { row: WalkRow; target: CategoryConfig; field: CategoryField | null; place: string | null }) {
  const community = useCommunitySlug()
  const clock = useNow()
  const shul = useNextMinyan(row.item.id)
  const { item, minutes } = row
  const kind = kindField(target)
  const caveat = listingRowNote(item, target, clock === null ? null : new Date(clock))
  const about = [
    ...(kind && kind.key !== field?.key ? [listingKind(item, target)] : []),
    ...listingFacts(item, target).filter((f) => !field || !groupLabels(field).includes(f)),
    ...(shul ? [shul.text] : []),
    ...(caveat?.kind === 'exception' && caveat.tone === 'caution' ? [caveat.text] : []),
  ]
  const line = about.length ? about.join(' · ') : place
  return (
    <li className="border-t border-slate-100">
      <Link
        href={routes.listing(community, target.id, listingSlug(item))}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-3 py-2.5 hover:bg-slate-50"
      >
        <span className="w-[52px] shrink-0 text-[15px] font-extrabold text-slate-900">
          {minutes}
          <span className="text-[12px] font-semibold text-slate-500"> min</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-slate-900">{item.name}</span>
          {line && <span className="mt-0.5 block truncate text-[13px] text-slate-500">{line}</span>}
        </span>
        <ChevronIcon />
      </Link>
    </li>
  )
}

/** What the grouping field says on a row's facts, to leave out: its
 *  options, or a yes/no's filter label. */
function groupLabels(field: CategoryField): string[] {
  return field.type === 'boolean' ? [field.filterLabel ?? field.label] : (field.options ?? []).map((o) => o.label)
}

/** Nothing on any list: one line naming them, then the nearest of each. */
function NothingNear({ lists, from }: { lists: { walk: WalkListSetting; target: CategoryConfig; places: DirectoryResource[] }[]; from: LatLng }) {
  const community = useCommunitySlug()
  const headingId = useId()
  const nouns = lists.map((l) => (l.target.pluralLabel || l.target.label).toLowerCase())
  const max = Math.max(...lists.map((l) => l.walk.maxMinutes))
  const nearest = lists.flatMap((l) => {
    const r = nearestBeyond(from, l.places, l.walk.maxMinutes)
    return r ? [{ ...r, target: l.target }] : []
  })
  return (
    <>
      <hr className="border-slate-200" />
      <section data-testid="walk-list-none" aria-labelledby={headingId}>
        <div className="flex items-center gap-2">
          <WalkIcon />
          <h3 id={headingId} className="text-base font-extrabold text-slate-900">
            Within a walk
          </h3>
        </div>
        <p className="mt-2 text-sm leading-snug text-slate-700">
          No {andList(nouns)} listed within a {max}-minute walk.
        </p>
        {nearest.length > 0 && (
          <ul className="mt-1.5 space-y-1 text-sm text-slate-700">
            {nearest.map((n) => (
              <li key={n.target.id}>
                Nearest {(n.target.label || n.target.pluralLabel).toLowerCase()}:{' '}
                <Link href={routes.listing(community, n.target.id, listingSlug(n.item))} className="font-semibold text-primary hover:underline">
                  {n.item.name}
                </Link>
                , {walkDistanceText(n)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function andList(parts: string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`
}

function WalkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-slate-500"
    >
      <circle cx="13" cy="4" r="2" />
      <path d="m9 20 3-6 3 3v4" />
      <path d="m6 12 2-3 4-1 3 3 3 1" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-slate-400"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
