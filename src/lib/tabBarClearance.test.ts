import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TAB_BAR_CLEARANCE } from './tabBarClearance'

// The phone screens over the tab bar leave the bar's height plus the
// iPhone's safe area at their bottom, not a flat 96px, which left a gap
// under the footer in Safari (the user, Nov 14). The gap itself is checked
// in a real browser (e2e/phone-home.spec.ts); this keeps every screen on
// the one value.

const SCREENS = [
  'src/components/Landing.tsx',
  'src/app/[community]/[slug]/SlugScreen.tsx',
  'src/app/[community]/browse/BrowseScreen.tsx',
  'src/app/[community]/changes/ChangesScreen.tsx',
  'src/app/[community]/feedback/FeedbackScreen.tsx',
  'src/app/[community]/you/YouScreen.tsx',
]

describe('room for the tab bar', () => {
  it('is the bar plus the safe area', () => {
    expect(TAB_BAR_CLEARANCE).toContain('env(safe-area-inset-bottom)')
  })

  it.each(SCREENS)('%s leaves it, and no flat 96px', (file) => {
    const src = readFileSync(file, 'utf8')
    expect(src).toContain('${TAB_BAR_CLEARANCE}')
    expect(src).not.toMatch(/\bpb-24\b/)
  })
})
