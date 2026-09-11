// Exists only so /admin/desktop resolves to a route — the actual content is
// rendered by the shared (site) route-group layout (see ../layout.tsx),
// which reads the URL itself to decide 'site' vs. 'desktop' vs. 'mobile'
// rather than reading anything from this page.
export default function AdminDesktopPage() {
  return null
}
