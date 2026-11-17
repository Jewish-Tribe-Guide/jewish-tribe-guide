'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { useActiveCommunity, useCommunityTimezone } from '@/lib/communityContext'
import { useNow } from '@/lib/useNow'
import { routes } from '@/lib/routes'
import { TAB_BAR_CLEARANCE } from '@/lib/tabBarClearance'
import { nightTitle, nightWhen, type NamedNight } from '@/lib/validatedNights'

/** How many of a group's places show before "Show all". */
const SHOWN = 4

/** A night's page (boards X4, X5): a group per kind of check, every row a
 *  listing, the source only in the heading. Only what was validated. */
export default function NightScreen({ night }: { night: NamedNight }) {
  const { community } = useActiveCommunity()
  const timezone = useCommunityTimezone()
  const now = useNow()
  const router = useRouter()
  // Before the visitor's clock is read, the date, never "last night".
  const title = nightTitle(night, now ?? 0, timezone)
  useSetScreenHeader(true, title, () => router.push(routes.changes(community.slug)))

  return (
    <main data-testid="night-page" className={`mx-auto w-full max-w-3xl flex-1 px-4 ${TAB_BAR_CLEARANCE} pt-5 sm:px-6 desktop:pb-12 desktop:pt-8 animate-[fadeIn_180ms_ease-out]`}>
      <div className="hidden desktop:block">
        <Link href={routes.changes(community.slug)} className="mb-1.5 block text-[15px] font-bold text-primary hover:underline">
          ‹ What changed
        </Link>
      </div>
      <h1 className="sr-only text-[34px] font-extrabold leading-tight text-ink desktop:not-sr-only desktop:block">{title}</h1>
      <p data-testid="night-when" className="mt-0.5 text-[15px] text-slate-600 desktop:mt-1.5">
        {now === null ? ' ' : nightWhen(night, now, timezone)}
      </p>
      {night.groups.map((g) => (
        <Group key={g.id} title={g.title} names={g.places.map((p) => p.name)} />
      ))}
    </main>
  )
}

function Group({ title, names }: { title: string; names: string[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? names : names.slice(0, SHOWN)
  return (
    <section data-testid="night-group" className="mt-5">
      <h2 className="text-[13px] font-extrabold uppercase tracking-[0.05em] text-slate-500">
        {title} · {names.length}
      </h2>
      <ul className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 [&>li:first-child]:border-t-0">
        {shown.map((name, i) => (
          <li key={i} className="border-t border-slate-100 py-2.5 text-[15px] text-ink">
            {name}
          </li>
        ))}
        {names.length > shown.length && (
          <li className="border-t border-slate-100 py-2.5">
            <button type="button" onClick={() => setAll(true)} className="text-[15px] font-bold text-primary hover:underline">
              Show all {names.length}
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}
