import { describe, expect, it } from 'vitest'
import { stepCount, stepsIn, withSteps, withoutSteps } from './stepAddress'

describe('steps in the address', () => {
  it('reads back what it writes, other parameters kept', () => {
    const href = withSteps('/philly/admin/places', '?place=mi', 'row', ['minyans:weekday', '0'])
    expect(href).toBe('/philly/admin/places?place=mi&row=minyans%3Aweekday%2F0')
    expect(stepsIn(new URL(href, 'http://x').search, 'row')).toEqual(['minyans:weekday', '0'])
  })

  it('a step holding a separator comes back whole', () => {
    const path = ['give:Its menu / 50% off', 'a~b']
    const href = withSteps('/a', '', 'step', path, 'p.Menu can’t be read')
    expect(stepsIn(new URL(href, 'http://x').search, 'step', 'p.Menu can’t be read')).toEqual(path)
  })

  it('another owner’s steps read as none, and unowned ones to an owner', () => {
    const search = new URL(withSteps('/a', '', 'step', ['hours'], 'one'), 'http://x').search
    expect(stepsIn(search, 'step', 'two')).toEqual([])
    expect(stepsIn(search, 'step')).toEqual([])
    expect(stepsIn('?step=hours', 'step', 'one')).toEqual([])
  })

  it('counts every parameter’s steps, and takes them off', () => {
    const search = '?place=mi&found=menu&row=minyans%3Aweekday%2F0&step=ab~hours'
    expect(stepCount(search)).toBe(4)
    expect(stepCount(search, ['row'])).toBe(2)
    expect(withoutSteps('/p', search)).toBe('/p?place=mi')
    expect(withoutSteps('/p', search, ['row'])).toBe('/p?place=mi&found=menu&step=ab%7Ehours')
  })
})
