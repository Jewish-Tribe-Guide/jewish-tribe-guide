import { afterEach, describe, expect, it, vi } from 'vitest'

// A real browser is never opened here: the reader's check that it's
// running at all, and what a drawn page may do (renderPage.ts).
const launch = vi.hoisted(() => vi.fn())
vi.mock('playwright-core', () => ({ chromium: { launch } }))

const { isChallenge, pageRenderer, requestAllowed } = await import('./renderPage')

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
})
