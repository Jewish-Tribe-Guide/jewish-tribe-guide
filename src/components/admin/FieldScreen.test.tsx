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

// Board 13: Food Type, as the board draws it.
describe('FieldScreen', () => {
  it('has Basics, the choices as rows, Other as a switch and the kind’s questions as No / Yes', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<Screen field={foodType} onRemove={onRemove} />)
    expect(screen.getByRole('heading', { name: /^Food Type\s*Choices$/ })).toBeInTheDocument()
    expect(screen.getByText('Choices', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByLabelText('Note under it, on Add a place')).toHaveValue('Pick all that fit')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Remove this field' }))
    expect(onRemove).toHaveBeenCalled()
  })

  it('names a new field’s key after it until the name is left, and never renames a saved one’s', async () => {
    const user = userEvent.setup()
    render(<Screen field={{ key: '', label: '', type: 'text' }} />)
    await user.type(screen.getByLabelText('Name'), 'Parking')
    expect(saved()).toMatchObject({ key: 'parking', label: 'Parking' })
    await user.tab()
    await user.type(screen.getByLabelText('Name'), ' lot')
    expect(saved()).toMatchObject({ key: 'parking', label: 'Parking lot' })
  })

  it('asks a link what its button says, and nothing about choices or the filter', () => {
    render(<Screen field={{ key: 'join', label: 'Join group', type: 'url' }} />)
    expect(screen.getByLabelText('What should the button say?')).toBeInTheDocument()
    expect(screen.queryByText('Choices', { selector: 'h2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Should it be part of the filter?' })).not.toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Is it a required field?' })).toBeInTheDocument()
  })

  it('a yes or no in the filter is a chip at the top; no “required” where nobody adds', async () => {
    const user = userEvent.setup()
    render(<Screen field={{ key: 'shabbat', label: 'Shabbat friendly', type: 'boolean', renderAs: 'row' }} canRequire={false} />)
    expect(screen.queryByRole('radiogroup', { name: 'Is it a required field?' })).not.toBeInTheDocument()
    const filter = screen.getByRole('radiogroup', { name: 'Should it be part of the filter?' })
    await user.click(within(filter).getByRole('radio', { name: 'Yes' }))
    expect(saved()).toMatchObject({ filterable: true, renderAs: 'badge' })
  })

  it('folds a superadmin’s other settings under More', async () => {
    const user = userEvent.setup()
    render(<FieldScreen field={foodType} pageName="Food" canRequire onChange={vi.fn()} onRemove={vi.fn()} onBack={vi.fn()} more={<p>Only for some places</p>} />)
    expect(screen.queryByText('Only for some places')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByText('Only for some places')).toBeInTheDocument()
  })
})
