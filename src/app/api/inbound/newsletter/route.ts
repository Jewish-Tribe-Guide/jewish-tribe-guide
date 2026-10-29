import { timingSafeEqual } from 'node:crypto'
import { listCommunities } from '@/lib/communityStore'
import { newsletterSenders, receiveNewsletter, type NewsletterEmail } from '@/lib/newsletterRun'
import { receiveEruvEmail } from '@/lib/eruvEmailRun'
import { senderEmail } from '@/lib/eruvEmail'
import { communityOfNewsletterKey, recordNewsletterCheck } from '@/lib/newsletterSetupStore'

// POST /api/inbound/newsletter   Authorization: Bearer <key>
//   { community, messageId, from, list?, subject, date?, text, attachment?: { mime, b64 } }
// `list` is the mailing list it came through (its List-Post address), when
// it did: a list's emails are from whoever posted them.
// A shul's newsletter, sent by the Google Apps Script in the guide's own
// Gmail (scripts/newsletter-apps-script.js), one email a request
// (newsletter.ts has the rules; newsletterRun.ts reads and files it).
//
// Answers with what became of it, for the script: `unknown`, `unlinked`
// and any error leave the email to be sent again; everything else is done
// with.
//
// An eruv's status email comes in the same way (eruvEmail.ts): from the
// sender an admin gave the eruv, it's read for up or down by code alone, so
// it needs no OPENAI_API_KEY, and goes live at once.
//
// GET /api/inbound/newsletter?community=philly   (the same key)
//   X-Guide-Account: the Gmail the script runs in
//   → { senders: ['office@shul.org', …] }
// Whose emails to send: the script asks first and searches the inbox for
// just those (watchedSenders, and the eruvim's senders), so nothing else
// leaves it. It asks every hour, so the asking is recorded too: the
// Newsletters page's "Last checked" (newsletterSetupStore.ts).
//
// The key: the community's own (newsletter_setup, migration 090), in the
// script the admin console hands out, good for that community alone; or
// NEWSLETTER_SECRET, good for every community, which a script set up
// before Oct 29 carries. Its own keys rather than CRON_SECRET, since they
// live in a script in a Gmail account. Without either the route is closed:
// it files suggestions and spends model calls.

export const maxDuration = 60

const MAX_TEXT = 200_000
const MAX_ATTACHMENT_B64 = 4_000_000

function sameSecret(sent: string, secret: string): boolean {
  const a = Buffer.from(sent)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Who the key is good for: every community (NEWSLETTER_SECRET), the one
 *  whose own key it is, or no one. */
async function keyHolder(request: Request): Promise<'every' | string | null> {
  const sent = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? ''
  if (!sent) return null
  const secret = process.env.NEWSLETTER_SECRET
  if (secret && sameSecret(sent, secret)) return 'every'
  return communityOfNewsletterKey(sent)
}

const unauthorized = () => Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
const mayActFor = (holder: string, community: string) => holder === 'every' || holder === community

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

/** The Gmail the script says it runs in, if it looks like an address. */
function accountOf(request: Request): string | null {
  const said = request.headers.get('x-guide-account')?.trim().toLowerCase().slice(0, 254) ?? ''
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(said) ? said : null
}

export async function GET(request: Request) {
  const holder = await keyHolder(request)
  if (!holder) return unauthorized()
  const slug = new URL(request.url).searchParams.get('community')
  const community = (await listCommunities()).find((c) => c.slug === slug)
  if (!community) return Response.json({ ok: false, error: 'No such community.' }, { status: 400 })
  if (!mayActFor(holder, community.slug)) return unauthorized()
  await recordNewsletterCheck(community.slug, accountOf(request))
  try {
    return Response.json({ ok: true, senders: await newsletterSenders(community.slug) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[inbound/newsletter] senders failed:', err)
    return Response.json({ ok: false, error: 'Couldn’t list the senders.' }, { status: 502 })
  }
}

export async function POST(request: Request) {
  const holder = await keyHolder(request)
  if (!holder) return unauthorized()

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  const community = (await listCommunities()).find((c) => c.slug === body.community)
  if (!community) return Response.json({ ok: false, error: 'No such community.' }, { status: 400 })
  if (!mayActFor(holder, community.slug)) return unauthorized()

  const messageId = str(body.messageId, 300)
  const from = str(body.from, 300)
  if (!messageId || !from) return Response.json({ ok: false, error: 'Missing messageId or from.' }, { status: 400 })
  const date = typeof body.date === 'string' && !Number.isNaN(Date.parse(body.date)) ? new Date(body.date).toISOString() : null
  const a = body.attachment as Record<string, unknown> | null | undefined
  const attachment =
    a && typeof a.mime === 'string' && typeof a.b64 === 'string' && a.b64.length <= MAX_ATTACHMENT_B64 && /^[A-Za-z0-9+/=\s]+$/.test(a.b64.slice(0, 1000))
      ? { mime: a.mime, b64: a.b64 }
      : null
  const email: NewsletterEmail = {
    messageId,
    from,
    list: senderEmail(str(body.list, 300)),
    subject: str(body.subject, 500),
    date,
    text: str(body.text, MAX_TEXT),
    attachment,
  }

  try {
    const eruv = await receiveEruvEmail(community.slug, email, { timezone: community.timezone })
    if (eruv) return Response.json({ ok: true, ...eruv })
  } catch (err) {
    console.error('[inbound/newsletter] eruv email failed:', err)
    return Response.json({ ok: false, error: err instanceof Error ? err.message : 'Couldn’t read it.' }, { status: 502 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return Response.json({ ok: false, error: 'Reading isn’t available here (OPENAI_API_KEY).' }, { status: 503 })
  try {
    const result = await receiveNewsletter(community.slug, email, {
      apiKey,
      communityName: community.name,
    })
    return Response.json({ ok: true, ...result })
  } catch (err) {
    console.error('[inbound/newsletter] failed:', err)
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Couldn’t read it.',
      },
      { status: 502 },
    )
  }
}
