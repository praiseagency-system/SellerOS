import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contentSignature, rowFingerprint } from './provenance.mjs'

const rows = () => [
  { campaignId: 'c1', productId: 'p1', videoId: 'v1', cost: 100000, grossRevenue: 600000, skuOrders: 10 },
  { campaignId: 'c1', productId: 'p1', videoId: 'v2', cost: 50000, grossRevenue: 200000, skuOrders: 3 },
]
const base = () => ({ workspaceId: 'ws-A', date: '2026-07-20', rows: rows(), totals: { cost: 150000, revenue: 800000, orders: 13 } })

test('signature stabil untuk input identik', () => {
  assert.equal(contentSignature(base()), contentSignature(base()))
})

test('signature INVARIAN terhadap urutan baris', () => {
  const a = contentSignature(base())
  const b = contentSignature({ ...base(), rows: [...rows()].reverse() })
  assert.equal(a, b)
})

test('perubahan nilai baris → signature berubah', () => {
  const p = base(); p.rows[0].cost = 100001
  assert.notEqual(contentSignature(p), contentSignature(base()))
})

test('perubahan totals → signature berubah', () => {
  assert.notEqual(contentSignature({ ...base(), totals: { cost: 999, revenue: 800000, orders: 13 } }), contentSignature(base()))
})

test('workspace/date berbeda → signature berbeda', () => {
  assert.notEqual(contentSignature({ ...base(), workspaceId: 'ws-B' }), contentSignature(base()))
  assert.notEqual(contentSignature({ ...base(), date: '2026-07-19' }), contentSignature(base()))
})

test('camelCase == snake_case (row DB mentah)', () => {
  const snake = [
    { campaign_id: 'c1', product_id: 'p1', video_id: 'v1', cost: 100000, gross_revenue: 600000, sku_orders: 10 },
    { campaign_id: 'c1', product_id: 'p1', video_id: 'v2', cost: 50000, gross_revenue: 200000, sku_orders: 3 },
  ]
  assert.equal(contentSignature({ ...base(), rows: snake }), contentSignature(base()))
})

test('IDR ternormalisasi: 600000.4 == 600000 (normalisasi desimal, bukan toleransi)', () => {
  const p = base(); p.rows[0].grossRevenue = 600000.4
  assert.equal(contentSignature(p), contentSignature(base()))
})

test('missing tetap null (bukan 0)', () => {
  assert.equal(rowFingerprint({ campaign_id: 'c1' }).cost, null)
  assert.equal(rowFingerprint({ campaign_id: 'c1' }).rev, null)
})
