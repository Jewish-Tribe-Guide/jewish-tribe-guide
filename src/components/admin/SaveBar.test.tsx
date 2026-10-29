// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SaveBar, { changesLabel, LEAVE_QUESTION, useLeaveGuard } from './SaveBar'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

// One way to save (the admin redesign's brief, rule 4).
describe('SaveBar', () => {
  it('counts changes', () => {
    expect(changesLabel(1)).toBe('1 change')
    expect(changesLabel(3)).toBe('3 changes')
  })

  it('is not there until something changes', () => {
    render(<SaveBar changes={0} onUndo={() => {}} onSave={() => {}} />)
    expect(screen.queryByRole('region', { name: 'Save' })).toBeNull()
  })

  it('says how much changed, with Undo and Save', async () => {
    const user = userEvent.setup()
    const onUndo = vi.fn()
    const onSave = vi.fn()
    render(<SaveBar changes={2} onUndo={onUndo} onSave={onSave} />)
    expect(screen.getByRole('status')).toHaveTextContent('2 changes')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('says Saved once saved, and shows an error in place of the count', () => {
    const { rerender } = render(<SaveBar changes={0} saved onUndo={() => {}} onSave={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved.')
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<SaveBar changes={1} error="Could not save" onUndo={() => {}} onSave={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Could not save')
  })
})

describe('useLeaveGuard', () => {
  function link(href: string) {
    const a = document.createElement('a')
    a.href = href
    a.textContent = href
    document.body.appendChild(a)
    return a
  }

  it('asks before a link leaves the screen with changes, and stays on No', async () => {
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    renderHook(() => useLeaveGuard(true))
    const a = link('/philly/admin/places')
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    a.dispatchEvent(click)
    expect(confirm).toHaveBeenCalledWith(LEAVE_QUESTION)
    expect(click.defaultPrevented).toBe(true)
  })

  it('lets a link go on Yes, or with nothing changed, or to a screen sharing the draft', () => {
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    const { rerender } = renderHook(({ dirty }) => useLeaveGuard(dirty, (p) => p.endsWith('/menus')), { initialProps: { dirty: true } })
    const leave = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    link('/philly/admin/places').dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(false)
    confirm.mockClear()

    link('/philly/admin/menus').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    expect(confirm).not.toHaveBeenCalled()

    rerender({ dirty: false })
    link('/philly/admin/team').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    expect(confirm).not.toHaveBeenCalled()
  })
})
