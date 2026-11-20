'use client'

import { useParams } from 'next/navigation'
import { ErrorScreen } from '@/components/errors/ErrorScreen'

// A page under a community that breaks keeps the community's header (Nov 20,
// the health sweep). Only the root boundary existed, which sits above this
// layout, so one broken listing took the header and its way back with it.
// An error.tsx catches what its segment's pages throw and leaves the
// segment's own layout standing.
export default function CommunityError(props: { error: Error & { digest?: string }; reset: () => void }) {
  const { community } = useParams<{ community: string }>()
  return <ErrorScreen {...props} home={community ? `/${community}` : '/'} />
}
