import { describe, expect, it, vi } from 'vitest'

const rows = vi.hoisted(() => ({ data: [] as { payload: unknown }[] }))
vi.mock('./supabase/admin', () => {
  const q = { select: () => q, eq: () => q, then: (r: (v: unknown) => void) => r({ data: rows.data, error: null }) }
  return { getAdminClient: () => ({ from: () => q }) }
})
const { goneReportWaiting } = await import('./itemMarkRoutes')

describe('goneReportWaiting', () => {
  it('is true only for a pending edit whose list leaves the item out', async () => {
    rows.data = [{ payload: { name: 'Shop', details: { m: ['Rugelach'] } } }]
    expect(await goneReportWaiting('id', 'm', 'challah')).toBe(true)
    rows.data = [{ payload: { name: 'Shop', details: { m: ['Challah', 'Rugelach'] } } }]
    expect(await goneReportWaiting('id', 'm', 'Challah')).toBe(false)
    rows.data = [{ payload: { name: 'Shop', details: { other: ['x'] } } }]
    expect(await goneReportWaiting('id', 'm', 'Challah')).toBe(false)
    rows.data = []
    expect(await goneReportWaiting('id', 'm', 'Challah')).toBe(false)
  })
})
