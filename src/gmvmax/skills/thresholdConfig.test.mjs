import { test } from 'node:test'
import assert from 'node:assert/strict'
import { APPROVED_THRESHOLDS, assertConfigValid, withApprovedThresholds, approvedBusinessRules } from './thresholdConfig.mjs'
import { RULES, getRule, RuleStatus, TBD } from './ruleRegistry.mjs'

test('default KOSONG → tak ada business rule aktif (perilaku produksi terjaga)', () => {
  assert.deepEqual(APPROVED_THRESHOLDS, {})
  assert.equal(approvedBusinessRules().length, 0)
})

test('isi threshold S3-PERF-001 → rule jadi APPROVED + runtime_eligible', () => {
  const cfg = { 'GMVMAX-S3-PERF-001': { threshold: { down_medium: 0.2, down_high: 0.35 }, comparison_window: 'D-1' } }
  const view = withApprovedThresholds(cfg)
  const r = view.find(x => x.rule_id === 'GMVMAX-S3-PERF-001')
  assert.equal(r.status, RuleStatus.APPROVED)
  assert.equal(r.runtime_eligible, true)
  assert.equal(r.configuration_complete, true)
})

test('rule lain (tak di-config) tetap DRAFT/disabled', () => {
  const cfg = { 'GMVMAX-S3-PERF-001': { threshold: { x: 1 } } }
  const view = withApprovedThresholds(cfg)
  const eff = view.find(x => x.rule_id === 'GMVMAX-S3-EFF-001')
  assert.equal(eff.status, RuleStatus.DRAFT)
  assert.equal(eff.runtime_eligible, false)
})

test('nilai TBD di config ditolak', () => {
  assert.throws(() => assertConfigValid({ 'GMVMAX-S3-PERF-001': { threshold: TBD } }), /THRESHOLD_CONFIG/)
})

test('config tanpa threshold/minimum_sample ditolak', () => {
  assert.throws(() => assertConfigValid({ 'GMVMAX-S3-PERF-001': { comparison_window: 'D-1' } }), /tanpa threshold/)
})

test('menarget structural invariant → diabaikan (tak diubah)', () => {
  const cfg = { 'GMVMAX-S1-STRUCTURE-001': { threshold: { x: 1 } } }
  const view = withApprovedThresholds(cfg)
  const s = view.find(x => x.rule_id === 'GMVMAX-S1-STRUCTURE-001')
  assert.notEqual(s.status, RuleStatus.APPROVED) // structural tak di-approve lewat threshold config
})

test('TIDAK memutasi RULES asli (registry tetap DRAFT)', () => {
  withApprovedThresholds({ 'GMVMAX-S3-PERF-001': { threshold: { x: 1 } } })
  assert.equal(getRule('GMVMAX-S3-PERF-001').status, RuleStatus.DRAFT)
  assert.equal(RULES.find(r => r.rule_id === 'GMVMAX-S3-PERF-001').runtime_eligible, false)
})
