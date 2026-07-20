// Fase 1 multi-tenant: daftar workspace ELIGIBLE dari tiktok_connections
// (pengganti registry hardcode advertisers.mjs). ZERO-TOUCH: workspace apa pun
// yang punya koneksi lengkap (advertiser_id + store_id non-null) otomatis ikut
// sync — tanpa deploy. Bentuk keluaran IDENTIK dgn eligibleAdvertisers()
// ({advertiserId, storeId, workspaceId, label}) → drop-in di vpsCommit.
//
// Worker pakai service_role (bypass RLS). Membaca saja; tak menulis.
export async function loadEligibleConnections(supabase) {
  const { data, error } = await supabase
    .from('tiktok_connections')
    .select('workspace_id, advertiser_id, advertiser_name, store_id, store_name')
    .not('advertiser_id', 'is', null)
    .not('store_id', 'is', null)
  if (error) throw new Error(`baca tiktok_connections (eligible) gagal: ${error.message}`)
  return (data || []).map((r) => ({
    advertiserId: r.advertiser_id,
    storeId: r.store_id,
    workspaceId: r.workspace_id,
    label: r.store_name || r.advertiser_name || r.advertiser_id,
  }))
}

// Phase 2B: daftar GRUP tenant (1 logical tenant = 1 workspace/store, 1..N
// advertiser). Sumber: tiktok_connections (token/koneksi) + gmvmax_tenant_advertisers
// (keanggotaan advertiser, config eksplisit — BUKAN hardcode). Backward-compatible:
// workspace TANPA baris keanggotaan → single advertiser dari tiktok_connections
// (AsterixSty tak berubah; tabel keanggotaan belum di-apply → semua single).
// → [{ workspaceId, storeId, connectionGroupId, connectionRow, advertisers:[
//      { advertiserId, advertiserName, role, storeId, connectionId } ] }]
export async function loadTenantGroups(supabase) {
  const { data: conns, error: ce } = await supabase
    .from('tiktok_connections').select('*')
    .not('advertiser_id', 'is', null).not('store_id', 'is', null)
  if (ce) throw new Error(`baca tiktok_connections gagal: ${ce.message}`)

  // Keanggotaan multi-advertiser (opsional; tabel bisa belum ada → fallback).
  const membersByWs = new Map()
  try {
    const { data, error } = await supabase
      .from('gmvmax_tenant_advertisers')
      .select('workspace_id, connection_group_id, source_connection_id, store_id, advertiser_id, advertiser_role, is_active, priority, metadata')
      .eq('is_active', true)
      .order('priority', { ascending: true }) // PRIMARY (100) sebelum LEGACY (200)
    if (!error) for (const m of data || []) {
      if (!membersByWs.has(m.workspace_id)) membersByWs.set(m.workspace_id, [])
      membersByWs.get(m.workspace_id).push(m)
    }
  } catch { /* tabel belum di-apply → semua single-advertiser (backward-compat) */ }

  return (conns || []).map((conn) => {
    const ms = membersByWs.get(conn.workspace_id)
    const advertisers = (ms && ms.length)
      ? ms.map((m) => ({ advertiserId: m.advertiser_id, advertiserName: m.metadata?.advertiser_name ?? null, role: m.advertiser_role || 'PRIMARY', storeId: m.store_id || conn.store_id, connectionId: m.source_connection_id || conn.id }))
      : [{ advertiserId: conn.advertiser_id, advertiserName: conn.advertiser_name, role: 'PRIMARY', storeId: conn.store_id, connectionId: conn.id }]
    const connectionGroupId = (ms && ms[0]?.connection_group_id) || conn.workspace_id
    return {
      workspaceId: conn.workspace_id, storeId: conn.store_id,
      connectionGroupId, connectionRow: conn, advertisers,
    }
  })
}
