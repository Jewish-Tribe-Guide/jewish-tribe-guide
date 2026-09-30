import { beforeEach, describe, expect, it, vi } from 'vitest'

// Without migration 062's table the reader still works: a lookup finds
// nothing and a save does nothing, and neither throws.
const m = vi.hoisted(() => ({ maybeSingle: vi.fn(), upsert: vi.fn(), update: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: m.maybeSingle, upsert: m.upsert, update: m.update }
  return { getAdminClient: () => ({ from: () => chain }) }
})
const { findReading, saveReading } = await import('./questionReadingStore')

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('questionReadingStore', () => {
  it('finds nothing, and warns once, when the table isn’t there yet', async () => {
    m.maybeSingle.mockResolvedValue({ data: null, error: { message: "Could not find the table 'public.question_reading' in the schema cache" } })
    expect(await findReading('philly', 'meat')).toBeNull()
    expect(await findReading('philly', 'dairy')).toBeNull()
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('saving without the table does nothing, quietly', async () => {
    m.upsert.mockResolvedValue({ error: { message: 'relation "question_reading" does not exist' } })
    await expect(saveReading('philly', 'meat', 'meat', { categories: [] }, 'gpt-6-luna')).resolves.toBeUndefined()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('returns a remembered reading', async () => {
    m.maybeSingle.mockResolvedValue({ data: { reading: { categories: [{ id: 'restaurant' }] }, hits: 3 }, error: null })
    m.update.mockReturnValue({ eq: () => ({ eq: () => ({ then: () => undefined }) }) })
    expect(await findReading('philly', 'kosher food')).toEqual({ categories: [{ id: 'restaurant' }] })
  })
})
