import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { listCategories } from '@/lib/categoryStore'
import { listPublishedForms } from '@/lib/formStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { listCommunities } from '@/lib/communityStore'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { FIXED_VIEW_KINDS, RESERVED_SLUGS } from '@/lib/routes'
import { Suspense } from 'react'
import SlugScreen from './SlugScreen'

// ─────────────────────────────────────────────────────────────────────────────
// One slug under a community is either a category directory or a guided form.
//
// They already shared a namespace before this — the mobile tab bar resolved a
// tab target by looking for a category first and falling back to a form — so
// giving them one route rather than two matches how the app already thought
// about them, and keeps the URLs flat (/philly/grocery, not /philly/c/grocery).
// RESERVED_SLUGS stops a category ever being created with a name that would
// shadow one of the fixed screens.
//
// Resolved on the server so an unknown slug 404s properly. The old client-only
// version had no way to do that: an unrecognized view rendered an empty state
// with a 200, which is what search engines and link previews saw too.
// ─────────────────────────────────────────────────────────────────────────────

type Resolved =
  | { kind: 'category'; label: string; description: string }
  | { kind: 'form'; label: string; description: string }
  // Hospitals / Eruv Information / Zmanim & Shabbos — see FIXED_VIEW_KINDS.
  | { kind: 'view'; label: string; description: string }

async function resolveSlug(community: string, slug: string): Promise<Resolved | null> {
  // Checked before RESERVED_SLUGS, not after: these three slugs ARE reserved
  // (see FIXED_VIEW_KINDS), so the check below would otherwise 404 them before
  // this ever ran.
  const fixedKind = FIXED_VIEW_KINDS[slug]
  if (fixedKind) {
    const categories = await listCategories(community).catch(() => [])
    // The card that links here (see resourceCards) only exists once this
    // category does — a link to an unconfigured fixed view is exactly as
    // stale as a link to a deleted category, so it 404s the same way.
    const category = categories.find((c) => c.kind === fixedKind)
    if (!category) return null
    return { kind: 'view', label: category.pluralLabel || category.label, description: category.description }
  }

  if (RESERVED_SLUGS.has(slug)) return null

  const [categories, forms] = await Promise.all([
    listCategories(community).catch(() => []),
    listPublishedForms(community).catch(() => []),
  ])

  // Category wins, matching how the tab bar has always resolved a target.
  const category = categories.find((c) => c.id === slug)
  if (category) {
    return {
      kind: 'category',
      label: category.pluralLabel || category.label,
      description: category.description,
    }
  }

  const form = forms.find((f) => f.id === slug)
  if (form) return { kind: 'form', label: form.title, description: '' }

  return null
}

export async function generateMetadata(props: PageProps<'/[community]/[slug]'>): Promise<Metadata> {
  const { community, slug } = await props.params
  const communities = await listCommunities()
  const site = communities.find((c) => c.slug === community)
  const resolved = await resolveSlug(community, slug)
  if (!resolved || !site) return {}

  // The site name comes from the admin-edited settings, the same source the
  // header and the community layout's metadata use — reading it off the
  // community row instead would put a different name in the tab than on the
  // page. The row is the fallback for a settings table not yet migrated.
  const settings = await getSiteSettings(community).catch(() => SITE_SETTINGS_DEFAULTS)
  const siteName = settings.name || site.name

  // "Grocery Stores · Philly Jewish Guide" — the category first, because that's
  // what the link is about and what a preview card shows first.
  const title = `${resolved.label} · ${siteName}`
  const description = resolved.description || `${resolved.label} in ${site.region}.`

  return {
    title,
    description,
    openGraph: { title, description, siteName, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

/** Every category and form, for every community.
 *
 *  Without this, `params` here is request-time data, which blocks the route
 *  from producing a static shell — and since the community layout wraps the
 *  page, that held back the header and chrome too. With it, each directory is a
 *  real prerendered page: the fastest thing to serve and the thing a crawler
 *  can actually index, which is most of the point of giving these URLs at all.
 *
 *  A slug that isn't listed here still works — it's rendered on demand and
 *  404s if it resolves to nothing. */
export async function generateStaticParams() {
  const communities = await listCommunities().catch(() => [])

  const params = await Promise.all(
    communities.map(async (community) => {
      const [categories, forms] = await Promise.all([
        listCategories(community.slug).catch(() => []),
        listPublishedForms(community.slug).catch(() => []),
      ])
      // The fixed views' own slugs, not the id of the category that gates
      // them — that category's id is whatever the admin's label slugified to
      // (e.g. `eruv-information`), and isn't a real route on its own.
      const fixedViewSlugs = Object.entries(FIXED_VIEW_KINDS)
        .filter(([, kind]) => categories.some((c) => c.kind === kind))
        .map(([slug]) => slug)
      return [...categories.map((c) => c.id), ...forms.map((f) => f.id), ...fixedViewSlugs].map((slug) => ({
        community: community.slug,
        slug,
      }))
    }),
  )

  return params.flat()
}

export default async function SlugPage(props: PageProps<'/[community]/[slug]'>) {
  const { community, slug } = await props.params
  const resolved = await resolveSlug(community, slug)
  if (!resolved) notFound()

  // Only a category has listings; a form doesn't. Loaded here so the directory
  // ships with its places in the HTML rather than fetching them after
  // hydration — this is the page someone opens to find a kosher grocery, so
  // it's the one where a round trip costs the most.
  //
  // null on failure, deliberately distinct from an empty category. See
  // ResourceLoader's `items` prop.
  const listings =
    resolved.kind === 'category'
      ? await listApprovedResources(community, { category: slug }).catch((err) => {
          console.error(`[${slug}] listings failed to load:`, err)
          return null
        })
      : []

  return (
    <Suspense fallback={<main className="flex flex-1 flex-col" />}>
      <SlugScreen slug={slug} kind={resolved.kind} listings={listings} />
    </Suspense>
  )
}
