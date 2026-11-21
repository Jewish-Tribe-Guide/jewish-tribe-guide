// One email from an eruv's sender, received: read for its status, which
// goes live at once (eruvEmail.ts has the rules). Called by
// /api/inbound/newsletter before anything is read as a shul newsletter.
// Server-only.

import { listEmailedEruvim, saveEmailRead } from '@/lib/eruvStore'
import { readEruvEmail } from '@/lib/eruvEmail'
import { senderAddress } from '@/lib/newsletter'
import type { NewsletterEmail } from '@/lib/newsletterRun'
import { sentFrom } from '@/lib/emailAuth'
import { reportServerError } from '@/lib/serverError'

/** What became of it, for the script: every one is done with.
 *  `unverified`: Gmail didn't find the eruv's address sent it, or the
 *  email came with no check from Gmail at all, so it was not read
 *  (emailAuth.ts). */
export type EruvEmailResult = { status: 'eruv'; eruv: string; read: 'up' | 'down' | 'unclear' | 'no_status' | 'already' | 'unverified' }

/** The addresses eruv status emails come from, for the Gmail script. */
export async function eruvSenders(community: string): Promise<string[]> {
  return (await listEmailedEruvim(community)).map((e) => e.statusEmail!)
}

/**
 * Receives one email, if it's from an eruv's sender, or came through its
 * mailing list (whoever posted it); null when it isn't,
 * for the newsletter reader to take. An email no newer than what the eruv
 * already shows (the same one sent again, or an older one the script found
 * late) changes nothing.
 */
export async function receiveEruvEmail(community: string, email: NewsletterEmail, { timezone, now = new Date().toISOString() }: { timezone: string; now?: string }): Promise<EruvEmailResult | null> {
  const addresses = [senderAddress(email.from), email.list].filter(Boolean)
  if (!addresses.length) return null
  const eruv = (await listEmailedEruvim(community)).find((e) => addresses.includes(e.statusEmail))
  if (!eruv) return null
  const done = (read: EruvEmailResult['read']): EruvEmailResult => ({ status: 'eruv', eruv: eruv.id, read })

  // Its From and List-Post are only words in the email: Gmail's own check
  // of who sent it decides (the health sweep, Nov 20). With no check to go
  // by (a script copied before Nov 20, or a header gone missing) it isn't
  // read either (the user, Nov 21): a status goes live at once, so one
  // nobody can vouch for waits for the next email, and Sentry asks for the
  // script to be copied again.
  const verified = sentFrom(email.auth, eruv.statusEmail!)
  if (verified === false) {
    reportServerError(`[inbound/eruv] an email for ${eruv.id} Gmail didn’t find was from ${eruv.statusEmail}: not read`, email.auth)
    return done('unverified')
  }
  if (verified === null) {
    reportServerError(`[inbound/eruv] an email for ${eruv.id} came with no Authentication-Results, so it wasn’t read: copy the Gmail script again from Newsletters`)
    return done('unverified')
  }

  const sentAt = email.date ?? now
  const latest = Math.max(...[eruv.statusCheckedAt, eruv.statusErrorAt, eruv.statusEmailKept?.sentAt].map((t) => (t ? Date.parse(t) : 0)))
  if (eruv.statusEmailKept?.messageId === email.messageId || Date.parse(sentAt) <= latest) return done('already')

  const reading = readEruvEmail(email, sentAt, timezone)
  if (reading.kind === 'read') {
    await saveEmailRead(community, eruv.id, reading.write, null)
    return done(reading.write.status)
  }
  await saveEmailRead(community, eruv.id, reading.kind === 'unclear' ? reading.write : null, reading.kept)
  return done(reading.kind)
}
