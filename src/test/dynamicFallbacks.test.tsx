// @vitest-environment jsdom
import { Suspense, useState, type ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Oct 15: the first "Edit listing" on an eruv flashed the Eruv page with
// nothing open before the editor came up. EruvEditor is a `next/dynamic`
// piece, and next/dynamic only puts a Suspense boundary of its own around a
// piece given a `loading` (or `ssr: false`). Without one, the wait for its
// code climbs to the nearest boundary above, and the ones above a screen
// are page-sized: SlugScreen's falls back to the whole category page as it
// renders with no query string, Landing's to the home screen. Only the first
// time, since the code is cached after that, which is why it reads as a
// flash and not a bug.

afterEach(cleanup)

type Loader = () => Promise<{ default: ComponentType }>
// The App Router's next/dynamic: the build points `next/dynamic` here for
// app/ code; the package's own `next/dynamic` is the Pages Router one.
const realDynamic = (await vi.importActual<{ default: (l: Loader, o?: object) => ComponentType }>('next/dist/shared/lib/app-dynamic')).default

describe('next/dynamic, as it really behaves (the unit suite otherwise loads pieces eagerly)', () => {
  function Screen({ Piece }: { Piece: ComponentType }) {
    const [open, setOpen] = useState(false)
    return (
      <>
        <p>The open listing</p>
        <button type="button" onClick={() => setOpen(true)}>Edit listing</button>
        {open && <Piece />}
      </>
    )
  }
  async function firstOpen(opts?: object) {
    let arrive!: (m: { default: ComponentType }) => void
    const Piece = realDynamic(() => new Promise((r) => (arrive = r)), opts)
    render(
      <Suspense fallback={<p>The whole page, nothing open</p>}>
        <Screen Piece={Piece} />
      </Suspense>,
    )
    await act(async () => screen.getByRole('button', { name: 'Edit listing' }).click())
    return { arrive: (C: ComponentType) => act(async () => arrive({ default: C })) }
  }

  it('without a loading, the first open shows the page’s fallback in place of the screen', async () => {
    await firstOpen()
    expect(screen.getByText('The whole page, nothing open')).toBeVisible()
    expect(screen.getByText('The open listing')).not.toBeVisible()
  })

  it('with one, the screen stays as it is, and the piece comes in when its code does', async () => {
    const { arrive } = await firstOpen({ loading: () => null })
    expect(screen.queryByText('The whole page, nothing open')).not.toBeInTheDocument()
    expect(screen.getByText('The open listing')).toBeVisible()
    await arrive(() => <p>The editor</p>)
    expect(screen.getByText('The editor')).toBeVisible()
  })
})

// So every piece in the app has one. A `dynamic(` is read up to its closing
// parenthesis: the import and its options.
describe('every next/dynamic piece waits in its own place', () => {
  const root = join(__dirname, '..')
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return files(path)
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
    })
  const users = files(root)
    .map((path) => ({ file: relative(root, path), source: readFileSync(path, 'utf8') }))
    .filter(({ source }) => /from 'next\/dynamic'/.test(source))
  const calls = users.flatMap(({ file, source }) =>
    [...source.matchAll(/\bdynamic\(\(\) => import\([^)]*\)(?:, \{[^}]*\})?\)/g)].map((m) => ({ file, call: m[0] })),
  )

  it('finds the pieces (a check that reads nothing passes for the wrong reason)', () => {
    expect(calls.length).toBeGreaterThan(5)
    expect(calls.map((c) => c.file)).toContain(join('components', 'resources', 'EruvListing.tsx'))
    // One written another way (over several lines, `.then(m => m.X)`) would
    // slip past the pattern: that's a failure here, not a pass.
    const written = users.reduce((n, { source }) => n + (source.match(/\bdynamic\(/g)?.length ?? 0), 0)
    expect(calls.length).toBe(written)
  })

  it('each has a loading or is ssr: false', () => {
    const bare = calls.filter((c) => !/loading:|ssr: false/.test(c.call))
    expect(bare.map((c) => `${c.file}: ${c.call}`)).toEqual([])
  })
})
