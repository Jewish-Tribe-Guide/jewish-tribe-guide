// One email from an eruv's sender, received: read for its status, which
// goes live at once (eruvEmail.ts has the rules). Called by
// /api/inbound/newsletter before anything is read as a shul newsletter.
// Server-only.

import { listEmailedEruvim, saveEmailRead } from '@/lib/eruvStore'
import { readEruvEmail } from '@/lib/eruvEmail'
import { senderAddress } from '@/lib/newsletter'
import type { NewsletterEmail } from '@/lib/newsletterRun'

/** What became of it, for the script: every one is done with. */
export type EruvEmailResult = { status: 'eruv'; eruv: string; read: 'up' | 'down' | 'unclear' | 'no_status' | 'already' }

/** The addresses eruv status emails come from, for the Gmail script. */
export async function eruvSenders(community: string): Promise<string[]> {
  return (await listEmailedEruvim(community)).map((e) => e.statusEmail!)
}

/**
 * Receives one email, if it's from an eruv's sender; null when it isn't,
 * for the newsletter reader to take. An email no newer than what the eruv
 * already shows (the same one sent again, or an older one the script found
 * late) changes nothing.
 */
export async function receiveEruvEmail(community: string, email: NewsletterEmail, { timezone, now = new Date().toISOString() }: { timezone: string; now?: string }): Promise<EruvEmailResult | null> {
  const address = senderAddress(email.from)
  if (!address) return null
  const eruv = (await listEmailedEruvim(community)).find((e) => e.statusEmail === address)
  if (!eruv) return null
  const done = (read: EruvEmailResult['read']): EruvEmailResult => ({ status: 'eruv', eruv: eruv.id, read })

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
