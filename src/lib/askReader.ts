'use client'

import { questionKey, type Reading } from './questionReader'

// The page's side of the question reader (POST /api/ask/read). Every way it
// can't read a question comes back as an answer, never a throw, and the
// page then answers with today's search alone, as it always has.
//
// A question asked twice in one visit is asked once: the answer is kept
// for the tab's life (the server remembers it for everyone, this saves the
// round trip). "off" is kept for the whole visit, so a site without the
// reader never asks again; "busy" and "failed" aren't kept, so the same
// question can be tried again.

export type ReaderAnswer = { ok: true; reading: Reading } | { ok: false; reason: 'off' | 'busy' | 'failed' }

const TIMEOUT_MS = 8000
const answers = new Map<string, Promise<ReaderAnswer>>()
let off = false

export function askReader(question: string, community: string | null): Promise<ReaderAnswer> {
  if (off) return Promise.resolve({ ok: false, reason: 'off' })
  const key = `${community ?? ''}\n${questionKey(question)}`
  const known = answers.get(key)
  if (known) return known
  const asked = ask(question, community).then((answer) => {
    if (!answer.ok && answer.reason === 'off') off = true
    if (!answer.ok) answers.delete(key)
    return answer
  })
  answers.set(key, asked)
  return asked
}

async function ask(question: string, community: string | null): Promise<ReaderAnswer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`/api/ask/read${community ? `?community=${encodeURIComponent(community)}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: controller.signal,
    })
    const body = (await res.json()) as { ok?: boolean; reading?: Reading; reason?: string }
    if (body.ok && body.reading) return { ok: true, reading: body.reading }
    return { ok: false, reason: body.reason === 'off' || body.reason === 'busy' ? body.reason : 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  } finally {
    clearTimeout(timer)
  }
}

/** For tests: forget every answer, and that the reader was off. */
export function forgetReaderAnswers() {
  answers.clear()
  off = false
}
