import { describe, expect, it } from 'vitest'
import { messageStatus, submissionStatus, type SubmissionState } from './yourUpdatesStatus'
import type { UpdateStatus } from './yourUpdates'

// Where a phone's sent update stands (Nov 27, board S4c).
const row = (status: SubmissionState['status'], reviewed_at: string | null = null): SubmissionState => ({ id: 's', status, reviewed_at, target_type: 'listing', target_id: 'l' })

describe('submissionStatus', () => {
  it('is live once approved, with where; waiting while pending; otherwise not changed', () => {
    expect(submissionStatus(row('approved', '2026-11-27T12:00:00Z'), () => '/philly/grocery/acme')).toEqual({ state: 'live', href: '/philly/grocery/acme', at: '2026-11-27T12:00:00Z' })
    expect(submissionStatus(row('pending'), () => null)).toEqual({ state: 'waiting' })
    expect(submissionStatus(row('rejected'), () => null)).toEqual({ state: 'not_changed' })
    expect(submissionStatus(row('archived'), () => null)).toEqual({ state: 'not_changed' })
  })
})

describe('messageStatus', () => {
  const live = (at: string, href: string): UpdateStatus => ({ state: 'live', href, at })
  const filed = new Map<string, UpdateStatus>([
    ['a', live('2026-11-27T10:00:00Z', '/a')],
    ['b', live('2026-11-27T12:00:00Z', '/b')],
    ['w', { state: 'waiting' }],
    ['n', { state: 'not_changed' }],
  ])
  it('waits while it’s being read, and while an admin has anything of it', () => {
    expect(messageStatus({ status: 'reading', submissionIds: [] }, filed)).toEqual({ state: 'waiting' })
    expect(messageStatus({ status: 'filed', submissionIds: ['w', 'n'] }, filed)).toEqual({ state: 'waiting' })
    expect(messageStatus({ status: 'left', submissionIds: [] }, filed)).toEqual({ state: 'waiting' })
  })
  it('is live when any of it went on the site, the newest saying where', () => {
    expect(messageStatus({ status: 'left', submissionIds: ['a', 'b', 'w'] }, filed)).toEqual(live('2026-11-27T12:00:00Z', '/b'))
  })
  it('is not changed once nothing of it went on and nothing waits', () => {
    expect(messageStatus({ status: 'filed', submissionIds: ['n'] }, filed)).toEqual({ state: 'not_changed' })
    expect(messageStatus({ status: 'done', submissionIds: [] }, filed)).toEqual({ state: 'not_changed' })
  })
})
