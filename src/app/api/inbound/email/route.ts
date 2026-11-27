import { Resend } from 'resend'
import { reportServerError } from '@/lib/serverError'
import { listCommunities } from '@/lib/communityStore'
import { receiveEruvEmail } from '@/lib/eruvEmailRun'
import { receiveNewsletter } from '@/lib/newsletterRun'
import { sendForwardedEmail } from '@/lib/email'
import { communityOfRecipients, inboundDomain, isAutomatic, readableAttachment, toNewsletterEmail } from '@/lib/inboundEmail'

// POST /api/inbound/email — Resend's `email.received` webhook (tracker 100).
// A community's own address, `<community>@<INBOUND_EMAIL_DOMAIN>`, is a
// catch-all at Resend, which posts each email here within seconds
// (inboundEmail.ts has the rules):
// - an eruv's sender: read for up or down, live at once;
// - a watched shul newsletter: read and filed for an admin;
// - anything else from a person: forwarded to the community's admins,
//   Reply-To the sender. Automatic mail (out-of-office, bounces) and a
//   sender an admin chose to ignore are dropped.
//
// Signed by Resend (Svix): RESEND_WEBHOOK_SECRET, from the webhook's page
// in Resend. Without it, or without INBOUND_EMAIL_DOMAIN, the route is
// closed: it forwards mail and spends model calls. The webhook carries only
// who and what; the words and attachments are fetched from Resend's API.
//
// Answers 200 for everything that's done with, mail to no community
// included, so Resend doesn't send it again; a failure to read or forward
// answers 500, and Resend tries again (a forward is sent once per email).
//
// The Gmail script (/api/inbound/newsletter) runs beside it until each list
// has moved over: an eruv email that arrives both ways goes live once
// (eruvEmailRun's `already`); a shul list should be subscribed to one or
// the other, since the two count an email by different ids.

export const maxDuration = 60

const closed = (why: string) => Response.json({ ok: false, error: why }, { status: 503 })

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const domain = inboundDomain()
  const apiKey = process.env.RESEND_API_KEY
  if (!secret || !domain || !apiKey) return closed('Receiving email isn’t set up here.')

  const payload = await request.text()
  const resend = new Resend(apiKey)
  let event
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get('svix-id') ?? '',
        timestamp: request.headers.get('svix-timestamp') ?? '',
        signature: request.headers.get('svix-signature') ?? '',
      },
      webhookSecret: secret,
    })
  } catch {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (event.type !== 'email.received') return Response.json({ ok: true, status: 'not_received' })

  const data = event.data
  const communities = await listCommunities()
  const slug = communityOfRecipients([...data.to, ...(data.cc ?? []), ...(data.received_for ?? [])], domain, communities.map((c) => c.slug))
  const community = communities.find((c) => c.slug === slug)
  // Mail to an address that's no community's: spam, mostly. Done with.
  if (!community) return Response.json({ ok: true, status: 'no_community' })

  const { data: received, error } = await resend.emails.receiving.get(data.email_id)
  if (error || !received) {
    reportServerError('[inbound/email] couldn’t fetch the email from Resend:', error)
    return Response.json({ ok: false, error: 'Couldn’t fetch it.' }, { status: 502 })
  }

  try {
    const eruv = await receiveEruvEmail(community.slug, toNewsletterEmail(received, null), { timezone: community.timezone })
    if (eruv) return Response.json({ ok: true, ...eruv })

    const email = toNewsletterEmail(received, await attachmentOf(resend, data.email_id, received.attachments))
    const newsletter = await receiveNewsletter(community.slug, email, {
      apiKey: process.env.OPENAI_API_KEY ?? '',
      communityName: community.name,
      where: community,
    })
    if (newsletter.status !== 'unknown' && newsletter.status !== 'not_newsletter') return Response.json({ ok: true, ...newsletter })

    if (isAutomatic(received.headers, received.from)) return Response.json({ ok: true, status: 'automatic' })
    await sendForwardedEmail(community.slug, {
      emailId: data.email_id,
      from: email.from,
      to: data.to.join(', '),
      subject: email.subject,
      date: email.date ?? received.created_at,
      text: email.text,
      attachments: received.attachments.map((a) => a.filename ?? a.content_type),
    })
    return Response.json({ ok: true, status: 'forwarded' })
  } catch (err) {
    reportServerError('[inbound/email] failed:', err)
    return Response.json({ ok: false, error: err instanceof Error ? err.message : 'Couldn’t take it in.' }, { status: 500 })
  }
}

/** The email's first PDF or picture, for the newsletter reader, as the
 *  Gmail script sends one; null when it has none or it can't be fetched
 *  (the words are still read). */
async function attachmentOf(
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
    reportServerError('[inbound/email] couldn’t fetch an attachment:', err)
    return null
  }
}
