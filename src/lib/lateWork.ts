// Work given a time limit, whose "took too long" is saved the moment the
// limit passes, so the run can go on and a run Vercel stops still left a
// record. The work isn't stopped (an AI read can't be), so it may finish
// later and save its own answer too. Before Nov 18 the two saves raced and
// whichever landed last stood, so a slow "took too long" could overwrite
// what a late read found. Here the work is handed `ready`, which it awaits
// before it saves: once the limit has passed, that's the "took too long"
// save, so the late answer, the newer one, always lands after it.

export type LateOr<T> = { value: T } | { late: Promise<unknown> }

/** `work`'s value, or `late` (onLate's save) once `ms` pass. */
export function withinOrLate<T>(ms: number, work: (ready: () => Promise<void>) => Promise<T>, onLate: () => Promise<unknown>): Promise<LateOr<T>> {
  let saving: Promise<unknown> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const ready = async () => {
    if (saving) await saving.catch(() => {})
  }
  const late = new Promise<{ late: Promise<unknown> }>((resolve) => {
    timer = setTimeout(() => {
      saving = onLate()
      resolve({ late: saving })
    }, Math.max(0, ms))
  })
  return Promise.race([work(ready).then((value) => ({ value })), late]).finally(() => clearTimeout(timer))
}
