import { createPrivateKey, createSign } from 'crypto'

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

function getEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function parsePrivateKey(raw: string): string {
  return raw
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n')
}

function base64url(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf.toString('base64url')
}

// Obtains a short-lived Google OAuth2 access token by signing a JWT with the
// service account private key directly via Node's built-in crypto — avoids
// google-auth-library's signing path which breaks on OpenSSL 3 (Node 18+).
async function getAccessToken(email: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }))

  const signingInput = `${header}.${payload}`
  const key = createPrivateKey(privateKeyPem)
  const signer = createSign('SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = base64url(signer.sign(key))

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Google token exchange failed (${res.status}): ${detail}`)
  }

  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('Google token response missing access_token')
  return data.access_token
}

// Appends a single row to a tab of the configured sheet via the Sheets v4 REST
// API. Defaults to the GOOGLE_SHEETS_TAB tab; pass opts.tab to target another
// (e.g. 'Volunteers'). The tab must already exist in the spreadsheet.
export async function appendRow(row: string[], opts: { tab?: string } = {}): Promise<void> {
  const spreadsheetId = getEnv('GOOGLE_SHEETS_ID')
  const tab = opts.tab || process.env.GOOGLE_SHEETS_TAB || 'Requests'
  const email = getEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const privateKey = parsePrivateKey(getEnv('GOOGLE_PRIVATE_KEY'))

  const token = await getAccessToken(email, privateKey)

  const range = encodeURIComponent(`${tab}!A:Z`)
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}` +
    `:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [row] }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Google Sheets append failed (${res.status}): ${detail}`)
  }
}
