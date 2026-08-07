import { revalidateTag } from 'next/cache'
import { listCommunities } from './communityStore'
import { allCommunityTags, TAGS } from './cacheTags'

// ─────────────────────────────────────────────────────────────────────────────
// Throwing away the cached public content after an admin write.
//
// Without this, caching the content reads would be a trap: an admin approves a
// listing, reloads the site, and doesn't see it — the worst kind of bug,
// because it looks like the save failed and invites them to do it again.
//
// Deliberately blunt. It invalidates every content tag for every community
// rather than working out precisely what changed. Communities number in the
// handful, so the cost of over-invalidating is a few refetches; the cost of
// under-invalidating is an admin staring at a change that didn't take. The
// write paths also mostly don't know which community they touched — the admin
// console edits one, and several store functions take only a row id — so
// precision here would be guesswork wearing a confident face.
//
// Call from a Route Handler (or Server Action) after the write succeeds.
// ─────────────────────────────────────────────────────────────────────────────
export async function revalidatePublicContent(): Promise<void> {
  const communities = await listCommunities().catch(() => [])

  revalidateTag(TAGS.communities, 'max')
  for (const community of communities) {
    for (const tag of allCommunityTags(community.slug)) {
      // 'max' keeps serving the stale value while the fresh one regenerates,
      // so an admin save never makes a visitor wait on a cold query.
      revalidateTag(tag, 'max')
    }
  }
}
