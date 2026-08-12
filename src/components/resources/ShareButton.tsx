'use client'

import { useState } from 'react'
import { ExternalIcon } from '@/components/icons'

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
  const [copied, setCopied] = useState(false)

  const share = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const url = `${window.location.origin}${path}`
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url })
        // The OS share sheet shows its own success feedback (and its own
        // "Copy" action, if the visitor picks that) — nothing more to do.
        return
      } catch (err) {
        // Dismissing the sheet without picking anything rejects with
        // AbortError. That's not a failure — the visitor changed their mind —
        // so it must NOT fall through to the clipboard copy below; doing so
        // silently copied the link and claimed "Copied!" for a share the
        // visitor had just cancelled. A share() that fails for any other
        // reason (e.g. thrown synchronously because it's not really usable
        // here) still falls through, since in that case the sheet never
        // opened and copying is the only way left to hand over the link.
        if (err instanceof Error && err.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (e.g. no permission) — nothing more to do; the
      // link is still visible in the address bar once the visitor navigates
      // there directly, so this isn't the only way to get it.
    }
  }

  return (
    <button
      onClick={share}
      className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors cursor-pointer"
    >
      <ExternalIcon className="h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Share'}
    </button>
  )
}
