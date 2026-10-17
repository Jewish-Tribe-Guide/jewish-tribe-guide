// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { MapEruv } from './EruvMap'

vi.mock('@/lib/loadGoogleMaps', () => ({ loadGoogleMaps: async () => {}, MAPS_MAP_ID: 'test', onMapsAuthFailure: () => () => {} }))

// Google's map, as far as EruvMap uses it: counts what's drawn, removed and
// framed, and keeps what each line and marker was drawn with.
const calls = { fitBounds: 0, drawn: 0, removed: 0, markers: 0 }
const labels: { text: string; click: () => void; content: HTMLElement }[] = []
const shapes: Record<string, unknown>[] = []
const notes: string[] = []
const fits: Bounds[] = []
class Bounds {
  pts: unknown[] = []
  extend(p: unknown) { this.pts.push(p) }
  union(b: Bounds) { this.pts.push(...b.pts) }
  isEmpty() { return this.pts.length === 0 }
}
class Shape {
  constructor(o: Record<string, unknown>) { calls.drawn++; shapes.push(o) }
  addListener() {}
  setOptions() {}
  setMap(m: unknown) { if (m === null) calls.removed++ }
}
beforeEach(() => {
  Object.assign(calls, { fitBounds: 0, drawn: 0, removed: 0, markers: 0 })
  labels.length = 0
  shapes.length = 0
  notes.length = 0
  fits.length = 0
  ;(globalThis as unknown as { google: unknown }).google = {
    maps: {
      importLibrary: async () => ({}),
      event: { addListenerOnce: (_: unknown, __: string, fn: () => void) => void queueMicrotask(fn) },
      InfoWindow: class {
        content: HTMLElement | null = null
        setContent(c: HTMLElement) { this.content = c }
        open() { notes.push(this.content?.textContent ?? '') }
        close() {}
      },
      Map: class { fitBounds(b: Bounds) { calls.fitBounds++; fits.push(b) } },
      LatLngBounds: Bounds,
      Polygon: Shape,
      Polyline: Shape,
      marker: {
        PinElement: class {
          element: HTMLElement
          constructor(o: { background: string }) {
            this.element = document.createElement('div')
            this.element.dataset.pin = o.background
          }
        },
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
          addListener(_: string, fn: () => void) { labels.push({ text: this.content.textContent ?? '', click: fn, content: this.content }) }
        },
      },
    },
  }
})
afterEach(cleanup)

const { default: EruvMap } = await import('./EruvMap')

const square = (lat: number): MapEruv['map'] => ({ lines: [{ name: 'Border', points: [[lat, -75.2], [lat, -75.1], [lat + 0.05, -75.1], [lat + 0.05, -75.2], [lat, -75.2]] }] })
const list = (tone: MapEruv['tone'] = 'green'): MapEruv[] => [
  { id: 'a', name: 'A', tone, map: square(39.9) },
  { id: 'b', name: 'B', tone: 'green', map: square(40.0) },
]
const props = { fallbackCenter: { lat: 39.95, lng: -75.16 }, onSelect: () => {} }
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

// What a fit took in: the eruvim whose points it holds, by latitude.
const fitOf = (b: Bounds) => [...new Set((b.pts as { lat: number }[]).map((p) => (p.lat < 39.98 ? 'a' : 'b')))].sort().join('')

describe('EruvMap', () => {
  it('an eruv opened brings the map to it; closed, back to them all', async () => {
    const view = render(<EruvMap eruvim={list()} you={null} {...props} />)
    await settle()
    expect(fits.map(fitOf)).toEqual(['ab'])
    view.rerender(<EruvMap eruvim={list()} you={null} {...props} focusId="b" />)
    await settle()
    expect(fits.map(fitOf)).toEqual(['ab', 'b'])
    view.rerender(<EruvMap eruvim={list()} you={null} {...props} />)
    await settle()
    expect(fits.map(fitOf)).toEqual(['ab', 'b', 'ab'])
  })

  it('a link to one eruv frames that one only: one fit, not all and then it', async () => {
    render(<EruvMap eruvim={list()} you={null} {...props} focusId="a" />)
    await settle()
    expect(fits.map(fitOf)).toEqual(['a'])
  })

  it('Full map goes to the Map tab it’s given', async () => {
    const view = render(<EruvMap eruvim={list()} you={null} {...props} fullMapHref="/philly/map?eruv=1" />)
    await settle()
    expect(view.getByRole('link', { name: 'Open the full map' })).toHaveAttribute('href', '/philly/map?eruv=1')
  })


  it('writes each eruv’s name on it, and tapping the name opens that eruv', async () => {
    const onSelect = vi.fn()
    render(<EruvMap eruvim={[{ id: 'a', name: 'University City Eruv', tone: 'green', map: square(39.9) }, { id: 'b', name: 'Center City Eruv', tone: 'green', map: square(40.0) }]} you={null} {...props} onSelect={onSelect} />)
    await settle()
    expect(labels.map((l) => l.text)).toEqual(['University City', 'Center City'])
    labels[1].click()
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('a re-render with the same eruvim and a moved dot leaves the map where the visitor put it', async () => {
    const view = render(<EruvMap eruvim={list()} you={{ lat: 39.92, lng: -75.15 }} {...props} />)
    await settle()
    const first = { ...calls }
    expect(first.fitBounds).toBe(1)
    expect(first.markers).toBe(1)

    // A new list (the clock ticked) and a new fix, same eruv: nothing redrawn or re-framed.
    view.rerender(<EruvMap eruvim={list()} you={{ lat: 39.921, lng: -75.151 }} {...props} />)
    await settle()
    expect(calls).toEqual(first)
  })

  it('redraws when a status changes, and frames the eruvim only once', async () => {
    const view = render(<EruvMap eruvim={list()} you={null} {...props} />)
    await settle()
    const drawn = calls.drawn
    view.rerender(<EruvMap eruvim={list('red')} you={null} {...props} />)
    await settle()
    expect(calls.removed).toBe(drawn)
    view.rerender(<EruvMap eruvim={list('red')} you={{ lat: 39.92, lng: -75.15 }} {...props} />)
    await settle()
    expect(calls.fitBounds).toBe(1)
  })

  it('redraws when an eruv’s own map changes', async () => {
    const view = render(<EruvMap eruvim={list()} you={null} {...props} />)
    await settle()
    const drawn = calls.drawn
    view.rerender(<EruvMap eruvim={[list()[0], { ...list()[1], map: square(40.01) }]} you={null} {...props} />)
    await settle()
    expect(calls.removed).toBe(drawn)
  })

  it('draws each eruv as its own map does: its colours, its shading, its markers and their notes', async () => {
    const map: MapEruv['map'] = {
      lines: [
        { name: 'Main', points: [[39.9, -75.2], [39.95, -75.2], [39.95, -75.1], [39.9, -75.2]], color: '#01579b', width: 11 },
        { name: 'Park', points: [[39.91, -75.15], [39.92, -75.15], [39.92, -75.14], [39.91, -75.15]], color: '#ccffff', fill: { color: '#ccffff', opacity: 0.47 } },
      ],
      marks: [
        { name: 'Entry to Penn Park', at: [39.93, -75.16], color: '#c2185b' },
        { name: 'Crossing A', at: [39.92, -75.17], note: 'The tunnel under the rail line', icon: 'https://www.gstatic.com/mapspro/images/stock/22-blue-dot.png' },
      ],
    }
    render(<EruvMap eruvim={[{ id: 'uc', name: 'University City Eruv', tone: 'red', map }]} you={null} {...props} />)
    await settle()
    // Their colours, not the status's; the status is on the name.
    expect(shapes.filter((o) => 'strokeColor' in o).map((o) => o.strokeColor)).toEqual(['#01579b', '#ccffff'])
    expect(shapes.filter((o) => 'fillColor' in o).map((o) => [o.fillColor, o.fillOpacity])).toEqual([['#ccffff', 0.47]])
    // A plain pin in its colour; a picture as its picture.
    const [pin, picture] = labels.filter((l) => l.text === '')
    expect(pin.content.dataset.pin).toBe('#c2185b')
    expect((picture.content as HTMLImageElement).src).toMatch(/22-blue-dot\.png$/)
    pin.click()
    picture.click()
    expect(notes).toEqual(['Entry to Penn Park', 'Crossing AThe tunnel under the rail line'])
  })
})
