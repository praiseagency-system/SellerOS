// Lapisan data produk Kalkulator — Supabase (tabel public.calc_products).
// Menggantikan penyimpanan produk di localStorage (quadrant_products_v1).
// Field kalkulator disimpan utuh di kolom `data` jsonb; id/name/timestamps
// jadi kolom tersendiri. Di-scope per workspace via RLS.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

function rowToProduct(r) {
  return {
    ...(r.data || {}),
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// Field yang disimpan di kolom tersendiri tidak diduplikasi di `data`.
function toData(product) {
  // eslint-disable-next-line no-unused-vars
  const { id, name, createdAt, updatedAt, ...rest } = product
  return rest
}

export async function listProducts() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return []
  const { data, error } = await supabase
    .from('calc_products')
    .select('*')
    .eq('workspace_id', wsId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data || []).map(rowToProduct)
}

// Tambah produk baru, atau update bila id sudah ada.
export async function saveProduct(product) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const base = { name: product.name || 'Tanpa Nama', data: toData(product) }

  if (product.id) {
    const { data, error } = await supabase
      .from('calc_products')
      .update({ ...base, updated_at: new Date().toISOString() })
      .eq('id', product.id)
      .select('*')
      .single()
    if (error) throw error
    return rowToProduct(data)
  }
  const { data, error } = await supabase
    .from('calc_products')
    .insert({ workspace_id: wsId, ...base })
    .select('*')
    .single()
  if (error) throw error
  return rowToProduct(data)
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('calc_products').delete().eq('id', id)
  if (error) throw error
}

export async function duplicateProduct(id) {
  const wsId = getCurrentWorkspaceId()
  const { data: src, error } = await supabase
    .from('calc_products').select('*').eq('id', id).single()
  if (error) throw error
  const { data, error: ie } = await supabase
    .from('calc_products')
    .insert({ workspace_id: wsId, name: `${src.name} (Salinan)`, data: src.data })
    .select('*')
    .single()
  if (ie) throw ie
  return rowToProduct(data)
}
