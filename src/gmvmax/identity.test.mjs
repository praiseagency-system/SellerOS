// Characterization test: identity kanonik. Membuktikan fakta read-only 2026-07-10
// bahwa item_id TIDAK unik lintas (campaign, item_group_id).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { rowIdentity, findDuplicateIdentities } from './identity.mjs'

const fx = (n) => JSON.parse(readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url)))

test('item_id sama lintas campaign berbeda → identity kanonik BERBEDA (bukan duplikat)', () => {
  // 7639337838043008264 ada di creative_product_attr (campaign 1836106675381377)
  // DAN dedup_pair_B (campaign 1836106520532993). Sama item_id, beda konteks.
  const a = { campaignId: '1836106675381377', productId: '1731519207014237361', videoId: '7639337838043008264' }
  const b = { campaignId: '1836106520532993', productId: '1732987062949872817', videoId: '7639337838043008264' }
  assert.notEqual(rowIdentity(a), rowIdentity(b)) // konteks berbeda → BUKAN duplikat, benar dijumlah
  // fixture nyata memang memuat item_id yang sama:
  const A = fx('creative_product_attr.json').data.list.map(r => r.dimensions.item_id)
  const B = fx('dedup_pair_B.json').data.list.map(r => r.dimensions.item_id)
  assert.ok(A.includes('7639337838043008264') && B.includes('7639337838043008264'))
})

test('findDuplicateIdentities menandai duplikat SEJATI (identity kanonik sama >1×)', () => {
  const rows = [
    { campaignId: 'C1', productId: 'S1', videoId: 'v1' },
    { campaignId: 'C1', productId: 'S1', videoId: 'v1' }, // duplikat sejati (paginasi/merge cacat)
    { campaignId: 'C1', productId: 'S2', videoId: 'v1' }, // BUKAN duplikat (SPU beda)
  ]
  const dups = findDuplicateIdentities(rows)
  assert.equal(dups.length, 1)
  assert.equal(dups[0].key, 'C1|S1|v1')
  assert.equal(dups[0].count, 2)
})

test('data bersih → tidak ada duplikat', () => {
  const rows = [
    { campaignId: 'C1', productId: 'S1', videoId: 'v1' },
    { campaignId: 'C1', productId: 'S2', videoId: 'v1' },
    { campaignId: 'C2', productId: 'S1', videoId: 'v1' },
  ]
  assert.equal(findDuplicateIdentities(rows).length, 0)
})
