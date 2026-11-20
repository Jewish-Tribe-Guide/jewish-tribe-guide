import { beforeEach, describe, expect, it, vi } from 'vitest'

const report = vi.hoisted(() => vi.fn())
vi.mock('@/lib/serverError', () => ({ reportServerError: report }))
const { cutAtCap, describeRead, reportingRowCap } = await import('./rowCap')

const BASE = 'https://x.supabase.co/rest/v1'

function answering(contentRange: string | null) {
  return vi.fn(async () => new Response('[]', { headers: contentRange ? { 'content-range': contentRange } : {} }))
}

describe('a read cut off at the row cap', () => {
  beforeEach(() => report.mockClear())

  it('is a full page from a read that asked for no limit', () => {
    expect(cutAtCap(`${BASE}/submission?select=id&community_id=eq.philly`, 'GET', '0-999/*')).toBe(true)
    expect(cutAtCap(`${BASE}/submission?select=id`, 'GET', '0-11/*')).toBe(false)
    // A page readAll asked for is full on purpose.
    expect(cutAtCap(`${BASE}/submission?select=id&offset=0&limit=1000`, 'GET', '0-999/*')).toBe(false)
    expect(cutAtCap(`${BASE}/submission`, 'POST', '0-999/*')).toBe(false)
    expect(cutAtCap(`${BASE}/submission`, 'GET', null)).toBe(false)
  })

  it('is reported with the table and filter names, never their values', async () => {
    const f = reportingRowCap(answering('0-999/*'))
    const res = await f(`${BASE}/submission?select=id&submitted_by->>email=eq.someone@example.com`)
    expect(res.status).toBe(200)
    expect(report).toHaveBeenCalledTimes(1)
    const sent = JSON.stringify(report.mock.calls[0])
    expect(sent).toContain('submission')
    expect(sent).toContain('submitted_by->>email')
    expect(sent).not.toContain('someone@example.com')
  })

  it('leaves every other read alone', async () => {
    await reportingRowCap(answering('0-4/*'))(`${BASE}/vote?select=resource_id`)
    expect(report).not.toHaveBeenCalled()
  })

  it('names the read', () => {
    expect(describeRead(`${BASE}/resource?select=*&community_id=eq.philly&status=eq.approved`)).toBe('resource (community_id, select, status)')
  })
})
