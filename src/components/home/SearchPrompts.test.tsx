// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import SearchPrompts from './SearchPrompts'

// jsdom lays nothing out, so each element is given a width: a chip 8px a
// letter plus 26 for its padding, "Try asking" 56, the row a phone's 343.
function phone(rowWidth = 343) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-prompt-label')) return 56
    return this.hasAttribute('data-prompt') ? (this.textContent ?? '').length * 8 + 26 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(rowWidth)
}
const shown = () => screen.getAllByRole('button').map((b) => b.textContent)

describe('SearchPrompts', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // The user, Oct 17: more on a phone, on one line that swipes sideways.
  it('on a phone, up to six in a row that scrolls sideways, every one reachable', () => {
    phone()
    const prompts = ['Next Shacharis', 'Where can I get chalav yisroel milk?', 'Kosher wine', 'Shul near me', 'Food open now', 'Mikvah open today', 'Kosher bakery']
    render(<SearchPrompts oneLine prompts={prompts} onPick={() => {}} />)
    expect(shown()).toEqual(prompts.slice(0, 6))
    for (const b of screen.getAllByRole('button')) {
      expect(b).not.toHaveAttribute('aria-hidden')
      expect(b).not.toHaveAttribute('tabindex', '-1')
    }
    expect(screen.getByTestId('search-prompts').className).toContain('overflow-x-auto')
  })

  it('on a phone, runs to the screen’s edges, so the last one shows cut off', () => {
    render(<SearchPrompts oneLine prompts={['Kosher wine', 'Shul near me']} onPick={() => {}} />)
    expect(screen.getByTestId('search-prompts').className).toMatch(/-mx-4.*px-4/)
  })

  it('on a computer, the first always, even when nothing fits beside it', () => {
    phone(300)
    render(<SearchPrompts prompts={['Where can I get chalav yisroel milk?', 'Kosher wine']} onPick={() => {}} />)
    expect(shown()).toEqual(['Where can I get chalav yisroel milk?'])
  })

  it('on a computer, three', () => {
    render(<SearchPrompts prompts={['Next Shacharis', 'Food open now', 'Kosher wine', 'Shul near me']} onPick={() => {}} />)
    expect(shown()).toEqual(['Next Shacharis', 'Food open now', 'Kosher wine'])
  })

  // The user, Oct 16: on the desktop home the third wrapped to a second
  // line. A computer keeps one line too: one that doesn't fit gives way to
  // the next that does. Friday morning's set, in the hero's 585px row.
  it('on a computer, one line: a third that doesn’t fit gives way to one that does', () => {
    phone(585)
    render(<SearchPrompts prompts={['Where can I get challah?', 'Food open now', 'Where can I get chalav yisroel milk?', 'Kosher wine']} onPick={() => {}} />)
    expect(shown()).toEqual(['Where can I get challah?', 'Food open now', 'Kosher wine'])
  })
})
