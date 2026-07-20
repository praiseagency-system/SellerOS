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
