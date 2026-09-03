// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { FieldEditor } from './CategoryFieldEditor'
import type { CategoryField } from '@/lib/categories'

afterEach(() => cleanup())

// Real bug: onNameChange used to freeze the auto-derived key the moment
// `f.key` became non-empty — which, checked fresh on every keystroke,
// happened after the very FIRST character typed (that one character's own
// slugified key is already non-empty). Typing "Type" into a brand-new field
// saved { key: 't', label: 'Type' } — the value ended up stored under
// details.t, invisible everywhere that resolves by the field's real key
// (the moderation queue diff, the notification email), recoverable only
// through their raw-leftover-key fallback, which showed the field as "t"
// rather than "Type".

function newField(): CategoryField {
  return { key: '', label: '', type: 'text', renderAs: 'row' }
}

describe('FieldEditor — auto-deriving a new field\'s key from its name', () => {
  it('keeps tracking the key through every keystroke while the field is still new and focused', async () => {
    const user = userEvent.setup()
    let latestField: CategoryField = newField()
    function Spy() {
      const [field, setField] = useState(latestField)
      latestField = field
      return (
        <FieldEditor
          field={field}
          index={0}
          total={1}
          canRequire
          audienceOptions={[]}
          showIfOptions={[]}
          badgeFieldOptions={[]}
          onChange={(patch) => setField((f) => { latestField = { ...f, ...patch }; return latestField })}
          onRemove={() => {}}
          onMove={() => {}}
          hasCaveat={false}
          onToggleCaveat={() => {}}
        />
      )
    }
    render(<Spy />)

    await user.type(screen.getByPlaceholderText(/grades served/i), 'Type')

    expect(latestField.key).toBe('type')
    expect(latestField.label).toBe('Type')
  })

  it('freezes the key on blur, so a later rename in the same session never changes it', async () => {
    const user = userEvent.setup()
    let latestField: CategoryField = newField()
    function Spy() {
      const [field, setField] = useState(latestField)
      latestField = field
      return (
        <FieldEditor
          field={field}
          index={0}
          total={1}
          canRequire
          audienceOptions={[]}
          showIfOptions={[]}
          badgeFieldOptions={[]}
          onChange={(patch) => setField((f) => { latestField = { ...f, ...patch }; return latestField })}
          onRemove={() => {}}
          onMove={() => {}}
          hasCaveat={false}
          onToggleCaveat={() => {}}
        />
      )
    }
    render(<Spy />)

    const input = screen.getByPlaceholderText(/grades served/i)
    await user.type(input, 'Type')
    expect(latestField.key).toBe('type')

    await user.tab() // blur
    await user.clear(input)
    await user.type(input, 'Category Type')

    expect(latestField.label).toBe('Category Type')
    // Frozen at what it was on blur, not re-derived from the new name.
    expect(latestField.key).toBe('type')
  })

  it('never auto-derives the key for a field that already had one on mount (an existing, previously-saved field)', async () => {
    const user = userEvent.setup()
    let latestField: CategoryField = { key: 'grades', label: 'Grades', type: 'text', renderAs: 'row' }
    function Spy() {
      const [field, setField] = useState(latestField)
      latestField = field
      return (
        <FieldEditor
          field={field}
          index={0}
          total={1}
          canRequire
          audienceOptions={[]}
          showIfOptions={[]}
          badgeFieldOptions={[]}
          onChange={(patch) => setField((f) => { latestField = { ...f, ...patch }; return latestField })}
          onRemove={() => {}}
          onMove={() => {}}
          hasCaveat={false}
          onToggleCaveat={() => {}}
        />
      )
    }
    render(<Spy />)

    const input = screen.getByPlaceholderText(/grades served/i)
    await user.clear(input)
    await user.type(input, 'Grade Levels')

    expect(latestField.label).toBe('Grade Levels')
    expect(latestField.key).toBe('grades')
  })
})
