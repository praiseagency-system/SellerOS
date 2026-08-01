// Perhitungan metrik gabungan (blended) dari cacah mentah.
//
// Hukum yang ditegakkan berkas ini:
// 1. Rate gabungan SELALU dihitung ulang dari cacah:
//       blendedCR = Σbuyers ÷ ΣqualifiedTraffic
//    BUKAN rata-rata rate tiap platform.
// 2. null ≠ 0. Data tak tersedia tetap null sampai ke layar ("—").
// 3. Denominator tak lengkap → hasilnya null, bukan angka setengah benar.
//    Ini yang membuat ROAS gabungan kosong kalau biaya iklan cuma dari satu
//    marketplace, dan CTR gabungan kosong kalau definisi impresinya beda.

const allHave = (list, f) => list.length > 0 && list.every(m => f(m) != null)
const someHave = (list, f) => list.some(m => f(m) != null)
const sumOf = (list, f) => someHave(list, f) ? list.reduce((s, m) => s + (f(m) ?? 0), 0) : null

export const FLAG = {
  ORDER_FALLBACK: 'order_fallback',
  ATC_INCOMPATIBLE: 'atc_incompatible',
  ATC_QUANTITY_ONLY: 'atc_quantity_only',
  TRAFFIC_FALLBACK: 'traffic_fallback',
  TRAFFIC_PARTIAL: 'traffic_partial',
  GMV_BASIS_MIXED: 'gmv_basis_mixed',
  CTR_INCOMPATIBLE: 'ctr_incompatible',
  ROAS_INCOMPLETE: 'roas_incomplete',
  NO_TRAFFIC: 'insufficient_traffic',
}

// Rasio yang aman: null kalau penyebut tak ada / nol, bukan 0 dan bukan ∞.
export function safeRate(numerator, denominator) {
  if (numerator == null || denominator == null) return null
  if (!(denominator > 0)) return null
  return (numerator / denominator) * 100
}

// members: [{ platform, metrics }] — metrics = hasil normalizeRow (+ iklan).
export function blendMembers(members) {
  const list = (members || []).filter(Boolean)
  if (!list.length) return null
  const m = list.map(x => x.metrics || {})
  const flags = new Set()

  // ── Traffic ──
  const qualifiedTraffic = sumOf(m, x => x.qualifiedTraffic)
  if (someHave(m, x => x.qualifiedTraffic) && !allHave(m, x => x.qualifiedTraffic)) flags.add(FLAG.TRAFFIC_PARTIAL)
  if (m.some(x => x.trafficSource && x.trafficSource !== 'unique_clicks')) flags.add(FLAG.TRAFFIC_FALLBACK)
  if (qualifiedTraffic === 0) flags.add(FLAG.NO_TRAFFIC)

  // ── Buyers → conversion ──
  const buyers = sumOf(m, x => x.buyers)
  if (m.some(x => x.buyerSource === 'order_fallback')) flags.add(FLAG.ORDER_FALLBACK)
  const conversionRate = safeRate(buyers, qualifiedTraffic)

  // ── ATC: hanya dari ATC users. Kuantitas/rate saja dianggap tak kompatibel. ──
  const atcCompatible = allHave(m, x => x.atcUsers)
  const atcUsers = atcCompatible ? sumOf(m, x => x.atcUsers) : null
  if (!atcCompatible) {
    flags.add(FLAG.ATC_INCOMPATIBLE)
    if (m.some(x => x.atcSource === 'atc_quantity_only')) flags.add(FLAG.ATC_QUANTITY_ONLY)
  }
  const atcRate = atcCompatible ? safeRate(atcUsers, qualifiedTraffic) : null

  // ── GMV: boleh dijumlah, tapi basis transaksinya dicatat. ──
  // Pesanan Shopee ("Pesanan Dibuat") dan TikTok ("Pesanan SKU") diputuskan
  // product owner sebagai canonical `orders` yang setara — boleh dijumlah.
  // Konversi utama TETAP memakai pembeli, bukan pesanan.
  const orders = sumOf(m, x => x.orders)
  const ordersPerBuyer = safeRate(orders, buyers) == null ? null : orders / buyers
  const orderRate = safeRate(orders, qualifiedTraffic)

  const gmv = sumOf(m, x => x.gmv)
  const bases = [...new Set(m.map(x => x.gmvBasis).filter(Boolean))]
  const isGmvComparable = bases.length <= 1
  if (!isGmvComparable) flags.add(FLAG.GMV_BASIS_MIXED)

  // ── CTR: butuh impresi yang definisinya sebanding. Antar-marketplace
  //    dianggap TIDAK sebanding, jadi hanya dihitung bila satu platform. ──
  const platforms = [...new Set(list.map(x => x.platform))]
  const impressions = allHave(m, x => x.impressions) ? sumOf(m, x => x.impressions) : null
  // Tahap exposure gabungan: dijumlah hanya kalau SEMUA anggota punya nilainya
  // — marketplace yang absen tak boleh tersamar sebagai nol.
  const uniqueViewers = allHave(m, x => x.uniqueViewers) ? sumOf(m, x => x.uniqueViewers) : null
  const uniqueClicksSum = allHave(m, x => x.uniqueClicks) ? sumOf(m, x => x.uniqueClicks) : null
  const clicksSum = allHave(m, x => x.productClicks) ? sumOf(m, x => x.productClicks) : null
  const clicks = allHave(m, x => x.productClicks ?? x.qualifiedTraffic)
    ? sumOf(m, x => x.productClicks ?? x.qualifiedTraffic) : null
  let ctr = null
  if (platforms.length === 1 && impressions != null && clicks != null) ctr = safeRate(clicks, impressions)
  else if (platforms.length > 1) flags.add(FLAG.CTR_INCOMPATIBLE)

  // ── ROAS: butuh biaya iklan DARI SEMUA anggota. Kalau tidak, null. ──
  const roasComplete = allHave(m, x => x.adSpend) && allHave(m, x => x.attributedGmv)
  const adSpend = roasComplete ? sumOf(m, x => x.adSpend) : null
  const attributedGmv = roasComplete ? sumOf(m, x => x.attributedGmv) : null
  const roas = roasComplete && adSpend > 0 ? attributedGmv / adSpend : null
  if (!roasComplete && someHave(m, x => x.adSpend)) flags.add(FLAG.ROAS_INCOMPLETE)

  return {
    qualifiedTraffic,
    buyers,
    conversionRate,
    conversionSource: m.some(x => x.buyerSource === 'order_fallback') ? 'order_fallback' : 'buyers',
    atcUsers,
    atcRate,
    atcCompatible,
    orders,
    orderRate,
    ordersPerBuyer,
    // Cakupan marketplace — jangan menyamarkan marketplace yang absen sebagai nol.
    marketplaceCoverage: (() => {
      const p = new Set(list.map(x => x.platform))
      if (p.has('shopee') && p.has('tiktok')) return 'shopee_and_tiktok'
      if (p.has('shopee')) return 'shopee_only'
      if (p.has('tiktok')) return 'tiktok_only'
      return 'none'
    })(),
    quantitySold: sumOf(m, x => x.quantitySold),
    gmv,
    gmvBases: bases,
    isGmvComparable,
    impressions,
    uniqueViewers,
    uniqueClicks: uniqueClicksSum,
    clicks: clicksSum,
    productClicks: clicks,
    ctr,
    adSpend,
    attributedGmv,
    roas,
    flags: [...flags],
    breakdown: list.map(x => ({
      platform: x.platform,
      qualifiedTraffic: x.metrics?.qualifiedTraffic ?? null,
      trafficSource: x.metrics?.trafficSource ?? null,
      buyers: x.metrics?.buyers ?? null,
      conversionRate: safeRate(x.metrics?.buyers, x.metrics?.qualifiedTraffic),
      atcUsers: x.metrics?.atcUsers ?? null,
      atcRate: safeRate(x.metrics?.atcUsers, x.metrics?.qualifiedTraffic),
      gmv: x.metrics?.gmv ?? null,
      gmvBasis: x.metrics?.gmvBasis ?? null,
      adSpend: x.metrics?.adSpend ?? null,
      attributedGmv: x.metrics?.attributedGmv ?? null,
      roas: (x.metrics?.adSpend > 0 && x.metrics?.attributedGmv != null)
        ? x.metrics.attributedGmv / x.metrics.adSpend : null,
      quantitySold: x.metrics?.quantitySold ?? null,
      orders: x.metrics?.orders ?? null,
      uniqueClicks: x.metrics?.uniqueClicks ?? null,
      uniqueViewers: x.metrics?.uniqueViewers ?? null,
      impressions: x.metrics?.impressions ?? null,
      clicks: x.metrics?.productClicks ?? null,
      atcRateNative: x.metrics?.atcRateReported ?? null,
    })),
  }
}

// Gabungkan metrik LINTAS PERIODE untuk satu produk di satu platform.
// Sama seperti blend: semua rate dihitung ulang dari cacah total.
export function sumPeriods(metricsList) {
  const list = (metricsList || []).filter(Boolean)
  if (!list.length) return null
  const pick = f => sumOf(list, f)
  const qualifiedTraffic = pick(x => x.qualifiedTraffic)
  const buyers = pick(x => x.buyers)
  const atcUsers = allHave(list, x => x.atcUsers) ? pick(x => x.atcUsers) : null
  const impressions = allHave(list, x => x.impressions) ? pick(x => x.impressions) : null
  const productClicks = pick(x => x.productClicks)
  const adSpendComplete = allHave(list, x => x.adSpend) && allHave(list, x => x.attributedGmv)
  const adSpend = adSpendComplete ? pick(x => x.adSpend) : null
  const attributedGmv = adSpendComplete ? pick(x => x.attributedGmv) : null
  const bases = [...new Set(list.map(x => x.gmvBasis).filter(Boolean))]
  return {
    qualifiedTraffic,
    trafficSource: list.find(x => x.trafficSource)?.trafficSource ?? null,
    visits: pick(x => x.visits),
    impressions,
    productClicks,
    atcUsers,
    atcQuantity: pick(x => x.atcQuantity),
    atcRateReported: safeRate(atcUsers, qualifiedTraffic),
    atcSource: list.find(x => x.atcSource)?.atcSource ?? null,
    buyers,
    buyerSource: list.some(x => x.buyerSource === 'order_fallback') ? 'order_fallback' : (buyers != null ? 'buyers' : null),
    orders: pick(x => x.orders),
    quantitySold: pick(x => x.quantitySold),
    gmv: pick(x => x.gmv),
    gmvBasis: bases.length === 1 ? bases[0] : (bases[0] ?? null),
    attributedGmv,
    adSpend,
    ctrReported: safeRate(productClicks, impressions),
    conversionRateReported: safeRate(buyers, qualifiedTraffic),
    price: list[list.length - 1]?.price ?? null,
    warnings: [...new Set(list.flatMap(x => x.warnings || []))],
  }
}
