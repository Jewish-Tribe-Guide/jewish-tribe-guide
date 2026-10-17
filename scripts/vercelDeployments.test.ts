import { describe, expect, it } from 'vitest'
import { splitByProductionSafety, splitProductionByRetention } from './vercelDeployments.mjs'

// This is the logic an irreversible, real-API delete pass (vercel-deployments-
// delete.mjs, vercel-production-prune-delete.mjs) trusts to decide what's
// actually safe to remove — a mistake here means a real, unrecoverable
// deletion, not a failed test. The bar is higher than for a throwaway script.

function deployment(overrides: Partial<{ uid: string; created: number; target: string | null }> = {}) {
  return { uid: 'dpl_x', created: 0, target: 'production', url: 'x.vercel.app', state: 'READY', ...overrides }
}

describe('splitByProductionSafety', () => {
  it('treats anything other than target === "production" as preview — including null (a build that never got promoted)', () => {
    const prod = deployment({ uid: 'a', target: 'production' })
    const preview = deployment({ uid: 'b', target: 'preview' })
    const noTarget = deployment({ uid: 'c', target: null })

    const { production, preview: previewOut } = splitByProductionSafety([prod, preview, noTarget])

    expect(production).toEqual([prod])
    expect(previewOut).toEqual([preview, noTarget])
  })
})

describe('splitProductionByRetention', () => {
  it('keeps the `keep` most recently created, prunes the rest', () => {
    const deployments = [
      deployment({ uid: 'oldest', created: 1 }),
      deployment({ uid: 'middle', created: 2 }),
      deployment({ uid: 'newest', created: 3 }),
    ]

    const { keep, prune } = splitProductionByRetention(deployments, 2)

    expect(keep.map((d) => d.uid)).toEqual(['newest', 'middle'])
    expect(prune.map((d) => d.uid)).toEqual(['oldest'])
  })

  it('keeps everything and prunes nothing when there are fewer deployments than `keep`', () => {
    const deployments = [deployment({ uid: 'a', created: 1 }), deployment({ uid: 'b', created: 2 })]

    const { keep, prune } = splitProductionByRetention(deployments, 20)

    expect(keep).toHaveLength(2)
    expect(prune).toHaveLength(0)
  })

  // A real delete pass calls this once, deletes `prune`, then (on a rerun,
  // e.g. after a rate limit) re-fetches and calls it again — the newly-oldest
  // of what's left must never end up in a second run's `prune` a second time
  // by surprise, and nothing already deleted should reappear. Simulated here
  // without a real API: reusing `keep` from run 1 as run 2's whole input, the
  // same shape a live re-fetch after deletion would produce.
  it('produces a stable, non-overlapping split across a simulated rerun after deletion', () => {
    const deployments = Array.from({ length: 5 }, (_, i) => deployment({ uid: `d${i}`, created: i }))

    const first = splitProductionByRetention(deployments, 2)
    expect(first.keep.map((d) => d.uid)).toEqual(['d4', 'd3'])
    expect(first.prune.map((d) => d.uid)).toEqual(['d2', 'd1', 'd0'])

    // Rerun against only what's left (first.keep) after "deleting" first.prune.
    const second = splitProductionByRetention(first.keep, 2)
    expect(second.keep.map((d) => d.uid)).toEqual(['d4', 'd3'])
    expect(second.prune).toHaveLength(0)
  })

  it('does not mutate the array it was given', () => {
    const deployments = [deployment({ uid: 'a', created: 1 }), deployment({ uid: 'b', created: 2 })]
    const copy = [...deployments]

    splitProductionByRetention(deployments, 1)

    expect(deployments).toEqual(copy)
  })

  // "Let's leave the very first deployment just for nostalgia" — the user's
  // own call. keepOldest spares it on top of the recent window, regardless
  // of how far back it is.
  describe('keepOldest', () => {
    it('spares the single oldest deployment on top of the `keep` most recent', () => {
      const deployments = [
        deployment({ uid: 'first-ever', created: 0 }),
        deployment({ uid: 'old', created: 1 }),
        deployment({ uid: 'middle', created: 2 }),
        deployment({ uid: 'newest', created: 3 }),
      ]

      const { keep, prune } = splitProductionByRetention(deployments, 2, { keepOldest: true })

      expect(keep.map((d) => d.uid)).toEqual(['newest', 'middle', 'first-ever'])
      expect(prune.map((d) => d.uid)).toEqual(['old'])
    })

    it('is a no-op when the oldest is already inside the recent window', () => {
      const deployments = [deployment({ uid: 'a', created: 1 }), deployment({ uid: 'b', created: 2 })]

      const { keep, prune } = splitProductionByRetention(deployments, 20, { keepOldest: true })

      expect(keep.map((d) => d.uid)).toEqual(['b', 'a'])
      expect(prune).toHaveLength(0)
    })

    it('stays off by default, so existing callers are unaffected', () => {
      const deployments = [
        deployment({ uid: 'first-ever', created: 0 }),
        deployment({ uid: 'newest', created: 1 }),
      ]

      const { keep, prune } = splitProductionByRetention(deployments, 1)

      expect(keep.map((d) => d.uid)).toEqual(['newest'])
      expect(prune.map((d) => d.uid)).toEqual(['first-ever'])
    })

    // Across a rerun (e.g. after a rate limit mid-delete), the oldest must
    // stay spared even though it's now "oldest of what's left" rather than
    // the original list's oldest — same recompute-fresh guarantee the
    // recent window already has.
    it('keeps sparing the oldest across a simulated rerun after deletion', () => {
      const deployments = [
        deployment({ uid: 'first-ever', created: 0 }),
        deployment({ uid: 'old', created: 1 }),
        deployment({ uid: 'newest', created: 2 }),
      ]

      const first = splitProductionByRetention(deployments, 1, { keepOldest: true })
      expect(first.keep.map((d) => d.uid)).toEqual(['newest', 'first-ever'])
      expect(first.prune.map((d) => d.uid)).toEqual(['old'])

      const second = splitProductionByRetention(first.keep, 1, { keepOldest: true })
      expect(second.keep.map((d) => d.uid)).toEqual(['newest', 'first-ever'])
      expect(second.prune).toHaveLength(0)
    })
  })
})
