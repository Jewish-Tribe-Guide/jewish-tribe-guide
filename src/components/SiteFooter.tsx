'use client'

import Link from 'next/link'
import FeedbackButton from './FeedbackButton'
import { SkylineIcon } from '@/components/icons'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { community } from '@/community.config'
import type { SiteSettings } from '@/lib/siteSettings'

export default function SiteFooter({
  previewSettings,
  onPromoteFeedbackToPage,
  year,
}: {
  previewSettings?: SiteSettings
  /** Forwarded to FeedbackButton — see its own note. Omitted by the admin
   *  category preview, which has no page-level feedback screen to hand off to. */
  onPromoteFeedbackToPage?: () => void
  /** The copyright year, resolved on the server and passed in.
   *
   *  It used to be `new Date().getFullYear()` right here, which reads the clock
   *  during render — non-deterministic, so the page couldn't be prerendered and
   *  the whole route was held back from producing a static shell. Nobody needs
   *  a per-visitor copyright year; one value, cached for everyone, is the same
   *  answer and costs nothing. */
  year: number
}) {
  const live = useSiteSettings()
  const settings = previewSettings ?? live

  return (
    <footer className="mt-16 border-t border-slate-200/80 bg-white/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex max-w-md items-center gap-4">
            {/* The skyline glyph and "A more connected {region}" copy both
                used to live in a dedicated closing strip above this
                footer, on the desktop home screen only — removed as
                redundant with this footer, which already runs on every
                page. Both moved here rather than being dropped. */}
            <SkylineIcon className="h-10 w-[86px] shrink-0 text-slate-400" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                A more connected {community.region}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Whether you&rsquo;re a lifelong local, new to the city, or just visiting — the {settings.name} helps
                you find what you need and feel at home.
              </p>
            </div>
          </div>

          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Spot something wrong or missing?
            </p>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted sm:ml-auto">
              Use the <span className="font-medium text-slate-600">Add</span>,{' '}
              <span className="font-medium text-slate-600">Edit</span>, or{' '}
              <span className="font-medium text-slate-600">Report</span> links on
              any listing — updates go straight to our reviewers.
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            Community-maintained — please confirm details directly before relying
            on them. © {year} {settings.name}.{' '}
            <Link href="/about" className="underline hover:text-slate-600">About</Link>
            {' · '}
            <Link href="/privacy" className="underline hover:text-slate-600">Privacy</Link>
          </p>
          {settings.feedbackEnabled && (
            <FeedbackButton
              buttonLabel={settings.feedbackButtonLabel}
              heading={settings.feedbackHeading}
              successMessage={settings.feedbackSuccessMessage}
              onPromoteToPage={onPromoteFeedbackToPage}
            />
          )}
        </div>
      </div>
    </footer>
  )
}
