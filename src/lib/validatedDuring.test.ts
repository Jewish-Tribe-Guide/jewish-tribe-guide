import { describe, expect, it } from 'vitest'
import { noteValidated, validatedDuring } from './validatedDuring'

// What each watch validated is kept apart, though the watches run side by
// side (runSideBySide): each its own, none of another's.
describe('validatedDuring', () => {
  it('gives each run what it noted, though they run at once', async () => {
    const run = (id: string, wait: number) =>
      validatedDuring(async () => {
        await new Promise((r) => setTimeout(r, wait))
        noteValidated(id, ['times'])
        await new Promise((r) => setTimeout(r, wait))
        noteValidated(`${id}2`, ['contact'])
        return id
      })
    const [a, b] = await Promise.all([run('a', 5), run('b', 1)])
    expect(a).toEqual({ result: 'a', validated: [{ id: 'a', boxes: ['times'] }, { id: 'a2', boxes: ['contact'] }] })
    expect(b).toEqual({ result: 'b', validated: [{ id: 'b', boxes: ['times'] }, { id: 'b2', boxes: ['contact'] }] })
  })
  it('notes nothing outside a run, or for no boxes', async () => {
    noteValidated('x', ['times'])
    const { validated } = await validatedDuring(async () => noteValidated('y', []))
    expect(validated).toEqual([])
  })
})
