import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyFacts } from './dailyFacts.mjs'
import { runSkill1 } from './skill1.mjs'
import { runSkill2 } from './skill2.mjs'
import { runSkill3 } from './skill3.mjs'
import { runSkill4 } from './skill4.mjs'
import { runSkill9 } from './skill9.mjs'
import { creative, canonical, baseInput } from './_fixtures.mjs'

const GEN = '2026-07-21T02:00:00Z'
const PAST = '2026-07-20T00:00:00Z'
const FUTURE = '2026-07-25T00:00:00Z'
const bs = { activeAdvertisers: [{ advertiser_id: '7313', role: 'PRIMARY', is_active: true, connection_group_id: 'g1' }] }

function outputs(inputExtra = {}, s2extra = {}) {
  const daily = buildDailyFacts(baseInput([creative()], inputExtra))
  const s1 = runSkill1({ workspaceId: baseInput([creative()], inputExtra).workspaceId, storeId: 'store-A', date: '2026-07-20', daily, businessStructure: bs })
  const s2 = runSkill2({ workspaceId: 'ws-A', storeId: 'store-A', date: '2026-07-20', daily, ...s2extra })
  const s3 = runSkill3({ dailyFacts: daily, skill1Output: s1, skill2Output: s2, generatedAt: GEN })
  const s4 = runSkill4({ dailyFacts: daily, skill2Output: s2, skill3Output: s3, generatedAt: GEN })
  return { s1, s2, s3, s4 }
}
function plan(inputExtra = {}, s2extra = {}, s9extra = {}) {
  const { s1, s2, s3, s4 } = outputs(inputExtra, s2extra)
  return runSkill9({ skill1Output: s1, skill2Output: s2, skill3Output: s3, skill4Output: s4, generatedAt: GEN, ...s9extra })
}
const all = (p) => [...p.primary_actions, ...p.secondary_observations, ...p.blocked_actions]
const ex = (o = {}) => ({ target_scope_type: 'STORE', target_scope_id: 'store-A', objective: 'existing', action_type: 'OBSERVATION', status: 'OBSERVE', title: 'X', title_en: 'X', evidence_ids: ['e1'], ...o })

test('30 healthy day → OBSERVE/maintain', () => {
  const p = plan()
  assert.ok(p.primary_actions.length >= 1)
  assert.ok(p.primary_actions.some(a => a.status === 'OBSERVE'))
})

test('31 attribution/data block outranks growth event', () => {
  const p = plan({ canonicalData: canonical([creative()], { paginationComplete: false }), comparisonData: { previousDay: { grossRevenue: 500000 } } })
  assert.equal(p.primary_actions[0].action_type, 'DATA_QUALITY_INVESTIGATION')
})

test('32 low confidence prefers OBSERVE (no RECOMMEND/SAFE_TO_EXECUTE)', () => {
  const p = plan({ comparisonData: { previousDay: { grossRevenue: 800000, cost: 150000 } } })
  for (const a of p.primary_actions) assert.ok(!['RECOMMEND', 'SAFE_TO_EXECUTE'].includes(a.status))
})

test('33 incomplete data → DO_NOT_EXECUTE present', () => {
  const p = plan({ canonicalData: canonical([creative()], { paginationComplete: false }) }, {}, { existingActions: [ex({ action_type: 'BUDGET_CHANGE', objective: 'inc' })] })
  assert.ok(p.blocked_actions.some(a => a.status === 'DO_NOT_EXECUTE'))
})

test('34 maximum 3 primary actions', () => {
  const many = Array.from({ length: 8 }, (_, i) => ex({ objective: `obs${i}` }))
  const p = plan({}, {}, { existingActions: many })
  assert.equal(p.primary_actions.length, 3)
})

test('35 maximum 3 secondary observations', () => {
  const many = Array.from({ length: 10 }, (_, i) => ex({ objective: `obs${i}` }))
  const p = plan({}, {}, { existingActions: many })
  assert.ok(p.secondary_observations.length <= 3)
})

test('36 duplicate actions merge (union evidence + merge metadata)', () => {
  const dup = [ex({ objective: 'same', evidence_ids: ['a'] }), ex({ objective: 'same', evidence_ids: ['b'] })]
  const p = plan({}, {}, { existingActions: dup })
  const merged = all(p).find(a => a.merge && a.merge.merged_count === 2)
  assert.ok(merged)
  assert.deepEqual([...merged.evidence_ids].sort(), ['a', 'b'])
})

test('37 conflicting actions exposed', () => {
  const conf = [
    ex({ objective: 'increase_budget', action_type: 'BUDGET_CHANGE', direction: 'INCREASE', source_rule: 'r1' }),
    ex({ objective: 'decrease_budget', action_type: 'BUDGET_CHANGE', direction: 'DECREASE', source_rule: 'r2' }),
  ]
  const p = plan({}, {}, { existingActions: conf })
  assert.ok(p.conflicts.length >= 1)
})

test('38 expired action removed', () => {
  const p = plan({}, {}, { existingActions: [ex({ objective: 'stale', title: 'STALE', expiry_time: PAST })] })
  assert.ok(!all(p).some(a => a.title === 'STALE'))
})

test('39 existing cooldown respected', () => {
  const p = plan({}, {}, { existingActions: [ex({ objective: 'cool', action_type: 'CAMPAIGN_CHANGE', title: 'COOL' })], cooldowns: [{ scope_type: 'STORE', scope_id: 'store-A', action_type: 'CAMPAIGN_CHANGE', until: FUTURE }] })
  assert.ok(!p.primary_actions.some(a => a.title === 'COOL'))
  assert.ok(p.blocked_actions.some(a => a.title === 'COOL' && a.status === 'DO_NOT_EXECUTE'))
})

test('40 budget-like action requires approval', () => {
  const p = plan({}, {}, { existingActions: [ex({ objective: 'inc', action_type: 'BUDGET_CHANGE' })] })
  const a = all(p).find(x => x.action_type === 'BUDGET_CHANGE')
  assert.ok(a.approval_required); assert.equal(a.status, 'REQUIRE_APPROVAL')
})

test('41 target-ROI-like action requires approval', () => {
  const p = plan({}, {}, { existingActions: [ex({ objective: 'troi', action_type: 'TARGET_ROI_CHANGE' })] })
  const a = all(p).find(x => x.action_type === 'TARGET_ROI_CHANGE')
  assert.ok(a.approval_required); assert.equal(a.status, 'REQUIRE_APPROVAL')
})

test('42 missing Skills 5–8 handled', () => {
  const { s1, s2, s3, s4 } = outputs()
  const p = runSkill9({ skill1Output: s1, skill2Output: s2, skill3Output: s3, skill4Output: s4, generatedAt: GEN })
  assert.equal(p.skill_code, 'GMVMAX_SKILL_09')
})

test('43 every action has evidence field', () => { for (const a of all(plan())) assert.ok(Array.isArray(a.evidence_ids)) })
test('44 every action has expiry', () => { for (const a of all(plan())) assert.ok(a.expiry_time) })
test('45 every action has success metric', () => { for (const a of all(plan())) assert.ok(a.success_metric) })
test('46 every action has stop condition', () => { for (const a of all(plan())) assert.ok(a.stop_condition) })

test('47 execution_allowed=false (plan + every action)', () => {
  const p = plan()
  assert.equal(p.execution_allowed, false)
  for (const a of all(p)) assert.equal(a.execution_allowed, false)
})

test('48 no automatic execution', () => {
  for (const a of all(plan({}, {}, { existingActions: [ex({ action_type: 'BUDGET_CHANGE', objective: 'x' })] }))) assert.notEqual(a.status, 'SAFE_TO_EXECUTE')
})

test('49 workspace isolation', () => {
  const a = plan()
  assert.equal(a.workspace_id, 'ws-A')
})

test('50 idempotent rerun', () => {
  assert.equal(JSON.stringify(plan()), JSON.stringify(plan()))
})

test('51 Indonesian labels present', () => { for (const a of all(plan())) assert.ok(a.title && a.title.length) })
test('52 English labels present', () => { for (const a of all(plan())) assert.ok(a.title_en && a.title_en.length) })
