// GMVMaxSyncEngine — orkestrasi DETERMINISTIK (pengganti runbook LLM).
// Reuse business rule kanonik: normalizer (apiGmvMax), reconciler (reconcile.mjs),
// identity (identity.mjs). Fail-explicit (Reliability Rule): paginasi tak lengkap /
// duplikat / invariant rusak / totals hilang → throw; TIDAK menghasilkan snapshot.
import { parseGmvMaxApiRows, API_ALL_METRICS, API_DIMENSIONS } from '../utils/apiGmvMax.js'
import { reconcile } from './reconcile.mjs'
import { findDuplicateIdentities } from './identity.mjs'

const PAGE_SIZE = 1000
const CAMPAIGN_PAGE_SIZE = 100
export const DEFAULT_MAX_PAGES = 200

// Cap paginasi eksplisit (Part 4). Default DEFAULT_MAX_PAGES (aman di atas data
// produksi terpantau: ~73 halaman/creative-report). Override via env integer positif.
// Env tak valid → throw INVALID_MAX_PAGES (fail-fast, tak diam-diam pakai default).
export function resolveMaxPages(env = process.env) {
  const raw = env.GMVMAX_MAX_PAGES_PER_REQUEST
  if (raw == null || raw === '') return DEFAULT_MAX_PAGES
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) {
    const e = new Error(`INVALID_MAX_PAGES: GMVMAX_MAX_PAGES_PER_REQUEST harus integer positif (dapat "${raw}")`); e.code = 'INVALID_MAX_PAGES'; throw e
  }
  return n
}

// Tarik SEMUA halaman satu report; gagal EKSPLISIT bila (a) total_page > cap
// (MAX_PAGES_EXCEEDED → jangan truncate diam-diam) atau (b) halaman tertarik <
// total_page (INCOMPLETE_PAGINATION). Di bawah cap: paginasi penuh seperti biasa.
export async function fetchAllPages(provider, params, ctx, { maxPages } = {}) {
  const cap = maxPages ?? resolveMaxPages()
  const out = []
  let page = 1, totalPage = 1, pagesFetched = 0
  do {
    if (pagesFetched >= cap) {
      const e = new Error(`MAX_PAGES_EXCEEDED: ${ctx} — total_page=${totalPage} > cap ${cap} (data mungkin terpotong; ditolak eksplisit)`); e.code = 'MAX_PAGES_EXCEEDED'; throw e
    }
    const data = await provider.callTool('gmv_max_report_get', { ...params, page, page_size: params.page_size ?? PAGE_SIZE })
    out.push(...(data.list || []))
    totalPage = data.page_info?.total_page ?? 1
    pagesFetched++
    page++
  } while (page <= totalPage)
  if (pagesFetched < totalPage) {
    const e = new Error(`INCOMPLETE_PAGINATION: ${ctx} — ${pagesFetched}/${totalPage} halaman`); e.code = 'INCOMPLETE_PAGINATION'; throw e
  }
  return { list: out, totalPage, pagesFetched }
}

export async function runSync(provider, { advertiserId, storeId, date, currency = 'IDR' }) {
  const t0 = Date.now()
  provider.assertAuth?.()
  const dr = { advertiser_id: advertiserId, store_ids: [storeId], start_date: date, end_date: date }
  let pageCount = 0, rawRowCount = 0

  // 1) Discovery campaign yang BELANJA (cost>0) — via report, BUKAN status.
  const disc = await fetchAllPages(provider, { ...dr, dimensions: ['campaign_id'], metrics: ['cost', 'gross_revenue', 'orders'], page_size: CAMPAIGN_PAGE_SIZE }, 'discovery')
  pageCount += disc.pagesFetched
  const campaignTotals = {}
  for (const r of disc.list) {
    const cid = r.dimensions?.campaign_id
    const cost = Number(r.metrics?.cost) || 0
    if (cid && cost > 0) campaignTotals[cid] = { cost, gross_revenue: Number(r.metrics?.gross_revenue) || 0, orders: Number(r.metrics?.orders) || 0 }
  }
  const campaignIds = Object.keys(campaignTotals)
  if (campaignIds.length === 0) {
    return finalize({ rows: [], totals: { cost: 0, revenue: 0, orders: 0, roas: null }, report: { mode: 'empty' } }, { advertiserId, date, campaignCount: 0, pageCount, rawRowCount, normalizedRows: [], t0 })
  }

  // 2) Nama campaign (PRODUCT + LIVE, keduanya).
  const nameByCampaign = {}
  for (const type of ['PRODUCT_GMV_MAX', 'LIVE_GMV_MAX']) {
    let page = 1, totalPage = 1
    do {
      const data = await provider.callTool('gmv_max_campaign_get', { advertiser_id: advertiserId, filtering: { gmv_max_promotion_types: [type], store_ids: [storeId] }, page, page_size: CAMPAIGN_PAGE_SIZE })
      for (const c of data.list || []) nameByCampaign[c.campaign_id] = { name: (c.campaign_name || '').trim(), type }
      totalPage = data.page_info?.total_page ?? 1
      pageCount++; page++
    } while (page <= totalPage)
  }

  // 3+4) Per campaign: enumerasi SPU (cost>0) → tarik creative per (campaign,SPU) paginasi penuh.
  const pairs = []
  for (const cid of campaignIds) {
    const spuRes = await fetchAllPages(provider, { ...dr, dimensions: ['item_group_id'], filtering: { campaign_ids: [cid] }, metrics: ['cost'], page_size: CAMPAIGN_PAGE_SIZE }, `spu:${cid}`)
    pageCount += spuRes.pagesFetched
    const spus = spuRes.list.filter(r => (Number(r.metrics?.cost) || 0) > 0).map(r => r.dimensions?.item_group_id).filter(Boolean)
    const campaignName = nameByCampaign[cid]?.name || cid
    for (const spu of spus) {
      const cr = await fetchAllPages(provider, { ...dr, dimensions: API_DIMENSIONS, filtering: { campaign_ids: [cid], item_group_ids: [spu] }, metrics: API_ALL_METRICS, sort_field: 'cost', sort_type: 'DESC', page_size: PAGE_SIZE }, `creative:${cid}/${spu}`)
      pageCount += cr.pagesFetched
      rawRowCount += cr.list.length
      const { rows } = parseGmvMaxApiRows(cr.list, { currency, campaignId: cid, campaignName, productId: spu, startDate: date, endDate: date, snapshotDate: date })
      pairs.push({ campaignId: cid, campaignName, itemGroupId: spu, rows })
    }
  }

  // 5) Guard DEDUP dulu (root-cause tepat: duplikat = paginasi/merge cacat) —
  //    sebelum reconcile, agar over-count akibat duplikat tak salah-lapor sebagai
  //    RECONCILE_INVARIANT.
  const attributedRows = pairs.flatMap(p => (p.rows || []).filter(r => !r.isSystem))
  const dups = findDuplicateIdentities(attributedRows)
  if (dups.length) { const e = new Error(`DUPLICATE_ROWS: ${dups.length} identity kanonik dobel (paginasi/merge cacat)`); e.code = 'DUPLICATE_ROWS'; e.dups = dups; throw e }
  // 6) Reconcile (kanonik) + guard invariant residual ≥ 0.
  const rec = reconcile({ pairs, campaignTotals, currency })
  if (rec.report.negativeResidual) { const e = new Error('RECONCILE_INVARIANT: Σ attributed > campaignTotal (over-count/data cacat)'); e.code = 'RECONCILE_INVARIANT'; throw e }

  return finalize(rec, { advertiserId, date, campaignCount: campaignIds.length, pageCount, rawRowCount, normalizedRows: rec.rows, t0 })
}

function finalize(rec, m) {
  const attributed = rec.rows.filter(r => !r.isSystem)
  const nonAttr = rec.rows.filter(r => r.isSystem)
  return {
    rows: rec.rows,
    totals: rec.totals,
    meta: {
      advertiserId: m.advertiserId, date: m.date, campaignCount: m.campaignCount,
      pageCount: m.pageCount, rawRowCount: m.rawRowCount,
      normalizedRowCount: rec.rows.length, attributedCount: attributed.length,
      nonAttributedCount: nonAttr.length, durationMs: Date.now() - m.t0,
      // Zero-data contract: finalize HANYA tercapai saat sukses penuh (semua paginasi
      // selesai, tanpa throw). rows=0 di sini = benar-benar zero-data (bukan incomplete/failed).
      completeness: rec.rows.length > 0 ? 'COMPLETE_WITH_ROWS' : 'COMPLETE_ZERO_DATA',
    },
  }
}
