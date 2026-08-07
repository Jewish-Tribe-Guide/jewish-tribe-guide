import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { listCategories } from '@/lib/categoryStore'
import { listPublishedForms } from '@/lib/formStore'
import { listCommunities } from '@/lib/communityStore'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { RESERVED_SLUGS } from '@/lib/routes'
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

async function resolveSlug(community: string, slug: string): Promise<Resolved | null> {
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

export default async function SlugPage(props: PageProps<'/[community]/[slug]'>) {
  const { community, slug } = await props.params
  const resolved = await resolveSlug(community, slug)
  if (!resolved) notFound()

  return (
    <Suspense fallback={<main className="flex flex-1 flex-col" />}>
      <SlugScreen slug={slug} kind={resolved.kind} />
    </Suspense>
  )
}
