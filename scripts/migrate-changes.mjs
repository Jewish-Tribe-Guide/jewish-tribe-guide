// Applies the four follow-up changes (idempotent). Run once:
//   node --env-file=.env.local scripts/migrate-changes.mjs
//
//   #1 WhatsApp Groups become a community category (with add/edit/report)
//   #2 grocery "Kosher items" field shows only when isKosher is checked
//   #3 "Kosher Challah" added to the kosher-item vocabulary
//   #4 restaurants get a "Kosher certification" field shown only when isKosher

import { createClient } from '@supabase/supabase-js'
import { whatsappGroups } from '../src/data/resources.js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Run: node --env-file=.env.local scripts/migrate-changes.mjs')
  process.exit(1)
}
const s = createClient(url, key, { auth: { persistSession: false } })
const slugify = (x) => x.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// ── #3 Kosher Challah ─────────────────────────────────────────────────────────
{
  const { error } = await s
    .from('tag')
    .upsert({ slug: 'kosher-challah', label: 'Kosher Challah', group: 'kosher_product' }, { onConflict: 'slug' })
  if (error) throw new Error(`#3 tag: ${error.message}`)
  console.log('✅ #3 added "Kosher Challah" tag')
}

// ── #2 grocery kosherItems only when isKosher ─────────────────────────────────
{
  const { data } = await s.from('category').select('fields').eq('id', 'grocery').single()
  const fields = data.fields ?? []
  const f = fields.find((x) => x.key === 'kosherItems')
  if (f && !f.showIf) {
    f.showIf = { field: 'isKosher', equals: true }
    const { error } = await s.from('category').update({ fields }).eq('id', 'grocery')
    if (error) throw new Error(`#2: ${error.message}`)
    console.log('✅ #2 grocery kosherItems now shows only when Kosher is checked')
  } else {
    console.log('• #2 already applied')
  }
}

// ── #4 restaurant certification when isKosher ─────────────────────────────────
{
  const { data } = await s.from('category').select('fields').eq('id', 'restaurant').single()
  const fields = data.fields ?? []
  if (!fields.some((x) => x.key === 'certification')) {
    fields.push({
      key: 'certification',
      label: 'Kosher certification (Hechsher)',
      type: 'text',
      renderAs: 'row',
      placeholder: 'e.g. OU, Star-K, local Vaad',
      showIf: { field: 'isKosher', equals: true },
    })
    const { error } = await s.from('category').update({ fields }).eq('id', 'restaurant')
    if (error) throw new Error(`#4: ${error.message}`)
    console.log('✅ #4 restaurants now have a Kosher certification field (when Kosher)')
  } else {
    console.log('• #4 already applied')
  }
}

// ── #1 WhatsApp Groups as a community category ────────────────────────────────
{
  const { error: catErr } = await s.from('category').upsert(
    {
      id: 'whatsapp',
      label: 'Community WhatsApp Group',
      plural_label: 'Community WhatsApp Groups',
      icon: '💬',
      description: 'Local support and coordination groups',
      sort_order: 60,
      fields: [
        { key: 'description', label: 'Description', type: 'textarea', renderAs: 'row' },
        { key: 'link', label: 'WhatsApp invite link', type: 'url', linkLabel: 'Join group', placeholder: 'https://chat.whatsapp.com/…' },
      ],
    },
    { onConflict: 'id' },
  )
  if (catErr) throw new Error(`#1 category: ${catErr.message}`)

  // Migrate the previously-hardcoded groups, only if none exist yet.
  const { count } = await s.from('resource').select('*', { count: 'exact', head: true }).eq('category', 'whatsapp')
  if (!count) {
    const rows = whatsappGroups.map((g) => ({
      category: 'whatsapp',
      name: g.name,
      anchor_id: 'community',
      details: { description: g.description ?? '', link: g.link },
      status: 'approved',
      reviewed_at: new Date().toISOString(),
    }))
    const { error } = await s.from('resource').insert(rows)
    if (error) throw new Error(`#1 groups: ${error.message}`)
    console.log(`✅ #1 created WhatsApp category + migrated ${rows.length} groups`)
  } else {
    console.log(`• #1 category ready; ${count} WhatsApp group(s) already present`)
  }
}

console.log('🎉 migrate-changes complete')
