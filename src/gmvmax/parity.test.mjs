import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareParity } from './parity.mjs'

const R = (campaignId, productId, videoId, cost, rev, ord, isSystem = false) =>
  ({ campaignId, productId, videoId, cost, grossRevenue: rev, skuOrders: ord, isSystem, creativeType: isSystem ? 'Product card' : 'Video' })

test('parity MATCH: identik → aggregate & row-level bersih', () => {
  const rows = [R('C1', 'S1', 'v1', 100, 500, 2), R('C1', null, null, 50, 200, 0, true)]
  const p = compareParity(rows, rows.map(x => ({ ...x })))
  assert.equal(p.status, 'MATCH')
  assert.equal(p.aggregate.cost.status, 'MATCH')
  assert.equal(p.rowLevel.counts.valueDiffs, 0)
})

test('parity MISMATCH nilai: cost berbeda → valueDiff + aggregate mismatch (tanpa toleransi)', () => {
  const old = [R('C1', 'S1', 'v1', 100, 500, 2)]
  const neu = [R('C1', 'S1', 'v1', 101, 500, 2)]
  const p = compareParity(old, neu)
  assert.equal(p.status, 'MISMATCH')
  assert.equal(p.rowLevel.valueDiffs.length, 1)
  assert.equal(p.rowLevel.valueDiffs[0].field, 'cost')
  assert.equal(p.rowLevel.valueDiffs[0].delta, 1)
  assert.equal(p.aggregate.cost.absoluteDelta, 1)
})

test('parity: baris hilang di NEW & di OLD terdeteksi by identity kanonik', () => {
  const old = [R('C1', 'S1', 'v1', 100, 0, 0), R('C1', 'S1', 'v2', 50, 0, 0)]
  const neu = [R('C1', 'S1', 'v1', 100, 0, 0), R('C1', 'S1', 'v3', 70, 0, 0)]
  const p = compareParity(old, neu)
  assert.equal(p.rowLevel.missingInNew.length, 1) // v2 ada di OLD, tidak di NEW
  assert.equal(p.rowLevel.missingInNew[0].key, 'C1|S1|v2')
  assert.equal(p.rowLevel.missingInOld.length, 1) // v3 ada di NEW, tidak di OLD
})

test('parity: item_id sama beda (campaign,SPU) = identity beda → BUKAN dianggap sama', () => {
  const old = [R('C1', 'S1', 'v1', 100, 0, 0)]
  const neu = [R('C2', 'S1', 'v1', 100, 0, 0)] // campaign beda
  const p = compareParity(old, neu)
  assert.equal(p.rowLevel.missingInNew.length, 1)
  assert.equal(p.rowLevel.missingInOld.length, 1)
})
