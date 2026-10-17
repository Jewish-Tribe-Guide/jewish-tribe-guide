import { sendEmail, escapeHtml } from './email'
import { siteUrl } from './siteUrl'
import type { Subscriber } from './subscriberStore'

// Returns true when RESEND_FROM is still the Resend sandbox address, which
// can only deliver to the account owner's verified email — not to the
// public. Subscriber notifications are skipped in this state so they don't
// silently fail. Same guard confirmationEmail.ts uses for the same reason.
function isSandbox(): boolean {
  return (process.env.RESEND_FROM || 'onboarding@resend.dev') === 'onboarding@resend.dev'
}

const BODY_STYLE = 'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;'
const HEADING_STYLE = 'color:#1d4ed8;margin-bottom:8px;'
const TEXT_STYLE = 'color:#64748b;font-size:14px;line-height:1.6;margin:8px 0;'

// One link, not two — /subscribers/manage carries its own "Unsubscribe from
// everything" option (see ManageSubscriptionForm), so there's no separate
// bare-unsubscribe link to make a visitor pick between "change what I get"
// and "make it stop".
function unsubscribeFooter(token: string): string {
  const href = `${siteUrl()}/subscribers/manage?token=${token}`
  return `<p style="color:#94a3b8;font-size:12px;margin-top:24px;">You're getting this because you subscribed for updates on this guide.
    <a href="${href}" style="color:#94a3b8;">Manage your subscription</a></p>`
}

// One email per subscriber, not a single batched send — each needs its own
// unsubscribe link, and putting several subscribers' addresses together in
// one request (even as bcc) is more coupling than this needs when the send
// volume for a niche community directory is small. Best-effort: called from
// the submissions route's existing after() side-effect block, so a failure
// here must never fail the approval itself (see that route's own comment).
export async function sendNewListingNotification(
  subscribers: Subscriber[],
  listing: { name: string; url: string },
  categoryLabel: string,
): Promise<void> {
  if (isSandbox() || subscribers.length === 0) return

  await Promise.all(
    subscribers.map((sub) =>
      sendEmail({
        to: sub.email,
        subject: `New in ${categoryLabel}: ${listing.name}`,
        html: `<div style="${BODY_STYLE}">
          <h2 style="${HEADING_STYLE}">${escapeHtml(listing.name)}</h2>
          <p style="${TEXT_STYLE}">Just added to <strong>${escapeHtml(categoryLabel)}</strong>.</p>
          <p style="${TEXT_STYLE}"><a href="${escapeHtml(listing.url)}" style="color:#1d4ed8;">View the listing</a></p>
          ${unsubscribeFooter(sub.unsubscribeToken)}
        </div>`,
      }),
    ),
  )
}

// Sent once, right after signup — the only confirmation a subscriber ever
// gets that the form actually worked, since this app has no account/login to
// check back on. Also the first time the address sees a "Manage your
// subscription" link, in case the first real notification is weeks away.
// Best-effort, same as the two notifications below and the same reasoning:
// called from the subscribe route's after() side-effect, so a failure here
// must never fail the signup itself.
export async function sendSubscribeConfirmation(subscriber: Subscriber): Promise<void> {
  if (isSandbox()) return

  const categoryLine =
    subscriber.categories && subscriber.categories.length > 0
      ? `for the ${subscriber.categories.length} ${subscriber.categories.length === 1 ? 'category' : 'categories'} you picked`
      : 'for every category'
  const kinds = [
    subscriber.notifyAdd && 'a new listing is added',
    subscriber.notifyClosure && 'one closes',
  ].filter((v): v is string => !!v)

  await sendEmail({
    to: subscriber.email,
    subject: "You're subscribed",
    html: `<div style="${BODY_STYLE}">
      <h2 style="${HEADING_STYLE}">You're on the list.</h2>
      <p style="${TEXT_STYLE}">You'll get an email ${categoryLine} when ${kinds.join(' or ')}.</p>
      ${unsubscribeFooter(subscriber.unsubscribeToken)}
    </div>`,
  })
}

export async function sendClosureNotification(
  subscribers: Subscriber[],
  listing: { name: string },
  categoryLabel: string,
): Promise<void> {
  if (isSandbox() || subscribers.length === 0) return

  await Promise.all(
    subscribers.map((sub) =>
      sendEmail({
        to: sub.email,
        subject: `${listing.name} has closed`,
        html: `<div style="${BODY_STYLE}">
          <h2 style="${HEADING_STYLE}">${escapeHtml(listing.name)}</h2>
          <p style="${TEXT_STYLE}">A community report that this ${escapeHtml(categoryLabel)} listing closed was confirmed, and it's been removed from the guide.</p>
          ${unsubscribeFooter(sub.unsubscribeToken)}
        </div>`,
      }),
    ),
  )
}
