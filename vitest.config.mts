import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Unit tests for the pure logic in src/lib (time/hours/zmanim/distance math,
// input validation — the functions whose bugs are invisible in a screenshot)
// plus component tests for src/components.
//
// Default environment is `node` — most existing tests are plain functions
// with no DOM. Component tests (src/**/*.test.tsx) opt into jsdom per-file via
// a `// @vitest-environment jsdom` docblock at the top of the file, rather
// than switching the whole suite to jsdom, so the fast majority of tests keep
// paying zero DOM-simulation cost.
export default defineConfig({
  plugins: [react()],
  // Resolves the `@/*` paths from tsconfig.json. Native to Vite now — the
  // vite-tsconfig-paths plugin is no longer needed for this.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Coverage of the tests/config themselves is meaningless — scope to the
      // application code the numbers are meant to describe.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.d.ts'],
    },
  },
})
