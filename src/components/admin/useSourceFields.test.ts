import { describe, expect, it } from 'vitest'
import type { EditorRow } from '@/lib/editorRows'
import { looksLikeEmail, sourcePlaceholder } from './useSourceFields'

const row = (over: Partial<EditorRow>): EditorRow => ({ id: 'x', title: 'x', kind: 'minyans', fields: [], ...over })

describe('sourcePlaceholder', () => {
  it('this week’s schedule can come from an email; usual times only from a page', () => {
    expect(sourcePlaceholder(row({ id: 'minyans:this_week' }))).toBe('A page’s link or an email')
    expect(sourcePlaceholder(row({ id: 'minyans:next_week' }))).toBe('A page’s link or an email')
    expect(sourcePlaceholder(row({ id: 'minyans:weekday', box: 'weekday' }))).toBe('A page’s link')
    expect(sourcePlaceholder(row({ id: 'field:menu', kind: 'fields' }))).toBe('A page’s link')
  })
})

describe('looksLikeEmail', () => {
  it('an address or a mailto, never a page', () => {
    expect(looksLikeEmail('office@bethshalom.org')).toBe(true)
    expect(looksLikeEmail(' mailto:Office@BethShalom.org ')).toBe(true)
    expect(looksLikeEmail('https://bethshalom.org/schedule')).toBe(false)
    expect(looksLikeEmail('https://x.org/@shul')).toBe(false)
    expect(looksLikeEmail('bethshalom.org')).toBe(false)
  })
})
