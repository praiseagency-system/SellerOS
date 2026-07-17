// Setting campaign GMV Max (gmvmax_campaign_settings) — snapshot harian per
// campaign: budget, roas_bid, auto_budget, status. Diisi worker VPS tiap hari.
// Read-only dari webapp (worker yang menulis).
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

const PAGE = 1000

// Riwayat setting `days` hari terakhir, urut tanggal NAIK (siap di-diff).
// Paginasi: PostgREST cap ~1000 baris — banyak campaign × banyak hari bisa lewat.
export async function loadCampaignSettingsHistory({ days = 30, wsId = getCurrentWorkspaceId() } = {}) {
  if (!wsId) return []
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const all = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('gmvmax_campaign_settings')
      .select('*')
      .eq('workspace_id', wsId)
      .gte('snapshot_date', since)
      .order('snapshot_date', { ascending: true })
      .order('campaign_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return all
}

// Setting TERBARU per campaign (baris tanggal paling akhir tiap campaign_id).
export function latestPerCampaign(rows = []) {
  const seen = new Map() // rows urut tanggal naik → yang terakhir menang
  for (const r of rows) seen.set(r.campaign_id, r)
  return [...seen.values()]
}
