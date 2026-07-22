// GMV Max — CENTRAL RULE REGISTRY (Phase 3A foundation, hardened Increment 2C).
// Implements docs/gmvmax-skills/90_RULE_REGISTRY.md v1.0.0-draft.
//
// Single source of thresholds/decision-logic (no scattered magic numbers).
// Business thresholds = 'TBD_BUSINESS_DECISION' (never fill without a business
// decision). Rule TYPE is now an EXPLICIT field (rule_type) — NOT inferred from
// the presence of TBD. Inference is kept only as a consistency CHECK.
export const RULE_REGISTRY_VERSION = '1.0.0-draft'
export const TBD = 'TBD_BUSINESS_DECISION'

export const RuleStatus = Object.freeze({ DRAFT: 'DRAFT', REVIEW_REQUIRED: 'REVIEW_REQUIRED', APPROVED: 'APPROVED', DEPRECATED: 'DEPRECATED' })
export const RuleType = Object.freeze({ STRUCTURAL_INVARIANT: 'STRUCTURAL_INVARIANT', BUSINESS_DECISION_RULE: 'BUSINESS_DECISION_RULE' })

// Low-level factory. `rule_type` is REQUIRED and authoritative.
function rule(rule_id, skill_code, name, o = {}) {
  return {
    rule_id, rule_version: o.rule_version ?? '1.0.0-draft', skill_code, name,
    rule_type: o.rule_type, // explicit; validated for consistency below
    description: o.description ?? name,
    required_metrics: o.required_metrics ?? [], optional_metrics: o.optional_metrics ?? [],
    comparison_window: o.comparison_window ?? null, minimum_sample: o.minimum_sample ?? null,
    threshold: 'threshold' in o ? o.threshold : TBD,
    confidence_logic: o.confidence_logic ?? 'TBD', severity_logic: o.severity_logic ?? 'TBD',
    cooldown: o.cooldown ?? null, expiry: 'expiry' in o ? o.expiry : TBD,
    enabled: o.enabled ?? false, business_owner: o.business_owner ?? 'praise-ops',
    status: o.status ?? RuleStatus.DRAFT,
  }
}
// STRUCTURAL_INVARIANT: deterministic, no business threshold. Runnable now →
// enabled + REVIEW_REQUIRED (framework-allowlisted), threshold concrete/null,
// no expiry TBD.
const si = (id, skill, name, o = {}) => rule(id, skill, name, {
  rule_type: RuleType.STRUCTURAL_INVARIANT, status: o.status ?? RuleStatus.REVIEW_REQUIRED,
  enabled: o.enabled ?? true, threshold: 'threshold' in o ? o.threshold : null, expiry: 'expiry' in o ? o.expiry : null,
  confidence_logic: o.confidence_logic ?? 'structural', severity_logic: o.severity_logic ?? 'structural', ...o,
})
// BUSINESS_DECISION_RULE: needs approved threshold. Stays DRAFT + disabled until
// a business decision fills the threshold AND it is approved.
const bd = (id, skill, name, o = {}) => rule(id, skill, name, {
  rule_type: RuleType.BUSINESS_DECISION_RULE, status: o.status ?? RuleStatus.DRAFT,
  enabled: o.enabled ?? false, ...o,
})

const RAW = [
  // ── Skill 1 — structure / data reliability ─────────────────────────────────
  si('GMVMAX-S1-STRUCTURE-001', 'GMVMAX_SKILL_01', 'Snapshot terstruktur lengkap (import+creatives ada)'),
  si('GMVMAX-S1-SOURCE-001', 'GMVMAX_SKILL_01', 'Sumber snapshot tercatat (source_snapshot_ids non-kosong)'),
  si('GMVMAX-S1-PAGINATION-001', 'GMVMAX_SKILL_01', 'Paginasi lengkap (bukan MAX_PAGES_EXCEEDED)', { threshold: { max_pages: 200 } }),
  bd('GMVMAX-S1-FRESHNESS-001', 'GMVMAX_SKILL_01', 'Kesegaran snapshot (umur vs tanggal target)', { threshold: TBD }),
  si('GMVMAX-S1-CURRENCY-001', 'GMVMAX_SKILL_01', 'Mata uang konsisten (IDR)'),
  si('GMVMAX-S1-TIMEZONE-001', 'GMVMAX_SKILL_01', 'Zona waktu konsisten (Asia/Jakarta)'),
  // ── Skill 2 — attribution reliability audit (V1) ───────────────────────────
  si('GMVMAX-S2-COMPLETE-001', 'GMVMAX_SKILL_02', 'Kelengkapan data laporan per (advertiser,store,date)'),
  si('GMVMAX-S2-PAGINATION-001', 'GMVMAX_SKILL_02', 'Paginasi report lengkap (fail-explicit)', { threshold: { max_pages: 200 } }),
  si('GMVMAX-S2-RECONCILE-001', 'GMVMAX_SKILL_02', 'Rekonsiliasi kanonik vs Σ per-sumber (EXACT, IDR ternormalisasi)'),
  bd('GMVMAX-S2-LATE-001', 'GMVMAX_SKILL_02', 'Deteksi late-attribution drift (magnitudo risiko)', { comparison_window: 'same-date re-pull', threshold: TBD }),
  bd('GMVMAX-S2-MATURITY-001', 'GMVMAX_SKILL_02', 'Kematangan data (batas jendela jam)', { threshold: TBD }),
  si('GMVMAX-S2-INCREMENTAL-001', 'GMVMAX_SKILL_02', 'Tanpa eksperimen → incrementality NOT_MEASURABLE (invarian)'),
  si('GMVMAX-S2-ORGANIC-001', 'GMVMAX_SKILL_02', 'Tanpa data organik → overlap UNKNOWN/NOT_MEASURABLE (invarian)'),
  si('GMVMAX-S2-TRANSITION-001', 'GMVMAX_SKILL_02', 'Transisi/migrasi advertiser (LEGACY inactive dipertahankan di lineage)'),
  si('GMVMAX-S2-BLOCK-001', 'GMVMAX_SKILL_02', 'Blokir keputusan bila data tak lengkap (missing_data→BLOCK)'),
  si('GMVMAX-S2-OBSERVE-001', 'GMVMAX_SKILL_02', 'Downgrade ke OBSERVE saat confidence rendah'),
  si('GMVMAX-S2-DOWNSTREAM-001', 'GMVMAX_SKILL_02', 'Propagasi kendala keandalan ke skill hilir (gating)'),
  // ── Skill 3 — control tower (magnitudo = ambang bisnis TBD) ─────────────────
  bd('GMVMAX-S3-PERF-001', 'GMVMAX_SKILL_03', 'Pergerakan GMV material (ambang %)', { comparison_window: 'D-1/D-7' }),
  bd('GMVMAX-S3-EFF-001', 'GMVMAX_SKILL_03', 'Pergerakan ROI material (ambang %)', { comparison_window: 'D-1/D-7' }),
  bd('GMVMAX-S3-DELIVERY-001', 'GMVMAX_SKILL_03', 'Utilisasi budget rendah (ambang)'),
  bd('GMVMAX-S3-CREATIVE-001', 'GMVMAX_SKILL_03', 'Deklinasi pasokan kreatif (ambang)'),
  bd('GMVMAX-S3-PRODUCT-001', 'GMVMAX_SKILL_03', 'Spend tanpa order (sampel minimum)', { minimum_sample: TBD }),
  bd('GMVMAX-S3-CONCENTRATION-001', 'GMVMAX_SKILL_03', 'Risiko konsentrasi (ambang share)'),
  si('GMVMAX-S3-DATA-001', 'GMVMAX_SKILL_03', 'Event kualitas data (dari Skill 1/2)'),
  // ── Skill 4 — root cause (diagnosis; evidence-based) ───────────────────────
  si('GMVMAX-S4-CAUSE-001', 'GMVMAX_SKILL_04', 'CONFIRMED_DRIVER butuh mekanis/eksperimen/dekomposisi'),
  si('GMVMAX-S4-CAUSE-002', 'GMVMAX_SKILL_04', 'Korelasi saja → CORRELATED_SIGNAL'),
  si('GMVMAX-S4-CAUSE-003', 'GMVMAX_SKILL_04', 'Skill 2 BLOCKED → maksimum INSUFFICIENT_EVIDENCE'),
  si('GMVMAX-S4-CAUSE-004', 'GMVMAX_SKILL_04', 'Wajib evidence_against + alternatives (walau kosong)'),
  si('GMVMAX-S4-CAUSE-005', 'GMVMAX_SKILL_04', 'Jangan klaim creative fatigue dari umur saja'),
  // ── Skill 5–8 — SPEC ONLY (business thresholds TBD; DRAFT, disabled) ────────
  ...['GATE-001', 'GATE-002', 'COOLDOWN-001', 'TROI-001', 'MAXDELIVERY-001', 'PROMO-001', 'ABI-001'].map(s => bd(`GMVMAX-S5-${s}`, 'GMVMAX_SKILL_05', `Skill5 ${s} (SPEC ONLY)`)),
  ...['GATE-001', 'GATE-002', 'CONCENTRATION-001', 'TESTING-001', 'CAP-001', 'COOLDOWN-001'].map(s => bd(`GMVMAX-S6-${s}`, 'GMVMAX_SKILL_06', `Skill6 ${s} (SPEC ONLY)`)),
  ...['SUPPLY-001', 'WINNER-001', 'SPIKE-001', 'FATIGUE-001', 'BOOST-001', 'AFFILIATE-001'].map(s => bd(`GMVMAX-S7-${s}`, 'GMVMAX_SKILL_07', `Skill7 ${s} (experiment foundation only)`)),
  ...['READINESS-001', 'TRAFFIC-001', 'CONVERSION-001', 'PRODUCT-001', 'HOST-001', 'BOOST-001'].map(s => bd(`GMVMAX-S8-${s}`, 'GMVMAX_SKILL_08', `Skill8 ${s} (SPEC ONLY / data-blocked LIVE)`)),
  // ── Skill 9 — orchestrator safety (deterministic gating) ───────────────────
  si('GMVMAX-S9-SAFETY-001', 'GMVMAX_SKILL_09', 'Safety gate: tak ada aksi dari data tak lengkap'),
  bd('GMVMAX-S9-LIMIT-001', 'GMVMAX_SKILL_09', 'Batasi jumlah aksi harian (ambang)', { threshold: TBD }),
  si('GMVMAX-S9-CONFLICT-001', 'GMVMAX_SKILL_09', 'Resolusi konflik antar-skill (ekspos, bukan sembunyi)'),
  si('GMVMAX-S9-DUPLICATE-001', 'GMVMAX_SKILL_09', 'Dedup aksi (identitas stabil)'),
  si('GMVMAX-S9-EXPIRY-001', 'GMVMAX_SKILL_09', 'Aksi kedaluwarsa tak boleh dipakai ulang'),
  si('GMVMAX-S9-APPROVAL-001', 'GMVMAX_SKILL_09', 'Aksi material → REQUIRE_APPROVAL'),
  si('GMVMAX-S9-EXECUTION-001', 'GMVMAX_SKILL_09', 'execution_allowed selalu false (invarian)'),
]

// Derive configuration_complete + runtime_eligible; freeze.
const hasTbd = (r) => JSON.stringify(r).includes(TBD)
export function computeRuntimeEligibility(r) {
  if (r.status === RuleStatus.DEPRECATED) return false
  const cfg = !hasTbd(r)
  if (r.rule_type === RuleType.STRUCTURAL_INVARIANT) return r.enabled === true && cfg
  // BUSINESS_DECISION_RULE: must be APPROVED + enabled + fully configured.
  return r.status === RuleStatus.APPROVED && r.enabled === true && cfg
}
function finalize(r) {
  const configuration_complete = !hasTbd(r)
  return { ...r, configuration_complete, runtime_eligible: computeRuntimeEligibility({ ...r, configuration_complete }) }
}
export const RULES = RAW.map(finalize)

const BY_ID = new Map(RULES.map(r => [r.rule_id, r]))
export function getRule(id) { return BY_ID.get(id) ?? null }
export function rulesForSkill(skillCode) { return RULES.filter(r => r.skill_code === skillCode) }
export function isApproved(id) { return getRule(id)?.status === RuleStatus.APPROVED }
export function enabledRules() { return RULES.filter(r => r.enabled) }

// Explicit-field accessors (authoritative). ruleType reads the FIELD, not TBD.
export function ruleType(r) { return r.rule_type }
export const structuralRules = () => RULES.filter(r => r.rule_type === RuleType.STRUCTURAL_INVARIANT)
export const businessRules = () => RULES.filter(r => r.rule_type === RuleType.BUSINESS_DECISION_RULE)
export const isRunnableNow = (r) => (typeof r === 'string' ? getRule(r) : r)?.runtime_eligible === true

// Metadata for persisted skill outputs: rule_id + rule_version + rule_type.
export function ruleMetaFor(ruleIds = []) {
  return [...new Set(ruleIds)].map(id => { const r = getRule(id); return r ? { rule_id: id, rule_version: r.rule_version, rule_type: r.rule_type } : { rule_id: id, rule_version: null, rule_type: null } })
}

// ── Invariants ───────────────────────────────────────────────────────────────
export function assertNoTbdApproved() {
  const bad = RULES.filter(r => r.status === RuleStatus.APPROVED && hasTbd(r))
  if (bad.length) throw new Error(`RULE_INVARIANT: ${bad.length} rule APPROVED masih memuat ${TBD}: ${bad.map(r => r.rule_id).join(', ')}`)
  return true
}
// A structural invariant must carry NO unresolved business config; an APPROVED
// business rule must be fully configured. A business rule never becomes
// structural merely by filling thresholds — rule_type is explicit.
export function assertRuleTypeConsistency() {
  const bad = []
  for (const r of RULES) {
    if (r.rule_type === RuleType.STRUCTURAL_INVARIANT && hasTbd(r)) bad.push(`${r.rule_id}: STRUCTURAL_INVARIANT tapi memuat TBD`)
    if (r.rule_type === RuleType.BUSINESS_DECISION_RULE && r.status === RuleStatus.APPROVED && hasTbd(r)) bad.push(`${r.rule_id}: BUSINESS APPROVED tapi memuat TBD`)
    if (![RuleType.STRUCTURAL_INVARIANT, RuleType.BUSINESS_DECISION_RULE].includes(r.rule_type)) bad.push(`${r.rule_id}: rule_type tak valid`)
  }
  if (bad.length) throw new Error(`RULE_TYPE_INVARIANT:\n${bad.join('\n')}`)
  return true
}
