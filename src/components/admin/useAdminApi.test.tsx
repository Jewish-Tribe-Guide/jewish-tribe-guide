// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAdminApiFor } from './useAdminApi'

// Supabase hands the admin a new token about once an hour. An api remade
// then remade every load keyed on it, which ran again and put the saved
// values back over a draft (Nov 18 review, 431a5f89 for Home page and
// Feedback). The api is kept; each request reads the latest token.

afterEach(() => vi.unstubAllGlobals())

describe('useAdminApiFor', () => {
  it('is the same api after a new token, and sends the new token', async () => {
    const fetch = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    const { result, rerender } = renderHook(({ token }) => useAdminApiFor(token, 'philly'), { initialProps: { token: 'old' } })
    const first = result.current
    rerender({ token: 'new' })
    expect(result.current).toBe(first)
    await result.current.fetch('/api/admin/site-settings')
    expect(fetch).toHaveBeenCalledWith('/api/admin/site-settings?community=philly', { headers: { Authorization: 'Bearer new' } })
    expect(result.current.token).toBe('new')
  })

  it('is a new api for another community', () => {
    const { result, rerender } = renderHook(({ c }) => useAdminApiFor('t', c), { initialProps: { c: 'philly' } })
    const first = result.current
    rerender({ c: 'ues' })
    expect(result.current).not.toBe(first)
    expect(result.current.url('/api/admin/x')).toBe('/api/admin/x?community=ues')
  })
})
