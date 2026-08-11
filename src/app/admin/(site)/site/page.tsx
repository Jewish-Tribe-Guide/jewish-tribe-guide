// Exists only so /admin/site resolves to a route — the actual content is
// rendered by the shared (site) route-group layout (see ../layout.tsx),
// which reads the URL itself to decide 'site' vs. 'home' rather than reading
// anything from this page.
export default function AdminSitePage() {
  return null
}
