import Screen from './Screen'
import { NIGHT_KINDS } from '@/lib/nightKinds'

// The admin is static output (its layout's ensureStatic = 'navigation'), so
// a screen with an id in its address names some ids to build ahead. Every job.
// The screen itself is a Client Component and reads the id from the address.
export function generateStaticParams() {
  return [...NIGHT_KINDS.map((k) => ({ id: k.id })), { id: 'look-again' }]
}

export default function Page() {
  return <Screen />
}
