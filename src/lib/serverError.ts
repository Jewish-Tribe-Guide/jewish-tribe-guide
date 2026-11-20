import * as Sentry from '@sentry/nextjs'

// ── A caught error on the server reaches Sentry (Nov 20, the health sweep) ──
// Sentry heard only of errors nothing caught (instrumentation.ts's
// onRequestError). Everything the routes caught themselves, a save that
// failed and answered 500, an AI read that broke, an email after() couldn't
// send, went to the function's log and nowhere else, where nobody looks.
//
// So a route says it here instead of console.error: same arguments, same
// log line, and the same to Sentry. Grouped by the message, so each place
// is one issue however often it happens. Sentry only runs on the live
// deployment (instrumentation.ts); everywhere else this just logs.
// src/test/serverErrorsReachSentry.test.ts keeps console.error out of
// src/app/api.
//
// Server only: it imports Sentry's SDK as a value, which must never reach a
// page's first download (deferredSentry.ts). Pages report through that.

function text(v: unknown): string {
  if (v instanceof Error) return v.message
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** console.error, and the same to Sentry. `message` is the place and what
 *  failed ("[submissions] insert failed:"); the rest is what was caught. */
export function reportServerError(message: string, ...caught: unknown[]): void {
  console.error(message, ...caught)
  try {
    const error = caught.find((c): c is Error => c instanceof Error)
    Sentry.withScope((scope) => {
      scope.setFingerprint([message])
      scope.setTag('where', /^\[([^\]]+)\]/.exec(message)?.[1] ?? 'server')
      scope.setExtra('message', message)
      if (caught.length) scope.setExtra('caught', caught.map(text))
      if (error) Sentry.captureException(error)
      else Sentry.captureMessage([message, ...caught.map(text)].join(' '), 'error')
    })
  } catch {
    // Reporting must never be what breaks a request.
  }
}
