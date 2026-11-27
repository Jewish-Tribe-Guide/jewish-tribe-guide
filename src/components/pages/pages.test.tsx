// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import AboutDocument from './AboutDocument'
import PrivacyDocument from './PrivacyDocument'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { ScreenHeaderProvider, useScreenHeader } from '@/lib/headerVisibility'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/about',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => cleanup())

function HeaderProbe() {
  const header = useScreenHeader()
  return header && <button data-testid="header-back" onClick={header.onBack}>‹ {header.title}</button>
}

const ABOUT =
  '<p>Everything a community needs.</p>' +
  '<h2>What sets it apart</h2><ul><li><strong>One community, done properly</strong> In depth.</li><li><strong>Anyone can fix anything</strong> No account.</li></ul>' +
  '<h2>The problem</h2><p>Answers live in group chats.</p>' +
  '<h2>Who it’s for</h2><ul><li><strong>Living here</strong> Tonight’s minyan.</li><li><strong>Visiting</strong> Where to eat.</li></ul>' +
  '<h2>Who runs it</h2><p>Two people. Questions: <a href="mailto:hi@guide.org">hi@guide.org</a></p>'

const PRIVACY =
  '<h2>The short version</h2><ul><li><strong>No account.</strong> Use it all.</li><li><strong>Nothing sold, no ads.</strong> None.</li></ul>' +
  '<h2>What you tell us</h2><ul><li><strong>Searches.</strong> Counted.</li></ul><p>That’s all.</p>' +
  '<h2>Asking us</h2><p>Email us.</p>'

const renderAbout = (body = ABOUT) =>
  renderWithProviders(
    <ScreenHeaderProvider>
      <AboutDocument title="About the guide" eyebrow="158 places · 14 categories" body={body} />
      <HeaderProbe />
    </ScreenHeaderProvider>,
  )

const renderPrivacy = (body = PRIVACY) =>
  renderWithProviders(
    <ScreenHeaderProvider>
      <PrivacyDocument title="Privacy and terms" updated="Updated November 15, 2026" body={body} />
      <HeaderProbe />
    </ScreenHeaderProvider>,
  )

describe('About and Privacy — what they share', () => {
  it.each([['About the guide', renderAbout], ['Privacy and terms', renderPrivacy]] as const)(
    '%s: the title in the phone header, back going home, and on the photo on a computer',
    (title, render) => {
      render()
      expect(screen.getByTestId('header-back')).toHaveTextContent(`‹ ${title}`)
      screen.getByTestId('header-back').click()
      expect(mockRouter.push).toHaveBeenCalledWith('/test-community', expect.anything())
      expect(within(screen.getByTestId('category-hero')).getAllByRole('heading', { level: 1 })[0]).toHaveTextContent(title)
      expect(within(screen.getByTestId('page-document')).getByRole('heading', { level: 1, name: title })).toHaveClass('sr-only', 'desktop:hidden')
    },
  )

  it.each([['About', renderAbout], ['Privacy', renderPrivacy]] as const)('%s never renders the body unsanitized', (_, render) => {
    const { container } = render('<p>x</p><h2 onclick="x()">Hi</h2><script>alert(1)</script><ul><li><strong onclick="y()">A</strong> b</li></ul>')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[onclick]')).toBeNull()
  })

  it.each([['About', renderAbout], ['Privacy', renderPrivacy]] as const)('%s shows a body with no headings at all', (_, render) => {
    render('Just a line.')
    expect(within(screen.getByTestId('page-document')).getByText('Just a line.')).toBeInTheDocument()
  })
})

describe('AboutDocument (board “About v2”)', () => {
  it('opens with the count and the mission', () => {
    renderAbout()
    expect(within(screen.getByTestId('category-hero')).getAllByText('158 places · 14 categories').length).toBeGreaterThan(0)
    expect(screen.getByText('Everything a community needs.')).toBeInTheDocument()
  })

  // Laid out as Privacy is (the user, Nov 26: "two things that are pretty
  // similar type of pages looking different"; boards A1 and B3).
  it('opens its first section with the points as icon rows, as Privacy’s short version', () => {
    renderAbout()
    const first = screen.getByRole('region', { name: 'What sets it apart' })
    expect(within(first).getAllByRole('listitem').map((li) => [li.textContent, li.querySelectorAll('svg').length])).toEqual([
      ['One community, done properlyIn depth.', 1],
      ['Anyone can fix anythingNo account.', 1],
    ])
    // A row's bold line, as Privacy's, not a card's heading.
    expect(within(first).queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    expect(within(first).getAllByRole('listitem').map((li) => li.querySelector('strong')?.textContent)).toEqual(['One community, done properly', 'Anyone can fix anything'])
    expect(within(first).queryByRole('button')).not.toBeInTheDocument()
  })

  it('on a phone, folds the rest under “More about the guide”, as rows that open', () => {
    renderAbout()
    expect(screen.getByText('More about the guide')).toBeInTheDocument()
    const row = screen.getByRole('button', { name: 'The problem' })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('the-problem-body')).toHaveClass('page-row-closed')
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Who it’s for' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('lists every section and the ways to help beside the page, linked to them', () => {
    renderAbout()
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['What sets it apart', '#what-sets-it-apart'],
      ['The problem', '#the-problem'],
      ['Who it’s for', '#who-its-for'],
      ['Who runs it', '#who-runs-it'],
      ['Ways to help', '#ways-to-help'],
    ])
    for (const id of ['what-sets-it-apart', 'the-problem', 'who-its-for', 'who-runs-it', 'ways-to-help']) expect(document.getElementById(id)).not.toBeNull()
  })

  it('puts the ways to help in one box, as rows', () => {
    renderAbout()
    const help = screen.getByRole('region', { name: 'Ways to help' })
    const rows = [within(help).getByRole('button', { name: /Know something/ }), ...within(help).getAllByRole('link')]
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map((r) => r.parentElement)).size).toBe(1)
    // Rows in the box, not cards of their own (HELP_CARD's border and corners).
    for (const r of rows) expect(r.className).not.toMatch(/rounded-2xl|\bborder\b/)
    expect(help.className).toMatch(/rounded-2xl/)
  })

  it('emails the address the text gives, from the whole card', () => {
    renderAbout()
    const help = screen.getByRole('region', { name: 'Ways to help' })
    expect(within(help).getByRole('link', { name: /Help run the guide/ })).toHaveAttribute('href', 'mailto:hi@guide.org?subject=Helping%20run%20the%20guide')
    expect(within(help).getByRole('link', { name: /Start a guide for your community/ })).toHaveAttribute('href', expect.stringMatching(/^mailto:hi@guide\.org\?/))
    expect(within(help).getByRole('button', { name: /Know something we don’t\?/ })).toBeInTheDocument()
  })

  // Live's About had no headings when this shipped: its several paragraphs
  // must not all come out as the 32px mission line.
  it('draws text with no headings as a plain box, not the large opening line', () => {
    renderAbout('<p>One.</p><p>Two.</p>')
    expect(screen.queryByTestId('page-lead')).not.toBeInTheDocument()
    expect(screen.getByTestId('page-plain')).toHaveTextContent('One.Two.')
  })

  it('leaves out the email cards when the text gives no address', () => {
    renderAbout(ABOUT.replace(/<a [^>]*>[^<]*<\/a>/, 'us'))
    expect(screen.queryByRole('link', { name: /Help run the guide/ })).not.toBeInTheDocument()
  })
})

describe('PrivacyDocument (board “Privacy and terms”)', () => {
  it('shows the short version first, its points with an icon each', () => {
    renderPrivacy()
    const short = screen.getByRole('region', { name: 'The short version' })
    expect(within(short).getAllByRole('listitem').map((li) => [li.textContent, li.querySelectorAll('svg').length])).toEqual([
      ['No account.Use it all.', 1],
      ['Nothing sold, no ads.None.', 1],
    ])
    expect(screen.getAllByText('Updated November 15, 2026').length).toBeGreaterThan(0)
  })

  it('lists every section beside the page, linked to it', () => {
    renderPrivacy()
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['The short version', '#the-short-version'],
      ['What you tell us', '#what-you-tell-us'],
      ['Asking us', '#asking-us'],
    ])
    for (const id of ['the-short-version', 'what-you-tell-us', 'asking-us']) expect(document.getElementById(id)).not.toBeNull()
  })

  it('on a phone, a detail row opens and closes, one at a time, with its text in the page throughout', () => {
    renderPrivacy()
    const tell = screen.getByRole('button', { name: 'What you tell us' })
    const ask = screen.getByRole('button', { name: 'Asking us' })
    const body = (b: HTMLElement) => document.getElementById(b.getAttribute('aria-controls')!)!
    expect(tell).toHaveAttribute('aria-expanded', 'false')
    expect(body(tell)).toHaveClass('page-row-closed')
    expect(body(tell)).toHaveTextContent('Searches. Counted.')
    fireEvent.click(tell)
    expect(tell).toHaveAttribute('aria-expanded', 'true')
    expect(body(tell)).not.toHaveClass('page-row-closed')
    fireEvent.click(ask)
    expect(tell).toHaveAttribute('aria-expanded', 'false')
    expect(ask).toHaveAttribute('aria-expanded', 'true')
  })

  // .rich-text ul sets disc outside Tailwind's layers, so a plain list-none
  // loses to it and the bullets stay (found on the built page, Nov 15).
  it('draws a list with bold leads without bullets, and keeps the text after it', () => {
    renderPrivacy()
    const tell = document.getElementById('what-you-tell-us')!
    expect(within(tell).getByRole('list')).toHaveClass('!list-none')
    expect(within(tell).getByText('That’s all.')).toBeInTheDocument()
  })

  // Hiding a closed row is plain CSS, so this reads the stylesheet: the rule
  // must sit only inside the not-a-computer media query, or a computer's
  // sections, which have no row to open, would be hidden for good.
  it('hides a closed row below the desktop size only', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    const at = css.indexOf('.page-row-closed {')
    expect(at).toBeGreaterThan(-1)
    expect(css.indexOf('.page-row-closed {', at + 1)).toBe(-1)
    const query = css.lastIndexOf('@media', at)
    expect(css.slice(query, at)).toMatch(/^@media not \(\(min-width: 640px\) and \(min-height: 640px\)\) \{\s*$/)
  })
})
