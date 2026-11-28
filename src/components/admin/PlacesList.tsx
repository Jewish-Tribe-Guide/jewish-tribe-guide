'use client'

import { replaceAddress } from '@/lib/replaceAddress'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CategoryConfig } from '@/lib/categories'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { ADMIN_AREA_TAPPED } from '@/lib/adminNav'
import { stepCount, withoutSteps } from '@/lib/stepAddress'
import { eruvPlace, filterPlaces, isPlaceShow, nameKey, placeCounts, placeLine, sharedNames, streetOf, PLACE_SHOWS, type AdminPlace, type PlaceShow } from '@/lib/adminPlaces'
import { notCheckedLine } from '@/lib/fieldCoverage'
import { fitsPlaceWatch, isPlaceSourceChoice, isPlaceWatchChoice, listedJobs, placeWatches, placeWatchLine, sourceChoices, sourceLabel, type PlaceSourceChoice, type PlaceWatchChoice, type PlaceWatched, type WatchSourceKey } from '@/lib/watchList'
import { websiteWatchOf } from '@/lib/eruvJob'
import AddPlace from './AddPlace'
import AddWhat from './AddWhat'
import { AdminEmpty, AdminMenu, AdminRow } from './AdminUI'
import EruvListing, { AddEruv } from './EruvListing'
import PlaceListing from './PlaceListing'
import { PlusIcon } from '@/components/icons'
import { useMeasuredIsMobile } from '@/lib/useIsMobile'
import { coverageOf, useWatchJobsAndReload } from './useWatchJobs'
import { moveBackTo, moveTo } from './useScreenHistory'
import { useAdminApi } from './useAdminApi'
import { FiltersButton, PlacesFiltersSheet, type PlacesMenu } from './PlacesFilters'

// Places (the admin redesign's step 3, board 5): every listing in one list.
// Find one by name, narrow by four menus (what's on the site, its category,
// the Watches job checking it and where it reads it from; on a phone, in a
// Filters sheet), open it to edit it on the spot (no suggest-then-approve),
// archive it, or bring an archived one back.

const field = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-[0.9375rem] text-slate-900'

/** How many rows show before "Show all". */
/** Too narrow for the four menus and Add on one row, which then share it
 *  as Filters and Add (board l06): the sidebar and the menus need about
 *  1024px. A phone's short side counts, as desktop: does. */
const NARROW = '(max-width: 1023px), (max-height: 639px)'

const SHOWN = 50

type Data = { places: AdminPlace[]; categories: CategoryConfig[] }

/** The pill an address asks for: `?show=archived` (the old Archived tab
 *  lands there). */
function showFromAddress(): PlaceShow {
  const show = new URLSearchParams(window.location.search).get('show')
  return isPlaceShow(show) ? show : 'site'
}

/** The category an address narrows to: `?category=` (a category page's
 *  "N places" lands there). */
function categoryFromAddress(): string {
  return new URLSearchParams(window.location.search).get('category') ?? ''
}

/** The job and the source the address narrows to: `?watch=` and
 *  `?source=` (a job page's From rows land there). */
function watchFromAddress(): { watch: PlaceWatchChoice; source: PlaceSourceChoice } {
  const params = new URLSearchParams(window.location.search)
  const watch = params.get('watch')
  const source = params.get('source')
  return { watch: isPlaceWatchChoice(watch) ? watch : 'any', source: isPlaceSourceChoice(source) ? source : 'any' }
}

/** What the four menus have picked. */
type Choice = { show: PlaceShow; category: string; watch: PlaceWatchChoice; source: PlaceSourceChoice }
const ANY: Choice = { show: 'site', category: '', watch: 'any', source: 'any' }

/** The place open (`?place=`) or the category being added to (`?add=`):
 *  each a screen of its own, with its own address and entry, so Back,
 *  Forward and a reload land on it. */
function openFromAddress(): { place: string | null; add: string | null; picked: boolean } {
  const params = new URLSearchParams(window.location.search)
  return { place: params.get('place'), add: params.get('add'), picked: params.get('from') === 'pick' }
}

/** This address with `place` or `add` (or neither: the list), the list's
 *  own choices kept and the steps of whatever was open dropped. `add: ''`
 *  is What are you adding?; `picked`, a category chosen there, so that
 *  screen's entry is under this one. */
function listHref(open: { place?: string; add?: string; picked?: boolean } = {}): string {
  const url = new URL(withoutSteps(window.location.pathname, window.location.search), window.location.origin)
  url.searchParams.delete('place')
  url.searchParams.delete('add')
  url.searchParams.delete('from')
  if (open.place) url.searchParams.set('place', open.place)
  if (open.add !== undefined) url.searchParams.set('add', open.add)
  if (open.add && open.picked) url.searchParams.set('from', 'pick')
  return url.pathname + url.search
}

/** Writes one of the list's choices into the address, so a reload or Back
 *  keeps it; `fallback` is the value that leaves it out. */
function setAddressParam(name: string, value: string, fallback: string) {
  const url = new URL(window.location.href)
  if (value === fallback) url.searchParams.delete(name)
  else url.searchParams.set(name, value)
  replaceAddress(url)
}

export default function PlacesList({ token }: { token: string }) {
  const api = useAdminApi(token)
  const router = useRouter()
  // Add: at the end of the filters' row, after the four menus while
  // there's room, else after Filters (board l06). Nothing till the window's
  // measured, so a phone never paints the computer's.
  const narrow = useMeasuredIsMobile(NARROW)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The places first: the jobs only colour the rows and fill the coverage.
  const { jobs, reload } = useWatchJobsAndReload(token, { ready: data !== null || error !== null })
  const [now] = useState(() => Date.now())
  const coverage = useMemo(() => coverageOf(jobs), [jobs])
  const [show, setShow] = useState<PlaceShow>('site')
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [watch, setWatch] = useState<PlaceWatchChoice>('any')
  const [source, setSource] = useState<PlaceSourceChoice>('any')
  const [sheet, setSheet] = useState(false)
  const [all, setAll] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  // Adding: What are you adding? (''), then the editor for that category.
  const [adding, setAdding] = useState<string | null>(null)
  // Its category chosen on What are you adding?, whose entry is under it.
  // State, not read from the address at render: the router writes the
  // address only once its move lands, after the screen has drawn.
  const [addPicked, setAddPicked] = useState(false)

  const load = useCallback(async () => {
    try {
      const next = await api.get<Data>('/api/admin/listings', 'Could not load the places.')
      // The pill and category the address names (the old Archived tab lands
      // on ?show=archived, a category page's count on ?category=); pick()
      // and the category menu keep the two in step after that.
      setShow(showFromAddress())
      setCategory(categoryFromAddress())
      const w = watchFromAddress()
      setWatch(w.watch)
      setSource(w.source)
      const open = openFromAddress()
      setOpenId(open.place)
      setAdding(open.add)
      setAddPicked(open.picked)
      setData(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the places.')
    }
  }, [api])
  useLoadOnMount(load)

  function pick(next: PlaceShow) {
    setShow(next)
    setAll(false)
    setAddressParam('show', next, 'site')
  }

  // A place or Add is an entry in the history, with its own address, so
  // swiping back from one lands on this list, not on the page before it
  // (the user, Oct 31), and Forward and a reload land on it again (Nov 9).
  useEffect(() => {
    const onPop = () => {
      const open = openFromAddress()
      setOpenId(open.place)
      setAdding(open.add)
      setAddPicked(open.picked)
    }
    const onTapped = () => {
      setOpenId(null)
      setAdding(null)
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener(ADMIN_AREA_TAPPED, onTapped)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener(ADMIN_AREA_TAPPED, onTapped)
    }
  }, [])

  // Through Next's router, one move at a time (useScreenHistory.ts).
  function openPlace(id: string) {
    setOpenId(id)
    void moveTo(router, 'push', () => listHref({ place: id }))
    window.scrollTo?.(0, 0)
  }

  /** `picked`: chosen on What are you adding?, whose entry stays under it. */
  function startAdding(id: string, picked = false) {
    setAdding(id)
    setAddPicked(picked)
    void moveTo(router, 'push', () => listHref({ add: id, picked }))
    window.scrollTo?.(0, 0)
  }

  /** From finding a place back to What are you adding?, over the entry. */
  function backToPicking() {
    void moveBackTo(
      router,
      () => 1 + stepCount(window.location.search),
      () => listHref({ add: '' }),
    )
    setAdding('')
    window.scrollTo?.(0, 0)
  }

  function close() {
    // Over any screens the place still has open (a save from an open row).
    void moveBackTo(
      router,
      () => {
        const open = openFromAddress()
        if (!open.place && open.add === null) return 0
        return 1 + stepCount(window.location.search) + (open.add && open.picked ? 1 : 0)
      },
      () => listHref(),
    )
    setOpenId(null)
    setAdding(null)
    window.scrollTo?.(0, 0)
  }

  function changed() {
    close()
    void load()
  }

  function changedEruv() {
    close()
    void reload()
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!data) return <p className="text-sm text-muted">Loading…</p>

  const categoriesById = new Map(data.categories.map((c) => [c.id, c]))
  // Eruvs live in their own table, and join the list as a category of it.
  const eruvCategory = data.categories.find((c) => c.kind === 'eruv')
  const listingCategories = data.categories.filter((c) => c.kind === 'listing' || c === eruvCategory)
  const eruvs = eruvCategory ? (jobs.eruvim?.eruvim ?? []) : []
  const places = eruvCategory ? [...data.places, ...eruvs.map((e) => eruvPlace(e, eruvCategory.id))].sort((a, b) => a.name.localeCompare(b.name)) : data.places

  if (adding && adding === eruvCategory?.id) {
    return (
      <AddEruv
        token={token}
        category={eruvCategory}
        onBack={addPicked ? backToPicking : close}
        onAdded={async () => {
          await reload()
          close()
        }}
      />
    )
  }
  if (adding) {
    const addTo = categoriesById.get(adding)!
    return <AddPlace category={addTo} listings={places.filter((p) => p.category === adding && p.status === 'approved').map((p) => p.listing)} token={token} onClose={changed} onBack={addPicked ? backToPicking : changed} />
  }
  if (adding === '') return <AddWhat categories={listingCategories} onPick={(id) => startAdding(id, true)} onBack={close} />

  const opened = openId ? places.find((p) => p.id === openId) : undefined
  const openedEruv = opened && eruvs.find((e) => e.id === opened.id)
  if (opened && openedEruv) return <EruvListing key={opened.id} place={opened} eruv={openedEruv} category={categoriesById.get(opened.category)} token={token} jobs={jobs} reload={reload} now={now} onClose={close} onSaved={changedEruv} />
  if (opened) return <PlaceListing key={opened.id} place={opened} category={categoriesById.get(opened.category)} token={token} jobs={jobs} reload={reload} now={now} onClose={close} onSaved={changed} />

  // What checks each place, by the Watches jobs (watchList.ts). An eruv
  // is Eruv status's while its website is read.
  const off = jobs.runs?.off ?? []
  const eruvWatched = (id: string): PlaceWatched | undefined => {
    const e = eruvs.find((x) => x.id === id)
    if (!e || !coverage) return undefined
    const read = !off.includes('eruvs') && !!websiteWatchOf(e, jobs.eruvim?.watches ?? [])?.active
    return read ? { jobs: ['eruvs'], sources: ['website'], unchecked: false } : { jobs: [], sources: [], unchecked: true }
  }
  const watchedOf = (p: AdminPlace): PlaceWatched | undefined => {
    const c = coverage?.get(p.id)
    if (!c) return eruvWatched(p.id)
    return { ...placeWatches(c), unchecked: c.notWatched.length > 0 }
  }
  const choice: Choice = { show, category, watch, source }
  /** The places a choice leaves, `leave` a menu not counted: each menu
   *  counts what the others and the search leave it. */
  const placesFor = (c: Choice, leave?: 'category' | 'watch' | 'source') =>
    filterPlaces(places, { show: c.show, category: leave === 'category' ? undefined : c.category || undefined, query }).filter((p) =>
      fitsPlaceWatch(watchedOf(p), leave === 'watch' ? 'any' : c.watch, leave === 'source' ? 'any' : c.source),
    )
  const menusFor = (c: Choice): (PlacesMenu & { line?: Record<string, string> })[] => {
    const counts = placeCounts(places, c.category || undefined)
    // Category, Watch and Source: only what the other menus and the search
    // leave something in, with how many (the user, Nov 4), and the one
    // picked even once it's emptied.
    const besideCategory = placesFor(c, 'category')
    const inCategory = (id: string) => besideCategory.filter((p) => p.category === id).length
    const besideWatch = placesFor(c, 'watch').map(watchedOf)
    const byJob = (id: PlaceWatchChoice) => besideWatch.filter((w) => fitsPlaceWatch(w, id, 'any')).length
    const besideSource = placesFor(c, 'source').map(watchedOf)
    const bySource = (key: WatchSourceKey) => besideSource.filter((w) => w?.sources.includes(key)).length
    const sources = sourceChoices([...besideSource.flatMap((w) => w?.sources ?? []), ...(c.source === 'any' ? [] : [c.source])])
    return [
      { key: 'show', name: 'On the site', value: c.show, options: PLACE_SHOWS.map((s) => ({ value: s.show, label: s.label, count: counts[s.show] })) },
      {
        key: 'category',
        name: 'Category',
        value: c.category,
        options: [{ value: '', label: 'All categories' }, ...listingCategories.filter((x) => x.id === c.category || inCategory(x.id) > 0).map((x) => ({ value: x.id, label: x.pluralLabel, count: inCategory(x.id) }))],
      },
      {
        key: 'watch',
        name: 'Watch',
        value: c.watch,
        options: [
          { value: 'any', label: 'Any watch' },
          { value: 'nothing', label: 'Nothing', count: byJob('nothing') },
          ...listedJobs([]).filter((j) => j.id === c.watch || byJob(j.id) > 0).map((j) => ({ value: j.id, label: j.name, count: byJob(j.id) })),
        ],
        line: { nothing: 'Something on it isn’t checked' },
      },
      { key: 'source', name: 'Source', value: c.source, options: [{ value: 'any', label: 'Any source' }, ...sources.map((k) => ({ value: k, label: sourceLabel(k), count: bySource(k) }))] },
    ]
  }
  const rowsFor = (c: Choice) => {
    const out = placesFor(c)
    // Nothing: its main thing first, then by name as they already are.
    if (c.watch === 'nothing') out.sort((a, b) => Number(!!coverage?.get(b.id)?.mainMissing) - Number(!!coverage?.get(a.id)?.mainMissing))
    return out
  }
  const rows = rowsFor(choice)
  const menus = menusFor(choice)
  const narrowing = (Object.keys(ANY) as (keyof Choice)[]).filter((k) => choice[k] !== ANY[k]).length
  /** Sets one menu's choice, and the address with it. */
  function choose(key: string, v: string) {
    setAll(false)
    if (key === 'show') return pick(v as PlaceShow)
    if (key === 'category') setCategory(v)
    if (key === 'watch') setWatch(v as PlaceWatchChoice)
    if (key === 'source') setSource(v as PlaceSourceChoice)
    setAddressParam(key, v, key === 'category' ? '' : 'any')
  }
  // Every place, not just the ones showing: a name another place has
  // says its street even when the other is filtered out.
  const shared = sharedNames(places)
  const lineOf = (p: AdminPlace) => {
    const w = watchedOf(p)
    const c = coverage?.get(p.id)
    if (watch === 'nothing' && c) return <span className="text-amber-800">{notCheckedLine(c)}</span>
    const own = placeLine(p, shared.has(nameKey(p.name)))
    const warn = p.status === 'approved' && !p.hasAddress
    const jobsLine = w?.jobs.length ? placeWatchLine(w.jobs) : ''
    if (!own && !jobsLine) return undefined
    return (
      <>
        {own && <span className={warn ? 'text-amber-800' : ''}>{own}</span>}
        {own && jobsLine && ' · '}
        {jobsLine}
      </>
    )
  }
  const labelOf = (p: AdminPlace) => {
    const street = shared.has(nameKey(p.name)) && p.hasAddress ? streetOf(p.listing.address) : ''
    return street ? `Open ${p.name}, ${street}` : `Open ${p.name}`
  }
  const shown = all ? rows : rows.slice(0, SHOWN)
  const add = () => {
    // A category picked above is the one it's added to.
    if (category && listingCategories.some((c) => c.id === category)) startAdding(category)
    else {
      setAdding('')
      void moveTo(router, 'push', () => listHref({ add: '' }))
      window.scrollTo?.(0, 0)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <label className={`${field} flex items-center gap-2`}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#64748b" strokeWidth="1.8" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setAll(false)
          }}
          placeholder="Find a place by name"
          aria-label="Find a place by name"
          className="min-w-0 flex-1 border-0 bg-transparent outline-none"
        />
      </label>

      <div className="flex gap-1.5 sm:gap-2" data-testid="places-filters">
        {narrow === true ? (
          <FiltersButton narrowing={narrowing} onClick={() => setSheet(true)} />
        ) : (
          menus.map((m) => (
            <AdminMenu
              key={m.key}
              name={m.name}
              value={m.value}
              disabled={(m.key === 'watch' || m.key === 'source') && !coverage}
              options={m.options.map((o) => ({ ...o, line: m.line?.[o.value] }))}
              onChange={(v) => choose(m.key, v)}
            />
          ))
        )}
        {adding === null && narrow !== undefined && (
          <button
            type="button"
            onClick={add}
            aria-label="Add a place"
            className="ml-auto flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border border-primary bg-primary pl-3 pr-3.5 text-[0.8125rem] font-semibold text-white hover:bg-primary-dark active:scale-95"
          >
            <PlusIcon className="h-4 w-4 shrink-0" />
            Add
          </button>
        )}
      </div>
      {sheet && (
        <PlacesFiltersSheet
          start={choice}
          menus={(c) => menusFor(c as Choice)}
          count={(c) => rowsFor(c as Choice).length}
          onClose={() => setSheet(false)}
          onShow={(c) => {
            for (const key of Object.keys(ANY) as (keyof Choice)[]) if (c[key] !== choice[key]) choose(key, c[key])
            setSheet(false)
          }}
        />
      )}

      <p className="-mb-2 m-0 text-sm font-semibold text-slate-600">
        {rows.length} {rows.length === 1 ? 'place' : 'places'}
      </p>

      {rows.length === 0 ? (
        <AdminEmpty>{query || category || watch !== 'any' || source !== 'any' ? 'No places match.' : show === 'site' ? 'No places yet.' : 'Nothing to do.'}</AdminEmpty>
      ) : (
        <section aria-label="Places" className="bg-white border border-slate-200 rounded-[10px]">
          {shown.map((p) => (
            <AdminRow
              key={p.id}
              onClick={() => openPlace(p.id)}
              label={labelOf(p)}
              name={p.name}
              line={lineOf(p)}
              aside={categoriesById.get(p.category)?.label}
            />
          ))}
          <div className="flex items-center gap-3 px-4 py-3 text-[0.84375rem] text-slate-600">
            <span className="flex-1">
              {shown.length} of {rows.length}
            </span>
            {rows.length > SHOWN && (
              <button type="button" aria-expanded={all} onClick={() => setAll((a) => !a)} className="min-h-11 font-semibold text-primary cursor-pointer">
                {all ? 'Show fewer' : 'Show all'}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
