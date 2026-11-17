import { AsyncLocalStorage } from 'node:async_hooks'

// What a check validated while it ran: each listing confirmFromSource found
// just as its source has it, and the boxes it read (sourceConfirm.ts). The
// nightly watches run each watch inside `validatedDuring`, and save what it
// validated with the run (job_run.kinds), for Activity's "Validated" row
// (validatedNights.ts). A listing is validated only when it is confirmed,
// so Activity and a listing's "Confirmed by …" date always agree. Outside
// a run, noting does nothing. Server-only.

export type Validated = { id: string; boxes: readonly string[] }

const during = new AsyncLocalStorage<Validated[]>()

/** Runs `run` and gives back what it validated, in order. */
export async function validatedDuring<T>(run: () => Promise<T>): Promise<{ result: T; validated: Validated[] }> {
  const validated: Validated[] = []
  const result = await during.run(validated, run)
  return { result, validated }
}

/** Called by confirmFromSource for each listing it found agreeing. */
export function noteValidated(id: string, boxes: readonly string[]): void {
  if (boxes.length) during.getStore()?.push({ id, boxes: [...boxes] })
}
