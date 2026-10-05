// Ringkasan HARIAN per campaign (belanja, omzet, order, porsi video) untuk satu
// rentang tanggal — bahan "dampak perubahan setting" di Campaign Ads.
//
// Jalur utama: fungsi Postgres gmvmax_campaign_daily (migrasi 0068) — penjumlahan
// di server, hasilnya beberapa ratus baris. Bila fungsinya belum ada (migrasi
// belum di-apply) → jatuh ke penjumlahan di browser dari gmvmax_creatives kolom
// sempit. Hasil keduanya sama bentuk; jalur cadangan hanya lebih berat
// (puluhan ribu baris), jadi 0068 sebaiknya segera di-apply.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

const PAGE = 1000
const CONCURRENCY = 6
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

async function viaRpc(wsId, from, to) {
  const all = []
  for (let f = 0; ; f += PAGE) {
    const { data, error } = await supabase
      .rpc('gmvmax_campaign_daily', { p_workspace_id: wsId, p_from: from, p_to: to })
      .order('snapshot_date', { ascending: true })
      .order('campaign_id', { ascending: true })
      .range(f, f + PAGE - 1)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return all.map(r => ({
    date: r.snapshot_date, campaignId: r.campaign_id,
    cost: num(r.cost), revenue: num(r.revenue), orders: num(r.orders),
    videoCost: num(r.video_cost), videoRevenue: num(r.video_revenue),
  }))
}

// Cadangan: jumlahkan sendiri. `imports` = daftar import CURRENT (dari context),
// sudah disaring ke rentang oleh pemanggil.
// SATU import per query (eq), meniru loadCreatives — JANGAN digabung jadi
// `in(import_id, banyak) + order(id) + range`: Postgres lalu menyusuri indeks id
// seisi tabel sambil menyaring, dan permintaan berakhir 500/timeout (terukur
// 5 Okt 2026: 5,9 detik untuk halaman pertama, galat di halaman berikutnya).
async function viaCreatives(imports) {
  const acc = new Map()
  async function fetchOne(imp) {
    for (let f = 0; ; f += PAGE) {
      const { data, error } = await supabase
        .from('gmvmax_creatives')
        .select('campaign_id, creative_type, cost, gross_revenue, sku_orders')
        .eq('import_id', imp.id)
        .order('id', { ascending: true })
        .range(f, f + PAGE - 1)
      if (error) throw error
      for (const r of data || []) {
        if (!r.campaign_id) continue
        const k = `${imp.snapshot_date}|${r.campaign_id}`
        let a = acc.get(k)
        if (!a) { a = { date: imp.snapshot_date, campaignId: r.campaign_id, cost: 0, revenue: 0, orders: 0, videoCost: 0, videoRevenue: 0 }; acc.set(k, a) }
        const c = num(r.cost), v = num(r.gross_revenue)
        a.cost += c; a.revenue += v; a.orders += num(r.sku_orders)
        if (r.creative_type === 'Video') { a.videoCost += c; a.videoRevenue += v }
      }
      if (!data || data.length < PAGE) break
    }
  }
  for (let i = 0; i < imports.length; i += CONCURRENCY) {
    await Promise.all(imports.slice(i, i + CONCURRENCY).map(fetchOne))
  }
  return [...acc.values()]
}

// → { byCampaign: Map<campaignId, Map<tanggal, baris>>, store: Map<tanggal, baris>,
//     snapshotDates: Set<tanggal>, lastDataDate, source: 'rpc' | 'browser' }
// store = jumlah SEMUA campaign pada tanggal itu (pembanding "toko di periode sama").
export async function loadCampaignDaily({ from, to, imports = [], wsId = getCurrentWorkspaceId() }) {
  const inRange = imports.filter(i => i.snapshot_date && i.snapshot_date >= from && i.snapshot_date <= to)
  const snapshotDates = new Set(inRange.map(i => i.snapshot_date))
  const lastDataDate = imports.reduce((m, i) => (i.snapshot_date && i.snapshot_date > m ? i.snapshot_date : m), '') || null
  const empty = { byCampaign: new Map(), store: new Map(), snapshotDates, lastDataDate, source: 'rpc' }
  if (!wsId || inRange.length === 0) return empty

  let rows, source = 'rpc'
  try {
    rows = await viaRpc(wsId, from, to)
  } catch {
    // Fungsi belum ada / galat lain di jalur ringkas → hitung sendiri.
    rows = await viaCreatives(inRange)
    source = 'browser'
  }

  const byCampaign = new Map(), store = new Map()
  for (const r of rows) {
    if (!byCampaign.has(r.campaignId)) byCampaign.set(r.campaignId, new Map())
    byCampaign.get(r.campaignId).set(r.date, r)
    let s = store.get(r.date)
    if (!s) { s = { date: r.date, cost: 0, revenue: 0, orders: 0, videoCost: 0, videoRevenue: 0 }; store.set(r.date, s) }
    s.cost += r.cost; s.revenue += r.revenue; s.orders += r.orders
    s.videoCost += r.videoCost; s.videoRevenue += r.videoRevenue
  }
  return { byCampaign, store, snapshotDates, lastDataDate, source }
}
