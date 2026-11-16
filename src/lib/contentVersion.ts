import { createHash } from 'node:crypto'
import { cacheLife, cacheTag } from 'next/cache'
import { allCommunityTags } from './cacheTags'
import { readContentStamp } from './contentStamp'
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
  // The stored stamp when there is one (contentStamp.ts): what the page was
  // built with, compared below with what's current.
  const stamp = await readContentStamp()
  if (stamp) return stamp
  return fingerprint(community)
}

/** What /api/content-version answers: read fresh, not from a cache, so
 *  every server gives the same answer and it moves the moment a save does.
 *  Without migration 100, the cached fingerprint, as before. */
export async function currentContentVersion(community: string): Promise<string> {
  return (await readContentStamp()) ?? contentVersion(community)
}

async function fingerprint(community: string): Promise<string> {
  const [content, listings] = await Promise.all([loadCommunityContent(community), listApprovedResources(community)])
  return createHash('sha1').update(JSON.stringify([content, listings])).digest('base64url').slice(0, 16)
}
