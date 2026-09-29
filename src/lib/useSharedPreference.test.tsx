// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { setSharedPreference, useSharedPreference } from './useSharedPreference'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  setSharedPreference('test-pref', null)
})

function Shows({ id }: { id: string }) {
  const [on, set] = useSharedPreference('test-pref', (raw) => raw === 'on')
  return (
    <button type="button" onClick={() => set(on ? null : 'on')}>
      {id}: {on ? 'on' : 'off'}
    </button>
  )
}

describe('useSharedPreference', () => {
  it('reads what’s stored, and every page showing it changes together', () => {
    localStorage.setItem('test-pref', 'on')
    render(
      <>
        <Shows id="Food" />
        <Shows id="Grocery" />
      </>,
    )
    expect(screen.getByText('Food: on')).toBeInTheDocument()
    act(() => screen.getByText('Grocery: on').click())
    expect(screen.getByText('Food: off')).toBeInTheDocument()
    expect(localStorage.getItem('test-pref')).toBeNull()
  })

  it('follows a change made in another tab', () => {
    render(<Shows id="Food" />)
    act(() => {
      localStorage.setItem('test-pref', 'on')
      window.dispatchEvent(new StorageEvent('storage', { key: 'test-pref' }))
    })
    expect(screen.getByText('Food: on')).toBeInTheDocument()
  })

  it('still works, until the tab closes, where storage is blocked', () => {
    // As a browser blocking site data does: touching localStorage throws.
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    render(<Shows id="Food" />)
    act(() => screen.getByText('Food: off').click())
    expect(screen.getByText('Food: on')).toBeInTheDocument()
  })
})
