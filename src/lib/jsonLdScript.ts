// Serializes a JSON-LD object for embedding via
// dangerouslySetInnerHTML={{ __html: ... }} in a <script type="application/
// ld+json">. JSON.stringify's own escaping doesn't touch `<`, so a value
// containing `</script>` (e.g. admin-edited site name/description) would
// close the tag early and let whatever follows be parsed as HTML — a real
// XSS vector for exactly this pattern. Escaping `<` to < closes that:
// it's inert inside a <script> tag either way, and any real JSON.parse
// consumer (a crawler, a browser devtool) decodes it straight back to '<'.
export function buildJsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
