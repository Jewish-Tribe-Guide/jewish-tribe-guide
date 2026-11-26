import { describe, expect, it } from 'vitest'
import { setupLeft, setupSteps, type SetupState } from './setup'

const NEW: SetupState = { logo: false, admins: 1, communityEmail: false, categories: 0, places: 0 }

describe('setupSteps', () => {
  // Nov 25: the name is chosen in New community, the home's words went, the
  // community email came in (board E1), and a second admin went last: they
  // may all have been added when the community was made.
  it('a new community has four to do: the logo, the community email, a first category, a second admin', () => {
    expect(setupSteps(NEW, '/x/admin').map((s) => [s.name, s.line, s.href, s.done])).toEqual([
      ['Your logo', 'At the top of every page', '/x/admin/home', false],
      ['The community email', 'A Gmail for replies and the shuls’ and eruvs’ emails', '/x/admin/team/email', false],
      ['Your first category', 'Pick a kind, then add its places', '/x/admin/categories/cat:new', false],
      ['A second admin', 'Someone to share the deciding', '/x/admin/team', false],
    ])
    expect(setupSteps(NEW, '').map((s) => s.name).join(' ')).not.toMatch(/name|words/i)
    expect(setupLeft(NEW)).toBe(4)
  })

  it('ticks each off by what is saved', () => {
    const done = (s: Partial<SetupState>) => setupSteps({ ...NEW, ...s }, '').filter((x) => x.done).map((x) => x.key)
    expect(done({ logo: true })).toEqual(['logo'])
    expect(done({ admins: 2 })).toEqual(['admins'])
    expect(done({ communityEmail: true })).toEqual(['communityEmail'])
    // A category alone isn't enough: its places make it a guide.
    expect(done({ categories: 1 })).toEqual([])
    expect(done({ categories: 1, places: 3 })).toEqual(['category'])
  })

  it('nothing left once all four are done, and nothing counted when it could not be read', () => {
    expect(setupLeft({ logo: true, admins: 2, communityEmail: true, categories: 1, places: 1 })).toBe(0)
    expect(setupLeft(null)).toBe(0)
  })
})
