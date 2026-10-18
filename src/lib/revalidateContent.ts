import { revalidateTag } from 'next/cache'
import { listCommunities } from './communityStore'
import { allCommunityTags, TAGS } from './cacheTags'
import { revalidateRouteAfterInFlightRenders } from './revalidateAfterInFlightRenders'
import { routes } from './routes'

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
// Call from a Route Handler (or Server Action) after the write succeeds — an
// ADMIN one (or a cron job). It schedules a second pass that keeps the
// function alive for IN_FLIGHT_RENDER_GRACE_MS after the response; the public
// write routes (confirm, item, item/gone) invalidate their one tag directly
// instead, so a visitor tapping in a loop can't hold functions open.
// revalidateContent.test.ts holds every caller to that.
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

  // A page regeneration already running when the lines above ran read the old
  // data, and Next stamps the page it stores with the time it FINISHES — after
  // this invalidation — so it would be served as fresh for days: two listing
  // approvals in quick succession while someone is browsing, and the second
  // one never shows. This invalidates every public screen again once such a
  // render has had time to finish (see revalidateAfterInFlightRenders.ts).
  //
  // '/[community]' as a layout: every public screen sits under it, and any of
  // them can show what these tags hold (the layout itself reads categories,
  // settings, home sections, forms and hospitals). It is also a tag nothing
  // above used, which it has to be — Next drops a repeat within one request.
  revalidateRouteAfterInFlightRenders(routes.home('[community]'), 'layout')
}
