import type { MetadataRoute } from 'next'
import { listCommunities } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { listPublishedForms } from '@/lib/formStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import { siteUrl } from '@/lib/siteUrl'

// ─────────────────────────────────────────────────────────────────────────────
// A sitemap only became possible when screens got URLs. Before this the whole
// site was "/", so there was exactly one page to declare and nothing about the
// directory was indexable — which matters for a site whose entire job is
// answering "kosher grocery near this hospital", a question people type into a
// search engine.
//
// Change frequencies reflect how the content actually moves: a category
// directory changes when an admin approves a listing (weekly-ish), the home
// and index pages whenever any of them do.
// ─────────────────────────────────────────────────────────────────────────────

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  const communities = await listCommunities().catch(() => [])
  const now = new Date()

  const entries: MetadataRoute.Sitemap = []

  for (const community of communities) {
    const slug = community.slug
    entries.push(
      { url: `${base}${routes.home(slug)}`, lastModified: now, changeFrequency: 'daily', priority: 1 },
      { url: `${base}${routes.allCategories(slug)}`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
      { url: `${base}${routes.map(slug)}`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    )

    // A failure here should cost that community its category URLs, not the
    // whole sitemap — a partial sitemap is still worth serving.
    const [categories, forms] = await Promise.all([
      listCategories(slug).catch(() => []),
      listPublishedForms(slug).catch(() => []),
    ])

    for (const category of categories) {
      entries.push({
        url: `${base}${routes.slug(slug, category.id)}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.9,
      })

      // Individual listings — this is the content people actually search for
      // ("kosher grocery near X"), not just the category shell around it. A
      // failure here costs this category its listing URLs, not the sitemap.
      if (category.kind === 'listing') {
        const listings = await listApprovedResources(slug, { category: category.id }).catch(() => [])
        for (const item of listings) {
          entries.push({
            url: `${base}${routes.listing(slug, category.id, listingSlug(item))}`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.6,
          })
        }
      }
    }

    for (const form of forms) {
      entries.push({
        url: `${base}${routes.slug(slug, form.id)}`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.5,
      })
    }
  }

  return entries
}
