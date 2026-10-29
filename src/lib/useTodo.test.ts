// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { resetTodo, useTodoCount } from './useTodo'

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
          ? { ok: true, submissions: [{ id: 's1' }] }
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
