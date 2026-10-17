// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { SearchLine } from '@/lib/searchLands'
import SearchLines from './SearchLines'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery' })
const lines: SearchLine[] = [
  { key: 'category:grocery', kind: 'category', title: 'Grocery', sub: '10 with Challah', href: '/philly/grocery?q=challah', categoryId: 'grocery' },
  { key: 'listing:tj', kind: 'listing', title: 'Trader Joe’s', sub: 'Grocery', href: '/philly/grocery/trader-joes', categoryId: 'grocery', listing: makeListing({ id: 'tj', name: 'Trader Joe’s', category: 'grocery' }) },
  { key: 'add', kind: 'add', title: 'Add to the guide', sub: 'Add a place, or correct one', href: null },
]

// Canvas page "you", board YouSave: each line that can be saved has a
// bookmark where its chevron was, and the first line has no ⏎ badge.
describe('SearchLines — saving from a line', () => {
  it('has no ⏎ badge on the first line', () => {
    renderWithProviders(<SearchLines lines={lines} categories={[grocery]} typed="challah" onPick={vi.fn()} />)
    expect(screen.queryByLabelText('Enter')).not.toBeInTheDocument()
  })

  it('a kind of place’s bookmark saves the search, filled once saved, without opening the line', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    renderWithProviders(<SearchLines lines={lines} categories={[grocery]} typed="challah" onPick={onPick} />)

    const save = screen.getByRole('button', { name: 'Save “challah” in Grocery' })
    expect(save).toHaveAttribute('aria-pressed', 'false')
    await user.click(save)

    expect(screen.getByRole('button', { name: 'Save “challah” in Grocery' })).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(localStorage.getItem('jpc:saved-searches')!)).toMatchObject([{ words: 'challah', key: '/philly/grocery?q=challah' }])
    expect(screen.getByTestId('undo-toast')).toHaveTextContent('Saved to You')
    expect(onPick).not.toHaveBeenCalled()
  })

  it('a place’s bookmark saves the place', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SearchLines lines={lines} categories={[grocery]} typed="trader" onPick={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Save Trader Joe’s' }))
    expect(JSON.parse(localStorage.getItem('jpc:pinned-listings')!)).toEqual([{ id: 'tj', categoryId: 'grocery' }])
  })

  it('+ Add has no bookmark', () => {
    renderWithProviders(<SearchLines lines={lines} categories={[grocery]} typed="add" onPick={vi.fn()} />)
    expect(screen.getAllByTestId('save-button')).toHaveLength(2)
  })
})

// Oct 15: an eruv's line answers "is it up?" in the line, with the eruv
// card's dot and colours.
describe('SearchLines — an eruv’s line', () => {
  it('has its status dot, in its tone', () => {
    const eruvLines: SearchLine[] = [
      { key: 'eruv:cc', kind: 'eruv', title: 'Center City Eruv', sub: 'Up · Checked 1:55 PM', href: '/philly/eruv?item=cc', categoryId: 'eruv', eruvId: 'cc', tone: 'green' },
      { key: 'eruv', kind: 'eruv', title: 'Eruv', sub: 'Each eruv’s status this week', href: '/philly/eruv', categoryId: 'eruv' },
    ]
    renderWithProviders(<SearchLines lines={eruvLines} categories={[]} onPick={vi.fn()} />)
    const dots = screen.getAllByTestId('search-line-tone')
    expect(dots).toHaveLength(1)
    expect(dots[0]).toHaveAttribute('data-tone', 'green')
    expect(dots[0].className).toMatch(/\bbg-green-700\b/)
    expect(screen.getByText('Up · Checked 1:55 PM')).toBeInTheDocument()
  })

  it('is saved as a place, the Eruv page’s, as a listing’s line is', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <SearchLines lines={[{ key: 'eruv:cc', kind: 'eruv', title: 'Center City Eruv', sub: 'Up', href: '/philly/eruv?item=cc', categoryId: 'eruv', eruvId: 'cc', tone: 'green' }]} categories={[]} onPick={vi.fn()} />,
    )
    await user.click(screen.getByRole('button', { name: 'Save Center City Eruv' }))
    expect(JSON.parse(localStorage.getItem('jpc:pinned-listings')!)).toEqual([{ id: 'cc', categoryId: 'eruv' }])
    expect(screen.getByRole('button', { name: 'Save Center City Eruv' })).toHaveAttribute('aria-pressed', 'true')
  })
})
