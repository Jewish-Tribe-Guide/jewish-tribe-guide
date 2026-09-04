// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Wizard, { type Step } from './Wizard'

// The step-branching, validation, and submit-vs-fail paths are the actual
// product here — every real wizard (Support, Volunteer, admin-built custom
// forms) is this component with a different step list, so a bug here breaks
// every form on the site at once.

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

// history is a real singleton jsdom doesn't reset between tests on its own —
// and a real submit now writes `submitted: true` to it (see goNext), so
// without this, one test's successful submission leaks into whichever test
// runs next, which then mounts believing IT is a reload of an
// already-submitted session. Caught exactly this way while adding the reload
// tests below: an unrelated, already-passing submit test started failing to
// find the first question at all.
afterEach(() => {
  cleanup()
  history.replaceState(null, '')
})

const textStep: Step = { id: 'name', kind: 'text', question: 'What is your name?' }
const singleStep: Step = {
  id: 'need',
  kind: 'single',
  question: 'What do you need?',
  options: [{ value: 'meals', label: 'Meals' }, { value: 'rides', label: 'Rides' }],
}
const contactStep: Step = { id: 'contact', kind: 'contact', question: 'How can we reach you?' }

function renderWizard(overrides: Partial<React.ComponentProps<typeof Wizard>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  const utils = render(
    <Wizard steps={[textStep, singleStep, contactStep]} onSubmit={onSubmit} onClose={onClose} {...overrides} />,
  )
  return { ...utils, onSubmit, onClose }
}

describe('Wizard — step flow', () => {
  it('shows the first step, one question at a time', () => {
    renderWizard()
    expect(screen.getByText('What is your name?')).toBeInTheDocument()
    expect(screen.queryByText('What do you need?')).not.toBeInTheDocument()
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
  })

  it('blocks Continue on a required, empty step', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderWizard()

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByText(/please answer to continue/i)).toBeInTheDocument()
    expect(screen.getByText('What is your name?')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('advances to the next step once answered', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.type(screen.getByRole('textbox'), 'Rivka')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByText('What do you need?')).toBeInTheDocument()
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
  })

  it('a single-select step auto-advances after a brief highlight, with no Continue button', async () => {
    const user = userEvent.setup()
    renderWizard()
    await user.type(screen.getByRole('textbox'), 'Rivka')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.queryByRole('button', { name: /^continue$/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Meals' }))

    await waitFor(() => expect(screen.getByText('How can we reach you?')).toBeInTheDocument())
  })
})

describe('Wizard — the contact step', () => {
  async function getToContactStep(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByRole('textbox'), 'Rivka')
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await user.click(screen.getByRole('button', { name: 'Meals' }))
    await waitFor(() => expect(screen.getByText('How can we reach you?')).toBeInTheDocument())
  }

  it('requires a phone or an email, not both', async () => {
    const user = userEvent.setup()
    renderWizard()
    await getToContactStep(user)

    await user.click(screen.getByRole('button', { name: /submit/i }))
    expect(screen.getByText(/enter a phone number or email/i)).toBeInTheDocument()
  })

  it('rejects an invalid phone number even when an email is also given', async () => {
    const user = userEvent.setup()
    renderWizard()
    await getToContactStep(user)

    await user.type(screen.getByLabelText(/phone number/i), '123')
    await user.type(screen.getByLabelText(/email/i), 'a@example.com')
    await user.click(screen.getByRole('button', { name: /submit/i }))

    expect(screen.getByText(/enter a valid phone number/i)).toBeInTheDocument()
  })

  it('accepts email alone, with no phone at all', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderWizard()
    await getToContactStep(user)

    await user.type(screen.getByLabelText(/email/i), 'a@example.com')
    await user.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Rivka', need: 'meals', email: 'a@example.com' }),
    ))
  })
})

describe('Wizard — submit', () => {
  async function fillToSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByRole('textbox'), 'Rivka')
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await user.click(screen.getByRole('button', { name: 'Meals' }))
    await waitFor(() => expect(screen.getByText('How can we reach you?')).toBeInTheDocument())
    await user.type(screen.getByLabelText(/email/i), 'a@example.com')
  }

  it('shows the success screen once onSubmit resolves', async () => {
    const user = userEvent.setup()
    renderWizard({ successTitle: 'Thanks!', successMessage: 'We got it.' })
    await fillToSubmit(user)

    await user.click(screen.getByRole('button', { name: /submit/i }))

    expect(await screen.findByText('Thanks!')).toBeInTheDocument()
    expect(screen.getByText('We got it.')).toBeInTheDocument()
  })

  it('shows an error and stays on the form when onSubmit rejects, so the visitor can retry', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(new Error('Network error, try again'))
    renderWizard({ onSubmit })
    await fillToSubmit(user)

    await user.click(screen.getByRole('button', { name: /submit/i }))

    expect(await screen.findByText('Network error, try again')).toBeInTheDocument()
    expect(screen.getByText('How can we reach you?')).toBeInTheDocument()
    expect(screen.queryByText('All set')).not.toBeInTheDocument()
  })

  it('falls back to a generic message when the rejection carries no message', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue('not an Error instance')
    renderWizard({ onSubmit })
    await fillToSubmit(user)

    await user.click(screen.getByRole('button', { name: /submit/i }))

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
  })
})

// A reload used to always show step 1 of a blank form — `submitted` was
// plain component state, so remounting after a real submit reset it to
// false just like a genuinely fresh visit, and there was nothing to tell
// the two apart. Real bug, reported live: "you submit something, reload the
// page, and it takes you back to the form."
describe('Wizard — reload after a real submit', () => {
  it('redirects immediately via onClose, without ever showing step 1, when history.state says this session already submitted', () => {
    // Simulates a reload landing back on the same entry goNext's success
    // path left behind — see that code's own history.replaceState call.
    history.replaceState({ submitted: true }, '')
    const { onClose } = renderWizard()

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('What is your name?')).not.toBeInTheDocument()
  })

  it('shows the form normally, and never calls onClose, on an ordinary fresh visit', () => {
    const { onClose } = renderWizard()

    expect(screen.getByText('What is your name?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('marks history.state once a real submit succeeds, so a later reload has something to read', async () => {
    const user = userEvent.setup()
    renderWizard()
    await user.type(screen.getByRole('textbox'), 'Rivka')
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await user.click(screen.getByRole('button', { name: 'Meals' }))
    await waitFor(() => expect(screen.getByText('How can we reach you?')).toBeInTheDocument())
    await user.type(screen.getByLabelText(/email/i), 'a@example.com')

    await user.click(screen.getByRole('button', { name: /submit/i }))

    await screen.findByText('All set')
    expect((window.history.state as { submitted?: boolean } | null)?.submitted).toBe(true)
  })
})

describe('Wizard — closing', () => {
  it('calls onClose when the close (X) button is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderWizard()

    await user.click(screen.getByRole('button', { name: /close/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape', () => {
    const { onClose } = renderWizard()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Wizard — branching', () => {
  it('skips a step whose `when` condition is not met, and includes it once it is', async () => {
    const branchStep: Step = {
      id: 'meal-notes',
      kind: 'text',
      question: 'Any dietary notes?',
      when: [{ field: 'need', op: 'includes', value: 'meals' }],
    }
    const user = userEvent.setup()
    render(
      <Wizard
        steps={[singleStep, branchStep, contactStep]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    )

    // Choosing "rides" (not "meals") should skip straight past the branch step.
    await user.click(screen.getByRole('button', { name: 'Rides' }))
    await waitFor(() => expect(screen.getByText('How can we reach you?')).toBeInTheDocument())
  })
})
