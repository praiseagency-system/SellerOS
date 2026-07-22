// GMV Max — SKILL 3: Daily Control Tower (Phase 3A Increment 2B).
// Implements docs/gmvmax-skills/03_DAILY_CONTROL_TOWER.md.
//
// Pure & deterministic event DETECTOR + prioritizer (NOT the action planner and
// NOT a root-cause engine). execution_allowed=false. Consumes Increment 2A only:
// Daily Facts + Skill 1 readiness + Skill 2 audit.
//
// EVENT MODES (Part 5 — threshold-free production behavior):
//   ACTIVE_STRUCTURAL            — deterministic, no business threshold; always runs.
//   DESCRIPTIVE_ONLY             — neutral comparison; NO materiality/actionability;
//                                  severity INFO; only when a comparison value exists.
//   DISABLED_PENDING_BUSINESS_RULE — magnitude/materiality events; emitted ONLY when
//                                  an approved threshold is injected via ruleConfig.
import { Severity, Confidence, ScopeType } from './contract.mjs'

export const EventMode = Object.freeze({
  ACTIVE_STRUCTURAL: 'ACTIVE_STRUCTURAL',
  DESCRIPTIVE_ONLY: 'DESCRIPTIVE_ONLY',
  DISABLED_PENDING_BUSINESS_RULE: 'DISABLED_PENDING_BUSINESS_RULE',
})

// Documentation manifest (also asserted by tests) — which event_type is which mode.
export const EVENT_TAXONOMY = Object.freeze({
  CANONICAL_MISSING: EventMode.ACTIVE_STRUCTURAL,
  PAGINATION_INCOMPLETE: EventMode.ACTIVE_STRUCTURAL,
  SOURCE_FAILED: EventMode.ACTIVE_STRUCTURAL,
  RECONCILIATION_MISMATCH: EventMode.ACTIVE_STRUCTURAL,
  MISSING_REQUIRED_FIELDS: EventMode.ACTIVE_STRUCTURAL,
  SCOPE_INCONSISTENCY: EventMode.ACTIVE_STRUCTURAL,
  LATE_ATTRIBUTION_WARNING: EventMode.ACTIVE_STRUCTURAL,
  ZERO_COST_WITH_REVENUE: EventMode.ACTIVE_STRUCTURAL,
  COMPARISON_UNAVAILABLE: EventMode.ACTIVE_STRUCTURAL,
  GMV_COMPARISON: EventMode.DESCRIPTIVE_ONLY,
  ROI_COMPARISON: EventMode.DESCRIPTIVE_ONLY,
  CREATIVE_SUPPLY_COMPARISON: EventMode.DESCRIPTIVE_ONLY,
  PRODUCT_CONTRIBUTION_COMPARISON: EventMode.DESCRIPTIVE_ONLY,
  GMV_MATERIAL_MOVE: EventMode.DISABLED_PENDING_BUSINESS_RULE,
  ROI_MATERIAL_MOVE: EventMode.DISABLED_PENDING_BUSINESS_RULE,
  CREATIVE_SUPPLY_DECLINE: EventMode.DISABLED_PENDING_BUSINESS_RULE,
  SPEND_WITHOUT_ORDERS: EventMode.DISABLED_PENDING_BUSINESS_RULE,
  CONCENTRATION_RISK: EventMode.DISABLED_PENDING_BUSINESS_RULE,
})

const SEV_RANK = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 }
const CONF_RANK = { HIGH: 4, MEDIUM: 3, LOW: 2, DATA_INSUFFICIENT: 1 }
const SCOPE_RANK = { WORKSPACE: 4, STORE: 3, CAMPAIGN: 2, PRODUCT: 1, CREATIVE: 1, AFFILIATE: 1, LIVE_SESSION: 1 }
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v)
const DEFAULT_MAX = 10

export function runSkill3(input) {
  const {
    dailyFacts, skill1Output = null, skill2Output = null,
    ruleConfig = {}, generatedAt = new Date().toISOString(),
  } = input || {}

  const maxEvents = Number.isInteger(ruleConfig.maxEvents) ? ruleConfig.maxEvents : DEFAULT_MAX
  const df = dailyFacts || {}
  const st = df.structured || {}
  const dq = st.dataQuality || {}
  const b = st.business || {}
  const src = df.source_snapshot_ids || []
  const wsId = df.workspace_id, storeId = df.store_id, date = df.date
  const audit = skill2Output?.attribution_audit || null
  const attrConf = audit?.attribution_confidence || Confidence.DATA_INSUFFICIENT
  const lateHigh = audit?.late_attribution_risk?.risk === 'HIGH' || audit?.late_attribution_risk?.risk === 'MEDIUM'
  const events = []
  const expires = expiryFrom(generatedAt) // +1 day; deterministic given generatedAt

  const factId = (metric) => `${date}:STORE:${storeId}:${metric}`
  const add = (e) => events.push(finalizeEvent(e, { wsId, storeId, date, generatedAt, expires }))

  // ══ ACTIVE_STRUCTURAL (data quality; no business threshold) ═════════════════
  const hasCanonical = st.hasCanonical === true
  if (!hasCanonical) {
    add({ event_type: 'CANONICAL_MISSING', category: 'DATA_QUALITY', severity: Severity.CRITICAL, confidence: Confidence.HIGH,
      title: 'Snapshot kanonik tidak tersedia', title_en: 'Canonical snapshot missing', description: 'Tak ada data kanonik untuk tanggal ini; interpretasi diblokir.',
      current_value: null, comparison_value: null, comparison_window: 'none', rule_id: 'GMVMAX-S1-STRUCTURE-001', evidence_ids: [] })
  }
  if (dq.paginationComplete === false)
    add({ event_type: 'PAGINATION_INCOMPLETE', category: 'DATA_QUALITY', severity: Severity.CRITICAL, confidence: Confidence.HIGH,
      title: 'Paginasi tidak lengkap', title_en: 'Pagination incomplete', description: 'Agregat mungkin terpotong; event performa agresif ditekan.',
      current_value: null, comparison_value: null, comparison_window: 'none', rule_id: 'GMVMAX-S2-PAGINATION-001', evidence_ids: [factId('pagination_complete')] })
  if (isNum(dq.sourcesFailed) && dq.sourcesFailed > 0)
    add({ event_type: 'SOURCE_FAILED', category: 'DATA_QUALITY', severity: Severity.HIGH, confidence: Confidence.HIGH,
      title: `${dq.sourcesFailed} sumber gagal diproses`, title_en: `${dq.sourcesFailed} expected source(s) failed`, description: 'Sumber yang diharapkan gagal; kelengkapan turun.',
      current_value: dq.sourcesFailed, comparison_value: dq.sourcesExpected ?? null, comparison_window: 'none', rule_id: 'GMVMAX-S2-COMPLETE-001', evidence_ids: [factId('sources_failed')] })
  if (audit?.data_completeness?.canonical_reconciled === false)
    add({ event_type: 'RECONCILIATION_MISMATCH', category: 'DATA_QUALITY', severity: Severity.HIGH, confidence: Confidence.HIGH,
      title: 'Rekonsiliasi kanonik gagal', title_en: 'Canonical reconciliation mismatch', description: `Selisih kanonik vs sumber: ${audit.data_completeness.reconciliation_delta}.`,
      current_value: audit.data_completeness.reconciliation_delta ?? null, comparison_value: 0, comparison_window: 'source-aggregate', rule_id: 'GMVMAX-S2-RECONCILE-001', evidence_ids: [] })
  const reqComplete = hasCanonical && isNum(b.cost) && isNum(b.grossRevenue) && isNum(b.orders)
  if (hasCanonical && !reqComplete)
    add({ event_type: 'MISSING_REQUIRED_FIELDS', category: 'DATA_QUALITY', severity: Severity.MEDIUM, confidence: Confidence.HIGH,
      title: 'Field wajib hilang', title_en: 'Missing required fields', description: 'Sebagian metrik wajib (cost/revenue/orders) tak tersedia.',
      current_value: null, comparison_value: null, comparison_window: 'none', rule_id: 'GMVMAX-S2-COMPLETE-001', evidence_ids: [] })
  const s1Blocked = skill1Output?.severity === Severity.CRITICAL
  if (s1Blocked)
    add({ event_type: 'SCOPE_INCONSISTENCY', category: 'DATA_QUALITY', severity: Severity.CRITICAL, confidence: Confidence.HIGH,
      title: 'Inkonsistensi workspace/tanggal/mata uang', title_en: 'Workspace/date/currency inconsistency', description: 'Skill 1 memblokir: identitas/mata uang tak valid.',
      current_value: null, comparison_value: null, comparison_window: 'none', rule_id: 'GMVMAX-S1-STRUCTURE-001', evidence_ids: [] })
  if (lateHigh)
    add({ event_type: 'LATE_ATTRIBUTION_WARNING', category: 'DATA_QUALITY', severity: Severity.MEDIUM, confidence: Confidence.MEDIUM,
      title: 'Risiko atribusi lambat', title_en: 'Late-attribution warning', description: 'Nilai finansial mungkin masih berubah; tandai provisional.',
      current_value: null, comparison_value: null, comparison_window: audit?.late_attribution_risk?.comparable_snapshots ? 'same-date re-pull' : 'none', rule_id: 'GMVMAX-S2-LATE-001', evidence_ids: [] })
  // zero cost with attributed revenue (structural oddity)
  if (hasCanonical && b.cost === 0 && isNum(b.grossRevenue) && b.grossRevenue > 0)
    add({ event_type: 'ZERO_COST_WITH_REVENUE', category: 'PRODUCT_HEALTH', severity: Severity.MEDIUM, confidence: Confidence.HIGH,
      title: 'Revenue teratribusi tanpa biaya', title_en: 'Attributed revenue with zero cost', description: 'ROI tak terdefinisi (biaya nol, revenue > 0).',
      current_value: b.grossRevenue, comparison_value: 0, comparison_window: 'none', rule_id: 'GMVMAX-S1-STRUCTURE-001', evidence_ids: [factId('roi')] })

  // ══ DESCRIPTIVE_ONLY (neutral comparisons; only when comparison exists) ═════
  const provisional = lateHigh || dq.paginationComplete === false
  const descConf = provisional ? Confidence.LOW : downgrade(attrConf)
  descriptiveMove(add, df, 'gross_revenue', 'GMV_COMPARISON', 'PERFORMANCE', 'GMV', 'gross_revenue', descConf, provisional)
  descriptiveMove(add, df, 'roi', 'ROI_COMPARISON', 'EFFICIENCY', 'ROI', 'roi', descConf, provisional)
  // creative supply is a level fact (no delta fact) — describe current supply neutrally
  if (hasCanonical && isNum(st.creative?.delivering))
    add({ event_type: 'CREATIVE_SUPPLY_COMPARISON', category: 'CREATIVE_SUPPLY', severity: Severity.INFO, confidence: descConf, mode: EventMode.DESCRIPTIVE_ONLY,
      title: `Kreatif tayang: ${st.creative.delivering}`, title_en: `Delivering creatives: ${st.creative.delivering}`, description: 'Deskriptif; deklinasi materiil butuh ambang bisnis (TBD).',
      current_value: st.creative.delivering, comparison_value: null, comparison_window: 'current', rule_id: 'GMVMAX-S3-CREATIVE-001', evidence_ids: [factId('delivering_creatives')] })

  // product health (descriptive: top-product revenue share / spend-no-orders count)
  if (hasCanonical && isNum(st.product?.withSpend)) {
    const topShare = findFact(df, 'top_product_contribution')
    add({ event_type: 'PRODUCT_CONTRIBUTION_COMPARISON', category: 'PRODUCT_HEALTH', severity: Severity.INFO, confidence: descConf, mode: EventMode.DESCRIPTIVE_ONLY,
      title: `Produk ber-spend: ${st.product.withSpend}`, title_en: `Products with spend: ${st.product.withSpend}`, description: 'Deskriptif; batas konsentrasi butuh ambang bisnis (TBD).',
      current_value: topShare && isNum(topShare.value) ? topShare.value : st.product.withSpend, comparison_value: null, comparison_window: 'current', rule_id: 'GMVMAX-S3-PRODUCT-001', evidence_ids: [factId('products_with_spend')] })
  }

  // ══ COMPARISON_UNAVAILABLE (structural informational) ══════════════════════
  const hasAnyCmp = (df.facts || []).some(f => f.metric.startsWith('cmp.') && f.value != null)
  if (hasCanonical && !hasAnyCmp)
    add({ event_type: 'COMPARISON_UNAVAILABLE', category: 'DATA_QUALITY', severity: Severity.INFO, confidence: Confidence.HIGH,
      title: 'Jendela pembanding tak tersedia', title_en: 'Comparison window unavailable', description: 'Hanya fakta hari ini; tak ada klaim tren.',
      current_value: null, comparison_value: null, comparison_window: 'none', rule_id: 'GMVMAX-S3-PERF-001', evidence_ids: [] })

  // ══ DISABLED_PENDING_BUSINESS_RULE (only with injected approved threshold) ══
  // e.g. ruleConfig.gmvMaterialPct — TEST-ONLY; never a production default.
  if (isNum(ruleConfig.gmvMaterialPct)) materialMove(add, df, 'gross_revenue', 'GMV_MATERIAL_MOVE', 'PERFORMANCE', ruleConfig.gmvMaterialPct, attrConf)
  if (isNum(ruleConfig.roiMaterialPct)) materialMove(add, df, 'roi', 'ROI_MATERIAL_MOVE', 'EFFICIENCY', ruleConfig.roiMaterialPct, attrConf)

  const deduped = dedupe(events)
  const ranked = deduped.sort(compareEvents)
  return {
    skill_code: 'GMVMAX_SKILL_03', skill_version: '1.0.0-draft',
    workspace_id: wsId, store_id: storeId, date,
    generated_at: generatedAt, expires_at: expires,
    max_events: maxEvents, event_count: Math.min(ranked.length, maxEvents),
    truncated: ranked.length > maxEvents,
    events: ranked.slice(0, maxEvents),
    execution_allowed: false,
  }
}

// Descriptive comparison from a cmp.<window>.<metric>.delta fact (no materiality).
function descriptiveMove(add, df, metric, eventType, category, label, labelEn, confidence, provisional) {
  for (const window of ['previous_day', 'trailing7_avg']) {
    const delta = findFact(df, `cmp.${window}.${metric}.delta`)
    const pct = findFact(df, `cmp.${window}.${metric}.pct`)
    if (!delta || !isNum(delta.value)) continue // no event from missing comparison
    const cur = findFact(df, metric)
    add({
      event_type: eventType, category, severity: Severity.INFO, confidence, mode: EventMode.DESCRIPTIVE_ONLY,
      title: `${label} vs ${window === 'previous_day' ? 'H-1' : 'rata-rata 7 hari'}${provisional ? ' (provisional)' : ''}`,
      title_en: `${labelEn} vs ${window === 'previous_day' ? 'D-1' : '7-day avg'}${provisional ? ' (provisional)' : ''}`,
      description: 'Perbandingan deskriptif; TIDAK mengklaim materialitas/aksi.',
      current_value: cur?.value ?? null, comparison_value: isNum(cur?.value) ? cur.value - delta.value : null,
      absolute_change: delta.value, percentage_change: pct && isNum(pct.value) ? pct.value : null,
      comparison_window: window, rule_id: metric === 'roi' ? 'GMVMAX-S3-EFF-001' : 'GMVMAX-S3-PERF-001',
      evidence_ids: [delta.fact_id],
    })
  }
}

// Business-threshold move — only reached when an APPROVED threshold is injected.
function materialMove(add, df, metric, eventType, category, thresholdPct, confidence) {
  const delta = findFact(df, `cmp.previous_day.${metric}.delta`)
  const pct = findFact(df, `cmp.previous_day.${metric}.pct`)
  if (!pct || !isNum(pct.value) || Math.abs(pct.value) < thresholdPct) return
  const cur = findFact(df, metric)
  add({
    event_type: eventType, category, mode: EventMode.DISABLED_PENDING_BUSINESS_RULE,
    severity: pct.value < 0 ? Severity.HIGH : Severity.MEDIUM, confidence,
    title: `${metric} bergerak ${(pct.value * 100).toFixed(1)}% (ambang diinjeksi)`,
    title_en: `${metric} moved ${(pct.value * 100).toFixed(1)}% (injected threshold)`,
    description: 'Event materialitas — hanya aktif dengan ambang bisnis yang disetujui.',
    current_value: cur?.value ?? null, comparison_value: delta && isNum(cur?.value) ? cur.value - delta.value : null,
    absolute_change: delta?.value ?? null, percentage_change: pct.value,
    comparison_window: 'previous_day', rule_id: metric === 'roi' ? 'GMVMAX-S3-EFF-001' : 'GMVMAX-S3-PERF-001', evidence_ids: [pct.fact_id],
  })
}

const findFact = (df, metric) => (df.facts || []).find(f => f.metric === metric) || null
const downgrade = (c) => c // attribution confidence already conservative from Skill 2

function finalizeEvent(e, ctx) {
  const mode = e.mode || EVENT_TAXONOMY[e.event_type] || EventMode.ACTIVE_STRUCTURAL
  const idBasis = [e.category, e.event_type, e.scope_type || 'STORE', e.scope_id || ctx.storeId, e.comparison_window || 'none', e.rule_id].join('|')
  return {
    event_id: `${ctx.date}:${idBasis}`,
    event_type: e.event_type, category: e.category, mode,
    scope_type: e.scope_type || ScopeType.STORE, scope_id: e.scope_id || ctx.storeId,
    current_value: e.current_value ?? null, comparison_value: e.comparison_value ?? null,
    absolute_change: e.absolute_change ?? null, percentage_change: e.percentage_change ?? null,
    comparison_window: e.comparison_window || 'none',
    severity: e.severity, confidence: e.confidence,
    title: e.title, title_en: e.title_en, description: e.description,
    evidence_ids: [...(e.evidence_ids || [])].filter(Boolean),
    rule_id: e.rule_id, detected_at: ctx.generatedAt, expires_at: ctx.expires,
  }
}

function dedupe(events) {
  const seen = new Map()
  for (const e of events) if (!seen.has(e.event_id)) seen.set(e.event_id, e)
  return [...seen.values()]
}

// Lexicographic deterministic priority (03 §5). Data-quality (higher severity)
// naturally outranks descriptive (INFO). Final tiebreak by event_id for stability.
function compareEvents(a, b) {
  return (SEV_RANK[b.severity] - SEV_RANK[a.severity]) ||
    (CONF_RANK[b.confidence] - CONF_RANK[a.confidence]) ||
    ((SCOPE_RANK[b.scope_type] || 0) - (SCOPE_RANK[a.scope_type] || 0)) ||
    (absOf(b) - absOf(a)) ||
    a.event_id.localeCompare(b.event_id)
}
const absOf = (e) => (isNum(e.absolute_change) ? Math.abs(e.absolute_change) : 0)

function expiryFrom(generatedAt) {
  const t = Date.parse(generatedAt)
  return Number.isNaN(t) ? null : new Date(t + 24 * 3600 * 1000).toISOString()
}
