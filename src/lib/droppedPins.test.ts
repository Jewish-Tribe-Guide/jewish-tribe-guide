import { describe, expect, it } from 'vitest'
import { addDroppedPin, parseDroppedPins, removeDroppedPin, renameDroppedPin, type DroppedPin } from './droppedPins'

describe('parseDroppedPins', () => {
  it('parses a valid saved list', () => {
    const raw = JSON.stringify([{ id: 'a', lat: 40, lng: -75, label: 'Where I parked' }])
    expect(parseDroppedPins(raw)).toEqual([{ id: 'a', lat: 40, lng: -75, label: 'Where I parked' }])
  })

  it('returns an empty list for null (nothing saved yet)', () => {
    expect(parseDroppedPins(null)).toEqual([])
  })

  it('returns an empty list for garbage JSON rather than throwing', () => {
    expect(parseDroppedPins('not json')).toEqual([])
  })

  it('returns an empty list for valid JSON that is not an array', () => {
    expect(parseDroppedPins(JSON.stringify({ id: 'a' }))).toEqual([])
  })

  it('drops entries missing any required field instead of failing the whole list', () => {
    const raw = JSON.stringify([
      { id: 'a', lat: 40, lng: -75, label: 'Good' },
      { id: 'b', lat: 40, lng: -75 },
      { id: 'c', lat: '40', lng: -75, label: 'Bad type' },
      null,
      { id: 'd', lat: 41, lng: -76, label: 'Also good' },
    ])
    expect(parseDroppedPins(raw)).toEqual([
      { id: 'a', lat: 40, lng: -75, label: 'Good' },
      { id: 'd', lat: 41, lng: -76, label: 'Also good' },
    ])
  })
})

describe('addDroppedPin / removeDroppedPin / renameDroppedPin', () => {
  it('adds a pin', () => {
    const next = addDroppedPin([], { id: 'a', lat: 40, lng: -75, label: 'Spot' })
    expect(next).toEqual([{ id: 'a', lat: 40, lng: -75, label: 'Spot' }])
  })

  it('removes a pin by id', () => {
    const pins: DroppedPin[] = [
      { id: 'a', lat: 40, lng: -75, label: 'Spot' },
      { id: 'b', lat: 41, lng: -76, label: 'Other' },
    ]
    expect(removeDroppedPin(pins, 'a')).toEqual([{ id: 'b', lat: 41, lng: -76, label: 'Other' }])
  })

  it('renames a pin by id, leaving its coordinates alone', () => {
    const pins: DroppedPin[] = [{ id: 'a', lat: 40, lng: -75, label: 'Spot' }]
    expect(renameDroppedPin(pins, 'a', 'Renamed')).toEqual([{ id: 'a', lat: 40, lng: -75, label: 'Renamed' }])
  })

  it('never mutates the array passed in', () => {
    const pins: DroppedPin[] = [{ id: 'a', lat: 40, lng: -75, label: 'Spot' }]
    const next = addDroppedPin(pins, { id: 'b', lat: 41, lng: -76, label: 'Other' })
    expect(pins).toHaveLength(1)
    expect(next).not.toBe(pins)
  })

  it('drops the oldest pin once the cap is reached, rather than refusing', () => {
    const pins: DroppedPin[] = Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, lat: 0, lng: 0, label: `${i}` }))
    const next = addDroppedPin(pins, { id: 'new', lat: 1, lng: 1, label: 'New' })
    expect(next).toHaveLength(50)
    expect(next.find((p) => p.id === 'p0')).toBeUndefined()
    expect(next.find((p) => p.id === 'new')).toBeDefined()
  })
})
