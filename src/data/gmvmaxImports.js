// Lapisan data GMV Max — Supabase (gmvmax_imports & gmvmax_creatives).
// Tiap upload = 1 row import + N row creatives (CASCADE). Identitas periode =
// (workspace + name); re-upload periode sama → ganti snapshot. RLS per pemilik.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

const CHUNK = 500 // batasi ukuran payload insert per batch

// Semua import di workspace aktif, terbaru dulu (tanpa creatives).
export async function listImports() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return []
  const { data, error } = await supabase
    .from('gmvmax_imports')
    .select('*')
    .eq('workspace_id', wsId)
    .order('period_month', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Ambil baris creatives untuk sekumpulan import (atau semua import workspace).
// Setiap baris ditandai period/periodName dari import-nya (dipakai rollup).
export async function loadCreatives(importIds = null) {
  const imports = await listImports()
  const targets = importIds ? imports.filter(i => importIds.includes(i.id)) : imports
  if (targets.length === 0) return []
  const byId = Object.fromEntries(targets.map(i => [i.id, i]))

  const all = []
  for (let i = 0; i < targets.length; i += 25) {
    const ids = targets.slice(i, i + 25).map(t => t.id)
    const { data, error } = await supabase
      .from('gmvmax_creatives')
      .select('*')
      .in('import_id', ids)
    if (error) throw error
    for (const r of data || []) {
      const imp = byId[r.import_id]
      all.push(rowToCreative(r, imp))
    }
  }
  return all
}

// Simpan hasil parser. parsed = { meta, rows } dari parseGmvMaxFile.
export async function saveImport(parsed, settings = null) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { meta, rows } = parsed
  const name = meta.name || meta.filename || 'Import'

  // Ganti snapshot periode sama (creatives ikut via CASCADE).
  await supabase.from('gmvmax_imports').delete()
    .eq('workspace_id', wsId).eq('name', name)

  const { data: imp, error } = await supabase
    .from('gmvmax_imports')
    .insert({
      workspace_id: wsId,
      name,
      period_month: meta.periodMonth,
      start_date: meta.startDate,
      end_date: meta.endDate,
      currency: meta.currency || 'IDR',
      source_filename: meta.filename,
      totals: meta.totals,
      settings,
    })
    .select('*')
    .single()
  if (error) throw error

  const payload = rows.map(r => creativeToRow(imp.id, r))
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error: ce } = await supabase
      .from('gmvmax_creatives')
      .insert(payload.slice(i, i + CHUNK))
    if (ce) throw ce
  }
  return imp.id
}

export async function deleteImport(id) {
  const { error } = await supabase.from('gmvmax_imports').delete().eq('id', id)
  if (error) throw error
}

// ─── map row ⇆ objek creative (bentuk parser) ────────────────────────────────
function creativeToRow(importId, r) {
  return {
    import_id: importId,
    video_id: r.videoId,
    campaign_name: r.campaignName,
    campaign_id: r.campaignId,
    product_id: r.productId,
    creative_type: r.creativeType,
    video_title: r.videoTitle,
    tiktok_account: r.tiktokAccount,
    time_posted: r.timePosted,
    status: r.status,
    auth_type: r.authType,
    cost: r.cost, sku_orders: r.skuOrders, cost_per_order: r.costPerOrder,
    gross_revenue: r.grossRevenue, roas: r.roas,
    impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, cvr: r.cvr,
    vr_2s: r.vr2s, vr_6s: r.vr6s, vr_25: r.vr25, vr_50: r.vr50, vr_75: r.vr75, vr_100: r.vr100,
    hook_tag: r.hookTag,
    raw_data: r.raw ?? null,
  }
}

function rowToCreative(row, imp) {
  return {
    videoId: row.video_id,
    campaignName: row.campaign_name,
    campaignId: row.campaign_id,
    productId: row.product_id,
    creativeType: row.creative_type,
    videoTitle: row.video_title,
    tiktokAccount: row.tiktok_account,
    timePosted: row.time_posted,
    status: row.status,
    authType: row.auth_type,
    cost: num(row.cost), skuOrders: num(row.sku_orders), costPerOrder: num(row.cost_per_order),
    grossRevenue: num(row.gross_revenue), roas: num(row.roas),
    impressions: num(row.impressions), clicks: num(row.clicks), ctr: num(row.ctr), cvr: num(row.cvr),
    vr2s: num(row.vr_2s), vr6s: num(row.vr_6s), vr25: num(row.vr_25),
    vr50: num(row.vr_50), vr75: num(row.vr_75), vr100: num(row.vr_100),
    hookTag: row.hook_tag,
    hasSpend: num(row.cost) > 0,
    period: imp?.period_month || 'all',
    periodName: imp?.name || 'all',
  }
}

const num = (v) => (v == null ? null : Number(v))
