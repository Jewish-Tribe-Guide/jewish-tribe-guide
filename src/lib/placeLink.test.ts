import { describe, expect, it } from 'vitest'
import { pageFrom, placeBack, placePath } from './placeLink'

const jobName = (id: string) => (id === 'google' ? 'Google' : undefined)

describe('placePath', () => {
  it('carries the id whatever it holds, a list’s new place’s name included', () => {
    expect(placePath('p1')).toBe('place/p1')
    expect(placePath('new:Cafe 613', 'todo')).toBe('place/new%3ACafe%20613?from=todo')
  })
})

describe('pageFrom', () => {
  it('sends a place back to the job, and leaves anything else alone', () => {
    expect(pageFrom('place/p1', 'job/google')).toBe('place/p1?from=job/google')
    expect(pageFrom('job/eruvs', 'job/google')).toBe('job/eruvs')
  })
})

describe('placeBack', () => {
  it('goes to where it came from', () => {
    expect(placeBack('todo', '/philly/admin', jobName)).toEqual({ label: 'To do', href: '/philly/admin' })
    expect(placeBack('job/google', '/philly/admin', jobName)).toEqual({ label: 'Google', href: '/philly/admin/watches/job/google' })
  })

  it('anything else goes to Watches, so an address can’t send it elsewhere', () => {
    for (const from of [null, undefined, 'job/nope', 'https://evil.example', 'job/../../x']) {
      expect(placeBack(from, '/philly/admin', jobName)).toEqual({ label: 'Watches', href: '/philly/admin/watches' })
    }
  })
})
