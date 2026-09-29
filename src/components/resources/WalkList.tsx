'use client'

import Link from 'next/link'
import { useEffect, useId, useState } from 'react'
import type { DirectoryResource } from '@/types'
import { selectValues } from '@/lib/categories'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { rowBadgeFields } from '@/lib/listingRow'
import { neighborhoodsFor, placeName, townsFrom } from '@/lib/places'
import { listingSlug } from '@/lib/listingSlug'
import { routes } from '@/lib/routes'
import { walkGroups, type WalkList as WalkListSetting } from '@/lib/walkList'
import type { LatLng } from '@/lib/geo'

// ── "Synagogues within a walk", on a hotel ──────────────────────────────────
// See walkList.ts. The other category's places aren't on this page, so they
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

type Props = {
  walk: WalkListSetting
  /** Where the listing the walk starts from is. */
  from: LatLng
  /** What it is, in the footnote: "from the hotel". */
  fromLabel: string
}

export default function WalkList({ walk, from, fromLabel }: Props) {
  const headingId = useId()
  const community = useCommunitySlug()
  const target = useCategories().find((c) => c.id === walk.categoryId)
  const [state, setState] = useState<{
    key: string
    places: DirectoryResource[] | 'failed'
  } | null>(null)
  const key = `${community}:${walk.categoryId}`

  useEffect(() => {
    let cancelled = false
    loadPlaces(community, walk.categoryId).then(
      (places) => !cancelled && setState({ key, places }),
      () => !cancelled && setState({ key, places: 'failed' }),
    )
    return () => {
      cancelled = true
    }
  }, [community, walk.categoryId, key])

  if (!target) return null
  const noun = target.pluralLabel || target.label
  const places = state?.key === key ? state.places : null

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
    const groups = walkGroups(from, places, walk.maxMinutes)
    // What each row says under the name: the category's first pick-list
    // (a shul's denomination) and where it is, as the list's rows say it.
    const kind = rowBadgeFields(target).find((f) => f.type === 'select')
    const hoods = neighborhoodsFor(community)
    const towns = townsFrom(places)
    const about = (item: DirectoryResource) =>
      [
        kind &&
          selectValues(item[kind.key])
            .map((v) => kind.options?.find((o) => o.value === v)?.label ?? v)
            .join(', '),
        placeName(item, hoods, towns),
      ]
        .filter(Boolean)
        .join(' · ')
    body =
      groups.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">
          No {noun.toLowerCase()} listed within a {walk.maxMinutes}-minute walk.
        </p>
      ) : (
        <>
          {groups.map((g) => (
            <div key={g.label}>
              <h4 className="mt-3 mb-0.5 text-[12px] font-bold uppercase tracking-wide text-slate-500">
                {g.label} · {g.rows.length}
              </h4>
              <ul>
                {g.rows.map(({ item, minutes }) => (
                  <li key={item.id} className="border-t border-slate-100">
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
                        {about(item) && <span className="mt-0.5 block truncate text-[13px] text-slate-500">{about(item)}</span>}
                      </span>
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
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-2.5 text-[12.5px] leading-snug text-slate-500">
            Rough walking times from the {fromLabel.toLowerCase()}, in a straight line at 25 minutes a mile; streets make most walks longer.{' '}
            {target.detailFields.some((f) => f.type === 'minyanim') ? 'Tap one for its Shabbos times.' : 'Tap one to open it.'}
          </p>
        </>
      )
  }

  return (
    <>
      <hr className="border-slate-200" />
      <section data-testid="walk-list" aria-labelledby={headingId}>
        <div className="flex items-center gap-2">
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
          <h3 id={headingId} className="text-base font-extrabold text-slate-900">
            {noun} within a walk
          </h3>
        </div>
        {body}
      </section>
    </>
  )
}
