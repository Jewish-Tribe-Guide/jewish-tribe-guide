import { Suspense } from 'react'
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
// crawler and a link preview get a real redirect to a real community, and a
// returning visitor never sees a flash of the wrong one. A stale slug (a
// community since renamed or removed) falls through to the default rather
// than 404ing.
// ─────────────────────────────────────────────────────────────────────────────

// Returns `never` — every path ends in redirect(), which throws. Annotated
// explicitly because an async function would otherwise widen to Promise<void>,
// which isn't a valid component type.
async function RedirectToCommunity({
  searchParams,
}: {
  searchParams: PageProps<'/'>['searchParams']
}): Promise<never> {
  // Carry the query string through the redirect. A dropped param is a silent
  // failure — the admin's preview frame opens "/?preview=1" and would land on
  // the ordinary site with the draft ignored and nothing to say why.
  const params = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([key, value]) =>
      value === undefined
        ? []
        : Array.isArray(value)
          ? value.map((v) => [key, v] as [string, string])
          : [[key, value] as [string, string]],
    ),
  )
  const qs = params.toString()
  const suffix = qs ? `?${qs}` : ''

  const remembered = (await cookies()).get(COMMUNITY_COOKIE)?.value
  if (remembered) {
    const communities = await listCommunities()
    if (communities.some((c) => c.slug === remembered)) redirect(`/${remembered}${suffix}`)
  }
  redirect(`/${(await getDefaultCommunity()).slug}${suffix}`)
}

export default function RootPage(props: PageProps<'/'>) {
  // Cookies and search params are request-time data, so the redirect has to
  // wait for a request. The boundary is what says so explicitly; the fallback
  // is empty because there is no page here to show — the only outcome is a
  // redirect somewhere real.
  return (
    <Suspense fallback={null}>
      <RedirectToCommunity searchParams={props.searchParams} />
    </Suspense>
  )
}
