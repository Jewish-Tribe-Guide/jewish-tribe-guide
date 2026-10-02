import { describe, expect, it } from 'vitest'
import { changeDay, changeSentence, changeTime, changesWithin, fitParts, FIT_CHARS, thisWeek, whatChanged, type ChangeLogRow } from './whatChanged'

const NY = 'America/New_York'
let nextId = 1
const place = (name: string, status = 'approved') => ({ id: `id-${name}`, name, category: 'grocery', status })
/** A log row, `hoursAgo` before Friday Oct 2, 2026, 1:30 PM in New York. */
const NOW = Date.parse('2026-10-02T13:30:00-04:00')
function row(over: Partial<ChangeLogRow> & { hoursAgo: number }): ChangeLogRow {
  const { hoursAgo, ...rest } = over
  return {
    id: nextId++,
    createdAt: new Date(NOW - hoursAgo * 3600_000).toISOString(),
    kind: 'listing_edited',
    source: 'submission',
    item: null,
    submissionId: null,
    hidden: false,
    listing: place('ALDI'),
    ...rest,
  }
}

describe('what changed', () => {
  it('only additions, edits and removals: no Still right, seen or gone taps', () => {
    const changes = whatChanged(
      [
        row({ hoursAgo: 1, kind: 'listing_confirmed', source: 'visitor' }),
        row({ hoursAgo: 2, kind: 'item_confirmed', source: 'visitor', item: 'Challah' }),
        row({ hoursAgo: 3, kind: 'item_reported_gone', source: 'visitor', item: 'Challah' }),
        row({ hoursAgo: 4, kind: 'listing_edited' }),
      ],
      NY,
    )
    expect(changes.map((c) => c.kind)).toEqual(['edited'])
  })

  it('one approval is one line: an edit and the items it added', () => {
    const [change, ...rest] = whatChanged(
      [
        row({ hoursAgo: 5, submissionId: 's1', kind: 'listing_edited' }),
        row({ hoursAgo: 5, submissionId: 's1', kind: 'item_added', item: 'Challah' }),
        row({ hoursAgo: 5, submissionId: 's1', kind: 'item_added', item: 'Wine' }),
      ],
      NY,
    )
    expect(rest).toEqual([])
    expect(change.kind).toBe('items')
    expect(changeSentence(change)).toEqual({ before: 'Challah and Wine added at ', name: 'ALDI', after: '' })
  })

  it('a new place is "New", whatever items came with it', () => {
    const [change] = whatChanged([row({ hoursAgo: 1, submissionId: 's2', kind: 'listing_added', listing: place('Food & Friends') }), row({ hoursAgo: 1, submissionId: 's2', kind: 'item_added', item: 'Challah', listing: place('Food & Friends') })], NY)
    expect(changeSentence(change)).toEqual({ before: 'New: ', name: 'Food & Friends', after: '' })
  })

  it('a place taken out of the guide: its earlier changes go, its removal stays', () => {
    const gone = place('Closed Deli', 'archived')
    const changes = whatChanged([row({ hoursAgo: 1, kind: 'listing_removed', listing: gone }), row({ hoursAgo: 30, kind: 'listing_edited', listing: gone })], NY)
    expect(changes.map((c) => changeSentence(c))).toEqual([{ before: '', name: 'Closed Deli', after: ' taken out of the guide' }])
  })

  it('a row whose listing no longer exists at all isn’t shown (the test suites’ listings)', () => {
    expect(whatChanged([row({ hoursAgo: 1, listing: null })], NY)).toEqual([])
  })

  it('Google’s updates: at most two a day; the newest two', () => {
    const changes = whatChanged([1, 2, 3].map((h) => row({ hoursAgo: h, source: 'google', listing: place(`G${h}`) })), NY)
    expect(changes.map((c) => c.listing.name)).toEqual(['G1', 'G2'])
    expect(changeSentence(changes[0]).after).toBe(' updated from Google')
  })

  it('hidden: gone for visitors, still listed for the admin', () => {
    const rows = [row({ hoursAgo: 1, hidden: true }), row({ hoursAgo: 2, listing: place('Spruce Market') })]
    expect(whatChanged(rows, NY).map((c) => c.listing.name)).toEqual(['Spruce Market'])
    expect(whatChanged(rows, NY, { includeHidden: true }).map((c) => [c.listing.name, c.hidden])).toEqual([
      ['ALDI', true],
      ['Spruce Market', false],
    ])
  })
})

describe('what each change changed', () => {
  const phone = { key: 'phone', label: 'Phone', value: '(215) 382-5092' }
  const hours = { key: 'hours', label: 'Hours', value: 'Sunday 11 AM – 10 PM' }

  it('an edit carries what it changed; one from before migration 069 has nothing, and says “updated”', () => {
    const [withParts, without] = whatChanged([row({ hoursAgo: 1, changes: [hours, phone] }), row({ hoursAgo: 2, listing: place('Old Edit') })], NY)
    expect(withParts.parts).toEqual([hours, phone])
    expect(without.parts).toEqual([])
    expect(changeSentence(without)).toEqual({ before: '', name: 'Old Edit', after: ' updated' })
  })

  it('items an edit added head the line, so their list isn’t said again; the rest of the edit is', () => {
    const items = { key: 'm', label: 'Kosher items', value: 'added Challah' }
    const [change] = whatChanged(
      [row({ hoursAgo: 1, submissionId: 's9', changes: [hours, items] }), row({ hoursAgo: 1, submissionId: 's9', kind: 'item_added', item: 'Challah', fieldKey: 'm' })],
      NY,
    )
    expect(changeSentence(change).before).toBe('Challah added at ')
    expect(change.parts).toEqual([hours])
  })

  it('a removal says nothing more', () => {
    const [change] = whatChanged([row({ hoursAgo: 1, kind: 'listing_removed', changes: [phone], listing: place('Gone', 'archived') })], NY)
    expect(change.parts).toEqual([])
  })
})

describe('what fits on Today’s row', () => {
  const part = (label: string, value: string) => ({ key: label, label, value })

  it('as many as fit in about two lines, then how many more', () => {
    const parts = [part('Hours', 'Sunday 11 AM – 10 PM'), part('Phone', '(215) 382-5092'), part('Website', 'benjerry.com/upenn'), part('Food Type', 'Dairy')]
    const { shown, more } = fitParts(parts)
    expect(shown.map((p) => p.label)).toEqual(['Hours', 'Phone'])
    expect(more).toBe(2)
  })

  it('all of them when they fit', () => {
    expect(fitParts([part('Hours', 'Sunday 11 AM – 10 PM')])).toEqual({ shown: [part('Hours', 'Sunday 11 AM – 10 PM')], more: 0 })
  })

  it('a long one alone is left whole (the row clamps it); with more after it, it’s cut so “and 1 more” stays', () => {
    const note = part('What isn’t kosher?', 'Alcoholic beverages are NOT under supervision; list of approved alcoholic beverages available at restaurant upon request.')
    expect(fitParts([note]).shown[0].value).toBe(note.value)
    const { shown, more } = fitParts([note, part('Phone', '(215) 382-5092')])
    expect(more).toBe(1)
    expect(shown[0].value.endsWith('…')).toBe(true)
    expect(shown[0].label.length + 1 + shown[0].value.length).toBeLessThanOrEqual(FIT_CHARS + 1)
  })
})

describe('this week on Today', () => {
  const changes = whatChanged(
    [
      row({ hoursAgo: 1, listing: place('ACME') }),
      row({ hoursAgo: 2, listing: place('ACME') }),
      row({ hoursAgo: 20, listing: place('ALDI') }),
      row({ hoursAgo: 50, listing: place('Costco') }),
      row({ hoursAgo: 60, listing: place('GIANT') }),
      row({ hoursAgo: 8 * 24, listing: place('Old') }),
    ],
    NY,
  )

  it('the newest three, one per place, and how many in the last 7 days', () => {
    const week = thisWeek(changes, NOW)!
    expect(week.total).toBe(5)
    expect(week.shown.map((c) => c.listing.name)).toEqual(['ACME', 'ALDI', 'Costco'])
  })

  it('any change in the last 7 days shows it; none, no block', () => {
    expect(thisWeek(changes.slice(0, 1), NOW)?.total).toBe(1)
    expect(thisWeek(changes.slice(-1), NOW)).toBeNull()
  })

  it('the page’s 30 days', () => {
    expect(changesWithin(changes, NOW, 30)).toHaveLength(6)
  })
})

describe('when, in the community’s time', () => {
  it('Today, Yesterday, then the weekday and date', () => {
    expect(changeDay('2026-10-02T14:00:00Z', NOW, NY)).toBe('Today')
    expect(changeDay('2026-10-01T22:00:00Z', NOW, NY)).toBe('Yesterday')
    expect(changeDay('2026-09-30T19:00:00Z', NOW, NY)).toBe('Wednesday, Sep 30')
  })

  it('late at night in New York is still that day there', () => {
    // 11:30 PM Thursday in New York is Friday in UTC.
    expect(changeDay('2026-10-02T03:30:00Z', NOW, NY)).toBe('Yesterday')
  })

  it('the time, without :00', () => {
    expect(changeTime('2026-10-01T22:00:00Z', NY)).toBe('6 PM')
    expect(changeTime('2026-10-01T16:30:00Z', NY)).toBe('12:30 PM')
  })
})
