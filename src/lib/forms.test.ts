import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONTACT_STEPS,
  evaluateCondition,
  slugifyStepId,
  stepIsVisible,
  STEP_KIND_HAS_OPTIONS,
  STEP_KINDS,
  type FormStep,
} from './forms'

// The branching DSL is what makes the intake wizards data-driven — an admin
// reorders or retitles a question and the branching has to keep holding. It's
// serialized into the database, so a change in meaning here silently changes
// which questions real people are asked.

describe('evaluateCondition', () => {
  describe('includes', () => {
    it('matches a value inside a multi-select answer', () => {
      expect(evaluateCondition({ field: 'needs', op: 'includes', value: 'meals' }, { needs: ['meals', 'visit'] })).toBe(true)
      expect(evaluateCondition({ field: 'needs', op: 'includes', value: 'rides' }, { needs: ['meals'] })).toBe(false)
    })

    it('matches a scalar answer by equality', () => {
      expect(evaluateCondition({ field: 'who', op: 'includes', value: 'self' }, { who: 'self' })).toBe(true)
      expect(evaluateCondition({ field: 'who', op: 'includes', value: 'self' }, { who: 'other' })).toBe(false)
    })

    it('is false when the step was never answered', () => {
      expect(evaluateCondition({ field: 'needs', op: 'includes', value: 'meals' }, {})).toBe(false)
    })
  })

  describe('notIncludes', () => {
    it('is the inverse of includes for both shapes', () => {
      expect(evaluateCondition({ field: 'needs', op: 'notIncludes', value: 'meals' }, { needs: ['visit'] })).toBe(true)
      expect(evaluateCondition({ field: 'needs', op: 'notIncludes', value: 'meals' }, { needs: ['meals'] })).toBe(false)
      expect(evaluateCondition({ field: 'who', op: 'notIncludes', value: 'self' }, { who: 'other' })).toBe(true)
    })

    it('holds for an unanswered step — nothing was chosen, so nothing was included', () => {
      expect(evaluateCondition({ field: 'needs', op: 'notIncludes', value: 'meals' }, {})).toBe(true)
    })
  })

  describe('notEmpty / empty', () => {
    it('treats whitespace as empty, so a spacebar does not count as an answer', () => {
      expect(evaluateCondition({ field: 'phone', op: 'notEmpty' }, { phone: '   ' })).toBe(false)
      expect(evaluateCondition({ field: 'phone', op: 'empty' }, { phone: '   ' })).toBe(true)
    })

    it('reads an empty multi-select as empty', () => {
      expect(evaluateCondition({ field: 'needs', op: 'notEmpty' }, { needs: [] })).toBe(false)
      expect(evaluateCondition({ field: 'needs', op: 'empty' }, { needs: [] })).toBe(true)
      expect(evaluateCondition({ field: 'needs', op: 'notEmpty' }, { needs: ['meals'] })).toBe(true)
    })

    it('reads a missing answer as empty', () => {
      expect(evaluateCondition({ field: 'phone', op: 'empty' }, {})).toBe(true)
      expect(evaluateCondition({ field: 'phone', op: 'notEmpty' }, {})).toBe(false)
    })

    it('is always exactly one of empty or notEmpty', () => {
      const values = ['', '  ', 'x', [], ['a'], undefined, null, 0, 5, false, true]
      for (const value of values) {
        const notEmpty = evaluateCondition({ field: 'f', op: 'notEmpty' }, { f: value })
        const empty = evaluateCondition({ field: 'f', op: 'empty' }, { f: value })
        expect(notEmpty, `value: ${JSON.stringify(value)}`).toBe(!empty)
      }
    })
  })
})

describe('stepIsVisible', () => {
  const step = (when?: FormStep['when']): FormStep => ({ id: 's', kind: 'text', question: 'Q', when })

  it('shows a step with no conditions', () => {
    expect(stepIsVisible(step(), {})).toBe(true)
    expect(stepIsVisible(step([]), {})).toBe(true)
  })

  it('requires every condition, not just one (AND, not OR)', () => {
    const s = step([
      { field: 'phone', op: 'notEmpty' },
      { field: 'email', op: 'empty' },
    ])
    expect(stepIsVisible(s, { phone: '215-555-0100', email: '' })).toBe(true)
    expect(stepIsVisible(s, { phone: '215-555-0100', email: 'a@b.com' })).toBe(false)
    expect(stepIsVisible(s, { phone: '', email: '' })).toBe(false)
  })
})

describe('DEFAULT_CONTACT_STEPS', () => {
  // forms.ts allows two steps to share an id only when they're mutually
  // exclusive branches. If both `preferredContact` steps could ever show at
  // once, the second would overwrite the first's answer and the person would
  // be asked the same question twice — so the invariant is worth pinning
  // rather than trusting the comment.
  it('never shows two steps that share an id at the same time', () => {
    const answerSets = [
      {},
      { phone: '', email: '' },
      { phone: '215-555-0100', email: '' },
      { phone: '', email: 'a@b.com' },
      { phone: '215-555-0100', email: 'a@b.com' },
      { phone: '   ', email: '   ' },
    ]

    for (const answers of answerSets) {
      const visibleIds = DEFAULT_CONTACT_STEPS.filter((s) => stepIsVisible(s, answers)).map((s) => s.id)
      expect(new Set(visibleIds).size, `answers: ${JSON.stringify(answers)}`).toBe(visibleIds.length)
    }
  })

  it('offers email as a contact preference only when an email was given', () => {
    const withPhoneOnly = DEFAULT_CONTACT_STEPS.find(
      (s) => s.id === 'preferredContact' && stepIsVisible(s, { phone: '215-555-0100', email: '' }),
    )
    expect(withPhoneOnly?.options?.map((o) => o.value)).toEqual(['phone', 'text'])

    const withBoth = DEFAULT_CONTACT_STEPS.find(
      (s) => s.id === 'preferredContact' && stepIsVisible(s, { phone: '215-555-0100', email: 'a@b.com' }),
    )
    expect(withBoth?.options?.map((o) => o.value)).toContain('email')
  })

  it('always asks for a name and a way to reach back', () => {
    const alwaysVisible = DEFAULT_CONTACT_STEPS.filter((s) => stepIsVisible(s, {})).map((s) => s.id)
    expect(alwaysVisible).toContain('name')
    expect(alwaysVisible).toContain('contact')
  })
})

describe('slugifyStepId', () => {
  it('turns a question into a safe answer key', () => {
    expect(slugifyStepId('How many guests?')).toBe('how_many_guests')
    expect(slugifyStepId('What’s your name?')).toBe('what_s_your_name')
  })

  it('does not leave leading or trailing separators', () => {
    expect(slugifyStepId('  Which hospital?  ')).toBe('which_hospital')
    expect(slugifyStepId('!!!')).toBe('')
  })

  it('produces something usable as an object key and a URL-safe id', () => {
    for (const question of ['Room #?', 'Date & time', 'Kosher / halal?', 'שם']) {
      expect(slugifyStepId(question)).toMatch(/^[a-z0-9_]*$/)
    }
  })
})

describe('STEP_KINDS', () => {
  // 'contact' is the one bespoke phone+email screen. Offering it in the picker
  // would let an admin add a second one, which buildContact() cannot handle.
  it('does not offer the bespoke contact screen as a pickable type', () => {
    expect(STEP_KINDS.map((k) => k.value)).not.toContain('contact')
  })

  it('only claims options for the kinds that render them', () => {
    expect(STEP_KIND_HAS_OPTIONS('single')).toBe(true)
    expect(STEP_KIND_HAS_OPTIONS('multi')).toBe(true)
    for (const kind of ['text', 'textarea', 'tel', 'number', 'date', 'contact'] as const) {
      expect(STEP_KIND_HAS_OPTIONS(kind), kind).toBe(false)
    }
  })
})
