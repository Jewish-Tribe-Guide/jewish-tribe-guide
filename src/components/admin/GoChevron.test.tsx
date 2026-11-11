// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AdminBox, AdminRow } from './AdminUI'

// The user, Nov 10: "hover for no phones and then chevron for phones",
// admin-wide. A row that opens a screen of its own shows its chevron only
// where there's no fine pointer to hover with; with a mouse, its shading
// under the pointer says it opens. Which media query hides it is CSS, which
// jsdom doesn't apply, so this checks the class; the browser check is in the
// commit that added it.
describe('a row that opens a screen', () => {
  it('hides its chevron with a mouse and shades under the pointer', () => {
    const { container } = render(<AdminRow href="/x" name="Watches" line="3 running" />)
    const chevron = container.querySelector('[data-go-chevron]')
    expect(chevron).not.toBeNull()
    expect(chevron!.className).toContain('pointer-fine:hidden')
    expect(container.querySelector('a')!.className).toContain('hover:bg-slate-100')
  })

  it('keeps the chevron of something that folds open in place, since it turns', () => {
    const { container } = render(
      <AdminBox title="Today" foldOnPhone>
        <p>Inside</p>
      </AdminBox>,
    )
    expect(container.querySelector('[aria-expanded] svg')).not.toBeNull()
    expect(container.querySelector('[data-go-chevron]')).toBeNull()
  })
})
