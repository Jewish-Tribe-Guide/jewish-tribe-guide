'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

// Shown for an unknown community (/baltimore before Baltimore exists) and an
// unknown slug under one (/philly/nonsense). Both used to be impossible to
// express: the whole site was one URL, so an unrecognized view rendered an
// empty state with a 200 — which is also what a crawler and a link preview saw.
//
// Client component so it can read the attempted path with usePathname() —
// not-found.tsx gets no params/props in any Next.js version, per the docs.
// That's also why the community check below hits /api/communities instead of
// listCommunities() directly: this file has no server-side access to call it.
export default function NotFound() {
  const pathname = usePathname()
  const attemptedSlug = pathname?.split('/').filter(Boolean)[0]
  const [community, setCommunity] = useState<{ slug: string; name: string } | null>(null)

  useEffect(() => {
    if (!attemptedSlug) return
    fetch('/api/communities')
      .then((res) => res.json())
      .then((data: { communities?: { slug: string; name: string }[] }) => {
        const match = data.communities?.find((c) => c.slug === attemptedSlug)
        if (match) setCommunity(match)
      })
      .catch(() => {})
  }, [attemptedSlug])

  return (
    <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Page not found</h1>
      <p className="mt-3 text-sm text-muted">
        This link may be out of date — a category or community can be renamed or removed after a
        link to it has been shared.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {community && (
          <>
            <Link
              href={`/${community.slug}`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              {community.name} home
            </Link>
            <Link
              href={`/${community.slug}/map`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Map
            </Link>
          </>
        )}
        <Link href="/" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">
          Go home
        </Link>
      </div>
    </main>
  )
}
