import { describe, expect, it } from 'vitest'
import { allFiles, allRows, PAGE, tablesFrom } from './backup.mjs'

describe('tablesFrom', () => {
  it('lists every table the database describes, with its key columns', () => {
    const openapi = {
      definitions: {
        resource: { properties: { id: { description: 'Note:\nThis is a Primary Key.<pk/>' }, name: {} } },
        resource_tag: { properties: { resource_id: { description: '<pk/>' }, tag_id: { description: '<pk/>' }, x: {} } },
        activity_view: { properties: { id: {} } },
      },
    }
    expect(tablesFrom(openapi)).toEqual([
      { name: 'activity_view', keys: [] },
      { name: 'resource', keys: ['id'] },
      { name: 'resource_tag', keys: ['resource_id', 'tag_id'] },
    ])
  })
})

describe('allRows', () => {
  // The 1,000-row cap: a table one row past it must come back whole.
  it('pages past the cap and stops on a short page', async () => {
    const table = Array.from({ length: PAGE * 2 + 1 }, (_, i) => i)
    const asked: [number, number][] = []
    const rows = await allRows(async (from: number, to: number) => {
      asked.push([from, to])
      return table.slice(from, to + 1)
    })
    expect(rows).toEqual(table)
    expect(asked).toEqual([
      [0, PAGE - 1],
      [PAGE, PAGE * 2 - 1],
      [PAGE * 2, PAGE * 3 - 1],
    ])
  })
})

describe('allFiles', () => {
  it('opens folders and keeps files', async () => {
    const tree: Record<string, { name: string; id: string | null }[]> = {
      '': [
        { name: 'logos', id: null },
        { name: 'top.png', id: '1' },
      ],
      logos: [
        { name: 'philly.png', id: '2' },
        { name: 'old', id: null },
      ],
      'logos/old': [{ name: 'a.png', id: '3' }],
    }
    expect(await allFiles(async (prefix: string) => tree[prefix] ?? [])).toEqual(['logos/philly.png', 'logos/old/a.png', 'top.png'])
  })
})
