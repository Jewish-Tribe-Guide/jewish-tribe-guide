import { describe, expect, it } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { editSubmission } from './editSubmission'

describe('a one-tap edit', () => {
  it('carries what’s stored beside a field: a shul’s special schedules, a store’s sometimes items', () => {
    const category = makeCategory({
      id: 'synagogue',
      detailFields: [
        { key: 'minyanim', label: 'Davening Times', type: 'minyanim' },
        { key: 'm', label: 'Items', type: 'tags' },
      ],
    })
    const schedules = [{ id: 's', name: 'Sukkos 5787', from: '2026-09-26', to: '2026-10-04', mode: 'replace', minyanim: [] }]
    const item = makeListing({ minyanim: [], minyanim_schedules: schedules, m: ['A'], m_sometimes: ['B'] })
    const sub = editSubmission(category, item, { m: ['A', 'C'] })
    expect(sub.details.minyanim_schedules).toEqual(schedules)
    expect(sub.details.m_sometimes).toEqual(['B'])
  })
})
