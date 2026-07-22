import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeSnapshotVersioned } from './writer.mjs'
import { contentSignature } from './provenance.mjs'

const rows = () => [
  { videoId: 'v1', campaignName: 'C', campaignId: 'c1', productId: 'p1', creativeType: 'Video', cost: 100000, grossRevenue: 600000, skuOrders: 10 },
  { videoId: 'v2', campaignName: 'C', campaignId: 'c1', productId: 'p1', creativeType: 'Video', cost: 50000, grossRevenue: 200000, skuOrders: 3 },
]
const result = (extra = {}) => ({ rows: rows(), totals: { cost: 150000, revenue: 800000, orders: 13, roas: 5.33 }, meta: {}, ...extra })
// Mock Supabase client: records rpc calls, returns a canned reply.
function mockSb(reply = { data: { import_id: 'imp-new', version: 1, content_changed: true, noop: false }, error: null }) {
  const calls = []
  return { calls, rpc: async (fn, args) => { calls.push({ fn, args }); return reply } }
}
const wsDate = { workspaceId: 'ws-A', date: '2026-07-20', name: '20 Jul' }

test('shadow (commit=false): hitung signature, TIDAK menulis, tak panggil rpc', async () => {
  const sb = mockSb()
  const r = await writeSnapshotVersioned({ sb, ...wsDate, result: result(), commit: false })
  assert.equal(r.written, false)
  assert.ok(r.content_signature.startsWith('sha256:'))
  assert.equal(sb.calls.length, 0)
})

test('rpc dipanggil dgn content_signature yang benar & deterministik', async () => {
  const sb = mockSb()
  await writeSnapshotVersioned({ sb, ...wsDate, result: result(), commit: true })
  const expected = contentSignature({ workspaceId: 'ws-A', date: '2026-07-20', rows: rows(), totals: { cost: 150000, revenue: 800000, orders: 13, roas: 5.33 } })
  assert.equal(sb.calls[0].fn, 'gmvmax_write_versioned_snapshot')
  assert.equal(sb.calls[0].args.p_content_signature, expected)
})

test('commit NO-OP: rpc bilang noop → writer kembalikan noop=true, pertahankan import id', async () => {
  const sb = mockSb({ data: { import_id: 'imp-1', version: 1, content_changed: false, noop: true }, error: null })
  const r = await writeSnapshotVersioned({ sb, ...wsDate, result: result(), commit: true })
  assert.equal(r.noop, true); assert.equal(r.content_changed, false); assert.equal(r.importId, 'imp-1'); assert.equal(r.written, true)
})

test('commit VERSI BARU: rpc bilang content_changed → version + noop=false', async () => {
  const sb = mockSb({ data: { import_id: 'imp-2', version: 2, content_changed: true, noop: false }, error: null })
  const r = await writeSnapshotVersioned({ sb, ...wsDate, result: result(), commit: true })
  assert.equal(r.noop, false); assert.equal(r.version, 2); assert.equal(r.importId, 'imp-2')
})

test('empty tanpa COMPLETE_ZERO_DATA → REFUSE_EMPTY_COMMIT (tak panggil rpc)', async () => {
  const sb = mockSb()
  await assert.rejects(() => writeSnapshotVersioned({ sb, ...wsDate, result: { rows: [], totals: { cost: 0, revenue: 0, orders: 0, roas: null }, meta: {} }, commit: true }), /REFUSE_EMPTY_COMMIT/)
  assert.equal(sb.calls.length, 0)
})

test('empty diizinkan bila COMPLETE_ZERO_DATA → p_allow_empty true', async () => {
  const sb = mockSb()
  await writeSnapshotVersioned({ sb, ...wsDate, result: { rows: [], totals: { cost: 0, revenue: 0, orders: 0, roas: null }, meta: { completeness: 'COMPLETE_ZERO_DATA' } }, commit: true })
  assert.equal(sb.calls[0].args.p_allow_empty, true)
})

test('metadata writer diteruskan (writer_kind/run_id/sync_run_id/actor)', async () => {
  const sb = mockSb()
  await writeSnapshotVersioned({ sb, ...wsDate, result: result(), commit: true, writerKind: 'MANUAL', runId: 'r9', syncRunId: 'sr9', actorRole: 'service_role' })
  const a = sb.calls[0].args
  assert.equal(a.p_writer_kind, 'MANUAL'); assert.equal(a.p_run_id, 'r9'); assert.equal(a.p_sync_run_id, 'sr9'); assert.equal(a.p_actor_role, 'service_role')
})

test('error rpc → VERSIONED_WRITE_FAILED', async () => {
  const sb = mockSb({ data: null, error: { message: 'boom' } })
  await assert.rejects(() => writeSnapshotVersioned({ sb, ...wsDate, result: result(), commit: true }), /VERSIONED_WRITE_FAILED/)
})
