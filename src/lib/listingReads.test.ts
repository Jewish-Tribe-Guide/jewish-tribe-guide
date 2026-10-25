import { expect, it, vi } from 'vitest'

vi.mock('./resourceStore', () => ({
  listApprovedResources: async (c: string) =>
    c === 'philly'
      ? [{ id: 'm1', name: 'Mikvah One', category: 'mikvah' }, { id: 's1', name: 'Shul One', category: 'shuls' }, { id: 'f1', name: 'Food One', category: 'food' }]
      : [{ id: 'u1', name: 'UES Mikvah', category: 'mikvah' }],
}))
vi.mock('./categoryStore', () => ({ listCategories: async () => [{ id: 'mikvah' }, { id: 'shuls' }, { id: 'food' }] }))
vi.mock('./listingPageWatch', () => ({ pageReadsFor: (c: { id: string }) => (c.id === 'mikvah' ? { kind: 'hours' } : c.id === 'shuls' ? { kind: 'times' } : null) }))

const { loadListings } = await import('./listingReads')

// Oct 25: what Last night sorts a listing's page by, as the watch list does.
it('each listing’s name and reads by its category, across the communities asked for', async () => {
  const { readsOf, nameOf } = await loadListings(['philly', 'ues', 'philly'])
  expect(['m1', 's1', 'f1', 'u1', 'gone'].map(readsOf)).toEqual(['hours', 'times', null, 'hours', null])
  expect(['m1', 'u1', 'gone'].map(nameOf)).toEqual(['Mikvah One', 'UES Mikvah', null])
})
