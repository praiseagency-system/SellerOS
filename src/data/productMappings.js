// Lapisan data canonical product mapping (public.product_mappings).
// Semua fungsi TAHAN kalau tabelnya belum ada — aplikasi tetap jalan dengan
// mapping kosong (pencocokan otomatis by SKU/nama), jadi migrasi 0043 boleh
// menyusul tanpa membuat halaman error.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

const MISSING_TABLE = /relation .*product_mappings.* does not exist|schema cache/i

function rowToMapping(r) {
  return {
    id: r.id,
    canonicalProductId: r.canonical_product_id,
    canonicalProductName: r.canonical_product_name || '',
    shopeeProductId: r.shopee_product_id || null,
    tiktokProductId: r.tiktok_product_id || null,
    shopeeProductName: r.shopee_product_name || null,
    tiktokProductName: r.tiktok_product_name || null,
    productType: r.product_type || null,
    variant: r.variant || null,
    size: r.size || null,
    bundleComposition: Array.isArray(r.bundle_composition) ? r.bundle_composition : [],
    mappingStatus: r.mapping_status,
    mappingConfidence: r.mapping_confidence,
    mappingSource: r.mapping_source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function toRow(m, wsId) {
  return {
    workspace_id: wsId,
    canonical_product_id: m.canonicalProductId,
    canonical_product_name: m.canonicalProductName || '',
    shopee_product_id: m.shopeeProductId || null,
    tiktok_product_id: m.tiktokProductId || null,
    shopee_product_name: m.shopeeProductName || null,
    tiktok_product_name: m.tiktokProductName || null,
    product_type: m.productType || null,
    variant: m.variant || null,
    size: m.size || null,
    bundle_composition: m.bundleComposition || [],
    mapping_status: m.mappingStatus || 'needs_review',
    mapping_confidence: m.mappingConfidence ?? null,
    mapping_source: m.mappingSource || null,
    updated_at: new Date().toISOString(),
  }
}

export async function listMappings() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return []
  const { data, error } = await supabase
    .from('product_mappings').select('*').eq('workspace_id', wsId)
  if (error) {
    if (MISSING_TABLE.test(error.message || '')) {
      console.info('[mapping] tabel product_mappings belum ada — jalankan migrasi 0043')
      return []
    }
    throw error
  }
  return (data || []).map(rowToMapping)
}

// Simpan mapping. Konflik pada listing yang sama = update (idempotent), jadi
// import ulang / konfirmasi ulang tak pernah membuat baris kembar.
export async function upsertMapping(mapping) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const row = toRow(mapping, wsId)

  const q = supabase.from('product_mappings').select('id').eq('workspace_id', wsId)
  const { data: existing } = mapping.shopeeProductId
    ? await q.eq('shopee_product_id', mapping.shopeeProductId).maybeSingle()
    : await q.eq('tiktok_product_id', mapping.tiktokProductId).maybeSingle()

  if (existing?.id) {
    const { error } = await supabase.from('product_mappings').update(row).eq('id', existing.id)
    if (error) throw error
    return existing.id
  }
  const { data, error } = await supabase.from('product_mappings').insert(row).select('id').single()
  if (error) throw error
  return data.id
}

// Pasangkan dua listing jadi satu canonical product (mapping manual).
// Manual selalu menang atas auto-match pada import berikutnya.
export async function confirmPair({ canonicalProductId, canonicalProductName, shopee, tiktok, source = 'manual' }) {
  const rows = []
  if (shopee) rows.push({ canonicalProductId, canonicalProductName, shopeeProductId: shopee.kode_produk, shopeeProductName: shopee.nama_produk, mappingStatus: 'verified', mappingSource: source, mappingConfidence: 1 })
  if (tiktok) rows.push({ canonicalProductId, canonicalProductName, tiktokProductId: tiktok.kode_produk, tiktokProductName: tiktok.nama_produk, mappingStatus: 'verified', mappingSource: source, mappingConfidence: 1 })
  for (const r of rows) await upsertMapping(r)
  await logMapping(canonicalProductId, 'confirm', { shopee: shopee?.kode_produk, tiktok: tiktok?.kode_produk })
  return canonicalProductId
}

// Lepaskan listing dari canonical product.
export async function unmerge(canonicalProductId) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { error } = await supabase.from('product_mappings')
    .delete().eq('workspace_id', wsId).eq('canonical_product_id', canonicalProductId)
  if (error && !MISSING_TABLE.test(error.message || '')) throw error
  await logMapping(canonicalProductId, 'unmerge', {})
}

// Tolak usulan: dicatat sebagai unmatched supaya tak diusulkan lagi.
export async function rejectPair({ canonicalProductId, shopee, tiktok }) {
  if (shopee) await upsertMapping({ canonicalProductId: `reject:${shopee.kode_produk}`, canonicalProductName: shopee.nama_produk, shopeeProductId: shopee.kode_produk, shopeeProductName: shopee.nama_produk, mappingStatus: 'unmatched', mappingSource: 'manual', mappingConfidence: 0 })
  if (tiktok) await upsertMapping({ canonicalProductId: `reject:${tiktok.kode_produk}`, canonicalProductName: tiktok.nama_produk, tiktokProductId: tiktok.kode_produk, tiktokProductName: tiktok.nama_produk, mappingStatus: 'unmatched', mappingSource: 'manual', mappingConfidence: 0 })
  await logMapping(canonicalProductId || 'reject', 'reject', { shopee: shopee?.kode_produk, tiktok: tiktok?.kode_produk })
}

export async function logMapping(canonicalProductId, action, detail) {
  try {
    const wsId = getCurrentWorkspaceId()
    if (!wsId) return
    const { data: u } = await supabase.auth.getUser()
    await supabase.from('product_mapping_log').insert({
      workspace_id: wsId,
      canonical_product_id: canonicalProductId,
      action,
      detail: detail || {},
      by_email: u?.user?.email || null,
    })
  } catch { /* log tak boleh menggagalkan aksi utama */ }
}

export async function listMappingLog(limit = 50) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return []
  const { data, error } = await supabase
    .from('product_mapping_log').select('*')
    .eq('workspace_id', wsId).order('created_at', { ascending: false }).limit(limit)
  if (error) return []
  return data || []
}
