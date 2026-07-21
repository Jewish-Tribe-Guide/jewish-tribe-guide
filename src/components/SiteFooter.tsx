'use client'

import FeedbackButton from './FeedbackButton'
import { useSiteSettings } from '@/lib/useSiteSettings'
import type { SiteSettings } from '@/lib/siteSettings'

export default function SiteFooter({ previewSettings }: { previewSettings?: SiteSettings } = {}) {
  const live = useSiteSettings()
  const settings = previewSettings ?? live
  const year = new Date().getFullYear()

  return (
    <footer className="mt-16 border-t border-slate-200/80 bg-white/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <p className="text-sm font-semibold text-slate-900">
              {settings.name}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {settings.mission}
            </p>
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
