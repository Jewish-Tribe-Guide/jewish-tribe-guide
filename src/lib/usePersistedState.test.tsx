// @vitest-environment jsdom
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { usePersistedState } from './usePersistedState'

afterEach(cleanup)

function Harness({
  initial,
  load,
  save,
  onValue,
  setterRef,
}: {
  initial: string[]
  load: () => string[]
  save: (v: string[]) => void
  onValue: (v: string[]) => void
  setterRef: { current: ((v: string[]) => void) | null }
}) {
  const [value, setValue] = usePersistedState(initial, load, save)
  onValue(value)
  useEffect(() => { setterRef.current = setValue }, [setValue, setterRef])
  return null
}

describe('usePersistedState', () => {
  it('starts at the given initial value (matching SSR) before hydrating', () => {
    const values: string[][] = []
    render(
      <Harness
        initial={[]}
        load={() => ['a', 'b']}
        save={vi.fn()}
        onValue={(v) => values.push(v)}
        setterRef={{ current: null }}
      />,
    )
    // First render commits with the initial (empty) value — load() has run by
    // the time of the second render, in the same effect flush.
    expect(values[0]).toEqual([])
  })

  it('replaces the initial value with load()\'s result after mount', () => {
    let latest: string[] = []
    render(
      <Harness
        initial={[]}
        load={() => ['a', 'b']}
        save={vi.fn()}
        onValue={(v) => { latest = v }}
        setterRef={{ current: null }}
      />,
    )
    expect(latest).toEqual(['a', 'b'])
  })

  it('never calls save() with the stale pre-hydration value, even on the very first mount', () => {
    // Regression guard for the double-fire this hook's own comment explains:
    // a ref-guarded hydration flag lets the save effect fire once with the
    // still-empty initial value before the loaded value has landed. Using
    // state instead closes that gap.
    const save = vi.fn()
    render(
      <Harness initial={[]} load={() => ['saved-earlier']} save={save} onValue={() => {}} setterRef={{ current: null }} />,
    )
    expect(save).not.toHaveBeenCalledWith([])
  })

  it('calls save() when the value changes after hydration', () => {
    const save = vi.fn()
    const setterRef: { current: ((v: string[]) => void) | null } = { current: null }
    render(
      <Harness initial={[]} load={() => []} save={save} onValue={() => {}} setterRef={setterRef} />,
    )

    act(() => setterRef.current!(['x']))

    expect(save).toHaveBeenCalledWith(['x'])
  })
})
