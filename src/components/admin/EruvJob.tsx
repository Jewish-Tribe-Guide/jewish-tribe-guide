'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { useIsMobile } from '@/lib/useIsMobile'
import { routes } from '@/lib/routes'
import { shortDay } from '@/lib/eruv'
import type { AdminEruv } from '@/lib/eruvStore'
import type { FoundStatusPage } from '@/lib/eruvFind'
import { detailsKeysToUse, detailsPill, detailsRows } from '@/lib/eruvWebsite'
import { eruvStanding, findingFor, statusPill, updatesOf, websiteWatchOf, type EruvFinding, type EruvJobLoaded, type EruvJobTab } from '@/lib/eruvJob'
import { eruvSection } from '@/lib/watchJobs'
import { sourceKind, sourceProblem } from '@/lib/watchPurposes'
import type { Watch } from '@/lib/watches'
import MobileSheet from '@/components/resources/MobileSheet'
import ActionDialog from '@/components/resources/ActionDialog'
import EruvEditor, { type EruvValues } from '@/components/resources/EruvEditor'
import EruvKeptEmail from './EruvKeptEmail'
import { GivePage, JobPage, day, shortUrl } from './JobPage'
import { Box, BoxActions, BoxRow, BoxRows, LINK, PlaceRow, Reads, SourceLine, type ReadPage } from './JobBoxes'

// ── The Watches tab's Eruv status page, as drawn (Oct 22) ───────────────────
// Artifact 9Kv6MGeAEooZREzW28hiBu (agreed Oct 21): the same page as the
// others (eruvJob.ts has the tabs). An eruv opened is its listing's boxes:
//   - Details: where it goes, website, hotline, email alerts. Its hotline
//     and email alerts are read from its website every day
//     (eruvWebsite.ts) and wait for Use this / Edit / Keep the listing.
//   - Status: up or down, from its status page or its emails. It goes on
//     the site at once, as it always has, so it has no Use this.
//   - Map: live, the same.
//   - Reads: the switch for its website, a line per page, and what was
//     this page's own tools before: find its status page, give one or its
//     emails, an email it couldn't read, stop reading. Open on Can't be
//     read, and on To check on a computer (the drawing's phone has it shut).

const BUTTON = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50'

type Decision = 'approved' | 'rejected'
type Settled = ReadonlyMap<string, { d: Decision; at: string }>
type Found = { found: FoundStatusPage[]; error: string | null }

const doneText = (d: { d: Decision; at: string }) => `${d.d === 'approved' ? 'Used' : 'Kept'} ${day(d.at)}`

/** "Oct 21, 6:49 PM", where the community is. */
function dayTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone })
}

export function eruvSay(n: number): string {
  if (!n) return 'No eruv has an update from its website.'
  return n === 1 ? '1 eruv has an update from its website.' : `${n} eruvim have an update from their websites.`
}

const sameSite = (a: string | null, b: string | null) => !!a && !!b && shortUrl(a).toLowerCase() === shortUrl(b).toLowerCase()

/** Give its status page, or the address its emails come from. */
function GiveSource({ email, busy, onGive, onCancel }: { email: boolean; busy: boolean; onGive: (source: string) => void; onCancel: () => void }) {
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <div className="space-y-1">
      <GivePage
        label={email ? 'The address its emails come from' : 'Its status page, or the address its emails come from'}
        placeholder={email ? 'eruv@example.org' : 'https://…'}
        busy={busy}
        onGive={(source) => {
          const wrong = sourceProblem('eruv', source)
          setProblem(wrong)
          if (!wrong) onGive(source)
        }}
        onCancel={onCancel}
      />
      {problem && <p className="text-xs font-medium text-red-700">{problem}</p>}
    </div>
  )
}

function EruvPlace({
  eruv: e,
  tab,
  finding,
  watch,
  settled,
  timezone,
  now,
  busy,
  community,
  onEruv,
  onWatch,
  onReadNow,
  onFind,
  onDecide,
  onEdit,
}: {
  eruv: AdminEruv
  tab: EruvJobTab
  finding: EruvFinding | null
  watch: Watch | null
  settled: { d: Decision; at: string } | undefined
  timezone: string
  now: Date
  busy: boolean
  community: string
  onEruv: (body: Record<string, unknown>) => Promise<boolean>
  onWatch: (action: 'pause' | 'resume') => void
  onReadNow: () => void
  onFind: () => Promise<Found | null>
  onDecide: (body: Record<string, unknown>, d: Decision) => void
  onEdit: () => void
}) {
  const [giving, setGiving] = useState<'page' | 'email' | null>(null)
  const [stopping, setStopping] = useState<'status' | 'map' | null>(null)
  const [found, setFound] = useState<Found | null>(null)
  const [searching, setFinding] = useState(false)
  const isMobile = useIsMobile()
  const standing = eruvStanding(e, { finding: settled ? null : finding, watch, now, timezone })
  const section = eruvSection(e)

  // ── Details ──
  const open = !settled && !!finding && updatesOf(e, finding) > 0
  const rows = open ? detailsRows(e, { hotline: finding!.hotline, alertsUrl: finding!.alertsUrl }) : detailsRows(e)
  const details = (
    <Box key={settled ? 'details-done' : 'details'} name="Details" pill={settled ? { text: doneText(settled), tone: 'grey' } : open ? { text: detailsPill(rows), tone: 'amber' } : { text: 'Same', tone: 'grey' }} defaultOpen={open}>
      <BoxRows>
        {rows.map((r) => (
          <BoxRow key={r.key} name={r.name} right={<span className="[overflow-wrap:anywhere]">{r.value}</span>} mark={r.mark} was={r.was} />
        ))}
      </BoxRows>
      {open && <BoxActions busy={busy} onUse={() => onDecide({ status: 'approved', only: detailsKeysToUse(rows) }, 'approved')} onEdit={onEdit} onKeep={() => onDecide({ status: 'rejected' }, 'rejected')} />}
      {e.website && (open ? <SourceLine url={e.website} what="its website" at={finding!.at} /> : watch?.lastOkAt && !settled ? <SourceLine lead="Same as" url={e.website} at={watch.lastOkAt} /> : null)}
    </Box>
  )

  // ── Status ──
  const pill = statusPill(e, now, timezone)
  const failed = section === 'didnt_load'
  const status = (
    <Box key="status" name="Status" pill={failed ? { text: 'Didn’t load', tone: 'grey' } : pill} defaultOpen={tab === 'to_check'}>
      {section === 'no_source' ? (
        <p className="text-sm text-slate-500">No status page or emails.</p>
      ) : (
        <>
          {(e.statusCheckedAt || failed) && (
            <BoxRows>
              <BoxRow
                name={failed ? 'Didn’t load' : pill.text}
                sub={failed ? e.statusError : e.statusWords ? `“${e.statusWords}”` : undefined}
                right={e.statusPostedOn ? shortDay(e.statusPostedOn, timezone) : e.statusCheckedAt ? shortDay(e.statusCheckedAt, timezone) : undefined}
              />
            </BoxRows>
          )}
          <SourceLine
            url={e.statusUrl}
            what={e.statusUrl ? 'its status page' : `its emails, from ${e.statusEmail}`}
            extra={[e.statusCheckedAt && `read ${dayTime(e.statusCheckedAt, timezone)}`, 'on the site at once'].filter(Boolean).join(' · ')}
          />
        </>
      )}
    </Box>
  )

  // ── Map ──
  const mapFailed = !!e.lineUrl && !!e.lineError
  const map = (
    <Box key="map" name="Map" pill={{ text: !e.lineUrl ? 'None' : mapFailed ? 'Didn’t load' : 'Live', tone: 'grey' }}>
      {e.lineUrl ? (
        <>
          {mapFailed && <p className="text-sm text-slate-600">{e.lineError}</p>}
          <SourceLine url={e.lineUrl} what="its map" at={mapFailed ? null : e.lineReadAt} extra="on the site at once" />
        </>
      ) : (
        <p className="text-sm text-slate-500">No map.</p>
      )}
    </Box>
  )

  // ── Reads ──
  const siteRight = !watch ? 'not read yet' : !watch.active ? 'off' : watch.lastError ? 'didn’t load' : watch.lastOkAt ? `read ${day(watch.lastOkAt)}` : 'not read yet'
  const merged = sameSite(e.statusUrl, e.website)
  const pages: ReadPage[] = []
  if (e.statusUrl) {
    pages.push({
      key: 'status',
      url: e.statusUrl,
      label: merged ? 'Status page · Status, Details' : 'Status page',
      right: failed ? 'didn’t load' : e.statusCheckedAt ? `read ${dayTime(e.statusCheckedAt, timezone)}` : 'not read yet',
      none: failed,
      onRemove: () => setStopping('status'),
    })
  } else if (e.statusEmail) {
    pages.push({ key: 'status', url: null, name: e.statusEmail, label: 'Status emails', right: e.statusCheckedAt ? `read ${day(e.statusCheckedAt)}` : 'none yet', onRemove: () => setStopping('status') })
  }
  if (e.lineUrl) pages.push({ key: 'map', url: e.lineUrl, label: 'Map', right: mapFailed ? 'didn’t load' : e.lineReadAt ? `read ${day(e.lineReadAt)}` : 'not read yet', none: mapFailed, onRemove: () => setStopping('map') })
  if (e.website && !merged) {
    pages.push({ key: 'website', url: e.website, label: 'Website · Details', right: siteRight, none: !watch?.active || !!watch.lastError, onRemove: watch?.active ? () => onWatch('pause') : undefined })
  }

  const offered = found?.found.filter((p) => p.url !== e.statusUrl) ?? []
  const save = async (source: string, dated?: boolean) => {
    const email = sourceKind(source) === 'email'
    // One source for its status (eruvEdit.ts): the other is emptied.
    const edit = email ? { statusEmail: source, statusUrl: '' } : { statusUrl: source, statusEmail: '', ...(dated === undefined ? {} : { statusDated: dated }) }
    if (!(await onEruv({ action: 'save', edit }))) return
    if (!email) await onEruv({ action: 'check' })
    setGiving(null)
    setFound(null)
  }

  const below = (
    <>
      <EruvKeptEmail eruv={e} timezone={timezone} busy={busy} onSays={(says) => void onEruv({ action: 'email-says', says })} />
      {e.statusUrl && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={e.statusDated} disabled={busy} onChange={(ev) => void onEruv({ action: 'save', edit: { statusDated: ev.target.checked } })} />
          Its page dates each week&rsquo;s post
        </label>
      )}
      {stopping && (
        <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p>{stopping === 'status' ? `Stop reading ${e.name}’s status?` : `Stop reading ${e.name}’s map?`}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const edit = stopping === 'status' ? { statusUrl: '', statusEmail: '' } : { lineUrl: '' }
                if (await onEruv({ action: 'save', edit })) setStopping(null)
              }}
              className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Stop reading
            </button>
            <button type="button" onClick={() => setStopping(null)} className={BUTTON}>
              Keep reading
            </button>
          </div>
        </div>
      )}
      {found &&
        (found.error ? (
          <p className="text-sm text-slate-700">{found.error}.</p>
        ) : offered.length === 0 ? (
          <p className="text-sm text-slate-700">No page on {shortUrl(e.website ?? '')} says whether it&rsquo;s up.</p>
        ) : (
          <ul className="space-y-2" data-testid="eruv-found">
            {offered.map((p) => (
              <li key={p.url} className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-sm">
                <p className="text-slate-800">
                  {p.link ? `Its “${p.link}” page` : 'Its home page'}, {shortUrl(p.url)}, says it&rsquo;s <strong>{p.status}</strong>
                </p>
                {p.words && <p className="text-xs text-slate-500">“{p.words}”</p>}
                <button type="button" disabled={busy} onClick={() => void save(p.url, e.statusDated)} className={`mt-1.5 text-sm ${LINK}`}>
                  Read its status from here
                </button>
              </li>
            ))}
          </ul>
        ))}
      {giving && <GiveSource email={giving === 'email'} busy={busy} onGive={(s) => void save(s)} onCancel={() => setGiving(null)} />}
    </>
  )
  const links = (
    <>
      {section === 'no_source' && e.website && (
        <button
          type="button"
          disabled={busy || searching}
          onClick={async () => {
            setFinding(true)
            setFound(await onFind())
            setFinding(false)
          }}
          className={LINK}
        >
          {searching ? 'Searching its website…' : 'Find its status page'}
        </button>
      )}
      <button type="button" onClick={() => setGiving('page')} className={LINK}>
        Add a page
      </button>
      {section === 'no_source' && (
        <button type="button" onClick={() => setGiving('email')} className={LINK}>
          Add its emails
        </button>
      )}
      <button type="button" disabled={busy} onClick={onReadNow} className={LINK}>
        {busy ? 'Reading…' : 'Read them now'}
      </button>
      <a href={routes.eruv(community, e.id)} target="_blank" rel="noopener noreferrer" className={LINK}>
        Open its listing
      </a>
    </>
  )
  const reads = (
    <Reads key="reads" on={!!watch?.active} busy={busy} onSwitch={(on) => watch && onWatch(on ? 'resume' : 'pause')} pages={pages} links={links} below={below} defaultOpen={tab === 'cant_read' || (tab === 'to_check' && !isMobile)} />
  )

  const boxes = tab === 'to_check' ? [details, status, map, reads] : [status, details, map, reads]
  return (
    <PlaceRow name={e.name} pill={settled ? { text: doneText(settled), tone: 'grey' } : standing.pill} back="Eruv status">
      {boxes}
    </PlaceRow>
  )
}

export default function EruvJob({ token }: { token: string }) {
  const community = useCommunitySlug()
  const isMobile = useIsMobile()
  const [data, setData] = useState<EruvJobLoaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [now] = useState(() => new Date())
  // Each eruv stays on the tab it was on when the page loaded.
  const [tabs, setTabs] = useState<ReadonlyMap<string, EruvJobTab>>(new Map())
  const [tab, setTab] = useState<EruvJobTab>('to_check')
  const [settled, setSettled] = useState<Settled>(new Map())
  const [editing, setEditing] = useState<{ eruv: AdminEruv; finding: EruvFinding } | null>(null)
  const headers = { Authorization: `Bearer ${token}` }
  const api = '/api/admin/watches/eruv'

  const load = useCallback(async () => {
    setError(null)
    try {
      const got = await fetchJson<EruvJobLoaded>(withCommunity(api, community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the eruvim.')
      const at = new Date()
      const of = new Map(got.eruvim.map((e) => [e.id, eruvStanding(e, { finding: findingFor(got.findings, e.id), watch: websiteWatchOf(e, got.watches), now: at, timezone: got.timezone }).tab]))
      setTabs(of)
      setTab((['to_check', 'cant_read', 'checked'] as const).find((t) => [...of.values()].includes(t)) ?? 'to_check')
      setData(got)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  /** The page again, keeping each eruv's tab. */
  async function refresh() {
    const got = await fetchJson<EruvJobLoaded>(withCommunity(api, community), { headers }, 'Failed to load the eruvim.').catch(() => null)
    if (got) setData(got)
  }

  const post = <T,>(path: string, body: unknown) =>
    fetchJson<T>(withCommunity(path, community), { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'Could not do that.')

  async function run<T>(id: string, work: () => Promise<T>): Promise<T | null> {
    setSaveError(null)
    setBusy(id)
    try {
      return await work()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function onEruv(e: AdminEruv, body: Record<string, unknown>): Promise<boolean> {
    const res = await run(e.id, () => post<{ eruv?: AdminEruv }>('/api/admin/eruvim', { id: e.id, ...body }))
    if (res?.eruv) setData((d) => d && { ...d, eruvim: d.eruvim.map((x) => (x.id === e.id ? res.eruv! : x)) })
    return !!res
  }

  async function onWatch(e: AdminEruv, w: Watch | null, action: 'pause' | 'resume') {
    if (!w) return
    const res = await run(e.id, () => post<{ watch?: Watch }>('/api/admin/watches', { action, id: w.id }))
    if (res?.watch) setData((d) => d && { ...d, watches: d.watches.map((x) => (x.id === w.id ? res.watch! : x)) })
  }

  async function readNow(e: AdminEruv, w: Watch | null) {
    await run(e.id, async () => {
      if (e.statusUrl || e.lineUrl) await post('/api/admin/eruvim', { id: e.id, action: 'check' })
      if (w?.active) await post('/api/admin/watches', { action: 'check', id: w.id })
      await refresh()
    })
  }

  async function decide(e: AdminEruv, f: EruvFinding, body: Record<string, unknown>, d: Decision): Promise<string[] | null> {
    setSaveError(null)
    setBusy(e.id)
    try {
      await fetchJson(withCommunity(`/api/admin/submissions/${f.id}`, community), { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'Could not save that.')
      setSettled((s) => new Map(s).set(e.id, { d, at: new Date().toISOString() }))
      await refresh()
      return null
    } catch (err) {
      return [err instanceof Error ? err.message : 'Could not save that.']
    } finally {
      setBusy(null)
    }
  }

  const backHref = `${adminBase(community)}/watches`
  if (error || !data) {
    const notice = error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : <p className="text-sm text-muted">Loading eruvim…</p>
    return <JobPage backHref={backHref} title="Eruv status" intro="" needYou={0} total={0} noun="eruv" notice={notice} />
  }

  const eruvim = data.available ? [...data.eruvim].sort((a, b) => a.name.localeCompare(b.name)) : []
  const tabOf = (e: AdminEruv) => tabs.get(e.id) ?? 'checked'
  const counts = { to_check: 0, cant_read: 0, checked: 0 }
  for (const e of eruvim) counts[tabOf(e)]++
  const waiting = eruvim.filter((e) => !settled.has(e.id) && updatesOf(e, findingFor(data.findings, e.id)) > 0).length
  const notice = (
    <>
      {!data.available && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Eruv status needs database migration 074.</p>}
      {saveError && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
    </>
  )
  const Sheet = isMobile ? MobileSheet : ActionDialog

  return (
    <>
      <JobPage
        backHref={backHref}
        title="Eruv status"
        intro=""
        needYou={0}
        total={0}
        noun="eruv"
        say={{ head: eruvSay(waiting) }}
        notice={notice}
        tabs={{
          counts,
          active: tab,
          onChange: setTab,
          list: [
            { key: 'to_check', label: 'To check' },
            { key: 'cant_read', label: 'Can’t be read' },
            { key: 'checked', label: 'Checked' },
          ],
        }}
      >
        {eruvim
          .filter((e) => tabOf(e) === tab)
          .map((e) => {
            const f = findingFor(data.findings, e.id)
            const w = websiteWatchOf(e, data.watches)
            return (
              <EruvPlace
                key={e.id}
                eruv={e}
                tab={tabOf(e)}
                finding={f}
                watch={w}
                settled={settled.get(e.id)}
                timezone={data.timezone}
                now={now}
                busy={busy === e.id}
                community={community}
                onEruv={(body) => onEruv(e, body)}
                onWatch={(action) => void onWatch(e, w, action)}
                onReadNow={() => void readNow(e, w)}
                onFind={() => run(e.id, () => post<Found>('/api/admin/eruvim', { id: e.id, action: 'find' }))}
                onDecide={(body, d) =>
                  f &&
                  void decide(e, f, body, d).then((wrong) => {
                    if (wrong) setSaveError(wrong[0])
                  })
                }
                onEdit={() => f && setEditing({ eruv: e, finding: f })}
              />
            )
          })}
      </JobPage>
      <Sheet isOpen={!!editing} onClose={() => setEditing(null)} title="Details">
        {editing && (
          <EruvEditor
            eruv={editing.eruv}
            onClose={() => setEditing(null)}
            adminSave={{
              label: 'Save to the listing',
              values: { hotline: editing.finding.hotline ?? '', alertsUrl: editing.finding.alertsUrl ?? '' },
              onSave: (values: EruvValues) => decide(editing.eruv, editing.finding, { status: 'approved', payload: values }, 'approved'),
            }}
          />
        )}
      </Sheet>
    </>
  )
}
