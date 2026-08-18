// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import type { CategoryField } from '@/lib/categories'
import TagsInput from './TagsInput'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

function fixedField(overrides: Partial<CategoryField> = {}): CategoryField {
  return {
    key: 'kosherSymbols',
    label: 'Kosher Symbols',
    type: 'tags',
    fixedVocabulary: true,
    options: [
      { value: 'OU', label: 'OU' },
      { value: 'Kof-K', label: 'Kof-K' },
    ],
    ...overrides,
  }
}

function openField(overrides: Partial<CategoryField> = {}): CategoryField {
  return {
    key: 'cuisine',
    label: 'Cuisine',
    type: 'tags',
    tagGroup: 'cuisine',
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ ok: true, tags: [] }) }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('TagsInput — fixed vocabulary', () => {
  it('offers only the admin-configured options as suggestions', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TagsInput field={fixedField()} value={[]} onChange={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('Type to search…'), 'O')

    expect(screen.getByRole('button', { name: '+ OU' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /\+ Add/ })).not.toBeInTheDocument()
  })

  it('adds a suggested tag on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<TagsInput field={fixedField()} value={[]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: '+ OU' }))

    expect(onChange).toHaveBeenCalledWith(['OU'])
  })

  it('does not offer to add free text outside the fixed vocabulary', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TagsInput field={fixedField()} value={[]} onChange={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('Type to search…'), 'Not A Real Cert')

    expect(screen.queryByRole('button', { name: /Add/ })).not.toBeInTheDocument()
  })

  it('removes a selected tag via its × button', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<TagsInput field={fixedField()} value={['OU']} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Remove OU' }))

    expect(onChange).toHaveBeenCalledWith([])
  })
})

describe('TagsInput — open vocabulary', () => {
  it('fetches the shared tag vocabulary for the field’s tagGroup, scoped to the community', async () => {
    renderWithProviders(<TagsInput field={openField()} value={[]} onChange={vi.fn()} />, {
      community: { slug: 'philly' },
    })

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/tags?group=cuisine')),
    )
    expect(vi.mocked(fetch).mock.calls[0]![0]).toContain('philly')
  })

  it('offers to add a typed value that matches nothing in the vocabulary', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TagsInput field={openField()} value={[]} onChange={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('Type to search or add an item…'), 'Sushi')

    expect(screen.getByRole('button', { name: '+ Add “Sushi”' })).toBeInTheDocument()
  })

  it('adding a new tag via Enter calls onChange and clears the input', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<TagsInput field={openField()} value={[]} onChange={onChange} />)

    const input = screen.getByPlaceholderText('Type to search or add an item…')
    await user.type(input, 'Sushi{Enter}')

    expect(onChange).toHaveBeenCalledWith(['Sushi'])
    expect(input).toHaveValue('')
  })
})

describe('TagsInput — always/sometimes consistency toggle', () => {
  it('moves a tag from always to sometimes when clicked, given onChangeSometimes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onChangeSometimes = vi.fn()
    renderWithProviders(
      <TagsInput field={fixedField()} value={['OU']} onChange={onChange} sometimes={[]} onChangeSometimes={onChangeSometimes} />,
    )

    await user.click(screen.getByTitle('Always available — click to mark as sometimes'))

    expect(onChange).toHaveBeenCalledWith([])
    expect(onChangeSometimes).toHaveBeenCalledWith(['OU'])
  })
})
