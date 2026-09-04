import { afterEach, describe, expect, it, vi } from 'vitest'

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    or: vi.fn(self),
    upsert: vi.fn(self),
    delete: vi.fn(self),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const { createSubscriber, deleteSubscriberByToken, listSubscribersForCategory } = await import('./subscriberStore')

afterEach(() => {
  mockFrom.mockReset()
})

describe('createSubscriber', () => {
  it('upserts on (community_id, email), lowercasing the email', async () => {
    const builder = chainable({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    await createSubscriber('philly', {
      email: 'Person@Example.com',
      categories: ['grocery'],
      notifyAdd: true,
      notifyClosure: false,
    })

    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        community_id: 'philly',
        email: 'person@example.com',
        categories: ['grocery'],
        notify_add: true,
        notify_closure: false,
      }),
      { onConflict: 'community_id,email' },
    )
  })

  it('stores an empty category list as null — "all categories"', async () => {
    const builder = chainable({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    await createSubscriber('philly', { email: 'a@b.com', categories: [], notifyAdd: true, notifyClosure: true })

    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ categories: null }),
      { onConflict: 'community_id,email' },
    )
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(
      createSubscriber('philly', { email: 'a@b.com', categories: null, notifyAdd: true, notifyClosure: true }),
    ).rejects.toThrow('Failed to save subscriber: boom')
  })
})

describe('deleteSubscriberByToken', () => {
  it('returns true when a row was actually deleted', async () => {
    mockFrom.mockReturnValue(chainable({ data: [{ id: '1' }], error: null }))
    expect(await deleteSubscriberByToken('tok')).toBe(true)
  })

  it('returns false when no row matched the token', async () => {
    mockFrom.mockReturnValue(chainable({ data: [], error: null }))
    expect(await deleteSubscriberByToken('tok')).toBe(false)
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(deleteSubscriberByToken('tok')).rejects.toThrow('Failed to unsubscribe: boom')
  })
})

describe('listSubscribersForCategory', () => {
  it('filters on the community, the matching notify flag, and category membership (or "all")', async () => {
    const builder = chainable({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await listSubscribersForCategory('philly', 'grocery', 'add')

    expect(builder.eq).toHaveBeenCalledWith('community_id', 'philly')
    expect(builder.eq).toHaveBeenCalledWith('notify_add', true)
    expect(builder.or).toHaveBeenCalledWith('categories.is.null,categories.cs.{grocery}')
  })

  it('uses notify_closure for the "closure" kind', async () => {
    const builder = chainable({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await listSubscribersForCategory('philly', 'grocery', 'closure')

    expect(builder.eq).toHaveBeenCalledWith('notify_closure', true)
  })

  it('maps rows to Subscriber shape', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            id: '1',
            email: 'a@b.com',
            categories: null,
            notify_add: true,
            notify_closure: true,
            unsubscribe_token: 'tok',
          },
        ],
        error: null,
      }),
    )

    const subs = await listSubscribersForCategory('philly', 'grocery', 'add')
    expect(subs).toEqual([
      { id: '1', email: 'a@b.com', categories: null, notifyAdd: true, notifyClosure: true, unsubscribeToken: 'tok' },
    ])
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(listSubscribersForCategory('philly', 'grocery', 'add')).rejects.toThrow(
      'Failed to load subscribers: boom',
    )
  })
})
