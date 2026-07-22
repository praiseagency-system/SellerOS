import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSkillOutput, deterministicSignature, validateSkillOutput, SkillCode, ActionStatus, Severity, Confidence, ScopeType, EXECUTION_ALLOWED } from './contract.mjs'

const base = () => ({
  skill_code: SkillCode.S1, skill_version: '1.0.0-draft', workspace_id: 'ws', store_id: 'store', date: '2026-07-20',
  scope_type: ScopeType.STORE, scope_id: 'store', source_snapshot_ids: ['imp-1'], rule_ids: ['GMVMAX-S1-STRUCTURE-001'],
  facts: [{ metric: 'revenue', value: 1000, unit: 'IDR', measurement_label: 'MEASURED', scope_type: 'STORE', scope_id: 'store', source_snapshot_ids: ['imp-1'] }],
})

test('execution_allowed selalu false (tak bisa di-override)', () => {
  const o = makeSkillOutput({ ...base(), execution_allowed: true })
  assert.equal(o.execution_allowed, false)
  assert.equal(EXECUTION_ALLOWED, false)
})

test('signature deterministik: input sama → signature sama', () => {
  assert.equal(makeSkillOutput(base()).deterministic_signature, makeSkillOutput(base()).deterministic_signature)
})

test('signature berubah bila FAKTA berubah', () => {
  const a = makeSkillOutput(base())
  const p = base(); p.facts[0].value = 2000
  assert.notEqual(a.deterministic_signature, makeSkillOutput(p).deterministic_signature)
})

test('signature TIDAK berubah bila hanya NARASI (title/summary) berubah', () => {
  const a = makeSkillOutput({ ...base(), title: 'A', summary: 'x' })
  const b = makeSkillOutput({ ...base(), title: 'B beda total', summary: 'y beda' })
  assert.equal(a.deterministic_signature, b.deterministic_signature)
})

test('signature invarian terhadap urutan facts & source ids', () => {
  const p = base()
  p.facts = [...p.facts, { metric: 'cost', value: 500, unit: 'IDR', measurement_label: 'MEASURED', scope_type: 'STORE', scope_id: 'store', source_snapshot_ids: ['imp-1'] }]
  const s1 = deterministicSignature(p)
  const p2 = { ...p, facts: [...p.facts].reverse(), source_snapshot_ids: ['imp-1'] }
  assert.equal(deterministicSignature(p2), s1)
})

test('validateSkillOutput: output valid lolos', () => {
  const r = validateSkillOutput(makeSkillOutput(base()))
  assert.equal(r.ok, true, r.errors.join(', '))
})

test('validateSkillOutput: enum tak valid ditolak', () => {
  const o = makeSkillOutput(base()); o.status = 'NOPE'
  assert.equal(validateSkillOutput(o).ok, false)
})

test('validateSkillOutput: field terlarang (token/payload) ditolak', () => {
  const o = makeSkillOutput(base()); o.access_token = 'secret'
  const r = validateSkillOutput(o)
  assert.equal(r.ok, false)
  assert.ok(r.errors.some(e => e.includes('terlarang')))
})

test('default status OBSERVE + confidence DATA_INSUFFICIENT (konservatif)', () => {
  const o = makeSkillOutput(base())
  assert.equal(o.status, ActionStatus.OBSERVE)
  assert.equal(o.confidence, Confidence.DATA_INSUFFICIENT)
  assert.equal(o.severity, Severity.INFO)
})
