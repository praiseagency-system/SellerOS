// GMV Max — SKILL 4: Root Cause Diagnosis (Phase 3A Increment 2B).
// Implements docs/gmvmax-skills/04_ROOT_CAUSE_DIAGNOSIS.md.
//
// Pure & deterministic. Explains LIKELY drivers WITHOUT overstating causality.
// Consumes Increment 2A/2B only: Daily Facts + Skill 2 audit + Skill 3 events.
// Every diagnosis carries evidence_against + alternatives. No final action.
// execution_allowed=false (Skill 4 emits no action; that is Skill 9's job).
import { Confidence } from './contract.mjs'

export const DiagnosisLevel = Object.freeze({
  CONFIRMED_DRIVER: 'CONFIRMED_DRIVER', LIKELY_DRIVER: 'LIKELY_DRIVER',
  CONTRIBUTING_FACTOR: 'CONTRIBUTING_FACTOR', CORRELATED_SIGNAL: 'CORRELATED_SIGNAL',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
})
const LEVEL_RANK = { CONFIRMED_DRIVER: 5, LIKELY_DRIVER: 4, CONTRIBUTING_FACTOR: 3, CORRELATED_SIGNAL: 2, INSUFFICIENT_EVIDENCE: 1 }
const CONF_RANK = { HIGH: 4, MEDIUM: 3, LOW: 2, DATA_INSUFFICIENT: 1 }
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v)
const DEFAULT_MAX = 5

export function runSkill4(input) {
  const { dailyFacts, skill2Output = null, skill3Output = null, generatedAt = new Date().toISOString(), ruleConfig = {} } = input || {}
  const df = dailyFacts || {}
  const date = df.date, wsId = df.workspace_id, storeId = df.store_id
  const st = df.structured || {}
  const audit = skill2Output?.attribution_audit || null
  const blocked = audit?.decision_readiness === 'BLOCKED' || !st.hasCanonical
  const paginationIncomplete = audit?.data_completeness?.pagination_complete === false
  const lateHigh = audit?.late_attribution_risk?.risk === 'HIGH' || audit?.late_attribution_risk?.risk === 'MEDIUM'
  const attrConf = audit?.attribution_confidence || Confidence.DATA_INSUFFICIENT
  const maxDiag = Number.isInteger(ruleConfig.maxDiagnoses) ? ruleConfig.maxDiagnoses : DEFAULT_MAX

  const D = (m) => factVal(df, `cmp.previous_day.${m}.delta`)
  const P = (m) => factVal(df, `cmp.previous_day.${m}.pct`)
  const eid = (t) => (skill3Output?.events || []).filter(e => e.event_type === t).map(e => e.event_id)
  const gmv = D('gross_revenue'), cost = D('cost'), roi = D('roi'), cvr = D('cvr'), creativeD = D('delivering_creatives')
  const gmvPct = P('gross_revenue'), costPct = P('cost')
  const hasComparison = [gmv, cost, roi, cvr, creativeD].some(isNum)

  const diagnoses = []
  // Safety cap: BLOCKED → nothing above INSUFFICIENT_EVIDENCE (S4-CAUSE-003);
  // pagination incomplete → no confident financial diagnosis (cap CORRELATED);
  // late attribution high → cap CONTRIBUTING_FACTOR.
  const cap = blocked ? 'INSUFFICIENT_EVIDENCE' : paginationIncomplete ? 'CORRELATED_SIGNAL' : lateHigh ? 'CONTRIBUTING_FACTOR' : 'CONFIRMED_DRIVER'
  const capLevel = (lvl) => LEVEL_RANK[lvl] <= LEVEL_RANK[cap] ? lvl : cap
  const capConf = (c) => {
    let r = Math.min(CONF_RANK[c], CONF_RANK[attrConf])
    if (lateHigh) r = Math.min(r, CONF_RANK.LOW)
    return ['DATA_INSUFFICIENT', 'LOW', 'MEDIUM', 'HIGH'][r - 1] || 'DATA_INSUFFICIENT'
  }
  const alwaysAlt = ['atribusi lambat / data belum matang', 'sumber laporan tak lengkap']
  const push = (d) => diagnoses.push(finalize(d, { date, storeId, generatedAt, capLevel, capConf, blocked }))

  // ── Chain 1: GMV down + spend down → LIKELY delivery/spend decline ──────────
  if (isNum(gmv) && gmv < 0 && isNum(cost) && cost < 0)
    push({ observed_outcome: 'GMV turun (vs H-1)', candidate_driver: 'penurunan delivery/spend',
      level: 'LIKELY_DRIVER', baseConfidence: 'MEDIUM',
      evidence_for: [`gross_revenue Δ=${gmv}`, `cost Δ=${cost}`], evidence_against: isNum(cvr) && cvr >= 0 ? ['CVR tidak menurun'] : [],
      alternatives: ['CVR menurun', 'kampanye dijeda', 'masalah pemetaan produk', ...alwaysAlt],
      missing_data: ['settings_history'], source_event_ids: [...eid('GMV_COMPARISON')], rule_ids: ['GMVMAX-S4-CAUSE-002', 'GMVMAX-S4-CAUSE-004'] })

  // ── Chain 2: ROI down + CVR down → conversion deterioration (needs CVR fact) ─
  if (isNum(roi) && roi < 0 && isNum(cvr) && cvr < 0) {
    const costDownToo = isNum(cost) && cost < 0
    push({ observed_outcome: 'ROI turun (vs H-1)', candidate_driver: 'pemburukan konversi (CVR)',
      level: costDownToo ? 'CONTRIBUTING_FACTOR' : 'LIKELY_DRIVER', baseConfidence: 'MEDIUM',
      evidence_for: [`roi Δ=${roi}`, `cvr Δ=${cvr}`, costDownToo ? `cost Δ=${cost} (juga turun)` : 'cost tidak turun'],
      evidence_against: costDownToo ? ['spend juga turun → bisa spend-led, bukan murni konversi'] : [],
      alternatives: ['CPC naik', 'mix produk bergeser ke ROI rendah', 'creative fatigue', ...alwaysAlt],
      missing_data: [], source_event_ids: [...eid('ROI_COMPARISON')], rule_ids: ['GMVMAX-S4-CAUSE-002', 'GMVMAX-S4-CAUSE-004'] })
  }

  // ── Chain 3: GMV up + ROI down + spend growth > revenue growth (measured) ───
  if (isNum(gmv) && gmv > 0 && isNum(roi) && roi < 0 && isNum(costPct) && isNum(gmvPct) && costPct > gmvPct)
    push({ observed_outcome: 'efisiensi turun sambil GMV naik', candidate_driver: 'pertumbuhan berbasis modal (spend tumbuh > revenue)',
      level: 'CONTRIBUTING_FACTOR', baseConfidence: 'MEDIUM',
      evidence_for: [`cost pct=${costPct}`, `revenue pct=${gmvPct}`, `roi Δ=${roi}`], evidence_against: [],
      alternatives: ['penurunan CVR', 'mix produk bergeser', ...alwaysAlt],
      missing_data: [], source_event_ids: [...eid('ROI_COMPARISON')], rule_ids: ['GMVMAX-S4-CAUSE-001'],
      note: 'hubungan MEASURED (mekanis), bukan bukti penyebab bisnis lebih dalam' })

  // ── Chain 4: GMV down + delivering creatives down → creative supply factor ──
  if (isNum(gmv) && gmv < 0 && isNum(creativeD) && creativeD < 0)
    push({ observed_outcome: 'GMV turun (vs H-1)', candidate_driver: 'penurunan pasokan kreatif tayang',
      level: 'CONTRIBUTING_FACTOR', baseConfidence: 'LOW',
      evidence_for: [`delivering_creatives Δ=${creativeD}`, `gross_revenue Δ=${gmv}`], evidence_against: [],
      alternatives: ['spend turun', 'CVR turun', ...alwaysAlt],
      missing_data: ['creative_decomposition'], source_event_ids: [...eid('CREATIVE_SUPPLY_COMPARISON')], rule_ids: ['GMVMAX-S4-CAUSE-005'],
      note: 'tak dikonfirmasi tanpa dekomposisi kreatif' })

  // ── Chain 5: spend without orders → CORRELATED / INSUFFICIENT (min-sample TBD) ─
  const spendNoOrders = st.business?.cost > 0 && st.business?.orders === 0
  const prodSpendNoOrders = isNum(factVal(df, 'products_spend_no_orders')) && factVal(df, 'products_spend_no_orders') > 0
  if (spendNoOrders || prodSpendNoOrders)
    push({ observed_outcome: 'spend tanpa order', candidate_driver: 'kemungkinan masalah konversi/traffic',
      level: 'CORRELATED_SIGNAL', baseConfidence: 'LOW',
      evidence_for: [spendNoOrders ? 'store: cost>0 & orders=0' : `produk spend-tanpa-order=${factVal(df, 'products_spend_no_orders')}`],
      evidence_against: [], alternatives: ['sampel kecil', 'atribusi tertunda', 'mismatch kreatif/produk', ...alwaysAlt],
      missing_data: ['minimum_sample_threshold (TBD_BUSINESS_DECISION)'], source_event_ids: [], rule_ids: ['GMVMAX-S4-CAUSE-002'],
      note: 'ambang minimum spend/order belum disetujui → tetap non-kausal' })

  // No comparison at all and not blocked → single INSUFFICIENT_EVIDENCE note.
  if (diagnoses.length === 0)
    push({ observed_outcome: blocked ? 'data diblokir Skill 2' : hasComparison ? 'tak ada pola diagnostik cocok' : 'tak ada jendela pembanding',
      candidate_driver: 'n/a', level: 'INSUFFICIENT_EVIDENCE', baseConfidence: 'DATA_INSUFFICIENT',
      evidence_for: [], evidence_against: [], alternatives: alwaysAlt, missing_data: blocked ? ['canonical/reconciliation'] : ['comparison_window'],
      source_event_ids: [], rule_ids: ['GMVMAX-S4-CAUSE-003'] })

  const ranked = diagnoses.sort(compareDiag).slice(0, maxDiag)
  return {
    skill_code: 'GMVMAX_SKILL_04', skill_version: '1.0.0-draft',
    workspace_id: wsId, store_id: storeId, date,
    generated_at: generatedAt, diagnosis_count: ranked.length, diagnoses: ranked,
    execution_allowed: false,
  }
}

function finalize(d, ctx) {
  const level = ctx.capLevel(d.level)
  const confidence = ctx.capConf(d.baseConfidence)
  const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  return {
    diagnosis_id: `${ctx.date}:${key(d.observed_outcome)}:${key(d.candidate_driver)}`,
    observed_outcome: d.observed_outcome, candidate_driver: d.candidate_driver,
    level, confidence,
    evidence_for: [...(d.evidence_for || [])], evidence_against: [...(d.evidence_against || [])],
    alternative_explanations: dedupeStr(d.alternatives || []),
    missing_data: [...(d.missing_data || [])],
    recommended_observation_window: 'MONITOR_NEXT_PULL', observation_window: 'MONITOR_NEXT_PULL',
    source_event_ids: [...(d.source_event_ids || [])], rule_ids: [...(d.rule_ids || [])],
    note: d.note || null,
  }
}

const factVal = (df, metric) => { const f = (df.facts || []).find(x => x.metric === metric); return f && isNum(f.value) ? f.value : null }
const dedupeStr = (a) => [...new Set(a)]
function compareDiag(a, b) {
  return (LEVEL_RANK[b.level] - LEVEL_RANK[a.level]) ||
    (CONF_RANK[b.confidence] - CONF_RANK[a.confidence]) ||
    a.diagnosis_id.localeCompare(b.diagnosis_id)
}
