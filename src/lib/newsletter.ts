// ─────────────────────────────────────────────────────────────────────────────
// Shul newsletters (the user, Oct 18): the guide's own inbox is subscribed
// to the shuls' weekly emails, and each one is read for what it changes.
//
// Each newsletter sender is a watch on `mailto:<address>`, added on the
// Watches tab with the shul it's from, so the AI is never left to guess
// which shul an email is from. A small Google Apps Script in that Gmail
// account (scripts/newsletter-apps-script.js) asks the site for those
// senders (watchedSenders) and sends only their new emails to
// /api/inbound/newsletter: the rest of the inbox never leaves it (the user,
// Oct 18: "every email seems excessive"). A sender the guide doesn't have
// is left alone there too, never added for an admin to sort out.
//
// Times go through the shul card's own week reader (shulWeekReading.ts);
// anything else the email says about a place in the guide, through the
// "+ Add" box's reader (messageReader.ts). Every change goes to the
// moderation queue, with the email beside it. Approved, the shul's own
// times say "Confirmed by <shul>": a shul is the authority on its times.
//
// Pure: no database, no network, nothing server-only (the Watches tab uses
// it). newsletterRun.ts files them.
// ─────────────────────────────────────────────────────────────────────────────

import type { TimesUpdate } from './scheduleUpdate'
import type { Watch } from './watches'

/** The `created_by` of a newsletter sender's watch, so the daily run knows
 *  it isn't a page to fetch, and the Watches tab says what it does. */
export const NEWSLETTER_WATCH_CREATOR = 'shul newsletters'

/** A sender an admin said isn't a shul (an account notice, a store's
 *  promotions): its emails are skipped from then on. Removing the watch
 *  undoes it. */
export const NEWSLETTER_IGNORED_CREATOR = 'shul newsletters: not a shul'

/** Who files a newsletter's suggestions, as the queue says it. */
export const NEWSLETTER_WATCH_NAME = 'Shul newsletter (automated)'

/** A newsletter that hasn't come in this long is worth an admin's look:
 *  weekly ones skip a week now and then, never a month. */
export const QUIET_AFTER_MS = 30 * 86_400_000

/** The longest email the readers are given. */
export const MAX_NEWSLETTER_TEXT = 8_000

/** The sender's address, lower case, from a From header
 *  ("Young Israel <office@yi.org>", or the bare address). Null for anything
 *  without one. */
export function senderAddress(from: string): string | null {
  const bracketed = from.match(/<([^<>\s]+@[^<>\s]+)>/)
  const bare = bracketed ? bracketed[1] : from.trim().match(/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i)?.[0]
  return bare ? bare.toLowerCase() : null
}

/** The name in a From header, if it has one: `Young Israel` from
 *  `"Young Israel" <office@yi.org>`. */
export function senderName(from: string): string | null {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</)
  return m ? m[1].trim() || null : null
}

/** A sender's watch address. */
export function newsletterUrl(address: string): string {
  return `mailto:${address.toLowerCase()}`
}

export function isNewsletterWatch(w: Pick<Watch, 'createdBy' | 'url'>): boolean {
  return w.createdBy === NEWSLETTER_WATCH_CREATOR && w.url.startsWith('mailto:')
}

/** The addresses the Gmail script sends emails from: the newsletters tied
 *  to a shul and running. A paused one waits; it's sent again once it's
 *  turned back on, if its emails are still in the two weeks searched. */
export function watchedSenders(watches: Pick<Watch, 'createdBy' | 'url' | 'resourceId' | 'active'>[]): string[] {
  const addresses = watches.filter((w) => isNewsletterWatch(w) && w.resourceId && w.active).map((w) => w.url.slice('mailto:'.length).toLowerCase())
  return [...new Set(addresses)]
}

export function isIgnoredSender(w: Pick<Watch, 'createdBy' | 'url'>): boolean {
  return w.createdBy === NEWSLETTER_IGNORED_CREATOR && w.url.startsWith('mailto:')
}

/**
 * A newsletter's words, as the readers are given them: the links taken out
 * (a mailing-list email's plain text is half tracking links, which would
 * crowd the times out of the reader's window), blank lines squeezed, cut to
 * the window.
 */
export function newsletterText(text: string): string {
  return text
    .replace(/\(\s*https?:\/\/[^)\s]*\s*\)/gi, '')
    .replace(/<https?:\/\/[^>\s]*>/gi, '')
    .replace(/\[https?:\/\/[^\]\s]*\]/gi, '')
    .replace(/https?:\/\/\S{60,}/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_NEWSLETTER_TEXT)
}

/** Whether the week reader found any times at all. A newsletter with none
 *  (most of them: classes, simchas, a kiddush) must never read as "every
 *  minyan is gone". */
export function timesWereRead(update: Pick<TimesUpdate, 'rows'>): boolean {
  return update.rows.some((r) => r.status === 'same' || r.status === 'changed' || r.status === 'new')
}

/** The daily run's check on a sender: an error once its newsletter has
 *  gone quiet, so the admin is emailed (once) and the tab shows it red.
 *  `lastEmailAt` is the watch's pageChangedAt; before the first email, the
 *  quiet is counted from when it was linked. */
export function quietError(lastEmailAt: string | null, since: string, now: number): string | null {
  const from = lastEmailAt ?? since
  if (now - Date.parse(from) <= QUIET_AFTER_MS) return null
  const day = new Date(from).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return lastEmailAt ? `No newsletter from them since ${day}` : `No newsletter from them since it was linked, ${day}`
}
