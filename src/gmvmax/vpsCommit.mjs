// VPS-COMMIT ENTRYPOINT — worker deterministik yang MENULIS PRODUKSI (kanonik).
// TERPISAH dari vpsShadow.mjs (yang shadow-only + barrier). Sengaja MENGIMPOR
// writer.mjs (tugasnya menulis) via RPC atomik gmvmax_replace_snapshot (migrasi
// 0017): DELETE+INSERT dalam 1 transaksi, idempoten (ganti snapshot tanggal sama).
//
// GUARD BERLAPIS (mustahil jalan tak sengaja):
//   - GMVMAX_RUNTIME=vps  wajib
//   - GMVMAX_COMMIT=1     wajib (tanpa ini → tolak, tak menulis)
//   - --dry-run           → hitung payload + parity, TIDAK menulis
//
// MULTI-ADVERTISER: tanpa --advertiser → loop SEMUA eligible (advertisers.mjs)
// dengan ISOLASI per-advertiser (1 gagal ≠ semua batal) + spasi antar-tenant
// (ember rate-limit tt-ads-mcp-layer dibagi → jangan tembak beruntun). Dengan
// --advertiser X → hanya X (mis. backfill manual). Token per-workspace dari
// Supabase (self-refresh). Parity vs OLD dicatat SEBELUM menimpa. Setting NON-FATAL.
import { createClient } from '@supabase/supabase-js'
import { classifyAuth, authEvent, isBlocking } from './runtime/authState.mjs'
import { resolveSnapshotDate, tzEvidence } from './runtime/jakartaDate.mjs'
import { safeLog, registerSecret } from './runtime/redact.mjs'
import { TikTokMcpProvider } from './providers/tiktokMcp.mjs'
import { loadMcpTokenFromSupabase } from './providers/supabaseTokenStore.mjs'
import { runSync } from './engine.mjs'
import { writeSnapshot } from './writer.mjs'
import { loadOldSnapshot, compareParity } from './parity.mjs'
import { acquireLock, releaseLock } from './lock.mjs'
import { makeRunId } from './reporter.mjs'
import { findDuplicateIdentities } from './identity.mjs'
import { findAdvertiser, eligibleAdvertisers, groupByWorkspace } from './advertisers.mjs'
import { loadEligibleConnections } from './connections.mjs'
import { fetchCampaignSettings, persistCampaignSettings } from './campaignSettings.mjs'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const labelFor = (date) => { const [y, m, d] = date.split('-'); return `${+d} ${MONTHS[+m - 1]} ${y} (API)` }
const firstEnv = (keys) => { for (const k of keys) if (process.env[k]) return process.env[k]; return null }
function parseArgs(a) { const r = {}; for (let i = 0; i < a.length; i++) { const t = a[i]; if (t.startsWith('--')) { const k = t.slice(2), n = a[i + 1]; if (!n || n.startsWith('--')) r[k] = true; else { r[k] = n; i++ } } } return r }
const mismatch = (p) => { const c = p?.rowLevel?.counts; return c ? (c.missingInNew + c.missingInOld + c.valueDiffs + c.classificationDiffs) : 0 }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
// Jeda antar-tenant: ember rate-limit dibagi semua workspace (terbukti per-app,
// throttle jendela-burst ~3-4 call/dtk). Beri nafas sebelum tenant berikutnya.
const INTER_ADV_DELAY_MS = 3000

// Gabung beberapa hasil runSync (>1 advertiser/workspace) → 1 snapshot. Identity
// kanonik (campaign,SPU,item) berbeda antar-advertiser (campaign_id beda) → concat
// aman. Totals dijumlahkan. Guard defensif: identity dobel = data cacat → throw.
function mergeResults(parts) {
  if (parts.length === 1) return parts[0]
  const rows = parts.flatMap(p => p.rows)
  const dups = findDuplicateIdentities(rows.filter(r => !r.isSystem))
  if (dups.length) { const e = new Error(`MERGE_DUPLICATE_IDENTITY: ${dups.length} identity dobel antar-advertiser (tak diharapkan)`); e.code = 'MERGE_DUPLICATE_IDENTITY'; throw e }
  const totals = { cost: 0, revenue: 0, orders: 0, roas: null }
  for (const p of parts) { totals.cost += p.totals.cost || 0; totals.revenue += p.totals.revenue || 0; totals.orders += p.totals.orders || 0 }
  totals.roas = totals.cost > 0 ? totals.revenue / totals.cost : null
  const completeness = rows.length > 0 ? 'COMPLETE_WITH_ROWS'
    : (parts.every(p => p.meta?.completeness === 'COMPLETE_ZERO_DATA') ? 'COMPLETE_ZERO_DATA' : 'COMPLETE_WITH_ROWS')
  return { rows, totals, meta: { completeness, mergedFrom: parts.length } }
}

// Proses SATU workspace end-to-end (jalankan engine tiap advertiser-nya lalu
// GABUNG jadi 1 snapshot). TIDAK pernah throw — kembalikan {ok,...} supaya
// kegagalan satu workspace tak menjatuhkan yang lain (isolasi).
async function processWorkspace({ sb, workspaceId, entries, date, dryRun, now }) {
  const runId = makeRunId()
  const advIds = entries.map(e => e.advertiserId)

  // Token per-WORKSPACE (satu utk semua advertiser workspace ini) — self-refresh.
  let provider
  try {
    const t = await loadMcpTokenFromSupabase({ supabase: sb, workspaceId })
    registerSecret(t.accessToken)
    safeLog({ event: 'TOKEN_SOURCE', source: t.source, workspace_id: workspaceId, advertiser_ids: advIds, expiresAt: new Date(t.expiresAt).toISOString() })
    provider = new TikTokMcpProvider({ token: t.accessToken, serverUrl: t.serverUrl, expiresAt: t.expiresAt })
    const cls = classifyAuth(t.expiresAt, now); const aev = authEvent(cls)
    safeLog({ ...aev, workspace_id: workspaceId }, aev.level === 'info' ? console.log : console.error)
    if (isBlocking(cls.state)) {
      safeLog({ event: 'ABORT_AUTH', workspace_id: workspaceId, message: 'token blocking → dilewati (workspace lain lanjut).' }, console.error)
      return { ok: false, workspaceId, advertiserId: advIds.join('+'), runId, status: 'AUTH_BLOCKING', error: 'AUTH_BLOCKING' }
    }
  } catch (e) {
    safeLog({ event: 'TOKEN_SOURCE_FAILED', workspace_id: workspaceId, message: e.message }, console.error)
    return { ok: false, workspaceId, advertiserId: advIds.join('+'), runId, status: 'TOKEN_FAILED', error: `TOKEN_SOURCE_FAILED: ${e.message}` }
  }

  // Lock per-WORKSPACE (kita menulis 1 snapshot/workspace, bukan per advertiser).
  const lock = acquireLock(workspaceId, date)
  if (!lock.ok) { safeLog({ event: 'LOCKED', workspace_id: workspaceId, holder: lock.holder }, console.error); return { ok: false, workspaceId, advertiserId: advIds.join('+'), runId, status: 'LOCKED', error: 'LOCKED' } }
  try {
    // 1) Tarik tiap advertiser (spasi antar-akun) lalu GABUNG.
    const parts = []
    for (let i = 0; i < entries.length; i++) {
      if (i > 0) await sleep(INTER_ADV_DELAY_MS)
      const en = entries[i]
      const res = await runSync(provider, { advertiserId: en.advertiserId, storeId: en.storeId, date })
      safeLog({ event: 'ADVERTISER_PULLED', workspace_id: workspaceId, advertiser_id: en.advertiserId, row_count: res.rows.length, totals: res.totals })
      parts.push(res)
    }
    const result = mergeResults(parts)

    // 2) Parity vs OLD SEBELUM menimpa — seberapa beda dari tulisan terakhir.
    let parity = { status: 'NO_OLD_BASELINE' }
    try {
      const old = await loadOldSnapshot(sb, workspaceId, date)
      if (old) { const cp = compareParity(old.rows, result.rows); parity = { status: cp.status, rowLevel: cp.rowLevel, old_import_id: old.import.id } }
    } catch (e) { safeLog({ event: 'PARITY_READ_FAILED', workspace_id: workspaceId, message: e.message }, console.error) }
    safeLog({ event: 'PRE_COMMIT_PARITY', workspace_id: workspaceId, status: parity.status, row_mismatch: mismatch(parity), old_import_id: parity.old_import_id ?? null })

    // 3) COMMIT atomik (writeSnapshot commit:true) atau dry-run (sb:null → tak menulis).
    const w = await writeSnapshot({ sb: dryRun ? null : sb, workspaceId, date, name: labelFor(date), result, commit: !dryRun })
    safeLog({ event: dryRun ? 'COMMIT_DRYRUN' : 'COMMIT_WRITTEN', workspace_id: workspaceId, advertiser_ids: advIds, ...w, run_id: runId })

    // 4) Setting campaign (NON-FATAL) tiap advertiser — hanya saat commit.
    if (!dryRun) {
      for (const en of entries) {
        try {
          const csRows = await fetchCampaignSettings(provider, { advertiserId: en.advertiserId, storeId: en.storeId })
          const { written } = await persistCampaignSettings(sb, { workspaceId, date, rows: csRows })
          safeLog({ event: 'CAMPAIGN_SETTINGS_CAPTURED', workspace_id: workspaceId, advertiser_id: en.advertiserId, count: written, snapshot_date: date })
        } catch (e) { safeLog({ event: 'CAMPAIGN_SETTINGS_FAILED', workspace_id: workspaceId, advertiser_id: en.advertiserId, level: 'warn', message: e.message }, console.error) }
      }
    }

    safeLog({
      event: 'RUN_SUMMARY', run_id: runId, mode: dryRun ? 'commit-dryrun' : 'commit',
      workspace_id: workspaceId, advertiser_ids: advIds, snapshot_date: date,
      row_count: result.rows.length, totals: result.totals,
      pre_commit_parity: parity.status, row_mismatch: mismatch(parity),
      written: !dryRun && w.written === true, import_id: w.importId ?? null,
      status: 'SUCCESS', exit_code: 0,
    })
    return {
      ok: true, workspaceId, advertiserId: advIds.join('+'), runId, status: 'SUCCESS',
      written: !dryRun && w.written === true, importId: w.importId ?? null, parity: parity.status,
      rowCount: result.rows.length, totals: result.totals,
    }
  } catch (e) {
    safeLog({ event: 'COMMIT_FAILED', workspace_id: workspaceId, code: e.code || null, message: e.message, snapshot_date: date }, console.error)
    return { ok: false, workspaceId, advertiserId: advIds.join('+'), runId, status: 'FAILED', error: `${e.code || 'ERROR'}: ${e.message}` }
  } finally {
    releaseLock(lock.path)
  }
}

// Audit per-run per-workspace (gmvmax_sync_runs). NON-FATAL: gagal audit tak
// menggagalkan commit (mis. tabel belum ada sebelum migrasi 0021 di-apply).
async function recordSyncRun(sb, r, date) {
  try {
    const { error } = await sb.from('gmvmax_sync_runs').insert({
      workspace_id: r.workspaceId, advertiser_id: r.advertiserId, snapshot_date: date,
      run_id: r.runId ?? null, mode: 'commit', status: r.status,
      row_count: r.rowCount ?? null, cost: r.totals?.cost ?? null,
      revenue: r.totals?.revenue ?? null, orders: r.totals?.orders ?? null,
      parity: r.parity ?? null, import_id: r.importId ?? null,
      error: r.error ?? null, duration_ms: r.durationMs ?? null,
    })
    if (error) throw new Error(error.message)
  } catch (e) {
    safeLog({ event: 'SYNC_RUN_AUDIT_FAILED', level: 'warn', advertiser_id: r.advertiserId, message: e.message }, console.error)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dryRun = args['dry-run'] === true

  // GUARD berlapis (fail-fast sebelum I/O).
  if (process.env.GMVMAX_RUNTIME !== 'vps') { safeLog({ event: 'CONTRACT_FAILED', code: 'NOT_VPS', message: 'GMVMAX_RUNTIME harus "vps".' }, console.error); process.exit(1) }
  if (!dryRun && process.env.GMVMAX_COMMIT !== '1') {
    safeLog({ event: 'COMMIT_GUARD', message: 'GMVMAX_COMMIT != "1" → MENOLAK menulis produksi. Set GMVMAX_COMMIT=1 utk commit, atau pakai --dry-run.' }, console.error)
    process.exit(1)
  }
  const sbUrl = firstEnv(['GMVMAX_SUPABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const sbKey = firstEnv(['GMVMAX_SUPABASE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'])
  if (!sbUrl || !sbKey) { safeLog({ event: 'CONTRACT_FAILED', code: 'MISSING_SUPABASE', message: 'URL+key Supabase wajib.' }, console.error); process.exit(1) }
  registerSecret(sbKey)

  const now = Date.now()
  const date = resolveSnapshotDate(args.date, now)

  const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } })
  const tenantSource = (process.env.GMVMAX_TENANT_SOURCE || 'registry').toLowerCase()

  // Target: --advertiser X → hanya X (backfill manual, dari registry). Else:
  //   GMVMAX_TENANT_SOURCE=connections → data-driven dari tiktok_connections (zero-touch)
  //   default 'registry' → advertisers.mjs (perilaku produksi sekarang; flip SETELAH gate).
  let targets
  if (args.advertiser) targets = [findAdvertiser(args.advertiser)]
  else if (tenantSource === 'connections') targets = await loadEligibleConnections(sb)
  else targets = eligibleAdvertisers()

  // Kelompokkan per workspace: >1 advertiser/workspace → DIJUMLAHKAN jadi 1 snapshot
  // (mis. Dasfelix migrasi akun ads, satu store). 1 workspace = 1 unit isolasi & lock.
  const workspaces = groupByWorkspace(targets)
  safeLog({ event: 'COMMIT_START', snapshot_date: date, dry_run: dryRun, commit_env: process.env.GMVMAX_COMMIT === '1', tenant_source: args.advertiser ? 'single' : tenantSource, workspace_count: workspaces.length, advertiser_ids: targets.map(a => a.advertiserId) })
  safeLog({ event: 'TZ_RESOLVED', ...tzEvidence(now, args.date || 'yesterday') })

  // Loop per-workspace + isolasi + spasi antar-workspace (ember rate-limit dibagi).
  const results = []
  for (let i = 0; i < workspaces.length; i++) {
    if (i > 0) await sleep(INTER_ADV_DELAY_MS)
    const t0 = Date.now()
    const r = await processWorkspace({ sb, workspaceId: workspaces[i].workspaceId, entries: workspaces[i].entries, date, dryRun, now })
    r.durationMs = Date.now() - t0
    if (!dryRun) await recordSyncRun(sb, r, date) // audit HANYA run produksi
    results.push(r)
  }

  const failed = results.filter(r => !r.ok)
  safeLog({
    event: 'COMMIT_BATCH_SUMMARY', snapshot_date: date, mode: dryRun ? 'commit-dryrun' : 'commit',
    total: results.length, ok: results.length - failed.length, failed: failed.length,
    failures: failed.map(f => ({ workspace_id: f.workspaceId, advertiser_id: f.advertiserId, error: f.error })),
  })
  // Exit 0 hanya bila SEMUA sukses; partial/total gagal → 2 (systemd tandai failed → monitoring).
  process.exit(failed.length === 0 ? 0 : 2)
}

main().catch(e => { safeLog({ event: 'UNCAUGHT', message: e.message, code: e.code || null }, console.error); process.exit(1) })
