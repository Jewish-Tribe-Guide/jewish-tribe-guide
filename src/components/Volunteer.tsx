'use client'

import { useEffect, useState } from 'react'
import VolunteerForm from '@/components/intake/VolunteerForm'
import VolunteerRemovalForm from '@/components/intake/VolunteerRemovalForm'
import UpButton from '@/components/UpButton'

type SubMode = 'signup' | 'edit' | 'remove'

// History state page.tsx stamps, plus the sub-view this component adds.
type VolNavState = { mode?: string; volunteerView?: string }

type Props = {
  /** Hierarchical Up from the signup screen → the audience home. */
  onUp: () => void
}

export default function Volunteer({ onUp }: Props) {
  // The signup form is the page itself (a history entry pushed by page.tsx).
  // 'edit' and 'remove' are history-backed sub-views so browser-back returns to
  // signup rather than overshooting to the home screen.
  const [subMode, setSubMode] = useState<SubMode>(() => {
    if (typeof window === 'undefined') return 'signup'
    const v = (window.history.state as VolNavState | null)?.volunteerView
    return v === 'edit' || v === 'remove' ? v : 'signup'
  })
  const [submitted, setSubmitted] = useState(false)

  // Sync the sub-view on browser back/forward. Volunteer renders in both the
  // patient ('volunteer') and community ('give') branches, so accept either mode.
  useEffect(() => {
    function onPop(e: PopStateEvent) {
      const s = e.state as VolNavState | null
      if (s?.mode !== 'volunteer' && s?.mode !== 'give') return
      const v = s?.volunteerView
      setSubMode(v === 'edit' || v === 'remove' ? v : 'signup')
      setSubmitted(false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Navigate forward into edit/remove — pushes a history entry so browser-back
  // returns to signup.
  function goToSubMode(mode: SubMode) {
    setSubMode(mode)
    setSubmitted(false)
    history.pushState({ ...window.history.state, volunteerView: mode }, '')
  }

  // Hierarchical Up from an edit/remove sub-view → the signup screen (pushes the
  // parent, decoupled from browser Back).
  function goToSignup() {
    setSubMode('signup')
    setSubmitted(false)
    history.pushState({ ...(window.history.state ?? {}), volunteerView: 'signup' }, '')
  }

  // The top Up button leaves the sub-view (→ signup) when editing/removing, and
  // otherwise leaves the Volunteer page entirely (→ home, via onUp from page.tsx).
  const inSubView = subMode !== 'signup' && !submitted

  return (
    <div>
      <UpButton
        label={inSubView ? 'Volunteer' : 'Home'}
        onClick={inSubView ? goToSignup : onUp}
      />

      {/* Page heading */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Volunteer</h2>
        <p className="text-sm text-muted mt-0.5">
          {subMode === 'edit'
            ? 'Update your commitment'
            : subMode === 'remove'
              ? 'Remove yourself from the list'
              : 'Help a family in the hospital'}
        </p>
      </div>

      {/* ── Signup mode ── */}
      {subMode === 'signup' && (
        <>
          {!submitted && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
              <p className="text-sm text-slate-700 leading-relaxed">
                Volunteers are the heart of this community — bringing a meal, sitting with someone during a long
                hospital stay, offering a ride, or opening your home to an out-of-town family. Tell us how you&apos;d
                like to help, and we&apos;ll reach out when there&apos;s a need that matches.
              </p>
              <p className="text-sm text-muted leading-relaxed mt-3">
                Signing up isn&apos;t a commitment — it just lets us know you&apos;re willing to help. You can update
                or remove your information at any time using the links below.
              </p>
            </div>
          )}

          <VolunteerForm
            mode="signup"
            onClose={onUp}
            onSubmitted={() => setSubmitted(true)}
          />

          {!submitted && (
            <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col items-center gap-1.5 text-sm text-muted">
              <p>
                Already signed up?{' '}
                <button
                  onClick={() => goToSubMode('edit')}
                  className="text-primary underline underline-offset-2 hover:text-primary-dark cursor-pointer transition-colors"
                >
                  Update your commitment
                </button>
              </p>
              <p>
                <button
                  onClick={() => goToSubMode('remove')}
                  className="text-slate-400 underline underline-offset-2 hover:text-slate-600 cursor-pointer transition-colors"
                >
                  Remove yourself from the list
                </button>
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Edit mode ── */}
      {subMode === 'edit' && (
        <>
          {!submitted && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
              <p className="text-sm font-semibold text-amber-800 mb-1">Re-enter your full commitment</p>
              <p className="text-sm text-amber-700 leading-relaxed">
                The form below replaces your entire existing record — not just what changed. Fill in everything
                you&apos;re willing to help with. Anything you leave blank will unfortunately be treated as removed.
              </p>
            </div>
          )}

          <VolunteerForm
            mode="edit"
            onClose={goToSignup}
            onSubmitted={() => setSubmitted(true)}
          />
        </>
      )}

      {/* ── Remove mode ── */}
      {subMode === 'remove' && (
        <>
          {!submitted && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
              <p className="text-sm text-slate-700 leading-relaxed">
                No problem at all — life changes. Submit the form below and we&apos;ll remove your name from the
                volunteer list. Please use the same name and phone number you originally signed up with so we can
                find your record.
              </p>
            </div>
          )}

          <VolunteerRemovalForm
            onClose={goToSignup}
            onSubmitted={() => setSubmitted(true)}
          />
        </>
      )}
    </div>
  )
}
