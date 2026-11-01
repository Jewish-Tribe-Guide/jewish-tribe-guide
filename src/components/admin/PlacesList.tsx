'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import { fetchJson } from '@/lib/fetchJson'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { ADMIN_AREA_TAPPED } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { eruvPlace, filterPlaces, isPlaceShow, placeCounts, placeLine, PLACE_SHOWS, type AdminPlace, type PlaceShow } from '@/lib/adminPlaces'
import { CHECKED_BY, fitsCheckedBy, isCheckedBy, notWatchedLine, type CheckedBy } from '@/lib/fieldCoverage'
import ListingEditorScreen from './ListingEditorScreen'
import { AdminBox, AdminEmpty, AdminMenu, AdminRow } from './AdminUI'
import EruvListing, { AddEruv } from './EruvListing'
import PlaceListing from './PlaceListing'
import { coverageOf, troublesOf, useWatchJobsAndReload } from './useWatchJobs'

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

/** Writes one of the list's choices into the address, so a reload or Back
 *  keeps it; `fallback` is the value that leaves it out. */
function setAddressParam(name: string, value: string, fallback: string) {
  const url = new URL(window.location.href)
  if (value === fallback) url.searchParams.delete(name)
  else url.searchParams.set(name, value)
  window.history.replaceState(window.history.state, '', url)
}

function Plus() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

export default function PlacesList({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { jobs, reload } = useWatchJobsAndReload(token)
  const [now] = useState(() => Date.now())
  const coverage = useMemo(() => coverageOf(jobs), [jobs])
  const troubles = useMemo(() => troublesOf(jobs, now), [jobs, now])
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

  // A place or Add is an entry in the history, so swiping back from one
  // lands on this list, not on the page before it (the user, Oct 31).
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const state = e.state as { placeOpen?: string; placeAdding?: string } | null
      setOpenId(state?.placeOpen ?? null)
      setAdding(state?.placeAdding ?? null)
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

  function openPlace(id: string) {
    setOpenId(id)
    history.pushState({ ...(window.history.state ?? {}), placeOpen: id }, '')
    window.scrollTo?.(0, 0)
  }

  function startAdding(id: string) {
    setAdding(id)
    history.pushState({ ...(window.history.state ?? {}), placeAdding: id }, '')
    window.scrollTo?.(0, 0)
  }

  function close() {
    const state = window.history.state as { placeOpen?: string; placeAdding?: string } | null
    if (state?.placeOpen || state?.placeAdding) history.back()
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
        onBack={close}
        onAdded={async (id) => {
          await reload()
          setAdding(null)
          setOpenId(id)
          history.replaceState({ ...(window.history.state ?? {}), placeAdding: undefined, placeOpen: id }, '')
        }}
      />
    )
  }
  if (adding) {
    const addTo = categoriesById.get(adding)!
    return <ListingEditorScreen heading="Add a place" category={addTo} adminSubmit={{ token }} onClose={changed} />
  }

  const opened = openId ? places.find((p) => p.id === openId) : undefined
  const openedEruv = opened && eruvs.find((e) => e.id === opened.id)
  if (opened && openedEruv) return <EruvListing key={opened.id} place={opened} eruv={openedEruv} category={categoriesById.get(opened.category)} token={token} jobs={jobs} reload={reload} now={now} onClose={close} onSaved={changedEruv} />
  if (opened) return <PlaceListing key={opened.id} place={opened} category={categoriesById.get(opened.category)} token={token} jobs={jobs} reload={reload} now={now} onClose={close} onSaved={changed} />

  const counts = placeCounts(places, category || undefined)
  const narrowed = filterPlaces(places, { show, category: category || undefined, query })
  const fits = (p: AdminPlace, choice: CheckedBy) => fitsCheckedBy(coverage?.get(p.id), troubles.get(p.id), choice)
  const checkedCount = (choice: CheckedBy) => narrowed.filter((p) => fits(p, choice)).length
  // Not watched: its main thing first, then by name as they already are.
  const rows = narrowed.filter((p) => fits(p, checked))
  if (checked === 'not-watched') rows.sort((a, b) => Number(!!coverage?.get(b.id)?.mainMissing) - Number(!!coverage?.get(a.id)?.mainMissing))
  const lineOf = (p: AdminPlace): { text: string; warn: boolean } => {
    if (checked === 'broken') return { text: troubles.get(p.id)?.join(' · ') ?? '', warn: true }
    const c = coverage?.get(p.id)
    if (checked === 'not-watched' && c) return { text: notWatchedLine(c), warn: true }
    return { text: placeLine(p), warn: p.status === 'approved' && !p.hasAddress }
  }
  const shown = all ? rows : rows.slice(0, SHOWN)

  return (
    <div className="flex flex-col gap-4">
      <div className="-mt-2 flex flex-wrap items-center gap-3">
        <span className="flex-1" />
        {adding === null && (
          <button
            type="button"
            onClick={() => {
              // A category picked above is the one it's added to.
              if (category && listingCategories.some((c) => c.id === category)) startAdding(category)
              else setAdding('')
            }}
            className={primary}
          >
            <Plus />
            Add a place
          </button>
        )}
      </div>

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
          options={[{ value: '', label: 'All categories' }, ...listingCategories.map((c) => ({ value: c.id, label: c.pluralLabel }))]}
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
          options={CHECKED_BY.filter((c) => c.key === 'any' || c.key === checked || c.key === 'not-watched' || c.key === 'broken' || checkedCount(c.key) > 0).map((c) => ({
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
    </div>
  )
}
