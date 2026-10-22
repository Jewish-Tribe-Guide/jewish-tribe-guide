'use client'

import { useCallback, useState } from 'react'
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
import { dishJobStatus, dishStatus, sentThroughSite, type DishJobStatus, type DishPlace, type DishPlaceStatus } from '@/lib/watchJobs'
import { watchHealth, type Watch } from '@/lib/watches'
import type { Finding } from '@/lib/watchFindings'
import BoxEditSheet, { type BoxEdit } from '@/components/resources/BoxEditSheet'
import ContactBoxes, { givesContact, isContactFinding, type ListedContact } from './ContactBoxes'
import FoodHours, { isFoodHoursFinding } from './FoodHours'
import FindingCompare, { type Decision } from './FindingCompare'
import { GivePage, JobPage, day, jobTabs, shortUrl, tabCounts, tabOf, type JobTab } from './JobPage'
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
//
// A place whose hours or phone Google doesn't keep is read from its own
// website for them too (board 3, Oct 22): an Hours box (FoodHours.tsx)
// and a Phone box (ContactBoxes.tsx), updates first and open, Same boxes
// closed below, and its website's pages in Reads, named for what they gave.

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
type Place = Omit<DishPlace, 'findings'> & {
  id: string
  name: string
  href: string
  categoryLabel: string
  facts: string[]
  dishes: string[]
  reading: Reading | null
  /** Its website's pages read for its hours and phone, what they found
   *  waiting, its hours as listed (when its website is read for them), and
   *  its phone (contactRead.ts). */
  pages?: Watch[]
  findings?: Finding[]
  hours?: unknown
  contact?: ListedContact | null
}
type Loaded = { places: Place[]; available: boolean; readerOn: boolean }
type Decided = 'used' | 'kept'
type Settled = ReadonlyMap<string, Decision>

const TITLE = 'Main dishes'

const STATUS: Record<DishJobStatus, 'differs' | 'not_read' | 'cant_read' | 'didnt_load' | 'same' | 'off'> = { differs: 'differs', not_read: 'not_read', cant_read: 'cant_read', didnt_load: 'didnt_load', same: 'same', off: 'off' }

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
function rowPill(p: Place, status: DishJobStatus, decided: Decided | undefined, reading: boolean, waiting = 0, last?: Decision): { text: string; tone: Tone } {
  if (reading) return { text: 'Reading…', tone: 'grey' }
  // Its menu's update, and its website's hours and phone, each one.
  if (waiting) return { text: updatesPill(waiting), tone: 'amber' }
  if (decided) return { text: `${decided === 'used' ? 'Used' : 'Kept'} ${day(new Date().toISOString())}`, tone: 'grey' }
  if (last) return { text: `${last === 'approved' ? 'Used' : 'Kept'} ${day(new Date().toISOString())}`, tone: 'grey' }
  if (status === 'differs') return { text: updatesPill(1), tone: 'amber' }
  if (status === 'not_read') return { text: 'Not read yet', tone: 'grey' }
  if (status === 'cant_read') return { text: p.website || p.menuUrl ? 'No menu found' : 'Nothing to read', tone: 'grey' }
  if (status === 'didnt_load') return { text: 'Menu didn’t load', tone: 'grey' }
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
function readPages(p: Place, status: DishJobStatus, act: (body: Record<string, unknown>) => void): ReadPage[] {
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
  // Its website's pages read for its hours and phone, named for what each
  // gave; the page its menu came from too, when it's the same one.
  const now = Date.now()
  for (const w of (p.pages ?? []).filter((x) => x.active)) {
    const c = w.lastCheck
    const failed = ['failing', 'stale'].includes(watchHealth(w, now).state)
    const found = (p.findings ?? []).filter((f) => f.page && samePage(f.page, w.url))
    const hours = found.some(isFoodHoursFinding) || (c?.what === 'hours' && (c.result === 'agrees' || c.result === 'differs' || c.result === 'unsure'))
    const phone = found.some(isContactFinding) || givesContact(w)
    const names = [...(hours ? ['Hours'] : []), ...(phone && p.contact ? [p.contact.name] : [])]
    const label = failed ? '' : names.length ? names.join(' · ') : c ? 'Nothing from it' : ''
    const had = pages.find((x) => x.url && samePage(x.url, w.url))
    if (had) {
      if (names.length) had.label = had.none ? names.join(' · ') : [had.label, ...names].join(' · ')
      continue
    }
    pages.push({ key: w.id, url: w.url, label, right: off ? '' : failed ? 'didn’t load' : !w.lastRunAt || !c ? 'not read yet' : `read ${day(c.at)}`, none: failed || (!!c && !names.length), onRemove: () => act({ action: 'stop', id: w.id }) })
  }
  // Its menu page, when this morning's check of it didn't open it.
  const watched = p.menuWatch
  if (status === 'didnt_load' && watched) {
    const menu = pages.find((x) => x.url && samePage(x.url, watched.url))
    if (menu) Object.assign(menu, { right: 'didn’t load', none: true })
    else pages.push({ key: 'menu-watch', url: watched.url, label: from(watched.url), right: 'didn’t load', none: true })
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
  settled,
  token,
  community,
  onDecided,
}: {
  place: Place
  status: DishJobStatus
  decided?: Decided
  busy: boolean
  reading: boolean
  readerOn: boolean
  onAct: (body: Record<string, unknown>) => void
  onPhotos: (files: File[]) => void
  onEdit: (proposal: DishProposal) => void
  /** Its website's findings decided this visit. */
  settled: Settled
  token: string
  community: string
  onDecided: (f: Finding, d: Decision) => void
}) {
  const [adding, setAdding] = useState(false)
  const r = p.reading
  const proposal = proposalOf(p)
  const sent = sentThroughSite(p)
  const off = status === 'off'
  const cant = status === 'cant_read' || status === 'didnt_load'
  // Its menu's own update: the place may be in To check for its hours.
  const open = !decided && r?.status === 'proposed' && (proposal?.updates ?? 0) > 0
  const findings = p.findings ?? []
  const others = findings.filter((f) => !isFoodHoursFinding(f) && !isContactFinding(f))
  const live = (p.pages ?? []).filter((w) => w.active)
  const waiting = findings.filter((f) => !settled.has(f.id)).length + (open ? 1 : 0)
  const last = [...findings].reverse().map((f) => settled.get(f.id)).find(Boolean)
  const web = { placeId: p.id, findings, pages: live, settled, busy, token, community, onDecided }
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
    <PlaceRow name={p.name} pill={rowPill(p, status, decided, reading, waiting, last)} back={TITLE}>
      {/* Updates first and open, then the Same boxes (board 3). */}
      {open && dishes}
      <FoodHours {...web} hours={p.hours} show="updates" />
      <ContactBoxes {...web} contact={p.contact ?? null} itemUrl="/api/admin/main-dishes" sameTone="grey" show="updates" />
      {!open && dishes}
      {p.hours !== undefined && <FoodHours {...web} hours={p.hours} show="same" />}
      <ContactBoxes {...web} contact={p.contact ?? null} itemUrl="/api/admin/main-dishes" sameTone="grey" show="same" />
      {others.map((f) => (
        <Box key={settled.has(f.id) ? `${f.id}-done` : f.id} name={`From ${f.from}`} pill={settled.has(f.id) ? { text: `${settled.get(f.id) === 'approved' ? 'Used' : 'Kept'} ${day(new Date().toISOString())}`, tone: 'grey' } : { text: updatesPill(f.lines.length), tone: 'amber' }} defaultOpen={!settled.has(f.id)}>
          <FindingCompare finding={f} token={token} community={community} jobName={TITLE} decided={settled.get(f.id)} onDecided={(d) => onDecided(f, d)} />
        </Box>
      ))}
      <Reads
        on={!off}
        busy={busy}
        onSwitch={(on) => onAct({ action: on ? 'undo_no_menu' : 'no_menu' })}
        pages={pages}
        defaultOpen={(!dishes && !findings.length) || cant || off || status === 'not_read'}
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
  // When the page opened, for whether a menu page's check is too old.
  const [now] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  // The tab showing.
  const [tab, setTab] = useState<JobTab>('to_check')
  // Used or kept this visit: said where it was.
  const [decided, setDecided] = useState<ReadonlyMap<string, Decided>>(new Map())
  // Its website's hours and phone, used or kept this visit.
  const [settled, setSettled] = useState<Settled>(new Map())
  // Edit: the listing's own Edit for its dishes, started from its menu's.
  const [editing, setEditing] = useState<{ item: DirectoryResource; category: CategoryConfig; edit: BoxEdit } | null>(null)
  const headers = { Authorization: `Bearer ${token}` }
  const api = withCommunity('/api/admin/main-dishes', community)

  const load = useCallback(async () => {
    setError(null)
    try {
      const got = await fetchJson<Loaded>(withCommunity('/api/admin/main-dishes', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the food places.')
      const { rows, first } = jobTabs(got.places, (p) => STATUS[dishJobStatus(p, now)], (p) => p.name)
      setData({ ...got, places: rows })
      setTab(first)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community, now])
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
      const res = await fetchJson<{ reading?: Reading | null; menuUrl?: string | null; dishes?: string[]; sometimes?: string[]; menuDated?: string[]; pages?: Watch[] }>(
        api,
        { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ resourceId: p.id, ...body }) },
        'Could not do that.',
      )
      if (body.action === 'use') used(p, res)
      else if (body.action === 'stop') patch(p.id, { pages: (p.pages ?? []).filter((w) => w.id !== body.id) })
      else if (body.action === 'skip') {
        patch(p.id, { reading: p.reading && { ...p.reading, status: 'skipped', decidedAt: new Date().toISOString(), decidedBy: 'you' } })
        setDecided((m) => new Map(m).set(p.id, 'kept'))
      } else {
        patch(p.id, {
          ...(res.menuUrl !== undefined ? { menuUrl: res.menuUrl } : {}),
          ...(res.reading !== undefined ? { reading: res.reading } : {}),
          // A read that agreed with the listing dated its dishes from the menu.
          ...(res.menuDated ? { menuDated: res.menuDated } : {}),
          // Its website's pages, read again.
          ...(res.pages ? { pages: (p.pages ?? []).map((w) => res.pages!.find((x) => x.id === w.id) ?? w) } : {}),
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

  const backHref = `${adminBase(community)}/watches`
  if (error || !data) {
    const notice = error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : <p className="text-sm text-muted">Loading food places…</p>
    return <JobPage backHref={backHref} title={TITLE} intro="" needYou={0} total={0} noun="place" notice={notice} />
  }

  // What it is now: its website's findings used or kept this visit count as done.
  const statusOf = (p: Place) => dishJobStatus({ ...p, findings: p.findings?.filter((f) => !settled.has(f.id)) }, now)
  const counts = tabCounts(data.places.map((p) => STATUS[statusOf(p)]))
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
          .filter((p) => tabOf(STATUS[statusOf(p)]) === tab)
          .map((p) => (
            <DishRowView
              key={`${p.id}:${p.reading?.readAt ?? ''}`}
              place={p}
              status={statusOf(p)}
              decided={decided.get(p.id)}
              busy={busy.has(p.id)}
              reading={busy.has(p.id) && dishStatus(p) === 'not_read'}
              readerOn={data.readerOn}
              onAct={(body) => void act(p, body)}
              onPhotos={(files) => void addPhotos(p, files)}
              onEdit={(proposal) => void edit(p, proposal)}
              settled={settled}
              token={token}
              community={community}
              onDecided={(f, d) => setSettled((m) => new Map(m).set(f.id, d))}
            />
          ))}
      </JobPage>
      {editing && <BoxEditSheet item={editing.item} category={editing.category} edit={editing.edit} onClose={() => setEditing(null)} />}
    </>
  )
}
