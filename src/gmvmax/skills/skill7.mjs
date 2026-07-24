// GMV Max — SKILL 7: Creative & Affiliate Supply Engine.
// Implements docs/gmvmax-skills/07_CREATIVE_AFFILIATE_SUPPLY_ENGINE.md.
//
// Pure & deterministic. Prioritas (§13): FAKTA supply-health (inventori kreatif,
// distribusi status, kontribusi & konsentrasi afiliasi, cakupan produk). Ambang
// winner/fatigue/shortage/concentration = TBD_BUSINESS_DECISION → TIDAK
// mengklasifikasi winner/fatigue dan TIDAK menyuruh boost; rekomendasi tetap
// OBSERVE (atau DATA_INSUFFICIENT bila blocked). Tak ada outreach/boost otomatis.
import { Confidence } from './contract.mjs'
import { sanitizeDisplayName } from './textSafe.mjs'

const CONF_RANK = { HIGH: 4, MEDIUM: 3, LOW: 2, DATA_INSUFFICIENT: 1 }
const RANK_CONF = ['DATA_INSUFFICIENT', 'LOW', 'MEDIUM', 'HIGH']
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v)

// Normalisasi status delivery (selaras gmvmaxRollup, versi ringkas server-side).
function normStatus(s) {
  const t = String(s || '').toLowerCase().trim()
  if (!t || t === '-' || t === 'n/a') return null
  if (t.includes('learning') || t.includes('belajar')) return 'learning'
  if (t.includes('queue') || t.includes('antre')) return 'in_queue'
  if ((t.includes('deliver') || t.includes('ditayangkan')) && !t.includes('not') && !t.includes('tidak')) return 'delivering'
  return 'other'
}

export function runSkill7(input) {
  const { dailyFacts, skill2Output = null, creatives = null, generatedAt = new Date().toISOString() } = input || {}
  const df = dailyFacts || {}
  const date = df.date, wsId = df.workspace_id, storeId = df.store_id
  const audit = skill2Output?.attribution_audit || null
  const blocked = audit?.decision_readiness === 'BLOCKED'
  const attrConf = audit?.attribution_confidence || Confidence.DATA_INSUFFICIENT
  const capConf = (c) => RANK_CONF[Math.min(CONF_RANK[c] || 1, CONF_RANK[attrConf] || 1) - 1] || 'DATA_INSUFFICIENT'

  const rows = Array.isArray(creatives) ? creatives : []
  const videos = rows.filter(r => (r.creativeType || r.creative_type) === 'Video')
  const vidSet = new Set(), status = { delivering: 0, learning: 0, in_queue: 0, other: 0 }
  const affRev = new Map(), prodSet = new Set()
  let totalRev = 0
  for (const r of videos) {
    const vid = r.videoId || r.video_id
    if (vid && !vidSet.has(vid)) { vidSet.add(vid); const s = normStatus(r.status); if (s) status[s] += 1 }
    const acct = r.tiktokAccount || r.tiktok_account
    const rev = r.grossRevenue ?? r.gross_revenue ?? 0
    if (acct) affRev.set(acct, (affRev.get(acct) || 0) + (isNum(rev) ? rev : 0))
    if (isNum(rev)) totalRev += rev
    const pid = r.productId || r.product_id
    if (pid && pid !== 'N/A') prodSet.add(pid)
  }
  const affiliates = [...affRev.entries()].map(([account, revenue]) => ({ account, revenue })).sort((a, b) => b.revenue - a.revenue)
  const topAffShare = totalRev > 0 && affiliates.length ? affiliates[0].revenue / totalRev : null

  const supply_health = {
    creative_count: vidSet.size,
    delivering: status.delivering, learning: status.learning, in_queue: status.in_queue, inactive: status.other,
    affiliate_count: affiliates.length,
    product_count: prodSet.size,
    // Display name only — raw account is kept in `affiliates`/scope_id for identity.
    top_affiliate: affiliates[0]?.account ? sanitizeDisplayName(affiliates[0].account) : null,
    top_affiliate_share: topAffShare != null ? Number(topAffShare.toFixed(4)) : null,
  }

  // Rekomendasi konservatif: tanpa ambang bisnis → OBSERVE (atau DATA_INSUFFICIENT).
  const recommendations = []
  if (blocked || vidSet.size === 0) {
    recommendations.push(rec('STORE', storeId, blocked ? 'ATTRIBUTION_BLOCKED' : 'NO_CREATIVE_DATA', 'DATA_INSUFFICIENT',
      capConf('DATA_INSUFFICIENT'), blocked ? ['atribusi diblokir Skill 2'] : ['tak ada baris kreatif'], false))
  } else {
    recommendations.push(rec('STORE', storeId, 'SUPPLY_HEALTH_OBSERVED', 'OBSERVE', capConf('MEDIUM'),
      [`kreatif=${vidSet.size}`, `delivering=${status.delivering}`, `afiliasi=${affiliates.length}`, `produk=${prodSet.size}`,
        topAffShare != null ? `konsentrasi afiliasi teratas=${(topAffShare * 100).toFixed(0)}%` : 'konsentrasi afiliasi tak terukur'], true))
    // Afiliasi teratas sebagai observasi (bukan keputusan; ambang konsentrasi TBD).
    for (const a of affiliates.slice(0, 5)) {
      recommendations.push(rec('AFFILIATE', a.account, 'CONTRIBUTION_OBSERVED', 'OBSERVE', capConf('LOW'),
        [`revenue=${Math.round(a.revenue)}`, totalRev > 0 ? `share=${((a.revenue / totalRev) * 100).toFixed(0)}%` : 'share tak terukur'], false))
    }
  }

  return {
    skill_code: 'GMVMAX_SKILL_07', skill_version: '1.0.0-draft',
    workspace_id: wsId, store_id: storeId, date, generated_at: generatedAt,
    status: blocked ? 'DO_NOT_EXECUTE' : 'OBSERVE',
    confidence: capConf('MEDIUM'),
    supply_health,
    recommendation_count: recommendations.length, recommendations,
    missing_data: ['winner_thresholds (TBD_BUSINESS_DECISION)', 'fatigue_thresholds (TBD_BUSINESS_DECISION)', 'min_creative_supply_per_product (TBD_BUSINESS_DECISION)', 'affiliate_concentration_limit (TBD_BUSINESS_DECISION)'],
    limitations: ['Klasifikasi winner/temporary-spike/fatigue & deteksi shortage disabled sampai ambang disetujui. Experiment tracker (checkpoint H+1/3/7) dikelola terpisah di tab Eksperimen. Tak ada boost/outreach otomatis.'],
    rule_ids: ['GMVMAX-S7-SUPPLY-001', 'GMVMAX-S7-WINNER-001', 'GMVMAX-S7-FATIGUE-001', 'GMVMAX-S7-AFFILIATE-001'],
    execution_allowed: false,
  }
}

function rec(scope_type, scope_id, classification, recommendation, confidence, evidence, approval_required) {
  return { scope_type, scope_id: scope_id || null, classification, recommendation, confidence, evidence_ids: [], evidence, approval_required, execution_allowed: false }
}
