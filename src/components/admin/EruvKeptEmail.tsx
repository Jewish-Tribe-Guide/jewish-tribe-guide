'use client'

import { shortDay } from '@/lib/eruv'
import type { AdminEruv } from '@/lib/eruvStore'

// On the Watches tab since Oct 19 (eruv status moved there from Eruvim).

/** The last email from an eruv the guide couldn't make out, and the admin
 *  saying what it says: its status goes live at once, as a read one does. */
export default function EruvKeptEmail({ eruv, timezone, busy, onSays }: { eruv: AdminEruv; timezone: string; busy: boolean; onSays: (says: 'up' | 'down' | 'neither') => void }) {
  const kept = eruv.statusEmailKept
  if (!kept) return null
  const button = 'cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
  return (
    <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="eruv-kept-email">
      <p className="font-semibold">
        {kept.words ? 'Their email says both up and down' : 'Their email doesn’t say up or down'}: “{kept.subject}”, {shortDay(kept.sentAt, timezone)}
      </p>
      <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-line text-xs text-slate-700">{kept.text}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => onSays('up')} className={button}>
          It says up
        </button>
        <button type="button" disabled={busy} onClick={() => onSays('down')} className={button}>
          It says down
        </button>
        <button type="button" disabled={busy} onClick={() => onSays('neither')} className={button}>
          Not about the status
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">Up or down shows on the site at once, for the week the email was sent.</p>
    </div>
  )
}

