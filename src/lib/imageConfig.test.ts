import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// next.config.ts can't be imported here (it wraps itself in withSentryConfig),
// so the two arrays are read out of the source.
const source = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')

function ladder(name: string): number[] {
  const match = source.match(new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`))
  if (!match) throw new Error(`next.config.ts has no ${name}`)
  return match[1]!.split(',').map((n) => Number(n.trim())).filter(Number.isFinite)
}

describe('next/image size ladder', () => {
  const deviceSizes = ladder('deviceSizes')

  // The ladder was narrowed once to save transformation quota, with 640 as the
  // smallest step. A home-screen tile is ~187px on a phone and ~290px on a
  // desktop grid, so every one downloaded a 640px image (20-58 KB) — measured:
  // 320 KB for the ten tiles vs 146 KB with a 384 step. If this fails, the
  // ladder was re-narrowed; check that against real `sizes` props first.
  it('has a step small enough for a half-width phone tile, not just 640 and up', () => {
    expect(Math.min(...deviceSizes)).toBeLessThanOrEqual(400)
  })

  it('is ascending, so srcset candidates come out in order', () => {
    expect(deviceSizes).toEqual([...deviceSizes].sort((a, b) => a - b))
  })
})
