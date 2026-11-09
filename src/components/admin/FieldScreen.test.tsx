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

  // The user, Nov 9: "some fields have no edit and some have edit. If you
  // can edit then you can fully edit."
  it('lets a page fully edit choices that are its own: rename, remove, add, Other', async () => {
    const user = userEvent.setup()
    const opts = ['IKC', 'Tartikov', 'OU'].map((v) => ({ value: v, label: v }))
    render(<Screen field={{ key: 'kosherCert', label: 'Kosher Certification', type: 'select', allowOther: true, options: opts }} />)
    // The list is the choices box, not chips in What this is.
    expect(within(box('What this is')).queryByRole('list', { name: 'Choices' })).toBeNull()
    const choices = box('Choices')
    // A rename changes only the words; places keep the stored value.
    const name = within(choices).getByRole('textbox', { name: 'Rename IKC' })
    await user.clear(name)
    await user.type(name, 'IKC (Philadelphia){Enter}')
    expect(saved().options![0]).toEqual({ value: 'IKC', label: 'IKC (Philadelphia)' })
    // Left empty, or the same as another, it goes back.
    const ou = within(choices).getByRole('textbox', { name: 'Rename OU' })
    await user.clear(ou)
    await user.type(ou, 'tartikov{Enter}')
    expect(ou).toHaveValue('OU')
    expect(saved().options![2]).toEqual({ value: 'OU', label: 'OU' })
    await user.click(within(choices).getByRole('button', { name: 'Remove Tartikov' }))
    await user.click(within(choices).getByRole('button', { name: '+ Add a choice' }))
    await user.type(within(choices).getByRole('textbox', { name: 'New choice' }), 'Star-K{Enter}')
    expect(saved().options).toEqual([{ value: 'IKC', label: 'IKC (Philadelphia)' }, { value: 'OU', label: 'OU' }, { value: 'Star-K', label: 'Star-K', own: true }])
    await user.click(within(choices).getByRole('switch', { name: 'Other, a box to type in' }))
    expect(saved().allowOther).toBe(false)
  })

  it('a yes or no in the filter is a chip at the top; no “required” where nobody adds', async () => {
    const user = userEvent.setup()
    render(<Screen field={{ key: 'shabbat', label: 'Shabbat friendly', type: 'boolean', renderAs: 'row' }} canRequire={false} />)
    expect(screen.queryByRole('switch', { name: 'Required' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'In the filter' }))
    expect(saved()).toMatchObject({ filterable: true, renderAs: 'badge' })
  })

  // The user, Nov 8: a yes or no can be required too. It starts unanswered,
  // so required means someone has to pick Yes or No.
  it('lets a yes or no be required', async () => {
    const user = userEvent.setup()
    render(<Screen field={{ key: 'shabbat', label: 'Shabbat friendly', type: 'boolean', renderAs: 'row' }} />)
    await user.click(within(box('What you can change')).getByRole('switch', { name: 'Required' }))
    expect(saved().required).toBe(true)
  })

  it('says so when a page has nothing to change', () => {
    render(<Screen field={{ key: 'liaisons', label: 'Liaisons', type: 'contacts', renderAs: 'row' }} />)
    expect(box('What you can change')).toHaveTextContent('Nothing. It works the same on every page.')
  })

  // The user, Nov 9: a community may not need every part of a minyan.
  it('lets a page turn off sign-up minyanim, join from home and summer or winter only', async () => {
    const user = userEvent.setup()
    render(<Screen field={{ key: 'minyanim', label: 'Davening Times (Minyanim)', type: 'minyanim', renderAs: 'row' }} />)
    expect(box('What this is')).toHaveTextContent('It comes with Usual weekday times, Usual Shabbos times and This week’s schedule.')
    const change = box('What you can change')
    for (const name of ['Sign-up minyanim', 'Join from home', 'Summer or winter only']) expect(within(change).getByRole('switch', { name })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(change).getByRole('switch', { name: 'Sign-up minyanim' }))
    await user.click(within(change).getByRole('switch', { name: 'Summer or winter only' }))
    expect(saved().minyanOff).toEqual(['signUp', 'season'])
    await user.click(within(change).getByRole('switch', { name: 'Sign-up minyanim' }))
    await user.click(within(change).getByRole('switch', { name: 'Summer or winter only' }))
    expect(saved().minyanOff).toBeUndefined()
  })

  // The user, Nov 9: say which watches can keep a field up to date.
  it('says what can keep it up to date', () => {
    render(<Screen field={{ key: 'kosherCert', label: 'Kosher Certification', type: 'select', options: [] }} />)
    // Part of the paragraph, its start in bold.
    const lead = within(box('What this is')).getByText('Kept up to date by')
    expect(lead.tagName).toBe('STRONG')
    expect(lead.closest('p')).toHaveTextContent(/Which hechsher.*Kept up to date by Keystone-K’s list, Mekor Habracha’s list and KCL’s list\.$/)
  })

  it('says nothing of watches for a field none can keep', () => {
    render(<Screen field={{ key: 'size', label: 'Size', type: 'select', options: [] }} />)
    expect(screen.queryByText('Kept up to date by')).toBeNull()
  })

  // The user, Nov 9: the certificate's link comes with Kosher Certification.
  it('has a switch for the field that comes with it, and says it comes with it', async () => {
    const user = userEvent.setup()
    const onPartner = vi.fn()
    const cert: CategoryField = { key: 'kosherCert', label: 'Kosher Certification', type: 'select', options: [] }
    const { rerender } = render(<FieldScreen field={cert} pageName="Food" canRequire onChange={vi.fn()} onRemove={vi.fn()} onBack={vi.fn()} partner={{ on: true, onChange: onPartner }} />)
    expect(box('What this is')).toHaveTextContent(/It comes with .*Link to the certificate\./)
    await user.click(within(box('What you can change')).getByRole('switch', { name: 'Link to the certificate' }))
    expect(onPartner).toHaveBeenCalledWith(false)
    rerender(<FieldScreen field={cert} pageName="Food" canRequire onChange={vi.fn()} onRemove={vi.fn()} onBack={vi.fn()} partner={{ on: false, onChange: onPartner }} />)
    expect(box('What this is')).not.toHaveTextContent('Link to the certificate')
    expect(within(box('What you can change')).getByRole('switch', { name: 'Link to the certificate' })).toHaveAttribute('aria-checked', 'false')
  })

  it('asks a link nothing about its button: that comes with it', () => {
    render(<Screen field={{ key: 'join', label: 'Join group', type: 'url', linkLabel: 'Join' }} />)
    expect(screen.queryByLabelText('What should the button say?')).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Required' })).toBeInTheDocument()
  })

  // The user, Nov 9: every other ready-made field's choices can't be
  // changed at all, not even added to.
  it('has nothing to change in choices that are the same everywhere', () => {
    for (const field of [foodType, { ...foodType, key: 'size', label: 'Size' }, { ...foodType, key: 'storeType', label: 'Store Type' }]) {
      render(<Screen field={field} />)
      expect(screen.queryByRole('region', { name: 'Choices' })).toBeNull()
      expect(screen.queryByRole('button', { name: '+ Add a choice' })).toBeNull()
      expect(screen.queryByRole('textbox', { name: /^Rename/ })).toBeNull()
      expect(screen.getByRole('switch', { name: 'In the filter' })).toBeInTheDocument()
      cleanup()
    }
  })

  it('turns a hechsher’s “Everything here is kosher?” off and on', async () => {
    const user = userEvent.setup()
    const cert: CategoryField = { key: 'kosherCert', label: 'Kosher Certification', type: 'select', multiSelect: true, caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' }, options: [{ value: 'OU', label: 'OU' }] }
    render(<Screen field={cert} />)
    const ask = within(box('What you can change')).getByRole('switch', { name: 'Everything here is kosher?' })
    expect(ask).toHaveAttribute('aria-checked', 'true')
    expect(box('What this is')).toHaveTextContent('It comes with Everything here is kosher? and What isn’t kosher.')
    await user.click(ask)
    expect(saved().caveat).toBeUndefined()
    expect(box('What this is')).not.toHaveTextContent('It comes with')
    expect(box('What this is')).not.toHaveTextContent('whether everything there is kosher')
    await user.click(ask)
    expect(saved().caveat).toEqual({ flagField: 'kosherPartial', noteField: 'kosherNote' })
    // Only a hechsher asks it.
    cleanup()
    render(<Screen field={foodType} />)
    expect(screen.queryByRole('switch', { name: 'Everything here is kosher?' })).toBeNull()
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

  it('renames a choice where it is, keeping what places stored', async () => {
    const user = userEvent.setup()
    render(<Screen field={{ key: 'level', label: 'Level', type: 'select', madeHere: true, options: [{ value: 'Beginner', label: 'Beginner' }] }} />)
    const name = screen.getByRole('textbox', { name: 'Rename Beginner' })
    await user.clear(name)
    await user.type(name, 'New to it{Enter}')
    expect(saved().options).toEqual([{ value: 'Beginner', label: 'New to it' }])
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
