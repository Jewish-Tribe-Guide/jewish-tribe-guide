'use client'

import { useId, useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'
import type { SpecialSchedule } from '@/lib/schedules'
import type { ReadTime } from '@/lib/scheduleReader'
import SchedulesInput from '@/components/intake/SchedulesInput'
import TurnstileWidget from '@/components/TurnstileWidget'
import { TURNSTILE_ACTIVE } from './useListingSubmit'

// "Know their Sukkos times? Add them" on a shul's card (step 4, agreed
// Oct 1). Three ways in, the first two the user's idea:
//   - Paste their message: the WhatsApp message or email the shul sent.
//   - Add a photo or PDF: the flyer, or the board.
//   - Or type them in.
// The first two are read by the AI (/api/schedule/read) into the schedule
// editor, each time with the words it came from and anything it wasn't sure
// of, for the person to check. Then, as typing, it's sent as an edit
// suggestion (/api/resource/:id/schedule) for an admin to check, with what
// it was read from. Each send needs its own bot check.

type Reading = { schedule: SpecialSchedule; times: ReadTime[]; missing: string | null; sourceUrl: string | null }
type Step = 'choose' | 'paste' | 'type' | 'check'

export default function AddScheduleBox({ item, festival, onSent, onClose }: { item: DirectoryResource; festival: string; onSent: () => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>('choose')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  const [schedules, setSchedules] = useState<SpecialSchedule[]>([])
  const [busy, setBusy] = useState<'read' | 'send' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const textId = useId()
  const ready = schedules.find((s) => s.minyanim.length > 0)

  // ── Reading what they sent ───────────────────────────────────────────────
  const read = async (token: string, what: { text?: string; file?: File }) => {
    try {
      const body = new FormData()
      body.set('listingId', item.id)
      body.set('festival', festival)
      body.set('turnstileToken', token)
      body.set('company', '')
      if (what.file) body.set('file', what.file)
      else body.set('text', what.text ?? '')
      const res = await fetch('/api/schedule/read', { method: 'POST', body })
      const json = (await res.json().catch(() => ({}))) as Partial<Reading> & { ok?: boolean; error?: string; code?: string }
      if (!res.ok || !json.ok || !json.schedule) {
        if (json.code === 'off') setStep('type')
        throw new Error(json.error ?? 'failed')
      }
      const r: Reading = { schedule: json.schedule, times: json.times ?? [], missing: json.missing ?? null, sourceUrl: json.sourceUrl ?? null }
      setReading(r)
      setSchedules([r.schedule])
      setStep('check')
    } catch (e) {
      setError(e instanceof Error && e.message !== 'failed' ? e.message : 'Couldn’t read it right now. Please try again, or type the times in.')
    } finally {
      setBusy(null)
    }
  }

  // ── Sending it for a check ───────────────────────────────────────────────
  const send = async (token: string) => {
    try {
      const res = await fetch(`/api/resource/${item.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: ready, source: reading && !file ? text : undefined, sourceUrl: reading?.sourceUrl ?? undefined, turnstileToken: token, company: '' }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'failed')
      onSent()
    } catch (e) {
      setError(e instanceof Error && e.message !== 'failed' ? e.message : 'That didn’t send. Please try again.')
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
    <div className="mt-2 rounded-[10px] border border-slate-300 bg-white p-2.5" data-testid="add-schedule">
      {step === 'choose' && (
        <div className="space-y-2">
          <button type="button" onClick={() => setStep('paste')} className={`${big} border-primary bg-primary/5`}>
            <span className="text-[15.5px] font-extrabold text-slate-900">Paste their message</span>
            <span className="mt-0.5 text-[13px] leading-snug text-slate-600">The WhatsApp message or email the shul sent. The guide reads the times out of it for you to check.</span>
          </button>
          <button type="button" disabled={busy === 'read'} onClick={() => fileInput.current?.click()} className={`${big} border-slate-200`}>
            <span className="text-[15.5px] font-extrabold text-slate-900">{busy === 'read' ? 'Reading…' : 'Add a photo or PDF'}</span>
            <span className="mt-0.5 text-[13px] leading-snug text-slate-600">The flyer they emailed, or the schedule on the shul’s board. Read the same way.</span>
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
              setFile(f)
              start('read', (token) => void read(token, { file: f }))
            }}
          />
          <button type="button" onClick={() => setStep('type')} className="cursor-pointer text-[14.5px] font-bold text-primary hover:underline">
            Or type them in ›
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
            placeholder="Paste the schedule they sent"
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

      {step === 'check' && reading && (
        <div className="mb-2 space-y-2" data-testid="schedule-read">
          {!file && text && (
            <div className="rounded-[10px] bg-slate-100 px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-line text-slate-700">
              <b className="text-slate-900">What you pasted</b>
              {'\n'}
              {text}
            </div>
          )}
          {file && reading.sourceUrl && (
            <a href={reading.sourceUrl} target="_blank" rel="noopener noreferrer" className="block text-[13px] font-semibold text-primary hover:underline">
              Your {file.type === 'application/pdf' ? 'PDF' : 'photo'} ↗
            </a>
          )}
          <p className="text-[13.5px] leading-snug text-slate-700">
            Read into the guide’s times. <b>Check each one</b>: under each is what it came from.
          </p>
          {reading.times.length === 0 && <p className="text-[13.5px] font-semibold text-caution">No times could be read from it. Type them in below.</p>}
          {reading.missing && <p className="text-[13px] leading-snug text-caution">{reading.missing} Those days show “not posted”, not a guess.</p>}
        </div>
      )}

      {(step === 'type' || step === 'check') && (
        <SchedulesInput
          key={step}
          value={step === 'check' && reading ? [reading.schedule] : undefined}
          onChange={setSchedules}
          startWith={step === 'type' ? festival : undefined}
          readFrom={step === 'check' && reading ? Object.fromEntries(reading.times.map((t) => [t.id, { quote: t.quote, checked: t.checked, ...(t.unsure ? { unsure: t.unsure } : {}) }])) : undefined}
        />
      )}

      {(step === 'type' || step === 'check') && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={!ready || busy === 'send'}
            onClick={() => start('send', (token) => void send(token))}
            className="h-10 flex-1 cursor-pointer rounded-[10px] bg-primary text-[14.5px] font-bold text-white hover:bg-primary-dark disabled:cursor-default disabled:opacity-45"
          >
            {busy === 'send' ? 'Sending…' : 'Send for a check'}
          </button>
        </div>
      )}
      <button type="button" onClick={onClose} className="mt-2 cursor-pointer text-[14px] font-bold text-slate-500 hover:text-slate-700">
        Cancel
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[13.5px] text-red-700">
          {error}
        </p>
      )}
      <p className="mt-2 text-[12.5px] leading-snug text-muted">
        {step === 'check' ? 'What you sent goes with it, so the admin checks the times against it. ' : ''}An admin checks them before anyone sees them.
      </p>
      {busy && TURNSTILE_ACTIVE && <TurnstileWidget key={attempt} onVerify={(token) => pending.current(token)} />}
    </div>
  )
}
