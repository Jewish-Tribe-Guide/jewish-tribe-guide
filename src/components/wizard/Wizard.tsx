'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { isValidPhone } from '@/lib/validation'
import { stepIsVisible, type StepCondition } from '@/lib/forms'
import Honeypot from '@/components/Honeypot'
import TurnstileWidget from '@/components/TurnstileWidget'

// ── Step config ───────────────────────────────────────────────────────────────
// A wizard is a flat list of steps. Each step shows ONE question. `when` gates a
// step on earlier answers, which is how branching works: a meal step only shows
// once "meals" is chosen. Answers are stored by step id.
//
// Both wizards (SupportWizard, VolunteerWizard) build this list from a
// data-driven FormConfig (see lib/forms.ts, useForms.ts) rather than hardcoding
// it, so an admin can edit the questions from /admin without a deploy.

export type Answers = Record<string, string | string[]>

type Option = { value: string; label: string; icon?: string }

type StepBase = {
  id: string
  question: string
  hint?: string
  /** Small eyebrow above the question naming the section, e.g. "🍽️ Meals", so
   *  the visitor always knows which part of the form they're in. */
  section?: string
  /** Show this step only when every condition holds (branching). */
  when?: StepCondition[]
  /** Optional steps can be skipped; required ones block until answered. */
  optional?: boolean
}

export type Step =
  | (StepBase & { kind: 'single'; options: Option[] })
  | (StepBase & { kind: 'multi'; options: Option[] })
  | (StepBase & { kind: 'text' | 'tel' | 'number' | 'date' | 'textarea'; placeholder?: string })
  // A combined phone + email screen. Writes to the fixed `phone` and `email`
  // answer keys (not the step id); requires at least one, and a valid phone if given.
  | (StepBase & { kind: 'contact' })

type Props = {
  steps: Step[]
  /** Initial answers (e.g. a preselected need from a search result). */
  initial?: Answers
  onSubmit: (answers: Answers) => Promise<void>
  onClose: () => void
  submitLabel?: string
  /** Shown on the final thank-you screen. */
  successTitle?: string
  successMessage?: string
  /** 'modal' (default) is the existing full-screen `fixed inset-0` overlay,
   *  which drives its own step navigation off `window.history` so browser/
   *  trackpad Back walks through steps. 'inline' renders as a plain bounded
   *  box instead (for embedding inside another layout, e.g. the home page's
   *  "Get Connected" panel) with smaller step content sized for a
   *  constrained space, and keeps step navigation as local-only state —
   *  pushing real history entries from inside a small embedded widget would
   *  hijack the page's own Back button instead of just moving within the
   *  form. */
  variant?: 'modal' | 'inline'
}

const asArray = (v: string | string[] | undefined): string[] =>
  Array.isArray(v) ? v : v ? [v] : []

// Returns an error message if the step isn't satisfied by the given answers, or
// null if it is. Pure (no component state) so it can gate both Continue and the
// reachability clamp below.
function validateStep(s: Step, a: Answers): string | null {
  if (s.kind === 'contact') {
    const phone = ((a.phone as string) ?? '').trim()
    const email = ((a.email as string) ?? '').trim()
    if (!phone && !email) return 'Enter a phone number or email so we can reach you.'
    if (phone && !isValidPhone(phone)) return 'Please enter a valid phone number.'
    return null
  }
  if (s.optional) return null
  const value = a[s.id]
  const empty = Array.isArray(value) ? value.length === 0 : !value?.toString().trim()
  if (empty) return 'Please answer to continue.'
  if (s.kind === 'tel' && typeof value === 'string' && !isValidPhone(value))
    return 'Please enter a valid phone number.'
  return null
}

// The furthest step the answers justify being on: you may sit on the first step
// whose requirements aren't met yet, but never past it. Clamping the rendered
// step to this closes the history loophole — backing out of the form and then
// hitting browser Forward (or reloading mid-form) remounts an empty wizard, and
// without this you'd land on a deep step you never filled in.
function maxReachableIdx(steps: Step[], a: Answers): number {
  for (let i = 0; i < steps.length; i++) {
    if (validateStep(steps[i], a) !== null) return i
  }
  return steps.length - 1
}

export default function Wizard({
  steps,
  initial = {},
  onSubmit,
  onClose,
  submitLabel = 'Submit',
  successTitle = 'All set',
  successMessage = 'A community representative will reach out to you shortly.',
  variant = 'modal',
}: Props) {
  const [answers, setAnswers] = useState<Answers>(initial)
  const [idx, setIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Steps visible given the current answers — branching recomputes this live.
  const visible = useMemo(() => steps.filter((s) => stepIsVisible(s, answers)), [steps, answers])
  // Render the step from history, but never further than the answers justify.
  const clampedIdx = Math.min(idx, maxReachableIdx(visible, answers))
  const step = visible[clampedIdx]
  const isLast = clampedIdx === visible.length - 1

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current) }, [])

  // Esc closes the whole wizard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Each step is its own history entry (pushed in goToStep), so browser/trackpad
  // Back and forward move between steps. Drive `idx` from the entry we land on;
  // backing out past step 0 lands on an entry with no flowStep, where the parent
  // unmounts us — so we only act when a step index is present. Skipped entirely
  // when embedded ('inline') — a small widget nested in a page shouldn't be
  // hijacking the page's own Back/Forward history.
  useEffect(() => {
    if (variant !== 'modal') return
    function onPop(e: PopStateEvent) {
      const s = e.state as { flowStep?: number } | null
      if (s && typeof s.flowStep === 'number') {
        setIdx(s.flowStep)
        setError(null)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [variant])

  const setAnswer = (id: string, value: string | string[]) =>
    setAnswers((prev) => ({ ...prev, [id]: value }))

  // Advance/jump to a step, recording it as a history entry so Back returns here
  // ('modal' only — see the popstate effect above for why 'inline' skips this).
  // No-ops when already on the target step (avoids duplicate entries, e.g. a
  // single-select on the final step that has nowhere further to go).
  const goToStep = (next: number) => {
    if (next === clampedIdx) return
    setError(null)
    setIdx(next)
    if (variant === 'modal') history.pushState({ ...(window.history.state ?? {}), flowStep: next }, '')
  }

  const goNext = async () => {
    const err = validateStep(step, answers)
    if (err) { setError(err); return }
    setError(null)
    if (isLast) {
      setSubmitting(true)
      try {
        await onSubmit(answers)
        setSubmitted(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      } finally {
        setSubmitting(false)
      }
      return
    }
    goToStep(clampedIdx + 1)
  }

  // Back a step via the history stack so the in-form Back button and the
  // browser/trackpad Back gesture behave identically (both fire popstate) —
  // 'inline' has no history entries to pop (see above), so it just moves
  // `idx` back directly instead.
  const goBack = () => {
    setError(null)
    if (variant === 'modal') history.back()
    else setIdx((i) => Math.max(0, i - 1))
  }

  // Single-select: record the choice, briefly show it highlighted, then advance.
  const pickSingle = (value: string) => {
    setAnswer(step.id, value)
    setError(null)
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    const next = Math.min(clampedIdx + 1, visible.length - 1)
    advanceTimer.current = setTimeout(() => goToStep(next), 180)
  }

  const toggleMulti = (value: string) => {
    const current = asArray(answers[step.id])
    setAnswer(step.id, current.includes(value) ? current.filter((v) => v !== value) : [...current, value])
  }

  // Smaller type/padding throughout the step content when embedded inline —
  // the full-screen sizing (30px headings, spacious option buttons) assumes
  // a whole viewport to breathe in, which a small embedded box doesn't have.
  const dense = variant === 'inline'

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <Shell variant={variant} progress={1} onClose={onClose} onBack={null} stepText="Done">
        <div className={`text-center ${dense ? 'py-4' : 'py-10'}`}>
          <div className={dense ? 'mb-2 text-3xl' : 'mb-4 text-5xl'}>✅</div>
          <h2 className={`font-bold tracking-tight text-slate-900 ${dense ? 'mb-1 text-lg' : 'mb-2 text-2xl'}`}>{successTitle}</h2>
          <p className={`mx-auto max-w-sm text-slate-500 ${dense ? 'text-xs' : ''}`}>{successMessage}</p>
          <button
            onClick={onClose}
            className={`rounded-full bg-primary font-semibold text-white transition-colors hover:bg-primary-dark cursor-pointer ${
              dense ? 'mt-4 px-5 py-2 text-xs' : 'mt-8 px-7 py-3 text-[15px]'
            }`}
          >
            Done
          </button>
        </div>
      </Shell>
    )
  }

  // ── Active step ───────────────────────────────────────────────────────────────
  const selectedMulti = asArray(answers[step.id])

  return (
    <Shell
      variant={variant}
      progress={(clampedIdx + 1) / visible.length}
      onClose={onClose}
      onBack={clampedIdx > 0 ? goBack : null}
      stepText={`${clampedIdx + 1} of ${visible.length}`}
    >
      <Honeypot
        value={(answers.company as string) ?? ''}
        onChange={(v) => setAnswers((a) => ({ ...a, company: v }))}
      />
      <div key={step.id} className="animate-[fadeIn_180ms_ease-out]">
        {step.section && (
          <p className={`mb-2 font-semibold uppercase tracking-wide text-primary ${dense ? 'text-[10px]' : 'text-[13px]'}`}>
            {step.section}
          </p>
        )}
        <h2 className={`font-bold tracking-tight text-slate-900 leading-tight ${dense ? 'text-base' : 'text-[26px] sm:text-[30px]'}`}>
          {step.question}
        </h2>
        {step.hint && <p className={`mt-2 text-slate-500 ${dense ? 'text-xs' : 'text-[15px]'}`}>{step.hint}</p>}

        <div className={dense ? 'mt-3' : 'mt-7'}>
          {step.kind === 'single' && (
            <div className={`flex flex-col ${dense ? 'gap-1.5' : 'gap-3'}`}>
              {step.options.map((o) => {
                const active = answers[step.id] === o.value
                return (
                  <OptionButton key={o.value} option={o} active={active} dense={dense} onClick={() => pickSingle(o.value)} />
                )
              })}
            </div>
          )}

          {step.kind === 'multi' && (
            <div className={`flex flex-col ${dense ? 'gap-1.5' : 'gap-3'}`}>
              {step.options.map((o) => (
                <OptionButton
                  key={o.value}
                  option={o}
                  active={selectedMulti.includes(o.value)}
                  showCheck
                  dense={dense}
                  onClick={() => toggleMulti(o.value)}
                />
              ))}
            </div>
          )}

          {step.kind === 'textarea' && (
            <textarea
              autoFocus
              rows={dense ? 3 : 4}
              value={(answers[step.id] as string) ?? ''}
              onChange={(e) => setAnswer(step.id, e.target.value)}
              placeholder={step.placeholder}
              className={`w-full resize-none rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                dense ? 'px-2.5 py-2 text-xs' : 'px-4 py-3 text-[16px]'
              }`}
            />
          )}

          {(step.kind === 'text' || step.kind === 'tel' || step.kind === 'number' || step.kind === 'date') && (
            <input
              autoFocus
              type={step.kind === 'text' ? 'text' : step.kind}
              inputMode={step.kind === 'tel' ? 'tel' : step.kind === 'number' ? 'numeric' : undefined}
              value={(answers[step.id] as string) ?? ''}
              onChange={(e) => setAnswer(step.id, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goNext() } }}
              placeholder={step.placeholder}
              className={`w-full rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                dense ? 'px-2.5 py-2 text-xs' : 'px-4 py-3.5 text-[18px]'
              }`}
            />
          )}

          {step.kind === 'contact' && (
            <div className={`flex flex-col ${dense ? 'gap-2' : 'gap-4'}`}>
              <div>
                <label className={`mb-1.5 block font-medium text-slate-600 ${dense ? 'text-xs' : 'text-sm'}`}>Phone number</label>
                <input
                  autoFocus
                  type="tel"
                  inputMode="tel"
                  value={(answers.phone as string) ?? ''}
                  onChange={(e) => setAnswer('phone', e.target.value)}
                  placeholder="(215) 555-0100"
                  className={`w-full rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                    dense ? 'px-2.5 py-2 text-xs' : 'px-4 py-3.5 text-[18px]'
                  }`}
                />
              </div>
              <div>
                <label className={`mb-1.5 block font-medium text-slate-600 ${dense ? 'text-xs' : 'text-sm'}`}>Email</label>
                <input
                  type="email"
                  inputMode="email"
                  value={(answers.email as string) ?? ''}
                  onChange={(e) => setAnswer('email', e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goNext() } }}
                  placeholder="you@example.com"
                  className={`w-full rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                    dense ? 'px-2.5 py-2 text-xs' : 'px-4 py-3.5 text-[18px]'
                  }`}
                />
              </div>
              <p className={dense ? 'text-xs text-slate-400' : 'text-sm text-slate-400'}>Enter at least one — whichever you prefer.</p>
            </div>
          )}
        </div>

        {error && <p className={`mt-4 text-red-600 ${dense ? 'text-xs' : 'text-sm'}`}>{error}</p>}

        {/* CAPTCHA on the final step only, so its token is fresh at submit. */}
        {isLast && (
          <div className="mt-6">
            <TurnstileWidget
              onVerify={(t) => setAnswers((a) => ({ ...a, turnstileToken: t }))}
            />
          </div>
        )}

        {/* Single-select auto-advances, so it needs no Continue button. */}
        {step.kind !== 'single' && (
          <div className={`flex items-center gap-3 ${dense ? 'mt-4' : 'mt-8'}`}>
            <button
              onClick={goNext}
              disabled={submitting}
              className={`rounded-full bg-primary font-semibold text-white transition-colors hover:bg-primary-dark cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                dense ? 'px-4 py-1.5 text-xs' : 'px-7 py-3 text-[15px]'
              }`}
            >
              {submitting ? 'Submitting…' : isLast ? submitLabel : 'Continue'}
            </button>
            {step.optional && (
              <button
                onClick={goNext}
                disabled={submitting}
                className={`font-medium text-slate-400 hover:text-slate-600 cursor-pointer ${dense ? 'text-xs' : 'text-[15px]'}`}
              >
                Skip
              </button>
            )}
          </div>
        )}
        {step.kind === 'single' && step.optional && (
          <button
            onClick={() => goToStep(Math.min(clampedIdx + 1, visible.length - 1))}
            className={`font-medium text-slate-400 hover:text-slate-600 cursor-pointer ${dense ? 'mt-3 text-xs' : 'mt-7 text-[15px]'}`}
          >
            Skip
          </button>
        )}
      </div>
    </Shell>
  )
}

// Brief placeholder shown while a data-driven wizard's form config is still
// loading (see useForms.ts) — same chrome as Shell (full-screen for 'modal',
// a plain bounded box for 'inline'), minus the progress bar and Back button,
// since there's no step to show yet.
export function WizardLoading({ onClose, variant = 'modal' }: { onClose: () => void; variant?: 'modal' | 'inline' }) {
  if (variant === 'inline') {
    return (
      <div className="flex h-full w-full flex-col overflow-y-auto bg-white">
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-end bg-white/95 px-3 py-2 backdrop-blur">
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-6 w-6 place-items-center rounded-full text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-4 py-8 text-center text-xs text-slate-400">Loading…</div>
      </div>
    )
  }
  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto" role="dialog" aria-modal="true">
      <div className="sticky top-0 bg-white/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-xl items-center justify-end px-4 sm:px-6 py-3">
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-xl px-4 sm:px-6 py-16 text-center text-sm text-slate-400">Loading…</div>
    </div>
  )
}

// ── Presentational pieces ─────────────────────────────────────────────────────

function OptionButton({
  option,
  active,
  showCheck,
  dense,
  onClick,
}: {
  option: Option
  active: boolean
  showCheck?: boolean
  dense?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'group flex items-center rounded-2xl border text-left transition-all cursor-pointer',
        dense ? 'gap-2 px-3 py-2.5' : 'gap-3 px-4 py-4',
        active
          ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
      ].join(' ')}
    >
      {option.icon && <span className={`shrink-0 ${dense ? 'text-base' : 'text-2xl'}`} aria-hidden="true">{option.icon}</span>}
      <span className={`font-medium text-slate-900 ${dense ? 'text-xs' : 'text-[15px]'}`}>{option.label}</span>
      {showCheck && (
        // Square (not circular) so it reads as a checkbox — these steps are
        // multi-select ("tap all that apply"), and a round indicator looks like
        // a single-choice radio.
        <span
          className={[
            'ml-auto grid shrink-0 place-items-center rounded-md border text-white',
            dense ? 'h-4 w-4 text-[9px]' : 'h-5 w-5 text-[11px]',
            active ? 'border-primary bg-primary' : 'border-slate-300',
          ].join(' ')}
          aria-hidden="true"
        >
          {active ? '✓' : ''}
        </span>
      )}
    </button>
  )
}

function Shell({
  variant = 'modal',
  progress,
  onClose,
  onBack,
  stepText,
  children,
}: {
  variant?: 'modal' | 'inline'
  progress: number
  onClose: () => void
  onBack: (() => void) | null
  stepText: string
  children: React.ReactNode
}) {
  if (variant === 'inline') {
    return (
      <div className="relative flex h-full w-full flex-col overflow-y-auto bg-white">
        <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 bg-white/95 px-3 py-2 backdrop-blur">
          <button
            onClick={onBack ?? undefined}
            disabled={!onBack}
            className="flex items-center gap-0.5 rounded-full py-0.5 pl-0.5 pr-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-0 cursor-pointer disabled:cursor-default"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="shrink-0 text-[10px] font-medium text-slate-400 tabular-nums">{stepText}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-3 py-3">{children}</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto" role="dialog" aria-modal="true">
      <div className="sticky top-0 bg-white/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 sm:px-6 py-3">
          <button
            onClick={onBack ?? undefined}
            disabled={!onBack}
            className="flex items-center gap-1 rounded-full py-1 pl-1 pr-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-0 cursor-pointer disabled:cursor-default"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-medium text-slate-400 tabular-nums">{stepText}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-4 sm:px-6 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-10 sm:pt-16">{children}</div>
    </div>
  )
}
