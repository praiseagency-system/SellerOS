import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateDecisionIntelligence, validateDecisionOutput } from './pipeline.mjs'
import { fakeDb, isReadOnly } from './_fakeDb.mjs'

const WS = '10280d7b-2994-4a40-b639-2d88e0e2018b'
const GEN = '2026-07-21T02:00:00Z'
const run = (extra = {}) => generateDecisionIntelligence({ db: fakeDb({}, WS), workspaceId: WS, storeId: 'store-A', date: '2026-07-20', generatedAt: GEN, ...extra })

test('23 deterministic run', async () => {
  const a = await run(), b = await run()
  assert.deepEqual(a.skill9, b.skill9)
  assert.equal(a.daily_signature, b.daily_signature)
})

test('24 idempotent dry run (full result stable)', async () => {
  assert.equal(JSON.stringify(await run()), JSON.stringify(await run()))
})

test('25 skill dependency order (1→2→3→4→9 all produced)', async () => {
  const r = await run()
  assert.equal(r.skill1.skill_code, 'GMVMAX_SKILL_01')
  assert.equal(r.skill2.skill_code, 'GMVMAX_SKILL_02')
  assert.equal(r.skill3.skill_code, 'GMVMAX_SKILL_03')
  assert.equal(r.skill4.skill_code, 'GMVMAX_SKILL_04')
  assert.equal(r.skill9.skill_code, 'GMVMAX_SKILL_09')
})

test('26 invalid output rejected by validator', () => {
  assert.ok(validateDecisionOutput({ execution_allowed: true }).length >= 1)
  assert.ok(validateDecisionOutput({ execution_allowed: false, access_token: 'x' }).some(e => /terlarang/.test(e)))
  assert.equal(validateDecisionOutput({ execution_allowed: false }).length, 0)
})

test('27 execution_allowed=false (result + every skill)', async () => {
  const r = await run()
  assert.equal(r.execution_allowed, false)
  for (const s of [r.skill1, r.skill2, r.skill3, r.skill4, r.skill9]) assert.equal(s.execution_allowed, false)
})

test('28 no TikTok calls (only read adapter methods used)', async () => {
  const db = fakeDb({}, WS)
  await generateDecisionIntelligence({ db, workspaceId: WS, storeId: 'store-A', date: '2026-07-20', generatedAt: GEN })
  assert.ok(isReadOnly(db))
})

test('29 no canonical writes (adapter exposes no write methods)', async () => {
  const db = fakeDb({}, WS)
  await generateDecisionIntelligence({ db, workspaceId: WS, storeId: 'store-A', date: '2026-07-20', generatedAt: GEN })
  for (const [m] of db.calls) assert.doesNotMatch(m, /insert|update|delete|upsert|write/i)
})

test('30 persist defaults false', async () => {
  const r = await run()
  assert.equal(r.persisted, false)
})

test('31 persist fails safely when tables absent', async () => {
  const sbAbsent = { from: () => ({ select: () => ({ limit: async () => ({ error: { message: 'relation "gmvmax_daily_facts" does not exist' } }) }) }) }
  await assert.rejects(() => run({ persist: true, sb: sbAbsent }), /PERSIST_UNAVAILABLE/)
})
