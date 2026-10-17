'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { track } from '@vercel/analytics'
import BodyPortal from '@/components/BodyPortal'
import { ChevronRightIcon, CloseIcon, PeopleIcon } from '@/components/icons'
import { routes } from '@/lib/routes'
import { trustLine, type TrustFacts } from '@/lib/phoneHome'

// ── Who keeps the guide right (the user, Oct 17) ────────────────────────────
// The top of the phone home, where the headline and mission were: a promise
// with its evidence ("155 places · hours checked with Google every night").
// Tapped, a short sheet says where the facts come from and how to check one
// place, in front of the About page, which stays for "what is this".
//
// It says hours, never "verified": Google can't check a hechsher. The last
// change a person made isn't on it: with few edits yet, "updated 3 weeks
// ago" would make the guide look abandoned. Once there's a steady trickle,
// "12 fixes this month" belongs here.

type Props = {
  facts: TrustFacts
  /** "Philadelphia", for "people in the Philadelphia community". The band
   *  itself just says "the community": the header already names it, and
   *  "the Philadelphia community" took two lines on a phone. */
  region: string
  communitySlug: string
}

export default function TrustBand({ facts, region, communitySlug }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          track('trust_opened')
          setOpen(true)
        }}
        aria-haspopup="dialog"
        data-testid="trust-band"
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-slate-50"
      >
        <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-700" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-extrabold leading-snug text-ink">Kept up by the community</span>
          <span className="block text-[12.5px] leading-snug text-slate-500">{trustLine(facts)}</span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && <TrustSheet facts={facts} region={region} communitySlug={communitySlug} onClose={() => setOpen(false)} />}
    </>
  )
}

function TrustSheet({ facts, region, communitySlug, onClose }: { facts: TrustFacts; region: string; communitySlug: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  // Google's row only where Google checks; this week's count once known.
  const google = facts.googleChecked > 0 && facts.checkedThisWeek !== 0
  const thisWeek = facts.checkedThisWeek !== null ? ` ${facts.checkedThisWeek} of ${facts.places} places checked this week.` : ''
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center desktop:items-center">
        <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-slate-900/45" />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="trust-sheet-title"
          data-testid="trust-sheet"
          className="relative w-full max-w-lg rounded-t-2xl bg-white px-4 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-xl desktop:rounded-2xl desktop:pb-5"
        >
          <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 desktop:hidden" />
          <div className="mt-2 flex items-center justify-between gap-3">
            <h2 id="trust-sheet-title" className="text-[18px] font-extrabold text-ink">
              How this guide is kept up
            </h2>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-3 space-y-4">
            {google && (
              <Row icon={<Refresh className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-700" title="Hours, address and phone">
                Checked against Google every night.{thisWeek}
              </Row>
            )}
            {/* "Everything else" only after Google's row: alone, it's everything. */}
            <Row icon={<PeopleIcon className="h-5 w-5" />} tone="bg-primary/10 text-primary" title={google ? 'Everything else' : 'Everything in the guide'}>
              {google ? 'Hechsher, items, minyan times, Shabbos details: added' : 'Added'} and fixed by people in the {region} community, and reviewed before it shows.
            </Row>
            <Row icon={<CalendarCheck className="h-5 w-5" />} tone="bg-[#c9a45c]/15 text-[#7a5a1c]" title="Every listing says when it was last confirmed">
              See something wrong? Open the place and tap <strong className="font-bold text-ink">Suggest an edit</strong>.
            </Row>
          </ul>
          <Link href={routes.about(communitySlug)} className="mt-4 flex min-h-11 items-center justify-between border-t border-slate-200 pt-3 text-[15px] font-semibold text-ink hover:underline">
            About the guide
            <ChevronRightIcon className="h-4 w-4 text-slate-400" />
          </Link>
        </div>
      </div>
    </BodyPortal>
  )
}

function Row({ icon, tone, title, children }: { icon: React.ReactNode; tone: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold text-ink">{title}</span>
        <span className="block text-[14px] leading-snug text-slate-700">{children}</span>
      </span>
    </li>
  )
}

function ShieldCheck({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function Refresh({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  )
}

function CalendarCheck({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="m9.5 15 2 2 3.5-3.5" />
    </svg>
  )
}
