import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Files in public/images are served as-is: the components that use them set
// `unoptimized` (a /public asset otherwise goes through Vercel's metered image
// optimizer), so nothing downstream shrinks them. An oversized file therefore
// goes to every visitor at full size — a hotlinked 1.6 MB original once sat on
// the desktop home screen for exactly that reason.
const DIR = join(process.cwd(), 'public', 'images')
const MAX_BYTES = 120 * 1024

describe('public/images', () => {
  const files = readdirSync(DIR).filter((f) => /\.(png|jpe?g|webp|gif|avif)$/i.test(f))

  it('has assets to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s is small enough to ship unoptimized', (file) => {
    expect(statSync(join(DIR, file)).size).toBeLessThan(MAX_BYTES)
  })
})
