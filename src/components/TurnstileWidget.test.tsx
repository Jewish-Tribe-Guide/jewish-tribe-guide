// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A spam check that doesn't come used to leave the form waiting without a
// word, and kept the failed load, so only a reload tried again (Nov 20,
// the health sweep).

type Opts = { callback: (t: string) => void; 'error-callback': () => void }

async function load() {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key')
  return (await import('./TurnstileWidget')) as typeof import('./TurnstileWidget')
}

const scripts = () => [...document.head.querySelectorAll('script[src*="turnstile"]')] as HTMLScriptElement[]

beforeEach(() => {
  delete window.turnstile
  for (const s of scripts()) s.remove()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('TurnstileWidget when the check doesn’t come', () => {
  it('says so when the script fails to load, and Try again fetches it again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { default: TurnstileWidget } = await load()
    render(<TurnstileWidget onVerify={() => {}} />)
    expect(screen.queryByRole('alert')).toBeNull()

    await act(async () => scripts()[0].onerror!(new Event('error')))
    expect(screen.getByRole('alert').textContent).toContain('The spam check didn’t load.')
    expect(scripts()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(scripts()).toHaveLength(1)

    // This time it loads, and the check renders.
    const render_ = vi.fn(() => 'w1')
    window.turnstile = { render: render_, remove: vi.fn(), reset: vi.fn() }
    await act(async () => scripts()[0].onload!(new Event('load')))
    expect(render_).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says so when the script still isn’t there after the wait', async () => {
    vi.useFakeTimers()
    const { default: TurnstileWidget, LOAD_WAIT_MS } = await load()
    render(<TurnstileWidget onVerify={() => {}} />)
    act(() => void vi.advanceTimersByTime(LOAD_WAIT_MS - 1))
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => void vi.advanceTimersByTime(1))
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('says so when Cloudflare reports the challenge failed, and Try again runs it again', async () => {
    let opts: Opts | undefined
    const reset = vi.fn()
    window.turnstile = { render: vi.fn((_el: HTMLElement, o: Record<string, unknown>) => ((opts = o as Opts), 'w1')), remove: vi.fn(), reset }
    const onVerify = vi.fn()
    const { default: TurnstileWidget } = await load()
    render(<TurnstileWidget onVerify={onVerify} />)
    await act(async () => {})
    expect(opts).toBeDefined()

    act(() => opts!['error-callback']())
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(onVerify).toHaveBeenLastCalledWith('')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledWith('w1')
    expect(screen.queryByRole('alert')).toBeNull()

    act(() => opts!.callback('token'))
    expect(onVerify).toHaveBeenLastCalledWith('token')
  })

  it('renders nothing at all without a site key', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')
    const { default: TurnstileWidget } = await import('./TurnstileWidget')
    const { container } = render(<TurnstileWidget onVerify={() => {}} />)
    expect(container.innerHTML).toBe('')
    expect(scripts()).toHaveLength(0)
  })
})
