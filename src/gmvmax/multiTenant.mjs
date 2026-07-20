// GMV Max — MULTI-TENANT READ-ONLY SHADOW ORCHESTRATOR (Phase 2 preparation).
//
// Tujuan: mengganti jalur discovery single-advertiser hardcode (advertisers.mjs
// + DEFAULT_ADVERTISER) dengan jalur DATA-DRIVEN dari `tiktok_connections`, yang
// memproses banyak workspace SECARA INDEPENDEN, read-only terhadap TikTok.
//
// ⚠️ SHADOW-ONLY & OFF-BY-DEFAULT. Modul ini:
//   - TIDAK memanggil endpoint mutasi TikTok apa pun (lihat FORBIDDEN_MUTATION_TOOLS).
//   - TIDAK menulis snapshot kanonik (gmvmax_imports/creatives). Parity vs OLD =
//     SELECT read-only saja (tak pernah overwrite canonical).
//   - MENULIS hanya: gmvmax_feature_registry(+_history) (idempoten, Phase 1) dan
//     gmvmax_sync_runs (audit). Opsional gmvmax_campaign_settings (tabel non-kanonik).
//   - TIDAK diimpor oleh worker.mjs / vpsShadow.mjs / vpsCommit.mjs → perilaku
//     produksi lama TIDAK berubah. Diaktifkan hanya via entrypoint multiTenantShadow.mjs
//     di balik flag GMVMAX_MULTI_TENANT_SHADOW=1.
//
// Pemisahan: provider (read-only MCP) → normalizer (deterministik, reuse Phase 1
// featureRegistry.mjs + engine.mjs) → writer (tenant-aware). Semua konteks tenant
// (workspace_id, connection_id, advertiser_id, store_id) dialirkan eksplisit —
// TIDAK ADA state advertiser global yang mutable.
import { FORBIDDEN_MUTATION_TOOLS } from './featureRegistry.mjs'

export const WORKER_VERSION = 'mt-shadow-0.1.0'

// ── Status koneksi (Part 2) ──────────────────────────────────────────────────
export const CONNECTION_STATUS = Object.freeze({
  CANDIDATE: 'CANDIDATE',
  CONNECTION_MISSING: 'CONNECTION_MISSING',
  CONNECTION_INACTIVE: 'CONNECTION_INACTIVE',
  ADVERTISER_MISSING: 'ADVERTISER_MISSING',
  STORE_MISSING: 'STORE_MISSING',
  TOKEN_MISSING: 'TOKEN_MISSING',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  UNKNOWN: 'UNKNOWN',
})

// ── Status eligibility tenant (Part 3, selaras Phase 1) ──────────────────────
export const ELIGIBILITY = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  AUTHORIZATION_MISMATCH: 'AUTHORIZATION_MISMATCH',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  STORE_NOT_FOUND: 'STORE_NOT_FOUND',
  CONNECTION_MISSING: 'CONNECTION_MISSING',
  UNKNOWN: 'UNKNOWN',
  DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
})

// ── Status hasil per-tenant (Part 5) ─────────────────────────────────────────
export const TENANT_RESULT = Object.freeze({
  SUCCESS: 'SUCCESS',
  PARTIAL_SUCCESS: 'PARTIAL_SUCCESS',
  SKIPPED_NOT_ELIGIBLE: 'SKIPPED_NOT_ELIGIBLE',
  AUTHORIZATION_MISMATCH: 'AUTHORIZATION_MISMATCH',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  API_ERROR: 'API_ERROR',
  NORMALIZATION_ERROR: 'NORMALIZATION_ERROR',
  PERSISTENCE_ERROR: 'PERSISTENCE_ERROR',
  DATA_INCOMPLETE: 'DATA_INCOMPLETE',
  TOKEN_FAILED: 'TOKEN_FAILED',
  SKIPPED_INVALID_CONNECTION: 'SKIPPED_INVALID_CONNECTION',
})

// Redaksi ID untuk log (jangan bocorkan advertiser/store penuh).
export const maskId = (v) => (v == null ? null : '…' + String(v).slice(-4))

// ── Part 2: klasifikasi koneksi mentah `tiktok_connections` ──────────────────
// row: baris tiktok_connections. Tidak menyentuh token value di return.
export function classifyConnection(row, { now = Date.now() } = {}) {
  if (!row) return { status: CONNECTION_STATUS.CONNECTION_MISSING }
  if (row.status && String(row.status).toLowerCase() === 'inactive') return { status: CONNECTION_STATUS.CONNECTION_INACTIVE }
  if (!row.advertiser_id) return { status: CONNECTION_STATUS.ADVERTISER_MISSING }
  if (!row.store_id) return { status: CONNECTION_STATUS.STORE_MISSING }
  if (!row.access_token) return { status: CONNECTION_STATUS.TOKEN_MISSING }
  // Token kedaluwarsa TANPA refresh_token → tak bisa dipakai (self-refresh gagal).
  const exp = Date.parse(row.expires_at)
  if (Number.isFinite(exp) && exp <= now && !row.refresh_token) return { status: CONNECTION_STATUS.TOKEN_EXPIRED }
  return { status: CONNECTION_STATUS.CANDIDATE }
}

// → daftar kandidat + daftar yang ditolak (dengan alasan). Tak pernah throw.
export function discoverConnections(rows, { now = Date.now() } = {}) {
  const candidates = [], rejected = []
  for (const row of rows || []) {
    const c = classifyConnection(row, { now })
    const base = {
      workspaceId: row.workspace_id, connectionId: row.id ?? null,
      advertiserId: row.advertiser_id ?? null, storeId: row.store_id ?? null,
      storeAuthorizedBcId: row.store_authorized_bc_id ?? null,
      brandId: row.brand_id ?? null, label: row.store_name || row.advertiser_name || row.advertiser_id || null,
    }
    if (c.status === CONNECTION_STATUS.CANDIDATE) candidates.push({ ...base, connectionStatus: c.status })
    else rejected.push({ ...base, connectionStatus: c.status })
  }
  return { candidates, rejected }
}

// ── Map eligibility → status hasil per-tenant ────────────────────────────────
function eligibilityToResult(elig) {
  switch (elig) {
    case ELIGIBILITY.ELIGIBLE: return null // lanjut
    case ELIGIBILITY.AUTHORIZATION_MISMATCH: return TENANT_RESULT.AUTHORIZATION_MISMATCH
    case ELIGIBILITY.PERMISSION_DENIED: return TENANT_RESULT.PERMISSION_DENIED
    // DATA_UNAVAILABLE dari evaluateTenantEligibility = store_list gagal (transport) → API_ERROR.
    case ELIGIBILITY.DATA_UNAVAILABLE: return TENANT_RESULT.API_ERROR
    default: return TENANT_RESULT.SKIPPED_NOT_ELIGIBLE // NOT_AVAILABLE/STORE_NOT_FOUND/CONNECTION_MISSING/UNKNOWN
  }
}

const withTimeout = (p, ms, code) => {
  if (!ms) return p
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => { const e = new Error(`${code}: timeout ${ms}ms`); e.code = code; rej(e) }, ms))])
}

// ── Part 4: pipeline read-only SATU tenant. TIDAK PERNAH throw (Part 5) ───────
// deps (di-inject agar testable & agar tak ada state global):
//   fetchRegistryInputs(provider, conn, opts) → { tenant:{status}, records }
//   persistRegistry(sb, { workspaceId, userId, connectionId, records })
//   resolveOwner(sb, workspaceId) → userId
//   runSync(provider, { advertiserId, storeId, date }) → { rows, totals, meta }  (opsional; withCanonical)
//   loadOldSnapshot(sb, workspaceId, date) / compareParity(oldRows, newRows)
//   fetchCampaignSettings / persistCampaignSettings (opsional; withSettings)
//   now(): ms ; makeRunId(): string ; log(evt)
export async function runTenantShadow(conn, {
  provider, sb, date, authorizedAdvertiserIds = [], deps,
  withCanonical = false, withSettings = false,
  tenantTimeoutMs = 0, // 0 = tak dibatasi (test); entrypoint set nilai nyata
} = {}) {
  const runId = deps.makeRunId ? deps.makeRunId() : `mt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const startedAt = new Date().toISOString()
  const t0 = deps.now ? deps.now() : Date.now()
  const log = deps.log || (() => {})
  const R = {
    runId, mode: 'SHADOW', workspaceId: conn.workspaceId, connectionId: conn.connectionId ?? null,
    advertiserId: conn.advertiserId ?? null, storeId: conn.storeId ?? null,
    startedAt, finishedAt: null, durationMs: null,
    eligibilityStatus: null, status: null,
    callsAttempted: 0, pagesFetched: 0,
    campaignsFound: 0, campaignsProcessed: 0, creativeRows: 0, liveRows: 0, productRows: 0,
    registryRecords: 0, registryInserted: 0, registryUpdated: 0, registryChanges: 0,
    parity: null, warnings: [], errors: [], errorCode: null, confidence: 'HIGH',
  }
  const finish = (status) => {
    R.status = status; R.finishedAt = new Date().toISOString()
    R.durationMs = (deps.now ? deps.now() : Date.now()) - t0
    log({ event: 'MT_TENANT_DONE', run_id: runId, workspace_id: conn.workspaceId, advertiser_id: maskId(conn.advertiserId), store_id: maskId(conn.storeId), eligibility: R.eligibilityStatus, status, registry_records: R.registryRecords, registry_changes: R.registryChanges, parity: R.parity, duration_ms: R.durationMs, errors: R.errors })
    return R
  }

  try {
    // 1) Eligibility gate + registry detection (fetchRegistryInputs meng-gate:
    //    store_list dulu; tenant tak eligible → HANYA record tenant, NOL panggilan
    //    campaign/report/session/identity/product). Reuse Phase 1 (Part 3+7).
    let inputs
    try {
      inputs = await withTimeout(
        deps.fetchRegistryInputs(provider, { advertiserId: conn.advertiserId, storeId: conn.storeId, storeAuthorizedBcId: conn.storeAuthorizedBcId }, { authorizedAdvertiserIds }),
        tenantTimeoutMs, 'TENANT_TIMEOUT',
      )
    } catch (e) {
      R.errorCode = e.code || 'API_ERROR'; R.errors.push(`${R.errorCode}: ${e.message}`)
      return finish(e.code === 'PERMISSION_DENIED' ? TENANT_RESULT.PERMISSION_DENIED : TENANT_RESULT.API_ERROR)
    }
    R.eligibilityStatus = inputs.tenant?.status || ELIGIBILITY.UNKNOWN
    if (R.eligibilityStatus === ELIGIBILITY.DATA_UNAVAILABLE || R.eligibilityStatus === ELIGIBILITY.PERMISSION_DENIED) {
      R.errorCode = R.eligibilityStatus // store_list gagal (transport/permission)
      R.errors.push(`${R.eligibilityStatus}: gerbang store_list gagal — ${inputs.tenant?.reason || ''}`)
    }
    R.campaignsFound = inputs.campaignTypeCounts ? (inputs.campaignTypeCounts.product + inputs.campaignTypeCounts.live) : 0

    // 2) Persist registry (SELALU — termasuk 4 record AUTHORIZATION_MISMATCH untuk
    //    tenant tak eligible). Idempoten (Part 7). Tenant-scoped (workspace_id).
    try {
      const userId = deps.resolveOwner ? await deps.resolveOwner(sb, conn.workspaceId) : null
      const pr = await deps.persistRegistry(sb, { workspaceId: conn.workspaceId, userId, connectionId: conn.connectionId ?? null, records: inputs.records })
      R.registryRecords = inputs.records.length
      R.registryInserted = pr.inserted; R.registryUpdated = pr.updated; R.registryChanges = pr.changes
    } catch (e) {
      R.errorCode = 'PERSISTENCE_ERROR'; R.errors.push(`PERSISTENCE_ERROR(registry): ${e.message}`)
      return finish(TENANT_RESULT.PERSISTENCE_ERROR)
    }

    // 3) Tenant tak eligible → berhenti (tak ada canonical/settings). Status khusus.
    const skip = eligibilityToResult(R.eligibilityStatus)
    if (skip) return finish(skip)

    // 4) Canonical SHADOW snapshot (opsional) — engine deterministik, full pagination,
    //    fail-explicit. TIDAK menulis kanonik; parity vs OLD = SELECT read-only.
    if (withCanonical && deps.runSync) {
      try {
        const snap = await withTimeout(
          deps.runSync(provider, { advertiserId: conn.advertiserId, storeId: conn.storeId, date }),
          tenantTimeoutMs, 'TENANT_TIMEOUT',
        )
        R.pagesFetched = snap.meta?.pageCount ?? 0
        R.creativeRows = snap.meta?.attributedCount ?? 0
        R.productRows = snap.meta?.normalizedRowCount ?? 0
        R.campaignsProcessed = snap.meta?.campaignCount ?? 0
        R.canonicalTotals = snap.totals
        // Parity vs OLD (canonical terakhir) — read-only, tak overwrite.
        if (deps.loadOldSnapshot && deps.compareParity) {
          try {
            const old = await deps.loadOldSnapshot(sb, conn.workspaceId, date)
            R.parity = old ? deps.compareParity(old.rows, snap.rows).status : 'NO_OLD_BASELINE'
          } catch (e) { R.warnings.push(`PARITY_READ_FAILED: ${e.message}`) }
        }
      } catch (e) {
        const code = e.code || 'API_ERROR'
        R.errorCode = code; R.errors.push(`${code}: ${e.message}`)
        if (code === 'INCOMPLETE_PAGINATION' || code === 'MAX_PAGES_EXCEEDED' || code === 'TENANT_TIMEOUT' || code === 'MISSING_TOTALS') return finish(TENANT_RESULT.DATA_INCOMPLETE)
        if (code === 'DUPLICATE_ROWS' || code === 'RECONCILE_INVARIANT') return finish(TENANT_RESULT.NORMALIZATION_ERROR)
        // Canonical gagal tapi registry sukses → PARTIAL (bukan total failure).
        return finish(TENANT_RESULT.PARTIAL_SUCCESS)
      }
    }

    // 5) Setting campaign (opsional, non-kanonik) — non-fatal.
    if (withSettings && deps.fetchCampaignSettings && deps.persistCampaignSettings) {
      try {
        const csRows = await deps.fetchCampaignSettings(provider, { advertiserId: conn.advertiserId, storeId: conn.storeId })
        await deps.persistCampaignSettings(sb, { workspaceId: conn.workspaceId, date, rows: csRows })
      } catch (e) { R.warnings.push(`CAMPAIGN_SETTINGS_FAILED: ${e.message}`) }
    }

    return finish(R.warnings.length ? TENANT_RESULT.PARTIAL_SUCCESS : TENANT_RESULT.SUCCESS)
  } catch (e) {
    // Jaring pengaman terakhir — apa pun yang lolos di atas tak boleh menjatuhkan batch.
    R.errorCode = e.code || 'UNEXPECTED'; R.errors.push(`UNEXPECTED: ${e.message}`)
    return finish(TENANT_RESULT.API_ERROR)
  }
}

// ── Part 8: rekam ke gmvmax_sync_runs (mode=SHADOW). GRACEFUL: coba kolom kaya
//    (butuh migrasi 0023); bila belum di-apply → fallback kolom dasar (0021).
//    Tak pernah throw (audit gagal ≠ run gagal). Tak menyimpan token/PII.
export async function recordShadowRun(sb, r, date, { log = () => {} } = {}) {
  const base = {
    workspace_id: r.workspaceId, advertiser_id: r.advertiserId, snapshot_date: date,
    run_id: r.runId ?? null, mode: 'SHADOW', status: r.status,
    row_count: r.registryRecords ?? null,
    cost: r.canonicalTotals?.cost ?? null, revenue: r.canonicalTotals?.revenue ?? null,
    orders: r.canonicalTotals?.orders ?? null, parity: r.parity ?? null,
    error: r.errors?.length ? r.errors.join(' | ').slice(0, 500) : null,
    duration_ms: r.durationMs ?? null,
  }
  const rich = {
    ...base,
    eligibility_status: r.eligibilityStatus ?? null,
    campaigns_found: r.campaignsFound ?? null, campaigns_processed: r.campaignsProcessed ?? null,
    creative_rows: r.creativeRows ?? null, live_rows: r.liveRows ?? null, product_rows: r.productRows ?? null,
    registry_rows: r.registryRecords ?? null, pages_fetched: r.pagesFetched ?? null,
    warnings: r.warnings?.length ?? 0, error_code: r.errorCode ?? null,
    provider: 'MCP', worker_version: WORKER_VERSION,
    started_at: r.startedAt ?? null, completed_at: r.finishedAt ?? null,
    details: {
      registry_inserted: r.registryInserted, registry_updated: r.registryUpdated, registry_changes: r.registryChanges,
      warnings: r.warnings, connection_id: r.connectionId,
    },
  }
  try {
    const { error } = await sb.from('gmvmax_sync_runs').insert(rich)
    if (error) throw new Error(error.message)
    return { recorded: true, schema: 'rich' }
  } catch (e) {
    // Kolom 0023 belum ada (PGRST204/42703) → fallback kolom dasar 0021.
    try {
      const { error } = await sb.from('gmvmax_sync_runs').insert(base)
      if (error) throw new Error(error.message)
      log({ event: 'SYNC_RUN_RICH_UNAVAILABLE', level: 'warn', note: 'migrasi 0023 belum di-apply → audit kolom dasar', detail: e.message.slice(0, 120) })
      return { recorded: true, schema: 'base' }
    } catch (e2) {
      log({ event: 'SYNC_RUN_AUDIT_FAILED', level: 'warn', advertiser_id: maskId(r.advertiserId), message: e2.message }, 'error')
      return { recorded: false, error: e2.message }
    }
  }
}

// ── Part 4+5+6: orkestrasi SEMUA tenant, isolasi + konkurensi aman + jeda ─────
// deps sama dengan runTenantShadow + { recordShadowRun, sleep }.
export async function runAllTenantsShadow({
  sb, date, connectionRows, authorizedAdvertiserIds = [], providerFactory, deps,
  withCanonical = false, withSettings = false,
  interTenantDelayMs = 3000, tenantTimeoutMs = 0, now = Date.now(),
  record = true,
} = {}) {
  const log = deps.log || (() => {})
  const { candidates, rejected } = discoverConnections(connectionRows, { now })
  log({ event: 'MT_DISCOVER', candidates: candidates.length, rejected: rejected.map(r => ({ workspace_id: r.workspaceId, status: r.connectionStatus })) })

  const results = []
  // Konkurensi 1 (Part 6): ember rate-limit tt-ads-mcp-layer dibagi semua workspace.
  const sleep = deps.sleep || ((ms) => new Promise(r => setTimeout(r, ms)))
  for (let i = 0; i < candidates.length; i++) {
    if (i > 0 && interTenantDelayMs) await sleep(interTenantDelayMs)
    const conn = candidates[i]
    let provider
    try {
      provider = await providerFactory(conn) // per-tenant provider (token per-workspace)
    } catch (e) {
      const r = {
        runId: null, mode: 'SHADOW', workspaceId: conn.workspaceId, connectionId: conn.connectionId,
        advertiserId: conn.advertiserId, storeId: conn.storeId, status: TENANT_RESULT.TOKEN_FAILED,
        eligibilityStatus: null, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        durationMs: 0, registryRecords: 0, registryChanges: 0, parity: null, warnings: [],
        errors: [`TOKEN_FAILED: ${e.message}`], errorCode: 'TOKEN_FAILED',
      }
      if (record && deps.recordShadowRun) await deps.recordShadowRun(sb, r, date, { log })
      results.push(r); continue
    }
    // authorizedAdvertiserIds bersifat PER-TOKEN → resolve per-tenant bila hook ada
    // (auth_advertiser_get atas provider tenant ini). Fallback ke daftar bersama.
    let authIds = authorizedAdvertiserIds
    if (deps.fetchAuthorizedAdvertiserIds) {
      try { authIds = await deps.fetchAuthorizedAdvertiserIds(provider) } catch { authIds = authorizedAdvertiserIds }
    }
    const r = await runTenantShadow(conn, { provider, sb, date, authorizedAdvertiserIds: authIds, deps, withCanonical, withSettings, tenantTimeoutMs })
    if (record && deps.recordShadowRun) await deps.recordShadowRun(sb, r, date, { log })
    results.push(r)
  }

  // Rejected connections juga direkam (skip, tanpa panggilan MCP).
  for (const rej of rejected) {
    const r = {
      runId: null, mode: 'SHADOW', workspaceId: rej.workspaceId, connectionId: rej.connectionId,
      advertiserId: rej.advertiserId, storeId: rej.storeId, status: TENANT_RESULT.SKIPPED_INVALID_CONNECTION,
      eligibilityStatus: ELIGIBILITY.CONNECTION_MISSING, startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(), durationMs: 0, registryRecords: 0, registryChanges: 0,
      parity: null, warnings: [], errors: [`connection ${rej.connectionStatus}`], errorCode: rej.connectionStatus,
    }
    if (record && deps.recordShadowRun) await deps.recordShadowRun(sb, r, date, { log })
    results.push(r)
  }

  const summary = summarize(results)
  log({ event: 'MT_BATCH_SUMMARY', ...summary })
  return { results, summary, rejected }
}

export function summarize(results) {
  const by = {}
  for (const r of results) by[r.status] = (by[r.status] || 0) + 1
  return {
    total: results.length,
    success: by[TENANT_RESULT.SUCCESS] || 0,
    partial: by[TENANT_RESULT.PARTIAL_SUCCESS] || 0,
    skipped: (by[TENANT_RESULT.SKIPPED_NOT_ELIGIBLE] || 0) + (by[TENANT_RESULT.SKIPPED_INVALID_CONNECTION] || 0),
    authMismatch: by[TENANT_RESULT.AUTHORIZATION_MISMATCH] || 0,
    failed: (by[TENANT_RESULT.API_ERROR] || 0) + (by[TENANT_RESULT.PERSISTENCE_ERROR] || 0) + (by[TENANT_RESULT.NORMALIZATION_ERROR] || 0) + (by[TENANT_RESULT.TOKEN_FAILED] || 0),
    dataIncomplete: by[TENANT_RESULT.DATA_INCOMPLETE] || 0,
    byStatus: by,
  }
}

// Guard eksplisit: modul ini tak boleh mereferensikan tool mutasi (uji di test #16).
export const REFERENCES_MUTATION_TOOLS = false
export { FORBIDDEN_MUTATION_TOOLS }
