import { describe, expect, it } from 'vitest'
import { promote } from './promote-page-headings.mjs'
import { plainTextToRichText } from '../src/lib/richText'

// This script rewrites production page content in place, with no undo, so the
// bar is higher than for a throwaway. Two properties matter.
//
// First: it has to see both eras of stored body. The version before this test
// existed only understood markup, so against production — whose rows are still
// the plain text they were seeded with — it matched nothing and reported
// "nothing to promote", which reads exactly like success. That is the failure
// this file is mainly here to prevent coming back.
//
// Second: converting plain text to markup duplicates escapeText and the
// paragraph split from src/lib/richText.ts, because a .mjs script can't import
// a .ts module. Duplication that nobody checks is duplication that drifts, so
// the conversion is asserted against plainTextToRichText directly.

describe('promote — plain text bodies (what production still has)', () => {
  it('finds section titles in a plain-text body, not just a marked-up one', () => {
    const body = 'Intro sentence that ends properly.\n\nBrowsing the directory\n\nYou can search and filter.'
    const { promoted, out } = promote(body)
    expect(promoted).toEqual(['Browsing the directory'])
    expect(out).toContain('<h2>Browsing the directory</h2>')
  })

  it('agrees with plainTextToRichText on every paragraph it does not promote', () => {
    // Nothing here is heading-shaped: each chunk ends in a full stop.
    const prose = 'First paragraph here.\n\nSecond one, a bit longer, still ordinary prose.\n\nThird.'
    expect(promote(prose).promoted).toEqual([])
    expect(promote(prose).out).toBe(plainTextToRichText(prose))
  })

  it('escapes exactly like the renderer does, including entity handling', () => {
    for (const input of ['Ben & Jerry&rsquo;s are open.', 'a <b>not bold</b> tag.', 'R&D is fine.']) {
      expect(promote(input).out).toBe(plainTextToRichText(input))
    }
  })

  it('keeps a single newline inside a paragraph as a line break', () => {
    const body = 'line one\nline two, which ends the sentence.'
    expect(promote(body).out).toBe(plainTextToRichText(body))
  })

  it('escapes a heading too, so a title containing markup cannot inject tags', () => {
    const { out } = promote('A <script>alert(1)</script> title\n\nBody text follows here.')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })
})

describe('promote — bodies already written through the editor', () => {
  it('promotes a short paragraph and leaves real prose alone', () => {
    const html = '<p>Location</p><p>If you choose to share your location, it stays on your device.</p>'
    const { out, promoted } = promote(html)
    expect(promoted).toEqual(['Location'])
    expect(out).toBe('<h2>Location</h2><p>If you choose to share your location, it stays on your device.</p>')
  })

  it('leaves an existing heading untouched rather than double-wrapping it', () => {
    const html = '<h2>Location</h2><p>Body.</p>'
    expect(promote(html).out).toBe(html)
    expect(promote(html).promoted).toEqual([])
  })

  it('is idempotent — running it twice changes nothing the second time', () => {
    const body = 'Location\n\nSome body copy that ends in a full stop.'
    const once = promote(body).out
    expect(promote(once).out).toBe(once)
    expect(promote(once).promoted).toEqual([])
  })
})

describe('promote — what must NOT be promoted', () => {
  it('leaves a sentence alone even when it is short', () => {
    expect(promote('<p>We never sell it.</p>').promoted).toEqual([])
  })

  it('leaves a long line alone even without ending punctuation', () => {
    const long = 'a'.repeat(80)
    expect(promote(`<p>${long}</p>`).promoted).toEqual([])
  })

  it('leaves a line ending in a colon, comma or semicolon alone', () => {
    for (const tail of [':', ',', ';']) {
      expect(promote(`<p>Where it goes${tail}</p>`).promoted).toEqual([])
    }
  })
})
