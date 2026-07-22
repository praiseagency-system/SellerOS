// GMV Max — DECISION INTELLIGENCE CLI (Phase 3A 2C). Controlled, read-only.
//   node src/gmvmax/skills/generate.mjs --workspace <uuid> --store <id> \
//        --date YYYY-MM-DD --dry-run --format summary
// Required: --workspace --store --date. Options: --dry-run, --format json|summary,
// --output <safe-local-path>, --skill 1,2,3,4,9.
// NOT supported (rejected): all-workspace, date ranges, scheduling, mutation,
// arbitrary SQL, arbitrary module execution. Default: --dry-run. Never persists
// in this increment. Never prints tokens/headers/raw payloads/unredacted errors.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, relative, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const KNOWN = new Set(['--workspace', '--store', '--date', '--dry-run', '--format', '--output', '--skill'])
const VALID_SKILLS = [1, 2, 3, 4, 9]
const SECRET_RE = /(access_token|refresh_token|client_secret|service_role_key|authorization|bearer|apikey|api_key|supabase_secret)/i

export function parseArgs(argv) {
  const out = { dryRun: true, format: 'summary', skills: null, output: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) throw new Error(`CLI_BAD_ARG: argumen tak dikenal "${a}"`)
    if (!KNOWN.has(a)) throw new Error(`CLI_BAD_ARG: opsi tak didukung "${a}" (all-workspace/range/schedule/sql/module DILARANG)`)
    if (a === '--dry-run') { out.dryRun = true; continue }
    const v = argv[++i]
    if (v == null) throw new Error(`CLI_BAD_ARG: "${a}" butuh nilai`)
    if (a === '--workspace') out.workspace = v
    else if (a === '--store') out.store = v
    else if (a === '--date') out.date = v
    else if (a === '--format') out.format = v
    else if (a === '--output') out.output = v
    else if (a === '--skill') out.skills = v.split(',').map(s => Number(s.trim()))
  }
  return out
}

export function validateArgs(p) {
  if (!p.workspace || !UUID_RE.test(p.workspace)) throw new Error('CLI_INVALID: --workspace harus UUID')
  if (!p.store) throw new Error('CLI_INVALID: --store wajib')
  if (!p.date || !DATE_RE.test(p.date)) throw new Error('CLI_INVALID: --date harus YYYY-MM-DD')
  if (!['json', 'summary'].includes(p.format)) throw new Error('CLI_INVALID: --format harus json|summary')
  if (p.skills) for (const s of p.skills) if (!VALID_SKILLS.includes(s)) throw new Error(`CLI_INVALID: --skill ${s} tak valid (1,2,3,4,9)`)
  if (p.output) assertSafeOutputPath(p.output)
  return true
}

// Dependency order: 9 needs 1-4; 4 needs 2,3; 3 needs 1,2; 2 needs 1. Expand the
// requested set to include dependencies (the pipeline computes the full chain).
export function resolveSkills(requested) {
  const deps = { 1: [1], 2: [1, 2], 3: [1, 2, 3], 4: [1, 2, 3, 4], 9: [1, 2, 3, 4, 9] }
  if (!requested || !requested.length) return [...VALID_SKILLS]
  const set = new Set()
  for (const s of requested) for (const d of deps[s] || [s]) set.add(d)
  return [...set].sort((a, b) => a - b)
}

// Output path must be relative, contain no traversal, and stay under cwd.
export function assertSafeOutputPath(p, cwd = process.cwd()) {
  if (isAbsolute(p)) throw new Error('CLI_UNSAFE_PATH: --output harus relatif (bukan absolut)')
  if (p.split(/[\\/]/).includes('..')) throw new Error('CLI_UNSAFE_PATH: --output tak boleh memuat ".."')
  const full = resolve(cwd, p)
  const rel = relative(cwd, full)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('CLI_UNSAFE_PATH: --output keluar dari direktori kerja')
  return full
}

// Defensive: strip any key that looks like a secret before printing.
export function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets)
  if (value && typeof value === 'object') {
    const o = {}
    for (const [k, v] of Object.entries(value)) o[k] = SECRET_RE.test(k) ? '[redacted]' : stripSecrets(v)
    return o
  }
  return value
}

export function formatSummary(result, skillSet) {
  const want = new Set(skillSet || VALID_SKILLS)
  const s1 = result.skill1, s2 = result.skill2, s3 = result.skill3, s4 = result.skill4, s9 = result.skill9
  const dq = s1?.blueprint?.DATA_QUALITY || {}
  const readiness = (s1?.blueprint?.DOWNSTREAM_SKILL_READINESS || []).map(r => `${r.skill_code.slice(-2)}:${r.status}`).join(' ')
  const L = []
  L.push(`WORKSPACE: ${result.workspace_id}`)
  L.push(`STORE:     ${result.store_id}`)
  L.push(`DATE:      ${result.date}`)
  L.push(`SOURCE SNAPSHOTS: ${JSON.stringify(result.source_snapshot_ids)}`)
  L.push(`DATA QUALITY: pagination=${dq.pagination_complete} sources=${dq.sources_processed}/${dq.sources_expected} failed=${dq.sources_failed} parity=${dq.parity_status}`)
  if (want.has(1)) L.push(`SKILL 1 READINESS: confidence=${s1.confidence} | ${readiness}`)
  if (want.has(2)) L.push(`SKILL 2 ATTRIBUTION: confidence=${s2.attribution_audit.attribution_confidence} readiness=${s2.attribution_audit.decision_readiness} incrementality=${s2.attribution_audit.incrementality_confidence}`)
  if (want.has(3)) { L.push(`SKILL 3 TOP EVENTS (${s3.event_count}):`); for (const e of s3.events.slice(0, 5)) L.push(`  - [${e.severity}/${e.mode}] ${e.event_type} — ${e.title_en}`) }
  if (want.has(4)) { L.push(`SKILL 4 TOP DIAGNOSES (${s4.diagnosis_count}):`); for (const d of s4.diagnoses.slice(0, 5)) L.push(`  - [${d.level}/${d.confidence}] ${d.observed_outcome} → ${d.candidate_driver}`) }
  if (want.has(9)) { L.push(`SKILL 9 PRIMARY ACTIONS (${s9.primary_actions.length}):`); for (const a of s9.primary_actions) L.push(`  - [${a.status}${a.approval_required ? '/APPROVAL' : ''}] ${a.title_en}`) }
  L.push(`MISSING DATA: ${JSON.stringify(result.missing_inputs)}`)
  L.push(`LIMITATIONS: ${JSON.stringify((s1?.limitations || []).slice(0, 5))}`)
  L.push(`DETERMINISTIC SIGNATURE: ${result.daily_signature}`)
  L.push('EXECUTION_ALLOWED=false')
  return L.join('\n')
}

// ── main (only when invoked directly) ────────────────────────────────────────
async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  validateArgs(parsed)
  const skillSet = resolveSkills(parsed.skills)
  const { createClient } = await import('@supabase/supabase-js')
  const { supabaseAdapter } = await import('./loader.mjs')
  const { generateDecisionIntelligence } = await import('./pipeline.mjs')
  const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
  const pe = (p) => { const o = {}; for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '') } return o }
  let sb
  try { const L = pe(`${REPO}/.env.local`), S = pe(`${REPO}/.env.sync.local`); sb = createClient(L.VITE_SUPABASE_URL, S.SUPABASE_SECRET_KEY, { auth: { persistSession: false } }) }
  catch { throw new Error('CLI_ENV: gagal memuat kredensial lokal (.env.local/.env.sync.local)') }

  const result = await generateDecisionIntelligence({
    db: supabaseAdapter(sb), workspaceId: parsed.workspace, storeId: parsed.store, date: parsed.date,
    generatedAt: new Date().toISOString(), persist: false, skills: skillSet,
  })
  const safe = stripSecrets(result)
  const text = parsed.format === 'json' ? JSON.stringify(safe, null, 2) : formatSummary(safe, skillSet)
  if (parsed.output) { const full = assertSafeOutputPath(parsed.output); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, text); process.stdout.write(`written: ${parsed.output}\n`) }
  else process.stdout.write(text + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => {
    const { redactError } = await import('./loader.mjs')
    process.stderr.write(`ERROR: ${redactError(e)}\n`)
    process.exit(1)
  })
}
