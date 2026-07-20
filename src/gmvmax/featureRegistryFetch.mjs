// GMV Max Feature Registry — FETCH orchestrator (READ-ONLY seam).
//
// ⚠️ Phase 1: HANYA memanggil endpoint MCP READ-ONLY. TIDAK memanggil satupun
// endpoint tulis/mutasi (lihat FORBIDDEN_MUTATION_TOOLS di featureRegistry.mjs).
// Modul ini SENGAJA TIDAK diimpor oleh worker.mjs / vpsCommit.mjs — worker tetap
// shadow-only. Dipakai oleh skrip verifikasi/registry manual bila diminta.
//
// Pemisahan: provider (fetch) → normalizer (pure, featureRegistry.mjs) → writer.
// Modul ini hanya mengumpulkan bundel input; pemetaan dilakukan buildRegistry().
import { buildRegistry } from './featureRegistry.mjs'

// Ambil daftar advertiser yang di-authorize token (untuk gate otorisasi eksklusif).
export async function fetchAuthorizedAdvertiserIds(provider) {
  try {
    const r = await provider.callTool('auth_advertiser_get', {})
    return (r?.data?.list || r?.list || []).map(a => String(a.advertiser_id))
  } catch { return [] }
}

// Bundel input read-only untuk SATU koneksi (workspace). Semua panggilan read-only.
// connection: { advertiserId, storeId, storeAuthorizedBcId? }
export async function fetchRegistryInputs(provider, connection, { authorizedAdvertiserIds, maxCampaigns = 5 } = {}) {
  const advertiser_id = connection.advertiserId
  const store_id = connection.storeId
  const inputs = { connection, authorizedAdvertiserIds: authorizedAdvertiserIds || [] }

  // 1) Gerbang kapabilitas.
  let storeList = null, bcId = connection.storeAuthorizedBcId || null
  try {
    const sl = await provider.callTool('gmv_max_store_list_get', { advertiser_id })
    storeList = sl?.data?.store_list || sl?.store_list || []
    const store = storeList.find(s => String(s.store_id) === String(store_id))
    bcId = bcId || store?.store_authorized_bc_id || null
  } catch (e) { inputs.storeListError = e?.message || String(e) }
  inputs.storeList = storeList

  // Bila tak eligible → cukup bundel tenant (buildRegistry akan meng-gate).
  const elig = storeList && storeList.find(s => String(s.store_id) === String(store_id))
  if (inputs.storeListError || !elig || elig.is_gmv_max_available !== true) {
    return buildRegistry(inputs)
  }

  // 2) Inventaris campaign per tipe.
  const listType = async (type) => {
    try {
      const r = await provider.callTool('gmv_max_campaign_get', {
        advertiser_id, filtering: { gmv_max_promotion_types: [type], store_ids: [store_id] }, page_size: 100,
      })
      return r?.data?.list || r?.list || []
    } catch { return [] }
  }
  const productList = await listType('PRODUCT_GMV_MAX')
  const liveList = await listType('LIVE_GMV_MAX')
  inputs.campaignTypeCounts = { product: productList.length, live: liveList.length }

  // 3) Sampel campaign AKTIF (batasi maxCampaigns) → info + session_list.
  const active = productList.filter(c => c.operation_status === 'ENABLE').slice(0, maxCampaigns)
  let bidRecommend = null
  try {
    const br = await provider.callTool('gmv_max_bid_recommend_get', { advertiser_id, store_id, shopping_ads_type: 'PRODUCT', optimization_goal: 'VALUE' })
    bidRecommend = br?.data || br || null
  } catch { /* biarkan null */ }

  const campaigns = []
  for (const listRow of active) {
    let info = null, sessions
    try {
      const i = await provider.callTool('campaign_gmv_max_info_get', { advertiser_id, campaign_id: listRow.campaign_id })
      info = i?.data || i || null
    } catch { /* info null */ }
    try {
      const s = await provider.callTool('campaign_gmv_max_session_list_get', { advertiser_id, campaign_id: listRow.campaign_id })
      sessions = s?.data?.session_list || s?.session_list || []
    } catch { sessions = undefined }
    campaigns.push({ listRow, info: info || {}, sessions, bidRecommend })
  }
  inputs.campaigns = campaigns

  // 4) Identity + otorisasi + sampel produk.
  if (bcId) {
    try {
      const id = await provider.callTool('gmv_max_identity_get', { advertiser_id, store_id, store_authorized_bc_id: bcId })
      inputs.identities = id?.data?.identity_list || id?.identity_list || []
    } catch { /* skip */ }
    try {
      const auth = await provider.callTool('gmv_max_exclusive_authorization_get', { advertiser_id, store_id, store_authorized_bc_id: bcId })
      inputs.authorization = auth?.data || auth || null
    } catch { /* skip */ }
    try {
      const sp = await provider.callTool('store_product_get', { advertiser_id, bc_id: bcId, store_id, filtering: { ad_creation_eligible: 'GMV_MAX' }, page_size: 100 })
      const items = sp?.data?.store_products || sp?.store_products || []
      const total = sp?.data?.page_info?.total_number ?? items.length
      const occupied = items.filter(p => p.gmv_max_ads_status === 'OCCUPIED').length
      const unoccupied = items.filter(p => p.gmv_max_ads_status === 'UNOCCUPIED').length
      inputs.productSample = { total, occupied, unoccupied }
    } catch { /* skip */ }
  }

  return buildRegistry(inputs)
}
