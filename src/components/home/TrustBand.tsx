'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { track } from '@vercel/analytics'
import MobileSheet from '@/components/resources/MobileSheet'
import { EDIT_LISTING_LABEL } from '@/components/resources/editListingLabel'
import { ChevronRightIcon, PeopleIcon } from '@/components/icons'
import { routes } from '@/lib/routes'
import { sourcesRead, sourcesSentence, trustLine, type TrustFacts } from '@/lib/phoneHome'
import { fetchEruvStatuses, useEruvStatuses } from '@/lib/useEruvStatuses'
import { fetchChecksRun, useChecksRun } from '@/lib/useChecksRun'
import { useNow } from '@/lib/useNow'

// ── Who keeps the guide right (the user, Oct 17) ────────────────────────────
// The top of the phone home, where the headline and mission were: a promise
// with its evidence ("155 places · checked with Google").
// Tapped, a short sheet says how the guide stays right, in front of the
// About page, which stays for "what is this".
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
  // What the sheet names, asked for once the home has loaded rather than on
  // the tap, so the sheet opens whole instead of with a loading bar each
  // time (the user, Oct 20). Small, and cached by the CDN. The rest it
  // names is read off the places the home already has (trustFacts).
  useEffect(() => {
    const read = () => {
      fetchEruvStatuses(communitySlug)
      fetchChecksRun(communitySlug)
    }
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(read, { timeout: 3000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(read, 1000)
    return () => clearTimeout(id)
  }, [communitySlug])
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
      <TrustSheet open={open} facts={facts} region={region} communitySlug={communitySlug} onClose={() => setOpen(false)} />
    </>
  )
}

// The site's own bottom sheet, as Filters and Edit are (it was a sheet of
// its own until Oct 17, and looked it). Three short lines (the user,
// Oct 17: people want the idea, not each source; Oct 23: everything we
// check, no source named): what the guide checks every day, and only
// what it checked this week; people fill in the rest, reviewed; every
// listing is dated.
function TrustSheet({ open, facts, region, communitySlug, onClose }: { open: boolean; facts: TrustFacts; region: string; communitySlug: string; onClose: () => void }) {
  const eruv = useEruvStatuses(communitySlug, open)
  const ran = useChecksRun(communitySlug, open)
  const now = useNow()
  const read = eruv && ran && now !== null ? sourcesRead(facts, eruv.available ? eruv.eruvim.map((e) => e.statusCheckedAt) : [], now, ran) : null
  const sentence = read ? sourcesSentence(read) : null
  return (
    <MobileSheet isOpen={open} onClose={onClose} title="How this guide stays right">
      <ul className="space-y-4" data-testid="trust-sheet">
        {read === null ? (
          <li aria-hidden="true" className="h-14 animate-pulse rounded-xl bg-slate-100" />
        ) : (
          sentence && (
            <Row icon={<ShieldCheck className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-700" title="We check it every day">
              {sentence}
            </Row>
          )
        )}
        <Row icon={<PeopleIcon className="h-5 w-5" />} tone="bg-primary/10 text-primary" title={sentence ? 'People fill in the rest' : `People in ${region} keep it up`}>
          {sentence ? 'New places, kosher items at grocery stores, and Shabbos-friendly hotels.' : 'Everything here is added and fixed by people in the community.'} A person reviews every change before it shows.
        </Row>
        {/* Each listing dates what was checked, box by box (boxDates.ts);
            one nobody has checked yet says so, which is its "when". */}
        <Row icon={<CalendarCheck className="h-5 w-5" />} tone="bg-[#c9a45c]/15 text-[#7a5a1c]" title="Every listing says when it was last checked">
          Something wrong? Open the place and tap <strong className="font-bold text-ink">{EDIT_LISTING_LABEL}</strong>.
        </Row>
      </ul>
      <Link href={routes.about(communitySlug)} className="mt-4 flex min-h-11 items-center justify-between border-t border-slate-200 pt-3 text-[15px] font-semibold text-ink hover:underline">
        About the guide
        <ChevronRightIcon className="h-4 w-4 text-slate-400" />
      </Link>
    </MobileSheet>
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

function CalendarCheck({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="m9.5 15 2 2 3.5-3.5" />
    </svg>
  )
}
