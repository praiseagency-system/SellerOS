import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyFacts } from './dailyFacts.mjs'
import { runSkill1, Readiness } from './skill1.mjs'
import { validateSkillOutput, SkillCode } from './contract.mjs'
import { creative, baseInput } from './_fixtures.mjs'

const bs = {
  workspaceName: 'Asterixsty', storeName: 'AsterixSty Store',
  activeAdvertisers: [{ advertiser_id: '7313', role: 'PRIMARY', is_active: true, connection_group_id: 'g1' }],
}
const readinessOf = (o, code) => o.blueprint.DOWNSTREAM_SKILL_READINESS.find(r => r.skill_code === code)

function run(extra = {}, s1extra = {}) {
  const daily = buildDailyFacts(baseInput([creative()], extra))
  return runSkill1({ workspaceId: 'ws-A', storeId: 'store-A', date: '2026-07-20', daily, businessStructure: bs, ...s1extra })
}

test('15 healthy blueprint → S2 READY, valid output', () => {
  const o = run()
  assert.equal(o.skill_code, SkillCode.S1)
  assert.equal(readinessOf(o, SkillCode.S2).status, Readiness.READY)
  assert.equal(validateSkillOutput(o).ok, true, validateSkillOutput(o).errors.join(','))
})

test('16 missing settings → S5 BLOCKED + missing campaign_settings', () => {
  const o = run({ campaignSettings: null })
  assert.equal(readinessOf(o, SkillCode.S5).status, Readiness.BLOCKED)
  assert.ok(o.missing_data.includes('campaign_settings'))
})

test('17 missing creative data → S2 BLOCKED, DATA_INSUFFICIENT', () => {
  const daily = buildDailyFacts({ workspaceId: 'ws-A', storeId: 'store-A', date: '2026-07-20', canonicalData: null })
  const o = runSkill1({ workspaceId: 'ws-A', storeId: 'store-A', date: '2026-07-20', daily, businessStructure: bs })
  assert.equal(readinessOf(o, SkillCode.S2).status, Readiness.BLOCKED)
  assert.equal(o.confidence, 'DATA_INSUFFICIENT')
})

test('18 missing LIVE blocks Skill 8 ONLY', () => {
  const o = run({}, { liveDataAvailable: false })
  assert.equal(readinessOf(o, SkillCode.S8).status, Readiness.BLOCKED)
  assert.notEqual(readinessOf(o, SkillCode.S2).status, Readiness.BLOCKED)
  assert.notEqual(readinessOf(o, SkillCode.S3).status, Readiness.BLOCKED)
})

test('19 inactive LEGACY retained in lineage, excluded from active count', () => {
  const o = runSkill1({
    workspaceId: 'ws-A', storeId: 'store-A', date: '2026-07-20',
    daily: buildDailyFacts(baseInput([creative()])),
    businessStructure: {
      activeAdvertisers: [
        { advertiser_id: '7663', role: 'PRIMARY', is_active: true, connection_group_id: 'g1' },
        { advertiser_id: '7214', role: 'LEGACY', is_active: false, effective_to: '2026-07-19' },
      ],
    },
  })
  assert.equal(o.blueprint.BUSINESS_STRUCTURE.active_advertisers.length, 1)
  assert.equal(o.blueprint.BUSINESS_STRUCTURE.historical_advertisers.length, 1)
  assert.equal(o.blueprint.BUSINESS_STRUCTURE.historical_advertisers[0].advertiser_id, '7214')
})

test('20 no optimization recommendation; execution_allowed=false', () => {
  const o = run()
  assert.deepEqual(o.recommendations, [])
  assert.equal(o.execution_allowed, false)
})

test('21 all downstream skills (2–9) have readiness status', () => {
  const o = run()
  const codes = o.blueprint.DOWNSTREAM_SKILL_READINESS.map(r => r.skill_code)
  for (let i = 2; i <= 9; i++) assert.ok(codes.includes(`GMVMAX_SKILL_0${i}`), `missing S${i}`)
  for (const r of o.blueprint.DOWNSTREAM_SKILL_READINESS)
    assert.ok([Readiness.READY, Readiness.PARTIAL, Readiness.BLOCKED].includes(r.status))
})
