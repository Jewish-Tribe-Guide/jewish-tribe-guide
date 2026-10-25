import { expect, it, vi } from 'vitest'

vi.mock('./resourceStore', () => ({
  listApprovedResources: async (c: string) =>
    c === 'philly'
      ? [{ id: 'm1', category: 'mikvah' }, { id: 's1', category: 'shuls' }, { id: 'f1', category: 'food' }]
      : [{ id: 'u1', category: 'mikvah' }],
}))
vi.mock('./categoryStore', () => ({ listCategories: async () => [{ id: 'mikvah' }, { id: 'shuls' }, { id: 'food' }] }))
vi.mock('./listingPageWatch', () => ({ pageReadsFor: (c: { id: string }) => (c.id === 'mikvah' ? { kind: 'hours' } : c.id === 'shuls' ? { kind: 'times' } : null) }))

const { loadReadsOf } = await import('./listingReads')

// Oct 25: what Last night sorts a listing's page by, as the watch list does.
it('each listing’s reads by its category, across the communities asked for', async () => {
  const readsOf = await loadReadsOf(['philly', 'ues', 'philly'])
  expect(['m1', 's1', 'f1', 'u1', 'gone'].map(readsOf)).toEqual(['hours', 'times', null, 'hours', null])
})
