import { describe, expect, it } from 'vitest'
import { findEruvStatusPages } from './eruvFind'
import type { StatusWrite } from './eruvStore'

const AT = '2026-10-23T18:00:00.000Z'
const home = (body: string) => async (url: string) => ({ url, body })
const said = (pages: Record<string, StatusWrite>) => async (url: string) => pages[url] ?? { ok: false as const, error: 'answered 404', at: AT }

describe('findEruvStatusPages', () => {
  it('offers the pages that say the eruv is up or down, with what they say', async () => {
    const r = await findEruvStatusPages('https://eruv.example.org/', {
      fetchHome: home('<a href="/status">Eruv Status</a><a href="/about">About the Eruv</a>'),
      readPage: said({
        'https://eruv.example.org/': { ok: true, status: 'unknown', words: null, postedOn: null, at: AT },
        'https://eruv.example.org/status': { ok: true, status: 'up', words: 'The eruv is up this Shabbos.', postedOn: null, at: AT },
        'https://eruv.example.org/about': { ok: true, status: 'down', words: 'The eruv is down.', postedOn: null, at: AT },
      }),
    })
    expect(r).toEqual({
      found: [
        { url: 'https://eruv.example.org/status', link: 'Eruv Status', status: 'up', words: 'The eruv is up this Shabbos.' },
        { url: 'https://eruv.example.org/about', link: 'About the Eruv', status: 'down', words: 'The eruv is down.' },
      ],
    })
  })

  it('a page that won’t open, or that throws, is left out rather than stopping the search', async () => {
    const r = await findEruvStatusPages('https://eruv.example.org/', {
      fetchHome: home('<a href="/status">Status</a><a href="/updates">Updates</a>'),
      readPage: async (url) => {
        if (url.endsWith('/updates')) throw new Error('socket hang up')
        return { ok: false, error: 'answered 500', at: AT }
      },
    })
    expect(r).toEqual({ found: [] })
  })

  it('says why the website didn’t open', async () => {
    const r = await findEruvStatusPages('https://yiep.example.org/', { fetchHome: async () => ({ error: 'answered 404' }) })
    expect(r).toEqual({ error: 'answered 404' })
  })
})
