// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { makeListing } from '@/test/providerFixtures'
import { PreviewSendProvider, previewListing, useFetchOrPreview } from './previewSend'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useFetchOrPreview', () => {
  it('is fetch on the real site, and never asks for the preview’s answer', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true,"real":1}'))
    vi.stubGlobal('fetch', fetchMock)
    const inPreview = vi.fn(() => ({ url: 'blob:x' }))
    const { result } = renderHook(() => useFetchOrPreview())
    const res = await result.current('/api/votes', { method: 'POST' }, inPreview)
    expect(await res.json()).toEqual({ ok: true, real: 1 })
    expect(fetchMock).toHaveBeenCalledWith('/api/votes', { method: 'POST' })
    expect(inPreview).not.toHaveBeenCalled()
  })

  it('in the preview answers as the route would have, and makes no request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = ({ children }: { children: ReactNode }) => <PreviewSendProvider listing={() => {}}>{children}</PreviewSendProvider>
    const { result } = renderHook(() => useFetchOrPreview(), { wrapper })
    expect(await (await result.current('/api/resource/x/confirm', { method: 'POST' })).json()).toEqual({ ok: true })
    expect(await (await result.current('/api/votes', { method: 'POST' }, { count: 3, voted: true })).json()).toEqual({ ok: true, count: 3, voted: true })
    expect(await (await result.current('/api/x', { method: 'POST' }, () => ({ url: 'blob:x' }))).json()).toEqual({ ok: true, url: 'blob:x' })
    // An AI read refuses, as the route does.
    const read = await result.current('/api/schedule/read', { method: 'POST' }, { ok: false, error: 'No.' })
    expect(await read.json()).toEqual({ ok: false, error: 'No.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('previewListing', () => {
  const payload = {
    category: 'restaurant',
    name: 'Sweet Box Bakery',
    anchorId: 'all',
    distance: null,
    address: '339 S 13th St',
    phone: '(267) 606-6613',
    details: { website: 'https://sweetboxbakery.com', placeId: 'abc', googleAutofill: { name: 'Sweet Box' }, businessStatus: 'OPERATIONAL' },
    geo: { lat: 39.9, lng: -75.2 },
  }

  it('lays an edit over the listing it edits, keeping what the form doesn’t carry', () => {
    const existing = makeListing({ id: 'sweet-box', category: 'restaurant', name: 'Sweet Box', phone: '(267) 975-1711', confirmedAt: '2026-10-01T00:00:00Z' })
    const l = previewListing(payload, existing)
    expect(l).toMatchObject({ id: 'sweet-box', name: 'Sweet Box Bakery', phone: '(267) 606-6613', website: 'https://sweetboxbakery.com', placeId: 'abc', confirmedAt: '2026-10-01T00:00:00Z', geo: { lat: 39.9, lng: -75.2 } })
    // The server's Google bookkeeping isn't the listing.
    expect(l).not.toHaveProperty('googleAutofill')
    expect(l).not.toHaveProperty('businessStatus')
  })

  it('gives an add an id of its own', () => {
    expect(previewListing(payload).id).toMatch(/^preview-/)
  })
})

// The preview's promise holds only while every send on the directory page
// goes through useFetchOrPreview (or useListingSubmit, which checks the
// preview itself). A new button on a listing that calls `fetch` directly
// would send for real from the admin console, and nothing else would say so.
// So every component outside the admin console that still calls bare
// `fetch` is listed here with why that's safe; a new one fails until it is
// either moved onto useFetchOrPreview or added with its reason. Helpers in
// src/lib that send (submitRequest: the intake forms; askReader: the Map's
// search) aren't on a category page's listings; this covers components.
const BARE_FETCH_ALLOWED: Record<string, string> = {
  'src/components/resources/useListingSubmit.ts': 'checks the preview before either of its sends',
  'src/components/TellUsSheet.tsx': 'reads the guide’s listings only (its sends use useFetchOrPreview)',
  'src/components/intake/SchedulesInput.tsx': 'reads the festival dates',
  'src/components/resources/EruvInfo.tsx': 'reads the eruv status',
  'src/components/resources/TagsInput.tsx': 'reads a tag group',
  'src/components/resources/WalkList.tsx': 'reads a category’s listings',
  'src/components/resources/useMenuRead.ts': 'reads a menu link; ListingEditor turns it off in the preview',
  'src/components/ManageSubscriptionForm.tsx': 'its own page, not in the preview',
  'src/components/home/SubscribeSection.tsx': 'the home page, not in the preview',
  'src/components/auth/MagicLinkLogin.tsx': 'sign-in, not in the preview',
  'src/components/RefreshContentOnReturn.tsx': 'reads the content version, a GET that changes nothing',
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return path === 'src/components/admin' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('sends on the site go through the preview check', () => {
  it('lists every component that calls fetch directly, with why it’s safe in the preview', () => {
    const bare = sourceFiles('src/components').filter((p) => /(^|[^\w.])fetch\(/m.test(readFileSync(p, 'utf-8')))
    expect(bare.sort()).toEqual(Object.keys(BARE_FETCH_ALLOWED).sort())
  })
})
