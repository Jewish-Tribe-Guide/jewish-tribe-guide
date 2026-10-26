'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { milesText } from '@/lib/geo'
import { boxPill, contactRows } from '@/lib/hospitalBoxes'
import { readContacts } from '@/lib/contacts'
import { hospitalSection } from '@/lib/watchJobs'
import { watchHealth, type Watch } from '@/lib/watches'
import type { Finding } from '@/lib/watchFindings'
import type { Decided } from '@/lib/watchFindingStore'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import { updatesPill } from '@/lib/dishProposal'
import BoxEditSheet, { type BoxEdit } from '@/components/resources/BoxEditSheet'
import { hospitalBoxEdit, withSave } from './findingEdits'
import FindingCompare, { type Decision } from './FindingCompare'
import { JobPage, day, jobTabs, needsYou, tabCounts, tabOf, type JobStatus, type JobTab } from './JobPage'
import { Box, BoxActions, BoxRow, BoxRows, LINK, PlaceRow, Reads, SourceLine, type ReadPage, type Tone } from './JobBoxes'

// ── The Watches tab's Hospitals page (the user, Oct 21) ─────────────────────
// Every hospital in the guide, each matched to its Refuah page by where it
// is on the map (refuahMatch.ts), and read every morning.
//
// Drawn on artifact Jf2Nvzj8dy1fWop5ZzVFmy (agreed Oct 21), on the pieces
// every job page shares (JobBoxes.tsx), the way Mikvah hours is: a hospital
// opened is its listing's own boxes (Who to call, Kosher food, A place to
// stay, Rides, Also). What Refuah says of a box comes first and open, its
// people marked: a new one highlighted, a changed phone beside what it
// was, one Refuah no longer has crossed out, "Not on Refuah" (only one
// that came from Refuah; one added by hand is kept, refuahWatch.ts). Then
// Use this / Edit / Keep the listing and "From Refuah · read Oct 21". A box
// Refuah agrees with is a closed "Same" box. Reads last: its Refuah link,
// with a × to stop reading it, Add a page, Read them now, Not on Refuah.

type Refuah = { id: string; name: string; street: string | null; url: string }
/** One of its listing's boxes of contacts, as the listing has it now. */
export type ListedBox = { title: string; keys: string[]; labels: string[]; now: Record<string, unknown> }
export type Hospital = {
  id: string
  name: string
  href: string
  watch: Watch | null
  notOnRefuah: boolean
  source: 'match' | 'hand' | null
  line: string
  refuah: Refuah | null
  nearby: (Refuah & { miles: number })[]
  /** What Refuah has that the listing doesn't, waiting to compare. */
  findings?: Finding[]
  /** When its last finding was decided, and how. */
  decided?: Decided | null
  boxes?: ListedBox[]
}
type Settled = ReadonlyMap<string, Decision>
type Loaded = { available: boolean; refuahError: string | null; hospitals: Hospital[] }
type BoxFinding = Finding & { section: string; values: Record<string, unknown> }

/** As the tabs count it: its findings not decided yet, this visit included. */
const stateOf = (h: Hospital, settled: Settled) => ({ ...h, waiting: (h.findings ?? []).filter((f) => !settled.has(f.id)).length })
const today = () => day(new Date().toISOString())
const doneText = (d: Decision) => `${d === 'approved' ? 'Used' : 'Kept'} ${today()}`
const loads = (w: Watch, now: number) => !['failing', 'stale'].includes(watchHealth(w, now).state)

/** How its last read compares with the listing. Nothing on Refuah is
 *  among Can't be read (the drawing), with its own pill. */
export function hospitalStatus(h: Hospital, now: number, settled: Settled = new Map()): JobStatus {
  const s = hospitalSection(stateOf(h, settled), now)
  if (s === 'off') return 'off'
  if (s === 'waiting') return 'not_read'
  if (s === 'to_check') return 'differs'
  if (s === 'checked') return 'same'
  if (s === 'nothing') return 'cant_read'
  return h.watch ? 'didnt_load' : 'cant_read'
}

/** The sentence over the page: does anything need you? `one`: the one
 *  hospital with updates has only one box of them. */
export function hospitalSay(statuses: readonly JobStatus[], one = false): { head: string } {
  const differs = statuses.filter((s) => s === 'differs').length
  const head = differs === 1 ? `1 hospital has ${one ? 'an update' : 'updates'} from Refuah.` : differs ? `${differs} hospitals have updates from Refuah.` : 'No hospital has an update from Refuah.'
  const unread = statuses.filter((s) => s === 'not_read').length
  return { head: unread ? `${head} ${unread} not read yet.` : head }
}

/** Its row's pill. */
function hospitalPill(h: Hospital, status: JobStatus, reading: boolean, settled: Settled): { text: string; tone: Tone } {
  const findings = h.findings ?? []
  const waiting = findings.filter((f) => !settled.has(f.id))
  if (status === 'off') return { text: h.notOnRefuah ? 'Not on Refuah' : 'Not read', tone: 'grey' }
  if (reading) return { text: 'Reading…', tone: 'grey' }
  if (findings.length && !waiting.length) return { text: `${findings.some((f) => settled.get(f.id) === 'approved') ? 'Used' : 'Kept'} ${today()}`, tone: 'grey' }
  if (waiting.length) return { text: updatesPill(waiting.length), tone: 'amber' }
  if (status === 'not_read') return { text: 'Not read yet', tone: 'grey' }
  if (status === 'didnt_load') return { text: 'Didn’t load', tone: 'red' }
  if (status === 'cant_read') return { text: h.watch ? 'Nothing on Refuah' : 'No Refuah page', tone: 'grey' }
  if (status === 'differs') return { text: 'In the queue', tone: 'amber' }
  return { text: 'Same', tone: 'green' }
}

/** A box's people, under each list's own name when it has more than one
 *  ("Pantry", "Food packages"). */
export function People({ box, next }: { box: ListedBox; next?: Record<string, unknown> }) {
  const many = box.keys.length > 1
  return (
    <>
      {box.keys.map((k, i) => {
        const rows = contactRows(box.now[k], next && k in next ? next[k] : box.now[k])
        if (many && !rows.length) return null
        return (
          <div key={k}>
            {many && <h4 className="pb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{box.labels[i]}</h4>}
            <BoxRows>
              {rows.length ? (
                rows.map((r, j) => (
                  <BoxRow
                    key={j}
                    name={r.name}
                    sub={r.sub || undefined}
                    // "was (845) 425-4070", as the drawing has it, not struck.
                    right={
                      <>
                        {r.right}
                        {r.was && <span className="block text-xs text-slate-500">was {r.was}</span>}
                      </>
                    }
                    mark={r.mark}
                    why={r.mark === 'gone' ? 'Not on Refuah' : undefined}
                  />
                ))
              ) : (
                <BoxRow name="None" />
              )}
            </BoxRows>
          </div>
        )
      })}
    </>
  )
}

/** Give its Refuah page: one of Refuah's hospitals near it, or its address. */
function ChoosePage({ hospital, busy, onChoose, onCancel }: { hospital: Hospital; busy: boolean; onChoose: (url: string) => void; onCancel: () => void }) {
  const choices = hospital.nearby.filter((r) => r.id !== hospital.refuah?.id)
  const [url, setUrl] = useState('')
  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      {choices.length > 0 && (
        <ul className="space-y-1">
          {choices.map((r) => (
            <li key={r.id}>
              <button type="button" disabled={busy} onClick={() => onChoose(r.url)} className="text-left text-sm text-primary hover:underline disabled:opacity-50">
                {r.name}
                {r.street ? `, ${r.street}` : ''} <span className="text-slate-500">· {milesText(r.miles)} away</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (url.trim()) onChoose(url.trim())
        }}
      >
        <label className="min-w-0 flex-1 basis-60 text-xs text-slate-600">
          Its page on Refuah
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="refuah.com/hospitals/…" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={busy || !url.trim()} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            Save and read
          </button>
          <button type="button" onClick={onCancel} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function HospitalRow({
  hospital: h,
  status,
  busy,
  reading,
  token,
  community,
  settled,
  now,
  onAct,
  onDecided,
}: {
  hospital: Hospital
  status: JobStatus
  busy: boolean
  reading: boolean
  token: string
  community: string
  settled: Settled
  now: number
  onAct: (body: Record<string, unknown>) => void
  onDecided: (f: Finding, d: Decision) => void
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<{ item: DirectoryResource; category: CategoryConfig; edit: BoxEdit } | null>(null)
  const off = status === 'off'
  const boxes = h.boxes ?? []
  const findings = h.findings ?? []
  const isBox = (f: Finding): f is BoxFinding => f.operation === 'update' && !!f.values && boxes.some((b) => b.title === f.section)
  const own = findings.filter(isBox)
  const others = findings.filter((f) => !isBox(f))
  const w = h.watch
  const c = w?.lastCheck
  const headers = { Authorization: `Bearer ${token}` }
  const boxOf = (f: BoxFinding) => boxes.find((b) => b.title === f.section)!
  const readAt = c?.at ?? w?.lastRunAt ?? null

  async function decide(f: Finding, body: Record<string, unknown>, d: Decision) {
    setError(null)
    setSaving(f.id)
    try {
      await fetchJson(withCommunity(`/api/admin/submissions/${f.id}`, community), { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'Could not save that.')
      onDecided(f, d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setSaving(null)
    }
  }

  /** Edit: the box's own editor, the one visitors use (a row a person,
   *  Add a person), filled with Refuah's version, saved straight to the
   *  listing. */
  async function edit(f: BoxFinding) {
    setError(null)
    try {
      const { item, category } = await fetchJson<{ item: DirectoryResource; category: CategoryConfig }>(withCommunity(`/api/admin/watches/hospitals?item=${h.id}`, community), { headers }, 'Could not open its box.')
      const fe = hospitalBoxEdit(f, item, category, boxOf(f))
      if (!fe) return
      setEditing({ item, category, edit: withSave(fe, { community, token, onSaved: () => (setEditing(null), onDecided(f, 'approved')) }) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open its box.')
    }
  }

  // Updates still to decide first, in the listing's order, then the ones
  // decided this visit.
  const order = (f: BoxFinding) => boxes.findIndex((b) => b.title === f.section)
  const ordered = [...own].sort((a, b) => Number(settled.has(a.id)) - Number(settled.has(b.id)) || order(a) - order(b))
  // Read, and Refuah agrees with the rest: each box with anything in it.
  const read = !!w && !off && loads(w, now) && (c?.result === 'agrees' || c?.result === 'differs')
  const same = read ? boxes.filter((b) => !own.some((f) => f.section === b.title) && b.keys.some((k) => readContacts(b.now[k]).length)) : []
  const shown = ordered.length + same.length + others.length

  const pages: ReadPage[] = w
    ? [
        {
          key: w.id,
          url: w.url,
          label: read ? 'Refuah link · every box' : 'Refuah link',
          right: off ? '' : !loads(w, now) ? 'didn’t load' : !w.lastRunAt || !c ? 'not read yet' : c.result === 'nothing' ? 'nothing on it' : `read ${day(c.at)}`,
          none: !read,
          onRemove: off ? undefined : () => onAct({ action: 'stop' }),
        },
      ]
    : []

  return (
    <PlaceRow name={h.name} pill={hospitalPill(h, status, reading, settled)} back="Hospitals">
      {ordered.map((f) => {
        const b = boxOf(f)
        const decided = settled.get(f.id)
        const rows = b.keys.flatMap((k) => contactRows(b.now[k], k in f.values ? f.values[k] : b.now[k]))
        return (
          <Box key={decided ? `${f.id}-done` : f.id} name={b.title} pill={decided ? { text: doneText(decided), tone: 'grey' } : { text: boxPill(rows), tone: 'amber' }} defaultOpen={!decided}>
            <People box={b} next={f.values} />
            {!decided && <BoxActions busy={busy || saving === f.id} onUse={() => void decide(f, { status: 'approved' }, 'approved')} onEdit={() => void edit(f)} onKeep={() => void decide(f, { status: 'rejected' }, 'rejected')} />}
            <SourceLine url={w?.url} what="Refuah" at={readAt ?? f.at} />
          </Box>
        )
      })}
      {others.map((f) => (
        <Box key={settled.has(f.id) ? `${f.id}-done` : f.id} name={`From ${f.from}`} pill={settled.has(f.id) ? { text: doneText(settled.get(f.id)!), tone: 'grey' } : { text: updatesPill(f.lines.length), tone: 'amber' }} defaultOpen={!settled.has(f.id)}>
          <FindingCompare finding={f} token={token} community={community} jobName="Hospitals" decided={settled.get(f.id)} onDecided={(d) => onDecided(f, d)} />
        </Box>
      ))}
      {same.map((b) => (
        <Box key={b.title} name={b.title} pill={{ text: 'Same', tone: 'green' }}>
          <People box={b} />
          <SourceLine lead="Same as" url={w!.url} what="Refuah" at={readAt} />
        </Box>
      ))}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <Reads
        on={!off}
        busy={busy}
        onSwitch={(on) => onAct({ action: on ? 'on' : 'off' })}
        pages={pages}
        pill={off ? 'Off' : pages.length ? undefined : 'No page'}
        defaultOpen={shown === 0}
        below={
          adding && (
            <ChoosePage
              hospital={h}
              busy={busy}
              onChoose={(url) => {
                setAdding(false)
                onAct({ action: 'choose', url })
              }}
              onCancel={() => setAdding(false)}
            />
          )
        }
        links={
          <>
            {!adding && (
              <button type="button" disabled={busy} onClick={() => setAdding(true)} className={LINK}>
                Add a page
              </button>
            )}
            {w && !off && (
              <button type="button" disabled={busy} onClick={() => onAct({ action: 'check', id: w.id })} className={LINK}>
                {busy ? 'Reading…' : 'Read them now'}
              </button>
            )}
            {status === 'cant_read' && (
              <button type="button" disabled={busy} onClick={() => onAct({ action: 'none' })} className={LINK}>
                Not on Refuah
              </button>
            )}
            <a href={h.href} target="_blank" rel="noopener noreferrer" className={LINK}>
              Open its listing
            </a>
          </>
        }
      />
      {editing && <BoxEditSheet item={editing.item} category={editing.category} edit={editing.edit} onClose={() => setEditing(null)} />}
    </PlaceRow>
  )
}

export default function HospitalsJob({ token }: { token: string }) {
  const community = useCommunitySlug()
  const api = '/api/admin/watches/hospitals'
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  // Findings updated or skipped this visit.
  const [settled, setSettled] = useState<Settled>(new Map())
  // The tab showing.
  const [tab, setTab] = useState<JobTab>('to_check')

  const load = useCallback(async () => {
    setError(null)
    try {
      const got = await fetchJson<Loaded>(withCommunity(api, community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the hospitals.')
      const t = Date.now()
      const { rows, first } = jobTabs(got.hospitals, (h) => hospitalStatus(h, t), (h) => h.name)
      setData({ ...got, hospitals: rows })
      setTab(first)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  async function act(h: Hospital, body: Record<string, unknown>) {
    setSaveError(null)
    setBusy(h.id)
    try {
      // Read them now is the Watches tab's own; the rest are this page's.
      const path = body.action === 'check' ? '/api/admin/watches' : api
      const res = await fetchJson<{ watch?: Watch | null; notOnRefuah?: boolean }>(
        withCommunity(path, community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ resourceId: h.id, ...body }) },
        'Could not do that.',
      )
      if (body.action === 'choose' || (body.action === 'on' && !h.watch)) {
        // A new page: where it came from and what it is are the server's to say.
        await load()
        return
      }
      setData((d) => d && { ...d, hospitals: d.hospitals.map((x) => (x.id === h.id ? { ...x, watch: res.watch === undefined ? x.watch : res.watch, notOnRefuah: res.notOnRefuah ?? x.notOnRefuah } : x)) })
      // A read that filed something: fetch it, to compare here.
      if (res.watch?.lastCheck?.queue === 'filed') {
        const fresh = await fetchJson<Loaded>(withCommunity(api, community), { headers: { Authorization: `Bearer ${token}` } }, '')
        const got = fresh.hospitals.find((x) => x.id === h.id)
        if (got) setData((d) => d && { ...d, hospitals: d.hospitals.map((x) => (x.id === h.id ? { ...x, findings: got.findings, decided: got.decided, boxes: got.boxes } : x)) })
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  const backHref = `${adminBase(community)}/watches`
  if (error || !data) {
    const notice = error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : <p className="text-sm text-muted">Loading hospitals…</p>
    return <JobPage backHref={backHref} title="Hospitals" intro="" needYou={0} total={0} noun="hospital" notice={notice} />
  }

  const statusOf = (h: Hospital) => hospitalStatus(h, now, settled)
  // Updated or kept, it says so where it was.
  const decide = (h: Hospital, f: Finding, d: Decision) => {
    setSettled((m) => new Map(m).set(f.id, d))
    setData((x) => x && { ...x, hospitals: x.hospitals.map((y) => (y.id === h.id ? { ...y, decided: { at: new Date().toISOString(), status: d } } : y)) })
  }
  const counts = tabCounts(data.hospitals.map(statusOf))
  const differing = data.hospitals.filter((h) => statusOf(h) === 'differs')
  return (
    <JobPage
      backHref={backHref}
      title="Hospitals"
      intro=""
      needYou={data.hospitals.filter((h) => needsYou(statusOf(h))).length}
      total={data.hospitals.length}
      noun="hospital"
      say={hospitalSay(data.hospitals.map(statusOf), differing.every((h) => (h.findings ?? []).filter((f) => !settled.has(f.id)).length === 1))}
      tabs={{ counts, active: tab, onChange: setTab }}
      notice={
        <>
          {!data.available && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Reading Refuah needs database migration 070.</p>}
          {data.refuahError && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Refuah couldn’t be reached just now ({data.refuahError}).</p>}
          {saveError && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
        </>
      }
    >
      {data.hospitals
        .filter((h) => tabOf(statusOf(h)) === tab)
        .map((h) => {
          const status = statusOf(h)
          return (
            <HospitalRow
              key={h.id}
              hospital={h}
              status={status}
              busy={busy === h.id}
              reading={busy === h.id && status === 'not_read'}
              token={token}
              community={community}
              settled={settled}
              now={now}
              onAct={(body) => void act(h, body)}
              onDecided={(f, d) => decide(h, f, d)}
            />
          )
        })}
    </JobPage>
  )
}
