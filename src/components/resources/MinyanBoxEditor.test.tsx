// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { Minyan } from '@/lib/davening'
import { minyanWriting } from '@/lib/minyanText'
import MinyanBoxEditor from './MinyanBoxEditor'

// South Philadelphia Shtiebel's week, read again Nov 11: every minyan came
// back under a new id, two with a note reworded. The user: "is there any
// visual way to indicate that this isn't a completely new row?"
describe('MinyanBoxEditor: a week read again', () => {
  const site: Minyan[] = [
    { id: 'a', tefillah: 'kabbalas_shabbos', days: ['fri'], time: '5:00 PM', notes: 'until 6:00 PM' },
    { id: 'b', tefillah: 'mincha', days: ['sat'], time: '4:15 PM', notes: 'until 5:28 PM; seudah shlishit' },
  ]
  const read: Minyan[] = [
    { id: 'x', tefillah: 'kabbalas_shabbos', days: ['fri'], time: '5:00 PM', notes: 'until 6:00 PM' },
    { id: 'y', tefillah: 'mincha', days: ['sat'], time: '4:15 PM', notes: 'until 5:28 PM; and seudah shlishit' },
  ]

  it('marks only the minyan whose note changed, as Changed with its old note crossed out', () => {
    render(
      <MinyanBoxEditor
        original={site}
        initial={read}
        box="shabbos"
        boxTitle="This week’s schedule"
        place="South Philadelphia Shtiebel"
        writing={minyanWriting}
        onChange={vi.fn()}
        onStep={vi.fn()}
        send={(n) => <span data-testid="send">{n}</span>}
      />,
    )
    const rows = screen.getAllByRole('button').filter((b) => /PM/.test(b.textContent ?? ''))
    const ks = rows.find((r) => /Kabbalas Shabbos/.test(r.textContent ?? ''))!
    const mincha = rows.find((r) => /Mincha/.test(r.textContent ?? ''))!
    expect(ks).not.toHaveTextContent(/New|Changed/)
    expect(mincha).toHaveTextContent('Changed')
    expect(mincha).not.toHaveTextContent('New')
    expect(within(mincha).getByText(/seudah shlishit$/, { selector: 'del' })).toHaveTextContent(/^Until 5:28 PM; seudah shlishit$/i)
    expect(screen.getByTestId('send')).toHaveTextContent('1')
  })
})
