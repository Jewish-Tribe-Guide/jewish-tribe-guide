'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { milesText } from '@/lib/geo'
import { hospitalCounts, hospitalSection, type HospitalSection } from '@/lib/watchJobs'
import type { Watch } from '@/lib/watches'
import type { Finding } from '@/lib/watchFindings'
import type { Decided } from '@/lib/watchFindingStore'
import CollapsibleSection from './CollapsibleSection'
import FindingCompare, { type Decision } from './FindingCompare'

// ── The Watches tab's Hospitals page (the user, Oct 21) ─────────────────────
// Every hospital in the guide, each matched to its Refuah page by where it
// is on the map (refuahMatch.ts), and read every morning. Grouped by what
// the last read found, what needs the admin first. One Refuah didn't match
// can be given its page by hand, or said not to be on Refuah; one matched
// wrong can be given a different one; any can be turned off and back on.
//
// What Refuah has that the listing doesn't waits here, on its row, beside
// what the listing says (FindingCompare, step 6, Oct 21), not in the
// moderation queue.

type Refuah = { id: string; name: string; street: string | null; url: string }
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
}
type Settled = ReadonlyMap<string, Decision>
/** As the sections count it: its findings not decided yet, this visit included. */
const stateOf = (h: Hospital, settled: Settled) => ({ ...h, waiting: (h.findings ?? []).filter((f) => !settled.has(f.id)).length })
type Loaded = { available: boolean; refuahError: string | null; hospitals: Hospital[] }

const BUTTON = 'rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const INPUT = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm'

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What its last read found, in a line. */
function readLine(h: Hospital, section: HospitalSection): string | null {
  const w = h.watch
  if (section === 'off') return h.notOnRefuah ? 'Said not to be on Refuah.' : 'Turned off: not read.'
  if (!w) return null
  if (section === 'waiting') return w.lastRunAt ? 'Its page opens; not compared with the listing yet.' : 'Not read yet.'
  if (section === 'cant_read') return `Its Refuah page didn’t load${w.lastError ? `: ${w.lastError}` : ''}.`
  const at = w.lastCheck?.at ?? w.lastRunAt
  const when = at ? `Read ${day(at)}: ` : ''
  const c = w.lastCheck!
  if (c.result === 'nothing') return `${when}Refuah lists no contacts there yet.`
  if (c.result === 'differs') {
    const n = c.differences.length
    // Decided here, and Refuah still says what it said.
    if (section === 'checked' && h.decided) {
      return h.decided.status === 'approved' ? `Updated on the listing ${day(h.decided.at)}.` : `Skipped ${day(h.decided.at)}: shown again if Refuah changes.`
    }
    const visitor = !h.findings?.length && c.queue === 'waiting'
    return `${when}${n ? plural(n, 'difference') : 'differences'} from the listing${visitor ? '. Not shown here: someone’s suggestion for it waits in the moderation queue' : ''}.`
  }
  return `${when}${c.read[0] ? `${c.read[0]}, ` : ''}all on the listing.`
}

function GivePage({ hospital, busy, label, onChoose, onCancel }: { hospital: Hospital; busy: boolean; label: string; onChoose: (url: string) => void; onCancel?: () => void }) {
  const choices = hospital.nearby.filter((r) => r.id !== hospital.refuah?.id)
  const [url, setUrl] = useState('')
  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-800">{label}</p>
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
        <label className="min-w-0 flex-1 text-xs text-slate-600">
          {choices.length ? 'Or its page on Refuah' : 'Its page on Refuah'}
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="refuah.com/hospitals/…" className={`mt-1 ${INPUT}`} />
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
    </div>
  )
}

function HospitalRow({
  hospital: h,
  section,
  busy,
  queueHref,
  token,
  settled,
  onAct,
  onDecided,
}: {
  hospital: Hospital
  section: HospitalSection
  busy: boolean
  queueHref: string
  token: string
  settled: Settled
  onAct: (body: Record<string, unknown>) => void
  onDecided: (f: Finding, d: Decision) => void
}) {
  const community = useCommunitySlug()
  const [open, setOpen] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const read = readLine(h, section)
  const c = h.watch?.lastCheck
  return (
    <li className="px-4 py-3" data-testid="hospital-row">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="block w-full cursor-pointer text-left">
        <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block font-semibold text-slate-900">{h.name}</span>
            <span className="block text-sm text-slate-700">{h.line}</span>
            {read && <span className={`block text-sm ${section === 'cant_read' ? 'font-medium text-red-700' : 'text-slate-600'}`}>{read}</span>}
          </span>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={`mt-1 shrink-0 text-slate-400 ${open ? 'rotate-180' : ''}`}>
            <path d="M4 6l4 4 4-4" />
          </svg>
        </span>
      </button>
      {(h.findings?.length ?? 0) > 0 && (
        <ul className="mt-2 space-y-2">
          {h.findings!.map((f) => (
            <li key={f.id}>
              <FindingCompare finding={f} token={token} community={community} jobName="Hospitals" decided={settled.get(f.id)} onDecided={(d) => onDecided(f, d)} />
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          {h.watch && (
            <p className="text-xs text-slate-600">
              <a href={h.watch.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                Its page on Refuah
              </a>
              {h.source === 'match' ? ', found by where it is on the map' : ', given by hand'}
            </p>
          )}
          {c && c.differences.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-800">
              {c.differences.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {section === 'to_check' && !h.findings?.length && c?.queue === 'waiting' && (
            <p className="text-sm">
              <Link href={queueHref} className="font-semibold text-primary hover:underline">
                See it in the moderation queue
              </Link>
            </p>
          )}
          {section === 'nothing' && (
            <p className="text-sm text-slate-700">
              Still read every morning. Its contacts come here to check once Refuah adds them.{' '}
              <a href={h.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
                Fill it in yourself
              </a>
            </p>
          )}
          {section === 'cant_read' && !h.watch && (
            <GivePage hospital={h} busy={busy} label="Give its Refuah page" onChoose={(url) => onAct({ action: 'choose', url })} />
          )}
          {choosing && <GivePage hospital={h} busy={busy} label="Choose a different Refuah hospital" onChoose={(url) => onAct({ action: 'choose', url })} onCancel={() => setChoosing(false)} />}
          <div className="flex flex-wrap gap-2">
            {section === 'off' ? (
              <button type="button" disabled={busy} onClick={() => onAct({ action: 'on' })} className={BUTTON}>
                {busy ? 'Reading…' : 'Turn back on'}
              </button>
            ) : (
              <>
                {h.watch && (
                  <button type="button" disabled={busy} onClick={() => onAct({ action: 'check', id: h.watch!.id })} className={BUTTON}>
                    {busy ? 'Reading…' : 'Check now'}
                  </button>
                )}
                {h.watch && !choosing && (
                  <button type="button" disabled={busy} onClick={() => setChoosing(true)} className={BUTTON}>
                    Choose a different Refuah hospital
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => onAct({ action: 'off' })} className={BUTTON}>
                  {h.watch ? 'Turn off' : 'Not on Refuah'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

export default function HospitalsJob({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  // A row acted on stays in the section it was in until the page reloads,
  // so it doesn't jump away under the admin's hand.
  const [kept, setKept] = useState<ReadonlyMap<string, HospitalSection>>(new Map())
  // Findings updated or skipped this visit.
  const [settled, setSettled] = useState<Settled>(new Map())

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await fetchJson<Loaded>(withCommunity('/api/admin/watches/hospitals', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the hospitals.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  async function act(h: Hospital, section: HospitalSection, body: Record<string, unknown>) {
    setSaveError(null)
    setBusy(h.id)
    setKept((k) => (k.has(h.id) ? k : new Map(k).set(h.id, section)))
    try {
      // Check now is the Watches tab's own; the rest are this page's.
      const path = body.action === 'check' ? '/api/admin/watches' : '/api/admin/watches/hospitals'
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
        const fresh = await fetchJson<Loaded>(withCommunity('/api/admin/watches/hospitals', community), { headers: { Authorization: `Bearer ${token}` } }, '')
        const got = fresh.hospitals.find((x) => x.id === h.id)
        if (got) setData((d) => d && { ...d, hospitals: d.hospitals.map((x) => (x.id === h.id ? { ...x, findings: got.findings, decided: got.decided } : x)) })
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
  if (!data) return <div className="space-y-3">{back}<p className="text-sm text-muted">Loading hospitals…</p></div>

  const liveSection = (h: Hospital) => hospitalSection(stateOf(h, settled), now)
  const sectionOf = (h: Hospital) => kept.get(h.id) ?? liveSection(h)
  const inSection = (s: HospitalSection) => data.hospitals.filter((h) => sectionOf(h) === s)
  const counts = hospitalCounts(data.hospitals.map((h) => stateOf(h, settled)), now)
  // Updated or skipped, it says so where it was, and stays there till reload.
  const decide = (h: Hospital, f: Finding, d: Decision) => {
    setKept((k) => (k.has(h.id) ? k : new Map(k).set(h.id, sectionOf(h))))
    setSettled((m) => new Map(m).set(f.id, d))
    setData((x) => x && { ...x, hospitals: x.hospitals.map((y) => (y.id === h.id ? { ...y, decided: { at: new Date().toISOString(), status: d } } : y)) })
  }
  const off = inSection('off')
  const waiting = inSection('waiting')
  const queueHref = adminBase(community)
  const rows = (list: Hospital[]) => (
    <ul className="divide-y divide-slate-100">
      {list.map((h) => (
        // Placed by where it was; its line and buttons say what it is now.
        <HospitalRow
          key={h.id}
          hospital={h}
          section={liveSection(h)}
          busy={busy === h.id}
          queueHref={queueHref}
          token={token}
          settled={settled}
          onAct={(body) => void act(h, sectionOf(h), body)}
          onDecided={(f, d) => decide(h, f, d)}
        />
      ))}
    </ul>
  )
  const section = (title: string, description: string, list: Hospital[], empty = 'None right now.') => (
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
        <h2 className="text-lg font-semibold text-slate-900">Hospitals</h2>
        <p className="text-sm text-muted">
          {plural(data.hospitals.length, 'hospital')}. Each matched to Refuah by where it is on the map, and read every morning. What Refuah has that a
          listing doesn&rsquo;t waits on its row, beside what the listing says: Compare it, then update the listing or skip it.
        </p>
      </div>
      {!data.available && <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">Reading Refuah needs database migration 070.</p>}
      {data.refuahError && (
        <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
          Refuah couldn&rsquo;t be reached just now ({data.refuahError}). What each hospital last read is below; matching waits.
        </p>
      )}
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}
      <p className="text-sm font-semibold text-slate-800" data-testid="hospital-counts">
        {counts.checked} checked · {counts.toCheck} to check · {counts.nothing} nothing on Refuah yet · {counts.cantRead + counts.didntLoad} can&rsquo;t be read
        {waiting.length > 0 && <> · {waiting.length} not read yet</>}
        {off.length > 0 && <> · {off.length} off</>}
      </p>
      {section('To check', 'Refuah has contacts the listing doesn’t, or different ones.', inSection('to_check'))}
      {inSection('cant_read').length > 0 && section('Can’t be read', 'No Refuah page was found for it, or its page didn’t load. Give its Refuah page, or say it isn’t on Refuah.', inSection('cant_read'))}
      {waiting.length > 0 && section('Not read yet', 'Not compared with the listing yet. Read tomorrow morning, or open one and Check now.', waiting)}
      {section('Checked', 'Refuah’s contacts agree with the listing.', inSection('checked'))}
      <CollapsibleSection title="Nothing on Refuah yet" description="Matched, but Refuah lists no contacts there. Nothing for you to do." count={inSection('nothing').length} contentClassName="">
        {rows(inSection('nothing'))}
      </CollapsibleSection>
      {off.length > 0 && (
        <CollapsibleSection title="Off" description="Not read. Turn one back on and it’s read straight away." count={off.length} contentClassName="">
          {rows(off)}
        </CollapsibleSection>
      )}
    </div>
  )
}
