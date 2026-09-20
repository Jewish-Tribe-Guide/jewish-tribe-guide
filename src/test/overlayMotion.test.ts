import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const css = read('src/app/globals.css')

// Overlays are mounted conditionally, so with no enter animation they pop in.
// Each entry is a file and the class its dim backdrop or popover must carry.
const OVERLAYS: Array<[string, string]> = [
  ['src/components/LiveLocationPrompt.tsx', 'overlay-in'],
  ['src/components/FeedbackForm.tsx', 'overlay-in'],
  ['src/components/ImageCropModal.tsx', 'overlay-in'],
  ['src/components/home/ContributePicker.tsx', 'overlay-in'],
  ['src/components/resources/ActionDialog.tsx', 'overlay-in'],
  ['src/components/resources/ListingDetailModal.tsx', 'overlay-in'],
  ['src/components/synagogues/DaveningTimesModal.tsx', 'overlay-in'],
  ['src/components/CommunitySwitcher.tsx', 'overlay-in'],
  ['src/components/home/LocationControl.tsx', 'menuIn'],
  ['src/components/CommunitySwitcher.tsx', 'menuIn'],
  ['src/components/resources/GenericDirectory.tsx', 'backdropIn_150ms'],
]

describe('overlay enter motion', () => {
  it.each(OVERLAYS)('%s uses %s', (file, token) => {
    expect(read(file)).toContain(token)
  })

  it('defines the keyframes and classes those tokens rely on', () => {
    for (const k of ['backdropIn', 'dialogIn', 'menuIn', 'fadeIn']) expect(css).toContain(`@keyframes ${k}`)
    expect(css).toMatch(/\.overlay-in\s*{[^}]*backdropIn/)
    expect(css).toMatch(/\.dialog-in\s*{[^}]*dialogIn/)
  })

  it('keeps the global reduced-motion override', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*{[^}]*animation-duration: 0\.01ms/)
  })
})
