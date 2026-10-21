// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { Finding } from '@/lib/watchFindings'
import FindingCompare, { decidedLine, findingSummary, type Decision } from './FindingCompare'

vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

// Lower Merion's mikvah, as its page read on Oct 21 (step 6, board 4).
const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 's1',
  operation: 'update',
  targetId: 'lmc',
  name: 'Lower Merion Community Mikvah',
  from: 'its website',
  says: 'Its page says',
  named: null,
  at: '2026-10-21T10:00:00Z',
  notes: ['From their website, read Oct 21: https://lmcmikvah.org/'],
  lines: [
    { key: 'women_s_hours', label: 'Women’s hours', before: 'Sun–Thu 8:30–10:30 PM', after: 'Sun–Thu 7:30–9:30 PM', choosable: true },
    { key: 'call_before', label: 'Call before', before: '10:00 PM', after: '9:00 PM', choosable: true },
    { key: 'k', label: 'Keystone-K page', before: '—', after: 'https://keystone-k.org/kosher/lmc/', choosable: false },
  ],
  ...over,
})

const sent: Record<string, unknown>[] = []
function renderIt(f: Finding, decided?: Decision) {
  const onDecided = vi.fn()
  vi.mocked(fetchJson).mockImplementation(async (_url, init) => {
    sent.push({ url: String(_url), ...JSON.parse(String(init?.body)) })
    return { ok: true }
  })
  renderWithProviders(<FindingCompare finding={f} token="tok" community="philly" jobName="Mikvah hours" decided={decided} onDecided={onDecided} />, { community: { slug: 'philly' } })
  return onDecided
}

afterEach(() => {
  sent.length = 0
  cleanup()
  vi.mocked(fetchJson).mockReset()
})

describe('FindingCompare', () => {
  it('closed, it says the first change in a line, and Compare opens it', async () => {
    renderIt(finding())
    expect(screen.getByTestId('finding')).toHaveTextContent('Women’s hours: its page says Sun–Thu 7:30–9:30 PM. The listing says Sun–Thu 8:30–10:30 PM. And 2 more.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Compare' }))
    const box = screen.getByRole('region', { name: 'Lower Merion Community Mikvah: what its website says' })
    expect(box).toHaveTextContent('From its website, read Oct 21')
    expect(within(box).getAllByTestId('finding-line')).toHaveLength(3)
    // On a phone it's its own screen, with the way back to the job page.
    expect(within(box).getByRole('button', { name: '‹ Mikvah hours' })).toBeInTheDocument()
    expect(box).toHaveTextContent('Updating dates the listing as confirmed today.')
  })

  it('a tick per line: unticking one makes it Update 1, and only the ticked are sent', async () => {
    const onDecided = renderIt(finding())
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Compare' }))
    // The line the admin's copy can't carry has no tick; it comes with the rest.
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Update 3 on the listing' })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Call before' }))
    await user.click(screen.getByRole('button', { name: 'Update 2 on the listing' }))
    expect(sent).toEqual([{ url: '/api/admin/submissions/s1?community=philly', status: 'approved', only: ['women_s_hours'] }])
    expect(onDecided).toHaveBeenCalledWith('approved')
  })

  it('everything ticked sends a plain approval; nothing ticked can’t be sent', async () => {
    renderIt(finding({ lines: finding().lines.slice(0, 1) }))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Compare' }))
    await user.click(screen.getByRole('checkbox', { name: 'Women’s hours' }))
    expect(screen.getByRole('button', { name: 'Update 0 on the listing' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Women’s hours' }))
    await user.click(screen.getByRole('button', { name: 'Update 1 on the listing' }))
    expect(sent).toEqual([{ url: '/api/admin/submissions/s1?community=philly', status: 'approved' }])
  })

  it('a line that would empty the listing starts unticked, so Update leaves it as the listing says', async () => {
    renderIt(finding({ lines: [...finding().lines.slice(0, 1), { key: 'main_dishes', label: 'Main dishes', before: 'Omelettes, Soups', after: '—', choosable: true, empties: true }] }))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Compare' }))
    expect(screen.getByRole('checkbox', { name: 'Main dishes' })).not.toBeChecked()
    expect(screen.getByText(/^Empty in what was read\. Tick it to empty the listing’s too\.$/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Update 1 on the listing' }))
    expect(sent).toEqual([{ url: '/api/admin/submissions/s1?community=philly', status: 'approved', only: ['women_s_hours'] }])
  })

  it('Skip for now rejects it', async () => {
    const onDecided = renderIt(finding())
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Compare' }))
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(sent).toEqual([{ url: '/api/admin/submissions/s1?community=philly', status: 'rejected' }])
    expect(onDecided).toHaveBeenCalledWith('rejected')
  })

  it('a failed save says so and decides nothing', async () => {
    const onDecided = renderIt(finding())
    vi.mocked(fetchJson).mockRejectedValue(new Error('The listing this changes couldn’t be found.'))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Compare' }))
    await user.click(screen.getByRole('button', { name: 'Update 3 on the listing' }))
    expect(await screen.findByText('The listing this changes couldn’t be found.')).toBeInTheDocument()
    expect(onDecided).not.toHaveBeenCalled()
  })

  it('a named source is said, and a removal or a new place says what Update does', async () => {
    renderIt(finding({ from: 'Refuah', says: 'Refuah says', named: 'Refuah' }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Compare' }))
    expect(screen.getByText('Updating dates the listing as confirmed by Refuah today.')).toBeInTheDocument()
    cleanup()
    renderIt(finding({ operation: 'delete', lines: [], notes: ['Not on Keystone-K’s list any more.'], from: 'Keystone-K’s list' }))
    expect(screen.getByTestId('finding')).toHaveTextContent('Not on Keystone-K’s list any more.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Compare' }))
    expect(screen.getByRole('button', { name: 'Take it off the guide' })).toBeInTheDocument()
    expect(screen.getByText('It’s archived, and can be restored.')).toBeInTheDocument()
  })

  it('decided, it says what deciding did, in place of the box', () => {
    renderIt(finding(), 'rejected')
    expect(screen.getByTestId('finding-decided')).toHaveTextContent('Skipped. Not shown again unless its website says something new.')
    expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull()
  })
})

it('findingSummary and decidedLine, for each kind of finding', () => {
  expect(findingSummary(finding({ operation: 'create', targetId: null }))).toBe('Suggested as a new listing, from its website.')
  expect(findingSummary(finding({ lines: [] }))).toBe('Its website suggests a change to the listing.')
  expect(findingSummary(finding({ lines: finding().lines.slice(0, 1), says: 'Refuah says' }))).toBe('Women’s hours: Refuah says Sun–Thu 7:30–9:30 PM. The listing says Sun–Thu 8:30–10:30 PM.')
  // A whole schedule isn't quoted in a line.
  const week = 'Shacharis · Mon, Thu · 6:45am\nShacharis · Tue, Wed, Fri · 6:55am\nMincha & Maariv · Sun–Thu · 15 min before Sunset · Summer only'
  expect(findingSummary(finding({ lines: [{ key: 'minyanim', label: 'Davening Times', before: week, after: `${week}\nMincha & Maariv · Fri · 7:00 PM`, choosable: true }] }))).toBe(
    'Davening Times: its page says something different from the listing.',
  )
  // Led by what it says, not by a line it would empty.
  expect(findingSummary(finding({ lines: [{ key: 'main_dishes', label: 'Main dishes', before: 'Omelettes', after: '—', choosable: true, empties: true }, ...finding().lines.slice(0, 1)] }))).toBe(
    'Women’s hours: its page says Sun–Thu 7:30–9:30 PM. The listing says Sun–Thu 8:30–10:30 PM. And 1 more.',
  )
  expect(decidedLine(finding(), 'approved')).toBe('Updated on the listing.')
  expect(decidedLine(finding({ operation: 'create' }), 'approved')).toBe('Added to the guide.')
  expect(decidedLine(finding({ operation: 'delete' }), 'approved')).toBe('Taken off the guide. It’s archived, and can be restored.')
})
