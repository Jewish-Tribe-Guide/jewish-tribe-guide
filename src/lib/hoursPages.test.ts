import { describe, expect, it } from 'vitest'
import { hoursLinks, hoursPages, MAX_HOURS_PAGES } from './hoursPages'

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
    expect(hoursLinks(html, 'https://lmcmikvah.org/')).toEqual([
      'https://lmcmikvah.org/appointments-and-membership/',
      'https://lmcmikvah.org/mens-mikvah/',
      'https://lmcmikvah.org/keilim-mikvah/',
      'https://lmcmikvah.org/faqs/',
      'https://lmcmikvah.org/contact-us/',
    ])
  })

  it('a page called hours or schedule comes first', () => {
    const html = a('/contact', 'Contact') + a('/kelim-mikvah/', 'Kelim Mikvah') + a('/visit#hours', 'Hours')
    expect(hoursLinks(html, 'https://mikvah.example.org/')[0]).toBe('https://mikvah.example.org/visit')
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
    expect(hoursLinks(html, 'https://mikvahohelleah.org/')).toEqual(['https://mikvahohelleah.org/make-an-appointment/'])
  })
})

describe('hoursPages', () => {
  it('reads the home page, then a few of its links', () => {
    const html = Array.from({ length: 8 }, (_, i) => a(`/hours-${i}`, 'Hours')).join('')
    const pages = hoursPages('https://m.example.org/', html)
    expect(pages[0]).toBe('https://m.example.org/')
    expect(pages).toHaveLength(1 + MAX_HOURS_PAGES)
  })
})
