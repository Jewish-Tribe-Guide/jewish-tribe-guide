'use client'

import Link from 'next/link'
import { ChevronRightIcon, StarOfDavid } from '@/components/icons'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { routes } from '@/lib/routes'
import { nightLine, type NightRow } from '@/lib/validatedNights'

/** A night's quiet row in What changed (board W1): the site's logo on a
 *  small tile, "Validated · 132 against Google · 119 against their own
 *  websites · 2 AM", opening what it validated. Grey, under the changes,
 *  since nothing changed. */
export default function ValidatedRow({ night, communitySlug, when }: { night: NightRow; communitySlug: string; when: string }) {
  const logo = useSiteSettings().logoUrl?.trim()
  return (
    <li data-testid="validated-night">
      <div className="relative flex items-center gap-3 border-t border-slate-100 py-2.5 hover:bg-slate-50">
        <span aria-hidden="true" className="ml-0.5 grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-[9px] border border-slate-200 bg-white">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- the header's own logo, unoptimized as there (SiteHeader)
            <img src={logo} alt="" className="h-[22px] w-[22px] object-contain" />
          ) : (
            <StarOfDavid className="h-4 w-4 text-primary" />
          )}
        </span>
        <Link
          href={routes.validatedNight(communitySlug, night.key)}
          prefetch={false}
          className="min-w-0 flex-1 text-[0.875rem] leading-snug text-slate-500 after:absolute after:inset-0 after:content-['']"
        >
          <span className="font-semibold text-slate-700">Validated</span>
          {[...nightLine(night), when].map((part) => (
            <span key={part}> · {part}</span>
          ))}
        </Link>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
      </div>
    </li>
  )
}
