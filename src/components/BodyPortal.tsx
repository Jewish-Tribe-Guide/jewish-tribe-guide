'use client'

import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useHydrated } from '@/lib/useHydrated'

// ── An overlay drawn straight into <body> ───────────────────────────────────
// For the listing sheet and the listing dialog, which are rendered from
// inside a page's <main>. The page's content rises into place as it appears
// (SlugScreen's fadeIn: a transform, 180ms; Landing's Back slide), and while
// it does, anything `fixed` inside it is measured from that moving box
// rather than the screen and layered under the site header: a listing's
// backdrop started below the header, so a tap at the top of the screen to
// close it hit the header's back button and went home. Here the overlay
// always covers the whole screen, whatever its ancestors are doing.
//
// Until the page has hydrated it renders in place, as the server did, so a
// listing opened on the server (a listing's own URL) hydrates without a
// mismatch and then moves to <body>. Opened any later, it goes straight
// there. React events still bubble through the component tree as before.
export default function BodyPortal({ children }: { children: ReactNode }) {
  const hydrated = useHydrated()
  return hydrated ? createPortal(children, document.body) : children
}
