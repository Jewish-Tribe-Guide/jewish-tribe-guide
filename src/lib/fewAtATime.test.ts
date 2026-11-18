import { describe, expect, it } from 'vitest'
import { fewAtATime } from './fewAtATime'

describe('fewAtATime', () => {
  it('never more than the limit at once, and the results in the items’ order', async () => {
    let now = 0
    let most = 0
    const out = await fewAtATime([30, 5, 20, 1, 10, 2], 2, async (ms, i) => {
      most = Math.max(most, ++now)
      await new Promise((r) => setTimeout(r, ms))
      now--
      return i
    })
    expect(most).toBe(2)
    expect(out).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('nothing to do is nothing', async () => {
    expect(await fewAtATime([], 3, async () => 1)).toEqual([])
  })
})
