'use client'

import { useCallback, useState, type FormEvent } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { useIsMobile } from '@/lib/useIsMobile'
import { editorRows } from '@/lib/editorRows'
import { checkerText, closureText, fieldsPill, googlePill, websiteKeyOf, type CheckedField, type Checker, type GooglePlace, type GoogleSection } from '@/lib/googleJob'
import type { JobCounts } from '@/lib/watchJobs'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import BoxEditSheet, { type BoxEdit } from '@/components/resources/BoxEditSheet'
import ActionDialog from '@/components/resources/ActionDialog'
import MobileSheet from '@/components/resources/MobileSheet'
import { JobPage, day, shortUrl } from './JobPage'
import { BUTTON, Box, BoxActions, BoxRow, BoxRows, GO, LINK, PlaceRow, type Tone } from './JobBoxes'

// ── The Watches tab's Google page ───────────────────────────────────────────
// Every listing the morning's Google sync covers, field by field, with who
// checks each one (googleJob.ts). Drawn on artifact 6gCnW6nVTDXySkcYENvAqF
// v2 (agreed Oct 22), on the pieces every job page shares (JobBoxes.tsx).
// Tabs: To check (a field nothing checks), Can't be read (Google stopped
// answering for its match), Checked. A listing opened is one Fields box:
// each field's value, who checks it under its name, a field nothing
// checks lit. Check against Google is the only paid call besides Find it
// on Google, each on a tap; after it, "was …" beside each change, then Use
// Google's / Edit / Keep the listing. A closure Google reports is its own
// box, Open or closed, with Show as open.

export type GoogleLoaded = { counts: JobCounts; places: GooglePlace[] }

const API = '/api/admin/watches/google'
const TABS: { key: GoogleSection; label: string }[] = [
  { key: 'to_check', label: 'To check' },
  { key: 'cant_read', label: 'Can’t be read' },
  { key: 'checked', label: 'Checked' },
]

export function googleSay(toCheck: number): string {
  if (!toCheck) return 'Every field has something checking it.'
  return toCheck === 1 ? '1 listing has a field nothing checks.' : `${toCheck} listings have a field nothing checks.`
}

const displayName = (p: GooglePlace) => (p.street ? `${p.name} · ${p.street}` : p.name)
const shownValue = (field: CheckedField, v: string) => (field === 'website' && v !== '—' ? shortUrl(v) : v)

function Who({ by }: { by: Checker }) {
  return <span className={by.kind === 'nothing' ? 'font-semibold text-amber-800' : undefined}>{checkerText(by)}</span>
}

type Post = (body: Record<string, unknown>) => Promise<{ place?: GooglePlace; found?: Found[] }>
type Found = { placeId: string; name: string; address: string }

/** Find it on Google: what Google finds, searched again on a different
 *  name, and This one beside each. */
function FindSheet({ place: p, post, onPicked, onClose }: { place: GooglePlace; post: Post; onPicked: (p: GooglePlace) => void; onClose: () => void }) {
  const isMobile = useIsMobile()
  const [query, setQuery] = useState(p.name)
  const [found, setFound] = useState<Found[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const search = useCallback(
    async (q?: string) => {
      setBusy(true)
      setError(null)
      try {
        setFound((await post({ action: 'find', id: p.id, ...(q ? { query: q } : {}) })).found ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Google didn’t answer.')
      } finally {
        setBusy(false)
      }
    },
    [post, p.id],
  )
  useLoadOnMount(useCallback(() => search(), [search]))
  async function pick(placeId: string) {
    setBusy(true)
    setError(null)
    try {
      const got = await post({ action: 'pick', id: p.id, placeId })
      if (got.place) onPicked(got.place)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that one.')
      setBusy(false)
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    if (query.trim()) void search(query.trim())
  }
  const body = (
    <div className="grid gap-3 px-4 pb-4">
      <p className="text-[13px] text-slate-500">{[p.name, p.address?.split(',')[0]].filter(Boolean).join(' · ')}</p>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search Google for" className="h-9 min-w-0 flex-[1_1_12rem] rounded-md border border-slate-300 px-2.5 text-sm" />
        <button type="submit" disabled={busy} className={BUTTON}>
          Search
        </button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {busy && !found && <p className="text-sm text-slate-500">Asking Google…</p>}
      {found && !found.length && <p className="text-sm text-slate-500">Google found nothing by that name.</p>}
      {found && found.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200" aria-label="Found on Google">
          {found.map((f) => (
            <li key={f.placeId} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
                {f.name}
                <span className="block text-[12.5px] font-normal text-slate-500">{f.address}</span>
              </span>
              <button type="button" disabled={busy} onClick={() => void pick(f.placeId)} className={LINK}>
                This one
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  return isMobile ? (
    <MobileSheet isOpen onClose={onClose} title="Find it on Google">
      {body}
    </MobileSheet>
  ) : (
    <ActionDialog isOpen onClose={onClose} title="Find it on Google">
      {body}
    </ActionDialog>
  )
}

function ClosureBox({ place: p, busy, act }: { place: GooglePlace; busy: boolean; act: (body: Record<string, unknown>) => void }) {
  const c = p.closure!
  return (
    <Box name="Open or closed" pill={{ text: closureText(c), tone: 'grey' }} defaultOpen>
      <p className="text-sm text-slate-900">
        {c.shownOpen ? `Shown as open; Google says ${closureText({ ...c, shownOpen: false }).toLowerCase()}` : closureText(c)}
        {c.since && ` since ${day(c.since)}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => act({ action: 'open', id: p.id, open: !c.shownOpen })} className={BUTTON}>
          {c.shownOpen ? 'Use Google’s' : 'Show as open'}
        </button>
      </div>
      <p className="text-[12.5px] text-slate-500">From Google Maps{c.readAt && ` · read ${day(c.readAt)}`} · on the site at once</p>
    </Box>
  )
}

function FieldsBox({
  place: p,
  busy,
  act,
  onFind,
  onEdit,
}: {
  place: GooglePlace
  busy: boolean
  act: (body: Record<string, unknown>) => void
  onFind: () => void
  onEdit: () => void
}) {
  const compare = p.decided ? null : p.compare
  const changes = compare?.rows.filter((r) => r.changed).length ?? 0
  const lit = p.section === 'to_check' && !p.decided
  const pill: { text: string; tone: Tone } = { text: fieldsPill(p), tone: changes || (lit && !compare) ? 'amber' : 'grey' }
  const listing = (
    <a href={p.href} target="_blank" rel="noopener noreferrer" className={LINK}>
      Open its listing
    </a>
  )
  let actions = null
  let source: string | null = null
  if (compare) {
    source = `From Google Maps · read ${day(compare.at)}`
    actions = changes ? (
      <BoxActions busy={busy} use="Use Google’s" onUse={() => act({ action: 'use', id: p.id })} onEdit={onEdit} onKeep={() => act({ action: 'keep', id: p.id })} />
    ) : lit ? (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => act({ action: 'keep', id: p.id })} className={BUTTON}>
          Keep the listing
        </button>
        {listing}
      </div>
    ) : null
  } else if (p.decided) {
    actions = <div className="flex flex-wrap items-center gap-2">{listing}</div>
  } else if (p.section === 'cant_read') {
    source = p.failedAt ? `Google · didn’t answer ${day(p.failedAt)}` : null
    actions = (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={onFind} className={GO}>
          Find it on Google
        </button>
        {listing}
      </div>
    )
  } else if (p.section === 'to_check' && p.matched) {
    source = p.readAt ? `Google · read ${day(p.readAt)}` : null
    actions = (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => act({ action: 'check', id: p.id })} className={GO}>
          {busy ? 'Asking Google…' : 'Check against Google'}
        </button>
        {listing}
      </div>
    )
  } else if (p.section === 'to_check') {
    actions = (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={onFind} className={GO}>
          Find it on Google
        </button>
        <button type="button" disabled={busy} onClick={() => act({ action: 'not_on_google', id: p.id })} className={BUTTON}>
          Not on Google
        </button>
      </div>
    )
  } else actions = <div className="flex flex-wrap items-center gap-2">{listing}</div>

  return (
    <Box name="Fields" pill={pill} defaultOpen={p.section !== 'checked' && p.decided?.what !== 'used'}>
      <BoxRows>
        {p.fields.map((f) => {
          const c = compare?.rows.find((r) => r.field === f.field)
          if (c?.changed)
            return <BoxRow key={f.field} name={f.label} sub={<Who by={{ kind: 'google' }} />} right={shownValue(f.field, c.google)} was={shownValue(f.field, f.value)} mark="changed" />
          return <BoxRow key={f.field} name={f.label} sub={<Who by={f.by} />} right={shownValue(f.field, f.value)} mark={f.by.kind === 'nothing' ? 'changed' : 'same'} />
        })}
      </BoxRows>
      {actions}
      {source && <p className="text-[12.5px] text-slate-500">{source}</p>}
    </Box>
  )
}

function GooglePlaceRow({ place: p, post, onPlace, onEdit }: { place: GooglePlace; post: Post; onPlace: (p: GooglePlace) => void; onEdit: (p: GooglePlace) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finding, setFinding] = useState(false)
  async function act(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const got = await post(body)
      if (got.place) onPlace(got.place)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <PlaceRow name={displayName(p)} pill={{ text: googlePill(p), tone: p.section === 'to_check' ? 'amber' : 'grey' }} back="Google">
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {p.closure && <ClosureBox place={p} busy={busy} act={(b) => void act(b)} />}
      <FieldsBox key={p.decided ? `${p.id}-${p.decided.what}` : p.id} place={p} busy={busy} act={(b) => void act(b)} onFind={() => setFinding(true)} onEdit={() => onEdit(p)} />
      {finding && (
        <FindSheet
          place={p}
          post={post}
          onClose={() => setFinding(false)}
          onPicked={(next) => {
            setFinding(false)
            onPlace(next)
          }}
        />
      )}
    </PlaceRow>
  )
}

/** Edit: the listing's own rows for these fields, filled in with Google's
 *  version where it differs. */
function editOf(p: GooglePlace, item: DirectoryResource, category: CategoryConfig): { rows: string[]; preset: Record<string, unknown> } {
  const websiteKey = websiteKeyOf(category)
  const keys = new Set(['hours', ...(websiteKey ? [websiteKey] : [])])
  const rows = editorRows(category, item as unknown as Record<string, unknown>)
    .filter((r) => r.id === 'name' || r.kind === 'contact' || r.fields.some((f) => keys.has(f.key)))
    .map((r) => r.id)
  const preset: Record<string, unknown> = {}
  for (const r of p.compare?.rows ?? []) {
    if (!r.changed) continue
    const key = r.field === 'website' ? websiteKey : r.field
    if (!key) continue
    preset[key] = r.raw
  }
  return { rows, preset }
}

export default function GoogleJob({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<GoogleLoaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<GoogleSection>('to_check')
  const [editing, setEditing] = useState<{ place: GooglePlace; item: DirectoryResource; category: CategoryConfig; edit: BoxEdit } | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const headers = { Authorization: `Bearer ${token}` }

  const load = useCallback(async () => {
    setError(null)
    try {
      const got = await fetchJson<GoogleLoaded>(withCommunity(API, community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the listings.')
      setData(got)
      setTab((t) => (got.places.some((p) => p.section === t) ? t : (TABS.find((x) => got.places.some((p) => p.section === x.key))?.key ?? 'to_check')))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  const post: Post = useCallback(
    (body) =>
      fetchJson(
        withCommunity(API, community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        'Could not do that.',
      ),
    [token, community],
  )

  const setPlace = (next: GooglePlace) => setData((d) => d && { ...d, places: d.places.map((p) => (p.id === next.id ? next : p)) })

  async function edit(p: GooglePlace) {
    setEditError(null)
    try {
      const { item, category } = await fetchJson<{ item: DirectoryResource; category: CategoryConfig }>(withCommunity(`${API}?item=${p.id}`, community), { headers }, 'Could not open its listing.')
      const { rows, preset } = editOf(p, item, category)
      const websiteKey = websiteKeyOf(category)
      setEditing({
        place: p,
        item,
        category,
        edit: {
          title: 'Fields',
          fields: [],
          rows,
          preset,
          save: {
            label: 'Save to the listing',
            via: async ({ payload }) => {
              const d = (payload.details ?? {}) as Record<string, unknown>
              const values = Object.fromEntries(
                p.fields.map((f) => [f.field, f.field === 'name' ? payload.name : f.field === 'phone' ? (payload.phone ?? '') : f.field === 'hours' ? (d.hours ?? null) : websiteKey ? (d[websiteKey] ?? null) : null]),
              )
              const res = await fetch(withCommunity(API, community), { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'edit', id: p.id, values }) })
              if (res.ok) {
                const got = (await res.clone().json()) as { place?: GooglePlace }
                if (got.place) setPlace(got.place)
              }
              return res
            },
            onSaved: () => setEditing(null),
          },
        },
      })
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not open its listing.')
    }
  }

  const backHref = `${adminBase(community)}/watches`
  if (error || !data) {
    const notice = error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : <p className="text-sm text-muted">Loading the listings…</p>
    return <JobPage backHref={backHref} title="Google" intro="" needYou={0} total={0} noun="listing" notice={notice} />
  }

  const counts = Object.fromEntries(TABS.map((t) => [t.key, data.places.filter((p) => p.section === t.key).length])) as Record<GoogleSection, number>
  return (
    <JobPage
      backHref={backHref}
      title="Google"
      intro=""
      needYou={counts.to_check}
      total={data.places.length}
      noun="listing"
      say={{ head: googleSay(counts.to_check) }}
      tabs={{ counts, active: tab, onChange: setTab, list: TABS }}
      notice={
        <>
          {editError && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{editError}</p>}
          {editing && <BoxEditSheet item={editing.item} category={editing.category} edit={editing.edit} onClose={() => setEditing(null)} />}
        </>
      }
    >
      {data.places
        .filter((p) => p.section === tab)
        .sort((a, b) => displayName(a).localeCompare(displayName(b)))
        .map((p) => (
          <GooglePlaceRow key={p.id} place={p} post={post} onPlace={setPlace} onEdit={(x) => void edit(x)} />
        ))}
    </JobPage>
  )
}
