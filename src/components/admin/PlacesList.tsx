'use client'

import { useCallback, useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import { fetchJson } from '@/lib/fetchJson'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { filterPlaces, isPlaceShow, placeCounts, placeLine, PLACE_SHOWS, type AdminPlace, type PlaceShow } from '@/lib/adminPlaces'
import { shortDay } from '@/lib/todo'
import UpButton from '@/components/UpButton'
import ListingEditorScreen from './ListingEditorScreen'
import { AdminBox, AdminEmpty, AdminRow } from './AdminUI'

// Places (the admin redesign's step 3, board 5): every listing in one list.
// Find one by name, narrow by category or by what's wrong with it, open it
// to edit it on the spot (no suggest-then-approve), archive it, or bring an
// archived one back. Archived is a pill here, not a tab of its own.

const button = 'inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60'
const primary = `${button} border border-primary bg-primary text-white`
const secondary = `${button} border border-slate-300 bg-white text-slate-900 hover:bg-slate-50`
const danger = `${button} border border-red-600 bg-red-600 text-white`
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

function ArchivedPlace({
  place,
  category,
  token,
  onDone,
}: {
  place: AdminPlace
  category: CategoryConfig | undefined
  token: string
  onDone: () => void
}) {
  const community = useCommunitySlug()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function send(method: 'PATCH' | 'DELETE', fallback: string) {
    setBusy(true)
    setError(null)
    try {
      await fetchJson(withCommunity(`/api/admin/archived-listings/${place.id}`, community), { method, headers: { Authorization: `Bearer ${token}` } }, fallback)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback)
      setBusy(false)
    }
  }

  return (
    <AdminBox>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-lg font-bold text-slate-900">{place.name}</h2>
          <span className="text-[13px] text-slate-600">
            {[category?.label, `Archived ${shortDay(place.changedAt)}`].filter(Boolean).join(' · ')}
          </span>
          {place.listing.address && <span className="text-sm text-slate-700">{place.listing.address}</span>}
        </div>
        {confirming ? (
          <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="m-0 text-sm text-red-800">Delete {place.name} for good? This can’t be undone.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void send('DELETE', 'Could not delete it.')} className={danger}>
                {busy ? 'Deleting…' : 'Delete it'}
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={secondary}>
                Leave it
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void send('PATCH', 'Could not bring it back.')} className={primary}>
              {busy ? 'Bringing it back…' : 'Bring it back'}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={secondary}>
              Delete for good
            </button>
          </div>
        )}
        {error && <p className="m-0 text-sm text-red-700">{error}</p>}
      </div>
    </AdminBox>
  )
}

/** Below an opened place's editor: take it off the site, asking once. */
function ArchiveIt({ place, token, onDone }: { place: AdminPlace; token: string; onDone: () => void }) {
  const community = useCommunitySlug()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function archive() {
    setBusy(true)
    setError(null)
    try {
      await fetchJson(withCommunity(`/api/admin/listings/${place.id}`, community), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }, 'Could not archive it.')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive it.')
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-2 border-t border-slate-200 pt-4">
      {confirming ? (
        <>
          <p className="m-0 text-sm text-slate-800">Take {place.name} off the site? It stays under Archived.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void archive()} className={danger}>
              {busy ? 'Archiving…' : 'Archive it'}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={secondary}>
              Leave it
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={`${secondary} self-start text-red-700`}>
          Archive it
        </button>
      )}
      {error && <p className="m-0 text-sm text-red-700">{error}</p>}
    </div>
  )
}

export default function PlacesList({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<PlaceShow>('site')
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
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

  function close() {
    setOpenId(null)
    setAdding(null)
    window.scrollTo?.(0, 0)
  }

  function changed() {
    close()
    void load()
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!data) return <p className="text-sm text-muted">Loading…</p>

  const categoriesById = new Map(data.categories.map((c) => [c.id, c]))
  const listingCategories = data.categories.filter((c) => c.kind === 'listing')

  if (adding) {
    const addTo = categoriesById.get(adding)!
    return <ListingEditorScreen heading="Add a place" category={addTo} adminSubmit={{ token }} onClose={changed} />
  }

  const opened = openId ? data.places.find((p) => p.id === openId) : undefined
  if (opened) {
    const openedCategory = categoriesById.get(opened.category)
    if (opened.status === 'archived' || !openedCategory) {
      return (
        <div className="flex flex-col gap-3">
          <UpButton label="Back" onClick={close} className="self-start" />
          {opened.status === 'archived' ? (
            <ArchivedPlace place={opened} category={openedCategory} token={token} onDone={changed} />
          ) : (
            <AdminEmpty>Its category is gone, so it can’t be edited here.</AdminEmpty>
          )}
        </div>
      )
    }
    return (
      <div>
        <ListingEditorScreen
          key={opened.id}
          heading={opened.name}
          item={opened.listing}
          category={openedCategory}
          onClose={close}
          adminSave={{
            label: 'Update the listing',
            via: ({ payload }) =>
              fetch(withCommunity(`/api/admin/listings/${opened.id}`, community), {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ payload }),
              }),
            onSaved: changed,
          }}
        />
        <ArchiveIt place={opened} token={token} onDone={changed} />
      </div>
    )
  }

  const counts = placeCounts(data.places, category || undefined)
  const rows = filterPlaces(data.places, { show, category: category || undefined, query })
  const shown = all ? rows : rows.slice(0, SHOWN)

  return (
    <div className="flex flex-col gap-4">
      <div className="-mt-2 flex flex-wrap items-center gap-3">
        <p className="m-0 flex-1 text-sm text-slate-600">{counts.site} on the site</p>
        {adding === null && (
          <button
            type="button"
            onClick={() => {
              // A category picked above is the one it's added to.
              if (category && categoriesById.get(category)?.kind === 'listing') setAdding(category)
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
            <button type="button" disabled={!addCategory} onClick={() => setAdding(addCategory)} className={primary}>
              Next
            </button>
            <button type="button" onClick={() => setAdding(null)} className={secondary}>
              Leave it
            </button>
          </div>
        </AdminBox>
      )}

      <div className="flex flex-wrap gap-2">
        <label className={`${field} flex flex-[1_1_320px] items-center gap-2`}>
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
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            setAll(false)
            setAddressParam('category', e.target.value, '')
          }}
          className={`${field} flex-[0_1_200px]`}
        >
          <option value="">All categories</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.pluralLabel}
            </option>
          ))}
        </select>
      </div>

      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {PLACE_SHOWS.map((s) => (
          <button
            key={s.show}
            type="button"
            aria-pressed={show === s.show}
            onClick={() => pick(s.show)}
            className={`min-h-9 rounded-full border px-3.5 py-1.5 text-sm font-semibold cursor-pointer ${
              show === s.show ? 'border-primary bg-blue-50 text-primary' : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            {s.label} · {counts[s.show]}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <AdminEmpty>{query || category ? 'No places match.' : show === 'site' ? 'No places yet.' : 'Nothing to do.'}</AdminEmpty>
      ) : (
        <section aria-label="Places" className="bg-white border border-slate-200 rounded-[10px]">
          {shown.map((p) => (
            <AdminRow
              key={p.id}
              onClick={() => {
                setOpenId(p.id)
                window.scrollTo?.(0, 0)
              }}
              label={`Open ${p.name}`}
              name={p.name}
              line={<span className={p.status === 'approved' && !p.hasAddress ? 'text-amber-700' : ''}>{placeLine(p)}</span>}
              aside={categoriesById.get(p.category)?.label}
            />
          ))}
          <div className="flex items-center gap-3 px-4 py-3 text-[13.5px] text-slate-600">
            <span className="flex-1">
              {shown.length} of {rows.length}
            </span>
            {shown.length < rows.length && (
              <button type="button" onClick={() => setAll(true)} className="min-h-11 font-semibold text-primary cursor-pointer">
                Show all
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
