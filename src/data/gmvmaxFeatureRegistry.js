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

// Status tenant yang berarti GMV Max TIDAK bisa dipakai workspace ini. Satu
// sumber kebenaran — dipakai halaman registry maupun peringatan di Integrasi.
export const BLOCKED_TENANT_STATUS = ['NOT_AVAILABLE', 'AUTHORIZATION_MISMATCH', 'PERMISSION_DENIED', 'STORE_NOT_FOUND']

// Status tenant (baris GMV_MAX_ELIGIBILITY) → { status, reason } untuk banner.
export function tenantStatusFrom(rows = []) {
  const r = rows.find(x => x.feature_code === 'GMV_MAX_ELIGIBILITY')
  if (!r) return { status: 'UNKNOWN', reason: null }
  return { status: r.metadata?.tenant_status || r.availability_status, reason: r.metadata?.reason || null }
}

// Bentuk kaya utk peringatan: + advertiser tempat status ini terdeteksi dan KAPAN
// terakhir diperiksa. Waktu itu wajib ditampilkan: registry di-refresh di langkah
// akhir run harian, jadi kalau tarikan datanya gagal (mis. akun ditolak 40001)
// baris ini TIDAK ikut diperbarui dan bisa basi berminggu-minggu.
export function tenantEligibilityFrom(rows = []) {
  const r = rows.find(x => x.feature_code === 'GMV_MAX_ELIGIBILITY')
  if (!r) return null
  const status = r.metadata?.tenant_status || r.availability_status
  return {
    status,
    blocked: BLOCKED_TENANT_STATUS.includes(status),
    reason: r.metadata?.reason || null,
    advertiserId: r.advertiser_id || null,
    checkedAt: r.last_detected_at || r.updated_at || null,
  }
}

// Ambil HANYA baris eligibility (1 baris) — jauh lebih murah daripada menarik
// seluruh registry hanya untuk satu spanduk.
export async function loadTenantEligibility({ wsId = getCurrentWorkspaceId() } = {}) {
  if (!wsId) return null
  const { data, error } = await supabase
    .from('gmvmax_feature_registry')
    .select('*')
    .eq('workspace_id', wsId)
    .eq('feature_code', 'GMV_MAX_ELIGIBILITY')
    .limit(1)
  if (error) throw error
  return tenantEligibilityFrom(data || [])
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
