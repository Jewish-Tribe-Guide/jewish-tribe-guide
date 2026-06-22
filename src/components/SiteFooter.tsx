// Site-wide footer. Adds credibility/context and points people to the in-app
// feedback flows (Suggest a category, Edit, Report) rather than an email, so
// corrections land in the right place. No contact email for now — see the
// header pattern if/when a public address is added.
export default function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-16 border-t border-slate-200/80 bg-white/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <p className="text-sm font-semibold text-slate-900">
              Philadelphia Jewish Community
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              A guide to Jewish Philadelphia — kosher food, synagogues, rides,
              housing, and community support for residents, visitors, and patients.
            </p>
          </div>

          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Spot something wrong or missing?
            </p>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted sm:ml-auto">
              Use the <span className="font-medium text-slate-600">Suggest</span>,{' '}
              <span className="font-medium text-slate-600">Add</span>,{' '}
              <span className="font-medium text-slate-600">Edit</span>, or{' '}
              <span className="font-medium text-slate-600">Report</span> links on
              any listing — updates go straight to our reviewers.
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-5">
          <p className="text-xs text-slate-400">
            Community-maintained — please confirm details directly before relying
            on them. © {year} Philadelphia Jewish Community.
          </p>
        </div>
      </div>
    </footer>
  )
}
