// Exists only so /admin/home resolves to a route — the content is rendered
// by the shared (site) route-group layout (see ../layout.tsx), which reads
// the URL itself to decide 'home' vs. 'menus'.
export default function AdminHomePage() {
  return null
}
