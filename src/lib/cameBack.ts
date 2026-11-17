// Whether the screen about to draw was reached by the browser's Back or
// Forward (‹ on the Map tab is a Back too). The tab bar reads it to light,
// on a category come back to, the tab it was first opened from.
//
// Its listener has to run before the router's, which draws the screen it
// pops to, so it's module code loaded from the root layout (BackGuardFirst),
// like backGuard.ts. Added in an effect, or in a module that loads later, it
// heard the Back only after the screen had drawn (checked on dev, Nov 16).
//
// A tap or key press clears it: a Back that changed no screen (a sheet
// closing) mustn't make the next tap's page count as come back to. ‹'s own
// tap comes before its Back, so it still counts.

let back = false

export const cameBack = () => back
export const backSpent = () => { back = false }

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => { back = true })
  window.addEventListener('pointerdown', backSpent, true)
  window.addEventListener('keydown', backSpent, true)
}
