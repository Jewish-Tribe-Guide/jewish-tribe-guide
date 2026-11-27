// ── The site's own email address (tracker 100, Nov 27) ──────────────────────
// Each community has an address at the site's receiving domain,
// `<community>@<INBOUND_EMAIL_DOMAIN>` (in.phillyjewishguide.com): a
// catch-all at the mail service (Resend), so a new community has one with
// nothing to create. Resend hands each email to /api/inbound/email within
// seconds, where the Gmail script (scripts/newsletter-apps-script.js)
// checked hourly.
//
// What becomes of one:
// - from an eruv's sender: read for up or down, live at once (eruvEmailRun);
// - from a watched shul newsletter: read and filed for an admin
//   (newsletterRun), as the script's are;
// - anything else (a visitor answering "Just reply to this email", a
//   shul's office writing in): forwarded to the community's admins, with
//   Reply-To the sender, so the admin's Reply answers them.
// Automatic mail (out-of-office, bounces) is never forwarded, so two
// auto-responders can't answer each other through it.
//
// The pure parts are here; the route does the network.

import { senderAddress } from './newsletter'
import { senderEmail } from './eruvEmail'
import type { NewsletterEmail } from './newsletterRun'

/** The servers whose Authentication-Results we believe for an email the
 *  site took in itself, as eruvEmailRun needs to: Resend's receiving
 *  server's name in that header. Empty until the first real email shows
 *  it, so an eruv email arriving this way is `unverified` (and Sentry says
 *  which server wrote the header) while the Gmail script still reads it.
 *  Never a server a sender could write the header as: only the receiving
 *  server's own, which sits on top. */
export const INBOUND_AUTH_SERVERS: readonly string[] = []

/** The site's receiving domain, lower case, or null when it isn't set up. */
export function inboundDomain(): string | null {
  const d = process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase().replace(/^@/, '')
  return d || null
}

/** The address a community's email is received at, or null without a
 *  receiving domain. */
export function communityInboundAddress(community: string, domain = inboundDomain()): string | null {
  return domain ? `${community}@${domain}` : null
}

/** Which community the email was sent to: the first recipient at the
 *  receiving domain whose name is a community's. A Bcc'd copy (a mailing
 *  list) names us only in `received_for`, so that's asked too. */
export function communityOfRecipients(addresses: readonly string[], domain: string, slugs: readonly string[]): string | null {
  for (const raw of addresses) {
    const address = senderAddress(raw)
    if (!address) continue
    const at = address.lastIndexOf('@')
    if (at < 0 || address.slice(at + 1) !== domain) continue
    const local = address.slice(0, at).split('+')[0]
    if (slugs.includes(local)) return local
  }
  return null
}

/** A header's value, whatever its case in the map. */
export function headerOf(headers: Record<string, string> | null | undefined, name: string): string | null {
  if (!headers) return null
  const want = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === want) return v
  return null
}

/** Sent by a machine, not a person: an auto-reply, a bounce, a list's
 *  bulk mail flagged as such (RFC 3834's Auto-Submitted, and the headers
 *  auto-responders set before it). */
export function isAutomatic(headers: Record<string, string> | null | undefined, from: string): boolean {
  const auto = headerOf(headers, 'auto-submitted')
  if (auto && auto.trim().toLowerCase() !== 'no') return true
  if (headerOf(headers, 'x-autoreply') || headerOf(headers, 'x-autorespond') || headerOf(headers, 'x-auto-response-suppress')?.toLowerCase().includes('all')) return true
  const precedence = headerOf(headers, 'precedence')?.trim().toLowerCase()
  if (precedence === 'bulk' || precedence === 'junk' || precedence === 'auto_reply') return true
  return /^(mailer-daemon|postmaster|no-?reply)@/i.test(senderAddress(from) ?? '')
}

/** The words of an email: its text part, or its HTML with the tags off. */
export function plainText(text: string | null | undefined, html: string | null | undefined): string {
  if (text?.trim()) return text
  if (!html) return ''
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** A list's own address, from its List-Post header
 *  (`<mailto:shul@groups.io>`), as the Gmail script reads it. */
export function listAddress(listPost: string | null | undefined): string | null {
  const mailto = listPost?.match(/<\s*mailto:([^>?\s]+)/i)?.[1] ?? listPost?.match(/mailto:([^>?\s,]+)/i)?.[1]
  return mailto ? senderEmail(mailto) : null
}

/** The received email, as the eruv and newsletter readers take one. */
export function toNewsletterEmail(
  received: { from: string; subject: string; message_id: string; created_at: string; text: string | null; html: string | null; headers: Record<string, string> | null },
  attachment: { mime: string; b64: string } | null,
): NewsletterEmail {
  const date = headerOf(received.headers, 'date')
  const sent = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : received.created_at
  return {
    messageId: received.message_id,
    // The display name too, as Gmail's From is ("Mekor <info@mekor.org>").
    from: headerOf(received.headers, 'from') || received.from,
    list: listAddress(headerOf(received.headers, 'list-post')),
    subject: received.subject ?? '',
    date: sent,
    text: plainText(received.text, received.html).slice(0, 200_000),
    attachment,
    auth: headerOf(received.headers, 'authentication-results'),
    authServers: INBOUND_AUTH_SERVERS,
  }
}

/** The first PDF or picture, as the Gmail script sends one. */
export function readableAttachment<T extends { content_type: string; size: number }>(attachments: readonly T[], maxBytes = 3_000_000): T | null {
  return attachments.find((a) => (a.content_type === 'application/pdf' || a.content_type.startsWith('image/')) && a.size <= maxBytes) ?? null
}
