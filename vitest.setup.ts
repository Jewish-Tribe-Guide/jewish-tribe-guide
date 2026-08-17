// Adds jest-dom's matchers (toBeInTheDocument, toHaveTextContent, ...) to
// Vitest's `expect` — imported once here rather than per component test file.
// A no-op for the plain-function tests that don't render anything.
import '@testing-library/jest-dom/vitest'
import { installMockGeolocation } from './src/test/geolocationMock'

// jsdom 30's own window.localStorage isn't reliably wired up through
// vitest's jsdom environment on this toolchain (Node 26 also defines its own
// experimental, unconfigured `localStorage` global, which the two seem to
// conflict over) — `window.localStorage` comes back `undefined` rather than
// jsdom's real Storage implementation. A minimal in-memory stand-in sidesteps
// that entirely rather than depending on a specific jsdom/Node combination.
// A no-op in the default `node` environment (no `window`).
if (typeof window !== 'undefined') {
  function memoryStorage(): Storage {
    const store = new Map<string, string>()
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() { return store.size },
    }
  }
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
      writable: true,
    })
    Object.defineProperty(target, 'sessionStorage', {
      value: memoryStorage(),
      configurable: true,
      writable: true,
    })
  }

  // jsdom doesn't implement window.matchMedia at all (not a stub gap, just
  // absent) — anything using useIsMobile() (SiteHeader, CommunitySwitcher,
  // ...) throws without this. Always reports `matches: false` (desktop),
  // matching useIsMobile's own SSR-safe default; a test that specifically
  // needs the mobile branch should override window.matchMedia itself.
  if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })
  }

  // jsdom has no navigator.geolocation at all — see geolocationMock.ts for
  // the full rationale and how to drive a specific success/error path.
  installMockGeolocation()
}
