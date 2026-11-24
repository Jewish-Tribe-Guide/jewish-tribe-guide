import { expect, test, type Locator, type Request as PwRequest } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { madeByTests } from '../e2e/testMadePages'
import { WRITE_SUITE_COMMUNITY } from '../scripts/writeSuiteCommunity.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// A category page opens from the list without waiting on the server (the
// user, Nov 9: "still was delay after clicking food category page in
// admin"). Each page's address is rendered on the server the first time it
// is opened after a deploy, 0.7–1.4s on a preview, and the click waited for
// it. The list now loads its rows' addresses behind it, so a click is
// answered from what's already here.
//
// Only a production build shows this: next dev renders every navigation on
// demand. It reads no timings, which a shared runner makes flaky; it checks
// that the click asks the server for nothing.
// ─────────────────────────────────────────────────────────────────────────────

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const isRsc = (r: PwRequest) => r.headers()['rsc'] === '1' || new URL(r.url()).searchParams.has('_rsc')

// Marks, in the page, when the router has read the whole of a prefetch of
// `path`, and tracks every prefetch under the category list until it has
// been read: its body is piped through a stream that counts it done as it
// ends. The Response is kept (its url and headers are read too); only its
// body is swapped.
//
// Every prefetch, not just `path`'s: Next asks for each row's outline
// (`/_tree`), but for the page's content segment once, under whichever row
// asks first, and every row shares it. A click while that one is still
// arriving asks the server (CI, Nov 19: the shared segment requested under
// `cat:whatsapp` at 02.293 and read in 148ms, the click on Cemetery at
// 02.323). So the click waits until nothing under the list is arriving and
// nothing new has started for a moment.
function watchPrefetchesOf(path: string) {
  const w = window as unknown as { __prefetchRead?: number; __prefetching?: number; __prefetchQuietSince?: number }
  w.__prefetchRead = 0
  w.__prefetching = 0
  w.__prefetchQuietSince = Date.now()
  const under = path.slice(0, path.lastIndexOf('/') + 1)
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    const url = new URL(req.url, location.href)
    const watched = url.pathname.startsWith(under) && url.searchParams.has('_rsc') && req.headers.get('next-router-prefetch') === '1'
    if (watched) w.__prefetching! += 1
    let res: Response
    try {
      res = await realFetch(input, init)
    } catch (err) {
      if (watched) ((w.__prefetching! -= 1), (w.__prefetchQuietSince = Date.now()))
      throw err
    }
    if (!watched) return res
    const done = () => {
      w.__prefetching! -= 1
      w.__prefetchQuietSince = Date.now()
      if (url.pathname === path) w.__prefetchRead! += 1
    }
    if (!res.body) {
      done()
      return res
    }
    const body = res.body.pipeThrough(new TransformStream({ flush: done }))
    Object.defineProperty(res, 'body', { value: body, configurable: true })
    return res
  }
}

test('a category page opens from the list without asking the server', async ({ page }) => {
  const visible = (l: Locator) => l.and(page.locator(':visible'))
  // A page with places on it, by its name in the list.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: rows } = await supabase.from('category').select('id, plural_label').eq('community_id', WRITE_SUITE_COMMUNITY).eq('kind', 'listing').order('plural_label')
  // Never one a test made (e2e/testMadePages.ts): picked first
  // alphabetically, `cache-roundtrip-seed` was mid-rename under the click
  // (PR 389's CI, Nov 16), and admin-write's own pages come and go.
  const target = rows!.find((r) => !madeByTests(r))!
  expect(target, 'a category no test made').toBeTruthy()
  const path = `/${WRITE_SUITE_COMMUNITY}/admin/categories/cat:${target.id}`

  // Its address, loaded behind the list. Without that there's nothing to
  // wait for, and the click below is what fails.
  //
  // Loaded means read, not sent. A navigation uses a prefetched route only
  // once Next has stored it (`EntryStatus.Fulfilled`, segment-cache/
  // navigation.js); one still arriving counts as none, and the click asks
  // the server. Waiting on the response matched its headers, so on a cold
  // CI server, where the route rendered in 132ms, the click landed 64ms in
  // and asked (Cemetery, Nov 17, on main's CI and PR 392's). Next stores the
  // route in microtasks after the last byte is read, so one task after
  // that, it's there.
  await page.addInitScript(watchPrefetchesOf, path)
  await page.goto(`/${WRITE_SUITE_COMMUNITY}/admin/categories`)
  const row = visible(page.getByRole('button', { name: new RegExp(escape(target.plural_label)) })).first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  // Polled with evaluate: the site's CSP refuses waitForFunction's string
  // eval, so that never sees the flag.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = window as unknown as { __prefetchRead?: number; __prefetching?: number; __prefetchQuietSince?: number }
          return (w.__prefetchRead ?? 0) > 0 && w.__prefetching === 0 && Date.now() - (w.__prefetchQuietSince ?? 0) > 500
        }),
      { message: `the list loads ${path} behind it, and nothing more is arriving`, timeout: 20_000 },
    )
    .toBe(true)
  await page.evaluate(() => new Promise((done) => setTimeout(done, 0)))

  const asked: string[] = []
  page.on('request', (r) => {
    if (isRsc(r) && new URL(r.url()).pathname === path) asked.push(r.url())
  })
  await row.click()
  await expect(visible(page.getByRole('heading', { name: target.plural_label }))).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${escape(path)}$`))
  expect(asked).toEqual([])
})
