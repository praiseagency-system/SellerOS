import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  evaluateTenantEligibility, normalizeCampaignRecords, normalizeIdentityRecords,
  buildRegistry, mergeRegistry, assertWorkspaceScope, keyOf, FORBIDDEN_MUTATION_TOOLS,
} from './featureRegistry.mjs'

// ─── fixtures sintetis (TANPA ID/nama nyata) ──────────────────────────────────
const CTX = { advertiserId: 'ADV-1', storeId: 'STORE-1' }
const STORE_OK = {
  store_id: 'STORE-1', is_gmv_max_available: true, store_authorized_bc_id: 'BC-1',
  targeting_region_codes: ['ID'], exclusive_authorized_advertiser_info: { advertiser_id: 'ADV-1' },
}
const CONN = { advertiserId: 'ADV-1', storeId: 'STORE-1' }
const AUTHZ = ['ADV-1']
const INFO = {
  campaign_id: 'CMP-1', roas_bid: 8, budget: 100000, deep_bid_type: 'VO_MIN_ROAS',
  auto_budget: { auto_budget_enabled: true, current_budget: 100000, maximum_budget: 200000, increase_limit: 2, budget_increase_percentage: 50, remained_times: 2, next_increase: 50000 },
  roi_protection_enabled: true, accelerate_testing_for_new_videos: 'ON',
  promotion_days: { is_enabled: false, custom_schedule_list: [] }, affiliate_posts_enabled: true,
  product_specific_type: 'CUSTOMIZED_PRODUCTS', product_video_specific_type: 'AUTO_SELECTION',
  item_group_ids: ['a', 'b'], schedule_type: 'SCHEDULE_FROM_NOW',
  schedule_start_time: '2026-01-27 07:02:22', schedule_end_time: '2036-01-25 07:02:22',
}
const LISTROW = { campaign_id: 'CMP-1', roi_protection_compensation_status: 'IN_EFFECT', operation_status: 'ENABLE' }
const find = (recs, code) => recs.find(r => r.feature_code === code)
const campRecs = (info = INFO, extra = {}) => normalizeCampaignRecords({ listRow: LISTROW, info, sessions: [], ...extra }, CTX)

// ─── 1. Eligible tenant ───────────────────────────────────────────────────────
test('1. tenant eligible', () => {
  const e = evaluateTenantEligibility({ connection: CONN, storeList: [STORE_OK], authorizedAdvertiserIds: AUTHZ })
  assert.equal(e.status, 'ELIGIBLE')
  const { records } = buildRegistry({ connection: CONN, storeList: [STORE_OK], authorizedAdvertiserIds: AUTHZ, campaignTypeCounts: { product: 3, live: 2 }, campaigns: [], identities: [] })
  assert.equal(find(records, 'GMV_MAX_ELIGIBILITY').availability_status, 'AVAILABLE')
})

// ─── 2. GMV Max unavailable tenant ────────────────────────────────────────────
test('2. tenant NOT_AVAILABLE (exclusive cocok, is_gmv_max_available=false)', () => {
  const store = { ...STORE_OK, is_gmv_max_available: false }
  const e = evaluateTenantEligibility({ connection: CONN, storeList: [store], authorizedAdvertiserIds: AUTHZ })
  assert.equal(e.status, 'NOT_AVAILABLE')
})

// ─── 3. Authorization mismatch ────────────────────────────────────────────────
test('3. AUTHORIZATION_MISMATCH (exclusive advertiser lain, di luar token)', () => {
  const store = { ...STORE_OK, is_gmv_max_available: false, exclusive_authorized_advertiser_info: { advertiser_id: 'ADV-X' } }
  const e = evaluateTenantEligibility({ connection: CONN, storeList: [store], authorizedAdvertiserIds: AUTHZ })
  assert.equal(e.status, 'AUTHORIZATION_MISMATCH')
  assert.equal(e.exclusiveAdvertiserId, 'ADV-X')
  const { records } = buildRegistry({ connection: CONN, storeList: [store], authorizedAdvertiserIds: AUTHZ })
  assert.equal(find(records, 'EXCLUSIVE_GMV_MAX_AUTHORIZATION').availability_status, 'AUTHORIZATION_MISMATCH')
  // Gate: tenant tak-eligible → tak ada record campaign.
  assert.equal(find(records, 'TARGET_ROI'), undefined)
})

// ─── 4. Accelerate Testing ON/OFF ─────────────────────────────────────────────
test('4. Accelerate Testing ON→ENABLED, OFF→INACTIVE', () => {
  assert.equal(find(campRecs(), 'ACCELERATE_NEW_VIDEO_TESTING').availability_status, 'ENABLED')
  const off = find(campRecs({ ...INFO, accelerate_testing_for_new_videos: 'OFF' }), 'ACCELERATE_NEW_VIDEO_TESTING')
  assert.equal(off.availability_status, 'INACTIVE'); assert.equal(off.enabled, false)
})

// ─── 5. ROI Protection enabled ────────────────────────────────────────────────
test('5. ROI_PROTECTION enabled', () => {
  const r = find(campRecs(), 'ROI_PROTECTION')
  assert.equal(r.availability_status, 'ENABLED'); assert.equal(r.capability_level, 'MONITOR')
  assert.equal(r.metadata.execute, 'SELLER_CENTER_ONLY')
})

// ─── 6. ROI compensation IN_EFFECT ────────────────────────────────────────────
test('6. ROI_PROTECTION_COMPENSATION IN_EFFECT→ACTIVE', () => {
  const r = find(campRecs(), 'ROI_PROTECTION_COMPENSATION')
  assert.equal(r.availability_status, 'ACTIVE'); assert.equal(r.metadata.status, 'IN_EFFECT')
})

// ─── 7. Promotion Days disabled + sub-fields hilang ───────────────────────────
test('7. PROMOTION_DAYS disabled, sub-field absen → NOT_RETURNED (bukan false)', () => {
  const r = find(campRecs({ ...INFO, promotion_days: { is_enabled: false } }), 'PROMOTION_DAYS')
  assert.equal(r.availability_status, 'INACTIVE'); assert.equal(r.enabled, false)
  assert.equal(r.metadata.sub_fields.budget_increase_percentage, 'NOT_RETURNED')
})

// ─── 8. Auto Budget enabled ───────────────────────────────────────────────────
test('8. AUTO_BUDGET_INCREASE enabled + metadata lengkap', () => {
  const r = find(campRecs(), 'AUTO_BUDGET_INCREASE')
  assert.equal(r.availability_status, 'ENABLED'); assert.equal(r.enabled, true)
  assert.equal(r.metadata.maximum_budget, 200000); assert.equal(r.metadata.remained_times, 2)
})

// ─── 9. Selected Products ─────────────────────────────────────────────────────
test('9. SELECTED_PRODUCTS ACTIVE + FULL_SHOP INACTIVE', () => {
  const recs = campRecs()
  assert.equal(find(recs, 'SELECTED_PRODUCTS').availability_status, 'ACTIVE')
  assert.equal(find(recs, 'FULL_SHOP').availability_status, 'INACTIVE')
})

// ─── 10. Full Shop ────────────────────────────────────────────────────────────
test('10. FULL_SHOP ACTIVE + SELECTED_PRODUCTS INACTIVE', () => {
  const recs = campRecs({ ...INFO, product_specific_type: 'ALL' })
  assert.equal(find(recs, 'FULL_SHOP').availability_status, 'ACTIVE')
  assert.equal(find(recs, 'SELECTED_PRODUCTS').availability_status, 'INACTIVE')
})

// ─── 11. Auto-select creative ─────────────────────────────────────────────────
test('11. AUTO_SELECT_CREATIVE ACTIVE', () => {
  assert.equal(find(campRecs(), 'AUTO_SELECT_CREATIVE').availability_status, 'ACTIVE')
})

// ─── 12. Empty session list ───────────────────────────────────────────────────
test('12. session_list [] → MAX_DELIVERY/CREATIVE_BOOST INACTIVE (bukan NOT_AVAILABLE)', () => {
  const recs = campRecs(INFO, { sessions: [] })
  const md = find(recs, 'MAX_DELIVERY'), cb = find(recs, 'CREATIVE_BOOST')
  assert.equal(md.availability_status, 'INACTIVE'); assert.equal(cb.availability_status, 'INACTIVE')
  assert.equal(md.metadata.endpoint_capability, 'RUNTIME_VERIFIED_READ')
})

// ─── 13. Active Max Delivery session ──────────────────────────────────────────
test('13. sesi NO_BID aktif → MAX_DELIVERY ACTIVE', () => {
  const sessions = [{ bid_type: 'NO_BID', session_id: 'S1', budget: 50000 }]
  assert.equal(find(campRecs(INFO, { sessions }), 'MAX_DELIVERY').availability_status, 'ACTIVE')
})

// ─── 14. Active Creative Boost session ────────────────────────────────────────
test('14. sesi CREATIVE_NO_BID aktif → CREATIVE_BOOST ACTIVE', () => {
  const sessions = [{ bid_type: 'CREATIVE_NO_BID', session_id: 'S2', budget: 30000 }]
  const recs = campRecs(INFO, { sessions })
  assert.equal(find(recs, 'CREATIVE_BOOST').availability_status, 'ACTIVE')
  assert.equal(find(recs, 'MAX_DELIVERY').availability_status, 'INACTIVE')
})

// ─── 15. Identity LIVE unavailable OCCUPIED ───────────────────────────────────
test('15. identity live=false OCCUPIED → INACTIVE + reason; store LIVE tak jadi unavailable', () => {
  const identities = [{ identity_id: 'ID-1', identity_type: 'TTS_TT', product_gmv_max_available: true, live_gmv_max_available: false, unavailable_reason: 'OCCUPIED' }]
  const recs = normalizeIdentityRecords(identities, CTX)
  assert.equal(find(recs, 'IDENTITY_LIVE_GMV_MAX_AVAILABLE').availability_status, 'INACTIVE')
  assert.equal(find(recs, 'IDENTITY_LIVE_UNAVAILABLE_REASON').metadata.unavailable_reason, 'OCCUPIED')
  // Store-level LIVE tetap AVAILABLE bila ada campaign LIVE.
  const { records } = buildRegistry({ connection: CONN, storeList: [STORE_OK], authorizedAdvertiserIds: AUTHZ, campaignTypeCounts: { product: 1, live: 2 }, identities })
  assert.equal(find(records, 'LIVE_GMV_MAX_AVAILABLE').availability_status, 'AVAILABLE')
})

// ─── 16. Field omitted → NOT_RETURNED ─────────────────────────────────────────
test('16. field absen (promotion_days) → NOT_RETURNED, bukan false', () => {
  const info = { ...INFO }; delete info.promotion_days
  assert.equal(find(campRecs(info), 'PROMOTION_DAYS').availability_status, 'NOT_RETURNED')
})

// ─── 17. Idempotent upsert ────────────────────────────────────────────────────
test('17. mergeRegistry idempoten: run kedua tanpa data sama → 0 history, id dipertahankan', () => {
  const inc = campRecs().map(r => ({ ...r, workspace_id: 'WS-1' }))
  const first = mergeRegistry([], inc, 't1')
  assert.equal(first.history.length, inc.length) // semua DETECTED
  // Simulasi state DB dari run pertama (beri id).
  const dbRows = first.writes.map((w, i) => ({ ...w, id: `row-${i}` }))
  const second = mergeRegistry(dbRows, inc, 't2')
  assert.equal(second.history.length, 0) // tak ada perubahan
  assert.ok(second.writes.every(w => w.id)) // id dipertahankan
  assert.ok(second.writes.every(w => w.last_changed_at === 't1' || w.last_changed_at == null)) // last_changed tak berubah
})

// ─── 18. Change detected only when material state changes ──────────────────────
test('18. history hanya saat state material berubah', () => {
  const base = campRecs().map(r => ({ ...r, workspace_id: 'WS-1' }))
  const dbRows = mergeRegistry([], base, 't1').writes.map((w, i) => ({ ...w, id: `row-${i}` }))
  // Ubah Target ROI 8 → 6 (signature berubah).
  const changed = campRecs({ ...INFO, roas_bid: 6 }).map(r => ({ ...r, workspace_id: 'WS-1' }))
  const res = mergeRegistry(dbRows, changed, 't2')
  const changedCodes = res.history.map(h => h.feature_code)
  assert.deepEqual(changedCodes, ['TARGET_ROI'])
  assert.equal(res.history[0].change_type, 'CHANGED')
  assert.equal(res.history[0].prev_signature !== res.history[0].new_signature, true)
})

// ─── 19. Cross-workspace write ditolak ────────────────────────────────────────
test('19. assertWorkspaceScope menolak record lintas-workspace', () => {
  const recs = [{ feature_code: 'X', workspace_id: 'WS-OTHER' }]
  assert.throws(() => assertWorkspaceScope(recs, 'WS-1'), /cross-workspace/)
  assert.ok(assertWorkspaceScope([{ feature_code: 'X', workspace_id: 'WS-1' }], 'WS-1'))
})

// ─── 20. Tak ada endpoint mutasi dirujuk kode Phase 1 ─────────────────────────
test('20. featureRegistryFetch.mjs tak memanggil endpoint mutasi manapun', () => {
  const src = readFileSync(new URL('./featureRegistryFetch.mjs', import.meta.url), 'utf8')
  for (const tool of FORBIDDEN_MUTATION_TOOLS) {
    assert.equal(src.includes(tool), false, `fetch module TIDAK boleh merujuk ${tool}`)
    assert.equal(src.includes(`callTool('${tool}'`), false)
  }
  // keyOf sanity (dipakai merge).
  assert.equal(keyOf({ workspace_id: 'w', store_id: 's', feature_code: 'F', campaign_id: 'c' }), 'w|s|F|c|')
})
