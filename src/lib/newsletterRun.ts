// One shul newsletter, received: read for what it changes, and filed as
// suggestions for an admin (newsletter.ts has the rules). Writes no
// listing. Called by /api/inbound/newsletter, once per email the guide's
// Gmail script sends. Server-only.

import { createHash } from 'node:crypto'
import { community as communityConfig } from '@/community.config'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendWatchDigest } from '@/lib/email'
import { findingPage } from '@/lib/watchFindings'
import { submitListingUpdate } from '@/lib/submissionStore'
import { listCategories } from '@/lib/categoryStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { readShulWeek } from '@/lib/shulWeekReading'
import { buildCatalog, itemsChange, readMessage } from '@/lib/messageReader'
import { fieldsEdit, readFieldChanges } from '@/lib/fieldChanges'
import { editSubmission } from '@/lib/editSubmission'
import { readSchedules, regularMinyanim, schedulesKey } from '@/lib/schedules'
import { applyUpdate, changesAnything, type TimesUpdate } from '@/lib/scheduleUpdate'
import { TIMES_PART_LABELS, partLines, splitParts, type PartSource } from '@/lib/timesParts'
import type { ScheduleSource } from '@/lib/scheduleReader'
import type { SubmissionSource } from '@/lib/submissionSource'
import { getWatchByUrl, listWatches, updateWatch } from '@/lib/watchStore'
import { afterRun, type Watch } from '@/lib/watches'
import { eruvSenders } from '@/lib/eruvEmailRun'
import type { ResourceSubmission } from '@/types'
import {
  isIgnoredSender,
  isNewsletterWatch,
  NEWSLETTER_WATCH_NAME,
  newsletterText,
  newsletterUrl,
  senderAddress,
  timesWereRead,
  watchedSenders,
} from '@/lib/newsletter'

export type NewsletterEmail = {
  /** Gmail's id for the message: the same email sent twice is read once. */
  messageId: string
  from: string
  /** The mailing list it came through (its List-Post address, lower case),
   *  if any: a list sends each email from whoever posted it. */
  list?: string | null
  subject: string
  /** When it was sent, ISO. */
  date: string | null
  text: string
  /** Its first PDF or picture, if any: shuls often send the times as one. */
  attachment: { mime: string; b64: string } | null
}

/** What became of it, for the script: `unknown`, `unlinked` and a failure
 *  are sent again next time; anything else is done with. */
export type NewsletterResult =
  | { status: 'not_newsletter' }
  | { status: 'unknown' }
  | { status: 'unlinked'; watchId: string | null }
  | { status: 'paused' }
  | { status: 'ignored' }
  | { status: 'already' }
  | { status: 'read'; filed: number }

const BUCKET = 'site-assets'
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export function emailHash(messageId: string): string {
  return createHash('sha256').update(messageId).digest('hex')
}

function attachmentSource(a: NewsletterEmail['attachment']): ScheduleSource | null {
  if (!a) return null
  if (a.mime === 'application/pdf') return { pdf: a.b64 }
  if (IMAGE_TYPES.has(a.mime)) return { image: a.b64, mime: a.mime }
  return null
}

/** Kept, so the admin can check the times against it. */
async function keepAttachment(a: NonNullable<NewsletterEmail['attachment']>): Promise<string | null> {
  const ext = a.mime === 'application/pdf' ? 'pdf' : a.mime.split('/')[1]
  const path = `newsletter-source/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
  const storage = getAdminClient().storage.from(BUCKET)
  const { error } = await storage.upload(path, Buffer.from(a.b64, 'base64'), {
    contentType: a.mime,
    upsert: false,
  })
  if (error) {
    console.error('[newsletter] could not keep the attachment:', error.message)
    return null
  }
  return storage.getPublicUrl(path).data.publicUrl
}

/** The senders the Gmail script sends emails from: the shul newsletters
 *  (watchedSenders) and the eruvim whose status comes by email. */
export async function newsletterSenders(community: string): Promise<string[]> {
  const [{ watches }, eruvim] = await Promise.all([listWatches(community), eruvSenders(community)])
  return [...new Set([...watchedSenders(watches), ...eruvim])]
}

/**
 * Receives one email. The script sends only watched senders' emails, so
 * one from a sender the guide doesn't have (removed since the script asked)
 * is left alone: no watch is added for it. A linked one is read, and the watch records it: the last email's
 * time (pageChangedAt), what it filed, and the email itself (pageHash), so
 * the same one sent again files nothing.
 *
 * A reader that fails (the AI down) throws, with nothing filed, and the
 * watch records the failure: the script sends the email again next time.
 */
export async function receiveNewsletter(
  community: string,
  email: NewsletterEmail,
  { apiKey, communityName, now = new Date().toISOString() }: { apiKey: string; communityName: string; now?: string },
): Promise<NewsletterResult> {
  const address = senderAddress(email.from)
  if (!address) return { status: 'not_newsletter' }
  // A list's email is from whoever posted it: the list's address is the
  // one a watch can have.
  const watch = (await getWatchByUrl(community, newsletterUrl(address))) ?? (email.list ? await getWatchByUrl(community, newsletterUrl(email.list)) : null)
  if (!watch) return { status: 'unknown' }
  if (isIgnoredSender(watch)) return { status: 'ignored' }
  if (!isNewsletterWatch(watch)) return { status: 'not_newsletter' }
  if (!watch.resourceId) return { status: 'unlinked', watchId: watch.id }
  if (!watch.active) return { status: 'paused' }
  const hash = emailHash(email.messageId)
  if (watch.pageHash === hash) return { status: 'already' }

  try {
    const filed = await readAndFile(community, watch, email, {
      apiKey,
      communityName,
    })
    const { update } = afterRun(watch, { ok: true, filed }, now)
    await updateWatch(community, watch.id, {
      ...update,
      pageHash: hash,
      pageChangedAt: email.date ?? now,
    })
    return { status: 'read', filed }
  } catch (err) {
    const error = `Couldn’t read “${email.subject.slice(0, 80)}”: ${err instanceof Error ? err.message : String(err)}`
    const { update } = afterRun(watch, { ok: false, error }, now)
    await updateWatch(community, watch.id, update).catch(() => {})
    throw err
  }
}

/** Reads the email for its shul, files what it changes, and says how many
 *  suggestions that came to. */
async function readAndFile(
  community: string,
  watch: Watch,
  email: NewsletterEmail,
  { apiKey, communityName }: { apiKey: string; communityName: string },
): Promise<number> {
  const [listings, categories] = await Promise.all([listApprovedResources(community), listCategories(community)])
  const live = categories.filter((c) => c.active !== false)
  const byId = new Map(listings.map((l) => [l.id, l]))
  const catById = new Map(live.map((c) => [c.id, c]))
  const shul = byId.get(watch.resourceId!)
  const shulCategory = shul && catById.get(shul.category)
  if (!shul || !shulCategory) throw new Error('The shul this newsletter is linked to isn’t in the guide any more')

  const text = newsletterText(email.text)
  // Read from the day it was sent: the first run reads two weeks back.
  const sentAt = email.date ? Date.parse(email.date) : undefined
  const fileSource = attachmentSource(email.attachment)
  const key = shulCategory.detailFields.find((f) => f.type === 'minyanim')?.key
  // All at once: three model calls one after another wouldn't fit the
  // minute a request has.
  // A minyan it says is at another shul the guide already has (Mekor's
  // "Mincha at … Mikveh Israel") is that shul's, not this one's.
  const guide = async () => listings
  const [fromText, fromFile, others] = await Promise.all([
    key && text.length >= 10 ? readShulWeek(shul, key, { text }, apiKey, { sentAt, others: guide }) : null,
    key && fileSource ? readShulWeek(shul, key, fileSource, apiKey, { sentAt, others: guide }) : null,
    text.length >= 10
      ? readMessage({ text, images: [] }, buildCatalog(listings, live), {
          apiKey,
          communityName,
          about: shul.id,
        })
      : null,
  ])

  const from = `${shul.name}’s newsletter`
  const when = email.date ? ` (${new Date(email.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })})` : ''
  const heading = `From ${from}: “${email.subject.slice(0, 200)}”${when}.`
  const sourceFor = (listingId: string, photoUrl?: string | null): SubmissionSource => ({
    readBy: 'ai',
    from,
    ...(text ? { original: text } : {}),
    ...(photoUrl ? { photoUrl } : {}),
    note: email.subject.slice(0, 200),
    // The shul is the authority on itself, not on a store it mentions.
    ...(listingId === shul.id ? { named: shul.name } : {}),
  })
  const filings: {
    listingId: string
    name: string
    submission: ResourceSubmission
    lines: string[]
    photoUrl?: string | null
    /** Which of the shul's times it changes (timesParts.ts). */
    part?: PartSource
  }[] = []

  // The shul's times: from the email's words, or from its PDF or picture
  // when the words had none.
  const update: { u: TimesUpdate[]; file: boolean; elsewhere: string[] } | null =
    fromText && timesWereRead(fromText.update)
      ? { u: fromText.updates, file: false, elsewhere: fromText.elsewhere }
      : fromFile && timesWereRead(fromFile.update)
        ? { u: fromFile.updates, file: true, elsewhere: fromFile.elsewhere }
        : null
  if (key && update) {
    const sk = schedulesKey(key)
    // A newsletter's week holds what it gives, never the usual times it
    // left out (the user, Oct 28). Dates past a week's length come back as
    // their own weeks (datedAsWeeks).
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: communityConfig.timezone }).format(new Date())
    const applied = update.u.filter(changesAnything).reduce<ReturnType<typeof applyUpdate>>(
      (sofar, u) => {
        const next = applyUpdate(sofar.minyanim, sofar.schedules, u, u.kind === 'week' ? { onlyRead: { today } } : {})
        return { ...next, changes: [...sofar.changes, ...next.changes] }
      },
      { minyanim: regularMinyanim(shul[key]), schedules: readSchedules(shul[sk]), changes: [] },
    )
    if (applied.changes.length) {
      const photoUrl = update.file && email.attachment ? await keepAttachment(email.attachment) : null
      const whole = editSubmission(shulCategory, shul, {
        [key]: applied.minyanim,
        [sk]: applied.schedules,
      })
      // A part at a time, as a website's reading is filed (timesParts.ts):
      // Shul times shows each in its own box, and a whole one waiting
      // holds back what the shul's website files (the user, Oct 22: some
      // shuls' updates came the old way). What fits no part, a Yom Tov
      // time, is filed whole as before.
      const listed = { ...whole.details, [key]: shul[key] ?? null, [sk]: shul[sk] ?? null }
      const parts = splitParts(listed, whole.details ?? {}, key)
      if (parts.length)
        for (const p of parts)
          filings.push({
            listingId: shul.id,
            name: shul.name,
            submission: { ...whole, details: p.details },
            lines: [...(parts.length === 1 ? applied.changes : partLines(p.source, listed, p.details)), ...(p === parts[0] ? update.elsewhere : [])],
            photoUrl,
            part: p.source,
          })
      else
        filings.push({
          listingId: shul.id,
          name: shul.name,
          submission: whole,
          lines: [...applied.changes, ...update.elsewhere],
          photoUrl,
        })
    }
  }

  // Anything else it says about a place in the guide. Only what the reader
  // could place without asking: there's no one here to answer.
  for (const p of others?.proposals ?? []) {
    if ((p.kind !== 'items' && p.kind !== 'fields') || !p.listingId || p.ask) continue
    const listing = byId.get(p.listingId)
    const category = listing && catById.get(listing.category)
    if (!listing || !category) continue
    if (p.kind === 'items') {
      const change = itemsChange(category, listing, p.items)
      if (change && change.lines.length)
        filings.push({
          listingId: listing.id,
          name: listing.name,
          submission: change.submission,
          lines: change.lines,
        })
    } else {
      const { submission, lines } = fieldsEdit(category, listing, readFieldChanges(category, listing, p.changes).values)
      if (lines.length)
        filings.push({
          listingId: listing.id,
          name: listing.name,
          submission,
          lines,
        })
    }
  }

  for (const f of filings) {
    await submitListingUpdate(
      community,
      f.listingId,
      Object.assign({}, f.submission, {
        source: { ...sourceFor(f.listingId, f.photoUrl), ...(f.part ? { part: f.part } : {}) },
      }),
      [heading, f.lines.join('\n')].join('\n\n'),
      { name: NEWSLETTER_WATCH_NAME },
    )
  }
  if (filings.length) {
    await sendWatchDigest(
      community,
      from,
      filings.map((f) => ({ name: f.name, what: `${f.part ? `${TIMES_PART_LABELS[f.part.part]}: ` : ''}${f.lines.join('; ')}` })),
      // A newsletter is one of its shul's sources: its findings wait on
      // its shul, with the website's.
      findingPage(community, shulCategory, shul.id),
    ).catch((err) => console.error('[newsletter] digest failed:', err))
  }
  return filings.length
}
