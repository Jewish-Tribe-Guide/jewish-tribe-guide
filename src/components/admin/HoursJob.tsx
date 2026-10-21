'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { hoursCounts, hoursSection, jobWords, type HoursSection, type PageJob } from '@/lib/hoursJob'
import { watchHealth, type Watch } from '@/lib/watches'
import type { Finding } from '@/lib/watchFindings'
import type { Decided } from '@/lib/watchFindingStore'
import CollapsibleSection from './CollapsibleSection'
import FindingCompare, { type Decision } from './FindingCompare'

// ── The Watches tab's Mikvah hours and Shul times pages (the user, Oct 21) ──
// Every place whose category has named weekly hours (a mikvah's women's,
// men's and keilim hours), read every morning from the pages on its own
// website that give them: found by the morning's search (hoursJobRun.ts),
// or given here by hand. Grouped by what the last reads found, what needs
// the admin first. One that can't be read says why, and can be given its
// hours page or said to have no hours online; any can be turned off and
// back on.
//
// The Shul times page is this one too (`job="times"`, Oct 21), for every
// place with davening times. Opened, each page says what it read, so an
// admin can see the reader's work; any page can be stopped (and stays
// stopped) or another given, and the place's website is a tap away to see
// what the reader missed.
//
// What a page has that the listing doesn't waits here, on its place's row,
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
  reason: string | null
  /** What its pages (or a shul's newsletter) found, waiting to compare. */
  findings?: Finding[]
  /** When its last finding was decided, and how. */
  decided?: Decided | null
  fields: string[]
  /** Pages found on its website just now, not watched yet. */
  found?: boolean
}
type Loaded = { available: boolean; name: string; places: HoursPlace[] }
type Saved = { pages?: Page[]; stopped?: Page[]; off?: boolean; reason?: string; watch?: Watch }
type Words = ReturnType<typeof jobWords>

const BUTTON = 'rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const INPUT = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm'

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const listed = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
type Settled = ReadonlyMap<string, Decision>
/** Its findings not decided yet, this visit included. */
const waitingOf = (p: HoursPlace, settled: Settled) => (p.findings ?? []).filter((f) => !settled.has(f.id))
const asPlace = (p: HoursPlace, settled: Settled) => ({ pages: p.pages.map((x) => x.watch), off: p.off, found: p.found, waiting: waitingOf(p, settled).length })

/** A page's address without its scheme, for its link. */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}

/** What one page's last read found, in a line. */
function pageLine(w: Watch, now: number, words: Words): string {
  if (!w.active) return 'Not read: turned off.'
  const state = watchHealth(w, now).state
  if (state === 'failing' || state === 'stale') return `Didn’t load${w.lastError ? `: ${w.lastError}` : ''}.`
  const c = w.lastCheck
  if (!w.lastRunAt || !c) return 'Not read yet. Read on a coming morning, or Check now.'
  const when = `Read ${day(c.at)}: `
  if (c.result === 'nothing' || c.result === 'unreadable') return `${when}${words.none} on it.`
  // Whether it's in the moderation queue is the place's line to say.
  if (c.result === 'differs') return `${when}${c.differences.length ? plural(c.differences.length, 'difference') : 'differences'} from the listing.`
  if (c.result === 'unsure') return `${when}${words.unsure}.`
  return `${when}as on the listing.`
}

/** What the place's pages found, together, in a line. */
function placeLine(p: HoursPlace, section: HoursSection, words: Words): string | null {
  if (section === 'off') return p.pages.length ? 'Turned off: not read.' : `${words.noneOnline}: not read.`
  if (section === 'cant_read') return p.reason
  if (section === 'waiting') return p.pages.length ? 'Not read yet. Read on a coming morning.' : p.reason
  const checks = p.pages.map((x) => x.watch.lastCheck).filter((c) => c != null)
  const at = checks.map((c) => c.at).sort().at(-1)
  const when = at ? `Read ${day(at)}: ` : ''
  if (section === 'to_check') {
    const n = checks.reduce((sum, c) => sum + c.differences.length, 0)
    // Not filed: someone's suggestion for it waits in the queue already.
    const visitor = !p.findings?.length && checks.some((c) => c.queue === 'waiting')
    const what = n ? `${plural(n, 'difference')} from the listing` : p.findings?.length ? 'differs from the listing' : 'something to check from the listing'
    return `${when}${what}${visitor ? '. Not shown here: someone’s suggestion for it waits in the moderation queue' : ''}.`
  }
  // Decided here, and its pages still say what they said.
  if (p.decided && checks.some((c) => c.result === 'differs')) {
    return p.decided.status === 'approved' ? `Updated on the listing ${day(p.decided.at)}.` : `Skipped ${day(p.decided.at)}: shown again if its page changes.`
  }
  return `${when}${words.same}.`
}

function GivePage({ busy, words, onGive, onCancel }: { busy: boolean; words: Words; onGive: (url: string) => void; onCancel?: () => void }) {
  const [url, setUrl] = useState('')
  return (
    <form
      className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (url.trim()) onGive(url.trim())
      }}
    >
      <label className="min-w-0 flex-1 text-xs text-slate-600">
        {words.pageLabel}
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={words.placeholder} className={`mt-1 ${INPUT}`} />
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" disabled={busy || !url.trim()} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          Save and read
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={BUTTON}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

function PageRow({ page: { watch: w, source }, now, busy, words, onAct }: { page: Page; now: number; busy: boolean; words: Words; onAct: (body: Record<string, unknown>) => void }) {
  const c = w.lastCheck
  const lines = c && c.result !== 'nothing' && c.result !== 'unreadable' ? [...c.differences, ...(c.unread ?? [])] : []
  // What the reader read, whatever it made of it (the user, Oct 21: "we
  // should be able to see what they're reading").
  const read = c && w.lastRunAt ? c.read : []
  return (
    <li className="space-y-1 rounded-md border border-slate-200 p-3" data-testid="hours-page">
      <p className="text-sm">
        <a href={w.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
          {shortUrl(w.url)}
        </a>
        <span className="text-slate-500"> · {source}</span>
      </p>
      <p className="text-sm text-slate-700">{pageLine(w, now, words)}</p>
      {lines.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-800">
          {lines.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {read.length > 0 && (
        <div className="text-sm" data-testid="hours-read">
          <p className="text-xs font-medium text-slate-500">It read</p>
          <ul className="space-y-0.5 text-slate-700">
            {read.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {w.active && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={busy} onClick={() => onAct({ action: 'check', id: w.id })} className={BUTTON}>
            {busy ? 'Reading…' : 'Check now'}
          </button>
          <button type="button" disabled={busy} onClick={() => onAct({ action: 'stop', id: w.id })} className={BUTTON}>
            Stop reading this page
          </button>
        </div>
      )}
    </li>
  )
}

function PlaceRow({
  place: p,
  section,
  now,
  busy,
  queueHref,
  showFields,
  words,
  token,
  jobName,
  settled,
  onAct,
  onDecided,
}: {
  place: HoursPlace
  section: HoursSection
  now: number
  showFields: boolean
  words: Words
  busy: boolean
  queueHref: string
  token: string
  jobName: string
  settled: Settled
  onAct: (body: Record<string, unknown>) => void
  onDecided: (f: Finding, d: Decision) => void
}) {
  const community = useCommunitySlug()
  const [open, setOpen] = useState(false)
  const [giving, setGiving] = useState(false)
  const line = placeLine(p, section, words)
  const stopped = p.stopped ?? []
  return (
    <li className="px-4 py-3" data-testid="hours-place">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="block w-full cursor-pointer text-left">
        <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block font-semibold text-slate-900">{p.name}</span>
            {showFields && p.fields.length > 0 && <span className="block text-sm text-slate-700">{p.fields.join(' · ')}</span>}
            {line && <span className={`block text-sm ${section === 'cant_read' ? 'font-medium text-red-700' : 'text-slate-600'}`}>{line}</span>}
          </span>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={`mt-1 shrink-0 text-slate-400 ${open ? 'rotate-180' : ''}`}>
            <path d="M4 6l4 4 4-4" />
          </svg>
        </span>
      </button>
      {(p.findings?.length ?? 0) > 0 && (
        <ul className="mt-2 space-y-2">
          {p.findings!.map((f) => (
            <li key={f.id}>
              <FindingCompare finding={f} token={token} community={community} jobName={jobName} decided={settled.get(f.id)} onDecided={(d) => onDecided(f, d)} />
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          {p.website && (
            <p className="text-sm">
              <a href={p.website} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
                Open its website
              </a>
            </p>
          )}
          {p.pages.length > 0 && (
            <ul className="space-y-2">
              {p.pages.map((x) => (
                <PageRow key={x.watch.id} page={x} now={now} busy={busy} words={words} onAct={onAct} />
              ))}
            </ul>
          )}
          {stopped.length > 0 && (
            <ul className="space-y-1" aria-label="Stopped pages">
              {stopped.map(({ watch: w }) => (
                <li key={w.id} className="flex flex-wrap items-center gap-2 text-sm text-slate-600" data-testid="hours-stopped">
                  <span className="min-w-0">
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
          {section === 'to_check' && !p.findings?.length && p.pages.some((x) => x.watch.lastCheck?.queue === 'waiting') && (
            <p className="text-sm">
              <Link href={queueHref} className="font-semibold text-primary hover:underline">
                See it in the moderation queue
              </Link>
            </p>
          )}
          {section === 'cant_read' && (
            <p className="text-sm text-slate-700">
              <a href={p.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
                Fill it in yourself
              </a>
            </p>
          )}
          {section !== 'off' && (section === 'cant_read' || giving) && <GivePage busy={busy} words={words} onGive={(url) => onAct({ action: 'give', url })} onCancel={section === 'cant_read' ? undefined : () => setGiving(false)} />}
          <div className="flex flex-wrap gap-2">
            {section === 'off' ? (
              <button type="button" disabled={busy} onClick={() => onAct({ action: 'on' })} className={BUTTON}>
                {busy ? 'Reading…' : 'Turn back on'}
              </button>
            ) : (
              <>
                {section !== 'cant_read' && !giving && (
                  <button type="button" disabled={busy} onClick={() => setGiving(true)} className={BUTTON}>
                    {words.give}
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => onAct({ action: 'off' })} className={BUTTON}>
                  {section === 'cant_read' ? words.noneOnline : 'Turn off this place'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
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
  // A row acted on stays in the section it was in until the page reloads,
  // so it doesn't jump away under the admin's hand.
  const [kept, setKept] = useState<ReadonlyMap<string, HoursSection>>(new Map())
  // Findings updated or skipped this visit.
  const [settled, setSettled] = useState<Settled>(new Map())

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await fetchJson<Loaded>(withCommunity(api, community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the places.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community, api])
  useLoadOnMount(load)

  async function act(p: HoursPlace, section: HoursSection, body: Record<string, unknown>) {
    setSaveError(null)
    setBusy(p.id)
    setKept((k) => (k.has(p.id) ? k : new Map(k).set(p.id, section)))
    try {
      // Check now is the Watches tab's own; the rest are this page's.
      const own = body.action === 'check'
      const res = await fetchJson<Saved>(
        withCommunity(own ? '/api/admin/watches' : api, community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(own ? body : { resourceId: p.id, ...body }) },
        'Could not do that.',
      )
      const next = (x: HoursPlace): HoursPlace => {
        if (body.action === 'check') return { ...x, pages: x.pages.map((pg) => (pg.watch.id === body.id && res.watch ? { ...pg, watch: res.watch } : pg)) }
        return { ...x, pages: res.pages ?? x.pages, stopped: res.stopped ?? x.stopped, off: res.off ?? x.off, reason: res.reason ?? (res.pages?.length ? null : x.reason) }
      }
      setData((d) => d && { ...d, places: d.places.map((x) => (x.id === p.id ? next(x) : x)) })
      // A read that filed something: fetch it, to compare here. Without the
      // website search (?counts), which only places with no page need.
      const pages = res.watch ? [res.watch] : (res.pages ?? []).map((x) => x.watch)
      if (pages.some((w) => w.lastCheck?.queue === 'filed')) {
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

  const back = (
    <Link href={`${adminBase(community)}/watches`} className="text-sm font-semibold text-primary hover:underline">
      ‹ Watches
    </Link>
  )
  if (error) return <div className="space-y-3">{back}<p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p></div>
  if (!data) return <div className="space-y-3">{back}<p className="text-sm text-muted">Loading places…</p></div>

  const placeOf = (p: HoursPlace) => asPlace(p, settled)
  const sectionOf = (p: HoursPlace) => kept.get(p.id) ?? hoursSection(placeOf(p), now)
  const inSection = (s: HoursSection) => data.places.filter((p) => sectionOf(p) === s)
  const counts = hoursCounts(data.places.map(placeOf), now)
  // Updated or skipped, it says so where it was, and stays there till reload.
  const decide = (p: HoursPlace, f: Finding, d: Decision) => {
    setKept((k) => (k.has(p.id) ? k : new Map(k).set(p.id, sectionOf(p))))
    setSettled((m) => new Map(m).set(f.id, d))
    setData((x) => x && { ...x, places: x.places.map((y) => (y.id === p.id ? { ...y, decided: { at: new Date().toISOString(), status: d } } : y)) })
  }
  const off = inSection('off')
  const waiting = inSection('waiting')
  const cantRead = inSection('cant_read')
  const queueHref = adminBase(community)
  // What's read, said once above when it's the same for every place.
  const fields = data.places[0]?.fields ?? []
  const sameFields = data.places.every((p) => p.fields.join('|') === fields.join('|'))
  const rows = (list: HoursPlace[]) => (
    <ul className="divide-y divide-slate-100">
      {list.map((p) => (
        // Placed by where it was; its line and buttons say what it is now.
        <PlaceRow
          key={p.id}
          place={p}
          section={hoursSection(placeOf(p), now)}
          now={now}
          busy={busy === p.id}
          queueHref={queueHref}
          showFields={!sameFields}
          words={words}
          token={token}
          jobName={data.name}
          settled={settled}
          onAct={(body) => void act(p, sectionOf(p), body)}
          onDecided={(f, d) => decide(p, f, d)}
        />
      ))}
    </ul>
  )
  const section = (title: string, description: string, list: HoursPlace[], empty = 'None right now.') => (
    <section className="bg-white border border-slate-200 rounded-lg shadow-sm" aria-label={title}>
      <h3 className="px-4 pt-3 text-sm font-semibold text-slate-800">
        {title} ({list.length})
      </h3>
      <p className="px-4 pb-2 text-xs text-muted">{description}</p>
      {list.length > 0 ? rows(list) : <p className="px-4 pb-3 text-sm text-slate-600">{empty}</p>}
    </section>
  )

  return (
    <div className="space-y-4">
      {back}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{data.name}</h2>
        <p className="text-sm text-muted">
          {plural(data.places.length, 'place')}.{' '}
          {sameFields && fields.length > 0 ? `${listed(fields)}, each read` : 'Each read'} every morning from the pages on its own website that give
          them. What differs from the listing waits on its row, beside what the listing says: Compare it, then update the listing or skip it.
        </p>
      </div>
      {!data.available && <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">Reading websites needs database migration 070.</p>}
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}
      <p className="text-sm font-semibold text-slate-800" data-testid="hours-counts">
        {counts.checked} checked · {counts.toCheck} to check · {counts.cantRead} can&rsquo;t be read
        {waiting.length > 0 && <> · {waiting.length} not read yet</>}
        {off.length > 0 && <> · {off.length} off</>}
      </p>
      {section('To check', words.toCheck, inSection('to_check'))}
      {cantRead.length > 0 && section('Can’t be read', words.cantRead, cantRead)}
      {waiting.length > 0 && section('Not read yet', 'Not compared with the listing yet. Read on a coming morning, or open one and Check now.', waiting)}
      {section('Checked', 'Its pages agree with the listing.', inSection('checked'))}
      {off.length > 0 && (
        <CollapsibleSection title="Off" description="Not read. Turn one back on and it’s read straight away." count={off.length} contentClassName="">
          {rows(off)}
        </CollapsibleSection>
      )}
    </div>
  )
}
