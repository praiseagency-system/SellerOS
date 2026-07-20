// Feature Registry GMV Max (gmvmax_feature_registry) — READ-ONLY dari webapp.
// Diisi worker/skrip read-only (menormalkan respons MCP read-only). Halaman hanya
// membaca: status kapabilitas fitur per workspace/store/campaign/identity.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

const PAGE = 1000

// Semua baris registry workspace aktif (paginasi PostgREST cap ~1000).
export async function loadFeatureRegistry({ wsId = getCurrentWorkspaceId() } = {}) {
  if (!wsId) return []
  const all = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('gmvmax_feature_registry')
      .select('*')
      .eq('workspace_id', wsId)
      .order('feature_scope', { ascending: true })
      .order('feature_code', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return all
}

// Status tenant (baris GMV_MAX_ELIGIBILITY) → { status, reason } untuk banner.
export function tenantStatusFrom(rows = []) {
  const r = rows.find(x => x.feature_code === 'GMV_MAX_ELIGIBILITY')
  if (!r) return { status: 'UNKNOWN', reason: null }
  return { status: r.metadata?.tenant_status || r.availability_status, reason: r.metadata?.reason || null }
}

// Riwayat perubahan fitur (terbaru dulu).
export async function loadFeatureRegistryHistory({ wsId = getCurrentWorkspaceId(), limit = 100 } = {}) {
  if (!wsId) return []
  const { data, error } = await supabase
    .from('gmvmax_feature_registry_history')
    .select('*')
    .eq('workspace_id', wsId)
    .order('detected_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}
