'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { parseOkJson } from '@/lib/fetchJson'
import { adminBase } from '@/lib/adminNav'
import { STARTER_PACK_NAMES } from '@/lib/starterPackContents'
import type { Community } from '@/lib/communityStore'
import type { CitySuggestion } from '@/lib/googleCities'
import { useStepsInAddress } from './useStepsInAddress'
import { useSiteAdminApi } from './useAdminApi'
import { AdminHead, AdminSwitch, Chevron, adminInputClass } from './AdminUI'
import { timeZoneName } from './DefaultLocationEditor'

// ── /admin's Communities (the site owner's only): every community this site
// hosts, and New community. Superadmin only, both reading (GET
// /api/admin/communities, not the public /api/communities the header switcher
// uses) and writing; a community's own admin gets a 401 and a plain line
// instead of the list.
//
// New community (Nov 25, boards 1, 2f and 3 of the new-community drawing):
// pick the city from Google's list, and the rest is filled in from it — the
// name, the address, the time zone and where the map starts. Who runs it,
// and the starter pack (on unless switched off). Created, it lands back on
// the list with the new community marked, hidden until published. ──

// GET /api/admin/communities adds these on top of the plain Community shape
// (see that route's own comment) — never on Community itself, since that type
// also feeds the public GET /api/communities.
type ListedCommunity = Community & {
  adminEmails: string[]
  previewToken: string | null
  placeCount?: number
}

/** A city picked from the list, with what /api/admin/cities found for it. */
type PickedCity = { city: string; area: string; lat: number; lng: number; timezone: string }

// Mirrors categoryStore.slugify — that lives in a server-only module.
function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Matches ACCESS_PARAM/previewCookieName in src/proxy.ts — that's what
// actually enforces this link being required for a hidden community.
function previewLink(slug: string, token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/${slug}?access=${token}`
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function initials(email: string): string {
  const parts = (email.split('@')[0] ?? '').split(/[._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || email.slice(0, 1).toUpperCase()
}

const primaryButton =
  'inline-flex items-center justify-center min-h-11 rounded-[10px] bg-primary px-[18px] text-[0.9375rem] font-semibold text-white no-underline hover:opacity-90 disabled:opacity-60 cursor-pointer'
const plainButton =
  'inline-flex items-center justify-center min-h-11 rounded-[10px] border border-slate-300 bg-white px-[18px] text-[0.9375rem] font-semibold cursor-pointer disabled:opacity-60'
const linkButton = 'min-h-11 px-1 text-sm font-semibold text-primary cursor-pointer bg-transparent border-0'

const PIN = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
)

function Badge({ live }: { live: boolean }) {
  return live ? (
    <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-[0.8125rem] font-semibold text-green-800">Live</span>
  ) : (
    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[0.8125rem] font-semibold text-amber-800">Hidden</span>
  )
}

// ── Board 1: "Which city?", Google's cities as you type. ──
function CitySearch({ api, onPick }: { api: ReturnType<typeof useSiteAdminApi>; onPick: (city: PickedCity) => void }) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<CitySuggestion[]>([])
  const [active, setActive] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const [finding, setFinding] = useState(false)
  const asked = useRef(0)

  useEffect(() => {
    const q = query.trim()
    const ask = ++asked.current
    if (q.length < 2) return
    const timer = setTimeout(async () => {
      try {
        const { cities } = await api.get<{ cities: CitySuggestion[] }>(`/api/admin/cities?q=${encodeURIComponent(q)}`, 'Google isn’t answering. Try again.')
        if (ask !== asked.current) return
        setProblem(null)
        setOptions(cities)
        setActive(0)
      } catch (err) {
        if (ask !== asked.current) return
        setOptions([])
        setProblem(err instanceof Error ? err.message : 'Google isn’t answering. Try again.')
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [api, query])

  async function pick(option: CitySuggestion) {
    setFinding(true)
    setProblem(null)
    try {
      const { city } = await api.get<{ city: PickedCity }>(`/api/admin/cities?placeId=${encodeURIComponent(option.placeId)}`, 'Google couldn’t find that city. Try again.')
      onPick(city)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Google couldn’t find that city. Try again.')
    } finally {
      setFinding(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + options.length) % options.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const option = options[active]
      if (option) void pick(option)
    }
  }

  // Under two letters, nothing is asked and nothing shows.
  const open = query.trim().length >= 2 && options.length > 0
  return (
    <div className="rounded-[14px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-7">
      <label htmlFor="new-community-city" className="block text-[0.9375rem] font-semibold text-slate-900 mb-2.5">
        Which city?
      </label>
      <div className="flex items-center gap-2.5 h-[52px] rounded-[10px] border-2 border-slate-300 focus-within:border-primary bg-white px-3.5 text-slate-500">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          id="new-community-city"
          role="combobox"
          aria-expanded={open}
          aria-controls="new-community-cities"
          aria-activedescendant={open ? `new-community-city-${active}` : undefined}
          autoComplete="off"
          autoFocus
          value={query}
          disabled={finding}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-0 border-0 bg-transparent text-[1.0625rem] text-slate-900 outline-none"
        />
      </div>
      {open && (
        <ul
          id="new-community-cities"
          role="listbox"
          aria-label="Cities"
          className="m-0 mt-1.5 list-none overflow-hidden rounded-[10px] border border-slate-200 bg-white p-0 shadow-[0_8px_24px_rgba(15,23,42,0.10)]"
        >
          {options.map((o, i) => (
            <li
              key={o.placeId}
              id={`new-community-city-${i}`}
              role="option"
              aria-label={o.area ? `${o.city}, ${o.area}` : o.city}
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => void pick(o)}
              className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer ${i ? 'border-t border-slate-100' : ''} ${i === active ? 'bg-blue-50 text-primary' : 'text-slate-500'}`}
            >
              {PIN}
              <span className="flex flex-col">
                <span className="text-base font-semibold text-slate-900">{o.city}</span>
                {o.area && <span className="text-[0.8125rem] text-slate-600">{o.area}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {finding && <p className="m-0 mt-2 text-sm text-slate-600">Finding it…</p>}
      {problem && <p className="m-0 mt-2 text-sm text-red-700">{problem}</p>}
    </div>
  )
}

// ── Board 2f: the city picked, and the rest filled in from it. ──
function NewCommunityForm({
  api,
  city,
  onChangeCity,
}: {
  api: ReturnType<typeof useSiteAdminApi>
  city: PickedCity
  onChangeCity: () => void
}) {
  const [name, setName] = useState(`${city.city} Jewish Guide`)
  const [slug, setSlug] = useState(slugify(city.city))
  const [editingSlug, setEditingSlug] = useState(false)
  const [admins, setAdmins] = useState<string[]>([])
  const [typed, setTyped] = useState('')
  const [typedProblem, setTypedProblem] = useState<string | null>(null)
  const [starterPack, setStarterPack] = useState(true)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  function addTyped(): boolean {
    const email = typed.trim().toLowerCase()
    if (!email) return true
    if (!EMAIL.test(email)) {
      setTypedProblem('That isn’t an email address.')
      return false
    }
    setAdmins((a) => (a.includes(email) ? a : [...a, email]))
    setTyped('')
    setTypedProblem(null)
    return true
  }

  async function create() {
    setProblem(null)
    // An address typed and not yet added is still meant.
    const pending = typed.trim().toLowerCase()
    if (pending && !addTyped()) return
    const adminEmails = pending && !admins.includes(pending) ? [...admins, pending] : admins
    setSaving(true)
    try {
      const body = await api.post<{ community: Community }>(
        '/api/admin/communities',
        {
          slug: slug.trim(),
          name: name.trim(),
          city: { city: city.city, area: city.area, lat: city.lat, lng: city.lng },
          adminEmails,
          starterPack,
        },
        'Could not create the community.',
      )
      // A plain load, not router.push: creating revalidates what the console
      // reads, and a soft navigation over that has stuck here before (see
      // confirmDelete's reload). Replaces New community's entry, so Back from
      // the list goes where it went before New community.
      window.location.replace(`/admin?made=${encodeURIComponent(body.community.slug)}`)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not create the community.')
      setSaving(false)
    }
  }

  const section = 'px-5 py-5 sm:px-7 border-b border-slate-100 last:border-b-0'
  return (
    <>
      <div className="rounded-[14px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className={`${section} flex items-center gap-3.5`}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-primary">{PIN}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[1.0625rem] font-semibold text-slate-900">
              {city.city}
              {city.area ? `, ${city.area}` : ''}
            </span>
            <span className="text-sm text-slate-600">{timeZoneName(city.timezone)} · map starts downtown</span>
          </span>
          <button type="button" onClick={onChangeCity} className={linkButton}>
            Change
          </button>
        </div>

        <div className={`${section} flex flex-col gap-2`}>
          <label htmlFor="new-community-name" className="text-[0.9375rem] font-semibold text-slate-900">
            Name
          </label>
          <input id="new-community-name" value={name} onChange={(e) => setName(e.target.value)} className={`${adminInputClass} h-12 text-base`} />
          {editingSlug ? (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span className="shrink-0">Its address /</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} autoFocus className={`${adminInputClass} py-1.5`} />
            </label>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>Its address</span>
              <span className="font-semibold text-slate-900">/{slug}</span>
              <button type="button" onClick={() => setEditingSlug(true)} aria-label="Edit its address" className={linkButton}>
                Edit
              </button>
            </div>
          )}
        </div>

        <div className={`${section} flex flex-col gap-3`}>
          <span className="text-[0.9375rem] font-semibold text-slate-900">Who runs it</span>
          {admins.length > 0 && (
            <ul className="m-0 list-none p-0">
              {admins.map((email) => (
                <li key={email} className="flex items-center gap-3 py-1">
                  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-800">
                    {initials(email)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-slate-900">{email}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${email}`}
                    onClick={() => setAdmins((a) => a.filter((x) => x !== email))}
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-500 cursor-pointer"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <label htmlFor="new-community-admin" className="sr-only">
              Add an admin’s email
            </label>
            <input
              id="new-community-admin"
              type="email"
              placeholder="Their email"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value)
                setTypedProblem(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTyped()
                }
              }}
              className={`${adminInputClass} h-12 flex-1 text-base`}
            />
            <button type="button" onClick={addTyped} className={`${plainButton} h-12 text-primary`}>
              Add
            </button>
          </div>
          {typedProblem && <p className="m-0 text-sm text-red-700">{typedProblem}</p>}
        </div>

        <div className={`${section} flex flex-col gap-3`}>
          <div className="flex items-center gap-4">
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[0.9375rem] font-semibold text-slate-900">Starter pack</span>
              <span className="text-sm text-slate-600">Pages, home and tabs, no places</span>
            </span>
            <AdminSwitch checked={starterPack} onChange={setStarterPack} label="Starter pack" />
          </div>
          {starterPack && (
            <ul aria-label="In the starter pack" className="m-0 flex list-none flex-wrap gap-2 p-0">
              {STARTER_PACK_NAMES.map((page) => (
                <li key={page} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900">
                  {page}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {problem && <p className="m-0 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{problem}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={create} disabled={saving} className={`${primaryButton} min-h-[52px] px-7 text-base`}>
          {saving ? 'Creating…' : `Create ${city.city}`}
        </button>
      </div>
    </>
  )
}

export default function CommunityManager({ token }: { token: string }) {
  const api = useSiteAdminApi(token)
  const [communities, setCommunities] = useState<ListedCommunity[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [creating, setCreating] = useState(false)
  // New community is a screen of its own, with an address (?step=new), so
  // Back closes it and Forward and a reload open it again (Nov 18: it was
  // only state, and Back left the console).
  useStepsInAddress('step', creating ? ['new'] : [], ([to]) => setCreating(to === 'new'))
  // The city picked on New community; none shows "Which city?".
  const [city, setCity] = useState<PickedCity | null>(null)
  // The community just made (?made=, board 3), marked on the list.
  // Read once: the list renders only after sign-in, in the browser.
  const [made] = useState(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('made')))
  const madeCard = useRef<HTMLDivElement>(null)
  useEffect(() => {
    madeCard.current?.scrollIntoView?.({ block: 'nearest' })
  }, [made, communities])

  const [deletingSlug, setDeletingSlug] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  // The link shown to copy by hand, where the clipboard said no.
  const [shownLinkSlug, setShownLinkSlug] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setForbidden(false)
    try {
      const res = await api.fetch('/api/admin/communities')
      if (res.status === 401) {
        setForbidden(true)
        return
      }
      const body = await parseOkJson<{ communities: ListedCommunity[] }>(res, 'Failed to load communities.')
      setCommunities(body.communities)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [api])

  useLoadOnMount(load)

  function startCreating() {
    setCity(null)
    setCreating(true)
  }

  async function toggleVisibility(slug: string, nextVisible: boolean) {
    setTogglingSlug(slug)
    setToggleError(null)
    try {
      const { community } = await api.send<{ community: ListedCommunity }>(
        'PATCH',
        `/api/admin/communities/${slug}`,
        { visible: nextVisible },
        'Could not update visibility.',
      )
      // previewToken from the response: unpublishing rotates it server-side
      // (see setCommunityVisibility), so the one held here is now wrong.
      setCommunities((cs) => cs?.map((c) => (c.slug === slug ? { ...c, visible: nextVisible, previewToken: community.previewToken } : c)) ?? cs)
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'Could not update visibility.')
    } finally {
      setTogglingSlug(null)
    }
  }

  async function copyPreviewLink(slug: string, previewToken: string) {
    try {
      await navigator.clipboard.writeText(previewLink(slug, previewToken))
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug((s) => (s === slug ? null : s)), 2000)
    } catch {
      // Clipboard access can be denied (permissions, non-HTTPS): show the
      // link to copy by hand.
      setShownLinkSlug(slug)
    }
  }

  function startDeleting(slug: string) {
    setDeletingSlug(slug)
    setDeleteConfirmText('')
    setDeleteError(null)
  }

  function cancelDeleting() {
    setDeletingSlug(null)
    setDeleteConfirmText('')
    setDeleteError(null)
  }

  async function confirmDelete(slug: string) {
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.send('DELETE', `/api/admin/communities/${slug}`, { confirmSlug: slug }, 'Could not delete community.')
      // A real, full reload rather than re-fetching in place: deleting
      // invalidates what this console's own layout read, and a soft refetch
      // over that hit a Cache Components bail-out that hard-navigated away to
      // the public site mid-handler, after the DELETE had already landed.
      window.location.reload()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete community.')
    } finally {
      setDeleting(false)
    }
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (forbidden) {
    return <p className="text-sm text-muted">Only the site owner can create or browse other communities.</p>
  }
  if (!communities) return <p className="text-sm text-muted">Loading communities…</p>

  if (creating) {
    return (
      <div className="flex max-w-[608px] flex-col gap-6">
        <AdminHead back={{ label: 'Communities', onClick: () => setCreating(false) }} title="New community" />
        {city ? <NewCommunityForm api={api} city={city} onChangeCity={() => setCity(null)} /> : <CitySearch api={api} onPick={setCity} />}
      </div>
    )
  }

  return (
    <div className="flex max-w-[608px] flex-col gap-4">
      <div className="flex justify-end">
        <button type="button" onClick={startCreating} className={primaryButton}>
          New community
        </button>
      </div>

      {toggleError && <p className="m-0 text-sm text-red-700">{toggleError}</p>}

      {/* The one just made at the top (board 3), the rest in their order. */}
      {[...communities].sort((a, b) => Number(b.slug === made) - Number(a.slug === made)).map((c) => {
        const facts = [`/${c.slug}`, plural(c.adminEmails.length, 'admin')]
        if (!c.isDefault && c.placeCount !== undefined) facts.push(plural(c.placeCount, 'place'))
        // The default community is a row to its admin (board 3): it can't be
        // hidden or deleted, so it has nothing else to offer here.
        if (c.isDefault) {
          return (
            // prefetch={false}: prefetching another community's admin primes
            // the client router's cache for that segment, which once left
            // landing in a just-created community's console stuck.
            <Link
              key={c.slug}
              href={adminBase(c.slug)}
              prefetch={false}
              data-community-slug={c.slug}
              className="flex items-center gap-2.5 rounded-[14px] border border-slate-200 bg-white px-6 py-5 text-slate-900 no-underline hover:border-slate-300"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-lg font-semibold">{c.name}</span>
                <span className="text-sm text-slate-600">{facts.join(' · ')}</span>
              </span>
              <Badge live={c.visible} />
              <Chevron />
            </Link>
          )
        }
        const isMade = c.slug === made
        return (
          // data-community-slug so a test can scope to ONE community's card.
          <div
            key={c.slug}
            ref={isMade ? madeCard : undefined}
            data-community-slug={c.slug}
            data-just-made={isMade || undefined}
            className={`flex flex-col gap-4 rounded-[14px] bg-white px-6 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${isMade ? 'border-2 border-primary' : 'border border-slate-200'}`}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <h2 className="m-0 min-w-0 flex-1 text-lg font-semibold text-slate-900">{c.name}</h2>
                <Badge live={c.visible} />
              </div>
              <span className="text-sm text-slate-600">{facts.join(' · ')}</span>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link href={adminBase(c.slug)} prefetch={false} className={primaryButton}>
                Open its admin
              </Link>
              {!c.visible && c.previewToken && (
                <button type="button" onClick={() => copyPreviewLink(c.slug, c.previewToken!)} className={`${plainButton} text-primary`}>
                  {copiedSlug === c.slug ? 'Copied' : 'Copy preview link'}
                </button>
              )}
              <button
                type="button"
                onClick={() => toggleVisibility(c.slug, !c.visible)}
                disabled={togglingSlug === c.slug}
                className={`${plainButton} text-slate-900`}
              >
                {togglingSlug === c.slug ? 'Saving…' : c.visible ? 'Unpublish' : 'Publish'}
              </button>
              <button type="button" onClick={() => startDeleting(c.slug)} className="ml-auto min-h-11 px-2 text-sm font-semibold text-red-700 cursor-pointer">
                Delete
              </button>
            </div>
            {shownLinkSlug === c.slug && !c.visible && c.previewToken && (
              <input
                readOnly
                aria-label="Preview link"
                value={previewLink(c.slug, c.previewToken)}
                onFocus={(e) => e.currentTarget.select()}
                className={`${adminInputClass} font-mono text-xs`}
              />
            )}
            {deletingSlug === c.slug && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
                <p className="m-0 text-sm text-red-800">
                  This permanently deletes <span className="font-semibold">{c.name}</span> and everything in it — every listing, category, form,
                  and submission. This can&rsquo;t be undone.
                </p>
                <label className="block text-xs font-medium text-red-800">
                  Type <span className="font-mono">{c.slug}</span> to confirm
                  <input
                    className="mt-1 w-full rounded-md border border-red-300 px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-400"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    autoFocus
                  />
                </label>
                {deleteError && <p className="m-0 text-xs text-red-700">{deleteError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => confirmDelete(c.slug)}
                    disabled={deleteConfirmText !== c.slug || deleting}
                    className="text-sm font-medium bg-red-600 text-white rounded-md px-3 py-1.5 hover:bg-red-700 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    {deleting ? 'Deleting…' : 'Delete forever'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelDeleting}
                    disabled={deleting}
                    className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
