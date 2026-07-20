// Characterization test: mapper PRODUKSI LAMA (src/utils/apiGmvMax.js) di-REUSE
// apa adanya (Root Cause Rule). Assertion = nilai terverifikasi dari data nyata,
// bukan implementasi baru. Butuh bundling (apiGmvMax → parseGmvMax → xlsx).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseGmvMaxApiRows } from '../utils/apiGmvMax.js'

const fx = (n) => JSON.parse(readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url))).data.list
const CTX = { currency: 'IDR', campaignId: 'C', campaignName: 'Camp', productId: 'SPU' }

test('normalize: creative PRODUCT + -1 + atribut + rate (nilai nyata)', () => {
  const { rows, meta } = parseGmvMaxApiRows(fx('creative_product_attr.json'), CTX)
  assert.equal(rows.length, 3) // semua active
  const sys = rows.find(r => r.isSystem)
  assert.equal(sys.creativeType, 'Product card')
  assert.equal(sys.videoId, null)
  assert.equal(sys.cost, 721738)
  assert.equal(sys.tiktokAccount, null) // "0" → kosong
  const zanii = rows.find(r => r.videoId === '7639337838043008264')
  assert.equal(zanii.tiktokAccount, 'Zanii')
  assert.equal(zanii.creativeType, 'Video')
  assert.equal(zanii.cost, 353298)
  assert.equal(zanii.roas, 3.33)   // = API roi (BUKAN diturunkan)
  assert.equal(zanii.ctr, 7.5)     // rate = PERSEN
  assert.equal(zanii.authType, 'AFFILIATE')
  assert.equal(zanii.hookTag, 'rekomendasi')
  // meta.totals.cost = 721738+353298+191095
  assert.equal(meta.totals.cost, 1266131)
  assert.equal(meta.videoCount, 2)
  assert.equal(meta.productCardCount, 1)
})

test('normalize: LIVE → HANYA -1 (tak ada breakdown video)', () => {
  const { rows, meta } = parseGmvMaxApiRows(fx('creative_live_rollup.json'), CTX)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].isSystem, true)
  assert.equal(rows[0].videoId, null)
  assert.equal(rows[0].cost, 11249)
  assert.equal(meta.videoCount, 0)
})

test('normalize: null ≠ zero, dan baris tanpa aktivitas dibuang (active filter)', () => {
  const { rows } = parseGmvMaxApiRows(fx('zero_and_null.json'), CTX)
  assert.equal(rows.length, 1) // baris cost 0 & impr 0 dibuang
  const r = rows[0]
  assert.equal(r.cost, 251)
  assert.equal(r.grossRevenue, 157750)
  assert.equal(r.skuOrders, null)   // 'orders' hilang → null, BUKAN 0
  assert.equal(r.impressions, null) // hilang → null
})

test('normalize: item_id sama, konteks beda → cost berbeda (bukan duplikat)', () => {
  const { rows } = parseGmvMaxApiRows(fx('dedup_pair_B.json'), CTX)
  const z = rows.find(r => r.videoId === '7639337838043008264')
  assert.equal(z.cost, 2814) // beda dari 353298 di fixture lain — spend spesifik-konteks
})
