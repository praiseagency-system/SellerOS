// GMV Max — MULTI-TENANT SHADOW ENTRYPOINT (Phase 2 preparation).
//
// ⚠️ OFF BY DEFAULT. Jalur ini AKTIF hanya bila env `GMVMAX_MULTI_TENANT_SHADOW=1`.
// Bila tidak → keluar tanpa efek (perilaku worker lama TIDAK berubah).
//
// SHADOW-ONLY & READ-ONLY terhadap TikTok:
//   - Hanya endpoint MCP read-only (via TikTokMcpProvider.callTool + engine).
//   - TIDAK menulis snapshot kanonik. Menulis hanya gmvmax_feature_registry(+_history)
//     + gmvmax_sync_runs (+ opsional gmvmax_campaign_settings).
//   - TIDAK memakai/menyentuh GMVMAX_COMMIT. Flag ini TERPISAH & berbeda makna.
//   - TIDAK mengubah DEFAULT_ADVERTISER / advertisers.mjs / upload manual.
//
// Data-driven: tenant ditemukan dari `tiktok_connections` (bukan hardcode).
// Token per-workspace di-load + self-refresh (supabaseTokenStore). Token TIDAK
// pernah masuk log (registerSecret + redact).
import { createClient } from '@supabase/supabase-js'
import { safeLog, registerSecret } from './runtime/redact.mjs'
import { resolveSnapshotDate, tzEvidence } from './runtime/jakartaDate.mjs'
import { TikTokMcpProvider } from './providers/tiktokMcp.mjs'
import { loadMcpTokenFromSupabase } from './providers/supabaseTokenStore.mjs'
import { fetchRegistryInputs, fetchAuthorizedAdvertiserIds } from './featureRegistryFetch.mjs'
import { persistRegistry, resolveWorkspaceOwner } from './featureRegistryWriter.mjs'
import { makeRunId } from './reporter.mjs'
import { runAllTenantGroupsShadow, recordShadowRun, WORKER_VERSION, buildMeta } from './multiTenant.mjs'
import { loadTenantGroups } from './connections.mjs'
import { acquireLock, releaseLock } from './lock.mjs'
// CATATAN: engine.mjs / parity.mjs / campaignSettings.mjs di-LAZY-import di main()
// (hanya saat --with-canonical / --with-settings). Alasan: (1) jalur no-op (flag
// off) & jalur registry-only TIDAK memuat engine → aman & ringan; (2) engine
// transitif mengimpor apiGmvMax.js yang memakai import extensionless (resolve di
// Vite/bundle VPS, TIDAK di raw Node ESM). Jalur registry murni bebas dari itu.

// Exit khusus: proses multi-tenant shadow lain masih aktif (lock) → skip, bukan gagal.
const EXIT_ALREADY_RUNNING = 3
// Kunci lock TERPISAH dari commit-worker (yang pakai workspaceId) → tak bertabrakan.
const MT_SHADOW_LOCK_KEY = 'mt-shadow'
const firstEnv = (keys) => { for (const k of keys) if (process.env[k]) return process.env[k]; return null }
function parseArgs(a) { const r = {}; for (let i = 0; i < a.length; i++) { const t = a[i]; if (t.startsWith('--')) { const k = t.slice(2), n = a[i + 1]; if (!n || n.startsWith('--')) r[k] = true; else { r[k] = n; i++ } } } return r }

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // GATE UTAMA — flag khusus multi-tenant shadow (BUKAN GMVMAX_COMMIT).
  if (process.env.GMVMAX_MULTI_TENANT_SHADOW !== '1') {
    safeLog({ event: 'MT_SHADOW_DISABLED', message: 'GMVMAX_MULTI_TENANT_SHADOW != "1" → jalur multi-tenant shadow nonaktif (no-op). Set =1 untuk mengaktifkan.' })
    process.exit(0)
  }
  // Sabuk pengaman tambahan: jangan pernah jalan bila commit-mode di-set bersamaan.
  if (process.env.GMVMAX_COMMIT === '1') {
    safeLog({ event: 'MT_SHADOW_REFUSE', level: 'critical', message: 'GMVMAX_COMMIT=1 terdeteksi. Multi-tenant SHADOW menolak berjalan bersama commit-mode.' }, console.error)
    process.exit(1)
  }

  const sbUrl = firstEnv(['GMVMAX_SUPABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const sbKey = firstEnv(['GMVMAX_SUPABASE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'])
  if (!sbUrl || !sbKey) { safeLog({ event: 'CONTRACT_FAILED', code: 'MISSING_SUPABASE', message: 'URL+key Supabase wajib.' }, console.error); process.exit(1) }
  registerSecret(sbKey)

  // Validasi cap paginasi lebih awal (fail-fast) bila di-set — hindari INVALID_MAX_PAGES per-tenant.
  try { const { resolveMaxPages } = await import('./engine.mjs'); const cap = resolveMaxPages(); safeLog({ event: 'MT_MAX_PAGES', cap }) }
  catch (e) { safeLog({ event: 'MT_CONFIG_INVALID', code: e.code || null, message: e.message }, console.error); process.exit(1) }

  const now = Date.now()
  const date = resolveSnapshotDate(args.date, now)
  const withCanonical = args['with-canonical'] === true // parity snapshot (opsional, lebih berat)
  const withSettings = args['with-settings'] === true
  const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } })

  safeLog({ event: 'MT_SHADOW_START', worker_version: WORKER_VERSION, snapshot_date: date, with_canonical: withCanonical, with_settings: withSettings })
  safeLog({ event: 'TZ_RESOLVED', ...tzEvidence(now, args.date || 'yesterday') })

  // LOCK single-proses — cegah dua run mt-shadow tumpang-tindih. Diambil SEBELUM
  // kerja DB/MCP apa pun. Kunci 'mt-shadow' (bukan workspaceId) → tak bentrok
  // dgn commit-worker. Dir lock via GMVMAX_SHADOW_DIR (lock.mjs). PID+waktu + stale
  // (30mnt / pid mati) sudah ditangani lock.mjs.
  const lock = acquireLock(MT_SHADOW_LOCK_KEY, date)
  if (!lock.ok) {
    safeLog({ event: 'MT_SHADOW_ALREADY_RUNNING', level: 'warn', holder: lock.holder, message: 'Proses multi-tenant shadow lain masih aktif (lock). Lewati run ini.' }, console.error)
    process.exit(EXIT_ALREADY_RUNNING)
  }
  // Bersihkan lock pada sinyal (SIGTERM systemd / SIGINT) → hindari lock yatim.
  const onSignal = (sig) => { safeLog({ event: 'MT_SHADOW_SIGNAL', signal: sig }, console.error); releaseLock(lock.path); process.exit(130) }
  process.once('SIGINT', () => onSignal('SIGINT'))
  process.once('SIGTERM', () => onSignal('SIGTERM'))

  let exitCode = 1
  try {
    // Discovery data-driven: GRUP tenant (1 workspace/store, 1..N advertiser) dari
    // tiktok_connections + gmvmax_tenant_advertisers (Phase 2B). Butuh token utk provider.
    let groups = null
    try { groups = await loadTenantGroups(sb) }
    catch (e) { safeLog({ event: 'CONNECTIONS_READ_FAILED', message: e.message }, console.error) }
    if (groups) {
      // providerFactory: bangun provider per-tenant dari token workspace (self-refresh).
      // Token di-register sebagai secret → tak pernah muncul di log.
      const providerFactory = async (conn) => {
        const t = await loadMcpTokenFromSupabase({ supabase: sb, workspaceId: conn.workspaceId })
        registerSecret(t.accessToken)
        return new TikTokMcpProvider({ token: t.accessToken, serverUrl: t.serverUrl, expiresAt: t.expiresAt })
      }

      // Lazy-load bagian berat HANYA saat diperlukan (lihat catatan di atas).
      let runSync, loadOldSnapshot, compareParity, fetchCampaignSettings, persistCampaignSettings
      if (withCanonical) {
        ({ runSync } = await import('./engine.mjs'))
        ;({ loadOldSnapshot, compareParity } = await import('./parity.mjs'))
      }
      if (withSettings) ({ fetchCampaignSettings, persistCampaignSettings } = await import('./campaignSettings.mjs'))

      const deps = {
        fetchRegistryInputs, fetchAuthorizedAdvertiserIds,
        persistRegistry, resolveOwner: resolveWorkspaceOwner,
        runSync, loadOldSnapshot, compareParity,
        fetchCampaignSettings, persistCampaignSettings,
        recordShadowRun, makeRunId,
        now: () => Date.now(),
        log: (evt, lvl) => safeLog(evt, lvl === 'error' ? console.error : console.log),
        sleep: (ms) => new Promise(r => setTimeout(r, ms)),
      }

      const { summary } = await runAllTenantGroupsShadow({
        sb, date, groups, providerFactory, deps,
        withCanonical, withSettings,
        interTenantDelayMs: Number(process.env.GMVMAX_INTER_TENANT_DELAY_MS || 3000),
        tenantTimeoutMs: Number(process.env.GMVMAX_TENANT_TIMEOUT_MS || 180000), // 3 mnt/tenant
        record: true, trace: buildMeta(),
      })

      // Exit: 0 hanya bila tak ada kegagalan keras (failed/dataIncomplete). Partial/skip OK.
      const hardFail = summary.failed + summary.dataIncomplete
      exitCode = hardFail === 0 ? 0 : 2
    }
  } catch (e) {
    safeLog({ event: 'MT_UNCAUGHT', message: e.message, code: e.code || null }, console.error)
    exitCode = 1
  } finally {
    releaseLock(lock.path) // dilepas pada sukses MAUPUN gagal
  }
  process.exit(exitCode)
}

main().catch(e => { safeLog({ event: 'MT_UNCAUGHT', message: e.message, code: e.code || null }, console.error); process.exit(1) })
