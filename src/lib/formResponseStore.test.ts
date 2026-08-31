import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContactHospitalData } from '@/types'

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    in: vi.fn(self),
    order: vi.fn(self),
    insert: vi.fn(self),
    update: vi.fn(self),
    delete: vi.fn(self),
    maybeSingle: vi.fn(self),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const { insertFormResponse, listFormResponses, updateFormResponse, deleteFormResponse } =
  await import('./formResponseStore')

afterEach(() => {
  mockFrom.mockReset()
})

const contact: ContactHospitalData = {
  fullName: 'Jane Doe',
  phone: '215-555-0100',
  email: 'jane@example.com',
  hospitalId: 'h1',
  unitFloorRoom: '',
  preferredContact: 'phone',
}

const rawRow = {
  id: 'resp-1',
  request_id: 'REQ-1',
  request_type: 'Direct Support',
  form_id: null,
  contact,
  data: { note: 'x' },
  status: 'new' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  handled_at: null,
}

describe('insertFormResponse', () => {
  it('inserts the response, defaulting an unset formId to null', async () => {
    const builder = chainable({ error: null })
    mockFrom.mockReturnValue(builder)

    await insertFormResponse({
      community: 'philly',
      requestId: 'REQ-1',
      requestType: 'Direct Support',
      contact,
      data: { note: 'x' },
    })

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ request_id: 'REQ-1', form_id: null }),
    )
  })

  it('carries a custom form id through when set', async () => {
    const builder = chainable({ error: null })
    mockFrom.mockReturnValue(builder)

    await insertFormResponse({
      community: 'philly',
      requestId: 'REQ-1',
      requestType: 'Custom Form Title',
      formId: 'my-form',
      contact,
      data: {},
    })

    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ form_id: 'my-form' }))
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ error: { message: 'boom' } }))
    await expect(
      insertFormResponse({ community: 'philly', requestId: 'REQ-1', requestType: 'Direct Support', contact, data: {} }),
    ).rejects.toThrow('Failed to save the request: boom')
  })
})

describe('listFormResponses', () => {
  it('maps rows, newest first', async () => {
    const builder = chainable({ data: [rawRow], error: null })
    mockFrom.mockReturnValue(builder)

    const [response] = await listFormResponses()

    expect(response.requestId).toBe('REQ-1')
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('filters by requestTypes when given (the /inbox allowlist shape)', async () => {
    const builder = chainable({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await listFormResponses({ requestTypes: ['Direct Support', 'Volunteer'] })

    expect(builder.in).toHaveBeenCalledWith('request_type', ['Direct Support', 'Volunteer'])
    expect(builder.eq).not.toHaveBeenCalled()
  })

  it('filters by formId when given (the admin per-form tab shape)', async () => {
    const builder = chainable({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await listFormResponses({ formId: 'my-form' })

    expect(builder.eq).toHaveBeenCalledWith('form_id', 'my-form')
    expect(builder.in).not.toHaveBeenCalled()
  })

  it('applies neither filter when called with no arguments', async () => {
    const builder = chainable({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await listFormResponses()

    expect(builder.in).not.toHaveBeenCalled()
    expect(builder.eq).not.toHaveBeenCalled()
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(listFormResponses()).rejects.toThrow('Failed to load responses: boom')
  })
})

const inScopeCheck = { data: { request_type: rawRow.request_type, form_id: rawRow.form_id }, error: null }
const outOfScopeCheck = { data: { request_type: 'Feedback', form_id: null }, error: null }
const missingCheck = { data: null, error: null }
const supportScope = { requestTypes: ['Direct Support'] }

describe('updateFormResponse', () => {
  it('returns null without touching the database when the patch has no keys set', async () => {
    const result = await updateFormResponse('resp-1', {}, supportScope)
    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('only writes the columns present in the patch', async () => {
    const scopeBuilder = chainable(inScopeCheck)
    const updateBuilder = chainable({ data: rawRow, error: null })
    mockFrom.mockReturnValueOnce(scopeBuilder).mockReturnValueOnce(updateBuilder)

    await updateFormResponse('resp-1', { contact }, supportScope)

    expect(updateBuilder.update).toHaveBeenCalledWith({ contact })
  })

  it('writes both columns when both are patched', async () => {
    const scopeBuilder = chainable(inScopeCheck)
    const updateBuilder = chainable({ data: rawRow, error: null })
    mockFrom.mockReturnValueOnce(scopeBuilder).mockReturnValueOnce(updateBuilder)

    await updateFormResponse('resp-1', { contact, data: { note: 'y' } }, supportScope)

    expect(updateBuilder.update).toHaveBeenCalledWith({ contact, data: { note: 'y' } })
  })

  it('returns null when no row matches the id', async () => {
    mockFrom.mockReturnValue(chainable(missingCheck))
    expect(await updateFormResponse('missing', { contact }, supportScope)).toBeNull()
  })

  it('returns null when the row exists but is outside the caller scope, same as a missing id', async () => {
    const scopeBuilder = chainable(outOfScopeCheck)
    mockFrom.mockReturnValueOnce(scopeBuilder)

    expect(await updateFormResponse('resp-1', { contact }, supportScope)).toBeNull()
    expect(scopeBuilder.update).not.toHaveBeenCalled()
  })

  it('is in scope when anyFormId matches a set form_id, regardless of requestTypes', async () => {
    const scopeBuilder = chainable({ data: { request_type: 'Custom Form Title', form_id: 'my-form' }, error: null })
    const updateBuilder = chainable({ data: rawRow, error: null })
    mockFrom.mockReturnValueOnce(scopeBuilder).mockReturnValueOnce(updateBuilder)

    await updateFormResponse('resp-1', { contact }, { requestTypes: ['Feedback'], anyFormId: true })

    expect(updateBuilder.update).toHaveBeenCalledWith({ contact })
  })

  it('throws with the Supabase error message on failure', async () => {
    const scopeBuilder = chainable(inScopeCheck)
    const updateBuilder = chainable({ data: null, error: { message: 'boom' } })
    mockFrom.mockReturnValueOnce(scopeBuilder).mockReturnValueOnce(updateBuilder)

    await expect(updateFormResponse('resp-1', { contact }, supportScope)).rejects.toThrow(
      'Failed to update the request: boom',
    )
  })
})

describe('deleteFormResponse', () => {
  it('deletes and returns true when the row is in scope', async () => {
    const scopeBuilder = chainable(inScopeCheck)
    const deleteBuilder = chainable({ error: null })
    mockFrom.mockReturnValueOnce(scopeBuilder).mockReturnValueOnce(deleteBuilder)

    await expect(deleteFormResponse('resp-1', supportScope)).resolves.toBe(true)
    expect(deleteBuilder.delete).toHaveBeenCalled()
  })

  it('returns false without deleting when the row is outside the caller scope', async () => {
    const scopeBuilder = chainable(outOfScopeCheck)
    mockFrom.mockReturnValueOnce(scopeBuilder)

    await expect(deleteFormResponse('resp-1', supportScope)).resolves.toBe(false)
    expect(scopeBuilder.delete).not.toHaveBeenCalled()
  })

  it('returns false when no row matches the id', async () => {
    mockFrom.mockReturnValue(chainable(missingCheck))
    await expect(deleteFormResponse('missing', supportScope)).resolves.toBe(false)
  })

  it('throws with the Supabase error message on failure', async () => {
    const scopeBuilder = chainable(inScopeCheck)
    const deleteBuilder = chainable({ error: { message: 'boom' } })
    mockFrom.mockReturnValueOnce(scopeBuilder).mockReturnValueOnce(deleteBuilder)

    await expect(deleteFormResponse('resp-1', supportScope)).rejects.toThrow(
      'Failed to delete the request: boom',
    )
  })
})
