// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.resetModules()
})

/** The switch and the look it gives, as a page on this deployment shows them. */
async function onDeployment(env: string | undefined) {
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', env)
  vi.resetModules()
  const { default: RowLookSwitch, useRowLook } = await import('./RowLookSwitch')
  function Page() {
    const [look, setLook] = useRowLook()
    return (
      <>
        <p>Rows: {look}</p>
        <RowLookSwitch look={look} onChange={setLook} />
      </>
    )
  }
  render(<Page />)
}

describe('RowLookSwitch', () => {
  it('shows on a preview, with the look this browser chose', async () => {
    localStorage.setItem('jpc:row-look', 'list')
    await onDeployment('preview')
    expect(screen.getByRole('group', { name: 'Row look, preview only' })).toBeInTheDocument()
    expect(await screen.findByText('Rows: list')).toBeInTheDocument()
  })

  it('never shows on the live site, which always has cards', async () => {
    localStorage.setItem('jpc:row-look', 'list')
    await onDeployment('production')
    expect(screen.queryByRole('group', { name: /Row look/ })).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByText('Rows: cards')).toBeInTheDocument()
  })
})
