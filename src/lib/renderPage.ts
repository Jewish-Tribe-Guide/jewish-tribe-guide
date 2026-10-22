import { isGuidePage } from './guidePage'
import { dnsLookup, htmlToText, isOrderingApp, MENU_FETCH_HEADERS, publicUrl, refusal, type Lookup, type Render, type Trouble } from './menuReader'

// ── Drawing a page as a browser does (the user, Oct 20) ─────────────────────
// Some places' own sites send an empty page and a program that draws the
// menu once it runs in the visitor's browser (Insomnia, Center City
// Pretzel, Mike's Chicken). The menu reader downloads the page but never
// runs the program, so it saw nothing. This opens such a page in a real
// (headless) Chromium, waits for it to draw, and hands back what it drew.
//
// Only as a fallback: the menu reader asks for it only when a page came back
// with almost no words and no menu pictures (findMenus, readMenuPage). A
// browser costs seconds and memory a plain fetch doesn't.
//
// Never a way round a block: an ordering app's page is never opened (not
// even when a site sends the browser there), and a "prove you're a person"
// page is given up on, not answered. Every request the page makes goes
// through the same check as the reader's own fetches (publicUrl): a page's
// script can't reach a private address. Pictures, video and fonts aren't
// loaded; nothing is downloaded; nothing is kept.
//
// On Vercel the browser is @sparticuz/chromium (a Chromium built for
// serverless functions, matching Playwright's version); anywhere else,
// Playwright's own (`npx playwright install chromium`, as the e2e suites
// use). MENU_RENDER=off turns it off.

/** How long one page may take to draw, start to finish. */
export const RENDER_TIMEOUT_MS = 15_000
/** How long to let a page settle once it has loaded. */
const SETTLE_MS = 4_000

const CHALLENGE = /just a moment|verify (that )?you are (a )?human|checking (if the site connection is secure|your browser)|attention required|are you a robot|enable javascript and cookies to continue|press (&|and) hold/i

/** A "prove you're a person" page (Cloudflare's and the like): given up on,
 *  never answered. By its title, or its words when it has few: a real page
 *  that mentions "just a moment" somewhere isn't one. */
export function isChallenge(title: string, html: string): boolean {
  if (CHALLENGE.test(title)) return true
  const text = htmlToText(html)
  return text.length < 1_500 && CHALLENGE.test(text)
}

/** Whether a drawn page may make a request: never a picture, video or font
 *  (the words are what's read), never anything off the public internet,
 *  and never a move to an ordering app. */
export async function requestAllowed(url: string, kind: string, navigation: boolean, resolve: Lookup): Promise<boolean> {
  if (['image', 'media', 'font'].includes(kind)) return false
  if (url.startsWith('data:') || url.startsWith('blob:')) return true
  if (navigation && isOrderingApp(url)) return false
  return !!(await publicUrl(url, resolve))
}

type Browser = import('playwright-core').Browser

async function launch(): Promise<Browser> {
  const { chromium } = await import('playwright-core')
  if (process.env.VERCEL) {
    const serverless = (await import('@sparticuz/chromium')).default
    return chromium.launch({ args: serverless.args, executablePath: await serverless.executablePath(), headless: true })
  }
  return chromium.launch({ headless: true })
}

/** Why a page couldn't be drawn, from what the browser threw: a timeout,
 *  or its first line, short (the admin reads it in a note). */
export function drawTrouble(err: unknown): Trouble {
  if (err instanceof Error && err.name === 'TimeoutError') return { why: 'draw_timeout' }
  const line = (err instanceof Error ? err.message : String(err)).split('\n')[0].trim()
  return { why: 'draw_failed', detail: line.length > 80 ? `${line.slice(0, 79)}…` : line || 'no reason given' }
}

/** A browser for drawing pages, opened on first use and kept for the rest
 *  of a request (findMenus may draw a home page and a menu page). Always
 *  `close()` it. `render` is null when it's turned off; it tells `trouble`
 *  why a page couldn't be drawn. */
export function pageRenderer(opts: { resolve?: Lookup } = {}): { render: Render | null; close: () => Promise<void> } {
  if (process.env.MENU_RENDER === 'off') return { render: null, close: async () => {} }
  const resolve = opts.resolve ?? dnsLookup
  let browser: Promise<Browser> | null = null
  const render: Render = async (url, trouble) => {
    const fail = (t: Trouble) => {
      trouble?.(t)
      return null
    }
    if (isOrderingApp(url)) return fail({ why: 'ordering_app' })
    if (!(await publicUrl(url, resolve))) return fail({ why: 'not_public' })
    if (isGuidePage(url)) return fail({ why: 'guide_page' })
    let context: Awaited<ReturnType<Browser['newContext']>> | null = null
    try {
      browser ??= launch()
      context = await (await browser).newContext({
        userAgent: MENU_FETCH_HEADERS['user-agent'],
        serviceWorkers: 'block',
        acceptDownloads: false,
        javaScriptEnabled: true,
      })
      await context.route('**/*', async (route) => {
        const request = route.request()
        return (await requestAllowed(request.url(), request.resourceType(), request.isNavigationRequest(), resolve)) ? route.continue() : route.abort()
      })
      await context.routeWebSocket(/.*/, (ws) => ws.close())
      const page = await context.newPage()
      const deadline = Date.now() + RENDER_TIMEOUT_MS
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS })
      // A site can let the reader's plain fetch in and turn a browser away.
      if (response && response.status() >= 400) return fail(refusal(response.status()))
      await page.waitForLoadState('networkidle', { timeout: Math.max(0, Math.min(SETTLE_MS, deadline - Date.now())) }).catch(() => {})
      const finalUrl = page.url()
      if (isOrderingApp(finalUrl)) return fail({ why: 'ordering_app' })
      if (!(await publicUrl(finalUrl, resolve))) return fail({ why: 'not_public' })
      if (isGuidePage(finalUrl)) return fail({ why: 'guide_page' })
      const html = await page.content()
      if (isChallenge(await page.title(), html)) return fail({ why: 'person_check' })
      return { url: finalUrl, body: html }
    } catch (err) {
      console.error('[renderPage] couldn’t draw', url, err instanceof Error ? err.message.split('\n')[0] : err)
      return fail(drawTrouble(err))
    } finally {
      await context?.close().catch(() => {})
    }
  }
  return {
    render,
    close: async () => {
      if (browser) await (await browser.catch(() => null))?.close().catch(() => {})
    },
  }
}
