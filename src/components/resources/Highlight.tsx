import { wordMatches } from '@/lib/ask'

// Text with the words a search matched in bold — the reason a result is
// there, shown rather than left to be found. Matches word by word with the
// search's own rules (see wordMatches), so "cholov" bolds "Chalav".
export default function Highlight({ text, terms, allowTypos = false }: { text: string; terms: readonly string[]; allowTypos?: boolean }) {
  if (terms.length === 0) return <>{text}</>
  // Splitting on a captured group keeps the words at the odd indexes.
  const parts = text.split(/([\p{L}\p{N}'’]+)/u)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 && wordMatches(part, terms, allowTypos) ? (
          <mark key={i} className="bg-transparent font-bold text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}
