import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'

const result = vi.hoisted(() => ({ value: { data: null as unknown, error: null as { message: string } | null } }))
vi.mock('./supabase/admin', () => {
  const chain = { select: () => chain, eq: () => chain, order: () => Promise.resolve(result.value) }
  return { getAdminClient: () => ({ from: () => chain }) }
})

const { withAskWords, listTaughtWords } = await import('./askWordStore')

const food = makeCategory({ id: 'restaurant' })
const grocery = makeCategory({ id: 'grocery' })
const row = { word: 'ikc', category_id: 'restaurant', field_key: 'kosherCert', value: 'IKC', from_question: 'IKC dairy?', taught_by: 'me@x.co', taught_at: '2026-09-30T12:00:00Z' }

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the taught words, with the categories', () => {
  it('puts each word on its own category', async () => {
    result.value = { data: [row, { ...row, word: 'bakery', field_key: null, value: null }], error: null }
    const [f, g] = await withAskWords('philly', [food, grocery])
    expect(f.askWords).toEqual([{ word: 'ikc', field: 'kosherCert', value: 'IKC' }, { word: 'bakery' }])
    expect(g.askWords).toBeUndefined()
  })

  it('without migration 063, no words, and nothing breaks', async () => {
    result.value = { data: null, error: { message: 'relation "public.question_word" does not exist' } }
    expect(await withAskWords('philly', [food])).toEqual([food])
    expect(await listTaughtWords('philly')).toEqual({ words: [], available: false })
  })

  it('a failed read leaves the categories as they are', async () => {
    result.value = { data: null, error: { message: 'connection reset' } }
    expect(await withAskWords('philly', [food])).toEqual([food])
    await expect(listTaughtWords('philly')).rejects.toThrow('connection reset')
  })
})
