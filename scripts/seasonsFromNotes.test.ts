import { describe, expect, it } from 'vitest'
import { fixDetails, fromNotes } from './seasons-from-notes.mjs'
import { seasonFromNotes } from '../src/lib/scheduleUpdate'

// This script rewrites listings in place. Its season-in-a-note reading is a
// copy of seasonFromNotes in src/lib/scheduleUpdate.ts (a .mjs can't import
// .ts), so the two are held to the same answers here rather than trusted to
// look alike.

const NOTES = ['Winter only- following Kiddush', 'Summer only', 'winter only', 'Summer Only, upstairs', 'following Kiddush', 'Winter', 'Not in winter only sometimes']

describe('seasons out of the notes', () => {
  it('agrees with the guide’s own reading on every note', () => {
    for (const notes of NOTES) {
      const m = { id: 'x', tefillah: 'mincha', days: ['sat'], time: '12:20pm', notes }
      const ours = fromNotes(m)
      const guide = seasonFromNotes(m)
      expect(ours ?? m, notes).toEqual(guide)
    }
  })

  it('moves Mekor Habracha’s, and leaves a season already set alone', () => {
    const { details, moved } = fixDetails({
      minyanim: [
        { id: 'm3', tefillah: 'mincha', days: ['sat'], time: '12:20pm', notes: 'Winter only- following Kiddush' },
        { id: 'm4', tefillah: 'mincha_maariv', days: ['fri'], time: '7:00pm', notes: 'Summer only' },
        { id: 'm6', tefillah: 'maariv', days: ['sun'], time: '8:00pm', notes: 'Summer only', season: 'winter' },
      ],
      kosher: 'yes',
    })
    expect(moved).toHaveLength(2)
    expect(details.minyanim).toEqual([
      { id: 'm3', tefillah: 'mincha', days: ['sat'], time: '12:20pm', season: 'winter', notes: 'following Kiddush' },
      { id: 'm4', tefillah: 'mincha_maariv', days: ['fri'], time: '7:00pm', season: 'summer' },
      { id: 'm6', tefillah: 'maariv', days: ['sun'], time: '8:00pm', notes: 'Summer only', season: 'winter' },
    ])
    expect(details.kosher).toBe('yes')
  })
})
