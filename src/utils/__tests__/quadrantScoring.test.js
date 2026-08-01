import { describe, it, expect } from 'vitest'
import {
  deriveImpressions, funnelStages, opportunityOf, dataConfidence, scoreProducts,
  bandOf, funnelMedians, STAGE, DEFAULT_THRESHOLDS,
} from '../quadrantScoring'
import { recommendFor, PROBLEM } from '../quadrantRecommend'
import { buildShortNames } from '../canonicalProduct'

const P = (o = {}) => ({
  nama_produk: 'Produk 50 ML', qualifiedTraffic: null, conversionRate: null, atcRate: null,
  buyers: null, gmv: null, ctrBlended: null, flags: [], metrics: {}, ...o,
})
const BENCH = { trafficThreshold: 1000, conversionThreshold: 3 }

describe('impression: observed vs estimated', () => {
  it('memakai angka mentah kalau tersedia', () => {
    const r = deriveImpressions({ impressions: 50000, productClicks: 1000, ctrReported: 2 })
    expect(r.value).toBe(50000)
    expect(r.source).toBe('observed')
  })
  it('menurunkan dari klik ÷ CTR dan menandainya estimated', () => {
    const r = deriveImpressions({ productClicks: 1000, ctrReported: 2 })
    expect(r.value).toBe(50000)
    expect(r.source).toBe('estimated')
    expect(r.method).toBe('clicks / ctr')
    expect(r.warning).toMatch(/dihitung dari jumlah klik dibagi CTR/)
  })
  it('CTR null / 0 / klik null → tak diestimasi', () => {
    expect(deriveImpressions({ productClicks: 1000, ctrReported: null }).value).toBeNull()
    expect(deriveImpressions({ productClicks: 1000, ctrReported: 0 }).value).toBeNull()
    expect(deriveImpressions({ productClicks: null, ctrReported: 5 }).value).toBeNull()
    expect(deriveImpressions({ productClicks: 1000, ctrReported: null }).source).toBe('unavailable')
  })
})

describe('tahapan funnel', () => {
  const prod = P({
    qualifiedTraffic: 40233, atcRate: 6.6, buyers: 783, gmv: 100e6,
    metrics: { productClicks: 40233, ctrReported: 3.08, atcUsers: 2654, buyers: 783, gmv: 100e6 },
  })
  it('hanya menampilkan tahap yang datanya ada', () => {
    const st = funnelStages(prod)
    expect(st.map(s => s.key)).toEqual([STAGE.IMPRESSION, STAGE.CLICK, STAGE.ATC, STAGE.BUYER, STAGE.GMV])
    const noImp = funnelStages(P({ qualifiedTraffic: 100, buyers: 3, gmv: 1e6, metrics: { productClicks: 100, buyers: 3, gmv: 1e6 } }))
    expect(noImp.map(s => s.key)).not.toContain(STAGE.IMPRESSION)
  })
  it('menghitung drop-off jumlah dan persentase', () => {
    const st = funnelStages(prod)
    const atc = st.find(s => s.key === STAGE.ATC)
    // Cacah ATC memang ada di sumber (2.654), jadi dipakai apa adanya —
    // bukan diturunkan ulang dari rate yang sudah dibulatkan.
    expect(atc.value).toBe(2654)
    expect(atc.dropCount).toBe(40233 - 2654)
    expect(atc.dropPct).toBeCloseTo(((40233 - 2654) / 40233) * 100, 6)
    // Rate yang dilaporkan sumber dipakai apa adanya.
    expect(atc.rate).toBeCloseTo(6.6, 6)
  })
  it('delta rate memakai percentage point, delta cacah memakai persen', () => {
    const prev = P({ qualifiedTraffic: 45000, atcRate: 7.8, buyers: 900, gmv: 90e6, metrics: {} })
    const st = funnelStages(prod, { previous: prev })
    const click = st.find(s => s.key === STAGE.CLICK)
    expect(click.deltaPct).toBeCloseTo(((40233 - 45000) / 45000) * 100, 6)
    const atc = st.find(s => s.key === STAGE.ATC)
    expect(atc.deltaPp).toBeCloseTo(6.6 - 7.8, 5)
  })
  it('membandingkan konversi dengan benchmark dalam pp', () => {
    const st = funnelStages(prod, { benchmark: BENCH })
    const buyer = st.find(s => s.key === STAGE.BUYER)
    expect(buyer.benchmarkPp).toBeCloseTo(buyer.rate - 3, 6)
  })
})

describe('opportunity', () => {
  it('potensi = traffic × gap × AOV', () => {
    const p = P({ qualifiedTraffic: 10000, conversionRate: 2, buyers: 200, gmv: 40e6 })
    const o = opportunityOf(p, BENCH)
    expect(o.conversionGap).toBe(1)                 // 3% − 2%
    expect(o.potentialOrders).toBeCloseTo(100, 6)   // 10.000 × 1%
    expect(o.aov).toBe(200000)
    expect(o.potentialGmv).toBeCloseTo(20e6, 6)
  })
  it('gap negatif dijepit ke nol (produk di atas benchmark)', () => {
    const o = opportunityOf(P({ qualifiedTraffic: 1000, conversionRate: 5, buyers: 50, gmv: 10e6 }), BENCH)
    expect(o.conversionGap).toBe(0)
    expect(o.potentialGmv).toBe(0)
  })
  it('AOV tak dihitung kalau pembeli 0/null → potensi null, bukan 0', () => {
    const o = opportunityOf(P({ qualifiedTraffic: 5000, conversionRate: 0, buyers: 0, gmv: 0 }), BENCH)
    expect(o.potentialGmv).toBeNull()
    expect(o.reason).toMatch(/AOV/)
  })
  it('traffic 0 → tak ada pembagian nol', () => {
    const o = opportunityOf(P({ qualifiedTraffic: 0, conversionRate: null, buyers: null, gmv: null }), BENCH)
    expect(o.potentialGmv).toBeNull()
    expect(o.conversionGap).toBeNull()
  })
})

describe('data confidence & priority score', () => {
  it('sampel kecil → tidak sufficient, tak boleh Segera', () => {
    const p = P({ qualifiedTraffic: 40, conversionRate: 0, buyers: 0, gmv: 0, atcRate: 0 })
    const c = dataConfidence(p)
    expect(c.sufficient).toBe(false)
    expect(bandOf(95, c.sufficient).key).toBe('insufficient')
  })
  it('produk kecil tak mengalahkan produk besar dalam peringkat', () => {
    const kecil = P({ nama_produk: 'Kecil', qualifiedTraffic: 120, conversionRate: 0.1, buyers: 1, gmv: 200_000, atcRate: 1 })
    const besar = P({ nama_produk: 'Besar', qualifiedTraffic: 30000, conversionRate: 2, buyers: 600, gmv: 120e6, atcRate: 20 })
    const scored = scoreProducts([kecil, besar], BENCH)
    const k = scored.find(s => s.product.nama_produk === 'Kecil')
    const b = scored.find(s => s.product.nama_produk === 'Besar')
    expect(b.opportunity.potentialGmv).toBeGreaterThan(k.opportunity.potentialGmv)
    expect(k.priorityScore).toBeNull()          // sampel kurang → tak diberi skor
    expect(b.band.key).not.toBe('insufficient')
  })
  it('skor memakai keyakinan data, bukan potensi mentah saja', () => {
    const bersih = P({ nama_produk: 'A', qualifiedTraffic: 20000, conversionRate: 1, buyers: 200, gmv: 40e6, atcRate: 10, flags: [] })
    const kotor = P({ nama_produk: 'B', qualifiedTraffic: 20000, conversionRate: 1, buyers: 200, gmv: 40e6, atcRate: 10,
      flags: ['order_fallback', 'traffic_fallback', 'atc_incompatible', 'traffic_partial'] })
    const [a, b] = scoreProducts([bersih, kotor], BENCH)
    expect(a.opportunity.potentialGmv).toBeCloseTo(b.opportunity.potentialGmv, 6)
    expect(a.priorityScore).toBeGreaterThan(b.priorityScore)
  })
  it('null tak berubah jadi nol', () => {
    const p = P({ qualifiedTraffic: null, conversionRate: null })
    const [s] = scoreProducts([p], BENCH)
    expect(s.opportunity.potentialGmv).toBeNull()
    expect(s.priorityScore).toBeNull()
  })
  it('ambang kategori sesuai default', () => {
    expect(bandOf(85, true).label).toBe('Segera')
    expect(bandOf(60, true).label).toBe('Menengah')
    expect(bandOf(30, true).label).toBe('Pantau')
    expect(bandOf(5, true).label).toBe('Rendah')
  })
})

describe('mesin rekomendasi', () => {
  const medians = { ctr: 5, atcRate: 10, conversionRate: 3 }
  const ok = { sufficient: true, reasons: [] }

  it('HT-LC dengan CTR rendah → perbaikan etalase', () => {
    const r = recommendFor(P({ quadrant: 3, ctrBlended: 2, atcRate: 10, conversionRate: 1 }), { medians, confidence: ok })
    expect(r.category).toBe(PROBLEM.DISCOVERY)
    expect(r.actions.join(' ')).toMatch(/thumbnail/i)
  })
  it('HT-LC dengan ATC rendah → perbaikan halaman produk', () => {
    const r = recommendFor(P({ quadrant: 3, ctrBlended: 5.5, atcRate: 4, conversionRate: 1 }), { medians, confidence: ok })
    expect(r.category).toBe(PROBLEM.PDP)
    expect(r.actions.join(' ')).toMatch(/gambar pertama|USP/i)
  })
  it('HT-LC dengan ATC tinggi tapi CR rendah → perbaikan checkout', () => {
    const r = recommendFor(P({ quadrant: 3, ctrBlended: 5.5, atcRate: 26, conversionRate: 2 }), { medians, confidence: ok })
    expect(r.category).toBe(PROBLEM.CHECKOUT)
    expect(r.actions.join(' ')).toMatch(/ongkir|voucher/i)
  })
  it('LT-HC → tambah traffic', () => {
    const r = recommendFor(P({ quadrant: 2, ctrBlended: 6, atcRate: 12, conversionRate: 5 }), { medians, confidence: ok })
    expect(r.category).toBe(PROBLEM.TRAFFIC)
    expect(r.actions.join(' ')).toMatch(/budget|affiliate/i)
  })
  it('HT-HC → saran scale, bukan hanya masalah', () => {
    const r = recommendFor(P({ quadrant: 1, ctrBlended: 7, atcRate: 15, conversionRate: 6 }), { medians, confidence: ok })
    expect(r.category).toBe(PROBLEM.SCALE)
    expect(r.actions.join(' ')).toMatch(/stok|scale/i)
  })
  it('LT-LC dengan sampel kurang → status validasi, bukan vonis', () => {
    const conf = dataConfidence(P({ qualifiedTraffic: 50, buyers: 0 }))
    const r = recommendFor(P({ quadrant: 4, conversionRate: 0 }), { medians, confidence: conf })
    expect(r.category).toBe(PROBLEM.VALIDATE)
    expect(r.diagnosis).toMatch(/belum cukup/i)
  })
  it('LT-LC dengan sampel cukup → evaluasi', () => {
    const r = recommendFor(P({ quadrant: 4, ctrBlended: 4, atcRate: 8, conversionRate: 1 }), { medians, confidence: ok })
    expect(r.category).toBe(PROBLEM.REVIEW)
  })
  it('dua produk sekuadran dengan bocor beda mendapat saran berbeda', () => {
    const a = recommendFor(P({ quadrant: 3, ctrBlended: 1.5, atcRate: 11, conversionRate: 1 }), { medians, confidence: ok })
    const b = recommendFor(P({ quadrant: 3, ctrBlended: 6, atcRate: 26, conversionRate: 1.8 }), { medians, confidence: ok })
    expect(a.category).not.toBe(b.category)
  })
})

describe('nama ringkas', () => {
  it('membuang token brand yang berulang tapi mempertahankan ukuran & bundling', () => {
    const list = [
      { nama_produk: 'Dasfelix Moscow Ice - Extrait de Parfum Aroma Fresh | Parfum Pria 30 ML' },
      { nama_produk: 'Dasfelix 911 Rebel - Extrait de Parfum 30 ML' },
      { nama_produk: 'Dasfelix Vanilla Althajir - Extrait de Parfum 30 ML' },
      { nama_produk: '[Bundling] Dasfelix Moscow Ice + 911 Rebel 30 ML' },
    ]
    const short = buildShortNames(list)
    expect(short[0]).toMatch(/^Moscow Ice/)
    expect(short[0]).toMatch(/30 ml/i)
    expect(short[1]).toMatch(/^911 Rebel/)
    expect(short[3]).toMatch(/Bundling/)
  })
  it('tak membuang apa pun kalau tak ada brand berulang', () => {
    const short = buildShortNames([{ nama_produk: 'Sabun Cair 500 ML' }])
    expect(short[0]).toMatch(/Sabun Cair/)
  })
})

describe('median funnel', () => {
  it('mengabaikan null dan nol', () => {
    const m = funnelMedians([
      { ctrBlended: 2, atcRate: 5, conversionRate: 1 },
      { ctrBlended: 4, atcRate: 10, conversionRate: 3 },
      { ctrBlended: 6, atcRate: 15, conversionRate: 5 },
      { ctrBlended: null, atcRate: 0, conversionRate: null },
    ])
    expect(m.ctr).toBe(4)
    expect(m.atcRate).toBe(10)
    expect(m.conversionRate).toBe(3)
  })
})

describe('ambang minimum bisa dikonfigurasi', () => {
  it('menurunkan ambang membuat produk kecil jadi sufficient', () => {
    const p = P({ qualifiedTraffic: 120, conversionRate: 1, buyers: 2, gmv: 1e6, atcRate: 5 })
    expect(dataConfidence(p, DEFAULT_THRESHOLDS).sufficient).toBe(false)
    expect(dataConfidence(p, { minQualifiedTraffic: 100, minBuyers: 2 }).sufficient).toBe(true)
  })
})
