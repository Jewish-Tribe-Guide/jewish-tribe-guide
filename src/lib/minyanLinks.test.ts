import { describe, expect, it } from 'vitest'
import { htmlToText } from './menuReader'
import { isGroupLink, isMinyanLink, linkFromMessage, withMinyanLinks } from './minyanLinks'

describe('a minyan’s links on a shul’s page', () => {
  it('knows a sign-up group from any other link', () => {
    for (const l of ['https://chat.whatsapp.com/Ab12Cd34Ef56Gh', 'https://wa.me/12155550142', 'https://groupme.com/join_group/123/abc', 'https://forms.gle/xyz123', 'https://docs.google.com/forms/d/e/1/viewform', 'https://www.signupgenius.com/go/10C0F4']) expect(isGroupLink(l), l).toBe(true)
    for (const l of ['https://www.whatsapp.com', 'https://chat.whatsapp.com/', 'https://docs.google.com/document/d/1', 'https://mekorhabracha.org/minyan', 'mailto:a@b.org']) expect(isGroupLink(l), l).toBe(false)
    expect(isMinyanLink('https://us02web.zoom.us/j/8123456789')).toBe(true)
  })

  // The user, Nov 5: a "Join our WhatsApp group" button came to the
  // reader as its words alone, the address behind it dropped.
  it('puts a group’s or a Zoom’s address beside its words, and no other link’s', () => {
    const html = '<p>Weekday Shacharis 7:00am. <a class="btn" href="https://chat.whatsapp.com/Ab12Cd34Ef56Gh">Join our minyan WhatsApp group</a></p><p><a href="https://us02web.zoom.us/j/8123456789?pwd=a&amp;b=1">Zoom</a> · <a href="/donate">Donate</a></p>'
    expect(htmlToText(withMinyanLinks(html))).toBe('Weekday Shacharis 7:00am. Join our minyan WhatsApp group (https://chat.whatsapp.com/Ab12Cd34Ef56Gh)\nZoom (https://us02web.zoom.us/j/8123456789?pwd=a&b=1) · Donate')
    expect(htmlToText(html)).not.toContain('chat.whatsapp.com')
  })

  it('takes a link the AI gives only when the message writes it out', () => {
    const text = 'Maariv 8pm, only if we have ten: https://chat.whatsapp.com/Ab12Cd34Ef56Gh.'
    expect(linkFromMessage('https://chat.whatsapp.com/Ab12Cd34Ef56Gh.', text, isGroupLink)).toBe('https://chat.whatsapp.com/Ab12Cd34Ef56Gh')
    // Made up, or misread by a letter: dropped.
    expect(linkFromMessage('https://chat.whatsapp.com/Ab12Cd34Ef56GX', text, isGroupLink)).toBeNull()
    expect(linkFromMessage('https://mekor.org/x', 'see https://mekor.org/x', isGroupLink)).toBeNull()
    // A picture's or a PDF's words can't be checked.
    expect(linkFromMessage('https://chat.whatsapp.com/Ab12Cd34Ef56Gh', null, isGroupLink)).toBeNull()
  })
})
