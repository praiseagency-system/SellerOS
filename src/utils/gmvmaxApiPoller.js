// Poller GMV Max via TikTok Business API — mengorkestrasi tarikan resmi untuk
// menggantikan upload .xlsx manual. Menghasilkan { meta, rows, campaigns } dengan
// bentuk rows identik parser xlsx (lihat apiGmvMax.js), jadi langsung dipakai
// classify/rollup/insights tanpa perubahan downstream.
//
// ─── Kontrak API (diverifikasi 2026-07-09) ────────────────────────────────────
//  • Report creative-level WAJIB filter campaign_ids(1) + item_group_ids(1).
//  • Report item-level (dimensi item_group_id) WAJIB campaign_ids(>=1).
//  • campaign_name / net_cost / roas_bid BUKAN metric report → dari campaign_get.
//  • 1 Product GMV Max campaign umumnya = 1 SPU (item_group_id).
//  Maka alurnya: stores → campaigns → SPU per-campaign → creative rows (paginasi).
//
// ─── Transport-agnostic ────────────────────────────────────────────────────────
// `call(toolName, params)` di-inject caller dan HARUS mengembalikan respons mentah
// TikTok ({ code, message, data }). Dua implementasi:
//   • MCP (interaktif/sekarang): bungkus mcp tool_execute.
//   • Produksi (Vercel): fetch ke Marketing API + header Access-Token (butuh
//     long-term token dari approval developer app — jalur produksi yang di-hold).
import { parseGmvMaxApiRows, API_ALL_METRICS, API_DIMENSIONS } from './apiGmvMax'

const PAGE_SIZE = 1000       // report page_size maksimum
const CAMPAIGN_PAGE_SIZE = 100

function unwrap(res, ctx) {
  if (!res) throw new Error(`${ctx}: respons kosong`)
  if (res.code !== 0 && res.code !== undefined) {
    throw new Error(`${ctx}: [${res.code}] ${res.message || 'error TikTok'}`)
  }
  return res.data || {}
}

// ─── Discovery ────────────────────────────────────────────────────────────────

// Toko yang layak GMV Max. → [{ storeId, storeName }]
export async function fetchGmvMaxStores(call, advertiserId) {
  const data = unwrap(await call('gmv_max_store_list_get', { advertiser_id: advertiserId }), 'store_list')
  return (data.store_list || [])
    .filter(s => s.is_gmv_max_available)
    .map(s => ({ storeId: s.store_id, storeName: s.store_name }))
}

// Semua Product GMV Max campaign (paginasi). activeOnly → hanya operation_status ENABLE.
// → [{ campaignId, campaignName, active }]
export async function fetchGmvMaxCampaigns(call, advertiserId, storeId, { activeOnly = false } = {}) {
  const out = []
  let page = 1, totalPage
  do {
    const data = unwrap(await call('gmv_max_campaign_get', {
      advertiser_id: advertiserId,
      filtering: { gmv_max_promotion_types: ['PRODUCT_GMV_MAX'], store_ids: [storeId] },
      page, page_size: CAMPAIGN_PAGE_SIZE,
    }), 'campaign_get')
    for (const c of data.list || []) {
      out.push({ campaignId: c.campaign_id, campaignName: (c.campaign_name || '').trim(), active: c.operation_status === 'ENABLE' })
    }
    totalPage = data.page_info?.total_page || 1
    page++
  } while (page <= totalPage)
  return activeOnly ? out.filter(c => c.active) : out
}

// SPU (item_group_id) yang punya aktivitas untuk satu campaign di rentang tsb.
// → ['1731519207014237361', ...] (umumnya 1)
export async function fetchCampaignSpus(call, advertiserId, storeId, campaignId, { startDate, endDate }) {
  const data = unwrap(await call('gmv_max_report_get', {
    advertiser_id: advertiserId, store_ids: [storeId],
    start_date: startDate, end_date: endDate,
    dimensions: ['item_group_id'],
    filtering: { campaign_ids: [campaignId] },
    metrics: ['cost', 'gross_revenue', 'orders', 'roi'],
    page: 1, page_size: 100,
  }), 'spu_enum')
  return (data.list || []).map(r => r.dimensions?.item_group_id).filter(Boolean)
}

// Baris creative mentah (paginasi penuh) untuk satu (campaign, SPU).
export async function fetchCreativeRows(call, advertiserId, storeId, campaignId, itemGroupId, { startDate, endDate }) {
  const rows = []
  let page = 1, totalPage
  do {
    const data = unwrap(await call('gmv_max_report_get', {
      advertiser_id: advertiserId, store_ids: [storeId],
      start_date: startDate, end_date: endDate,
      dimensions: API_DIMENSIONS,
      filtering: { campaign_ids: [campaignId], item_group_ids: [itemGroupId] },
      metrics: API_ALL_METRICS,
      sort_field: 'cost', sort_type: 'DESC',
      page, page_size: PAGE_SIZE,
    }), 'creative_report')
    rows.push(...(data.list || []))
    totalPage = data.page_info?.total_page || 1
    page++
  } while (page <= totalPage)
  return rows
}

// ─── Orkestrasi penuh ─────────────────────────────────────────────────────────
// opts: { advertiserId, storeId?, dateRange:{startDate,endDate}, activeOnly?,
//         currency?, onProgress? }. storeId opsional → pakai toko GMV Max pertama.
// Return: { meta, rows, campaigns } (rows lintas semua campaign untuk periode itu).
export async function pollGmvMax(call, opts) {
  const { advertiserId, dateRange, activeOnly = true, currency = 'IDR', onProgress } = opts
  let storeId = opts.storeId
  if (!storeId) {
    const stores = await fetchGmvMaxStores(call, advertiserId)
    if (!stores.length) throw new Error('Tidak ada toko yang layak GMV Max untuk advertiser ini.')
    storeId = stores[0].storeId
  }

  const campaigns = await fetchGmvMaxCampaigns(call, advertiserId, storeId, { activeOnly })
  const allRows = []
  const perCampaign = []

  for (const c of campaigns) {
    const spus = await fetchCampaignSpus(call, advertiserId, storeId, c.campaignId, dateRange)
    let campaignRowCount = 0
    for (const spu of spus) {
      const raw = await fetchCreativeRows(call, advertiserId, storeId, c.campaignId, spu, dateRange)
      const { rows } = parseGmvMaxApiRows(raw, {
        currency, campaignId: c.campaignId, campaignName: c.campaignName, productId: spu,
        ...dateRange, snapshotDate: dateRange.endDate,
      })
      allRows.push(...rows)
      campaignRowCount += rows.length
    }
    perCampaign.push({ ...c, spus, rowCount: campaignRowCount })
    onProgress?.({ campaign: c, rowsSoFar: allRows.length })
  }

  return { meta: buildMeta(allRows, { currency, storeId, dateRange, campaignCount: campaigns.length }), rows: allRows, campaigns: perCampaign }
}

// Meta gabungan lintas-campaign (mirror bentuk meta parser xlsx + tambahan API).
function buildMeta(rows, { currency, storeId, dateRange, campaignCount }) {
  let cost = 0, revenue = 0, orders = 0, videoCount = 0, productCardCount = 0
  for (const r of rows) {
    cost += r.cost ?? 0; revenue += r.grossRevenue ?? 0; orders += r.skuOrders ?? 0
    if (r.creativeType === 'Product card') productCardCount++
    else if (r.creativeType === 'Video') videoCount++
  }
  return {
    startDate: dateRange.startDate, endDate: dateRange.endDate, snapshotDate: dateRange.endDate,
    currency, source: 'api', storeId, campaignCount,
    rowCount: rows.length, videoCount, productCardCount,
    totals: { cost, revenue, orders, roas: cost > 0 ? revenue / cost : null },
  }
}

// ─── Adapter transport MCP ────────────────────────────────────────────────────
// Contoh membungkus MCP tool_execute (di lingkungan yang punya klien MCP):
//   const call = makeMcpCall(mcpClient)
//   const data = await pollGmvMax(call, { advertiserId, dateRange:{startDate,endDate} })
// mcpExecute(toolName, params) harus mengembalikan respons mentah TikTok.
export function makeMcpCall(mcpExecute) {
  return (toolName, params) => mcpExecute(toolName, params)
}
