'use client'

import Link from 'next/link'
import { useState } from 'react'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { NIGHTLY_JOBS, nextRunAt } from '@/lib/jobRuns'
import { filterLooks, isFoundPage, lookView, LOOK_GROUPS, type LookKind, type LookShown } from '@/lib/lookAgain'
import { placePath } from '@/lib/placeLink'
import { AdminBack, AdminEmpty, AdminMenu, Chevron, MoreToggle } from './AdminUI'
import { day, shortUrl } from './watchText'
import { useWatchJobsAndReload } from './useWatchJobs'

// Look again (board XSuFCMdLQmBYNJqfWaEM3A, Oct 27): what the jobs couldn't
// find, tried again a month after the last try, a few a night. One list,
// like To do and Places, with a search and Kind and Trying menus (the user,
// Nov 4: "all in one list with filters and search"); each row its name, its
// kind and why, and when; a row opens in place with its last try, its next,
// Read it now and Stop trying. What it finds waits on To do.

const button = 'flex-1 inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-lg text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-60'
const primary = `${button} border border-primary bg-primary text-white`
const secondary = `${button} border border-slate-300 bg-white text-slate-900 hover:bg-slate-50`

/** Rows the list shows on a phone before "N more" (board Phone). */
const PHONE_ROWS = 5

const field = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-900'
const SHORT = Object.fromEntries(LOOK_GROUPS.map((g) => [g.kind, g.short])) as Record<LookKind, string>

const JOB = NIGHTLY_JOBS.find((j) => j.id === 'look-again')!

function Opened({ item, token, community, base, reload }: { item: LookShown; token: string; community: string; base: string; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function send(action: 'try' | 'stop' | 'resume', label: string) {
    setBusy(label)
    setError(null)
    setSaid(null)
    try {
      const r = await fetchJson<{ found?: boolean; read?: boolean }>(
        withCommunity('/api/admin/watches/look-again', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, kind: item.kind, id: item.id }) },
        'Could not do that.',
      )
      if (action === 'try') setSaid(r.found ? 'Found it. It’s waiting in To do.' : r.read ? 'Read it.' : item.kind === 'menu' ? 'Still couldn’t be read.' : 'Nothing found this time.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not do that.')
    } finally {
      setBusy(null)
    }
  }
  const f = item.found
  const fact = (label: string, value: string) => (
    <span className="flex flex-col">
      <span className="text-[12.5px] text-slate-500">{label}</span>
      <span className="text-[13.5px] text-slate-900 [overflow-wrap:anywhere]">{value}</span>
    </span>
  )
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-3.5 pl-10 sm:pl-4" data-testid="look-opened">
      {f ? (
        fact(`Found, ${day(f.at)}`, isFoundPage(f) ? shortUrl(f.url) : [f.name, f.address].filter(Boolean).join(', '))
      ) : item.stopped ? (
        fact('Stopped trying', day(item.stopped))
      ) : (
        <>
          {fact(item.lastTry ? `Last try, ${day(item.lastTry)}` : 'Last try', item.lastTry ? (item.note ?? item.why) : 'Not tried yet')}
          {item.next && fact('Next try', item.next)}
        </>
      )}
      {!f && (
        <div className="flex gap-2">
          {item.stopped ? (
            <button type="button" disabled={busy !== null} onClick={() => void send('resume', 'resume')} className={secondary}>
              {busy === 'resume' ? 'Saving…' : 'Start trying again'}
            </button>
          ) : (
            <>
              <button type="button" disabled={busy !== null} onClick={() => void send('try', 'try')} className={primary}>
                {busy === 'try' ? 'Trying…' : 'Read it now'}
              </button>
              <button type="button" disabled={busy !== null} onClick={() => void send('stop', 'stop')} className={secondary}>
                {busy === 'stop' ? 'Saving…' : 'Stop trying'}
              </button>
            </>
          )}
        </div>
      )}
      {said && <p className="m-0 text-[13.5px] text-slate-700" role="status">{said}</p>}
      {error && <p className="m-0 text-[13.5px] text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {f && (
          <Link href={base} className="text-sm font-semibold text-primary hover:underline">
            Answer it in To do
          </Link>
        )}
        <Link href={`${base}/watches/${placePath(item.id, 'job/look-again')}`} className="text-sm font-semibold text-primary hover:underline">
          Open its listing
        </Link>
      </div>
    </div>
  )
}

/** "Left out: 10 groups, not places", opening to name them (board Main). */
function LeftOut({ names }: { names: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-slate-100">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-h-11 cursor-pointer items-center gap-1.5 px-4 py-3 text-left text-[13.5px] text-slate-500"
      >
        <span className={open ? 'rotate-90' : ''}>
          <Chevron />
        </span>
        Left out: {names.length} {names.length === 1 ? 'group' : 'groups'}, not places
      </button>
      {open && <p className="m-0 px-4 pb-3 pl-9 text-[13.5px] text-slate-600">{names.join(' · ')}</p>}
    </div>
  )
}

function Rows({ rows, showKind, ...rest }: { rows: LookShown[]; showKind: boolean; token: string; community: string; base: string; reload: () => Promise<void> }) {
  const [open, setOpen] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  return (
    <>
      {rows.map((r, n) => {
        const key = `${r.kind}:${r.id}`
        const opened = open === key
        return (
          <div key={key} className={`border-b border-slate-100 last:border-b-0 ${opened ? 'bg-[#fbfcfe]' : ''} ${n >= PHONE_ROWS && !all ? 'max-sm:hidden' : ''}`}>
            <button
              type="button"
              aria-expanded={opened}
              onClick={() => setOpen(opened ? null : key)}
              className="flex w-full min-h-11 cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left hover:bg-slate-50 sm:grid sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto_16px] sm:gap-3.5"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:contents">
                <span className="text-[14.5px] font-semibold text-slate-900 [overflow-wrap:anywhere]">{r.name}</span>
                <span className={`text-[13px] text-slate-600 sm:text-[13.5px] ${opened ? 'max-sm:hidden' : ''}`}>
                  {showKind ? `${SHORT[r.kind]} · ${r.why}` : r.why}
                  <span className="sm:hidden"> · {r.when}</span>
                </span>
                <span className="hidden whitespace-nowrap text-right text-[12.5px] text-slate-500 sm:block">{r.when}</span>
              </span>
              <span className={opened ? 'rotate-90' : ''}>
                <Chevron />
              </span>
            </button>
            {opened && <Opened item={r} {...rest} />}
          </div>
        )
      })}
      {rows.length > PHONE_ROWS && (
        <div className="sm:hidden">
          <MoreToggle open={all} more={rows.length - PHONE_ROWS} onToggle={() => setAll((a) => !a)} />
        </div>
      )}
    </>
  )
}

export default function LookAgainPage({ token }: { token: string }) {
  const community = useCommunitySlug()
  const base = adminBase(community)
  const { jobs, reload } = useWatchJobsAndReload(token)
  const [now] = useState(() => Date.now())
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<LookKind | ''>('')
  const [stopped, setStopped] = useState<'trying' | 'stopped'>('trying')
  const head = <AdminBack back={{ label: 'Watches', href: `${base}/watches` }} title="Look again" />
  const loaded = jobs.lookAgain
  if (loaded === undefined) return <div className="space-y-4">{head}<p className="text-sm text-muted">Loading…</p></div>
  if (loaded === null) return <div className="space-y-4">{head}<p className="text-sm text-red-700">Couldn’t load Look again.</p></div>
  if (!loaded.available) return <div className="space-y-4">{head}<p className="text-sm text-amber-800">Look again isn’t set up on this site yet.</p></div>
  const view = lookView(loaded.items, nextRunAt(JOB, now))
  const shared = { token, community, base, reload }
  const [tonight, due] = view.tonight.split(' · ')
  const pool = stopped === 'stopped' ? view.stopped : view.rows
  const rows = filterLooks(pool, kind, query)
  const inKind = (k: LookKind) => filterLooks(pool, k, query).length
  const kinds = LOOK_GROUPS.filter((g) => g.kind === kind || inKind(g.kind) > 0)

  return (
    <div className="flex flex-col gap-3.5">
      {head}
      <p className="m-0 -mt-1 text-sm text-slate-600 max-md:hidden">Tries each one again a month after the last try · a few a night</p>
      <div className="flex flex-wrap gap-x-[18px] gap-y-1.5 text-[13.5px] text-slate-600" data-testid="look-tonight">
        <span>
          <span className="font-semibold text-slate-900">{tonight}</span> · {due}
        </span>
        <span>{view.total} in all</span>
      </div>

      <label className={`${field} flex items-center gap-2`}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#64748b" strokeWidth="1.8" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find one by name"
          aria-label="Find one by name"
          className="min-w-0 flex-1 border-0 bg-transparent outline-none"
        />
      </label>

      <div className="flex gap-1.5 sm:gap-2">
        <AdminMenu
          name="Kind"
          value={kind}
          options={[{ value: '' as const, label: 'All kinds' }, ...kinds.map((g) => ({ value: g.kind, label: g.title, count: inKind(g.kind) }))]}
          onChange={setKind}
        />
        <AdminMenu
          name="Trying"
          value={stopped}
          options={[
            { value: 'trying' as const, label: 'Still trying', count: view.rows.length },
            { value: 'stopped' as const, label: 'Stopped trying', count: view.stopped.length },
          ]}
          onChange={setStopped}
        />
      </div>

      {rows.length === 0 ? (
        <AdminEmpty>{query || kind ? 'None match.' : stopped === 'stopped' ? 'None stopped.' : 'Nothing to look for again.'}</AdminEmpty>
      ) : (
        <section aria-label="Look again" className="rounded-[10px] border border-slate-200 bg-white">
          <Rows key={`${stopped}:${kind}:${query}`} rows={rows} showKind={!kind} {...shared} />
        </section>
      )}
      {stopped === 'trying' && (kind === '' || kind === 'google') && !query && loaded.leftOut.length > 0 && (
        <section aria-label="Left out" className="rounded-[10px] border border-slate-200 bg-white [&>div]:border-t-0">
          <LeftOut names={loaded.leftOut} />
        </section>
      )}
    </div>
  )
}
