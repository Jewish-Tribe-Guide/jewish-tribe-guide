import { Suspense } from 'react'
import HomeScreen from './HomeScreen'

// The Suspense boundary is what lets this page prerender. HomeScreen reads
// `?at=map` with useSearchParams, which can't resolve at build time — the
// boundary means the shell is still static and only the part that needs the
// query string waits for the request. Same pattern on every screen below that
// reads search params.
export default function HomePage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <HomeScreen />
    </Suspense>
  )
}
