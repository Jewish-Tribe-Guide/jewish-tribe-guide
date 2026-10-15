'use client'

import Link from 'next/link'
import { Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { mapQueryString, routes } from '@/lib/routes'
import {
  nearestBeyond,
  walkDistanceText,
  walkGroupFields,
  walkGroups,
  type WalkList as WalkListSetting,
  type WalkRow,
} from '@/lib/walkList'
import type { LatLng } from '@/lib/geo'
import { routesThatHold, type Routed, type WalkRoute } from '@/lib/walkRoutes'
import { NextMinyans, useNextMinyan } from './nextMinyans'
import { MinyanRow } from './MinyanimView'
import { isMinyanim } from '@/lib/davening'
import { minyanimAhead } from '@/lib/minyanimFilters'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'
import { Card } from './listingParts'
import { WalkOnMapContext } from './walkOnMap'

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

// The walks along the streets from one listing (walkRoutes.ts), once per
// tab as its places are. Nothing, when they can't load: every walk shows
// its estimate, as it did before they were worked out.
const routesLoaded = new Map<string, { at: number; routes: Promise<Record<string, WalkRoute>> }>()

function loadWalkRoutes(community: string, fromId: string): Promise<Record<string, WalkRoute>> {
  const key = `${community}:${fromId}`
  const hit = routesLoaded.get(key)
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.routes
  const routes = fetch(withCommunity(`/api/walk-routes?from=${encodeURIComponent(fromId)}`, community))
    .then(async (res) => {
      const body = await res.json()
      const routes: unknown = res.ok && body?.ok ? body.routes : null
      return routes && typeof routes === 'object' && !Array.isArray(routes) ? (routes as Record<string, WalkRoute>) : {}
    })
    .catch(() => ({}))
  routesLoaded.set(key, { at: Date.now(), routes })
  return routes
}

/** For tests: forget the walks loaded. */
export function forgetLoadedWalkRoutes() {
  routesLoaded.clear()
}

function useWalkRoutes(fromId: string | undefined): Record<string, WalkRoute> {
  const community = useCommunitySlug()
  const [state, setState] = useState<{ key: string; routes: Record<string, WalkRoute> }>({ key: '', routes: {} })
  const key = fromId ? `${community}:${fromId}` : ''
  useEffect(() => {
    if (!fromId) return
    let cancelled = false
    loadWalkRoutes(community, fromId).then((routes) => !cancelled && setState({ key, routes }))
    return () => {
      cancelled = true
    }
  }, [community, fromId, key])
  return state.key === key ? state.routes : NO_ROUTES
}
const NO_ROUTES: Record<string, WalkRoute> = {}
const NO_PLACES: Record<string, DirectoryResource[] | 'failed'> = {}

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

  // The same object until a load lands: the walks built from it, and the
  // map beside the listing fed from those, would otherwise change on every
  // render, and the map's own render renders this again (the user, Oct 15:
  // a pin that wouldn't light on hover, a row slow to open).
  const have = state.key === key ? state.places : NO_PLACES
  return useMemo(() => Object.fromEntries(ids.split('|').filter(Boolean).map((id) => [id, have[id] ?? null])), [have, ids])
}

/** A kind's Minyanim line's id beside its own: one open at a time. */
const MINYANIM_SUFFIX = ':minyanim'

/** Nearest first by the walk, then by the miles. */
const byNearest = (a: WalkRow, b: WalkRow) => a.minutes - b.minutes || a.miles - b.miles

const isShuls = (c: CategoryConfig) => c.detailFields.some((f) => f.type === 'minyanim')

type Props = {
  lists: readonly WalkListSetting[]
  /** Where the listing the walk starts from is. */
  from: LatLng
  /** What it is, in the footnote: "from the hotel". */
  fromLabel: string
  /** The listing it starts from, for "See them on the map": the Map with
   *  it selected and the kind's places around it. */
  fromItem?: Pick<DirectoryResource, 'id' | 'category'>
}

/** One box, "Within a walk", a line a kind (Oct 6): how many, and the
 *  nearest, with the whole list a tap away. Four full lists in a row was
 *  most of a hospital's page. */
export default function WalkLists({ lists, from, fromLabel, fromItem }: Props) {
  const categories = useCategories()
  // One kind open at a time: the map beside it shows one list.
  const [openId, setOpenId] = useState<string | null>(null)
  const onMap = useContext(WalkOnMapContext)
  const show = onMap?.show
  const highlight = onMap?.highlight
  const shown = lists.flatMap((walk) => {
    const target = categories.find((c) => c.id === walk.categoryId)
    return target ? [{ walk, target }] : []
  })
  const places = usePlaces(shown.map((s) => s.target.id))
  // Each kind's walks along the streets that still hold (walkRoutes.ts).
  const stored = useWalkRoutes(fromItem?.id)
  const { lat, lng } = from
  const routedOf = useMemo(() => {
    const out = new Map<string, Routed>()
    for (const [id, list] of Object.entries(places)) if (Array.isArray(list)) out.set(id, routesThatHold(stored, { lat, lng }, list))
    return out
  }, [places, stored, lat, lng])
  // The open kind's places on the map, from what's open rather than from
  // the tap that opened it: Back to a listing brings it back with the kind
  // still open (its state is kept while hidden), and its places must come
  // back with it (Oct 6). Off the map when the listing closes or hides.
  // A kind's Minyanim line is its shuls on the map, as its own line is.
  const openKind = openId?.replace(MINYANIM_SUFFIX, '') ?? null
  const openWalk = shown.find((s) => s.target.id === openKind)?.walk
  const openPlaces = openKind ? places[openKind] : null
  const maxMinutes = openWalk?.maxMinutes
  const openRouted = openKind ? routedOf.get(openKind) : undefined
  useEffect(() => {
    if (!show) return
    if (!openKind || !Array.isArray(openPlaces) || maxMinutes === undefined) {
      show(null)
      return
    }
    const rows = walkGroups({ lat, lng }, openPlaces, maxMinutes, null, openRouted)
      .flatMap((g) => g.rows)
      .sort(byNearest)
    show({ categoryId: openKind, places: rows.map((r) => r.item) })
    return () => {
      show(null)
      // A row opened by a click never sees the pointer leave: its pin
      // stays lit when Back brings the listing back.
      if (highlight && rows.some((r) => r.item.id === highlight.get())) highlight.set(null)
    }
  }, [show, highlight, openKind, openPlaces, openRouted, maxMinutes, lat, lng])
  if (shown.length === 0) return null
  // Along the streets once any walk here is; a straight line before that.
  const reach = shown.flatMap(({ walk, target }) => {
    const list = places[target.id]
    return Array.isArray(list) ? walkGroups(from, list, walk.maxMinutes, null, routedOf.get(target.id)).flatMap((g) => g.rows) : []
  })
  const routedCount = reach.filter((r) => r.routed).length
  const footer =
    routedCount === 0
      ? `Rough walking times from the ${fromLabel.toLowerCase()}, in a straight line at 25 minutes a mile; streets make most walks longer.`
      : `Walking times from the ${fromLabel.toLowerCase()} along the streets, from openrouteservice.org and © OpenStreetMap contributors.${routedCount < reach.length ? ' A place added since last night is a rough estimate until then.' : ''}`
  return (
    <Card
      title="Within a walk"
      testId="walk-lists"
      footer={footer}
    >
      <ul className="divide-y divide-slate-100">
        {shown.map(({ walk, target }) => {
          const list = places[target.id]
          const minyanimId = `${target.id}${MINYANIM_SUFFIX}`
          return (
            <Fragment key={target.id}>
              <WalkList
                walk={walk}
                target={target}
                places={list}
                routed={routedOf.get(target.id)}
                from={from}
                fromItem={fromItem}
                open={openId === target.id}
                onToggle={() => setOpenId(openId === target.id ? null : target.id)}
              />
              {/* Its shuls' minyanim by time, a line of its own (the user,
                  Oct 15: "two lists, keep it simple"). */}
              {isShuls(target) && Array.isArray(list) && (
                <WalkMinyanim
                  walk={walk}
                  target={target}
                  places={list}
                  routed={routedOf.get(target.id)}
                  from={from}
                  open={openId === minyanimId}
                  onToggle={() => setOpenId(openId === minyanimId ? null : minyanimId)}
                />
              )}
            </Fragment>
          )
        })}
      </ul>
    </Card>
  )
}

/** One kind: "Synagogues · 9", "Nearest: Mekor Habracha, 3 min", opening
 *  to the list itself. */
function WalkList({
  walk,
  target,
  places,
  routed,
  from,
  fromItem,
  open,
  onToggle,
}: {
  walk: WalkListSetting
  target: CategoryConfig
  places: DirectoryResource[] | 'failed' | null
  /** Its walks along the streets that hold, by place. */
  routed?: Routed
  from: LatLng
  fromItem?: Pick<DirectoryResource, 'id' | 'category'>
  open: boolean
  onToggle: () => void
}) {
  const community = useCommunitySlug()
  const noun = target.pluralLabel || target.label
  const shuls = isShuls(target)
  const rows = Array.isArray(places) ? walkGroups(from, places, walk.maxMinutes, null, routed).flatMap((g) => g.rows).sort(byNearest) : []
  const beyond = Array.isArray(places) && rows.length === 0 ? nearestBeyond(from, places, walk.maxMinutes, routed) : null

  // Under the title only what there's no list to say (the user, Oct 15:
  // "Nearest" over a list of them, nearest first, said it twice).
  let summary: ReactNode = null
  if (places === null) {
    summary = <span aria-hidden="true" className="mt-1 block h-4 w-2/3 animate-pulse rounded bg-slate-100" />
  } else if (places === 'failed') {
    summary = `The ${noun.toLowerCase()} nearby couldn’t load.`
  } else if (rows.length === 0) {
    summary = (
      <>
        None within a {walk.maxMinutes}-minute walk.
        {beyond && (
          <>
            {' '}
            Nearest:{' '}
            <Link href={routes.listing(community, target.id, listingSlug(beyond.item))} className="font-semibold text-primary hover:underline">
              {beyond.item.name}
            </Link>
            , {walkDistanceText(beyond)}.
          </>
        )}
      </>
    )
  }
  const title = (
    <span className="block text-[15px] font-bold text-slate-900">{rows.length > 0 ? `${noun} · ${rows.length}` : noun}</span>
  )
  const sub = summary && <span className="mt-0.5 block text-[13.5px] leading-snug text-slate-600">{summary}</span>

  return (
    <li data-testid="walk-list">
      {rows.length > 0 && Array.isArray(places) ? (
        <>
          <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full cursor-pointer items-center gap-3 py-2.5 text-left">
            <span className="min-w-0 flex-1">
              {title}
              {sub}
            </span>
            <ChevronIcon className={`transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
          </button>
          {open && (
            <div className="pb-2">
              <NextMinyans enabled={shuls} items={places}>
                <ListBody walk={walk} target={target} places={places} routed={routed} from={from} fromItem={fromItem} />
              </NextMinyans>
            </div>
          )}
        </>
      ) : (
        <div className="py-2.5">
          {title}
          {sub}
        </div>
      )}
    </li>
  )
}

/** A shul kind's minyanim within the walk, by time (Oct 15): what's left
 *  today, or tomorrow's when nothing is, each with its walk. For a weekday,
 *  when the time matters more than which shul; the kind's own line is for
 *  choosing a shul. Not there when no shul in the walk lists its times. */
function WalkMinyanim({
  walk,
  target,
  places,
  routed,
  from,
  open,
  onToggle,
}: {
  walk: WalkListSetting
  target: CategoryConfig
  places: DirectoryResource[]
  routed?: Routed
  from: LatLng
  open: boolean
  onToggle: () => void
}) {
  const community = useCommunitySlug()
  const onMap = useContext(WalkOnMapContext)
  const field = target.detailFields.find((f) => f.type === 'minyanim')
  const rows = walkGroups(from, places, walk.maxMinutes, null, routed).flatMap((g) => g.rows)
  const shuls = field ? rows.filter((r) => isMinyanim(r.item[field.key]) && (r.item[field.key] as unknown[]).length > 0).map((r) => r.item) : []
  // Null until the page has hydrated (see useNow): the line waits.
  const schedule = useMinyanSchedule(null, shuls)
  if (shuls.length === 0) return null

  const walkOf = new Map(rows.map((r) => [r.item.id, r.minutes]))
  const byId = new Map(shuls.map((s) => [s.id, s]))
  const ahead = schedule ? minyanimAhead(schedule) : null
  const today = ahead?.today ?? []
  const slots = today.length > 0 ? today : (ahead?.tomorrow ?? [])
  const day = today.length > 0 ? schedule?.week[0] : schedule?.week[1]
  const walkText = (id: string | undefined) => (id && walkOf.has(id) ? `${walkOf.get(id)} min walk` : null)

  // Under the title only what there's no list to say, as the kind's line.
  const summary = ahead && slots.length === 0 ? 'No minyanim listed today or tomorrow.' : null
  const count = today.length > 0 ? ` · ${today.length} left today` : slots.length > 0 ? ` · ${slots.length} tomorrow` : ''
  const title = <span className="block text-[15px] font-bold text-slate-900">Minyanim{count}</span>
  const sub = summary && <span className="mt-0.5 block text-[13.5px] leading-snug text-slate-600">{summary}</span>

  return (
    <li data-testid="walk-minyanim">
      {slots.length > 0 && schedule && day ? (
        <>
          <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full cursor-pointer items-center gap-3 py-2.5 text-left">
            <span className="min-w-0 flex-1">
              {title}
              {sub}
            </span>
            <ChevronIcon className={`transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
          </button>
          {open && (
            <div className="pb-2">
              <h4 className="mt-1 mb-0.5 text-[12px] font-bold uppercase tracking-wide text-slate-500">
                {today.length > 0 ? 'Today' : 'Tomorrow'} · {slots.length}
              </h4>
              <ul>
                {slots.map((s, i) => {
                  const shul = byId.get(s.shulId ?? '')
                  return (
                    <MinyanRow
                      key={`${s.shulId}:${s.tefillah}:${s.minutes}:${i}`}
                      slot={s}
                      far={walkText(s.shulId)}
                      kind={shul ? listingKind(shul, target) : ''}
                      posting={(s.shulId && schedule.posting[s.shulId]?.[day.date]) || { kind: 'regular' }}
                      href={shul ? routes.listing(community, target.id, listingSlug(shul)) : null}
                      onHover={onMap ? onMap.highlight.set : undefined}
                    />
                  )
                })}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="py-2.5">
          {title}
          {sub}
        </div>
      )}
    </li>
  )
}

function ListBody({
  walk,
  target,
  places,
  routed,
  from,
  fromItem,
}: {
  walk: WalkListSetting
  target: CategoryConfig
  places: DirectoryResource[]
  routed?: Routed
  from: LatLng
  fromItem?: Pick<DirectoryResource, 'id' | 'category'>
}) {
  const onMap = useContext(WalkOnMapContext)
  const community = useCommunitySlug()
  const noun = (target.pluralLabel || target.label).toLowerCase()
  const field = walk.groupBy ? (walkGroupFields(target).find((f) => f.key === walk.groupBy) ?? null) : null
  const groups = walkGroups(from, places, walk.maxMinutes, field, routed)
  const shuls = isShuls(target)
  const hoods = neighborhoodsFor(community)
  const towns = townsFrom(places)

  if (groups.length === 0) {
    const nearest = nearestBeyond(from, places, walk.maxMinutes, routed)
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
      {/* No "Nearest restaurant" or "Nearest minyan" over the list: the
          list, nearest first, says it (the user, Oct 15). */}
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
      <p className="mt-2 text-[12.5px] leading-snug text-slate-500">{shuls ? 'Tap one for its Shabbos times.' : 'Tap one to open it.'}</p>
      {/* These places aren't on this page's map, which shows its own
          category: the Map shows them around this one (Oct 6). */}
      {fromItem && !onMap && (
        <Link
          href={`${routes.map(community)}${mapQueryString({ categories: [fromItem.category, target.id], place: fromItem.id })}`}
          className="mt-2 inline-block text-[14px] font-bold text-primary hover:underline"
        >
          See them on the map
        </Link>
      )}
    </>
  )
}

/** One place: how far, its name, and what its own list's row says about it:
 *  its kind and facts ("Parve · IKC"), less what the list is grouped by;
 *  a shul's next minyan; a caveat ("Not everything here is kosher"); or,
 *  with nothing to say, where it is. */
function Row({ row, target, field, place }: { row: WalkRow; target: CategoryConfig; field: CategoryField | null; place: string | null }) {
  const onMap = useContext(WalkOnMapContext)
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
        // Its pin, lit on the map beside the listing (walkOnMap.ts).
        onMouseEnter={onMap ? () => onMap.highlight.set(item.id) : undefined}
        onMouseLeave={onMap ? () => onMap.highlight.set(null) : undefined}
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
      </Link>
    </li>
  )
}

/** What the grouping field says on a row's facts, to leave out: its
 *  options, or a yes/no's filter label. */
function groupLabels(field: CategoryField): string[] {
  return field.type === 'boolean' ? [field.filterLabel ?? field.label] : (field.options ?? []).map((o) => o.label)
}

function ChevronIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 text-slate-400 ${className}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
