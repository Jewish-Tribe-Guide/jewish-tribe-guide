'use client'

import Link from 'next/link'
import { community } from '@/community.config'
import { PeopleIcon } from '@/components/icons'

// ── The "kept by the community" card ────────────────────────────────────────
// Desktop mockup match (Phase 6, docs/desktop-mockup-plan.md): this used to
// carry the site's Add/Edit/Report actions directly (ContributeButton, its
// own picker flows) — that job has moved to the new, dedicated Suggest a
// Listing card beside this one in the same 3-up row (see Landing.tsx's own
// community-row doc), so this card goes back to being what its own heading
// always said it was: a short statement about who keeps this guide current,
// not another set of action buttons. The Add/Edit/Report entry points
// themselves aren't gone — Suggest a Listing's "Submit a Listing" button
// still opens ContributePicker; there just isn't a second copy of that
// mechanism here too. EditReportPicker (Edit/Report's own picker, distinct
// from ContributePicker's Add flow) has no caller left after this and is
// deleted along with its test.
//
// The old "Send a note →" general-feedback line is gone too — feedback is
// still reachable from the header's More menu and the footer, so this card
// doesn't need to duplicate that entry point on top of losing its own
// actions.
export default function UpdateListingsCard({ eyebrow, heading }: { eyebrow: string; heading: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">{eyebrow}</p>
          <h3 className="font-serif text-lg font-semibold text-ink">{heading}</h3>
        </div>
        <PeopleIcon className="h-8 w-8 shrink-0 text-brand-teal" />
      </div>
      {/* max-w keeps this wrapping onto its own couple of lines — without
          it, this card's wider desktop width (the 3-up community row) lets
          the sentence run edge to edge on one line instead. */}
      <p className="max-w-[34ch] text-sm text-slate-600">
        A living guide, built and updated by the people who call {community.region} home.
      </p>
      <Link
        href="/about"
        className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-slate-50"
      >
        <PeopleIcon className="h-4 w-4 shrink-0" />
        Learn More
      </Link>
    </div>
  )
}
