import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDefaultCommunity, listCommunities } from '@/lib/communityStore'
import { COMMUNITY_COOKIE } from '@/lib/communityContext'

// ─────────────────────────────────────────────────────────────────────────────
// "/" is not a screen — every screen lives under a community (see routes.ts).
//
// This file used to be the entire public site: one client component holding a
// `mode` in state, a hand-rolled NavState pushed into history.state, and a
// popstate listener copying it back out. Every screen shared the single URL
// "/", so nothing was shareable, indexable, or distinguishable in analytics.
// All of that is now the route tree under app/[community].
//
// The last community a device read is kept in a cookie rather than
// localStorage specifically so this redirect can happen on the server: a
// crawler and a link preview get a real 307 to a real community, and a
// returning visitor never sees a flash of the wrong one while JavaScript
// decides. A stale slug (a community since renamed or removed) falls through
// to the default rather than 404ing.
// ─────────────────────────────────────────────────────────────────────────────
export default async function RootPage() {
  const remembered = (await cookies()).get(COMMUNITY_COOKIE)?.value
  if (remembered) {
    const communities = await listCommunities()
    if (communities.some((c) => c.slug === remembered)) redirect(`/${remembered}`)
  }
  redirect(`/${(await getDefaultCommunity()).slug}`)
}
