'use client'

import { useState } from 'react'

/** Shares one page's URL, with a line of text when given — native share sheet where available
 *  (mobile Safari/Chrome), clipboard copy everywhere else. Used by
 *  ShareButton (the directory card / map detail panel) and the map's
 *  swipe-to-reveal row action, so a place can be sent to a friend from
 *  wherever it was found, with the same fallback behavior everywhere. */
export function useShareLink(path: string, title: string, textOf?: string | (() => string)) {
  const [copied, setCopied] = useState(false)

  const share = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const url = `${window.location.origin}${path}`
    // Worked out on the tap, not every render: an answer's text is a search.
    const text = typeof textOf === 'function' ? textOf() : textOf
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        // `text` goes with the link where there is one (an answer, a
        // question to a group): what the chat shows even if its preview
        // never loads.
        await navigator.share(text ? { title, text, url } : { title, url })
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
      await navigator.clipboard.writeText(text ? `${text} ${url}` : url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (e.g. no permission) — nothing more to do; the
      // link is still visible in the address bar once the visitor navigates
      // there directly, so this isn't the only way to get it.
    }
  }

  return { share, copied }
}
