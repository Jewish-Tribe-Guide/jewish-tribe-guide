import { beforeEach, describe, expect, it, vi } from 'vitest'

const report = vi.hoisted(() => vi.fn())
vi.mock('../serverError', () => ({ reportServerError: report }))
const { forgetSaidSchema, saySchemaMissing, schemaMissing } = await import('./schemaMissing')

beforeEach(() => {
  report.mockReset()
  forgetSaidSchema()
})

describe('a missed migration says so', () => {
  it('knows both of Postgres’ wordings, for the table or column named', () => {
    expect(schemaMissing('watch', 'relation "public.watch" does not exist')).toBe(true)
    expect(schemaMissing('watch', "Could not find the table 'public.watch' in the schema cache")).toBe(true)
    expect(schemaMissing('kinds', 'column job_run.kinds does not exist')).toBe(true)
  })

  it('isn’t fooled by another table, or a failure of another kind', () => {
    expect(schemaMissing('watch', 'relation "public.watch_job" does not exist')).toBe(false)
    expect(schemaMissing('watch', 'duplicate key value violates unique constraint "watch_pkey"')).toBe(false)
    expect(schemaMissing('watch', 'TypeError: fetch failed')).toBe(false)
    expect(schemaMissing('watch', undefined)).toBe(false)
    expect(report).not.toHaveBeenCalled()
  })

  it('tells the log and Sentry, once per name, naming it', () => {
    schemaMissing('watch', 'relation "public.watch" does not exist')
    schemaMissing('watch', "Could not find the table 'public.watch' in the schema cache")
    saySchemaMissing('eruv.details')
    expect(report).toHaveBeenCalledTimes(2)
    expect(report.mock.calls[0][0]).toMatch(/^\[schema\] watch isn’t in the database/)
    expect(report.mock.calls[1][0]).toMatch(/^\[schema\] eruv\.details isn’t/)
  })
})
