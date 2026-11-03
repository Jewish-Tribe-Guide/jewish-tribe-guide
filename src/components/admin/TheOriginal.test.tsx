// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { markTimes } from '@/lib/submissionSource'
import { TheOriginal } from './SubmissionReview'

afterEach(cleanup)

// The user, Nov 2: "The 'not used' color for source is the same color as
// added for the row". A changed row and its New/Changed pills are amber
// (TodoChange, TodoReading), so a time the reading left out can't be.
describe('TheOriginal', () => {
  it('marks a time the reading left out in its own colour, not the amber of a change', () => {
    const original = 'Shacharis 7:00am, Mincha 1:30pm'
    const marked = markTimes(original, { minyanim: [{ id: 'a', tefillah: 'shacharis', days: ['mon'], time: '7:00am' }] })
    const { container } = render(<TheOriginal source={{ readBy: 'ai', from: 'from what they pasted', original }} marked={marked} />)
    const notUsed = container.querySelector('mark[data-mark="unused"]')
    expect(notUsed?.textContent).toBe('1:30pm')
    expect(notUsed?.className).not.toMatch(/amber|yellow/)
    expect(container.querySelector('mark[data-mark="used"]')?.textContent).toBe('7:00am')
  })
})
