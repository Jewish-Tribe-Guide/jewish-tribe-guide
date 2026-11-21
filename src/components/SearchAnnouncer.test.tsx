// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import SearchAnnouncer, { searchFoundText } from './SearchAnnouncer'

afterEach(cleanup)

describe('what a search found, as a screen reader hears it', () => {
  it('says nothing before a search, or while it is still reading', () => {
    expect(searchFoundText('', 3)).toBe('')
    expect(searchFoundText('   ', 3)).toBe('')
    expect(searchFoundText('pizza', null)).toBe('')
  })

  it('counts what it found, one or many', () => {
    expect(searchFoundText('pizza', 1)).toBe('1 result')
    expect(searchFoundText('pizza', 4)).toBe('4 results')
    expect(searchFoundText('pizza', 1, ['listing', 'listings'])).toBe('1 listing')
    expect(searchFoundText('pizza', 2, ['listing', 'listings'])).toBe('2 listings')
  })

  it('says when it found nothing, with the words', () => {
    expect(searchFoundText(' pizza ', 0)).toBe('Nothing found for “pizza”')
  })

  it('is a status line that is there, empty, before anything is typed', () => {
    const { getByRole, rerender } = render(<SearchAnnouncer query="" count={null} />)
    const line = getByRole('status')
    expect(line.textContent).toBe('')
    rerender(<SearchAnnouncer query="pizza" count={2} />)
    expect(getByRole('status')).toBe(line)
    expect(line.textContent).toBe('2 results')
  })
})
