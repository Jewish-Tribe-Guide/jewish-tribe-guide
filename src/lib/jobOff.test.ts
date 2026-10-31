import { describe, expect, it } from 'vitest'
import { isJobOff, JOB_OFF_CREATOR, jobOffUrl, jobsOff, jobsOffByCommunity } from './jobOff'
import { nightKindOf } from './nightKinds'
import type { Watch } from './watches'

const marker = (kind: 'google' | 'links', communityId = 'philly') => ({ createdBy: JOB_OFF_CREATOR, url: jobOffUrl(kind), communityId })

describe('a job turned off', () => {
  it('reads as off by its marker row, and no other', () => {
    expect(isJobOff(marker('google'))).toBe(true)
    expect(isJobOff({ createdBy: 'listing pages' })).toBe(false)
    expect(jobsOff([marker('google'), { createdBy: null, url: 'https://x.org/links' }])).toEqual(['google'])
  })

  it('off in one community is off only there', () => {
    const off = jobsOffByCommunity([marker('google'), marker('links', 'ues')])
    expect([...off.get('philly')!]).toEqual(['google'])
    expect([...off.get('ues')!]).toEqual(['links'])
  })

  it('its marker row is never counted as a page some job reads', () => {
    const w = { ...marker('google'), kind: 'website', resourceId: null, label: null, active: false } as unknown as Watch
    expect(nightKindOf(w)).toBeNull()
  })
})
