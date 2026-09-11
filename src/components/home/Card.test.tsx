// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Card } from './sections'
import type { CardDef } from './sections'

// Card tags its own <Link> with transitionTypes={['nav-forward']} only when
// useIsMobile() says so — see navTransitions.ts's own doc on why this check
// has to live here, at the already-mounted source of the click, rather than
// at the destination screen's own ViewTransition config (which used to read
// useIsMobile() at the exact moment it mounts fresh, when that hook's
// documented SSR-safe default — false — hadn't corrected yet). Asserting the
// tag itself isn't possible from the rendered DOM (transitionTypes isn't a
// real DOM attribute), so this spies on next/link's own call instead.
const pushMock = { current: null as ((props: Record<string, unknown>) => void) | null }
vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => {
    pushMock.current?.(props)
    const { href, children, className, onClick } = props as {
      href: string
      children: React.ReactNode
      className?: string
      onClick?: () => void
    }
    return (
      <a href={href} className={className} onClick={onClick}>
        {children}
      </a>
    )
  },
}))

function mockViewport(isMobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: isMobile,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

afterEach(() => {
  cleanup()
  pushMock.current = null
})

const card = (over: Partial<CardDef> = {}): CardDef =>
  ({
    title: 'Grocery',
    id: 'grocery',
    icon: '🛒',
    href: '/philly/grocery',
    go: () => {},
    ...over,
  }) as CardDef

describe('Card', () => {
  it('tags its Link with nav-forward on mobile', () => {
    mockViewport(true)
    let seen: Record<string, unknown> | undefined
    pushMock.current = (props) => {
      seen = props
    }
    render(<Card card={card()} tint="bg-sky-50" />)
    screen.getByText('Grocery')
    expect(seen?.transitionTypes).toEqual(['nav-forward'])
  })

  it('does not tag its Link on desktop', () => {
    mockViewport(false)
    let seen: Record<string, unknown> | undefined
    pushMock.current = (props) => {
      seen = props
    }
    render(<Card card={card()} tint="bg-sky-50" />)
    screen.getByText('Grocery')
    expect(seen?.transitionTypes).toBeUndefined()
  })
})
