// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import { DEFAULT_CONTACT_STEPS, type FormConfig, type FormStep } from '@/lib/forms'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import FormsManager from './FormsManager'
import { DRAFT_KEEP_DELAY_MS, countFormChanges, questionLine, sectionName } from './FormEditor'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/forms',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/fetchJson')>()), fetchJson: vi.fn() }))

const needs: FormStep = {
  id: 'needs',
  kind: 'multi',
  question: 'What do you need?',
  options: [
    { value: 'meals', label: 'Meals' },
    { value: 'ride', label: 'A ride' },
  ],
}
const room: FormStep = { id: 'room', kind: 'text', section: '🍽️ Meals', question: 'Which hospital and room?', when: [{ field: 'needs', op: 'includes', value: 'meals' }] }
const extra = (n: number): FormStep[] => Array.from({ length: n }, (_, i) => ({ id: `q${i}`, kind: 'text', section: '🍽️ Meals', question: `Question ${i}` }))

const support: FormConfig = {
  id: 'support',
  title: 'Patient & Family Support',
  submitLabel: 'Send request',
  successTitle: 'Request sent',
  successMessage: 'Someone will reach out.',
  steps: [needs, ...DEFAULT_CONTACT_STEPS, room, ...extra(3)],
  icon: '',
  active: true,
}
const custom: FormConfig = { ...support, id: 'sukkah-signup', title: 'Sukkah sign-up', steps: [needs], active: false, draft: { ...support, title: 'Sukkah sign-up', steps: [needs, room] } }

function renderForms(openId: string | null, forms = [support, custom]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.includes('site-settings') ? { ok: true, settings: { ...SITE_SETTINGS_DEFAULTS, feedbackEnabled: true } } : { ok: true, forms }), { status: 200 }),
    ),
  )
  vi.mocked(fetchJson).mockImplementation(async (url) =>
    String(url).includes('site-settings') ? { ok: true, settings: { ...SITE_SETTINGS_DEFAULTS, feedbackEnabled: false } } : { ok: true },
  )
  const onOpen = vi.fn()
  const onClose = vi.fn()
  renderWithProviders(<FormsManager token="tok" openId={openId} onOpen={onOpen} onClose={onClose} />, { community: { slug: 'philly' } })
  return { onOpen, onClose }
}

const sent = (method: string, path: string) =>
  vi.mocked(fetchJson).mock.calls.filter(([url, init]) => String(url).startsWith(path) && init?.method === method)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe('Forms list', () => {
  it('has Feedback first, then each form, each saying where it shows and whether it’s on', async () => {
    const user = userEvent.setup()
    const { onOpen } = renderForms(null)
    const feedback = await screen.findByRole('button', { name: /^Feedback/ })
    expect(feedback).toHaveTextContent('In the footer and the More menu')
    expect(feedback).toHaveTextContent('On')
    const rows = screen.getAllByRole('button', { name: /category list/ })
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Patient & Family Support'),
      expect.stringContaining('Sukkah sign-up'),
    ])
    expect(rows[0]).toHaveTextContent(/On$/)
    expect(rows[1]).toHaveTextContent('Draft not published')
    expect(rows[1]).toHaveTextContent(/Off$/)
    await user.click(feedback)
    expect(onOpen).toHaveBeenCalledWith('feedback')
    await user.click(rows[1])
    expect(onOpen).toHaveBeenCalledWith('form:sukkah-signup')
    await user.click(screen.getByRole('button', { name: '+ Add a form' }))
    expect(onOpen).toHaveBeenCalledWith('form:new')
  })
})

describe('Feedback', () => {
  it('edits the footer button, heading and after-sending words through the Save bar, and saves only those', async () => {
    const user = userEvent.setup()
    renderForms('feedback')
    const heading = await screen.findByLabelText('Heading')
    expect(screen.getByRole('heading', { name: 'Feedback' })).toBeInTheDocument()
    expect(screen.getByLabelText('Button in the footer')).toHaveValue(SITE_SETTINGS_DEFAULTS.feedbackButtonLabel)
    await user.click(screen.getByRole('switch', { name: 'On the site' }))
    await user.type(heading, '!')
    expect(screen.getByRole('status')).toHaveTextContent('2 changes')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved.'))
    const [[, init]] = sent('PATCH', '/api/admin/site-settings')
    expect(JSON.parse(String(init!.body))).toEqual({
      feedbackEnabled: false,
      feedbackButtonLabel: SITE_SETTINGS_DEFAULTS.feedbackButtonLabel,
      feedbackHeading: `${SITE_SETTINGS_DEFAULTS.feedbackHeading}!`,
      feedbackSuccessMessage: SITE_SETTINGS_DEFAULTS.feedbackSuccessMessage,
    })
  })
})

describe('A form', () => {
  it('lists its questions under their sections, each saying what it takes and when it’s asked, the rest behind “N more”', async () => {
    const user = userEvent.setup()
    renderForms('form:support')
    const questions = within(await screen.findByRole('region', { name: 'Questions' }))
    expect(questions.getByRole('button', { name: /What do you need\?/ })).toHaveTextContent('Pick any · Meals, A ride')
    expect(questions.getByRole('button', { name: /Which hospital and room\?/ })).toHaveTextContent('Short answer · only if they picked Meals')
    expect(questions.getByText('Your details')).toBeInTheDocument()
    expect(questions.getAllByText('Meals', { selector: 'p' })).toHaveLength(1)
    expect(questions.queryByRole('button', { name: /Question 2/ })).toBeNull()
    await user.click(questions.getByRole('button', { name: '3 more' }))
    expect(questions.getByRole('button', { name: /Question 2/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Responses' })).toHaveAttribute('href', '/philly/inbox')
    // Support is wired into its own screen: it can be hidden, never deleted.
    expect(screen.getByRole('switch', { name: 'On the site' })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Delete this form' })).toBeNull()
  })

  it('opens a question on its own screen, and Back returns to the form', async () => {
    const user = userEvent.setup()
    renderForms('form:support')
    await user.click(await screen.findByRole('button', { name: /What do you need\?/ }))
    expect(screen.getByRole('heading', { name: 'What do you need?' })).toBeInTheDocument()
    expect(screen.getByLabelText('Question')).toHaveValue('What do you need?')
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    expect(await screen.findByRole('region', { name: 'Questions' })).toBeInTheDocument()
  })

  it('keeps an edit as a draft by itself, says it isn’t on the site yet, and Publish puts it there', async () => {
    const user = userEvent.setup()
    const { onClose } = renderForms('form:support')
    expect(screen.queryByRole('region', { name: 'Save' })).toBeNull()
    await user.type(await screen.findByLabelText('Message'), ' Soon.')
    expect(screen.getByRole('status')).toHaveTextContent('Draft · 1 change, not on the site yet')
    await waitFor(() => expect(sent('PATCH', '/api/admin/forms/support')).toHaveLength(1), { timeout: DRAFT_KEEP_DELAY_MS + 2000 })
    expect(JSON.parse(String(sent('PATCH', '/api/admin/forms/support')[0][1]!.body)).successMessage).toBe('Someone will reach out. Soon.')

    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(sent('POST', '/api/admin/forms/support/publish')).toHaveLength(1)
  })

  it('Throw away goes back to what’s on the site and drops the kept draft', async () => {
    const user = userEvent.setup()
    renderForms('form:sukkah-signup')
    expect(await screen.findByRole('status')).toHaveTextContent('Draft · 1 change, not on the site yet')
    await user.click(screen.getByRole('button', { name: 'Throw away' }))
    expect(screen.queryByRole('region', { name: 'Save' })).toBeNull()
    await waitFor(() => expect(sent('DELETE', '/api/admin/forms/sukkah-signup/draft')).toHaveLength(1), { timeout: DRAFT_KEEP_DELAY_MS + 2000 })
  })

  it('a form someone made can be turned off at once, and deleted after asking once', async () => {
    const user = userEvent.setup()
    const { onClose } = renderForms('form:sukkah-signup')
    const on = await screen.findByRole('switch', { name: 'On the site' })
    expect(on).not.toBeChecked()
    await user.click(on)
    expect(sent('PATCH', '/api/admin/forms/sukkah-signup/active')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Responses' })).toHaveAttribute('href', '/philly/admin/responses?form=sukkah-signup')

    await user.click(screen.getByRole('button', { name: 'Delete this form' }))
    await user.click(screen.getByRole('button', { name: 'Leave it' }))
    expect(sent('DELETE', '/api/admin/forms/sukkah-signup')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Delete this form' }))
    await user.click(screen.getByRole('button', { name: 'Delete it' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(sent('DELETE', '/api/admin/forms/sukkah-signup').filter(([url]) => !String(url).includes('/draft'))).toHaveLength(1)
  })

  it('a new form is made only by Publish, and says what’s missing first', async () => {
    const user = userEvent.setup()
    const { onClose } = renderForms('form:new')
    expect(await screen.findByRole('heading', { name: 'New form' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('New form, not on the site yet')
    await user.clear(screen.getByLabelText('Name'))
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(screen.getByRole('status')).toHaveTextContent('Give it a name.')
    await user.type(screen.getByLabelText('Name'), 'Sign-up')
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(sent('POST', '/api/admin/forms')).toHaveLength(1)
    expect(sent('PATCH', '/api/admin/forms')).toHaveLength(0)
  })
})

describe('form wording', () => {
  it('says when the contact questions are asked', () => {
    const [, contact, phoneOnly, both] = DEFAULT_CONTACT_STEPS
    expect(questionLine(contact, DEFAULT_CONTACT_STEPS)).toBe('Phone or email')
    expect(questionLine(phoneOnly, DEFAULT_CONTACT_STEPS)).toBe('Pick one · only if they gave a phone and no email')
    expect(questionLine(both, DEFAULT_CONTACT_STEPS)).toBe('Pick one · only if they gave a phone and gave an email')
  })

  it('names a section without its emoji, and counts each changed question once', () => {
    expect(sectionName('👋 Your details')).toBe('Your details')
    expect(sectionName('🍽️ Meals')).toBe('Meals')
    expect(countFormChanges(support, { ...support, steps: [needs] })).toBe(support.steps.length - 1)
    expect(countFormChanges(support, { ...support, title: 'x', icon: undefined })).toBe(1)
  })
})
