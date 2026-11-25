import { describe, expect, it } from 'vitest'
import { setupLeft, setupSteps, type SetupState } from './setup'

const NEW: SetupState = { logo: false, admins: 1, newsletters: false, categories: 0, places: 0 }

describe('setupSteps', () => {
  // Nov 25: the name is chosen in New community, the home's words went, the
  // newsletter inbox came in.
  it('a new community has four to do: the logo, a second admin, the newsletter inbox, a first category', () => {
    expect(setupSteps(NEW, '/x/admin').map((s) => [s.name, s.href, s.done])).toEqual([
      ['Your logo', '/x/admin/home', false],
      ['A second admin', '/x/admin/team', false],
      ['The newsletter inbox', '/x/admin/watches/newsletters', false],
      ['Your first category', '/x/admin/categories/cat:new', false],
    ])
    expect(setupSteps(NEW, '').map((s) => s.name).join(' ')).not.toMatch(/name|words/i)
    expect(setupLeft(NEW)).toBe(4)
  })

  it('ticks each off by what is saved', () => {
    const done = (s: Partial<SetupState>) => setupSteps({ ...NEW, ...s }, '').filter((x) => x.done).map((x) => x.key)
    expect(done({ logo: true })).toEqual(['logo'])
    expect(done({ admins: 2 })).toEqual(['admins'])
    expect(done({ newsletters: true })).toEqual(['newsletters'])
    // A category alone isn't enough: its places make it a guide.
    expect(done({ categories: 1 })).toEqual([])
    expect(done({ categories: 1, places: 3 })).toEqual(['category'])
  })

  it('nothing left once all four are done, and nothing counted when it could not be read', () => {
    expect(setupLeft({ logo: true, admins: 2, newsletters: true, categories: 1, places: 1 })).toBe(0)
    expect(setupLeft(null)).toBe(0)
  })
})
