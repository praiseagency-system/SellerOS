import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RULES, getRule, rulesForSkill, isApproved, enabledRules, assertNoTbdApproved, RuleStatus, TBD, RuleType, ruleType, structuralRules, businessRules, computeRuntimeEligibility, assertRuleTypeConsistency, isRunnableNow, ruleMetaFor } from './ruleRegistry.mjs'

test('semua rule punya id unik + rule_version + skill_code + status valid', () => {
  const ids = new Set()
  for (const r of RULES) {
    assert.ok(r.rule_id && /^GMVMAX-S[0-9]-/.test(r.rule_id), `id: ${r.rule_id}`)
    assert.ok(!ids.has(r.rule_id), `duplikat id: ${r.rule_id}`); ids.add(r.rule_id)
    assert.ok(r.rule_version, `rule_version kosong: ${r.rule_id}`)
    assert.ok(Object.values(RuleStatus).includes(r.status), `status tak valid: ${r.rule_id}`)
  }
})

test('registry awal memuat rule wajib dari spec §4 (contoh kunci)', () => {
  for (const id of ['GMVMAX-S1-STRUCTURE-001', 'GMVMAX-S2-RECONCILE-001', 'GMVMAX-S4-CAUSE-005', 'GMVMAX-S9-EXECUTION-001'])
    assert.ok(getRule(id), `hilang: ${id}`)
})

test('INVARIAN §3: tak ada rule ber-TBD yang APPROVED', () => {
  assert.doesNotThrow(() => assertNoTbdApproved())
  // dan memang: nol rule APPROVED di Phase 3A (semua DRAFT/REVIEW_REQUIRED)
  assert.equal(RULES.filter(r => r.status === RuleStatus.APPROVED).length, 0)
})

test('rule ber-TBD tak boleh enabled kecuali murni invariant (S9-EXECUTION)', () => {
  for (const r of enabledRules()) {
    const hasTbd = JSON.stringify(r).includes(TBD)
    assert.ok(!hasTbd, `rule enabled masih TBD: ${r.rule_id}`)
  }
})

test('Skill 5–8 = SPEC ONLY (DRAFT, disabled)', () => {
  for (const sc of ['GMVMAX_SKILL_05', 'GMVMAX_SKILL_06', 'GMVMAX_SKILL_07', 'GMVMAX_SKILL_08'])
    for (const r of rulesForSkill(sc)) {
      assert.equal(r.status, RuleStatus.DRAFT, `${r.rule_id} harus DRAFT`)
      assert.equal(r.enabled, false, `${r.rule_id} harus disabled`)
    }
})

test('isApproved false utk semua (belum ada persetujuan bisnis)', () => {
  assert.equal(RULES.some(r => isApproved(r.rule_id)), false)
})

test('rule-type separation: structural = no TBD, business = carries TBD', () => {
  for (const r of structuralRules()) assert.ok(!JSON.stringify(r).includes(TBD), `structural masih TBD: ${r.rule_id}`)
  for (const r of businessRules()) assert.ok(JSON.stringify(r).includes(TBD), `business tanpa TBD: ${r.rule_id}`)
  assert.equal(structuralRules().length + businessRules().length, RULES.length)
})

test('setiap BUSINESS_DECISION_RULE tetap DRAFT/REVIEW_REQUIRED (tak APPROVED, tak enabled produksi)', () => {
  for (const r of businessRules()) {
    assert.ok([RuleStatus.DRAFT, RuleStatus.REVIEW_REQUIRED].includes(r.status), `${r.rule_id} status ${r.status}`)
    assert.equal(ruleType(r), RuleType.BUSINESS_DECISION_RULE)
  }
})

test('rulesForSkill mengelompokkan benar', () => {
  assert.ok(rulesForSkill('GMVMAX_SKILL_01').length >= 6)
  assert.ok(rulesForSkill('GMVMAX_SKILL_02').length >= 11)
})

// ── Increment 2C Part 12: explicit rule-type model ───────────────────────────
test('P12.1 explicit structural rule (field-authoritative, runnable now)', () => {
  const r = getRule('GMVMAX-S1-STRUCTURE-001')
  assert.equal(r.rule_type, RuleType.STRUCTURAL_INVARIANT)
  assert.equal(r.configuration_complete, true)
  assert.equal(r.runtime_eligible, true)
  assert.equal(isRunnableNow('GMVMAX-S1-STRUCTURE-001'), true)
})

test('P12.2 explicit business rule (not runnable while unapproved/TBD)', () => {
  const r = getRule('GMVMAX-S3-PERF-001')
  assert.equal(r.rule_type, RuleType.BUSINESS_DECISION_RULE)
  assert.equal(r.configuration_complete, false)
  assert.equal(r.runtime_eligible, false)
})

test('P12.3 completed business threshold does NOT become structural', () => {
  const base = getRule('GMVMAX-S3-PERF-001')
  const filled = { ...base, threshold: 0.15, expiry: 'PT24H', status: RuleStatus.APPROVED, enabled: true }
  assert.equal(filled.rule_type, RuleType.BUSINESS_DECISION_RULE) // type unchanged
  assert.equal(computeRuntimeEligibility(filled), true) // but now eligible
})

test('P12.4 unapproved business rule cannot run', () => {
  for (const r of businessRules()) if (r.status !== RuleStatus.APPROVED) assert.equal(r.runtime_eligible, false, r.rule_id)
})

test('P12.5 approved + complete + enabled business rule may run', () => {
  const r = { rule_id: 'X', rule_type: RuleType.BUSINESS_DECISION_RULE, status: RuleStatus.APPROVED, enabled: true, threshold: 0.1, expiry: 'PT24H' }
  assert.equal(computeRuntimeEligibility(r), true)
  const notEnabled = { ...r, enabled: false }
  assert.equal(computeRuntimeEligibility(notEnabled), false)
})

test('P12.6 structural/business partition + consistency', () => {
  assert.equal(structuralRules().length + businessRules().length, RULES.length)
  assert.equal(new Set([...structuralRules(), ...businessRules()]).size, RULES.length)
  assert.doesNotThrow(() => assertRuleTypeConsistency())
})

test('P12.7 rule_type persisted in output metadata (rule_id+version+type)', () => {
  const meta = ruleMetaFor(['GMVMAX-S1-STRUCTURE-001', 'GMVMAX-S3-PERF-001'])
  assert.equal(meta[0].rule_type, RuleType.STRUCTURAL_INVARIANT)
  assert.equal(meta[1].rule_type, RuleType.BUSINESS_DECISION_RULE)
  for (const m of meta) { assert.ok(m.rule_id); assert.ok(m.rule_version) }
})
