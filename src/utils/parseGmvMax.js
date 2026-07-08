// Parser export "creative data for product campaigns" (TikTok Shop GMV Max).
// Membaca .xlsx creative-level (26 kolom), menormalkan angka format Indonesia,
// menurunkan hook_tag dari judul, dan mendeteksi periode dari nama file.
//
// Core (parseGmvMaxRows) sengaja murni — tanpa dependency XLSX — agar mudah
// diuji. Hanya pembungkus file (parseGmvMaxFile) yang memakai XLSX.
import * as XLSX from 'xlsx'

// ─── Util angka ──────────────────────────────────────────────────────────────

// Angka polos: "0.0347", "18.87", 516, "-" → number|null.
export function parseNum(val) {
  if (val === null || val === undefined || val === '-' || val === '') return null
  if (typeof val === 'number') return isNaN(val) ? null : val
  const s = val.toString().replace('%', '').trim()
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

// Angka format Indonesia: "Rp2.362.240", "2362240.000", "1.234,56", "6.42%".
export function parseIDNum(val) {
  if (val === null || val === undefined || val === '-' || val === '') return null
  if (typeof val === 'number') return isNaN(val) ? null : val
  const s = val.toString().replace(/Rp/gi, '').replace('%', '').trim()
  if (!s) return null
  const dots = (s.match(/\./g) || []).length
  const hasComma = s.includes(',')
  let cleaned
  if (hasComma && dots > 0) cleaned = s.replace(/\./g, '').replace(',', '.')
  else if (hasComma) cleaned = s.replace(',', '.')
  else if (dots > 1) cleaned = s.replace(/\./g, '')
  else if (dots === 1) {
    // 1 titik: desimal (mis. "2362240.000") vs pemisah ribuan ("1.234").
    const after = s.split('.')[1]
    cleaned = after && after.length === 3 ? s.replace('.', '') : s
  } else cleaned = s
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

// "2026-05-13 18:32" → ISO string | null.
export function parseTimePosted(val) {
  if (val === null || val === undefined) return null
  const s = val.toString().trim()
  if (!s || s === '-' || s === 'N/A') return null
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h = '00', mi = '00'] = m
  const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi))
  return isNaN(dt.getTime()) ? null : dt.toISOString()
}

// ─── Hook auto-tag ───────────────────────────────────────────────────────────
// Heuristik keyword dari judul video (Bahasa Indonesia + slang). Urutan penting:
// yang lebih spesifik dulu. Fallback → 'lainnya'.
const HOOK_RULES = [
  ['unboxing',   ['unboxing', 'unbox', 'buka paket', 'bukapaket']],
  ['grwm',       ['grwm', 'get ready', 'getready']],
  ['komparasi',  ['komparasi', 'komparasy', ' vs ', 'vs.', 'banding', 'dupe', 'alternatif', 'mirip', 'kembaran', 'pengganti']],
  ['tutorial',   ['tutorial', 'cara pakai', 'how to', 'howto', 'tips', 'trik']],
  ['haul',       ['haul', 'borong', 'checkout']],
  ['promo',      ['promo', 'diskon', 'murah', 'flash sale', 'subsidi', 'racun murah', 'gratis', 'cuci gudang']],
  ['restock',    ['restock', 're-stock', 'stock', 'ready', 'sisa', 'limited']],
  ['review',     ['review', 'ulasan', 'worth it', 'worthit', 'jujur', 'honest', 'first impression']],
  ['rekomendasi',['rekomen', 'racun', 'wajib', 'cobain', 'must have', 'musthave', 'seenak', 'seworth']],
  ['drama',      ['drama', 'fails', 'gagal', 'story time', 'storytime', 'membalas', 'balas komen']],
  ['lifestyle',  ['daily', 'routine', 'sehari', 'aktivitas', 'ootd', 'vlog']],
]

export function deriveHook(title) {
  if (!title) return 'lainnya'
  const t = ` ${title.toString().toLowerCase()} `
  for (const [tag, kws] of HOOK_RULES) {
    if (kws.some(k => t.includes(k))) return tag
  }
  return 'lainnya'
}

// ─── Periode / snapshot dari nama file ───────────────────────────────────────
// Model SNAPSHOT HARIAN: tiap file = potret kumulatif (MTD) "sampai" tanggal
// akhir rentang. `snapshotDate` = tanggal akhir (as-of); `name` = label tanggal
// harian ("8 Jul 2026"); `periodMonth` tetap dipakai untuk mengelompokkan bulan.
// "creative data ... 2026-07-01 00 ~ 2026-07-08 12.xlsx"
//   → { startDate:'2026-07-01', endDate:'2026-07-08', snapshotDate:'2026-07-08',
//       periodMonth:'2026-07-01', name:'8 Jul 2026' }
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

// 'YYYY-MM-DD' → '8 Jul 2026'. Non-tanggal → null.
export function fmtSnapshotLabel(isoDate) {
  if (!isoDate) return null
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const [, y, mo, d] = m
  return `${+d} ${MONTHS_ID[(+mo) - 1]} ${y}`
}

export function parsePeriodFromFilename(filename) {
  const out = { startDate: null, endDate: null, snapshotDate: null, periodMonth: null, name: null }
  if (!filename) return out
  const dates = (filename.match(/\d{4}-\d{2}-\d{2}/g) || [])
  if (dates.length >= 1) {
    out.startDate = dates[0]
    out.endDate = dates[dates.length - 1]
    out.snapshotDate = out.endDate           // as-of = tanggal akhir rentang
    const [y, m] = dates[0].split('-')
    out.periodMonth = `${y}-${m}-01`
    out.name = fmtSnapshotLabel(out.snapshotDate)
  }
  return out
}

// ─── Pemetaan kolom → field ──────────────────────────────────────────────────
const COL_MAP = {
  'campaign name': 'campaignName',
  'campaign id': 'campaignId',
  'product id': 'productId',
  'creative type': 'creativeType',
  'video title': 'videoTitle',
  'video id': 'videoId',
  'tiktok account': 'tiktokAccount',
  'time posted': 'timePosted',
  'status': 'status',
  'authorization type': 'authType',
  'cost': 'cost',
  'sku orders': 'skuOrders',
  'cost per order': 'costPerOrder',
  'gross revenue': 'grossRevenue',
  'roi': 'roas',                    // kolom TikTok bernama "ROI" = ROAS (rev/cost)
  'product ad impressions': 'impressions',
  'product ad clicks': 'clicks',
  'product ad click rate': 'ctr',
  'ad conversion rate': 'cvr',
  '2-second ad video view rate': 'vr2s',
  '6-second ad video view rate': 'vr6s',
  '25% ad video view rate': 'vr25',
  '50% ad video view rate': 'vr50',
  '75% ad video view rate': 'vr75',
  '100% ad video view rate': 'vr100',
  'currency': 'currency',
}

// Field yang diparse sebagai angka Rupiah/desimal.
const NUM_FIELDS = new Set([
  'cost', 'skuOrders', 'costPerOrder', 'grossRevenue', 'roas',
  'impressions', 'clicks', 'ctr', 'cvr',
  'vr2s', 'vr6s', 'vr25', 'vr50', 'vr75', 'vr100',
])

// ─── Core ────────────────────────────────────────────────────────────────────

// aoa = array-of-arrays (baris pertama = header). filename opsional (periode).
export function parseGmvMaxRows(aoa, filename = '') {
  if (!Array.isArray(aoa) || aoa.length === 0) {
    throw new Error('File kosong atau tidak terbaca.')
  }
  // Cari baris header (memuat "Campaign name" & "Product ID").
  const headerIdx = aoa.findIndex(r =>
    Array.isArray(r) &&
    r.some(c => c?.toString().trim().toLowerCase() === 'campaign name') &&
    r.some(c => c?.toString().trim().toLowerCase() === 'product id'))
  if (headerIdx === -1) {
    throw new Error('Header GMV Max tidak ditemukan (butuh kolom "Campaign name" & "Product ID").')
  }

  const headers = aoa[headerIdx].map(h => (h ?? '').toString().trim())
  const fieldByCol = headers.map(h => COL_MAP[h.toLowerCase()] || null)

  const rows = []
  let videoCount = 0, productCardCount = 0
  let totalCost = 0, totalRevenue = 0, totalOrders = 0

  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const raw = aoa[i]
    if (!Array.isArray(raw)) continue
    const rec = {}
    fieldByCol.forEach((field, ci) => {
      if (!field) return
      rec[field] = raw[ci]
    })
    // Baris kosong (tanpa campaign & product) → lewati.
    if (!rec.campaignName && !rec.productId) continue

    const row = {
      videoId: cleanId(rec.videoId),
      campaignName: str(rec.campaignName),
      campaignId: cleanId(rec.campaignId),
      productId: cleanId(rec.productId),
      creativeType: str(rec.creativeType),
      videoTitle: str(rec.videoTitle),
      tiktokAccount: cleanAccount(rec.tiktokAccount),
      timePosted: parseTimePosted(rec.timePosted),
      status: str(rec.status),
      authType: str(rec.authType),
      currency: str(rec.currency) || 'IDR',
    }
    // Export GMV Max memakai desimal US ("2362240.000" = 2.362.240,0); titik =
    // desimal, tanpa pemisah ribuan. Karena itu parseNum, BUKAN parseIDNum.
    for (const f of NUM_FIELDS) row[f] = parseNum(rec[f])

    row.hookTag = row.creativeType === 'Video' ? deriveHook(row.videoTitle) : null
    row.hasSpend = (row.cost ?? 0) > 0

    // Simpan mentah (untuk audit / kolom yang belum dipetakan).
    row.raw = rec

    if (row.creativeType === 'Product card') productCardCount++
    else videoCount++

    totalCost += row.cost ?? 0
    totalRevenue += row.grossRevenue ?? 0
    totalOrders += row.skuOrders ?? 0

    rows.push(row)
  }

  const period = parsePeriodFromFilename(filename)
  const currency = rows.find(r => r.currency)?.currency || 'IDR'

  return {
    meta: {
      ...period,
      currency,
      filename: filename || null,
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

// ─── Pembungkus file (browser) ───────────────────────────────────────────────
export async function parseGmvMaxFile(file) {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', raw: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  return parseGmvMaxRows(aoa, file.name)
}

// ─── helper kecil ────────────────────────────────────────────────────────────
function str(v) {
  if (v === null || v === undefined) return ''
  const s = v.toString().trim()
  return s === '-' || s === 'N/A' ? '' : s
}
function cleanId(v) {
  const s = str(v)
  return s || null
}
function cleanAccount(v) {
  // '-' / kosong / 'N/A' → null (akan digrup sebagai "Akun toko / tanpa kreator").
  const s = str(v)
  return s || null
}
