// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InboxResponse } from '@/lib/inbox'
import ResponseCard, { fmt, isPlainObject, labelize, nonEmptyEntries } from './ResponseCard'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function makeItem(overrides: Partial<InboxResponse> = {}): InboxResponse {
  return {
    id: 'resp-1',
    requestId: 'REQ-123',
    requestType: 'Direct Support',
    formId: null,
    contact: {
      fullName: 'Jane Doe',
      phone: '(215) 555-0100',
      email: 'jane@example.com',
      preferredContact: 'phone',
      hospitalId: 'Jefferson',
      unitFloorRoom: '3rd floor',
    },
    data: { otherNeed: 'Meals for a week', additionalInfo: '' },
    status: 'new',
    createdAt: '2026-01-01T12:00:00.000Z',
    handledAt: null,
    ...overrides,
  }
}

function stubFetch(body: Record<string, unknown>, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const baseProps = {
  token: 'test-token',
  apiBase: '/api/inbox',
  onToggle: vi.fn(),
  onUpdated: vi.fn(),
  onDeleted: vi.fn(),
}

describe('ResponseCard helpers', () => {
  describe('fmt', () => {
    it('renders an em dash for empty/undefined/null', () => {
      expect(fmt(undefined)).toBe('—')
      expect(fmt(null)).toBe('—')
      expect(fmt('')).toBe('—')
    })
    it('renders booleans as Yes/No', () => {
      expect(fmt(true)).toBe('Yes')
      expect(fmt(false)).toBe('No')
    })
    it('joins a non-empty array, and dashes an empty one', () => {
      expect(fmt(['a', 'b'])).toBe('a, b')
      expect(fmt([])).toBe('—')
    })
  })

  describe('labelize', () => {
    it('splits camelCase and capitalizes the first letter', () => {
      expect(labelize('hospitalRoom')).toBe('Hospital Room')
      expect(labelize('additionalInfo')).toBe('Additional Info')
    })
  })

  describe('isPlainObject', () => {
    it('is true only for a plain object, not arrays/null/scalars', () => {
      expect(isPlainObject({})).toBe(true)
      expect(isPlainObject([])).toBe(false)
      expect(isPlainObject(null)).toBe(false)
      expect(isPlainObject('x')).toBe(false)
    })
  })

  describe('nonEmptyEntries', () => {
    it('drops undefined/null/empty-string/empty-array values, recursively for nested objects', () => {
      const data = {
        a: 'x',
        b: '',
        c: undefined,
        d: [],
        e: ['y'],
        nested: { f: '', g: 'z' },
        emptyNested: { h: '', i: [] },
      }
      expect(nonEmptyEntries(data).map(([k]) => k)).toEqual(['a', 'e', 'nested'])
    })
  })
})

describe('ResponseCard', () => {
  it('shows the contact name, timestamp, and requestId on the collapsed header', () => {
    render(<ResponseCard item={makeItem()} expanded={false} {...baseProps} />)

    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('REQ-123')).toBeInTheDocument()
    expect(screen.getByText(/\(215\) 555-0100/)).toBeInTheDocument()
  })

  it('falls back to "(no name given)" when the contact has no name', () => {
    render(<ResponseCard item={makeItem({ contact: { ...makeItem().contact, fullName: '' } })} expanded={false} {...baseProps} />)
    expect(screen.getByText('(no name given)')).toBeInTheDocument()
  })

  it('calls onToggle when the header is clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<ResponseCard item={makeItem()} expanded={false} {...baseProps} onToggle={onToggle} />)

    await user.click(screen.getByText('Jane Doe'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('shows hospital/room, preferred contact, and non-empty data fields only when expanded', () => {
    const { rerender } = render(<ResponseCard item={makeItem()} expanded={false} {...baseProps} />)
    expect(screen.queryByText(/Jefferson/)).not.toBeInTheDocument()

    rerender(<ResponseCard item={makeItem()} expanded {...baseProps} />)
    expect(screen.getByText(/Jefferson/)).toBeInTheDocument()
    expect(screen.getByText(/3rd floor/)).toBeInTheDocument()
    expect(screen.getByText('Meals for a week')).toBeInTheDocument()
    // additionalInfo is '' — dropped by nonEmptyEntries, shouldn't render.
    expect(screen.queryByText('Additional Info:')).not.toBeInTheDocument()
  })

  describe('editing', () => {
    it('opens an editable form pre-filled with the current contact, and saves the PATCH with the edited values', async () => {
      const user = userEvent.setup()
      const fetchMock = stubFetch({ ok: true, response: { ...makeItem(), contact: { ...makeItem().contact, fullName: 'Jane Smith' } } })
      const onUpdated = vi.fn()
      const item = makeItem()
      render(<ResponseCard item={item} expanded {...baseProps} onUpdated={onUpdated} />)

      await user.click(screen.getByRole('button', { name: 'Edit' }))
      const nameInput = screen.getByDisplayValue('Jane Doe')
      await user.clear(nameInput)
      await user.type(nameInput, 'Jane Smith')
      await user.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('/api/inbox/resp-1')
      expect(init.method).toBe('PATCH')
      expect(init.headers.Authorization).toBe('Bearer test-token')
      expect(JSON.parse(init.body).contact.fullName).toBe('Jane Smith')

      await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1))
      // Back to the read view.
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    })

    it('shows a save error and stays in edit mode when the PATCH fails', async () => {
      const user = userEvent.setup()
      stubFetch({ ok: false, errors: ['Save failed.'] }, false)
      render(<ResponseCard item={makeItem()} expanded {...baseProps} />)

      await user.click(screen.getByRole('button', { name: 'Edit' }))
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(await screen.findByText('Save failed.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    })

    it('Cancel discards the edit and returns to the read view', async () => {
      const user = userEvent.setup()
      render(<ResponseCard item={makeItem()} expanded {...baseProps} />)

      await user.click(screen.getByRole('button', { name: 'Edit' }))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByDisplayValue('Jane Doe')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    })
  })

  describe('deleting', () => {
    it('asks for confirmation before deleting, and does not call DELETE until confirmed', async () => {
      const user = userEvent.setup()
      const fetchMock = stubFetch({ ok: true })
      render(<ResponseCard item={makeItem()} expanded {...baseProps} />)

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      expect(screen.getByText(/Permanently delete this request/)).toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()

      // Two "Delete" buttons now: the original trigger, and the confirmation
      // dialog's own — the confirmation one is the last in document order.
      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' })
      await user.click(deleteButtons[deleteButtons.length - 1])
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('/api/inbox/resp-1')
      expect(init.method).toBe('DELETE')
    })

    it('calls onDeleted with the item id once the delete succeeds', async () => {
      const user = userEvent.setup()
      stubFetch({ ok: true })
      const onDeleted = vi.fn()
      render(<ResponseCard item={makeItem({ id: 'resp-9' })} expanded {...baseProps} onDeleted={onDeleted} />)

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' })
      await user.click(deleteButtons[deleteButtons.length - 1])

      await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('resp-9'))
    })

    it('Cancel in the confirmation dismisses it without deleting', async () => {
      const user = userEvent.setup()
      const fetchMock = stubFetch({ ok: true })
      render(<ResponseCard item={makeItem()} expanded {...baseProps} />)

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByText(/Permanently delete this request/)).not.toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('shows a delete error and leaves the confirmation open when the DELETE fails', async () => {
      const user = userEvent.setup()
      stubFetch({ ok: false, errors: ['Delete failed.'] }, false)
      render(<ResponseCard item={makeItem()} expanded {...baseProps} />)

      await user.click(screen.getByRole('button', { name: 'Delete' }))
      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' })
      await user.click(deleteButtons[deleteButtons.length - 1])

      expect(await screen.findByText('Delete failed.')).toBeInTheDocument()
    })
  })
})
