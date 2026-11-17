import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import NightScreen from './NightScreen'
import { features } from '@/lib/features'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { changesLinked } from '@/lib/siteSettings'
import { listCommunities } from '@/lib/communityStore'
import { listNights } from '@/lib/nightsStore'

// What one night validated (validatedNights.ts), opened from its row in What
// changed (boards X4, X5). Its own address, so Back and a reload land here.

/** Every night there is, prerendered. Next needs at least one per route
 *  (Cache Components), so a community with none yet gets a date that 404s. */
export async function generateStaticParams() {
  const communities = await listCommunities().catch(() => [])
  const params = await Promise.all(
    communities.map(async (c) => {
      const nights = await listNights(c.slug).catch(() => [])
      return nights.length ? nights.map((n) => ({ community: c.slug, night: n.key })) : [{ community: c.slug, night: 'none' }]
    }),
  )
  return params.flat()
}

async function findNight(community: string, key: string) {
  if (!features.whatChanged && !changesLinked(await getSiteSettings(community))) return null
  const nights = await listNights(community).catch(() => [])
  return nights.find((n) => n.key === key) ?? null
}

export async function generateMetadata(props: PageProps<'/[community]/changes/validated/[night]'>): Promise<Metadata> {
  const { community, night } = await props.params
  const found = await findNight(community, night)
  return { title: found ? 'What was validated' : 'Not found', robots: { index: false } }
}

export default async function NightPage(props: PageProps<'/[community]/changes/validated/[night]'>) {
  const { community, night: key } = await props.params
  const night = await findNight(community, key)
  if (!night) notFound()
  return <NightScreen night={night} />
}
