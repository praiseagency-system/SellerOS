import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveDateEffectiveSources, activeOnDate, advertiserTargetsForDate } from './sourceModel.mjs'

// Dasfelix membership: 7663 PRIMARY aktif; 7214 LEGACY inactive effective_to 2026-07-19.
const membership = () => [
  { advertiser_id: '7663', advertiser_role: 'PRIMARY', is_active: true, priority: 100 },
  { advertiser_id: '7214', advertiser_role: 'LEGACY', is_active: false, priority: 200, metadata: { effective_to: '2026-07-19', reason: 'ACCOUNT_MIGRATION_COMPLETED' } },
]
const ids = (arr) => arr.map(a => a.advertiser_id)

test('pra-migrasi (2026-07-18): 7214 masih expected', () => {
  const r = resolveDateEffectiveSources(membership(), '2026-07-18')
  assert.deepEqual(ids(r.expected).sort(), ['7214', '7663'])
  assert.equal(r.historical.length, 0)
})

test('tanggal transisi (2026-07-19): keduanya expected', () => {
  const r = resolveDateEffectiveSources(membership(), '2026-07-19')
  assert.deepEqual(ids(r.expected).sort(), ['7214', '7663'])
  assert.equal(r.expected_count, 2)
})

test('pasca-migrasi (2026-07-20): hanya 7663; 7214 historical', () => {
  const r = resolveDateEffectiveSources(membership(), '2026-07-20')
  assert.deepEqual(ids(r.expected), ['7663'])
  assert.deepEqual(ids(r.historical), ['7214'])
  assert.equal(r.expected_count, 1)
})

test('single-advertiser (AsterixSty) tak terpengaruh', () => {
  const r = resolveDateEffectiveSources([{ advertiser_id: '7313', advertiser_role: 'PRIMARY', is_active: true, priority: 100 }], '2026-07-20')
  assert.deepEqual(ids(r.expected), ['7313'])
  assert.equal(r.historical.length, 0)
})

test('inactive tanpa effective_to → historical utk semua tanggal', () => {
  assert.equal(activeOnDate({ advertiser_id: 'x', is_active: false }, '2026-07-20'), false)
})

test('effective_from menghormati batas bawah', () => {
  const adv = { advertiser_id: 'y', is_active: true, metadata: { effective_from: '2026-07-15' } }
  assert.equal(activeOnDate(adv, '2026-07-14'), false)
  assert.equal(activeOnDate(adv, '2026-07-15'), true)
})

test('urutan deterministik by priority', () => {
  const shuffled = [...membership()].reverse()
  const r = resolveDateEffectiveSources(shuffled, '2026-07-18')
  assert.deepEqual(ids(r.expected), ['7663', '7214']) // priority 100 sebelum 200
})

// ── advertiserTargetsForDate (writer cutover source) ──────────────────────────
const tenantRows = () => [
  { workspace_id: 'ws-D', store_id: 'store-D', advertiser_id: '7663', advertiser_role: 'PRIMARY', is_active: true, priority: 100 },
  { workspace_id: 'ws-D', store_id: 'store-D', advertiser_id: '7214', advertiser_role: 'LEGACY', is_active: false, priority: 200, metadata: { effective_to: '2026-07-19' } },
  { workspace_id: 'ws-A', store_id: 'store-A', advertiser_id: '7313', advertiser_role: 'PRIMARY', is_active: true, priority: 100 },
]
const tids = (t) => t.map(x => x.advertiserId)

test('targets pasca-migrasi (07-20): 7214 dikeluarkan; AsterixSty utuh', () => {
  const t = advertiserTargetsForDate(tenantRows(), '2026-07-20')
  assert.deepEqual(tids(t).sort(), ['7313', '7663'])
  const d = t.find(x => x.advertiserId === '7663')
  assert.equal(d.workspaceId, 'ws-D'); assert.equal(d.storeId, 'store-D'); assert.equal(d.advertiserRole, 'PRIMARY')
})

test('targets tanggal transisi (07-19): 7214 masih ikut', () => {
  const t = advertiserTargetsForDate(tenantRows(), '2026-07-19')
  assert.deepEqual(tids(t).sort(), ['7214', '7313', '7663'])
})

test('targets pra-migrasi (07-18): 7214 ikut', () => {
  assert.ok(tids(advertiserTargetsForDate(tenantRows(), '2026-07-18')).includes('7214'))
})
