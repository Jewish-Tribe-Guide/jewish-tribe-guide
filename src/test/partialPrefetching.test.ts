import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// With Partial Prefetching on, a dynamic address Next hasn't prerendered is
// sent its shell straight away, before the page has said whether it exists:
// a listing that isn't there answers 200 instead of 404, and the admin of a
// community added since the deploy bails out of its prerender or has its
// stream cut off (React #412, Nov 21). ensureStatic = 'navigation' on each
// community layout makes such an address render whole first. Nothing else
// fails if one of them loses it: the build passes and only some e2e runs
// notice, so this holds the two together.

const root = path.resolve(__dirname, '../..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

const LAYOUTS = ['src/app/[community]/layout.tsx', 'src/app/admin/[community]/layout.tsx']

describe('Partial Prefetching', () => {
  const on = /^\s*partialPrefetching:\s*true\b/m.test(read('next.config.ts'))

  it.each(LAYOUTS)('%s renders an unbuilt address whole while it is on', (file) => {
    if (!on) return
    expect(read(file)).toMatch(/^export const ensureStatic = 'navigation'$/m)
  })
})
