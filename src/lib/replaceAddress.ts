// Changes the address without a navigation, the way Next's router learns of
// it (AGENTS.md, "A screen of its own is an entry in the browser's
// history"). Next patches replaceState, but treats a call whose state
// carries its own `__NA` mark (as `window.history.state` does) as its own
// and passes it straight through, so its router keeps the old address and
// its next commit writes it back (Nov 17, Back from a listing's own page).
// Without the mark, Next copies its state in and moves its own address to
// this one. The other keys (a `step`) are kept.
// src/test/replaceStateMark.test.ts fails on a call that doesn't do this.

export function replaceAddress(url: string | URL): void {
  const state: Record<string, unknown> = { ...(window.history.state ?? {}) }
  delete state.__NA
  window.history.replaceState(state, '', url)
}
