import { describe, expect, it } from 'vitest'
import { fillNewsletterScript, readNewsletterScript } from './newsletterScript'

// The Newsletters page hands out the Gmail script filled in for the
// community (Oct 29). A copy that kept Philly's lines would post a new
// community's newsletters into Philly, so a line that can't be found fails.

describe('fillNewsletterScript', () => {
  const script = readNewsletterScript()

  it('fills in the site, the community and its key, and nothing else', () => {
    const filled = fillNewsletterScript(script, { site: 'https://guide.example/', community: 'riverton', key: 'nl_abc' })
    expect(filled).toMatch(/^var SITE = 'https:\/\/guide\.example'$/m)
    expect(filled).toMatch(/^var COMMUNITY = 'riverton'$/m)
    expect(filled).toMatch(/^var KEY = 'nl_abc'$/m)
    expect(filled).not.toContain("'philly'")
    expect(filled.split('\n').length).toBe(script.split('\n').length)
  })

  it('keeps a quote in a value inside its string', () => {
    expect(fillNewsletterScript(script, { site: 'https://x', community: "o'k", key: 'k' })).toMatch(/^var COMMUNITY = 'o\\'k'$/m)
  })

  it('throws rather than hand out a copy it couldn’t fill in', () => {
    expect(() => fillNewsletterScript(script.replace(/^var KEY = .*$/m, ''), { site: 'https://x', community: 'c', key: 'k' })).toThrow(/KEY/)
  })
})
