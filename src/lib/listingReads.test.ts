import { expect, it, vi } from 'vitest'

vi.mock('./resourceStore', () => ({
  listApprovedResources: async (c: string) =>
    c === 'philly'
      ? [
          { id: 'm1', name: 'Mikvah One', category: 'mikvah' },
          { id: 's1', name: 'Shul One', category: 'shuls' },
          { id: 'f1', name: 'Food One', category: 'food' },
          { id: 'f2', name: 'Food Two', category: 'food', placeId: 'g2', googleFields: ['name', 'phone'] },
          { id: 'f3', name: 'Food Three', category: 'food', placeId: 'g3', googleFields: ['hours', 'phone'] },
        ]
      : [{ id: 'u1', name: 'UES Mikvah', category: 'mikvah' }],
}))
vi.mock('./categoryStore', () => ({ listCategories: async () => [{ id: 'mikvah', detailFields: [] }, { id: 'shuls', detailFields: [] }, { id: 'food', detailFields: [{ key: 'hours', type: 'hours' }] }] }))
vi.mock('./watchFindings', () => ({ dishCategories: (cs: { id: string }[]) => cs.filter((c) => c.id === 'food') }))
vi.mock('./listingPageWatch', async (real) => ({ ...(await real<object>()), pageReadsFor: (c: { id: string }) => (c.id === 'mikvah' ? { kind: 'hours' } : c.id === 'shuls' ? { kind: 'times' } : null) }))

const { loadListings } = await import('./listingReads')

// Oct 25: what Last night sorts a listing's page by, as the watch list does.
it('each listing’s name and reads by its category, across the communities asked for', async () => {
  const { readsOf, nameOf } = await loadListings(['philly', 'ues', 'philly'])
  expect(['m1', 's1', 'f1', 'u1', 'gone'].map(readsOf)).toEqual(['hours', 'times', null, 'hours', null])
  expect(['m1', 'u1', 'gone'].map(nameOf)).toEqual(['Mikvah One', 'UES Mikvah', null])
})

// Oct 25 (the user): a food place's website is read for what Google
// doesn't have, and says which.
it('why each food place’s own website is read', async () => {
  const { siteGap } = await loadListings(['philly'])
  expect(['f1', 'f2', 'f3', 'm1'].map(siteGap)).toEqual(['Not on Google', 'Google has no hours', '', null])
})
