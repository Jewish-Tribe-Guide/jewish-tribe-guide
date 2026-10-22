'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { KOSHER_LIST_NAMES, kosherSection, listWho, type KosherList, type KosherPlace, type NewOnList } from '@/lib/kosherJob'
import { googleLine, kosherBoxFields, kosherBoxKeys, kosherKeysToUse, kosherPill, kosherRows, renamedTo, type KosherRow } from '@/lib/kosherBox'
import { KEYSTONE_CERT } from '@/lib/keystoneWatch'
import { companionKeys, selectValues, type CategoryConfig } from '@/lib/categories'
import { isCertificateLink } from '@/lib/listingView'
import { updatesPill } from '@/lib/dishProposal'
import type { JobCounts } from '@/lib/watchJobs'
import type { Watch } from '@/lib/watches'
import type { Finding } from '@/lib/watchFindings'
import type { Decided } from '@/lib/watchFindingStore'
import type { DirectoryResource } from '@/types'
import BoxEditSheet, { type BoxEdit } from '@/components/resources/BoxEditSheet'
import FindingCompare from './FindingCompare'
import ListingEditorScreen from './ListingEditorScreen'
import { JobPage, day, shortUrl } from './JobPage'
import { BUTTON, Box, BoxActions, BoxRow, BoxRows, GO, LINK, PlaceRow, ReadingSwitch, SourceLine, type Tone } from './JobBoxes'

// ── The Watches tab's Kosher certification page ─────────────────────────────
// Every food place in the guide, with what Keystone-K's and Mekor
// Habracha's lists say about it (kosherJob.ts), and the places a list has
// that the guide doesn't.
//
// Drawn on artifact 2PPYvecC87w2KLNeHgYfTN (agreed Oct 21), on the pieces
// every job page shares (JobBoxes.tsx), with one difference: the sources
// are two lists, not each place's website. So the lists sit at the top,
// each with its one Reading switch, and a place's Reads has none, only its
// pages on them. Tabs: To check, New on a list, Checked, On neither list.
// A place opened is its listing's Kosher box (kosherBox.ts), what a list
// says marked on its rows, then Use this / Edit / Keep the listing. Its
// only hechsher gone: "No hechsher left", Archive the listing, and, when
// the list has a place by a near name, "It's Kosher City Eats now". A new
// place is drawn as the listing it would add: Add it / Edit / Leave it out.

export type KosherListState = { list: KosherList; url: string; watch: Watch | null; error: string | null; entries: number | null; updated: string | null }
/** A finding with what it would make the listing (`values`), and a new
 *  place's address and category. */
type KosherFinding = Finding & { address?: string; category?: string }
type Place = KosherPlace & { href: string; box?: Record<string, unknown>; findings?: KosherFinding[]; decided?: Decided | null }
type NewPlace = NewOnList & { findings?: KosherFinding[] }
export type KosherLoaded = {
  available: boolean
  categories?: CategoryConfig[]
  lists: KosherListState[]
  counts: JobCounts & { notListed: number }
  places: Place[]
  newPlaces: NewPlace[]
  /** What a list filed that matches no place now (the list changed since). */
  others?: KosherFinding[]
}

type Tab = 'to_check' | 'new' | 'checked' | 'neither'
const TABS: { key: Tab; label: string }[] = [
  { key: 'to_check', label: 'To check' },
  { key: 'new', label: 'New on a list' },
  { key: 'checked', label: 'Checked' },
  { key: 'neither', label: 'On neither list' },
]
/** What became of a finding this visit: "Used Oct 22", "Left out Oct 22". */
type Settled = ReadonlyMap<string, string>
type Act = { token: string; community: string; settled: Settled; onDone: (f: Finding, text: string) => void; onReload: () => void }

const today = () => day(new Date().toISOString())
const API = '/api/admin/watches/kosher'

/** Mekor's "Last Updated: 2026-10-12" as the rest of the page says a day. */
function listDay(updated: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updated)) return updated
  return new Date(`${updated}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** When a list was last read, for its row and a box's source line. */
const readOn = (l: KosherListState | undefined) => l?.watch?.lastCheck?.at ?? l?.watch?.lastOkAt ?? null

/** Its tab now: a finding decided this visit counts as done, and so do the
 *  list lines it was filed from. */
function placeTab(p: Place, settled: Settled): Tab {
  const findings = p.findings ?? []
  const waiting = findings.filter((f) => !settled.has(f.id)).length
  const differences = findings.length && !waiting ? p.differences.map((d) => (d.filed === 'queued' ? { ...d, filed: 'decided' as const } : d)) : p.differences
  const s = kosherSection({ ...p, differences, waiting })
  return s === 'to_check' ? 'to_check' : s === 'not_listed' ? 'neither' : 'checked'
}

/** New on a list, not left out or added yet. */
const isNew = (n: NewPlace, settled: Settled) => n.filed !== 'decided' && !(n.findings?.[0] && settled.has(n.findings[0].id))

function tabCounts(d: KosherLoaded, settled: Settled): Record<Tab, number> {
  const counts: Record<Tab, number> = { to_check: 0, new: 0, checked: 0, neither: 0 }
  for (const p of d.places) counts[placeTab(p, settled)]++
  counts.to_check += (d.others ?? []).filter((f) => !settled.has(f.id)).length
  counts.new += d.newPlaces.filter((n) => isNew(n, settled)).length
  return counts
}

/** The page's sentence: does anything need you? */
export function kosherSay(n: number): string {
  if (!n) return 'No place has an update from a list.'
  return n === 1 ? '1 place has an update from a list.' : `${n} places have an update from a list.`
}

/** A box's rows: a changed one with "was …" under it, one going crossed
 *  out with its row's name under it. */
function Rows({ rows }: { rows: readonly KosherRow[] }) {
  return (
    <BoxRows>
      {rows.length ? (
        rows.map((r) =>
          r.mark === 'gone' ? (
            <BoxRow key={r.name} name={<span className="[overflow-wrap:anywhere]">{r.value}</span>} sub={r.name} mark="gone" />
          ) : (
            <BoxRow
              key={r.name}
              name={r.name}
              mark={r.mark}
              right={
                <>
                  <span className={r.name === 'Certificate' ? 'block truncate' : undefined}>{r.value}</span>
                  {r.was && <span className="block truncate text-xs text-slate-500">was {r.was}</span>}
                </>
              }
            />
          ),
        )
      ) : (
        <BoxRow name="Nothing about its hechsher" />
      )}
    </BoxRows>
  )
}

const listOf = (f: Finding): KosherList => (f.from.startsWith('Mekor') ? 'mekor' : 'keystone')

/** What a list's finding would make the Kosher box: an edit's values; a
 *  removal's, Keystone-K and its page taken off. */
function nextBox(category: CategoryConfig, now: Record<string, unknown>, f: KosherFinding): Record<string, unknown> {
  const keys = kosherBoxKeys(category)
  if (f.operation !== 'delete') return Object.fromEntries(keys.map((k) => [k, f.values?.[k] ?? null]))
  const out = { ...now }
  for (const field of kosherBoxFields(category)) {
    if (field.caveat) out[field.key] = selectValues(now[field.key]).filter((c) => c !== KEYSTONE_CERT)
    else if (isCertificateLink(field) && /keystone-k\.org/.test(String(now[field.key] ?? ''))) out[field.key] = null
  }
  return out
}

/** A finding the Kosher box shows: an edit to it and nothing else, or a
 *  removal. Anything wider is shown whole, to Compare. */
function inTheBox(category: CategoryConfig | undefined, f: KosherFinding): boolean {
  if (!category || !kosherBoxKeys(category).length) return false
  if (f.operation === 'delete') return true
  if (f.operation !== 'update' || !f.values) return false
  const keys = new Set(kosherBoxKeys(category))
  return f.lines.every((l) => keys.has(l.key))
}

function KosherBox({ place: p, category, finding: f, list, act, busy, onBusy }: { place: Place; category: CategoryConfig; finding: KosherFinding; list?: KosherListState; act: Act; busy: boolean; onBusy: (b: boolean) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ item: DirectoryResource; edit: BoxEdit } | null>(null)
  const { token, community, settled, onDone } = act
  const headers = { Authorization: `Bearer ${token}` }
  const now = p.box ?? {}
  const next = nextBox(category, now, f)
  const rows = kosherRows(category, now, next)
  const certKey = kosherBoxFields(category).find((x) => x.caveat)?.key
  const noneLeft = !!certKey && selectValues(now[certKey]).length > 0 && selectValues(next[certKey]).length === 0
  const done = settled.get(f.id)
  const near = f.operation === 'delete' ? renamedTo(f.notes) : null

  async function send(path: string, init: RequestInit, text: string) {
    setError(null)
    onBusy(true)
    try {
      await fetchJson(withCommunity(path, community), { ...init, headers: { ...headers, 'Content-Type': 'application/json' } }, 'Could not save that.')
      onDone(f, text)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      onBusy(false)
    }
  }
  const decide = (body: Record<string, unknown>, text: string) => send(`/api/admin/submissions/${f.id}`, { method: 'PATCH', body: JSON.stringify(body) }, text)
  // Only ever the box's keys: the finding's other values are as the listing
  // was when the list was read. A box that's the same already takes its own.
  const changed = kosherKeysToUse(rows)
  const use = changed.length ? changed : f.lines.length ? f.lines.map((l) => l.key) : kosherBoxKeys(category)

  /** Edit: the listing's own Kosher box, filled in with the list's
   *  version, saved straight to the listing. */
  async function edit() {
    setError(null)
    try {
      const { item } = await fetchJson<{ item: DirectoryResource }>(withCommunity(`${API}?item=${p.id}`, community), { headers }, 'Could not open its box.')
      const keys = new Set(kosherBoxKeys(category))
      // Every field the listing has now, the box's as edited: a finding
      // carries the listing as it was when read (withReviewEdits).
      const editable = category.detailFields.flatMap((x) => [x.key, ...companionKeys(x)])
      setEditing({
        item,
        edit: {
          title: 'Kosher',
          fields: [],
          rows: ['facts'],
          preset: Object.fromEntries([...keys].map((k) => [k, next[k] ?? null])),
          save: {
            label: 'Save to the listing',
            via: async ({ payload }) => {
              const d = (payload.details ?? {}) as Record<string, unknown>
              const details = Object.fromEntries(editable.map((k) => [k, keys.has(k) ? (d[k] ?? null) : (item[k] ?? null)]))
              if (f.operation === 'delete') {
                // A removal can't be edited: the listing is saved as the
                // admin left it, and the removal closes.
                return fetch(withCommunity(API, community), { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'edit', id: f.id, details: Object.fromEntries([...keys].map((k) => [k, d[k] ?? null])) }) })
              }
              return fetch(withCommunity(`/api/admin/submissions/${f.id}`, community), {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'approved', payload: { name: item.name, address: item.address ?? '', phone: item.phone ?? '', details } }),
              })
            },
            onSaved: () => {
              setEditing(null)
              onDone(f, `Used ${today()}`)
            },
          },
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open its box.')
    }
  }

  const pill: { text: string; tone: Tone } = done ? { text: done, tone: 'grey' } : f.operation === 'delete' ? { text: `Not on ${f.from}`, tone: 'amber' } : { text: kosherPill(rows), tone: 'amber' }
  return (
    <Box key={done ? `${f.id}-done` : f.id} name="Kosher" pill={pill} defaultOpen={!done}>
      <Rows rows={rows} />
      {!done && noneLeft && (
        <>
          <p className="text-sm font-semibold text-amber-800">No hechsher left</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void (f.operation === 'delete' ? decide({ status: 'approved' }, `Archived ${today()}`) : send(API, { method: 'POST', body: JSON.stringify({ action: 'archive', id: f.id }) }, `Archived ${today()}`))}
              className={GO}
            >
              {busy ? 'Saving…' : 'Archive the listing'}
            </button>
            <button type="button" disabled={busy} onClick={() => void edit()} className={BUTTON}>
              Edit
            </button>
            <button type="button" disabled={busy} onClick={() => void decide({ status: 'rejected' }, `Kept ${today()}`)} className={BUTTON}>
              Keep the listing
            </button>
          </div>
          {near && (
            <div className="text-[13px]">
              <button type="button" disabled={busy} onClick={() => void send(API, { method: 'POST', body: JSON.stringify({ action: 'renamed', id: f.id }) }, `Renamed ${today()}`)} className={LINK}>
                It’s {near.name} now
              </button>
            </div>
          )}
        </>
      )}
      {!done && !noneLeft && (
        <BoxActions busy={busy} onUse={() => void decide({ status: 'approved', only: use }, `Used ${today()}`)} onEdit={() => void edit()} onKeep={() => void decide({ status: 'rejected' }, `Kept ${today()}`)} />
      )}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <SourceLine url={list?.url} what={KOSHER_LIST_NAMES[listOf(f)]} at={readOn(list) ?? f.at} />
      {editing && <BoxEditSheet item={editing.item} category={category} edit={editing.edit} onClose={() => setEditing(null)} />}
    </Box>
  )
}

/** Reads, a place's last box: its pages on the lists, no switch (each
 *  list has its own, at the top), and the ways on. */
function PlaceReads({ place: p, lists, act, busy, onBusy, onReadNow, defaultOpen }: { place: Place; lists: readonly KosherListState[]; act: Act; busy: boolean; onBusy: (b: boolean) => void; onReadNow: () => void; defaultOpen: boolean }) {
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function give() {
    setError(null)
    onBusy(true)
    try {
      await fetchJson(
        withCommunity(API, act.community),
        { method: 'POST', headers: { Authorization: `Bearer ${act.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'page', resourceId: p.id, url }) },
        'Could not save that page.',
      )
      setAdding(false)
      act.onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that page.')
    } finally {
      onBusy(false)
    }
  }
  const reading = lists.some((l) => l.watch?.active)
  return (
    <Box name="Reads" pill={{ text: `${p.on.length} page${p.on.length === 1 ? '' : 's'}`, tone: 'grey' }} defaultOpen={defaultOpen} testId="job-reads">
      {p.on.length > 0 && (
        <ul className="text-sm">
          {p.on.map((o) => {
            const read = readOn(lists.find((l) => l.list === o.list))
            return (
              <li key={`${o.list}:${o.url}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-slate-100 py-1.5 first:border-t-0" data-testid="job-source">
                <span className="min-w-0 font-semibold text-slate-900 [overflow-wrap:anywhere]">
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {shortUrl(o.url)}
                  </a>
                  <small className="block text-[12.5px] font-normal text-slate-500">{KOSHER_LIST_NAMES[o.list]} · Kosher</small>
                </span>
                <span className="whitespace-nowrap text-right text-[12.5px] text-slate-500">{read ? `read ${day(read)}` : ''}</span>
              </li>
            )
          })}
        </ul>
      )}
      {adding && (
        <form
          className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-slate-50 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (url.trim()) void give()
          }}
        >
          <label className="min-w-0 flex-1 basis-60 text-xs text-slate-600">
            Its page on Keystone-K’s list
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="keystone-k.org/kosher/…" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={busy || !url.trim()} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              Save
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {!adding && (
          <button type="button" disabled={busy} onClick={() => setAdding(true)} className={LINK}>
            Add a page
          </button>
        )}
        {reading && (
          <button type="button" disabled={busy} onClick={onReadNow} className={LINK}>
            {busy ? 'Reading…' : 'Read them now'}
          </button>
        )}
        <a href={p.href} target="_blank" rel="noopener noreferrer" className={LINK}>
          Open its listing
        </a>
      </div>
    </Box>
  )
}

function KosherPlaceRow({ place: p, tab, category, lists, act, reading, onReadNow }: { place: Place; tab: Tab; category?: CategoryConfig; lists: readonly KosherListState[]; act: Act; reading: boolean; onReadNow: () => void }) {
  const [busy, setBusy] = useState(false)
  const findings = p.findings ?? []
  const own = findings.filter((f) => inTheBox(category, f))
  const others = findings.filter((f) => !inTheBox(category, f))
  const waiting = findings.filter((f) => !act.settled.has(f.id))
  const listOfName = (l: KosherList) => lists.find((x) => x.list === l)

  let pill: { text: string; tone: Tone }
  if (reading) pill = { text: 'Reading…', tone: 'grey' }
  else if (findings.length && !waiting.length) pill = { text: act.settled.get(findings[findings.length - 1].id)!, tone: 'grey' }
  else if (waiting.length) pill = { text: updatesPill(waiting.length), tone: 'amber' }
  else if (tab === 'to_check') pill = { text: 'Not read yet', tone: 'grey' }
  else if (tab === 'neither') pill = { text: p.certs.length ? p.certs.join(', ') : 'No hechsher', tone: 'grey' }
  else if (p.decided) pill = { text: `${p.decided.status === 'approved' ? 'Used' : 'Kept'} ${day(p.decided.at)}`, tone: 'grey' }
  else pill = { text: 'Same', tone: 'green' }

  const now = p.box ?? {}
  const rows = category ? kosherRows(category, now) : []
  // Not compared yet: what each list says, until tomorrow morning's read
  // (or Read them now) files it here.
  const pending = !findings.length ? p.differences.filter((d) => d.filed !== 'decided') : []
  const agree = p.on.map((o) => listWho(o.list)).join(' and ')
  return (
    <PlaceRow name={p.name} pill={pill} back="Kosher certification">
      {category &&
        own.map((f) => (
          <KosherBox key={f.id} place={p} category={category} finding={f} list={listOfName(listOf(f))} act={act} busy={busy} onBusy={setBusy} />
        ))}
      {others.map((f) => (
        <Box key={act.settled.has(f.id) ? `${f.id}-done` : f.id} name={`From ${f.from}`} pill={act.settled.has(f.id) ? { text: act.settled.get(f.id)!, tone: 'grey' } : { text: updatesPill(f.lines.length), tone: 'amber' }} defaultOpen={!act.settled.has(f.id)}>
          <FindingCompare
            finding={f}
            token={act.token}
            community={act.community}
            jobName="Kosher certification"
            decided={act.settled.has(f.id) ? (act.settled.get(f.id)!.startsWith('Used') ? 'approved' : 'rejected') : undefined}
            onDecided={(d) => act.onDone(f, `${d === 'approved' ? 'Used' : 'Kept'} ${today()}`)}
          />
        </Box>
      ))}
      {!findings.length && category && kosherBoxKeys(category).length > 0 && (
        <Box
          name="Kosher"
          pill={pending.length ? { text: 'Not read yet', tone: 'grey' } : tab === 'neither' ? { text: 'On neither list', tone: 'grey' } : { text: 'Same', tone: 'green' }}
          defaultOpen={pending.length > 0}
        >
          <Rows rows={rows} />
          {pending.map((d) => (
            <p key={`${d.list}:${d.line}`} className="text-[12.5px] text-amber-800">
              {d.line}
            </p>
          ))}
          {!pending.length && tab === 'checked' && agree && <SourceLine lead="Same as" what={agree === 'Keystone-K' || agree === 'Mekor Habracha' ? KOSHER_LIST_NAMES[p.on[0].list] : `${agree}’s lists`} url={p.on.length === 1 ? listOfName(p.on[0].list)?.url : undefined} />}
        </Box>
      )}
      <PlaceReads place={p} lists={lists} act={act} busy={busy || reading} onBusy={setBusy} onReadNow={onReadNow} defaultOpen={!findings.length && !pending.length} />
    </PlaceRow>
  )
}

/** A place a list has and the guide doesn't, drawn as the listing it would
 *  add: Add it, Edit, Leave it out. */
function NewPlaceRow({ place: n, categories, lists, act, onEdit }: { place: NewPlace; categories: readonly CategoryConfig[]; lists: readonly KosherListState[]; act: Act; onEdit: (f: KosherFinding, category: CategoryConfig) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const f = n.findings?.[0]
  const done = f ? act.settled.get(f.id) : undefined
  const category = categories.find((c) => c.id === (f?.category ?? 'restaurant'))
  const rows = category ? kosherRows(category, {}, f?.values ?? {}) : []
  const google = f ? googleLine(f.notes) : null
  const list = lists.find((l) => l.list === (f ? listOf(f) : n.on[0]?.list))

  async function decide(body: Record<string, unknown>, text: string) {
    if (!f) return
    setError(null)
    setBusy(true)
    try {
      await fetchJson(withCommunity(`/api/admin/submissions/${f.id}`, act.community), { method: 'PATCH', headers: { Authorization: `Bearer ${act.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'Could not save that.')
      act.onDone(f, text)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  const pill: { text: string; tone: Tone } = done ? { text: done, tone: 'grey' } : f ? { text: 'New', tone: 'amber' } : { text: n.filed === 'next' ? 'Not read yet' : 'New', tone: 'grey' }
  return (
    <PlaceRow name={n.name} pill={pill} back="Kosher certification">
      <Box key={done ? 'place-done' : 'place'} name="Place" pill={done ? { text: done, tone: 'grey' } : { text: 'New', tone: 'amber' }} defaultOpen={!done}>
        <BoxRows>
          <BoxRow name={f?.name || n.name} sub={f?.address || n.address || undefined} right={category?.label} mark={done ? 'same' : 'new'} />
        </BoxRows>
        {google && <p className="text-[12.5px] text-slate-500">{google}</p>}
        {n.archived && <p className="text-[12.5px] text-slate-500">The guide has it archived, as “{n.archived}”.</p>}
      </Box>
      {rows.length > 0 && (
        <Box key={done ? 'kosher-done' : 'kosher'} name="Kosher" pill={done ? { text: done, tone: 'grey' } : { text: 'New', tone: 'amber' }} defaultOpen={!done}>
          <Rows rows={rows} />
          {f && !done && category && (
            <BoxActions busy={busy} use="Add it" keep="Leave it out" onUse={() => void decide({ status: 'approved' }, `Added ${today()}`)} onEdit={() => onEdit(f, category)} onKeep={() => void decide({ status: 'rejected' }, `Left out ${today()}`)} />
          )}
          {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <SourceLine url={list?.url} what={list ? KOSHER_LIST_NAMES[list.list] : undefined} at={readOn(list) ?? f?.at ?? null} />
        </Box>
      )}
      {!f && n.filed === 'next' && <p className="text-sm text-slate-600">Suggested after tomorrow morning’s read, if Google says it’s open.</p>}
    </PlaceRow>
  )
}

/** The two lists at the top: each with its Reading switch, and Read them now. */
function Lists({ lists, busy, onAct, onReadNow }: { lists: readonly KosherListState[]; busy: string | null; onAct: (l: KosherListState, body: Record<string, unknown>) => void; onReadNow: () => void }) {
  return (
    <Box name="Lists" pill={{ text: `${lists.length} list${lists.length === 1 ? '' : 's'}`, tone: 'grey' }} defaultOpen testId="kosher-lists">
      <ul className="text-sm">
        {lists.map((l) => {
          const read = readOn(l)
          const on = !!l.watch?.active
          return (
            <li key={l.list} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 border-t border-slate-100 py-1.5 first:border-t-0" data-testid="kosher-list">
              <span className="min-w-0 font-semibold text-slate-900">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="block truncate hover:underline">
                  {shortUrl(l.url)}
                </a>
                <small className={`block text-[12.5px] font-normal ${l.error ? 'font-semibold text-red-700' : 'text-slate-500'}`}>
                  {KOSHER_LIST_NAMES[l.list]}
                  {l.error ? ` · didn’t load` : l.updated ? ` · updated ${listDay(l.updated)}` : ''}
                </small>
              </span>
              <span className="whitespace-nowrap text-right text-[12.5px] text-slate-500">{busy === l.list ? 'Reading…' : on && read ? `read ${day(read)}` : on ? 'not read yet' : ''}</span>
              <ReadingSwitch
                on={on}
                busy={busy !== null}
                onChange={(next) => onAct(l, l.watch ? { action: next ? 'resume' : 'pause', id: l.watch.id } : { action: 'add', purpose: 'kosher', url: l.url })}
              />
            </li>
          )
        })}
      </ul>
      {lists.some((l) => l.watch?.active) && (
        <div className="text-[13px]">
          <button type="button" disabled={busy !== null} onClick={onReadNow} className={LINK}>
            {busy ? 'Reading…' : 'Read them now'}
          </button>
        </div>
      )}
    </Box>
  )
}

export default function KosherJob({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<KosherLoaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // What became of each finding decided this visit.
  const [settled, setSettled] = useState<Settled>(new Map())
  // The tab showing.
  const [tab, setTab] = useState<Tab>('to_check')
  const [adding, setAdding] = useState<{ finding: KosherFinding; category: CategoryConfig } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const got = await fetchJson<KosherLoaded>(withCommunity(API, community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the kosher lists.')
      setData(got)
      const counts = tabCounts(got, new Map())
      setTab(TABS.find((t) => counts[t.key])?.key ?? 'to_check')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  async function post(body: Record<string, unknown>) {
    await fetchJson(
      withCommunity('/api/admin/watches', community),
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      'Could not do that.',
    )
  }

  async function listAct(l: KosherListState, body: Record<string, unknown>) {
    setSaveError(null)
    setBusy(l.list)
    try {
      await post(body)
      // A read files what differs: where each difference is now is the server's to say.
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  /** Read them now: each list that's read, then the page again. */
  async function readNow() {
    if (!data) return
    setSaveError(null)
    setBusy('all')
    try {
      for (const l of data.lists) if (l.watch?.active) await post({ action: 'check', id: l.watch.id })
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not read them.')
    } finally {
      setBusy(null)
    }
  }

  const backHref = `${adminBase(community)}/watches`
  if (error || !data) {
    const notice = error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : <p className="text-sm text-muted">Reading the kosher lists…</p>
    return <JobPage backHref={backHref} title="Kosher certification" intro="" needYou={0} total={0} noun="place" notice={notice} />
  }

  const categories = data.categories ?? []
  const act: Act = {
    token,
    community,
    settled,
    onDone: (f, text) => setSettled((m) => new Map(m).set(f.id, text)),
    onReload: () => void load(),
  }
  if (adding) {
    const { finding: f, category } = adding
    return (
      <ListingEditorScreen
        heading={f.name}
        category={category}
        preset={{ ...(f.values ?? {}), name: f.name, address: f.address ?? '' }}
        adminSave={{
          label: 'Add it',
          via: async ({ payload }) =>
            fetch(withCommunity(`/api/admin/submissions/${f.id}`, community), {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'approved', payload: { name: payload.name, address: payload.address ?? '', phone: payload.phone ?? '', details: payload.details ?? {}, ...(payload.geo ? { geo: payload.geo } : {}) } }),
            }),
          onSaved: () => {
            act.onDone(f, `Added ${today()}`)
            setAdding(null)
          },
        }}
        onClose={() => setAdding(null)}
      />
    )
  }

  // Each row in its tab as it is now: one decided moves straight away (the
  // user, Oct 22), a new place or a finding no place has leaving the page.
  const others = (data.others ?? []).filter((f) => !settled.has(f.id))
  const fresh = data.newPlaces.filter((n) => isNew(n, settled))
  const counts = tabCounts(data, settled)
  const updates = data.places.filter((p) => (p.findings ?? []).some((f) => !settled.has(f.id))).length + others.filter((f) => !settled.has(f.id)).length
  const reading = busy === 'all'

  return (
    <JobPage
      backHref={backHref}
      title="Kosher certification"
      intro=""
      needYou={updates}
      total={data.places.length}
      noun="place"
      say={{ head: kosherSay(updates) }}
      tabs={{ counts, active: tab, onChange: setTab, list: TABS }}
      notice={
        <>
          {!data.available && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Keeping a list here needs database migration 070.</p>}
          {saveError && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
          <Lists lists={data.lists} busy={busy} onAct={(l, body) => void listAct(l, body)} onReadNow={() => void readNow()} />
        </>
      }
    >
      {tab === 'new'
        ? fresh.map((n) => <NewPlaceRow key={n.name} place={n} categories={categories} lists={data.lists} act={act} onEdit={(finding, category) => setAdding({ finding, category })} />)
        : [
            ...data.places
              .filter((p) => placeTab(p, settled) === tab)
              .map((p) => (
                <KosherPlaceRow key={p.id} place={p} tab={tab} category={categories.find((c) => c.id === p.category)} lists={data.lists} act={act} reading={reading} onReadNow={() => void readNow()} />
              )),
            ...(tab === 'to_check'
              ? others.map((f) => (
                  <PlaceRow key={f.id} name={f.name} pill={settled.has(f.id) ? { text: settled.get(f.id)!, tone: 'grey' } : { text: updatesPill(1), tone: 'amber' }} back="Kosher certification">
                    <Box name={`From ${f.from}`} pill={{ text: 'Not matched to a place', tone: 'grey' }} defaultOpen>
                      <FindingCompare finding={f} token={token} community={community} jobName="Kosher certification" decided={settled.has(f.id) ? (settled.get(f.id)!.startsWith('Used') ? 'approved' : 'rejected') : undefined} onDecided={(d) => act.onDone(f, `${d === 'approved' ? 'Used' : 'Kept'} ${today()}`)} />
                    </Box>
                  </PlaceRow>
                ))
              : []),
          ]}
    </JobPage>
  )
}
