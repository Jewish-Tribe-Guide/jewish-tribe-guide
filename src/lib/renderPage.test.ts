import { afterEach, describe, expect, it, vi } from 'vitest'

// A real browser is never opened here: the reader's check that it's
// running at all, and what a drawn page may do (renderPage.ts).
const launch = vi.hoisted(() => vi.fn())
vi.mock('playwright-core', () => ({ chromium: { launch } }))

const { drawTrouble, isChallenge, pageRenderer, requestAllowed } = await import('./renderPage')

const publicDns = async () => ['93.184.216.34']

afterEach(() => {
  vi.unstubAllEnvs()
  launch.mockReset()
})

describe('drawing a page as a browser does', () => {
  it('a drawn page’s requests: never pictures, video or fonts, nothing private, no move to an ordering app', async () => {
    expect(await requestAllowed('https://cookies.example/app.js', 'script', false, publicDns)).toBe(true)
    expect(await requestAllowed('https://api.cookies.example/menu.json', 'fetch', false, publicDns)).toBe(true)
    for (const kind of ['image', 'media', 'font']) expect(await requestAllowed('https://cookies.example/x', kind, false, publicDns)).toBe(false)
    expect(await requestAllowed('http://169.254.169.254/latest/meta-data/', 'fetch', false, publicDns)).toBe(false)
    expect(await requestAllowed('https://internal.example/', 'fetch', false, async () => ['10.0.0.5'])).toBe(false)
    expect(await requestAllowed('http://localhost:3000/', 'document', true, publicDns)).toBe(false)
    expect(await requestAllowed('https://www.toasttab.com/cookies', 'document', true, publicDns)).toBe(false)
    expect(await requestAllowed('data:text/css,body{}', 'stylesheet', false, publicDns)).toBe(true)
  })

  it('a “prove you’re a person” page is given up on; a real page that says “just a moment” isn’t one', () => {
    expect(isChallenge('Just a moment...', '<p>x</p>')).toBe(true)
    expect(isChallenge('20th Street Pizza', '<p>Verify you are human by completing the action below.</p>')).toBe(true)
    expect(isChallenge('Insomnia Cookies', `<p>Just a moment while we bake.</p>${'<p>Chocolate chunk cookies, warm and fresh.</p>'.repeat(60)}`)).toBe(false)
  })

  it('never opens a browser for an ordering app or a private address, and not at all when turned off', async () => {
    const { render, close } = pageRenderer({ resolve: async () => ['10.0.0.5'] })
    expect(await render!('https://cookies.example/')).toBeNull()
    expect(await render!('https://www.doordash.com/store/cookies')).toBeNull()
    await close()
    expect(launch).not.toHaveBeenCalled()
    vi.stubEnv('MENU_RENDER', 'off')
    expect(pageRenderer().render).toBeNull()
  })

  // Oct 21: why a page couldn't be drawn, for the admin's note.
  describe('says why a page couldn’t be drawn', () => {
    /** A browser whose one page answers as told. */
    const browser = (answer: { status?: number; goto?: () => Promise<never>; url?: string; title?: string; html?: string }) => {
      const page = {
        goto: answer.goto ?? (async () => ({ status: () => answer.status ?? 200 })),
        waitForLoadState: async () => {},
        url: () => answer.url ?? 'https://cookies.example/',
        content: async () => answer.html ?? '<p>Cookies</p>',
        title: async () => answer.title ?? 'Cookies',
      }
      launch.mockResolvedValue({ newContext: async () => ({ route: async () => {}, routeWebSocket: async () => {}, newPage: async () => page, close: async () => {} }), close: async () => {} })
    }
    const draw = async () => {
      const heard: unknown[] = []
      const { render, close } = pageRenderer({ resolve: publicDns })
      const got = await render!('https://cookies.example/', (t) => void heard.push(t))
      await close()
      return { got, heard }
    }

    it('turned away, sent to an ordering app, asked to prove it’s a person, or too slow', async () => {
      browser({ status: 403 })
      expect(await draw()).toEqual({ got: null, heard: [{ why: 'refused', status: 403 }] })
      browser({ url: 'https://order.toasttab.com/online/cookies' })
      expect(await draw()).toEqual({ got: null, heard: [{ why: 'ordering_app' }] })
      browser({ title: 'Just a moment...' })
      expect(await draw()).toEqual({ got: null, heard: [{ why: 'person_check' }] })
      browser({ goto: async () => { throw Object.assign(new Error('page.goto: Timeout 15000ms exceeded.\nCall log: …'), { name: 'TimeoutError' }) } })
      expect(await draw()).toEqual({ got: null, heard: [{ why: 'draw_timeout' }] })
    })

    it('a page drawn is no trouble', async () => {
      browser({})
      expect(await draw()).toEqual({ got: { url: 'https://cookies.example/', body: '<p>Cookies</p>' }, heard: [] })
    })

    it('the browser’s own error, its first line, short', () => {
      expect(drawTrouble(new Error('browserType.launch: Executable doesn’t exist\nmore'))).toEqual({ why: 'draw_failed', detail: 'browserType.launch: Executable doesn’t exist' })
      expect((drawTrouble(new Error('x'.repeat(200))) as { detail: string }).detail).toHaveLength(80)
    })

    it('an ordering app or a private address is told too, with no browser opened', async () => {
      const heard: unknown[] = []
      const { render } = pageRenderer({ resolve: async () => ['10.0.0.5'] })
      await render!('https://www.doordash.com/store/cookies', (t) => void heard.push(t))
      await render!('https://cookies.example/', (t) => void heard.push(t))
      expect(heard).toEqual([{ why: 'ordering_app' }, { why: 'not_public' }])
      expect(launch).not.toHaveBeenCalled()
    })
  })
})
