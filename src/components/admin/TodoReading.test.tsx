import { describe, expect, it, vi } from 'vitest'
import { lit, todoAnswerLabels } from './TodoReading'
import { waitingAnswers } from './waitingAnswers'
import { ownGroups, type Decide, type WaitGroup, type WaitLine, type WaitRow } from './waitingGroups'

const group = (decide: Decide, lines: WaitLine[] = [], over: Partial<WaitGroup> = {}): WaitGroup => ({ key: 'k', job: 'google', page: null, when: null, lines, facts: [], note: null, decide, ...over })
const labels = (g: WaitGroup) => todoAnswerLabels(g, waitingAnswers(g.decide, 'p', { patch: vi.fn(), post: vi.fn() })).map((a) => a.label)

describe('todoAnswerLabels — a job’s reading in the change screens’ words', () => {
  it('one short line: Change to it, or Keep what the listing has', () => {
    expect(labels(group({ kind: 'google' }, [{ label: 'Phone', value: '215-555-0101', old: '215-555-0100' }]))).toEqual(['Change to 215-555-0101', 'Keep 215-555-0100', 'Wrong place'])
  })

  it('a long line, more than one, a new value or boxes: Update the listing, or Leave it', () => {
    const long = { label: 'Address', value: '1500 Walnut Street, Suite 200, Philadelphia', old: '1500 Walnut St' }
    const short = { label: 'Phone', value: '1', old: '2' }
    expect(labels(group({ kind: 'menu' }, [long]))).toEqual(['Update the listing', 'Leave it'])
    expect(labels(group({ kind: 'menu' }, [short, short]))).toEqual(['Update the listing', 'Leave it'])
    expect(labels(group({ kind: 'menu' }, [{ ...short, old: null }]))).toEqual(['Update the listing', 'Leave it'])
    expect(labels(group({ kind: 'menu' }, [short], { boxes: [{ name: 'Dishes', groups: [] }] }))).toEqual(['Update the listing', 'Leave it'])
  })

  it('a menu that only adds dishes says how many, and shows only those', () => {
    const dish = (name: string, mark: WaitRow['mark']): WaitRow => ({ name, mark })
    const menu = (...rows: WaitRow[]) => group({ kind: 'menu' }, [], { boxes: [{ name: 'Main dishes', groups: [{ rows }] }] })
    const two = menu(dish('Falafel', 'same'), dish('Hot Dogs', 'new'), dish('Deli', 'new'))
    expect(labels(two)).toEqual(['Add the 2 dishes', 'Don’t add them'])
    expect(lit(two.boxes![0]).map((r) => r.name)).toEqual(['Hot Dogs', 'Deli'])
    expect(labels(menu(dish('Falafel', 'same'), dish('Hot Dogs', 'new')))).toEqual(['Add the dish', 'Don’t add it'])
    expect(labels(menu(dish('Hot Dogs', 'new'), dish('Falafel', 'gone')))).toEqual(['Update the listing', 'Leave it'])
  })

  it('an archived place is added back to the guide; a closure keeps its own words', () => {
    expect(labels(group({ kind: 'later', archivedId: 'a' }))).toEqual(['Add to the guide'])
    expect(labels(group({ kind: 'closure' }))).toEqual(['Keep closed', 'Show as open'])
  })
})

describe('ownGroups — what To do decides on the place, not in the queue', () => {
  it('leaves out what is already a submission, and a later with nothing to bring back', () => {
    const kinds = (gs: WaitGroup[]) => ownGroups(gs).map((g) => g.decide.kind)
    const all = [
      group({ kind: 'findings', ids: ['s'] }),
      group({ kind: 'off', id: 's' }),
      group({ kind: 'archive', id: 's' }),
      group({ kind: 'new', id: 's' }),
      group({ kind: 'later' }),
      group({ kind: 'later', archivedId: 'a' }),
      group({ kind: 'google' }),
      group({ kind: 'closure' }),
      group({ kind: 'menu' }),
    ]
    expect(kinds(all)).toEqual(['later', 'google', 'closure', 'menu'])
  })
})

describe('waitingAnswers — what each answer sends', () => {
  it('Google’s go to its job with the place, a menu’s to main dishes, findings one PATCH each', async () => {
    const patch = vi.fn(async () => ({}))
    const post = vi.fn(async () => ({}))
    const [accept, keep, wrong] = waitingAnswers({ kind: 'google' }, 'p', { patch, post })
    await accept.work()
    await keep.work()
    await wrong.work()
    expect(post.mock.calls).toEqual([
      ['/api/admin/watches/google', { action: 'use', id: 'p' }],
      ['/api/admin/watches/google', { action: 'keep', id: 'p' }],
      ['/api/admin/watches/google', { action: 'wrong_place', id: 'p' }],
    ])
    post.mockClear()
    await waitingAnswers({ kind: 'menu' }, 'p', { patch, post })[0].work()
    expect(post.mock.calls).toEqual([['/api/admin/main-dishes', { action: 'use', resourceId: 'p' }]])
    await waitingAnswers({ kind: 'findings', ids: ['a', 'b'], only: { b: ['phone'] } }, 'p', { patch, post })[0].work()
    expect(patch.mock.calls).toEqual([
      ['a', { status: 'approved' }],
      ['b', { status: 'approved', only: ['phone'] }],
    ])
  })
})
