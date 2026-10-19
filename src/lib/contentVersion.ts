import { createHash } from 'node:crypto'
import { cacheLife, cacheTag } from 'next/cache'
import { allCommunityTags } from './cacheTags'
import { loadCommunityContent } from './loadCommunityContent'
import { listApprovedResources } from './resourceStore'

/**
 * A short fingerprint of everything a community's pages are built from: the
 * layout's content (categories, settings, sections, forms, hospitals) and
 * the listings. The layout hands it to RefreshContentOnReturn, and
 * /api/content-version answers with the current one, so a tab coming back
 * re-renders only when something actually changed.
 *
 * Cached under every community tag, so any admin save or approval that
 * invalidates a page's content changes this too, and asking costs a cache
 * read.
 */
export async function contentVersion(community: string): Promise<string> {
  'use cache'
  cacheTag(...allCommunityTags(community))
  cacheLife('days')
  const [content, listings] = await Promise.all([loadCommunityContent(community), listApprovedResources(community)])
  return createHash('sha1').update(JSON.stringify([content, listings])).digest('base64url').slice(0, 16)
}
