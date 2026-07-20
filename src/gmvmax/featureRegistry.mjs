// GMV Max Feature Registry — NORMALIZER MURNI (Phase 1, read-only).
// Memetakan respons MCP READ-ONLY (yang sudah diambil di tempat lain) → baris
// registry. TIDAK memanggil MCP. TIDAK menyentuh endpoint tulis. Deterministik,
// bisa dites dengan fixture sintetis tanpa token.
//
// Prinsip:
//   - "ada di schema" ≠ "tersedia di runtime". Fitur tanpa bukti runtime = SCHEMA_ONLY.
//   - Field yang TIDAK dikembalikan API = NOT_RETURNED (JANGAN diam-diam jadi false).
//   - Tenant tak-eligible → JANGAN deteksi fitur campaign/identity (gate).
//   - Phase 1: capability_level EXECUTE_RUNTIME_VERIFIED DILARANG.

// Endpoint tulis TikTok — DILARANG dirujuk kode Phase 1 (dipakai test guard).
export const FORBIDDEN_MUTATION_TOOLS = [
  'campaign_gmv_max_create', 'campaign_gmv_max_update', 'campaign_status_update',
  'campaign_gmv_max_session_create', 'campaign_gmv_max_session_update', 'campaign_gmv_max_session_delete',
  'gmv_max_creative_update', 'gmv_max_exclusive_authorization_create',
  'smart_plus_campaign_create', 'smart_plus_campaign_update', 'smart_plus_campaign_status_update',
]

// ─── util pemetaan aman ───────────────────────────────────────────────────────
// Bedakan: key ABSEN (undefined) → NOT_RETURNED; null → DATA_UNAVAILABLE; ada → nilai.
function field(obj, key) {
  if (obj == null || !Object.prototype.hasOwnProperty.call(obj, key)) return { present: false, value: undefined }
  return { present: true, value: obj[key] }
}
function isNum(v) { return v != null && v !== '' && Number.isFinite(Number(v)) }
function num(v) { return isNum(v) ? Number(v) : null }

// Serialisasi stabil (urut key) untuk signature deterministik.
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']'
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
  return JSON.stringify(v ?? null)
}

// Builder satu baris registry (+ signature material otomatis).
function rec(ctx, {
  feature_scope, feature_code, availability_status, capability_level,
  enabled = null, active = null, source, confidence,
  campaign_id = null, identity_id = null, signal = null, metadata = {},
}) {
  const row = {
    advertiser_id: ctx.advertiserId ?? null,
    store_id: ctx.storeId ?? null,
    campaign_id, identity_id,
    feature_scope, feature_code, availability_status, capability_level,
    enabled, active, source, confidence, metadata,
  }
  row.signature = stable([availability_status, enabled, active, signal])
  return row
}

const NOT_RETURNED = (ctx, base) => rec(ctx, {
  ...base, availability_status: 'NOT_RETURNED', enabled: null, active: null,
  source: base.source ?? 'MCP', confidence: 'DATA_UNAVAILABLE',
})

// ─── 1) TENANT ELIGIBILITY GATE (pure) ────────────────────────────────────────
// Kembalikan salah satu status: ELIGIBLE | NOT_AVAILABLE | AUTHORIZATION_MISMATCH |
// PERMISSION_DENIED | STORE_NOT_FOUND | CONNECTION_MISSING | UNKNOWN | DATA_UNAVAILABLE.
export function evaluateTenantEligibility({ connection, storeList, storeListError, authorizedAdvertiserIds = [] } = {}) {
  if (!connection || !connection.advertiserId || !connection.storeId) {
    return { status: 'CONNECTION_MISSING', reason: 'Koneksi TikTok/store belum lengkap untuk workspace ini.' }
  }
  if (storeListError) {
    const s = String(storeListError).toUpperCase()
    if (s.includes('PERMISSION') || s.includes('AUTH')) return { status: 'PERMISSION_DENIED', reason: 'Token tak berizin membaca store GMV Max.' }
    return { status: 'DATA_UNAVAILABLE', reason: `store_list gagal: ${storeListError}` }
  }
  if (!Array.isArray(storeList)) return { status: 'UNKNOWN', reason: 'Respons store_list tidak tersedia.' }

  const store = storeList.find(s => String(s.store_id) === String(connection.storeId))
  if (!store) return { status: 'STORE_NOT_FOUND', reason: 'store_id koneksi tidak ada di daftar store yang diakses token.' }

  const exclusive = store.exclusive_authorized_advertiser_info || null
  const exclusiveAdv = exclusive?.advertiser_id ? String(exclusive.advertiser_id) : null
  const connAdv = String(connection.advertiserId)
  const authorized = (authorizedAdvertiserIds || []).map(String)

  // Mismatch otorisasi eksklusif LEBIH SPESIFIK daripada NOT_AVAILABLE generik.
  if (exclusiveAdv && (exclusiveAdv !== connAdv || (authorized.length && !authorized.includes(exclusiveAdv)))) {
    return {
      status: 'AUTHORIZATION_MISMATCH',
      reason: 'Otorisasi eksklusif GMV Max store ini dipegang advertiser lain / di luar akses token.',
      exclusiveAdvertiserId: exclusiveAdv, connectionAdvertiserId: connAdv,
      isGmvMaxAvailable: store.is_gmv_max_available === true, store,
    }
  }
  if (store.is_gmv_max_available !== true) {
    return { status: 'NOT_AVAILABLE', reason: 'is_gmv_max_available=false untuk store ini.', store }
  }
  return {
    status: 'ELIGIBLE', reason: null, store,
    exclusiveAdvertiserId: exclusiveAdv,
    storeAuthorizedBcId: store.store_authorized_bc_id ?? null,
    region: store.targeting_region_codes ?? null,
  }
}

// Status tenant → availability_status registry.
const TENANT_AVAIL = {
  ELIGIBLE: 'AVAILABLE', NOT_AVAILABLE: 'NOT_AVAILABLE', AUTHORIZATION_MISMATCH: 'AUTHORIZATION_MISMATCH',
  PERMISSION_DENIED: 'PERMISSION_DENIED', STORE_NOT_FOUND: 'NOT_AVAILABLE',
  CONNECTION_MISSING: 'DATA_UNAVAILABLE', UNKNOWN: 'UNKNOWN', DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
}

function tenantRecords(ctx, elig, { productCampaignCount, liveCampaignCount } = {}) {
  const avail = TENANT_AVAIL[elig.status] || 'UNKNOWN'
  const eligible = elig.status === 'ELIGIBLE'
  const out = []

  out.push(rec(ctx, {
    feature_scope: 'TENANT', feature_code: 'GMV_MAX_ELIGIBILITY',
    availability_status: avail, capability_level: 'READ',
    enabled: eligible, active: eligible, source: 'MCP', confidence: 'HIGH',
    signal: elig.status, metadata: { tenant_status: elig.status, reason: elig.reason, region: elig.region ?? null },
  }))

  // Otorisasi eksklusif.
  const exclusiveAvail = eligible ? 'AVAILABLE'
    : elig.status === 'AUTHORIZATION_MISMATCH' ? 'AUTHORIZATION_MISMATCH'
    : elig.status === 'STORE_NOT_FOUND' || elig.status === 'CONNECTION_MISSING' ? 'DATA_UNAVAILABLE' : avail
  out.push(rec(ctx, {
    feature_scope: 'TENANT', feature_code: 'EXCLUSIVE_GMV_MAX_AUTHORIZATION',
    availability_status: exclusiveAvail, capability_level: 'READ',
    enabled: eligible, active: eligible, source: 'MCP', confidence: 'HIGH',
    signal: exclusiveAvail,
    metadata: {
      exclusive_advertiser_id: elig.exclusiveAdvertiserId ?? null,
      connection_advertiser_id: elig.connectionAdvertiserId ?? ctx.advertiserId ?? null,
      match: eligible,
    },
  }))

  // Ketersediaan Product / LIVE — diturunkan dari keberadaan campaign per tipe.
  const productAvail = !eligible ? avail : productCampaignCount > 0 ? 'AVAILABLE' : 'UNKNOWN'
  const liveAvail = !eligible ? avail : liveCampaignCount > 0 ? 'AVAILABLE' : 'UNKNOWN'
  out.push(rec(ctx, {
    feature_scope: 'TENANT', feature_code: 'PRODUCT_GMV_MAX_AVAILABLE',
    availability_status: productAvail, capability_level: 'READ',
    enabled: productAvail === 'AVAILABLE', source: 'DERIVED', confidence: productCampaignCount > 0 ? 'HIGH' : 'LOW',
    signal: productAvail, metadata: { product_campaign_count: productCampaignCount ?? null },
  }))
  out.push(rec(ctx, {
    feature_scope: 'TENANT', feature_code: 'LIVE_GMV_MAX_AVAILABLE',
    availability_status: liveAvail, capability_level: 'READ',
    enabled: liveAvail === 'AVAILABLE', source: 'DERIVED', confidence: liveCampaignCount > 0 ? 'HIGH' : 'LOW',
    signal: liveAvail, metadata: { live_campaign_count: liveCampaignCount ?? null },
  }))
  return out
}

// ─── 2) CAMPAIGN-LEVEL ─────────────────────────────────────────────────────────
export function normalizeCampaignRecords({ info = {}, listRow = {}, sessions, bidRecommend } = {}, ctx = {}) {
  const cid = String(info.campaign_id ?? listRow.campaign_id ?? '') || null
  const cctx = { ...ctx, _cid: cid }
  const at = (code, base) => rec(cctx, { campaign_id: cid, ...base, feature_code: code, feature_scope: base.feature_scope || 'CAMPAIGN' })
  const out = []

  // TARGET_ROI
  const roas = field(info, 'roas_bid')
  if (!roas.present) out.push(NOT_RETURNED(cctx, { feature_scope: 'CAMPAIGN', feature_code: 'TARGET_ROI', campaign_id: cid, capability_level: 'MONITOR' }))
  else out.push(at('TARGET_ROI', {
    availability_status: 'ENABLED', capability_level: 'MONITOR', enabled: true, active: true,
    source: 'MCP', confidence: 'HIGH', signal: { roas_bid: num(roas.value), deep: info.deep_bid_type ?? null },
    metadata: { roas_bid: num(roas.value), deep_bid_type: info.deep_bid_type ?? null, execute: 'SCHEMA_ONLY' },
  }))

  // RECOMMENDED_ROI (dari bid_recommend store-level; dilekatkan ke campaign)
  if (bidRecommend && (isNum(bidRecommend.roas_bid) || isNum(bidRecommend.budget))) {
    const rRoas = num(bidRecommend.roas_bid), rBudget = num(bidRecommend.budget)
    const aRoas = num(info.roas_bid), aBudget = num(info.budget)
    out.push(at('RECOMMENDED_ROI', {
      availability_status: 'AVAILABLE', capability_level: 'RECOMMEND', source: 'MCP', confidence: 'HIGH',
      signal: { rRoas, rBudget },
      metadata: {
        recommended_roas_bid: rRoas, recommended_budget: rBudget,
        active_roas_bid: aRoas, active_budget: aBudget,
        roas_delta: aRoas != null && rRoas != null ? +(rRoas - aRoas).toFixed(2) : null,
        budget_delta: aBudget != null && rBudget != null ? rBudget - aBudget : null,
      },
    }))
  }

  // DAILY_BUDGET
  const budget = field(info, 'budget')
  if (!budget.present) out.push(NOT_RETURNED(cctx, { feature_scope: 'CAMPAIGN', feature_code: 'DAILY_BUDGET', campaign_id: cid, capability_level: 'MONITOR' }))
  else out.push(at('DAILY_BUDGET', {
    availability_status: 'ACTIVE', capability_level: 'MONITOR', active: true, source: 'MCP', confidence: 'HIGH',
    signal: num(budget.value), metadata: { budget: num(budget.value), execute: 'SCHEMA_ONLY' },
  }))

  // AUTO_BUDGET_INCREASE
  const ab = field(info, 'auto_budget')
  if (!ab.present) out.push(NOT_RETURNED(cctx, { feature_scope: 'CAMPAIGN', feature_code: 'AUTO_BUDGET_INCREASE', campaign_id: cid, capability_level: 'MONITOR' }))
  else {
    const a = ab.value || {}
    const on = a.auto_budget_enabled === true
    out.push(at('AUTO_BUDGET_INCREASE', {
      availability_status: on ? 'ENABLED' : 'INACTIVE', capability_level: 'MONITOR', enabled: on, active: on,
      source: 'MCP', confidence: 'HIGH', signal: { on, cur: num(a.current_budget), max: num(a.maximum_budget) },
      metadata: {
        auto_budget_enabled: on, current_budget: num(a.current_budget), maximum_budget: num(a.maximum_budget),
        budget_increase_percentage: num(a.budget_increase_percentage), increase_limit: num(a.increase_limit),
        remained_times: num(a.remained_times), next_increase: num(a.next_increase), execute: 'SCHEMA_ONLY',
      },
    }))
  }

  // PROMOTION_DAYS
  const pd = field(info, 'promotion_days')
  if (!pd.present) out.push(NOT_RETURNED(cctx, { feature_scope: 'CAMPAIGN', feature_code: 'PROMOTION_DAYS', campaign_id: cid, capability_level: 'MONITOR' }))
  else {
    const p = pd.value || {}
    const on = p.is_enabled === true
    // Sub-field yang absen tetap NOT_RETURNED di metadata (bukan false).
    const subFields = ['budget_increase_percentage', 'increase_limit', 'auto_schedule_enabled']
    const subs = {}
    for (const k of subFields) subs[k] = Object.prototype.hasOwnProperty.call(p, k) ? p[k] : 'NOT_RETURNED'
    out.push(at('PROMOTION_DAYS', {
      availability_status: on ? 'ACTIVE' : 'INACTIVE', capability_level: 'MONITOR', enabled: on, active: on,
      source: 'MCP', confidence: 'HIGH', signal: on,
      metadata: { is_enabled: on, custom_schedule_count: Array.isArray(p.custom_schedule_list) ? p.custom_schedule_list.length : null, sub_fields: subs, execute: 'SCHEMA_ONLY' },
    }))
  }

  // ROI_PROTECTION (read-only; eksekusi di Seller Center)
  const rp = field(info, 'roi_protection_enabled')
  if (!rp.present) out.push(NOT_RETURNED(cctx, { feature_scope: 'CAMPAIGN', feature_code: 'ROI_PROTECTION', campaign_id: cid, capability_level: 'MONITOR' }))
  else out.push(at('ROI_PROTECTION', {
    availability_status: rp.value === true ? 'ENABLED' : 'INACTIVE', capability_level: 'MONITOR',
    enabled: rp.value === true, active: rp.value === true, source: 'MCP', confidence: 'HIGH', signal: rp.value === true,
    metadata: { roi_protection_enabled: rp.value === true, execute: 'SELLER_CENTER_ONLY', note: 'Tak ada endpoint toggle di API.' },
  }))

  // ROI_PROTECTION_COMPENSATION (dari campaign_get listRow)
  const comp = field(listRow, 'roi_protection_compensation_status')
  if (!comp.present) out.push(NOT_RETURNED(cctx, { feature_scope: 'CAMPAIGN', feature_code: 'ROI_PROTECTION_COMPENSATION', campaign_id: cid, capability_level: 'MONITOR' }))
  else {
    const inEffect = String(comp.value) === 'IN_EFFECT'
    out.push(at('ROI_PROTECTION_COMPENSATION', {
      availability_status: inEffect ? 'ACTIVE' : 'INACTIVE', capability_level: 'MONITOR', active: inEffect,
      source: 'MCP', confidence: 'HIGH', signal: String(comp.value),
      metadata: { status: comp.value, note: 'Status mentah; nominal kredit TIDAK dikembalikan API.' },
    }))
  }

  // ACCELERATE_NEW_VIDEO_TESTING (field baru runtime-verified)
  const acc = field(info, 'accelerate_testing_for_new_videos')
  if (!acc.present) out.push(NOT_RETURNED(cctx, { feature_scope: 'CAMPAIGN', feature_code: 'ACCELERATE_NEW_VIDEO_TESTING', campaign_id: cid, capability_level: 'MONITOR' }))
  else {
    const on = String(acc.value).toUpperCase() === 'ON'
    out.push(at('ACCELERATE_NEW_VIDEO_TESTING', {
      availability_status: on ? 'ENABLED' : 'INACTIVE', capability_level: 'MONITOR', enabled: on, active: on,
      source: 'MCP', confidence: 'HIGH', signal: on, metadata: { raw: acc.value },
    }))
  }

  // AFFILIATE_POSTS
  const aff = field(info, 'affiliate_posts_enabled')
  if (!aff.present) out.push(NOT_RETURNED(cctx, { feature_scope: 'CAMPAIGN', feature_code: 'AFFILIATE_POSTS', campaign_id: cid, capability_level: 'MONITOR' }))
  else out.push(at('AFFILIATE_POSTS', {
    availability_status: aff.value === true ? 'ENABLED' : 'INACTIVE', capability_level: 'MONITOR',
    enabled: aff.value === true, active: aff.value === true, source: 'MCP', confidence: 'HIGH', signal: aff.value === true,
    metadata: { affiliate_posts_enabled: aff.value === true },
  }))

  // FULL_SHOP / SELECTED_PRODUCTS (dari product_specific_type)
  const pst = field(info, 'product_specific_type')
  if (!pst.present) {
    out.push(NOT_RETURNED(cctx, { feature_scope: 'CAMPAIGN', feature_code: 'FULL_SHOP', campaign_id: cid, capability_level: 'MONITOR' }))
    out.push(NOT_RETURNED(cctx, { feature_scope: 'CAMPAIGN', feature_code: 'SELECTED_PRODUCTS', campaign_id: cid, capability_level: 'MONITOR' }))
  } else {
    const all = pst.value === 'ALL'
    const customized = pst.value === 'CUSTOMIZED_PRODUCTS'
    out.push(at('FULL_SHOP', {
      availability_status: all ? 'ACTIVE' : 'INACTIVE', capability_level: 'MONITOR', active: all,
      source: 'MCP', confidence: 'HIGH', signal: all, metadata: { product_specific_type: pst.value, execute: 'SCHEMA_ONLY' },
    }))
    out.push(at('SELECTED_PRODUCTS', {
      availability_status: customized ? 'ACTIVE' : 'INACTIVE', capability_level: 'MONITOR', active: customized,
      source: 'MCP', confidence: 'HIGH', signal: customized,
      metadata: { product_specific_type: pst.value, item_group_count: Array.isArray(info.item_group_ids) ? info.item_group_ids.length : null, execute: 'SCHEMA_ONLY' },
    }))
  }

  // AUTO_SELECT_CREATIVE
  const pvst = field(info, 'product_video_specific_type')
  if (!pvst.present) out.push(NOT_RETURNED(cctx, { feature_scope: 'CAMPAIGN', feature_code: 'AUTO_SELECT_CREATIVE', campaign_id: cid, capability_level: 'MONITOR' }))
  else {
    const auto = pvst.value === 'AUTO_SELECTION'
    out.push(at('AUTO_SELECT_CREATIVE', {
      availability_status: auto ? 'ACTIVE' : 'INACTIVE', capability_level: 'MONITOR', active: auto,
      source: 'MCP', confidence: 'HIGH', signal: auto, metadata: { product_video_specific_type: pvst.value },
    }))
  }

  // CAMPAIGN_SCHEDULING
  const st = field(info, 'schedule_type')
  if (!st.present) out.push(NOT_RETURNED(cctx, { feature_scope: 'CAMPAIGN', feature_code: 'CAMPAIGN_SCHEDULING', campaign_id: cid, capability_level: 'MONITOR' }))
  else out.push(at('CAMPAIGN_SCHEDULING', {
    availability_status: 'ACTIVE', capability_level: 'MONITOR', active: true, source: 'MCP', confidence: 'HIGH',
    signal: { t: st.value, s: info.schedule_start_time ?? null, e: info.schedule_end_time ?? null },
    metadata: { schedule_type: st.value, schedule_start_time: info.schedule_start_time ?? null, schedule_end_time: info.schedule_end_time ?? null },
  }))

  // MAX_DELIVERY / CREATIVE_BOOST — dari session_list (kosong ≠ NOT_AVAILABLE)
  out.push(sessionRecord(cctx, cid, sessions, 'MAX_DELIVERY', 'NO_BID'))
  out.push(sessionRecord(cctx, cid, sessions, 'CREATIVE_BOOST', 'CREATIVE_NO_BID'))

  return out
}

function sessionRecord(ctx, cid, sessions, code, bidType) {
  if (sessions === undefined) {
    return NOT_RETURNED(ctx, { feature_scope: 'CAMPAIGN', feature_code: code, campaign_id: cid, capability_level: 'MONITOR' })
  }
  const list = Array.isArray(sessions) ? sessions.filter(s => (s.bid_type || 'NO_BID') === bidType) : []
  const activeN = list.length
  return rec(ctx, {
    feature_scope: 'CAMPAIGN', feature_code: code, campaign_id: cid,
    availability_status: activeN > 0 ? 'ACTIVE' : 'INACTIVE', capability_level: 'MONITOR',
    active: activeN > 0, enabled: activeN > 0, source: 'MCP', confidence: 'HIGH', signal: activeN,
    metadata: {
      endpoint_capability: 'RUNTIME_VERIFIED_READ', active_session_count: activeN, execute: 'SCHEMA_ONLY',
      note: activeN === 0 ? 'Endpoint session_list OK; tak ada sesi aktif (INACTIVE, bukan NOT_AVAILABLE).' : undefined,
      sessions: list.map(s => ({ session_id: s.session_id ?? null, budget: num(s.budget), start: s.schedule_start_time ?? null, end: s.schedule_end_time ?? null })),
    },
  })
}

// ─── 3) IDENTITY-LEVEL ─────────────────────────────────────────────────────────
export function normalizeIdentityRecords(identityList = [], ctx = {}) {
  const out = []
  for (const id of identityList || []) {
    const iid = String(id.identity_id ?? '') || null
    const ictx = ctx
    const prodOk = id.product_gmv_max_available === true
    const liveOk = id.live_gmv_max_available === true
    out.push(rec(ictx, {
      feature_scope: 'IDENTITY', feature_code: 'IDENTITY_PRODUCT_GMV_MAX_AVAILABLE', identity_id: iid,
      availability_status: prodOk ? 'AVAILABLE' : 'NOT_AVAILABLE', capability_level: 'READ',
      enabled: prodOk, source: 'MCP', confidence: 'HIGH', signal: prodOk,
      metadata: { identity_type: id.identity_type ?? null, display_name: id.display_name ?? null },
    }))
    out.push(rec(ictx, {
      // identity LIVE tak-tersedia TIDAK menandai store-level LIVE unavailable.
      feature_scope: 'IDENTITY', feature_code: 'IDENTITY_LIVE_GMV_MAX_AVAILABLE', identity_id: iid,
      availability_status: liveOk ? 'AVAILABLE' : 'INACTIVE', capability_level: 'READ',
      enabled: liveOk, source: 'MCP', confidence: 'HIGH', signal: liveOk,
      metadata: { identity_type: id.identity_type ?? null },
    }))
    if (!liveOk && id.unavailable_reason) {
      out.push(rec(ictx, {
        feature_scope: 'IDENTITY', feature_code: 'IDENTITY_LIVE_UNAVAILABLE_REASON', identity_id: iid,
        availability_status: 'NOT_AVAILABLE', capability_level: 'READ', source: 'MCP', confidence: 'HIGH',
        signal: id.unavailable_reason, metadata: { unavailable_reason: id.unavailable_reason },
      }))
    }
  }
  return out
}

// ─── 4) STORE/CREATIVE-LEVEL turunan + otorisasi ─────────────────────────────
function storeLevelRecords(ctx, { authorization, productSample } = {}) {
  const out = []
  // Kemampuan memonitor status kreatif (report creative_delivery_status).
  out.push(rec(ctx, {
    feature_scope: 'CREATIVE', feature_code: 'CREATIVE_STATUS_MONITORING',
    availability_status: 'AVAILABLE', capability_level: 'MONITOR', source: 'MCP', confidence: 'HIGH',
    signal: 'AVAILABLE',
    metadata: { statuses: ['IN_QUEUE', 'LEARNING', 'DELIVERING', 'NOT_DELIVERYING', 'AUTHORIZATION_NEEDED', 'EXCLUDED', 'UNAVAILABLE', 'REJECTED', 'NOT_ACTIVE'] },
  }))

  // AFFILIATE_AUTHORIZATION (exclusive_authorization_get)
  if (authorization && (authorization.authorization_status || authorization.cps_authorization_status)) {
    const eff = String(authorization.authorization_status) === 'EFFECTIVE'
    out.push(rec(ctx, {
      feature_scope: 'STORE', feature_code: 'AFFILIATE_AUTHORIZATION',
      availability_status: eff ? 'ACTIVE' : 'INACTIVE', capability_level: 'MONITOR', active: eff,
      source: 'MCP', confidence: 'HIGH', signal: { a: authorization.authorization_status, c: authorization.cps_authorization_status },
      metadata: { authorization_status: authorization.authorization_status ?? null, cps_authorization_status: authorization.cps_authorization_status ?? null, advertiser_status: authorization.advertiser_status ?? null },
    }))
  } else {
    out.push(NOT_RETURNED(ctx, { feature_scope: 'STORE', feature_code: 'AFFILIATE_AUTHORIZATION', capability_level: 'MONITOR' }))
  }

  // PRODUCT_GMV_MAX_ELIGIBILITY (store_product_get sample)
  if (productSample && (productSample.total != null)) {
    out.push(rec(ctx, {
      feature_scope: 'PRODUCT', feature_code: 'PRODUCT_GMV_MAX_ELIGIBILITY',
      availability_status: 'AVAILABLE', capability_level: 'READ', source: 'MCP', confidence: 'HIGH',
      signal: { t: productSample.total, u: productSample.unoccupied },
      metadata: { total: productSample.total, occupied: productSample.occupied ?? null, unoccupied: productSample.unoccupied ?? null },
    }))
  }
  return out
}

// ─── 5) SCHEMA-ONLY / UNAVAILABLE (statis, hanya saat tenant eligible) ─────────
function schemaOnlyRecords(ctx) {
  const mk = (scope, code, availability, capability, source, confidence, meta) =>
    rec(ctx, { feature_scope: scope, feature_code: code, availability_status: availability, capability_level: capability, source, confidence, signal: availability, metadata: meta })
  return [
    // Punya endpoint MCP tapi = mutasi → SCHEMA_ONLY (tak diuji Phase 1).
    mk('CREATIVE', 'CREATIVE_EXCLUSION', 'SCHEMA_ONLY', 'EXECUTE_SCHEMA_ONLY', 'MCP', 'HIGH', { endpoint: 'gmv_max_creative_update', note: 'Mutasi tak diuji Phase 1.' }),
    // Tak ada endpoint API → hanya rekomendasi (eksekusi manual di Ads Manager/Seller Center).
    mk('CREATIVE', 'AUTO_GENERATED_IMAGES', 'DATA_UNAVAILABLE', 'RECOMMEND', 'DERIVED', 'LOW', { note: 'Tersirat AUTO_SELECTION tanpa identity; tak ada status API.' }),
    mk('CREATIVE', 'SHOP_CREATIVE_HUB', 'NOT_AVAILABLE', 'RECOMMEND', 'SCHEMA_INSPECTION', 'LOW', { note: 'Tak ada endpoint MCP.' }),
    mk('LIVE', 'PREFERRED_VIDEO', 'NOT_AVAILABLE', 'RECOMMEND', 'SCHEMA_INSPECTION', 'LOW', { note: 'Kontrol LIVE tak ada di API.' }),
    mk('LIVE', 'LIVE_CREATIVE_BOOST', 'NOT_AVAILABLE', 'RECOMMEND', 'SCHEMA_INSPECTION', 'LOW', { note: 'Kontrol LIVE tak ada di API.' }),
    mk('LIVE', 'VIEWER_BOOST', 'NOT_AVAILABLE', 'RECOMMEND', 'SCHEMA_INSPECTION', 'LOW', { note: 'Kontrol LIVE tak ada di API.' }),
    mk('LIVE', 'VIDEO_TO_LIVE_CONTROL', 'NOT_AVAILABLE', 'RECOMMEND', 'SCHEMA_INSPECTION', 'LOW', { note: 'Kontrol LIVE tak ada di API.' }),
    mk('LIVE', 'LIVE_TO_LIVE_CONTROL', 'NOT_AVAILABLE', 'RECOMMEND', 'SCHEMA_INSPECTION', 'LOW', { note: 'Kontrol LIVE tak ada di API.' }),
    mk('LIVE', 'MEGA_LIVE', 'NOT_AVAILABLE', 'RECOMMEND', 'SCHEMA_INSPECTION', 'LOW', { note: 'Tak ada endpoint MCP.' }),
    mk('STORE', 'COMMISSION_SAVINGS', 'DATA_UNAVAILABLE', 'RECOMMEND', 'SELLER_CENTER', 'DATA_UNAVAILABLE', { note: 'Hanya di Seller Center; tak ada API.' }),
  ]
}

// ─── ORKESTRASI (pure) ────────────────────────────────────────────────────────
// inputs: { connection, authorizedAdvertiserIds, storeList, storeListError,
//           campaigns:[{listRow,info,sessions,bidRecommend}], identities,
//           authorization, productSample, campaignTypeCounts:{product,live} }
export function buildRegistry(inputs = {}) {
  const ctx = { advertiserId: inputs.connection?.advertiserId ?? null, storeId: inputs.connection?.storeId ?? null }
  const elig = evaluateTenantEligibility(inputs)
  const counts = inputs.campaignTypeCounts || {}
  const records = tenantRecords(ctx, elig, { productCampaignCount: counts.product, liveCampaignCount: counts.live })

  // GATE: jangan deteksi fitur campaign/identity bila tenant tak eligible.
  if (elig.status === 'ELIGIBLE') {
    for (const c of inputs.campaigns || []) records.push(...normalizeCampaignRecords(c, ctx))
    records.push(...normalizeIdentityRecords(inputs.identities || [], ctx))
    records.push(...storeLevelRecords(ctx, { authorization: inputs.authorization, productSample: inputs.productSample }))
    records.push(...schemaOnlyRecords(ctx))
  }
  return { tenant: elig, records }
}

// ─── MERGE + CHANGE DETECTION (pure, idempoten) ───────────────────────────────
export function keyOf(r) {
  return [r.workspace_id ?? '', r.store_id ?? '', r.feature_code, r.campaign_id ?? '', r.identity_id ?? ''].join('|')
}

// existing: baris DB saat ini. incoming: record ber-workspace_id (sudah di-stamp).
// → { writes:[baris siap upsert dgn timestamp], history:[baris history] }.
export function mergeRegistry(existing = [], incoming = [], now = new Date().toISOString()) {
  const byKey = new Map((existing || []).map(r => [keyOf(r), r]))
  const writes = [], history = []
  for (const inc of incoming) {
    const k = keyOf(inc)
    const prev = byKey.get(k)
    if (!prev) {
      writes.push({ ...inc, first_detected_at: now, last_detected_at: now, last_changed_at: now, updated_at: now })
      history.push(histRow(inc, null, now, 'DETECTED'))
      continue
    }
    const changed = String(prev.signature) !== String(inc.signature)
    writes.push({
      ...inc, id: prev.id ?? undefined,
      first_detected_at: prev.first_detected_at ?? now,
      last_detected_at: now,
      last_changed_at: changed ? now : (prev.last_changed_at ?? null),
      updated_at: now,
    })
    if (changed) history.push(histRow(inc, prev, now, 'CHANGED'))
  }
  return { writes, history }
}

function histRow(inc, prev, now, change_type) {
  return {
    workspace_id: inc.workspace_id ?? null, store_id: inc.store_id ?? null,
    campaign_id: inc.campaign_id ?? null, identity_id: inc.identity_id ?? null, feature_code: inc.feature_code,
    change_type,
    prev_availability_status: prev?.availability_status ?? null, new_availability_status: inc.availability_status,
    prev_enabled: prev?.enabled ?? null, new_enabled: inc.enabled ?? null,
    prev_active: prev?.active ?? null, new_active: inc.active ?? null,
    prev_signature: prev?.signature ?? null, new_signature: inc.signature ?? null,
    metadata: inc.metadata ?? {}, detected_at: now,
  }
}

// Tolak penulisan lintas-workspace (guard writer, selain RLS).
export function assertWorkspaceScope(records = [], workspaceId) {
  for (const r of records) {
    if (r.workspace_id != null && String(r.workspace_id) !== String(workspaceId)) {
      throw new Error(`cross-workspace write ditolak: ${r.feature_code} (${r.workspace_id} ≠ ${workspaceId})`)
    }
  }
  return true
}
