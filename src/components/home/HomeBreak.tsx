'use client'

import { useEffect, useRef, useState } from 'react'
import { useZmanim } from '@/lib/useZmanim'
import { useSiteSettings } from '@/lib/useSiteSettings'
import FeedbackForm from '@/components/FeedbackForm'
import ContributePicker from './ContributePicker'
import EditReportPicker from './EditReportPicker'
import { PencilIcon, FlagIcon, PlusIcon } from '@/components/icons'

type ContributeAction = 'create' | 'edit' | 'report'

// ── The break between the two main things (Browse everything, Explore the
// map) — two side-by-side cards, the full daily Zmanim on the left and the
// "kept by the community" message on the right. Went through a few lighter
// treatments first (a single unheaded strip, stacked bands) before landing
// here — see the memory/decision history if reviving one of those. This is
// deliberately the same card language (border, rounded-2xl) as Browse
// everything and the map below it, just two smaller cards rather than one
// full-width one, so it still reads as a distinct pair rather than a third
// full-width peer section.
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
//
// Both pickers render as an anchored dropdown under the button row (see
// pickerRef below), not a full backdrop modal the way they first shipped —
// picking a result still deep-links to a real full-page form (Add/Edit's
// ListingForm, Report's own screen), and a dark-backdrop dialog dissolving
// straight into an unrelated page read as two different interaction models
// stitched together. A lighter dropdown reads as "choosing where to go"
// instead, so landing on the form after feels like a continuation rather
// than a jump. The form itself stays exactly as it was — still the one
// shared mechanism reached from a search result's own Edit/Report button
// too, so the destination behaves the same regardless of entry point.
export default function HomeBreak({
  coords,
  locationLabel,
}: {
  /** The visitor's address, or the community center — see Landing, which
   *  falls back so this never renders a "set your location" prompt. */
  coords: { lat: number; lng: number } | null
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
  const pickerRef = useRef<HTMLDivElement>(null)

  // Closes on Escape or a click/tap outside the button row + its open
  // picker — the picker used to be a real backdrop modal, which handled
  // this itself; now that it's an anchored dropdown (see ContributePicker/
  // EditReportPicker's own doc on why) there's no backdrop to catch that,
  // so this owns it instead. `pointerdown` in the capture phase, not
  // `click`, matches LocationControl's own popover — it closes before a
  // click on one of the OTHER two buttons fires its own handler, so
  // switching straight from Add to Edit doesn't flash both states.
  useEffect(() => {
    if (!contributeAction) return
    function onDown(e: PointerEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setContributeAction(null)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setContributeAction(null)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [contributeAction])

  return (
    <div className="my-12 grid grid-cols-2 gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
          {status === 'ready' && data ? data.hebrewDate : 'Today'} · {locationLabel}
        </p>
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Zmanim & Shabbos</h3>

        {status === 'loading' ? (
          <div className="space-y-2" aria-live="polite" aria-busy="true">
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
            <span className="sr-only">Loading zmanim…</span>
          </div>
        ) : status === 'ready' && data ? (
          <>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-1.5">
              {data.dailyZmanim.map((z) => (
                <div key={z.label} className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-100 py-1">
                  <dt className="text-[13px] text-muted">{z.label}</dt>
                  <dd className="text-[13px] font-semibold tabular-nums text-slate-900">{z.time}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 space-y-1.5">
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

      {/* No justify-center — this card is naturally shorter than the
          Zmanim one, and centering its content made "Kept current by
          people like you" start lower than "Zmanim & Shabbos", so the two
          headings didn't line up. Top-aligned, like the other card, so
          they do regardless of which one ends up taller. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Community run</p>
        <h3 className="mb-3 text-lg font-semibold text-slate-900">Kept current by people like you</h3>
        <p className="mb-4 text-[13.5px] leading-relaxed text-muted">
          A few admin volunteers keep the lights on, but every listing, correction, and update mostly comes
          from the community that actually uses this guide.
        </p>
        <div ref={pickerRef} className="relative flex flex-wrap gap-2">
          <button
            onClick={() => setContributeAction('create')}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-800"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add
          </button>
          <button
            onClick={() => setContributeAction('edit')}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-50"
          >
            <PencilIcon className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            onClick={() => setContributeAction('report')}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-50"
          >
            <FlagIcon className="h-3.5 w-3.5" /> Report
          </button>

          {contributeAction === 'create' && <ContributePicker onClose={() => setContributeAction(null)} />}
          {(contributeAction === 'edit' || contributeAction === 'report') && (
            <EditReportPicker action={contributeAction} coords={coords} onClose={() => setContributeAction(null)} />
          )}
        </div>
        {settings.feedbackEnabled && (
          <p className="mt-4 text-xs text-muted">
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
    </div>
  )
}
