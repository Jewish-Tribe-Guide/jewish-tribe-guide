import { describe, expect, it } from 'vitest'
import { swallowedPrerenderStops } from './buildLog.mjs'

describe('swallowedPrerenderStops', () => {
  it("finds a route's caught prerender stop", () => {
    const log = [
      '  Generating static pages using 5 workers (0/573) ...',
      '[categories] GET failed: Error: Route /api/categories needs to bail out of prerendering at this point because it used request.url.',
      '    at a (src/app/api/categories/route.ts:8:46)',
      "  digest: 'NEXT_PRERENDER_INTERRUPTED'",
    ].join('\n')
    expect(swallowedPrerenderStops(log)).toEqual([
      '[categories] GET failed: Error: Route /api/categories needs to bail out of prerendering at this point because it used request.url.',
    ])
  })

  it('passes a clean build', () => {
    expect(swallowedPrerenderStops('├ ƒ /api/categories\n├ ○ /offline\n')).toEqual([])
  })
})
