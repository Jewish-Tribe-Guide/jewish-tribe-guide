'use client'

import { useEffect, useState } from 'react'
import { parseTimeToMinutes, TEFILLAH_LABELS, TEFILLAH_ORDER, type Tefillah } from '@/lib/davening'
import { dateText, readSchedules, scheduleDayText, type ScheduleDay, type ScheduleMinyan, type SpecialSchedule } from '@/lib/schedules'
import type { Festival } from '@/lib/festivals'
import { RELATIVE_ELIGIBLE, RelativeTimeFields, TimeModeToggle, useTimeModes } from './ZmanTimeFields'

// ── A shul's special schedules, typed in (step 4, agreed Oct 1) ─────────────
// Under its regular davening times on the Edit screen: "+ Special times for
// a Yom Tov". Picking the festival fills in its name and dates ("Sukkos
// 5787, Sep 26 – Oct 4") and offers its days to choose from ("Yom Tov
// days", "Chol HaMoed", "Fri Oct 2 · Hoshana Rabbah"), so nobody types a
// date. Each time is held on any of those. A schedule is in place of the
// regular times, or as well as them.
//
// Saved with the listing's edit, so it goes through the moderation queue,
// which shows every time in it (formatSchedulesSummary).
//
// A Mincha or Maariv can be set from sunset ("10 min before sunset"), as
// the regular times can, with the same control (ZmanTimeFields). Sunset
// only: the guide's candle-lighting and havdalah times are the coming
// Shabbos's, which on a Yom Tov date would be another day's. A time it
// can't read says so, rather than being saved and never shown.

/** Only sunset, for the reason above. */
const SCHEDULE_ANCHORS = ['sunset'] as const

type Props = {
  value: unknown
  onChange: (value: SpecialSchedule[]) => void
  /** Start straight on this festival's schedule ("Sukkos"), as "Know
   *  their Sukkos times? Add them" does. */
  startWith?: string
  /** What each time was read from, by its id, when the AI read them from
   *  the shul's message or photo (scheduleReader.ts): shown under the time,
   *  with anything it wasn't sure of, for the person to check. */
  readFrom?: Record<string, { quote: string; checked: boolean; unsure?: string }>
}

const genId = () => crypto.randomUUID()
// Full width for the name and dates; a row's own controls size themselves.
const fieldClass = 'rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-primary focus:outline-none'
const inputClass = `w-full ${fieldClass}`
const chip = (on: boolean) =>
  `cursor-pointer rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${on ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`

/** The festivals from now on, once (see /api/festivals). */
function useFestivals(wanted: boolean): Festival[] | null {
  const [festivals, setFestivals] = useState<Festival[] | null>(null)
  useEffect(() => {
    if (!wanted || festivals) return
    let live = true
    fetch('/api/festivals')
      .then((r) => r.json())
      .then((j: { ok?: boolean; festivals?: Festival[] }) => {
        if (live) setFestivals(j.ok && Array.isArray(j.festivals) ? j.festivals : [])
      })
      .catch(() => live && setFestivals([]))
    return () => {
      live = false
    }
  }, [wanted, festivals])
  return festivals
}

/** A new schedule for a festival (its name and dates), or for dates to
 *  fill in, with a first time to fill in. */
function newSchedule(f: Festival | null): SpecialSchedule {
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: genId(),
    name: f?.name ?? '',
    from: f?.from ?? today,
    to: f?.to ?? today,
    mode: 'replace',
    minyanim: [{ id: genId(), tefillah: 'shacharis', on: f?.days.some((d) => d.yomTov) ? ['yom_tov'] : [], time: '' }],
  }
}

/** Every date from `from` to `to`, at most three weeks of them. */
function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`) && out.length < 21; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

export default function SchedulesInput({ value, onChange, startWith, readFrom }: Props) {
  const [schedules, setSchedules] = useState<SpecialSchedule[]>(() => readSchedules(value))
  // A reading opens straight onto its times, to be checked.
  const [open, setOpen] = useState<string | null>(() => (readFrom ? (readSchedules(value)[0]?.id ?? null) : null))
  const [choosing, setChoosing] = useState(!!startWith)
  const festivals = useFestivals(choosing || open !== null)
  // Started on a festival: its schedule, once the calendar says its dates.
  const [started, setStarted] = useState(false)
  if (startWith && !started && festivals) {
    setStarted(true)
    const f = festivals.find((x) => x.festival === startWith)
    if (f && schedules.length === 0) {
      const s = newSchedule(f)
      setSchedules([s])
      setOpen(s.id)
      setChoosing(false)
    }
  }

  // What's saved is only what's complete: a named schedule with its dates
  // in order, and times with a day and a time. A row still being filled in
  // stays here until it is.
  const update = (next: SpecialSchedule[]) => {
    setSchedules(next)
    onChange(
      next
        .filter((s) => s.name.trim() && s.from <= s.to)
        .map((s) => ({ ...s, name: s.name.trim(), minyanim: s.minyanim.filter((m) => m.on.length > 0 && m.time.trim()) })),
    )
  }
  const patch = (id: string, p: Partial<SpecialSchedule>) => update(schedules.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const add = (f: Festival | null) => {
    const s = newSchedule(f)
    update([...schedules, s])
    setOpen(s.id)
    setChoosing(false)
  }

  return (
    <div className="mt-3 space-y-2" data-testid="schedules-input">
      <p className="text-sm font-semibold text-slate-800">Special times for a Yom Tov</p>
      {schedules.map((s) =>
        open === s.id ? (
          <ScheduleForm
            key={s.id}
            schedule={s}
            festival={festivals?.find((f) => f.name === s.name) ?? null}
            onChange={(p) => patch(s.id, p)}
            onRemove={() => update(schedules.filter((x) => x.id !== s.id))}
            onDone={() => setOpen(null)}
            readFrom={readFrom}
          />
        ) : (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpen(s.id)}
            className="block w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            <span className="font-semibold text-slate-900">{s.name || 'Untitled'}</span>
            <span className="text-muted">
              {' '}
              · {dateText(s.from)} – {dateText(s.to)} · {s.minyanim.length} {s.minyanim.length === 1 ? 'time' : 'times'}
            </span>
          </button>
        ),
      )}
      {choosing ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm text-slate-700">Which Yom Tov?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {festivals === null && <span className="text-xs text-muted">Loading the calendar…</span>}
            {(festivals ?? []).slice(0, 4).map((f) => (
              <button key={`${f.name}:${f.from}`} type="button" onClick={() => add(f)} className={chip(false)}>
                {f.name} · {dateText(f.from)} – {dateText(f.to)}
              </button>
            ))}
            <button type="button" onClick={() => add(null)} className={chip(false)}>
              Other dates
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setChoosing(true)} className="cursor-pointer text-sm font-semibold text-primary hover:underline">
          + Special times for a Yom Tov
        </button>
      )}
    </div>
  )
}

function ScheduleForm({
  schedule: s,
  festival,
  onChange,
  onRemove,
  onDone,
  readFrom,
}: {
  schedule: SpecialSchedule
  festival: Festival | null
  onChange: (p: Partial<SpecialSchedule>) => void
  onRemove: () => void
  onDone: () => void
  readFrom?: Props['readFrom']
}) {
  // The days a time can be held on: Yom Tov days and Chol HaMoed where the
  // festival has them, then each date in the schedule, named when the
  // calendar names it.
  const named = new Map((festival?.days ?? []).map((d) => [d.date, d.name]))
  const choices: { on: ScheduleDay; label: string }[] = [
    ...(festival?.days.some((d) => d.yomTov) ? [{ on: 'yom_tov' as const, label: 'Yom Tov days' }] : []),
    ...(festival?.days.some((d) => d.cholHamoed) ? [{ on: 'chol_hamoed' as const, label: 'Chol HaMoed' }] : []),
    ...datesBetween(s.from, s.to).map((d) => ({ on: d, label: `${scheduleDayText(d)}${named.has(d) ? ` · ${named.get(d)}` : ''}` })),
  ]
  const setRow = (id: string, p: Partial<ScheduleMinyan>) => onChange({ minyanim: s.minyanim.map((m) => (m.id === id ? { ...m, ...p } : m)) })
  const modes = useTimeModes()
  const toggle = (m: ScheduleMinyan, on: ScheduleDay) => setRow(m.id, { on: m.on.includes(on) ? m.on.filter((x) => x !== on) : [...m.on, on] })

  return (
    <div className="space-y-3 rounded-lg border border-slate-300 bg-white p-3" data-testid="schedule-form">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs font-semibold text-slate-600 sm:col-span-3">
          Name
          <input value={s.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Sukkos 5787" className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          From
          <input type="date" value={s.from} onChange={(e) => e.target.value && onChange({ from: e.target.value })} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          To
          <input type="date" value={s.to} onChange={(e) => e.target.value && onChange({ to: e.target.value })} className={`${inputClass} mt-1`} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="With the regular times">
        {(
          [
            ['replace', 'In place of the regular times'],
            ['add', 'As well as them'],
          ] as const
        ).map(([mode, label]) => (
          <button key={mode} type="button" role="radio" aria-checked={s.mode === mode} onClick={() => onChange({ mode })} className={chip(s.mode === mode)}>
            {label}
          </button>
        ))}
      </div>
      {s.minyanim.map((m) => {
        // A time the guide can't work out ("at candle lighting") is saved
        // but never shows: said here, for whoever's typing or checking it.
        const unreadable = !m.anchor && !!m.time.trim() && !Number.isFinite(parseTimeToMinutes(m.time))
        return (
          <div
            key={m.id}
            className={`space-y-2 rounded-md border p-2.5 ${readFrom?.[m.id]?.unsure || unreadable ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}
            data-testid="schedule-row"
          >
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Tefillah"
                value={m.tefillah}
                onChange={(e) => {
                  const tefillah = e.target.value as Tefillah
                  // Shacharis isn't set from sunset: back to a clock time, in
                  // the same change.
                  setRow(m.id, m.anchor && !RELATIVE_ELIGIBLE.includes(tefillah) ? { ...modes.switchToClock(m), tefillah } : { tefillah })
                }}
                className={fieldClass}
              >
                {TEFILLAH_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TEFILLAH_LABELS[t]}
                  </option>
                ))}
              </select>
              {(RELATIVE_ELIGIBLE.includes(m.tefillah) || m.anchor) && (
                <TimeModeToggle
                  relative={!!m.anchor}
                  label="From sunset"
                  onClock={() => setRow(m.id, modes.switchToClock(m))}
                  onRelative={() => setRow(m.id, modes.switchToRelative(m))}
                />
              )}
              <button type="button" onClick={() => onChange({ minyanim: s.minyanim.filter((x) => x.id !== m.id) })} className="ml-auto cursor-pointer text-sm text-red-500 hover:text-red-700" aria-label="Remove this time">
                ✕
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {m.anchor ? (
                <RelativeTimeFields
                  anchors={SCHEDULE_ANCHORS}
                  {...modes.view(m)}
                  anchor="sunset"
                  time={m.time}
                  inputClass={fieldClass}
                  onChange={(_a, d, n) => setRow(m.id, modes.setRelative(m, 'sunset', d, n))}
                />
              ) : (
                <input aria-label="Time" value={m.time} onChange={(e) => setRow(m.id, modes.setClockTime(m, e.target.value))} placeholder="6:30pm" className={`${fieldClass} w-28`} />
              )}
              <input aria-label="Note" value={m.notes ?? ''} onChange={(e) => setRow(m.id, { notes: e.target.value || undefined })} placeholder="Note (optional)" className={`${fieldClass} min-w-[8rem] flex-1`} />
            </div>
            {unreadable && (
              <p className="text-[12.5px] font-semibold leading-snug text-caution" data-testid="schedule-row-unreadable">
                The guide can’t read “{m.time.trim()}” as a time, so it wouldn’t show. Type it like 6:30pm{RELATIVE_ELIGIBLE.includes(m.tefillah) ? ', or choose From sunset' : ''}.
              </p>
            )}
            {readFrom?.[m.id] && (
              <p className="text-[12.5px] leading-snug text-slate-600" data-testid="schedule-row-source">
                From “{readFrom[m.id].quote}”{!readFrom[m.id].checked && ' (from the photo: check it)'}
                {readFrom[m.id].unsure && <span className="block font-semibold text-caution">Check: {readFrom[m.id].unsure}</span>}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5" aria-label="Held on">
              {choices.map((c) => (
                <button key={c.on} type="button" aria-pressed={m.on.includes(c.on)} onClick={() => toggle(m, c.on)} className={chip(m.on.includes(c.on))}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <button
          type="button"
          onClick={() => onChange({ minyanim: [...s.minyanim, { id: genId(), tefillah: 'mincha', on: [], time: '' }] })}
          className="cursor-pointer font-semibold text-primary hover:underline"
        >
          + Add a time
        </button>
        <button type="button" onClick={onDone} className="cursor-pointer font-semibold text-slate-700 hover:underline">
          Done
        </button>
        <button type="button" onClick={onRemove} className="ml-auto cursor-pointer font-semibold text-red-600 hover:underline">
          Remove this schedule
        </button>
      </div>
    </div>
  )
}
