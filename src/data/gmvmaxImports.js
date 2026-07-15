// Lapisan data GMV Max — Supabase (gmvmax_imports & gmvmax_creatives).
// Tiap upload = 1 SNAPSHOT harian (1 row import + N row creatives, CASCADE).
// Identitas snapshot = (workspace + snapshot_date); re-upload tanggal sama →
// ganti snapshot (perbaikan). Banyak snapshot boleh hidup dalam 1 bulan. RLS
// per pemilik.
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
    .order('snapshot_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Ambil baris creatives untuk sekumpulan import (atau semua import workspace).
// Setiap baris ditandai period/periodName dari import-nya (dipakai rollup).
// Kolom yang benar-benar dipakai rowToCreative — HINDARI select('*') (ikut
// menarik raw_data & kolom tak terpakai). Slim → payload lebih kecil.
const CREATIVE_COLS =
  'id, import_id, video_id, campaign_name, campaign_id, product_id, creative_type, ' +
  'video_title, tiktok_account, time_posted, status, auth_type, cost, sku_orders, ' +
  'cost_per_order, gross_revenue, roas, impressions, clicks, ctr, cvr, hook_tag'
const PAGE = 1000
const CONCURRENCY = 8 // permintaan paralel maksimum ke Supabase

export async function loadCreatives(importIds = null) {
  const imports = await listImports()
  const targets = importIds ? imports.filter(i => importIds.includes(i.id)) : imports
  if (targets.length === 0) return []

  // Ambil creatives PER IMPORT, PARALEL (konkuren terbatas) — jauh lebih cepat
  // dari sekuensial. Tiap import di-paginasi defensif (PostgREST cap ~1000
  // baris/permintaan) agar hari ber-creative >1000 tak terpotong diam-diam.
  async function fetchOne(imp) {
    const out = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('gmvmax_creatives')
        .select(CREATIVE_COLS)
        .eq('import_id', imp.id)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      for (const r of data || []) out.push(rowToCreative(r, imp))
      if (!data || data.length < PAGE) break
    }
    return out
  }

  const all = []
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = await Promise.all(targets.slice(i, i + CONCURRENCY).map(fetchOne))
    for (const rows of batch) all.push(...rows)
  }
  return all
}

// Riwayat LENGKAP video yang PERNAH di-exclude untuk satu produk, LINTAS SEMUA
// snapshot (bukan hanya window aktif). Read-only, di-scope product_id → ringan.
// Balik: [{ videoId, title, account, campaign, first, last, dayCount }] urut
// exclude terakhir terbaru dulu. first/last = tanggal snapshot pertama/terakhir
// video itu terlihat berstatus excluded.
export async function loadExcludedHistory(productId) {
  if (!productId) return []
  const imports = await listImports()
  if (imports.length === 0) return []
  const dateById = Object.fromEntries(imports.map(i => [i.id, i.snapshot_date || null]))
  const ids = imports.map(i => i.id)

  const byVid = new Map()
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25)
    const { data, error } = await supabase
      .from('gmvmax_creatives')
      .select('video_id, video_title, tiktok_account, campaign_name, status, import_id')
      .in('import_id', chunk)
      .eq('product_id', productId)
      .or('status.ilike.%exclud%,status.ilike.%dikecualikan%')
    if (error) throw error
    for (const r of data || []) {
      if (!r.video_id) continue
      const d = dateById[r.import_id] || null
      let e = byVid.get(r.video_id)
      if (!e) {
        e = { videoId: r.video_id, title: r.video_title || '', account: r.tiktok_account || null,
              campaign: r.campaign_name || '', first: d, last: d, days: new Set() }
        byVid.set(r.video_id, e)
      }
      if (d) { if (!e.first || d < e.first) e.first = d; if (!e.last || d > e.last) e.last = d; e.days.add(d) }
      if (!e.campaign && r.campaign_name) e.campaign = r.campaign_name
      if (!e.title && r.video_title) e.title = r.video_title
      if (!e.account && r.tiktok_account) e.account = r.tiktok_account
    }
  }
  return [...byVid.values()]
    .map(({ days, ...e }) => ({ ...e, dayCount: days.size }))
    .sort((a, b) => ((a.last || '') < (b.last || '') ? 1 : -1))
}

// Video yang PERNAH ber-authorization_type "AUTH_CODE" (= "video code"/boosted
// pakai kode menurut TikTok) untuk satu produk, lintas semua snapshot. Sinyal
// deteksi boost objektif (bukan pipeline manual). Read-only, scope product_id.
// Balik: Map<videoId, { videoId, title, account, campaign, first, last }>.
export async function loadCodeVideos(productId) {
  if (!productId) return new Map()
  const imports = await listImports()
  if (imports.length === 0) return new Map()
  const dateById = Object.fromEntries(imports.map(i => [i.id, i.snapshot_date || null]))
  const impIds = imports.map(i => i.id)
  const byVid = new Map()
  for (let i = 0; i < impIds.length; i += 25) {
    const chunk = impIds.slice(i, i + 25)
    const { data, error } = await supabase
      .from('gmvmax_creatives')
      .select('video_id, video_title, tiktok_account, campaign_name, import_id')
      .in('import_id', chunk)
      .eq('product_id', productId)
      .eq('auth_type', 'AUTH_CODE')
    if (error) throw error
    for (const r of data || []) {
      if (!r.video_id) continue
      const d = dateById[r.import_id] || null
      let e = byVid.get(r.video_id)
      if (!e) {
        e = { videoId: r.video_id, title: r.video_title || '', account: r.tiktok_account || null,
              campaign: r.campaign_name || '', first: d, last: d }
        byVid.set(r.video_id, e)
      }
      if (d) { if (!e.first || d < e.first) e.first = d; if (!e.last || d > e.last) e.last = d }
      if (!e.campaign && r.campaign_name) e.campaign = r.campaign_name
    }
  }
  return byVid
}

// Set video_id yang PERNAH muncul untuk satu produk, lintas semua snapshot.
// Dipakai memetakan record boost (tak simpan product_id) ke produk agar tab
// Boosted/Kode-masuk pakai data keseluruhan (bukan window aktif). Read-only.
export async function loadProductVideoIds(productId) {
  if (!productId) return new Set()
  const imports = await listImports()
  if (imports.length === 0) return new Set()
  const impIds = imports.map(i => i.id)
  const set = new Set()
  for (let i = 0; i < impIds.length; i += 25) {
    const chunk = impIds.slice(i, i + 25)
    const { data, error } = await supabase
      .from('gmvmax_creatives')
      .select('video_id')
      .in('import_id', chunk)
      .eq('product_id', productId)
    if (error) throw error
    for (const r of data || []) if (r.video_id) set.add(r.video_id)
  }
  return set
}

// Metrik HARIAN per video (cost/revenue/orders per snapshot_date) untuk
// sekumpulan videoId, lintas semua snapshot. Read-only, di-scope video_id →
// ringan. Dipakai menghitung "performa sejak di-boost". Balik:
// Map<videoId, [{ date, cost, revenue, orders }]> (belum terurut).
export async function loadVideosDaily(videoIds) {
  const ids = [...new Set((videoIds || []).filter(Boolean))]
  if (ids.length === 0) return new Map()
  const imports = await listImports()
  if (imports.length === 0) return new Map()
  const dateById = Object.fromEntries(imports.map(i => [i.id, i.snapshot_date || null]))
  const impIds = imports.map(i => i.id)

  const out = new Map(ids.map(v => [v, []]))
  for (let i = 0; i < impIds.length; i += 25) {
    const chunk = impIds.slice(i, i + 25)
    const { data, error } = await supabase
      .from('gmvmax_creatives')
      .select('video_id, cost, gross_revenue, sku_orders, import_id')
      .in('import_id', chunk)
      .in('video_id', ids)
    if (error) throw error
    for (const r of data || []) {
      const d = dateById[r.import_id]
      if (!d || !out.has(r.video_id)) continue
      out.get(r.video_id).push({
        date: d, cost: num(r.cost) || 0, revenue: num(r.gross_revenue) || 0, orders: num(r.sku_orders) || 0,
      })
    }
  }
  return out
}

// Simpan hasil parser. parsed = { meta, rows } dari parseGmvMaxFile.
export async function saveImport(parsed, settings = null) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { meta, rows } = parsed
  const name = meta.name || meta.filename || 'Import'
  const snapshotDate = meta.snapshotDate || meta.endDate || null

  // Ganti snapshot tanggal sama (creatives ikut via CASCADE). Kalau tanggal tak
  // terbaca dari nama file, jatuh ke identitas lama (name) agar tetap idempoten.
  const del = supabase.from('gmvmax_imports').delete().eq('workspace_id', wsId)
  await (snapshotDate ? del.eq('snapshot_date', snapshotDate) : del.eq('name', name))

  const { data: imp, error } = await supabase
    .from('gmvmax_imports')
    .insert({
      workspace_id: wsId,
      name,
      period_month: meta.periodMonth,
      snapshot_date: snapshotDate,
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

// Retensi storage: untuk bulan yang SUDAH LEWAT (lebih tua dari bulan snapshot
// terbaru), sisakan hanya 1 snapshot final per bulan & hapus harian-nya. Bulan
// berjalan (paling baru) dibiarkan utuh agar delta harian & tren tetap jalan.
// creatives ikut terhapus via CASCADE. Aman dipanggil berulang (idempoten).
const monthOf = i => (i.period_month || i.snapshot_date || '').slice(0, 7)

export async function pruneOldSnapshots() {
  const imps = await listImports() // urut snapshot_date desc
  if (imps.length < 2) return { deleted: 0 }
  const latestMonth = monthOf(imps[0])
  const byMonth = new Map()
  for (const i of imps) {
    const m = monthOf(i)
    if (!m || m === latestMonth) continue // jaga bulan berjalan (terbaru)
    if (!byMonth.has(m)) byMonth.set(m, [])
    byMonth.get(m).push(i)               // per bulan, sudah urut terbaru dulu
  }
  const toDelete = []
  for (const list of byMonth.values()) list.slice(1).forEach(i => toDelete.push(i.id))
  if (!toDelete.length) return { deleted: 0 }
  const { error } = await supabase.from('gmvmax_imports').delete().in('id', toDelete)
  if (error) throw error
  return { deleted: toDelete.length }
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
    // raw_data sengaja TIDAK disimpan — duplikasi kolom terstruktur & tak pernah
    // dibaca balik; membuangnya memangkas ukuran baris ~separuh (hemat storage).
    raw_data: null,
  }
}

// Normalisasi status pengiriman ke SATU bahasa (Inggris) — file import bisa
// campur ID/EN. Peta varian Indonesia + typo → kanonik Inggris; nilai tak
// dikenal di-uppercase apa adanya. normDeliveryStatus tetap jalan (case-insensitive).
const STATUS_EN = {
  'ditayangkan': 'DELIVERING', 'delivering': 'DELIVERING',
  'dalam antrean': 'IN_QUEUE', 'antrean': 'IN_QUEUE', 'in_queue': 'IN_QUEUE', 'in queue': 'IN_QUEUE',
  'mempelajari': 'LEARNING', 'learning': 'LEARNING',
  'perlu otorisasi': 'AUTHORIZATION_NEEDED', 'authorization_needed': 'AUTHORIZATION_NEEDED', 'authorization needed': 'AUTHORIZATION_NEEDED',
  'tidak aktif': 'NOT_ACTIVE', 'not_active': 'NOT_ACTIVE', 'not active': 'NOT_ACTIVE',
  'tidak ditayangkan': 'NOT_DELIVERING', 'not_delivering': 'NOT_DELIVERING', 'not delivering': 'NOT_DELIVERING', 'not_deliverying': 'NOT_DELIVERING',
  'dikecualikan': 'EXCLUDED', 'excluded': 'EXCLUDED',
  'ditolak': 'REJECTED', 'rejected': 'REJECTED',
  'tidak tersedia': 'UNAVAILABLE', 'unavailable': 'UNAVAILABLE',
}
export function normalizeStatus(raw) {
  if (raw == null || raw === '') return raw
  const k = String(raw).toLowerCase().trim()
  return STATUS_EN[k] || String(raw).toUpperCase()
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
    status: normalizeStatus(row.status),
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
    // Tanggal snapshot harian sumber baris — dipakai UI, mis. keterangan
    // "Excluded sejak <tgl>" di modal detail produk.
    snapshotDate: imp?.snapshot_date || null,
  }
}

const num = (v) => (v == null ? null : Number(v))
