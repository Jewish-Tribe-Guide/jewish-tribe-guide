import { describe, expect, it } from 'vitest'
import { buildJsonLdScript } from './jsonLdScript'

describe('buildJsonLdScript', () => {
  it('serializes a plain object as JSON', () => {
    const result = buildJsonLdScript({ '@type': 'WebSite', name: 'Philly Jewish Guide' })
    expect(JSON.parse(result)).toEqual({ '@type': 'WebSite', name: 'Philly Jewish Guide' })
  })

  it('escapes "<" so a closing </script> tag inside a value cannot break out', () => {
    const malicious = '</script><img src=x onerror=alert(1)>'
    const result = buildJsonLdScript({ name: malicious })

    expect(result).not.toContain('</script>')
    expect(result).toContain('\\u003c/script>')
    // Round-trips back to the original string for any real JSON consumer.
    expect(JSON.parse(result)).toEqual({ name: malicious })
  })

  it('leaves ordinary text untouched', () => {
    const result = buildJsonLdScript({ name: 'A guide to Jewish Philadelphia' })
    expect(JSON.parse(result)).toEqual({ name: 'A guide to Jewish Philadelphia' })
  })
})
