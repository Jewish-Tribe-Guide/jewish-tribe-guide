'use client'

import { useId, useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'
import { parseTimeToMinutes, RELATIVE_ELIGIBLE, TEFILLAH_LABELS, TEFILLAH_ORDER, type Minyan, type Tefillah } from '@/lib/davening'
import { DAY_KEYS, dayLabel, type DayKey } from '@/lib/hours'
import { dateText } from '@/lib/schedules'
import { changesAnything, compareTimes, datesBetween, seasonFromNotes, type TimesUpdate, type UpdateRow } from '@/lib/scheduleUpdate'
import { clockTime } from '@/lib/upcomingDavening'
import { RelativeTimeFields, TimeModeToggle, useTimeModes, ZMAN_ANCHOR_ORDER } from '@/components/intake/ZmanTimeFields'
import TurnstileWidget from '@/components/TurnstileWidget'
import { TURNSTILE_ACTIVE } from './useListingSubmit'

// "Update their times" on a shul's card (agreed Oct 1). The user's words:
// a shul that redoes its times doesn't want to "go one by one and compare
// what we have and what they now have. They just want to upload what they
// have", see the end result, and "either edit or submit that".
//
//   - Paste their message, or add a photo or PDF: the AI reads it
//     (/api/schedule/read, kind=regular) and the guide compares it with the
//     shul's times (scheduleUpdate.ts).
//   - Or add one time: the same screen, starting from their times as they
//     are.
//
// Either way, one screen: the shul's times as the guide will show them,
// day by day. A changed time has the old one crossed out beside it, a new
// one says New, one coming off is crossed out with Keep. Tap a time to fix
// it; Send files it for an admin to check (/api/resource/:id/times). When
// nothing differs, it says so and confirms the times instead.

type Step = 'choose' | 'paste' | 'result'
type Source = { text: string } | { file: File; url: string | null }

const inputClass = 'rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-primary focus:outline-none'

/** "6:12 PM" for a clock time; a rule as the guide writes it. */
export function shownTime(time: string): string {
  const m = parseTimeToMinutes(time)
  return Number.isFinite(m) ? clockTime(m) : time
}

const isWeekday = (d: string): d is DayKey => (DAY_KEYS as readonly string[]).includes(d)
const dayName = (d: DayKey) => (d === 'sat' ? 'Shabbos' : dayLabel(d))

/** "Friday", "Shabbos · Oct 10", "Thanksgiving · Thu Nov 26". */
function dayHeading(day: string, kind: TimesUpdate['kind'], occasion?: string): string {
  if (isWeekday(day)) return dayName(day)
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay()
  if (kind === 'week') return `${dayName(DAY_KEYS[wd])} · ${dateText(day)}`
  return `${occasion ? `${occasion} · ` : ''}${dateText(day, { weekday: true })}`
}

/** The shul's times as they are, every season's, as a result to add to
 *  (Or add one time). */
function asTheyAre(minyanim: Minyan[]): TimesUpdate {
  return compareTimes(minyanim, { kind: 'schedule', complete: false, season: null, title: null, startsOn: null, from: null, to: null, times: [] }, { season: null })
}

export default function UpdateTimesBox({ item, minyanim, onSent, onClose }: { item: DirectoryResource; minyanim: Minyan[]; onSent: (what: 'sent' | 'confirmed') => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>('choose')
  const [text, setText] = useState('')
  const [source, setSource] = useState<Source | null>(null)
  const [update, setUpdate] = useState<TimesUpdate | null>(null)
  const [addFirst, setAddFirst] = useState(false)
  const [busy, setBusy] = useState<'read' | 'send' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const textId = useId()

  const read = async (token: string, what: { text?: string; file?: File }) => {
    try {
      const body = new FormData()
      body.set('listingId', item.id)
      body.set('kind', 'regular')
      body.set('turnstileToken', token)
      body.set('company', '')
      if (what.file) body.set('file', what.file)
      else body.set('text', what.text ?? '')
      const res = await fetch('/api/schedule/read', { method: 'POST', body })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string; update?: TimesUpdate; sourceUrl?: string | null }
      if (!res.ok || !json.ok || !json.update) {
        if (json.code === 'off') {
          setUpdate(asTheyAre(minyanim))
          setAddFirst(true)
          setStep('result')
        }
        throw new Error(json.error ?? 'failed')
      }
      setSource(what.file ? { file: what.file, url: json.sourceUrl ?? null } : { text: what.text ?? '' })
      setUpdate(json.update)
      setStep('result')
    } catch (e) {
      setError(e instanceof Error && e.message !== 'failed' ? e.message : 'Couldn’t read it right now. Please try again, or add a time yourself.')
    } finally {
      setBusy(null)
    }
  }

  const send = async (token: string, u: TimesUpdate) => {
    try {
      const res = await fetch(`/api/resource/${item.id}/times`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update: u,
          source: source && 'text' in source ? source.text : undefined,
          sourceUrl: source && 'file' in source ? (source.url ?? undefined) : undefined,
          turnstileToken: token,
          company: '',
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'failed')
      onSent('sent')
    } catch (e) {
      setError(e instanceof Error && e.message !== 'failed' ? e.message : 'That didn’t send. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const confirm = async () => {
    setBusy('send')
    setError(null)
    try {
      const res = await fetch(`/api/resource/${item.id}/confirm`, { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean }
      if (!res.ok || !json.ok) throw new Error('failed')
      onSent('confirmed')
    } catch {
      setError('That didn’t go through. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const pending = useRef<(token: string) => void>(() => {})
  const start = (kind: 'read' | 'send', run: (token: string) => void) => {
    setBusy(kind)
    setError(null)
    setAttempt((n) => n + 1)
    pending.current = run
    if (!TURNSTILE_ACTIVE) run('')
  }

  const big =
    'flex w-full cursor-pointer flex-col items-start rounded-xl border-[1.5px] px-3.5 py-3 text-left transition-colors hover:bg-slate-50 disabled:cursor-default disabled:opacity-60'

  return (
    <div className="mt-2 rounded-[10px] border border-slate-300 bg-white p-2.5" data-testid="update-times">
      {step === 'choose' && (
        <div className="space-y-2">
          <p className="text-[15.5px] font-extrabold text-slate-900">{item.name}’s times</p>
          <p className="text-[13.5px] leading-snug text-muted">A whole schedule or one Shabbos’s times, either works. The guide compares it with the times it has.</p>
          <button type="button" onClick={() => setStep('paste')} className={`${big} border-primary bg-primary/5`}>
            <span className="text-[15.5px] font-extrabold text-slate-900">Paste their message</span>
            <span className="mt-0.5 text-[13px] leading-snug text-slate-600">The email, WhatsApp message or newsletter the shul sent.</span>
          </button>
          <button type="button" disabled={busy === 'read'} onClick={() => fileInput.current?.click()} className={`${big} border-slate-200`}>
            <span className="text-[15.5px] font-extrabold text-slate-900">{busy === 'read' ? 'Reading…' : 'Add a photo or PDF'}</span>
            <span className="mt-0.5 text-[13px] leading-snug text-slate-600">The schedule on the shul’s board, or the flyer they emailed.</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            className="hidden"
            aria-label="A photo or PDF of their schedule"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              start('read', (token) => void read(token, { file: f }))
            }}
          />
          <button
            type="button"
            onClick={() => {
              setUpdate(asTheyAre(minyanim))
              setAddFirst(true)
              setStep('result')
            }}
            className="cursor-pointer text-[14.5px] font-bold text-primary hover:underline"
          >
            Or add one time ›
          </button>
        </div>
      )}

      {step === 'paste' && (
        <div>
          <label htmlFor={textId} className="text-[14px] font-bold text-slate-900">
            Their message
          </label>
          <textarea
            id={textId}
            autoFocus
            rows={7}
            value={text}
            maxLength={8000}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the schedule or Shabbos times they sent"
            className="mt-1.5 w-full rounded-[10px] border-2 border-slate-300 px-3 py-2 text-[15px] text-slate-900 outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={text.trim().length < 10 || busy === 'read'}
            onClick={() => start('read', (token) => void read(token, { text }))}
            className="mt-2 h-10 w-full cursor-pointer rounded-[10px] bg-primary text-[14.5px] font-bold text-white hover:bg-primary-dark disabled:cursor-default disabled:opacity-45"
          >
            {busy === 'read' ? 'Reading…' : 'Read the times'}
          </button>
        </div>
      )}

      {step === 'result' && update && (
        <TimesResult
          name={item.name}
          initial={update}
          source={source}
          addFirst={addFirst}
          busy={busy === 'send'}
          onSend={(u) => start('send', (token) => void send(token, u))}
          onConfirm={() => void confirm()}
        />
      )}

      <button type="button" onClick={onClose} className="mt-2 cursor-pointer text-[14px] font-bold text-slate-500 hover:text-slate-700">
        Cancel
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[13.5px] text-red-700">
          {error}
        </p>
      )}
      {busy && TURNSTILE_ACTIVE && <TurnstileWidget key={attempt} onVerify={(token) => pending.current(token)} />}
    </div>
  )
}

// ── The result: their times as the guide will show them ─────────────────────

function TimesResult({
  name,
  initial,
  source,
  addFirst,
  busy,
  onSend,
  onConfirm,
}: {
  name: string
  initial: TimesUpdate
  source: Source | null
  addFirst: boolean
  busy: boolean
  onSend: (u: TimesUpdate) => void
  onConfirm: () => void
}) {
  const [rows, setRows] = useState(initial.rows)
  const [editing, setEditing] = useState<string | null>(addFirst ? 'new' : null)
  const [showSource, setShowSource] = useState(false)
  const u = { ...initial, rows }
  const week = u.kind === 'week'
  const anything = changesAnything(u)

  // Days in order: the week's dates, or Sunday to Shabbos then one-offs.
  const days = week && u.from && u.to ? datesBetween(u.from, u.to) : [...DAY_KEYS, ...[...new Set(rows.map((r) => r.day).filter((d) => !isWeekday(d)))].sort()]
  const byDay = days.map((day) => ({ day, rows: rows.filter((r) => r.day === day) })).filter((d) => d.rows.length > 0)

  const title = week
    ? `${name}, ${dateText(u.from!, { weekday: true })}${u.to !== u.from ? ` – ${dateText(u.to!, { weekday: true })}` : ''}`
    : `${name}’s ${u.season ? `${u.season} ` : ''}times${u.startsOn ? `, from ${dateText(u.startsOn, { weekday: true })}` : ''}`

  const patch = (id: string, p: Partial<UpdateRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))

  return (
    <div data-testid="times-result">
      {source && 'text' in source && (
        <div className="rounded-[10px] bg-slate-100 px-3 py-2 text-[13.5px]">
          <button type="button" onClick={() => setShowSource((v) => !v)} aria-expanded={showSource} className="flex w-full cursor-pointer justify-between text-left">
            <span className="text-slate-700">From the message you pasted</span>
            <b className="text-primary">{showSource ? 'Hide' : 'Show'}</b>
          </button>
          {showSource && <p className="mt-1.5 text-[12.5px] leading-relaxed whitespace-pre-line text-slate-700">{source.text}</p>}
        </div>
      )}
      {source && 'file' in source && source.url && (
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="block text-[13px] font-semibold text-primary hover:underline">
          From your {source.file.type === 'application/pdf' ? 'PDF' : 'photo'} ↗
        </a>
      )}

      <p className="mt-3 text-[17px] leading-tight font-extrabold text-slate-900">{title}</p>
      {week && u.title && <p className="mt-0.5 text-[13.5px] font-semibold text-slate-700">{u.title}</p>}
      <p className="mt-1 text-[13.5px] leading-snug text-slate-600">
        How they’ll show in the guide.{week ? ' Other weeks stay as they are.' : ''} Tap a time to fix it.
      </p>

      {byDay.length === 0 && <p className="mt-3 text-[13.5px] font-semibold text-caution">No times could be read from it. Add them below.</p>}

      {byDay.map(({ day, rows: dayRows }) => (
        <div key={day} className="mt-3" data-testid="result-day">
          <p className="text-[12.5px] font-extrabold tracking-wide text-muted uppercase">{dayHeading(day, u.kind, dayRows.find((r) => r.occasion)?.occasion)}</p>
          {dayRows.map((r) =>
            editing === r.id ? (
              <RowEditor
                key={r.id}
                row={r}
                days={null}
                week={week}
                onDone={(next) => {
                  setRows((rs) => rs.map((x) => (x.id === r.id ? edited(x, next) : x)))
                  setEditing(null)
                }}
                onRemove={() => {
                  setRows((rs) => (r.rowId ? rs.map((x) => (x.id === r.id ? { ...x, status: 'gone', keep: false } : x)) : rs.filter((x) => x.id !== r.id)))
                  setEditing(null)
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <ResultRow key={r.id} row={r} week={week} onEdit={() => setEditing(r.id)} onPatch={(p) => patch(r.id, p)} />
            ),
          )}
        </div>
      ))}

      {editing === 'new' ? (
        <RowEditor
          row={{ id: 'new', day: week && u.from ? u.from : 'sun', tefillah: 'shacharis', time: '', status: 'new' }}
          days={days}
          week={week}
          onDone={(next) => {
            setRows((rs) => [...rs, { ...next, id: crypto.randomUUID(), status: 'new' }])
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" onClick={() => setEditing('new')} className="mt-3 cursor-pointer text-[14.5px] font-bold text-primary hover:underline">
          + Add a time
        </button>
      )}

      {u.season && u.otherSeason > 0 && <p className="mt-3 text-[13px] text-muted">Their {u.season === 'winter' ? 'summer' : 'winter'} times stay as they are.</p>}

      {anything ? (
        <>
          <button
            type="button"
            disabled={busy || editing !== null}
            onClick={() => onSend(u)}
            className="mt-4 h-11 w-full cursor-pointer rounded-xl bg-primary text-[15.5px] font-bold text-white hover:bg-primary-dark disabled:cursor-default disabled:opacity-45"
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
          <p className="mt-2 text-[12.5px] leading-snug text-muted">An admin checks it against {source ? 'what you sent' : 'the shul’s times'} before anyone sees it.</p>
        </>
      ) : (
        rows.length > 0 &&
        editing === null && (
          <>
            <p className="mt-4 text-[14px] font-semibold text-emerald-700">Everything matches what the guide has.</p>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="mt-2 h-11 w-full cursor-pointer rounded-xl border-[1.5px] border-primary bg-white text-[15px] font-bold text-primary hover:bg-primary/5 disabled:opacity-45"
            >
              {busy ? 'Saving…' : 'Mark them confirmed'}
            </button>
          </>
        )
      )}
    </div>
  )
}

/** A row after the person fixed it: one the shul had becomes a change,
 *  with what it was, or plainly theirs again when put back as it was. */
function edited(before: UpdateRow, next: UpdateRow): UpdateRow {
  if (before.status === 'new' || !before.rowId) return { ...next, status: before.status }
  const was = before.status === 'changed' ? before.was : before.time
  const unchanged = before.status === 'changed' ? false : next.tefillah === before.tefillah && next.time === before.time && next.notes === before.notes
  if (unchanged) return { ...next, status: before.status }
  if (next.time === was && next.tefillah === before.tefillah) return { ...next, status: 'kept', was: undefined }
  return { ...next, status: 'changed', was, keep: undefined }
}

function ResultRow({ row: r, week, onEdit, onPatch }: { row: UpdateRow; week: boolean; onEdit: () => void; onPatch: (p: Partial<UpdateRow>) => void }) {
  const label = TEFILLAH_LABELS[r.tefillah]
  // "Winter only" in a note becomes the minyan's season when it's sent
  // (scheduleUpdate.ts), so it isn't shown as a note here.
  const note = seasonFromNotes(r).notes
  if (r.status === 'gone' && !r.keep) {
    return (
      <div className="flex items-center justify-between border-t border-slate-200 py-2" data-status="gone">
        <span className="text-[15px] text-muted line-through">
          {label} · {shownTime(r.time)}
        </span>
        <button type="button" onClick={() => onPatch({ keep: true })} className="cursor-pointer text-[13.5px] font-bold text-primary hover:underline">
          Keep
        </button>
      </div>
    )
  }
  return (
    <div className="border-t border-slate-200 py-2" data-status={r.status}>
      <button type="button" onClick={onEdit} className="flex w-full cursor-pointer items-baseline justify-between gap-2 text-left" aria-label={`${label}, ${shownTime(r.time)}. Fix it`}>
        <span className="text-[15px] text-slate-900">
          {label}
          {r.status === 'new' && <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-px text-[11.5px] font-extrabold text-primary">New</span>}
          {note && <span className="text-[13px] text-muted"> · {note}</span>}
        </span>
        <span className="shrink-0 whitespace-nowrap">
          {r.status === 'changed' && r.was && <span className="mr-1.5 text-[14px] text-muted line-through">{shownTime(r.was)}</span>}
          <b className="text-[15px] text-slate-900">{shownTime(r.time)}</b>
        </span>
      </button>
      {r.status === 'gone' && r.keep && (
        <button type="button" onClick={() => onPatch({ keep: false })} className="mt-0.5 cursor-pointer text-[13px] font-bold text-muted hover:underline">
          Kept · take it off
        </button>
      )}
      {week && r.status === 'changed' && r.rowId && (
        <button type="button" onClick={() => onPatch({ everyWeek: !r.everyWeek })} aria-pressed={!!r.everyWeek} className="mt-0.5 block cursor-pointer text-left text-[13px] font-bold text-primary hover:underline">
          {r.everyWeek ? '✓ Their usual time from now on · undo' : 'Their usual time now? Change it every week'}
        </button>
      )}
      {r.unsure && <p className="mt-0.5 text-[12.5px] leading-snug text-caution">Check this one: {r.unsure}</p>}
    </div>
  )
}

/** Fixing one time, or adding one: the tefillah, the time (a clock time or
 *  from a zman, as the shul's own editor sets it), a note, and for a new
 *  one, its day. */
function RowEditor({
  row,
  days,
  week,
  onDone,
  onRemove,
  onCancel,
}: {
  row: UpdateRow
  /** The days to choose from, for a new time. */
  days: string[] | null
  week: boolean
  onDone: (r: UpdateRow) => void
  onRemove?: () => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<UpdateRow>(row)
  const modes = useTimeModes()
  const set = (p: Partial<UpdateRow>) => setDraft((d) => ({ ...d, ...p }))
  const relative = !!draft.anchor
  const canBeRelative = RELATIVE_ELIGIBLE.includes(draft.tefillah)
  const view = modes.view(draft)
  const readable = relative || Number.isFinite(parseTimeToMinutes(draft.time))

  return (
    <div className="my-1.5 space-y-2 rounded-[10px] border border-primary/40 bg-primary/5 p-2.5" data-testid="row-editor">
      <div className="flex flex-wrap items-center gap-2">
        {days && (
          <select value={draft.day} onChange={(e) => set({ day: e.target.value })} aria-label="Day" className={inputClass}>
            {days.map((d) => (
              <option key={d} value={d}>
                {dayHeading(d, week ? 'week' : 'schedule')}
              </option>
            ))}
          </select>
        )}
        <select
          value={draft.tefillah}
          onChange={(e) => {
            const tefillah = e.target.value as Tefillah
            set(relative && !RELATIVE_ELIGIBLE.includes(tefillah) ? { ...modes.switchToClock(draft), tefillah } : { tefillah })
          }}
          aria-label="Tefillah"
          className={inputClass}
        >
          {TEFILLAH_ORDER.map((t) => (
            <option key={t} value={t}>
              {TEFILLAH_LABELS[t]}
            </option>
          ))}
        </select>
        {canBeRelative && <TimeModeToggle relative={relative} label="From a zman" onClock={() => set(modes.switchToClock(draft))} onRelative={() => set(modes.switchToRelative(draft))} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {relative ? (
          <RelativeTimeFields
            anchors={ZMAN_ANCHOR_ORDER}
            anchor={view.anchor}
            direction={view.direction}
            magnitudeText={view.magnitudeText}
            time={draft.time}
            inputClass={inputClass}
            onChange={(a, dir, mag) => set(modes.setRelative(draft, a, dir, mag))}
          />
        ) : (
          <input type="text" value={draft.time} onChange={(e) => set(modes.setClockTime(draft, e.target.value))} placeholder="e.g. 7:00am" aria-label="Time" className={`${inputClass} w-28`} />
        )}
      </div>
      <input type="text" value={draft.notes ?? ''} maxLength={120} onChange={(e) => set({ notes: e.target.value || undefined })} placeholder="Note (optional)" aria-label="Note" className={`${inputClass} w-full`} />
      {!readable && draft.time.trim() && <p className="text-[12.5px] text-caution">The guide can’t read “{draft.time}” as a time. Type it like 6:30pm, or choose From a zman.</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!draft.time.trim() || !readable}
          onClick={() => onDone(draft)}
          className="h-9 cursor-pointer rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-dark disabled:cursor-default disabled:opacity-45"
        >
          Done
        </button>
        <button type="button" onClick={onCancel} className="cursor-pointer text-[14px] font-bold text-slate-500 hover:text-slate-700">
          Cancel
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove} className="ml-auto cursor-pointer text-[14px] font-bold text-red-700 hover:underline">
            Take it off
          </button>
        )}
      </div>
    </div>
  )
}
