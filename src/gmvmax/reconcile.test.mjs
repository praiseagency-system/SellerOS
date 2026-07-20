// Characterization test: reconcile.mjs (canonical) HARUS mereproduksi semantik
// rekonsiliasi produksi lama (scripts/syncGmvMax.mjs:74-115). Golden dihitung
// tangan dari formula lama + invariant yang dibuktikan read-only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconcile } from './reconcile.mjs'

const sys = (cost, rev = 0) => ({ isSystem: true, cost, grossRevenue: rev, skuOrders: 0 })
const vid = (videoId, cost, rev, ord) => ({ videoId, cost, grossRevenue: rev, skuOrders: ord, isSystem: false })

// pairs: 1 campaign (C1), 2 SPU. -1 per SPU. Golden dihitung tangan.
const pairs = [
  { campaignId: 'C1', campaignName: 'Camp One', itemGroupId: 'S1',
    rows: [sys(100, 60), vid('v1', 50, 500, 2), vid('v2', 30, 300, 1)] },
  { campaignId: 'C1', campaignName: 'Camp One', itemGroupId: 'S2',
    rows: [sys(20, 40), vid('v3', 40, 400, 1)] },
]
// campaignTotal = seluruh spend termasuk -1: cost 100+50+30+20+40=240, rev 60+500+300+40+400=1300, orders 4
const campaignTotals = { C1: { cost: 240, gross_revenue: 1300, orders: 4 } }

test('reconcile: mode reconcile membuang -1 & menambah 1 baris non-attributed = residual', () => {
  const { rows, totals, report } = reconcile({ pairs, campaignTotals })
  // attributed: v1,v2,v3 (3) + 1 recon = 4
  assert.equal(rows.length, 4)
  const recon = rows.filter(r => r.isSystem)
  assert.equal(recon.length, 1)
  // residual = campaignTotal − attributed = (240−120, 1300−1200, 4−4) = (120,100,0)
  assert.equal(recon[0].cost, 120)
  assert.equal(recon[0].grossRevenue, 100)
  assert.equal(recon[0].skuOrders, 0)
  assert.equal(recon[0].campaignName, 'Camp One')
  assert.equal(recon[0].videoId, null)
  assert.equal(recon[0].creativeType, 'Product card')
  // totals = dashboard (240 / 1300)
  assert.equal(totals.cost, 240)
  assert.equal(totals.revenue, 1300)
  assert.equal(totals.orders, 4)
  assert.ok(Math.abs(totals.roas - 1300 / 240) < 1e-9)
  assert.equal(report.negativeResidual, false)
  assert.equal(report.nonAttributedCount, 1)
})

test('reconcile: INVARIANT residual ≥ 0 — over-count (Σ attributed > campaignTotal) ditandai negativeResidual', () => {
  // campaignTotal cost lebih kecil dari attributed → residual negatif → invariant rusak
  const bad = { C1: { cost: 10, gross_revenue: 10, orders: 0 } }
  const { report } = reconcile({ pairs, campaignTotals: bad })
  assert.equal(report.negativeResidual, true) // caller WAJIB menggagalkan run bila true
})

test('reconcile: passthrough (campaignTotals null) — rows apa adanya termasuk -1, tanpa rekonsiliasi', () => {
  const { rows, report } = reconcile({ pairs, campaignTotals: null })
  assert.equal(rows.length, 5) // 2 sys + 3 video, tak ada yang dibuang/ditambah
  assert.equal(report.mode, 'passthrough')
  assert.equal(report.nonAttributedCount, 0)
})

test('reconcile: campaign tanpa attributed (mis. LIVE) → seluruh total jadi 1 baris non-attributed', () => {
  const live = [{ campaignId: 'L1', campaignName: 'GMV MAX LIVE NEW', itemGroupId: 'S1', rows: [sys(150000, 1513181)] }]
  const totals = { L1: { cost: 150000, gross_revenue: 1513181, orders: 14 } }
  const { rows } = reconcile({ pairs: live, campaignTotals: totals })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].isSystem, true)
  assert.equal(rows[0].cost, 150000)
  assert.equal(rows[0].grossRevenue, 1513181)
  assert.equal(rows[0].skuOrders, 14)
})
