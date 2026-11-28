'use client'

import { replaceAddress } from '@/lib/replaceAddress'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CategoryConfig } from '@/lib/categories'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { ADMIN_AREA_TAPPED } from '@/lib/adminNav'
import { stepCount, withoutSteps } from '@/lib/stepAddress'
import { eruvPlace, filterPlaces, isPlaceShow, nameKey, placeCounts, placeLine, sharedNames, streetOf, PLACE_SHOWS, type AdminPlace, type PlaceShow } from '@/lib/adminPlaces'
import { CHECKED_BY, fitsCheckedBy, isCheckedBy, notCheckedLine, type CheckedBy } from '@/lib/fieldCoverage'
import AddPlace from './AddPlace'
import AddWhat from './AddWhat'
import { AdminEmpty, AdminMenu, AdminRow } from './AdminUI'
import EruvListing, { AddEruv } from './EruvListing'
import PlaceListing from './PlaceListing'
import { AddButton } from '@/components/AddButton'
import { PlusIcon } from '@/components/icons'
import { useMeasuredIsMobile } from '@/lib/useIsMobile'
import { coverageOf, useWatchJobsAndReload } from './useWatchJobs'
import { moveBackTo, moveTo } from './useScreenHistory'
import { useAdminApi } from './useAdminApi'

// Places (the admin redesign's step 3, board 5): every listing in one list.
// Find one by name, narrow by three menus (what's on the site, its category,
// what checks it), open it to edit it on the spot (no suggest-then-approve),
// archive it, or bring an archived one back.

const field = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-[0.9375rem] text-slate-900'

/** How many rows show before "Show all". */
/** Too narrow for the filters and Add on one row: the sidebar and three
 *  menus need about 1024px. A phone's short side counts, as desktop: does. */
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

/** What the address narrows by what checks it: `?checked=` (Watches' "23
 *  places" lands on not-watched). */
function checkedFromAddress(): CheckedBy {
  const checked = new URLSearchParams(window.location.search).get('checked')
  return isCheckedBy(checked) ? checked : 'any'
}

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
  // Add: at the end of the filters' row while there's room for both, else
  // floating (the user, Nov 28). Nothing till the window's measured, so a
  // phone never paints the computer's.
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
  const [checked, setChecked] = useState<CheckedBy>('any')
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
      setChecked(checkedFromAddress())
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

  const counts = placeCounts(places, category || undefined)
  const narrowed = filterPlaces(places, { show, category: category || undefined, query })
  const fits = (p: AdminPlace, choice: CheckedBy) => fitsCheckedBy(coverage?.get(p.id), choice)
  const checkedCount = (choice: CheckedBy) => narrowed.filter((p) => fits(p, choice)).length
  // Not checked: its main thing first, then by name as they already are.
  const rows = narrowed.filter((p) => fits(p, checked))
  if (checked === 'not-watched') rows.sort((a, b) => Number(!!coverage?.get(b.id)?.mainMissing) - Number(!!coverage?.get(a.id)?.mainMissing))
  // Every place, not just the ones showing: a name another place has
  // says its street even when the other is filtered out.
  const shared = sharedNames(places)
  const lineOf = (p: AdminPlace): { text: string; warn: boolean } => {
    const c = coverage?.get(p.id)
    if (checked === 'not-watched' && c) return { text: notCheckedLine(c), warn: true }
    return { text: placeLine(p, shared.has(nameKey(p.name))), warn: p.status === 'approved' && !p.hasAddress }
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
  // Category, as Checked by: only the categories the other menus and the
  // search leave something in, with how many (the user, Nov 4), and the one
  // picked even once it's emptied.
  const besideCategory = filterPlaces(places, { show, query }).filter((p) => fits(p, checked))
  const inCategory = (id: string) => besideCategory.filter((p) => p.category === id).length
  const categoryChoices = listingCategories.filter((c) => c.id === category || inCategory(c.id) > 0)

  return (
    // pb-14: the floating Add clears the last row and Show all.
    <div className={`flex flex-col gap-4 ${narrow === false ? '' : 'pb-14'}`}>
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
        <AdminMenu name="On the site" value={show} options={PLACE_SHOWS.map((s) => ({ value: s.show, label: s.label, count: counts[s.show] }))} onChange={pick} />
        <AdminMenu
          name="Category"
          value={category}
          options={[{ value: '', label: 'All categories' }, ...categoryChoices.map((c) => ({ value: c.id, label: c.pluralLabel, count: inCategory(c.id) }))]}
          onChange={(v) => {
            setCategory(v)
            setAll(false)
            setAddressParam('category', v, '')
          }}
        />
        <AdminMenu
          name="Checked by"
          value={checked}
          disabled={!coverage}
          options={CHECKED_BY.filter((c) => c.key === 'any' || c.key === checked || c.key === 'not-watched' || checkedCount(c.key) > 0).map((c) => ({
            value: c.key,
            label: c.label,
            count: c.key === 'any' ? undefined : checkedCount(c.key),
          }))}
          onChange={(v) => {
            setChecked(v)
            setAll(false)
            setAddressParam('checked', v, 'any')
          }}
        />
        {adding === null && narrow === false && (
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

      <p className="-mb-2 m-0 text-sm font-semibold text-slate-600">
        {rows.length} {rows.length === 1 ? 'place' : 'places'}
      </p>

      {rows.length === 0 ? (
        <AdminEmpty>{query || category || checked !== 'any' ? 'No places match.' : show === 'site' ? 'No places yet.' : 'Nothing to do.'}</AdminEmpty>
      ) : (
        <section aria-label="Places" className="bg-white border border-slate-200 rounded-[10px]">
          {shown.map((p) => (
            <AdminRow
              key={p.id}
              onClick={() => openPlace(p.id)}
              label={labelOf(p)}
              name={p.name}
              line={lineOf(p).text ? <span className={lineOf(p).warn ? 'text-amber-800' : ''}>{lineOf(p).text}</span> : undefined}
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
      {adding === null && narrow === true && <AddButton label="Add a place" onClick={add} />}
    </div>
  )
}
