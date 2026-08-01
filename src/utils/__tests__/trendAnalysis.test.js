import { describe, it, expect } from 'vitest'
import {
  explainMove, buildTrendRows, filterTrendRows, sortTrendRows, CAUSE, BENCHMARK_MODE,
} from '../trendAnalysis'

const cell = (traffic, cr, q, gmv = 1e6) => ({ qualifiedTraffic: traffic, conversionRate: cr, quadrant: q, gmv })

describe('penjelasan perpindahan kuadran', () => {
  it('menyebut arah dan besaran, traffic & CR terpisah', () => {
    const m = explainMove(cell(10000, 3.3, 1), cell(10840, 2.0, 3))
    expect(m.headline).toBe('Turun Q1 → Q3')
    expect(m.deltaTrafficPct).toBeCloseTo(8.4, 1)
    expect(m.deltaConversionPp).toBeCloseTo(-1.3, 6)
    expect(m.cause).toBe(CAUSE.CONVERSION)
  })

  it('membedakan penyebab traffic, konversi, atau keduanya', () => {
    expect(explainMove(cell(1000, 3, 1), cell(2000, 3.02, 1)).cause).toBe(CAUSE.TRAFFIC)
    expect(explainMove(cell(1000, 3, 1), cell(1020, 1.0, 3)).cause).toBe(CAUSE.CONVERSION)
    expect(explainMove(cell(1000, 3, 1), cell(2000, 1.0, 3)).cause).toBe(CAUSE.BOTH)
    expect(explainMove(cell(1000, 3, 1), cell(1020, 3.05, 1)).cause).toBe(CAUSE.STABLE)
  })

  it('perpindahan karena benchmark TIDAK disebut membaik/memburuk', () => {
    // Angka produk nyaris tak bergerak; yang berubah cuma ambangnya.
    const prev = cell(5000, 3.0, 1)
    const cur = cell(5050, 3.02, 3)          // kuadran berubah karena ambang naik
    const fixed = { trafficThreshold: 1000, conversionThreshold: 2 }
    const m = explainMove(prev, cur, { fixedBenchmark: fixed })
    expect(m.benchmarkOnly).toBe(true)
    expect(m.cause).toBe(CAUSE.BENCHMARK)
    expect(m.headline).toBe('Benchmark berubah')
    expect(m.label).toMatch(/relatif stabil/i)
  })

  it('produk baru & produk tak lagi ada ditandai berbeda', () => {
    expect(explainMove(null, cell(100, 1, 4)).cause).toBe(CAUSE.NEW)
    expect(explainMove(cell(100, 1, 4), null).cause).toBe(CAUSE.INACTIVE)
    expect(explainMove(null, null).cause).toBe(CAUSE.MISSING)
  })
})

describe('baris tren', () => {
  const view = (pv, bench, products) => ({ periodValue: pv, label: pv, benchmark: bench, products })
  const B1 = { trafficThreshold: 1000, conversionThreshold: 2 }
  const B2 = { trafficThreshold: 4000, conversionThreshold: 3.5 }
  const prod = (id, nama, traffic, cr, gmv) => ({
    canonicalProductId: id, kode_produk: id, nama_produk: nama, shortName: nama,
    qualifiedTraffic: traffic, conversionRate: cr, gmv,
  })

  const views = [
    view('2026-04', B1, [prod('A', 'Moscow Ice 30 ml', 5000, 3.0, 200e6), prod('B', 'Rebel 30 ml', 500, 1.0, 5e6)]),
    view('2026-05', B2, [prod('A', 'Moscow Ice 30 ml', 5050, 3.02, 171.6e6), prod('C', 'Baru 30 ml', 900, 4.0, 9e6)]),
  ]

  it('benchmark dinamis memakai ambang tiap periode', () => {
    const { rows } = buildTrendRows(views, { benchmarkMode: BENCHMARK_MODE.DYNAMIC })
    const a = rows.find(r => r.key === 'A')
    expect(a.cells[0].quadrant).toBe(1)     // 5000 ≥ 1000 & 3,0 ≥ 2
    expect(a.cells[1].quadrant).toBe(3)     // 5050 ≥ 4000 tapi 3,02 < 3,5
  })

  it('benchmark tetap membuat kedua periode dibandingkan ke ambang yang sama', () => {
    const { rows } = buildTrendRows(views, { benchmarkMode: BENCHMARK_MODE.FIXED })
    const a = rows.find(r => r.key === 'A')
    expect(a.cells[0].quadrant).toBe(a.cells[1].quadrant)
  })

  it('delta GMV dihitung, bukan cuma angka periode terbaru', () => {
    const { rows } = buildTrendRows(views)
    const a = rows.find(r => r.key === 'A')
    expect(a.last.gmv).toBeCloseTo(171.6e6, 6)
    expect(a.deltaGmvPct).toBeCloseTo(((171.6 - 200) / 200) * 100, 4)   // −14,2%
  })

  it('periode tanpa data tetap null (ditampilkan "—")', () => {
    const { rows } = buildTrendRows(views)
    const b = rows.find(r => r.key === 'B')
    expect(b.cells[1]).toBeNull()
    expect(b.move.cause).toBe(CAUSE.INACTIVE)
    const c = rows.find(r => r.key === 'C')
    expect(c.cells[0]).toBeNull()
    expect(c.move.cause).toBe(CAUSE.NEW)
  })

  it('filter & sorting bekerja', () => {
    const { rows } = buildTrendRows(views)
    expect(filterTrendRows(rows, 'new').map(r => r.key)).toEqual(['C'])
    expect(filterTrendRows(rows, 'missing').map(r => r.key)).toEqual(['B'])
    const byGmvDrop = sortTrendRows(rows.filter(r => r.deltaGmvPct != null), 'gmvDrop')
    expect(byGmvDrop[0].key).toBe('A')
  })
})
