import { expect, test } from '@playwright/test'
import { defaultCommunity, dismissLocationPrompt, ready, serverMarkup } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// "Share this answer": a question's own page, /philly/ask/<question>, opens
// the home screen with the question asked and has a link preview that
// answers it (see shareAnswer.ts). The question is built from a real item
// on a real listing, so the preview has something true to say whatever the
// data is.
// ─────────────────────────────────────────────────────────────────────────────

type Field = { key: string; type: string }
type Cat = { id: string; kind: string; detailFields?: Field[] }

async function itemQuestion(request: import('@playwright/test').APIRequestContext, community: string): Promise<{ item: string; question: string }> {
  const cats = (await (await request.get(`/api/categories?community=${community}`, { timeout: 45_000 })).json()).categories as Cat[]
  for (const c of cats.filter((x) => x.kind === 'listing')) {
    const tagKeys = (c.detailFields ?? []).filter((f) => f.type === 'tags').map((f) => f.key)
    if (!tagKeys.length) continue
    const body = await (await request.get(`/api/resources?category=${c.id}&community=${community}`, { timeout: 45_000 })).json()
    for (const r of (body.resources ?? []) as Record<string, unknown>[]) {
      for (const k of tagKeys) {
        const tags = r[k]
        // A plain one-or-two-word item, so the question reads naturally.
        const item = Array.isArray(tags) ? (tags as unknown[]).find((t) => typeof t === 'string' && /^[A-Za-z]+( [A-Za-z]+)?$/.test(t)) : undefined
        if (typeof item === 'string') return { item, question: `Where can I get ${item}` }
      }
    }
  }
  throw new Error('No listing has an item to ask about')
}

const pathFor = (community: string, question: string) => `/${community}/ask/${encodeURIComponent(question.toLowerCase().replace(/\s+/g, '-'))}`

test('a shared question’s link preview answers it, and stays out of search engines', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { item, question } = await itemQuestion(request, community)

  const res = await request.get(pathFor(community, question))
  expect(res.status()).toBe(200)
  const html = await res.text()
  const description = html.match(/<meta property="og:description" content="([^"]*)"/)?.[1] ?? ''
  expect(description.toLowerCase()).toContain(item.toLowerCase())
  expect(description).not.toContain('Not in the guide')
  expect(html).toMatch(/<meta property="og:title" content="Where can I get /)
  expect(html).toMatch(/<meta name="robots" content="noindex, follow"/)
  // The answer itself is worked out in the browser (it can depend on the
  // visitor's clock), so the server's markup doesn't claim one.
  expect(serverMarkup(html)).not.toContain('Share this answer')
})

test('a shared question opens already asked, with the answer and its Share button', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { item, question } = await itemQuestion(request, community)

  await page.goto(pathFor(community, question))
  await ready(page)
  await dismissLocationPrompt(page)

  const box = page.getByLabel('Search resources').locator('visible=true').first()
  await expect(box).toHaveValue(question.toLowerCase())
  const answer = page.getByRole('status').filter({ hasText: new RegExp(item, 'i') }).locator('visible=true').first()
  await expect(answer).toBeVisible()
  await expect(answer.getByRole('button', { name: 'Share this answer' })).toBeVisible()
})

test('a link with no readable question opens the plain home page', async ({ page }) => {
  const community = await defaultCommunity(page)
  const res = await page.goto(`/${community}/ask/${'word-'.repeat(30)}`)
  expect(res?.status()).toBe(200)
  await ready(page)
  await dismissLocationPrompt(page)
  await expect(page.getByLabel('Search resources').locator('visible=true').first()).toHaveValue('')
})

test('an unknown community’s shared question is still a 404', async ({ request }) => {
  expect((await request.get('/no-such-community/ask/kosher-wine')).status()).toBe(404)
})
