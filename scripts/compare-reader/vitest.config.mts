import { defineConfig } from 'vitest/config'

// The search-vs-reader comparison (compare.run.ts): reads production and
// calls OpenAI, so it's kept out of `npm test` (whose config only includes
// *.test.ts) and run by hand.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['scripts/compare-reader/*.run.ts'],
  },
})
