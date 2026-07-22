// GMV Max — SKILL 1: Business & Data Blueprint (Phase 3A Increment 2A).
// Implements docs/gmvmax-skills/01_BUSINESS_DATA_BLUEPRINT.md.
//
// Pure & deterministic. Maps what exists / is active / is measurable, and rates
// downstream skill readiness. NO optimization recommendation, NO final action,
// execution_allowed=false. Consumes buildDailyFacts() output (canonical-only).
import { makeSkillOutput, SkillCode, ActionStatus, Severity, Confidence, ScopeType, MeasurementLabel as ML } from './contract.mjs'

const Readiness = Object.freeze({ READY: 'READY', PARTIAL: 'PARTIAL', BLOCKED: 'BLOCKED' })

// Structural rules that actually run in this increment (deterministic, no TBD).
const S1_RULES = ['GMVMAX-S1-STRUCTURE-001', 'GMVMAX-S1-SOURCE-001', 'GMVMAX-S1-PAGINATION-001', 'GMVMAX-S1-CURRENCY-001', 'GMVMAX-S1-TIMEZONE-001']

export function runSkill1(input) {
  const {
    workspaceId, storeId, date, daily,
    businessStructure = null, liveDataAvailable = false,
    skillVersion = '1.0.0-draft', generatedAt = null,
  } = input || {}

  const st = daily?.structured || {}
  const dq = st.dataQuality || {}
  const missing = [...(daily?.missing_data || [])]
  const limitations = []
  const risks = []
  const appliedRules = [...S1_RULES]

  // ── Identity / structural gates (STRUCTURE-001, CURRENCY-001, TIMEZONE-001) ──
  const identityOk = Boolean(workspaceId && storeId)
  const identityMismatch = businessStructure?.identityMismatch === true
  const currency = daily?.currency ?? null
  const timezone = daily?.timezone ?? null
  const currencyOk = Boolean(currency) && currency !== 'MIXED'
  const timezoneOk = Boolean(timezone)
  if (!identityOk || identityMismatch) { risks.push('IDENTITY_MISMATCH'); missing.push('identity') }
  if (!currencyOk) { risks.push('CURRENCY_UNKNOWN_OR_MIXED'); limitations.push('agregat uang tak dapat dihitung tanpa mata uang tunggal') }
  if (!timezoneOk) { risks.push('TIMEZONE_UNKNOWN'); limitations.push('perbandingan tanggal tak dapat dilakukan tanpa zona waktu') }

  const hardBlock = !identityOk || identityMismatch || !currencyOk

  // ── Advertiser structure (SOURCE-001): LEGACY-inactive stays in lineage, out of active count ──
  const advs = Array.isArray(businessStructure?.activeAdvertisers) ? businessStructure.activeAdvertisers : []
  const active_advertisers = advs.filter(a => a.is_active !== false).map(a => ({
    advertiser_id: a.advertiser_id, role: a.role, is_active: a.is_active !== false, connection_group_id: a.connection_group_id ?? null,
  }))
  const historical_advertisers = [
    ...advs.filter(a => a.is_active === false).map(a => ({ advertiser_id: a.advertiser_id, role: a.role, effective_to: a.effective_to ?? null, reason: a.reason ?? 'INACTIVE' })),
    ...(businessStructure?.historicalAdvertisers || []),
  ]
  if (advs.length === 0) { missing.push('source_advertiser_lineage'); limitations.push('lineage advertiser tak tersedia') }

  // ── PAGINATION-001 ──
  const paginationComplete = dq.paginationComplete
  const paginationBlocksAggregate = paginationComplete === false
  if (paginationBlocksAggregate) risks.push('PAGINATION_INCOMPLETE')

  // ── Downstream readiness ─────────────────────────────────────────────────
  const hasCanonical = st.hasCanonical === true
  const hasSync = !missing.includes('sync_metadata') && dq.sourcesExpected != null
  const hasComparisons = (daily?.facts || []).some(f => f.metric.startsWith('cmp.') && f.value != null)
  const settingsAvailable = st.settingsAvailable === true
  const featureRegistryAvailable = st.featureRegistryAvailable === true

  const R = (skill_code, status, reasons, miss = [], constraints = []) => ({ skill_code, status, reasons, missing_data: miss, constraints })
  const gate = (base) => hardBlock ? Readiness.BLOCKED : base

  const downstream = [
    R(SkillCode.S2, gate(hasCanonical ? (hasSync && !paginationBlocksAggregate ? Readiness.READY : Readiness.PARTIAL) : Readiness.BLOCKED),
      hasCanonical ? (hasSync ? ['canonical+sync tersedia'] : ['canonical ada, metadata sync kurang']) : ['canonical tak tersedia'],
      hasCanonical ? (hasSync ? [] : ['sync_metadata']) : ['canonical_snapshot']),
    R(SkillCode.S3, gate(hasCanonical ? (hasComparisons ? Readiness.READY : Readiness.PARTIAL) : Readiness.BLOCKED),
      hasComparisons ? ['fakta harian dapat dibandingkan'] : ['tak ada jendela pembanding → hanya fakta saat ini'],
      hasComparisons ? [] : ['comparison_windows']),
    R(SkillCode.S4, gate(hasCanonical ? Readiness.PARTIAL : Readiness.BLOCKED),
      ['butuh event (Skill 3) + bukti cukup'], hasCanonical ? [] : ['canonical_snapshot']),
    R(SkillCode.S5, gate(settingsAvailable ? Readiness.PARTIAL : Readiness.BLOCKED),
      settingsAvailable ? ['butuh confidence Skill 2 + ambang bisnis (TBD)'] : ['setting campaign tak tersedia'],
      settingsAvailable ? [] : ['campaign_settings'], ['NO_AGGRESSIVE_CHANGE_UNTIL_S2']),
    R(SkillCode.S6, gate(Readiness.PARTIAL),
      ['butuh confidence Skill 2 + data margin/break-even (tak tersedia)'], ['margin_break_even_data'], ['NO_BUDGET_INCREASE_UNTIL_S2']),
    R(SkillCode.S7, gate(hasCanonical ? Readiness.PARTIAL : Readiness.BLOCKED),
      ['pasokan kreatif tersedia; tracker eksperimen tak tersedia'], ['experiment_tracker']),
    R(SkillCode.S8, Readiness.BLOCKED,
      liveDataAvailable ? ['LIVE tersedia'] : ['data LIVE tak tersedia → Skill 8 DIBLOKIR'],
      liveDataAvailable ? [] : ['live_session_data']),
    R(SkillCode.S9, gate(Readiness.READY), ['≥1 hasil upstream valid (Skill 1)'], []),
  ]
  if (!featureRegistryAvailable) missing.push('feature_registry')
  if (!liveDataAvailable) limitations.push('data LIVE tak tersedia — Skill 8 diblokir')

  // ── Confidence (01 §12) ──
  const highReady = identityOk && !identityMismatch && currencyOk && timezoneOk &&
    hasCanonical && paginationComplete === true && advs.length > 0 && hasSync
  let confidence
  if (hardBlock || !hasCanonical) confidence = Confidence.DATA_INSUFFICIENT
  else if (highReady) confidence = Confidence.HIGH
  else if (paginationBlocksAggregate) confidence = Confidence.LOW
  else confidence = Confidence.MEDIUM

  const severity = hardBlock ? Severity.CRITICAL : paginationBlocksAggregate ? Severity.MEDIUM : Severity.INFO
  const blueprintFacts = (daily?.facts || []).filter(f => f.scope_type === ScopeType.STORE)

  const out = makeSkillOutput({
    skill_code: SkillCode.S1, skill_version: skillVersion,
    workspace_id: workspaceId, store_id: storeId, date,
    scope_type: ScopeType.STORE, scope_id: storeId,
    currency: currency ?? undefined, timezone: timezone ?? undefined,
    status: ActionStatus.OBSERVE, severity, confidence,
    title: 'Business & Data Blueprint',
    summary: hardBlock ? 'Blueprint terblokir: identitas/mata uang tak valid.' : `Blueprint ${storeId} @ ${date}: ${downstream.filter(d => d.status === Readiness.READY).length}/9 skill READY.`,
    facts: blueprintFacts,
    source_snapshot_ids: daily?.source_snapshot_ids || [],
    rule_ids: appliedRules,
    missing_data: [...new Set(missing)], limitations, risks,
    expires_at: null, generated_at: generatedAt ?? undefined,
  })

  // Blueprint sections (extra, contract-compatible; no forbidden keys).
  out.blueprint = {
    BUSINESS_STRUCTURE: {
      workspace_id: workspaceId, workspace_name: businessStructure?.workspaceName ?? null,
      store_id: storeId, store_name: businessStructure?.storeName ?? null,
      timezone, currency, active_advertisers, historical_advertisers,
    },
    ADVERTISER_STRUCTURE: { active_count: active_advertisers.length, historical_count: historical_advertisers.length },
    ACTIVE_CAMPAIGNS: { total: st.business?.campaigns ?? null, active: st.business?.activeCampaigns ?? null, settings_available: settingsAvailable },
    ACTIVE_PRODUCTS: st.product || {},
    CREATIVE_SUPPLY: st.creative || {},
    FEATURE_CAPABILITIES: featureCaps(daily),
    DATA_AVAILABILITY: { canonical: hasCanonical, sync_metadata: hasSync, campaign_settings: settingsAvailable, feature_registry: featureRegistryAvailable, live: liveDataAvailable },
    DATA_FRESHNESS: { freshness_hours: dq.freshnessHours ?? null, note: dq.freshnessHours == null ? 'tak dapat dihitung' : 'ambang TBD_BUSINESS_DECISION' },
    DATA_QUALITY: { pagination_complete: paginationComplete ?? null, sources_expected: dq.sourcesExpected ?? null, sources_processed: dq.sourcesProcessed ?? null, sources_failed: dq.sourcesFailed ?? null, parity_status: dq.parityStatus ?? null, canonical_status: dq.canonicalStatus ?? null },
    KNOWN_LIMITATIONS: limitations,
    DOWNSTREAM_SKILL_READINESS: downstream,
  }
  return out
}

function featureCaps(daily) {
  const caps = []
  for (const f of daily?.facts || []) {
    const m = /^feature\.([A-Z_]+)\.available$/.exec(f.metric)
    if (!m) continue
    const enabled = (daily.facts.find(x => x.metric === `feature.${m[1]}.enabled`))?.value ?? null
    caps.push({
      feature_code: m[1], available: f.value, enabled,
      source: f.measurement_label === ML.MEASURED ? 'FEATURE_REGISTRY' : 'UNKNOWN',
      confidence: f.measurement_label === ML.MEASURED ? 'HIGH' : 'DATA_INSUFFICIENT',
      limitation: f.notes ?? null,
    })
  }
  return caps
}

export { Readiness }
