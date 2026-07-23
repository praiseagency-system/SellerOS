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
    link: r.link || '',
    parentCampaign: r.parent_campaign || '',
    startDate: r.start_date || '',
    endDate: r.end_date || '',
    items: Array.isArray(r.items) ? r.items : [],
    productIds: Array.isArray(r.product_ids) ? r.product_ids : [],
    voucherConfig: (r.voucher_config && typeof r.voucher_config === 'object') ? r.voucher_config : {},
    approvals: (r.approvals && typeof r.approvals === 'object') ? r.approvals : {},
    shareToken: r.share_token || '',
    approvalAccess: r.approval_access || 'private',
    approvalEmails: Array.isArray(r.approval_emails) ? r.approval_emails : [],
    approvalLog: Array.isArray(r.approval_log) ? r.approval_log : [],
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
    link: (c.link || '').trim() || null,
    parent_campaign: (c.parentCampaign || '').trim() || null,
    start_date: c.startDate || null,
    end_date: c.endDate || null,
    items,
    product_ids: productIds.length ? productIds : (Array.isArray(c.productIds) ? c.productIds : []),
    voucher_config: (c.voucherConfig && typeof c.voucherConfig === 'object') ? c.voucherConfig : {},
    approvals: (c.approvals && typeof c.approvals === 'object') ? c.approvals : {},
    approval_access: c.approvalAccess === 'public' ? 'public' : 'private',
    approval_emails: Array.isArray(c.approvalEmails)
      ? [...new Set(c.approvalEmails.map(e => (e || '').trim().toLowerCase()).filter(Boolean))]
      : [],
  }
}

// Pastikan campaign punya share_token (dibuat sekali). Owner-only via RLS.
// Mengembalikan token. Dipakai tombol "Bagikan link approval".
export async function ensureShareToken(campaignId) {
  const { data, error } = await supabase
    .from('campaigns').select('share_token').eq('id', campaignId).single()
  if (error) throw error
  if (data?.share_token) return data.share_token
  const token = crypto.randomUUID()
  const { data: upd, error: e2 } = await supabase
    .from('campaigns').update({ share_token: token }).eq('id', campaignId).select('share_token').single()
  if (e2) throw e2
  return upd.share_token
}

// Simpan pengaturan approval (mode + email undangan) secara mandiri — dipakai
// modal Bagikan di luar editor. Owner-only via RLS. Partial update.
export async function updateApprovalSettings(campaignId, { access, emails }) {
  const payload = {
    approval_access: access === 'public' ? 'public' : 'private',
    approval_emails: [...new Set((emails || []).map(e => (e || '').trim().toLowerCase()).filter(Boolean))],
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('campaigns').update(payload).eq('id', campaignId)
  if (error) throw error
}

// Buat token baru (mencabut link lama). Owner-only.
export async function regenerateShareToken(campaignId) {
  const token = crypto.randomUUID()
  const { data, error } = await supabase
    .from('campaigns').update({ share_token: token }).eq('id', campaignId).select('share_token').single()
  if (error) throw error
  return data.share_token
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
