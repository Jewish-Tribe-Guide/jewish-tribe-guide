'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { hoursDidntLoad, hoursSection, jobWords, type HoursSection, type PageJob } from '@/lib/hoursJob'
import type { Watch } from '@/lib/watches'
import type { Finding } from '@/lib/watchFindings'
import type { Decided } from '@/lib/watchFindingStore'
import type { Decision } from './FindingCompare'
import { JobPage, jobTabs, needsYou, tabCounts, tabOf, type JobStatus, type JobTab } from './JobPage'
import { ShulRow } from './TimesProposal'
import { MikvahRow } from './MikvahHours'
import type { ListedContact } from './ContactBoxes'

// ── The Watches tab's Mikvah hours and Shul times pages (the user, Oct 21) ──
// Every place whose category has named weekly hours (a mikvah's women's,
// men's and keilim hours), or davening times (`job="times"`), read every
// morning from the pages on its own website that give them: found by the
// morning's search (hoursJobRun.ts), or added here by hand. On the one
// page every job has (JobPage.tsx), in its tabs: each place on a row, with
// how its last read compares with the listing, the page it read, and Check
// now; opened,
// what each page read, and ways to use a different page, stop one, or add
// one.
//
// What a page has that the listing doesn't waits on its place's row,
// beside what the listing says (FindingCompare, step 6, Oct 21), not in the
// moderation queue. "The queue keeps what people send in." Each place as
// its listing's own boxes: Shul times' parts (TimesProposal.tsx, redrawn
// Oct 21), a mikvah's sections (MikvahHours.tsx, drawn Oct 21).
//
// A page not read yet is read as soon as the page loads (the user, Oct 21:
// no "Not read yet"), a few at a time, so the rate limit is left for the
// admin's own Check now.

type Page = { watch: Watch; source: string }
export type HoursPlace = {
  id: string
  name: string
  href: string
  website: string | null
  pages: Page[]
  /** Pages an admin stopped: never read, and never found again. */
  stopped?: Page[]
  off: boolean
  offSince: string | null
  /** Why a place with no page has nothing to read. */
  reason: string | null
  /** What its pages (or a shul's newsletter) found, waiting to compare. */
  findings?: Finding[]
  /** When its last finding was decided, and how. */
  decided?: Decided | null
  /** A shul's newsletters, read as part of it (Shul times only). */
  newsletters?: Watch[]
  fields: string[]
  /** Its phone and email as listed, less what Google keeps, for its
   *  Phone or Contact box (ContactBoxes.tsx). */
  contact?: ListedContact | null
}
type Loaded = { available: boolean; name: string; places: HoursPlace[] }
// read: its pages to read next, one request each (all in one passed the
// host's 60s, Oct 22).
type Saved = { pages?: Page[]; stopped?: Page[]; off?: boolean; reason?: string | null; read?: string[] }

const listed = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
type Settled = ReadonlyMap<string, Decision>
/** Its findings not decided yet, this visit included. */
const waitingOf = (p: HoursPlace, settled: Settled) => (p.findings ?? []).filter((f) => !settled.has(f.id))
const asPlace = (p: HoursPlace, settled: Settled) => ({ pages: p.pages.map((x) => x.watch), off: p.off, waiting: waitingOf(p, settled).length, decidedAt: p.decided?.at, newsletters: p.newsletters })
/** Pages not read yet, read on their own when the page loads, at most. */
export const READ_ON_LOAD = 5

/** The sentence over Shul times and Mikvah hours: does anything need
 *  you? `one`: the one place with updates has only one ("1 mikvah has an
 *  update from its website."). */
export function shulSay(statuses: readonly JobStatus[], noun = 'shul', one = false): { head: string } {
  const n = (s: JobStatus) => statuses.filter((x) => x === s).length
  const differs = n('differs')
  const head = differs === 1 ? `1 ${noun} has ${one ? 'an update' : 'updates'} from its website.` : differs ? `${differs} ${noun}s have updates from their websites.` : `No ${noun}’s website has an update.`
  return { head: n('not_read') ? `${head} ${n('not_read')} not read yet.` : head }
}

/** How its last read compares with the listing, for its row's pill. */
export function hoursStatus(p: HoursPlace, section: HoursSection, now: number, settled: Settled = new Map()): JobStatus {
  if (section === 'off') return 'off'
  if (section === 'waiting') return 'not_read'
  if (section === 'checked') return 'same'
  if (section === 'cant_read') return hoursDidntLoad(asPlace(p, settled), now) ? 'didnt_load' : 'cant_read'
  return waitingOf(p, settled).length || p.pages.some((x) => x.watch.lastCheck?.result === 'differs') ? 'differs' : 'unsure'
}

export default function HoursJob({ token, job = 'hours' }: { token: string; job?: PageJob }) {
  const community = useCommunitySlug()
  const words = jobWords(job)
  const api = `/api/admin/watches/hours${job === 'times' ? '?job=times' : ''}`
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // The places being acted on, or read on their own.
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  // How far through its pages a place being read is: "Reading 2 of 4…".
  const [progress, setProgress] = useState<ReadonlyMap<string, string>>(new Map())
  const [now] = useState(() => Date.now())
  // Findings updated or skipped this visit.
  const [settled, setSettled] = useState<Settled>(new Map())
  // The tab showing.
  const [tab, setTab] = useState<JobTab>('to_check')

  const load = useCallback(async () => {
    setError(null)
    try {
      const got = await fetchJson<Loaded>(withCommunity(api, community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the places.')
      const t = Date.now()
      const { rows, first } = jobTabs(got.places, (p) => hoursStatus(p, hoursSection(asPlace(p, new Map()), t), t), (p) => p.name)
      setData({ ...got, places: rows })
      setTab(first)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community, api])
  useLoadOnMount(load)

  async function act(p: HoursPlace, body: Record<string, unknown>) {
    setSaveError(null)
    setBusy((b) => new Set(b).add(p.id))
    const post = (b: Record<string, unknown>) =>
      fetchJson<Saved>(
        withCommunity(api, community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ resourceId: p.id, ...b }) },
        'Could not do that.',
      )
    const apply = (res: Saved) => {
      const next = (x: HoursPlace): HoursPlace => ({
        ...x,
        pages: res.pages ?? x.pages,
        stopped: res.stopped ?? x.stopped,
        off: res.off ?? x.off,
        reason: res.reason !== undefined ? res.reason : res.pages?.length ? null : x.reason,
      })
      setData((d) => d && { ...d, places: d.places.map((x) => (x.id === p.id ? next(x) : x)) })
    }
    try {
      const res = await post(body)
      apply(res)
      // Then its pages, one request each and in order, so each read sees
      // what the one before it filed. One that fails doesn't stop the rest.
      let pages = res.pages ?? []
      let failed: string | null = null
      const ids = res.read ?? []
      for (const [i, id] of ids.entries()) {
        setProgress((m) => new Map(m).set(p.id, `Reading ${i + 1} of ${ids.length}…`))
        try {
          const one = await post({ action: 'check', id })
          apply(one)
          pages = one.pages ?? pages
        } catch (err) {
          failed = err instanceof Error ? err.message : 'Could not read it.'
        }
      }
      if (failed) setSaveError(failed)
      // A read that filed something: fetch it, to compare here. Without the
      // website search (?counts), which only places with no page need.
      if (pages.some((x) => x.watch.lastCheck?.queue === 'filed')) {
        const fresh = await fetchJson<Loaded>(withCommunity(`${api}${api.includes('?') ? '&' : '?'}counts`, community), { headers: { Authorization: `Bearer ${token}` } }, '')
        const got = fresh.places.find((x) => x.id === p.id)
        if (got) setData((d) => d && { ...d, places: d.places.map((x) => (x.id === p.id ? { ...x, findings: got.findings, decided: got.decided } : x)) })
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy((b) => {
        const next = new Set(b)
        next.delete(p.id)
        return next
      })
      setProgress((m) => {
        const next = new Map(m)
        next.delete(p.id)
        return next
      })
    }
  }

  // Pages not read yet, read now, one place after another.
  const readOnLoad = useRef(false)
  useEffect(() => {
    if (!data || readOnLoad.current) return
    readOnLoad.current = true
    const unread = data.places.filter((p) => hoursSection(asPlace(p, new Map()), now) === 'waiting' && p.pages.some((x) => x.watch.active)).slice(0, READ_ON_LOAD)
    void (async () => {
      for (const p of unread) await act(p, { action: 'check' })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const backHref = `${adminBase(community)}/watches`
  // "Mikvah hours": a mikvah.
  const noun = job === 'times' ? 'shul' : (data?.name.replace(/ hours$/i, '').toLowerCase() ?? 'place')
  if (error || !data) {
    const notice = error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : <p className="text-sm text-muted">Loading places…</p>
    return <JobPage backHref={backHref} title={job === 'times' ? 'Shul times' : 'Hours'} intro="" needYou={0} total={0} noun={noun} notice={notice} />
  }

  const statusOf = (p: HoursPlace) => hoursStatus(p, hoursSection(asPlace(p, settled), now), now, settled)
  // Updated or skipped, it says so where it was.
  const decide = (p: HoursPlace, f: Finding, d: Decision) => {
    setSettled((m) => new Map(m).set(f.id, d))
    setData((x) => x && { ...x, places: x.places.map((y) => (y.id === p.id ? { ...y, decided: { at: new Date().toISOString(), status: d } } : y)) })
  }
  // What's read, said once above when it's the same for every place.
  const counts = tabCounts(data.places.map(statusOf))
  const fields = data.places[0]?.fields ?? []
  const sameFields = data.places.every((p) => p.fields.join('|') === fields.join('|'))
  return (
    <JobPage
      backHref={backHref}
      title={data.name}
      intro={`${sameFields && fields.length ? listed(fields) : 'What it reads'}, read every morning from each ${noun}’s own website. Check now reads one straight away; open a row to see what it read.`}
      needYou={data.places.filter((p) => needsYou(statusOf(p))).length}
      total={data.places.length}
      noun={noun}
      say={job === 'times' ? shulSay(data.places.map(statusOf)) : shulSay(data.places.map(statusOf), noun, data.places.filter((p) => statusOf(p) === 'differs').every((p) => waitingOf(p, settled).length === 1))}
      tabs={{ counts, active: tab, onChange: setTab }}
      notice={
        <>
          {!data.available && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Reading websites needs database migration 070.</p>}
          {saveError && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
        </>
      }
    >
      {data.places.filter((p) => tabOf(statusOf(p)) === tab).map((p) => {
        const status = statusOf(p)
        if (job === 'times') {
          return (
            <ShulRow
              key={p.id}
              place={p}
              status={status}
              busy={busy.has(p.id)}
              reading={busy.has(p.id) && status === 'not_read'}
              progress={progress.get(p.id)}
              token={token}
              community={community}
              jobName={data.name}
              settled={settled}
              words={words}
              now={now}
              onAct={(body) => void act(p, body)}
              onDecided={(f, d) => decide(p, f, d)}
            />
          )
        }
        return (
          <MikvahRow
            key={p.id}
            place={p}
            status={status}
            busy={busy.has(p.id)}
            reading={busy.has(p.id) && status === 'not_read'}
            progress={progress.get(p.id)}
            token={token}
            community={community}
            jobName={data.name}
            settled={settled}
            words={words}
            now={now}
            onAct={(body) => void act(p, body)}
            onDecided={(f, d) => decide(p, f, d)}
          />
        )
      })}
    </JobPage>
  )
}
