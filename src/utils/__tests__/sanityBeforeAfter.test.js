import { describe, it, expect } from 'vitest'
import { buildRangeView } from '../quadrantAggregate'

// SANITY CHECK — membandingkan logika LAMA vs BARU pada bentuk data yang sama.
// Logika lama direplika di sini persis seperti mergeAcrossPlatforms sebelum
// revisi: sebar dari platform dominan, lalu hanya GMV & pesanan yang dijumlah.
function OLD_merge(members) {
  const dom = [...members].sort((a, b) => (b.gmv || 0) - (a.gmv || 0))[0]
  return {
    traffic: dom.traffic,                 // ← ikut platform dominan saja
    conversionRate: dom.conversionRate,   // ← ikut platform dominan saja
    atcRate: dom.atcRate,                 // ← ikut platform dominan saja
    gmv: members.reduce((s, m) => s + (m.gmv || 0), 0),
    orders: members.reduce((s, m) => s + (m.orders || 0), 0),
  }
}

const DEF = {
  shopee: { periodDays: 30, targetHarian: 20, conversionThreshold: 2.0 },
  tiktok: { periodDays: 30, targetHarian: 15, conversionThreshold: 1.0 },
}
const P = (kode, nama, platform, m) => ({
  kode_produk: kode, nama_produk: nama, platform,
  pengunjung: m.qualifiedTraffic, total_penjualan: m.gmv, pesanan: m.buyers,
  metrics: {
    qualifiedTraffic: m.qualifiedTraffic, trafficSource: 'unique_clicks', visits: null,
    impressions: null, productClicks: null, atcUsers: m.atcUsers ?? null, atcQuantity: null,
    atcRateReported: null, atcSource: 'atc_users', buyers: m.buyers, buyerSource: 'buyers',
    orders: m.buyers, quantitySold: null, gmv: m.gmv,
    gmvBasis: platform === 'shopee' ? 'created' : 'paid',
    attributedGmv: m.attributedGmv ?? null, adSpend: m.adSpend ?? null,
    ctrReported: null, conversionRateReported: null, price: null, warnings: [],
  },
})
const sess = (id, platform, ym, products) => ({ id, label: ym, platform, periodValue: ym, settings: DEF[platform], products })

// Tiga produk dengan pola berbeda. Angka menyerupai laporan Mei 2026 tapi
// TIDAK diambil dari data produksi (tak ada akses) — hanya untuk membuktikan
// arah perubahan perhitungan.
const FIXTURE = [
  { nama: 'Moscow Ice 50 ML',
    shopee: { qualifiedTraffic: 28791, buyers: 1310, atcUsers: 6200, gmv: 263_100_000, adSpend: 21_000_000, attributedGmv: 96_000_000 },
    tiktok: { qualifiedTraffic: 21378, buyers: 353, atcUsers: 3180, gmv: 83_140_000, adSpend: 12_000_000, attributedGmv: 41_000_000 } },
  { nama: '911 Rebel 50 ML',
    shopee: { qualifiedTraffic: 4210, buyers: 78, atcUsers: 640, gmv: 19_800_000, adSpend: 3_500_000, attributedGmv: 8_100_000 },
    tiktok: { qualifiedTraffic: 30150, buyers: 612, atcUsers: 5400, gmv: 69_700_000, adSpend: null, attributedGmv: null } },
  { nama: 'Vanilla Althajir 50 ML',
    shopee: { qualifiedTraffic: 9800, buyers: 90, atcUsers: 1100, gmv: 25_000_000 },
    tiktok: null },
]

describe('SANITY CHECK — sebelum vs sesudah', () => {
  it('mencetak perbandingan tiga produk', () => {
    const sessions = [
      sess('s1', 'shopee', '2026-05', FIXTURE.filter(f => f.shopee).map((f, i) => P(`S${i}`, f.nama, 'shopee', f.shopee))),
      sess('t1', 'tiktok', '2026-05', FIXTURE.filter(f => f.tiktok).map((f, i) => P(`T${i}`, f.nama, 'tiktok', f.tiktok))),
    ]
    const view = buildRangeView(sessions, { mode: 'month', month: '2026-05' }, ['shopee', 'tiktok'], DEF)

    const rows = []
    for (const f of FIXTURE) {
      const members = [
        f.shopee && { platform: 'shopee', traffic: f.shopee.qualifiedTraffic, conversionRate: (f.shopee.buyers / f.shopee.qualifiedTraffic) * 100, atcRate: (f.shopee.atcUsers / f.shopee.qualifiedTraffic) * 100, gmv: f.shopee.gmv, orders: f.shopee.buyers },
        f.tiktok && { platform: 'tiktok', traffic: f.tiktok.qualifiedTraffic, conversionRate: (f.tiktok.buyers / f.tiktok.qualifiedTraffic) * 100, atcRate: (f.tiktok.atcUsers / f.tiktok.qualifiedTraffic) * 100, gmv: f.tiktok.gmv, orders: f.tiktok.buyers },
      ].filter(Boolean)
      const old = OLD_merge(members)
      const neu = view.products.find(p => p.nama_produk === f.nama)
      rows.push({ f, old, neu })
      console.log(`\n── ${f.nama} ${f.tiktok ? '(2 marketplace)' : '(Shopee saja)'}`)
      console.log(`   traffic     LAMA ${old.traffic.toLocaleString('id-ID')}  →  BARU ${neu.qualifiedTraffic.toLocaleString('id-ID')}`)
      console.log(`   conversion  LAMA ${old.conversionRate.toFixed(2)}%  →  BARU ${neu.conversionRate.toFixed(2)}%`)
      console.log(`   ATC rate    LAMA ${old.atcRate.toFixed(2)}%  →  BARU ${neu.atcRate == null ? '—' : neu.atcRate.toFixed(2) + '%'}`)
      console.log(`   GMV         LAMA ${(old.gmv / 1e6).toFixed(2)} jt  →  BARU ${(neu.gmv / 1e6).toFixed(2)} jt`)
      console.log(`   ROAS blend  LAMA (tak ada)  →  BARU ${neu.roasBlended == null ? '— (biaya iklan tak lengkap)' : neu.roasBlended.toFixed(2)}`)
      console.log(`   kuadran     BARU Q${neu.quadrant} · flags: ${neu.flags.join(', ') || '-'}`)
    }
    console.log(`\n   ambang: traffic ≥ ${view.benchmark.trafficThreshold} · CR ≥ ${view.benchmark.conversionThreshold?.toFixed(2)}% (${view.benchmark.source}, ${view.benchmark.pool} produk)`)

    // Moscow Ice: keluhan aslinya — GMV gabungan tapi traffic hanya Shopee.
    const mi = rows[0]
    expect(mi.old.traffic).toBe(28791)               // lama: Shopee saja
    expect(mi.neu.qualifiedTraffic).toBe(50169)      // baru: dua-duanya
    expect(mi.old.gmv).toBe(mi.neu.gmv)              // GMV memang sudah benar sejak dulu
    expect(mi.neu.conversionRate).toBeCloseTo((1663 / 50169) * 100, 6)

    // 911 Rebel: dominan TikTok → logika lama mengambil angka TikTok saja.
    const rb = rows[1]
    expect(rb.old.traffic).toBe(30150)
    expect(rb.neu.qualifiedTraffic).toBe(34360)
    expect(rb.neu.roasBlended).toBeNull()            // biaya iklan TikTok kosong

    // Vanilla Althajir: hanya Shopee → tak boleh berstatus digabung.
    const va = rows[2]
    expect(va.neu.merged).toBe(false)
    expect(va.neu.qualifiedTraffic).toBe(9800)
  })
})
