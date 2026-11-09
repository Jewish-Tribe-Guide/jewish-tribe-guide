'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CategoryConfig } from '@/lib/categories'
import { fetchJson } from '@/lib/fetchJson'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { ADMIN_AREA_TAPPED, adminBase } from '@/lib/adminNav'
import { watchesLine } from '@/lib/todo'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { stepCount, withoutSteps } from '@/lib/stepAddress'
import { eruvPlace, filterPlaces, isPlaceShow, placeCounts, placeLine, PLACE_SHOWS, type AdminPlace, type PlaceShow } from '@/lib/adminPlaces'
import { CHECKED_BY, fitsCheckedBy, isCheckedBy, notCheckedLine, type CheckedBy } from '@/lib/fieldCoverage'
import AddPlace from './AddPlace'
import { AdminBox, AdminEmpty, AdminMenu, AdminRow } from './AdminUI'
import EruvListing, { AddEruv } from './EruvListing'
import PlaceListing from './PlaceListing'
import { AddButton } from '@/components/AddButton'
import { coverageOf, useWatchJobsAndReload } from './useWatchJobs'
import { moveBackTo, moveTo } from './useScreenHistory'

// Places (the admin redesign's step 3, board 5): every listing in one list.
// Find one by name, narrow by three menus (what's on the site, its category,
// what checks it), open it to edit it on the spot (no suggest-then-approve),
// archive it, or bring an archived one back.

const button = 'inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60'
const primary = `${button} border border-primary bg-primary text-white`
const secondary = `${button} border border-slate-300 bg-white text-slate-900 hover:bg-slate-50`
const field = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-900'

/** How many rows show before "Show all". */
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
function openFromAddress(): { place: string | null; add: string | null } {
  const params = new URLSearchParams(window.location.search)
  return { place: params.get('place'), add: params.get('add') }
}

/** This address with `place` or `add` (or neither: the list), the list's
 *  own choices kept and the steps of whatever was open dropped. */
function listHref(open: { place?: string; add?: string } = {}): string {
  const url = new URL(withoutSteps(window.location.pathname, window.location.search), window.location.origin)
  url.searchParams.delete('place')
  url.searchParams.delete('add')
  if (open.place) url.searchParams.set('place', open.place)
  if (open.add) url.searchParams.set('add', open.add)
  return url.pathname + url.search
}

/** Writes one of the list's choices into the address, so a reload or Back
 *  keeps it; `fallback` is the value that leaves it out. */
function setAddressParam(name: string, value: string, fallback: string) {
  const url = new URL(window.location.href)
  if (value === fallback) url.searchParams.delete(name)
  else url.searchParams.set(name, value)
  window.history.replaceState(window.history.state, '', url)
}

/** "142 pages · read last night", for Watches at the top of the list. */
function useWatchesLine(token: string, community: string, now: number): string | undefined {
  const [line, setLine] = useState<string>()
  useEffect(() => {
    let live = true
    fetchJson<{ watches: { active: boolean; lastRunAt: string | null }[] }>(withCommunity('/api/admin/watches', community), { headers: { Authorization: `Bearer ${token}` } }, '')
      .then((body) => live && setLine(watchesLine(body.watches, now)))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [token, community, now])
  return line
}

/** Ringed like Synagogues' Minyanim row, the way it's seen (WatchE19, Nov 1):
 *  the one row here that isn't a place. No chevron, as drawn. */
function WatchesRow({ href, line }: { href: string; line: string | undefined }) {
  return (
    <Link href={href} data-testid="places-watches" className="flex items-center gap-3 rounded-2xl border-[1.5px] border-emerald-600 bg-white px-3.5 py-3 transition-colors hover:bg-emerald-50">
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
          <circle cx="8" cy="8" r="2" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-extrabold text-ink">Watches</span>
        {/* Keeps its height while the count loads, so the list doesn't jump. */}
        <span className="mt-0.5 block min-h-[1.3em] text-[14px] leading-snug text-slate-700">{line}</span>
      </span>
    </Link>
  )
}

export default function PlacesList({ token }: { token: string }) {
  const community = useCommunitySlug()
  const base = adminBase(community)
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { jobs, reload } = useWatchJobsAndReload(token)
  const [now] = useState(() => Date.now())
  const watches = useWatchesLine(token, community, now)
  const coverage = useMemo(() => coverageOf(jobs), [jobs])
  const [show, setShow] = useState<PlaceShow>('site')
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [checked, setChecked] = useState<CheckedBy>('any')
  const [all, setAll] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  // Adding: picking its category (''), then the editor for that category.
  const [adding, setAdding] = useState<string | null>(null)
  const [addCategory, setAddCategory] = useState('')

  const load = useCallback(async () => {
    try {
      const next = await fetchJson<Data>(withCommunity('/api/admin/listings', community), { headers: { Authorization: `Bearer ${token}` } }, 'Could not load the places.')
      // The pill and category the address names (the old Archived tab lands
      // on ?show=archived, a category page's count on ?category=); pick()
      // and the category menu keep the two in step after that.
      setShow(showFromAddress())
      setCategory(categoryFromAddress())
      setChecked(checkedFromAddress())
      const open = openFromAddress()
      setOpenId(open.place)
      setAdding(open.add)
      setData(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the places.')
    }
  }, [token, community])
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

  function startAdding(id: string) {
    setAdding(id)
    void moveTo(router, 'push', () => listHref({ add: id }))
    window.scrollTo?.(0, 0)
  }

  function close() {
    // Over any screens the place still has open (a save from an open row).
    void moveBackTo(
      router,
      () => {
        const open = openFromAddress()
        return open.place || open.add ? 1 + stepCount(window.location.search) : 0
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
        onBack={close}
        onAdded={async () => {
          await reload()
          close()
        }}
      />
    )
  }
  if (adding) {
    const addTo = categoriesById.get(adding)!
    return <AddPlace category={addTo} listings={places.filter((p) => p.category === adding && p.status === 'approved').map((p) => p.listing)} token={token} onClose={changed} />
  }

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
  const lineOf = (p: AdminPlace): { text: string; warn: boolean } => {
    const c = coverage?.get(p.id)
    if (checked === 'not-watched' && c) return { text: notCheckedLine(c), warn: true }
    return { text: placeLine(p), warn: p.status === 'approved' && !p.hasAddress }
  }
  const shown = all ? rows : rows.slice(0, SHOWN)
  // Category, as Checked by: only the categories the other menus and the
  // search leave something in, with how many (the user, Nov 4), and the one
  // picked even once it's emptied.
  const besideCategory = filterPlaces(places, { show, query }).filter((p) => fits(p, checked))
  const inCategory = (id: string) => besideCategory.filter((p) => p.category === id).length
  const categoryChoices = listingCategories.filter((c) => c.id === category || inCategory(c.id) > 0)

  return (
    // pb-14: the floating Add clears the last row and Show all.
    <div className="flex flex-col gap-4 pb-14">
      <WatchesRow href={`${base}/watches`} line={watches} />

      {adding === '' && (
        <AdminBox title="Add a place">
          <div className="flex flex-wrap items-end gap-2 p-4">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] text-slate-600">
              Which category
              <select value={addCategory} onChange={(e) => setAddCategory(e.target.value)} className={field}>
                <option value="">Pick one</option>
                {listingCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={!addCategory} onClick={() => startAdding(addCategory)} className={primary}>
              Next
            </button>
            <button type="button" onClick={() => setAdding(null)} className={secondary}>
              Leave it
            </button>
          </div>
        </AdminBox>
      )}

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

      <div className="flex gap-1.5 sm:gap-2">
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
              label={`Open ${p.name}`}
              name={p.name}
              line={lineOf(p).text ? <span className={lineOf(p).warn ? 'text-amber-800' : ''}>{lineOf(p).text}</span> : undefined}
              aside={categoriesById.get(p.category)?.label}
            />
          ))}
          <div className="flex items-center gap-3 px-4 py-3 text-[13.5px] text-slate-600">
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
      {adding === null && (
        <AddButton
          label="Add a place"
          onClick={() => {
            // A category picked above is the one it's added to.
            if (category && listingCategories.some((c) => c.id === category)) startAdding(category)
            else {
              setAdding('')
              // It floats, so it can be tapped from far down the list; what
              // it opens is at the top.
              window.scrollTo?.(0, 0)
            }
          }}
        />
      )}
    </div>
  )
}
