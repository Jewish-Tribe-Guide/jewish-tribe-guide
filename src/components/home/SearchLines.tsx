'use client'

import Link from 'next/link'
import CategoryIcon from '@/components/CategoryIcon'
import { getCategoryColor } from '@/lib/categoryColor'
import { initialsOf } from '@/lib/listingRow'
import type { CategoryConfig } from '@/lib/categories'
import type { SearchLine } from '@/lib/searchLands'

// ── Where a search could go, while it's typed (Oct 13, canvas board 1b) ─────
// A short list under the home box: each line somewhere to go, with what
// you'd find there ("Grocery · 10 open now with Challah"). The first is
// what Enter does, and says so with its ⏎. No answers here: the page a line
// opens is the answer, with the words still in its box.

export default function SearchLines({
  lines,
  categories,
  onPick,
  reading = false,
  className = '',
}: {
  lines: SearchLine[]
  categories: readonly CategoryConfig[] | null
  /** A line was chosen (tap, click or Enter): the page goes there. */
  onPick: (line: SearchLine) => void
  /** The question is being read (questionReader.ts): its lines follow. */
  reading?: boolean
  className?: string
}) {
  if (lines.length === 0 && !reading) return null
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_4px_10px_rgba(15,23,42,0.06),0_20px_40px_rgba(15,23,42,0.12)] ${className}`}
      data-testid="search-lines"
    >
      <ul role="listbox" aria-label="Where to go">
        {lines.map((line, i) => (
          <li key={line.key} role="option" aria-selected={i === 0} className={i > 0 ? 'border-t border-slate-100' : ''}>
            <LineLink line={line} first={i === 0} onPick={onPick}>
              <LineIcon line={line} categories={categories} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-bold text-ink">{line.title}</span>
                {line.sub && <span className={`block truncate text-[13.5px] ${i === 0 ? 'font-semibold text-blue-900' : 'text-slate-500'}`}>{line.sub}</span>}
              </span>
              {i === 0 ? (
                <span aria-label="Enter" className="flex h-6 shrink-0 items-center rounded-md border border-primary/40 bg-white px-1.5 text-primary">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M9 10 4 15l5 5" />
                    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                  </svg>
                </span>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-slate-400">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              )}
            </LineLink>
          </li>
        ))}
      </ul>
      {reading && (
        <p role="status" className={`px-4 py-3 text-[13.5px] font-medium text-slate-500 ${lines.length ? 'border-t border-slate-100' : ''}`}>
          Reading your question…
        </p>
      )}
    </div>
  )
}

function LineLink({ line, first, onPick, children }: { line: SearchLine; first: boolean; onPick: (line: SearchLine) => void; children: React.ReactNode }) {
  const className = `flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors ${first ? 'bg-primary/[0.07] hover:bg-primary/[0.11]' : 'hover:bg-slate-50'}`
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
