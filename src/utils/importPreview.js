// Pembaca file untuk Import Preview — parse TANPA menyimpan apa pun.
// Menghasilkan data yang dirender ImportPreviewModal; penyimpanan baru terjadi
// setelah user menekan Konfirmasi Import.
import * as XLSX from 'xlsx'
import {
  detectColumns, parseProductId, parsePeriodFromContent,
  parsePeriodFromFilename, METRIC_MAPPING_VERSION,
} from './metricSchema'
import { normalizeImportRow, buildImportPreview } from './importNormalize'

const SHOPEE_PRIMARY_SHEET = 'Produk dengan Performa Terbaik'

function findHeaderRow(rows, markers) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const norm = rows[i].map(c => (c ?? '').toString().trim().toLowerCase())
    if (markers.every(m => norm.includes(m))) return i
  }
  return -1
}

// Baca satu file dan hasilkan preview lengkap. Tidak menulis apa pun.
export async function previewImportFile(file, platform) {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', raw: false, cellText: true })

  if (platform === 'tiktok') {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false })
    const hi = findHeaderRow(rows, ['id produk', 'nama produk'])
    if (hi < 0) throw new Error('Header TikTok tidak ditemukan (butuh kolom "ID Produk" dan "Nama produk").')
    const headers = rows[hi].map(h => (h ?? '').toString())
    const cols = detectColumns(headers, 'tiktok')
    const period = parsePeriodFromContent(rows)
    const dataRows = rows.slice(hi + 1).filter(r => parseProductId(r[0]))

    const samples = dataRows.slice(0, 3).map(r =>
      sampleOf(normalizeImportRow({ row: r, headers, cols, marketplace: 'tiktok' }), parseProductId(r[0]), r[1]))

    return {
      platform: 'tiktok',
      preview: buildImportPreview({
        marketplace: 'tiktok', fileName: file.name, sheetName: wb.SheetNames[0], headerRow: hi,
        headers, cols, sampleRow: dataRows[0], period,
        parentCount: dataRows.length, variantCount: 0,
      }),
      samples,
      period,
      productCount: dataRows.length,
    }
  }

  // Shopee — hanya sheet utama; parent = kedua kolom variasi bernilai "-".
  const sheetName = wb.SheetNames.includes(SHOPEE_PRIMARY_SHEET) ? SHOPEE_PRIMARY_SHEET : wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false })
  if (rows.length < 2) throw new Error(`Sheet "${sheetName}" kosong.`)
  const headers = rows[0].map(h => (h ?? '').toString())
  const cols = detectColumns(headers, 'shopee')
  const period = parsePeriodFromFilename(file.name)

  const namaIdx = headers.findIndex(h => h.trim() === 'Nama Variasi')
  const varIdx = namaIdx > 0 && headers[namaIdx - 1].trim() === 'Kode Variasi'
    ? namaIdx - 1
    : headers.findIndex(h => h.trim() === 'Kode Variasi')
  const isParent = r => {
    const vc = varIdx >= 0 ? String(r[varIdx] ?? '').trim() : '-'
    const vn = namaIdx >= 0 ? String(r[namaIdx] ?? '').trim() : '-'
    return (vc === '' || vc === '-') && (vn === '' || vn === '-')
  }
  const data = rows.slice(1).filter(r => parseProductId(r[0]))
  const parents = data.filter(isParent)
  const variants = data.filter(r => !isParent(r))

  const samples = parents.slice(0, 3).map(r =>
    sampleOf(normalizeImportRow({ row: r, headers, cols, marketplace: 'shopee' }), parseProductId(r[0]), r[1]))

  return {
    platform: 'shopee',
    preview: buildImportPreview({
      marketplace: 'shopee', fileName: file.name, sheetName, headerRow: 0,
      headers, cols, sampleRow: parents[0], period,
      parentCount: parents.length, variantCount: variants.length,
    }),
    samples,
    period,
    productCount: parents.length,
  }
}

function sampleOf(n, id, name) {
  const m = n.normalizedMetrics
  return {
    productId: id,                              // string — tak pernah lewat Number
    name: (name ?? '').toString(),
    qualifiedTraffic: m.qualifiedTraffic,
    atcUsers: m.atcUsers,
    buyers: m.buyers,
    orders: m.orders,
    gmv: m.gmv,
    conversionRate: m.conversionRate,           // pecahan
    warnings: n.warnings,
  }
}

export function readinessLabel(readiness) {
  if (readiness.funnelFull.ready) return { label: 'Siap untuk Funnel Lengkap', cls: 'bg-green-500/12 text-green-300' }
  if (readiness.funnelCore.ready) return { label: 'Siap untuk Funnel Utama', cls: 'bg-green-500/12 text-green-300' }
  if (readiness.quadrant.ready) return { label: 'Siap untuk Kuadran', cls: 'bg-blue-600/15 text-blue-300' }
  return readiness.quadrant.missing.length < 3
    ? { label: 'Data Parsial', cls: 'bg-amber-500/12 text-amber-300' }
    : { label: 'Tidak Dapat Diimpor', cls: 'bg-red-500/12 text-red-300' }
}

export { METRIC_MAPPING_VERSION }
