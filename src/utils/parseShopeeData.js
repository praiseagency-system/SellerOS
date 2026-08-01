import * as XLSX from 'xlsx'
import { detectColumns, parsePeriodFromFilename } from './metricSchema'
import { normalizeImportRow, toLegacyMetrics, parseProductId } from './importNormalize'

// Sheet sumber tunggal. Enam sheet lain di file yang sama adalah daftar
// turunan dengan kolom lebih sedikit — membacanya berisiko produk ganda atau
// data tak lengkap.
const PRIMARY_SHEET = 'Produk dengan Performa Terbaik'

// Kolom "Kode Variasi" muncul DUA KALI di file Shopee (kode variasi & SKU
// varian penjual). Kolom variasi utama dikenali dari posisinya: yang tepat
// sebelum "Nama Variasi", bukan hasil pencarian nama yang mengambil yang pertama.
function findVariationCol(headers) {
  const namaIdx = headers.findIndex(h => (h || '').toString().trim() === 'Nama Variasi')
  if (namaIdx > 0 && (headers[namaIdx - 1] || '').toString().trim() === 'Kode Variasi') return namaIdx - 1
  return headers.findIndex(h => (h || '').toString().trim() === 'Kode Variasi')
}

export function readShopeePeriod(fileName) { return parsePeriodFromFilename(fileName) }

// Handles both Indonesian (1.234,56 / 1,82%) and English (1234.56 / 3.05%) number formats
function parseIDNum(val) {
  if (val === null || val === undefined || val === '-' || val === '') return null
  const s = val.toString().replace('%', '').trim()
  if (s === '') return null

  const dotCount = (s.match(/\./g) || []).length
  const hasComma = s.includes(',')

  let cleaned
  if (hasComma && dotCount > 0) {
    // Indonesian: "1.234,56" or "64.042.187"
    cleaned = s.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    // Indonesian decimal only: "1,82"
    cleaned = s.replace(',', '.')
  } else if (dotCount > 1) {
    // Multiple dots without comma: "64.042.187" → thousands
    cleaned = s.replace(/\./g, '')
  } else {
    // English format or plain integer: "3.05", "6736"
    cleaned = s
  }

  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function findCol(headers, keyword) {
  const exact = headers.findIndex(
    h => h && h.toString().trim().toLowerCase() === keyword.toLowerCase()
  )
  if (exact !== -1) return exact
  return headers.findIndex(
    h => h && h.toString().toLowerCase().includes(keyword.toLowerCase())
  )
}

export async function parseShopeeData(file) {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  const productMap = new Map()

  // Hanya sheet utama. Kalau tak ada, jatuh ke sheet pertama yang punya kolom
  // Pengunjung Produk — tetap SATU sheet, tak pernah digabung.
  const chosenSheet = wb.SheetNames.includes(PRIMARY_SHEET) ? PRIMARY_SHEET : wb.SheetNames[0]
  for (const sheetName of [chosenSheet]) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (rows.length < 2) continue

    const headers = rows[0].map(h => (h || '').toString())

    const cols = {
      kode_produk: findCol(headers, 'Kode Produk'),
      produk: findCol(headers, 'Produk'),
      status_produk: findCol(headers, 'Status Produk'),
      kode_variasi: findVariationCol(headers),
      nama_variasi: headers.findIndex(h => (h || '').toString().trim() === 'Nama Variasi'),
      pengunjung: findCol(headers, 'Pengunjung Produk (Kunjungan)'),
      conversion: findCol(headers, 'Tingkat Konversi Pesanan (Pesanan Dibuat)'),
      atc: findCol(headers, 'Tingkat Konversi Produk Dimasukkan ke Keranjang'),
      total_penjualan: findCol(headers, 'Total Penjualan (Pesanan Dibuat)'),
      pesanan: findCol(headers, 'Pesanan Dibuat'),
      harga: findCol(headers, 'Harga Saat Ini'),
    }

    if (cols.kode_produk === -1 || cols.pengunjung === -1) continue

    // Lapisan ternormalisasi (qualified traffic, buyers, ATC users, basis GMV).
    // Berjalan berdampingan dengan kolom lama — tak ada perilaku lama yang berubah.
    const nCols = detectColumns(headers, 'shopee')
    if (nCols.unknown.length) console.info('[import shopee] kolom tak dikenali:', nCols.unknown.map(u => u.header))
    console.info('[import shopee] sheet:', sheetName, '· kolom termapping:', nCols.matched.join(', '))

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const kode = parseProductId(row[cols.kode_produk])
      if (!kode) continue

      // Skip inactive products
      if (cols.status_produk !== -1) {
        const status = row[cols.status_produk]?.toString().trim().toLowerCase()
        if (status && status !== 'normal' && status !== 'aktif') continue
      }

      // Hanya PARENT row yang dipakai untuk analisis level produk. Parent
      // sudah mewakili total; menjumlahkan varian = double counting.
      const varCode = cols.kode_variasi !== -1 ? (row[cols.kode_variasi] ?? '').toString().trim() : '-'
      const varName = cols.nama_variasi !== -1 ? (row[cols.nama_variasi] ?? '').toString().trim() : '-'
      const isParent = (varCode === '' || varCode === '-') && (varName === '' || varName === '-')
      if (!isParent) continue

      const pengunjung = parseIDNum(row[cols.pengunjung])
      const conversion = parseIDNum(row[cols.conversion])
      if (pengunjung === null || conversion === null) continue

      if (!productMap.has(kode)) {
        const n = normalizeImportRow({ row, headers, cols: nCols, marketplace: 'shopee', meta: { sourceRow: i, sourceSheet: sheetName, rowType: 'parent' } })
        productMap.set(kode, {
          kode_produk: kode,
          nama_produk: row[cols.produk]?.toString() || kode,
          pengunjung,
          conversion_rate: conversion,
          atc_rate: parseIDNum(row[cols.atc]),
          total_penjualan: parseIDNum(row[cols.total_penjualan]),
          pesanan: parseIDNum(row[cols.pesanan]),
          harga: parseIDNum(row[cols.harga]),
          roas: null,
          stok: null,
          platform: 'shopee',
          rowType: 'parent',
          normalizedMetrics: n.normalizedMetrics,
          rawMetrics: n.rawMetrics,
          nativeMetrics: n.nativeMetrics,
          metricStatus: n.metricStatus,
          mappingVersion: n.mappingVersion,
          metrics: toLegacyMetrics(n, { marketplace: 'shopee', gmvBasis: 'created_order' }),
        })
      }
    }
  }

  const results = Array.from(productMap.values())
  if (results.length === 0) {
    throw new Error(
      'Tidak ada data produk ditemukan. Pastikan file yang diupload adalah laporan Performa Produk dari Shopee Seller Center.'
    )
  }
  return results
}

export async function parseIklanData(file) {
  const buffer = await file.arrayBuffer()
  // Use raw:true so numbers are not auto-converted by XLSX
  const wb = XLSX.read(buffer, { type: 'array', raw: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Find header row (contains 'Kode Produk')
  let hi = -1
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (rows[i].some(c => c?.toString().includes('Kode Produk'))) {
      hi = i
      break
    }
  }
  if (hi === -1) throw new Error('Format file iklan tidak dikenali. Gunakan file "Data Keseluruhan Iklan" dari Shopee.')

  const headers = rows[hi].map(h => h?.toString().trim() || '')

  function findH(kw) {
    const e = headers.findIndex(h => h.toLowerCase() === kw.toLowerCase())
    return e !== -1 ? e : headers.findIndex(h => h.toLowerCase().includes(kw.toLowerCase()))
  }

  const kodeCol = findH('Kode Produk')
  const omzetCol = findH('Omzet Penjualan')
  const biayaCol = headers.findIndex(h => h.toLowerCase().trim() === 'biaya')

  // Aggregate omzet & biaya per product (handles multiple ad campaigns per product)
  const ads = new Map()
  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]
    const kode = row[kodeCol]?.toString().trim()
    if (!kode || kode === '-' || !/^\d+$/.test(kode)) continue

    const omzet = parseIDNum(row[omzetCol]) || 0
    const biaya = parseIDNum(row[biayaCol]) || 0

    if (!ads.has(kode)) ads.set(kode, { omzet: 0, biaya: 0 })
    const p = ads.get(kode)
    p.omzet += omzet
    p.biaya += biaya
  }

  // Simpan biaya & omzet iklan, bukan cuma rasionya — ROAS gabungan lintas
  // marketplace wajib dihitung dari Σomzet ÷ Σbiaya, mustahil dari rasio saja.
  const roasMap = new Map()
  for (const [kode, { omzet, biaya }] of ads) {
    roasMap.set(kode, {
      roas: biaya > 0 ? Math.round((omzet / biaya) * 100) / 100 : null,
      adSpend: biaya,
      attributedGmv: omzet,
    })
  }

  return roasMap
}
