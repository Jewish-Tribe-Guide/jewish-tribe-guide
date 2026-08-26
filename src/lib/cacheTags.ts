// ─────────────────────────────────────────────────────────────────────────────
// Cache tags for the public content reads.
//
// The content here is public, identical for every visitor, and changes only
// when an admin edits it — so it's cached until an edit invalidates it, rather
// than on a timer that would be either too slow (an approved listing takes an
// hour to appear) or too eager (every visitor pays for a Supabase query).
//
// Everything is per-community: invalidating Philadelphia's categories must not
// throw away Baltimore's.
// ─────────────────────────────────────────────────────────────────────────────

export const TAGS = {
  communities: 'communities',
  // Global, not per-community — see supabase/migrations/20240101000032_pages.sql.
  // Not part of allCommunityTags below; the pages admin route invalidates it
  // directly instead of going through revalidatePublicContent.
  pages: 'pages',
  categories: (community: string) => `categories:${community}`,
  resources: (community: string) => `resources:${community}`,
  siteSettings: (community: string) => `site-settings:${community}`,
  homeSections: (community: string) => `home-sections:${community}`,
  forms: (community: string) => `forms:${community}`,
  hospitals: (community: string) => `hospitals:${community}`,
} as const

/** Every tag whose content the admin can change for one community. A write
 *  path that isn't sure what it touched can invalidate the lot — over-
 *  invalidating costs one refetch, while under-invalidating means an admin
 *  saves a change and doesn't see it, which is the failure that actually
 *  wastes someone's afternoon. */
export function allCommunityTags(community: string): string[] {
  return [
    TAGS.categories(community),
    TAGS.resources(community),
    TAGS.siteSettings(community),
    TAGS.homeSections(community),
    TAGS.forms(community),
    TAGS.hospitals(community),
  ]
}
