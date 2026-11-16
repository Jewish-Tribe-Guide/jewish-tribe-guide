import { describe, expect, it } from 'vitest'
import { aboutBlocks, aboutCount, firstMailto, pageDocumentParts, pointGlyph, pointsOf, sectionId } from './pageSections'
import { pageBodyToHtml } from './richText'

const parts = (body: string) => pageDocumentParts(pageBodyToHtml(body))

describe('pageDocumentParts', () => {
  it('takes the text before the first heading as the lead, and a section per heading', () => {
    const { lead, sections } = parts('<p>Mission.</p><h2>The problem</h2><p>A.</p><h2>What it does</h2><p>B.</p>')
    expect(lead).toBe('<p>Mission.</p>')
    expect(sections.map((s) => [s.id, s.heading, s.html])).toEqual([
      ['the-problem', 'The problem', '<p>A.</p>'],
      ['what-it-does', 'What it does', '<p>B.</p>'],
    ])
  })

  it('has no lead when the body opens with a heading, and one when it has none at all', () => {
    expect(parts('<h2>A</h2><p>x</p>').lead).toBeNull()
    // A body saved before the editor, or a test's plain string.
    expect(parts('Just a line.').lead).toBe('<p>Just a line.</p>')
    expect(parts('Just a line.').sections).toEqual([])
  })

  it('gives two sections with the same heading different ids', () => {
    expect(parts('<h2>Notes</h2><p>a</p><h2>Notes</h2><p>b</p>').sections.map((s) => s.id)).toEqual(['notes', 'notes-2'])
  })

  it('makes ids from the words alone', () => {
    expect(sectionId('Who it’s for')).toBe('who-its-for')
    expect(sectionId('???')).toBe('section')
  })
})

describe('pointsOf', () => {
  it('reads a list whose every item opens in bold, with the text around it', () => {
    expect(pointsOf('<p>Intro.</p><ul><li><strong>Vercel</strong> hosts it.</li><li><strong>Sentry</strong> reports errors.</li></ul><p>After.</p>')).toEqual({
      before: '<p>Intro.</p>',
      items: [
        { title: 'Vercel', html: 'hosts it.' },
        { title: 'Sentry', html: 'reports errors.' },
      ],
      after: '<p>After.</p>',
    })
  })

  it('is null for a list with an item that has no bold lead', () => {
    expect(pointsOf('<ul><li><strong>A</strong> x</li><li>plain</li></ul>')).toBeNull()
  })

  it('is null for two lists, a nested list, or none', () => {
    expect(pointsOf('<ul><li><strong>A</strong></li></ul><ul><li><strong>B</strong></li></ul>')).toBeNull()
    expect(pointsOf('<ul><li><strong>A</strong><ul><li>x</li></ul></li></ul>')).toBeNull()
    expect(pointsOf('<p>Words.</p>')).toBeNull()
  })
})

describe('aboutBlocks', () => {
  // The shape of the About text (board "About v2").
  const { sections } = parts(
    '<p>Mission.</p>' +
      '<h2>The problem</h2><p>a</p>' +
      '<h2>What the guide does</h2><p>b</p>' +
      '<h2>Who it’s for</h2><ul><li><strong>Living here</strong> x</li><li><strong>Visiting</strong> y</li></ul>' +
      '<h2>What sets it apart</h2><ul><li><strong>Anyone can fix anything</strong> z</li></ul>' +
      '<h2>Who runs it</h2><p>c</p>',
  )

  it('pairs plain sections, makes cards of named points, and leaves the last plain one single', () => {
    expect(aboutBlocks(sections).map((b) => (b.kind === 'pair' ? `pair:${b.sections[0].id}+${b.sections[1].id}` : `${b.kind}:${b.section.id}`))).toEqual([
      'pair:the-problem+what-the-guide-does',
      'cards:who-its-for',
      'cards:what-sets-it-apart',
      'single:who-runs-it',
    ])
  })

  it('keeps a named-points list with text around it as a plain section', () => {
    const { sections: s } = parts('<h2>A</h2><p>Intro</p><ul><li><strong>X</strong> y</li></ul>')
    expect(aboutBlocks(s)).toEqual([{ kind: 'single', section: s[0] }])
  })
})

describe('pointGlyph', () => {
  // Every point in the Nov 15 text gets the icon its board drew.
  it.each([
    ['Living here', 'home'],
    ['Visiting', 'bag'],
    ['Here for the hospital', 'hospital'],
    ['Anyone can fix anything', 'people'],
    ['For every kind of Jew', 'star'],
    ['Every fact says when it was checked', 'clock'],
    ['One community, done properly', 'pin'],
    ['No account.', 'user'],
    ['What you save stays with you.', 'bookmark'],
    ['Nothing sold, no ads.', 'tag'],
    ['A person checks every change.', 'check'],
    ['An AI reads, it doesn’t answer.', 'read'],
  ])('%s → %s', (title, glyph) => {
    expect(pointGlyph(title)).toBe(glyph)
  })

  it('gives a point it has no word for the check mark', () => {
    expect(pointGlyph('Something else entirely')).toBe('check')
  })
})

describe('firstMailto', () => {
  it('finds the first email the text links to', () => {
    expect(firstMailto('<p><a href="https://x.org">x</a> or <a href="mailto:hi@guide.org">hi@guide.org</a></p>')).toBe('hi@guide.org')
    expect(firstMailto('<p>No links.</p>')).toBeNull()
  })
})

describe('aboutCount', () => {
  it('counts places and categories, and says nothing when there are none', () => {
    expect(aboutCount(158, 14)).toBe('158 places · 14 categories')
    expect(aboutCount(1, 1)).toBe('1 place · 1 category')
    expect(aboutCount(0, 1)).toBeNull()
  })
})
