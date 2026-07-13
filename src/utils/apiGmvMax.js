// Mapper hasil TikTok Business API (gmv_max_report_get, creative-level) → skema
// `row` yang sama dengan parser xlsx (parseGmvMax.js). Tujuannya: mengganti
// upload .xlsx manual dengan tarikan API resmi, TANPA mengubah downstream
// (gmvmaxClassify / gmvmaxRollup / gmvmaxInsights / VideoTable) — output
// { meta, rows } dibuat identik bentuknya dengan parseGmvMaxRows().
//
// ─── RESEP QUERY (dikonfirmasi data nyata 2026-07-09, toko AsterixSty Perfume) ──
// Atribut (title, tt_account_name, tt_account_profile_image_url) HANYA keluar
// bila query dibatasi ke SATU campaign. Query lintas-banyak-campaign ditolak
// API ("Invalid metric(s)"). Jadi pola ingest = LOOP PER-CAMPAIGN:
//   endpoint : /v1.3/gmv_max/report/get/   (level: creative, dimensi: item_id)
//   filter   : campaign_ids = [<satu campaign>], item_group_ids = [<satu SPU>]
//   metrics  : ATTR + NUM di bawah ini
// Baris item_id = "-1" = delivery sistem (max-delivery/product-card) yang TIDAK
// diatribusikan ke video (atribut creator kosong; shop_content_type=PRODUCT_CARD).
// Di toko contoh ~52% biaya & ~57% omzet ada di sini → dipertahankan & dipetakan
// sebagai 'Product card' (videoId null): MASUK total campaign/produk tapi KELUAR
// dari ROAS per-video, persis spend non-video di model xlsx lama. Ditandai
// isSystem=true untuk pembeda opsional di UI.
//
// ─── FAKTA BENTUK DATA (diverifikasi dari JSON mentah 2026-07-09) ──────────────
//  1. Rate (product_click_rate/ad_conversion_rate/ad_video_view_rate_*) = PERSEN.
//     Bukti silang: clicks 3114 / impressions 41517 = 7.50% = product_click_rate
//     "7.50". Sama seperti parser xlsx → RATE_IS_RATIO tetap false.
//  2. shop_content_type = "VIDEO" | "PRODUCT_CARD".
//  3. Semua metric dikirim sebagai STRING ("353298", "3.33") — parseNum aman.
//  4. Atribut kosong dikirim sebagai "0" (bukan ""). Baris item_id="-1":
//     title/tt_account_name/tt_account_profile_image_url = "0" → dianggap kosong.
//  5. net_cost & roas_bid TIDAK valid di creative-level (metric campaign-level) —
//     minta hanya lewat API_CAMPAIGN_METRICS. campaign_name juga campaign-level →
//     disuplai via ctx dari daftar campaign, bukan dari metric report.
import { parseNum, deriveHook } from './parseGmvMax'

// Rate dikirim sudah dalam persen (lihat fakta #1). Set true hanya bila suatu saat
// API berubah mengirim rasio 0..1.
const RATE_IS_RATIO = false

// Metric CREATIVE-LEVEL (per-campaign) — hanya yang valid di level ini.
export const API_ATTR_METRICS = [
  'title', 'tt_account_name', 'tt_account_profile_image_url',
  'tt_account_authorization_type', 'creative_delivery_status', 'shop_content_type',
]
export const API_NUM_METRICS = [
  'cost', 'orders', 'cost_per_order', 'gross_revenue', 'roi',
  'product_impressions', 'product_clicks', 'product_click_rate', 'ad_conversion_rate',
  'ad_video_view_rate_2s', 'ad_video_view_rate_6s',
  'ad_video_view_rate_p25', 'ad_video_view_rate_p50',
  'ad_video_view_rate_p75', 'ad_video_view_rate_p100',
]
export const API_ALL_METRICS = [...API_ATTR_METRICS, ...API_NUM_METRICS]
export const API_DIMENSIONS = ['item_id']

// Metric CAMPAIGN-LEVEL saja (jangan diminta di creative-level → error 40002).
// Dipakai poller untuk melengkapi campaignName/targetRoi/netCost via ctx.
export const API_CAMPAIGN_METRICS = [
  'campaign_name', 'net_cost', 'roas_bid', 'target_roi_budget', 'max_delivery_budget',
]

const SYSTEM_ITEM_ID = '-1'

// ─── util ──────────────────────────────────────────────────────────────────────
function str(v) {
  if (v === null || v === undefined) return ''
  const s = v.toString().trim()
  return s === '-' || s === 'N/A' || s === '' ? '' : s
}
// Atribut teks (title/akun/avatar/status): API mengirim "0" untuk kosong (fakta #4).
function attrStr(v) { const s = str(v); return s === '0' ? '' : s }
function attrNull(v) { const s = attrStr(v); return s || null }
function rate(v) {
  const n = parseNum(v)
  if (n == null) return null
  return RATE_IS_RATIO ? n * 100 : n
}
// Enum shop_content_type → 'Video' | 'Product card'. Defensif; default 'Video'
// karena mayoritas creative ber-atribut = video. (Verifikasi enum → poin #2.)
function normCreativeType(v) {
  const s = str(v).toLowerCase()
  if (s.includes('product') || s.includes('card') || s.includes('kartu')) return 'Product card'
  return 'Video'
}

// Ratakan bentuk report API ({ dimensions:{...}, metrics:{...} }) atau objek
// yang sudah datar → satu objek datar.
function flatten(apiRow) {
  if (apiRow && (apiRow.dimensions || apiRow.metrics)) {
    return { ...(apiRow.dimensions || {}), ...(apiRow.metrics || {}) }
  }
  return apiRow || {}
}

// ─── Core: satu baris API → satu `row` modul ─────────────────────────────────
// ctx: { currency, campaignId, campaignName, productId } — pengisi bila atribut
// tak ada di baris (mis. campaign_id/item_group_id datang dari filter, bukan row).
export function apiRowToGmvMaxRow(apiRow, ctx = {}) {
  const r = flatten(apiRow)
  const itemId = str(r.item_id) || null
  const isSystem = itemId === SYSTEM_ITEM_ID

  const videoTitle = isSystem ? '' : attrStr(r.title)
  // -1 → 'Product card' (bukan tipe baru) agar downstream lama menanganinya benar.
  const creativeType = isSystem ? 'Product card' : normCreativeType(r.shop_content_type)

  const row = {
    videoId: isSystem ? null : itemId,
    campaignName: attrStr(r.campaign_name) || str(ctx.campaignName),
    campaignId: str(r.campaign_id) || str(ctx.campaignId) || null,
    productId: str(r.item_group_id) || str(ctx.productId) || null,
    creativeType,
    videoTitle,
    tiktokAccount: isSystem ? null : attrNull(r.tt_account_name),
    timePosted: null, // report tak memuat waktu posting (resolve terpisah bila perlu)
    status: attrStr(r.creative_delivery_status),
    authType: attrStr(r.tt_account_authorization_type),
    currency: str(ctx.currency) || 'IDR',

    // Angka inti (1:1 dengan kolom xlsx).
    cost: parseNum(r.cost),
    skuOrders: parseNum(r.orders),
    costPerOrder: parseNum(r.cost_per_order),
    grossRevenue: parseNum(r.gross_revenue),
    roas: parseNum(r.roi),
    impressions: parseNum(r.product_impressions),
    clicks: parseNum(r.product_clicks),
    ctr: rate(r.product_click_rate),
    cvr: rate(r.ad_conversion_rate),
    vr2s: rate(r.ad_video_view_rate_2s),
    vr6s: rate(r.ad_video_view_rate_6s),
    vr25: rate(r.ad_video_view_rate_p25),
    vr50: rate(r.ad_video_view_rate_p50),
    vr75: rate(r.ad_video_view_rate_p75),
    vr100: rate(r.ad_video_view_rate_p100),

    // Bonus dari API (belum ada di jalur xlsx) — additive, aman bagi downstream.
    profileImageUrl: isSystem ? null : attrNull(r.tt_account_profile_image_url),
    // net_cost/roas_bid hanya campaign-level → diisi via ctx oleh poller (null di sini).
    netCost: parseNum(r.net_cost) ?? ctx.netCost ?? null,
    targetRoi: parseNum(r.roas_bid) ?? ctx.targetRoi ?? null,
    isSystem,
  }
  row.hookTag = creativeType === 'Video' ? deriveHook(videoTitle) : null
  row.hasSpend = (row.cost ?? 0) > 0
  return row
}

// ─── Batch: kumpulan baris API → { meta, rows } (mirror parseGmvMaxRows) ─────
// apiRows: array baris report. meta: { startDate, endDate, snapshotDate,
// periodMonth, name, currency, campaignId, campaignName }.
export function parseGmvMaxApiRows(apiRows, meta = {}) {
  const rows = []
  let videoCount = 0, productCardCount = 0
  let totalCost = 0, totalRevenue = 0, totalOrders = 0

  for (const apiRow of apiRows || []) {
    const row = apiRowToGmvMaxRow(apiRow, meta)

    // Buang ekor panjang tanpa aktivitas (sama seperti parser xlsx). Baris
    // system biasanya ber-spend besar → lolos filter ini.
    const active = (row.cost ?? 0) > 0 || (row.impressions ?? 0) > 0
      || (row.grossRevenue ?? 0) > 0 || (row.skuOrders ?? 0) > 0
    if (!active) continue

    if (row.creativeType === 'Product card') productCardCount++
    else if (row.creativeType === 'Video') videoCount++

    totalCost += row.cost ?? 0
    totalRevenue += row.grossRevenue ?? 0
    totalOrders += row.skuOrders ?? 0
    rows.push(row)
  }

  const currency = meta.currency || rows.find(r => r.currency)?.currency || 'IDR'
  return {
    meta: {
      startDate: meta.startDate ?? null,
      endDate: meta.endDate ?? null,
      snapshotDate: meta.snapshotDate ?? meta.endDate ?? null,
      periodMonth: meta.periodMonth ?? null,
      name: meta.name ?? null,
      currency,
      source: 'api',
      campaignId: meta.campaignId ?? null,
      campaignName: meta.campaignName ?? null,
      rowCount: rows.length,
      videoCount,
      productCardCount,
      totals: {
        cost: totalCost,
        revenue: totalRevenue,
        orders: totalOrders,
        roas: totalCost > 0 ? totalRevenue / totalCost : null,
      },
    },
    rows,
  }
}
