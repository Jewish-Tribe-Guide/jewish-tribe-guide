import { Resend } from 'resend'
import { reportServerError } from './serverError'
import { senderAddress } from './newsletter'
import type { NewsletterEmail } from './newsletterRun'
import { communityOfRecipients, headerOf, inboundDomain, listAddress, readableAttachment, toNewsletterEmail } from './inboundEmail'

// The mail the site's own address received (tracker 100), read back from
// Resend: the webhook route's attachment, and Read now's "its latest
// email", which the Gmail script answered before. Resend keeps received
// mail 30 days; Read now looks back 14, as the script did.

/** Reading received mail needs a full-access key: the sending key is
 *  usually restricted to sending (Resend: "restricted_api_key"). */
export function receivingClient(): Resend | null {
  const key = process.env.RESEND_RECEIVING_API_KEY || process.env.RESEND_API_KEY
  return key ? new Resend(key) : null
}

/** Resend's "2026-11-28 05:15:20.198049+00", as a time. */
export function receivedAt(created: string): number {
  return Date.parse(created.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'))
}

/** The email's first PDF or picture, for the readers, as the Gmail script
 *  sends one; null when it has none or it can't be fetched (the words are
 *  still read). */
export async function attachmentOf(
  resend: Resend,
  emailId: string,
  attachments: { id: string; content_type: string; size: number }[],
): Promise<{ mime: string; b64: string } | null> {
  const wanted = readableAttachment(attachments)
  if (!wanted) return null
  try {
    const { data } = await resend.emails.receiving.attachments.list({ emailId })
    const url = data?.data.find((a) => a.id === wanted.id)?.download_url
    if (!url) return null
    const res = await fetch(url)
    if (!res.ok) return null
    return { mime: wanted.content_type, b64: Buffer.from(await res.arrayBuffer()).toString('base64') }
  } catch (err) {
    reportServerError('[receivedEmail] couldn’t fetch an attachment:', err)
    return null
  }
}

/** Pages of 100 looked through, newest first, and emails opened to see
 *  which list sent them: enough for a community's two weeks. */
const PAGES = 5
const OPENED = 25

/**
 * The latest email to `community`'s address from `address` in the last
 * `days`: sent by it, or through its mailing list (whoever posted it, as
 * the List-Post header says; the Gmail script's `list:`). null when there's
 * none; 'failed' when Resend didn't answer.
 */
export async function latestReceivedFrom(
  resend: Resend,
  community: string,
  address: string,
  { now = Date.now(), days = 14 }: { now?: number; days?: number } = {},
): Promise<NewsletterEmail | null | 'failed'> {
  const domain = inboundDomain()
  if (!domain) return null
  const want = address.trim().toLowerCase()
  const since = now - days * 24 * 60 * 60 * 1000
  let after: string | undefined
  let opened = 0
  try {
    for (let page = 0; page < PAGES; page++) {
      const { data, error } = await resend.emails.receiving.list(after ? { limit: 100, after } : { limit: 100 })
      if (error || !data) return 'failed'
      for (const e of data.data) {
        if (receivedAt(e.created_at) < since) return null
        if (communityOfRecipients([...e.to, ...(e.cc ?? []), ...(e.received_for ?? [])], domain, [community]) !== community) continue
        const from = senderAddress(e.from)
        // Someone else's: it may have come through the list. Each one is
        // opened for its List-Post, so only so many.
        if (from !== want && opened++ >= OPENED) continue
        if (from !== want && !(await isFromList(resend, e.id, want))) continue
        const { data: full, error: notGot } = await resend.emails.receiving.get(e.id)
        if (notGot || !full) return 'failed'
        return toNewsletterEmail(full, await attachmentOf(resend, e.id, full.attachments))
      }
      if (!data.has_more || !data.data.length) return null
      after = data.data[data.data.length - 1].id
    }
    return null
  } catch (err) {
    reportServerError('[receivedEmail] couldn’t look through the received mail:', err)
    return 'failed'
  }
}

async function isFromList(resend: Resend, id: string, list: string): Promise<boolean> {
  const { data } = await resend.emails.receiving.get(id)
  return !!data && listAddress(headerOf(data.headers, 'list-post')) === list
}
