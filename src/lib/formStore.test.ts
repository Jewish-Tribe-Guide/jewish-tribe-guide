import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONTACT_STEPS } from './forms'

vi.mock('next/cache', () => ({
  cacheTag: () => {},
  cacheLife: () => {},
}))

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    order: vi.fn(self),
    insert: vi.fn(self),
    update: vi.fn(self),
    delete: vi.fn(self),
    single: vi.fn(self),
    maybeSingle: vi.fn(self),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const {
  listPublishedForms,
  listFormsForAdmin,
  getFormById,
  saveDraft,
  publishDraft,
  discardDraft,
  createForm,
  deleteForm,
  setFormActive,
} = await import('./formStore')

afterEach(() => {
  mockFrom.mockReset()
})

const rawRow = {
  id: 'support',
  title: 'Support Request',
  submit_label: 'Send',
  success_title: 'Thanks',
  success_message: 'We got it.',
  steps: [{ kind: 'text', key: 'note' }],
  draft: null,
  icon: '🆘',
  card_image_url: null,
  card_text_color: null,
  active: true,
}

describe('listPublishedForms', () => {
  it('maps rows, defaulting steps/draft/icon when absent', async () => {
    const builder = chainable({
      data: [{ ...rawRow, steps: null, draft: undefined, icon: null }],
      error: null,
    })
    mockFrom.mockReturnValue(builder)

    const [form] = await listPublishedForms('philly')

    expect(form.steps).toEqual([])
    expect(form.icon).toBe('')
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(listPublishedForms('philly')).rejects.toThrow('Failed to load forms: boom')
  })

  it('excludes inactive forms', async () => {
    mockFrom.mockReturnValue(
      chainable({ data: [rawRow, { ...rawRow, id: 'hidden-form', active: false }], error: null }),
    )
    const forms = await listPublishedForms('philly')
    expect(forms.map((f) => f.id)).toEqual(['support'])
  })

  it('defaults active to true when the column is missing/undefined', async () => {
    mockFrom.mockReturnValue(chainable({ data: [{ ...rawRow, active: undefined }], error: null }))
    const [form] = await listPublishedForms('philly')
    expect(form.active).toBe(true)
  })
})

describe('setFormActive', () => {
  it('writes the active column and returns the mapped form', async () => {
    const builder = chainable({ data: { ...rawRow, id: 'event-rsvp', active: false }, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await setFormActive('philly', 'event-rsvp', false)

    expect(builder.update).toHaveBeenCalledWith({ active: false })
    expect(builder.eq).toHaveBeenCalledWith('id', 'event-rsvp')
    expect(result?.active).toBe(false)
  })

  it('returns null when the form does not exist', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    expect(await setFormActive('philly', 'missing', true)).toBeNull()
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(setFormActive('philly', 'event-rsvp', true)).rejects.toThrow('Failed to update form: boom')
  })

  it('allows hiding and re-activating the built-in support/volunteer forms', async () => {
    const hideBuilder = chainable({ data: { ...rawRow, id: 'support', active: false }, error: null })
    mockFrom.mockReturnValue(hideBuilder)
    const hideResult = await setFormActive('philly', 'support', false)
    expect(hideBuilder.update).toHaveBeenCalledWith({ active: false })
    expect(hideResult?.active).toBe(false)

    const showBuilder = chainable({ data: { ...rawRow, id: 'volunteer', active: true }, error: null })
    mockFrom.mockReturnValue(showBuilder)
    const showResult = await setFormActive('philly', 'volunteer', true)
    expect(showBuilder.update).toHaveBeenCalledWith({ active: true })
    expect(showResult?.active).toBe(true)
  })
})

describe('listFormsForAdmin', () => {
  it('returns every form including drafts', async () => {
    mockFrom.mockReturnValue(chainable({ data: [rawRow], error: null }))
    const [form] = await listFormsForAdmin('philly')
    expect(form.id).toBe('support')
  })

  it('includes inactive forms, unlike listPublishedForms', async () => {
    mockFrom.mockReturnValue(chainable({ data: [{ ...rawRow, id: 'hidden-form', active: false }], error: null }))
    const [form] = await listFormsForAdmin('philly')
    expect(form.active).toBe(false)
  })
})

describe('getFormById', () => {
  it('returns null when not found', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    expect(await getFormById('philly', 'missing')).toBeNull()
  })
})

describe('saveDraft', () => {
  it('writes the draft and touches updated_at', async () => {
    const builder = chainable({ data: rawRow, error: null })
    mockFrom.mockReturnValue(builder)

    const draft = {
      title: 'New Title',
      submitLabel: 'Go',
      successTitle: 'Done',
      successMessage: 'ok',
      steps: [],
      icon: '',
      cardImageUrl: null,
      cardTextColor: null,
    }
    await saveDraft('philly', 'support', draft)

    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ draft }))
    expect(builder.eq).toHaveBeenCalledWith('id', 'support')
  })
})

describe('publishDraft', () => {
  it('returns null when the form does not exist', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    expect(await publishDraft('philly', 'missing')).toBeNull()
  })

  it('is a no-op (returns the form as-is) when there is no draft', async () => {
    mockFrom.mockReturnValue(chainable({ data: rawRow, error: null }))
    const result = await publishDraft('philly', 'support')
    expect(result?.id).toBe('support')
    // Only the read (getFormById) happened — no write.
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('promotes draft fields to published columns and clears the draft', async () => {
    const draft = {
      title: 'Updated Title',
      submitLabel: 'Send it',
      successTitle: 'Thanks!',
      successMessage: 'ok',
      steps: [{ kind: 'text', key: 'note' }],
      icon: '  🎉  ',
      cardImageUrl: 'https://example.com/card.png',
      cardTextColor: '#123456',
    }
    const readBuilder = chainable({ data: { ...rawRow, draft }, error: null })
    const writeBuilder = chainable({ data: { ...rawRow, title: draft.title, draft: null }, error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? readBuilder : writeBuilder
    })

    await publishDraft('philly', 'support')

    expect(writeBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Updated Title',
        submit_label: 'Send it',
        icon: '🎉',
        card_image_url: 'https://example.com/card.png',
        card_text_color: '#123456',
        draft: null,
      }),
    )
  })

  it('drops the text color when there is no card image (color-without-image makes no sense)', async () => {
    const draft = {
      title: 'Updated Title',
      submitLabel: 'Send it',
      successTitle: 'Thanks!',
      successMessage: 'ok',
      steps: [],
      icon: '',
      cardImageUrl: null,
      cardTextColor: '#123456', // set, but no image
    }
    const readBuilder = chainable({ data: { ...rawRow, draft }, error: null })
    const writeBuilder = chainable({ data: rawRow, error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? readBuilder : writeBuilder
    })

    await publishDraft('philly', 'support')

    expect(writeBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ card_image_url: null, card_text_color: null }),
    )
  })

  it('throws with the Supabase error message when the write fails', async () => {
    const draft = {
      title: 'X',
      submitLabel: 'X',
      successTitle: 'X',
      successMessage: 'X',
      steps: [],
      icon: '',
      cardImageUrl: null,
      cardTextColor: null,
    }
    const readBuilder = chainable({ data: { ...rawRow, draft }, error: null })
    const writeBuilder = chainable({ data: null, error: { message: 'boom' } })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? readBuilder : writeBuilder
    })

    await expect(publishDraft('philly', 'support')).rejects.toThrow('Failed to publish form: boom')
  })
})

describe('discardDraft', () => {
  it('clears the draft only, leaving published content untouched', async () => {
    const builder = chainable({ data: rawRow, error: null })
    mockFrom.mockReturnValue(builder)
    await discardDraft('philly', 'support')
    expect(builder.update).toHaveBeenCalledWith({ draft: null })
  })
})

describe('createForm', () => {
  it('appends -2, -3, ... until it finds a free slug', async () => {
    let checkCall = 0
    const insertBuilder = chainable({ data: { ...rawRow, id: 'event-rsvp-2' }, error: null })
    mockFrom.mockImplementation(() => {
      checkCall += 1
      if (checkCall === 1) return chainable({ data: { id: 'event-rsvp' }, error: null })
      if (checkCall === 2) return chainable({ data: null, error: null })
      return insertBuilder
    })

    const content = {
      title: 'Event RSVP',
      submitLabel: '',
      successTitle: '',
      successMessage: '',
      steps: [{ kind: 'text', key: 'note' }],
      icon: null,
      cardImageUrl: null,
      cardTextColor: null,
    }
    await createForm('philly', content as never)

    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-rsvp-2' }))
  })

  it('falls back to the default contact steps when published with none', async () => {
    let call = 0
    const insertBuilder = chainable({ data: rawRow, error: null })
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? chainable({ data: null, error: null }) : insertBuilder
    })

    const content = {
      title: 'Blank Form',
      submitLabel: '',
      successTitle: '',
      successMessage: '',
      steps: [],
      icon: null,
      cardImageUrl: null,
      cardTextColor: null,
    }
    await createForm('philly', content as never)

    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ steps: DEFAULT_CONTACT_STEPS }),
    )
  })

  it('falls back to default submit/success copy when blank', async () => {
    let call = 0
    const insertBuilder = chainable({ data: rawRow, error: null })
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? chainable({ data: null, error: null }) : insertBuilder
    })

    const content = {
      title: 'A Form',
      submitLabel: '   ',
      successTitle: '',
      successMessage: '',
      steps: [{ kind: 'text', key: 'note' }],
      icon: null,
      cardImageUrl: null,
      cardTextColor: null,
    }
    await createForm('philly', content as never)

    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        submit_label: 'Submit',
        success_title: 'All set',
      }),
    )
  })

  it('throws with the Supabase error message on insert failure', async () => {
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? chainable({ data: null, error: null }) : chainable({ data: null, error: { message: 'boom' } })
    })
    const content = {
      title: 'A Form',
      submitLabel: '',
      successTitle: '',
      successMessage: '',
      steps: [],
      icon: null,
      cardImageUrl: null,
      cardTextColor: null,
    }
    await expect(createForm('philly', content as never)).rejects.toThrow('Failed to create form: boom')
  })
})

describe('deleteForm', () => {
  it('refuses to delete the built-in support/volunteer forms', async () => {
    await expect(deleteForm('philly', 'support')).rejects.toThrow("The Support and Volunteer forms can’t be deleted.")
    await expect(deleteForm('philly', 'volunteer')).rejects.toThrow("The Support and Volunteer forms can’t be deleted.")
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('deletes responses before the form (no DB cascade), returning the response count', async () => {
    const calls: string[] = []
    mockFrom.mockImplementation((table: string) => {
      calls.push(table)
      if (table === 'form_response') return chainable({ count: 4, error: null, data: null })
      return chainable({ error: null })
    })

    const result = await deleteForm('philly', 'event-rsvp')

    expect(result).toEqual({ responses: 4 })
    expect(calls.indexOf('form')).toBeGreaterThan(calls.lastIndexOf('form_response'))
  })

  it('throws and stops before deleting the form if removing responses fails', async () => {
    let formDeleteCalled = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'form_response') return chainable({ count: 1, error: { message: 'fk violation' }, data: null })
      formDeleteCalled = true
      return chainable({ error: null })
    })

    await expect(deleteForm('philly', 'event-rsvp')).rejects.toThrow(
      "Failed to delete the form's responses: fk violation",
    )
    expect(formDeleteCalled).toBe(false)
  })

  it('throws when deleting the form row itself fails', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'form_response'
        ? chainable({ count: 0, error: null, data: null })
        : chainable({ error: { message: 'form fk violation' } }),
    )
    await expect(deleteForm('philly', 'event-rsvp')).rejects.toThrow('Failed to delete form: form fk violation')
  })
})
