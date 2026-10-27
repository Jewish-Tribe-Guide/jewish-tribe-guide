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

// Oct 16: an admin marks the yes/no field that says a place is a minyan
// that meets somewhere, not a shul. Only a yes/no field can be one.
describe('FieldEditor — a minyan, not a shul', () => {
  function Editor({ field, onField }: { field: CategoryField; onField: (f: CategoryField) => void }) {
    const [f, setF] = useState(field)
    return (
      <FieldEditor
        field={f}
        index={0}
        total={1}
        canRequire
        audienceOptions={[]}
        showIfOptions={[]}
        badgeFieldOptions={[]}
        onChange={(patch) => setF((x) => { const next = { ...x, ...patch }; onField(next); return next })}
        onRemove={() => {}}
        onMove={() => {}}
        hasCaveat={false}
        onToggleCaveat={() => {}}
      />
    )
  }
  const label = /Yes means it’s a minyan that meets somewhere, not a shul/

  it('a yes/no field can say so, and unsay it', async () => {
    const user = userEvent.setup()
    let latest: CategoryField | null = null
    render(<Editor field={{ key: 'minyanOnly', label: 'Minyan', type: 'boolean', renderAs: 'badge' }} onField={(f) => (latest = f)} />)
    await user.click(screen.getByLabelText(label))
    expect(latest!.minyanOnly).toBe(true)
    await user.click(screen.getByLabelText(label))
    expect(latest!.minyanOnly).toBeUndefined()
  })

  it('any other field can’t', () => {
    render(<Editor field={{ key: 'notes', label: 'Notes', type: 'text', renderAs: 'row' }} onField={() => {}} />)
    expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
  })
})

// Board B, Oct 27: a link an opened listing leads with, in its own box.
describe('FieldEditor — a link that leads its own box', () => {
  it('turns on with a title, takes a field for its words, and turns off', async () => {
    const user = userEvent.setup()
    let latestField: CategoryField = { key: 'delivery_whatsapp_group', label: 'Delivery WhatsApp Group', type: 'url', renderAs: 'row' }
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
          textFieldOptions={[{ key: 'delivery_details', label: 'Delivery Details' }]}
          onChange={(patch) => setField((f) => { latestField = { ...f, ...patch }; return latestField })}
          onRemove={() => {}}
          onMove={() => {}}
          hasCaveat={false}
          onToggleCaveat={() => {}}
        />
      )
    }
    render(<Spy />)
    expect(screen.queryByLabelText('Box title')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText(/its own box first/))
    expect(latestField.leadBox).toEqual({ title: 'Delivery WhatsApp Group' })
    await user.clear(screen.getByLabelText('Box title'))
    await user.type(screen.getByLabelText('Box title'), 'Delivery')
    await user.selectOptions(screen.getByLabelText('Words in the box'), 'delivery_details')
    expect(latestField.leadBox).toEqual({ title: 'Delivery', text: 'delivery_details' })
    await user.click(screen.getByLabelText(/its own box first/))
    expect(latestField.leadBox).toBeUndefined()
  })
})
