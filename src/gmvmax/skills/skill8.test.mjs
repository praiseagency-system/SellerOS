import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runSkill8 } from './skill8.mjs'

const daily = { date: '2026-07-21', workspace_id: 'ws1', store_id: 'store1' }
const audit = (o = {}) => ({ attribution_audit: { decision_readiness: o.readiness || 'OBSERVE_ONLY' } })

test('S8-2 no session data → readiness BLOCKED + DATA_INSUFFICIENT, no fabricated sessions', () => {
  const out = runSkill8({ dailyFacts: daily, skill2Output: audit(), campaignSettings: [], creatives: [] })
  assert.equal(out.readiness, 'BLOCKED')
  assert.equal(out.confidence, 'DATA_INSUFFICIENT')
  assert.deepEqual(out.sessions, [])
  assert.equal(out.recommendations[0].recommendation, 'COLLECT_MISSING_SESSION_DATA')
})

test('S8 detects LIVE activity from campaign name but still BLOCKED (no session data)', () => {
  const out = runSkill8({ dailyFacts: daily, skill2Output: audit(), campaignSettings: [{ campaign_id: 'c1', campaign_name: 'GMV MAX LIVE NEW' }], creatives: [] })
  assert.equal(out.live_activity_detected, true)
  assert.equal(out.readiness, 'BLOCKED')
  assert.deepEqual(out.sessions, [])   // §1/§3: tak mengarang sesi dari data store-wide
})

test('S8 does NOT infer LIVE from non-LIVE campaign data', () => {
  const out = runSkill8({ dailyFacts: daily, skill2Output: audit(), campaignSettings: [{ campaign_id: 'c1', campaign_name: 'Exotic Blue GMV Max' }], creatives: [{ campaignName: 'Exotic Blue GMV Max', grossRevenue: 999999 }] })
  assert.equal(out.live_activity_detected, false)
  assert.deepEqual(out.sessions, [])
})

test('S8-12 no automatic execution', () => {
  const out = runSkill8({ dailyFacts: daily, skill2Output: audit(), campaignSettings: [], creatives: [] })
  assert.equal(out.execution_allowed, false)
  for (const r of out.recommendations) assert.equal(r.execution_allowed, false)
  assert.ok(out.missing_data.includes('live_session_id'))
})
