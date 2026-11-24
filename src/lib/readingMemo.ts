import { createHash } from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────────────
// The same words, the same reading.
//
// The AI doesn't read one page the same way twice. Sons of Israel's Schedule
// of Tefillot, unchanged, was read four nights running (Nov 21–24) and came
// back with Thursday's 8:15 Shacharis there one night and gone the next,
// Sunday's 8:00 dropped, Shabbos's Sephardic minyan at 8:30 or 9:00. Each
// reading that differed from the listing was filed, so an admin approving
// one took a minyan off the live listing that the page never dropped.
//
// So a shul page's reading is kept on its watch (WatchCheck.readings), under
// the words the AI was given and the model, and given back when the same
// words are read again: a page reread because its week came due, or because
// the listing changed, reads as it did. Only words that changed are read
// afresh. Today's date is left out of the key: it is in the AI's
// instructions, but the days listed after it (a week at a time) are kept, so
// a new week is read afresh.
//
// Only the readings used by this read are kept, so what is saved stays the
// size of one page's.
// ─────────────────────────────────────────────────────────────────────────────

/** The AI's raw answers, by key (WatchCheck.readings). */
export type Readings = Record<string, unknown>

export type ReadingMemo = {
  /** The answer kept for these words, if there is one. */
  recall(messages: readonly unknown[], model: string, today: string): unknown | undefined
  /** Keeps the answer these words got, for the next read. */
  keep(messages: readonly unknown[], model: string, today: string, raw: unknown): void
  /** What this read used, to be saved on the watch. */
  used(): Readings
}

export function readingKey(messages: readonly unknown[], model: string, today: string): string {
  const words = JSON.stringify(messages).split(`Today is ${today}`).join('Today is …')
  return createHash('sha256').update(`${model}\n${words}`).digest('hex').slice(0, 32)
}

export function readingMemo(had: Readings | null | undefined): ReadingMemo {
  const used: Readings = {}
  return {
    recall(messages, model, today) {
      const key = readingKey(messages, model, today)
      if (!had || !Object.hasOwn(had, key)) return undefined
      used[key] = had[key]
      return had[key]
    },
    keep(messages, model, today, raw) {
      used[readingKey(messages, model, today)] = raw
    },
    used: () => ({ ...used }),
  }
}
