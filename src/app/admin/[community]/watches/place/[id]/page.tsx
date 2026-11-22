import Screen from './Screen'

// The admin is static output (its layout's ensureStatic = 'navigation'), so
// a screen with an id in its address names some ids to build ahead. One stand-in: a place's own address is rendered on its first visit.
// The screen itself is a Client Component and reads the id from the address.
export function generateStaticParams() {
  return [{ id: '_' }]
}

export default function Page() {
  return <Screen />
}
