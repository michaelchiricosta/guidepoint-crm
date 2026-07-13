import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://aenlxbxkrxgylgknlcft.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_3rSqBpPP1xF2H6QWw5-xsw_YhpKuMyW'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const __dirname = dirname(fileURLToPath(import.meta.url))
const seedPath = join(__dirname, '..', 'cyber_bible_seed.json')
const vendors = JSON.parse(readFileSync(seedPath, 'utf8'))

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

async function importVendors() {
  console.log(`\nImporting ${vendors.length} vendors into Supabase...\n`)

  // Quick connectivity check
  const { error: pingErr } = await supabase.from('cyber_bible_vendors').select('id').limit(1)
  if (pingErr) {
    if (pingErr.code === '42P01') {
      console.error('ERROR: Table "cyber_bible_vendors" does not exist.')
      console.error('Run the migration SQL from supabase/migrations/005_cyber_bible.sql in the Supabase SQL Editor first.')
    } else {
      console.error('ERROR connecting to Supabase:', pingErr.message)
    }
    process.exit(1)
  }

  let vendorOk = 0, vendorFail = 0, productOk = 0, productFail = 0

  for (let i = 0; i < vendors.length; i++) {
    const vendor = vendors[i]
    const rank = i + 1
    process.stdout.write(`[${rank}/${vendors.length}] ${vendor.name}... `)

    const { data: vendorRow, error: vendorErr } = await supabase
      .from('cyber_bible_vendors')
      .upsert({
        name: vendor.name,
        slug: slugify(vendor.name),
        cogs_rank: rank,
        tagline: vendor.tagline,
        overview: vendor.overview,
        industry_position: vendor.industry_position,
        industry_position_reason: vendor.industry_position_reason,
        founded_year: vendor.founded_year || null,
        hq: vendor.hq || null,
        website: vendor.website || null,
        last_enriched_at: new Date().toISOString(),
      }, { onConflict: 'slug' })
      .select()
      .single()

    if (vendorErr) {
      console.log(`FAIL (vendor): ${vendorErr.message}`)
      vendorFail++
      continue
    }
    vendorOk++

    // Delete existing products for this vendor to avoid dupes on re-run
    await supabase.from('cyber_bible_products').delete().eq('vendor_id', vendorRow.id)

    if (vendor.products?.length) {
      const products = vendor.products.map(p => ({
        vendor_id: vendorRow.id,
        name: p.name,
        description: p.description || null,
        primary_domain: p.primary_domain || null,
        primary_sub_domain: p.primary_sub_domain || null,
        secondary_domains: p.secondary_domains || [],
        key_capabilities: p.key_capabilities || [],
        ideal_customer: p.ideal_customer || null,
        not_a_fit_when: p.not_a_fit_when || null,
        differentiators: p.differentiators || [],
        weaknesses: p.weaknesses || [],
        things_to_watch_out_for: p.things_to_watch_out_for || [],
        typical_competitors: p.typical_competitors || [],
      }))

      const { error: prodErr } = await supabase.from('cyber_bible_products').insert(products)

      if (prodErr) {
        console.log(`vendor OK but products FAIL: ${prodErr.message}`)
        productFail += products.length
      } else {
        console.log(`✓ ${products.length} products`)
        productOk += products.length
      }
    } else {
      console.log('✓ (no products)')
    }
  }

  console.log(`\n─────────────────────────────────────`)
  console.log(`Vendors: ${vendorOk} ok, ${vendorFail} failed`)
  console.log(`Products: ${productOk} ok, ${productFail} failed`)
  console.log('Import complete.')
}

importVendors().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
