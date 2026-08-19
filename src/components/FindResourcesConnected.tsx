'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import FindResources, { type FindResourcesProps } from './FindResources'

type Props = Omit<
  FindResourcesProps,
  'searchItem' | 'searchQuery' | 'searchHospital' | 'searchForm' | 'onParamsChange'
>

// The query-string-aware half of FindResources, split out so the plain-URL
// case (no ?item=/?q=/?hospital=/?form= at all — the common one: a fresh
// visit, a crawler, a card tap) never has to call useSearchParams() to
// render. See FindResources' own searchItem/onParamsChange doc comments —
// this is what actually supplies them once the page has hydrated. The
// caller wraps this in <Suspense fallback={<FindResources {...props} />}>,
// so the fallback IS FindResources, just with none of the query-string
// props set — the exact same render this component produces on a plain
// URL, with zero duplicated JSX between the static and live paths.
export default function FindResourcesConnected(props: Props) {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const setParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <FindResources
      {...props}
      searchItem={params.get('item')}
      searchQuery={params.get('q')}
      searchHospital={params.get('hospital')}
      searchForm={params.get('form')}
      onParamsChange={setParams}
    />
  )
}
