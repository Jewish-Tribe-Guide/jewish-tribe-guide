'use client'

import { ExternalIcon } from '@/components/icons'
import { useShareLink } from '@/lib/useShareLink'

type Props = {
  /** The listing's own path — e.g. routes.listing(community, category, listingSlug(item))
   *  — resolved against location.origin at share time so this component
   *  doesn't need to know the deployment's domain. */
  path: string
  title: string
}

/** A "Share" control for one listing's canonical URL — native share sheet
 *  where available (mobile Safari/Chrome), clipboard copy everywhere else.
 *  Used by both the map's place detail and the directory's expanded card, so
 *  a place can be sent to a friend from wherever it was found. */
export default function ShareButton({ path, title }: Props) {
  const { share, copied } = useShareLink(path, title)

  return (
    <button
      onClick={share}
      className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors cursor-pointer"
    >
      <ExternalIcon className="h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Share'}
    </button>
  )
}
