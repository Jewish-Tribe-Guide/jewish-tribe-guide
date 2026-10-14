'use client'

import { openState, searchAsk, type AskResult } from '@/lib/askSearch'
import { answerFor, eruvAnswer, metaAnswer, timesAnswer, type Answer } from '@/lib/askAnswer'
import { minyanLine, searchLines, timesLine, type LinesContext, type SearchLine } from '@/lib/searchLands'
import { haversineMiles, milesText, type LatLng } from '@/lib/geo'
import { resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import { useZmanim } from '@/lib/useZmanim'
import { eruvim } from '@/data/resources'
import { routes } from '@/lib/routes'
import { neighborhoodsFor } from '@/lib/places'
import { answerSchedule, useMinyanSchedule } from '@/lib/useMinyanSchedule'
import { useAllListings } from '@/lib/useAllListings'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { community } from '@/community.config'
import { ui } from '@/lib/uiConfig'

// The home's search, as the home box runs it: a question searched and
// answered (askSearch, askAnswer), and the lines saying where it could go
// (searchLands). Here rather than in Landing so You can ask a saved search
// again the same way and say what it finds now in the same words as its home
// line: the two can't disagree.

export type HomeCard = { id?: string; title: string; href?: string | null }

export function useHomeSearch(coords: LatLng | null) {
  const communitySlug = useCommunitySlug()
  const categories = useCategories()
  const listings = useAllListings()
  // Against useMinyanSchedule's clock, not a fresh `new Date()` in render
  // (which Cache Components rejects), so "open now" and the next minyan
  // agree on what now is. Null until the page has hydrated (see useNow): no
  // question is answered before then.
  const schedule = useMinyanSchedule(coords)
  // The community's neighborhoods, for "food in Center City" (towns come
  // from the listings' own addresses — see places.ts).
  const places = neighborhoodsFor(communitySlug)
  const eruvPage = categories?.some((c) => c.kind === 'eruv') ?? false
  const zmanimPage = categories?.some((c) => c.kind === 'zmanim') ?? false
  // The same request the minyan schedule makes (same place, so one fetch).
  const zmanim = useZmanim(coords ?? community.mapCenter)

  const ask = (text: string): { result: AskResult; answer: Answer | null } => {
    const result = searchAsk(listings ?? [], categories ?? [], text, { coords, now: new Date(schedule?.now ?? 0), places })
    const answer = answerFor(result, {
      coords,
      center: community.mapCenter,
      schedule: result.query.minyan && schedule ? answerSchedule(schedule) : null,
      now: schedule?.now ?? null,
    })
    // "What's on this site?", "how do I add a listing?" (see metaAnswer).
    if (result.query.meta) {
      const kind = result.categoryIds?.length === 1 ? categories?.find((c) => c.id === result.categoryIds![0]) : undefined
      const addTo = kind && ui.contributions.add && resolveCapabilities(kind.capabilities).add
        ? { label: kind.label, href: `${routes.slug(communitySlug, kind.id)}?form=create` }
        : null
      return {
        result,
        answer: metaAnswer(result.query.meta, { listings: listings ?? [], categories: categories ?? [], aboutHref: routes.about(communitySlug), addTo }),
      }
    }
    // "When is candle lighting?": from the zmanim (see timesAnswer).
    if (result.query.times) {
      return {
        result,
        answer: timesAnswer(result.query.times, zmanim.data, {
          nowMs: schedule?.now ?? 0,
          pageHref: zmanimPage ? routes.slug(communitySlug, 'zmanim') : null,
          failed: zmanim.status === 'error',
        }),
      }
    }
    // "Is the eruv up?": where to check, when the community has an eruv
    // page (see eruvAnswer).
    if (result.query.eruv && eruvPage) return { result, answer: eruvAnswer(eruvim, routes.slug(communitySlug, 'eruv')) }
    return { result, answer }
  }

  // How a place's line says where it is and whether it's open.
  const placeSub = (item: DirectoryResource, category: CategoryConfig) => {
    const now = schedule ? new Date(schedule.now) : null
    const open = now ? openState(item, category, now) : null
    const from = coords ?? community.mapCenter
    const miles = item.geo ? haversineMiles(from, item.geo) : null
    return [
      category.label,
      open?.known ? (open.open ? (open.closesAt ? `Open until ${open.closesAt}` : 'Open now') : 'Closed now') : null,
      miles !== null ? milesText(miles) : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const linesFor = (text: string, result: AskResult, answer: Answer | null, reading: LinesContext['reading'] = null, cards: readonly HomeCard[] = []): SearchLine[] =>
    listings && categories
      ? searchLines(text, {
          slug: communitySlug,
          categories,
          listings,
          result,
          options: { coords, now: new Date(schedule?.now ?? 0), places },
          reading,
          minyanSub: result.query.minyan && answer ? minyanLine(answer.rows[0], answer.text) : null,
          minyanDay: result.query.minyan && answer?.rows[0]?.tomorrow && schedule ? schedule.tomorrowKey : null,
          timesSub: result.query.times ? (timesLine(result.query.times, zmanim.data) ?? (zmanim.status === 'error' ? null : 'Looking up the times…')) : null,
          cards,
          placeSub,
        })
      : []

  // What a search is asked with: where the visitor is, the page's clock.
  const options = { coords, now: new Date(schedule?.now ?? 0), places }

  return { communitySlug, categories, listings, schedule, zmanim, places, options, ask, linesFor }
}
