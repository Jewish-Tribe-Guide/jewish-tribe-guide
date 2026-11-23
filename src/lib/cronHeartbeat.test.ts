import { afterEach, describe, expect, it, vi } from 'vitest'

const withMonitor = vi.hoisted(() => vi.fn((_slug: string, fn: () => unknown) => fn()))
const flush = vi.hoisted(() => vi.fn(async (_ms?: number) => true))
vi.mock('@sentry/nextjs', () => ({ withMonitor, flush }))
const { cronHeartbeat } = await import('./cronHeartbeat')

afterEach(() => {
  vi.unstubAllEnvs()
  withMonitor.mockClear()
  flush.mockClear()
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

  it('watches only the jobs named, so one monitor can go on the nightly email', async () => {
    vi.stubEnv('SENTRY_CRON_MONITORS', 'nightly-email')
    await cronHeartbeat('watches', async () => 'done')
    expect(withMonitor).not.toHaveBeenCalled()
    await cronHeartbeat('nightly-email', async () => 'sent')
    expect(withMonitor).toHaveBeenCalledTimes(1)
    expect(withMonitor.mock.calls[0][0]).toBe('job-nightly-email')
  })

  it('reads a list of jobs, spaces allowed', async () => {
    vi.stubEnv('SENTRY_CRON_MONITORS', 'watches, nightly-email')
    await cronHeartbeat('watches', async () => 'done')
    await cronHeartbeat('sync-hours', async () => 'done')
    await cronHeartbeat('nightly-email', async () => 'sent')
    expect(withMonitor.mock.calls.map((c) => c[0])).toEqual(['job-watches', 'job-nightly-email'])
  })

  // Nov 22: the nightly email ran and sent, and Sentry marked it timed out.
  // Its closing check-in was queued as the function returned, and Vercel
  // froze the function before it went (Sentry: one accepted, one lost to
  // "network_error"). So the heartbeat waits for it to be sent.
  it('waits for the closing check-in to be sent before the job counts as finished', async () => {
    vi.stubEnv('SENTRY_CRON_MONITORS', 'on')
    const order: string[] = []
    withMonitor.mockImplementationOnce(async (_slug, fn) => {
      const v = await fn()
      order.push('closing check-in queued')
      return v
    })
    flush.mockImplementationOnce(async () => {
      order.push('sent')
      return true
    })
    await cronHeartbeat('nightly-email', async () => 'sent')
    order.push('returned')
    expect(order).toEqual(['closing check-in queued', 'sent', 'returned'])
  })

  it('waits for it after a failure too', async () => {
    vi.stubEnv('SENTRY_CRON_MONITORS', 'on')
    await expect(cronHeartbeat('sync-hours', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('passes a job’s failure on, so Sentry marks the check-in failed', async () => {
    vi.stubEnv('SENTRY_CRON_MONITORS', 'on')
    await expect(cronHeartbeat('sync-hours', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })
})
