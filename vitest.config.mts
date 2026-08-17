import { defineConfig } from 'vitest/config'

// Unit tests for the pure logic in src/lib — time/hours/zmanim/distance math and
// input validation. These are the functions whose bugs are invisible in a
// screenshot (a wrong candle-lighting time, an "Open now" that isn't) and that
// nothing else in the stack checks.
//
// Deliberately the `node` environment with no React/jsdom setup: everything
// tested here is a plain function. Component and end-to-end coverage would need
// jsdom + @testing-library/react (or Playwright) and can be added alongside
// without changing this config.
export default defineConfig({
  // Resolves the `@/*` paths from tsconfig.json. Native to Vite now — the
  // vite-tsconfig-paths plugin is no longer needed for this.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Coverage of the tests/config themselves is meaningless — scope to the
      // application code the numbers are meant to describe.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
    },
  },
})
