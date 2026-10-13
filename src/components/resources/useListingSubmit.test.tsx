// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { makeCommunity, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { CommunityProvider } from '@/lib/communityContext'
import type { ResourceSubmission } from '@/types'
import { useListingSubmit } from './useListingSubmit'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// Carried over from the old sectioned form's tests (ListingForm.test.tsx)
// when that form was deleted: these are the hook's own behaviours, which
// ListingEditor, BoxEditor and the admin console's direct add all share, so
// they're tested here once rather than through any one of them.

afterEach(() => {
  vi.unstubAllGlobals()
})

const community = makeCommunity()
const wrapper = ({ children }: { children: ReactNode }) => (
  <CommunityProvider community={community} communities={[community]}>
    {children}
  </CommunityProvider>
)

const payload: ResourceSubmission = {
  category: 'grocery',
  name: 'Kosher Mart',
  anchorId: 'all',
  distance: null,
  address: '1 Main St',
  phone: '',
  details: {},
  geo: null,
}

/** fetch answering every call with `status` and `body`, in order; the last
 *  answer repeats. */
function stubFetch(...answers: { status?: number; body: Record<string, unknown> }[]) {
  let call = 0
  const fetchMock = vi.fn().mockImplementation(async () => {
    const { status = 200, body } = answers[Math.min(call++, answers.length - 1)]
    return { ok: status < 400, status, json: async () => body }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const expired = { status: 403, body: { ok: false, code: 'turnstile', errors: ['Verification failed.'] } }
const REFRESHED = /We’ve refreshed it — please tap Submit again/
const KEEPS_FAILING = /Verification keeps failing/

function renderSubmit(options: Partial<Parameters<typeof useListingSubmit>[0]> = {}) {
  const reset = vi.fn()
  const view = renderHook(() => useListingSubmit({ mode: 'create', sharedTurnstile: { token: 'tok', reset }, ...options }), { wrapper })
  const submit = () => act(() => view.result.current.submit(payload))
  return { ...view, reset, submit }
}

describe('useListingSubmit — what it sends', () => {
  it('posts a create to this community’s /api/submissions with the token, the honeypot, and only an email', async () => {
    const fetchMock = stubFetch({ body: { ok: true } })
    const { result, submit } = renderSubmit()
    act(() => result.current.setSubmitterEmail('  neighbor@example.com '))
    await submit()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/submissions?community=test-community')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ operation: 'create', targetType: 'listing', payload, company: '', turnstileToken: 'tok' })
    expect(body.targetId).toBeUndefined()
    expect(body.submittedBy).toEqual({ email: 'neighbor@example.com' })
    expect(result.current.done).toBe(true)
  })

  it('sends an edit as an update against the existing listing’s id, with no submittedBy when no email was given', async () => {
    const fetchMock = stubFetch({ body: { ok: true } })
    const { submit } = renderSubmit({ mode: 'edit', existing: makeListing({ id: 'listing-42' }) })
    await submit()

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.operation).toBe('update')
    expect(body.targetId).toBe('listing-42')
    expect(body).not.toHaveProperty('submittedBy')
  })
})

describe('useListingSubmit — when it’s refused', () => {
  it('shows the server’s own errors and stays on the form', async () => {
    stubFetch({ status: 400, body: { ok: false, errors: ['Name is required.'] } })
    const { result, submit } = renderSubmit()
    await submit()

    expect(result.current.errors).toEqual(['Name is required.'])
    expect(result.current.done).toBe(false)
    expect(result.current.submitting).toBe(false)
  })

  it('re-runs an expired challenge and asks for one more tap, rather than losing the form', async () => {
    stubFetch(expired)
    const { result, reset, submit } = renderSubmit()
    await submit()

    expect(reset).toHaveBeenCalledTimes(1)
    expect(result.current.errors.join(' ')).toMatch(REFRESHED)
    expect(result.current.done).toBe(false)
  })

  // A fresh token failing too means staleness was never the problem, and
  // repeating the same hopeful message is the loop being reported.
  it('stops promising a retry once the refreshed challenge fails as well', async () => {
    stubFetch(expired)
    const { result, reset, submit } = renderSubmit()
    await submit()
    await submit()

    expect(result.current.errors.join(' ')).toMatch(KEEPS_FAILING)
    expect(result.current.errors.join(' ')).not.toMatch(/tap Submit again/)
    expect(reset).toHaveBeenCalledTimes(1)
  })

  // The flag means "the attempt just before this one was a refresh" — a
  // genuine expiry later on, after some other outcome, gets its own retry.
  it('offers the refresh again after something else came back in between', async () => {
    stubFetch(expired, { status: 400, body: { ok: false, errors: ['Name is required.'] } }, expired)
    const { result, submit } = renderSubmit()
    await submit()
    await submit()
    await submit()

    expect(result.current.errors.join(' ')).toMatch(REFRESHED)
  })

  // /api/submissions answers 403 for several unrelated refusals — a
  // contribution type disabled site-wide, a category with edits turned off.
  // Treating those as a stale challenge produced an endless "we've refreshed
  // it, tap Submit again" that no amount of tapping could clear, and hid the
  // reason the server actually gave.
  it('shows the server’s own message for a 403 that isn’t about verification, and doesn’t touch the challenge', async () => {
    stubFetch({ status: 403, body: { ok: false, errors: ['This action is not available for this category.'] } })
    const { result, reset, submit } = renderSubmit()
    await submit()

    expect(result.current.errors).toEqual(['This action is not available for this category.'])
    expect(reset).not.toHaveBeenCalled()
  })

  it('says so when the network fails, and stays on the form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { result, submit } = renderSubmit()
    await submit()

    expect(result.current.errors.join(' ')).toMatch(/Network error/)
    expect(result.current.done).toBe(false)
  })
})
