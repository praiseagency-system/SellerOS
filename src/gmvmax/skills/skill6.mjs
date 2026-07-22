// GMV Max — SKILL 6: Capital Allocation Engine.
// Implements docs/gmvmax-skills/06_CAPITAL_ALLOCATION_ENGINE.md.
//
// Pure & deterministic. Menilai alokasi modal per campaign. Bobot skor portofolio,
// cap harian, ambang konsentrasi, break-even = TBD_BUSINESS_DECISION → TIDAK
// mengklasifikasi INCREASE/DECREASE dan TIDAK mengusulkan nilai budget. Yang
// diberikan: klasifikasi konservatif (HOLD; blocked→HOLD tanpa realokasi) +
// PERINGKAT observasional by ROI (transparan, bukan keputusan alokasi) + daftar
// keputusan bisnis yang belum diisi. approval_required=true, execution_allowed=false.
import { Confidence } from './contract.mjs'

const CONF_RANK = { HIGH: 4, MEDIUM: 3, LOW: 2, DATA_INSUFFICIENT: 1 }
const RANK_CONF = ['DATA_INSUFFICIENT', 'LOW', 'MEDIUM', 'HIGH']
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v)

export const AllocationBucket = Object.freeze({
  PROTECT: 'PROTECT', HOLD: 'HOLD', INCREASE_CANDIDATE: 'INCREASE_CANDIDATE',
  DECREASE_CANDIDATE: 'DECREASE_CANDIDATE', TESTING_POOL: 'TESTING_POOL',
  RECOVERY: 'RECOVERY', DO_NOT_FUND: 'DO_NOT_FUND',
})

// Agregat performa per campaign dari baris kreatif kanonik (deterministik).
function perCampaign(creatives = []) {
  const m = new Map()
  for (const c of creatives) {
    const id = c.campaignId || c.campaign_id
    if (!id) continue
    const e = m.get(id) || { cost: 0, revenue: 0, orders: 0, hasCost: false, hasRev: false }
    const cost = c.cost ?? null, rev = c.grossRevenue ?? c.gross_revenue ?? null, ord = c.skuOrders ?? c.sku_orders ?? null
    if (isNum(cost)) { e.cost += cost; e.hasCost = true }
    if (isNum(rev)) { e.revenue += rev; e.hasRev = true }
    if (isNum(ord)) e.orders += ord
    m.set(id, e)
  }
  for (const e of m.values()) e.roi = e.hasCost && e.cost > 0 && e.hasRev ? e.revenue / e.cost : null
  return m
}

export function runSkill6(input) {
  const { dailyFacts, skill2Output = null, campaignSettings = null, creatives = null, generatedAt = new Date().toISOString() } = input || {}
  const df = dailyFacts || {}
  const date = df.date, wsId = df.workspace_id, storeId = df.store_id
  const audit = skill2Output?.attribution_audit || null
  const blocked = audit?.decision_readiness === 'BLOCKED'
  const attrConf = audit?.attribution_confidence || Confidence.DATA_INSUFFICIENT
  const capConf = (c) => RANK_CONF[Math.min(CONF_RANK[c] || 1, CONF_RANK[attrConf] || 1) - 1] || 'DATA_INSUFFICIENT'

  const settings = Array.isArray(campaignSettings) ? campaignSettings : []
  const perf = perCampaign(Array.isArray(creatives) ? creatives : [])

  // Union campaign dari settings + performa.
  const ids = new Set([...settings.map(s => s.campaign_id).filter(Boolean), ...perf.keys()])
  const nameById = new Map(settings.map(s => [s.campaign_id, s.campaign_name]))
  const budgetById = new Map(settings.map(s => [s.campaign_id, isNum(s.budget) ? Number(s.budget) : null]))

  // Peringkat observasional by ROI (desc); campaign tanpa ROI terukur di bawah.
  const withRoi = [...ids].map(id => ({ id, roi: perf.get(id)?.roi ?? null }))
  withRoi.sort((a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity) || String(a.id).localeCompare(String(b.id)))
  const rankById = new Map(withRoi.map((x, i) => [x.id, x.roi != null ? i + 1 : null]))

  const recommendations = [...ids].map(id => {
    const p = perf.get(id) || {}
    const risk = blocked
      ? 'atribusi diblokir (Skill 2) — tak ada realokasi modal'
      : 'bobot skor portofolio, cap harian, break-even & ambang konsentrasi belum disetujui → pertahankan alokasi'
    return {
      scope_type: 'CAMPAIGN', scope_id: id, campaign_name: nameById.get(id) || null,
      classification: AllocationBucket.HOLD,       // INCREASE/DECREASE butuh bobot+cap (TBD)
      current_budget: budgetById.get(id) ?? null,
      proposed_budget: null, proposed_change_percent: null,   // nilai TBD → wajib null
      rank: rankById.get(id),                       // observasional (by ROI), BUKAN keputusan alokasi
      observed: { roi: p.roi ?? null, revenue: p.hasRev ? p.revenue : null, orders: isNum(p.orders) ? p.orders : null, spend: p.hasCost ? p.cost : null },
      confidence: capConf(blocked ? 'DATA_INSUFFICIENT' : 'MEDIUM'),
      evidence_ids: [], risk, approval_required: true, execution_allowed: false,
    }
  }).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))

  const missing = ['break_even_roi (TBD_BUSINESS_DECISION)', 'cash_flow_limit (TBD_BUSINESS_DECISION)', 'increase/decrease_caps (TBD_BUSINESS_DECISION)', 'concentration_threshold (TBD_BUSINESS_DECISION)', 'portfolio_score_weights (TBD_BUSINESS_DECISION)']
  if (!settings.length) missing.unshift('campaign_settings')

  return {
    skill_code: 'GMVMAX_SKILL_06', skill_version: '1.0.0-draft',
    workspace_id: wsId, store_id: storeId, date, generated_at: generatedAt,
    status: blocked ? 'DO_NOT_EXECUTE' : 'OBSERVE',
    confidence: capConf('MEDIUM'),
    recommendation_count: recommendations.length, recommendations,
    missing_data: [...new Set(missing)],
    limitations: ['Klasifikasi INCREASE/DECREASE & usulan budget disabled sampai bobot skor + cap + break-even disetujui. Peringkat bersifat observasional (by ROI), bukan keputusan alokasi.'],
    rule_ids: ['GMVMAX-S6-GATE-001', 'GMVMAX-S6-GATE-002', 'GMVMAX-S6-CONCENTRATION-001', 'GMVMAX-S6-CAP-001'],
    execution_allowed: false,
  }
}
