'use client'

import { useSearchParams } from 'next/navigation'
import Landing, { type LandingProps } from './Landing'

type Props = Omit<LandingProps, 'scrollTo'>

// The query-string-aware half of Landing, split out so a plain home-screen
// visit (no ?at=map — the common case) never has to call useSearchParams()
// to render. See HomeScreen, which wraps this in
// <Suspense fallback={<Landing {...props} scrollTo={null} />}> — the
// fallback is Landing itself with no query string read, the exact same
// render this component produces when `at` isn't 'map'.
export default function LandingConnected(props: Props) {
  const params = useSearchParams()
  return <Landing {...props} scrollTo={params.get('at') === 'map' ? 'map' : null} />
}
