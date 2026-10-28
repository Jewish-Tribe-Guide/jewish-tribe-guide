'use client'

import Link from 'next/link'
import CategoryIcon from '@/components/CategoryIcon'
import { getCategoryColor } from '@/lib/categoryColor'
import { initialsOf } from '@/lib/listingRow'
import type { CategoryConfig } from '@/lib/categories'
import type { SearchLine } from '@/lib/searchLands'
import SaveButton from '@/components/SaveButton'
import { usePinned } from '@/lib/pinnedContext'
import { lineSearch } from '@/lib/savedSearches'
import { useSavedSearches } from '@/lib/savedSearchesContext'
import { ui } from '@/lib/uiConfig'
import { TONE_DOT } from '@/lib/eruvTone'

// ── Where a search could go, while it's typed (Oct 13, canvas board 1b) ─────
// A short list under the home box: each line somewhere to go, with what
// you'd find there ("Grocery · 10 open now with Challah"). The first is
// what Enter does, tinted. No answers here: the page a line opens is the
// answer, with the words still in its box.
//
// Each line that can be saved has a bookmark where its chevron was (Oct 13,
// canvas page "you", board YouSave): a place's line saves the place, a kind
// of place, Minyanim by time or a time saves the search. Filled once saved.
//
// An eruv's line (Oct 15) has its status dot before its status, in the
// colours the eruv card uses: "is center city eruv up?" is answered in the
// line itself.

export default function SearchLines({
  lines,
  categories,
  onPick,
  typed = '',
  className = '',
}: {
  lines: SearchLine[]
  /** What was typed: what a minyan's or a time's saved search says. */
  typed?: string
  categories: readonly CategoryConfig[] | null
  /** A line was chosen (tap, click or Enter): the page goes there. */
  onPick: (line: SearchLine) => void
  className?: string
}) {
  const saved = useSavedSearches()
  const { isPinned, toggle: togglePlace } = usePinned()
  if (lines.length === 0) return null
  // The bookmark a line ends with, beside the line rather than inside its
  // link (a button can't sit in a link); null for a line that saves nothing.
  const lineSave = (line: SearchLine) => {
    if (!ui.map.pins) return null
    // A place, or an eruv (saved as the Eruv page's: usePinnedPlaces).
    const placeId = line.kind === 'listing' ? line.listing?.id : line.eruvId
    if (placeId && line.categoryId) {
      const place = { id: placeId, categoryId: line.categoryId }
      return <SaveButton plain saved={isPinned(place.id)} onToggle={() => togglePlace(place)} name={line.title} className="mr-2.5" />
    }
    const search = saved ? lineSearch(line, typed) : null
    if (!search || !saved) return null
    return <SaveButton plain saved={saved.isSaved(search.key)} onToggle={() => saved.toggle(search)} name={`“${search.words}” in ${line.title}`} className="mr-2.5" />
  }
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_4px_10px_rgba(15,23,42,0.06),0_20px_40px_rgba(15,23,42,0.12)] ${className}`}
      data-testid="search-lines"
    >
      <ul role="listbox" aria-label="Where to go">
        {lines.map((line, i) => (
          <li
            key={line.key}
            role="option"
            aria-selected={i === 0}
            className={`flex items-center ${i > 0 ? 'border-t border-slate-100' : ''} ${i === 0 ? 'bg-primary/[0.07]' : ''}`}
          >
            <LineLink line={line} first={i === 0} onPick={onPick}>
              <LineIcon line={line} categories={categories} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-bold text-ink">{line.title}</span>
                {line.sub && (
                  <span className={`flex items-center gap-1.5 text-[13.5px] ${i === 0 ? 'font-semibold text-blue-900' : 'text-slate-500'}`}>
                    {line.tone && <span aria-hidden="true" data-testid="search-line-tone" data-tone={line.tone} className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[line.tone]}`} />}
                    <span className="truncate">{line.sub}</span>
                  </span>
                )}
              </span>
              {!lineSave(line) && (
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-slate-400">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              )}
            </LineLink>
            {lineSave(line)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function LineLink({ line, first, onPick, children }: { line: SearchLine; first: boolean; onPick: (line: SearchLine) => void; children: React.ReactNode }) {
  const className = `flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors ${first ? 'hover:bg-primary/[0.04]' : 'hover:bg-slate-50'}`
  if (!line.href) {
    return (
      <button type="button" onClick={() => onPick(line)} className={className}>
        {children}
      </button>
    )
  }
  return (
    <Link
      href={line.href}
      prefetch={false}
      onClick={(e) => {
        // A modified click opens a new tab, as a link should.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        onPick(line)
      }}
      className={className}
    >
      {children}
    </Link>
  )
}

function LineIcon({ line, categories }: { line: SearchLine; categories: readonly CategoryConfig[] | null }) {
  const category = line.categoryId ? categories?.find((c) => c.id === line.categoryId) : undefined
  const color = category ? getCategoryColor(categories as CategoryConfig[], category.id) : '#64748b'
  if (line.kind === 'listing' && line.listing) {
    return <CategoryIcon icon={category?.icon ?? ''} categoryId={category?.id} initials={initialsOf(line.listing.name)} shape="square" color={color} className="h-9 w-9 text-lg" sizePx={36} />
  }
  if (category) return <CategoryIcon icon={category.icon} categoryId={category.id} iconImageUrl={category.iconImageUrl} color={color} className="h-9 w-9 text-lg" sizePx={36} />
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
      {line.kind === 'add' ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-[18px] w-[18px]">
          <path d="M12 5v14M5 12h14" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-[18px] w-[18px]">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      )}
    </span>
  )
}
