import type { DirectoryResource, ResourceSubmission, SubmissionRow } from '@/types'
import { resolveCapabilities, type CategoryConfig } from './categories'
import type { Community } from './communityStore'
import { contributionsFor } from './uiConfig'
import { listCategories } from './categoryStore'
import { listApprovedResources } from './resourceStore'
import { submitListingCreate, submitListingUpdate } from './submissionStore'
import { sendSubmissionNotification } from './email'
import { reportServerError } from './serverError'
import { buildCatalog, itemsChange, messageSource, newPlaceSubmission, readMessage, type Proposal, type ReadImage } from './messageReader'
import { fieldsEdit, readFieldChanges } from './fieldChanges'
import { readShulWeek } from './shulWeekReading'
import { applyUpdate, changesAnything, cleanUpdate, readAnything } from './scheduleUpdate'
import { readSchedules, regularMinyanim, schedulesKey } from './schedules'
import { editSubmission } from './editSubmission'
import { dayInTimezone } from './isoDay'
import { saveMessageReadTime } from './messageReadTime'
import { claimRead, finishRead, type SentMessage } from './sentMessageStore'

// ── A sent post, read after Send (Nov 27, docs/add-rethink.md, S1b–S3b) ──
// The "+ Add" box used to read a paste while the visitor waited, show them
// the read, and file what they checked. Now Send keeps the post
// (sentMessageStore.ts) and answers at once; this reads it, at a higher
// thinking level since no one is waiting, and files what it reads as the
// box's Send did (/api/message/send): each change worked out again from the
// listing as it is, labelled "Read by AI" with the post it came from, for
// an admin to approve. The admin is now the one who checks the read.
//
// The box asked the visitor two things a read can't settle alone. Here:
// - which of several places a post means: not guessed. Left for the admin,
//   with the post, as is anything else the read couldn't place.
// - "every Wednesday, or just this one?": filed as from now on, with the
//   one-day reading in the note, since the admin can change any field
//   before approving.
// The AI still never supplies a fact: everything filed is what the post
// says, set beside the listing by the same code the box used.

/** How hard the model thinks: higher than the box's "low", since no one
 *  waits on it now (the user, Nov 27: "we can have it do a higher
 *  thinking"). */
export const BACKGROUND_EFFORT = 'high'

/** Reads tried before a post is left for the admin as unreadable. */
export const MAX_ATTEMPTS = 3

const BEFORE = 'From a post sent with “+ Add”, read by AI.'

export type Filing =
  | { op: 'update'; listingId: string; submission: ResourceSubmission; note: string }
  | { op: 'create'; submission: ResourceSubmission; note: string }

export type FilingPlan = {
  filings: Filing[]
  /** A shul whose times the post gives: read again by the week reader. */
  times: string[]
  /** What couldn't be filed, a line each, for the admin. */
  left: string[]
}

type Ctx = {
  byId: Map<string, DirectoryResource>
  catById: Map<string, CategoryConfig>
  canAdd: boolean
  canEdit: boolean
}

const quoted = (s: string) => `“${s.trim().slice(0, 120)}”`

/** What a read turns into, without the shul times (they need a second read). */
export function planFiling(proposals: Proposal[], ctx: Ctx): FilingPlan {
  const plan: FilingPlan = { filings: [], times: [], left: [] }
  const editable = (id: string | null) => {
    const listing = id ? ctx.byId.get(id) : undefined
    const category = listing && ctx.catById.get(listing.category)
    return listing && category && ctx.canEdit && resolveCapabilities(category.capabilities).edit ? { listing, category } : null
  }
  const which = (ask: { choices: { label: string }[] } | null, asWritten: string) =>
    ask && ask.choices.length ? `Which place? ${ask.choices.map((c) => c.label).join(' or ')}: ${quoted(asWritten)}` : `Not a place in the guide: ${quoted(asWritten)}`

  for (const p of proposals) {
    if (p.kind === 'items') {
      if (!p.listingId) {
        plan.left.push(p.chain && !p.ask ? `A chain, not one place: ${quoted(p.asWritten)}` : which(p.ask, p.asWritten))
        continue
      }
      const at = editable(p.listingId)
      if (!at) continue
      const change = itemsChange(at.category, at.listing, p.items)
      if (!change || change.lines.length === 0) continue
      const note = [BEFORE, change.lines.join('\n'), ...(change.held.length ? [`Not changed:\n${change.held.join('\n')}`] : []), ...(p.note ? [`The read says: ${p.note}`] : [])].join('\n\n')
      plan.filings.push({ op: 'update', listingId: at.listing.id, submission: change.submission, note })
      continue
    }
    if (p.kind === 'fields') {
      if (!p.listingId) {
        plan.left.push(which(p.ask, p.asWritten))
        continue
      }
      const at = editable(p.listingId)
      if (!at) continue
      const read = readFieldChanges(at.category, at.listing, p.changes)
      const { submission, lines } = fieldsEdit(at.category, at.listing, read.values)
      const notes = [...read.notes, ...(read.askWhen ? [`Filed as from now on. It may be only once: ${read.askWhen.oneDay}`] : []), ...(read.unread.length ? [`Read but not set:\n${read.unread.join('\n')}`] : [])]
      if (lines.length === 0 && read.notes.length === 0) {
        if (read.unread.length) plan.left.push(`${at.listing.name}: ${read.unread.join('; ')}`)
        continue
      }
      plan.filings.push({ op: 'update', listingId: at.listing.id, submission, note: [BEFORE, lines.join('\n'), notes.length ? `For the admin:\n${notes.join('\n')}` : ''].filter(Boolean).join('\n\n') })
      continue
    }
    if (p.kind === 'new_place') {
      const category = p.category ? ctx.catById.get(p.category) : undefined
      if (!category || !ctx.canAdd || !resolveCapabilities(category.capabilities).add) {
        plan.left.push(`A new place, not filed: ${quoted(p.place.name)}`)
        continue
      }
      const { submission, note } = newPlaceSubmission(category, p.place, p.items)
      const maybe = p.maybe.map((id) => ctx.byId.get(id)?.name).filter(Boolean)
      plan.filings.push({
        op: 'create',
        submission,
        note: ['A new place, from a post sent with “+ Add”, read by AI.', note, maybe.length ? `It may already be in the guide as ${maybe.join(' or ')}.` : ''].filter(Boolean).join('\n\n'),
      })
      continue
    }
    if (p.kind === 'times') {
      if (editable(p.listingId)) plan.times.push(p.listingId)
      continue
    }
    if (p.kind === 'menu') {
      const name = p.listingId ? ctx.byId.get(p.listingId)?.name : null
      plan.left.push(name ? `A menu for ${name}${p.url ? `: ${p.url}` : ''}. Read it from its Main dishes.` : which(p.ask, p.asWritten))
      continue
    }
    if (p.kind === 'ask_others') {
      plan.left.push(`Not sure: ${p.question}`)
      continue
    }
    if (p.kind === 'not_update') {
      plan.left.push(`Not an update${p.note ? `: ${p.note}` : '.'}`)
    }
  }
  if (plan.filings.length === 0 && plan.times.length === 0 && plan.left.length === 0) plan.left.push('Nothing to change was read from it.')
  return plan
}

/** A photo kept with the post, back as the reader takes it. */
async function photoOf(url: string, fetchImpl: typeof fetch): Promise<ReadImage | null> {
  const res = await fetchImpl(url).catch(() => null)
  if (!res?.ok) return null
  const mime = res.headers.get('content-type')?.split(';')[0] || (/\.pdf$/i.test(url) ? 'application/pdf' : 'image/jpeg')
  return { mime, b64: Buffer.from(await res.arrayBuffer()).toString('base64') }
}

/** Reads a sent post and files what it says. Takes it first (claimRead),
 *  so it's read once however many times this is called. A read that fails
 *  stays waiting for another try, and after MAX_ATTEMPTS is left for the
 *  admin as unread. Never throws. */
export async function readAndFile(community: Community, sent: SentMessage, opts: { apiKey: string; fetchImpl?: typeof fetch }): Promise<'filed' | 'left' | 'retry' | 'taken'> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const claimed = await claimRead(sent.id, sent.attempts).catch((err) => {
    reportServerError('[message/file] could not take it:', err)
    return null
  })
  if (!claimed) return 'taken'
  const started = Date.now()
  const filed: SubmissionRow[] = []
  try {
    const [listings, categories] = await Promise.all([listApprovedResources(community.slug), listCategories(community.slug)])
    const live = categories.filter((c) => c.active !== false)
    const byId = new Map(listings.map((l) => [l.id, l]))
    const catById = new Map(live.map((c) => [c.id, c]))
    const contributions = contributionsFor(community.ui)
    const images = (await Promise.all(claimed.photoUrls.map((u) => photoOf(u, fetchImpl)))).filter((x): x is ReadImage => !!x)
    const reading = await readMessage({ text: claimed.text, images }, buildCatalog(listings, live), {
      apiKey: opts.apiKey,
      communityName: community.name,
      about: claimed.listingId && byId.has(claimed.listingId) ? claimed.listingId : undefined,
      effort: BACKGROUND_EFFORT,
      fetchImpl,
    })
    const plan = planFiling(reading.proposals, { byId, catById, canAdd: contributions.add, canEdit: contributions.edit })

    const source = messageSource(claimed.text, claimed.photoUrls)
    const by = claimed.email ? { email: claimed.email } : null
    for (const f of plan.filings) {
      const submission = Object.assign({}, f.submission, { source })
      filed.push(
        f.op === 'update'
          ? await submitListingUpdate(community.slug, f.listingId, submission, f.note, by)
          : await submitListingCreate(community.slug, Object.assign(submission, { submittedBy: by ?? undefined }), f.note),
      )
    }

    // A shul's times: read again by the shul card's own week reader, and
    // filed as its "Update their times" files them.
    for (const id of plan.times.slice(0, 2)) {
      const listing = byId.get(id)!
      const category = catById.get(listing.category)!
      const key = category.detailFields.find((f) => f.type === 'minyanim')?.key
      if (!key) continue
      const first = images[0]
      const from = first && !claimed.text ? (first.mime === 'application/pdf' ? { pdf: first.b64 } : { image: first.b64, mime: first.mime }) : { text: claimed.text || '(see photo)' }
      const update = cleanUpdate((await readShulWeek(listing, key, from, opts.apiKey, { where: community })).update)
      if (!update || !(changesAnything(update) || (update.kind === 'week' && readAnything(update)))) {
        plan.left.push(`No davening times read for ${listing.name}.`)
        continue
      }
      const applied = applyUpdate(regularMinyanim(listing[key]), readSchedules(listing[schedulesKey(key)]), update, { evenIfSame: true, keepBefore: dayInTimezone(community.timezone, Date.now()) })
      const note = [BEFORE, update.kind === 'week' ? 'Times for particular days.' : `${update.season ? `Their ${update.season} schedule.` : 'Their schedule.'}`, applied.changes.join('\n')].join('\n\n')
      filed.push(
        await submitListingUpdate(
          community.slug,
          id,
          Object.assign(editSubmission(category, listing, { [key]: applied.minyanim, [schedulesKey(key)]: applied.schedules }), { source }),
          note,
          by,
        ),
      )
    }

    await finishRead(claimed.id, filed.map((f) => f.id), plan.left)
    for (const s of filed) await sendSubmissionNotification(s).catch((err) => reportServerError('[message/file] admin notification failed:', err))
    await saveMessageReadTime({
      community: community.slug,
      ms: Date.now() - started,
      modelMs: reading.ms,
      model: reading.model,
      effort: reading.effort,
      photos: images.length,
      proposals: reading.proposals.length,
      followUps: plan.times.length,
      usage: reading.usage,
    })
    return plan.left.length ? 'left' : 'filed'
  } catch (err) {
    reportServerError('[message/file] not read:', err instanceof Error ? err.message : err)
    // Whatever was filed before it failed stays filed and is said; the
    // rest is the admin's once the tries run out.
    const last = claimed.attempts >= MAX_ATTEMPTS
    if (filed.length || last) {
      await finishRead(claimed.id, filed.map((f) => f.id), [filed.length ? 'The read stopped part way. Check the post for anything else.' : 'The AI couldn’t read it.']).catch((e) =>
        reportServerError('[message/file] could not save the failure:', e),
      )
      return 'left'
    }
    return 'retry'
  }
}
