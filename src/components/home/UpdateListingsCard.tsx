'use client'

import { useState } from 'react'
import { useSiteSettings } from '@/lib/useSiteSettings'
import FeedbackForm from '@/components/FeedbackForm'
import ContributePicker from './ContributePicker'
import EditReportPicker from './EditReportPicker'
import { PencilIcon, FlagIcon, PlusIcon } from '@/components/icons'

type ContributeAction = 'create' | 'edit' | 'report'

// Swaps to the bare word ("Add") below a CONTAINER (not viewport) width —
// this used to key off a `min-[900px]` viewport breakpoint, and that was
// checking the wrong box: this card's own width used to be fixed by the
// 2-up grid it shared with DaveningTimesCard (roughly half of Landing's
// max-w-6xl content column), which could be far narrower than the viewport
// at plenty of real window sizes. Now that this is a standalone full-width
// card, its content box is close to the full column width — the container
// query stays regardless, since the actual measured requirement (see the
// 540px note below) doesn't depend on which layout got it there. `aria-label`
// still carries the plain word (`short`) independent of the visible phrase,
// since a screen reader doesn't need "Add a place" when "Add" already says
// what the control does. Module-scope, not defined inside this component,
// so it isn't a new component type — and doesn't remount its buttons — on
// every render.
//
// 540px, not a rounder-looking number: a `@container` query is evaluated
// against the container's own CONTENT box (this card's width minus its own
// `p-7` padding, 56px), not the border box `getBoundingClientRect` reports —
// so at a real 420px-wide content box, the three buttons' actual rendered
// width (icons + long labels + gaps) still didn't fit on one row.
//
// This used to be 470 (a ~465px measurement plus a few px of slack) —
// measured on macOS. That's the wrong platform: CI runs Linux
// (mcr.microsoft.com/playwright), and font rasterization genuinely differs
// between FreeType and CoreText even for the identical Figtree file — the
// same three buttons measured 486px there, not 465px, confirmed by actually
// running the real CI Docker image locally (`docker run
// mcr.microsoft.com/playwright:v1.63.0-noble`, not guessed) after this exact
// gap caused Landing.tsx's grid-pairing width to cross 470px — triggering
// the long labels — before it was actually wide enough to fit them,
// wrapping "Report" onto its own line at a narrow band of real widths
// (1140-1160px) that a Mac-only measurement had no way to catch. 540 is
// 486 plus a real margin, not shaved to the edge of one platform's
// measurement again.
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
      // --color-accent, matching the home screen's own warm palette (eyebrow
      // labels, card backgrounds, Subscribe) — not blue, which is reserved
      // for every OTHER screen's interactive color. See SubscribeSection's
      // own note on this same split.
      className={
        primary
          ? 'inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-dark'
          : 'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-accent/25 bg-white px-4 py-2.5 text-sm font-semibold text-accent-dark transition-colors hover:bg-accent/10'
      }
    >
      {icon}
      {/* Both always in the DOM, one hidden by CSS — not a conditional
          render — so there's nothing here for a container-query-blind
          crawler/test to miss and no layout jump as the container resizes
          past the breakpoint. */}
      <span className="hidden @min-[540px]:inline">{long}</span>
      <span className="@min-[540px]:hidden">{short}</span>
    </button>
  )
}

// ── The "kept by the community" card — Add/Edit/Report, the actions that
// actually keep listings current. Used to pair side-by-side with
// DaveningTimesCard inside one shared HomeBreak component (2-up grid); split
// out into its own standalone card when the admin's Home screen cards list
// made every desktop card independently orderable/removable — see
// homeSections.ts's own doc on why the pair split. Deliberately the same
// card language (border, rounded-2xl) as every other desktop home-screen
// card, so this still reads as part of the same family even rendering
// full-width now instead of half-width.
//
// Went through a few rounds on its own action: a single "Suggest something"
// button opening the general feedback form overclaimed what that form is
// for (it's explicitly NOT the fast path for a specific listing — see
// FeedbackForm's own copy) and left the card looking thin. Add opens
// ContributePicker (search for a category, land on that category's Add
// form) since there's no existing listing to search for yet; Edit/Report
// open EditReportPicker instead (search for the listing itself, category
// shown only as a disambiguator) since editing/reporting starts from a
// specific business in mind, not "which bucket is it filed under". Feedback
// stays as a small secondary link, correctly scoped to general site
// feedback rather than the headline action.
export default function UpdateListingsCard({ eyebrow, heading }: { eyebrow: string; heading: string }) {
  const settings = useSiteSettings()
  // Opens FeedbackForm as the same in-place modal SiteFooter's own
  // FeedbackButton does — not a link to routes.feedback(), which is a real
  // page navigation and would leave this card (and everything else on this
  // page) behind entirely, dropping the visitor onto a bare feedback screen
  // instead of a dialog over the page they were just on.
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  // Which of Add/Edit/Report was tapped — null closes ContributePicker.
  // A real, named action beats a paragraph pointing at Add/Edit/Report
  // buttons that live elsewhere and that a visitor who's never opened a
  // category directory wouldn't know exist yet — even unclicked, seeing
  // these here is what teaches that the site works this way at all.
  const [contributeAction, setContributeAction] = useState<ContributeAction | null>(null)

  return (
    <div>
      <div className="@container flex flex-col rounded-2xl border border-slate-200 bg-white p-7">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-accent">{eyebrow}</p>
        <h3 className="mb-4 text-lg font-semibold text-slate-900">{heading}</h3>
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
            <button onClick={() => setFeedbackOpen(true)} className="cursor-pointer font-semibold text-accent-dark hover:underline">
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
