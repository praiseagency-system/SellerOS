import { describe, it, expect } from 'vitest'
import { blendMembers, sumPeriods, safeRate, FLAG } from '../blendMetrics'

// Metrik satu listing. Semua field sengaja eksplisit supaya perbedaan
// null vs 0 tak pernah kabur di dalam tes.
const M = (o = {}) => ({
  qualifiedTraffic: null, trafficSource: 'unique_clicks', visits: null, impressions: null,
  productClicks: null, atcUsers: null, atcQuantity: null, atcRateReported: null, atcSource: null,
  buyers: null, buyerSource: 'buyers', orders: null, quantitySold: null,
  gmv: null, gmvBasis: null, attributedGmv: null, adSpend: null,
  ctrReported: null, conversionRateReported: null, price: null, warnings: [], ...o,
})
const shopee = o => ({ platform: 'shopee', metrics: M(o) })
const tiktok = o => ({ platform: 'tiktok', metrics: M(o) })

describe('blended conversion = Σbuyers ÷ Σtraffic (bukan rata-rata rate)', () => {
  it('menghitung dari cacah, bukan merata-ratakan rate platform', () => {
    // Shopee 28.791 traffic / 1.310 buyer = 4,55% ; TikTok 21.378 / 353 = 1,65%
    const b = blendMembers([
      shopee({ qualifiedTraffic: 28791, buyers: 1310 }),
      tiktok({ qualifiedTraffic: 21378, buyers: 353 }),
    ])
    expect(b.qualifiedTraffic).toBe(50169)
    expect(b.buyers).toBe(1663)
    // Weighted: 1663/50169 = 3,315%
    expect(b.conversionRate).toBeCloseTo(3.3147, 3)
    // Rata-rata naif akan menghasilkan (4,55 + 1,65)/2 = 3,10 — harus BEDA.
    const naive = (safeRate(1310, 28791) + safeRate(353, 21378)) / 2
    expect(naive).toBeCloseTo(3.1006, 3)
    expect(b.conversionRate).not.toBeCloseTo(naive, 3)
  })

  it('ATC rate juga ditimbang dari cacah pengguna', () => {
    const b = blendMembers([
      shopee({ qualifiedTraffic: 28791, atcUsers: 6200 }),
      tiktok({ qualifiedTraffic: 21378, atcUsers: 3180 }),
    ])
    expect(b.atcCompatible).toBe(true)
    expect(b.atcRate).toBeCloseTo((9380 / 50169) * 100, 6)
  })
})

describe('fallback ditandai, tak disamarkan', () => {
  it('order dipakai sebagai pengganti buyer dan diberi tanda', () => {
    const b = blendMembers([
      shopee({ qualifiedTraffic: 1000, buyers: 50, buyerSource: 'order_fallback' }),
      tiktok({ qualifiedTraffic: 1000, buyers: 30 }),
    ])
    expect(b.conversionSource).toBe('order_fallback')
    expect(b.flags).toContain(FLAG.ORDER_FALLBACK)
  })

  it('ATC kuantitas saja → tak kompatibel, rate-nya null', () => {
    const b = blendMembers([
      shopee({ qualifiedTraffic: 1000, atcUsers: 100 }),
      tiktok({ qualifiedTraffic: 1000, atcQuantity: 250, atcSource: 'atc_quantity_only' }),
    ])
    expect(b.atcRate).toBeNull()
    expect(b.flags).toContain(FLAG.ATC_INCOMPATIBLE)
    expect(b.flags).toContain(FLAG.ATC_QUANTITY_ONLY)
  })
})

describe('null bukan nol', () => {
  it('traffic null di satu sisi tak dianggap 0 diam-diam', () => {
    const b = blendMembers([
      shopee({ qualifiedTraffic: null, buyers: 10 }),
      tiktok({ qualifiedTraffic: 2000, buyers: 40 }),
    ])
    expect(b.qualifiedTraffic).toBe(2000)
    expect(b.flags).toContain(FLAG.TRAFFIC_PARTIAL)
  })

  it('traffic 0 → conversion null, bukan 0% dan bukan pembagian nol', () => {
    const b = blendMembers([shopee({ qualifiedTraffic: 0, buyers: 0 })])
    expect(b.qualifiedTraffic).toBe(0)
    expect(b.conversionRate).toBeNull()
    expect(b.flags).toContain(FLAG.NO_TRAFFIC)
  })

  it('safeRate menolak penyebut 0 / null', () => {
    expect(safeRate(5, 0)).toBeNull()
    expect(safeRate(5, null)).toBeNull()
    expect(safeRate(null, 100)).toBeNull()
    expect(safeRate(0, 100)).toBe(0)   // nol yang sah tetap 0
  })
})

describe('ROAS hanya kalau penyebutnya lengkap', () => {
  it('biaya iklan hanya dari satu marketplace → ROAS null', () => {
    const b = blendMembers([
      shopee({ qualifiedTraffic: 100, adSpend: 1_000_000, attributedGmv: 5_000_000 }),
      tiktok({ qualifiedTraffic: 100 }),
    ])
    expect(b.roas).toBeNull()
    expect(b.adSpend).toBeNull()
    expect(b.flags).toContain(FLAG.ROAS_INCOMPLETE)
    // ROAS native tiap marketplace tetap tersedia di breakdown.
    expect(b.breakdown[0].roas).toBeCloseTo(5, 6)
    expect(b.breakdown[1].roas).toBeNull()
  })

  it('dua-duanya ada → Σomzet ÷ Σbiaya', () => {
    const b = blendMembers([
      shopee({ qualifiedTraffic: 100, adSpend: 1_000_000, attributedGmv: 5_000_000 }),
      tiktok({ qualifiedTraffic: 100, adSpend: 3_000_000, attributedGmv: 6_000_000 }),
    ])
    expect(b.roas).toBeCloseTo(11 / 4, 6)   // 2.75, bukan rata-rata (5+2)/2 = 3.5
  })
})

describe('GMV & CTR: sebanding atau tidak sama sekali', () => {
  it('basis transaksi beda → tetap dijumlah tapi ditandai', () => {
    const b = blendMembers([
      shopee({ qualifiedTraffic: 10, gmv: 263_100_000, gmvBasis: 'created' }),
      tiktok({ qualifiedTraffic: 10, gmv: 83_140_000, gmvBasis: 'paid' }),
    ])
    expect(b.gmv).toBe(346_240_000)
    expect(b.isGmvComparable).toBe(false)
    expect(b.flags).toContain(FLAG.GMV_BASIS_MIXED)
  })

  it('CTR lintas marketplace tidak dihitung', () => {
    const b = blendMembers([
      shopee({ qualifiedTraffic: 100, impressions: 10000, productClicks: 500 }),
      tiktok({ qualifiedTraffic: 100, impressions: 20000, productClicks: 800 }),
    ])
    expect(b.ctr).toBeNull()
    expect(b.flags).toContain(FLAG.CTR_INCOMPATIBLE)
  })

  it('satu marketplace saja → CTR boleh dihitung', () => {
    const b = blendMembers([tiktok({ qualifiedTraffic: 800, impressions: 20000, productClicks: 800 })])
    expect(b.ctr).toBeCloseTo(4, 6)
  })
})

describe('gabungan lintas periode', () => {
  it('rate dihitung ulang dari total, bukan dirata-rata', () => {
    const ramai = M({ qualifiedTraffic: 10000, buyers: 400, impressions: 100000, productClicks: 10000, gmv: 40e6, gmvBasis: 'paid' })
    const sepi = M({ qualifiedTraffic: 200, buyers: 2, impressions: 10000, productClicks: 200, gmv: 2e6, gmvBasis: 'paid' })
    const s = sumPeriods([ramai, sepi])
    expect(s.qualifiedTraffic).toBe(10200)
    expect(s.buyers).toBe(402)
    expect(s.conversionRateReported).toBeCloseTo((402 / 10200) * 100, 6)  // 3,94%
    // Rata-rata naif = (4,00 + 1,00)/2 = 2,50 — harus beda.
    expect(s.conversionRateReported).not.toBeCloseTo(2.5, 2)
    expect(s.gmv).toBe(42e6)
  })
})
