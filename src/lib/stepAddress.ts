// The steps open inside an admin screen, in the address: a row of a
// listing's editor and a minyan or a person inside it, what a read found,
// a source's Change over the listing, a change's Edit. Each is a level of
// a path under its own query parameter (?row=hours, ?row=minyans/2), so
// Back, Forward and a reload land on it (AGENTS.md: "A screen of its own
// is an entry in the browser's history"). useStepsInAddress keeps a
// screen's steps and the address in step; this is the address side.
//
// The parameters are listed here, not made up by each screen, so a screen
// that moves to another place (Places, To do) can take every one off:
// they belong to the place that was open.

// `box`: the site's + Add box (TellUsSheet), on any page.
export const STEP_PARAMS = ['found', 'over', 'edit', 'row', 'step', 'box'] as const
export type StepParam = (typeof STEP_PARAMS)[number]

/** `owner`: a screen sharing its parameter with others mounted beside it
 *  (To do's things at one place, each kept while it has an edit open):
 *  its steps are written after its name, and another's read as none. */
const OWNED = '~'

/** Only what would be read as a separator (and `%` itself): the query
 *  string encodes the rest once, so ?row=minyans%3Aweekday, not %253A. */
const escapeStep = (s: string) => s.replace(/[%/~]/g, encodeURIComponent)

function encode(path: readonly string[], owner?: string): string {
  const steps = path.map(escapeStep).join('/')
  return owner ? `${escapeStep(owner)}${OWNED}${steps}` : steps
}

/** The steps the address has under `param`: [] when none, or another's. */
export function stepsIn(search: string, param: StepParam, owner?: string): string[] {
  let value = new URLSearchParams(search).get(param)
  if (!value) return []
  if (owner !== undefined) {
    const mine = `${escapeStep(owner)}${OWNED}`
    if (!value.startsWith(mine)) return []
    value = value.slice(mine.length)
  } else if (value.includes(OWNED)) return []
  return value ? value.split('/').map(decodeURIComponent) : []
}

/** This address with `path` under `param`, everything else kept. */
export function withSteps(pathname: string, search: string, param: StepParam, path: readonly string[], owner?: string): string {
  const params = new URLSearchParams(search)
  if (path.length) params.set(param, encode(path, owner))
  else params.delete(param)
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

/** This address with none of `which` steps (all of them unless said), the
 *  rest kept: the place behind them. */
export function withoutSteps(pathname: string, search: string, which: readonly StepParam[] = STEP_PARAMS): string {
  const params = new URLSearchParams(search)
  for (const p of which) params.delete(p)
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

/** How many steps the address has open, every parameter's together: the
 *  entries a place's own Back steps over to get to what's behind it. */
export function stepCount(search: string, which: readonly StepParam[] = STEP_PARAMS): number {
  const params = new URLSearchParams(search)
  let n = 0
  for (const p of which) {
    const value = params.get(p)
    if (!value) continue
    const steps = value.includes(OWNED) ? value.slice(value.indexOf(OWNED) + 1) : value
    if (steps) n += steps.split('/').length
  }
  return n
}

export const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((s, i) => s === b[i])

/** Whether `a` is `b` or a step on the way to it. */
export const leadsTo = (a: readonly string[], b: readonly string[]) => a.length <= b.length && a.every((s, i) => s === b[i])

export function sharedLength(a: readonly string[], b: readonly string[]): number {
  let k = 0
  while (k < a.length && k < b.length && a[k] === b[k]) k++
  return k
}
