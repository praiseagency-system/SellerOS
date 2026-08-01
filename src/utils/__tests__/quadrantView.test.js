import { describe, it, expect } from 'vitest'
import { buildRangeView, previousRange, periodCoverage, legacyToMetrics } from '../quadrantAggregate'
import { computeBenchmark, quadrantOf, median, benchmarkPool } from '../quadrantBenchmark'
import { detectColumns } from '../metricSchema'

const DEF = {
  shopee: { periodDays: 30, targetHarian: 20, conversionThreshold: 2.0 },
  tiktok: { periodDays: 30, targetHarian: 15, conversionThreshold: 1.0 },
}

// Produk snapshot bergaya BARU (punya `metrics`).
const P = (kode, nama, platform, m, extra = {}) => ({
  kode_produk: kode, nama_produk: nama, platform,
  pengunjung: m.qualifiedTraffic, conversion_rate: null, atc_rate: null,
  total_penjualan: m.gmv ?? null, pesanan: m.orders ?? null, roas: null,
  metrics: {
    qualifiedTraffic: null, trafficSource: 'unique_clicks', visits: null, impressions: null,
    productClicks: null, atcUsers: null, atcQuantity: null, atcRateReported: null, atcSource: null,
    buyers: null, buyerSource: 'buyers', orders: null, quantitySold: null,
    gmv: null, gmvBasis: platform === 'shopee' ? 'created' : 'paid',
    attributedGmv: null, adSpend: null, ctrReported: null, conversionRateReported: null,
    price: null, warnings: [], ...m,
  },
  ...extra,
})

const sess = (id, platform, ym, products) => ({
  id, label: ym, platform, periodValue: ym, settings: DEF[platform], products,
})

describe('mode Semua benar-benar menggabungkan cacah dua marketplace', () => {
  const sessions = [
    sess('s1', 'shopee', '2026-05', [
      P('S1', 'Moscow Ice 50 ML', 'shopee', { qualifiedTraffic: 28791, buyers: 1310, atcUsers: 6200, gmv: 263_100_000, orders: 1310 }),
    ]),
    sess('t1', 'tiktok', '2026-05', [
      P('T1', 'Moscow Ice 50 ML', 'tiktok', { qualifiedTraffic: 21378, buyers: 353, atcUsers: 3180, gmv: 83_140_000, orders: 353 }),
    ]),
  ]

  it('traffic, buyer, ATC, dan GMV semuanya dari dua marketplace', () => {
    const view = buildRangeView(sessions, { mode: 'month', month: '2026-05' }, ['shopee', 'tiktok'], DEF)
    expect(view.products).toHaveLength(1)
    const p = view.products[0]
    expect(p.merged).toBe(true)
    expect(p.qualifiedTraffic).toBe(50169)          // 28.791 + 21.378
    expect(p.buyers).toBe(1663)
    expect(p.gmv).toBe(346_240_000)
    expect(p.conversionRate).toBeCloseTo((1663 / 50169) * 100, 6)
    expect(p.atcRate).toBeCloseTo((9380 / 50169) * 100, 6)
    // Inti bug lama: traffic TIDAK boleh sama dengan salah satu platform saja.
    expect(p.qualifiedTraffic).not.toBe(28791)
    expect(p.qualifiedTraffic).not.toBe(21378)
  })

  it('breakdown per marketplace tersedia', () => {
    const view = buildRangeView(sessions, { mode: 'month', month: '2026-05' }, ['shopee', 'tiktok'], DEF)
    const bd = view.products[0].breakdown
    expect(bd.map(b => b.platform).sort()).toEqual(['shopee', 'tiktok'])
    expect(bd.find(b => b.platform === 'shopee').conversionRate).toBeCloseTo(4.5501, 3)
    expect(bd.find(b => b.platform === 'tiktok').conversionRate).toBeCloseTo(1.6512, 3)
  })

  it('basis GMV berbeda ditandai tidak sebanding penuh', () => {
    const view = buildRangeView(sessions, { mode: 'month', month: '2026-05' }, ['shopee', 'tiktok'], DEF)
    expect(view.products[0].isGmvComparable).toBe(false)
    expect(view.products[0].gmvBases.sort()).toEqual(['created', 'paid'])
  })
})

describe('filter marketplace tak bocor', () => {
  const sessions = [
    sess('s1', 'shopee', '2026-05', [P('S1', 'Moscow Ice 50 ML', 'shopee', { qualifiedTraffic: 28791, buyers: 1310, gmv: 263_100_000 })]),
    sess('t1', 'tiktok', '2026-05', [P('T1', 'Moscow Ice 50 ML', 'tiktok', { qualifiedTraffic: 21378, buyers: 353, gmv: 83_140_000 })]),
  ]
  it('mode Shopee hanya memakai angka Shopee', () => {
    const v = buildRangeView(sessions, { mode: 'month', month: '2026-05' }, ['shopee'], DEF)
    expect(v.products).toHaveLength(1)
    expect(v.products[0].qualifiedTraffic).toBe(28791)
    expect(v.products[0].gmv).toBe(263_100_000)
    expect(v.platforms).toEqual(['shopee'])
  })
  it('mode TikTok hanya memakai angka TikTok', () => {
    const v = buildRangeView(sessions, { mode: 'month', month: '2026-05' }, ['tiktok'], DEF)
    expect(v.products[0].qualifiedTraffic).toBe(21378)
    expect(v.products[0].gmv).toBe(83_140_000)
  })
})

describe('produk yang hanya ada di satu marketplace', () => {
  const sessions = [
    sess('s1', 'shopee', '2026-05', [P('S1', 'Hanya Shopee 50 ML', 'shopee', { qualifiedTraffic: 100, buyers: 5, gmv: 1e6 })]),
    sess('t1', 'tiktok', '2026-05', [P('T1', 'Hanya TikTok 75 ML', 'tiktok', { qualifiedTraffic: 200, buyers: 4, gmv: 2e6 })]),
  ]
  it('tetap tampil, tanpa status digabung', () => {
    const v = buildRangeView(sessions, { mode: 'month', month: '2026-05' }, ['shopee', 'tiktok'], DEF)
    expect(v.products).toHaveLength(2)
    expect(v.products.every(p => p.merged === false)).toBe(true)
    expect(v.matched).toBe(0)
    expect(v.single).toBe(2)
  })
})

describe('benchmark', () => {
  const rows = [
    { qualifiedTraffic: 100, conversionRate: 1 },
    { qualifiedTraffic: 300, conversionRate: 3 },
    { qualifiedTraffic: 500, conversionRate: 5 },
    { qualifiedTraffic: 0, conversionRate: null },      // tak boleh ikut
    { qualifiedTraffic: null, conversionRate: 9 },      // tak boleh ikut
    { qualifiedTraffic: 900, conversionRate: null },    // tak boleh ikut
  ]
  it('median mengabaikan traffic null/0 dan konversi null', () => {
    expect(benchmarkPool(rows)).toHaveLength(3)
    const b = computeBenchmark(rows)
    expect(b.trafficThreshold).toBe(300)
    expect(b.conversionThreshold).toBe(3)
    expect(b.source).toBe('auto_median')
  })
  it('median bukan rata-rata (tahan outlier)', () => {
    expect(median([1, 2, 3, 1000])).toBe(2.5)
  })
  it('manual menang atas otomatis', () => {
    const b = computeBenchmark(rows, { trafficThreshold: 1000, conversionThreshold: 2 })
    expect(b.source).toBe('manual')
    expect(b.trafficThreshold).toBe(1000)
  })
})

describe('penempatan kuadran', () => {
  const th = { trafficThreshold: 1000, conversionThreshold: 2 }
  it('nilai persis di ambang dihitung sebagai high (deterministik)', () => {
    expect(quadrantOf(1000, 2, th)).toBe(1)
    expect(quadrantOf(999.9, 2, th)).toBe(2)
    expect(quadrantOf(1000, 1.999, th)).toBe(3)
    expect(quadrantOf(10, 0.5, th)).toBe(4)
  })
  it('memakai nilai mentah, bukan yang sudah dibulatkan', () => {
    // 1,994% dibulatkan tampilan jadi "1,99%" — dengan pembulatan ke 2,0 akan
    // salah masuk high conversion.
    expect(quadrantOf(2000, 1.994, th)).toBe(3)
    expect(quadrantOf(2000, Number((1.994).toFixed(1)))).toBeNull()
  })
  it('data tak lengkap → tak dipaksa masuk kuadran', () => {
    expect(quadrantOf(null, 3, th)).toBeNull()
    expect(quadrantOf(100, null, th)).toBeNull()
  })
})

describe('periode', () => {
  const sessions = [
    sess('s1', 'shopee', '2026-04', [P('S1', 'A 50 ML', 'shopee', { qualifiedTraffic: 10, buyers: 1, gmv: 1 })]),
    sess('s2', 'shopee', '2026-05', [P('S1', 'A 50 ML', 'shopee', { qualifiedTraffic: 20, buyers: 3, gmv: 2 })]),
    sess('t2', 'tiktok', '2026-05', [P('T1', 'A 50 ML', 'tiktok', { qualifiedTraffic: 30, buyers: 2, gmv: 3 })]),
  ]
  it('hanya periode yang diminta yang digabung', () => {
    const v = buildRangeView(sessions, { mode: 'month', month: '2026-05' }, ['shopee'], DEF)
    expect(v.products[0].qualifiedTraffic).toBe(20)
  })
  it('lifetime menjumlahkan seluruh periode', () => {
    const v = buildRangeView(sessions, { mode: 'lifetime' }, ['shopee'], DEF)
    expect(v.products[0].qualifiedTraffic).toBe(30)   // 10 + 20
    expect(v.products[0].buyers).toBe(4)
  })
  it('cakupan periode timpang antar marketplace terdeteksi', () => {
    const cov = periodCoverage(sessions, { mode: 'lifetime' }, ['shopee', 'tiktok'])
    expect(cov.isAligned).toBe(false)
    expect(cov.partial).toContain('tiktok')
  })
  it('rentang pembanding setara', () => {
    expect(previousRange({ mode: 'month', month: '2026-06' })).toEqual({ mode: 'month', month: '2026-05' })
    expect(previousRange({ mode: 'custom', from: '2026-05', to: '2026-06' })).toEqual({ mode: 'custom', from: '2026-03', to: '2026-04' })
    expect(previousRange({ mode: 'lifetime' })).toBeNull()
  })
})

describe('kompatibilitas snapshot lama', () => {
  it('snapshot tanpa metrics tetap terbaca dan fallback-nya ditandai', () => {
    const old = { kode_produk: 'S1', nama_produk: 'Lama 50 ML', pengunjung: 5000, conversion_rate: 2, atc_rate: 8, total_penjualan: 9e6, pesanan: 100 }
    const m = legacyToMetrics(old, 'shopee')
    expect(m.qualifiedTraffic).toBe(5000)
    expect(m.trafficSource).toBe('visits_fallback')
    expect(m.buyerSource).toBe('order_fallback')
    expect(m.warnings).toContain('legacy_snapshot')

    const v = buildRangeView([sess('s1', 'shopee', '2026-05', [old])], { mode: 'month', month: '2026-05' }, ['shopee'], DEF)
    expect(v.products[0].qualifiedTraffic).toBe(5000)
    expect(v.products[0].gmv).toBe(9e6)
  })
})

describe('import: pemetaan kolom & idempotensi', () => {
  it('alias kolom dikenali di beberapa variasi nama', () => {
    const a = detectColumns(['Kode Produk', 'Pengunjung Produk (Kunjungan)', 'Total Pembeli (Pesanan Dibuat)', 'Total Penjualan (Pesanan Dibuat) (IDR)'], 'shopee')
    expect(a.map.qualifiedTraffic).toBeTruthy()
    expect(a.map.buyers).toBeTruthy()
    expect(a.map.gmv.header).toBe('Total Penjualan (Pesanan Dibuat) (IDR)')

    const b = detectColumns(['ID Produk', 'Klik Unik', 'Pembeli', 'GMV (Rp)', 'Pesanan SKU'], 'tiktok')
    expect(b.map.uniqueClicks).toBeTruthy()
    expect(b.map.gmv.header).toBe('GMV (Rp)')
    expect(b.map.orders.header).toBe('Pesanan SKU')
  })

  it('kolom tak dikenali dilaporkan, bukan didiamkan', () => {
    const cols = detectColumns(['Kode Produk', 'Kolom Aneh Yang Baru'], 'shopee')
    expect(cols.unknown.map(u => u.header)).toContain('Kolom Aneh Yang Baru')
  })

  it('import ulang periode sama tak menggandakan produk', () => {
    // saveSession menghapus periode berlabel sama sebelum menulis ulang, jadi
    // di lapisan tampilan dua sesi dengan periodValue sama tak akan muncul
    // bersamaan. Yang diuji di sini: satu produk tetap satu baris.
    const s = sess('s1', 'shopee', '2026-05', [P('S1', 'A 50 ML', 'shopee', { qualifiedTraffic: 100, buyers: 5, gmv: 1e6 })])
    const v = buildRangeView([s], { mode: 'month', month: '2026-05' }, ['shopee'], DEF)
    expect(v.products).toHaveLength(1)
    expect(v.products[0].qualifiedTraffic).toBe(100)
  })
})
