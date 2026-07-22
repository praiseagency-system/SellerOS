import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runSkill5 } from './skill5.mjs'

const daily = { date: '2026-07-21', workspace_id: 'ws1', store_id: 'store1' }
const audit = (o) => ({ attribution_audit: { decision_readiness: o.readiness || 'OBSERVE_ONLY', attribution_confidence: o.conf || 'MEDIUM', late_attribution_risk: { risk: o.late || 'LOW' } } })
const camp = (o = {}) => ({ campaign_id: o.id || 'c1', campaign_name: o.name || 'Camp', roas_bid: o.bid ?? 8, operation_status: 'ENABLE', roi_protection_enabled: o.rp || false, promotion_type: o.promo || 'PRODUCT_GMV_MAX', auto_budget: { auto_budget_enabled: o.abi || false } })

test('S5-1 attribution blocked → DO_NOT_CHANGE + execution false', () => {
  const out = runSkill5({ dailyFacts: daily, skill2Output: audit({ readiness: 'BLOCKED', conf: 'DATA_INSUFFICIENT' }), campaignSettings: [camp()] })
  assert.equal(out.status, 'DO_NOT_EXECUTE')
  assert.equal(out.recommendations[0].recommendation, 'DO_NOT_CHANGE')
  assert.equal(out.execution_allowed, false)
  assert.equal(out.recommendations[0].execution_allowed, false)
})

test('S5-2 late attribution high → OBSERVE', () => {
  const out = runSkill5({ dailyFacts: daily, skill2Output: audit({ late: 'HIGH' }), campaignSettings: [camp()] })
  assert.equal(out.recommendations[0].recommendation, 'OBSERVE')
})

test('S5-5 healthy campaign → HOLD, proposed_value null, approval required', () => {
  const out = runSkill5({ dailyFacts: daily, skill2Output: audit({}), campaignSettings: [camp()] })
  const r = out.recommendations[0]
  assert.equal(r.recommendation, 'HOLD')
  assert.equal(r.proposed_value, null)
  assert.equal(r.approval_required, true)
  assert.equal(r.current_target_roi, 8)
})

test('S5-10 auto budget increase → risk noted', () => {
  const out = runSkill5({ dailyFacts: daily, skill2Output: audit({}), campaignSettings: [camp({ abi: true })] })
  assert.ok(out.recommendations[0].risks.some(r => /Auto Budget/i.test(r)))
  assert.ok(out.recommendations[0].current_mode.includes('AutoBudget'))
})

test('S5-12 no automatic execution anywhere + no proposed value', () => {
  const out = runSkill5({ dailyFacts: daily, skill2Output: audit({}), campaignSettings: [camp({ id: 'a' }), camp({ id: 'b', bid: 6 })] })
  assert.equal(out.execution_allowed, false)
  for (const r of out.recommendations) { assert.equal(r.execution_allowed, false); assert.equal(r.proposed_value, null); assert.equal(r.approval_required, true) }
})

test('S5 no settings → empty recs + missing campaign_settings', () => {
  const out = runSkill5({ dailyFacts: daily, skill2Output: audit({}), campaignSettings: [] })
  assert.equal(out.recommendation_count, 0)
  assert.ok(out.missing_data.includes('campaign_settings'))
})
