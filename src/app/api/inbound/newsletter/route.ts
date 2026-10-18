import { timingSafeEqual } from 'node:crypto'
import { listCommunities } from '@/lib/communityStore'
import { receiveNewsletter, type NewsletterEmail } from '@/lib/newsletterRun'

// POST /api/inbound/newsletter   Authorization: Bearer <NEWSLETTER_SECRET>
//   { community, messageId, from, subject, date?, text, attachment?: { mime, b64 } }
// A shul's newsletter, sent by the Google Apps Script in the guide's own
// Gmail (scripts/newsletter-apps-script.js), one email a request
// (newsletter.ts has the rules; newsletterRun.ts reads and files it).
//
// Answers with what became of it, for the script: `unlinked` (a sender no
// one has tied to a shul yet) and any error leave the email in the inbox to
// be sent again; everything else is done with.
//
// Auth: NEWSLETTER_SECRET, its own secret rather than CRON_SECRET, since it
// lives in a script in a Gmail account. Without one the route is closed,
// everywhere: it files suggestions and spends model calls.

export const maxDuration = 60

const MAX_TEXT = 200_000
const MAX_ATTACHMENT_B64 = 4_000_000

function authorized(request: Request): boolean {
  const secret = process.env.NEWSLETTER_SECRET
  if (!secret) return false
  const sent = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const a = Buffer.from(sent)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

export async function POST(request: Request) {
  if (!process.env.NEWSLETTER_SECRET)
    return Response.json(
      {
        ok: false,
        error: 'Newsletters aren’t set up here (NEWSLETTER_SECRET).',
      },
      { status: 503 },
    )
  if (!authorized(request)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return Response.json({ ok: false, error: 'Reading isn’t available here (OPENAI_API_KEY).' }, { status: 503 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  const community = (await listCommunities()).find((c) => c.slug === body.community)
  if (!community) return Response.json({ ok: false, error: 'No such community.' }, { status: 400 })

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
    subject: str(body.subject, 500),
    date,
    text: str(body.text, MAX_TEXT),
    attachment,
  }

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
