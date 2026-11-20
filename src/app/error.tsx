'use client'

import { ErrorScreen } from '@/components/errors/ErrorScreen'

// Catches a render or data error anywhere under the root layout. Without this
// the visitor got Next's bare error screen, which says nothing about what to do
// next and doesn't look like this site at all. A community's pages have their
// own, under the header ([community]/error.tsx).
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} />
}
