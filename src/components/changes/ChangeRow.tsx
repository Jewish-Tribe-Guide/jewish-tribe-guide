'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import type { Change } from '@/lib/whatChanged'
import { changeSentence } from '@/lib/whatChanged'
import { getCategoryColor } from '@/lib/categoryColor'
import { listingSlug } from '@/lib/listingSlug'
import { routes } from '@/lib/routes'
import { ChevronRightIcon } from '@/components/icons'
import CategoryIcon from '@/components/CategoryIcon'

/** One change: the category's icon, the line with the place's name in bold,
 *  and under it the category and when. Opens the listing, except a place
 *  taken out of the guide, which has no page any more. `end` replaces the
 *  chevron (the admin's Hide). */
export default function ChangeRow({
  change,
  categories,
  communitySlug,
  when,
  end,
}: {
  change: Change
  categories: readonly CategoryConfig[]
  communitySlug: string
  when: string
  end?: ReactNode
}) {
  const category = categories.find((c) => c.id === change.listing.category)
  const { before, name, after } = changeSentence(change)
  const body = (
    <>
      <span className={change.hidden ? 'opacity-45' : undefined}>
        <CategoryIcon icon={category?.icon ?? ''} categoryId={change.listing.category} color={getCategoryColor([...categories], change.listing.category)} className="h-9 w-9 text-base" sizePx={36} />
      </span>
      <span className={`min-w-0 flex-1 ${change.hidden ? 'opacity-45' : ''}`}>
        <span className="block text-[15px] leading-snug text-slate-700">
          {before}
          <b className="font-bold text-ink">{name}</b>
          {after}
          {change.hidden && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-px text-[11.5px] font-bold text-slate-500">Hidden</span>}
        </span>
        <span className="mt-0.5 block text-[13px] text-slate-500">
          {category?.label ?? change.listing.category} · {when}
        </span>
      </span>
    </>
  )
  const linked = !end && change.kind !== 'removed'
  return (
    <li data-testid="change">
      {linked ? (
        <Link
          href={routes.listing(communitySlug, change.listing.category, listingSlug(change.listing))}
          prefetch={false}
          className="flex items-center gap-3 border-t border-slate-100 py-2.5 hover:bg-slate-50"
        >
          {body}
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
        </Link>
      ) : (
        <div className="flex items-center gap-3 border-t border-slate-100 py-2.5">
          {body}
          {end}
        </div>
      )}
    </li>
  )
}
