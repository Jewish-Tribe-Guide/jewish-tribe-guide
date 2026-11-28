// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { EditorRow } from '@/lib/editorRows'
import { useSourceFields, type FieldSpec } from './useSourceFields'

// Item 95: an email typed into a source field. This week's schedule takes
// one, and says what to sign up with (no Copy); usual times take a page
// only, so Done refuses an email there and saves nothing.
const row = (over: Partial<EditorRow>): EditorRow => ({ id: 'x', title: 'x', kind: 'minyans', fields: [], ...over })
const week = row({ id: 'minyans:this_week' })
const usual = row({ id: 'minyans:weekday', box: 'weekday' })

function Harness({ r, spec, onDone = () => {} }: { r: EditorRow; spec: FieldSpec; onDone?: (ok: boolean) => void }) {
  const fields = useSourceFields({ account: 'guide@gmail.com' })
  return (
    <>
      {fields.field(r, spec, true)}
      <button type="button" onClick={() => void fields.done(r).then(onDone)}>
        Done
      </button>
    </>
  )
}

afterEach(cleanup)

describe('an email typed into a source field', () => {
  it('on this week’s schedule, says the address to sign up with, and saves', async () => {
    const attempt = vi.fn().mockResolvedValue({ failed: false })
    const onDone = vi.fn()
    render(<Harness r={week} spec={{ key: 'k', value: '', placeholder: 'p', attempt }} onDone={onDone} />)
    fireEvent.change(screen.getByTestId('source-field'), { target: { value: 'office@bethshalom.org' } })
    expect(screen.getByTestId('source-field-email').textContent).toBe('Sign up as guide@gmail.com to get its emails')
    expect(screen.queryByText('Copy')).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Done' })))
    expect(onDone).toHaveBeenCalledWith(true)
    expect(attempt).toHaveBeenCalledWith('office@bethshalom.org')
  })

  it('on usual times, is refused: Done saves nothing and says why', async () => {
    const attempt = vi.fn().mockResolvedValue({ failed: false })
    const onDone = vi.fn()
    render(<Harness r={usual} spec={{ key: 'k', value: '', placeholder: 'p', attempt }} onDone={onDone} />)
    fireEvent.change(screen.getByTestId('source-field'), { target: { value: 'office@bethshalom.org' } })
    expect(screen.getByText('This takes a page’s link, not an email')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Done' })))
    expect(onDone).toHaveBeenCalledWith(false)
    expect(attempt).not.toHaveBeenCalled()
    expect(screen.getAllByText('This takes a page’s link, not an email')).toHaveLength(1)
  })

  it('a page’s link gets no line', () => {
    render(<Harness r={usual} spec={{ key: 'k', value: '', placeholder: 'p', attempt: vi.fn() }} />)
    fireEvent.change(screen.getByTestId('source-field'), { target: { value: 'https://bethshalom.org/schedule' } })
    expect(screen.queryByTestId('source-field-email')).toBeNull()
  })
})
