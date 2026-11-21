import { useEffect, useState } from 'react'

// A minyan question typed over the list of shuls ("mincha tonight") is
// asked of Minyanim by time, as the home search would send it: the list
// of shuls has nothing to answer it with.
//
// Except the question the visitor just left the view on (Nov 16: search
// "what time is mincha today" on the home, land on Minyanim by time, tap
// the header's ‹, and Synagogues showed for a moment, then the view came
// back, since the question was still in the box). Leaving says they want
// the shuls; new words, or Enter, ask again.
//
// Moved out of GenericDirectory whole.
export function useMinyanQuestion({
  minyanQuestion,
  minyanimViewOn,
  setMinyanimViewOn,
  search,
}: {
  minyanQuestion: boolean
  minyanimViewOn: boolean
  setMinyanimViewOn: (on: boolean) => void
  search: string
}) {
  const [leftViewOn, setLeftViewOn] = useState<string | null>(null)
  const [viewWasOn, setViewWasOn] = useState(minyanimViewOn)
  if (viewWasOn !== minyanimViewOn) {
    setViewWasOn(minyanimViewOn)
    setLeftViewOn(minyanimViewOn ? null : search)
  }
  const asksMinyan = minyanQuestion && search !== leftViewOn
  useEffect(() => {
    if (!asksMinyan) return
    const timer = setTimeout(() => setMinyanimViewOn(true), 700)
    return () => clearTimeout(timer)
  }, [asksMinyan, setMinyanimViewOn])
}
