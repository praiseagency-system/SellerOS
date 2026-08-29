import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import * as XLSX from 'xlsx'
import {
  detectColumns, parseMetricValue, parseProductId, parsePeriodFromContent,
  parsePeriodFromFilename, canonicalRates, ratio, METRIC_MAPPING_VERSION, METRIC_STATUS,
} from '../metricSchema'
import { normalizeImportRow, toLegacyMetrics } from '../importNormalize'
import { blendMembers } from '../blendMetrics'

// Fixture = file export ASLI yang sudah diaudit & disetujui.
// Tes dilewati (bukan gagal) kalau file tak ada di mesin lain.
const TIKTOK = '/Users/macbook/Downloads/Products Card List_20260731164726.xlsx'
const SHOPEE = '/Users/macbook/Downloads/parentskudetail.20260501_20260531 (1)(1).xlsx'
const have = p => { try { return fs.existsSync(p) } catch { return false } }
const sheet = (p, name) => {
  const wb = XLSX.read(fs.readFileSync(p), { type: 'buffer', raw: false, cellText: true })
  return XLSX.utils.sheet_to_json(wb.Sheets[name || wb.SheetNames[0]], { header: 1, defval: '', raw: false })
}
// describe.skip TETAP menjalankan callback-nya untuk mengumpulkan daftar test,
// dan callback di bawah membaca file pada baris pertamanya — jadi "skip" saja
// tak cukup: di mesin tanpa fixture, pembacaan tetap terjadi dan melempar
// ENOENT. Callback-nya harus benar-benar tak dipanggil.
const run = have(TIKTOK) && have(SHOPEE)
  ? describe
  : (nama) => describe.skip(nama, () => { it('dilewati — fixture lokal tak ada di mesin ini', () => {}) })

// Cari baris header lewat keberadaan kolom penanda — bukan indeks tetap.
function findHeaderRow(rows, markers) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const norm = rows[i].map(c => (c ?? '').toString().trim().toLowerCase())
    if (markers.every(m => norm.includes(m))) return i
  }
  return -1
}

run('parsing file TikTok asli', () => {
  const rows = sheet(TIKTOK)
  const hi = findHeaderRow(rows, ['id produk', 'nama produk'])
  const headers = rows[hi]
  const cols = detectColumns(headers, 'tiktok')
  const rowOf = name => rows.slice(hi + 1).find(r => String(r[1]).includes(name))

  it('header ditemukan lewat kolom penanda, bukan indeks tetap', () => {
    expect(hi).toBe(2)
    expect(headers).toContain('Klik Unik')
  })

  it('periode dibaca dari isi file dan newline-nya di-trim', () => {
    const p = parsePeriodFromContent(rows)
    expect(p).toEqual({ periodStart: '2026-05-01', periodEnd: '2026-05-31', periodSource: 'file_content' })
    expect(p.periodEnd).not.toMatch(/\s/)
  })

  it('Product ID tetap string persis — presisi 19 digit tak hilang', () => {
    const raw = rowOf('Anomaly')[0]
    const id = parseProductId(raw)
    expect(id).toBe('1729596618844310504')
    expect(typeof id).toBe('string')
    // Bukti kenapa Number dilarang:
    expect(String(Number(id))).not.toBe(id)
    for (const n of ['Moscow Ice', 'Vanilla Althajir', '911 Rebel']) {
      const s = parseProductId(rowOf(n)[0])
      expect(s).toBe(rowOf(n)[0].toString().trim())
      expect(s).toMatch(/^\d{19}$/)
    }
  })

  it('seluruh kolom canonical terpetakan — termasuk ATC users & klik', () => {
    for (const k of ['impressions', 'uniqueViewers', 'clicks', 'uniqueClicks', 'atcUsers', 'buyers', 'orders', 'gmv']) {
      expect(cols.map[k], `kolom ${k} tak terpetakan`).toBeTruthy()
    }
    expect(cols.map.atcUsers.header).toBe('Pengguna yang Menambahkan Produk ke Keranjang')
    expect(cols.map.clicks.header).toBe('Klik')
    expect(cols.map.uniqueClicks.header).toBe('Klik Unik')
    expect(cols.map.orders.header).toBe('Pesanan SKU')
    expect(cols.map.gmv.header).toBe('GMV (Rp)')
  })

  it('GMV Konten tidak pernah terpetakan ke canonical gmv, dan ditandai tak dipakai', () => {
    expect(cols.map.gmv.header).not.toMatch(/konten/i)
    expect(cols.unused.map(u => u.header)).toContain('GMV yang didapat dari konten (Rp)')
    expect(cols.unused.find(u => /konten/i.test(u.header)).reason)
      .toBe('Tidak digunakan dalam analisis Traffic Conversion SellerOS.')
  })

  it('SANITY — Anomaly tidak lagi null', () => {
    const n = normalizeImportRow({ row: rowOf('Anomaly'), headers, cols, marketplace: 'tiktok' })
    const m = n.normalizedMetrics
    expect(m.impressions).toBe(154734)
    expect(m.uniqueViewers).toBe(63142)
    expect(m.clicks).toBe(6263)
    expect(m.uniqueClicks).toBe(4252)
    expect(m.qualifiedTraffic).toBe(4252)
    expect(m.atcUsers).toBe(229)
    expect(m.buyers).toBe(35)
    expect(m.orders).toBe(66)
    expect(m.gmv).toBe(7583175)

    expect(m.uniqueCtr).toBeCloseTo(4252 / 63142, 6)        // ≈6,73%
    expect(m.atcRate).toBeCloseTo(229 / 4252, 6)            // ≈5,39%
    expect(m.conversionRate).toBeCloseTo(35 / 4252, 6)      // ≈0,82%
    expect(m.checkoutRate).toBeCloseTo(35 / 229, 6)         // ≈15,28%
    expect(m.orderRate).toBeCloseTo(66 / 4252, 6)           // ≈1,55%
    expect(m.ordersPerBuyer).toBeCloseTo(66 / 35, 6)        // ≈1,89

    // GMV Konten tak boleh bocor ke normalized
    expect(Object.keys(m)).not.toContain('contentGmv')
    expect(Object.values(m)).not.toContain(7383260)
    // tapi tetap ada di raw untuk audit
    expect(n.rawMetrics['GMV yang didapat dari konten (Rp)']).toBe('7383260')

    expect(n.metricStatus.impressions.status).toBe(METRIC_STATUS.OBSERVED)
    expect(n.metricStatus.conversionRate.status).toBe(METRIC_STATUS.CALCULATED)
    expect(n.metricStatus.conversionRate.calculationMethod).toBe('buyers_divided_by_qualified_traffic')
    expect(n.mappingVersion).toBe(METRIC_MAPPING_VERSION)
  })

  it('impresi mentah menang atas estimasi', () => {
    const n = normalizeImportRow({ row: rowOf('Moscow Ice'), headers, cols, marketplace: 'tiktok' })
    expect(n.normalizedMetrics.impressions).toBe(632194)
    expect(n.estimatedImpressions).toBeNull()
    expect(n.metricStatus.impressions.status).toBe(METRIC_STATUS.OBSERVED)
  })

  it('rate bawaan file disimpan terpisah sebagai pembanding', () => {
    const n = normalizeImportRow({ row: rowOf('Moscow Ice'), headers, cols, marketplace: 'tiktok' })
    // native "Tingkat Klik hingga Pembayaran" = 1,65% ≈ buyers/klik unik
    expect(n.nativeMetrics.nativeClickToPay.value).toBeCloseTo(0.0165, 4)
    expect(n.normalizedMetrics.conversionRate).toBeCloseTo(353 / 21378, 6)
  })
})

run('parsing file Shopee asli', () => {
  const SHEET = 'Produk dengan Performa Terbaik'
  const rows = sheet(SHOPEE, SHEET)
  const headers = rows[0]
  const cols = detectColumns(headers, 'shopee')
  const namaIdx = headers.findIndex(h => String(h).trim() === 'Nama Variasi')
  const varIdx = namaIdx - 1
  const parentOf = name => rows.slice(1).find(r =>
    String(r[1]).includes(name) && String(r[varIdx]).trim() === '-' && String(r[namaIdx]).trim() === '-')

  it('periode dibaca dari nama file + warning', () => {
    const p = parsePeriodFromFilename('parentskudetail.20260501_20260531 (1)(1).xlsx')
    expect(p.periodStart).toBe('2026-05-01')
    expect(p.periodEnd).toBe('2026-05-31')
    expect(p.periodSource).toBe('filename')
    expect(p.warning).toMatch(/nama file/i)
  })

  it('dua kolom "Kode Variasi" tidak menyebabkan salah kolom', () => {
    const all = headers.map((h, i) => [h, i]).filter(([h]) => String(h).trim() === 'Kode Variasi')
    expect(all.length).toBe(2)                    // memang duplikat di file asli
    expect(varIdx).toBe(all[0][1])                // yang dipakai = tepat sebelum "Nama Variasi"
  })

  it('parent dan variant dipisah, tak ada double counting', () => {
    const parents = rows.slice(1).filter(r => String(r[varIdx]).trim() === '-' && String(r[namaIdx]).trim() === '-')
    const variants = rows.slice(1).filter(r => !(String(r[varIdx]).trim() === '-' && String(r[namaIdx]).trim() === '-'))
    expect(parents.length).toBe(24)
    expect(variants.length).toBe(19)
    // GMV parent Moscow Ice sudah total — sama dengan jumlah variannya.
    const p = parentOf('Moscow Ice')
    const gmvCol = cols.map.gmv.index
    const kids = variants.filter(v => v[0] === p[0])
    const sumKids = kids.reduce((s, v) => s + (parseMetricValue(v[gmvCol]).value ?? 0), 0)
    expect(parseMetricValue(p[gmvCol]).value).toBe(sumKids)
  })

  it('SANITY — Moscow Ice', () => {
    const n = normalizeImportRow({ row: parentOf('Moscow Ice'), headers, cols, marketplace: 'shopee' })
    const m = n.normalizedMetrics
    expect(m.impressions).toBe(1504228)
    expect(m.uniqueViewers).toBe(303594)
    expect(m.clicks).toBe(68862)
    expect(m.uniqueClicks).toBe(28791)
    expect(m.qualifiedTraffic).toBe(29438)
    expect(m.atcUsers).toBe(7824)
    expect(m.buyers).toBe(1311)
    expect(m.orders).toBe(1453)
    expect(m.gmv).toBe(263095720)

    expect(m.uniqueCtr).toBeCloseTo(28791 / 303594, 6)      // ≈9,48%
    expect(m.atcRate).toBeCloseTo(7824 / 29438, 6)          // ≈26,58%
    expect(m.conversionRate).toBeCloseTo(1311 / 29438, 6)   // ≈4,45%
    expect(m.checkoutRate).toBeCloseTo(1311 / 7824, 6)      // ≈16,76%
    expect(m.orderRate).toBeCloseTo(1453 / 29438, 6)        // ≈4,94%
    expect(m.ordersPerBuyer).toBeCloseTo(1453 / 1311, 6)    // ≈1,11
  })

  it('conversion TIDAK memakai rate bawaan berbasis klik', () => {
    const n = normalizeImportRow({ row: parentOf('Moscow Ice'), headers, cols, marketplace: 'shopee' })
    // native "Tingkat Konversi Pesanan (Pesanan Dibuat)" = 2,11% (pesanan ÷ klik)
    expect(n.nativeMetrics.nativeOrderConvRate.value).toBeCloseTo(0.0211, 4)
    expect(n.normalizedMetrics.conversionRate).toBeCloseTo(0.0445, 4)
    // native berbasis pembeli justru cocok dengan canonical
    expect(n.nativeMetrics.nativeBuyerConvRate.value).toBeCloseTo(n.normalizedMetrics.conversionRate, 3)
  })
})

run('SANITY — mode Semua untuk Anomaly', () => {
  it('cacah dijumlah, rate ditimbang, pesanan boleh dijumlah', () => {
    const tRows = sheet(TIKTOK)
    const tHi = findHeaderRow(tRows, ['id produk', 'nama produk'])
    const tCols = detectColumns(tRows[tHi], 'tiktok')
    const tRow = tRows.slice(tHi + 1).find(r => String(r[1]).includes('Anomaly'))
    const tN = normalizeImportRow({ row: tRow, headers: tRows[tHi], cols: tCols, marketplace: 'tiktok' })

    const sRows = sheet(SHOPEE, 'Produk dengan Performa Terbaik')
    const sCols = detectColumns(sRows[0], 'shopee')
    const namaIdx = sRows[0].findIndex(h => String(h).trim() === 'Nama Variasi')
    const sRow = sRows.slice(1).find(r => String(r[1]).includes('Anomaly') && String(r[namaIdx - 1]).trim() === '-')
    const sN = normalizeImportRow({ row: sRow, headers: sRows[0], cols: sCols, marketplace: 'shopee' })

    expect(sN.normalizedMetrics.qualifiedTraffic).toBe(2878)
    expect(tN.normalizedMetrics.qualifiedTraffic).toBe(4252)

    const b = blendMembers([
      { platform: 'shopee', metrics: toLegacyMetrics(sN, { marketplace: 'shopee', gmvBasis: 'created_order' }) },
      { platform: 'tiktok', metrics: toLegacyMetrics(tN, { marketplace: 'tiktok', gmvBasis: 'paid_order' }) },
    ])

    expect(b.qualifiedTraffic).toBe(7130)      // 2.878 + 4.252
    expect(b.atcUsers).toBe(702)               // 473 + 229
    expect(b.buyers).toBe(135)                 // 100 + 35
    expect(b.orders).toBe(173)                 // 107 + 66 — boleh dijumlah
    expect(b.gmv).toBe(21794952)               // 14.211.777 + 7.583.175

    expect(b.conversionRate).toBeCloseTo((135 / 7130) * 100, 6)   // ≈1,89%
    expect(b.atcRate).toBeCloseTo((702 / 7130) * 100, 6)          // ≈9,85%
    expect(b.ordersPerBuyer).toBeCloseTo(173 / 135, 6)            // ≈1,28
    expect(b.marketplaceCoverage).toBe('shopee_and_tiktok')

    // Konversi memakai PEMBELI, bukan pesanan.
    expect(b.conversionRate).not.toBeCloseTo((173 / 7130) * 100, 4)
    // GMV Konten TikTok (7.383.260) tak ikut dijumlah.
    expect(b.gmv).not.toBe(21794952 + 7383260)
    // Tak ada lagi peringatan pesanan tak sebanding.
    expect(b.flags.join(' ')).not.toMatch(/order.*incompatible/i)
  })
})

describe('parsing nilai & rate (tanpa file)', () => {
  it('format Indonesia & TikTok', () => {
    expect(parseMetricValue('263.095.720').value).toBe(263095720)
    expect(parseMetricValue('4,58%').value).toBeCloseTo(0.0458, 6)
    expect(parseMetricValue('7.10%').value).toBeCloseTo(0.071, 6)
    expect(parseMetricValue('83139458').value).toBe(83139458)
  })
  it('null vs nol dibedakan tegas', () => {
    expect(parseMetricValue('-').value).toBeNull()
    expect(parseMetricValue('—').value).toBeNull()
    expect(parseMetricValue('').value).toBeNull()
    expect(parseMetricValue(null).value).toBeNull()
    expect(parseMetricValue(undefined).value).toBeNull()
    expect(parseMetricValue('0').value).toBe(0)
    expect(parseMetricValue(0).value).toBe(0)
  })
  it('penyebut null/0 menghasilkan null, bukan 0%', () => {
    expect(ratio(5, 0)).toBeNull()
    expect(ratio(5, null)).toBeNull()
    expect(ratio(null, 100)).toBeNull()
    expect(ratio(0, 100)).toBe(0)
    const r = canonicalRates({ buyers: 10, qualifiedTraffic: 0, atcUsers: null, uniqueClicks: 5, uniqueViewers: null, orders: 3 })
    expect(r.conversionRate).toBeNull()
    expect(r.uniqueCtr).toBeNull()
    expect(r.ordersPerBuyer).toBeCloseTo(0.3, 6)
  })
})
