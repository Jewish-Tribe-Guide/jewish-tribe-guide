import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { DirectoryResource } from '@/types'
import { routes, slugRejectionReason } from './routes'
import { questionFromSlug, questionSlug, questionTitle, shareSummary } from './shareAnswer'

describe('a shared question’s link', () => {
  it('is readable, and reads back as the question', () => {
    expect(routes.ask('philly', 'Where can I get challah?')).toBe('/philly/ask/where-can-i-get-challah')
    expect(questionFromSlug('where-can-i-get-challah')).toBe('where can i get challah')
  })

  it('is one link per question, whatever the capitals', () => {
    expect(routes.ask('philly', 'Kosher WINE')).toBe(routes.ask('philly', 'kosher wine'))
  })

  it('survives what people type', () => {
    for (const q of ["what's open after 10", 'mincha at 6:45', 'בית כנסת', 'food & drink']) {
      const segment = routes.ask('philly', q).split('/').pop()!
      // What Next hands the page is the decoded segment.
      expect(questionFromSlug(decodeURIComponent(segment)), q).toBe(q)
    }
  })

  it('has no question when there’s nothing sensible in it', () => {
    expect(questionFromSlug('')).toBeNull()
    expect(questionFromSlug('---')).toBeNull()
    expect(questionFromSlug('%E0%A4%A')).toBeNull()
    expect(questionFromSlug('a'.repeat(101))).toBeNull()
  })

  it('keeps a long question to a length a link can carry', () => {
    expect(questionSlug(`${'word '.repeat(40)}?`).length).toBeLessThanOrEqual(100)
  })

  it('reads as a title', () => {
    expect(questionTitle('bagels open now')).toBe('Bagels open now')
    expect(questionTitle("where can i get challah, or can i'm told")).toBe("Where can I get challah, or can I'm told")
    expect(questionTitle('is there a minyan in chabad')).toBe('Is there a minyan in chabad')
  })

  it('can’t be taken by a category', () => {
    expect(slugRejectionReason('ask')).toMatch(/reserved/)
  })
})

describe('shareSummary: the link preview', () => {
  const grocery = makeCategory({ id: 'grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }, { key: 'hours', label: 'Hours', type: 'hours' }] })
  const synagogue = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues' })
  const categories = [grocery, synagogue]
  const allWeek = (open: string, close: string) =>
    Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open, close }]))
  const listing = (category: string, name: string, details: Record<string, unknown> = {}): DirectoryResource => ({
    id: name, category, name, anchorId: 'community', distance: 0, address: '', ...details,
  })
  // Open only in the small hours: whatever the clock says when the preview
  // is made, it mustn't matter.
  const bakery = listing('grocery', 'Night Bakery', { m: ['Bagels'], hours: allWeek('02:00', '03:00') })
  const store = listing('grocery', 'Day Store', { m: ['Bagels', 'Challah'], hours: allWeek('09:00', '17:00') })
  const shul = listing('synagogue', 'Shul One')
  const listings = [bakery, store, shul]
  const say = (q: string) => shareSummary(q, listings, categories)

  it('answers the question', () => {
    expect(say('Where can I get challah')).toBe('Day Store has Challah.')
  })

  it('leaves the hour out, since a preview is read for days, and says the page has it', () => {
    expect(say('bagels open now')).toBe('2 places have Bagels. Open to see which are open now.')
    expect(say('bagels open after 6')).toBe('2 places have Bagels. Open to see which are open after 6:00 PM.')
  })

  it('says what’s open is on the page when that’s all that was asked', () => {
    expect(say("what's open after 10")).toBe("Open to see what's open after 10:00 PM, from the hours in the guide.")
  })

  it('points to the page for minyan times', () => {
    expect(say('next mincha')).toBe('Minyan times from 1 shul in the guide, worked out when you open it.')
  })

  it('says so when the guide doesn’t have it', () => {
    expect(say('peeled garlic')).toBe('Not in the guide yet. Know where to find it? Add it to the guide.')
  })
})
