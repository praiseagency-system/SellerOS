// Penyusunan tampilan Kuadran: lintas PERIODE (bulan → lifetime/custom) dan
// lintas MARKETPLACE (TikTok + Shopee).
//
// Alur: sesi tersimpan → metrik ternormalisasi per platform → digabung lintas
// periode (cacah dijumlah, rate dihitung ulang) → dikelompokkan jadi canonical
// product → di-blend lintas marketplace → dikuadrankan dengan ambang mode itu.
//
// Yang TIDAK boleh terjadi lagi (ini bug yang diperbaiki): baris gabungan
// mengambil GMV dari dua marketplace tapi traffic/konversi dari satu saja.

import { sumPeriods, blendMembers, safeRate } from './blendMetrics'
import { buildCanonicalGroups, buildShortNames, MAPPING_STATUS } from './canonicalProduct'
import { computeBenchmark, quadrantOf } from './quadrantBenchmark'
import { getQuadrant, getTrafficThreshold } from './quadrantUtils'

export { normalizeProductName as normalizeName } from './canonicalProduct'

const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0)

// ── Kompatibilitas snapshot lama ────────────────────────────────────────────
// Periode yang di-import sebelum lapisan metrik ada tak punya `metrics`.
// Turunkan seadanya dari kolom lama, dan TANDAI bahwa ini fallback — jangan
// pura-pura ini qualified traffic atau buyer count yang sebenarnya.
export function legacyToMetrics(p, platform) {
  if (p.metrics) return p.metrics
  const isTok = platform === 'tiktok'
  const traffic = isTok ? (p.klik_produk ?? p.pengunjung ?? null) : (p.pengunjung ?? null)
  return {
    qualifiedTraffic: traffic,
    trafficSource: isTok
      ? (p.klik_produk != null ? 'product_clicks_fallback' : 'impressions_fallback')
      : 'visits_fallback',
    visits: isTok ? null : (p.pengunjung ?? null),
    impressions: isTok && p.klik_produk != null && p.ctr > 0 ? Math.round((p.klik_produk / p.ctr) * 100) : null,
    productClicks: p.klik_produk ?? null,
    atcUsers: null,
    atcQuantity: null,
    atcRateReported: p.atc_rate ?? null,
    atcSource: p.atc_rate != null ? 'atc_rate_only' : null,
    buyers: p.pesanan ?? null,
    buyerSource: p.pesanan != null ? 'order_fallback' : null,
    orders: p.pesanan ?? null,
    quantitySold: null,
    gmv: p.total_penjualan ?? null,
    gmvBasis: isTok ? 'paid' : 'created',
    attributedGmv: null,
    adSpend: null,
    ctrReported: p.ctr ?? null,
    conversionRateReported: p.conversion_rate ?? null,
    price: p.harga ?? null,
    warnings: ['legacy_snapshot'],
  }
}

// ── Gabungan lintas periode (platform sama) ─────────────────────────────────
export function aggregateProduct(snapshots, platform) {
  if (!snapshots.length) return null
  const last = snapshots[snapshots.length - 1]
  const metrics = sumPeriods(snapshots.map(s => legacyToMetrics(s, platform)))

  // Kolom lama tetap diisi supaya tampilan & perbandingan yang sudah ada jalan.
  const traffic = sum(snapshots, p => p.pengunjung)
  const klikList = snapshots.filter(p => p.klik_produk != null)
  const klik = klikList.length ? sum(klikList, p => p.klik_produk) : null
  const impresi = klikList.length
    ? sum(klikList, p => (p.klik_produk > 0 && p.ctr > 0) ? (p.klik_produk / p.ctr) * 100 : (p.pengunjung || 0))
    : null
  const withRoas = snapshots.filter(p => p.roas > 0 && p.total_penjualan > 0)
  const cost = sum(withRoas, p => p.total_penjualan / p.roas)

  return {
    kode_produk: last.kode_produk,
    nama_produk: last.nama_produk,
    sku: last.sku ?? null,
    platform,
    metrics,
    pengunjung: traffic,
    klik_produk: klik,
    ctr: (klik != null && impresi > 0) ? (klik / impresi) * 100 : null,
    ctr_derived: snapshots.some(p => p.ctr_derived) || null,
    atc_rate: metrics.atcRateReported,
    conversion_rate: metrics.conversionRateReported,
    pesanan: metrics.orders,
    total_penjualan: metrics.gmv,
    roas: cost > 0 ? sum(withRoas, p => p.total_penjualan) / cost : null,
    harga: last.harga ?? null,
    stok: last.stok ?? null,
    periodsCount: snapshots.length,
  }
}

// Gabungkan beberapa sesi (platform sama) jadi satu daftar produk.
// Ambang traffic gaya lama ikut dikalikan jumlah periode — kalau tidak,
// traffic N bulan dibandingkan dengan ambang 1 bulan.
export function aggregateSessions(sessions, fallbackSettings, platform) {
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
    .map(list => aggregateProduct(list, platform))
    .filter(Boolean)
  return { products, settings, periods: sessions.length }
}

// ── Pemilihan sesi menurut rentang ──────────────────────────────────────────
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
export function previousRange(range) {
  if (!range || range.mode === 'lifetime') return null
  const shift = (ym, n) => {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, m - 1 - n, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  if (range.mode === 'month') return range.month ? { mode: 'month', month: shift(range.month, 1) } : null
  const { from, to } = range
  if (!from || !to) return null
  const [ay, am] = from.split('-').map(Number), [by, bm] = to.split('-').map(Number)
  const n = (by - ay) * 12 + (bm - am) + 1
  return { mode: 'custom', from: shift(from, n), to: shift(from, 1) }
}

// Periode yang benar-benar tersedia per platform — dipakai untuk memperingatkan
// kalau satu marketplace tak punya bulan yang sama (gabungan jadi timpang).
export function periodCoverage(sessions, range, platforms) {
  const cov = {}
  for (const plat of platforms) cov[plat] = sessionsInRange(sessions, range, [plat]).map(s => s.periodValue)
  const all = [...new Set(Object.values(cov).flat())].sort()
  const partial = Object.entries(cov).filter(([, months]) => months.length !== all.length)
  return { byPlatform: cov, months: all, isAligned: partial.length === 0, partial: partial.map(([p]) => p) }
}

// ── Tampilan utuh untuk satu rentang + daftar marketplace ───────────────────
export function buildRangeView(sessions, range, platforms, defaultsByPlatform, opts = {}) {
  const { mappings = [], manualBenchmark = null, benchmarkMode = 'auto' } = opts
  const listingsByPlatform = {}
  let periods = 0, legacySettings = null

  for (const plat of platforms) {
    const list = sessionsInRange(sessions, range, [plat])
    if (!list.length) continue
    const agg = aggregateSessions(list, defaultsByPlatform[plat], plat)
    listingsByPlatform[plat] = agg.products
    periods = Math.max(periods, agg.periods)
    if (!legacySettings) legacySettings = agg.settings
  }
  const activePlatforms = Object.keys(listingsByPlatform)
  if (!activePlatforms.length) {
    return { products: [], settings: legacySettings, periods: 0, platforms: [], matched: 0, single: 0,
      benchmark: null, suggestions: [], coverage: null }
  }

  const listings = activePlatforms.flatMap(p => listingsByPlatform[p])
  const { groups, suggestions } = buildCanonicalGroups(listings, mappings)
  const coverage = periodCoverage(sessions, range, activePlatforms)

  // Metrik gabungan per canonical product — SEMUA rate dihitung ulang dari
  // cacah, tak ada satu pun yang diambil dari salah satu platform saja.
  let rows = groups.map(g => {
    const blended = blendMembers(g.members.map(m => ({ platform: m.platform, metrics: m.metrics })))
    const dominant = [...g.members].sort((a, b) => (b.metrics?.gmv || 0) - (a.metrics?.gmv || 0))[0]
    return {
      kode_produk: g.id,
      // Kode yang enak dibaca manusia — id kanonik ("name:…") hanya kunci internal.
      displayCode: g.members.map(m => `${m.platform}:${m.kode_produk}`).join(' + '),
      nama_produk: g.name,
      canonicalProductId: g.id,
      platform: dominant?.platform ?? g.members[0]?.platform ?? null,
      platforms: g.members.map(m => ({ platform: m.platform, kode_produk: m.kode_produk, nama_produk: m.nama_produk })),
      merged: g.members.length > 1,
      mappingStatus: g.members.length > 1 ? g.status : MAPPING_STATUS.UNMATCHED,
      mappingSource: g.source,
      mappingConfidence: g.confidence,
      mappingReasons: g.reasons,
      members: g.members,

      // ── metrik blended (nama kanonik) ──
      qualifiedTraffic: blended.qualifiedTraffic,
      buyers: blended.buyers,
      conversionRate: blended.conversionRate,
      conversionSource: blended.conversionSource,
      atcRate: blended.atcRate,
      atcCompatible: blended.atcCompatible,
      gmv: blended.gmv,
      gmvBases: blended.gmvBases,
      isGmvComparable: blended.isGmvComparable,
      ctrBlended: blended.ctr,
      roasBlended: blended.roas,
      adSpend: blended.adSpend,
      attributedGmv: blended.attributedGmv,
      quantitySold: blended.quantitySold,
      flags: blended.flags,
      breakdown: blended.breakdown,
      periodsCount: g.members[0]?.periodsCount ?? periods,

      // ── alias kolom lama, supaya tampilan & perbandingan lama tetap jalan ──
      pengunjung: blended.qualifiedTraffic,
      conversion_rate: blended.conversionRate,
      atc_rate: blended.atcRate,
      total_penjualan: blended.gmv,
      pesanan: blended.orders,
      klik_produk: blended.productClicks,
      ctr: blended.ctr,
      ctr_derived: null,
      roas: blended.roas,
      harga: dominant?.harga ?? null,
      stok: dominant?.stok ?? null,
    }
  })

  // ── Ambang & kuadran ──
  // Mode gabungan tak punya ambang bawaan, jadi memakai median. Mode native
  // mempertahankan ambang lama (target harian × hari) kecuali diminta median.
  const single = activePlatforms.length === 1
  const wantLegacy = single && benchmarkMode !== 'median' && !manualBenchmark
  let benchmark
  if (wantLegacy) {
    benchmark = {
      trafficThreshold: getTrafficThreshold(legacySettings),
      conversionThreshold: legacySettings.conversionThreshold,
      source: 'target_harian',
      pool: null,
    }
  } else {
    benchmark = computeBenchmark(rows, manualBenchmark)
  }
  rows = rows.map(p => ({ ...p, quadrant: quadrantOf(p.qualifiedTraffic, p.conversionRate, benchmark) ?? getQuadrant(p, legacySettings) }))
  // Nama ringkas dihitung sekali untuk seluruh daftar (butuh melihat semua
  // produk agar bisa mengenali token brand yang berulang).
  const shorts = buildShortNames(rows)
  rows = rows.map((r, i) => ({ ...r, shortName: shorts[i] }))
  rows.sort((a, b) => (b.gmv || 0) - (a.gmv || 0))

  return {
    products: rows,
    settings: { ...legacySettings, trafficThreshold: benchmark.trafficThreshold, conversionThreshold: benchmark.conversionThreshold },
    periods,
    platforms: activePlatforms,
    matched: rows.filter(r => r.merged).length,
    single: rows.filter(r => !r.merged).length,
    benchmark,
    suggestions,
    coverage,
  }
}

// Dipakai tampilan lama & tes: rasio aman tanpa pembagian nol.
export { safeRate }
