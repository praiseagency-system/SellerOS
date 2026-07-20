// VPS-SHADOW ENTRYPOINT — deterministik, SHADOW-ONLY, env-only (Linux/VPS).
// BARRIER GANDA: (1) kontrak runtime env.assertVpsShadowContract, (2) TIDAK MENGIMPOR
// writer.mjs / RPC kanonik / helper mutasi apa pun (dibuktikan depgraph.test).
// Jalur ini FISIK tak bisa menulis tabel produksi — hanya SELECT parity + tulis disk shadow.
// Tanpa Keychain, tanpa Claude, tanpa shell interaktif. Env wajib hilang → fail-fast non-zero.
import { createClient } from '@supabase/supabase-js'
import { resolveRuntimeConfig, configShape, RuntimeContractError } from './runtime/env.mjs'
import { classifyAuth, authEvent, isBlocking, AUTH } from './runtime/authState.mjs'
import { resolveSnapshotDate, tzEvidence } from './runtime/jakartaDate.mjs'
import { safeLog, safeStringify, registerSecret } from './runtime/redact.mjs'
import { TikTokMcpProvider } from './providers/tiktokMcp.mjs'
import { loadMcpTokenFromSupabase } from './providers/supabaseTokenStore.mjs'
import { fetchCampaignSettings, persistCampaignSettings } from './campaignSettings.mjs'
import { runSync } from './engine.mjs'
import { buildRunReport, makeRunId } from './reporter.mjs'
import { loadOldSnapshot, compareParity } from './parity.mjs'
import { STATUS, exitCodeFor } from './runStatus.mjs'
import { acquireLock, releaseLock } from './lock.mjs'
import { persistRun, persistBatchSummary } from './shadowStore.mjs'
import { findAdvertiser } from './advertisers.mjs'

const DEFAULT_ADVERTISER = '7313535999831769090'

function parseArgs(a) {
  const r = {}
  for (let i = 0; i < a.length; i++) { const t = a[i]; if (t.startsWith('--')) { const k = t.slice(2), n = a[i + 1]; if (!n || n.startsWith('--')) r[k] = true; else { r[k] = n; i++ } } }
  return r
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function runUnit(provider, sb, adv, date) {
  const runId = makeRunId()
  const startedAt = new Date().toISOString()
  const base = { run_id: runId, advertiser_id: adv.advertiserId, store_id: adv.storeId, workspace_id: adv.workspaceId, snapshot_date: date, mode: 'shadow', started_at: startedAt }

  const lock = acquireLock(adv.advertiserId, date)
  if (!lock.ok) {
    persistRun({ ...base, status: STATUS.LOCKED || 'LOCKED', finished_at: new Date().toISOString(), lock_holder: lock.holder, note: 'run konkuren — dilewati' })
    return { status: 'LOCKED', runId }
  }
  try {
    // Hook test-only (mid-run kill deterministik). Nol efek di produksi (env tak di-set).
    const hold = Number(process.env.GMVMAX_TEST_HOLD_MS || 0)
    if (hold > 0) await sleep(hold)

    let result = null, report, parity = null, status
    try {
      result = await runSync(provider, { advertiserId: adv.advertiserId, storeId: adv.storeId, date })
      report = buildRunReport({ runId, result, status: 'success', authState: provider.auth().state })
      status = STATUS.SUCCESS
      const old = await loadOldSnapshot(sb, adv.workspaceId, date) // READ-ONLY (SELECT)
      parity = old
        ? { status: compareParity(old.rows, result.rows).status, ...compareParity(old.rows, result.rows), old_import_id: old.import.id, old_created_at: old.import.created_at }
        : { status: 'NO_OLD_BASELINE' }
    } catch (e) {
      status = e.code === 'AUTH_EXPIRED' ? STATUS.AUTH_REQUIRED : STATUS.FAILED
      report = buildRunReport({ runId, result: null, status: 'failed', authState: provider.auth().state, error: e })
    }

    // STAGE 2C: kegagalan tulis bukti shadow → FAILED eksplisit (BUKAN fake SUCCESS).
    const finishedAt = new Date().toISOString()
    const rec = { ...base, status, finished_at: finishedAt, report, parity, new_output: result ? { totals: result.totals, rowCount: result.rows.length } : null }
    try {
      persistRun(rec)
    } catch (pe) {
      return { status: STATUS.FAILED, runId, parity, report, startedAt, finishedAt, persistError: pe.code || 'SHADOW_PERSIST_FAILED', message: pe.message }
    }
    return { status, runId, parity, report, startedAt, finishedAt }
  } finally {
    releaseLock(lock.path)
  }
}

// STAGE 3.10 — ringkasan operasional MACHINE-READABLE (journald) + event alert.
function rowMismatchCount(parity) {
  const c = parity?.rowLevel?.counts
  return c ? (c.missingInNew + c.missingInOld + c.valueDiffs + c.classificationDiffs) : 0
}
function emitRunSummary(res, adv, date, authEv, exitCode) {
  const r = res.report || {}
  safeLog({
    event: 'RUN_SUMMARY',
    run_id: res.runId, advertiser_id: adv.advertiserId, snapshot_date: date,
    started_at: res.startedAt ?? null, finished_at: res.finishedAt ?? null,
    duration_ms: r.duration_ms ?? null, auth_state: authEv.state,
    campaign_count: r.campaign_count ?? 0, page_count: r.page_count ?? 0,
    raw_row_count: r.raw_row_count ?? 0, normalized_row_count: r.normalized_row_count ?? 0,
    parity_status: res.parity?.status ?? null, row_mismatch_count: rowMismatchCount(res.parity),
    status: res.status, exit_code: exitCode,
  })
}
// Event alert-ready terpisah (machine-readable) untuk kondisi yang perlu perhatian.
function emitAlerts(res, adv, date) {
  const out = []
  if (res.parity?.status === 'MISMATCH') out.push({ event: 'PARITY_MISMATCH', level: 'critical', advertiser_id: adv.advertiserId, snapshot_date: date, row_mismatch_count: rowMismatchCount(res.parity) })
  if (res.status === STATUS.PARTIAL) out.push({ event: 'RUN_PARTIAL', level: 'warn', advertiser_id: adv.advertiserId, snapshot_date: date })
  if (res.status === 'LOCKED') out.push({ event: 'LOCK_CONTENTION', level: 'warn', advertiser_id: adv.advertiserId, snapshot_date: date })
  if (res.persistError) out.push({ event: 'DISK_FAILURE', level: 'critical', advertiser_id: adv.advertiserId, snapshot_date: date, code: res.persistError })
  for (const a of out) safeLog(a, console.error)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // BARRIER + kontrak env (fail-fast SEBELUM I/O apa pun).
  let cfg
  try {
    cfg = resolveRuntimeConfig(process.env)
    if (cfg.mode !== 'vps') throw new RuntimeContractError('NOT_VPS_RUNTIME', 'Entrypoint ini hanya untuk GMVMAX_RUNTIME=vps.')
  } catch (e) {
    safeLog({ event: 'RUNTIME_CONTRACT_FAILED', code: e.code || 'CONTRACT_ERROR', message: e.message }, console.error)
    process.exit(exitCodeFor(STATUS.FAILED)) // non-zero
  }
  safeLog({ event: 'RUNTIME_OK', config: configShape(cfg) })

  const now = Date.now()
  const date = resolveSnapshotDate(args.date, now)
  safeLog({ event: 'TZ_RESOLVED', ...tzEvidence(now, args.date || 'yesterday') })

  const sb = createClient(cfg.supabase.url, cfg.supabase.key, { auth: { persistSession: false } })
  const adv = findAdvertiser(args.advertiser || DEFAULT_ADVERTISER)

  // Resolusi token MCP: 'env' (inject dari env, Keychain-bridge) ATAU 'supabase'
  // (baca koneksi website utk workspace advertiser + self-refresh + writeback ke
  // tiktok_connections — BUKAN tabel kanonik GMV Max, barrier shadow tetap utuh).
  let mcpToken, mcpUrl, mcpExpiresAt
  if (cfg.tokenSource === 'supabase') {
    try {
      const t = await loadMcpTokenFromSupabase({ supabase: sb, workspaceId: adv.workspaceId })
      mcpToken = t.accessToken; mcpUrl = t.serverUrl; mcpExpiresAt = t.expiresAt
      registerSecret(mcpToken)
      safeLog({ event: 'TOKEN_SOURCE', source: t.source, workspace_id: adv.workspaceId, advertiser_id: adv.advertiserId, expiresAt: new Date(t.expiresAt).toISOString() })
    } catch (e) {
      safeLog({ event: 'TOKEN_SOURCE_FAILED', workspace_id: adv.workspaceId, message: e.message }, console.error)
      persistBatchSummary({ mode: 'shadow', batch_status: STATUS.AUTH_REQUIRED, dates: [date], units: 0, note: 'gagal ambil/refresh token Supabase → tidak ada request MCP, tidak ada tulisan' })
      process.exit(exitCodeFor(STATUS.AUTH_REQUIRED)) // 4
    }
  } else {
    mcpToken = cfg.mcp.token; mcpUrl = cfg.mcp.url; mcpExpiresAt = cfg.mcp.expiresAt
  }

  // Provider inject → tokenStore/Keychain TIDAK tersentuh.
  const provider = new TikTokMcpProvider({ token: mcpToken, serverUrl: mcpUrl, expiresAt: mcpExpiresAt })

  // AUTH state model (Stage 1C) — fail-explicit sebelum request MCP bila blocking.
  const cls = classifyAuth(mcpExpiresAt, now)
  const aev = authEvent(cls)
  safeLog(aev, aev.level === 'info' ? console.log : console.error)
  if (isBlocking(cls.state)) {
    persistBatchSummary({ mode: 'shadow', batch_status: STATUS.AUTH_REQUIRED, auth: aev, dates: [date], units: 0, note: 'token blocking → tidak ada request MCP, tidak ada tulisan' })
    process.exit(exitCodeFor(STATUS.AUTH_REQUIRED)) // 4
  }

  const res = await runUnit(provider, sb, adv, date)

  // Snapshot setting campaign (budget/bid/auto-budget) → tabel BARU
  // gmvmax_campaign_settings. BUKAN tabel kanonik → tak melanggar barrier
  // shadow-only. NON-FATAL: gagal di sini tak boleh menggagalkan sync utama.
  try {
    const cs = await fetchCampaignSettings(provider, { advertiserId: adv.advertiserId, storeId: adv.storeId })
    const { written } = await persistCampaignSettings(sb, { workspaceId: adv.workspaceId, date, rows: cs })
    safeLog({ event: 'CAMPAIGN_SETTINGS_CAPTURED', count: written, snapshot_date: date, advertiser_id: adv.advertiserId })
  } catch (e) {
    safeLog({ event: 'CAMPAIGN_SETTINGS_FAILED', level: 'warn', snapshot_date: date, message: e.message }, console.error)
  }

  try { persistBatchSummary({ mode: 'shadow', batch_status: res.status, auth: aev, advertiser: adv.advertiserId, date, parity: res.parity?.status ?? null, persistError: res.persistError ?? null }) } catch { /* disk fail sudah dilaporkan via runUnit */ }
  const exitCode = exitCodeFor(res.status)
  emitRunSummary(res, adv, date, aev, exitCode) // STAGE 3.10 machine-readable summary
  emitAlerts(res, adv, date)                    // event alert-ready
  process.exit(exitCode)
}

main().catch(e => { safeLog({ event: 'UNCAUGHT', message: e.message, code: e.code || null }, console.error); process.exit(1) })
