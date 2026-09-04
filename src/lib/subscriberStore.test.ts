import { afterEach, describe, expect, it, vi } from 'vitest'

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    or: vi.fn(self),
    upsert: vi.fn(self),
    update: vi.fn(self),
    delete: vi.fn(self),
    maybeSingle: vi.fn(() => result),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

// The object passed to a chainable mock's .upsert(...) on its first call.
function upsertArg(builder: Record<string, unknown>): Record<string, unknown> {
  return (builder.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
}

// createSubscriber reads the existing row first (to merge onto it), then
// upserts — two separate `.from()` calls in order.
function mockReadThenWrite(readResult: unknown, writeResult: unknown) {
  const readBuilder = chainable(readResult)
  const writeBuilder = chainable(writeResult)
  let call = 0
  mockFrom.mockImplementation(() => {
    call += 1
    return call === 1 ? readBuilder : writeBuilder
  })
  return { readBuilder, writeBuilder }
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const { createSubscriber, deleteSubscriberByToken, getSubscriberByToken, updateSubscriberByToken, listSubscribersForCategory } =
  await import('./subscriberStore')

afterEach(() => {
  mockFrom.mockReset()
})

describe('createSubscriber', () => {
  it('a brand-new subscriber (no existing row) is written as given, lowercasing the email', async () => {
    const { writeBuilder } = mockReadThenWrite({ data: null, error: null }, { data: null, error: null })

    await createSubscriber('philly', {
      email: 'Person@Example.com',
      categories: ['grocery'],
      notifyAdd: true,
      notifyClosure: false,
    })

    expect(writeBuilder.upsert).toHaveBeenCalledWith(
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
    const { writeBuilder } = mockReadThenWrite({ data: null, error: null }, { data: null, error: null })

    await createSubscriber('philly', { email: 'a@b.com', categories: [], notifyAdd: true, notifyClosure: true })

    expect(writeBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ categories: null }),
      { onConflict: 'community_id,email' },
    )
  })

  // Resubscribing MERGES onto the existing subscription rather than
  // replacing it — adding "synagogue" to someone already subscribed to
  // "grocery" should leave them subscribed to both, not just the new one.
  it('unions categories with an existing subscription instead of replacing it', async () => {
    const { writeBuilder } = mockReadThenWrite(
      { data: { categories: ['grocery'], notify_add: true, notify_closure: false }, error: null },
      { data: null, error: null },
    )

    await createSubscriber('philly', {
      email: 'a@b.com',
      categories: ['synagogue'],
      notifyAdd: true,
      notifyClosure: false,
    })

    const written = upsertArg(writeBuilder)
    expect(written.categories).toEqual(expect.arrayContaining(['grocery', 'synagogue']))
    expect(written.categories).toHaveLength(2)
  })

  it('collapses to "all categories" (null) the moment either side already is', async () => {
    const { writeBuilder } = mockReadThenWrite(
      { data: { categories: null, notify_add: true, notify_closure: true }, error: null },
      { data: null, error: null },
    )

    await createSubscriber('philly', { email: 'a@b.com', categories: ['grocery'], notifyAdd: true, notifyClosure: true })

    expect(upsertArg(writeBuilder).categories).toBeNull()
  })

  // Notify flags OR together — resubscribing only ever widens what you're
  // notified about, never narrows it (that's what the unsubscribe link is
  // for), so someone who had closures on and resubscribes for adds-only
  // should end up with both on, not just the one just submitted.
  it('OR-merges the notify flags rather than replacing them', async () => {
    const { writeBuilder } = mockReadThenWrite(
      { data: { categories: null, notify_add: false, notify_closure: true }, error: null },
      { data: null, error: null },
    )

    await createSubscriber('philly', { email: 'a@b.com', categories: null, notifyAdd: true, notifyClosure: false })

    const written = upsertArg(writeBuilder)
    expect(written.notify_add).toBe(true)
    expect(written.notify_closure).toBe(true)
  })

  it('throws with the Supabase error message on failure', async () => {
    mockReadThenWrite({ data: null, error: null }, { data: null, error: { message: 'boom' } })
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

describe('getSubscriberByToken', () => {
  it('maps the row to Subscriber shape, including communityId', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: {
          id: '1',
          community_id: 'philly',
          email: 'a@b.com',
          categories: ['grocery'],
          notify_add: true,
          notify_closure: false,
          unsubscribe_token: 'tok',
        },
        error: null,
      }),
    )

    expect(await getSubscriberByToken('tok')).toEqual({
      id: '1',
      communityId: 'philly',
      email: 'a@b.com',
      categories: ['grocery'],
      notifyAdd: true,
      notifyClosure: false,
      unsubscribeToken: 'tok',
    })
  })

  it('returns null for an unknown token', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    expect(await getSubscriberByToken('nope')).toBeNull()
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(getSubscriberByToken('tok')).rejects.toThrow('Failed to load subscriber: boom')
  })
})

describe('updateSubscriberByToken', () => {
  it('replaces (not merges) categories and notify flags exactly as given', async () => {
    const builder = chainable({ data: [{ id: '1' }], error: null })
    mockFrom.mockReturnValue(builder)

    await updateSubscriberByToken('tok', { categories: ['synagogue'], notifyAdd: false, notifyClosure: true })

    expect(builder.update).toHaveBeenCalledWith({
      categories: ['synagogue'],
      notify_add: false,
      notify_closure: true,
    })
    expect(builder.eq).toHaveBeenCalledWith('unsubscribe_token', 'tok')
  })

  it('returns false when the token matched nothing', async () => {
    mockFrom.mockReturnValue(chainable({ data: [], error: null }))
    expect(await updateSubscriberByToken('nope', { categories: null, notifyAdd: true, notifyClosure: true })).toBe(false)
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(
      updateSubscriberByToken('tok', { categories: null, notifyAdd: true, notifyClosure: true }),
    ).rejects.toThrow('Failed to update subscription: boom')
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
