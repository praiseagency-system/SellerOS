// Lapisan data Campaign — Supabase (tabel public.campaigns).
// Event campaign yang mengelompokkan produk + window tanggal; proyeksi margin
// dihitung dari Harga Campaign tiap produk. Di-scope per workspace via RLS.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

function rowToCampaign(r) {
  return {
    id: r.id,
    name: r.name,
    platform: r.platform || 'tiktok',
    description: r.description || '',
    startDate: r.start_date || '',
    endDate: r.end_date || '',
    items: Array.isArray(r.items) ? r.items : [],
    productIds: Array.isArray(r.product_ids) ? r.product_ids : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function toRow(c) {
  const items = Array.isArray(c.items) ? c.items : []
  const productIds = [...new Set(items.map(it => it.productId).filter(Boolean))]
  return {
    name: c.name || 'Tanpa Nama',
    platform: c.platform || 'tiktok',
    description: c.description || '',
    start_date: c.startDate || null,
    end_date: c.endDate || null,
    items,
    product_ids: productIds.length ? productIds : (Array.isArray(c.productIds) ? c.productIds : []),
  }
}

export async function listCampaigns() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return []
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('workspace_id', wsId)
    .order('start_date', { ascending: false, nullsFirst: false })
  if (error) throw error
  return (data || []).map(rowToCampaign)
}

// Tambah campaign baru, atau update bila id sudah ada.
export async function saveCampaign(campaign) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const base = toRow(campaign)

  if (campaign.id) {
    const { data, error } = await supabase
      .from('campaigns')
      .update({ ...base, updated_at: new Date().toISOString() })
      .eq('id', campaign.id)
      .select('*')
      .single()
    if (error) throw error
    return rowToCampaign(data)
  }
  const { data, error } = await supabase
    .from('campaigns')
    .insert({ workspace_id: wsId, ...base })
    .select('*')
    .single()
  if (error) throw error
  return rowToCampaign(data)
}

export async function deleteCampaign(id) {
  const { error } = await supabase.from('campaigns').delete().eq('id', id)
  if (error) throw error
}
