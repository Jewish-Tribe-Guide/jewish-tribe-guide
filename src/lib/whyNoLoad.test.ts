import { describe, expect, it } from 'vitest'
import { whyNoLoad } from './whyNoLoad'

describe('whyNoLoad (O2Pizza)', () => {
  it('says why in plain words', () => {
    expect(whyNoLoad('HTTP 403')).toBe('Their site turns away automatic visits, so it can’t be read')
    expect(whyNoLoad('HTTP 404')).toBe('The page isn’t there any more')
    expect(whyNoLoad('getaddrinfo ENOTFOUND 20thstreet.pizza')).toBe('The address doesn’t lead to a site any more')
    expect(whyNoLoad('The operation was aborted due to timeout')).toBe('Their site took too long to answer')
    expect(whyNoLoad('HTTP 503')).toBe('Their site gave an error')
    expect(whyNoLoad('fetch failed')).toBe('Their site didn’t answer')
  })

  // What the reader actually keeps (troubleClause): Sons of Israel's five
  // pages, Nov 2, all "it answered with an error (406)", said nothing.
  it('says the reader’s own words, plainer where they can be', () => {
    expect(whyNoLoad('Couldn’t read the page: it answered with an error (406)')).toBe('Their site turns away automatic visits, so it can’t be read')
    expect(whyNoLoad('Couldn’t read the page: it turned the reader away (403)')).toBe('Their site turns away automatic visits, so it can’t be read')
    expect(whyNoLoad('Couldn’t read the page: it didn’t answer in time')).toBe('Their site took too long to answer')
    expect(whyNoLoad('Couldn’t read the page: it couldn’t be reached')).toBe('Their site didn’t answer')
    expect(whyNoLoad('Couldn’t read the page: it says the page isn’t there (404)')).toBe('The page isn’t there any more')
    expect(whyNoLoad('Couldn’t read the page: it sent something that isn’t a page, a PDF or a picture')).toBe('It sent something that isn’t a page, a PDF or a picture')
    expect(whyNoLoad('Couldn’t read the page (blocked, moved, or built in the browser)')).toBe('It may be blocked, moved, or built in the browser')
  })

  it('says nothing it can’t put plainly', () => {
    expect(whyNoLoad(null)).toBeNull()
    expect(whyNoLoad('Unexpected token < in JSON')).toBeNull()
  })
})
