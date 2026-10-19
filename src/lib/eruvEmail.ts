// ─────────────────────────────────────────────────────────────────────────────
// Eruv status by email (the user, Oct 19). Two eruvim post no status page:
// Northeast announces up and down on a groups.io list, Elkins Park by email.
// The guide's Gmail is subscribed, and each eruv has the address its emails
// come from (`status_email`, migration 084, set on the admin Eruvim tab).
// The Gmail script that sends shul newsletters sends these too: the site
// lists their senders with the newsletters' (newsletterSenders).
//
// Each email is read by the same sentence reader as a status page (eruv.ts
// readStatus, pageText), never the AI, and goes live at once with no
// approval, as a page read does: a Friday "the eruv is down" can't wait in
// a queue. It's dated by when it was sent, and stands only through that
// week's Shabbos (eruv.ts eruvView).
//
// An email the reader can't make out is kept for an admin, who can say
// what it says. One that says both up and down also marks the status as
// unreadable, as such a page does: the email before it can no longer be
// trusted. One that says neither (a list's other news) leaves it alone.
//
// Pure: no database, no network. eruvEmailRun.ts files them.
// ─────────────────────────────────────────────────────────────────────────────

import { localParts, pageText, readStatus } from './eruv'
import type { StatusWrite } from './eruvStore'

/** An email an admin is shown because it couldn't be read. */
export type KeptEmail = {
  messageId: string
  subject: string
  /** When it was sent, ISO. */
  sentAt: string
  /** Its words, as read (no quoted reply, no list footer), cut short. */
  text: string
  /** The status sentence it found, if any. */
  words: string | null
}

const MAX_KEPT_TEXT = 2000

/** The words of an email the eruv wrote: its subject (often the whole
 *  message: "Eruv is UP"), then its body without the earlier messages a
 *  reply quotes, which say last week's status, or the list's footer. */
export function emailStatusText(subject: string, body: string): string {
  const own = body
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join('\n')
    .split(/^\s*On .{0,200}wrote:\s*$|^-{2,}\s*Original Message|^_\._,_\._,_|^Groups\.io Links:|^-=-=-=-/im)[0]
  const subjectWords = subject.replace(/^\s*((re|fwd?|aw)\s*:\s*|\[[^\]]*\]\s*)+/i, '').trim()
  return pageText([subjectWords, own].filter(Boolean).join('. \n'))
}

export type EruvEmailReading =
  /** Up or down: the status, live at once. */
  | { kind: 'read'; write: Extract<StatusWrite, { ok: true }> & { status: 'up' | 'down' } }
  /** Says both: the status can't be trusted any more, and the email is kept. */
  | { kind: 'unclear'; write: Extract<StatusWrite, { ok: false }>; kept: KeptEmail }
  /** Says neither: kept for an admin, the status left as it is. */
  | { kind: 'no_status'; kept: KeptEmail }

/** What one email from an eruv says. `sentAt` is when it was sent (ISO);
 *  `tz`, the community's, for the day it was posted on. */
export function readEruvEmail(email: { messageId: string; subject: string; text: string }, sentAt: string, tz: string): EruvEmailReading {
  const text = emailStatusText(email.subject, email.text)
  const reading = readStatus(text)
  if (reading.status !== 'unknown') {
    // Dated by when it was sent, never a date in its words ("next check
    // Oct 30"): an email is about the week it came in.
    return { kind: 'read', write: { ok: true, status: reading.status as 'up' | 'down', words: reading.words, postedOn: localParts(new Date(sentAt), tz).date, at: sentAt } }
  }
  const kept: KeptEmail = { messageId: email.messageId, subject: email.subject.slice(0, 300), sentAt, text: text.slice(0, MAX_KEPT_TEXT), words: reading.words }
  if (!reading.words) return { kind: 'no_status', kept }
  return { kind: 'unclear', write: { ok: false, error: `Unclear in their email “${email.subject.slice(0, 80)}”: “${reading.words}”`, at: sentAt }, kept }
}

/** What an admin who read a kept email says it says, as a status write:
 *  up or down, dated by the email; null for neither (it's put away and the
 *  status left as it is). */
export function keptEmailSays(kept: KeptEmail, says: 'up' | 'down' | 'neither', tz: string): StatusWrite | null {
  if (says === 'neither') return null
  return { ok: true, status: says, words: `Read by an admin from their email “${kept.subject.slice(0, 120)}”`, postedOn: localParts(new Date(kept.sentAt), tz).date, at: kept.sentAt }
}

/** An email address as the guide keeps a sender: trimmed, lower case. Null
 *  for anything that isn't one. */
export function senderEmail(raw: string): string | null {
  const t = raw.trim().replace(/^mailto:/i, '').toLowerCase()
  return /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/.test(t) ? t : null
}
