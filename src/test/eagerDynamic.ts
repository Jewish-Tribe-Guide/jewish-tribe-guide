import { createElement, type ComponentType } from 'react'

// `next/dynamic` for the unit suite: the code is loaded when the component
// file is imported, and vitest.setup.ts waits for it before any test runs, so
// a lazily-loaded piece (the opened listing, the feedback form) renders on the
// first try, as it did when it was a plain import. Which chunk a piece ships
// in is a bundling question the unit suite can't see; e2e/budgets.spec.ts is
// what checks it.

const pending: Promise<unknown>[] = []

type Loader = () => Promise<ComponentType<never> | { default: ComponentType<never> }>

export default function dynamic(loader: Loader, opts?: { loading?: ComponentType }) {
  let Loaded: ComponentType<never> | null = null
  pending.push(
    loader().then((m) => {
      Loaded = 'default' in m ? m.default : m
    }),
  )
  function EagerDynamic(props: object) {
    if (Loaded) return createElement(Loaded, props as never)
    return opts?.loading ? createElement(opts.loading) : null
  }
  return EagerDynamic
}

/** Every `dynamic()` called so far, loaded. */
export async function dynamicLoaded(): Promise<void> {
  await Promise.all(pending)
}
