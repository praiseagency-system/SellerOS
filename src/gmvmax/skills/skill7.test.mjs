import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runSkill7 } from './skill7.mjs'

const daily = { date: '2026-07-21', workspace_id: 'ws1', store_id: 'store1' }
const audit = (o) => ({ attribution_audit: { decision_readiness: o.readiness || 'OBSERVE_ONLY', attribution_confidence: o.conf || 'MEDIUM', late_attribution_risk: { risk: o.late || 'LOW' } } })
const creatives = [
  { creativeType: 'Video', videoId: 'v1', status: 'DELIVERING', tiktokAccount: 'AffA', productId: 'p1', grossRevenue: 80000 },
  { creativeType: 'Video', videoId: 'v2', status: 'Learning', tiktokAccount: 'AffA', productId: 'p1', grossRevenue: 20000 },
  { creativeType: 'Video', videoId: 'v3', status: 'DELIVERING', tiktokAccount: 'AffB', productId: 'p2', grossRevenue: 40000 },
]

test('S7-1 healthy supply → supply_health facts + OBSERVE', () => {
  const out = runSkill7({ dailyFacts: daily, skill2Output: audit({}), creatives })
  assert.equal(out.supply_health.creative_count, 3)
  assert.equal(out.supply_health.delivering, 2)
  assert.equal(out.supply_health.learning, 1)
  assert.equal(out.supply_health.affiliate_count, 2)
  assert.equal(out.supply_health.product_count, 2)
  assert.equal(out.recommendations[0].recommendation, 'OBSERVE')
})

test('S7 affiliate concentration observed (AffA top: 100k/140k)', () => {
  const out = runSkill7({ dailyFacts: daily, skill2Output: audit({}), creatives })
  assert.equal(out.supply_health.top_affiliate, 'AffA')
  assert.ok(out.supply_health.top_affiliate_share > 0.7 && out.supply_health.top_affiliate_share < 0.72)
})

test('S7-11 attribution blocked → DATA_INSUFFICIENT', () => {
  const out = runSkill7({ dailyFacts: daily, skill2Output: audit({ readiness: 'BLOCKED', conf: 'DATA_INSUFFICIENT' }), creatives })
  assert.equal(out.status, 'DO_NOT_EXECUTE')
  assert.equal(out.recommendations[0].recommendation, 'DATA_INSUFFICIENT')
})

test('S7-12 no automatic execution + winner/fatigue disabled (TBD)', () => {
  const out = runSkill7({ dailyFacts: daily, skill2Output: audit({}), creatives })
  assert.equal(out.execution_allowed, false)
  for (const r of out.recommendations) assert.equal(r.execution_allowed, false)
  assert.ok(out.missing_data.some(m => /winner_thresholds/.test(m)))
  assert.ok(out.missing_data.some(m => /fatigue/.test(m)))
})

test('S7 no creatives → DATA_INSUFFICIENT', () => {
  const out = runSkill7({ dailyFacts: daily, skill2Output: audit({}), creatives: [] })
  assert.equal(out.recommendations[0].recommendation, 'DATA_INSUFFICIENT')
  assert.equal(out.supply_health.creative_count, 0)
})
