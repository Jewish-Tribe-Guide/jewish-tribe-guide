import { describe, expect, it } from 'vitest'
import { atMostAtOnce } from './atMostAtOnce'

const tick = () => new Promise((r) => setTimeout(r, 1))

describe('atMostAtOnce', () => {
  it('does every item, never more than n at once', async () => {
    let going = 0
    let most = 0
    const done: number[] = []
    await atMostAtOnce(3, [1, 2, 3, 4, 5, 6, 7], async (i) => {
      going++
      most = Math.max(most, going)
      await tick()
      done.push(i)
      going--
    })
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(most).toBe(3)
  })

  it('stops starting more after one fails, and passes its error on', async () => {
    const started: number[] = []
    await expect(
      atMostAtOnce(2, [1, 2, 3, 4, 5, 6], async (i) => {
        started.push(i)
        await tick()
        if (i === 1) throw new Error('write failed')
      }),
    ).rejects.toThrow('write failed')
    expect(started.length).toBeLessThan(6)
  })

  it('nothing to do', async () => {
    await expect(atMostAtOnce(5, [], async () => {})).resolves.toBeUndefined()
  })
})
