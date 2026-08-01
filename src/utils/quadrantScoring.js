// Skoring peluang & prioritas produk di Kuadran.
//
// Tiga hal yang dijaga berkas ini:
// 1. Produk bertraffic kecil TIDAK boleh naik ke urutan atas hanya karena
//    persentase kebocorannya besar. Peringkat memakai POTENSI RUPIAH.
// 2. Sampel yang terlalu kecil tak boleh menghasilkan status "Segera" —
//    keyakinan data ikut mengalikan skor.
// 3. null tetap null. Tak ada `value || 0` untuk metrik.

import { safeRate } from './blendMetrics'

// Ambang minimum sebelum sistem berani menyimpulkan. Bisa ditimpa per
// workspace / marketplace / granularitas periode.
export const DEFAULT_THRESHOLDS = {
  minQualifiedTraffic: 300,
  minBuyers: 5,
  minPeriods: 1,
  minCompleteness: 0.5,   // porsi metrik funnel yang terisi
}

export function resolveThresholds(overrides) {
  return { ...DEFAULT_THRESHOLDS, ...(overrides || {}) }
}

// ── Tahapan funnel dengan metadata asal-usul ────────────────────────────────
// Impresi jarang tersedia langsung; kalau diturunkan dari klik ÷ CTR, hasilnya
// WAJIB ditandai estimated supaya tak dibaca sebagai angka mentah.
export const STAGE = {
  IMPRESSION: 'impression',
  CLICK: 'click',
  ATC: 'atc',
  BUYER: 'buyer',
  GMV: 'gmv',
}

const STAGE_LABEL = {
  impression: 'Impression',
  click: 'Product Click',
  atc: 'ATC Users',
  buyer: 'Buyers',
  gmv: 'GMV',
}

// Impresi hasil turunan: hanya sah kalau klik > 0 DAN ctr > 0.
export function deriveImpressions(metrics) {
  const clicks = metrics?.productClicks ?? metrics?.qualifiedTraffic ?? null
  const ctr = metrics?.ctrReported ?? null
  if (metrics?.impressions != null) {
    return { value: metrics.impressions, source: 'observed', method: 'raw', confidence: 1 }
  }
  if (clicks == null || !(clicks > 0) || ctr == null || !(ctr > 0)) {
    return { value: null, source: 'unavailable', method: null, confidence: 0 }
  }
  const v = (clicks / ctr) * 100
  if (!isFinite(v) || v <= 0) return { value: null, source: 'unavailable', method: null, confidence: 0 }
  return {
    value: Math.round(v),
    source: 'estimated',
    method: 'clicks / ctr',
    confidence: 0.6,
    warning: 'Impression tidak tersedia secara langsung dan dihitung dari jumlah klik dibagi CTR. Nilai dapat berbeda karena pembulatan sumber data.',
  }
}

// Tahapan yang benar-benar bisa ditampilkan untuk satu produk.
// Hanya stage dengan data tersedia yang masuk — tak ada tahap kosong palsu.
export function funnelStages(product, opts = {}) {
  const m = product?.metrics || {
    impressions: product?.impressions ?? null,
    productClicks: product?.klik_produk ?? null,
    qualifiedTraffic: product?.qualifiedTraffic ?? null,
    atcUsers: product?.atcUsers ?? null,
    buyers: product?.buyers ?? null,
    gmv: product?.gmv ?? null,
    ctrReported: product?.ctr ?? null,
  }
  const prev = opts.previous || null
  const bench = opts.benchmark || null

  const imp = deriveImpressions(m)
  const clicks = m.productClicks ?? product?.qualifiedTraffic ?? m.qualifiedTraffic ?? null
  // Cacah ATC dipakai apa adanya kalau ada; kalau hanya rate yang tersedia,
  // cacahnya diturunkan untuk TAMPILAN — perhitungan rate tetap dari angka
  // mentah supaya pembulatan tampilan tak merembes ke hitungan.
  const atcRaw = m.atcUsers ?? (product?.atcRate != null && product?.qualifiedTraffic != null
    ? product.qualifiedTraffic * (product.atcRate / 100) : null)
  const atc = atcRaw == null ? null : Math.round(atcRaw)
  const buyers = product?.buyers ?? m.buyers ?? null
  const gmv = product?.gmv ?? m.gmv ?? null

  const raw = [
    { key: STAGE.IMPRESSION, value: imp.value, source: imp.source, method: imp.method, warning: imp.warning },
    { key: STAGE.CLICK, value: clicks, source: clicks == null ? 'unavailable' : 'observed' },
    { key: STAGE.ATC, value: atc, rawValue: atcRaw, reportedRate: product?.atcRate ?? m.atcRateReported ?? null,
      source: atc == null ? 'unavailable' : (product?.atcCompatible === false ? 'fallback' : 'observed') },
    { key: STAGE.BUYER, value: buyers, source: buyers == null ? 'unavailable' : (product?.conversionSource === 'order_fallback' ? 'fallback' : 'observed') },
    { key: STAGE.GMV, value: gmv, source: gmv == null ? 'unavailable' : 'observed', isCurrency: true },
  ].filter(s => s.value != null)

  // Rate antar-tahap + kebocoran. Rate dihitung terhadap tahap SEBELUMNYA.
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i]
    s.label = STAGE_LABEL[s.key]
    const p = raw[i - 1]
    if (p && !s.isCurrency && !p.isCurrency && p.value > 0) {
      const cur = s.rawValue ?? s.value
      const base = p.rawValue ?? p.value
      // Rate yang dilaporkan sumber dipakai apa adanya (paling akurat);
      // selebihnya dihitung dari nilai mentah, bukan yang sudah dibulatkan.
      s.rate = s.reportedRate != null ? s.reportedRate : (cur / base) * 100
      s.rateLabel = rateLabelFor(p.key, s.key)
      s.dropCount = Math.round(base - cur)
      s.dropPct = ((base - cur) / base) * 100
    }
    // Delta vs periode sebelumnya (persen untuk cacah, poin untuk rate).
    const pv = prev ? stageValueOf(prev, s.key) : null
    if (pv != null && pv > 0 && s.value != null) s.deltaPct = ((s.value - pv) / pv) * 100
    const pr = prev ? stageRateOf(prev, s.key) : null
    if (pr != null && s.rate != null) s.deltaPp = s.rate - pr
    // Selisih terhadap benchmark, dalam percentage point.
    if (bench && s.key === STAGE.BUYER && bench.conversionThreshold != null && s.rate != null) {
      s.benchmarkPp = s.rate - bench.conversionThreshold
    }
  }
  return raw
}

function rateLabelFor(from, to) {
  if (from === STAGE.IMPRESSION && to === STAGE.CLICK) return 'CTR'
  if (to === STAGE.ATC) return 'ATC Rate'
  if (to === STAGE.BUYER) return 'Checkout Rate'
  return 'Rate'
}

function stageValueOf(product, key) {
  switch (key) {
    case STAGE.IMPRESSION: return deriveImpressions(product?.metrics || {}).value
    case STAGE.CLICK: return product?.qualifiedTraffic ?? null
    case STAGE.ATC: return product?.atcRate != null && product?.qualifiedTraffic != null
      ? Math.round(product.qualifiedTraffic * (product.atcRate / 100)) : null
    case STAGE.BUYER: return product?.buyers ?? null
    case STAGE.GMV: return product?.gmv ?? null
    default: return null
  }
}
function stageRateOf(product, key) {
  if (key === STAGE.ATC) return product?.atcRate ?? null
  if (key === STAGE.BUYER) {
    const atc = stageValueOf(product, STAGE.ATC)
    return atc > 0 ? safeRate(product?.buyers, atc) : null
  }
  return null
}

// Tahap terlemah dibanding produk lain (median), bukan yang gugur paling banyak.
export function weakestStage(product, medians) {
  const cands = [
    { key: STAGE.CLICK, label: 'CTR', value: product.ctrBlended ?? product.ctr ?? null, mid: medians?.ctr },
    { key: STAGE.ATC, label: 'ATC rate', value: product.atcRate ?? null, mid: medians?.atcRate },
    { key: STAGE.BUYER, label: 'Conversion rate', value: product.conversionRate ?? null, mid: medians?.conversionRate },
  ].filter(c => c.value != null && c.mid > 0)
  if (!cands.length) return null
  for (const c of cands) c.ratio = c.value / c.mid
  cands.sort((a, b) => a.ratio - b.ratio)
  const w = cands[0]
  return { ...w, behindPp: w.mid - w.value }
}

// ── Opportunity ─────────────────────────────────────────────────────────────
export function opportunityOf(product, benchmark) {
  const traffic = product?.qualifiedTraffic ?? null
  const cr = product?.conversionRate ?? null
  const target = benchmark?.conversionThreshold ?? null
  const buyers = product?.buyers ?? null
  const gmv = product?.gmv ?? null

  if (traffic == null || !(traffic > 0) || cr == null || target == null) {
    return { conversionGap: null, potentialOrders: null, aov: null, potentialGmv: null, reason: 'data tidak lengkap' }
  }
  const conversionGap = Math.max(target - cr, 0)
  const potentialOrders = traffic * (conversionGap / 100)
  // AOV hanya sah kalau ada pembeli. Tanpa itu, potensi rupiah TIDAK dikarang.
  const aov = (buyers != null && buyers > 0 && gmv != null) ? gmv / buyers : null
  const potentialGmv = aov != null ? potentialOrders * aov : null
  return {
    conversionGap,
    potentialOrders,
    aov,
    potentialGmv,
    reason: potentialGmv == null ? 'AOV tak bisa dihitung (pembeli 0/tidak tersedia)' : null,
  }
}

// ── Keyakinan data ──────────────────────────────────────────────────────────
// Gabungan kelengkapan funnel, besar sampel, asal metrik, dan status mapping.
export function dataConfidence(product, thresholds = DEFAULT_THRESHOLDS) {
  const t = resolveThresholds(thresholds)
  const fields = [
    product?.qualifiedTraffic, product?.conversionRate, product?.atcRate,
    product?.gmv, product?.buyers,
  ]
  const completeness = fields.filter(v => v != null).length / fields.length

  const traffic = product?.qualifiedTraffic ?? 0
  const buyers = product?.buyers ?? 0
  const sample = Math.min(1, (traffic / t.minQualifiedTraffic) * 0.5 + (buyers / t.minBuyers) * 0.5)

  let quality = 1
  const flags = product?.flags || []
  if (flags.includes('order_fallback')) quality -= 0.1
  if (flags.includes('traffic_fallback')) quality -= 0.15
  if (flags.includes('atc_incompatible')) quality -= 0.1
  if (flags.includes('gmv_basis_mixed')) quality -= 0.05
  if (flags.includes('traffic_partial')) quality -= 0.15
  if (product?.merged && product?.mappingStatus === 'auto_matched') quality -= 0.1
  quality = Math.max(0.3, quality)

  const score = Math.max(0, Math.min(1, completeness * 0.35 + sample * 0.4 + quality * 0.25))
  const sufficient = traffic >= t.minQualifiedTraffic && buyers >= t.minBuyers && completeness >= t.minCompleteness
  return {
    score,
    level: score >= 0.7 ? 'high' : score >= 0.45 ? 'medium' : 'low',
    completeness,
    sample,
    quality,
    sufficient,
    reasons: [
      completeness < 1 ? 'sebagian metrik funnel kosong' : null,
      traffic < t.minQualifiedTraffic ? `traffic di bawah ambang sampel (${t.minQualifiedTraffic})` : null,
      buyers < t.minBuyers ? `pembeli di bawah ambang sampel (${t.minBuyers})` : null,
      flags.length ? `catatan data: ${flags.join(', ')}` : null,
    ].filter(Boolean),
  }
}

// ── Priority score ──────────────────────────────────────────────────────────
export const PRIORITY_BANDS = [
  { key: 'urgent', min: 80, label: 'Segera', cls: 'bg-red-500/12 text-red-300' },
  { key: 'medium', min: 50, label: 'Menengah', cls: 'bg-amber-500/12 text-amber-300' },
  { key: 'watch', min: 20, label: 'Pantau', cls: 'bg-blue-600/15 text-blue-300' },
  { key: 'low', min: 0, label: 'Rendah', cls: 'bg-gray-600/20 text-gray-400' },
]
export const INSUFFICIENT = { key: 'insufficient', label: 'Data belum cukup', cls: 'bg-gray-600/20 text-gray-400' }

export function bandOf(score, sufficient) {
  if (!sufficient) return INSUFFICIENT
  if (score == null) return INSUFFICIENT
  return PRIORITY_BANDS.find(b => score >= b.min) || PRIORITY_BANDS[PRIORITY_BANDS.length - 1]
}

// Skor 0–100. Potensi rupiah dinormalisasi terhadap potensi terbesar di
// periode & mode yang sama, lalu dikalikan keyakinan data.
export function scoreProducts(products, benchmark, thresholds = DEFAULT_THRESHOLDS) {
  const enriched = (products || []).map(p => {
    const opp = opportunityOf(p, benchmark)
    const conf = dataConfidence(p, thresholds)
    return { product: p, opportunity: opp, confidence: conf }
  })
  const maxPot = Math.max(0, ...enriched.map(e => e.opportunity.potentialGmv ?? 0))
  return enriched.map(e => {
    const pot = e.opportunity.potentialGmv
    const normalized = (maxPot > 0 && pot != null) ? pot / maxPot : null
    const score = normalized == null ? null : Math.round(normalized * e.confidence.score * 100)
    return {
      ...e,
      priorityScore: e.confidence.sufficient ? score : null,
      band: bandOf(score, e.confidence.sufficient),
    }
  })
}

// Median tiap metrik funnel — pembanding "tahap terlemah".
export function funnelMedians(products) {
  const pick = key => {
    const v = (products || []).map(p => p[key]).filter(x => x != null && x > 0).sort((a, b) => a - b)
    if (!v.length) return null
    const mid = Math.floor(v.length / 2)
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
  }
  return { ctr: pick('ctrBlended') ?? pick('ctr'), atcRate: pick('atcRate'), conversionRate: pick('conversionRate') }
}

// ── Funnel v3: tiga bagian, Pesanan BUKAN tahap linear ──────────────────────
// Exposure   : Tayangan → Pengguna Melihat → Pengklik Unik (Shopee) / Traffic
// Product    : Traffic Produk → Pengguna Tambah Keranjang → Pembeli
// Output     : Pesanan · GMV · Pesanan per Pembeli — satu pembeli bisa membuat
//              lebih dari satu pesanan, jadi selisih Pembeli→Pesanan BUKAN
//              drop-off dan tak boleh digambar sebagai penyusutan corong.
export const CALCULATION_VERSION = 2

export function funnelSections(product, opts = {}) {
  const m = product?.metrics || {}
  const isShopee = (product?.platforms || []).every(p => p.platform === 'shopee') &&
    (product?.platforms || []).length > 0
  const single = (product?.platforms || []).length === 1

  const val = (v, extra = {}) => (v == null ? null : { value: v, ...extra })

  // Exposure — tanpa drop-off antara tahap yang penyebutnya tak sebanding.
  const exposure = []
  const impressions = product?.impressions ?? m.impressions ?? null
  const uniqueViewers = product?.uniqueViewers ?? m.uniqueViewers ?? null
  const uniqueClicks = product?.uniqueClicks ?? m.uniqueClicks ?? null
  if (impressions != null) exposure.push({ key: 'impressions', label: 'Tayangan', ...val(impressions) })
  else if (product?.estimatedImpressions ?? m.estimatedImpressions) {
    exposure.push({ key: 'impressions', label: 'Tayangan', value: product?.estimatedImpressions ?? m.estimatedImpressions, source: 'estimated',
      warning: 'Estimasi dari klik ÷ CTR bawaan file.' })
  }
  if (uniqueViewers != null) exposure.push({ key: 'uniqueViewers', label: 'Pengguna Melihat', ...val(uniqueViewers) })
  // Pengklik Unik hanya ditampilkan bila BERBEDA dari Traffic Produk
  // (Shopee). Di TikTok keduanya kolom yang sama — jangan duplikat tahap.
  const traffic = product?.qualifiedTraffic ?? null
  if (single && isShopee && uniqueClicks != null && uniqueClicks !== traffic) {
    exposure.push({ key: 'uniqueClicks', label: 'Pengklik Unik', ...val(uniqueClicks),
      hint: 'Jumlah pengguna unik yang mengklik produk.' })
  }
  if (traffic != null) exposure.push({ key: 'qualifiedTraffic', label: 'Traffic Produk', ...val(traffic),
    hint: 'Jumlah pengguna yang menunjukkan intent terhadap produk.' })

  // Product conversion — di sini drop-off sah dihitung.
  const atcUsers = product?.atcRate != null && traffic != null
    ? Math.round(traffic * (product.atcRate / 100)) : (m.atcUsers ?? null)
  const buyers = product?.buyers ?? m.buyers ?? null
  const productStages = []
  if (traffic != null) productStages.push({ key: 'qualifiedTraffic', label: 'Traffic Produk', value: traffic })
  if (atcUsers != null) productStages.push({ key: 'atcUsers', label: 'Pengguna Tambah Keranjang', value: atcUsers, rate: product?.atcRate ?? null, rateLabel: 'Rasio Tambah Keranjang' })
  if (buyers != null) productStages.push({ key: 'buyers', label: 'Pembeli', value: buyers,
    rate: atcUsers > 0 ? (buyers / atcUsers) * 100 : null, rateLabel: 'Rasio Checkout' })
  for (let i = 1; i < productStages.length; i++) {
    const prev = productStages[i - 1], cur = productStages[i]
    if (prev.value > 0) {
      cur.dropCount = prev.value - cur.value
      cur.dropPct = ((prev.value - cur.value) / prev.value) * 100
    }
  }

  // Business output — metrik hasil, bukan corong.
  const orders = product?.orders ?? m.orders ?? null
  const gmv = product?.gmv ?? m.gmv ?? null
  const ordersPerBuyer = (orders != null && buyers > 0) ? orders / buyers : null
  const output = {
    orders: val(orders),
    gmv: val(gmv),
    ordersPerBuyer: ordersPerBuyer != null ? { value: ordersPerBuyer } : null,
  }

  // Delta vs periode sebelumnya untuk tahap product-conversion.
  const prev = opts.previous
  if (prev) {
    const prevMap = { qualifiedTraffic: prev.qualifiedTraffic, buyers: prev.buyers }
    for (const s of productStages) {
      const pv = prevMap[s.key]
      if (pv != null && pv > 0 && s.value != null) s.deltaPct = ((s.value - pv) / pv) * 100
    }
  }
  return { exposure, product: productStages, output, calculationVersion: CALCULATION_VERSION }
}
