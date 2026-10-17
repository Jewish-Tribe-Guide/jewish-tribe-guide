'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import type { ChangePart } from '@/lib/changeParts'
import type { Change } from '@/lib/whatChanged'
import { changeSentence, fitParts } from '@/lib/whatChanged'
import { getCategoryColor } from '@/lib/categoryColor'
import { listingSlug } from '@/lib/listingSlug'
import { routes } from '@/lib/routes'
import { ChevronRightIcon } from '@/components/icons'
import CategoryIcon from '@/components/CategoryIcon'

/** One thing that changed: "Hours" in grey, "Sunday 11 AM – 10 PM" in ink;
 *  a quiet one ("New photo") all grey. */
function Part({ part }: { part: ChangePart }) {
  if (part.quiet) return <span className="text-slate-500">{part.value}</span>
  return (
    <>
      {part.label && <span className="text-slate-500">{part.label} </span>}
      <span className="font-semibold text-ink">{part.value}</span>
    </>
  )
}

/** What it changed. In full, one a line (the page, the admin); or, on
 *  Today's row, what fits in about two lines and "and 2 more", which opens
 *  the rest in place (agreed Oct 2). */
function Parts({ parts, fit }: { parts: ChangePart[]; fit: boolean }) {
  const [open, setOpen] = useState(false)
  if (parts.length === 0) return null
  if (!fit || open) {
    return (
      <span data-testid="change-parts" className="mt-0.5 block text-[14px] leading-snug">
        {parts.map((p, i) => (
          <span key={i} className="block">
            <Part part={p} />
          </span>
        ))}
      </span>
    )
  }
  const { shown, more } = fitParts(parts)
  return (
    <span data-testid="change-parts" className={`mt-0.5 block text-[14px] leading-snug ${more ? '' : 'line-clamp-2'}`}>
      {shown.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="text-slate-400"> · </span>}
          <Part part={p} />
        </span>
      ))}
      {more > 0 && (
        <>
          <span className="text-slate-400"> · </span>
          {/* Above the row's link, which covers the rest of the row. */}
          <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className="relative z-[1] font-bold text-primary hover:underline">
            and {more} more
          </button>
        </>
      )}
    </span>
  )
}

/** One change: the category's icon, the line with the place's name in bold,
 *  under it the category and when, then what it changed. Opens the listing,
 *  except a place taken out of the guide, which has no page any more. `end`
 *  replaces the chevron (the admin's Hide). `fit`: Today's row, two lines of
 *  what changed at most. */
export default function ChangeRow({
  change,
  categories,
  communitySlug,
  when,
  end,
  fit = false,
}: {
  change: Change
  categories: readonly CategoryConfig[]
  communitySlug: string
  when: string
  end?: ReactNode
  fit?: boolean
}) {
  const category = categories.find((c) => c.id === change.listing.category)
  const { before, name, after } = changeSentence(change)
  const linked = !end && change.kind !== 'removed'
  const sentence = (
    <>
      {before}
      <b className="font-bold text-ink">{name}</b>
      {after}
    </>
  )
  return (
    <li data-testid="change">
      <div className={`relative flex items-start gap-3 border-t border-slate-100 py-2.5 ${linked ? 'hover:bg-slate-50' : ''}`}>
        <span className={`pt-px ${change.hidden ? 'opacity-45' : ''}`}>
          <CategoryIcon icon={category?.icon ?? ''} categoryId={change.listing.category} color={getCategoryColor([...categories], change.listing.category)} className="h-9 w-9 text-base" sizePx={36} />
        </span>
        <span className={`min-w-0 flex-1 ${change.hidden ? 'opacity-45' : ''}`}>
          <span className="block text-[15px] leading-snug text-slate-700">
            {linked ? (
              // The whole row is the link (its ::after covers it), so "and 2
              // more" can be a button of its own above it.
              <Link
                href={routes.listing(communitySlug, change.listing.category, listingSlug(change.listing))}
                prefetch={false}
                className="after:absolute after:inset-0 after:content-['']"
              >
                {sentence}
              </Link>
            ) : (
              sentence
            )}
            {change.hidden && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-px text-[11.5px] font-bold text-slate-500">Hidden</span>}
          </span>
          <span className="mt-0.5 block text-[13px] text-slate-500">
            {category?.label ?? change.listing.category} · {when}
          </span>
          <Parts parts={change.parts} fit={fit} />
        </span>
        {linked ? <ChevronRightIcon className="mt-2.5 h-4 w-4 shrink-0 text-slate-400" /> : end && <span className="shrink-0 self-center">{end}</span>}
      </div>
    </li>
  )
}
