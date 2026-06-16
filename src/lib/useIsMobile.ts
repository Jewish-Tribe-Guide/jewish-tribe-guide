import { useEffect, useState } from 'react'

// Reports whether the viewport is phone-width. SSR-safe: starts false (desktop)
// so server and first client render agree, then updates after mount. Use for
// small presentational tweaks like shorter placeholder text — not for anything
// that must be correct on the very first paint.
export function useIsMobile(query = '(max-width: 640px)'): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])

  return isMobile
}
