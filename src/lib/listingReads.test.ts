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
          { id: 'h1', name: 'Hotel One', category: 'hotel', placeId: 'g4', googleFields: ['name'] },
          { id: 'c1', name: 'Cemetery One', category: 'cemetery' },
        ]
      : [{ id: 'u1', name: 'UES Mikvah', category: 'mikvah' }],
}))
vi.mock('./categoryStore', () => ({ listCategories: async () => [{ id: 'mikvah', detailFields: [] }, { id: 'shuls', detailFields: [] }, { id: 'food', detailFields: [{ key: 'hours', type: 'hours' }] }, { id: 'hotel', detailFields: [] }, { id: 'cemetery', hasPhone: false, detailFields: [] }].map((c) => ({ kind: 'listing', ...c })) }))
vi.mock('./watchFindings', () => ({ dishCategories: (cs: { id: string }[]) => cs.filter((c) => c.id === 'food') }))
vi.mock('./listingPageWatch', async (real) => ({ ...(await real<object>()), pageReadsFor: (c: { id: string }) => (c.id === 'mikvah' ? { kind: 'hours', keys: ['women_s_hours'], notes: [] } : c.id === 'shuls' ? { kind: 'times' } : null) }))

const { loadListings } = await import('./listingReads')

// Oct 25: what Last night sorts a listing's page by, as the watch list does.
it('each listing’s name and reads by its category, across the communities asked for', async () => {
  const { readsOf, nameOf } = await loadListings(['philly', 'ues', 'philly'])
  expect(['m1', 's1', 'f1', 'u1', 'gone'].map(readsOf)).toEqual(['hours', 'times', null, 'hours', null])
  expect(['m1', 'u1', 'gone'].map(nameOf)).toEqual(['Mikvah One', 'UES Mikvah', null])
})

// Oct 25 (the user): a place's website is read for what Google doesn't
// have, and says which; a food place's finds wait on Dishes, the rest in
// the moderation queue. Since Oct 25 every kind of place, not only food.
it('why each place’s own website is read', async () => {
  const { siteGap } = await loadListings(['philly'])
  expect(['f1', 'f2', 'f3', 'h1', 'c1', 'm1', 's1'].map(siteGap)).toEqual([
    { why: 'Not on Google', page: 'dishes' },
    { why: 'Google has no hours', page: 'dishes' },
    { why: '', page: 'dishes' },
    { why: 'Google has no phone', page: '' },
    null,
    null,
    null,
  ])
})
