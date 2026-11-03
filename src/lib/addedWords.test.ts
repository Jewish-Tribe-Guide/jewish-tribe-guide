import { describe, expect, it } from 'vitest'
import { addedWords } from './addedWords'

const added = (was: string, now: string) =>
  addedWords(was, now)
    .filter((s) => s.added)
    .map((s) => s.text.trim())

// R1Women: what a change adds to a note, marked inside the note.
describe('addedWords', () => {
  it('marks what’s new, in place, and nothing else', () => {
    const was = 'To make an appointment please call or text. 48 hours notice is required.'
    const now = 'To make an appointment please call or text. A thorough cleaning is done before every appointment. 48 hours notice is required.'
    expect(added(was, now)).toEqual(['A thorough cleaning is done before every appointment.'])
  })

  it('gives back the whole text, in order', () => {
    const now = 'one two  three\nfour'
    expect(addedWords('one three', now).map((s) => s.text).join('')).toBe(now)
  })

  it('marks it all when there was nothing', () => {
    expect(added('', 'New note')).toEqual(['New note'])
  })

  it('marks nothing when nothing was added', () => {
    expect(added('a b c', 'a c')).toEqual([])
  })
})
