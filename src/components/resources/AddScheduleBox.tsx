'use client'

import { useState } from 'react'
import type { DirectoryResource } from '@/types'
import type { SpecialSchedule } from '@/lib/schedules'
import SchedulesInput from '@/components/intake/SchedulesInput'
import TurnstileWidget from '@/components/TurnstileWidget'
import { TURNSTILE_ACTIVE } from './useListingSubmit'

// "Know their Sukkos times? Add them" on a shul's card (step 4, agreed
// Oct 1): the schedule editor, started on the festival, then sent as an
// edit suggestion (POST /api/resource/:id/schedule) for an admin to check,
// with the bot check, as "+ Add an item" is.

export default function AddScheduleBox({ item, festival, onSent, onClose }: { item: DirectoryResource; festival: string; onSent: () => void; onClose: () => void }) {
  const [schedules, setSchedules] = useState<SpecialSchedule[]>([])
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const ready = schedules.find((s) => s.minyanim.length > 0)

  const send = async (token: string) => {
    try {
      const res = await fetch(`/api/resource/${item.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: ready, turnstileToken: token, company: '' }),
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
  const submit = () => {
    if (!ready) return
    setBusy(true)
    setError(null)
    setAttempt((n) => n + 1)
    if (!TURNSTILE_ACTIVE) void send('')
  }

  return (
    <div className="mt-2 rounded-[10px] border border-slate-300 bg-white p-2.5" data-testid="add-schedule">
      <SchedulesInput value={undefined} onChange={setSchedules} startWith={festival} />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={submit}
          className="h-10 flex-1 cursor-pointer rounded-[10px] bg-primary text-[14.5px] font-bold text-white hover:bg-primary-dark disabled:cursor-default disabled:opacity-45"
        >
          {busy ? 'Sending…' : 'Send for a check'}
        </button>
        <button type="button" onClick={onClose} className="h-10 cursor-pointer px-3 text-[14.5px] font-bold text-slate-500 hover:text-slate-700">
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13.5px] text-red-700">
          {error}
        </p>
      )}
      <p className="mt-2 text-[12.5px] leading-snug text-muted">An admin checks them before anyone sees them.</p>
      {busy && TURNSTILE_ACTIVE && <TurnstileWidget key={attempt} onVerify={(token) => void send(token)} />}
    </div>
  )
}
