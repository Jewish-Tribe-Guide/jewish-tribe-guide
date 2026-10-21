'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { hoursDidntLoad, hoursSection, jobWords, type HoursSection, type PageJob } from '@/lib/hoursJob'
import { watchHealth, type Watch } from '@/lib/watches'
import type { Finding } from '@/lib/watchFindings'
import type { Decided } from '@/lib/watchFindingStore'
import FindingCompare, { type Decision } from './FindingCompare'
import { BUTTON, GivePage, JobPage, JobRow, SourceCard, day, jobTabs, needsYou, shortUrl, type JobStatus, type JobTab } from './JobPage'

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
// moderation queue. "The queue keeps what people send in."

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
  fields: string[]
}
type Loaded = { available: boolean; name: string; places: HoursPlace[] }
type Saved = { pages?: Page[]; stopped?: Page[]; off?: boolean; reason?: string | null }
type Words = ReturnType<typeof jobWords>

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const listed = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
type Settled = ReadonlyMap<string, Decision>
/** Its findings not decided yet, this visit included. */
const waitingOf = (p: HoursPlace, settled: Settled) => (p.findings ?? []).filter((f) => !settled.has(f.id))
const asPlace = (p: HoursPlace, settled: Settled) => ({ pages: p.pages.map((x) => x.watch), off: p.off, waiting: waitingOf(p, settled).length })
const loads = (w: Watch, now: number) => !['failing', 'stale'].includes(watchHealth(w, now).state)
const isRead = (w: Watch) => !!(w.lastRunAt && w.lastCheck)

/** How its last read compares with the listing, for its row's pill. */
export function hoursStatus(p: HoursPlace, section: HoursSection, now: number, settled: Settled = new Map()): JobStatus {
  if (section === 'off') return 'off'
  if (section === 'waiting') return 'not_read'
  if (section === 'checked') return 'same'
  if (section === 'cant_read') return hoursDidntLoad(asPlace(p, settled), now) ? 'didnt_load' : 'cant_read'
  return waitingOf(p, settled).length || p.pages.some((x) => x.watch.lastCheck?.result === 'differs') ? 'differs' : 'unsure'
}

/** What one page's last read found, in a line. */
function pageLine(w: Watch, now: number, words: Words): string {
  if (!w.active) return 'Not read: turned off.'
  if (!loads(w, now)) return `Didn’t load${w.lastError ? `: ${w.lastError}` : ''}.`
  const c = w.lastCheck
  if (!w.lastRunAt || !c) return 'Not read yet.'
  const when = `Read ${day(c.at)}: `
  if (c.result === 'nothing' || c.result === 'unreadable') return `${when}${words.none} on it.`
  if (c.result === 'differs') return `${when}${c.differences.length ? plural(c.differences.length, 'difference') : 'differences'} from the listing.`
  if (c.result === 'unsure') return `${when}${words.unsure}.`
  return `${when}the same as the listing.`
}

/** Where it reads from and when, then anything else it needs to say. */
function rowLines(p: HoursPlace, status: JobStatus, now: number, words: Words): string[] {
  const live = p.pages.filter((x) => x.watch.active)
  if (status === 'off') return [p.pages.length ? 'Turned off: not read.' : `${words.noneOnline}: not read.`]
  if (!live.length) return [p.reason ?? 'No page to read.']
  const at = live.map((x) => x.watch.lastCheck?.at).filter((a) => a != null).sort().at(-1)
  const from = `From ${shortUrl(live[0].watch.url)}${live.length > 1 ? ` and ${plural(live.length - 1, 'other page')}` : ''}`
  const lines = [`${from} · ${at ? `read ${day(at)}` : 'not read yet'}`]
  if (status === 'didnt_load') lines.push(pageLine(live.find((x) => !loads(x.watch, now))!.watch, now, words))
  else if (status === 'cant_read') lines.push(`${words.none[0].toUpperCase()}${words.none.slice(1)} on ${live.length === 1 ? 'it' : 'them'}.`)
  // Not filed here: someone's suggestion for it waits in the moderation queue.
  if (status === 'differs' && !p.findings?.length && live.some((x) => x.watch.lastCheck?.queue === 'waiting')) lines.push('Someone’s suggestion for it waits in the moderation queue.')
  if (status === 'same' && p.decided && live.some((x) => x.watch.lastCheck?.result === 'differs')) {
    lines.push(p.decided.status === 'approved' ? `Updated on the listing ${day(p.decided.at)}.` : `Skipped ${day(p.decided.at)}: shown again if its page changes.`)
  }
  return lines
}

function Opened({ place: p, status, now, busy, words, onAct }: { place: HoursPlace; status: JobStatus; now: number; busy: boolean; words: Words; onAct: (body: Record<string, unknown>) => void }) {
  // Nothing to read: the way out is to give it a page, so the form is open.
  const nothing = status === 'cant_read' || (status !== 'off' && !p.pages.some((x) => x.watch.active))
  const [adding, setAdding] = useState(nothing)
  const [replacing, setReplacing] = useState<string | null>(null)
  const stopped = p.stopped ?? []
  return (
    <>
      {p.pages.map(({ watch: w, source }) => {
        const c = w.lastCheck
        const shown = c && isRead(w) && c.result !== 'nothing' && c.result !== 'unreadable'
        return (
          <div key={w.id} className="space-y-2">
            <SourceCard
              url={w.url}
              how={source}
              result={pageLine(w, now, words)}
              differences={shown ? [...c.differences, ...(c.unread ?? [])] : []}
              // What the reader read, whatever it made of it (the user,
              // Oct 21: "we should be able to see what they're reading").
              read={c && isRead(w) ? c.read : []}
              actions={
                w.active && (
                  <>
                    <button type="button" disabled={busy} onClick={() => setReplacing(replacing === w.id ? null : w.id)} className={BUTTON}>
                      Use a different page
                    </button>
                    <button type="button" disabled={busy} onClick={() => onAct({ action: 'stop', id: w.id })} className={BUTTON}>
                      Stop reading this page
                    </button>
                  </>
                )
              }
            />
            {replacing === w.id && (
              <GivePage
                label={`Instead of ${shortUrl(w.url)}`}
                placeholder={words.placeholder}
                busy={busy}
                onGive={(url) => {
                  setReplacing(null)
                  onAct({ action: 'give', url, replaces: w.id })
                }}
                onCancel={() => setReplacing(null)}
              />
            )}
          </div>
        )
      })}
      {stopped.length > 0 && (
        <ul className="space-y-1" aria-label="Stopped pages">
          {stopped.map(({ watch: w }) => (
            <li key={w.id} className="flex flex-wrap items-center gap-2 text-sm text-slate-600" data-testid="hours-stopped">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                Stopped, not read:{' '}
                <a href={w.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  {shortUrl(w.url)}
                </a>
              </span>
              <button type="button" disabled={busy} onClick={() => onAct({ action: 'again', id: w.id })} className={BUTTON}>
                Read it again
              </button>
            </li>
          ))}
        </ul>
      )}
      {status !== 'off' && adding && (
        <GivePage
          label={words.pageLabel}
          placeholder={words.placeholder}
          busy={busy}
          onGive={(url) => {
            if (!nothing) setAdding(false)
            onAct({ action: 'give', url })
          }}
          onCancel={nothing ? undefined : () => setAdding(false)}
        />
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {status !== 'off' && !adding && (
          <button type="button" disabled={busy} onClick={() => setAdding(true)} className={BUTTON}>
            Add a page
          </button>
        )}
        {status !== 'off' && (
          <button type="button" disabled={busy} onClick={() => onAct({ action: 'off' })} className={BUTTON}>
            {nothing ? words.noneOnline : 'Turn off this place'}
          </button>
        )}
        <a href={p.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
          Open its listing
        </a>
        {p.website && (
          <a href={p.website} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
            Open its website
          </a>
        )}
      </div>
    </>
  )
}

export default function HoursJob({ token, job = 'hours' }: { token: string; job?: PageJob }) {
  const community = useCommunitySlug()
  const words = jobWords(job)
  const api = `/api/admin/watches/hours${job === 'times' ? '?job=times' : ''}`
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  // Findings updated or skipped this visit.
  const [settled, setSettled] = useState<Settled>(new Map())
  // Each place's tab, as it was when the page loaded, and the one showing.
  const [tabOf, setTabOf] = useState<ReadonlyMap<string, JobTab>>(new Map())
  const [tab, setTab] = useState<JobTab>('to_check')

  const load = useCallback(async () => {
    setError(null)
    try {
      const got = await fetchJson<Loaded>(withCommunity(api, community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the places.')
      // In its tab for the whole visit: a row acted on stays where it is.
      const t = Date.now()
      const { rows, tabs, first } = jobTabs(got.places, (p) => hoursStatus(p, hoursSection(asPlace(p, new Map()), t), t), (p) => p.name)
      setData({ ...got, places: rows })
      setTabOf(tabs)
      setTab(first)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community, api])
  useLoadOnMount(load)

  async function act(p: HoursPlace, body: Record<string, unknown>) {
    setSaveError(null)
    setBusy(p.id)
    try {
      const res = await fetchJson<Saved>(
        withCommunity(api, community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ resourceId: p.id, ...body }) },
        'Could not do that.',
      )
      const next = (x: HoursPlace): HoursPlace => ({
        ...x,
        pages: res.pages ?? x.pages,
        stopped: res.stopped ?? x.stopped,
        off: res.off ?? x.off,
        reason: res.reason !== undefined ? res.reason : res.pages?.length ? null : x.reason,
      })
      setData((d) => d && { ...d, places: d.places.map((x) => (x.id === p.id ? next(x) : x)) })
      // A read that filed something: fetch it, to compare here. Without the
      // website search (?counts), which only places with no page need.
      if ((res.pages ?? []).some((x) => x.watch.lastCheck?.queue === 'filed')) {
        const fresh = await fetchJson<Loaded>(withCommunity(`${api}${api.includes('?') ? '&' : '?'}counts`, community), { headers: { Authorization: `Bearer ${token}` } }, '')
        const got = fresh.places.find((x) => x.id === p.id)
        if (got) setData((d) => d && { ...d, places: d.places.map((x) => (x.id === p.id ? { ...x, findings: got.findings, decided: got.decided } : x)) })
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  const backHref = `${adminBase(community)}/watches`
  const noun = job === 'times' ? 'shul' : 'place'
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
  const counts = { to_check: 0, cant_read: 0, not_read: 0, checked: 0, off: 0 }
  for (const p of data.places) counts[tabOf.get(p.id) ?? 'to_check']++
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
      tabs={{ counts, active: tab, onChange: setTab }}
      notice={
        <>
          {!data.available && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Reading websites needs database migration 070.</p>}
          {saveError && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
        </>
      }
    >
      {data.places.filter((p) => (tabOf.get(p.id) ?? 'to_check') === tab).map((p) => {
        const status = statusOf(p)
        const findings = p.findings ?? []
        return (
          <JobRow
            key={p.id}
            name={p.name}
            status={status}
            lines={[...(sameFields || !p.fields.length ? [] : [p.fields.join(' · ')]), ...rowLines(p, status, now, words)]}
            check={{ label: status === 'off' ? 'Turn back on' : 'Check now', busy: busy === p.id, onClick: () => void act(p, { action: status === 'off' ? 'on' : 'check' }) }}
            below={
              findings.length > 0 && (
                <ul className="space-y-2">
                  {findings.map((f) => (
                    <li key={f.id}>
                      <FindingCompare finding={f} token={token} community={community} jobName={data.name} decided={settled.get(f.id)} onDecided={(d) => decide(p, f, d)} />
                    </li>
                  ))}
                </ul>
              )
            }
          >
            <Opened place={p} status={status} now={now} busy={busy === p.id} words={words} onAct={(body) => void act(p, body)} />
          </JobRow>
        )
      })}
    </JobPage>
  )
}
