// GMV Max — SKILL 5: Target ROI & Optimization Mode Engine.
// Implements docs/gmvmax-skills/05_TARGET_ROI_OPTIMIZATION_ENGINE.md.
//
// Pure & deterministic. KERANGKA REKOMENDASI TER-GATE: per-campaign menilai
// Target ROI / mode optimasi lalu menyarankan HOLD / OBSERVE / DO_NOT_CHANGE.
// TIDAK pernah mengusulkan NILAI (proposed_value=null) sampai formula bisnis
// disetujui, TIDAK pernah eksekusi. Semua ambang = TBD_BUSINESS_DECISION →
// default konservatif. approval_required selalu true. execution_allowed=false.
import { Confidence } from './contract.mjs'

const CONF_RANK = { HIGH: 4, MEDIUM: 3, LOW: 2, DATA_INSUFFICIENT: 1 }
const RANK_CONF = ['DATA_INSUFFICIENT', 'LOW', 'MEDIUM', 'HIGH']
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v)

// Rekomendasi hanya HOLD/OBSERVE/DO_NOT_CHANGE — REVIEW_* butuh kondisi bisnis
// yang disetujui (TBD), jadi tak pernah dipancarkan sekarang.
export const OptRecommendation = Object.freeze({
  HOLD: 'HOLD', OBSERVE: 'OBSERVE', DO_NOT_CHANGE: 'DO_NOT_CHANGE',
})

export function runSkill5(input) {
  const { dailyFacts, skill2Output = null, campaignSettings = null, generatedAt = new Date().toISOString() } = input || {}
  const df = dailyFacts || {}
  const date = df.date, wsId = df.workspace_id, storeId = df.store_id
  const audit = skill2Output?.attribution_audit || null
  const blocked = audit?.decision_readiness === 'BLOCKED'
  const lateHigh = audit?.late_attribution_risk?.risk === 'HIGH' || audit?.late_attribution_risk?.risk === 'MEDIUM'
  const attrConf = audit?.attribution_confidence || Confidence.DATA_INSUFFICIENT
  const capConf = (c) => RANK_CONF[Math.min(CONF_RANK[c] || 1, CONF_RANK[attrConf] || 1) - 1] || 'DATA_INSUFFICIENT'

  const settings = Array.isArray(campaignSettings) ? campaignSettings : []
  const recommendations = settings.map(c => buildRec(c, { blocked, lateHigh, capConf }))

  const missing = []
  if (!settings.length) missing.push('campaign_settings')
  missing.push('minimum_sample_threshold (TBD_BUSINESS_DECISION)', 'cooldown_window (TBD_BUSINESS_DECISION)', 'target_roi_formula (TBD_BUSINESS_DECISION)')

  return {
    skill_code: 'GMVMAX_SKILL_05', skill_version: '1.0.0-draft',
    workspace_id: wsId, store_id: storeId, date, generated_at: generatedAt,
    status: blocked ? 'DO_NOT_EXECUTE' : 'OBSERVE',
    confidence: capConf('MEDIUM'),
    recommendation_count: recommendations.length, recommendations,
    missing_data: [...new Set(missing)],
    limitations: ['Ambang bisnis (min sample, cooldown, formula Target ROI, cap ABI) belum disetujui → tak ada usulan nilai; hanya HOLD/OBSERVE/DO_NOT_CHANGE. Setting-change tetap disabled.'],
    rule_ids: ['GMVMAX-S5-GATE-001', 'GMVMAX-S5-GATE-002', 'GMVMAX-S5-COOLDOWN-001', 'GMVMAX-S5-TROI-001'],
    execution_allowed: false,
  }
}

function buildRec(c, ctx) {
  const mode = []
  if (c?.auto_budget?.auto_budget_enabled) mode.push('AutoBudget')
  if (c?.roi_protection_enabled) mode.push('ROIProtection')
  if (c?.promotion_type) mode.push(String(c.promotion_type).replace('_GMV_MAX', ''))

  const risks = []
  let recommendation, confidence, ruleIds
  if (ctx.blocked) {
    // GATE-001: Skill 2 BLOCKED → semua perubahan DO_NOT_EXECUTE.
    recommendation = OptRecommendation.DO_NOT_CHANGE; confidence = 'DATA_INSUFFICIENT'
    risks.push('atribusi diblokir (Skill 2) — perubahan setting tak boleh dievaluasi')
    ruleIds = ['GMVMAX-S5-GATE-001']
  } else if (ctx.lateHigh) {
    // GATE-002: risiko atribusi lambat tinggi → OBSERVE.
    recommendation = OptRecommendation.OBSERVE; confidence = ctx.capConf('LOW')
    risks.push('risiko atribusi lambat tinggi — amati sebelum menilai setting')
    ruleIds = ['GMVMAX-S5-GATE-002']
  } else {
    // Ambang evaluasi (TROI/cooldown/maturity) TBD → pertahankan setting.
    recommendation = OptRecommendation.HOLD; confidence = ctx.capConf('MEDIUM')
    risks.push('ambang evaluasi Target ROI/maturity belum disetujui → pertahankan setting saat ini')
    ruleIds = ['GMVMAX-S5-TROI-001', 'GMVMAX-S5-COOLDOWN-001']
  }
  if (c?.auto_budget?.auto_budget_enabled) risks.push('Auto Budget Increase aktif — perlu persetujuan alokasi modal & cap (S5-ABI-001)')

  return {
    campaign_id: c.campaign_id || null,
    campaign_name: c.campaign_name || null,
    current_target_roi: isNum(c.roas_bid) ? Number(c.roas_bid) : null,
    platform_recommended_roi: null,               // tak dipakai sebagai kebenaran tanpa persetujuan
    current_mode: mode.join('+') || null,
    recommendation,
    proposed_value: null,                          // formula bisnis TBD → wajib null
    confidence,
    approval_required: true,
    evidence_ids: [],
    risks,
    cooldown_until: null,                          // durasi cooldown TBD
    rule_ids: ruleIds,
    execution_allowed: false,
  }
}
