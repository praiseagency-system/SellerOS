// Perakit baris import → normalizedMetrics + rawMetrics + nativeMetrics.
// Dipakai parser Shopee & TikTok supaya keduanya menghasilkan bentuk identik.

import {
  detectColumns, parseMetricValue, parseProductId, canonicalRates, estimateImpressions,
  emptyNormalized, METRIC_STATUS, METRIC_MAPPING_VERSION, CANONICAL,
} from './metricSchema'

export { detectColumns }

const RATE_KEYS = new Set(['uniqueCtr', 'atcRate', 'conversionRate', 'checkoutRate', 'orderRate', 'ordersPerBuyer'])

// Satu baris file → objek metrik lengkap dengan status per metrik.
export function normalizeImportRow({ row, headers, cols, marketplace, meta = {} }) {
  const raw = {}
  headers.forEach((h, i) => { if (String(h).trim()) raw[h] = row[i] ?? null })

  const normalized = emptyNormalized()
  const status = {}
  const warnings = []

  // Cacah & nilai uang — langsung dari kolom yang termapping.
  for (const key of Object.keys(CANONICAL)) {
    if (RATE_KEYS.has(key)) continue
    const c = cols.map[key]
    if (!c) { status[key] = { value: null, status: METRIC_STATUS.MISSING }; continue }
    const p = parseMetricValue(row[c.index], { metricType: CANONICAL[key]?.kind })
    normalized[key] = p.value
    status[key] = {
      value: p.value,
      status: p.value == null ? METRIC_STATUS.MISSING : METRIC_STATUS.OBSERVED,
      sourceHeader: c.header,
      sourceValue: row[c.index] ?? null,
      warning: p.warning,
    }
    if (p.warning) warnings.push(`${key}: ${p.warning}`)
  }

  // Traffic Produk TikTok = Klik Unik (kolom yang sama, disalin dengan sengaja).
  if (marketplace === 'tiktok' && normalized.qualifiedTraffic == null && normalized.uniqueClicks != null) {
    normalized.qualifiedTraffic = normalized.uniqueClicks
    status.qualifiedTraffic = {
      value: normalized.uniqueClicks,
      status: METRIC_STATUS.OBSERVED,
      sourceHeader: cols.map.uniqueClicks?.header,
      sourceValue: row[cols.map.uniqueClicks?.index] ?? null,
      calculationMethod: 'same_column_as_unique_clicks',
    }
  }

  // Rate bawaan file — pembanding saja, tak pernah jadi sumber kanonik.
  const nativeMetrics = {}
  for (const [key, c] of Object.entries(cols.nativeMap || {})) {
    const p = parseMetricValue(row[c.index], { metricType: 'rate' })
    nativeMetrics[key] = { value: p.value, sourceHeader: c.header, sourceValue: row[c.index] ?? null }
  }

  // Impresi: mentah menang. Estimasi disimpan TERPISAH, tak menimpa null.
  let estimatedImpressions = null
  if (normalized.impressions == null) {
    const nativeCtr = nativeMetrics.nativeImprToClick?.value ?? nativeMetrics.nativeClickRate?.value ?? null
    const est = estimateImpressions(normalized.clicks ?? normalized.uniqueClicks, nativeCtr)
    if (est != null) {
      estimatedImpressions = est
      status.impressions = {
        value: null, status: METRIC_STATUS.ESTIMATED, estimatedValue: est,
        calculationMethod: 'clicks_divided_by_native_ctr',
        warning: 'Impression tidak tersedia secara langsung dan dihitung dari jumlah klik dibagi CTR bawaan file.',
      }
      warnings.push('impressions: estimasi dari klik ÷ CTR bawaan')
    }
  }

  // Rate kanonik — selalu dihitung ulang dari cacah.
  const rates = canonicalRates(normalized)
  const METHOD = {
    uniqueCtr: 'unique_clicks_divided_by_unique_viewers',
    atcRate: 'atc_users_divided_by_qualified_traffic',
    conversionRate: 'buyers_divided_by_qualified_traffic',
    checkoutRate: 'buyers_divided_by_atc_users',
    orderRate: 'orders_divided_by_qualified_traffic',
    ordersPerBuyer: 'orders_divided_by_buyers',
  }
  for (const [k, v] of Object.entries(rates)) {
    normalized[k] = v
    status[k] = v == null
      ? { value: null, status: METRIC_STATUS.MISSING, calculationMethod: METHOD[k], warning: 'penyebut tidak tersedia atau nol' }
      : { value: v, status: METRIC_STATUS.CALCULATED, calculationMethod: METHOD[k] }
  }

  return {
    rawMetrics: raw,
    normalizedMetrics: normalized,
    nativeMetrics,
    estimatedImpressions,
    metricStatus: status,
    warnings,
    ...meta,
    mappingVersion: METRIC_MAPPING_VERSION,
  }
}

// Jembatan ke pipeline lama (blendMetrics/quadrantAggregate) yang memakai
// rate dalam PERSEN dan nama field lamanya. Rate kanonik disimpan sebagai
// pecahan; di sini dikalikan 100 satu kali, di satu tempat.
export function toLegacyMetrics(n, { marketplace, gmvBasis }) {
  const pct = v => (v == null ? null : v * 100)
  return {
    qualifiedTraffic: n.normalizedMetrics.qualifiedTraffic,
    trafficSource: 'observed',
    visits: marketplace === 'shopee' ? n.normalizedMetrics.qualifiedTraffic : null,
    impressions: n.normalizedMetrics.impressions,
    productClicks: n.normalizedMetrics.clicks,
    uniqueClicks: n.normalizedMetrics.uniqueClicks,
    uniqueViewers: n.normalizedMetrics.uniqueViewers,
    productPageViews: n.normalizedMetrics.productPageViews,
    atcUsers: n.normalizedMetrics.atcUsers,
    atcQuantity: n.normalizedMetrics.atcQuantity,
    atcRateReported: pct(n.normalizedMetrics.atcRate),
    atcSource: n.normalizedMetrics.atcUsers != null ? 'atc_users' : null,
    buyers: n.normalizedMetrics.buyers,
    buyerSource: n.normalizedMetrics.buyers != null ? 'buyers' : null,
    orders: n.normalizedMetrics.orders,
    itemsSold: n.normalizedMetrics.itemsSold,
    quantitySold: n.normalizedMetrics.itemsSold,
    gmv: n.normalizedMetrics.gmv,
    gmvBasis,
    attributedGmv: null,
    adSpend: null,
    ctrReported: pct(n.normalizedMetrics.uniqueCtr),
    conversionRateReported: pct(n.normalizedMetrics.conversionRate),
    checkoutRateReported: pct(n.normalizedMetrics.checkoutRate),
    orderRateReported: pct(n.normalizedMetrics.orderRate),
    ordersPerBuyer: n.normalizedMetrics.ordersPerBuyer,
    estimatedImpressions: n.estimatedImpressions,
    price: null,
    warnings: n.warnings,
  }
}

export { parseProductId }

// ── Import Preview ──────────────────────────────────────────────────────────
// Ringkasan yang harus dilihat user SEBELUM data disimpan. Menghasilkan data,
// bukan tampilan — komponen UI-nya menyusul.
export function buildImportPreview({ marketplace, fileName, sheetName, headerRow, headers, cols, sampleRow, period, parentCount, variantCount }) {
  const REQUIRED = {
    quadrant: ['qualifiedTraffic', 'buyers', 'gmv'],
    funnelCore: ['qualifiedTraffic', 'atcUsers', 'buyers', 'gmv'],
    funnelFull: ['impressions', 'uniqueViewers', 'qualifiedTraffic', 'atcUsers', 'buyers', 'orders', 'gmv'],
  }
  // Traffic Produk TikTok menumpang di kolom Klik Unik — dianggap tersedia
  // kalau uniqueClicks termapping.
  const has = k => !!cols.map[k] || (k === 'qualifiedTraffic' && marketplace === 'tiktok' && !!cols.map.uniqueClicks)
  const missing = set => set.filter(k => !has(k))
  const example = key => {
    const c = cols.map[key]
    return c && sampleRow ? (sampleRow[c.index] ?? null) : null
  }
  const warnings = []
  if (period?.warning) warnings.push(period.warning)
  if (!cols.map.orders) warnings.push('Kolom Pesanan tidak ditemukan — posisi Kuadran tetap bisa dihitung.')
  for (const a of cols.ambiguous) warnings.push(`Kolom ambigu untuk ${a.key}: ${a.headers.join(' / ')} — perlu ditinjau.`)

  return {
    summary: {
      marketplace, fileName, sheetName, headerRow,
      periodStart: period?.periodStart ?? null,
      periodEnd: period?.periodEnd ?? null,
      periodSource: period?.periodSource ?? null,
      parentCount: parentCount ?? null,
      variantCount: variantCount ?? null,
      totalColumns: headers.length,
      mappedColumns: Object.keys(cols.map).length,
      unusedColumns: cols.unused.length,
      unknownColumns: cols.unknown.length,
    },
    mapped: Object.entries(cols.map).map(([key, c]) => ({
      canonical: key,
      label: CANONICAL[key]?.label ?? key,
      rawHeader: c.header,
      example: example(key),
      status: 'observed',
    })),
    unused: cols.unused,
    unknown: cols.unknown,
    ambiguous: cols.ambiguous,
    readiness: {
      quadrant: { missing: missing(REQUIRED.quadrant), ready: missing(REQUIRED.quadrant).length === 0 },
      funnelCore: { missing: missing(REQUIRED.funnelCore), ready: missing(REQUIRED.funnelCore).length === 0 },
      funnelFull: { missing: missing(REQUIRED.funnelFull), ready: missing(REQUIRED.funnelFull).length === 0 },
    },
    warnings,
    mappingVersion: METRIC_MAPPING_VERSION,
  }
}
