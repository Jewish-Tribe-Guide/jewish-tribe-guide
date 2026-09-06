'use client'

import { useState } from 'react'
import { useSiteSettings } from '@/lib/useSiteSettings'
import FeedbackForm from '@/components/FeedbackForm'
import ContributePicker from './ContributePicker'
import EditReportPicker from './EditReportPicker'
import DaveningTimesCard from './DaveningTimesCard'
import { PencilIcon, FlagIcon, PlusIcon } from '@/components/icons'

type ContributeAction = 'create' | 'edit' | 'report'

// The full phrase, always — this used to swap down to a bare icon+word
// ("Add") below a `min-[900px]` viewport breakpoint, on the reasoning that
// the long phrase needed "a wide-enough desktop" to have room. That
// breakpoint was checking the wrong thing: it's the VIEWPORT's width, not
// this half-width card's, and the card's own width is fixed by the 2-up
// grid it sits in (roughly half of Landing's max-w-6xl content column)
// regardless of how wide the browser window gets past ~900px — so on any
// normal desktop monitor the long-phrase branch was always the one
// rendering, into a box that was never actually measured against it. All
// three phrases fit today with room to spare (measured at ~445px against a
// ~486px row) — `aria-label` still carries the plain word (`short`)
// independent of the visible phrase, since a screen reader doesn't need
// "Add a place" when "Add" already says what the control does. Module-
// scope, not defined inside HomeBreak, so it isn't a new component type —
// and doesn't remount its buttons — on every HomeBreak render.
function ContributeButton({ onClick, icon, short, long, primary }: {
  onClick: () => void
  icon: React.ReactNode
  short: string
  long: string
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={short}
      className={
        primary
          ? 'inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-800'
          : 'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-200 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-50'
      }
    >
      {icon}
      {long}
    </button>
  )
}

// ── The break between the two main things (Browse everything, Explore the
// map) — two smaller cards: Davening Times, and the "kept by the community"
// message. Went through a few other treatments first (a single unheaded
// strip, stacked bands, a 2×2 grid that also carried Stay in the loop and
// Shabbat Times) before landing here — see the memory/decision history if
// reviving one of those. Stay in the loop and Shabbat Times moved out to
// their own row below the map instead (see Landing.tsx and
// ShabbatTimesCard.tsx) — this break and that one are visually identical
// (same two-card, rounded-2xl treatment) but are no longer the same
// component, since they don't render adjacent to each other any more.
// Deliberately the same card language (border, rounded-2xl) as Browse
// everything and the map below it, so this still reads as a distinct break
// rather than a third full-width peer section.
//
// The community card's own action went through a few rounds too: a single
// "Suggest something" button opening the general feedback form overclaimed
// what that form is for (it's explicitly NOT the fast path for a specific
// listing — see FeedbackForm's own copy) and left the card looking thin.
// Add/Edit/Report — the actions that actually keep listings current — are
// real, named buttons here now. Add opens ContributePicker (search for a
// category, land on that category's Add form) since there's no existing
// listing to search for yet; Edit/Report open EditReportPicker instead
// (search for the listing itself, category shown only as a disambiguator)
// since editing/reporting starts from a specific business in mind, not
// "which bucket is it filed under". Feedback stays as a small secondary
// link, correctly scoped to general site feedback rather than the headline
// action.
export default function HomeBreak({
  coords,
}: {
  /** The visitor's real location — null until they've actually set an
   *  address. Distance to a specific shul measured from a fallback the
   *  visitor never chose would be actively misleading, not just imprecise,
   *  so unlike ShabbatTimesCard's own `coords` this is never coalesced to
   *  the community center before it gets here. */
  coords: { lat: number; lng: number } | null
}) {
  const settings = useSiteSettings()
  // Opens FeedbackForm as the same in-place modal SiteFooter's own
  // FeedbackButton does — not a link to routes.feedback(), which is a real
  // page navigation and would leave the two-card break (and everything else
  // on this page) behind entirely, dropping the visitor onto a bare
  // feedback screen instead of a dialog over the page they were just on.
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  // Which of Add/Edit/Report was tapped — null closes ContributePicker.
  // A real, named action beats a paragraph pointing at Add/Edit/Report
  // buttons that live elsewhere and that a visitor who's never opened a
  // category directory wouldn't know exist yet — even unclicked, seeing
  // these here is what teaches that the site works this way at all.
  const [contributeAction, setContributeAction] = useState<ContributeAction | null>(null)

  return (
    <div className="my-12 grid grid-cols-2 gap-4">
      <DaveningTimesCard coords={coords} />

      {/* No justify-center — this card is naturally shorter than the
          Davening Times one, and centering its content made "Kept by the
          community" start lower than "Davening Times", so the two headings
          didn't line up. Top-aligned, like the other card, so they do
          regardless of which one ends up taller.
          Roomier than the other card's own rhythm on purpose — that one's
          height comes from real data rows; this one has to earn its height
          from spacing instead, the same way centercityeruv.com's own
          "Get Eruv Updates" card reads as substantial through generous
          padding and line-height rather than more text. Larger body copy,
          more room between the eyebrow/heading/body/buttons, and taller
          buttons — not more content, just more breathing room around the
          same content, so the card fills its box instead of floating a
          short block inside a tall one. */}
      <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-7">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">Community run</p>
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Kept by the community</h3>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          A few admin volunteers keep the lights on, but every listing, correction, and update mostly comes
          from the community that actually uses this guide.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <ContributeButton onClick={() => setContributeAction('create')} icon={<PlusIcon className="h-3.5 w-3.5" />} short="Add" long="Add a place" primary />
          <ContributeButton onClick={() => setContributeAction('edit')} icon={<PencilIcon className="h-3.5 w-3.5" />} short="Edit" long="Suggest an edit" />
          <ContributeButton onClick={() => setContributeAction('report')} icon={<FlagIcon className="h-3.5 w-3.5" />} short="Report" long="Report a problem" />
        </div>
        {settings.feedbackEnabled && (
          <p className="mt-6 text-xs text-muted">
            Notice something else, or have general feedback about the site?{' '}
            <button onClick={() => setFeedbackOpen(true)} className="cursor-pointer font-semibold text-amber-800 hover:underline">
              Send a note →
            </button>
          </p>
        )}
      </div>

      {feedbackOpen && (
        <FeedbackForm
          heading={settings.feedbackHeading}
          successMessage={settings.feedbackSuccessMessage}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
      {contributeAction === 'create' && <ContributePicker onClose={() => setContributeAction(null)} />}
      {(contributeAction === 'edit' || contributeAction === 'report') && (
        <EditReportPicker action={contributeAction} onClose={() => setContributeAction(null)} />
      )}
    </div>
  )
}
