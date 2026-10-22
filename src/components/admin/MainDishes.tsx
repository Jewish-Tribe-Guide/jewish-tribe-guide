'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { readElsewhere } from '@/lib/menuLink'
import { itemsField } from '@/lib/listingView'
import { samePage } from '@/lib/hoursJob'
import { dishProposal, updatesPill, type DishProposal, type ReadDish } from '@/lib/dishProposal'
import { dishStatus, sentThroughSite, type DishPlace, type DishPlaceStatus } from '@/lib/watchJobs'
import BoxEditSheet, { type BoxEdit } from '@/components/resources/BoxEditSheet'
import { GivePage, JobPage, day, jobTabs, shortUrl, type JobTab } from './JobPage'
import { Box, BoxActions, BoxRow, BoxRows, LINK, PlaceRow, Reads, SourceLine, type ReadPage, type Tone } from './JobBoxes'

// ── The Watches tab's Main dishes page (drawn Oct 21: 7EYjgU1WcHrXG2W6Qpigb7) ─
// Each food place's dishes, read off its own menu by the AI, compared with
// the listing's. On the page every job has (JobPage.tsx), in its tabs. A
// place opened is its listing's Main dishes box, the listing's list marked
// by what its menu says (dishProposal.ts): a dish the menu no longer names
// crossed out, "Not on the menu"; a new one highlighted; each with the
// menu's own words under it, so a misread shows. Then Use this, Edit (the
// listing's own Edit for its dishes, saved straight to the listing), or
// Keep the listing.
//
// Use this takes off the dishes its menu no longer names. A dish added by
// hand is never taken off that way: the reader missed it once, so missing
// it again says nothing (the user, Oct 21). It's looked for on every read.
//
// Reads, last: the page it read, as what it is ("Menu link · Main
// dishes"), with Add a page (its menu link), Read them now and Open its
// listing; for one that can't be read, photos of the menu or No menu too.
// Its Reading switch is "No menu": off, it isn't read.
//
// A place not read yet is read as the page opens, a few at a time.

type Reading = {
  status: 'proposed' | 'approved' | 'skipped' | 'failed' | 'no_menu'
  sourceUrl: string | null
  dishes: (ReadDish & { onListing?: true })[]
  missing?: string[]
  note: string | null
  model: string | null
  readAt: string
  decidedAt: string | null
  decidedBy: string | null
}
type Place = DishPlace & {
  id: string
  name: string
  href: string
  categoryLabel: string
  facts: string[]
  dishes: string[]
  reading: Reading | null
}
type Loaded = { places: Place[]; available: boolean; readerOn: boolean }
type Decided = 'used' | 'kept'

/** Places not read yet, read on their own when the page loads, at most. */
export const READ_ON_LOAD = 5
const TITLE = 'Main dishes'

const STATUS: Record<DishPlaceStatus, 'differs' | 'not_read' | 'cant_read' | 'same' | 'off'> = { differs: 'differs', not_read: 'not_read', cant_read: 'cant_read', same: 'same', off: 'off' }

/** A menu read somewhere other than the place's own site (readElsewhere). */
function elsewhere(p: Place): boolean {
  return readElsewhere(p.reading?.sourceUrl ?? null, p.website, p.menuUrl)
}

/** A reading of photos an admin added: it has no address. */
const fromPhotos = (r: Reading | null) => !!r && !r.sourceUrl && !!r.model

const proposalOf = (p: Place): DishProposal | null =>
  p.reading && (p.reading.status === 'proposed' || p.reading.status === 'approved' || p.reading.status === 'skipped') ? dishProposal(p, p.reading) : null

/** The sentence over the page: does anything need you? */
export function dishSay(statuses: readonly DishPlaceStatus[]): { head: string } {
  const n = (s: DishPlaceStatus) => statuses.filter((x) => x === s).length
  const differs = n('differs')
  const head = differs === 1 ? '1 place has an update from its menu.' : differs ? `${differs} places have an update from their menus.` : 'No place’s menu has an update.'
  return { head: n('not_read') ? `${head} ${n('not_read')} not read yet.` : head }
}

/** Its row's pill. */
function rowPill(p: Place, status: DishPlaceStatus, decided: Decided | undefined, reading: boolean): { text: string; tone: Tone } {
  if (decided) return { text: `${decided === 'used' ? 'Used' : 'Kept'} ${day(new Date().toISOString())}`, tone: 'grey' }
  if (reading) return { text: 'Reading…', tone: 'grey' }
  if (status === 'differs') return { text: updatesPill(1), tone: 'amber' }
  if (status === 'not_read') return { text: 'Not read yet', tone: 'grey' }
  if (status === 'cant_read') return { text: p.website || p.menuUrl ? 'No menu found' : 'Nothing to read', tone: 'grey' }
  if (status === 'off') return { text: 'Reading off', tone: 'grey' }
  return { text: 'Same', tone: 'green' }
}

/** What's said beside the source once, for dishes whose words couldn't be
 *  checked on the page. */
function uncheckedNote(p: DishProposal, r: Reading): string | undefined {
  if (fromPhotos(r)) return undefined
  const unchecked = p.rows.filter((x) => x.quote !== undefined && x.checked === false)
  if (!unchecked.length) return undefined
  return unchecked.some((x) => x.picture) ? 'from pictures on the page, open it to check' : 'from a PDF, open it to check'
}

/** The pages it reads, for Reads. */
function readPages(p: Place, status: DishPlaceStatus, act: (body: Record<string, unknown>) => void): ReadPage[] {
  const r = p.reading
  const off = status === 'off'
  const dishes = r && (r.status === 'proposed' || r.status === 'approved' || r.status === 'skipped') && r.dishes.length > 0
  const from = (url: string) => (p.menuUrl && samePage(url, p.menuUrl) ? 'Menu link' : 'Website')
  const pages: ReadPage[] = []
  if (fromPhotos(r)) pages.push({ key: 'photos', url: null, name: 'Photos of the menu', label: dishes ? `Added ${day(r!.readAt)} · ${TITLE}` : 'Nothing from them', right: `read ${day(r!.readAt)}`, none: !dishes })
  // Its menu link, when it has one the last read didn't come from.
  if (p.menuUrl && !(r?.sourceUrl && samePage(r.sourceUrl, p.menuUrl))) {
    const tried = r && r.status !== 'no_menu' && Date.parse(r.readAt) > 0 && !fromPhotos(r)
    pages.push({ key: 'link', url: p.menuUrl, label: tried ? 'Menu link · Nothing from it' : 'Menu link', right: tried ? 'couldn’t read' : r ? '' : 'not read yet', none: !!tried, onRemove: off ? undefined : () => act({ action: 'unlink' }) })
  }
  // The page its last read came from; else its website, when that's what's read.
  const url = r?.sourceUrl ?? (fromPhotos(r) || p.menuUrl ? null : p.website)
  if (url) {
    const what = from(url)
    const failed = r?.status === 'failed'
    pages.push({
      key: 'read',
      url,
      label: elsewhere(p) ? 'Its website sent the reader to another site' : failed ? (r!.note ?? `${what} · Nothing from it`) : dishes ? `${what} · ${TITLE}` : what,
      warn: elsewhere(p),
      right: off ? '' : !r ? 'not read yet' : failed ? 'no menu' : `read ${day(r.readAt)}`,
      none: failed,
      onRemove: off ? undefined : what === 'Menu link' ? () => act({ action: 'unlink' }) : () => act({ action: 'no_menu' }),
    })
  }
  return pages
}

function DishRowView({
  place: p,
  status,
  decided,
  busy,
  reading,
  readerOn,
  onAct,
  onPhotos,
  onEdit,
}: {
  place: Place
  status: DishPlaceStatus
  decided?: Decided
  busy: boolean
  reading: boolean
  readerOn: boolean
  onAct: (body: Record<string, unknown>) => void
  onPhotos: (files: File[]) => void
  onEdit: (proposal: DishProposal) => void
}) {
  const [adding, setAdding] = useState(false)
  const r = p.reading
  const proposal = proposalOf(p)
  const sent = sentThroughSite(p)
  const off = status === 'off'
  const cant = status === 'cant_read'
  const open = status === 'differs' && !decided && r?.status === 'proposed'
  const canRead = !off && readerOn && !!(p.website || p.menuUrl)

  const boxPill: { text: string; tone: Tone } | undefined = open
    ? { text: proposal!.pill ?? 'Same', tone: 'amber' }
    : decided
      ? { text: `${decided === 'used' ? 'Used' : 'Kept'} ${day(new Date().toISOString())}`, tone: 'grey' }
      : r?.status === 'approved' && r.decidedAt
        ? { text: `Used ${day(r.decidedAt)}`, tone: 'grey' }
        : r?.status === 'skipped' && r.decidedAt
          ? { text: `Kept ${day(r.decidedAt)}`, tone: 'grey' }
          : { text: 'Same', tone: 'grey' }

  const dishes =
    proposal && r ? (
      <Box key={`${decided ?? ''}`} name={TITLE} pill={boxPill} defaultOpen={open}>
        <BoxRows>
          {proposal.rows.map((d) => (
            <BoxRow
              key={d.name}
              name={d.name}
              mark={d.status === 'gone' ? 'gone' : d.status === 'new' && open ? 'new' : 'same'}
              why="Not on the menu"
              sub={
                d.quote ? (
                  <>
                    “{d.quote}”{d.named === false && <span className="text-amber-800"> · these words don’t name it</span>}
                  </>
                ) : d.status === 'not_found' ? (
                  'Not found on the menu'
                ) : undefined
              }
            />
          ))}
        </BoxRows>
        {open && <BoxActions busy={busy} onUse={() => onAct({ action: 'use' })} onEdit={() => onEdit(proposal)} onKeep={() => onAct({ action: 'skip' })} />}
        <SourceLine url={r.sourceUrl} what={fromPhotos(r) ? 'photos of the menu' : undefined} at={r.readAt} extra={uncheckedNote(proposal, r)} />
      </Box>
    ) : sent ? (
      <Box name={TITLE} pill={{ text: 'Same', tone: 'grey' }}>
        <BoxRows>
          {p.dishes.map((d) => (
            <BoxRow key={d} name={d} />
          ))}
        </BoxRows>
        <SourceLine what="a menu sent through the site" extra={p.menuAt ? `used ${day(p.menuAt)}` : undefined} />
      </Box>
    ) : null

  const pages = readPages(p, status, onAct)
  const links = (
    <>
      {!off && !adding && (
        <button type="button" disabled={busy} onClick={() => setAdding(true)} className={LINK}>
          Add a page
        </button>
      )}
      {canRead && (
        <button type="button" disabled={busy} onClick={() => onAct({ action: 'read' })} className={LINK}>
          {busy ? 'Reading…' : 'Read them now'}
        </button>
      )}
      {cant && readerOn && (
        <label className={`${LINK} ${busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
          Add photos of the menu
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf"
            aria-label={`Photos of ${p.name}’s menu`}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (files.length) onPhotos(files)
            }}
          />
        </label>
      )}
      {cant && (
        <button type="button" disabled={busy} onClick={() => onAct({ action: 'no_menu' })} className={LINK}>
          No menu
        </button>
      )}
      <a href={p.href} target="_blank" rel="noopener noreferrer" className={LINK}>
        Open its listing
      </a>
    </>
  )
  return (
    <PlaceRow name={p.name} pill={rowPill(p, status, decided, reading)} back={TITLE}>
      {dishes}
      <Reads
        on={!off}
        busy={busy}
        onSwitch={(on) => onAct({ action: on ? 'undo_no_menu' : 'no_menu' })}
        pages={pages}
        defaultOpen={!dishes || cant || off || status === 'not_read'}
        below={
          adding && (
            <GivePage
              label="Its menu page or PDF"
              placeholder="https://"
              busy={busy}
              onGive={(url) => {
                setAdding(false)
                onAct({ action: 'link', url })
              }}
              onCancel={() => setAdding(false)}
            />
          )
        }
        links={links}
      />
    </PlaceRow>
  )
}

export default function MainDishes({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  // Each place's tab as it was when the page loaded, and the one showing.
  const [tabOf, setTabOf] = useState<ReadonlyMap<string, JobTab>>(new Map())
  const [tab, setTab] = useState<JobTab>('to_check')
  // Used or kept this visit: said where it was.
  const [decided, setDecided] = useState<ReadonlyMap<string, Decided>>(new Map())
  // Edit: the listing's own Edit for its dishes, started from its menu's.
  const [editing, setEditing] = useState<{ item: DirectoryResource; category: CategoryConfig; edit: BoxEdit } | null>(null)
  const headers = { Authorization: `Bearer ${token}` }
  const api = withCommunity('/api/admin/main-dishes', community)

  const load = useCallback(async () => {
    setError(null)
    try {
      const got = await fetchJson<Loaded>(withCommunity('/api/admin/main-dishes', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the food places.')
      const { rows, tabs, first } = jobTabs(got.places, (p) => STATUS[dishStatus(p)], (p) => p.name)
      setData({ ...got, places: rows })
      setTabOf(tabs)
      setTab(first)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  const patch = (id: string, p: Partial<Place>) => setData((d) => d && { ...d, places: d.places.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const mark = (id: string, on: boolean) =>
    setBusy((b) => {
      const next = new Set(b)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  /** After Use this or Save to the listing: the listing as it is now. */
  const used = (p: Place, res: { dishes?: string[]; sometimes?: string[]; menuDated?: string[] }) => {
    patch(p.id, {
      dishes: res.dishes ?? p.dishes,
      sometimes: res.sometimes ?? p.sometimes,
      menuDated: res.menuDated ?? p.menuDated,
      reading: p.reading && { ...p.reading, status: 'approved', decidedAt: new Date().toISOString(), decidedBy: 'you' },
    })
    setDecided((m) => new Map(m).set(p.id, 'used'))
  }

  async function act(p: Place, body: Record<string, unknown>) {
    setSaveError(null)
    mark(p.id, true)
    try {
      const res = await fetchJson<{ reading?: Reading | null; menuUrl?: string | null; dishes?: string[]; sometimes?: string[]; menuDated?: string[] }>(
        api,
        { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ resourceId: p.id, ...body }) },
        'Could not do that.',
      )
      if (body.action === 'use') used(p, res)
      else if (body.action === 'skip') {
        patch(p.id, { reading: p.reading && { ...p.reading, status: 'skipped', decidedAt: new Date().toISOString(), decidedBy: 'you' } })
        setDecided((m) => new Map(m).set(p.id, 'kept'))
      } else {
        patch(p.id, {
          ...(res.menuUrl !== undefined ? { menuUrl: res.menuUrl } : {}),
          ...(res.reading !== undefined ? { reading: res.reading } : {}),
        })
        setDecided((m) => {
          const next = new Map(m)
          next.delete(p.id)
          return next
        })
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      mark(p.id, false)
    }
  }

  async function addPhotos(p: Place, files: File[]) {
    setSaveError(null)
    mark(p.id, true)
    try {
      const body = new FormData()
      body.append('action', 'photos')
      body.append('resourceId', p.id)
      for (const f of files) body.append('file', f)
      const { reading } = await fetchJson<{ reading?: Reading }>(api, { method: 'POST', headers, body }, 'Could not read those photos.')
      if (reading) patch(p.id, { reading })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not read those photos.')
    } finally {
      mark(p.id, false)
    }
  }

  async function edit(p: Place, proposal: DishProposal) {
    setSaveError(null)
    try {
      const { item, category } = await fetchJson<{ item: DirectoryResource; category: CategoryConfig }>(withCommunity(`/api/admin/main-dishes?item=${p.id}`, community), { headers }, 'Could not open its dishes.')
      const field = itemsField(category)
      if (!field) return
      setEditing({
        item,
        category,
        edit: {
          title: field.label,
          fields: [],
          rows: ['items'],
          preset: { [field.key]: proposal.always, [`${field.key}_sometimes`]: proposal.sometimes },
          save: {
            label: 'Save to the listing',
            via: async ({ payload }) => {
              const d = (payload.details ?? {}) as Record<string, unknown>
              const res = await fetch(api, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save', resourceId: p.id, always: d[field.key] ?? [], sometimes: d[`${field.key}_sometimes`] ?? [] }),
              })
              if (res.ok) used(p, await res.clone().json())
              return res
            },
            onSaved: () => setEditing(null),
          },
        },
      })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not open its dishes.')
    }
  }

  // Places not read yet, read now, one after another.
  const readOnLoad = useRef(false)
  useEffect(() => {
    if (!data || readOnLoad.current) return
    readOnLoad.current = true
    if (!data.readerOn) return
    const unread = data.places.filter((p) => dishStatus(p) === 'not_read').slice(0, READ_ON_LOAD)
    void (async () => {
      for (const p of unread) await act(p, { action: 'read' })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const backHref = `${adminBase(community)}/watches`
  if (error || !data) {
    const notice = error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : <p className="text-sm text-muted">Loading food places…</p>
    return <JobPage backHref={backHref} title={TITLE} intro="" needYou={0} total={0} noun="place" notice={notice} />
  }

  const counts = { to_check: 0, cant_read: 0, checked: 0, off: 0 }
  for (const p of data.places) counts[tabOf.get(p.id) ?? 'to_check']++
  const moved = data.places.filter(elsewhere)
  return (
    <>
      <JobPage
        backHref={backHref}
        title={TITLE}
        intro=""
        needYou={0}
        total={data.places.length}
        noun="place"
        say={dishSay(data.places.map(dishStatus))}
        tabs={{ counts, active: tab, onChange: setTab }}
        notice={
          <>
            {!data.available && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Reading menus needs database migration 065.</p>}
            {!data.readerOn && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">The AI reader isn&rsquo;t set up here (no OPENAI_API_KEY).</p>}
            {saveError && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
            {/* A listing sending visitors somewhere else matters more than
                its dishes, so it's said up top. */}
            {moved.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="dish-moved-sites">
                <p className="font-semibold">Websites that sent the reader to another site:</p>
                <ul className="mt-1 list-disc pl-5">
                  {moved.map((p) => (
                    <li key={p.id}>
                      {p.name}: {shortUrl(p.website!)} → {shortUrl(p.reading!.sourceUrl!)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        }
      >
        {data.places
          .filter((p) => (tabOf.get(p.id) ?? 'to_check') === tab)
          .map((p) => (
            <DishRowView
              key={`${p.id}:${p.reading?.readAt ?? ''}`}
              place={p}
              status={dishStatus(p)}
              decided={decided.get(p.id)}
              busy={busy.has(p.id)}
              reading={busy.has(p.id) && dishStatus(p) === 'not_read'}
              readerOn={data.readerOn}
              onAct={(body) => void act(p, body)}
              onPhotos={(files) => void addPhotos(p, files)}
              onEdit={(proposal) => void edit(p, proposal)}
            />
          ))}
      </JobPage>
      {editing && <BoxEditSheet item={editing.item} category={editing.category} edit={editing.edit} onClose={() => setEditing(null)} />}
    </>
  )
}
