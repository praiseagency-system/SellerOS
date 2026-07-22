// GMV Max — SKILL 8: LIVE GMV Max Growth Engine.
// Implements docs/gmvmax-skills/08_LIVE_GMV_MAX_GROWTH_ENGINE.md.
//
// SKELETON (§9): tetap kerangka sampai data SESI LIVE (session_id, host, viewers,
// durasi, atribusi level-sesi) terbukti tersedia & andal. §1/§3: DILARANG
// menyimpulkan performa LIVE dari data campaign store-wide. Bila data sesi LIVE
// tak ada → readiness=BLOCKED, status DATA_INSUFFICIENT, tanpa insight LIVE yang
// dikarang. Boleh: mendeteksi ADA aktivitas LIVE (dari nama campaign) & meminta
// pengumpulan data sesi. execution_allowed=false.
import { Confidence } from './contract.mjs'

const isLiveCampaign = (name) => /\blive\b/i.test(String(name || ''))

export function runSkill8(input) {
  const { dailyFacts, skill2Output = null, campaignSettings = null, creatives = null, liveSessions = null, generatedAt = new Date().toISOString() } = input || {}
  const df = dailyFacts || {}
  const date = df.date, wsId = df.workspace_id, storeId = df.store_id
  const blocked = skill2Output?.attribution_audit?.decision_readiness === 'BLOCKED'

  // Deteksi ADA aktivitas LIVE (bukan analisis performa): nama campaign / promotion_type.
  const settings = Array.isArray(campaignSettings) ? campaignSettings : []
  const rows = Array.isArray(creatives) ? creatives : []
  const liveActivityDetected =
    settings.some(c => isLiveCampaign(c.campaign_name) || /LIVE/i.test(String(c.promotion_type || ''))) ||
    rows.some(r => isLiveCampaign(r.campaignName || r.campaign_name))

  // Data SESI LIVE (session_id/host/viewers/durasi) — belum tersedia di kanonik.
  const hasSessionData = Array.isArray(liveSessions) && liveSessions.length > 0

  const recommendations = []
  if (!hasSessionData) {
    recommendations.push({
      scope_type: 'LIVE_SESSION', scope_id: null, recommendation: 'COLLECT_MISSING_SESSION_DATA',
      confidence: Confidence.DATA_INSUFFICIENT, approval_required: false, execution_allowed: false,
      note: liveActivityDetected
        ? 'aktivitas LIVE terdeteksi (dari nama campaign), tetapi data level-sesi belum tersedia → kumpulkan session_id/host/viewers/durasi/atribusi-sesi'
        : 'tak ada aktivitas LIVE terdeteksi & tak ada data sesi',
    })
  }

  return {
    skill_code: 'GMVMAX_SKILL_08', skill_version: '1.0.0-draft',
    workspace_id: wsId, store_id: storeId, date, generated_at: generatedAt,
    status: 'OBSERVE',                       // stance: amati/kumpulkan data — bukan eksekusi
    readiness: 'BLOCKED',                    // §3: data sesi LIVE tak ada → BLOCKED
    confidence: Confidence.DATA_INSUFFICIENT,
    live_activity_detected: liveActivityDetected,
    sessions: [],                            // §1/§3: tak mengarang sesi dari data store-wide
    diagnoses: [],
    recommendation_count: recommendations.length, recommendations,
    missing_data: ['live_session_id', 'host_identity', 'session_start_end_duration', 'viewers', 'session_level_clicks_orders_revenue', 'session_level_attribution', 'live_boost_history'],
    limitations: ['Data sesi LIVE (session_id/host/viewers/durasi/atribusi-sesi) belum tersedia. Skill 8 TIDAK menyimpulkan performa LIVE dari data campaign store-wide (dilarang §1/§3). Tetap kerangka sampai sumber data LIVE terbukti andal.'],
    rule_ids: ['GMVMAX-S8-READINESS-001', 'GMVMAX-S8-TRAFFIC-001', 'GMVMAX-S8-CONVERSION-001'],
    execution_allowed: false,
    blocked_by_attribution: blocked,
  }
}
