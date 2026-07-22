// GMV Max — SHARED SKILL CONTRACT (Phase 3A foundation).
// Implements docs/gmvmax-skills/00_SHARED_SKILL_CONTRACT.md v1.0.0-draft.
//
// Deterministic, pure, dependency-light. NO TikTok call, NO LLM, NO DB, NO
// canonical write, NO token/secret. `execution_allowed` is ALWAYS false.
// Types are documented via JSDoc (repo is JS); enums are frozen runtime objects.
import { createHash } from 'node:crypto'

export const CONTRACT_VERSION = '1.0.0-draft'
export const EXECUTION_ALLOWED = false // invariant utk seluruh fase saat ini

// ── Enum konstan (nilai stabil, English) ─────────────────────────────────────
export const SkillCode = Object.freeze({
  S1: 'GMVMAX_SKILL_01', S2: 'GMVMAX_SKILL_02', S3: 'GMVMAX_SKILL_03',
  S4: 'GMVMAX_SKILL_04', S5: 'GMVMAX_SKILL_05', S6: 'GMVMAX_SKILL_06',
  S7: 'GMVMAX_SKILL_07', S8: 'GMVMAX_SKILL_08', S9: 'GMVMAX_SKILL_09',
})
export const ActionStatus = Object.freeze({
  OBSERVE: 'OBSERVE', RECOMMEND: 'RECOMMEND', REQUIRE_APPROVAL: 'REQUIRE_APPROVAL',
  SAFE_TO_EXECUTE: 'SAFE_TO_EXECUTE', DO_NOT_EXECUTE: 'DO_NOT_EXECUTE',
})
export const Confidence = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', DATA_INSUFFICIENT: 'DATA_INSUFFICIENT' })
export const Severity = Object.freeze({ INFO: 'INFO', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' })
export const MeasurementLabel = Object.freeze({ MEASURED: 'MEASURED', DERIVED: 'DERIVED', INFERRED: 'INFERRED', UNKNOWN: 'UNKNOWN', NOT_MEASURABLE: 'NOT_MEASURABLE' })
export const ScopeType = Object.freeze({ WORKSPACE: 'WORKSPACE', STORE: 'STORE', CAMPAIGN: 'CAMPAIGN', PRODUCT: 'PRODUCT', CREATIVE: 'CREATIVE', AFFILIATE: 'AFFILIATE', LIVE_SESSION: 'LIVE_SESSION' })
export const DiagnosisLevel = Object.freeze({ CONFIRMED_DRIVER: 'CONFIRMED_DRIVER', LIKELY_DRIVER: 'LIKELY_DRIVER', CONTRIBUTING_FACTOR: 'CONTRIBUTING_FACTOR', CORRELATED_SIGNAL: 'CORRELATED_SIGNAL', INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE' })

const inEnum = (enumObj, v) => Object.values(enumObj).includes(v)

// ── Tanda tangan deterministik (§9) ──────────────────────────────────────────
// Dari field STABIL saja (bukan narasi title/summary). Fact dinormalkan & diurut.
// Perubahan angka/fakta/rule → signature berubah; perubahan kata-kata → TIDAK.
function normalizeFacts(facts = []) {
  return [...facts]
    .map(f => ({ metric: f.metric, value: f.value ?? null, unit: f.unit ?? null, measurement_label: f.measurement_label ?? null, scope_type: f.scope_type ?? null, scope_id: f.scope_id ?? null, src: [...(f.source_snapshot_ids || [])].sort() }))
    .sort((a, b) => (a.metric + a.scope_id).localeCompare(b.metric + b.scope_id))
}
export function deterministicSignature(o) {
  const stable = {
    skill_code: o.skill_code, skill_version: o.skill_version,
    workspace_id: o.workspace_id, store_id: o.store_id, date: o.date,
    scope_type: o.scope_type, scope_id: o.scope_id,
    source_snapshot_ids: [...(o.source_snapshot_ids || [])].sort(),
    rule_ids: [...(o.rule_ids || [])].sort(),
    facts: normalizeFacts(o.facts),
  }
  return 'sha256:' + createHash('sha256').update(JSON.stringify(stable)).digest('hex')
}

// ── Factory SkillOutput ──────────────────────────────────────────────────────
// Mengisi default, memaksa execution_allowed=false, menghitung signature.
export function makeSkillOutput(p) {
  const base = {
    skill_code: p.skill_code, skill_version: p.skill_version,
    workspace_id: p.workspace_id, store_id: p.store_id, date: p.date,
    timezone: p.timezone ?? 'Asia/Jakarta', currency: p.currency ?? 'IDR',
    scope_type: p.scope_type ?? ScopeType.STORE, scope_id: p.scope_id ?? p.store_id,
    status: p.status ?? ActionStatus.OBSERVE, severity: p.severity ?? Severity.INFO, confidence: p.confidence ?? Confidence.DATA_INSUFFICIENT,
    title: p.title ?? '', summary: p.summary ?? '',
    facts: p.facts ?? [], evidence: p.evidence ?? [], comparisons: p.comparisons ?? [],
    detected_events: p.detected_events ?? [], diagnoses: p.diagnoses ?? [], recommendations: p.recommendations ?? [],
    missing_data: p.missing_data ?? [], limitations: p.limitations ?? [], risks: p.risks ?? [],
    generated_at: p.generated_at ?? new Date().toISOString(), expires_at: p.expires_at ?? null,
    source_snapshot_ids: p.source_snapshot_ids ?? [], rule_ids: p.rule_ids ?? [],
  }
  base.deterministic_signature = deterministicSignature(base)
  base.execution_allowed = false // invariant — tak bisa di-override
  return base
}

// ── Validasi kontrak (§13 boundary + enum + execution_allowed) ───────────────
const FORBIDDEN_KEYS = ['access_token', 'refresh_token', 'token', 'client_secret', 'raw_mcp', 'raw_payload', 'service_role_key']
export function validateSkillOutput(o) {
  const errors = []
  if (o.execution_allowed !== false) errors.push('execution_allowed WAJIB false')
  for (const [k, en] of [['skill_code', SkillCode], ['status', ActionStatus], ['severity', Severity], ['confidence', Confidence], ['scope_type', ScopeType]])
    if (!inEnum(en, o[k])) errors.push(`enum tak valid: ${k}=${o[k]}`)
  for (const f of ['workspace_id', 'store_id', 'date', 'skill_version']) if (!o[f]) errors.push(`field wajib kosong: ${f}`)
  if (!o.deterministic_signature) errors.push('deterministic_signature wajib')
  // boundary keamanan: tak boleh ada token/payload mentah di mana pun (rekursif)
  const blob = JSON.stringify(o).toLowerCase()
  for (const bad of FORBIDDEN_KEYS) if (blob.includes(`"${bad}"`)) errors.push(`field terlarang: ${bad}`)
  return { ok: errors.length === 0, errors }
}

export { inEnum }
