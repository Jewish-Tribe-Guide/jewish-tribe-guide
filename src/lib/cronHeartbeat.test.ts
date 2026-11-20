import { afterEach, describe, expect, it, vi } from 'vitest'

const withMonitor = vi.hoisted(() => vi.fn((_slug: string, fn: () => unknown) => fn()))
vi.mock('@sentry/nextjs', () => ({ withMonitor }))
const { cronHeartbeat } = await import('./cronHeartbeat')

afterEach(() => {
  vi.unstubAllEnvs()
  withMonitor.mockClear()
})

describe('cronHeartbeat', () => {
  it('only runs the job while monitors are off (they cost money past the free ones)', async () => {
    await expect(cronHeartbeat('watches', async () => 'done')).resolves.toBe('done')
    expect(withMonitor).not.toHaveBeenCalled()
  })

  it('checks in on the job’s own schedule when they’re on', async () => {
    vi.stubEnv('SENTRY_CRON_MONITORS', 'on')
    await expect(cronHeartbeat('nightly-email', async () => 'sent')).resolves.toBe('sent')
    expect(withMonitor).toHaveBeenCalledWith('job-nightly-email', expect.any(Function), {
      schedule: { type: 'crontab', value: '45 9 * * *' },
      timezone: 'Etc/UTC',
      checkinMargin: 30,
      maxRuntime: 2,
    })
  })

  it('passes a job’s failure on, so Sentry marks the check-in failed', async () => {
    vi.stubEnv('SENTRY_CRON_MONITORS', 'on')
    await expect(cronHeartbeat('sync-hours', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })
})
