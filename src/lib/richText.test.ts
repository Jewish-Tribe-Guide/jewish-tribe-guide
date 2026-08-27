import { describe, expect, it } from 'vitest'
import { ALLOWED_TAGS, isRichText, pageBodyToHtml, plainTextToRichText, sanitizeRichText } from './richText'

// The Pages tab's WYSIWYG writes markup straight from a browser's
// contenteditable into a column that /about and /privacy render with
// dangerouslySetInnerHTML. These tests are the only thing standing between
// those two facts, so they're deliberately adversarial as well as functional.

describe('sanitizeRichText — formatting that must survive', () => {
  it('keeps the formatting the toolbar can produce', () => {
    const html =
      '<p><strong>bold</strong> <em>italic</em> <u>underline</u> <s>struck</s></p>' +
      '<h2>Heading</h2><ul><li>one</li></ul><ol><li>two</li></ol><blockquote>quoted</blockquote>'
    expect(sanitizeRichText(html)).toBe(html)
  })

  it('rewrites what contenteditable actually emits into the canonical tags', () => {
    // Chrome gives <b>/<i> for Cmd-B/Cmd-I and wraps lines in <div>.
    expect(sanitizeRichText('<div><b>a</b><i>b</i></div>')).toBe('<p><strong>a</strong><em>b</em></p>')
  })

  it('drops presentational attributes a paste brings with it', () => {
    expect(sanitizeRichText('<p style="color:red" class="x" dir="rtl">hi</p>')).toBe('<p>hi</p>')
  })

  it('unwraps an unknown tag instead of eating the text inside it', () => {
    expect(sanitizeRichText('<p><span style="font-size:40px">keep me</span></p>')).toBe('<p>keep me</p>')
  })

  it('leaves existing entities alone rather than double-escaping them', () => {
    expect(sanitizeRichText('<p>Ben &amp; Jerry&rsquo;s</p>')).toBe('<p>Ben &amp; Jerry&rsquo;s</p>')
  })

  it('escapes a bare ampersand that is not an entity', () => {
    expect(sanitizeRichText('<p>R&D</p>')).toBe('<p>R&amp;D</p>')
  })

  it('is idempotent — sanitizing its own output changes nothing', () => {
    const once = sanitizeRichText('<p>a & b <span>c</span> <a href="http://x.test">l</a></p>')
    expect(sanitizeRichText(once)).toBe(once)
  })
})

describe('sanitizeRichText — things that must not reach a visitor', () => {
  it('drops a script tag and its source, rather than unwrapping it into body copy', () => {
    expect(sanitizeRichText('<p>a</p><script>alert(1)</script><p>b</p>')).toBe('<p>a</p><p>b</p>')
  })

  it('drops nested script tags without resuming halfway through', () => {
    expect(sanitizeRichText('<script><script>alert(1)</script></script>ok')).toBe('ok')
  })

  it('does not let a self-closing iframe swallow the rest of the page', () => {
    expect(sanitizeRichText('<iframe src="http://evil.test"/><p>still here</p>')).toBe('<p>still here</p>')
  })

  it('strips an inline event handler along with its element', () => {
    expect(sanitizeRichText('<p onclick="alert(1)">text</p>')).toBe('<p>text</p>')
    expect(sanitizeRichText('<img src=x onerror="alert(1)">')).toBe('')
  })

  it('refuses a javascript: href but keeps the link text', () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">click</a>')).toBe('<a>click</a>')
  })

  it('refuses a javascript: href hidden behind an entity', () => {
    // A browser decodes the href before following it, so the check has to too.
    expect(sanitizeRichText('<a href="&#106;avascript:alert(1)">click</a>')).toBe('<a>click</a>')
  })

  it('refuses a javascript: href broken up by control characters', () => {
    expect(sanitizeRichText('<a href="java\tscript:alert(1)">click</a>')).toBe('<a>click</a>')
    expect(sanitizeRichText('<a href="  java\nscript:alert(1)">click</a>')).toBe('<a>click</a>')
  })

  it('refuses a data: href', () => {
    expect(sanitizeRichText('<a href="data:text/html,<script>alert(1)</script>">x</a>')).toContain('<a>')
    expect(sanitizeRichText('<a href="data:text/html,x">y</a>')).not.toContain('href')
  })

  it('cannot be tricked into breaking out of the href it emits', () => {
    // The quote is escaped, so the whole payload stays inside the attribute
    // value as part of the URL — `onmouseover=` never becomes an attribute.
    const out = sanitizeRichText('<a href=\'http://x.test/" onmouseover="alert(1)\'>x</a>')
    expect(out).not.toMatch(/"\s*onmouseover/)
    expect(out).toContain('&quot;onmouseover')
  })

  it('keeps http, https, mailto, tel and same-site links', () => {
    for (const href of ['https://x.test/a', 'http://x.test', 'mailto:a@b.test', 'tel:+12155551234', '/privacy', '#top']) {
      expect(sanitizeRichText(`<a href="${href}">x</a>`)).toContain(`href="${href}"`)
    }
  })

  it('rejects a protocol-relative href, which is not the same-site link it looks like', () => {
    expect(sanitizeRichText('<a href="//evil.test/x">x</a>')).toBe('<a>x</a>')
  })

  it('gives an outbound link rel="noopener noreferrer" with its target', () => {
    const out = sanitizeRichText('<a href="https://x.test">x</a>')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('leaves a link to this same site in the same tab', () => {
    // About linking to /privacy is navigation, not a citation — opening it in
    // a new tab strands the visitor with two copies of the site.
    for (const href of ['/privacy', '#top', 'mailto:a@b.test', 'tel:+12155551234']) {
      expect(sanitizeRichText(`<a href="${href}">x</a>`)).toBe(`<a href="${href}">x</a>`)
    }
  })

  it('drops an HTML comment, including one hiding markup', () => {
    expect(sanitizeRichText('<p>a<!-- <script>alert(1)</script> -->b</p>')).toBe('<p>ab</p>')
  })

  it('emits no tag outside the allowlist, whatever it is fed', () => {
    const nasty =
      '<svg/onload=alert(1)><math><mtext><table><form><object data="x"><base href="//evil.test">' +
      '<p>text</p><link rel=stylesheet href=x><meta http-equiv=refresh content=0>'
    for (const [, tag] of sanitizeRichText(nasty).matchAll(/<\/?([a-z0-9]+)/gi)) {
      expect(ALLOWED_TAGS).toContain(tag.toLowerCase())
    }
  })
})

describe('sanitizeRichText — malformed markup', () => {
  it('closes a tag left open, so it cannot leak into the rest of the page', () => {
    expect(sanitizeRichText('<p><strong>unclosed')).toBe('<p><strong>unclosed</strong></p>')
  })

  it('closes inner tags when an outer one closes first', () => {
    expect(sanitizeRichText('<p><em>x</p><p>y</p>')).toBe('<p><em>x</em></p><p>y</p>')
  })

  it('drops a closing tag that was never opened', () => {
    expect(sanitizeRichText('</strong>text')).toBe('text')
  })

  it('drops the empty paragraph contenteditable uses for a blank line', () => {
    expect(sanitizeRichText('<p>a</p><p><br></p><p>b</p>')).toBe('<p>a</p><p>b</p>')
  })

  it('keeps a <br> that is a real line break inside a paragraph', () => {
    expect(sanitizeRichText('<p>a<br>b</p>')).toBe('<p>a<br>b</p>')
  })
})

describe('plain text written before the editor existed', () => {
  const legacy = 'First paragraph.\n\nSecond paragraph.'

  it('is not mistaken for markup', () => {
    expect(isRichText(legacy)).toBe(false)
    expect(isRichText('We serve 3 < 5 boroughs')).toBe(false)
    expect(isRichText('<p>hi</p>')).toBe(true)
  })

  it('renders with the same paragraph breaks the old renderer gave it', () => {
    expect(pageBodyToHtml(legacy)).toBe('<p>First paragraph.</p><p>Second paragraph.</p>')
  })

  it('escapes anything in it that looks like markup', () => {
    expect(plainTextToRichText('a <b>not bold</b>')).toBe('<p>a &lt;b&gt;not bold&lt;/b&gt;</p>')
  })

  it('keeps a single newline as a line break rather than dropping it', () => {
    expect(plainTextToRichText('line one\nline two')).toBe('<p>line one<br>line two</p>')
  })

  it('renders an empty or missing body as nothing at all, not as an empty paragraph', () => {
    expect(pageBodyToHtml('')).toBe('')
    expect(pageBodyToHtml(null)).toBe('')
    expect(pageBodyToHtml(undefined)).toBe('')
  })
})
