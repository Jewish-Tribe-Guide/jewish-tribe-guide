'use client'

// The pill-shaped search input itself — shared by HeroHeading's mobile hero
// (still owns it directly) and SearchSection (desktop's own headed section,
// now that search moved out of the hero band there — see that component's
// doc for why). Pulled out rather than duplicated so the two only ever
// diverge in placeholder copy, not in the input's actual behavior.
export default function SearchBox({
  query,
  onQueryChange,
  interactive = true,
  placeholder,
}: {
  query: string
  onQueryChange: (query: string) => void
  /** Admin-preview only: renders the box inert (nothing to filter in a
   *  preview) instead of driving Landing's card grid. */
  interactive?: boolean
  /** settings.searchPlaceholder — admin-editable (Site tab), shared by both
   *  devices rather than split into separate mobile/desktop copies (it's
   *  describing the same search either way). */
  placeholder: string
}) {
  return (
    <div className="flex items-center rounded-full border border-slate-200 bg-white pl-5 pr-2 py-2 shadow-[0_6px_20px_rgb(0,0,0,0.06)] transition-shadow focus-within:shadow-[0_6px_24px_rgb(0,0,0,0.12)]">
      <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
      </svg>
      <input
        type="text"
        value={query}
        onChange={(e) => interactive && onQueryChange(e.target.value)}
        readOnly={!interactive}
        // "Search", not "Filter": on desktop the grid isn't on screen
        // when this is empty, so there is nothing visible to be
        // filtering — typing reveals results. "Filter" describes the
        // implementation; "Search" describes what the visitor is doing.
        //
        // Admin-editable (Site tab, "Search placeholder") rather than
        // hardcoded — it used to read "rides, housing", which the guide no
        // longer offers, and fixing that meant a code change each time the
        // category list did. Whoever runs this community's admin console
        // now owns keeping the examples current.
        placeholder={placeholder}
        aria-label="Search resources"
        className="min-w-0 flex-1 bg-transparent px-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />
      {query && interactive && (
        <button
          onClick={() => onQueryChange('')}
          aria-label="Clear search"
          className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
        >
          ✕
        </button>
      )}
    </div>
  )
}
