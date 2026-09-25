import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ from: vi.fn(), calls: [] as [string, unknown[]][], result: { data: null as unknown, error: null as unknown } }))
vi.mock('./supabase/admin', () => ({ getAdminClient: () => ({ from: m.from }) }))

// Records every chained call, then resolves to m.result.
function builder() {
  const b: Record<string, unknown> = {}
  for (const name of ['insert', 'select', 'delete', 'eq', 'gte']) {
    b[name] = (...args: unknown[]) => {
      m.calls.push([name, args])
      return b
    }
  }
  b.then = (resolve: (v: unknown) => void) => resolve(m.result)
  return b
}

const { recordActivity, removeVisitorConfirmation } = await import('./activityStore')

beforeEach(() => {
  m.calls = []
  m.result = { data: null, error: null }
  m.from.mockReset().mockImplementation(() => builder())
})

describe('recordActivity', () => {
  it('writes snake_case rows and returns their ids', async () => {
    m.result = { data: [{ id: 7 }], error: null }
    const ids = await recordActivity([
      { community: 'philly', resourceId: 'res-1', kind: 'item_added', source: 'submission', fieldKey: 'm', item: 'Challah', actorEmail: 'r@x.com', submissionId: 'sub-1' },
    ])
    expect(ids).toEqual([7])
    expect(m.from).toHaveBeenCalledWith('activity')
    expect(m.calls[0]).toEqual([
      'insert',
      [[{ community_id: 'philly', resource_id: 'res-1', kind: 'item_added', source: 'submission', field_key: 'm', item: 'Challah', actor_email: 'r@x.com', submission_id: 'sub-1' }]],
    ])
  })

  it('never throws: a failed write is reported and returns no ids', async () => {
    m.result = { data: null, error: { message: 'relation "activity" does not exist' } }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordActivity([{ community: 'philly', kind: 'listing_confirmed', source: 'visitor' }])).resolves.toEqual([])
    expect(err).toHaveBeenCalled()
  })

  it('does nothing for nothing', async () => {
    expect(await recordActivity([])).toEqual([])
    expect(m.from).not.toHaveBeenCalled()
  })
})

describe('removeVisitorConfirmation', () => {
  // The id comes from a browser, so the delete is pinned to exactly the row a
  // visitor's own confirmation could be, and nothing else in the log.
  it('only deletes a recent visitor confirmation of that listing', async () => {
    await removeVisitorConfirmation(42, 'res-1')
    const filters = m.calls.filter(([n]) => n === 'eq' || n === 'gte').map(([n, a]) => [n, a[0], n === 'gte' ? 'recent' : a[1]])
    expect(filters).toEqual([
      ['eq', 'id', 42],
      ['eq', 'resource_id', 'res-1'],
      ['eq', 'kind', 'listing_confirmed'],
      ['eq', 'source', 'visitor'],
      ['gte', 'created_at', 'recent'],
    ])
  })
})
