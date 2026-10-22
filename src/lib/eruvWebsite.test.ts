import { describe, expect, it } from 'vitest'
import {
  ERUV_WEBSITE_CREATOR,
  alertsLinks,
  detailsKey,
  detailsKeysToUse,
  detailsPill,
  detailsRows,
  eruvDetailsSuggestion,
  eruvWebsiteWatchChanges,
  readEruvDetails,
} from './eruvWebsite'

const URL_ = 'https://lowermerioneruv.org/'
const page = (body: string) => ({ url: URL_, html: `<html><body>${body}</body></html>`, text: body.replace(/<[^>]+>/g, ' ') })

const LOWER_MERION = { hotline: '(610) 664-5626, option 3', alertsUrl: null }

describe('the hotline', () => {
  it('the same number on the page is the same, whatever its wording', () => {
    expect(readEruvDetails(LOWER_MERION, page('Call 610.664.5626 for the eruv'))).toEqual({ same: ['hotline'], changes: {} })
    expect(readEruvDetails(LOWER_MERION, page('<a href="tel:+16106645626">Call us</a>'))).toMatchObject({ same: ['hotline'] })
  })

  it('its number gone and one other there: the new number, alone', () => {
    expect(readEruvDetails(LOWER_MERION, page('Eruv hotline: (610) 555-0199')).changes).toEqual({ hotline: '(610) 555-0199' })
  })

  it('says nothing when the page has two other numbers, or none', () => {
    expect(readEruvDetails(LOWER_MERION, page('Hotline (610) 555-0199. Rabbi (610) 555-0100')).changes).toEqual({})
    expect(readEruvDetails(LOWER_MERION, page('Call the shul office')).changes).toEqual({})
  })

  it('a number spelled in letters is found as written', () => {
    const vanity = { hotline: '(215) 333-ERUV', alertsUrl: null }
    expect(readEruvDetails(vanity, page('Status line: 215-333-ERUV. Office (215) 555-0100'))).toEqual({ same: ['hotline'], changes: {} })
  })

  it('an eruv with no hotline is given none', () => {
    expect(readEruvDetails({ hotline: null, alertsUrl: null }, page('Call (610) 555-0199')).changes).toEqual({})
  })
})

describe('email alerts', () => {
  it('none on the eruv, and one sign-up link on the page', () => {
    expect(readEruvDetails(LOWER_MERION, page('<a href="https://groups.google.com/g/lmeruv">Join</a> <a href="/about">About</a>')).changes).toEqual({ alertsUrl: 'https://groups.google.com/g/lmeruv' })
    expect(readEruvDetails(LOWER_MERION, page('<a href="/eruv-alerts">Get eruv alerts</a>')).changes).toEqual({ alertsUrl: 'https://lowermerioneruv.org/eruv-alerts' })
  })

  it('its link still on the page is the same', () => {
    const e = { hotline: null, alertsUrl: 'http://www.lowermerioneruv.org/subscribe/' }
    expect(readEruvDetails(e, page('<a href="https://lowermerioneruv.org/subscribe">Subscribe</a> <a href="https://eepurl.com/x">News</a>'))).toEqual({ same: ['alertsUrl'], changes: {} })
  })

  it('its link gone, and one other: that one; two others: nothing', () => {
    const e = { hotline: null, alertsUrl: 'https://old.example.org/list' }
    expect(readEruvDetails(e, page('<a href="https://eepurl.com/abc">Eruv emails</a>')).changes).toEqual({ alertsUrl: 'https://eepurl.com/abc' })
    expect(readEruvDetails(e, page('<a href="https://eepurl.com/abc">x</a> <a href="/sign-up">Sign up</a>')).changes).toEqual({})
  })

  it('a share button or the page itself is not a sign-up', () => {
    expect(alertsLinks('<a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a><a href="/">Subscribe</a>', URL_)).toEqual([])
  })

  it('pages that differ only by their query are different pages', () => {
    expect(alertsLinks('<a href="/?page_id=29">Alerts</a><a href="/?page_id=30">Sign up</a>', URL_)).toHaveLength(2)
  })
})

describe('what it files', () => {
  const eruv = { id: 'lower-merion', name: 'Lower Merion Eruv', covers: 'Bala Cynwyd', website: 'https://lowermerioneruv.org', hotline: '(610) 664-5626, option 3', alertsUrl: null }

  it('the eruv as it is, with what changes', () => {
    expect(eruvDetailsSuggestion(eruv, { hotline: '(610) 555-0199' })).toEqual({ eruvId: 'lower-merion', name: 'Lower Merion Eruv', covers: 'Bala Cynwyd', website: 'https://lowermerioneruv.org', hotline: '(610) 555-0199', alertsUrl: null })
  })

  it('the same reading has the same key', () => {
    expect(detailsKey('a', { hotline: '1' })).toBe(detailsKey('a', { hotline: '1', alertsUrl: null }))
    expect(detailsKey('a', { hotline: '1' })).not.toBe(detailsKey('a', { hotline: '2' }))
  })
})

describe('the Details box', () => {
  const now = { covers: 'Bala Cynwyd', website: 'https://lowermerioneruv.org/', hotline: '(610) 664-5626, option 3', alertsUrl: null }

  it('rows as drawn: a change says what it was; a new one is only highlighted', () => {
    const rows = detailsRows(now, { hotline: '(610) 555-0199', alertsUrl: 'https://eepurl.com/abc' })
    expect(rows.map((r) => [r.name, r.value, r.was, r.mark])).toEqual([
      ['Where it goes', 'Bala Cynwyd', undefined, 'same'],
      ['Website', 'lowermerioneruv.org', undefined, 'same'],
      ['Hotline', '(610) 555-0199', '(610) 664-5626, option 3', 'changed'],
      ['Email alerts', 'eepurl.com/abc', undefined, 'new'],
    ])
    expect(detailsPill(rows)).toBe('2 updates')
    expect(detailsKeysToUse(rows)).toEqual(['hotline', 'alertsUrl'])
  })

  it('with nothing from the website: Same', () => {
    const rows = detailsRows(now)
    expect(rows.map((r) => r.name)).toEqual(['Where it goes', 'Website', 'Hotline'])
    expect(detailsPill(rows)).toBe('Same')
    expect(detailsPill(detailsRows(now, { hotline: '(610) 555-0199' }))).toBe('1 change')
  })
})

describe('the watches the daily run keeps', () => {
  const watch = (id: string, url: string, createdBy = ERUV_WEBSITE_CREATOR) => ({ id, url, createdBy })

  it('one per website, shared by eruvim that share one', () => {
    const got = eruvWebsiteWatchChanges(
      [
        { name: 'Lower Merion Eruv', website: 'lowermerioneruv.org' },
        { name: 'Narberth Eruv', website: 'https://lowermerioneruv.org/' },
        { name: 'Elkins Park Eruv', website: null },
      ],
      [],
    )
    expect(got).toEqual({ add: [{ url: 'https://lowermerioneruv.org/', label: 'Lower Merion Eruv’s website' }], remove: [] })
  })

  it('keeps its own, paused or not; takes away one no eruv has', () => {
    const got = eruvWebsiteWatchChanges([{ name: 'A', website: 'https://a.org/' }], [watch('1', 'https://a.org/'), watch('2', 'https://gone.org/')])
    expect(got).toEqual({ add: [], remove: ['2'] })
  })

  it('never touches an admin’s own watch, nor adds one on its address', () => {
    expect(eruvWebsiteWatchChanges([{ name: 'A', website: 'https://a.org/' }], [watch('9', 'https://a.org/', 'admin@example.com')])).toEqual({ add: [], remove: [] })
    expect(eruvWebsiteWatchChanges([], [watch('9', 'https://b.org/', 'admin@example.com')])).toEqual({ add: [], remove: [] })
  })
})
