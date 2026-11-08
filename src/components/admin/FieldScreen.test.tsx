// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import FieldScreen from './FieldScreen'
import type { CategoryField } from '@/lib/categories'

const foodType: CategoryField = {
  key: 'food_type',
  label: 'Food Type',
  type: 'select',
  help: 'Pick all that fit',
  options: ['Meat', 'Dairy', 'Parve'].map((v) => ({ value: v, label: v })),
  filterable: true,
  renderAs: 'badge',
  multiSelect: true,
}

function Screen({ field, onRemove = vi.fn(), canRequire = true }: { field: CategoryField; onRemove?: () => void; canRequire?: boolean }) {
  const [f, setF] = useState(field)
  return (
    <>
      <FieldScreen field={f} pageName="Food" canRequire={canRequire} onChange={(p) => setF({ ...f, ...p })} onRemove={onRemove} onBack={vi.fn()} />
      <output data-testid="field">{JSON.stringify(f)}</output>
    </>
  )
}
afterEach(cleanup)

const saved = () => JSON.parse(screen.getByTestId('field').textContent!) as CategoryField
const box = (name: string) => screen.getByRole('region', { name })

// Canvas row "Each kind of field" (Nov 7): a ready-made field reads like a
// shop listing. What it is first; what a page can change second.
describe('FieldScreen — a ready-made field', () => {
  it('says what it is first, then what you can change, each a switch at its setting', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<Screen field={foodType} onRemove={onRemove} />)
    expect(screen.getByRole('heading', { name: /^Food Type\s*Choices$/ })).toBeInTheDocument()
    const what = box('What this is')
    expect(what).toHaveTextContent('Whether a place is meat, dairy or parve.')
    expect(within(within(what).getByRole('list', { name: 'Choices' })).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['Meat', 'Dairy', 'Parve'])
    // Its name, note and choices are baked in.
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Note under it, on Add a place')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Dairy' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    // The box of what can change comes after, at its settings.
    const change = box('What you can change')
    expect(what.compareDocumentPosition(change) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(change).getByRole('switch', { name: 'Required' })).toHaveAttribute('aria-checked', 'false')
    expect(within(change).getByRole('switch', { name: 'In the filter' })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(change).getByRole('switch', { name: 'Required' }))
    expect(saved().required).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Remove from Food' }))
    expect(onRemove).toHaveBeenCalled()
  })

  it('takes a choice of the page’s own, which only it can remove', async () => {
    const user = userEvent.setup()
    render(<Screen field={foodType} />)
    await user.click(screen.getByRole('button', { name: '+ Add a choice' }))
    await user.type(screen.getByRole('textbox', { name: 'New choice' }), 'Fish{Enter}')
    expect(saved().options).toEqual([...foodType.options!, { value: 'Fish', label: 'Fish', own: true }])
    // Not one of the field's own choices: it's listed under what you changed.
    expect(within(box('What this is')).queryByText('Fish')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Remove Fish' }))
    expect(saved().options).toEqual(foodType.options)
  })

  it('a yes or no in the filter is a chip at the top; no “required” where nobody adds', async () => {
    const user = userEvent.setup()
    render(<Screen field={{ key: 'shabbat', label: 'Shabbat friendly', type: 'boolean', renderAs: 'row' }} canRequire={false} />)
    expect(screen.queryByRole('switch', { name: 'Required' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'In the filter' }))
    expect(saved()).toMatchObject({ filterable: true, renderAs: 'badge' })
  })

  it('says so when a page has nothing to change', () => {
    render(<Screen field={{ key: 'minyanim', label: 'Davening Times (Minyanim)', type: 'minyanim', renderAs: 'row' }} />)
    expect(within(box('What this is')).getByRole('list', { name: 'Comes with' })).toHaveTextContent(/Usual weekday times.*Usual Shabbos times.*This week’s schedule/)
    expect(box('What you can change')).toHaveTextContent('Nothing. It works the same on every page.')
  })

  it('asks a link nothing about its button: that comes with it', () => {
    render(<Screen field={{ key: 'join', label: 'Join group', type: 'url', linkLabel: 'Join' }} />)
    expect(screen.queryByLabelText('What should the button say?')).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Required' })).toBeInTheDocument()
  })

  it('folds a superadmin’s other settings under More', async () => {
    const user = userEvent.setup()
    render(<FieldScreen field={foodType} pageName="Food" canRequire onChange={vi.fn()} onRemove={vi.fn()} onBack={vi.fn()} more={<p>Only for some places</p>} />)
    expect(screen.queryByText('Only for some places')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByText('Only for some places')).toBeInTheDocument()
  })
})

// Board 13 (Nov 5): one made here with Make your own is the page's to define.
describe('FieldScreen — a field made here', () => {
  const own = { ...foodType, madeHere: true }

  it('has Basics, the choices as rows, Other as a switch and the kind’s questions as No / Yes', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<Screen field={own} onRemove={onRemove} />)
    expect(screen.getByRole('heading', { name: /^Food Type\s*Choices$/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Note under it, on Add a place')).toHaveValue('Pick all that fit')
    expect(screen.queryByRole('region', { name: 'What this is' })).not.toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Can a place be both Meat and Dairy?' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Should it be part of the filter?' })).toBeInTheDocument()
    // A choice off, one added, Other on, one choice only.
    await user.click(screen.getByRole('button', { name: 'Remove Dairy' }))
    await user.click(screen.getByRole('button', { name: '+ Add a choice' }))
    await user.type(screen.getByRole('textbox', { name: 'New choice' }), 'Fish{Enter}')
    await user.click(screen.getByRole('switch', { name: 'Other, a box to type in' }))
    await user.click(within(screen.getByRole('radiogroup', { name: 'Can a place be both Meat and Parve?' })).getByRole('radio', { name: 'No' }))
    const f = saved()
    expect(f.options!.map((o) => o.label)).toEqual(['Meat', 'Parve', 'Fish'])
    expect(f.allowOther).toBe(true)
    expect(f.multiSelect).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Remove from Food' }))
    expect(onRemove).toHaveBeenCalled()
  })

  it('names a new field’s key after it until the name is left, and never renames a saved one’s', async () => {
    const user = userEvent.setup()
    render(<Screen field={{ key: '', label: '', type: 'text', madeHere: true }} />)
    await user.type(screen.getByLabelText('Name'), 'Parking')
    expect(saved()).toMatchObject({ key: 'parking', label: 'Parking' })
    await user.tab()
    await user.type(screen.getByLabelText('Name'), ' lot')
    expect(saved()).toMatchObject({ key: 'parking', label: 'Parking lot' })
  })

  it('asks a link what its button says, and nothing about choices or the filter', () => {
    render(<Screen field={{ key: 'join', label: 'Join group', type: 'url', madeHere: true }} />)
    expect(screen.getByLabelText('What should the button say?')).toBeInTheDocument()
    expect(screen.queryByText('Choices', { selector: 'h2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Should it be part of the filter?' })).not.toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Is it a required field?' })).toBeInTheDocument()
  })
})
