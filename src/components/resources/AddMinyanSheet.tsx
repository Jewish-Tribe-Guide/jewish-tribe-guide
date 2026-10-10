'use client'

import { useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'
import { RELATIVE_ELIGIBLE, TEFILLAH_LABELS, TEFILLAH_ORDER, parseTimeToMinutes, type Tefillah } from '@/lib/davening'
import { DAY_KEYS, dayLabel, type DayKey } from '@/lib/hours'
import { milesText } from '@/lib/geo'
import { dateText, type DateFacts } from '@/lib/schedules'
import type { UpdateRow } from '@/lib/scheduleUpdate'
import { tellUsPlaceholder } from '@/lib/tellUs'
import { useIsMobile } from '@/lib/useIsMobile'
import { RelativeTimeFields, TimeModeToggle, useTimeModes, ZMAN_ANCHOR_ORDER } from '@/components/intake/ZmanTimeFields'
import TurnstileWidget from '@/components/TurnstileWidget'
import ActionDialog from './ActionDialog'
import MobileSheet from './MobileSheet'
import { TellUsBody } from '@/components/TellUsSheet'
import { TURNSTILE_ACTIVE } from './useListingSubmit'

// "+ Add a minyan" on the Minyanim tab (the user's note 2, agreed Oct 2):
// adding a minyan where the minyanim are, rather than going to the shul.
// Which shul (nearest first; skipped when the search named one), then the
// tefillah, its time (a clock time or from a zman, as the shul's own editor
// sets it) and the days, starting on the day being looked at, with "Only
// Hoshana Rabbah" one tap away for a one-off. Sent for an admin's check
// like any update to a shul's times (/api/resource/:id/times).
//
// Tidied Oct 6: Back is the header's chevron (it was "· Change" by the
// shul's denomination); the time sits beside its tefillah; the days need no
// explaining, and "Only Hoshana Rabbah" is offered only on a day with a
// name. "Have their whole schedule?" moved under Send and opens the regular
// "+ Add" box about the shul, in this sheet, where it was a second box with
// a choice to make first.

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
  /** A shul's denomination, under its name. */
  shulText: (item: DirectoryResource) => string
}) {
  const isMobile = useIsMobile()
  const [shulId, setShulId] = useState<string | null>(presetShul ?? null)
  const shul = shulId ? shuls.find((s) => s.id === shulId) : undefined
  const [sent, setSent] = useState(false)
  // The "+ Add" box, about this shul, while it's open here: its step's
  // title, and whether it has a Back (none on its thanks). The Back itself
  // is kept in a ref, as TellUsSheet keeps it: the box reports it on every
  // render, and state would loop.
  const [tell, setTell] = useState<TellState>(null)
  const tellBack = useRef<() => void>(() => {})
  // Named for what's being done, as the link said (Oct 6): it was "Tell us
  // about Mekor Habracha", the box's name anywhere.
  const title = tell && shul ? (tell.title ?? `Send ${shul.name}’s schedule`) : shul ? `Add a minyan at ${shul.name}` : 'Add a minyan'
  // Back: the box's own, or from the minyan to "Which shul?" when it was
  // picked here (none when the search named it, or once sent).
  const onBack = tell ? (tell.hasBack ? () => tellBack.current() : undefined) : shul && !presetShul && !sent ? () => setShulId(null) : undefined
  const body = (
    <AddMinyanBody
      key={shulId ?? 'pick'}
      shuls={shuls}
      shul={shul}
      day={day}
      presetTefillah={presetTefillah}
      shulText={shulText}
      onPick={setShulId}
      sent={sent}
      onSent={() => setSent(true)}
      telling={!!tell}
      onTell={setTell}
      onTellBack={(back) => {
        tellBack.current = back ?? (() => {})
        setTell((t) => (t && t.hasBack !== !!back ? { ...t, hasBack: !!back } : t))
      }}
      onClose={onClose}
    />
  )
  return isMobile ? (
    <MobileSheet isOpen={isOpen} onClose={onClose} title={title} onBack={onBack} draggable>
      {body}
    </MobileSheet>
  ) : (
    <ActionDialog isOpen={isOpen} onClose={onClose} title={title} onBack={onBack}>
      {body}
    </ActionDialog>
  )
}

type TellState = { title: string | null; hasBack: boolean } | null

function AddMinyanBody({
  shuls,
  shul,
  day,
  presetTefillah,
  shulText,
  onPick,
  sent,
  onSent,
  telling,
  onTell,
  onTellBack,
  onClose,
}: {
  shuls: readonly DirectoryResource[]
  shul: DirectoryResource | undefined
  day: DateFacts
  presetTefillah?: Tefillah
  shulText: (item: DirectoryResource) => string
  onPick: (id: string) => void
  sent: boolean
  onSent: () => void
  telling: boolean
  onTell: (t: TellState | ((t: TellState) => TellState)) => void
  onTellBack: (back: (() => void) | null) => void
  onClose: () => void
}) {
  if (!shul) return <PickShul shuls={shuls} dayLine={`${dateText(day.date, { weekday: true })}${day.name ? ` · ${day.name}` : ''}`} shulText={shulText} onPick={onPick} />
  // The whole schedule: the regular box, about this shul. Its Back from the
  // start comes back here, to the minyan as it was left (kept, hidden).
  return (
    <>
      {telling && (
      <TellUsBody
        about={{ id: shul.id, name: shul.name }}
        placeholder={tellUsPlaceholder({ times: true, about: shul })}
        kind="times"
        // Its do-it-yourself is the one minyan it was opened from (Oct 10).
        onEditYourself={() => onTell(null)}
        yourselfLabel="Add one time yourself"
        onClose={onClose}
        onTitle={(title) => onTell((t) => (t && t.title !== title ? { ...t, title } : t))}
        onBack={onTellBack}
        backFromStart={() => onTell(null)}
      />
      )}
      <div hidden={telling}>
    <MinyanTime
      shul={shul}
      day={day}
      presetTefillah={presetTefillah}
      sent={sent}
      onSent={onSent}
      onWholeSchedule={() => onTell({ title: null, hasBack: false })}
      onClose={onClose}
    />
      </div>
    </>
  )
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

/** The tefillah and its time, then its days, for one shul. */
function MinyanTime({
  shul,
  day,
  presetTefillah,
  sent,
  onSent,
  onWholeSchedule,
  onClose,
}: {
  shul: DirectoryResource
  day: DateFacts
  presetTefillah?: Tefillah
  sent: boolean
  onSent: () => void
  onWholeSchedule: () => void
  onClose: () => void
}) {
  const [row, setRow] = useState<UpdateRow>({ id: 'new', day: day.weekday, tefillah: presetTefillah ?? 'shacharis', time: '', status: 'new' })
  const [days, setDays] = useState<DayKey[]>([day.weekday])
  const [oneOff, setOneOff] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const modes = useTimeModes()
  const pending = useRef<(token: string) => void>(() => {})
  const set = (p: Partial<UpdateRow>) => setRow((r) => ({ ...r, ...p }))
  const relative = !!row.anchor
  const readable = relative || Number.isFinite(parseTimeToMinutes(row.time))
  const view = modes.view(row)
  // Only a day with a name gets a one-off of its own ("Only Hoshana
  // Rabbah"): that's when one is likely. Any other, the note says it.
  const oneOffName = day.name

  if (sent) {
    return (
      <div className="space-y-3">
        <p role="status" className="text-[15px] font-semibold text-emerald-700">
          Thanks! An admin checks it before everyone sees it.
        </p>
        <button type="button" onClick={onClose} className="h-11 w-full cursor-pointer rounded-xl bg-primary text-[15px] font-bold text-white hover:bg-primary-dark">
          Done
        </button>
      </div>
    )
  }

  const send = async (token: string) => {
    try {
      const base = { tefillah: row.tefillah, time: row.time, ...(row.anchor ? { anchor: row.anchor, offsetMinutes: row.offsetMinutes ?? 0 } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), status: 'new' as const }
      const rows = oneOff && oneOffName
        ? [{ ...base, id: crypto.randomUUID(), day: day.date, occasion: oneOffName }]
        : days.map((d) => ({ ...base, id: crypto.randomUUID(), day: d }))
      const res = await fetch(`/api/resource/${shul.id}/times`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update: { kind: 'schedule', complete: false, season: null, title: null, startsOn: null, from: null, to: null, rows }, turnstileToken: token, company: '' }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'failed')
      onSent()
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
    <div className="space-y-4" data-testid="add-minyan-time">
      {/* The tefillah and its time, one row: "Shacharis 7:00 AM". */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <select
            value={row.tefillah}
            onChange={(e) => {
              const tefillah = e.target.value as Tefillah
              set(relative && !RELATIVE_ELIGIBLE.includes(tefillah) ? { ...modes.switchToClock(row), tefillah } : { tefillah })
            }}
            aria-label="Tefillah"
            className={`${inputClass} h-11 min-w-0 flex-1 text-[15px] font-semibold`}
          >
            {TEFILLAH_ORDER.map((t) => (
              <option key={t} value={t}>
                {TEFILLAH_LABELS[t]}
              </option>
            ))}
          </select>
          {!relative && (
            <input type="text" value={row.time} onChange={(e) => set(modes.setClockTime(row, e.target.value))} placeholder="7:00am" aria-label="Time" className={`${inputClass} h-11 w-28 shrink-0 text-[15px]`} />
          )}
        </div>
        {relative && (
          <div className="flex flex-wrap items-center gap-2">
            <RelativeTimeFields
              anchors={ZMAN_ANCHOR_ORDER}
              anchor={view.anchor}
              direction={view.direction}
              magnitudeText={view.magnitudeText}
              time={row.time}
              inputClass={inputClass}
              onChange={(a, d, m) => set(modes.setRelative(row, a, d, m))}
            />
          </div>
        )}
        {RELATIVE_ELIGIBLE.includes(row.tefillah) && <TimeModeToggle relative={relative} label="From a zman" onClock={() => set(modes.switchToClock(row))} onRelative={() => set(modes.switchToRelative(row))} />}
        {!readable && row.time.trim() && <p className="text-[12.5px] text-caution">The guide can’t read “{row.time}” as a time. Type it like 6:30pm, or choose From a zman.</p>}
      </div>

      <div>
        <p className="text-[14px] font-bold text-slate-900">Which days?</p>
        {oneOff && oneOffName ? (
          <p className="mt-1.5 text-[14px] text-slate-700">
            Only {oneOffName}, {dateText(day.date, { weekday: true })}.{' '}
            <button type="button" onClick={() => setOneOff(false)} className="cursor-pointer font-bold text-primary hover:underline">
              Every week instead
            </button>
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Days">
            {DAY_KEYS.map((d) => (
              <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))} className={chip(days.includes(d))}>
                {dayName(d)}
              </button>
            ))}
            {oneOffName && (
              <button type="button" onClick={() => setOneOff(true)} className={chip(false)}>
                Only {oneOffName}
              </button>
            )}
          </div>
        )}
      </div>
      <input type="text" value={notes} maxLength={120} onChange={(e) => setNotes(e.target.value)} placeholder="Note (optional)" aria-label="Note" className={`${inputClass} h-11 w-full text-[15px]`} />
      <div className="space-y-2">
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
        <p className="text-center text-[12.5px] leading-snug text-muted">An admin checks it before anyone sees it.</p>
      </div>
      <p className="border-t border-slate-100 pt-3 text-center text-[14px] text-slate-600">
        Have their whole schedule?{' '}
        <button type="button" onClick={onWholeSchedule} className="cursor-pointer font-bold text-primary hover:underline">
          Send it instead ›
        </button>
      </p>
      {busy && TURNSTILE_ACTIVE && <TurnstileWidget key={attempt} onVerify={(token) => pending.current(token)} />}
    </div>
  )
}
