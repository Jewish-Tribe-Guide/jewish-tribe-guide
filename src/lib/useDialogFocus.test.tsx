// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { useDialogFocus } from './useDialogFocus'

afterEach(cleanup)

function Dialog({ label, autoFocusField = false, children }: { label: string; autoFocusField?: boolean; children?: React.ReactNode }) {
  const ref = useDialogFocus()
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label}>
      <input aria-label={`${label} field`} autoFocus={autoFocusField} />
      <button type="button">{label} one</button>
      <button type="button" disabled>
        {label} off
      </button>
      <button type="button">{label} last</button>
      {children}
    </div>
  )
}

function Page({ autoFocusField = false, inner = false }: { autoFocusField?: boolean; inner?: boolean }) {
  const [open, setOpen] = useState(false)
  const [innerOpen, setInnerOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind</button>
      {open && (
        <Dialog label="Outer" autoFocusField={autoFocusField}>
          {inner && (
            <button type="button" onClick={() => setInnerOpen(true)}>
              Open inner
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
          {innerOpen && (
            <Dialog label="Inner">
              <button type="button" onClick={() => setInnerOpen(false)}>
                Close inner
              </button>
            </Dialog>
          )}
        </Dialog>
      )}
    </>
  )
}

const active = () => document.activeElement as HTMLElement
const tab = (shift = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', shiftKey: shift })
// jsdom moves no focus on Tab itself; the hook acts only at the ends, so a
// step in the middle is taken by hand, as the browser would.
const open = (getByText: (t: string) => HTMLElement) => {
  const opener = getByText('Open')
  opener.focus()
  act(() => opener.click())
  return opener
}

describe('a dialog takes the focus, keeps it, and gives it back', () => {
  it('goes into the dialog when it opens', () => {
    const { getByRole, getByText } = render(<Page />)
    open(getByText)
    expect(getByRole('dialog')).toBe(active())
  })

  it('leaves it on a field that asked for it', () => {
    const { getByLabelText, getByText } = render(<Page autoFocusField />)
    open(getByText)
    expect(active()).toBe(getByLabelText('Outer field'))
  })

  it('goes round inside: Tab from the last goes to the first, Shift+Tab from the first to the last', () => {
    const { getByText, getByLabelText } = render(<Page />)
    open(getByText)
    getByText('Close').focus()
    tab()
    expect(active()).toBe(getByLabelText('Outer field'))
    tab(true)
    expect(active()).toBe(getByText('Close'))
  })

  it('Shift+Tab from the dialog itself goes to its last control, skipping disabled ones', () => {
    const { getByText, getByRole } = render(<Page />)
    open(getByText)
    expect(active()).toBe(getByRole('dialog'))
    tab(true)
    expect(active()).toBe(getByText('Close'))
  })

  it('goes round past a control CSS hides, which the browser would skip', () => {
    const { getByText, getByLabelText } = render(<Page />)
    open(getByText)
    // As a phone's sheet has buttons only a computer shows: the first
    // control can't take the focus, so Tab from the last goes to the next.
    Object.defineProperty(getByLabelText('Outer field'), 'checkVisibility', { value: () => false })
    getByText('Close').focus()
    tab()
    expect(active()).toBe(getByText('Outer one'))
    tab(true)
    expect(active()).toBe(getByText('Close'))
  })

  // The form editor's preview: a picture of the form, drawn in a frame of
  // its own under `inert`, which loads while the admin types.
  it('takes no focus when it is a picture: under inert, or in another document', () => {
    function Typing({ where }: { where: 'inert' | 'frame' }) {
      const [shown, setShown] = useState(false)
      const [frame, setFrame] = useState<HTMLIFrameElement | null>(null)
      const body = frame?.contentDocument?.body
      return (
        <>
          <input aria-label="Message" />
          <button type="button" onClick={() => setShown(true)}>
            Draw it
          </button>
          {where === 'inert' ? (
            <div inert>{shown && <Dialog label="Preview" />}</div>
          ) : (
            <>
              <iframe ref={setFrame} title="Preview" />
              {shown && body && createPortal(<Dialog label="Preview" />, body)}
            </>
          )}
        </>
      )
    }
    const kept = (['inert', 'frame'] as const).map((where) => {
      const { getByLabelText, getByText, unmount } = render(<Typing where={where} />)
      const field = getByLabelText('Message')
      field.focus()
      act(() => getByText('Draw it').click())
      const still = active() === field
      unmount()
      return [where, still]
    })
    expect(Object.fromEntries(kept)).toEqual({ inert: true, frame: true })
  })

  it('gives the focus back to what opened it when it closes', () => {
    const { getByText } = render(<Page />)
    const opener = open(getByText)
    act(() => getByText('Close').click())
    expect(active()).toBe(opener)
  })

  it('gives it back past a field that took it on opening', () => {
    const { getByText } = render(<Page autoFocusField />)
    const opener = open(getByText)
    act(() => getByText('Close').click())
    expect(active()).toBe(opener)
  })

  it('with one dialog over another, only the top one keeps it, and closing it goes back into the one under', () => {
    const { getByText, getByRole } = render(<Page inner />)
    open(getByText)
    const openInner = getByText('Open inner')
    openInner.focus()
    act(() => openInner.click())
    const inner = getByRole('dialog', { name: 'Inner' })
    expect(active()).toBe(inner)
    getByText('Close inner').focus()
    tab()
    expect(inner.contains(active())).toBe(true)
    act(() => getByText('Close inner').click())
    expect(active()).toBe(openInner)
  })
})
