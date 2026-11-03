// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { resetTodo, useTodo, useTodoCount } from './useTodo'

// Asked for again at once, not every 6s, so the test needn't wait.
vi.mock('@/components/admin/useWatchJobs', async (orig) => ({ ...(await orig<typeof import('@/components/admin/useWatchJobs')>()), MENU_READING_POLL_MS: 20 }))

// The nav's one number: what To do holds, and the setup steps left (board
// "Setup" draws "3" beside To do with nothing else waiting).

function answer(setup: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.includes('/api/admin/setup')
        ? setup === null
          ? { ok: false, errors: ['down'] }
          : { ok: true, setup }
        : url.includes('/api/admin/submissions')
          ? { ok: true, submissions: [{ id: 's1', operation: 'create', target_type: 'listing', target_id: null, created_at: '2026-11-01T12:00:00Z', payload: { name: 'Shalom Pizzeria' } }] }
          : { ok: true, responses: [], searches: [], readings: [], addable: [] }
      return new Response(JSON.stringify(body), { status: setup === null && url.includes('/setup') ? 502 : 200 })
    }),
  )
}

afterEach(() => {
  resetTodo()
  vi.unstubAllGlobals()
})

describe('useTodoCount', () => {
  it('counts the setup steps left with what there is to decide', async () => {
    answer({ logo: true, admins: 2, categories: 0, places: 0, heroWords: false })
    const { result } = renderHook(() => useTodoCount('tok', 'newtown'))
    await waitFor(() => expect(result.current).toBe(3))
  })

  it('counts no setup once it is done, or when it could not be read', async () => {
    answer({ logo: true, admins: 2, categories: 1, places: 1, heroWords: true })
    const done = renderHook(() => useTodoCount('tok', 'philly'))
    await waitFor(() => expect(done.result.current).toBe(1))
    done.unmount()
    resetTodo()

    answer(null)
    const failed = renderHook(() => useTodoCount('tok', 'philly'))
    await waitFor(() => expect(failed.result.current).toBe(1))
  })
})

// The user, Nov 2: "Why does it take so long to add menu". A menu link
// given is read after the reply, so To do asks for the food places again
// until its reading is in, and shows it without a reload.
describe('a menu being read', () => {
  it('is asked for again until its reading is in, then no more', async () => {
    let asked = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const status = url.includes('/api/admin/main-dishes') && ++asked >= 3 ? 'proposed' : 'reading'
        const body = url.includes('/api/admin/main-dishes')
          ? { ok: true, places: [{ id: 'p1', name: 'Rita’s', href: '/x', website: null, menuUrl: 'https://rita.example/menu', dishes: [], reading: { status, readAt: '2026-11-02T12:00:00Z', dishes: [] } }] }
          : { ok: true, submissions: [], responses: [], places: [] }
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )
    const { result } = renderHook(() => useTodo('tok', 'philly'))
    await waitFor(() => expect(result.current.data?.jobs?.dishes?.[0].reading?.status).toBe('proposed'))
    const settled = asked
    await new Promise((r) => setTimeout(r, 120))
    expect(asked).toBe(settled)
  })
})
