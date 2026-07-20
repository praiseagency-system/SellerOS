// Tes MULTI-TENANT SHADOW ORCHESTRATOR (Phase 2). node:test. Fixtures sintetis
// (ID redaksi: WS-A/WS-B, ADV1/ADV2, STORE1/STORE2 — bukan ID bisnis nyata).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  discoverConnections, classifyConnection, runTenantShadow, runAllTenantsShadow,
  recordShadowRun, summarize, CONNECTION_STATUS, TENANT_RESULT, ELIGIBILITY, WORKER_VERSION,
} from './multiTenant.mjs'
import { fetchRegistryInputs, fetchAuthorizedAdvertiserIds } from './featureRegistryFetch.mjs'
import { persistRegistry } from './featureRegistryWriter.mjs'
import { classifyMetric, buildParityRow, buildParityDataset, PARITY_CLASS } from './multiTenantParity.mjs'

// ── Fake Supabase in-memory (cukup untuk persistRegistry + sync_runs) ─────────
function makeFakeSb() {
  const db = { gmvmax_feature_registry: [], gmvmax_feature_registry_history: [], gmvmax_sync_runs: [] }
  let seq = 0
  const api = (table) => {
    const t = db[table]; const st = { _f: {}, _u: null }
    const b = {
      select() { return b }, eq(k, v) { st._f[k] = v; return b },
      single() { const r = t.find(x => Object.entries(st._f).every(([k, v]) => x[k] === v)); return Promise.resolve({ data: r || null, error: r ? null : { message: 'not found' } }) },
      insert(rows) { const arr = Array.isArray(rows) ? rows : [rows]; for (const r of arr) { r.id = r.id || `id-${++seq}`; t.push({ ...r }) } return Promise.resolve({ error: null }) },
      update(u) { st._u = u; return b },
      then(res) { const rows = t.filter(x => Object.entries(st._f).every(([k, v]) => x[k] === v)); if (st._u) { for (const r of rows) Object.assign(r, st._u); return res({ error: null }) } return res({ data: rows, error: null }) },
    }
    return b
  }
  return { _db: db, from: api }
}

// ── Provider sintetis (callTool) ─────────────────────────────────────────────
function eligibleProvider({ adv = 'ADV1', store = 'STORE1', trace = [] } = {}) {
  return {
    auth: () => ({ state: 'AUTH_VALID' }), assertAuth() {},
    async callTool(tool, params) {
      trace.push(tool)
      switch (tool) {
        case 'auth_advertiser_get': return { data: { list: [{ advertiser_id: adv }] } }
        case 'gmv_max_store_list_get': return { data: { store_list: [{ store_id: store, is_gmv_max_available: true, store_authorized_bc_id: 'BC1', exclusive_authorized_advertiser_info: { advertiser_id: adv } }] } }
        case 'gmv_max_campaign_get': { const type = params.filtering.gmv_max_promotion_types[0]; return { data: { list: type === 'PRODUCT_GMV_MAX' ? [{ campaign_id: 'C1', campaign_name: 'c1', operation_status: 'ENABLE', secondary_status: 'CAMPAIGN_STATUS_ENABLE', roi_protection_compensation_status: 'IN_EFFECT' }] : [], page_info: { total_page: 1 } } } }
        case 'gmv_max_bid_recommend_get': return { data: { roas_bid: 5, budget: 1000000 } }
        case 'campaign_gmv_max_info_get': return { data: { campaign_id: 'C1', shopping_ads_type: 'PRODUCT', roas_bid: 6, budget: 100000, deep_bid_type: 'VO_MIN_ROAS', roi_protection_enabled: true, accelerate_testing_for_new_videos: 'ON', promotion_days: { is_enabled: false }, affiliate_posts_enabled: true, product_specific_type: 'CUSTOMIZED_PRODUCTS', product_video_specific_type: 'AUTO_SELECTION', item_group_ids: ['S1'], auto_budget: { auto_budget_enabled: true, current_budget: 100000, maximum_budget: 200000, increase_limit: 2, remained_times: 2, budget_increase_percentage: 50 }, schedule_type: 'SCHEDULE_FROM_NOW', operation_status: 'ENABLE' } }
        case 'campaign_gmv_max_session_list_get': return { data: { session_list: [] } }
        case 'gmv_max_identity_get': return { data: { identity_list: [{ identity_id: 'ID1', identity_type: 'TTS_TT', product_gmv_max_available: true, live_gmv_max_available: false, unavailable_reason: 'OCCUPIED' }] } }
        case 'gmv_max_exclusive_authorization_get': return { data: { authorization_status: 'EFFECTIVE', cps_authorization_status: 'UNAUTHORIZED', advertiser_status: 'STATUS_ENABLE' } }
        case 'store_product_get': return { data: { store_products: [{ item_group_id: 'S1', gmv_max_ads_status: 'OCCUPIED', status: 'AVAILABLE' }], page_info: { total_number: 1 } } }
        default: return { data: {} }
      }
    },
  }
}
function mismatchProvider({ store = 'STORE2', trace = [] } = {}) {
  return {
    auth: () => ({ state: 'AUTH_VALID' }), assertAuth() {},
    async callTool(tool) { trace.push(tool); if (tool === 'gmv_max_store_list_get') return { data: { store_list: [{ store_id: store, is_gmv_max_available: false, store_authorized_bc_id: 'BC2', exclusive_authorized_advertiser_info: { advertiser_id: 'ADV_OTHER' } }] } }; return { data: {} } },
  }
}
function throwingProvider({ trace = [] } = {}) {
  return { auth: () => ({ state: 'AUTH_VALID' }), assertAuth() {}, async callTool(tool) { trace.push(tool); if (tool === 'gmv_max_store_list_get') { const e = new Error('MCP_ERROR: boom'); e.code = 'MCP_ERROR'; throw e } return { data: {} } } }
}

const baseDeps = (extra = {}) => ({
  fetchRegistryInputs, persistRegistry, resolveOwner: async (_sb, ws) => `U-${ws}`,
  recordShadowRun, makeRunId: () => `run-${Math.random().toString(36).slice(2)}`,
  now: () => Date.now(), log: () => {}, sleep: () => Promise.resolve(), ...extra,
})
const connRow = (o) => ({ workspace_id: o.ws, id: o.cid ?? `conn-${o.ws}`, advertiser_id: o.adv ?? 'ADV1', store_id: o.store ?? 'STORE1', access_token: o.token ?? 'tok', refresh_token: 'r', expires_at: new Date(Date.now() + 3600e3).toISOString(), ...o.extra })

// ══════════════════════════ TESTS ══════════════════════════

test('4. connection missing store_id → STORE_MISSING (skip, tanpa MCP)', () => {
  assert.equal(classifyConnection({ advertiser_id: 'A', access_token: 't' }).status, CONNECTION_STATUS.STORE_MISSING)
  assert.equal(classifyConnection({ store_id: 'S', access_token: 't' }).status, CONNECTION_STATUS.ADVERTISER_MISSING)
  assert.equal(classifyConnection({ advertiser_id: 'A', store_id: 'S' }).status, CONNECTION_STATUS.TOKEN_MISSING)
  assert.equal(classifyConnection({ advertiser_id: 'A', store_id: 'S', access_token: 't', expires_at: new Date(Date.now() - 1000).toISOString() }).status, CONNECTION_STATUS.TOKEN_EXPIRED)
  assert.equal(classifyConnection(connRow({ ws: 'WS-A' })).status, CONNECTION_STATUS.CANDIDATE)
  const { candidates, rejected } = discoverConnections([connRow({ ws: 'WS-A' }), { workspace_id: 'WS-X', advertiser_id: 'A' }])
  assert.equal(candidates.length, 1); assert.equal(rejected.length, 1); assert.equal(rejected[0].connectionStatus, CONNECTION_STATUS.STORE_MISSING)
})

test('1. dua tenant eligible → dua SUCCESS, registry terisi per-workspace', async () => {
  const sb = makeFakeSb()
  const { results } = await runAllTenantsShadow({
    sb, date: '2026-07-20', connectionRows: [connRow({ ws: 'WS-A', adv: 'ADV1', store: 'STORE1' }), connRow({ ws: 'WS-B', adv: 'ADV2', store: 'STORE2' })],
    providerFactory: async (c) => eligibleProvider({ adv: c.advertiserId, store: c.storeId }),
    deps: baseDeps({ fetchAuthorizedAdvertiserIds: async (p) => (await p.callTool('auth_advertiser_get')).data.list.map(x => x.advertiser_id) }),
    interTenantDelayMs: 0,
  })
  assert.equal(results.length, 2)
  assert.ok(results.every(r => r.status === TENANT_RESULT.SUCCESS), JSON.stringify(results.map(r => r.status)))
  const wsA = sb._db.gmvmax_feature_registry.filter(r => r.workspace_id === 'WS-A')
  const wsB = sb._db.gmvmax_feature_registry.filter(r => r.workspace_id === 'WS-B')
  assert.ok(wsA.length > 4 && wsB.length > 4)
})

test('2. satu eligible + satu authorization mismatch', async () => {
  const sb = makeFakeSb()
  const { results, summary } = await runAllTenantsShadow({
    sb, date: '2026-07-20', authorizedAdvertiserIds: ['ADV1'],
    connectionRows: [connRow({ ws: 'WS-A', adv: 'ADV1', store: 'STORE1' }), connRow({ ws: 'WS-B', adv: 'ADV2', store: 'STORE2' })],
    providerFactory: async (c) => (c.workspaceId === 'WS-A' ? eligibleProvider({ adv: 'ADV1' }) : mismatchProvider({ store: 'STORE2' })),
    deps: baseDeps(), interTenantDelayMs: 0,
  })
  const byWs = Object.fromEntries(results.map(r => [r.workspaceId, r.status]))
  assert.equal(byWs['WS-A'], TENANT_RESULT.SUCCESS)
  assert.equal(byWs['WS-B'], TENANT_RESULT.AUTHORIZATION_MISMATCH)
  assert.equal(summary.authMismatch, 1)
})

test('3. kegagalan API satu tenant tak menghentikan tenant lain', async () => {
  const sb = makeFakeSb()
  const { results, summary } = await runAllTenantsShadow({
    sb, date: '2026-07-20', authorizedAdvertiserIds: ['ADV1'],
    connectionRows: [connRow({ ws: 'WS-A', adv: 'ADV1' }), connRow({ ws: 'WS-B', adv: 'ADV1', store: 'STORE1' })],
    providerFactory: async (c) => (c.workspaceId === 'WS-A' ? throwingProvider() : eligibleProvider({ adv: 'ADV1' })),
    deps: baseDeps(), interTenantDelayMs: 0,
  })
  const byWs = Object.fromEntries(results.map(r => [r.workspaceId, r.status]))
  assert.equal(byWs['WS-A'], TENANT_RESULT.API_ERROR)
  assert.equal(byWs['WS-B'], TENANT_RESULT.SUCCESS)
  assert.equal(summary.success, 1); assert.equal(summary.failed, 1)
})

test('5. providerFactory gagal (token expired/denied) → TOKEN_FAILED, isolasi', async () => {
  const sb = makeFakeSb()
  const { results } = await runAllTenantsShadow({
    sb, date: '2026-07-20', authorizedAdvertiserIds: ['ADV1'],
    connectionRows: [connRow({ ws: 'WS-A' }), connRow({ ws: 'WS-B' })],
    providerFactory: async (c) => { if (c.workspaceId === 'WS-A') throw new Error('token refresh gagal'); return eligibleProvider({ adv: 'ADV1' }) },
    deps: baseDeps(), interTenantDelayMs: 0,
  })
  const byWs = Object.fromEntries(results.map(r => [r.workspaceId, r.status]))
  assert.equal(byWs['WS-A'], TENANT_RESULT.TOKEN_FAILED)
  assert.equal(byWs['WS-B'], TENANT_RESULT.SUCCESS)
})

test('6+13. gate eligibility hentikan panggilan hilir; registry tetap ditulis utk mismatch', async () => {
  const sb = makeFakeSb(); const trace = []
  const r = await runTenantShadow({ workspaceId: 'WS-B', advertiserId: 'ADV2', storeId: 'STORE2' }, {
    provider: mismatchProvider({ store: 'STORE2', trace }), sb, date: '2026-07-20', authorizedAdvertiserIds: ['ADV1'], deps: baseDeps(),
  })
  assert.equal(r.status, TENANT_RESULT.AUTHORIZATION_MISMATCH)
  assert.deepEqual(trace, ['gmv_max_store_list_get']) // NOL panggilan campaign/info/session/identity/product
  const rows = sb._db.gmvmax_feature_registry.filter(x => x.workspace_id === 'WS-B')
  assert.equal(rows.length, 4) // hanya 4 record tenant
  assert.ok(rows.every(x => x.availability_status === 'AUTHORIZATION_MISMATCH'))
})

test('7+8. konteks workspace benar & tak bercampur lintas tenant', async () => {
  const sb = makeFakeSb()
  await runAllTenantsShadow({
    sb, date: '2026-07-20',
    connectionRows: [connRow({ ws: 'WS-A', adv: 'ADV1', store: 'STORE1' }), connRow({ ws: 'WS-B', adv: 'ADV2', store: 'STORE2' })],
    providerFactory: async (c) => eligibleProvider({ adv: c.advertiserId, store: c.storeId }),
    deps: baseDeps({ fetchAuthorizedAdvertiserIds: async (p) => (await p.callTool('auth_advertiser_get')).data.list.map(x => x.advertiser_id) }),
    interTenantDelayMs: 0,
  })
  const all = sb._db.gmvmax_feature_registry
  assert.ok(all.every(r => (r.workspace_id === 'WS-A' && r.store_id === 'STORE1') || (r.workspace_id === 'WS-B' && r.store_id === 'STORE2')))
  // Tak ada baris WS-A ber-store STORE2 atau sebaliknya
  assert.equal(all.filter(r => r.workspace_id === 'WS-A' && r.store_id === 'STORE2').length, 0)
})

test('9. canonical sukses → pagesFetched/creativeRows tercatat', async () => {
  const sb = makeFakeSb()
  const fakeRunSync = async () => ({ rows: [{ videoId: 'v1' }], totals: { cost: 100, revenue: 700, orders: 3, roas: 7 }, meta: { pageCount: 12, attributedCount: 5, normalizedRowCount: 6, campaignCount: 1, completeness: 'COMPLETE_WITH_ROWS' } })
  const r = await runTenantShadow({ workspaceId: 'WS-A', advertiserId: 'ADV1', storeId: 'STORE1' }, {
    provider: eligibleProvider({ adv: 'ADV1' }), sb, date: '2026-07-20', authorizedAdvertiserIds: ['ADV1'],
    withCanonical: true, deps: baseDeps({ runSync: fakeRunSync, loadOldSnapshot: async () => null, compareParity: () => ({ status: 'MATCH' }) }),
  })
  assert.equal(r.status, TENANT_RESULT.SUCCESS)
  assert.equal(r.pagesFetched, 12); assert.equal(r.creativeRows, 5); assert.equal(r.parity, 'NO_OLD_BASELINE')
})

test('10. paginasi tak lengkap → DATA_INCOMPLETE (bukan SUCCESS)', async () => {
  const sb = makeFakeSb()
  const badRunSync = async () => { const e = new Error('INCOMPLETE_PAGINATION: 3/9'); e.code = 'INCOMPLETE_PAGINATION'; throw e }
  const r = await runTenantShadow({ workspaceId: 'WS-A', advertiserId: 'ADV1', storeId: 'STORE1' }, {
    provider: eligibleProvider({ adv: 'ADV1' }), sb, date: '2026-07-20', authorizedAdvertiserIds: ['ADV1'], withCanonical: true, deps: baseDeps({ runSync: badRunSync }),
  })
  assert.equal(r.status, TENANT_RESULT.DATA_INCOMPLETE)
})

test('11+12. error permanen normalisasi → NORMALIZATION_ERROR, tak jadi SUCCESS (no fake retry)', async () => {
  const sb = makeFakeSb()
  const dupRunSync = async () => { const e = new Error('RECONCILE_INVARIANT'); e.code = 'RECONCILE_INVARIANT'; throw e }
  const r = await runTenantShadow({ workspaceId: 'WS-A', advertiserId: 'ADV1', storeId: 'STORE1' }, {
    provider: eligibleProvider({ adv: 'ADV1' }), sb, date: '2026-07-20', authorizedAdvertiserIds: ['ADV1'], withCanonical: true, deps: baseDeps({ runSync: dupRunSync }),
  })
  assert.equal(r.status, TENANT_RESULT.NORMALIZATION_ERROR)
  // Retry transient = tanggung jawab TikTokMcpProvider (diuji di provider), bukan orchestrator.
})

test('14. idempotensi registry di lintas run', async () => {
  const sb = makeFakeSb()
  const run = () => runTenantShadow({ workspaceId: 'WS-A', advertiserId: 'ADV1', storeId: 'STORE1' }, { provider: eligibleProvider({ adv: 'ADV1' }), sb, date: '2026-07-20', authorizedAdvertiserIds: ['ADV1'], deps: baseDeps() })
  const r1 = await run(); const r2 = await run()
  assert.ok(r1.registryInserted > 0 && r1.registryChanges > 0)
  assert.equal(r2.registryInserted, 0); assert.equal(r2.registryChanges, 0) // tak ada duplikat / perubahan
  const codes = sb._db.gmvmax_feature_registry.filter(r => r.workspace_id === 'WS-A').map(r => `${r.feature_code}|${r.campaign_id || ''}|${r.identity_id || ''}`)
  assert.equal(codes.length, new Set(codes).size) // tak ada duplikat kunci
})

test('15. EXECUTE_RUNTIME_VERIFIED tetap 0 di baris tersimpan', async () => {
  const sb = makeFakeSb()
  await runTenantShadow({ workspaceId: 'WS-A', advertiserId: 'ADV1', storeId: 'STORE1' }, { provider: eligibleProvider({ adv: 'ADV1' }), sb, date: '2026-07-20', authorizedAdvertiserIds: ['ADV1'], deps: baseDeps() })
  assert.equal(sb._db.gmvmax_feature_registry.filter(r => r.capability_level === 'EXECUTE_RUNTIME_VERIFIED').length, 0)
})

test('16+17+20. tak ada referensi tool mutasi; tak impor worker; DEFAULT_ADVERTISER path utuh', () => {
  const mutation = ['campaign_gmv_max_create', 'campaign_gmv_max_update', 'campaign_gmv_max_session_create', 'campaign_gmv_max_session_update', 'campaign_gmv_max_session_delete', 'gmv_max_creative_update', 'gmv_max_exclusive_authorization_create', 'campaign_status_update']
  for (const f of ['multiTenant.mjs', 'multiTenantShadow.mjs', 'multiTenantParity.mjs']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
    // Tak boleh ada callTool('<mutation>') atau string tool mutasi (kecuali di daftar FORBIDDEN via import).
    for (const m of mutation) assert.ok(!new RegExp(`callTool\\(['"\`]${m}`).test(src), `${f} memanggil ${m}`)
    assert.ok(!/writeSnapshot|gmvmax_replace_snapshot|from\(['"`]gmvmax_creatives|from\(['"`]gmvmax_imports/.test(src), `${f} menyentuh tabel/RPC kanonik`)
    assert.ok(!/from\s+['"][^'"]*worker\.mjs['"]/.test(src), `${f} mengimpor worker.mjs`)
  }
  // DEFAULT_ADVERTISER path tetap ada (advertisers.mjs + worker.mjs tak diubah modul ini)
  const adv = readFileSync(new URL('./advertisers.mjs', import.meta.url), 'utf8')
  assert.ok(/eligibleAdvertisers/.test(adv))
})

test('18. entrypoint OFF-by-default (gate flag) & tak menyentuh upload manual', () => {
  const ep = readFileSync(new URL('./multiTenantShadow.mjs', import.meta.url), 'utf8')
  assert.ok(/GMVMAX_MULTI_TENANT_SHADOW !== '1'/.test(ep)) // gate
  assert.ok(/GMVMAX_COMMIT === '1'/.test(ep)) // refuse bila commit
  assert.ok(!/gmvmaxImports|parseGmvMax|saveImport/.test(ep)) // tak menyentuh jalur upload
})

test('19. sync run direkam per-tenant (mode SHADOW)', async () => {
  const sb = makeFakeSb()
  await runAllTenantsShadow({
    sb, date: '2026-07-20', authorizedAdvertiserIds: ['ADV1'],
    connectionRows: [connRow({ ws: 'WS-A', adv: 'ADV1' }), connRow({ ws: 'WS-B', adv: 'ADV2', store: 'STORE2' })],
    providerFactory: async (c) => (c.workspaceId === 'WS-A' ? eligibleProvider({ adv: 'ADV1' }) : mismatchProvider({ store: 'STORE2' })),
    deps: baseDeps(), interTenantDelayMs: 0,
  })
  const runs = sb._db.gmvmax_sync_runs
  assert.equal(runs.length, 2)
  assert.ok(runs.every(r => r.mode === 'SHADOW'))
  assert.ok(runs.every(r => r.worker_version === WORKER_VERSION))
  assert.ok(runs.some(r => r.workspace_id === 'WS-A') && runs.some(r => r.workspace_id === 'WS-B'))
})

test('19b. recordShadowRun graceful fallback bila kolom 0023 belum ada', async () => {
  let calls = 0
  const sb = { from: () => ({ insert: (row) => { calls++; if (calls === 1 && 'eligibility_status' in row) return Promise.resolve({ error: { message: "column \"eligibility_status\" does not exist" } }); return Promise.resolve({ error: null }) } }) }
  const res = await recordShadowRun(sb, { workspaceId: 'WS-A', advertiserId: 'ADV1', status: 'SUCCESS', registryRecords: 10, startedAt: 't', finishedAt: 't2' }, '2026-07-20')
  assert.equal(res.recorded, true); assert.equal(res.schema, 'base')
})

test('summarize menghitung status dengan benar', () => {
  const s = summarize([{ status: TENANT_RESULT.SUCCESS }, { status: TENANT_RESULT.AUTHORIZATION_MISMATCH }, { status: TENANT_RESULT.API_ERROR }, { status: TENANT_RESULT.SKIPPED_INVALID_CONNECTION }])
  assert.equal(s.total, 4); assert.equal(s.success, 1); assert.equal(s.authMismatch, 1); assert.equal(s.failed, 1); assert.equal(s.skipped, 1)
})

// ── Parity tooling (Part 10) ─────────────────────────────────────────────────
test('parity: cost immutable → HARD_MISMATCH; revenue naik → LATE_ATTRIBUTION_DRIFT', () => {
  assert.equal(classifyMetric('cost', 1000, 1200), PARITY_CLASS.HARD_MISMATCH)
  assert.equal(classifyMetric('cost', 1000, 1000), PARITY_CLASS.MATCH)
  assert.equal(classifyMetric('gross_revenue', 1000, 1500), PARITY_CLASS.LATE_ATTRIBUTION_DRIFT)
  assert.equal(classifyMetric('orders', 10, 8), PARITY_CLASS.HARD_MISMATCH) // turun signifikan
  assert.equal(classifyMetric('budget', 100000, 100000), PARITY_CLASS.MATCH)
  assert.equal(classifyMetric('budget', 100000, 150000), PARITY_CLASS.MAPPING_MISMATCH)
  assert.equal(classifyMetric('accelerate_testing', true, false), PARITY_CLASS.MAPPING_MISMATCH)
  assert.equal(classifyMetric('cost', 1000, null), PARITY_CLASS.MISSING_IN_API)
  assert.equal(classifyMetric('cost', null, 1000), PARITY_CLASS.MISSING_IN_IMPORT)
  assert.equal(classifyMetric('cost', 1000, 1200, { incomplete: true }), PARITY_CLASS.PAGINATION_INCOMPLETE)
})

test('parity: dataset + matchRate', () => {
  const ds = buildParityDataset({
    workspaceId: 'WS-A', date: '2026-07-20',
    canonicalByCampaign: { C1: { cost: 1000, gross_revenue: 7000, orders: 10, budget: 100000 } },
    shadowByCampaign: { C1: { cost: 1000, gross_revenue: 7200, orders: 11, budget: 100000 } },
  })
  assert.equal(ds.rows.length, 1)
  assert.equal(ds.rows[0].worst, PARITY_CLASS.LATE_ATTRIBUTION_DRIFT)
  assert.equal(ds.hardMismatchCount, 0)
  assert.equal(ds.matchRate, 1)
})
