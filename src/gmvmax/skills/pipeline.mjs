// GMV Max — DECISION INTELLIGENCE: generation pipeline (Phase 3A 2C).
// loadDecisionInputs → buildDailyFacts → Skill 1/2/3/4/9 → validate → (persist?).
// Deterministic, idempotent, workspace+date-scoped. NO LLM, NO TikTok call, NO
// worker dependency, NO canonical write, NO automatic execution. persist=false
// by default; persist=true fails SAFELY when the 0026/0027 tables are absent.
import { createHash } from 'node:crypto'
import { validateSkillOutput } from './contract.mjs'
import { buildDailyFacts } from './dailyFacts.mjs'
import { runSkill1 } from './skill1.mjs'
import { runSkill2 } from './skill2.mjs'
import { runSkill3 } from './skill3.mjs'
import { runSkill4 } from './skill4.mjs'
import { runSkill5 } from './skill5.mjs'
import { runSkill6 } from './skill6.mjs'
import { runSkill9 } from './skill9.mjs'
import { loadDecisionInputs, redactError } from './loader.mjs'
import { ruleMetaFor } from './ruleRegistry.mjs'

const FORBIDDEN = ['access_token', 'refresh_token', 'client_secret', 'service_role_key', 'raw_mcp', 'raw_payload']
const BUILDER_VERSION = 'facts-1.0.0-draft'

function signatureOf(obj) { return 'sha256:' + createHash('sha256').update(JSON.stringify(obj)).digest('hex') }
function dailySignature(daily) {
  return signatureOf({ ws: daily.workspace_id, store: daily.store_id, date: daily.date, builder: BUILDER_VERSION, facts: daily.facts })
}

// Content-addressed persisted signature. Deep-strips volatile timestamp fields so
// the same source data + same skill/rule versions ALWAYS hash the same regardless
// of wall-clock. Incorporates skill_version + rule versions so a version bump (or
// changed canonical facts) yields a NEW signature → NEW historical row.
const VOLATILE = /(_at|_time)$/
export function stripVolatile(v) {
  if (Array.isArray(v)) return v.map(stripVolatile)
  if (v && typeof v === 'object') {
    const o = {}
    for (const [k, x] of Object.entries(v)) {
      if (VOLATILE.test(k) || k === 'deterministic_signature') continue
      o[k] = stripVolatile(x)
    }
    return o
  }
  return v
}
export function persistedSignature({ skillCode, skillVersion, sourceSnapshotIds = [], ruleMeta = [], payload }) {
  return signatureOf({
    skillCode, skillVersion,
    src: [...sourceSnapshotIds].sort(),
    rules: ruleMeta.map(r => `${r.rule_id}@${r.rule_version}`).sort(),
    content: stripVolatile(payload),
  })
}

// Structural validation for every emitted output: execution_allowed=false + no
// secret/raw-payload key anywhere. Envelope skills (1/2) also get full contract
// validation.
export function validateDecisionOutput(o, { envelope } = {}) {
  const errors = []
  if (o.execution_allowed !== false) errors.push('execution_allowed WAJIB false')
  const blob = JSON.stringify(o).toLowerCase()
  for (const k of FORBIDDEN) if (blob.includes(`"${k}"`)) errors.push(`field terlarang: ${k}`)
  if (envelope) { const r = validateSkillOutput(o); if (!r.ok) errors.push(...r.errors) }
  return errors
}

export async function generateDecisionIntelligence({ workspaceId, storeId, date, generatedAt, persist = false, db, sb, skills = [1, 2, 3, 4, 5, 9] }) {
  const gen = generatedAt || new Date().toISOString()
  const inputs = await loadDecisionInputs({ db, workspaceId, storeId, date })

  const daily = buildDailyFacts({
    workspaceId, storeId, date,
    canonicalData: inputs.canonicalData, campaignSettings: inputs.campaignSettings,
    featureRegistry: inputs.featureRegistry, syncMetadata: inputs.syncMetadata, comparisonData: inputs.comparisonData,
  })
  daily.deterministic_signature = dailySignature(daily)

  // Skill dependency order is fixed: 1 → 2 → 3 → 4 → 9. We always compute the
  // dependency chain; `skills` only filters what is RETURNED/persisted.
  const skill1 = runSkill1({ workspaceId, storeId, date, daily, businessStructure: inputs.businessStructure, liveDataAvailable: inputs.liveDataAvailable, generatedAt: gen })
  const skill2 = runSkill2({ workspaceId, storeId, date, daily, priorSnapshots: inputs.priorSnapshots, sourceBreakdown: inputs.sourceBreakdown, generatedAt: gen })
  const skill3 = runSkill3({ dailyFacts: daily, skill1Output: skill1, skill2Output: skill2, generatedAt: gen })
  const skill4 = runSkill4({ dailyFacts: daily, skill2Output: skill2, skill3Output: skill3, generatedAt: gen })
  const skill5 = runSkill5({ dailyFacts: daily, skill2Output: skill2, campaignSettings: inputs.campaignSettings, generatedAt: gen })
  const skill6 = runSkill6({ dailyFacts: daily, skill2Output: skill2, campaignSettings: inputs.campaignSettings, creatives: inputs.canonicalData?.creatives, generatedAt: gen })
  const skill9 = runSkill9({ skill1Output: skill1, skill2Output: skill2, skill3Output: skill3, skill4Output: skill4, generatedAt: gen })

  const byNum = { 1: skill1, 2: skill2, 3: skill3, 4: skill4, 5: skill5, 6: skill6, 9: skill9 }
  const envelopeNums = new Set([1, 2])
  const errors = []
  for (const n of [1, 2, 3, 4, 5, 6, 9]) {
    const errs = validateDecisionOutput(byNum[n], { envelope: envelopeNums.has(n) })
    for (const e of errs) errors.push(`SKILL_${n}: ${e}`)
  }
  const validation = { ok: errors.length === 0, errors }
  if (!validation.ok) throw new Error(`PIPELINE_VALIDATION_FAILED: ${errors.join('; ')}`)

  const result = {
    workspace_id: workspaceId, store_id: storeId, date, generated_at: gen,
    source_snapshot_ids: inputs.source_snapshot_ids, missing_inputs: inputs.missing_inputs,
    daily_signature: daily.deterministic_signature,
    daily, skill1, skill2, skill3, skill4, skill5, skill6, skill9,
    requested_skills: skills, validation, persisted: false, execution_allowed: false,
  }

  if (persist) result.persisted = await persistOutputs({ sb, result, gen })
  return result
}

// Persist to 0026/0027. Fails SAFELY (clear error) when tables are absent.
async function persistOutputs({ sb, result, gen }) {
  if (!sb) throw new Error('PERSIST_UNAVAILABLE: service-role client (sb) diperlukan untuk persist')
  for (const t of ['gmvmax_daily_facts', 'gmvmax_skill_outputs']) {
    const { error } = await sb.from(t).select('id').limit(1)
    if (error) throw new Error(`PERSIST_UNAVAILABLE: tabel ${t} belum ada (apply migrasi 0026/0027 dulu) — ${redactError(error)}`)
  }
  const d = result.daily
  const factRow = {
    workspace_id: result.workspace_id, store_id: result.store_id, fact_date: result.date,
    timezone: d.timezone, currency: d.currency, facts: d.facts,
    comparisons: (d.facts || []).filter(f => f.metric.startsWith('cmp.')), data_quality: d.structured?.dataQuality || {},
    source_snapshot_ids: d.source_snapshot_ids || [], deterministic_signature: result.daily_signature,
    builder_version: BUILDER_VERSION, generated_at: gen,
  }
  const { error: fe } = await sb.from('gmvmax_daily_facts').upsert(factRow, { onConflict: 'workspace_id,store_id,fact_date,deterministic_signature' })
  if (fe) throw new Error(`PERSIST_ERROR: daily_facts — ${redactError(fe)}`)

  const rows = [result.skill1, result.skill2, result.skill3, result.skill4, result.skill5, result.skill6, result.skill9].map(o => skillRow(o, result, gen))
  const { error: se } = await sb.from('gmvmax_skill_outputs').upsert(rows, { onConflict: 'workspace_id,store_id,output_date,skill_code,scope_type,scope_id,deterministic_signature' })
  if (se) throw new Error(`PERSIST_ERROR: skill_outputs — ${redactError(se)}`)
  return true
}

function skillRow(o, result, gen) {
  const ruleIds = o.rule_ids || (o.rule_ids_used || [])
  const ruleMeta = ruleMetaFor(ruleIds)
  const skillVersion = o.skill_version || '1.0.0-draft'
  const src = o.source_snapshot_ids || result.source_snapshot_ids || []
  return {
    workspace_id: result.workspace_id, store_id: result.store_id, output_date: result.date,
    skill_code: o.skill_code, skill_version: skillVersion,
    scope_type: o.scope_type || 'STORE', scope_id: o.scope_id || result.store_id,
    status: o.status || 'OBSERVE', severity: o.severity || 'INFO', confidence: o.confidence || o.plan_confidence || 'DATA_INSUFFICIENT',
    payload: o, source_snapshot_ids: src,
    rule_ids: ruleIds, rule_versions: ruleMeta,
    deterministic_signature: persistedSignature({ skillCode: o.skill_code, skillVersion, sourceSnapshotIds: src, ruleMeta, payload: o }),
    generated_at: gen, expires_at: o.expires_at || gen,
  }
}
