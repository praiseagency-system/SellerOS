// Kamus metrik kanonik SellerOS — satu-satunya tempat nama kolom mentah dari
// Shopee & TikTok diterjemahkan. Versi 3 (disetujui product owner 2026-08-01).
//
// Aturan yang ditegakkan berkas ini:
// • Satu istilah UI untuk kedua marketplace; nama asli disimpan untuk tooltip.
// • Rate SELALU dihitung ulang dari cacah. Rate bawaan file hanya pembanding.
// • null ≠ 0. "-", "—", dan sel kosong menjadi null, bukan nol.
// • Product ID tak pernah masuk parser angka.
// • Rate kanonik disimpan sebagai PECAHAN (0,0458), bukan persen.

export const METRIC_MAPPING_VERSION = 3

export const GMV_BASIS = {
  created_order: 'Pesanan dibuat',
  paid_order: 'Pesanan dibayar',
}

// ── Kamus kanonik: field → label UI ─────────────────────────────────────────
export const CANONICAL = {
  impressions:      { label: 'Tayangan', kind: 'count' },
  uniqueViewers:    { label: 'Pengguna Melihat', kind: 'count' },
  clicks:           { label: 'Klik', kind: 'count' },
  uniqueClicks:     { label: 'Pengklik Unik', kind: 'count' },
  qualifiedTraffic: { label: 'Traffic Produk', kind: 'count' },
  productPageViews: { label: 'Tampilan Halaman Produk', kind: 'count' },
  atcUsers:         { label: 'Pengguna Tambah Keranjang', kind: 'count' },
  atcQuantity:      { label: 'Produk Ditambah ke Keranjang', kind: 'count' },
  buyers:           { label: 'Pembeli', kind: 'count' },
  orders:           { label: 'Pesanan', kind: 'count' },
  itemsSold:        { label: 'Produk Terjual', kind: 'count' },
  gmv:              { label: 'GMV', kind: 'currency' },
  uniqueCtr:        { label: 'CTR Unik', kind: 'rate' },
  atcRate:          { label: 'Rasio Tambah Keranjang', kind: 'rate' },
  conversionRate:   { label: 'Rasio Konversi', kind: 'rate' },
  checkoutRate:     { label: 'Rasio Checkout', kind: 'rate' },
  orderRate:        { label: 'Rasio Pesanan', kind: 'rate' },
  ordersPerBuyer:   { label: 'Pesanan per Pembeli', kind: 'ratio' },
}

export const METRIC_STATUS = {
  OBSERVED: 'observed',
  CALCULATED: 'calculated',
  ESTIMATED: 'estimated',
  FALLBACK: 'fallback',
  MISSING: 'missing',
  INCOMPATIBLE: 'incompatible',
  AMBIGUOUS: 'ambiguous',
}

// ── Alias eksplisit ─────────────────────────────────────────────────────────
// Tak ada fuzzy matching untuk metrik uang & konversi. Kolom yang tak dikenali
// dilaporkan, tak pernah diam-diam diganti kolom lain.
const SHOPEE_ALIASES = {
  impressions:      ['jumlah produk dilihat'],
  uniqueViewers:    ['produk unik dilihat'],
  clicks:           ['produk diklik'],
  uniqueClicks:     ['produk unik diklik'],
  qualifiedTraffic: ['pengunjung produk (kunjungan)', 'pengunjung produk kunjungan'],
  productPageViews: ['halaman produk dilihat'],
  atcUsers:         ['pengunjung produk (menambahkan produk ke keranjang)', 'pengunjung produk menambahkan produk ke keranjang'],
  atcQuantity:      ['dimasukkan ke keranjang (produk)', 'dimasukkan ke keranjang produk'],
  buyers:           ['total pembeli (pesanan dibuat)', 'total pembeli pesanan dibuat'],
  orders:           ['pesanan dibuat'],
  itemsSold:        ['produk (pesanan dibuat)', 'produk pesanan dibuat'],
  gmv:              ['total penjualan (pesanan dibuat) (idr)', 'total penjualan (pesanan dibuat)'],
}
// Rate bawaan Shopee — disimpan sebagai pembanding, bukan sumber kebenaran.
const SHOPEE_NATIVE = {
  nativeClickRate:      ['persentase klik'],
  nativeOrderConvRate:  ['tingkat konversi pesanan (pesanan dibuat)'],
  nativeBuyerConvRate:  ['tingkat konversi (pesanan yang dibuat)'],
  nativeAtcRate:        ['tingkat konversi produk dimasukkan ke keranjang'],
}

const TIKTOK_ALIASES = {
  impressions:      ['tayangan', 'impressions'],
  uniqueViewers:    ['penonton', 'viewers'],
  clicks:           ['klik', 'total klik', 'clicks'],
  uniqueClicks:     ['klik unik', 'unique clicks', 'unique product clicks'],
  atcUsers: [
    'pengguna yang menambahkan produk ke keranjang',
    'pengguna menambahkan produk ke keranjang',
    'pengguna yang tambah produk ke keranjang',
    'atc users', 'add to cart users',
  ],
  buyers:           ['pembeli', 'buyers'],
  orders:           ['pesanan sku', 'sku orders'],
  gmv:              ['gmv (rp)', 'gmv(rp)', 'gmv rp', 'gmv (idr)', 'gmv'],
}
const TIKTOK_NATIVE = {
  nativeImprToPay:   ['tingkat tayangan hingga pembayaran'],
  nativeImprToClick: ['tingkat tayangan hingga klik'],
  nativeClickToAtc:  ['tingkat klik hingga menambahkan produk ke keranjang'],
  nativeClickToPay:  ['tingkat klik hingga pembayaran'],
  nativeAtcToPay:    ['tingkat penambahan produk ke keranjang hingga pembayaran'],
  nativeClickAtcCount: ['klik hingga menambahkan produk ke keranjang'],
}

// Kolom yang sengaja TIDAK dipakai, beserta alasannya (tampil di Import Preview).
export const UNUSED_COLUMNS = {
  tiktok: {
    'gmv yang didapat dari konten (rp)':
      'Tidak digunakan dalam analisis Traffic Conversion SellerOS.',
  },
  shopee: {},
}

export const ALIASES = { shopee: SHOPEE_ALIASES, tiktok: TIKTOK_ALIASES }
export const NATIVE_ALIASES = { shopee: SHOPEE_NATIVE, tiktok: TIKTOK_NATIVE }

// ── Normalisasi header ──────────────────────────────────────────────────────
export function normalizeHeader(h) {
  return (h ?? '')
    .toString()
    .replace(/^\uFEFF/, '')          // BOM
    .replace(/[\r\n\t]+/g, ' ')      // newline & tab
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s*\(\s*/g, ' (')      // rapikan spasi sekitar kurung
    .replace(/\s*\)\s*/g, ') ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Dua fase: exact untuk SEMUA field dulu, lalu partial dengan alias terpanjang
// menang. Tanpa ini "Total Penjualan (Pesanan Dibuat) (IDR)" bisa tersambar
// alias pendek "pesanan dibuat" milik metrik orders.
export function detectColumns(headers, marketplace) {
  const canonical = ALIASES[marketplace] || {}
  const native = NATIVE_ALIASES[marketplace] || {}
  const unusedDict = UNUSED_COLUMNS[marketplace] || {}
  const H = (headers || []).map(normalizeHeader)

  const map = {}, nativeMap = {}, used = new Set(), ambiguous = []

  const assign = (target, key, idx) => {
    target[key] = { index: idx, header: headers[idx], normalized: H[idx] }
    used.add(idx)
  }

  // Fase 1 — exact
  for (const [key, aliases] of Object.entries(canonical)) {
    const hits = H.map((h, i) => (aliases.includes(h) && !used.has(i) ? i : -1)).filter(i => i >= 0)
    if (hits.length === 1) assign(map, key, hits[0])
    else if (hits.length > 1) ambiguous.push({ key, headers: hits.map(i => headers[i]), reason: 'lebih dari satu kolom cocok persis' })
  }
  for (const [key, aliases] of Object.entries(native)) {
    const i = H.findIndex((h, idx) => aliases.includes(h) && !used.has(idx))
    if (i >= 0) assign(nativeMap, key, i)
  }

  // Fase 2 — partial, alias terpanjang menang
  const candidates = []
  for (const [key, aliases] of Object.entries(canonical)) {
    if (map[key]) continue
    for (const a of aliases) {
      H.forEach((h, i) => { if (!used.has(i) && h.includes(a)) candidates.push({ key, a, i }) })
    }
  }
  candidates.sort((x, y) => y.a.length - x.a.length)
  for (const c of candidates) {
    if (map[c.key] || used.has(c.i)) continue
    assign(map, c.key, c.i)
  }

  // Sisanya: sengaja tak dipakai, atau benar-benar tak dikenali.
  const unused = [], unknown = []
  headers.forEach((h, i) => {
    if (used.has(i) || !String(h).trim()) return
    const reason = unusedDict[H[i]]
    if (reason) unused.push({ header: h, reason })
    else unknown.push({ header: h })
  })

  return { map, nativeMap, unused, unknown, ambiguous, matched: Object.keys(map) }
}

// ── Parsing nilai ───────────────────────────────────────────────────────────
// Mengembalikan {value, status, warning}. Persen dikembalikan sebagai PECAHAN.
//
// metricType menentukan cara membaca titik yang ambigu:
//   count/currency → titik = pemisah ribuan ("1.234" = 1234)
//   rate           → titik = desimal ("1.234%" = 0,01234)
//   id/text        → tak pernah diparse sebagai angka
// Tanpa metricType, satu titik + tiga digit di belakang TANPA tanda persen
// dianggap ribuan (pola ekspor Shopee) — dan diberi warning ambigu.
export function parseMetricValue(raw, { isPercent = false, metricType = null } = {}) {
  if (raw === null || raw === undefined) return { value: null, status: METRIC_STATUS.MISSING }
  if (typeof raw === 'number') {
    if (!isFinite(raw)) return { value: null, status: METRIC_STATUS.MISSING, warning: 'nilai tak hingga' }
    return { value: isPercent ? raw / 100 : raw, status: METRIC_STATUS.OBSERVED }
  }
  if (metricType === 'id' || metricType === 'text') {
    return { value: parseProductId(raw), status: METRIC_STATUS.OBSERVED }
  }
  let s = raw.toString().replace(/^\uFEFF/, '').trim()
  if (s === '' || s === '-' || s === '—' || s === 'null') return { value: null, status: METRIC_STATUS.MISSING }

  const hadPercent = s.includes('%')
  s = s.replace(/rp\s*/i, '').replace(/%/g, '').replace(/\s/g, '').trim()

  let warning = null
  const dots = (s.match(/\./g) || []).length
  const hasComma = s.includes(',')
  if (hasComma && dots > 0) s = s.replace(/\./g, '').replace(',', '.')   // 1.234,56
  else if (hasComma) s = s.replace(',', '.')                             // 4,58
  else if (dots > 1) s = s.replace(/\./g, '')                            // 263.095.720
  else if (dots === 1) {
    const after = s.split('.')[1]
    const isRate = hadPercent || isPercent || metricType === 'rate'
    if (isRate) { /* titik = desimal, biarkan */ }
    else if (metricType === 'count' || metricType === 'currency') s = s.replace('.', '')
    else if (after && after.length === 3) {
      // Tanpa konteks tipe: tebakan lama dipertahankan, tapi TIDAK diam-diam.
      s = s.replace('.', '')
      warning = `nilai "${raw}" ambigu (titik dibaca sebagai pemisah ribuan); sebutkan metricType untuk kepastian`
    }
  }

  const n = parseFloat(s)
  if (!isFinite(n)) return { value: null, status: METRIC_STATUS.MISSING, warning: `tak terbaca sebagai angka: ${raw}` }
  return { value: (isPercent || hadPercent) ? n / 100 : n, status: METRIC_STATUS.OBSERVED, warning }
}

// ID produk TIDAK pernah lewat parser angka — presisi 19 digit hilang di
// JavaScript Number (1732966313990064104 → …064000).
export function parseProductId(raw) {
  if (raw === null || raw === undefined) return null
  const s = raw.toString().replace(/^\uFEFF/, '').trim()
  return s === '' || s === '-' ? null : s
}

// ── Rate kanonik ────────────────────────────────────────────────────────────
// Pecahan (0,0458 = 4,58%). Penyebut null/0/invalid → null, bukan 0.
export function ratio(numerator, denominator) {
  if (numerator === null || numerator === undefined) return null
  if (denominator === null || denominator === undefined) return null
  if (!(denominator > 0)) return null
  const v = numerator / denominator
  return isFinite(v) ? v : null
}

export function canonicalRates(m) {
  return {
    uniqueCtr:      ratio(m.uniqueClicks, m.uniqueViewers),
    atcRate:        ratio(m.atcUsers, m.qualifiedTraffic),
    conversionRate: ratio(m.buyers, m.qualifiedTraffic),
    checkoutRate:   ratio(m.buyers, m.atcUsers),
    orderRate:      ratio(m.orders, m.qualifiedTraffic),
    ordersPerBuyer: ratio(m.orders, m.buyers),
  }
}

// Impresi turunan — hanya kalau impresi mentah TIDAK ada.
export function estimateImpressions(clicks, nativeCtr) {
  if (clicks == null || !(clicks > 0)) return null
  if (nativeCtr == null || !(nativeCtr > 0)) return null
  const v = clicks / nativeCtr
  return isFinite(v) && v > 0 ? Math.round(v) : null
}

// ── Periode ─────────────────────────────────────────────────────────────────
export function parsePeriodFromContent(rows) {
  const flat = (rows || []).slice(0, 5).flat().map(c => (c ?? '').toString()).join(' ')
  const m = flat.match(/(\d{4}-\d{2}-\d{2})\s*[~–-]\s*(\d{4}-\d{2}-\d{2})/)
  if (!m) return null
  return { periodStart: m[1].trim(), periodEnd: m[2].trim(), periodSource: 'file_content' }
}

export function parsePeriodFromFilename(name) {
  const m = (name || '').match(/(\d{8})[_-](\d{8})/)
  if (!m) return null
  const iso = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return {
    periodStart: iso(m[1]),
    periodEnd: iso(m[2]),
    periodSource: 'filename',
    warning: 'Periode laporan dibaca dari nama file karena tidak tersedia dalam isi file.',
  }
}

// Bentuk normalizedMetrics kosong — dipakai agar semua field selalu hadir
// (null yang eksplisit, bukan undefined yang tak sengaja).
export function emptyNormalized() {
  return {
    impressions: null, uniqueViewers: null, clicks: null, uniqueClicks: null,
    qualifiedTraffic: null, productPageViews: null, atcUsers: null, atcQuantity: null,
    buyers: null, orders: null, itemsSold: null, gmv: null,
    uniqueCtr: null, atcRate: null, conversionRate: null, checkoutRate: null,
    orderRate: null, ordersPerBuyer: null,
  }
}
