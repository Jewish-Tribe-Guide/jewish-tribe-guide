// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SortMenu from './SortMenu'

afterEach(cleanup)

const sort = () => screen.getByRole('button', { name: /^Sort/ })

describe('SortMenu', () => {
  it('says the choice in use, and opens a menu of both with a check by it', async () => {
    const user = userEvent.setup()
    render(<SortMenu byPopular onSelect={vi.fn()} />)
    expect(sort()).toHaveAccessibleName('Sort Popularity')
    expect(sort()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(sort())
    expect(sort()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'Popularity' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'Distance' })).toHaveAttribute('aria-checked', 'false')
    // The site's own menu, not the browser's select.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('picks a choice and closes; picking the one in use only closes', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<SortMenu byPopular onSelect={onSelect} />)
    await user.click(sort())
    await user.click(screen.getByRole('menuitemradio', { name: 'Distance' }))
    expect(onSelect).toHaveBeenCalledWith(false)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(sort())
    await user.click(screen.getByRole('menuitemradio', { name: 'Popularity' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('works from the keyboard: arrows open and move, Enter picks, Escape closes back onto Sort', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<SortMenu byPopular={false} onSelect={onSelect} />)
    sort().focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitemradio', { name: 'Distance' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitemradio', { name: 'Popularity' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(sort()).toHaveFocus()
    expect(onSelect).not.toHaveBeenCalled()

    await user.keyboard('{ArrowUp}{ArrowUp}{Enter}')
    expect(onSelect).toHaveBeenCalledWith(true)
    expect(sort()).toHaveFocus()
  })

  it('closes on a tap anywhere else', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SortMenu byPopular onSelect={vi.fn()} />
        <p>Elsewhere</p>
      </>,
    )
    await user.click(sort())
    await user.click(screen.getByText('Elsewhere'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
