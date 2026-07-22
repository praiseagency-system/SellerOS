import { test } from 'node:test'
import assert from 'node:assert/strict'
import { persistedSignature, stripVolatile } from './pipeline.mjs'

const base = () => ({
  skillCode: 'GMVMAX_SKILL_03', skillVersion: '1.0.0-draft',
  sourceSnapshotIds: ['imp-1'], ruleMeta: [{ rule_id: 'GMVMAX-S3-DATA-001', rule_version: '1.0.0-draft' }],
  payload: { skill_code: 'GMVMAX_SKILL_03', events: [{ event_type: 'GMV_COMPARISON', absolute_change: 100 }], generated_at: '2026-07-21T02:00:00Z', detected_at: 'x', expires_at: 'y', execution_allowed: false },
})

test('07 same input + versions → same signature (timestamps ignored)', () => {
  const a = persistedSignature(base())
  const b = { ...base(), payload: { ...base().payload, generated_at: '2099-01-01T00:00:00Z', expires_at: 'zzz' } }
  assert.equal(persistedSignature(b), a) // wall-clock does not affect signature
})

test('08 changed rule version → new signature', () => {
  const a = persistedSignature(base())
  const b = { ...base(), ruleMeta: [{ rule_id: 'GMVMAX-S3-DATA-001', rule_version: '1.1.0' }] }
  assert.notEqual(persistedSignature(b), a)
})

test('09 changed skill version → new signature', () => {
  const a = persistedSignature(base())
  assert.notEqual(persistedSignature({ ...base(), skillVersion: '2.0.0' }), a)
})

test('10 changed canonical content → new signature', () => {
  const a = persistedSignature(base())
  const b = { ...base(), payload: { ...base().payload, events: [{ event_type: 'GMV_COMPARISON', absolute_change: 999 }] } }
  assert.notEqual(persistedSignature(b), a)
})

test('14 history not overwritten: different content → different identity signature', () => {
  const day1 = persistedSignature(base())
  const day2 = persistedSignature({ ...base(), payload: { ...base().payload, events: [{ event_type: 'ROI_COMPARISON', absolute_change: 5 }] } })
  // Different signatures => different unique-index identity => new historical row (never overwrites).
  assert.notEqual(day1, day2)
})

test('stripVolatile removes *_at/*_time + deterministic_signature recursively', () => {
  const s = stripVolatile({ keep: 1, generated_at: 'x', expiry_time: 'y', deterministic_signature: 'z', nested: { detected_at: 'a', keep2: 2 } })
  assert.deepEqual(s, { keep: 1, nested: { keep2: 2 } })
})
