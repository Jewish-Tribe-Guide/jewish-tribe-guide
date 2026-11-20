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
  campaignBanners: (community: string) => `campaign-banners:${community}`,
  // The words taught to the search (askWords.ts), read with the categories.
  askWords: (community: string) => `ask-words:${community}`,
  /** The activity log as What changed reads it (changesStore). */
  changes: (community: string) => `changes:${community}`,
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
    TAGS.campaignBanners(community),
    TAGS.askWords(community),
    TAGS.changes(community),
  ]
}

/** On every public page of one community, and on nothing else's: getSiteSettings
 *  carries it, and the community layout reads that for every screen under it.
 *  Only the second pass of an admin save uses it (revalidateContent.ts): a
 *  tag the first pass doesn't, as Next drops a repeat within one request, and
 *  one that reaches only the saving community's pages, where the pattern
 *  `_N_T_/[community]/layout` it replaces reached every community's.
 *  Not in TAGS, so not in allCommunityTags: the first pass must not use it. */
export const communityPagesTag = (community: string) => `community-pages:${community}`
