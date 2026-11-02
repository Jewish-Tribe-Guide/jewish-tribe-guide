// What a change adds to a piece of text, word by word, so a note on To do
// can mark it in place (board R1Women). The whole new text comes back in
// order, split into runs that were there before and runs that are new.

export type WordRun = { text: string; added: boolean }

/** Past this many words a side, the marks aren't worth the work: none. */
const MAX = 1500

export function addedWords(was: string, now: string): WordRun[] {
  // Each word with the space after it, so the runs join back up exactly.
  const tokens = (t: string) => t.match(/\S+\s*|\s+/g) ?? []
  const a = tokens(was).map((w) => w.trim())
  const b = tokens(now)
  const words = b.map((w) => w.trim())
  if (a.length > MAX || b.length > MAX) return now ? [{ text: now, added: false }] : []
  // The longest run of words the two share, by the usual table.
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === words[j] && a[i] !== '' ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const kept = new Array<boolean>(m).fill(false)
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === words[j] && a[i] !== '') {
      kept[j] = true
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++
    else j++
  }
  const runs: WordRun[] = []
  b.forEach((text, j) => {
    // Space alone goes with what's around it.
    const added = words[j] === '' ? (runs.at(-1)?.added ?? false) : !kept[j]
    const last = runs.at(-1)
    if (last && last.added === added) last.text += text
    else runs.push({ text, added })
  })
  return runs
}
