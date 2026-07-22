import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runSkill6 } from './skill6.mjs'

const daily = { date: '2026-07-21', workspace_id: 'ws1', store_id: 'store1' }
const audit = (o) => ({ attribution_audit: { decision_readiness: o.readiness || 'OBSERVE_ONLY', attribution_confidence: o.conf || 'MEDIUM', late_attribution_risk: { risk: o.late || 'LOW' } } })
const settings = [
  { campaign_id: 'c1', campaign_name: 'Alpha', budget: 100000 },
  { campaign_id: 'c2', campaign_name: 'Beta', budget: 50000 },
]
const creatives = [
  { campaignId: 'c1', cost: 10000, grossRevenue: 80000, skuOrders: 8 },  // roi 8
  { campaignId: 'c2', cost: 10000, grossRevenue: 30000, skuOrders: 3 },  // roi 3
]

test('S6-1 attribution blocked → HOLD, no reallocation, no proposals', () => {
  const out = runSkill6({ dailyFacts: daily, skill2Output: audit({ readiness: 'BLOCKED', conf: 'DATA_INSUFFICIENT' }), campaignSettings: settings, creatives })
  assert.equal(out.status, 'DO_NOT_EXECUTE')
  for (const r of out.recommendations) { assert.equal(r.classification, 'HOLD'); assert.equal(r.proposed_budget, null); assert.equal(r.proposed_change_percent, null) }
})

test('S6-11/12 no exact proposal + no execution ever', () => {
  const out = runSkill6({ dailyFacts: daily, skill2Output: audit({}), campaignSettings: settings, creatives })
  assert.equal(out.execution_allowed, false)
  for (const r of out.recommendations) { assert.equal(r.proposed_budget, null); assert.equal(r.proposed_change_percent, null); assert.equal(r.approval_required, true); assert.equal(r.execution_allowed, false) }
})

test('S6 ranking observasional by ROI (c1 roi8 > c2 roi3)', () => {
  const out = runSkill6({ dailyFacts: daily, skill2Output: audit({}), campaignSettings: settings, creatives })
  const c1 = out.recommendations.find(r => r.scope_id === 'c1')
  const c2 = out.recommendations.find(r => r.scope_id === 'c2')
  assert.equal(c1.rank, 1)
  assert.equal(c2.rank, 2)
  assert.equal(c1.observed.roi, 8)
  assert.equal(c1.current_budget, 100000)
})

test('S6 exposes missing business decisions', () => {
  const out = runSkill6({ dailyFacts: daily, skill2Output: audit({}), campaignSettings: settings, creatives })
  assert.ok(out.missing_data.some(m => /break_even/.test(m)))
  assert.ok(out.missing_data.some(m => /caps/.test(m)))
})

test('S6 no settings/creatives → empty recs', () => {
  const out = runSkill6({ dailyFacts: daily, skill2Output: audit({}), campaignSettings: [], creatives: [] })
  assert.equal(out.recommendation_count, 0)
})
