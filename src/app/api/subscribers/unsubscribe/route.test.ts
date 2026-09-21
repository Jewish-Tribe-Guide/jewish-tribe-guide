import { beforeEach, describe, expect, it, vi } from 'vitest'

const del = vi.hoisted(() => vi.fn())
vi.mock('@/lib/subscriberStore', () => ({ deleteSubscriberByToken: del }))

const { GET } = await import('./route')
const get = (qs: string) => GET(new Request(`http://x/api/subscribers/unsubscribe${qs}`))

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  del.mockResolvedValue(undefined)
})

describe('GET /api/subscribers/unsubscribe', () => {
  it('400s a link with no token, deleting nothing', async () => {
    const res = await get('')
    expect(res.status).toBe(400)
    expect(del).not.toHaveBeenCalled()
  })

  it('deletes by token and answers with an HTML confirmation', async () => {
    const res = await get('?token=abc')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(await res.text()).toContain("You're unsubscribed")
    expect(del).toHaveBeenCalledWith('abc')
  })

  it('gives the same confirmation for a token that no longer matches (a second click)', async () => {
    del.mockResolvedValue(false)
    expect((await get('?token=gone')).status).toBe(200)
  })

  it('502s with an HTML message when the delete fails', async () => {
    del.mockRejectedValue(new Error('db down'))
    const res = await get('?token=abc')
    expect(res.status).toBe(502)
    expect(await res.text()).toContain('Something went wrong')
  })

  it('never reflects the token into the page', async () => {
    const res = await get('?token=%3Cscript%3Ealert(1)%3C/script%3E')
    expect(await res.text()).not.toContain('<script>')
  })
})
