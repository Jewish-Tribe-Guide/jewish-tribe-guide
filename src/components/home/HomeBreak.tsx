'use client'

import { useState } from 'react'
import { useZmanim } from '@/lib/useZmanim'
import { useSiteSettings } from '@/lib/useSiteSettings'
import FeedbackForm from '@/components/FeedbackForm'
import ContributePicker from './ContributePicker'
import EditReportPicker from './EditReportPicker'
import DaveningTimesCard from './DaveningTimesCard'
import SubscribeSection from './SubscribeSection'
import { PencilIcon, FlagIcon, PlusIcon } from '@/components/icons'

type ContributeAction = 'create' | 'edit' | 'report'

// Icon + a short word by default, the full phrase once a wide-enough
// desktop gives this half-width card room for it. `aria-label` is fixed to
// the short word regardless of which visual variant is showing, so the
// accessible name never depends on viewport width. Same technique as the
// "All davening times" toolbar button (GenericDirectory.tsx), which hides
// its own full label below a width breakpoint rather than swapping in a
// second, shorter one — this needs the swap because "Add"/"Edit"/"Report"
// bare is also a fine label, not just a fallback for no room. Module-scope,
// not defined inside HomeBreak, so it isn't a new component type — and
// doesn't remount its buttons — on every HomeBreak render.
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
          ? 'inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-800'
          : 'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-200 bg-white px-5 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-50'
      }
    >
      {icon}
      <span className="min-[900px]:hidden">{short}</span>
      <span className="hidden min-[900px]:inline">{long}</span>
    </button>
  )
}

// ── The break between the two main things (Browse everything, Explore the
// map) — a 2×2 grid of four smaller cards rather than one full-width
// section each. Top row: Davening Times, and the "kept by the community"
// message. Bottom row: the Stay in the loop signup (moved here from its own
// full-width section after the map — see SubscribeSection's own `bare` prop)
// and Shabbat Times, trimmed to just candle lighting and havdalah. Went
// through a few lighter treatments first (a single unheaded strip, stacked
// bands, a 2-card version of this same row) before landing here — see the
// memory/decision history if reviving one of those. Deliberately the same
// card language (border, rounded-2xl) as Browse everything and the map
// below it, just four smaller cards rather than full-width ones, so this
// still reads as a distinct break rather than a third full-width peer
// section.
//
// Shabbat Times used to be the full daily Zmanim (sunrise, latest Shema,
// latest Shacharis, sunset, nightfall) plus candle lighting/havdalah — five
// rows nobody asked about, next to the two anyone actually checks this card
// for. Trimmed to just those two on the reasoning that a card meant to be
// glanced at shouldn't need to be read.
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
  visitorCoords,
  locationLabel,
}: {
  /** For Shabbat Times: the visitor's address, or the community center — see
   *  Landing, which falls back so this never renders a "set your location"
   *  prompt. A city-wide approximation is fine for candle lighting. */
  coords: { lat: number; lng: number } | null
  /** For Davening Times: the real, ungated value — null until the visitor
   *  actually sets an address. Distance to a specific shul measured from the
   *  community-center fallback above would be actively misleading, not just
   *  imprecise, so that card needs to know the difference. */
  visitorCoords: { lat: number; lng: number } | null
  locationLabel: string
}) {
  const { data, status } = useZmanim(coords)
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
      <DaveningTimesCard coords={visitorCoords} />

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

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <SubscribeSection bare />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
          {status === 'ready' && data ? data.hebrewDate : 'Today'} · {locationLabel}
        </p>
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Shabbat Times</h3>

        {status === 'loading' ? (
          <div className="space-y-2" aria-live="polite" aria-busy="true">
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
            <span className="sr-only">Loading zmanim…</span>
          </div>
        ) : status === 'ready' && data ? (
          <>
            <div className="space-y-1.5">
              {data.shabbos.candleLighting && (
                <div className="flex items-baseline justify-between gap-3 rounded-lg bg-amber-50 px-3 py-1.5">
                  <span className="text-[13px] font-semibold text-amber-800">Candles {data.shabbos.candleLighting.label}</span>
                  <span className="text-[13px] font-semibold tabular-nums text-amber-800">{data.shabbos.candleLighting.time}</span>
                </div>
              )}
              {data.shabbos.havdalah && (
                <div className="flex items-baseline justify-between gap-3 rounded-lg bg-amber-50 px-3 py-1.5">
                  <span className="text-[13px] font-semibold text-amber-800">Havdalah {data.shabbos.havdalah.label}</span>
                  <span className="text-[13px] font-semibold tabular-nums text-amber-800">{data.shabbos.havdalah.time}</span>
                </div>
              )}
            </div>
            {/* Same attribution/link as the real Zmanim & Shabbos page
                (ZmanimBody) — this card shows the same Hebcal-sourced data,
                so it carries the same credit. */}
            <p className="pt-3 text-[11px] text-muted">
              Zmanim from{' '}
              <a href="https://www.hebcal.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
                Hebcal.com
              </a>
            </p>
          </>
        ) : (
          <p className="text-[13px] text-muted">Zmanim are unavailable right now. Please try again in a moment.</p>
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
