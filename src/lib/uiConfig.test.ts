import { describe, expect, it } from 'vitest'
import { contributionsFor } from './uiConfig'

// Nov 18 review, item 33: a community's own row carries `ui`, and nothing
// read it, so the only switch for additions, edits and reports was the
// deployment's, one for every community.
describe('contributionsFor', () => {
  const on = { add: true, edit: true, report: true }

  it('takes the community’s own switch, each on its own', () => {
    expect(contributionsFor({ contributions: { edit: false } }, on)).toEqual({ add: true, edit: false, report: true })
    expect(contributionsFor({ contributions: { add: false, report: false } }, on)).toEqual({ add: false, edit: true, report: false })
  })

  it('leaves on what the community’s row doesn’t mention', () => {
    for (const row of [undefined, null, {}, { contributions: {} }, { map: { pins: false } }]) {
      expect(contributionsFor(row, on)).toEqual(on)
    }
  })

  it('never turns on what the deployment has off', () => {
    expect(contributionsFor({ contributions: { add: true } }, { ...on, add: false }).add).toBe(false)
  })
})
