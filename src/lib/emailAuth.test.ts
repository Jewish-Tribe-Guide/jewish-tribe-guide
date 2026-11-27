import { describe, expect, it } from 'vitest'
import { sentFrom } from './emailAuth'

// Gmail's header as it writes it, for the Northeast eruv's groups.io list.
const GROUPS_IO = `mx.google.com;
       dkim=pass header.i=@groups.io header.s=20240830 header.b=abc123;
       arc=pass (i=1);
       spf=pass (google.com: domain of bounce+59a2c1+123@groups.io designates 66.175.222.108 as permitted sender) smtp.mailfrom="bounce+59a2c1+123@groups.io";
       dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=groups.io`

describe('sentFrom: did Gmail find the address’s domain sent it', () => {
  it('a list’s own email passes for the list’s address', () => {
    expect(sentFrom(GROUPS_IO, 'jcor-ne-philadelphia@groups.io')).toBe(true)
  })

  it('an email written to look like the eruv’s, sent from elsewhere, doesn’t', () => {
    const spoofed = `mx.google.com; dkim=pass header.i=@spoofer.example header.s=s1; spf=pass (google.com: domain of x@spoofer.example designates 1.2.3.4 as permitted sender) smtp.mailfrom=x@spoofer.example; dmarc=fail (p=NONE) header.from=groups.io`
    expect(sentFrom(spoofed, 'jcor-ne-philadelphia@groups.io')).toBe(false)
    expect(sentFrom('mx.google.com; dkim=none; spf=softfail smtp.mailfrom=groups.io; dmarc=fail header.from=groups.io', 'jcor-ne-philadelphia@groups.io')).toBe(false)
  })

  it('any one of DKIM, SPF or DMARC passing for the domain, or one under it, is enough', () => {
    expect(sentFrom('mx.google.com; dkim=fail header.i=@eruv.org; spf=pass smtp.mailfrom=bounce@mail.eruv.org', 'status@eruv.org')).toBe(true)
    expect(sentFrom('mx.google.com; dkim=pass header.d=eruv.org', 'status@news.eruv.org')).toBe(true)
    expect(sentFrom('mx.google.com; dmarc=pass (p=REJECT) header.from=eruv.org', 'status@eruv.org')).toBe(true)
    // A domain that only ends the same way isn't under it.
    expect(sentFrom('mx.google.com; dkim=pass header.d=noteruv.org', 'status@eruv.org')).toBe(false)
  })

  it('a header that isn’t Gmail’s own isn’t taken', () => {
    expect(sentFrom(GROUPS_IO.replace('mx.google.com', 'spoofer.example'), 'jcor-ne-philadelphia@groups.io')).toBe(false)
  })

  it('no header to go by is neither', () => {
    expect(sentFrom(null, 'status@eruv.org')).toBeNull()
    expect(sentFrom('  ', 'status@eruv.org')).toBeNull()
  })
})

// Tracker 100 (Nov 27): an email the site takes in itself is vouched for
// by its mail service's receiving server, not Gmail's; only a server named
// is believed, Gmail's by default.
describe('sentFrom: whose header is believed', () => {
  const header = 'inbound.example.net; dkim=pass header.d=groups.io'
  it('believes a server it’s told to, and only that one', () => {
    expect(sentFrom(header, 'jcor@groups.io', ['inbound.example.net'])).toBe(true)
    expect(sentFrom(header, 'jcor@groups.io')).toBe(false)
    expect(sentFrom(header, 'jcor@groups.io', [])).toBe(false)
    expect(sentFrom('mx.google.com; dkim=pass header.d=groups.io', 'jcor@groups.io', ['inbound.example.net'])).toBe(false)
  })
})
