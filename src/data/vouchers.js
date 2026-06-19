// Lapisan data Voucher — Supabase (tabel public.vouchers).
// Voucher seller yang dikaitkan ke beberapa produk Kalkulator; biaya voucher
// (ditanggung seller) jadi komponen biaya pada produk yang berlaku.
// Di-scope per workspace via RLS.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

function rowToVoucher(r) {
  return {
    id: r.id,
    name: r.name,
    discountType: r.discount_type,       // 'percent' | 'nominal'
    discountValue: Number(r.discount_value) || 0,
    maxDiscount: r.max_discount == null ? null : Number(r.max_discount),
    minPurchase: r.min_purchase == null ? null : Number(r.min_purchase),
    productIds: Array.isArray(r.product_ids) ? r.product_ids : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function toRow(v) {
  return {
    name: v.name || 'Tanpa Nama',
    discount_type: v.discountType === 'nominal' ? 'nominal' : 'percent',
    discount_value: +v.discountValue || 0,
    max_discount: v.maxDiscount === '' || v.maxDiscount == null ? null : +v.maxDiscount,
    min_purchase: v.minPurchase === '' || v.minPurchase == null ? null : +v.minPurchase,
    product_ids: Array.isArray(v.productIds) ? v.productIds : [],
  }
}

export async function listVouchers() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return []
  const { data, error } = await supabase
    .from('vouchers')
    .select('*')
    .eq('workspace_id', wsId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data || []).map(rowToVoucher)
}

// Tambah voucher baru, atau update bila id sudah ada.
export async function saveVoucher(voucher) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const base = toRow(voucher)

  if (voucher.id) {
    const { data, error } = await supabase
      .from('vouchers')
      .update({ ...base, updated_at: new Date().toISOString() })
      .eq('id', voucher.id)
      .select('*')
      .single()
    if (error) throw error
    return rowToVoucher(data)
  }
  const { data, error } = await supabase
    .from('vouchers')
    .insert({ workspace_id: wsId, ...base })
    .select('*')
    .single()
  if (error) throw error
  return rowToVoucher(data)
}

export async function deleteVoucher(id) {
  const { error } = await supabase.from('vouchers').delete().eq('id', id)
  if (error) throw error
}
