// Penggabungan snapshot Kuadran: lintas PERIODE (bulan → lifetime/custom) dan
// lintas MARKETPLACE (TikTok + Shopee).
//
// Dua aturan yang memandu seluruh berkas ini:
//
// 1. Rasio tak boleh dirata-rata mentah. CTR/CR/%ATC harus ditimbang dengan
//    penyebutnya sendiri, kalau tidak bulan sepi bersuara sama keras dengan
//    bulan ramai. CTR gabungan = Σklik ÷ Σimpresi, bukan rata-rata CTR bulanan.
//
// 2. Antar-marketplace, hanya RUPIAH dan PESANAN yang boleh dijumlah. Impresi
//    TikTok bukan satuan yang sama dengan kunjungan Shopee, jadi traffic/CTR/CR
//    tetap dipegang per platform dan tak pernah dilebur.

import { getQuadrant } from './quadrantUtils'

// ── Nama produk sebagai kunci silang-platform ───────────────────────────────
// Tak ada ID atau SKU yang sama antara export Shopee dan TikTok, jadi nama
// adalah satu-satunya jembatan. Normalisasi seagresif mungkin TANPA membuang
// pembeda nyata (angka ukuran, ml, gr tetap dipertahankan).
export function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')          // [Exclusive Bunding], [Promo]
    .replace(/\([^)]*\)/g, ' ')           // (free pouch)
    .replace(/\|.*$/, ' ')                // ekor SEO setelah pipa
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0)

// Penyebut rasio konversi berbeda per sumber: TikTok memakai KLIK, Shopee
// memakai pengunjung. Simpan apa adanya supaya bobotnya benar.
function crBase(p) {
  return (p.klik_produk != null && p.klik_produk > 0) ? p.klik_produk : (p.pengunjung || 0)
}

// Impresi satu snapshot: TikTok "Daftar Produk" menyimpannya di pengunjung,
// tapi untuk format lain bisa dipulihkan dari klik ÷ CTR.
function impresiOf(p) {
  if (p.klik_produk > 0 && p.ctr > 0) return (p.klik_produk / p.ctr) * 100
  return p.pengunjung || 0
}

// ── Gabungan lintas periode (platform sama) ─────────────────────────────────
// snapshots = array produk dari beberapa sesi platform yang sama.
export function aggregateProduct(snapshots) {
  if (!snapshots.length) return null
  const last = snapshots[snapshots.length - 1]
  const traffic = sum(snapshots, p => p.pengunjung)
  const klikList = snapshots.filter(p => p.klik_produk != null)
  const klik = klikList.length ? sum(klikList, p => p.klik_produk) : null
  const impresi = klikList.length ? sum(klikList, impresiOf) : null

  const crDenom = sum(snapshots, crBase)
  const wRate = key => {
    if (!crDenom) return null
    const withVal = snapshots.filter(p => p[key] != null)
    if (!withVal.length) return null
    return (sum(withVal, p => crBase(p) * (p[key] / 100)) / crDenom) * 100
  }

  // ROAS gabungan bukan rata-rata: biaya tiap periode dipulihkan dari
  // sales ÷ roas, lalu Σsales ÷ Σbiaya. Hanya periode yang punya roas ikut.
  const withRoas = snapshots.filter(p => p.roas > 0 && p.total_penjualan > 0)
  const cost = sum(withRoas, p => p.total_penjualan / p.roas)
  const roas = cost > 0 ? sum(withRoas, p => p.total_penjualan) / cost : null

  return {
    kode_produk: last.kode_produk,
    nama_produk: last.nama_produk,
    pengunjung: traffic,
    klik_produk: klik,
    ctr: (klik != null && impresi > 0) ? (klik / impresi) * 100 : null,
    ctr_derived: snapshots.some(p => p.ctr_derived) || null,
    atc_rate: wRate('atc_rate'),
    conversion_rate: wRate('conversion_rate'),
    pesanan: sum(snapshots, p => p.pesanan),
    total_penjualan: sum(snapshots, p => p.total_penjualan),
    roas,
    harga: last.harga ?? null,
    stok: last.stok ?? null,
    periodsCount: snapshots.length,
  }
}

// Gabungkan beberapa sesi (platform sama) jadi satu daftar produk.
// Ambang traffic ikut dikalikan jumlah periode — kalau tidak, 5 bulan traffic
// dibandingkan dengan ambang 1 bulan dan semua produk terlihat ramai.
export function aggregateSessions(sessions, fallbackSettings) {
  if (!sessions.length) return { products: [], settings: fallbackSettings, periods: 0 }
  const base = sessions[sessions.length - 1].settings || fallbackSettings
  const settings = { ...base, periodDays: (base.periodDays || 30) * sessions.length }

  const byProduct = new Map()
  for (const s of sessions) {
    for (const p of s.products || []) {
      if (!byProduct.has(p.kode_produk)) byProduct.set(p.kode_produk, [])
      byProduct.get(p.kode_produk).push(p)
    }
  }
  const products = [...byProduct.values()]
    .map(aggregateProduct)
    .filter(Boolean)
    .map(p => ({ ...p, quadrant: getQuadrant(p, settings) }))
  return { products, settings, periods: sessions.length }
}

// ── Gabungan lintas marketplace ─────────────────────────────────────────────
// Dicocokkan lewat nama ternormalisasi. Rupiah & pesanan dijumlah; traffic,
// CTR, CR, %ATC TIDAK dilebur — disimpan per platform di `platforms`, dan
// kolom rasio di baris induk memakai angka platform dominan (omzet terbesar)
// supaya jelas asalnya, bukan hasil pencampuran.
export function mergeAcrossPlatforms(byPlatform) {
  const groups = new Map()
  for (const [platform, list] of Object.entries(byPlatform)) {
    for (const p of list || []) {
      const key = normalizeName(p.nama_produk) || `#${platform}:${p.kode_produk}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push({ ...p, platform })
    }
  }

  const rows = []
  for (const members of groups.values()) {
    if (members.length === 1) {
      const m = members[0]
      rows.push({ ...m, platforms: [m], merged: false })
      continue
    }
    const dom = [...members].sort((a, b) => (b.total_penjualan || 0) - (a.total_penjualan || 0))[0]
    rows.push({
      ...dom,
      nama_produk: dom.nama_produk,
      kode_produk: members.map(m => `${m.platform}:${m.kode_produk}`).join('+'),
      total_penjualan: sum(members, m => m.total_penjualan),
      pesanan: sum(members, m => m.pesanan),
      platforms: members,
      merged: true,
      dominantPlatform: dom.platform,
    })
  }
  rows.sort((a, b) => (b.total_penjualan || 0) - (a.total_penjualan || 0))
  return {
    products: rows,
    matched: rows.filter(r => r.merged).length,
    single: rows.filter(r => !r.merged).length,
  }
}

// Satu tampilan utuh untuk rentang + daftar platform yang diminta.
export function buildRangeView(sessions, range, platforms, defaultsByPlatform) {
  const byPlatform = {}
  let settings = null, periods = 0
  for (const plat of platforms) {
    const list = sessionsInRange(sessions, range, [plat])
    if (!list.length) continue
    const agg = aggregateSessions(list, defaultsByPlatform[plat])
    byPlatform[plat] = agg.products
    periods = Math.max(periods, agg.periods)
    if (!settings) settings = agg.settings
  }
  const keys = Object.keys(byPlatform)
  if (!keys.length) return { products: [], settings, periods: 0, platforms: [], matched: 0, single: 0 }
  if (keys.length === 1) {
    const plat = keys[0]
    const products = byPlatform[plat].map(p => {
      const withPlat = { ...p, platform: plat }
      return { ...withPlat, platforms: [withPlat], merged: false }
    })
    return { products, settings, periods, platforms: keys, matched: 0, single: products.length }
  }
  const merged = mergeAcrossPlatforms(byPlatform)
  return { ...merged, settings, periods, platforms: keys }
}

// ── Pemilihan sesi menurut rentang ──────────────────────────────────────────
// range = { mode:'month'|'lifetime'|'custom', month, from, to } (nilai 'YYYY-MM')
export function sessionsInRange(sessions, range, platforms) {
  const inPlat = (sessions || []).filter(s => platforms.includes(s.platform))
  const byVal = s => s.periodValue || ''
  let list
  if (!range || range.mode === 'lifetime') list = inPlat
  else if (range.mode === 'custom') {
    const { from, to } = range
    list = inPlat.filter(s => byVal(s) && (!from || byVal(s) >= from) && (!to || byVal(s) <= to))
  } else list = inPlat.filter(s => byVal(s) === range.month)
  return list.slice().sort((a, b) => byVal(a).localeCompare(byVal(b)))
}

// Rentang setara sebelumnya, untuk tab Perubahan.
// Bulan → bulan sebelumnya; Custom N bulan → N bulan tepat sebelum `from`.
// Lifetime tak punya pembanding.
export function previousRange(range) {
  if (!range || range.mode === 'lifetime') return null
  const shift = (ym, n) => {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, m - 1 - n, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  if (range.mode === 'month') {
    return range.month ? { mode: 'month', month: shift(range.month, 1) } : null
  }
  const { from, to } = range
  if (!from || !to) return null
  const monthsBetween = (a, b) => {
    const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number)
    return (by - ay) * 12 + (bm - am) + 1
  }
  const n = monthsBetween(from, to)
  return { mode: 'custom', from: shift(from, n), to: shift(from, 1) }
}
