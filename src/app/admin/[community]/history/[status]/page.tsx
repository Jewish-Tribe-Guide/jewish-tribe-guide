import Screen from './Screen'

// The admin is static output (its layout's ensureStatic = 'navigation'), so
// a screen with an id in its address names some ids to build ahead. Its two lists.
// The screen itself is a Client Component and reads the id from the address.
export function generateStaticParams() {
  return [{ status: 'approved' }, { status: 'rejected' }]
}

export default function Page() {
  return <Screen />
}
