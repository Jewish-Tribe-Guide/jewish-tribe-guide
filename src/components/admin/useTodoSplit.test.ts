import { describe, expect, it } from 'vitest'
import { clampListPx, DEFAULT_LIST_PX, HANDLE_PX, LIST_MIN_PX, PLACE_MIN_PX, todoColumns } from './useTodoSplit'

// The user, Nov 2: how much room To do takes beside the open place, set by
// dragging the line between them. Where it can be dragged to, pure; the
// drag itself is in e2e-admin-write/todo-scroll.spec.ts.
describe('To do’s list width', () => {
  it('stays wide enough for a row, and leaves the place its narrowest', () => {
    expect(clampListPx(120, 1400)).toBe(LIST_MIN_PX)
    expect(clampListPx(1300, 1400)).toBe(1400 - HANDLE_PX - PLACE_MIN_PX)
    expect(clampListPx(520.4, 1400)).toBe(520)
  })

  it('a window too narrow for both keeps the list at its narrowest', () => {
    expect(clampListPx(600, 700)).toBe(LIST_MIN_PX)
  })

  it('before it’s laid out, only its narrowest holds', () => {
    expect(clampListPx(900, 0)).toBe(900)
    expect(clampListPx(10, 0)).toBe(LIST_MIN_PX)
  })

  it('the columns: the list, held under what leaves the place room, the line, then the place', () => {
    expect(todoColumns(DEFAULT_LIST_PX)).toBe(`clamp(${LIST_MIN_PX}px, ${DEFAULT_LIST_PX}px, max(${LIST_MIN_PX}px, calc(100% - ${HANDLE_PX + PLACE_MIN_PX}px))) ${HANDLE_PX}px minmax(0, 1fr)`)
  })
})
