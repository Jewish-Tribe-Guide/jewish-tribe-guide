'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DirectoryResource, ZmanimData } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import type { MinyanSchedule } from '@/lib/useMinyanSchedule'
import { useCategories } from '@/lib/useCategories'
import { useHomeSections } from '@/lib/useHomeSections'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { useSiteNavigation } from '@/lib/useSiteNavigation'
import { getCategoryColor } from '@/lib/categoryColor'
import { nextMinyansAcross } from '@/lib/upcomingDavening'
import { browseLine, shabbosMoment } from '@/lib/todayHome'
import { routes } from '@/lib/routes'
import { withMilesFromAddress, withMilesFromCenter } from '@/lib/listingTravel'
import type { LatLng } from '@/lib/geo'
import { ChevronRightIcon } from '@/components/icons'
import CategoryIcon from '@/components/CategoryIcon'
import SearchBox from './SearchBox'
import { groupCardsIntoSections, resourceCards, useEntryCards } from './sections'

// ── The Browse tab (step 6) ──────────────────────────────────────────────────
// Every category, in the admin's home page groups, one compact row each: its
// icon in its colour, its name, how many places, and one live line, the
// thing its own page says first ("59 open now", "3 Shabbat friendly",
// "Next: Mincha 2 PM · Mikveh Israel"); nothing where its page has nothing to
// say. Then Feedback, About and Privacy, which a phone has nowhere else once
// the tabs are Today · Map · Browse.

type Props = {
  communitySlug: string
  listings: readonly DirectoryResource[] | null
  /** The clock (useMinyanSchedule's), null until the page has hydrated. */
  schedule: MinyanSchedule | null
  zmanim: ZmanimData | null
  timezone: string
  /** The visitor's location, if set; else distances are from the centre,
   *  as on a category page. */
  coords: LatLng | null
  center: LatLng
}

export default function BrowseAll({ communitySlug, listings, schedule, zmanim, timezone, coords, center }: Props) {
  const categories = useCategories()
  const homeSections = useHomeSections()
  const settings = useSiteSettings()
  const { navigate, openFlow } = useSiteNavigation()
  const entryCards = useEntryCards(openFlow)
  const router = useRouter()
  const [query, setQuery] = useState('')

  const counts: Record<string, number> = {}
  for (const l of listings ?? []) counts[l.category] = (counts[l.category] ?? 0) + 1
  const resources = resourceCards(navigate, categories, communitySlug, listings ? counts : null)
  const sections = resources ? groupCardsIntoSections([...entryCards, ...resources], homeSections ?? []) : null

  const now = schedule ? new Date(schedule.now) : null
  const restDay = schedule !== null && shabbosMoment(zmanim, schedule.now, timezone).kind === 'shabbos'
  const lineFor = (id: string | undefined): string | null => {
    const category = categories?.find((c) => c.id === id)
    if (!category || !listings) return null
    if (category.id === schedule?.linkCategoryId) return nextMinyanLine(schedule)
    if (category.kind !== 'listing') return null
    const items = listings.filter((l) => l.category === category.id)
    // Each place's distance, as its category page measures it (for a list
    // grouped by distance).
    return browseLine(category, coords ? withMilesFromAddress(items, coords) : withMilesFromCenter(items, center), now, restDay)
  }

  const ask = () => {
    const q = query.trim()
    if (q) router.push(routes.ask(communitySlug, q))
  }

  return (
    <div data-testid="browse-page">
      <h1 className="text-[28px] font-extrabold tracking-tight text-ink desktop:text-[36px]">Browse</h1>
      <div className="mt-3">
        <SearchBox query={query} onQueryChange={setQuery} onSubmit={ask} placeholder={settings.searchPlaceholder} />
      </div>
      {sections === null ? (
        <div aria-hidden="true" className="mt-6 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="desktop:mt-2 desktop:grid desktop:grid-cols-2 desktop:gap-x-8">
          {sections.map((section) => (
            <section key={section.title} data-testid={`browse-group-${section.title}`} className="mt-6">
              <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-slate-500">{section.title}</h2>
              <ul className="mt-1">
                {section.cards.map((card) => {
                  const line = lineFor(card.id)
                  // Only where the card counts something (not a form).
                  const n = card.count && card.id ? counts[card.id] : undefined
                  return (
                    <li key={card.id ?? card.title}>
                      <Link href={card.href} prefetch={false} className="flex items-center gap-3 border-t border-slate-100 py-2.5 hover:bg-slate-50">
                        <CategoryIcon icon={card.icon ?? ''} categoryId={card.id} color={getCategoryColor((categories ?? []) as CategoryConfig[], card.id ?? '')} className="h-9 w-9 text-base" sizePx={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[16px] font-bold text-ink">{card.title}</span>
                          {line && <span className="block truncate text-[13.5px] text-slate-600">{line}</span>}
                        </span>
                        {n !== undefined && <span className="shrink-0 text-[13.5px] text-slate-500">{n}</span>}
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <nav aria-label="About the guide" className="mt-8 flex gap-5 border-t border-slate-200 pt-3 text-[15px] font-bold text-primary">
        {settings.feedbackEnabled && <Link href={routes.feedback(communitySlug)}>Feedback</Link>}
        <Link href={routes.about(communitySlug)}>About</Link>
        <Link href={routes.privacy(communitySlug)}>Privacy</Link>
      </nav>
    </div>
  )
}

/** The shuls' row: the next minyan anywhere, as the Today home's Next
 *  minyan block puts it first. */
function nextMinyanLine(schedule: MinyanSchedule | null): string | null {
  if (!schedule) return null
  const [first] =
    nextMinyansAcross(
      schedule.shuls,
      { today: schedule.todayDayKeys, tomorrow: schedule.tomorrowDayKeys, nowMinutes: schedule.nowMinutes, season: schedule.season, anchors: schedule.anchors },
      () => null,
      1,
    ) ?? []
  if (!first) return null
  const tomorrow = first.label.endsWith(' tomorrow')
  const label = tomorrow ? first.label.slice(0, -' tomorrow'.length) : first.label
  return `Next: ${label} ${first.time}${tomorrow ? ' tomorrow' : ''} · ${first.shulName}`
}
