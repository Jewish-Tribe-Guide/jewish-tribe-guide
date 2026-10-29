'use client'

import Link from 'next/link'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { setupSteps, type SetupState } from '@/lib/setup'
import { Chevron } from './AdminUI'

// To do's "Set up your guide" (board "Setup"): four rows, each opening the
// screen that does it, ticked when it's saved. Gone once all four are done.

export default function SetupChecklist({ setup }: { setup: SetupState }) {
  const base = adminBase(useCommunitySlug())
  const steps = setupSteps(setup, base)
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return null

  return (
    <section aria-label="Set up your guide" className="bg-white border border-slate-200 rounded-[10px]">
      <div className="px-4 pt-3.5 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <h2 className="flex-1 m-0 text-base font-bold text-slate-900">Set up your guide</h2>
          <span className="text-[13px] text-slate-600">
            {done} of {steps.length} done
          </span>
        </div>
        <div className="mt-2.5 h-1.5 rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
          <div className="h-full bg-green-700" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ul className="m-0 p-0 list-none">
        {steps.map((s) => (
          <li key={s.key} className="border-b border-slate-100 last:border-b-0">
            <Link href={s.href} className="flex items-center gap-3 px-4 py-2.5 min-h-[56px] text-left hover:bg-slate-50" data-done={s.done}>
              {s.done ? (
                <span className="shrink-0 grid place-items-center w-6 h-6 rounded-full bg-green-700" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.4">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                </span>
              ) : (
                <span className="shrink-0 w-6 h-6 rounded-full border-2 border-slate-400" aria-hidden="true" />
              )}
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className={`text-[15px] font-semibold ${s.done ? 'text-slate-500' : 'text-slate-900'}`}>{s.name}</span>
                <span className="text-[13px] text-slate-600">{s.done ? 'Done' : s.line}</span>
              </span>
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
