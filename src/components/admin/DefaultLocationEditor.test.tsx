// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DefaultLocationEditor, { timeZoneName } from './DefaultLocationEditor'

// Settings › Default location: one place picker. Only a place picked from
// the list can be saved (it's the only kind with coordinates), and saving
// sends just the place — the time zone is the server's to work out.

vi.mock('@/lib/communityContext', () => ({ useCommunitySlug: () => 'pgh' }))
vi.mock('@/components/intake/AddressInput', () => ({
  default: ({ value, onChange, onCoords, id }: { value: string; onChange: (v: string) => void; onCoords: (c: { lat: number; lng: number } | null) => void; id: string }) => (
    <>
      <input id={id} value={value} onChange={(e) => { onChange(e.target.value); onCoords(null) }} />
      <button onClick={() => { onChange('Squirrel Hill, Pittsburgh, PA'); onCoords({ lat: 40.4383, lng: -79.9227 }) }}>Pick Squirrel Hill</button>
    </>
  ),
}))

const calls: { url: string; init?: RequestInit }[] = []
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const body = init?.method === 'PUT'
      ? { ok: true, center: { lat: 40.4383, lng: -79.9227 }, label: 'Squirrel Hill, Pittsburgh, PA', timezone: 'America/New_York' }
      : { ok: true, center: { lat: 40.44, lng: -79.99 }, label: null, region: 'Pittsburgh', timezone: 'America/New_York' }
    return { ok: true, status: 200, json: async () => body }
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the default location screen', () => {
  it('shows the city the community started with until a place is picked', async () => {
    render(<DefaultLocationEditor token="t" />)
    const field = await screen.findByLabelText('Until a visitor sets their own location, we use')
    expect((field as HTMLInputElement).value).toBe('Pittsburgh')
    expect(screen.getByText('Eastern Time')).toBeTruthy()
    expect(calls[0].url).toContain('community=pgh')
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not save typed text that was never picked from the list', async () => {
    const user = userEvent.setup()
    render(<DefaultLocationEditor token="t" />)
    const field = await screen.findByLabelText('Until a visitor sets their own location, we use')
    await user.clear(field)
    await user.type(field, 'Squirrel Hill')
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('saves a picked place, as the admin, and says so', async () => {
    const user = userEvent.setup()
    render(<DefaultLocationEditor token="t" />)
    await user.click(await screen.findByText('Pick Squirrel Hill'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved')
    const put = calls.find((c) => c.init?.method === 'PUT')!
    expect(put.url).toContain('community=pgh')
    expect((put.init!.headers as Record<string, string>).Authorization).toBe('Bearer t')
    expect(JSON.parse(put.init!.body as string)).toEqual({ lat: 40.4383, lng: -79.9227, label: 'Squirrel Hill, Pittsburgh, PA' })
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true))
  })
})

describe('timeZoneName', () => {
  it('names the zone the way people say it, and falls back to the id', () => {
    expect(timeZoneName('America/Chicago')).toBe('Central Time')
    expect(timeZoneName('Not/AZone')).toBe('Not/AZone')
  })
})
