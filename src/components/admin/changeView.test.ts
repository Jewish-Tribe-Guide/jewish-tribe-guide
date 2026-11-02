import { describe, expect, it } from 'vitest'
import { changeAnswers, oneMinyanTime } from './changeView'
import type { Minyan } from '@/lib/davening'
import type { CategoryField } from '@/lib/categories'
import type { FieldDiff } from '@/lib/submissionDiff'

const fields = [
  { key: 'kosherCertification', label: 'Kosher Certification', type: 'select' },
  { key: 'kosherCertificationUrl', label: 'Certification link', type: 'url' },
  { key: 'womensNotes', label: 'Women’s Notes', type: 'textarea' },
  { key: 'hours', label: 'Hours', type: 'hours' },
] as CategoryField[]

const diff = (key: string, before: string, after: string): FieldDiff => ({ key, label: key, before, after, changed: true })

// The user, Nov 2: buttons that name the change, as the boards draw them.
describe('a change’s answers on To do', () => {
  it('a short field: Change to the new, Keep the old (R5Link)', () => {
    const changed = [diff('kosherCertification', 'Keystone-K', 'IKC'), diff('kosherCertificationUrl', 'keystone-k.org', 'mekorhabracha.org/post/plnt-burger-1')]
    expect(changeAnswers({ changed, fields, rows: ['Kosher'] })).toEqual({ yes: 'Change to IKC', no: 'Keep Keystone-K' })
  })

  it('one minyan’s time: Change to it, Keep the old (E1Times)', () => {
    expect(changeAnswers({ changed: [diff('minyanim', 'a', 'b')], fields, rows: ['Usual weekday times'], minyan: { was: '6:45 AM', now: '6:35 AM' } })).toEqual({ yes: 'Change to 6:35 AM', no: 'Keep 6:45 AM' })
  })

  it('new dishes: Add the 3 dishes, Don’t add them (R6After)', () => {
    expect(changeAnswers({ changed: [diff('dishes', '', 'x')], fields, rows: ['Main dishes'], items: { added: ['Pizza', 'Calzones', 'Salads'], removed: [], noun: 'dish' } })).toEqual({ yes: 'Add the 3 dishes', no: 'Don’t add them' })
    expect(changeAnswers({ changed: [diff('dishes', '', 'x')], fields, rows: ['Main dishes'], items: { added: ['Pizza'], removed: [], noun: 'dish' } })).toEqual({ yes: 'Add Pizza', no: 'Don’t add it' })
  })

  it('a long field: Update it by name, Don’t update (R1Women)', () => {
    expect(changeAnswers({ changed: [diff('womensNotes', 'To make an appointment', 'To make an appointment, call')], fields, rows: ['Women’s'] })).toEqual({ yes: 'Update Women’s notes', no: 'Don’t update' })
  })

  it('a short field added or taken off', () => {
    expect(changeAnswers({ changed: [diff('kosherCertification', '—', 'IKC')], fields, rows: ['Kosher'] })).toEqual({ yes: 'Add IKC', no: 'Don’t add it' })
    expect(changeAnswers({ changed: [diff('kosherCertification', 'IKC', '—')], fields, rows: ['Kosher'] })).toEqual({ yes: 'Remove IKC', no: 'Keep IKC' })
  })

  it('several fields over several rows: Update the listing', () => {
    const changed = [diff('hours', 'Sun 9–5', 'Sun 10–5'), diff('womensNotes', 'a', 'b')]
    expect(changeAnswers({ changed, fields, rows: ['Hours', 'Women’s'] })).toEqual({ yes: 'Update the listing', no: 'Don’t update' })
    expect(changeAnswers({ changed, fields, rows: ['Women’s'] })).toEqual({ yes: 'Update Women’s', no: 'Don’t update' })
    expect(changeAnswers({ changed, fields, rows: ['This week’s schedule'] }).yes).toBe('Update this week’s schedule')
  })
})

describe('the one minyan a change moves', () => {
  const m = (id: string, time: string, days: Minyan['days'] = ['mon']): Minyan => ({ id, tefillah: 'shacharis', days, time })
  const was = [m('a', '6:45 AM'), m('b', '8:15 AM')]

  it('names its time before and after (E1Times)', () => {
    expect(oneMinyanTime(was, [m('a', '6:35 AM'), m('b', '8:15 AM')])).toEqual({ was: '6:45 AM', now: '6:35 AM' })
  })

  it('none when more than its time moved, or more than one, or one is new', () => {
    expect(oneMinyanTime(was, [m('a', '6:35 AM', ['tue']), m('b', '8:15 AM')])).toBeNull()
    expect(oneMinyanTime(was, [m('a', '6:35 AM'), m('b', '8:05 AM')])).toBeNull()
    expect(oneMinyanTime(was, [...was, m('c', '9 AM')])).toBeNull()
  })
})
