import { permanentRedirect } from 'next/navigation'
import { getDefaultCommunity } from '@/lib/communityStore'

// ─────────────────────────────────────────────────────────────────────────────
// "/" is not a screen — every screen lives under a community (see routes.ts).
//
// This file used to be the entire public site: one client component holding a
// `mode` in state, a hand-rolled NavState pushed into history.state, and a
// popstate listener copying it back out. Every screen shared the single URL
// "/", so nothing was shareable, indexable, or distinguishable in analytics.
// All of that is now the route tree under app/[community].
//
// In practice proxy.ts answers "/" before this renders, and it's the one that
// knows about the returning-visitor cookie. This is the fallback, and it is
// deliberately plain: no cookies and no searchParams, i.e. no runtime APIs, so
// it needs no <Suspense> and therefore still produces a real HTTP redirect.
// The previous version read cookies here, which forced a Suspense boundary and
// silently downgraded the redirect to a client-side one — a 200 and a full
// HTML page to anything that doesn't run JavaScript.
//
// `getDefaultCommunity` is cached (`use cache`), so reading it doesn't make
// this dynamic either.
// ─────────────────────────────────────────────────────────────────────────────
export default async function RootPage() {
  // Permanent (308), matching proxy.ts's own — the mapping to the default
  // community is permanent in practice, not a temporary detour.
  permanentRedirect(`/${(await getDefaultCommunity()).slug}`)
}
