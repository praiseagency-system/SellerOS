// GMV Max — SKILL 9: Daily Action Plan Orchestrator (Phase 3A Increment 2B).
// Implements docs/gmvmax-skills/09_DAILY_ACTION_PLAN_ORCHESTRATOR.md.
//
// The ONLY final action planner. Pure & deterministic. Resolves conflicts,
// respects Skill 2 constraints + cooldowns, merges duplicates, expires stale
// actions. NEVER emits an exact budget/Target ROI value (Skills 5/6 unimplemented).
// No automatic execution. execution_allowed=false on the plan AND every action.
import { ActionStatus, Confidence, ScopeType } from './contract.mjs'

const MAX_PRIMARY = 3
const MAX_SECONDARY = 3
// Actions touching these require explicit approval (S9-APPROVAL-001).
const APPROVAL_TYPES = new Set(['BUDGET_CHANGE', 'TARGET_ROI_CHANGE', 'MODE_CHANGE', 'CREATIVE_BOOST', 'CAMPAIGN_CHANGE', 'AFFILIATE_OUTREACH'])
// Safest → least safe (for merge "use the safest status").
const STATUS_SAFETY = ['DO_NOT_EXECUTE', 'OBSERVE', 'REQUIRE_APPROVAL', 'RECOMMEND', 'SAFE_TO_EXECUTE']
const RISK_RANK = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 }
const CONF_RANK = { HIGH: 4, MEDIUM: 3, LOW: 2, DATA_INSUFFICIENT: 1 }
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v)
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)

export function runSkill9(input) {
  const {
    skill1Output = null, skill2Output = null, skill3Output = null, skill4Output = null,
    existingActions = [], cooldowns = [], generatedAt = new Date().toISOString(),
  } = input || {}

  const wsId = skill1Output?.workspace_id || skill2Output?.workspace_id || skill3Output?.workspace_id
  const storeId = skill1Output?.store_id || skill2Output?.store_id || storeFrom(skill3Output)
  const date = skill1Output?.date || skill2Output?.date || skill3Output?.date
  const audit = skill2Output?.attribution_audit || null
  const dataBlocked = audit?.decision_readiness === 'BLOCKED' || skill1Output?.severity === 'CRITICAL'
  const expires = expiryFrom(generatedAt)
  const ctx = { wsId, storeId, date, generatedAt, expires, dataBlocked }

  const candidates = []
  const dqEvents = (skill3Output?.events || []).filter(e => e.category === 'DATA_QUALITY' && ['CRITICAL', 'HIGH'].includes(e.severity))

  // (1) CRITICAL DATA / TENANT SAFETY
  if (dqEvents.length || dataBlocked)
    candidates.push(mkAction(ctx, {
      objective: 'restore_data_trust', action_type: 'DATA_QUALITY_INVESTIGATION',
      status: ActionStatus.OBSERVE, safetyRank: 1, risk: 'HIGH', confidence: Confidence.HIGH,
      title: 'Investigasi kualitas data sebelum optimasi', title_en: 'Investigate data quality before optimizing',
      explanation: 'Kondisi data memblokir keputusan; verifikasi paginasi/sumber/rekonsiliasi dulu.',
      evidence_ids: dqEvents.map(e => e.event_id), source_skills: ['GMVMAX_SKILL_02', 'GMVMAX_SKILL_03'],
      expected_impact: 'memulihkan keandalan data', success_metric: 'data_completeness=COMPLETE', stop_condition: 'kanonik tervalidasi & paginasi lengkap',
      source_rule: 'GMVMAX-S9-SAFETY-001',
    }))

  // (3) Skill 2 attribution constraints → withheld aggressive actions (blocked)
  for (const c of skill2Output?.downstream_constraints || []) {
    if (c.constraint === 'NONE') continue
    candidates.push(mkAction(ctx, {
      objective: `withhold_${slug(c.constraint)}`, action_type: constraintType(c.constraint), direction: 'NEUTRAL',
      status: ActionStatus.DO_NOT_EXECUTE, safetyRank: dataBlocked ? 2 : 3, risk: 'MEDIUM', confidence: Confidence.MEDIUM,
      title: `Tahan perubahan agresif (${c.constraint})`, title_en: `Withhold aggressive change (${c.constraint})`,
      explanation: `Skill 2 membatasi ${c.target_skill}: ${c.reason}.`,
      evidence_ids: [], source_skills: ['GMVMAX_SKILL_02', c.target_skill],
      expected_impact: 'mencegah aksi berisiko atas data belum matang', success_metric: 'atribusi matang / data lengkap', stop_condition: c.reason,
      source_rule: 'GMVMAX-S9-SAFETY-001', forceBlocked: true,
    }))
  }

  // (5) High-confidence diagnosis follow-ups → OBSERVE (no setting change)
  for (const d of skill4Output?.diagnoses || []) {
    if (d.level === 'INSUFFICIENT_EVIDENCE') continue
    candidates.push(mkAction(ctx, {
      objective: `investigate_${slug(d.candidate_driver)}`, action_type: 'DIAGNOSIS_FOLLOWUP',
      status: ActionStatus.OBSERVE, safetyRank: d.level === 'LIKELY_DRIVER' ? 5 : 6, risk: 'LOW', confidence: d.confidence,
      title: `Selidiki: ${d.candidate_driver}`, title_en: `Investigate: ${d.candidate_driver}`,
      explanation: `${d.observed_outcome} → ${d.candidate_driver} (${d.level}). Tanpa perubahan setting yang dibenarkan.`,
      evidence_ids: d.source_event_ids || [], source_skills: ['GMVMAX_SKILL_04'],
      expected_impact: 'mengkonfirmasi/menyingkirkan driver', success_metric: 'driver terkonfirmasi/terbantah', stop_condition: 'bukti cukup untuk keputusan',
      source_rule: 'GMVMAX-S4-CAUSE-002',
    }))
  }

  // Existing unresolved actions — drop expired (S9-EXPIRY-001), carry the rest.
  for (const a of existingActions || []) {
    if (a.expiry_time && Date.parse(a.expiry_time) < Date.parse(generatedAt)) continue
    candidates.push(mkAction(ctx, {
      objective: a.objective || 'existing', action_type: a.action_type || 'OBSERVATION', direction: a.direction || 'NEUTRAL',
      status: a.status || ActionStatus.OBSERVE, safetyRank: 6, risk: a.risk || 'LOW', confidence: a.confidence || Confidence.LOW,
      title: a.title || 'Aksi tertunda', title_en: a.title_en || a.title || 'Pending action',
      explanation: a.explanation || 'Aksi tertunda dari hari sebelumnya.', evidence_ids: a.evidence_ids || [],
      source_skills: a.source_skills || [], expected_impact: a.expected_impact || null,
      success_metric: a.success_metric || 'n/a', stop_condition: a.stop_condition || 'n/a',
      scope_type: a.target_scope_type, scope_id: a.target_scope_id, source_rule: a.source_rule || 'EXISTING',
    }))
  }

  // Fallback: healthy day with nothing actionable → OBSERVE/maintain.
  const anyActionable = candidates.some(c => c.status !== ActionStatus.DO_NOT_EXECUTE)
  if (!anyActionable && !dataBlocked)
    candidates.push(mkAction(ctx, {
      objective: 'maintain', action_type: 'OBSERVATION', status: ActionStatus.OBSERVE, safetyRank: 7, risk: 'INFO', confidence: Confidence.MEDIUM,
      title: 'Pertahankan — tidak ada perubahan material', title_en: 'Maintain — no material change', explanation: 'Hari stabil; pantau rutin.',
      evidence_ids: [], source_skills: ['GMVMAX_SKILL_03'], expected_impact: 'stabilitas', success_metric: 'kondisi stabil', stop_condition: 'muncul event material', source_rule: 'GMVMAX-S9-SAFETY-001',
    }))

  // Cooldowns (S9): suppress matching scope+action_type still cooling down.
  for (const a of candidates) if (inCooldown(a, cooldowns, generatedAt)) { a.status = ActionStatus.DO_NOT_EXECUTE; a._cooldown = true; a.explanation += ' (cooldown aktif)' }

  const merged = dedupeMerge(candidates)
  const conflicts = detectConflicts(merged, date)
  const sorted = merged.sort(compareActions)

  const blocked = sorted.filter(a => a.status === ActionStatus.DO_NOT_EXECUTE || a._cooldown || a._conflict)
  const actionable = sorted.filter(a => !blocked.includes(a))
  const primary = actionable.slice(0, MAX_PRIMARY)
  const secondary = actionable.slice(MAX_PRIMARY).filter(a => a.status === ActionStatus.OBSERVE).slice(0, MAX_SECONDARY)

  const planConfidence = dataBlocked ? Confidence.DATA_INSUFFICIENT
    : primary.length ? lowestConf(primary) : Confidence.MEDIUM

  return {
    skill_code: 'GMVMAX_SKILL_09', skill_version: '1.0.0-draft',
    date, workspace_id: wsId, store_id: storeId,
    primary_actions: primary.map(strip), secondary_observations: secondary.map(strip),
    blocked_actions: blocked.map(strip), conflicts,
    plan_confidence: planConfidence, generated_at: generatedAt, expires_at: expires,
    execution_allowed: false,
  }
}

function mkAction(ctx, a) {
  const scope_type = a.scope_type || ScopeType.STORE
  const scope_id = a.scope_id || ctx.storeId
  const approval = APPROVAL_TYPES.has(a.action_type)
  let status = a.status
  let safetyRank = a.safetyRank ?? 6
  if (approval && !a.forceBlocked) {
    // Aggressive/approval action: blocked when data unsafe, else approval-gated.
    status = ctx.dataBlocked ? ActionStatus.DO_NOT_EXECUTE : ActionStatus.REQUIRE_APPROVAL
    safetyRank = ctx.dataBlocked ? 2 : 6
  }
  const identity = [scope_type, scope_id, a.objective, a.action_type, a.source_rule || '', ctx.date].join('|')
  return {
    recommendation_id: `${ctx.date}:${identity}`,
    _identity: identity, _safetyRank: safetyRank, _direction: a.direction || 'NEUTRAL', _objective: a.objective, _action_type: a.action_type, _source_rule: a.source_rule || '',
    status, priority: safetyRank,
    target_scope_type: scope_type, target_scope_id: scope_id,
    title: a.title, title_en: a.title_en || a.title, explanation: a.explanation,
    evidence_ids: [...(a.evidence_ids || [])].filter(Boolean),
    source_skills: [...new Set(a.source_skills || [])],
    expected_impact: a.expected_impact ?? null, risk: a.risk || 'LOW', confidence: a.confidence || Confidence.LOW,
    approval_required: approval || status === ActionStatus.REQUIRE_APPROVAL,
    expiry_time: ctx.expires, follow_up_window: 'NEXT_DAILY_PULL',
    success_metric: a.success_metric || 'n/a', stop_condition: a.stop_condition || 'n/a',
    action_type: a.action_type, execution_allowed: false,
    _merge: null,
  }
}

// Dedupe by stable identity; merge = safest status, highest risk, lowest
// confidence, earliest expiry, union evidence + source_skills (Part 10).
function dedupeMerge(actions) {
  const by = new Map()
  for (const a of actions) {
    const ex = by.get(a._identity)
    if (!ex) { by.set(a._identity, a); continue }
    ex.status = safest(ex.status, a.status)
    ex.risk = RISK_RANK[a.risk] > RISK_RANK[ex.risk] ? a.risk : ex.risk
    ex.confidence = CONF_RANK[a.confidence] < CONF_RANK[ex.confidence] ? a.confidence : ex.confidence
    ex.expiry_time = earliest(ex.expiry_time, a.expiry_time)
    ex.evidence_ids = [...new Set([...ex.evidence_ids, ...a.evidence_ids])]
    ex.source_skills = [...new Set([...ex.source_skills, ...a.source_skills])]
    ex.approval_required = ex.approval_required || a.approval_required
    ex._merge = { merged_count: (ex._merge?.merged_count || 1) + 1, merged_ids: [...(ex._merge?.merged_ids || [ex.recommendation_id]), a.recommendation_id] }
  }
  return [...by.values()]
}

// Conflict: same scope + action_type with opposing INCREASE/DECREASE directions.
function detectConflicts(actions, date) {
  const groups = new Map()
  for (const a of actions) {
    const k = `${a.target_scope_type}|${a.target_scope_id}|${a._action_type}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(a)
  }
  const conflicts = []
  for (const [k, group] of groups) {
    const dirs = new Set(group.map(a => a._direction))
    if (dirs.has('INCREASE') && dirs.has('DECREASE')) {
      for (const a of group) { a._conflict = true; a.status = safest(a.status, ActionStatus.OBSERVE) }
      conflicts.push({
        conflict_id: `${date}:${slug(k)}`,
        source_skills: [...new Set(group.flatMap(a => a.source_skills))],
        description: `Aksi berlawanan pada ${group[0].target_scope_type} ${group[0].target_scope_id} (${group[0]._action_type}): INCREASE vs DECREASE.`,
        resolution: 'Ditahan untuk OBSERVE sampai konflik diselesaikan; tidak ada eksekusi.',
      })
    }
  }
  return conflicts
}

// Map a Skill 2 downstream constraint to the action_type it withholds.
function constraintType(c) {
  if (c === 'NO_BUDGET_INCREASE') return 'BUDGET_CHANGE'
  if (c === 'NO_TARGET_ROI_CHANGE') return 'TARGET_ROI_CHANGE'
  if (c === 'BLOCK_ACTION_PLAN' || c === 'NO_AGGRESSIVE_CHANGE') return 'CAMPAIGN_CHANGE'
  return 'OBSERVATION'
}
const safest = (x, y) => (STATUS_SAFETY.indexOf(x) <= STATUS_SAFETY.indexOf(y) ? x : y)
const earliest = (x, y) => (!x ? y : !y ? x : Date.parse(x) <= Date.parse(y) ? x : y)
function inCooldown(a, cooldowns, now) {
  return (cooldowns || []).some(c => c.scope_type === a.target_scope_type && c.scope_id === a.target_scope_id &&
    (c.action_type === a._action_type || c.action_type === a._objective) && c.until && Date.parse(c.until) > Date.parse(now))
}
function compareActions(a, b) {
  return (a._safetyRank - b._safetyRank) ||
    (CONF_RANK[b.confidence] - CONF_RANK[a.confidence]) ||
    (RISK_RANK[b.risk] - RISK_RANK[a.risk]) ||
    a.recommendation_id.localeCompare(b.recommendation_id)
}
const lowestConf = (arr) => arr.reduce((m, a) => (CONF_RANK[a.confidence] < CONF_RANK[m] ? a.confidence : m), 'HIGH')
function strip(a) {
  const out = {}
  for (const [k, v] of Object.entries(a)) if (!k.startsWith('_')) out[k] = v
  if (a._merge) out.merge = a._merge
  return out
}
function storeFrom(s3) { return s3?.store_id }
function expiryFrom(g) { const t = Date.parse(g); return Number.isNaN(t) ? null : new Date(t + 24 * 3600 * 1000).toISOString() }
