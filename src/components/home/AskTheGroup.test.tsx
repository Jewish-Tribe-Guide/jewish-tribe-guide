// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import AskTheGroup from './AskTheGroup'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

// "Nothing in the guide" and one way to ask (the user, Oct 10).
const base = { query: 'rugelach', nothingClose: true, sharePath: '/philly/ask/rugelach' }

afterEach(() => cleanup())

describe('Ask in a WhatsApp group', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('opens the share menu with the question written, and the question’s own link', () => {
    const shareFn = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: shareFn })
    renderWithProviders(<AskTheGroup {...base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask in a WhatsApp group' }))
    expect(shareFn).toHaveBeenCalledWith({
      title: 'rugelach',
      text: 'Does anyone know where to get rugelach? It’s not in the guide yet. If you know, add it there and this link will answer it:',
      url: `${window.location.origin}/philly/ask/rugelach`,
    })
  })

  it('says only that the guide has nothing for it, and offers nothing else (the user, Oct 10)', () => {
    renderWithProviders(<AskTheGroup {...base} />)
    const box = screen.getByTestId('ask-the-group')
    expect(box).toHaveTextContent(/^Nothing in the guide for “rugelach”\.Ask in a WhatsApp group$/)
    expect(screen.queryAllByRole('link')).toEqual([])
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  // Oct 16: on a category page only that category was searched. Nov 27
  // (board R2): no "Search the whole guide"; Add what was searched for,
  // under the ask, when the page takes additions.
  it('on a category page, says which, and offers to add what was searched for', () => {
    const onAdd = vi.fn()
    renderWithProviders(<AskTheGroup {...base} scope={{ label: 'Food' }} onAdd={onAdd} />)
    expect(screen.getByTestId('ask-the-group')).toHaveTextContent(/^Nothing in Food for “rugelach”\.Ask in a WhatsApp groupAdd rugelach$/)
    expect(screen.queryAllByRole('link')).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Add rugelach' }))
    expect(onAdd).toHaveBeenCalledOnce()
  })
})
