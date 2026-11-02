// Why a page didn't load, in plain words, from the error its last read
// kept (a watch's lastError: the reader's own "Couldn't read the page: it
// answered with an error (406)", troubleClause's words, or an older
// "HTTP 403", "fetch failed"). For a place's source card opened on To do
// (board O2Pizza: "Their site turns away automatic visits, so it can't be
// read"). Null when the error says nothing a person could act on, so the
// card shows only the link.

const WORDS: [RegExp, string][] = [
  // 406 is what a site's firewall sends an automatic visit as often as 403.
  [/\b(401|403|406|429)\b|forbidden|captcha|cloudflare|access denied|turned the reader away|\bbot\b/i, 'Their site turns away automatic visits, so it can’t be read'],
  [/\b(404|410)\b|not found/i, 'The page isn’t there any more'],
  [/ENOTFOUND|getaddrinfo|EAI_AGAIN|DNS/i, 'The address doesn’t lead to a site any more'],
  [/certificate|SSL|TLS|CERT_/i, 'Their site’s security certificate is broken'],
  [/timed? ?out|timeout|ETIMEDOUT|aborted|in time/i, 'Their site took too long to answer'],
  [/\b5\d\d\b/, 'Their site gave an error'],
  [/ECONNREFUSED|ECONNRESET|fetch failed|socket hang up|network|couldn’t be reached/i, 'Their site didn’t answer'],
]

const READER = 'Couldn’t read the page'

export function whyNoLoad(error: string | null | undefined): string | null {
  if (!error) return null
  const plain = WORDS.find(([re]) => re.test(error))?.[1]
  if (plain) return plain
  // The reader's other reasons are plain already: "it sent something that
  // isn't a page, a PDF or a picture".
  if (error.startsWith(`${READER}: `)) {
    const clause = error.slice(READER.length + 2)
    return clause[0].toUpperCase() + clause.slice(1)
  }
  if (error.startsWith(`${READER} (`)) return `It may be ${error.slice(READER.length + 2, -1)}`
  return null
}
