'use client'

import { useState, type ReactNode } from 'react'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunityCenter } from '@/lib/communityContext'
import { useZmanim } from '@/lib/useZmanim'
import { schedulesKey, type SpecialSchedule } from '@/lib/schedules'
import { changeCount, proposalLine, scheduleProposal, usualProposal, type ProposalBox, type ProposalRow, type WeekProposal } from '@/lib/timesProposal'
import type { Finding, FindingTimes } from '@/lib/watchFindings'
import type { Watch } from '@/lib/watches'
import type { ZmanimData } from '@/types'
import { DetailFieldInput } from '@/components/resources/DetailFieldInput'
import FindingCompare, { decidedLine, type Decision } from './FindingCompare'
import { GivePage, day, shortUrl, type JobStatus } from './JobPage'
import type { HoursPlace } from './HoursJob'

// ── Shul times: what each shul's website proposes (the user, Oct 21) ────────
// Drawn on artifact B3vwpSiqwdK833s9VAVHBc (v2). "Show what the reader
// proposes the new listing should be and how it differs. Like the
// moderation queue." So a shul whose website says something different
// says it on its row, in words, and opening the row is the comparison: no
// Compare step. The proposal is the whole schedule, in the listing's own
// boxes, the website's way ("15 min before sunset", today's sunset only a
// note beside it: "We don't need to be better than them when they own the
// data"). Three choices: Use this, Edit, Keep the listing.
//
// Usual times and this week's schedule are two different things, and stay
// two different things here: a posted week is proposed on its own dates,
// and using it never touches the usual times.
//
// Reading is a switch per shul. Off, its website isn't read and nothing is
// proposed; the listing is kept by hand. It replaces "Turn off this place",
// "Turn back on" and "No times online". Its pages (use a different one, add
// one) are under the proposal, since they're only needed when a read is
// wrong.

const LINK = 'font-semibold text-primary hover:underline disabled:opacity-50'
const BUTTON = 'rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50'
const GO = 'rounded-md bg-primary px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50'
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The finding's times, when it's a proposal this page can show whole. */
const timesOf = (f: Finding): FindingTimes | undefined => (f.operation === 'update' ? f.times : undefined)

/** What each part of a finding proposes. */
function partsOf(t: FindingTimes, f: Finding) {
  const usual = usualProposal(t.current, t.proposed)
  return {
    usual,
    week: scheduleProposal(t.currentSchedules, t.proposedSchedules, t.proposed),
    hasUsual: f.lines.some((l) => l.key === t.field.key),
    hasWeek: f.lines.some((l) => l.key === schedulesKey(t.field.key)),
  }
}

/** The row's pill and line, from what it found: "2 changes" and the change
 *  in words; "This week" and the week's first difference. */
export function shulSummary(findings: readonly Finding[]): { pill: string; line: string } | null {
  const f = findings[0]
  const t = f && timesOf(f)
  if (!t) return null
  const { usual, week, hasUsual, hasWeek } = partsOf(t, f)
  const n = changeCount(usual)
  if (hasUsual && n > 0) return { pill: plural(n, 'change'), line: proposalLine(usual) ?? '' }
  if (hasWeek && week.weeks.length) {
    const w = week.weeks[0]
    const rows = w.days.flatMap((d) => d.rows.map((r) => ({ ...r, day: d.label })))
    const first = rows.find((r) => r.usually) ?? rows[0]
    return { pill: w.isWeek ? 'This week' : 'New dates', line: first ? `${w.title}: ${first.day}, ${first.what} ${first.when}${first.usually ? `, usually ${first.usually}` : ''}` : w.title }
  }
  return null
}

/** Reading its website, on or off. */
function ReadingSwitch({ on, busy, onChange }: { on: boolean; busy: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={busy} onClick={() => onChange(!on)} className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-900 disabled:opacity-50">
      <span aria-hidden="true" className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[1.125rem]' : 'left-0.5'}`} />
      </span>
      <span className="sm:hidden">Reading</span>
      <span className="hidden sm:inline">Reading its website</span>
    </button>
  )
}

/** Today's zman beside a time held relative to it: a note, not the time. */
function zmanNote(r: ProposalRow, z: ZmanimData | null): string | null {
  if (!r.anchored || !z) return null
  const when = r.when.toLowerCase()
  if (when.includes('candle')) return z.shabbos.candleLighting ? `candle-lighting this week ${z.shabbos.candleLighting.time}` : null
  if (when.includes('havdalah')) return z.shabbos.havdalah ? `havdalah this week ${z.shabbos.havdalah.time}` : null
  const sunset = z.dailyZmanim.find((e) => /sunset|shkiah/i.test(e.label))
  return sunset ? `sunset today ${sunset.time}` : null
}

const TONE: Record<ProposalRow['status'], string> = {
  same: '',
  new: 'bg-emerald-50 -mx-2 px-2',
  changed: 'bg-amber-50 -mx-2 px-2',
  gone: '-mx-2 px-2',
}
const TAG: Record<ProposalRow['status'], ReactNode> = {
  same: null,
  new: <span className="mr-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">New</span>,
  changed: <span className="mr-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">Changed</span>,
  gone: <span className="mr-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">No longer there</span>,
}

function MinyanRow({ r, zmanim, quiet }: { r: ProposalRow; zmanim: ZmanimData | null; quiet: boolean }) {
  const gone = r.status === 'gone'
  const small = [r.season, r.note].filter(Boolean)
  const note = zmanNote(r, zmanim)
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-slate-100 py-1.5 text-sm ${TONE[r.status]} ${quiet ? 'max-sm:hidden' : ''}`} data-testid="proposal-row" data-status={r.status}>
      <span className="min-w-0">
        {TAG[r.status]}
        <span className={gone ? 'text-slate-500 line-through' : 'text-slate-900'}>{r.what}</span>
        {r.was?.days && (
          <s className="ml-1.5 text-slate-500" aria-label={`was ${r.was.days}`}>
            {r.was.days}
          </s>
        )}
        {(small.length > 0 || r.was?.season || r.was?.note) && (
          <span className="block text-xs text-slate-500">
            {small.join(' · ')}
            {r.was?.season && <s className="ml-1.5">{r.was.season}</s>}
            {r.was?.note && <s className="ml-1.5">{r.was.note}</s>}
          </span>
        )}
      </span>
      <span className="text-right tabular-nums">
        <span className={gone ? 'text-slate-500 line-through' : 'text-slate-900'}>{r.when}</span>
        {r.was?.when && <s className="block text-xs text-slate-500">{r.was.when}</s>}
        {note && <span className="block text-xs text-slate-500">{note}</span>}
      </span>
    </li>
  )
}

function Boxes({ boxes, zmanim, quietOnPhone }: { boxes: readonly ProposalBox[]; zmanim: ZmanimData | null; quietOnPhone: boolean }) {
  return (
    <>
      {boxes.map((b) => {
        const allSame = b.rows.every((r) => r.status === 'same')
        return (
          <div key={b.box} className={quietOnPhone && allSame ? 'max-sm:hidden' : ''}>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{b.label}</h4>
            <ul>
              {b.rows.map((r, i) => (
                <MinyanRow key={i} r={r} zmanim={zmanim} quiet={quietOnPhone && r.status === 'same'} />
              ))}
            </ul>
          </div>
        )
      })}
    </>
  )
}

function Week({ w }: { w: WeekProposal }) {
  return (
    <div className="space-y-2" data-testid="proposal-week">
      <p className="text-sm font-semibold text-slate-900">{w.title}:</p>
      {w.days.map((d) => (
        <div key={d.label}>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{d.label}</h4>
          <ul>
            {d.rows.map((r, i) => (
              <li key={i} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-slate-100 py-1.5 text-sm ${r.usually ? '-mx-2 bg-amber-50 px-2' : ''}`}>
                <span className="min-w-0">
                  {r.usually && <span className="mr-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">This week</span>}
                  {r.what}
                  {r.note && <span className="block text-xs text-slate-500">{r.note}</span>}
                </span>
                <span className="text-right tabular-nums">
                  {r.when}
                  {r.usually && <span className="block text-xs text-slate-500">usually {r.usually}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {w.isWeek && <p className="text-xs text-slate-500">Goes on the listing as This week’s schedule. The usual times stay as they are.</p>}
    </div>
  )
}

/** One finding, as the proposal it is: the usual times the website gives,
 *  each minyan marked, and any week it posted, apart. */
export function TimesProposal({
  finding: f,
  times: t,
  token,
  community,
  decided,
  onDecided,
}: {
  finding: Finding
  times: FindingTimes
  token: string
  community: string
  decided?: Decision
  onDecided: (d: Decision) => void
}) {
  const center = useCommunityCenter()
  const { data: zmanim } = useZmanim(center)
  const { usual, week, hasUsual, hasWeek } = partsOf(t, f)
  const both = hasUsual && hasWeek
  const [use, setUse] = useState({ usual: true, week: true })
  const [showAll, setShowAll] = useState(false)
  const [editing, setEditing] = useState<{ minyanim: unknown; schedules: SpecialSchedule[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (decided) {
    return (
      <p className="text-sm font-medium text-slate-700" data-testid="finding-decided">
        {decidedLine(f, decided)}
      </p>
    )
  }

  async function send(body: Record<string, unknown>, d: Decision) {
    setError(null)
    setBusy(true)
    try {
      await fetchJson(
        withCommunity(`/api/admin/submissions/${f.id}`, community),
        { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        'Could not save that.',
      )
      setEditing(null)
      onDecided(d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }
  const key = t.field.key
  const skey = schedulesKey(key)
  const approve = () => {
    if (both && !(use.usual && use.week)) return send({ status: 'approved', only: [use.usual ? key : skey] }, 'approved')
    return send({ status: 'approved' }, 'approved')
  }
  const weekOnly = hasWeek && !hasUsual
  const unchanged = usual.flatMap((b) => b.rows).filter((r) => r.status === 'same').length
  const quiet = hasUsual && !showAll && unchanged > 0

  if (editing) {
    return (
      <div className="space-y-3" data-testid="proposal-edit">
        <p className="text-sm text-slate-700">Their website’s times, to fix what the reader got wrong. Saved, they go on the listing.</p>
        <DetailFieldInput
          field={t.field}
          value={editing.minyanim}
          onChange={(v) => setEditing((e) => e && { ...e, minyanim: v })}
          schedules={editing.schedules}
          onChangeSchedules={(v) => setEditing((e) => e && { ...e, schedules: v })}
        />
        {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void send({ status: 'approved', payload: { details: { [key]: editing.minyanim, [skey]: editing.schedules } } }, 'approved')} className={GO}>
            {busy ? 'Saving…' : 'Save to the listing'}
          </button>
          <button type="button" disabled={busy} onClick={() => setEditing(null)} className={BUTTON}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="proposal">
      {hasUsual ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            {both && <input type="checkbox" aria-label="Use the usual times" checked={use.usual} disabled={busy} onChange={() => setUse((u) => ({ ...u, usual: !u.usual }))} className="mt-0.5 h-4 w-4 accent-primary" />}
            <p className="text-sm font-semibold text-slate-900">Their website says the usual times should be:</p>
          </div>
          <Boxes boxes={usual} zmanim={zmanim} quietOnPhone={quiet} />
          {quiet && (
            <p className="text-sm text-slate-600 sm:hidden">
              {plural(unchanged, 'more time')}, unchanged.{' '}
              <button type="button" onClick={() => setShowAll(true)} className={LINK}>
                Show all
              </button>
            </p>
          )}
        </div>
      ) : (
        <UsualSame boxes={usual} zmanim={zmanim} />
      )}
      {hasWeek ? (
        <div className="space-y-3">
          {week.weeks.map((w) => (
            <div key={w.title} className="flex items-start gap-2">
              {both && <input type="checkbox" aria-label={`Use ${w.title}`} checked={use.week} disabled={busy} onChange={() => setUse((u) => ({ ...u, week: !u.week }))} className="mt-0.5 h-4 w-4 accent-primary" />}
              <div className="min-w-0 flex-1">
                <Week w={w} />
              </div>
            </div>
          ))}
          {week.gone.length > 0 && <p className="text-sm text-slate-700">Comes off the listing: {week.gone.join(', ')}.</p>}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          {t.currentSchedules.some((s) => s.kind === 'week') ? 'This week’s schedule: nothing new on their website.' : 'This week’s schedule: their website doesn’t post one, so the listing shows the usual times.'}
        </p>
      )}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || (both && !use.usual && !use.week)} onClick={() => void approve()} className={GO}>
          {busy ? 'Saving…' : weekOnly ? 'Use this week' : 'Use this'}
        </button>
        <button type="button" disabled={busy} onClick={() => setEditing({ minyanim: t.proposed, schedules: t.proposedSchedules })} className={BUTTON}>
          Edit
        </button>
        <button type="button" disabled={busy} onClick={() => void send({ status: 'rejected' }, 'rejected')} className={BUTTON}>
          {weekOnly ? 'Skip this week' : 'Keep the listing'}
        </button>
      </div>
    </div>
  )
}

/** The usual times when the website agrees with them: said, and shown on
 *  a tap. */
function UsualSame({ boxes, zmanim }: { boxes: readonly ProposalBox[]; zmanim: ZmanimData | null }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-700">
        <span className="font-semibold text-slate-900">Usual times:</span> Same as their website.{' '}
        {boxes.length > 0 && (
          <button type="button" onClick={() => setShown((s) => !s)} className={LINK}>
            {shown ? 'Hide them' : 'Show them'}
          </button>
        )}
      </p>
      {shown && <Boxes boxes={boxes} zmanim={zmanim} quietOnPhone={false} />}
    </div>
  )
}

// ── The row ─────────────────────────────────────────────────────────────────

const PILL = {
  amber: 'border-amber-300 bg-amber-50 text-amber-900',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  grey: 'border-slate-200 bg-slate-50 text-slate-600',
  red: 'border-red-200 bg-red-50 text-red-800',
} as const

const isRead = (w: Watch) => !!(w.lastRunAt && w.lastCheck)

/** What the row says closed: its pill, and a line. */
function closed(p: HoursPlace, status: JobStatus, reading: boolean, findings: readonly Finding[]): { pill: string; tone: keyof typeof PILL; line: string; change?: boolean } {
  const live = p.pages.filter((x) => x.watch.active)
  const at = live.map((x) => x.watch.lastCheck?.at).filter((a) => a != null).sort().at(-1)
  if (status === 'off') return { pill: 'Reading off', tone: 'grey', line: `Kept by hand · reading turned off${p.offSince ? ` ${day(p.offSince)}` : ''}` }
  if (reading) return { pill: 'Reading…', tone: 'grey', line: `Reading ${live[0] ? shortUrl(live[0].watch.url) : 'its website'} now` }
  if (status === 'not_read') return { pill: 'Not read yet', tone: 'grey', line: `From ${live[0] ? shortUrl(live[0].watch.url) : 'its website'} · not read yet` }
  if (status === 'didnt_load') return { pill: 'Didn’t load', tone: 'red', line: p.reason ?? 'Its page didn’t load.' }
  if (status === 'cant_read') return { pill: 'Can’t be read', tone: 'amber', line: p.reason ?? 'No page with its times.' }
  if (status === 'same') {
    const decided = p.decided && live.some((x) => x.watch.lastCheck?.result === 'differs')
    return { pill: 'Same', tone: 'green', line: decided ? (p.decided!.status === 'approved' ? `Updated on the listing ${day(p.decided!.at)}` : `Kept the listing ${day(p.decided!.at)}: shown again if its website changes`) : `Same as their website${at ? ` · read ${day(at)}` : ''}` }
  }
  if (status === 'unsure') return { pill: 'Couldn’t compare', tone: 'amber', line: `From ${live[0] ? shortUrl(live[0].watch.url) : 'its website'}${at ? ` · read ${day(at)}` : ''}` }
  const summary = shulSummary(findings)
  if (summary) return { pill: summary.pill, tone: 'amber', line: summary.line, change: true }
  if (findings[0]) return { pill: 'Differs', tone: 'amber', line: findings[0].lines[0] ? `${findings[0].lines[0].label}: their website says something different` : 'Their website says something different', change: true }
  return { pill: 'Differs', tone: 'amber', line: 'Someone’s suggestion for it waits in the moderation queue.' }
}

export function ShulRow({
  place: p,
  status,
  busy,
  reading,
  token,
  community,
  jobName,
  settled,
  words,
  onAct,
  onDecided,
}: {
  place: HoursPlace
  status: JobStatus
  busy: boolean
  /** Being read now, on its own (a page found and not read yet). */
  reading: boolean
  token: string
  community: string
  jobName: string
  settled: ReadonlyMap<string, Decision>
  words: { pageLabel: string; placeholder: string }
  onAct: (body: Record<string, unknown>) => void
  onDecided: (f: Finding, d: Decision) => void
}) {
  const [open, setOpen] = useState(false)
  const findings = p.findings ?? []
  const waiting = findings.filter((f) => !settled.has(f.id))
  const c = closed(p, status, reading, waiting)
  const live = p.pages.filter((x) => x.watch.active)
  const at = live.map((x) => x.watch.lastCheck?.at).filter((a) => a != null).sort().at(-1)
  const off = status === 'off'
  return (
    <li className="px-4 py-3" data-testid="job-row">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer items-start gap-2 text-left">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={`mt-1 shrink-0 text-slate-400 transition-transform max-sm:hidden ${open ? '' : '-rotate-90'}`}>
          <path d="M4 6l4 4 4-4" />
        </svg>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="min-w-0 flex-1 font-semibold text-slate-900">{p.name}</span>
            <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${PILL[c.tone]}`} data-testid="job-status">
              {c.pill}
            </span>
          </span>
          <span className={`block text-sm [overflow-wrap:anywhere] ${c.change ? 'font-medium text-amber-900' : 'text-slate-600'}`} data-testid="job-line">
            {c.line}
          </span>
        </span>
        <span aria-hidden="true" className="mt-0.5 text-slate-400 sm:hidden">
          ›
        </span>
      </button>
      {open && (
        <div
          role="region"
          aria-label={p.name}
          className="mt-3 space-y-3 max-sm:fixed max-sm:inset-0 max-sm:z-50 max-sm:mt-0 max-sm:overflow-y-auto max-sm:bg-white max-sm:px-4 max-sm:pb-8 max-sm:pt-[max(1rem,env(safe-area-inset-top))] sm:ml-6 sm:rounded-lg sm:border sm:border-slate-200 sm:bg-white sm:p-4"
          data-testid="shul-open"
        >
          <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-primary hover:underline sm:hidden">
            ‹ {jobName}
          </button>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 sm:hidden">{p.name}</p>
              {live.length > 0 && (
                <p className="text-sm text-slate-600 [overflow-wrap:anywhere]">
                  From{' '}
                  <a href={live[0].watch.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                    {shortUrl(live[0].watch.url)}
                  </a>
                  {live.length > 1 && ` and ${plural(live.length - 1, 'other page')}`} · {at ? `read ${day(at)}` : 'not read yet'}
                </p>
              )}
            </div>
            <ReadingSwitch on={!off} busy={busy} onChange={(on) => onAct({ action: on ? 'on' : 'off' })} />
          </div>
          <Body place={p} status={status} reading={reading} waiting={waiting} findings={findings} token={token} community={community} jobName={jobName} settled={settled} onDecided={onDecided} />
          {!off && <Pages place={p} status={status} busy={busy} words={words} onAct={onAct} />}
        </div>
      )}
    </li>
  )
}

function Body({ place: p, status, reading, waiting, findings, token, community, jobName, settled, onDecided }: { place: HoursPlace; status: JobStatus; reading: boolean; waiting: readonly Finding[]; findings: readonly Finding[]; token: string; community: string; jobName: string; settled: ReadonlyMap<string, Decision>; onDecided: (f: Finding, d: Decision) => void }) {
  const live = p.pages.filter((x) => x.watch.active)
  const read = live.flatMap((x) => (isRead(x.watch) ? x.watch.lastCheck!.read : []))
  if (status === 'off') return <p className="text-sm text-slate-700">Reading is off: its website isn’t read, and nothing is proposed. The listing is kept by hand.</p>
  if (reading) return <p className="text-sm text-slate-700">Reading its website now…</p>
  if (status === 'not_read') return <p className="text-sm text-slate-700">Not read yet.</p>
  if (status === 'didnt_load' || status === 'cant_read') return <p className="text-sm text-slate-700">{p.reason ?? 'No page with its times.'}</p>
  // Waiting, and any decided this visit, which say so where they were.
  const shown = findings.filter((f) => settled.has(f.id) || (status === 'differs' && waiting.includes(f)))
  if (shown.length) {
    return (
      <ul className="space-y-4">
        {shown.map((f) => {
          const t = timesOf(f)
          return (
            <li key={f.id}>
              {t ? (
                <TimesProposal finding={f} times={t} token={token} community={community} decided={settled.get(f.id)} onDecided={(d) => onDecided(f, d)} />
              ) : (
                <FindingCompare finding={f} token={token} community={community} jobName={jobName} decided={settled.get(f.id)} onDecided={(d) => onDecided(f, d)} />
              )}
            </li>
          )
        })}
      </ul>
    )
  }
  if (status === 'differs') return <p className="text-sm text-slate-700">Their website says something different. Someone’s suggestion for it waits in the moderation queue.</p>
  return (
    <div className="space-y-2" data-testid="job-read">
      <p className="text-sm text-slate-900">{status === 'unsure' ? 'It read times it couldn’t compare with the listing. What it read:' : 'Same as their website. Usual times it read:'}</p>
      {read.length > 0 && (
        <ul className="space-y-0.5 text-sm text-slate-700">
          {read.map((r) => (
            <li key={r} className="whitespace-pre-line">
              {r}
            </li>
          ))}
        </ul>
      )}
      {status === 'same' && <p className="text-xs text-slate-500">Nothing to decide. Read again every morning.</p>}
    </div>
  )
}

/** Its pages, under the proposal: read again, use a different one, stop
 *  one of several, add one, and its website. */
function Pages({ place: p, status, busy, words, onAct }: { place: HoursPlace; status: JobStatus; busy: boolean; words: { pageLabel: string; placeholder: string }; onAct: (body: Record<string, unknown>) => void }) {
  const live = p.pages.filter((x) => x.watch.active)
  const nothing = status === 'cant_read' || !live.length
  const [adding, setAdding] = useState(nothing)
  const [replacing, setReplacing] = useState<string | null>(null)
  const stopped = p.stopped ?? []
  const replace = (w: Watch) => (
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
  )
  return (
    <div className="space-y-2 border-t border-slate-100 pt-3 text-sm text-slate-600" data-testid="shul-pages">
      {live.length > 1 && (
        <ul className="space-y-1">
          {live.map(({ watch: w, source }) => (
            <li key={w.id} className="space-y-1" data-testid="job-source">
              <p className="flex flex-wrap gap-x-3 gap-y-1 [overflow-wrap:anywhere]">
                <a href={w.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {shortUrl(w.url)}
                </a>
                <span>{source}</span>
                <button type="button" disabled={busy} onClick={() => setReplacing(replacing === w.id ? null : w.id)} className={LINK}>
                  Use a different page
                </button>
                <button type="button" disabled={busy} onClick={() => onAct({ action: 'stop', id: w.id })} className={LINK}>
                  Stop reading it
                </button>
              </p>
              {replacing === w.id && replace(w)}
            </li>
          ))}
        </ul>
      )}
      {stopped.map(({ watch: w }) => (
        <p key={w.id} className="flex flex-wrap gap-x-3 [overflow-wrap:anywhere]" data-testid="hours-stopped">
          <span>
            Stopped, not read:{' '}
            <a href={w.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
              {shortUrl(w.url)}
            </a>
          </span>
          <button type="button" disabled={busy} onClick={() => onAct({ action: 'again', id: w.id })} className={LINK}>
            Read it again
          </button>
        </p>
      ))}
      {adding && (
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
      {live.length === 1 && replacing === live[0].watch.id && replace(live[0].watch)}
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {live.length > 0 && <span>Reads {plural(live.length, 'page')}.</span>}
        {live.length > 0 && (
          <button type="button" disabled={busy} onClick={() => onAct({ action: 'check' })} className={LINK}>
            {busy ? 'Reading…' : 'Read it now'}
          </button>
        )}
        {live.length === 1 && (
          <button type="button" disabled={busy} onClick={() => setReplacing(replacing ? null : live[0].watch.id)} className={LINK}>
            Use a different page
          </button>
        )}
        {!adding && (
          <button type="button" disabled={busy} onClick={() => setAdding(true)} className={LINK}>
            Add a page
          </button>
        )}
        <a href={p.href} target="_blank" rel="noopener noreferrer" className={LINK}>
          Open its listing
        </a>
        {p.website && (
          <a href={p.website} target="_blank" rel="noopener noreferrer" className={LINK}>
            Open its website
          </a>
        )}
      </p>
    </div>
  )
}
