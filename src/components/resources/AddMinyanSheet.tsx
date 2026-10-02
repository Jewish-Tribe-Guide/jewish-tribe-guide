'use client'

import { useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'
import { RELATIVE_ELIGIBLE, TEFILLAH_LABELS, TEFILLAH_ORDER, parseTimeToMinutes, type Minyan, type Tefillah } from '@/lib/davening'
import { DAY_KEYS, dayLabel, type DayKey } from '@/lib/hours'
import { milesText } from '@/lib/geo'
import { dateText, regularMinyanim, type DateFacts } from '@/lib/schedules'
import type { UpdateRow } from '@/lib/scheduleUpdate'
import { useIsMobile } from '@/lib/useIsMobile'
import { RelativeTimeFields, TimeModeToggle, useTimeModes, ZMAN_ANCHOR_ORDER } from '@/components/intake/ZmanTimeFields'
import TurnstileWidget from '@/components/TurnstileWidget'
import ActionDialog from './ActionDialog'
import MobileSheet from './MobileSheet'
import UpdateTimesBox from './UpdateTimesBox'
import { TURNSTILE_ACTIVE } from './useListingSubmit'

// "+ Add a minyan" on the Minyanim tab (the user's note 2, agreed Oct 2):
// adding a minyan where the minyanim are, rather than going to the shul.
// Which shul (nearest first; skipped when the search named one), then the
// tefillah, its time (a clock time or from a zman, as the shul's own editor
// sets it) and the days, starting on the day being looked at, with "Only
// Hoshana Rabbah" one tap away for a one-off. Sent for an admin's check
// like any update to a shul's times (/api/resource/:id/times). A shul's
// whole schedule is one tap away too: "Update their times".

const inputClass = 'rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-primary focus:outline-none'

const dayName = (d: DayKey) => (d === 'sat' ? 'Shabbos' : dayLabel(d).slice(0, 3))

/** How far a shul is: from the visitor, or from the community's centre. */
function far(item: DirectoryResource): string | null {
  const miles = item.milesFromAddress ?? item.milesFromCenter
  return miles != null ? milesText(miles) : null
}

export default function AddMinyanSheet({
  isOpen,
  onClose,
  shuls,
  day,
  shulId: presetShul,
  tefillah: presetTefillah,
  minyanimKey,
  shulText,
}: {
  isOpen: boolean
  onClose: () => void
  /** Every shul on the page. */
  shuls: readonly DirectoryResource[]
  /** The day being looked at. */
  day: DateFacts
  /** The one shul the search named, when it named one. */
  shulId?: string
  /** The tefillah searched for, when one was. */
  tefillah?: Tefillah
  minyanimKey: string
  /** A shul's denomination, under its name. */
  shulText: (item: DirectoryResource) => string
}) {
  const isMobile = useIsMobile()
  const [shulId, setShulId] = useState<string | null>(presetShul ?? null)
  const shul = shulId ? shuls.find((s) => s.id === shulId) : undefined
  const title = shul ? `Add a minyan at ${shul.name}` : 'Add a minyan'
  const body = (
    <AddMinyanBody
      key={shulId ?? 'pick'}
      shuls={shuls}
      shul={shul}
      day={day}
      presetTefillah={presetTefillah}
      minyanimKey={minyanimKey}
      shulText={shulText}
      onPick={setShulId}
      onChangeShul={presetShul ? undefined : () => setShulId(null)}
      onClose={onClose}
    />
  )
  return isMobile ? (
    <MobileSheet isOpen={isOpen} onClose={onClose} title={title}>
      {body}
    </MobileSheet>
  ) : (
    <ActionDialog isOpen={isOpen} onClose={onClose} title={title}>
      {body}
    </ActionDialog>
  )
}

function AddMinyanBody({
  shuls,
  shul,
  day,
  presetTefillah,
  minyanimKey,
  shulText,
  onPick,
  onChangeShul,
  onClose,
}: {
  shuls: readonly DirectoryResource[]
  shul: DirectoryResource | undefined
  day: DateFacts
  presetTefillah?: Tefillah
  minyanimKey: string
  shulText: (item: DirectoryResource) => string
  onPick: (id: string) => void
  onChangeShul?: () => void
  onClose: () => void
}) {
  const dayLine = `${dateText(day.date, { weekday: true })}${day.name ? ` · ${day.name}` : ''}`
  if (!shul) return <PickShul shuls={shuls} dayLine={dayLine} shulText={shulText} onPick={onPick} />
  return <MinyanTime shul={shul} day={day} dayLine={dayLine} presetTefillah={presetTefillah} minyanimKey={minyanimKey} shulText={shulText} onChangeShul={onChangeShul} onClose={onClose} />
}

/** Which shul: nearest first, searchable, the closest few then all. */
function PickShul({ shuls, dayLine, shulText, onPick }: { shuls: readonly DirectoryResource[]; dayLine: string; shulText: (item: DirectoryResource) => string; onPick: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [all, setAll] = useState(false)
  const miles = (s: DirectoryResource) => s.milesFromAddress ?? s.milesFromCenter ?? Infinity
  const sorted = [...shuls].sort((a, b) => miles(a) - miles(b) || a.name.localeCompare(b.name))
  const typed = q.trim().toLowerCase()
  const found = typed ? sorted.filter((s) => s.name.toLowerCase().includes(typed)) : sorted
  const shown = typed || all ? found : found.slice(0, 5)
  return (
    <div className="space-y-2" data-testid="add-minyan-shul">
      <p className="text-[14px] text-muted">{dayLine}</p>
      <p className="pt-1 text-[14px] font-bold text-slate-900">Which shul?</p>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the shuls" aria-label="Search the shuls" className={`${inputClass} h-11 w-full text-[15px]`} />
      <ul className="divide-y divide-slate-100">
        {shown.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s.id)} className="flex w-full cursor-pointer items-center justify-between gap-3 py-2.5 text-left hover:bg-slate-50">
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-bold text-slate-900">{s.name}</span>
                {shulText(s) && <span className="block truncate text-[13px] text-muted">{shulText(s)}</span>}
              </span>
              {far(s) && <span className="shrink-0 text-[13.5px] text-muted">{far(s)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {!typed && !all && found.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="cursor-pointer text-[14px] font-bold text-primary hover:underline">
          Nearest first, all {found.length} ›
        </button>
      )}
      {typed && found.length === 0 && <p className="text-[13.5px] text-muted">No shul called that in the guide.</p>}
    </div>
  )
}

/** The tefillah, its time and its days, for one shul. */
function MinyanTime({
  shul,
  day,
  dayLine,
  presetTefillah,
  minyanimKey,
  shulText,
  onChangeShul,
  onClose,
}: {
  shul: DirectoryResource
  day: DateFacts
  dayLine: string
  presetTefillah?: Tefillah
  minyanimKey: string
  shulText: (item: DirectoryResource) => string
  onChangeShul?: () => void
  onClose: () => void
}) {
  const [row, setRow] = useState<UpdateRow>({ id: 'new', day: day.weekday, tefillah: presetTefillah ?? 'shacharis', time: '', status: 'new' })
  const [days, setDays] = useState<DayKey[]>([day.weekday])
  const [oneOff, setOneOff] = useState(false)
  const [notes, setNotes] = useState('')
  const [schedule, setSchedule] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<'sent' | 'confirmed' | null>(null)
  const modes = useTimeModes()
  const pending = useRef<(token: string) => void>(() => {})
  const set = (p: Partial<UpdateRow>) => setRow((r) => ({ ...r, ...p }))
  const relative = !!row.anchor
  const readable = relative || Number.isFinite(parseTimeToMinutes(row.time))
  const view = modes.view(row)
  const oneOffName = day.name ?? dateText(day.date, { weekday: true })

  if (sent) {
    return (
      <div className="space-y-3">
        <p role="status" className="text-[15px] font-semibold text-emerald-700">
          {sent === 'sent' ? '✓ Thanks! An admin checks it before everyone sees it.' : '✓ Thanks! Marked confirmed.'}
        </p>
        <button type="button" onClick={onClose} className="h-11 w-full cursor-pointer rounded-xl bg-primary text-[15px] font-bold text-white hover:bg-primary-dark">
          Done
        </button>
      </div>
    )
  }

  if (schedule) {
    return <UpdateTimesBox item={shul} minyanim={regularMinyanim(shul[minyanimKey]) as Minyan[]} onSent={setSent} onClose={() => setSchedule(false)} />
  }

  const send = async (token: string) => {
    try {
      const base = { tefillah: row.tefillah, time: row.time, ...(row.anchor ? { anchor: row.anchor, offsetMinutes: row.offsetMinutes ?? 0 } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), status: 'new' as const }
      const rows = oneOff
        ? [{ ...base, id: crypto.randomUUID(), day: day.date, occasion: oneOffName }]
        : days.map((d) => ({ ...base, id: crypto.randomUUID(), day: d }))
      const res = await fetch(`/api/resource/${shul.id}/times`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update: { kind: 'schedule', complete: false, season: null, title: null, startsOn: null, from: null, to: null, rows }, turnstileToken: token, company: '' }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'failed')
      setSent('sent')
    } catch (e) {
      setError(e instanceof Error && e.message !== 'failed' ? e.message : 'That didn’t send. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  const start = () => {
    setBusy(true)
    setError(null)
    setAttempt((n) => n + 1)
    pending.current = (token) => void send(token)
    if (!TURNSTILE_ACTIVE) void send('')
  }
  const chip = (on: boolean) =>
    `cursor-pointer rounded-full border-[1.5px] px-3 py-1.5 text-[13px] font-semibold ${on ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 bg-white text-slate-600'}`

  return (
    <div className="space-y-3" data-testid="add-minyan-time">
      <div>
        <p className="text-[14px] text-muted">{dayLine}</p>
        <p className="mt-0.5 text-[14px] text-muted">
          {shulText(shul)}
          {far(shul) ? ` · ${far(shul)}` : ''}
          {onChangeShul && (
            <>
              {' · '}
              <button type="button" onClick={onChangeShul} className="cursor-pointer font-bold text-primary hover:underline">
                Change
              </button>
            </>
          )}
        </p>
      </div>
      <button type="button" onClick={() => setSchedule(true)} className="cursor-pointer text-left text-[14px] font-bold text-primary hover:underline">
        Have their whole schedule? Paste it or add a photo ›
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={row.tefillah}
          onChange={(e) => {
            const tefillah = e.target.value as Tefillah
            set(relative && !RELATIVE_ELIGIBLE.includes(tefillah) ? { ...modes.switchToClock(row), tefillah } : { tefillah })
          }}
          aria-label="Tefillah"
          className={`${inputClass} text-[15px] font-semibold`}
        >
          {TEFILLAH_ORDER.map((t) => (
            <option key={t} value={t}>
              {TEFILLAH_LABELS[t]}
            </option>
          ))}
        </select>
        {RELATIVE_ELIGIBLE.includes(row.tefillah) && <TimeModeToggle relative={relative} label="From a zman" onClock={() => set(modes.switchToClock(row))} onRelative={() => set(modes.switchToRelative(row))} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {relative ? (
          <RelativeTimeFields
            anchors={ZMAN_ANCHOR_ORDER}
            anchor={view.anchor}
            direction={view.direction}
            magnitudeText={view.magnitudeText}
            time={row.time}
            inputClass={inputClass}
            onChange={(a, d, m) => set(modes.setRelative(row, a, d, m))}
          />
        ) : (
          <input type="text" value={row.time} onChange={(e) => set(modes.setClockTime(row, e.target.value))} placeholder="e.g. 7:00am" aria-label="Time" className={`${inputClass} w-28 text-[15px]`} />
        )}
      </div>
      {!readable && row.time.trim() && <p className="text-[12.5px] text-caution">The guide can’t read “{row.time}” as a time. Type it like 6:30pm, or choose From a zman.</p>}

      <div>
        <p className="text-[14px] font-bold text-slate-900">Which days?</p>
        {oneOff ? (
          <p className="mt-1.5 text-[14px] text-slate-700">
            Only {oneOffName}, {dateText(day.date, { weekday: true })}.{' '}
            <button type="button" onClick={() => setOneOff(false)} className="cursor-pointer font-bold text-primary hover:underline">
              Every week instead
            </button>
          </p>
        ) : (
          <>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Days">
              {DAY_KEYS.map((d) => (
                <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))} className={chip(days.includes(d))}>
                  {dayName(d)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-slate-600">
              {dayName(day.weekday) === 'Shabbos' ? 'Shabbos' : dayLabel(day.weekday)} is on because that’s the day you were looking at. Every week, or only this one?{' '}
              <button type="button" onClick={() => setOneOff(true)} className="cursor-pointer font-bold text-primary hover:underline">
                Only {oneOffName}
              </button>
            </p>
          </>
        )}
      </div>
      <input type="text" value={notes} maxLength={120} onChange={(e) => setNotes(e.target.value)} placeholder="Note (optional)" aria-label="Note" className={`${inputClass} h-11 w-full text-[15px]`} />
      <button
        type="button"
        disabled={busy || !row.time.trim() || !readable || (!oneOff && days.length === 0)}
        onClick={start}
        className="h-12 w-full cursor-pointer rounded-xl bg-primary text-[16px] font-bold text-white hover:bg-primary-dark disabled:cursor-default disabled:opacity-45"
      >
        {busy ? 'Sending…' : 'Send for a check'}
      </button>
      {error && (
        <p role="alert" className="text-[13.5px] text-red-700">
          {error}
        </p>
      )}
      <p className="text-[12.5px] leading-snug text-muted">An admin checks it before anyone sees it.</p>
      {busy && TURNSTILE_ACTIVE && <TurnstileWidget key={attempt} onVerify={(token) => pending.current(token)} />}
    </div>
  )
}
