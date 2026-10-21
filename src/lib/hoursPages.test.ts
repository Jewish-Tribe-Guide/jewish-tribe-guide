import { describe, expect, it } from 'vitest'
import { eruvPages, hoursLinks, hoursPages, MAX_HOURS_PAGES, timesPages } from './hoursPages'

const a = (href: string, text: string) => `<a href="${href}">${text}</a>`

describe('hoursLinks', () => {
  it('finds a mikvah’s pages of hours on its own site, best first (Lower Merion’s home page, Oct 21)', () => {
    const html = [
      a('/', 'Women'),
      a('/appointments-and-membership/', 'Appointments and Membership'),
      a('/faqs/', 'FAQs'),
      a('/contact-us/', 'Contact Us'),
      a('/mens-mikvah/', 'Men’s Mikvah'),
      a('/capital-campaign/', 'Capital Campaign'),
      a('/keilim-mikvah/', 'Keilim Mikvah'),
      a('http://www.mikvahrsvp.com/lmcmikvah', 'Make an Appointment'),
      a('https://buy.stripe.com/8wM8', 'Donate'),
    ].join('')
    expect(hoursLinks(html, 'https://lmcmikvah.org/').map((l) => l.url)).toEqual([
      'https://lmcmikvah.org/appointments-and-membership/',
      'https://lmcmikvah.org/mens-mikvah/',
      'https://lmcmikvah.org/keilim-mikvah/',
      'https://lmcmikvah.org/faqs/',
      'https://lmcmikvah.org/contact-us/',
    ])
  })

  it('a page called hours or schedule comes first', () => {
    const html = a('/contact', 'Contact') + a('/kelim-mikvah/', 'Kelim Mikvah') + a('/visit#hours', 'Hours')
    expect(hoursLinks(html, 'https://mikvah.example.org/')[0]).toEqual({ url: 'https://mikvah.example.org/visit', text: 'Hours' })
  })

  it('leaves out what is never hours: donations, the cart, the home page again, other sites, files', () => {
    const html = [
      a('/#contactus', 'Contact'),
      a('/', 'Home'),
      a('/pay-online/', 'Pay for your appointment online'),
      a('/elul-fundraiser/', 'Elul Fundraiser'),
      a('/cart/', 'View Cart'),
      a('https://square.link/u/7H', 'Make a donation'),
      a('/hours.jpg', 'Hours'),
      a('mailto:x@y.org', 'Email the hours'),
    ].join('')
    expect(hoursLinks(html, 'https://mikvahohelleah.org/')).toEqual([])
  })

  it('a link given twice counts once, at its best', () => {
    const html = a('/make-an-appointment/', 'Make an Appointment') + a('/make-an-appointment/', 'Contact an attendant on duty')
    expect(hoursLinks(html, 'https://mikvahohelleah.org/')).toEqual([{ url: 'https://mikvahohelleah.org/make-an-appointment/', text: 'Make an Appointment' }])
  })
})

describe('hoursPages', () => {
  it('reads the home page, then a few of its links', () => {
    const html = Array.from({ length: 8 }, (_, i) => a(`/hours-${i}`, 'Hours')).join('')
    const pages = hoursPages('https://m.example.org/', html)
    expect(pages[0]).toEqual({ url: 'https://m.example.org/', link: null })
    expect(pages[1]).toEqual({ url: 'https://m.example.org/hours-0', link: 'Hours' })
    expect(pages).toHaveLength(1 + MAX_HOURS_PAGES)
  })
})

describe('timesPages', () => {
  // The pages given by hand on Oct 19, each linked from its shul's home page.
  it('finds a shul’s pages of davening times, not its mikvah words', () => {
    const html = [
      a('/about', 'About Us'),
      a('/donate', 'Donate'),
      a('/shabbat.html', 'Shabbat'),
      a('/davening', 'Davening'),
      a('/minyans', 'Minyans'),
      a('/hours', 'Office hours'),
      a('/womens-league', 'Women’s League'),
    ].join('')
    expect(timesPages('https://shul.example.org/', html).map((p) => p.link)).toEqual([null, 'Davening', 'Minyans', 'Shabbat', 'About Us'])
  })

  // Both found by the Oct 21 dry run.
  it('keeps a page’s query, and counts a page once with or without its closing slash', () => {
    const html = [
      a('/index.cfm?fuseaction=Page.ViewPage&pageId=500&utm_source=nav', 'Worship Services'),
      a('/calendar', 'Calendar'),
      a('/calendar/', 'Calendar'),
      a('https://rodephshalom.org', 'Home'),
    ].join('')
    expect(timesPages('https://rodephshalom.org/', html)).toEqual([
      { url: 'https://rodephshalom.org/', link: null },
      { url: 'https://rodephshalom.org/index.cfm?fuseaction=Page.ViewPage&pageId=500', link: 'Worship Services' },
      { url: 'https://rodephshalom.org/calendar', link: 'Calendar' },
    ])
  })
})

describe('eruvPages', () => {
  // The shape of Lower Merion's eruv site (Oct 21): its status is behind an
  // "Eruv Status" link, beside its map and its donations.
  it('finds an eruv’s status page first, then the pages about it', () => {
    const html = [
      a('/wordpress/?page_id=2', 'Map'),
      a('/wordpress/?page_id=40', 'Donate'),
      a('/wordpress/?page_id=12', 'About the Eruv'),
      a('/wordpress/?page_id=29', 'Eruv Status'),
      a('/wordpress/?page_id=8', 'Contact'),
    ].join('')
    expect(eruvPages('https://www.lowermerioneruv.org/', html).map((p) => p.link)).toEqual([null, 'Eruv Status', 'About the Eruv'])
  })
})
