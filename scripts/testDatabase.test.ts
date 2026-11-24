import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isLocalAddress, parseStatus, testDatabase } from './testDatabase.mjs'

const LOCAL = { API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'anon', SERVICE_ROLE_KEY: 'service' }
const noStatus = () => {
  throw new Error('supabase is not running')
}

describe('the write suites’ database', () => {
  it('is the running local Supabase when nothing is set, and is passed on', () => {
    const env: Record<string, string | undefined> = {}
    expect(testDatabase(env, () => LOCAL)).toEqual({ url: LOCAL.API_URL, anonKey: 'anon', serviceRoleKey: 'service' })
    expect(env).toEqual({ TEST_DB_URL: LOCAL.API_URL, TEST_DB_ANON_KEY: 'anon', TEST_DB_SERVICE_ROLE_KEY: 'service' })
  })

  it('is TEST_DB_* when set (CI’s container can’t ask Docker)', () => {
    const env = { TEST_DB_URL: 'http://localhost:54321', TEST_DB_ANON_KEY: 'a', TEST_DB_SERVICE_ROLE_KEY: 's' }
    expect(testDatabase(env, noStatus).url).toBe('http://localhost:54321')
  })

  it('refuses a hosted project, even one named on purpose', () => {
    const env = { TEST_DB_URL: 'https://lzkulpwawxneelhwvych.supabase.co', TEST_DB_ANON_KEY: 'a', TEST_DB_SERVICE_ROLE_KEY: 's' }
    expect(() => testDatabase(env, noStatus)).toThrow(/must be a local Supabase/)
  })

  it('never takes the hosted test project’s settings (.env.local sets them)', () => {
    const env = { TEST_SUPABASE_URL: 'https://lzkulpwawxneelhwvych.supabase.co', TEST_SUPABASE_ANON_KEY: 'a', TEST_SUPABASE_SERVICE_ROLE_KEY: 's' }
    expect(() => testDatabase(env, noStatus)).toThrow(/npm run test:db/)
  })

  it('says how to start one when none is running', () => {
    expect(() => testDatabase({}, noStatus)).toThrow(/npm run test:db/)
  })

  it('knows a local address', () => {
    expect(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321'].map(isLocalAddress)).toEqual([true, true, true])
    expect(['https://x.supabase.co', 'http://127.0.0.1.example.com', 'nonsense'].map(isLocalAddress)).toEqual([false, false, false])
  })

  it('reads the CLI’s status output', () => {
    expect(parseStatus('API_URL="http://127.0.0.1:54321"\nANON_KEY="eyJ"\nnoise\n')).toEqual({ API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'eyJ' })
  })
})

// Every entry point of a suite that writes goes through testDatabase(), so
// none can be pointed at a hosted project. Derived from the files, so a new
// write suite's config is checked too: every playwright.*.config.ts but
// e2e's own (read-only; it builds against whatever the app is pointed at).
describe('every write suite asks for its database', () => {
  const entries = [
    ...readdirSync('.').filter((f) => /^playwright\..+\.config\.ts$/.test(f)),
    'src/test/integrationEnv.ts',
    'scripts/run-test-project-server.mjs',
  ]

  it('finds them at all', () => {
    expect(entries.length).toBeGreaterThanOrEqual(5)
  })

  for (const file of entries) {
    it(file, () => {
      const source = readFileSync(file, 'utf-8')
      expect(source).toMatch(/\btestDatabase\(\)/)
      expect(source, `${file} reads the hosted project's settings`).not.toMatch(/TEST_SUPABASE_|SHARED_DEV_TEST_PROJECT/)
    })
  }
})
