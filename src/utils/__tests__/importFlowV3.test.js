import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { parseMetricValue } from '../metricSchema'
import { buildImportPreview } from '../importNormalize'
import { detectColumns } from '../metricSchema'
import { readinessLabel } from '../importPreview'
import { funnelSections } from '../quadrantScoring'

const TIKTOK = '/Users/macbook/Downloads/Products Card List_20260731164726.xlsx'
const SHOPEE = '/Users/macbook/Downloads/parentskudetail.20260501_20260531 (1)(1).xlsx'
const haveFiles = fs.existsSync(TIKTOK) && fs.existsSync(SHOPEE)

describe('parser kontekstual (metricType)', () => {
  it('count Shopee: "1.234" = 1234, bukan desimal', () => {
    expect(parseMetricValue('1.234', { metricType: 'count' }).value).toBe(1234)
  })
  it('rate: "1.234%" = 0,01234', () => {
    expect(parseMetricValue('1.234%', { metricType: 'rate' }).value).toBeCloseTo(0.01234, 6)
  })
  it('currency: "1.234.567" = 1234567', () => {
    expect(parseMetricValue('1.234.567', { metricType: 'currency' }).value).toBe(1234567)
  })
  it('id: 19 digit tetap string', () => {
    const r = parseMetricValue('1729596618844310504', { metricType: 'id' })
    expect(r.value).toBe('1729596618844310504')
    expect(typeof r.value).toBe('string')
  })
  it('tanpa tipe: tebakan ribuan diberi warning ambigu, tidak diam-diam', () => {
    const r = parseMetricValue('1.234')
    expect(r.value).toBe(1234)
    expect(r.warning).toMatch(/ambigu/)
  })
  it('rate dengan titik TIDAK dihapus titiknya', () => {
    expect(parseMetricValue('7.10', { metricType: 'rate' }).value).toBeCloseTo(7.10, 6)
  })
})

describe('import preview builder', () => {
  const headers = ['ID Produk', 'Nama produk', 'Klik Unik', 'Pembeli', 'GMV (Rp)', 'Pesanan SKU', 'GMV yang didapat dari konten (Rp)']
  const cols = detectColumns(headers, 'tiktok')
  const preview = buildImportPreview({
    marketplace: 'tiktok', fileName: 'x.xlsx', sheetName: 'Sheet1', headerRow: 2,
    headers, cols, sampleRow: ['1729596618844310504', 'Anomaly', '4252', '35', '7583175', '66', '7383260'],
    period: { periodStart: '2026-05-01', periodEnd: '2026-05-31', periodSource: 'file_content' },
    parentCount: 25, variantCount: 0,
  })

  it('mapping tampil dengan contoh nilai', () => {
    const traffic = preview.mapped.find(m => m.canonical === 'uniqueClicks')
    expect(traffic.rawHeader).toBe('Klik Unik')
    expect(traffic.example).toBe('4252')
  })
  it('GMV Konten masuk daftar tak dipakai dengan alasan resmi — bukan error', () => {
    const u = preview.unused.find(x => /konten/i.test(x.header))
    expect(u.reason).toBe('Tidak digunakan dalam analisis Traffic Conversion SellerOS.')
  })
  it('readiness: tanpa ATC users → Kuadran siap, funnel utama tidak', () => {
    expect(preview.readiness.quadrant.ready).toBe(true)
    expect(preview.readiness.funnelCore.ready).toBe(false)
    expect(preview.readiness.funnelCore.missing).toContain('atcUsers')
    expect(readinessLabel(preview.readiness).label).toBe('Siap untuk Kuadran')
  })
  it('kolom Pesanan hilang → warning, bukan invalid', () => {
    const noOrders = detectColumns(['ID Produk', 'Nama produk', 'Klik Unik', 'Pembeli', 'GMV (Rp)'], 'tiktok')
    const p = buildImportPreview({ marketplace: 'tiktok', fileName: 'x', sheetName: 's', headerRow: 0, headers: [], cols: noOrders, sampleRow: null, period: null })
    expect(p.warnings.join(' ')).toMatch(/Pesanan tidak ditemukan/)
    expect(p.readiness.quadrant.ready).toBe(true)
  })
})

describe('funnel v3: tiga bagian', () => {
  const tiktok = {
    qualifiedTraffic: 4252, atcRate: (229 / 4252) * 100, buyers: 35, orders: 66, gmv: 7583175,
    impressions: 154734, uniqueViewers: 63142, uniqueClicks: 4252,
    platforms: [{ platform: 'tiktok' }],
  }
  const shopee = {
    qualifiedTraffic: 29438, atcRate: (7824 / 29438) * 100, buyers: 1311, orders: 1453, gmv: 263095720,
    impressions: 1504228, uniqueViewers: 303594, uniqueClicks: 28791,
    platforms: [{ platform: 'shopee' }],
  }

  it('TikTok TIDAK menduplikasi Klik Unik sebagai dua tahap', () => {
    const s = funnelSections(tiktok)
    const keys = s.exposure.map(x => x.key)
    expect(keys).toEqual(['impressions', 'uniqueViewers', 'qualifiedTraffic'])
    expect(keys).not.toContain('uniqueClicks')
  })
  it('Shopee menampilkan Pengklik Unik DAN Traffic Produk (nilai berbeda)', () => {
    const s = funnelSections(shopee)
    const keys = s.exposure.map(x => x.key)
    expect(keys).toEqual(['impressions', 'uniqueViewers', 'uniqueClicks', 'qualifiedTraffic'])
  })
  it('Pesanan BUKAN tahap corong — masuk business output tanpa drop-off', () => {
    const s = funnelSections(tiktok)
    expect(s.product.map(x => x.key)).toEqual(['qualifiedTraffic', 'atcUsers', 'buyers'])
    expect(s.product.map(x => x.key)).not.toContain('orders')
    expect(s.output.orders.value).toBe(66)
    // 66 pesanan > 35 pembeli — sah, bukan anomali corong
    expect(s.output.orders.value).toBeGreaterThan(35)
    expect(s.output.ordersPerBuyer.value).toBeCloseTo(66 / 35, 6)
  })
  it('drop-off hanya dihitung di product conversion', () => {
    const s = funnelSections(shopee)
    const atc = s.product.find(x => x.key === 'atcUsers')
    expect(atc.dropCount).toBe(29438 - 7824)
    for (const e of s.exposure) expect(e.dropCount).toBeUndefined()
  })
})

describe('idempotensi natural key (simulasi lapisan data)', () => {
  // saveSession menghapus berdasarkan (workspace, platform, period_value) lalu
  // menulis ulang — di sini disimulasikan kontraknya tanpa database.
  function fakeStore() {
    const rows = []
    return {
      rows,
      save({ platform, periodValue, label, products }) {
        const i = rows.findIndex(r => r.platform === platform &&
          (periodValue ? r.periodValue === periodValue : r.label === label))
        if (i >= 0) rows.splice(i, 1)
        rows.push({ platform, periodValue, label, products })
      },
    }
  }
  it('import file sama dua kali → satu snapshot, nilai identik', () => {
    const db = fakeStore()
    const payload = { platform: 'tiktok', periodValue: '2026-05', label: 'Mei 2026 · TikTok', products: [{ id: 'A', gmv: 1 }] }
    db.save(payload); db.save(payload)
    expect(db.rows.length).toBe(1)
    expect(db.rows[0].products).toEqual([{ id: 'A', gmv: 1 }])
  })
  it('label berubah tapi periode sama → tetap satu snapshot', () => {
    const db = fakeStore()
    db.save({ platform: 'tiktok', periodValue: '2026-05', label: 'Mei', products: [1] })
    db.save({ platform: 'tiktok', periodValue: '2026-05', label: 'Mei 2026 (revisi)', products: [1, 2] })
    expect(db.rows.length).toBe(1)
    expect(db.rows[0].products.length).toBe(2)
  })
  it('platform beda → snapshot terpisah', () => {
    const db = fakeStore()
    db.save({ platform: 'tiktok', periodValue: '2026-05', products: [] })
    db.save({ platform: 'shopee', periodValue: '2026-05', products: [] })
    expect(db.rows.length).toBe(2)
  })
})

describe('legacy mapping', () => {
  it('sesi tanpa mappingVersion atau < 3 dianggap legacy', () => {
    const isLegacy = v => v == null || v < 3
    expect(isLegacy(undefined)).toBe(true)
    expect(isLegacy(2)).toBe(true)
    expect(isLegacy(3)).toBe(false)
  })
})

// Preview end-to-end terhadap file asli (dilewati kalau file tak ada).
;(haveFiles ? describe : describe.skip)('previewImportFile terhadap file asli', () => {
  it('TikTok: preview lengkap, ID string, GMV Konten unused', async () => {
    const { previewImportFile } = await import('../importPreview')
    const buf = fs.readFileSync(TIKTOK)
    const file = { name: 'Products Card List_20260731164726.xlsx', arrayBuffer: async () => buf }
    const r = await previewImportFile(file, 'tiktok')
    expect(r.preview.summary.periodStart).toBe('2026-05-01')
    expect(r.productCount).toBe(25)
    expect(r.samples[0].productId).toMatch(/^\d{19}$/)
    expect(String(r.samples[0].productId)).not.toMatch(/e\+/i)   // tanpa notasi ilmiah
    expect(r.preview.unused.some(u => /konten/i.test(u.header))).toBe(true)
    expect(r.preview.readiness.funnelFull.ready).toBe(true)
  })
  it('Shopee: satu sheet, parent/variant terpisah, periode dari nama file', async () => {
    const { previewImportFile } = await import('../importPreview')
    const buf = fs.readFileSync(SHOPEE)
    const file = { name: 'parentskudetail.20260501_20260531 (1)(1).xlsx', arrayBuffer: async () => buf }
    const r = await previewImportFile(file, 'shopee')
    expect(r.preview.summary.sheetName).toBe('Produk dengan Performa Terbaik')
    expect(r.preview.summary.parentCount).toBe(24)
    expect(r.preview.summary.variantCount).toBe(19)
    expect(r.preview.summary.periodSource).toBe('filename')
    expect(r.preview.warnings.join(' ')).toMatch(/nama file/)
    expect(r.preview.readiness.funnelFull.ready).toBe(true)
  })
})
