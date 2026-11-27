// ── Did Gmail find an email really came from where it says? (Nov 20) ───────
// An eruv's status email goes live at once (eruvEmailRun.ts), matched by its
// From address or the list it came through. Both are only words in the
// email: anyone can write them. Gmail checks who really sent it (DKIM, SPF,
// DMARC) and writes what it found in an Authentication-Results header, which
// the Gmail script sends with each email (`auth`, from Nov 20).
//
// The address we matched is the one that has to pass: its domain, or one
// under it, signed (DKIM) or sent (SPF) the email, or DMARC passed for it.
// A mailing list's email (groups.io, Google Groups) is signed by the list's
// own domain, so a list address checks the same way. The domain is enough:
// a mail provider (gmail.com, groups.io) signs only what an account or list
// of its own sends.

/** Gmail's own name for itself in the header. */
export const GMAIL = 'mx.google.com'

/** The domain of an address, or of a domain. */
function domainOf(value: string): string {
  return value.replace(/^"|"$/g, '').split('@').pop()!.toLowerCase().replace(/\.$/, '')
}

/** One domain is the other, or under it. */
function aligned(a: string, b: string): boolean {
  if (!a.includes('.') || !b.includes('.')) return false
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)
}

/**
 * Whether the server that received the email found `address`'s domain sent
 * it, from that server's Authentication-Results header. null with no header
 * to go by (a script copied before Nov 20), false when there is one and it
 * doesn't show that, or isn't from a server we trust: Gmail's, by default,
 * or the site's own mail service's (inboundEmail.ts) for an email it took
 * in itself.
 */
export function sentFrom(authResults: string | null | undefined, address: string, trusted: readonly string[] = [GMAIL]): boolean | null {
  const header = (authResults ?? '').replace(/\s+/g, ' ').trim()
  if (!header) return null
  const [server, ...results] = header.replace(/\([^)]*\)/g, ' ').split(';')
  if (!trusted.includes(server.trim().toLowerCase())) return false
  const want = domainOf(address)
  return results.some((r) => {
    const result = /^\s*(dkim|spf|dmarc)\s*=\s*(\w+)/i.exec(r)
    if (!result || result[2].toLowerCase() !== 'pass') return false
    const prop = (name: string) => new RegExp(`\\b${name.replace('.', '\\.')}=("[^"]*"|[^\\s;]+)`, 'i').exec(r)?.[1]
    const said = { dkim: prop('header.d') ?? prop('header.i'), spf: prop('smtp.mailfrom'), dmarc: prop('header.from') }[result[1].toLowerCase() as 'dkim' | 'spf' | 'dmarc']
    return said ? aligned(domainOf(said), want) : false
  })
}
