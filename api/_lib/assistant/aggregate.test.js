import { describe, it, expect } from 'vitest'
import { summarizeQuadrant, pickProducts, summarizeStore, summarizeGmvMax, monthKeyWib } from './aggregate.js'

const prod = (name, q, pengunjung, conv, jual) => ({
  name, quadrant: String(q), traffic_value: pengunjung, conversion_value: conv,
  raw_data: { nama_produk: name, pengunjung, conversion_rate: conv, total_penjualan: jual, pesanan: 3, quadrant: q },
})

describe('summarizeQuadrant', () => {
  it('menghitung per kuadran, ambang dari settings, dan top penjualan', () => {
    const rows = [prod('A', 1, 900, 5, 5_000_000), prod('B', 3, 800, 0.5, 200_000), prod('C', 3, 700, 0.4, 100_000), { name: 'D', raw_data: null }]
    const s = summarizeQuadrant(rows, { targetHarian: 20, periodDays: 30, conversionThreshold: 2 })
    expect(s.total_produk).toBe(4)
    expect(s.tanpa_kuadran).toBe(1)
    expect(s.per_kuadran.find(k => k.kuadran === 3)).toMatchObject({ produk: 2, penjualan: 300_000 })
    expect(s.ambang).toEqual({ traffic_pengunjung: 600, konversi_pct: 2 })
    expect(s.top_penjualan[0].nama).toBe('A')
  })
})

describe('pickProducts', () => {
  it('saring kuadran + cari nama + urut + batas 30', () => {
    const rows = Array.from({ length: 40 }, (_, i) => prod(`Produk ${i}`, 3, 1000 - i, 0.5, i))
    const r = pickProducts(rows, { quadrant: 3, sortBy: 'pengunjung', limit: 100, search: 'produk' })
    expect(r.cocok).toBe(40)
    expect(r.produk.length).toBe(30)
    expect(r.produk[0].nama).toBe('Produk 0')
    expect(pickProducts(rows, { quadrant: 1 }).cocok).toBe(0)
  })
})

describe('summarizeStore', () => {
  const t = Date.parse('2026-08-10T10:00:00+07:00')
  const line = (o, r, extra = {}) => ({ o, kid: 'k', k: 'SKU', v: '', q: 1, r, t, ok: true, p: 'Baju', src: 'shopee', w: 2, b: 'buyer1', pr: 'Jawa Barat', ...extra })
  it('dedupe lintas file, saring bulan WIB, hitung gmv/pesanan/batal', () => {
    const lines = [
      line('o1', 100), line('o1', 100), // duplikat persis (file lain)
      line('o2', 50, { b: 'buyer2' }),
      line('o3', 70, { ok: false }),
      line('o4', 999, { t: Date.parse('2026-09-01T00:30:00+07:00') }), // bulan lain (WIB)
    ]
    const s = summarizeStore(lines, { month: '2026-08' })
    expect(s).toMatchObject({ gmv: 150, pesanan: 2, unit: 2, pembeli: 2, aov: 75, pesanan_batal: 1 })
    expect(s.top_produk[0]).toEqual({ produk: 'Baju', gmv: 150, unit: 2, pesanan: 2 })
    expect(s.per_marketplace[0].marketplace).toBe('shopee')
  })
  it('monthKeyWib memakai hari kalender WIB', () => {
    expect(monthKeyWib(Date.parse('2026-08-31T23:30:00+07:00'))).toBe('2026-08')
    expect(monthKeyWib(Date.parse('2026-09-01T00:30:00+07:00'))).toBe('2026-09')
  })
})

describe('summarizeGmvMax', () => {
  const fact = (metric, value) => ({ metric, value, scope_type: 'STORE' })
  it('ambil versi terbaru per hari, jumlahkan, null bukan nol', () => {
    const rows = [
      { store_id: 's', fact_date: '2026-09-10', generated_at: '2026-09-10T01:00:00Z', facts: [fact('cost', 100), fact('gross_revenue', 300)], comparisons: [] },
      { store_id: 's', fact_date: '2026-09-10', generated_at: '2026-09-10T05:00:00Z', facts: [fact('cost', 120), fact('gross_revenue', 360), fact('orders', null)], comparisons: [{ metric: 'cmp.trailing7_avg.roi.pct', value: -12 }] },
      { store_id: 's', fact_date: '2026-09-09', generated_at: '2026-09-09T05:00:00Z', facts: [fact('cost', 80), fact('gross_revenue', 160)], comparisons: [] },
    ]
    const s = summarizeGmvMax(rows, { days: 7 })
    expect(s.hari).toBe(2)
    expect(s.total).toEqual({ belanja: 200, gmv: 520, pesanan: 0, roas: 2.6 })
    expect(s.hari_terakhir.orders).toBeNull()
    expect(s.vs_rata7hari_pct).toEqual({ 'roi.pct': -12 })
  })
})
