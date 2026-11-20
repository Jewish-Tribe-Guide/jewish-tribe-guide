import { describe, expect, it, vi } from 'vitest'
import { ROW_CAP, readAll } from './readAll'

/** A table of `n` rows served the way Supabase serves it: a range at a
 *  time, never more than ROW_CAP. */
function table(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }))
  return vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, Math.min(to + 1, from + ROW_CAP)), error: null }))
}

describe('readAll', () => {
  it('reads past the first 1,000 rows', async () => {
    const page = table(2500)
    const { data, error } = await readAll(page)
    expect(error).toBeNull()
    expect(data).toHaveLength(2500)
    expect(data.at(-1)).toEqual({ id: 2499 })
    expect(page.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('asks once more when the rows end exactly on a page, and stops at the empty one', async () => {
    const page = table(2000)
    expect((await readAll(page)).data).toHaveLength(2000)
    expect(page).toHaveBeenCalledTimes(3)
  })

  it('one request for a small table', async () => {
    const page = table(12)
    expect((await readAll(page)).data).toHaveLength(12)
    expect(page).toHaveBeenCalledTimes(1)
  })

  it('stops at an error and hands it back', async () => {
    let n = 0
    const { data, error } = await readAll(async () =>
      n++ === 0 ? { data: Array.from({ length: ROW_CAP }, () => ({})), error: null } : { data: null, error: { message: 'timeout' } },
    )
    expect(error).toEqual({ message: 'timeout' })
    expect(data).toHaveLength(ROW_CAP)
  })
})
