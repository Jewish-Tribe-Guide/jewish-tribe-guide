import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { listCategories } from '@/lib/categoryStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { listCommunities } from '@/lib/communityStore'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { listingSlug, resolveListing } from '@/lib/listingSlug'
import SlugScreen from '../SlugScreen'

// ─────────────────────────────────────────────────────────────────────────────
// One listing's own URL — /philly/grocery/goldi-a1b2c3 — the link worth
// sending a friend rather than "go to Philly, tap Grocery, scroll to Goldi".
//
// Only a real listing category has these (a form has no listings, and the
// fixed views — hospitals/eruv/zmanim — aren't per-listing either), so this
// 404s for anything [slug]/page.tsx would resolve to a form or a fixed view.
// It reuses that same category lookup rather than duplicating it, then
// additionally resolves the id segment against the category's own listings —
// see resolveListing, which tries the friendly slug first and falls back to
// a bare id so a link built before slugs existed still works.
//
// generateStaticParams below, same as [slug]/page.tsx one level up, isn't
// just an optimization here — the shared root layout (SiteChrome, wrapping
// locationContext/pinnedContext/droppedPinsContext etc.) reads dynamic state
// outside any Suspense boundary this route controls. With Cache Components,
// a dynamic segment that resolves NO params at build time makes Next try to
// prerender a paramless fallback shell for it, and that shell build is what
// trips on the layout's dynamic reads — "Uncached data was accessed outside
// of <Suspense>". Handing Next every real (community, slug, id) triple up
// front sidesteps that fallback path entirely: every listing is prerendered
// against context that already has real params, exactly like every category
// page already is. A listing created after the last build (or approved by an
// admin) still resolves — dynamicParams defaults to true — it just isn't
// prerendered ahead of time until the next build picks it up.
// ─────────────────────────────────────────────────────────────────────────────

async function resolve(community: string, slug: string, id: string) {
  const categories = await listCategories(community).catch(() => [])
  const category = categories.find((c) => c.id === slug && c.kind === 'listing')
  if (!category) return null

  const listings = await listApprovedResources(community, { category: slug }).catch(() => null)
  if (!listings) return null

  const item = resolveListing(listings, id)
  if (!item) return null

  return { category, listings, item }
}

export async function generateMetadata(
  props: PageProps<'/[community]/[slug]/[id]'>,
): Promise<Metadata> {
  const { community, slug, id } = await props.params
  const communities = await listCommunities()
  const site = communities.find((c) => c.slug === community)
  const resolved = await resolve(community, slug, id)
  if (!resolved || !site) return {}

  const settings = await getSiteSettings(community).catch(() => SITE_SETTINGS_DEFAULTS)
  const siteName = settings.name || site.name

  // "Goldi · Grocery Stores · Philly Jewish Guide" — the listing first, since
  // that's what the link is actually about.
  const title = `${resolved.item.name} · ${resolved.category.pluralLabel} · ${siteName}`
  const description = resolved.item.address || resolved.category.description || `${resolved.category.pluralLabel} in ${site.region}.`

  return {
    title,
    description,
    openGraph: { title, description, siteName, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export async function generateStaticParams() {
  const communities = await listCommunities().catch(() => [])

  const params = await Promise.all(
    communities.map(async (community) => {
      const categories = await listCategories(community.slug).catch(() => [])
      const listingCategories = categories.filter((c) => c.kind === 'listing')

      const perCategory = await Promise.all(
        listingCategories.map(async (category) => {
          const listings = await listApprovedResources(community.slug, { category: category.id }).catch(() => [])
          return listings.map((item) => ({
            community: community.slug,
            slug: category.id,
            id: listingSlug(item),
          }))
        }),
      )
      return perCategory.flat()
    }),
  )

  return params.flat()
}

export default async function ListingPage(props: PageProps<'/[community]/[slug]/[id]'>) {
  const { community, slug, id } = await props.params
  const resolved = await resolve(community, slug, id)
  if (!resolved) notFound()

  return (
    <Suspense fallback={<main className="flex flex-1 flex-col" />}>
      <SlugScreen slug={slug} kind="category" listings={resolved.listings} initialItemId={resolved.item.id} />
    </Suspense>
  )
}
