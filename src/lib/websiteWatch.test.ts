import { describe, expect, it, vi } from 'vitest'
import { pageHash, pageWords, readWebsite } from './websiteWatch'

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const page = (body: string) => `<html><head><style>.a{color:red}</style><script>var t = ${Math.random()}</script></head><body>${body}</body></html>`

describe('pageWords and pageHash', () => {
  it('keeps only the words a visitor reads', () => {
    expect(pageWords('<p>Mincha&nbsp;<b>6:20 PM</b></p><!-- built 12:01 -->')).toBe('Mincha 6:20 PM')
  })

  // A changed tracking script or stylesheet isn't a change to the times.
  it('gives the same fingerprint when only markup, scripts or styles change', () => {
    expect(pageHash(page('<div><p>Mincha 6:20 PM</p></div>'))).toBe(pageHash(page('<section class="x"><p>Mincha  6:20 PM</p></section>')))
  })

  it('gives a new fingerprint when the words change', () => {
    expect(pageHash(page('<p>Mincha 6:20 PM</p>'))).not.toBe(pageHash(page('<p>Mincha 6:15 PM</p>')))
  })
})

describe('readWebsite', () => {
  // Lower Merion's site refused the guide (406) until it asked like a
  // browser does; Keystone-K's refuses the usual bot form (403).
  it('asks like a browser, names the guide, and never uses the form Keystone-K blocks', async () => {
    const f = vi.fn(async () => new Response(page(`<p>${words(60)}</p>`)))
    await readWebsite('https://x.org/', f as unknown as typeof fetch)
    const headers = (f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>
    expect(headers['user-agent']).toMatch(/^Mozilla\/5\.0 \(Macintosh/)
    expect(headers['user-agent']).toContain('PhillyJewishGuide')
    expect(headers['user-agent']).not.toContain('compatible;')
    expect(headers.accept).toContain('text/html')
  })

  const fetcher = (res: Response | Error) => vi.fn(async () => (res instanceof Error ? Promise.reject(res) : res)) as unknown as typeof fetch

  it('fingerprints a page that loads', async () => {
    const html = page(`<p>${words(60)}</p>`)
    expect(await readWebsite('https://x.org/', fetcher(new Response(html)))).toEqual({ ok: true, filed: 0, pageHash: pageHash(html) })
  })

  it('fails, with the reason, when the page refuses', async () => {
    expect(await readWebsite('https://x.org/', fetcher(new Response('no', { status: 403 })))).toEqual({ ok: false, error: 'The page answered 403' })
  })

  it('fails when the site can’t be reached', async () => {
    const out = await readWebsite('https://x.org/', fetcher(new Error('getaddrinfo ENOTFOUND x.org')))
    expect(out).toMatchObject({ ok: false, error: expect.stringContaining('ENOTFOUND') })
  })

  // A firewall's challenge page or an empty app shell answers 200 with
  // almost nothing in it. Fingerprinting that would call it a change.
  it('fails on a page that came back nearly empty', async () => {
    const out = await readWebsite('https://x.org/', fetcher(new Response(page('<div id="root"></div>'))))
    expect(out).toMatchObject({ ok: false, error: expect.stringContaining('nearly empty') })
  })
})
