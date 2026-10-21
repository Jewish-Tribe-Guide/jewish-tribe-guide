import { describe, expect, it } from 'vitest'
import { dishCounts, dishSections, eruvCounts, eruvSection, hospitalCounts, hospitalSection, sentThroughSite, type DishPlace, type DishReadingStatus } from './watchJobs'
import type { Watch, WatchCheck } from './watches'

const NOW = Date.parse('2026-10-21T12:00:00Z')
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const watch = (over: Partial<Watch> = {}): Watch =>
  ({ id: 'w', active: true, lastRunAt: ago(0.1), lastOkAt: ago(0.1), lastError: null, failingSince: null, lastCheck: null, ...over }) as Watch
const check = (result: WatchCheck['result']): WatchCheck => ({ at: ago(0.1), what: 'contacts', from: null, result, read: [], differences: [], queue: null })

describe('hospitalSection', () => {
  it('puts each hospital where its last read leaves it', () => {
    expect(hospitalSection({ watch: watch({ lastCheck: check('agrees') }), notOnRefuah: false }, NOW)).toBe('checked')
    expect(hospitalSection({ watch: watch({ lastCheck: check('differs') }), notOnRefuah: false }, NOW)).toBe('to_check')
    expect(hospitalSection({ watch: watch({ lastCheck: check('nothing') }), notOnRefuah: false }, NOW)).toBe('nothing')
    expect(hospitalSection({ watch: watch({ lastRunAt: null }), notOnRefuah: false }, NOW)).toBe('waiting')
    // Its page opened, but what it found wasn't kept: not known to agree.
    expect(hospitalSection({ watch: watch({ lastCheck: null }), notOnRefuah: false }, NOW)).toBe('waiting')
    expect(hospitalSection({ watch: null, notOnRefuah: false }, NOW)).toBe('cant_read')
    expect(hospitalSection({ watch: watch({ failingSince: ago(1), lastError: 'Refuah answered 502' }), notOnRefuah: false }, NOW)).toBe('cant_read')
    // The daily run stopping counts too.
    expect(hospitalSection({ watch: watch({ lastRunAt: ago(3) }), notOnRefuah: false }, NOW)).toBe('cant_read')
    expect(hospitalSection({ watch: watch({ active: false }), notOnRefuah: false }, NOW)).toBe('off')
    expect(hospitalSection({ watch: null, notOnRefuah: true }, NOW)).toBe('off')
  })

  it('a waiting finding from Refuah is to check; a difference already decided is checked', () => {
    const differs = watch({ lastCheck: { ...check('differs'), queue: 'before' } })
    expect(hospitalSection({ watch: differs, notOnRefuah: false, waiting: 1 }, NOW)).toBe('to_check')
    expect(hospitalSection({ watch: watch({ lastCheck: check('agrees') }), notOnRefuah: false, waiting: 1 }, NOW)).toBe('to_check')
    expect(hospitalSection({ watch: differs, notOnRefuah: false, waiting: 0 }, NOW)).toBe('checked')
    expect(hospitalSection({ watch: differs, notOnRefuah: false }, NOW)).toBe('to_check')
  })

  it('counts "can’t be read" (no page) apart from "didn’t load today" (a page that failed)', () => {
    const counts = hospitalCounts(
      [
        { watch: watch({ lastCheck: check('agrees') }), notOnRefuah: false },
        { watch: watch({ lastCheck: check('nothing') }), notOnRefuah: false },
        { watch: watch({ failingSince: ago(1), lastError: 'x' }), notOnRefuah: false },
        { watch: null, notOnRefuah: false },
        { watch: null, notOnRefuah: true },
        { watch: watch({ active: false, failingSince: ago(1) }), notOnRefuah: false },
      ],
      NOW,
    )
    expect(counts).toEqual({ checked: 1, toCheck: 0, cantRead: 1, didntLoad: 1, nothing: 1 })
  })
})

describe('dishSections and dishCounts', () => {
  const place = (status: DishReadingStatus, over: Partial<DishPlace> = {}): DishPlace => ({
    website: 'https://x.example',
    menuUrl: null,
    dishes: [],
    reading: { status, readAt: ago(2) },
    ...over,
  })

  it('counts what the Dishes page shows: done, to check, couldn’t be read, and menu pages that didn’t load', () => {
    const places = [
      place('approved'),
      place('skipped'),
      place('proposed'),
      place('failed'),
      // No website and no menu link: can't be read.
      { website: null, menuUrl: null, dishes: [], reading: null },
      // Not read yet: in none of the four.
      { website: 'https://y.example', menuUrl: null, dishes: [], reading: null },
      // Sent through the site after a failed read: done.
      place('failed', { dishes: ['Falafel'], menuAt: ago(1) }),
    ]
    expect(sentThroughSite(places[6])).toBe(true)
    const s = dishSections(places)
    expect([s.done.length, s.toCheck.length, s.failed.length, s.unread.length]).toEqual([3, 1, 2, 1])
    expect(dishCounts(places, [watch({ failingSince: ago(1), lastError: '404' }), watch()], NOW)).toEqual({ checked: 3, toCheck: 1, cantRead: 2, didntLoad: 1 })
  })
})

describe('eruvSection', () => {
  const page = { statusUrl: 'https://eruv.example.org/status', statusErrorAt: null, statusCheckedAt: ago(0.01) }
  it('puts each eruv where its source leaves it', () => {
    expect(eruvSection(page)).toBe('read')
    expect(eruvSection({ ...page, statusUrl: null, statusEmail: 'eruv@shul.org' })).toBe('read')
    expect(eruvSection({ statusUrl: null, statusEmail: null, statusErrorAt: null, statusCheckedAt: null })).toBe('no_source')
    // An email it couldn't read waits for an admin to say what it says.
    expect(eruvSection({ ...page, statusUrl: null, statusEmail: 'eruv@shul.org', statusEmailKept: { subject: 'Eruv' } })).toBe('email')
  })

  it('a page that failed after its last good read didn’t load; one that failed before did', () => {
    expect(eruvSection({ ...page, statusErrorAt: ago(0) })).toBe('didnt_load')
    expect(eruvSection({ ...page, statusErrorAt: ago(1) })).toBe('read')
    expect(eruvSection({ ...page, statusErrorAt: ago(1), statusCheckedAt: null })).toBe('didnt_load')
  })
})

describe('eruvCounts', () => {
  it('has nothing to check: an eruv’s status goes live', () => {
    const page = { statusUrl: 'https://e.org/s', statusErrorAt: null, statusCheckedAt: ago(0.01) }
    const none = { statusUrl: null, statusEmail: null, statusErrorAt: null, statusCheckedAt: null }
    expect(eruvCounts([page, page, none, { ...page, statusErrorAt: ago(0) }])).toEqual({ checked: 2, toCheck: null, cantRead: 1, didntLoad: 1 })
  })
})
