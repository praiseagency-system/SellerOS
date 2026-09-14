import { describe, it, expect } from 'vitest'
import { rollupProductsExact } from '../gmvmaxRollup'

const prod = (o) => ({ importId: 'i1', campaignId: o.c || 'C1', campaignName: o.cn || 'Camp', productId: o.p, cost: o.cost ?? 0, grossRevenue: o.rev ?? 0, orders: o.ord ?? 0, roi: null })
const cre = (o) => ({ productId: o.p, creativeType: o.type || 'Video', videoId: o.v, status: o.status || 'DELIVERING', period: o.period || '2026-09', campaignName: 'Camp' })

describe('rollupProductsExact (0061)', () => {
  it('menjumlahkan lintas campaign & hari; ROAS = Σrev/Σcost; #video & status dari kreatif', () => {
    const out = rollupProductsExact(
      [prod({ p: 'P1', cost: 100, rev: 1000, ord: 2 }), prod({ p: 'P1', c: 'C2', cn: 'Live', cost: 50, rev: 0 }), prod({ p: 'P2', cost: 10, rev: 0 })],
      [cre({ p: 'P1', v: 'v1' }), cre({ p: 'P1', v: 'v2', status: 'LEARNING' }), cre({ p: 'P1', v: 'v1', type: 'Product card' })],
    )
    expect(out.map(p => p.productId)).toEqual(['P1', 'P2'])
    const p1 = out[0]
    expect(p1.cost).toBe(150); expect(p1.revenue).toBe(1000); expect(p1.orders).toBe(2)
    expect(p1.roas).toBeCloseTo(1000 / 150)
    expect(p1.videoCount).toBe(2)
    expect(p1.statusCounts.delivering).toBe(1); expect(p1.statusCounts.learning).toBe(1)
    expect(p1.campaigns.sort()).toEqual(['Camp', 'Live'])
    expect(p1.exact).toBe(true)
    // produk berbelanja tanpa revenue TETAP tampil (inilah yang hilang di alokasi card)
    expect(out[1]).toMatchObject({ productId: 'P2', cost: 10, revenue: 0, roas: 0, videoCount: 0 })
  })
  it('kosong → [] (pemanggil jatuh ke alokasi card)', () => {
    expect(rollupProductsExact([], [])).toEqual([])
    expect(rollupProductsExact(null, [])).toEqual([])
  })
})
