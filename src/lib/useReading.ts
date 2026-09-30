'use client'

import { useRef, useState } from 'react'
import { askReader } from './askReader'
import type { Reading } from './questionReader'

// A page's question reading (see questionReader.ts): the one asked for,
// while it's being read, and once it's here, the reading, which the
// visitor can edit by removing its chips. The page decides when to ask
// (Enter, a shared link, a pause on a question nothing answers) and uses
// the reading only while it's still for the question in the box.

export type PageReading = { question: string; reading: Reading }

export function useReading(community: string | null) {
  const [read, setRead] = useState<PageReading | null>(null)
  const [readingNow, setReadingNow] = useState<string | null>(null)
  const asked = useRef<string | null>(null)

  function ask(question: string) {
    const q = question.trim()
    if (!q || asked.current === q) return
    asked.current = q
    setReadingNow(q)
    void askReader(q, community).then((answer) => {
      setReadingNow((now) => (now === q ? null : now))
      if (answer.ok) setRead({ question: q, reading: answer.reading })
      // Not kept as asked when it couldn't be read: Enter tries again.
      else if (asked.current === q) asked.current = null
    })
  }

  return {
    /** The reading for `question`, or null. */
    readingFor: (question: string) => (read && read.question === question.trim() ? read.reading : null),
    /** Whether `question` is being read right now. */
    isReading: (question: string) => readingNow !== null && readingNow === question.trim(),
    ask,
    /** The visitor removed a chip. */
    edit: (reading: Reading) => read && setRead({ ...read, reading }),
  }
}
