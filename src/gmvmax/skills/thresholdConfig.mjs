// GMV Max — BUSINESS THRESHOLD CONFIG (bridge TBD → APPROVED).
// Tempat owner MENGISI ambang bisnis yang sudah diputuskan (lihat
// docs/gmvmax-skills/97_BUSINESS_THRESHOLD_DECISIONS.md). Selama KOSONG: tak ada
// business rule yang aktif — semua tetap DRAFT/disabled (perilaku produksi saat ini).
// Invariant dijaga: nilai TBD ditolak; rule yang di-approve tak boleh menyisakan TBD.
// Modul ini TIDAK memutasi ruleRegistry.RULES — mengembalikan VIEW baru.
import { RULES, RuleStatus, RuleType, TBD, computeRuntimeEligibility } from './ruleRegistry.mjs'

// DEFAULT KOSONG — jangan isi tanpa keputusan bisnis eksplisit.
// Bentuk: { [rule_id]: { threshold?, minimum_sample?, comparison_window?, enabled? } }
export const APPROVED_THRESHOLDS = {}

const containsTbd = (v) => JSON.stringify(v ?? null).includes(TBD)
// Saat approve: field TBD yang TAK diisi owner → resolve ke null ("tak ada
// batasan dari dimensi itu"). Nilai owner menang; invariant no-TBD terjaga.
const clearTbd = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === TBD ? null : v]))

// Config valid = tiap patch punya nilai konkret (threshold/minimum_sample) & tanpa TBD.
export function assertConfigValid(config = APPROVED_THRESHOLDS) {
  for (const [id, patch] of Object.entries(config)) {
    if (containsTbd(patch)) throw new Error(`THRESHOLD_CONFIG: ${id} masih memuat ${TBD}`)
    if (patch.threshold === undefined && patch.minimum_sample === undefined)
      throw new Error(`THRESHOLD_CONFIG: ${id} tanpa threshold/minimum_sample konkret`)
  }
  return true
}

// Terapkan config → business rule jadi APPROVED + enabled + threshold konkret.
// Structural invariant TAK tersentuh; rule tak-di-config tetap apa adanya (DRAFT).
// Menolak (throw) bila hasil merge masih menyisakan TBD → mustahil APPROVE ber-TBD.
export function withApprovedThresholds(config = APPROVED_THRESHOLDS, rules = RULES) {
  assertConfigValid(config)
  return rules.map(r => {
    const patch = config[r.rule_id]
    if (!patch || r.rule_type !== RuleType.BUSINESS_DECISION_RULE) return r
    const merged = clearTbd({ ...r, ...patch, status: RuleStatus.APPROVED, enabled: patch.enabled ?? true })
    if (containsTbd(merged)) throw new Error(`THRESHOLD_CONFIG: ${r.rule_id} masih menyisakan ${TBD} setelah merge`) // defensif
    merged.configuration_complete = true
    merged.runtime_eligible = computeRuntimeEligibility(merged)
    return merged
  })
}

// Business rule yang AKTIF menurut config saat ini (kosong bila belum ada keputusan).
export const approvedBusinessRules = (config = APPROVED_THRESHOLDS) =>
  withApprovedThresholds(config).filter(r => r.rule_type === RuleType.BUSINESS_DECISION_RULE && r.status === RuleStatus.APPROVED)
