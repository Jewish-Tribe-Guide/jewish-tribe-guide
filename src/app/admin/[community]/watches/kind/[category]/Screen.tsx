'use client'

import { Suspense, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { adminBase } from '@/lib/adminNav'
import { placePath } from '@/lib/placeLink'

// The page of a whole kind, gone since Oct 31. Emails already sent still link
// here: one with ?place= goes to that place, the rest to To do, where it waits.
export default function AdminWatchKindRedirect() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  )
}

function Redirect() {
  const router = useRouter()
  const params = useParams<{ community: string }>()
  const place = useSearchParams().get('place')
  const base = adminBase(params.community)
  useEffect(() => {
    router.replace(place ? `${base}/watches/${placePath(place, 'todo')}` : base)
  }, [router, base, place])
  return null
}
