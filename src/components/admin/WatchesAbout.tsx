'use client'

import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { AdminBack, AdminBox, AdminRow } from './AdminUI'

// ── Watches → How watches work (Nov 9) ──────────────────────────────────────
// The user, Nov 9: "watches is very important but also something that
// could be confusing to an admin." What a watch is, what each one reads
// and how often, and what's left to the admin, on a screen of its own: a
// field's Watched line links here (FieldScreen's WhatThisIs), and so does
// the Watches page, so Back returns to whichever it came from.
//
// Each line is what the jobs really do, at their schedules (NIGHTLY_JOBS in
// jobRuns.ts, vercel.json): Google writes straight onto the listing, except
// a field typed in by hand (googlePlaces.ts); the watches, shul emails and
// look-again file what they find as suggestions (cron/watches,
// newsletterRun.ts), an eruv's up-or-down email excepted (eruvEmail.ts).

export const READS: readonly { who: string; what: string }[] = [
  {
    who: 'Google',
    what: 'Every night, whether each place is still open. About once a week, its hours, phone and website, straight onto the listing. A field someone typed in by hand stays as they typed it.',
  },
  {
    who: 'Websites, menus and lists',
    what: 'Every night: a place’s own website, its menu, the kosher agencies’ lists and Refuah. What changed waits on To do for your yes.',
  },
  { who: 'Emails', what: 'As they come in. What a shul’s email changes waits on To do. An eruv’s up or down goes live at once.' },
  { who: 'Links', what: 'Every Sunday, each link nothing else reads is opened, to see it still works.' },
  { who: 'Look again', what: 'What a watch couldn’t find is tried again a month later.' },
]

export default function WatchesAbout() {
  const base = adminBase(useCommunitySlug())
  return (
    <div className="flex flex-col gap-3">
      <AdminBack back={{ label: 'Watches', href: `${base}/watches` }} title="How watches work" />
      <p className="m-0 rounded-[10px] border border-slate-200 bg-white px-4 py-3.5 text-lg font-semibold leading-snug text-slate-900">
        A watch is the site reading a source on its own, so a listing stays right without anyone retyping it.
      </p>
      <AdminBox title="What’s read, and when">
        <ul className="m-0 p-0 list-none divide-y divide-slate-100">
          {READS.map((r) => (
            <li key={r.who} className="flex flex-col gap-0.5 px-4 py-3">
              <span className="text-[15px] font-semibold text-slate-900">{r.who}</span>
              <span className="text-[15px] leading-normal text-slate-700">{r.what}</span>
            </li>
          ))}
        </ul>
      </AdminBox>
      <AdminBox title="What you do">
        <AdminRow href={`${base}/places`} name="Add a place’s sources" line="In Places: its website, its menu link, its emails" />
        <AdminRow href={base} name="Say yes or no to what’s found" line="On To do, with any check that broke" />
        <AdminRow href={`${base}/watches`} name="Turn a job off" line="On its page in Watches" />
      </AdminBox>
    </div>
  )
}
