import { afterEach, describe, expect, it, vi } from 'vitest'
import { communityInboundAddress, communityOfRecipients, headerOf, inboundDomain, isAutomatic, listAddress, plainText, readableAttachment, toNewsletterEmail, INBOUND_AUTH_SERVERS } from './inboundEmail'

afterEach(() => vi.unstubAllEnvs())

describe('the community’s own address', () => {
  it('is <community>@ the receiving domain, once there is one', () => {
    vi.stubEnv('INBOUND_EMAIL_DOMAIN', ' In.PhillyJewishGuide.com ')
    expect(inboundDomain()).toBe('in.phillyjewishguide.com')
    expect(communityInboundAddress('philly')).toBe('philly@in.phillyjewishguide.com')
    vi.stubEnv('INBOUND_EMAIL_DOMAIN', '')
    expect(communityInboundAddress('philly')).toBeNull()
  })
})

describe('communityOfRecipients', () => {
  const slugs = ['philly', 'riverton']
  const domain = 'in.example.org'

  it('finds the community the email was sent to', () => {
    expect(communityOfRecipients(['Philly Guide <PHILLY@in.example.org>'], domain, slugs)).toBe('philly')
    expect(communityOfRecipients(['someone@else.org', 'riverton@in.example.org'], domain, slugs)).toBe('riverton')
  })

  it('takes a +tag as the community’s, and nothing at another domain or for no community', () => {
    expect(communityOfRecipients(['philly+eruv@in.example.org'], domain, slugs)).toBe('philly')
    expect(communityOfRecipients(['philly@example.org'], domain, slugs)).toBeNull()
    expect(communityOfRecipients(['admin@in.example.org'], domain, slugs)).toBeNull()
    expect(communityOfRecipients(['not an address'], domain, slugs)).toBeNull()
  })
})

describe('isAutomatic: never forwarded, so auto-responders can’t answer each other', () => {
  it('knows an auto-reply, a bounce and bulk mail', () => {
    expect(isAutomatic({ 'Auto-Submitted': 'auto-replied' }, 'a@b.org')).toBe(true)
    expect(isAutomatic({ 'x-autoreply': 'yes' }, 'a@b.org')).toBe(true)
    expect(isAutomatic({ Precedence: 'bulk' }, 'a@b.org')).toBe(true)
    expect(isAutomatic({}, 'MAILER-DAEMON@mx.example.org')).toBe(true)
    expect(isAutomatic({}, 'Shop <no-reply@shop.com>')).toBe(true)
  })

  it('lets a person’s email through', () => {
    expect(isAutomatic({ 'Auto-Submitted': 'no' }, 'Dana <dana@gmail.com>')).toBe(false)
    expect(isAutomatic(null, 'dana@gmail.com')).toBe(false)
    // A mailing list's post is a person's, passed on.
    expect(isAutomatic({ Precedence: 'list' }, 'dana@gmail.com')).toBe(false)
  })
})

describe('reading the email', () => {
  it('finds a header whatever its case', () => {
    expect(headerOf({ 'List-Post': '<mailto:x@groups.io>' }, 'list-post')).toBe('<mailto:x@groups.io>')
    expect(headerOf(null, 'from')).toBeNull()
  })

  it('reads a list’s address from List-Post, as the Gmail script does', () => {
    expect(listAddress('<mailto:JCOR-NE-Philadelphia@groups.io>')).toBe('jcor-ne-philadelphia@groups.io')
    expect(listAddress('NO')).toBeNull()
    expect(listAddress(null)).toBeNull()
  })

  it('takes the text part, or the HTML’s words', () => {
    expect(plainText('Mincha 6pm', '<p>other</p>')).toBe('Mincha 6pm')
    expect(plainText(null, '<style>p{}</style><p>Eruv is <b>up</b></p><p>Good&nbsp;Shabbos &amp; more</p>')).toBe('Eruv is up\nGood Shabbos & more')
    expect(plainText(null, null)).toBe('')
  })

  it('picks the first PDF or picture under the size cap', () => {
    const a = [
      { content_type: 'text/calendar', size: 10 },
      { content_type: 'image/png', size: 5_000_000 },
      { content_type: 'application/pdf', size: 20_000 },
    ]
    expect(readableAttachment(a)).toBe(a[2])
    expect(readableAttachment([{ content_type: 'text/plain', size: 1 }])).toBeNull()
  })

  it('hands the readers what the Gmail script would, the server vouching for it included', () => {
    const email = toNewsletterEmail(
      {
        from: 'info@mekor.org',
        subject: 'This Shabbos',
        message_id: '<abc@mekor.org>',
        created_at: '2026-11-27T15:00:00Z',
        text: null,
        html: '<p>Mincha 4:15</p>',
        headers: { From: 'Mekor <info@mekor.org>', Date: 'Fri, 27 Nov 2026 09:30:00 -0500', 'List-Post': '<mailto:mekor@groups.io>', 'Authentication-Results': 'mx.example; dkim=pass header.d=mekor.org' },
      },
      null,
    )
    expect(email).toEqual({
      messageId: '<abc@mekor.org>',
      from: 'Mekor <info@mekor.org>',
      list: 'mekor@groups.io',
      subject: 'This Shabbos',
      date: '2026-11-27T14:30:00.000Z',
      text: 'Mincha 4:15',
      attachment: null,
      auth: 'mx.example; dkim=pass header.d=mekor.org',
      authServers: INBOUND_AUTH_SERVERS,
    })
  })

  // Until the first real email shows Resend's server's name, no server is
  // believed: an eruv's email this way waits, and the Gmail script reads it.
  it('believes no server yet', () => {
    expect(INBOUND_AUTH_SERVERS).toEqual([])
  })
})
