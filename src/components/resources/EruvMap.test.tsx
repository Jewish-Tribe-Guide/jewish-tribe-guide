// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { MapEruv } from './EruvMap'

vi.mock('@/lib/loadGoogleMaps', () => ({ loadGoogleMaps: async () => {}, MAPS_MAP_ID: 'test', onMapsAuthFailure: () => () => {} }))

// Google's map, as far as EruvMap uses it: counts what's drawn, removed and framed.
const calls = { fitBounds: 0, drawn: 0, removed: 0, markers: 0 }
const labels: { text: string; click: () => void }[] = []
class Bounds {
  pts: unknown[] = []
  extend(p: unknown) { this.pts.push(p) }
  union(b: Bounds) { this.pts.push(...b.pts) }
  isEmpty() { return this.pts.length === 0 }
}
class Shape {
  constructor() { calls.drawn++ }
  addListener() {}
  setOptions() {}
  setMap(m: unknown) { if (m === null) calls.removed++ }
}
beforeEach(() => {
  Object.assign(calls, { fitBounds: 0, drawn: 0, removed: 0, markers: 0 })
  labels.length = 0
  ;(globalThis as unknown as { google: unknown }).google = {
    maps: {
      importLibrary: async () => ({}),
      Map: class { fitBounds() { calls.fitBounds++ } },
      LatLngBounds: Bounds,
      Polygon: Shape,
      Polyline: Shape,
      marker: {
        AdvancedMarkerElement: class {
          position: unknown
          map: unknown
          zIndex = 0
          content: HTMLElement
          title: string
          constructor(o: { position: unknown; content: HTMLElement; title: string }) {
            this.position = o.position
            this.content = o.content
            this.title = o.title
            if (o.title === 'You') calls.markers++
          }
          addListener(_: string, fn: () => void) { labels.push({ text: this.content.textContent ?? '', click: fn }) }
        },
      },
    },
  }
})
afterEach(cleanup)

const { default: EruvMap } = await import('./EruvMap')

const square = (lat: number): MapEruv['line'] => ({ lines: [{ name: 'Border', points: [[lat, -75.2], [lat, -75.1], [lat + 0.05, -75.1], [lat + 0.05, -75.2], [lat, -75.2]] }] })
const list = (tone: MapEruv['tone'] = 'green'): MapEruv[] => [
  { id: 'a', name: 'A', tone, line: square(39.9) },
  { id: 'b', name: 'B', tone: 'green', line: square(40.0) },
]
const props = { fallbackCenter: { lat: 39.95, lng: -75.16 }, onSelect: () => {} }
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

describe('EruvMap', () => {
  it('writes each eruv’s name on it, and tapping the name opens that eruv', async () => {
    const onSelect = vi.fn()
    render(<EruvMap eruvim={[{ id: 'a', name: 'University City Eruv', tone: 'green', line: square(39.9) }, { id: 'b', name: 'Center City Eruv', tone: 'green', line: square(40.0) }]} you={null} focusId={null} {...props} onSelect={onSelect} />)
    await settle()
    expect(labels.map((l) => l.text)).toEqual(['University City', 'Center City'])
    labels[1].click()
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('a re-render with the same eruvim and a moved dot leaves the map where the visitor put it', async () => {
    const view = render(<EruvMap eruvim={list()} you={{ lat: 39.92, lng: -75.15 }} focusId="a" {...props} />)
    await settle()
    const first = { ...calls }
    expect(first.fitBounds).toBe(1)
    expect(first.markers).toBe(1)

    // A new list (the clock ticked) and a new fix, same eruv: nothing redrawn or re-framed.
    view.rerender(<EruvMap eruvim={list()} you={{ lat: 39.921, lng: -75.151 }} focusId="a" {...props} />)
    await settle()
    expect(calls).toEqual(first)
  })

  it('redraws when a status changes, and re-frames only when the visitor’s eruv does', async () => {
    const view = render(<EruvMap eruvim={list()} you={null} focusId={null} {...props} />)
    await settle()
    const drawn = calls.drawn
    view.rerender(<EruvMap eruvim={list('red')} you={null} focusId={null} {...props} />)
    await settle()
    expect(calls.removed).toBe(drawn)
    expect(calls.fitBounds).toBe(1)
    view.rerender(<EruvMap eruvim={list('red')} you={{ lat: 39.92, lng: -75.15 }} focusId="a" {...props} />)
    await settle()
    expect(calls.fitBounds).toBe(2)
  })

  it('redraws when an admin approves a new line', async () => {
    const view = render(<EruvMap eruvim={list()} you={null} focusId={null} {...props} />)
    await settle()
    const drawn = calls.drawn
    view.rerender(<EruvMap eruvim={[list()[0], { ...list()[1], line: square(40.01) }]} you={null} focusId={null} {...props} />)
    await settle()
    expect(calls.removed).toBe(drawn)
  })
})
