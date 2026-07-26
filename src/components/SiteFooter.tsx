'use client'

import FeedbackButton from './FeedbackButton'
import { useSiteSettings } from '@/lib/useSiteSettings'
import type { SiteSettings } from '@/lib/siteSettings'

export default function SiteFooter({ previewSettings }: { previewSettings?: SiteSettings } = {}) {
  const live = useSiteSettings()
  const settings = previewSettings ?? live
  const year = new Date().getFullYear()

  return (
    // Same solid navy (`#0C3D57`) as the condensed top bar (site name +
    // tagline, see Landing.tsx) — the two now bookend the page in matching
    // color, so text/borders below switch to white/light variants for
    // contrast instead of the slate tones a white background needs.
    <footer className="mt-16 border-t border-[#fefefe]/15 bg-[#0C3D57]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <p className="text-sm font-semibold text-[#fefefe]">
              {settings.name}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-[#fefefe]/70">
              {settings.mission}
            </p>
          </div>

          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#fefefe]/60">
              Spot something wrong or missing?
            </p>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-[#fefefe]/70 sm:ml-auto">
              Use the <span className="font-medium text-[#fefefe]">Add</span>,{' '}
              <span className="font-medium text-[#fefefe]">Edit</span>, or{' '}
              <span className="font-medium text-[#fefefe]">Report</span> links on
              any listing — updates go straight to our reviewers.
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-[#fefefe]/15 pt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#fefefe]/60">
            Community-maintained — please confirm details directly before relying
            on them. © {year} {settings.name}.
          </p>
          {settings.feedbackEnabled && (
            <FeedbackButton
              buttonLabel={settings.feedbackButtonLabel}
              heading={settings.feedbackHeading}
              successMessage={settings.feedbackSuccessMessage}
            />
          )}
        </div>
      </div>
    </footer>
  )
}
