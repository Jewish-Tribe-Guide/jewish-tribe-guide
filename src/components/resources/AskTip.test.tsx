// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { tipStillOffered } from '@/lib/browsingTips'
import AskTip from './AskTip'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery Stores', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
const whatsapp = makeCategory({ id: 'whatsapp', label: 'WhatsApp Group', pluralLabel: 'WhatsApp Groups' })
const stores = [makeListing({ id: 'a', m: ['Challah'] }), makeListing({ id: 'b', name: 'Other Grocery', m: ['Challah', 'Wine'] })]

function visit(category = grocery, items = stores) {
  const view = renderWithProviders(<AskTip category={category} items={items} />, { content: { categories: [grocery, whatsapp] } })
  return view
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('AskTip', () => {
  it('suggests a question this page answers, opening it answered', async () => {
    visit()
    const link = await screen.findByRole('link', { name: '“Where can I get challah?”' })
    expect(link.getAttribute('href')).toBe('/test-community/ask/where-can-i-get-challah')
  })

  it('shows on the first two visits only', async () => {
    visit()
    expect(await screen.findByTestId('ask-tip')).toBeTruthy()
    cleanup()
    visit()
    expect(await screen.findByTestId('ask-tip')).toBeTruthy()
    cleanup()
    visit()
    expect(screen.queryByTestId('ask-tip')).toBeNull()
  })

  it('goes away for good when dismissed', async () => {
    visit()
    await userEvent.click(await screen.findByRole('button', { name: 'Hide this tip' }))
    expect(screen.queryByTestId('ask-tip')).toBeNull()
    expect(tipStillOffered()).toBe(false)
  })

  it('stops once tapped', async () => {
    visit()
    const link = await screen.findByRole('link', { name: /Where can I get challah/ })
    link.addEventListener('click', (e) => e.preventDefault())
    await userEvent.click(link)
    expect(tipStillOffered()).toBe(false)
  })

  it('doesn’t use up a visit on a page with nothing to suggest', async () => {
    visit(whatsapp, [makeListing({ id: 'w', category: 'whatsapp' })])
    expect(screen.queryByTestId('ask-tip')).toBeNull()
    cleanup()
    visit()
    expect(await screen.findByTestId('ask-tip')).toBeTruthy()
    cleanup()
    visit()
    expect(await screen.findByTestId('ask-tip')).toBeTruthy()
  })

  it('doesn’t suggest a question that finds nothing', () => {
    // Noon, and the only stores open for a minute at 3 AM: "Grocery stores
    // open now" and "…open today" would both answer no.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 24, 12, 0))
    const withHours = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery Stores', detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }] })
    const allWeek = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '03:00', close: '03:01' }]))
    visit(withHours, [makeListing({ id: 'a', hours: allWeek }), makeListing({ id: 'b', name: 'B', hours: allWeek })])
    vi.useRealTimers()
    expect(screen.queryByTestId('ask-tip')).toBeNull()
    expect(tipStillOffered()).toBe(true)
  })
})
