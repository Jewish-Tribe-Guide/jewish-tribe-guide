import { describe, expect, it } from 'vitest'
import { inboxTabForRequestType } from './inbox'

describe('inboxTabForRequestType', () => {
  it('maps each known request type to its tab', () => {
    expect(inboxTabForRequestType('Direct Support')).toBe('support')
    expect(inboxTabForRequestType('Volunteer')).toBe('volunteers')
    expect(inboxTabForRequestType('Volunteer Edit')).toBe('volunteerChanges')
    expect(inboxTabForRequestType('Volunteer Removal')).toBe('volunteerChanges')
  })

  it('falls back to "support" for an unrecognized type rather than throwing', () => {
    expect(inboxTabForRequestType('Feedback')).toBe('support')
    expect(inboxTabForRequestType('Some Custom Form Title')).toBe('support')
  })
})
