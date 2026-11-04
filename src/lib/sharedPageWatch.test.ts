import { describe, expect, it } from 'vitest'
import { joinPageHash, mergeSharedPage, splitPageHash } from './sharedPageWatch'
import type { WatchOutcome } from './watches'

const hashOf = (o: WatchOutcome) => (o.ok ? (o.pageHash ?? null) : null)

// One watch on a page that is both a place's website and its menu (the
// Brazilian BBQ's, Zevi's Bakery's; the user, Nov 4): read for both, each
// with its own fingerprint, so one read's change isn't lost to the other.

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

describe('splitPageHash / joinPageHash', () => {
  it('keeps one fingerprint when both reads agree, two when they don’t', () => {
    expect(joinPageHash(A, A)).toBe(A)
    expect(splitPageHash(joinPageHash(A, B))).toEqual({ page: A, menu: B })
    expect(splitPageHash(A)).toEqual({ page: A, menu: A })
    expect(splitPageHash(null)).toEqual({ page: null, menu: null })
  })
})

describe('mergeSharedPage', () => {
  it('saves both reads’ fingerprints, and what each filed', () => {
    expect(mergeSharedPage({ page: A, menu: B }, { ok: true, filed: 1, pageHash: A }, { ok: true, filed: 2, pageHash: A })).toEqual({ ok: true, filed: 3, pageHash: A })
    expect(splitPageHash(hashOf(mergeSharedPage({ page: A, menu: A }, { ok: true, filed: 0, pageHash: A }, { ok: true, filed: 0, pageHash: B })))).toEqual({ page: A, menu: B })
  })

  it('keeps a read’s old fingerprint when it read nothing (no AI reads left), so its change is still news', () => {
    const out = mergeSharedPage({ page: A, menu: B }, { ok: true, filed: 0, pageHash: 'c'.repeat(64) }, { ok: true, filed: 0, skipped: true })
    expect(splitPageHash(hashOf(out))).toEqual({ page: 'c'.repeat(64), menu: B })
  })

  it('is the page’s outcome: a menu that couldn’t be read doesn’t make its website fail', () => {
    const out = mergeSharedPage({ page: A, menu: B }, { ok: true, filed: 0, pageHash: A, check: { what: 'hours' } as never }, { ok: false, error: 'Couldn’t read the menu' })
    expect(out).toEqual({ ok: true, filed: 0, pageHash: joinPageHash(A, B), check: { what: 'hours' } })
  })

  it('keeps the page’s skip, and the menu’s check when the page has none', () => {
    expect(mergeSharedPage({ page: A, menu: B }, { ok: true, filed: 0, skipped: true }, { ok: true, filed: 0, check: { what: 'dishes' } as never })).toEqual({ ok: true, filed: 0, skipped: true, check: { what: 'dishes' } })
  })
})
