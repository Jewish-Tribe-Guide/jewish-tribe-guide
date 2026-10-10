'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { RELATIVE_ELIGIBLE, SEASON_LABELS, TEFILLAH_LABELS, TEFILLAH_ORDER, formatDays, parseTimeToMinutes, type Minyan, type Season, type Tefillah } from '@/lib/davening'
import { BOX_DAYS, boxChangeCount, type MinyanBox } from '@/lib/minyanimBox'
import type { MinyanWriting } from '@/lib/minyanText'
import { RelativeTimeFields, ZMAN_ANCHOR_ORDER, useTimeModes } from '@/components/intake/ZmanTimeFields'
import { ChevronRightIcon, PlusIcon } from '@/components/icons'
import { SUBMIT_PILL } from './submitPill'

// ── Edit under a shul's usual box: a list, then one minyan (Oct 10) ─────────
// Canvas page "Minyan edit". The box's minyanim as the box reads, one row
// each; a tap opens that one minyan on Add a minyan's screen: the tefillah,
// its time (a clock time or from a zman), its days and a note. Time of year
// and earliest/latest sit under More, for the few shuls that need them.
// Done brings you back to the list with the change marked, and the list's
// one button sends every change together ("Send 2 changes"): sent one at a
// time, approving the second would undo the first, since each carries the
// shul's whole list.
//
// It replaced the old editor here, every minyan open at once with about
// seven controls each, a tiny ✕ and tiny day chips ("a bit scary", the
// user, Oct 10).

const input = 'h-11 rounded-xl border border-slate-300 bg-white px-3 text-[15px] text-slate-900 focus:border-primary focus:outline-none'

const DAY_LABELS: Record<Minyan['days'][number], string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Shabbos',
  rosh_chodesh: 'Rosh Chodesh',
  yom_tov: 'Yom Tov',
  holiday: 'Holiday',
}
/** In the Shabbos box, Friday is Friday night. */
const dayLabel = (d: Minyan['days'][number], box: MinyanBox) => (box === 'shabbos' && d === 'fri' ? 'Friday night' : DAY_LABELS[d])

const chip = (on: boolean) =>
  `h-10 cursor-pointer rounded-full border-[1.5px] px-4 text-[14.5px] font-bold ${on ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 bg-white text-slate-600'}`

export default function MinyanBoxEditor({
  original,
  box,
  boxTitle,
  place,
  writing,
  onChange,
  onStep,
  send,
}: {
  /** The box's minyanim as they are (minyanimForBox). */
  original: Minyan[]
  box: MinyanBox
  /** "Usual Shabbos times", under a minyan's own title. */
  boxTitle: string
  /** The shul's name, under the title. */
  place: string
  /** How the listing writes a minyan, from the listing (minyanText.ts says
   *  why it's handed over rather than imported). */
  writing: MinyanWriting
  onChange: (rows: Minyan[]) => void
  /** A minyan opened: its title and the way back to the list, for the
   *  sheet's header; null on the list. */
  onStep: (step: { title: string; back: () => void } | null) => void
  /** The list's button, given how many minyanim changed. */
  send: (changes: number) => ReactNode
}) {
  const [rows, setRows] = useState<Minyan[]>(original)
  // The minyan open: an id, 'new' for one being added, or null for the list.
  const [open, setOpen] = useState<string | null>(null)
  const { timeText, noteText, boxGroups } = writing
  const was = new Map(original.map((m) => [m.id, m]))
  const isChanged = (m: Minyan) => !was.has(m.id) || boxChangeCount([was.get(m.id)!], [m]) > 0

  const editing = open === 'new' ? null : rows.find((m) => m.id === open)
  const title = open === null ? null : open === 'new' ? 'Add a minyan' : TEFILLAH_LABELS[editing!.tefillah]
  useEffect(() => {
    onStep(title ? { title, back: () => setOpen(null) } : null)
  }, [title, onStep])
  useEffect(() => () => onStep(null), [onStep])

  const save = (next: Minyan[]) => {
    setRows(next)
    onChange(next)
    setOpen(null)
  }

  if (open !== null) {
    const start: Minyan = editing ?? { id: crypto.randomUUID(), tefillah: 'shacharis', days: [...BOX_DAYS[box].newRow], time: '' }
    return (
      <OneMinyan
        key={open}
        start={start}
        box={box}
        under={`${boxTitle} · ${place}`}
        onDone={(m) => save(editing ? rows.map((r) => (r.id === m.id ? m : r)) : [...rows, m])}
        onRemove={editing ? () => save(rows.filter((r) => r.id !== editing.id)) : undefined}
      />
    )
  }

  return (
    <div className="space-y-4" data-testid="minyan-box-list">
      <p className="-mt-1 text-[14px] text-muted">{place}</p>
      {boxGroups(rows, box).map((g) => (
        <div key={g.label}>
          <p className="text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-muted">{g.label}</p>
          <ul className="divide-y divide-slate-200/70">
            {g.rows.map((m) => {
              // The week's rows are under their tefillah already: the time
              // and the days. Shabbos's say which tefillah.
              const sub = [box === 'weekday' ? formatDays(m.days) : m.days.length > 1 ? 'Friday night and Shabbos' : null, m.season ? SEASON_LABELS[m.season] : null, noteText(m.notes)].filter(Boolean).join(' · ')
              const changed = isChanged(m)
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(m.id)}
                    className={`flex min-h-13 w-full cursor-pointer items-center gap-2.5 py-2 text-left ${changed ? '-mx-2.5 w-[calc(100%+20px)] rounded-xl bg-yellow-50 px-2.5' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15.5px] text-slate-900">
                        {box === 'shabbos' && (
                          <>
                            <b>{TEFILLAH_LABELS[m.tefillah]}</b>{' '}
                          </>
                        )}
                        <span className={box === 'weekday' ? 'font-bold' : 'text-slate-700'}>{timeText(m)}</span>
                      </span>
                      {sub && <span className="mt-0.5 block text-[13.5px] text-muted">{sub}</span>}
                    </span>
                    {changed && <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[12.5px] font-extrabold text-amber-800">{was.has(m.id) ? 'Changed' : 'New'}</span>}
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {rows.length === 0 && <p className="text-[15px] text-slate-600">No times listed yet.</p>}
      <button
        type="button"
        onClick={() => setOpen('new')}
        className="flex h-11.5 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-300 bg-white text-[15px] font-bold text-primary hover:bg-slate-50"
      >
        <PlusIcon className="h-4 w-4" />
        Add a minyan
      </button>
      {send(boxChangeCount(original, rows))}
    </div>
  )
}

/** One minyan: Add a minyan's screen, with Remove, and More for the rest. */
function OneMinyan({ start, box, under, onDone, onRemove }: { start: Minyan; box: MinyanBox; under: string; onDone: (m: Minyan) => void; onRemove?: () => void }) {
  const [row, setRow] = useState<Minyan>(start)
  const [more, setMore] = useState(!!(start.season || start.notBefore || start.notAfter))
  const modes = useTimeModes()
  const set = (p: Partial<Minyan>) => setRow((r) => ({ ...r, ...p }))
  const relative = !!row.anchor
  const readable = relative || Number.isFinite(parseTimeToMinutes(row.time))
  const view = modes.view(row)
  const choices = BOX_DAYS[box].choices
  const canBeRelative = RELATIVE_ELIGIBLE.includes(row.tefillah)

  return (
    <div className="space-y-4" data-testid="minyan-box-one">
      <p className="-mt-1 text-[14px] text-muted">{under}</p>
      <label className="block space-y-1.5">
        <span className="block text-[14px] font-bold text-slate-700">Tefillah</span>
        <select
          value={row.tefillah}
          onChange={(e) => {
            const tefillah = e.target.value as Tefillah
            set(relative && !RELATIVE_ELIGIBLE.includes(tefillah) ? { ...modes.switchToClock(row), tefillah } : { tefillah })
          }}
          className={`${input} w-full font-semibold`}
        >
          {TEFILLAH_ORDER.filter((t) => t !== 'shabbos_mussaf' || t === row.tefillah).map((t) => (
            <option key={t} value={t}>
              {TEFILLAH_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <p className="text-[14px] font-bold text-slate-700">Time</p>
        {canBeRelative && (
          <div className="flex gap-1 rounded-xl bg-slate-100 p-[3px]" role="group" aria-label="Clock time or from a zman">
            {([[false, 'Clock time'], [true, 'From a zman']] as const).map(([rel, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={relative === rel}
                onClick={() => set(rel ? modes.switchToRelative(row) : modes.switchToClock(row))}
                className={`h-10 flex-1 cursor-pointer rounded-[10px] text-[14.5px] ${relative === rel ? 'bg-white font-bold text-slate-900 shadow-sm' : 'font-semibold text-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {relative ? (
          <div className="flex flex-wrap items-center gap-2">
            <RelativeTimeFields
              anchors={ZMAN_ANCHOR_ORDER}
              anchor={view.anchor}
              direction={view.direction}
              magnitudeText={view.magnitudeText}
              time={row.time}
              inputClass={input}
              onChange={(a, d, m) => set(modes.setRelative(row, a, d, m))}
            />
          </div>
        ) : (
          <input type="text" value={row.time} onChange={(e) => set(modes.setClockTime(row, e.target.value))} placeholder="7:00am" aria-label="Time" className={`${input} w-36`} />
        )}
        {!readable && row.time.trim() && <p className="text-[13px] text-caution">The guide can’t read “{row.time}” as a time. Type it like 6:30pm{canBeRelative ? ', or choose From a zman' : ''}.</p>}
      </div>

      <div className="space-y-2">
        <p className="text-[14px] font-bold text-slate-700">Which days?</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Days">
          {choices.map((d) => (
            <button key={d} type="button" aria-pressed={row.days.includes(d)} onClick={() => set({ days: row.days.includes(d) ? row.days.filter((x) => x !== d) : [...row.days, d] })} className={chip(row.days.includes(d))}>
              {dayLabel(d, box)}
            </button>
          ))}
        </div>
      </div>

      <input type="text" value={row.notes ?? ''} maxLength={120} onChange={(e) => set({ notes: e.target.value || undefined })} placeholder="Note (optional)" aria-label="Note" className={`${input} w-full`} />

      {more ? (
        <div className="space-y-4 border-t border-slate-200/70 pt-4">
          <div className="space-y-2">
            <p className="text-[14px] font-bold text-slate-700">Time of year</p>
            <div className="flex gap-1 rounded-xl bg-slate-100 p-[3px]" role="group" aria-label="Time of year">
              {([undefined, ...(Object.keys(SEASON_LABELS) as Season[])] as const).map((s) => (
                <button
                  key={s ?? 'all'}
                  type="button"
                  aria-pressed={row.season === s}
                  onClick={() => set({ season: s })}
                  className={`h-10 flex-1 cursor-pointer rounded-[10px] text-[14.5px] ${row.season === s ? 'bg-white font-bold text-slate-900 shadow-sm' : 'font-semibold text-muted'}`}
                >
                  {s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : 'All year'}
                </button>
              ))}
            </div>
          </div>
          {/* Earliest and latest clamp a zman that moves; a clock time has
              nothing to clamp. */}
          {relative && (
            <div className="space-y-2">
              <p className="text-[14px] font-bold text-slate-700">But never before</p>
              <div className="flex items-center gap-2">
                <input type="time" value={row.notBefore ?? ''} onChange={(e) => set(modes.setBound(row, { notBefore: e.target.value }) ?? {})} aria-label="Earliest time" className={`${input} w-32`} />
                <span className="text-[14.5px] text-muted">or after</span>
                <input type="time" value={row.notAfter ?? ''} onChange={(e) => set(modes.setBound(row, { notAfter: e.target.value }) ?? {})} aria-label="Latest time" className={`${input} w-32`} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setMore(true)} className="inline-flex cursor-pointer items-center gap-1 text-[14.5px] font-bold text-primary">
          More
          <ChevronRightIcon className="h-4 w-4 rotate-90" />
        </button>
      )}

      <div className="space-y-1 pt-2">
        {onRemove && (
          <button type="button" onClick={onRemove} className="min-h-11 w-full cursor-pointer text-center text-[15px] font-bold text-red-700 hover:underline">
            Remove this minyan
          </button>
        )}
        <button type="button" disabled={!readable || !row.time.trim() || row.days.length === 0} onClick={() => onDone(row)} className={SUBMIT_PILL}>
          Done
        </button>
      </div>
    </div>
  )
}
